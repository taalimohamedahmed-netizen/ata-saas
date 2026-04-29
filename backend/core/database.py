"""
Async database + Redis connection management.

Supports:
  - PostgreSQL (production) via asyncpg
  - SQLite (local dev) via aiosqlite — auto-detected from DATABASE_URL

Exposes:
  - Base               → declarative base for all models
  - engine, SessionLocal → SQLAlchemy async engine + session factory
  - get_db()           → FastAPI dependency yielding an AsyncSession
  - get_redis()        → FastAPI dependency yielding a Redis client (or None)
  - init_connections() / close_connections() → lifecycle hooks
"""

from __future__ import annotations

import logging
import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

log = logging.getLogger("ata.db")

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    # Default: local SQLite file for zero-config dev
    "sqlite+aiosqlite:///./ata_dev.db",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_is_sqlite = DATABASE_URL.startswith("sqlite")


# --------------------------------------------------------------------------
# SQLAlchemy
# --------------------------------------------------------------------------
class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


_engine_kwargs: dict = dict(
    echo=False,
    pool_pre_ping=True,
)

# SQLite doesn't support connection pool sizing
if not _is_sqlite:
    _engine_kwargs.update(pool_size=10, max_overflow=20)

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield an async DB session, commit on success."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# --------------------------------------------------------------------------
# Redis (optional — gracefully skip if not available)
# --------------------------------------------------------------------------
_redis_client = None
_redis_available = False


async def get_redis():
    """Return a singleton async Redis client, or None if unavailable."""
    global _redis_client
    if not _redis_available:
        return None
    if _redis_client is None:
        try:
            import redis.asyncio as redis_async

            _redis_client = redis_async.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
        except Exception:
            return None
    return _redis_client


# --------------------------------------------------------------------------
# Lifecycle
# --------------------------------------------------------------------------
async def init_connections() -> None:
    """Verify DB + Redis are reachable. Import models so tables register."""
    global _redis_available

    # Import models here so SQLAlchemy registers them on Base.metadata.
    try:
        from models import conversation, customer, order, tenant, product  # noqa: F401
    except ImportError as exc:
        log.error("Failed to import models: %s", exc)

    # Ensure all tables exist (safe to call multiple times)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info(
            "Tables verified/created via Base.metadata.create_all (%s)",
            "SQLite" if _is_sqlite else "PostgreSQL",
        )
    except Exception as exc:
        log.error("Base.metadata.create_all failed: %s", exc)

    # Add new columns/constraints that may be missing from existing tables.
    if not _is_sqlite:
        await _run_column_migrations()

    # Smoke-test Redis (optional).
    try:
        import redis.asyncio as redis_async  # noqa: F811

        client = redis_async.from_url(
            REDIS_URL, encoding="utf-8", decode_responses=True
        )
        await client.ping()
        _redis_available = True
        log.info("Redis ping OK")
    except Exception as exc:
        _redis_available = False
        log.warning("Redis not available (%s) — running without cache.", exc)


async def _run_column_migrations() -> None:
    """Add new columns to existing tables using ADD COLUMN IF NOT EXISTS."""
    from sqlalchemy import text
    migrations = [
        # Tenants updates
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_webhook_orders_id VARCHAR(50)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_webhook_products_id VARCHAR(50)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_webhook_customers_id VARCHAR(50)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_connected_at TIMESTAMPTZ",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_phone_number VARCHAR(30)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_waba_id VARCHAR(50)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_connected_at TIMESTAMPTZ",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_client_id VARCHAR(100)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_client_secret TEXT",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT",
        
        # Customers updates
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS shopify_customer_id VARCHAR(60)",
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(180)",
        # Note: ALTER COLUMN DROP NOT NULL is Postgres specific
        "ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL",
        
        # Unique constraint for customers (shopify_customer_id)
        # We wrap this in a DO block to make it idempotent in Postgres
        """
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_tenant_shopify_id') THEN
                ALTER TABLE customers ADD CONSTRAINT uq_customer_tenant_shopify_id UNIQUE (tenant_id, shopify_customer_id);
            END IF;
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_tenant_phone') THEN
                ALTER TABLE customers DROP CONSTRAINT uq_customer_tenant_phone;
            END IF;
        END $$;
        """,
        
        # Products table fallback (if create_all failed)
        """
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            shopify_product_id VARCHAR(60) NOT NULL,
            title VARCHAR(255) NOT NULL,
            body_html TEXT,
            vendor VARCHAR(120),
            product_type VARCHAR(120),
            status VARCHAR(40),
            price FLOAT NOT NULL DEFAULT 0.0,
            inventory_qty INTEGER NOT NULL DEFAULT 0,
            image_url VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_product_tenant_shopify_id UNIQUE (tenant_id, shopify_product_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id)",
        "CREATE INDEX IF NOT EXISTS idx_products_shopify_product_id ON products(shopify_product_id)",

        # Product handle for building storefront URLs
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS handle VARCHAR(255)",

        # AI provider per tenant (OpenRouter support)
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS openrouter_api_key TEXT",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_model VARCHAR(120)",

        # AI pause flag per conversation (manual takeover)
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    async with engine.begin() as conn:
        for sql in migrations:
            try:
                # Remove extra whitespace/newlines from multi-line SQL
                cleaned_sql = " ".join(sql.split())
                if not cleaned_sql: continue
                await conn.execute(text(cleaned_sql))
            except Exception as exc:
                log.warning("Migration step skipped: %s — %s", sql.strip()[:30], exc)
    log.info("Database migrations/sync applied")


async def close_connections() -> None:
    """Close DB engine + Redis client cleanly on shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
    await engine.dispose()
    log.info("DB + Redis connections closed")
