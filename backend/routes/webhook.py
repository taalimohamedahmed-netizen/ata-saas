"""
Shopify webhook routes.

Topic-specific paths (registered with Shopify):
  POST /webhook/shopify/{tenant_id}/orders
  POST /webhook/shopify/{tenant_id}/products
  POST /webhook/shopify/{tenant_id}/customers

Legacy catch-all (kept for backwards compatibility):
  POST /webhook/shopify/{tenant_id}

Flow:
  1. Read raw body + HMAC header
  2. Load tenant by URL parameter
  3. Verify HMAC against tenant.shopify_webhook_secret
  4. Dispatch by topic
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from handlers.order_handler import OrderHandler
from models.customer import Customer
from models.order import Order, OrderStatus
from models.tenant import Tenant
from services.shopify_service import ShopifyService

log = logging.getLogger("ata.routes.webhook")
router = APIRouter()


# ============================================================
# Topic-specific routes (registered via integrations page)
# ============================================================

@router.post("/shopify/{tenant_id}/orders", status_code=200)
async def shopify_webhook_orders(
    tenant_id: int,
    request: Request,
    x_shopify_hmac_sha256: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await _dispatch(tenant_id, request, "orders/create", x_shopify_hmac_sha256, db)


@router.post("/shopify/{tenant_id}/products", status_code=200)
async def shopify_webhook_products(
    tenant_id: int,
    request: Request,
    x_shopify_hmac_sha256: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await _dispatch(tenant_id, request, "products/create", x_shopify_hmac_sha256, db)


@router.post("/shopify/{tenant_id}/customers", status_code=200)
async def shopify_webhook_customers(
    tenant_id: int,
    request: Request,
    x_shopify_hmac_sha256: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await _dispatch(tenant_id, request, "customers/create", x_shopify_hmac_sha256, db)


# ============================================================
# Legacy catch-all (reads topic from header)
# ============================================================

@router.post("/shopify/{tenant_id}", status_code=200)
async def shopify_webhook(
    tenant_id: int,
    request: Request,
    x_shopify_topic: str | None = Header(default=None),
    x_shopify_hmac_sha256: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    topic = (x_shopify_topic or "").lower()
    return await _dispatch(tenant_id, request, topic, x_shopify_hmac_sha256, db)


# ============================================================
# Shared dispatcher
# ============================================================

async def _dispatch(
    tenant_id: int,
    request: Request,
    topic: str,
    hmac_header: str | None,
    db: AsyncSession,
) -> dict:
    raw_body = await request.body()

    tenant_row = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant: Tenant | None = tenant_row.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    secret = tenant.shopify_webhook_secret or os.getenv("SHOPIFY_WEBHOOK_SECRET", "")
    if secret and hmac_header:
        if not ShopifyService.verify_webhook(raw_body, hmac_header, secret):
            log.warning("Invalid Shopify HMAC for tenant=%s", tenant_id)
            raise HTTPException(status_code=401, detail="invalid_hmac")
    elif os.getenv("APP_ENV", "development") != "development":
        log.error("Tenant %s has no Shopify webhook secret in prod", tenant_id)
        raise HTTPException(status_code=401, detail="webhook_secret_missing")

    try:
        payload = await request.json()
    except Exception:
        log.exception("Could not parse Shopify webhook body for tenant=%s", tenant_id)
        raise HTTPException(status_code=400, detail="invalid_json")

    log.info("Shopify webhook tenant=%s topic=%s", tenant_id, topic)

    if topic == "orders/create":
        return await _handle_order_created(tenant, payload, db)

    return {"status": "ignored", "topic": topic}


# ============================================================
# orders/create handler
# ============================================================

async def _handle_order_created(tenant: Tenant, payload: dict, db: AsyncSession) -> dict:
    shopify_order_id = str(payload.get("id") or "")
    if not shopify_order_id:
        raise HTTPException(status_code=400, detail="missing_order_id")

    phone = _extract_phone(payload)
    if not phone:
        log.warning("Shopify order %s for tenant %s has no phone", shopify_order_id, tenant.id)

    customer: Customer | None = None
    if phone:
        result = await db.execute(
            select(Customer).where(Customer.tenant_id == tenant.id, Customer.phone == phone)
        )
        customer = result.scalar_one_or_none()
        if not customer:
            customer_payload = payload.get("customer") or {}
            full_name = " ".join(
                p for p in [customer_payload.get("first_name"), customer_payload.get("last_name")] if p
            ).strip() or None
            customer = Customer(tenant_id=tenant.id, phone=phone, name=full_name)
            db.add(customer)
            await db.flush()

    existing = await db.execute(
        select(Order).where(Order.tenant_id == tenant.id, Order.shopify_order_id == shopify_order_id)
    )
    order = existing.scalar_one_or_none()

    if order is None:
        order = Order(
            tenant_id=tenant.id,
            customer_id=customer.id if customer else None,
            shopify_order_id=shopify_order_id,
            shopify_order_number=payload.get("name") or str(payload.get("order_number") or "") or None,
            status=OrderStatus.PENDING,
            total_price=float(payload.get("total_price") or 0),
            currency=payload.get("currency") or "EGP",
        )
        db.add(order)
    else:
        log.info("Duplicate orders/create tenant=%s order=%s", tenant.id, shopify_order_id)
        await db.commit()
        return {"status": "duplicate"}

    await db.commit()
    await db.refresh(order)

    if customer and tenant.whatsapp_token and tenant.whatsapp_phone_id:
        try:
            await OrderHandler().start_from_shopify_order(
                tenant=tenant, order=order, customer=customer, shopify_payload=payload, db=db,
            )
        except Exception:
            log.exception("OrderHandler failed tenant=%s order=%s", tenant.id, order.id)

    return {"status": "ok", "order_id": order.id}


def _extract_phone(payload: dict) -> str | None:
    for src in [
        (payload.get("customer") or {}).get("phone"),
        (payload.get("shipping_address") or {}).get("phone"),
        (payload.get("billing_address") or {}).get("phone"),
        payload.get("phone"),
    ]:
        if src and isinstance(src, str) and src.strip():
            return "".join(ch for ch in src if ch.isdigit())
    return None
