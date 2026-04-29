"""
Redis-backed conversation sessions, scoped per tenant + customer phone.

Key format (multi-tenancy critical):
    sessions:{tenant_id}:{customer_phone}

A session value is a JSON blob:
    {
      "current_flow": "ORDER_CONFIRM" | "RETURN_REQUEST" | None,
      "current_step": "AWAIT_PAYMENT_METHOD" | "AWAIT_RECEIPT" | ...,
      "context": { arbitrary handler-specific state },
      "history": [ {role, content, ts}, ... last N messages ],
      "updated_at": iso8601
    }
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from core.database import get_redis

log = logging.getLogger("ata.session")

SESSION_TTL = int(os.getenv("SESSION_TTL", "86400"))  # 24h default
HISTORY_LIMIT = 20  # keep last N messages per conversation


def _key(tenant_id: int, phone: str) -> str:
    """Compose the namespaced Redis key. NEVER skip the tenant_id prefix."""
    return f"sessions:{tenant_id}:{phone}"


class SessionManager:
    """Tenant-isolated session store backed by Redis (optional)."""

    @staticmethod
    async def get(tenant_id: int, phone: str) -> dict[str, Any]:
        """Return the session dict, or a fresh empty session if missing or Redis is down."""
        client = await get_redis()
        if client is None:
            return SessionManager._empty()
        
        try:
            raw = await client.get(_key(tenant_id, phone))
            if not raw:
                return SessionManager._empty()
            return json.loads(raw)
        except Exception as exc:
            log.warning("Redis get failed for %s/%s: %s", tenant_id, phone, exc)
            return SessionManager._empty()

    @staticmethod
    async def set(tenant_id: int, phone: str, session: dict[str, Any]) -> None:
        """Persist the full session, refreshing the TTL."""
        client = await get_redis()
        if client is None:
            return

        session["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            await client.set(
                _key(tenant_id, phone),
                json.dumps(session, default=str),
                ex=SESSION_TTL,
            )
        except Exception as exc:
            log.warning("Redis set failed for %s/%s: %s", tenant_id, phone, exc)

    @staticmethod
    async def update(
        tenant_id: int,
        phone: str,
        **fields: Any,
    ) -> dict[str, Any]:
        """Shallow-merge fields into the session, persist, return new state."""
        session = await SessionManager.get(tenant_id, phone)
        session.update(fields)
        await SessionManager.set(tenant_id, phone, session)
        return session

    @staticmethod
    async def append_history(
        tenant_id: int,
        phone: str,
        role: str,
        content: str,
    ) -> None:
        """Append a message to the rolling history (capped at HISTORY_LIMIT)."""
        session = await SessionManager.get(tenant_id, phone)
        history: list[dict[str, Any]] = session.setdefault("history", [])
        history.append(
            {
                "role": role,
                "content": content,
                "ts": datetime.now(timezone.utc).isoformat(),
            }
        )
        if len(history) > HISTORY_LIMIT:
            session["history"] = history[-HISTORY_LIMIT:]
        await SessionManager.set(tenant_id, phone, session)

    @staticmethod
    async def clear(tenant_id: int, phone: str) -> None:
        """Delete the session entirely (e.g. after order confirmed)."""
        client = await get_redis()
        if client:
            try:
                await client.delete(_key(tenant_id, phone))
            except Exception:
                pass

    @staticmethod
    async def set_flow(
        tenant_id: int,
        phone: str,
        flow: str | None,
        step: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Convenience: set current_flow + current_step + merge context."""
        session = await SessionManager.get(tenant_id, phone)
        session["current_flow"] = flow
        session["current_step"] = step
        if context:
            session.setdefault("context", {}).update(context)
        await SessionManager.set(tenant_id, phone, session)
        return session

    @staticmethod
    def _empty() -> dict[str, Any]:
        return {
            "current_flow": None,
            "current_step": None,
            "context": {},
            "history": [],
        }
