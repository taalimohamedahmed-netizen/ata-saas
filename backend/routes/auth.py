"""
Auth + onboarding routes.

Endpoints:
  POST /auth/register             → create a new tenant
  POST /auth/login                → exchange email/password for a JWT
  POST /auth/connect/shopify      → save Shopify token + domain
  POST /auth/connect/whatsapp     → save WhatsApp credentials
  POST /auth/setup/brand          → save brand name / tone / policies
  POST /auth/setup/payments       → save InstaPay + Vodafone numbers
  GET  /auth/me                   → return current tenant + webhook URLs
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import (
    create_access_token,
    get_current_tenant,
    hash_password,
    verify_password,
)
from core.database import get_db
from models.tenant import Tenant, TenantPlan

log = logging.getLogger("ata.routes.auth")
router = APIRouter()


# ============================================================
# Schemas
# ============================================================
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    plan: TenantPlan = TenantPlan.BASIC


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: int
    name: str


class ShopifyConnectIn(BaseModel):
    shopify_domain: str = Field(min_length=4, max_length=180)
    shopify_token: str = Field(min_length=4, max_length=255)
    shopify_webhook_secret: str | None = None


class WhatsAppConnectIn(BaseModel):
    whatsapp_token: str = Field(min_length=4)
    whatsapp_phone_id: str = Field(min_length=4, max_length=120)
    whatsapp_verify_token: str | None = Field(default=None, max_length=120)


class BrandSetupIn(BaseModel):
    brand_name: str = Field(min_length=1, max_length=120)
    brand_tone: str | None = Field(default=None, max_length=255)
    brand_policies: str | None = None


class PaymentsSetupIn(BaseModel):
    instapay_number: str | None = Field(default=None, max_length=40)
    vodafone_number: str | None = Field(default=None, max_length=40)


class TenantOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    plan: TenantPlan
    is_active: bool
    shopify_connected: bool
    whatsapp_connected: bool
    brand_name: str | None
    instapay_number: str | None
    vodafone_number: str | None
    webhook_urls: dict[str, str]


# ============================================================
# Helpers
# ============================================================
def _webhook_urls(tenant_id: int) -> dict[str, str]:
    """Build the per-tenant webhook URLs the merchant must configure."""
    base = os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")
    return {
        "shopify": f"{base}/webhook/shopify/{tenant_id}",
        "whatsapp": f"{base}/webhook/whatsapp/{tenant_id}",
    }


def _serialize(tenant: Tenant) -> TenantOut:
    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        email=tenant.email,
        plan=tenant.plan,
        is_active=tenant.is_active,
        shopify_connected=bool(tenant.shopify_token and tenant.shopify_domain),
        whatsapp_connected=bool(
            tenant.whatsapp_token and tenant.whatsapp_phone_id
        ),
        brand_name=tenant.brand_name,
        instapay_number=tenant.instapay_number,
        vodafone_number=tenant.vodafone_number,
        webhook_urls=_webhook_urls(tenant.id),
    )


# ============================================================
# Routes
# ============================================================
@router.post("/register", response_model=TokenOut, status_code=201)
async def register(payload: RegisterIn, db: AsyncSession = Depends(get_db)):
    """Create a new tenant account and return an access token."""
    existing = await db.execute(
        select(Tenant).where(Tenant.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email_already_registered",
        )

    tenant = Tenant(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        plan=payload.plan,
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    log.info("Tenant registered id=%s email=%s", tenant.id, tenant.email)
    token = create_access_token(tenant.id)
    return TokenOut(access_token=token, tenant_id=tenant.id, name=tenant.name)


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    """Verify credentials and return a JWT."""
    result = await db.execute(
        select(Tenant).where(Tenant.email == payload.email)
    )
    tenant = result.scalar_one_or_none()
    if not tenant or not verify_password(payload.password, tenant.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_credentials",
        )
    if not tenant.is_active:
        raise HTTPException(status_code=403, detail="tenant_disabled")

    token = create_access_token(tenant.id)
    return TokenOut(access_token=token, tenant_id=tenant.id, name=tenant.name)


@router.get("/me", response_model=TenantOut)
async def me(tenant: Tenant = Depends(get_current_tenant)):
    """Return the authenticated tenant + their webhook URLs."""
    return _serialize(tenant)


@router.post("/connect/shopify", response_model=TenantOut)
async def connect_shopify(
    payload: ShopifyConnectIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Save the merchant's Shopify access token + shop domain."""
    tenant.shopify_domain = payload.shopify_domain.strip().lower()
    tenant.shopify_token = payload.shopify_token
    if payload.shopify_webhook_secret:
        tenant.shopify_webhook_secret = payload.shopify_webhook_secret
    await db.commit()
    await db.refresh(tenant)
    return _serialize(tenant)


@router.post("/connect/whatsapp", response_model=TenantOut)
async def connect_whatsapp(
    payload: WhatsAppConnectIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Save WhatsApp Business API token + phone-number ID."""
    tenant.whatsapp_token = payload.whatsapp_token
    tenant.whatsapp_phone_id = payload.whatsapp_phone_id
    if payload.whatsapp_verify_token:
        tenant.whatsapp_verify_token = payload.whatsapp_verify_token
    await db.commit()
    await db.refresh(tenant)
    return _serialize(tenant)


@router.post("/setup/brand", response_model=TenantOut)
async def setup_brand(
    payload: BrandSetupIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Save brand voice + policies (used by guardrails + AI)."""
    tenant.brand_name = payload.brand_name
    tenant.brand_tone = payload.brand_tone
    tenant.brand_policies = payload.brand_policies
    await db.commit()
    await db.refresh(tenant)
    return _serialize(tenant)


@router.post("/setup/payments", response_model=TenantOut)
async def setup_payments(
    payload: PaymentsSetupIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Save merchant's InstaPay + Vodafone Cash numbers."""
    if payload.instapay_number is not None:
        tenant.instapay_number = payload.instapay_number
    if payload.vodafone_number is not None:
        tenant.vodafone_number = payload.vodafone_number
    await db.commit()
    await db.refresh(tenant)
    return _serialize(tenant)
