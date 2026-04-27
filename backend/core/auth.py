"""
JWT authentication + tenant isolation middleware.

This module is the gatekeeper for every authenticated request:

  - hash_password / verify_password  → bcrypt password hashing
  - create_access_token              → signs a JWT containing tenant_id
  - decode_token                     → verifies + parses a JWT
  - TenantMiddleware                 → ASGI middleware injecting tenant_id
  - get_current_tenant               → FastAPI dependency returning Tenant

Critical multi-tenancy rule: any DB query inside a request must filter
by `request.state.tenant_id` (or use the Tenant returned by
`get_current_tenant`). Never trust a tenant_id from the request body.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from core.database import get_db

log = logging.getLogger("ata.auth")

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

# Routes that do NOT require a valid JWT.
# Webhook routes embed tenant_id in the URL and validate via secret instead.
PUBLIC_PREFIXES: tuple[str, ...] = (
    "/",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/auth/register",
    "/auth/login",
    "/webhook/",  # tenant_id is in URL; signature checked in route
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


# --------------------------------------------------------------------------
# Password hashing
# --------------------------------------------------------------------------
def hash_password(plain: str) -> str:
    """Bcrypt-hash a plaintext password."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time check of a plaintext password against its hash."""
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        log.warning("Password verification raised; treating as invalid")
        return False


# --------------------------------------------------------------------------
# JWT
# --------------------------------------------------------------------------
def create_access_token(tenant_id: int, extra: dict[str, Any] | None = None) -> str:
    """Sign a JWT carrying the tenant_id (subject) + an exp claim."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(tenant_id),
        "tenant_id": tenant_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_EXPIRE_MINUTES)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Verify signature + expiry and return claims, or raise 401."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
        ) from exc


def _is_public_path(path: str) -> bool:
    """True if the request path does not require auth."""
    if path in PUBLIC_PREFIXES:
        return True
    return any(path.startswith(p) for p in PUBLIC_PREFIXES if p.endswith("/"))


# --------------------------------------------------------------------------
# Tenant middleware
# --------------------------------------------------------------------------
class TenantMiddleware(BaseHTTPMiddleware):
    """
    Injects `request.state.tenant_id` for every authenticated request.

    Public paths skip auth entirely. Webhooks carry tenant_id in the URL
    and are validated per-route via signing secrets.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Always allow CORS preflights through.
        if request.method == "OPTIONS" or _is_public_path(path):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.lower().startswith("bearer "):
            return JSONResponse(
                {"error": "missing_bearer_token"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        token = auth_header.split(" ", 1)[1].strip()
        try:
            claims = decode_token(token)
        except HTTPException as exc:
            return JSONResponse(
                {"error": "invalid_token", "detail": exc.detail},
                status_code=exc.status_code,
            )

        tenant_id = claims.get("tenant_id")
        if not tenant_id:
            return JSONResponse(
                {"error": "token_missing_tenant"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        # Inject for downstream handlers — every query must filter by this.
        request.state.tenant_id = int(tenant_id)
        request.state.token_claims = claims
        return await call_next(request)


# --------------------------------------------------------------------------
# Dependencies
# --------------------------------------------------------------------------
async def get_current_tenant(
    request: Request,
    db: AsyncSession = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    """
    Resolve the current Tenant row from request.state.tenant_id.

    Raises 401 if missing, 403 if the tenant is disabled.
    """
    # Lazy import to avoid circular import (models -> database -> auth).
    from models.tenant import Tenant

    tenant_id = getattr(request.state, "tenant_id", None)
    if tenant_id is None and creds is not None:
        # Direct dependency-only path (e.g. tests not exercising middleware).
        claims = decode_token(creds.credentials)
        tenant_id = claims.get("tenant_id")

    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No tenant in request",
        )

    result = await db.execute(select(Tenant).where(Tenant.id == int(tenant_id)))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if not tenant.is_active:
        raise HTTPException(status_code=403, detail="Tenant is disabled")
    return tenant
