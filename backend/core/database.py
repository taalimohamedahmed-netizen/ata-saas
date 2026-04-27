"""
Async PostgreSQL (SQLAlchemy 2.x) + Redis connection management.

Exposes:
  - Base               → declarative base for all models
  - engine, SessionLocal → SQLAlchemy async engine + session factory
  - get_db()           → FastAPI dependency yielding an AsyncSession
  - get_redis()        → FastAPI dependency yielding a Redis client
  - init_connections() / close_connections() → lifecycle hooks
"""

from __future__ import annotations

import logging
import os
from typing import AsyncGenerator

import redis.asyncio as redis_async
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
    "postgresql+asyncpg://postgres:postgres@localhost:5432/ata",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


# --------------------------------------------------------------------------
# SQLAlchemy
# --------------------------------------------------------------------------
class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

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
# Redis
# --------------------------------------------------------------------------
_redis_client: redis_async.Redis | None = None


async def get_redis() -> redis_async.Redis:
    """Return a singleton async Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_async.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


# --------------------------------------------------------------------------
# Lifecycle
# --------------------------------------------------------------------------
async def init_connections() -> None:
    """Verify DB + Redis are reachable. Import models so tables register."""
    # Import models here so SQLAlchemy registers them on Base.metadata.
    from models import conversation, customer, order, tenant  # noqa: F401

    # Auto-create tables in dev. Production should use Alembic migrations.
    if os.getenv("APP_ENV", "development") == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("Dev mode: auto-created tables via Base.metadata.create_all")

    # Smoke-test Redis.
    client = await get_redis()
    await client.ping()
    log.info("Redis ping OK")


async def close_connections() -> None:
    """Close DB engine + Redis client cleanly on shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
    await engine.dispose()
    log.info("DB + Redis connections closed")
