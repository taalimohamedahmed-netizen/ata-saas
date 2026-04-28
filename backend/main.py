"""
ATA Backend — FastAPI entrypoint.

Boots the API server, wires up middleware (CORS + tenant scoping),
opens the DB and Redis connections during the app lifespan, and
mounts every router (auth, webhook, whatsapp, dashboard).
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load environment variables from .env before importing modules that read them.
load_dotenv()

from core.database import close_connections, init_connections  # noqa: E402
from core.auth import TenantMiddleware  # noqa: E402
from routes import auth as auth_routes  # noqa: E402
from routes import dashboard as dashboard_routes  # noqa: E402
from routes import integrations as integrations_routes  # noqa: E402
from routes import webhook as webhook_routes  # noqa: E402
from routes import whatsapp as whatsapp_routes  # noqa: E402

# ---------- Logging ----------
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("ata.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open DB + Redis on startup, close them on shutdown."""
    log.info("ATA backend starting up...")
    await init_connections()
    log.info("Database + Redis connections ready")
    try:
        yield
    finally:
        log.info("ATA backend shutting down...")
        await close_connections()


# ---------- App ----------
app = FastAPI(
    title="ATA — Autonomous Trade Agent",
    description="Multi-tenant SaaS that automates e-commerce customer service.",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------- CORS ----------
cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Tenant scoping middleware ----------
# Validates JWT for protected paths and injects request.state.tenant_id.
app.add_middleware(TenantMiddleware)


# ---------- Global error handler ----------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log unhandled errors and return a sanitized 500 response."""
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": str(exc)},
    )


# ---------- Health ----------
@app.get("/", tags=["health"])
async def root():
    return {
        "service": "ATA Backend",
        "status": "ok",
        "version": app.version,
    }


@app.get("/health", tags=["health"])
async def health():
    return {"status": "healthy"}


# ---------- Routers ----------
app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])
app.include_router(integrations_routes.router, prefix="/integrations", tags=["integrations"])
app.include_router(webhook_routes.router, prefix="/webhook", tags=["webhook"])
app.include_router(whatsapp_routes.router, prefix="/webhook", tags=["whatsapp"])
app.include_router(dashboard_routes.router, prefix="/dashboard", tags=["dashboard"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("APP_HOST", "0.0.0.0"),
        port=int(os.getenv("APP_PORT", "8000")),
        reload=os.getenv("APP_ENV", "development") == "development",
    )
