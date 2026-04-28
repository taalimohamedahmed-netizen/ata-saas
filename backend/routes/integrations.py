"""
Integration management routes — Shopify Custom App + WhatsApp setup.

Shopify:
  POST /integrations/shopify/connect       → save token + register webhooks
  GET  /integrations/shopify/status        → connection + webhook status
  POST /integrations/shopify/webhooks/retry → retry failed registrations

WhatsApp:
  POST /integrations/whatsapp/connect  → save creds + generate verify_token
  GET  /integrations/whatsapp/status   → status
  POST /integrations/whatsapp/verify   → test message
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_tenant
from core.database import get_db
from core.encryption import decrypt, encrypt
from models.tenant import Tenant
from services.shopify_service import ShopifyService
from services.whatsapp_service import WhatsAppService

log = logging.getLogger("ata.routes.integrations")
router = APIRouter()

APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")

SHOPIFY_WEBHOOK_TOPICS = [
    ("orders/create",    "orders"),
    ("products/create",  "products"),
    ("customers/create", "customers"),
]


# ============================================================
# Helpers
# ============================================================

def _webhook_address(tenant_id: int, slug: str) -> str:
    return f"{APP_BASE_URL}/webhook/shopify/{tenant_id}/{slug}"


def _whatsapp_webhook_url(tenant_id: int) -> str:
    return f"{APP_BASE_URL}/webhook/whatsapp/{tenant_id}"


async def _register_all_webhooks(svc: ShopifyService, tenant: Tenant) -> dict[str, Any]:
    results: dict[str, Any] = {}
    for topic, slug in SHOPIFY_WEBHOOK_TOPICS:
        address = _webhook_address(tenant.id, slug)
        wh_id_attr = f"shopify_webhook_{slug}_id"
        try:
            existing = await svc.find_webhook(topic)
            if existing:
                wh_id = str(existing["id"])
            else:
                created = await svc.register_webhook(topic, address)
                wh_id = str(created.get("id", ""))
            setattr(tenant, wh_id_attr, wh_id)
            results[topic] = {"status": "connected", "id": wh_id}
        except Exception as exc:
            log.warning("Webhook registration failed topic=%s: %s", topic, exc)
            results[topic] = {"status": "failed", "error": str(exc)}
    return results


# ============================================================
# SHOPIFY — Connect
# ============================================================

class ShopifyConnectIn(BaseModel):
    shop_domain: str = Field(min_length=4, max_length=180)
    access_token: str = Field(min_length=10)


@router.post("/shopify/connect")
async def shopify_connect(
    payload: ShopifyConnectIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    shop = payload.shop_domain.strip().lower().removesuffix("/")
    if not shop.endswith(".myshopify.com"):
        raise HTTPException(status_code=422, detail="النطاق يجب أن يكون بصيغة yourstore.myshopify.com")

    tenant.shopify_domain = shop
    tenant.shopify_token = encrypt(payload.access_token.strip())
    tenant.shopify_connected_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(tenant)

    # Register the 3 webhooks immediately
    class _Proxy:
        shopify_domain = shop
        shopify_token = payload.access_token.strip()

    webhook_results: dict[str, Any] = {}
    try:
        svc = ShopifyService(_Proxy())
        webhook_results = await _register_all_webhooks(svc, tenant)
        await db.commit()
        log.info("Shopify connected tenant=%s webhooks=%s", tenant.id, webhook_results)
    except Exception as exc:
        log.warning("Webhook registration failed after connect: %s", exc)

    webhooks = {}
    for topic, slug in SHOPIFY_WEBHOOK_TOPICS:
        wh_id = getattr(tenant, f"shopify_webhook_{slug}_id", None)
        webhooks[topic] = {"status": "connected" if wh_id else "not_registered", "id": wh_id}

    return {
        "connected": True,
        "domain": tenant.shopify_domain,
        "webhooks": webhooks,
    }


# ============================================================
# SHOPIFY — Status
# ============================================================

@router.get("/shopify/status")
async def shopify_status(tenant: Tenant = Depends(get_current_tenant)) -> dict[str, Any]:
    connected = bool(tenant.shopify_domain and tenant.shopify_token)
    webhooks = {}
    for topic, slug in SHOPIFY_WEBHOOK_TOPICS:
        wh_id = getattr(tenant, f"shopify_webhook_{slug}_id", None)
        webhooks[topic] = {"status": "connected" if wh_id else "not_registered", "id": wh_id}
    return {
        "connected": connected,
        "domain": tenant.shopify_domain,
        "connected_at": tenant.shopify_connected_at.isoformat() if tenant.shopify_connected_at else None,
        "webhooks": webhooks,
    }


# ============================================================
# SHOPIFY — Retry webhooks
# ============================================================

@router.post("/shopify/webhooks/retry")
async def shopify_webhooks_retry(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    if not tenant.shopify_domain or not tenant.shopify_token:
        raise HTTPException(status_code=400, detail="Shopify غير متصل")

    class _Proxy:
        shopify_domain = tenant.shopify_domain
        shopify_token = decrypt(tenant.shopify_token)

    svc = ShopifyService(_Proxy())
    results = await _register_all_webhooks(svc, tenant)
    await db.commit()
    return {"webhooks": results}


# ============================================================
# WHATSAPP — Connect
# ============================================================

class WhatsAppConnectIn(BaseModel):
    waba_id: str = Field(min_length=4, max_length=50)
    phone_number_id: str = Field(min_length=4, max_length=50)
    phone_number: str = Field(min_length=6, max_length=30)
    access_token: str = Field(min_length=10)


@router.post("/whatsapp/connect")
async def whatsapp_connect(
    payload: WhatsAppConnectIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    if not tenant.whatsapp_verify_token:
        tenant.whatsapp_verify_token = secrets.token_hex(24)
    tenant.whatsapp_waba_id = payload.waba_id
    tenant.whatsapp_phone_id = payload.phone_number_id
    tenant.whatsapp_phone_number = payload.phone_number
    tenant.whatsapp_token = encrypt(payload.access_token)
    tenant.whatsapp_connected_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(tenant)
    return {
        "connected": True,
        "phone_number": tenant.whatsapp_phone_number,
        "webhook_url": _whatsapp_webhook_url(tenant.id),
        "verify_token": tenant.whatsapp_verify_token,
        "connected_at": tenant.whatsapp_connected_at.isoformat(),
    }


# ============================================================
# WHATSAPP — Status
# ============================================================

@router.get("/whatsapp/status")
async def whatsapp_status(tenant: Tenant = Depends(get_current_tenant)) -> dict[str, Any]:
    connected = bool(tenant.whatsapp_token and tenant.whatsapp_phone_id)
    return {
        "connected": connected,
        "phone_number": tenant.whatsapp_phone_number,
        "waba_id": tenant.whatsapp_waba_id,
        "webhook_url": _whatsapp_webhook_url(tenant.id) if connected else None,
        "verify_token": tenant.whatsapp_verify_token if connected else None,
        "connected_at": tenant.whatsapp_connected_at.isoformat() if tenant.whatsapp_connected_at else None,
    }


# ============================================================
# WHATSAPP — Verify (test message)
# ============================================================

class WhatsAppVerifyIn(BaseModel):
    test_phone: str = Field(min_length=7, max_length=20)


@router.post("/whatsapp/verify")
async def whatsapp_verify(
    payload: WhatsAppVerifyIn,
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    if not tenant.whatsapp_token or not tenant.whatsapp_phone_id:
        raise HTTPException(status_code=400, detail="WhatsApp غير متصل بعد")

    class _Proxy:
        whatsapp_token = decrypt(tenant.whatsapp_token)
        whatsapp_phone_id = tenant.whatsapp_phone_id

    try:
        wa = WhatsAppService(_Proxy())
        phone = "".join(ch for ch in payload.test_phone if ch.isdigit())
        await wa.send_text(to=phone, body="✅ ATA: تم التحقق من الاتصال بنجاح! منصتك جاهزة.")
        return {"verified": True, "message": "تم إرسال رسالة الاختبار بنجاح"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"فشل التحقق: {exc}")
