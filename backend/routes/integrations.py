"""
Integration management routes — Shopify OAuth + WhatsApp setup.

Each tenant has their own Shopify Partner app credentials (client_id + client_secret).
Flow:
  1. POST /integrations/shopify/oauth/start  → save credentials + return Shopify consent URL
  2. GET  /integrations/shopify/oauth/callback → exchange code, save token, register webhooks
  3. GET  /integrations/shopify/status        → connection + webhook status
  4. POST /integrations/shopify/webhooks/retry → retry failed webhook registrations

WhatsApp:
  POST /integrations/whatsapp/connect  → save creds + generate verify_token
  GET  /integrations/whatsapp/status   → status
  POST /integrations/whatsapp/verify   → test message
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_tenant
from core.database import get_db
from core.encryption import decrypt, encrypt
from models.customer import Customer
from models.order import Order, OrderStatus
from models.tenant import Tenant
from models.product import Product # Moved to top
from services.shopify_service import ShopifyService
from services.whatsapp_service import WhatsAppService

log = logging.getLogger("ata.routes.integrations")
router = APIRouter()

APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://saas.ataproject.cloud")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")

SHOPIFY_SCOPES = "read_orders,write_orders,read_products,write_products,read_customers,write_customers"
SHOPIFY_CALLBACK_URL = f"{APP_BASE_URL}/integrations/shopify/oauth/callback"

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


def _make_state(tenant_id: int, shop: str) -> str:
    payload = {
        "tenant_id": tenant_id,
        "shop": shop,
        "nonce": secrets.token_hex(8),
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _decode_state(state: str) -> dict:
    try:
        return jwt.decode(state, JWT_SECRET, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid state: {exc}")


def _verify_shopify_hmac(params: dict, secret: str) -> bool:
    hmac_value = params.pop("hmac", "")
    sorted_params = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    digest = hmac.new(secret.encode(), sorted_params.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, hmac_value)


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
# SHOPIFY OAUTH — Start
# ============================================================

class ShopifyOAuthStartIn(BaseModel):
    shop_domain: str = Field(min_length=4, max_length=180)
    client_id: str = Field(min_length=10, max_length=150)
    client_secret: str = Field(min_length=10, max_length=150)


@router.post("/shopify/oauth/start")
async def shopify_oauth_start(
    payload: ShopifyOAuthStartIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, str]:
    shop = payload.shop_domain.strip().lower().removesuffix("/")
    if not shop.endswith(".myshopify.com"):
        raise HTTPException(status_code=422, detail="النطاق يجب أن يكون بصيغة yourstore.myshopify.com")

    # Save per-tenant credentials (encrypted)
    tenant.shopify_client_id = payload.client_id.strip()
    tenant.shopify_client_secret = encrypt(payload.client_secret.strip())
    await db.commit()
    await db.refresh(tenant)

    state = _make_state(tenant.id, shop)
    params = {
        "client_id": payload.client_id.strip(),
        "scope": SHOPIFY_SCOPES,
        "redirect_uri": SHOPIFY_CALLBACK_URL,
        "state": state,
    }
    auth_url = f"https://{shop}/admin/oauth/authorize?{urlencode(params)}"
    return {"redirect_url": auth_url}


# ============================================================
# SHOPIFY OAUTH — Callback (public — Shopify redirects here)
# ============================================================

@router.get("/shopify/oauth/callback")
async def shopify_oauth_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    shop: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    frontend_integrations = f"{FRONTEND_URL}/dashboard/settings/integrations"

    if not code or not state or not shop:
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=missing_params")

    # Decode state → tenant_id
    try:
        claims = _decode_state(state)
    except HTTPException:
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=bad_state")

    tenant_id = claims.get("tenant_id")
    if not tenant_id:
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=bad_state")

    # Load tenant to get their credentials
    result = await db.execute(select(Tenant).where(Tenant.id == int(tenant_id)))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=tenant_not_found")

    client_id = tenant.shopify_client_id or ""
    client_secret = decrypt(tenant.shopify_client_secret) if tenant.shopify_client_secret else ""

    if not client_id or not client_secret:
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=missing_credentials")

    # Verify HMAC with tenant's own client_secret
    all_params = dict(request.query_params)
    if not _verify_shopify_hmac(all_params, client_secret):
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=invalid_hmac")

    # Exchange code → access token
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"https://{shop}/admin/oauth/access_token",
                json={"client_id": client_id, "client_secret": client_secret, "code": code},
            )
            resp.raise_for_status()
            access_token = resp.json().get("access_token")
    except Exception as exc:
        log.exception("Token exchange failed: %s", exc)
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=token_exchange_failed")

    if not access_token:
        return RedirectResponse(f"{frontend_integrations}?shopify=error&reason=no_token")

    # Save token + register webhooks
    tenant.shopify_domain = shop
    tenant.shopify_token = encrypt(access_token)
    tenant.shopify_connected_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(tenant)

    class _Proxy:
        shopify_domain = shop
        shopify_token = access_token

    try:
        svc = ShopifyService(_Proxy())
        webhook_results = await _register_all_webhooks(svc, tenant)
        await db.commit()
        log.info("Shopify connected tenant=%s webhooks=%s", tenant_id, webhook_results)
    except Exception as exc:
        log.exception("Webhook registration failed: %s", exc)

    return RedirectResponse(f"{frontend_integrations}?shopify=success&shop={shop}")


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
    webhook_urls = (
        {slug: _webhook_address(tenant.id, slug) for _, slug in SHOPIFY_WEBHOOK_TOPICS}
        if connected else {}
    )
    return {
        "connected": connected,
        "domain": tenant.shopify_domain,
        "connected_at": tenant.shopify_connected_at.isoformat() if tenant.shopify_connected_at else None,
        "webhooks": webhooks,
        "webhook_urls": webhook_urls,
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
# SHOPIFY — Historical sync
# ============================================================

def _extract_phone_from_order(payload: dict) -> str | None:
    for src in [
        (payload.get("customer") or {}).get("phone"),
        (payload.get("shipping_address") or {}).get("phone"),
        (payload.get("billing_address") or {}).get("phone"),
        payload.get("phone"),
    ]:
        if src and isinstance(src, str) and src.strip():
            return "".join(ch for ch in src if ch.isdigit()) or None
    return None


@router.post("/shopify/sync")
async def shopify_sync(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    log.info("Starting Shopify sync for tenant_id=%s domain=%s", tenant.id, tenant.shopify_domain)
    
    if not tenant.shopify_domain or not tenant.shopify_token:
        log.warning("Shopify not connected for tenant_id=%s", tenant.id)
        raise HTTPException(status_code=400, detail="Shopify غير متصل")

    # Defensive check: ensure products table exists (helps if migrations skipped it)
    try:
        await db.execute(text("SELECT 1 FROM products LIMIT 1"))
    except Exception:
        log.warning("Products table seems missing, attempting emergency creation")
        await db.execute(text("""
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
        """))
        await db.commit()

    class _Proxy:
        shopify_domain = tenant.shopify_domain
        shopify_token = decrypt(tenant.shopify_token)

    try:
        svc = ShopifyService(_Proxy())
    except Exception as exc:
        log.exception("ShopifyService initialization failed")
        raise HTTPException(status_code=400, detail=f"تعذر الاتصال بـ Shopify: {exc}")

    # ── Fetch from Shopify ──────────────────────────────────
    try:
        log.info("Fetching products (limit 50)...")
        shopify_products = await svc.sync_products(max_products=50)
        log.info("Fetched %s products", len(shopify_products))
        
        log.info("Fetching orders (limit 50)...")
        shopify_orders = await svc.sync_orders(max_orders=50)
        log.info("Fetched %s orders", len(shopify_orders))
        
        log.info("Fetching customers (limit 50)...")
        shopify_customers = await svc.sync_customers(max_customers=50)
        log.info("Fetched %s customers", len(shopify_customers))
    except Exception as exc:
        log.exception("Shopify API fetch failed")
        raise HTTPException(status_code=502, detail=f"فشل جلب البيانات من Shopify (تأكد من الـ Permissions): {exc}")

    products_synced = 0
    customers_synced = 0
    orders_synced = 0

    # ── Sync Products ───────────────────────────────────────
    log.info("Upserting products...")
    for p in shopify_products:
        sid = str(p.get("id", ""))
        if not sid: continue
        
        # Check existing
        res = await db.execute(select(Product).where(Product.tenant_id == tenant.id, Product.shopify_product_id == sid))
        product = res.scalar_one_or_none()
        
        # Variants logic for price/inventory
        variants = p.get("variants", [])
        price = float(variants[0].get("price", 0)) if variants else 0.0
        inventory = sum(v.get("inventory_quantity") or 0 for v in variants)
        
        # Handle images
        images = p.get("images") or []
        image_url = images[0].get("src") if images else None
        
        if not product:
            product = Product(tenant_id=tenant.id, shopify_product_id=sid)
            db.add(product)
            
        product.title = p.get("title") or "Unknown Product"
        product.body_html = p.get("body_html")
        product.vendor = p.get("vendor")
        product.product_type = p.get("product_type")
        product.status = p.get("status")
        product.price = price
        product.inventory_qty = inventory
        product.image_url = image_url
        products_synced += 1

    await db.flush()

    # ── Sync Customers ──────────────────────────────────────
    log.info("Upserting customers...")
    for c in shopify_customers:
        sid = str(c.get("id", ""))
        if not sid: continue
        
        # Match by Shopify ID
        res = await db.execute(select(Customer).where(Customer.tenant_id == tenant.id, Customer.shopify_customer_id == sid))
        customer = res.scalar_one_or_none()
        
        phone_raw = (c.get("phone") or "").strip()
        phone = "".join(ch for ch in phone_raw if ch.isdigit()) if phone_raw else None
        email = (c.get("email") or "").strip().lower() or None
        full_name = " ".join(p for p in [c.get("first_name"), c.get("last_name")] if p).strip() or "Shopify Customer"

        if not customer:
            customer = Customer(tenant_id=tenant.id, shopify_customer_id=sid)
            db.add(customer)
            
        customer.phone = phone
        customer.email = email
        customer.name = full_name
        customer.total_orders = int(c.get("orders_count") or 0)
        customer.total_spent = float(c.get("total_spent") or 0)
        customers_synced += 1

    await db.flush()

    # ── Sync Orders ─────────────────────────────────────────
    log.info("Upserting orders...")
    for o in shopify_orders:
        sid = str(o.get("id", ""))
        if not sid: continue
        
        res = await db.execute(select(Order).where(Order.tenant_id == tenant.id, Order.shopify_order_id == sid))
        order = res.scalar_one_or_none()
        
        # Try to link customer
        customer_sid = str((o.get("customer") or {}).get("id", ""))
        customer = None
        if customer_sid:
            res = await db.execute(select(Customer).where(Customer.tenant_id == tenant.id, Customer.shopify_customer_id == customer_sid))
            customer = res.scalar_one_or_none()

        if not order:
            order = Order(tenant_id=tenant.id, shopify_order_id=sid)
            db.add(order)
            
        order.shopify_order_number = o.get("name") or str(o.get("order_number") or "") or f"#{sid}"
        order.customer_id = customer.id if customer else None
        order.total_price = float(o.get("total_price") or 0)
        order.currency = o.get("currency") or "EGP"
        orders_synced += 1

    await db.commit()
    log.info("Sync complete: products=%s customers=%s orders=%s", products_synced, customers_synced, orders_synced)
    
    return {
        "synced": {
            "products": products_synced,
            "customers": customers_synced,
            "orders": orders_synced
        }
    }


# ============================================================
# SHOPIFY — Disconnect
# ============================================================

@router.post("/shopify/disconnect")
async def shopify_disconnect(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, bool]:
    # Attempt to delete webhooks from Shopify if we still have a token
    if tenant.shopify_domain and tenant.shopify_token:
        try:
            class _Proxy:
                shopify_domain = tenant.shopify_domain
                shopify_token = decrypt(tenant.shopify_token)
            
            svc = ShopifyService(_Proxy())
            # List and delete our known webhooks
            for slug in ["orders", "products", "customers"]:
                wh_id = getattr(tenant, f"shopify_webhook_{slug}_id")
                if wh_id:
                    try:
                        await svc.delete_webhook(wh_id)
                    except Exception:
                        pass # Ignore if already deleted or token invalid
        except Exception:
            pass # Continue clearing DB even if Shopify API calls fail

    # Clear all Shopify related fields
    tenant.shopify_domain = None
    tenant.shopify_token = None
    tenant.shopify_client_id = None
    tenant.shopify_client_secret = None
    tenant.shopify_webhook_secret = None
    tenant.shopify_webhook_orders_id = None
    tenant.shopify_webhook_products_id = None
    tenant.shopify_webhook_customers_id = None
    tenant.shopify_connected_at = None
    
    await db.commit()
    log.info("Shopify disconnected for tenant_id=%s", tenant.id)
    return {"success": True}


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
