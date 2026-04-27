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
    from models import conversation, customer, order, tenant  # noqa: F401

    # Auto-create tables in dev. Production should use Alembic migrations.
    if os.getenv("APP_ENV", "development") == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info(
            "Dev mode: auto-created tables via Base.metadata.create_all (%s)",
            "SQLite" if _is_sqlite else "PostgreSQL",
        )

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


async def close_connections() -> None:
    """Close DB engine + Redis client cleanly on shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
    await engine.dispose()
    log.info("DB + Redis connections closed")
