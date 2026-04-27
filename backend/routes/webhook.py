"""
Shopify webhook routes.

Mounted at: POST /webhook/shopify/{tenant_id}

Flow:
  1. Read raw body + HMAC header
  2. Load tenant by URL parameter (the only place tenant_id comes from
     a path variable — every subsequent DB op filters by that tenant_id)
  3. Verify HMAC against tenant.shopify_webhook_secret
  4. Upsert customer + order rows
  5. Hand off to OrderHandler.start_from_shopify_order
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
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


@router.post("/shopify/{tenant_id}", status_code=200)
async def shopify_webhook(
    tenant_id: int,
    request: Request,
    x_shopify_topic: str | None = Header(default=None),
    x_shopify_hmac_sha256: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive a Shopify webhook for a specific tenant.

    Currently handles `orders/create` (the only event we kick off the
    customer flow on). Other topics are accepted + logged.
    """
    raw_body = await request.body()

    # Always look up tenant first; never trust a tenant_id from the body.
    tenant_row = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant: Tenant | None = tenant_row.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    # ----- HMAC verification -----
    secret = tenant.shopify_webhook_secret or os.getenv("SHOPIFY_WEBHOOK_SECRET", "")
    if secret and x_shopify_hmac_sha256:
        if not ShopifyService.verify_webhook(
            raw_body, x_shopify_hmac_sha256, secret
        ):
            log.warning("Invalid Shopify HMAC for tenant=%s", tenant_id)
            raise HTTPException(status_code=401, detail="invalid_hmac")
    elif os.getenv("APP_ENV", "development") != "development":
        # In production, refuse webhooks with no secret configured.
        log.error("Tenant %s has no Shopify webhook secret in prod", tenant_id)
        raise HTTPException(status_code=401, detail="webhook_secret_missing")

    # ----- Parse body -----
    try:
        payload = await request.json()
    except Exception:
        log.exception("Could not parse Shopify webhook body for tenant=%s", tenant_id)
        raise HTTPException(status_code=400, detail="invalid_json")

    topic = (x_shopify_topic or "").lower()
    log.info("Shopify webhook tenant=%s topic=%s", tenant_id, topic)

    # We only act on order creation; ignore everything else for now.
    if topic != "orders/create":
        return {"status": "ignored", "topic": topic}

    return await _handle_order_created(tenant, payload, db)


# ----------------------------------------------------------------------
# orders/create handling
# ----------------------------------------------------------------------
async def _handle_order_created(
    tenant: Tenant,
    payload: dict,
    db: AsyncSession,
) -> dict:
    """Upsert customer + order, then hand off to OrderHandler."""
    shopify_order_id = str(payload.get("id") or "")
    if not shopify_order_id:
        raise HTTPException(status_code=400, detail="missing_order_id")

    # ----- Pull customer phone -----
    phone = _extract_phone(payload)
    if not phone:
        log.warning(
            "Shopify order %s for tenant %s has no phone — skipping",
            shopify_order_id, tenant.id,
        )
        # Still record the order so the merchant sees it on the dashboard.

    # ----- Upsert customer (always tenant-scoped) -----
    customer: Customer | None = None
    if phone:
        result = await db.execute(
            select(Customer).where(
                Customer.tenant_id == tenant.id,
                Customer.phone == phone,
            )
        )
        customer = result.scalar_one_or_none()
        if not customer:
            customer_payload = payload.get("customer") or {}
            full_name = " ".join(
                p
                for p in [
                    customer_payload.get("first_name"),
                    customer_payload.get("last_name"),
                ]
                if p
            ).strip() or None
            customer = Customer(
                tenant_id=tenant.id,
                phone=phone,
                name=full_name,
            )
            db.add(customer)
            await db.flush()

    # ----- Upsert order (idempotent on shopify_order_id per tenant) -----
    existing = await db.execute(
        select(Order).where(
            Order.tenant_id == tenant.id,
            Order.shopify_order_id == shopify_order_id,
        )
    )
    order = existing.scalar_one_or_none()

    total_price = float(payload.get("total_price") or 0)
    currency = payload.get("currency") or "EGP"
    order_number = (
        payload.get("name")
        or str(payload.get("order_number") or "")
        or None
    )

    if order is None:
        order = Order(
            tenant_id=tenant.id,
            customer_id=customer.id if customer else None,
            shopify_order_id=shopify_order_id,
            shopify_order_number=order_number,
            status=OrderStatus.PENDING,
            total_price=total_price,
            currency=currency,
        )
        db.add(order)
    else:
        # Idempotent retry — nothing to do beyond logging.
        log.info(
            "Duplicate orders/create for tenant=%s order=%s — ignoring",
            tenant.id, shopify_order_id,
        )
        await db.commit()
        return {"status": "duplicate"}

    await db.commit()
    await db.refresh(order)

    # ----- Kick off the WhatsApp flow -----
    if customer is not None and tenant.whatsapp_token and tenant.whatsapp_phone_id:
        handler = OrderHandler()
        try:
            await handler.start_from_shopify_order(
                tenant=tenant,
                order=order,
                customer=customer,
                shopify_payload=payload,
                db=db,
            )
        except Exception:
            log.exception(
                "OrderHandler failed for tenant=%s order=%s",
                tenant.id, order.id,
            )

    return {"status": "ok", "order_id": order.id}


def _extract_phone(payload: dict) -> str | None:
    """Pull the customer's phone number from the various places Shopify puts it."""
    candidates = []
    customer = payload.get("customer") or {}
    candidates.append(customer.get("phone"))
    shipping = payload.get("shipping_address") or {}
    candidates.append(shipping.get("phone"))
    billing = payload.get("billing_address") or {}
    candidates.append(billing.get("phone"))
    candidates.append(payload.get("phone"))
    for c in candidates:
        if c and isinstance(c, str) and c.strip():
            return _normalize_phone(c.strip())
    return None


def _normalize_phone(p: str) -> str:
    """Strip spaces / + / dashes — we store digits only."""
    return "".join(ch for ch in p if ch.isdigit())
