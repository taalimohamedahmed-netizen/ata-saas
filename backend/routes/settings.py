"""
Tenant settings routes.

GET  /settings/ai           → get current AI config (model + provider)
POST /settings/ai           → save openrouter_api_key + ai_model
GET  /settings/ai/models    → list available models

POST /settings/conversations/{id}/toggle-ai  → flip ai_paused flag
POST /settings/conversations/{id}/reply       → send manual WhatsApp reply
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_tenant
from core.database import get_db
from core.encryption import decrypt, encrypt
from models.conversation import Conversation
from models.tenant import Tenant
from services.ai_service import AVAILABLE_MODELS
from services.whatsapp_service import WhatsAppService

log = logging.getLogger("ata.routes.settings")
router = APIRouter()


# ============================================================
# AI Settings
# ============================================================

class AISettingsIn(BaseModel):
    openrouter_api_key: str | None = Field(default=None)
    ai_model: str | None = Field(default=None, max_length=120)


class AISettingsOut(BaseModel):
    provider: str          # "openrouter" | "anthropic"
    ai_model: str | None
    has_openrouter_key: bool


@router.get("/ai", response_model=AISettingsOut)
async def get_ai_settings(
    tenant: Tenant = Depends(get_current_tenant),
) -> AISettingsOut:
    return AISettingsOut(
        provider="openrouter" if tenant.openrouter_api_key else "anthropic",
        ai_model=tenant.ai_model,
        has_openrouter_key=bool(tenant.openrouter_api_key),
    )


@router.post("/ai", response_model=AISettingsOut)
async def save_ai_settings(
    payload: AISettingsIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> AISettingsOut:
    if payload.openrouter_api_key is not None:
        stripped = payload.openrouter_api_key.strip()
        tenant.openrouter_api_key = encrypt(stripped) if stripped else None

    if payload.ai_model is not None:
        tenant.ai_model = payload.ai_model.strip() or None

    await db.commit()
    await db.refresh(tenant)
    log.info("AI settings updated tenant=%s model=%s", tenant.id, tenant.ai_model)
    return AISettingsOut(
        provider="openrouter" if tenant.openrouter_api_key else "anthropic",
        ai_model=tenant.ai_model,
        has_openrouter_key=bool(tenant.openrouter_api_key),
    )


@router.get("/ai/models")
async def list_models() -> list[dict[str, str]]:
    return AVAILABLE_MODELS


# ============================================================
# Conversation control
# ============================================================

class ManualReplyIn(BaseModel):
    message: str = Field(min_length=1, max_length=4096)


@router.post("/conversations/{conversation_id}/toggle-ai")
async def toggle_ai(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant.id,
        )
    )
    convo = result.scalar_one_or_none()
    if not convo:
        raise HTTPException(status_code=404, detail="conversation_not_found")

    convo.ai_paused = not convo.ai_paused
    await db.commit()
    log.info("Conversation %s ai_paused=%s tenant=%s", conversation_id, convo.ai_paused, tenant.id)
    return {"id": conversation_id, "ai_paused": convo.ai_paused}


# ============================================================
# Shopify App — Tenant settings endpoints
# (identified via X-Shop-Token instead of JWT)
# ============================================================

class ShopifyTenantOut(BaseModel):
    whatsapp_connected: bool
    whatsapp_phone_number: str | None
    whatsapp_phone_id: str | None
    whatsapp_waba_id: str | None
    whatsapp_verify_token: str | None
    brand_name: str | None
    brand_tone: str | None
    brand_policies: str | None
    ai_enabled: bool


@router.get("/shopify-tenant", response_model=ShopifyTenantOut)
async def get_shopify_tenant_settings(
    tenant: Tenant = Depends(get_current_tenant),
) -> ShopifyTenantOut:
    return ShopifyTenantOut(
        whatsapp_connected=bool(tenant.whatsapp_token and tenant.whatsapp_phone_id),
        whatsapp_phone_number=tenant.whatsapp_phone_number,
        whatsapp_phone_id=tenant.whatsapp_phone_id,
        whatsapp_waba_id=tenant.whatsapp_waba_id,
        whatsapp_verify_token=tenant.whatsapp_verify_token,
        brand_name=tenant.brand_name,
        brand_tone=tenant.brand_tone,
        brand_policies=tenant.brand_policies,
        ai_enabled=True,
    )


class WhatsAppSettingsIn(BaseModel):
    waba_id: str = Field(min_length=1, max_length=50)
    phone_id: str = Field(min_length=1, max_length=120)
    phone_number: str = Field(min_length=1, max_length=30)
    access_token: str | None = Field(default=None)


@router.post("/shopify-tenant/whatsapp")
async def save_shopify_whatsapp(
    payload: WhatsAppSettingsIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    import secrets as secrets_mod
    tenant.whatsapp_waba_id = payload.waba_id.strip()
    tenant.whatsapp_phone_id = payload.phone_id.strip()
    tenant.whatsapp_phone_number = payload.phone_number.strip()
    if payload.access_token:
        tenant.whatsapp_token = encrypt(payload.access_token.strip())
    if not tenant.whatsapp_verify_token:
        tenant.whatsapp_verify_token = secrets_mod.token_hex(24)
    await db.commit()
    log.info("WhatsApp settings saved via Shopify app tenant=%s", tenant.id)
    return {"ok": True, "verify_token": tenant.whatsapp_verify_token}


class BrandSettingsIn(BaseModel):
    brand_name: str | None = Field(default=None, max_length=120)
    brand_tone: str | None = Field(default=None, max_length=255)
    brand_policies: str | None = Field(default=None)


@router.post("/shopify-tenant/brand")
async def save_shopify_brand(
    payload: BrandSettingsIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    if payload.brand_name is not None:
        tenant.brand_name = payload.brand_name
    if payload.brand_tone is not None:
        tenant.brand_tone = payload.brand_tone
    if payload.brand_policies is not None:
        tenant.brand_policies = payload.brand_policies
    await db.commit()
    log.info("Brand settings saved via Shopify app tenant=%s", tenant.id)
    return {"ok": True}


@router.post("/conversations/{conversation_id}/reply")
async def manual_reply(
    conversation_id: int,
    payload: ManualReplyIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    from models.customer import Customer
    from datetime import datetime, timezone

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant.id,
        )
    )
    convo = result.scalar_one_or_none()
    if not convo:
        raise HTTPException(status_code=404, detail="conversation_not_found")

    # Get customer phone
    cust_result = await db.execute(
        select(Customer).where(Customer.id == convo.customer_id)
    )
    customer = cust_result.scalar_one_or_none()
    if not customer or not customer.phone:
        raise HTTPException(status_code=400, detail="customer_has_no_phone")

    if not tenant.whatsapp_token or not tenant.whatsapp_phone_id:
        raise HTTPException(status_code=400, detail="whatsapp_not_connected")

    # Send via WhatsApp
    try:
        wa = WhatsAppService(tenant)
        await wa.send_text(to=customer.phone, body=payload.message)
    except Exception as exc:
        log.exception("Manual reply send failed conversation=%s", conversation_id)
        raise HTTPException(status_code=502, detail=f"فشل الإرسال: {exc}")

    # Persist to conversation history
    now = datetime.now(timezone.utc).isoformat()
    context = convo.context or {}
    history: list[dict] = list(context.get("history_tail") or [])
    history.append({"role": "assistant", "content": payload.message, "ts": now, "manual": True})
    history = history[-50:]
    convo.context = {**context, "history_tail": history}
    convo.updated_at = datetime.now(timezone.utc)
    await db.commit()

    log.info("Manual reply sent conversation=%s tenant=%s", conversation_id, tenant.id)
    return {"sent": True, "message": payload.message}
