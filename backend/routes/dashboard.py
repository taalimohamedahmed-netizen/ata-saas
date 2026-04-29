"""
Dashboard API — read-only endpoints for the merchant UI.

Every query is filtered by `tenant.id` derived from the JWT, never from
request input.

Endpoints:
  GET /dashboard/stats          → headline KPIs
  GET /dashboard/orders         → recent orders
  GET /dashboard/customers      → recent customers
  GET /dashboard/conversations  → recent conversations
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Body
from pydantic import BaseModel

from core.auth import get_current_tenant
from core.database import get_db
from models.conversation import Conversation
from models.customer import Customer, CustomerSegment
from models.order import Order, OrderStatus
from models.product import Product
from models.tenant import Tenant

router = APIRouter()


# ============================================================
# Stats
# ============================================================
@router.get("/stats")
async def stats(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Headline numbers for the dashboard home screen."""
    total_orders = (
        await db.execute(
            select(func.count(Order.id)).where(Order.tenant_id == tenant.id)
        )
    ).scalar_one()

    confirmed_orders = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.tenant_id == tenant.id,
                Order.status == OrderStatus.CONFIRMED,
            )
        )
    ).scalar_one()

    revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total_price), 0)).where(
                Order.tenant_id == tenant.id,
                Order.status == OrderStatus.CONFIRMED,
            )
        )
    ).scalar_one()

    total_customers = (
        await db.execute(
            select(func.count(Customer.id)).where(Customer.tenant_id == tenant.id)
        )
    ).scalar_one()

    vip_customers = (
        await db.execute(
            select(func.count(Customer.id)).where(
                Customer.tenant_id == tenant.id,
                Customer.segment == CustomerSegment.VIP,
            )
        )
    ).scalar_one()

    return {
        "total_orders": int(total_orders or 0),
        "confirmed_orders": int(confirmed_orders or 0),
        "revenue": float(revenue or 0),
        "total_customers": int(total_customers or 0),
        "vip_customers": int(vip_customers or 0),
    }


# ============================================================
# Orders
# ============================================================
@router.get("/orders")
async def list_orders(
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> list[dict[str, Any]]:
    """Most recent orders for this tenant."""
    rows = await db.execute(
        select(Order)
        .where(Order.tenant_id == tenant.id)
        .order_by(desc(Order.created_at))
        .offset(offset)
        .limit(limit)
    )
    out: list[dict[str, Any]] = []
    for o in rows.scalars().all():
        out.append(
            {
                "id": o.id,
                "shopify_order_id": o.shopify_order_id,
                "shopify_order_number": o.shopify_order_number,
                "customer_id": o.customer_id,
                "status": o.status.value,
                "total_price": o.total_price,
                "currency": o.currency,
                "payment_method": o.payment_method.value if o.payment_method else None,
                "confirmed_at": o.confirmed_at.isoformat() if o.confirmed_at else None,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
        )
    return out


# ============================================================
# Customers
# ============================================================
@router.get("/customers")
async def list_customers(
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    segment: CustomerSegment | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> list[dict[str, Any]]:
    """Most recent customers for this tenant (optionally by segment)."""
    stmt = select(Customer).where(Customer.tenant_id == tenant.id)
    if segment is not None:
        stmt = stmt.where(Customer.segment == segment)
    stmt = stmt.order_by(desc(Customer.created_at)).offset(offset).limit(limit)

    rows = await db.execute(stmt)
    return [
        {
            "id": c.id,
            "phone": c.phone,
            "name": c.name,
            "segment": c.segment.value,
            "total_orders": c.total_orders,
            "total_spent": c.total_spent,
            "last_order_date": c.last_order_date.isoformat() if c.last_order_date else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in rows.scalars().all()
    ]


# ============================================================
# Products
# ============================================================
@router.get("/products")
async def list_products(
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> list[dict[str, Any]]:
    stmt = select(Product).where(Product.tenant_id == tenant.id)
    if status:
        stmt = stmt.where(Product.status == status)
    if search:
        stmt = stmt.where(Product.title.ilike(f"%{search}%"))
    stmt = stmt.order_by(desc(Product.updated_at)).offset(offset).limit(limit)

    rows = await db.execute(stmt)
    return [
        {
            "id": p.id,
            "shopify_product_id": p.shopify_product_id,
            "title": p.title,
            "handle": p.handle,
            "vendor": p.vendor,
            "product_type": p.product_type,
            "status": p.status,
            "price": p.price,
            "inventory_qty": p.inventory_qty,
            "image_url": p.image_url,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in rows.scalars().all()
    ]


# ============================================================
# Conversations
# ============================================================
@router.get("/conversations")
async def list_conversations(
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> list[dict[str, Any]]:
    """Most recent conversations for this tenant, including customer info."""
    from sqlalchemy.orm import selectinload
    
    stmt = (
        select(Conversation)
        .where(Conversation.tenant_id == tenant.id)
        .options(selectinload(Conversation.customer))
        .order_by(desc(Conversation.updated_at))
        .offset(offset)
        .limit(limit)
    )
    
    result = await db.execute(stmt)
    rows = result.scalars().all()
    
    return [
        {
            "id": c.id,
            "customer_id": c.customer_id,
            "customer": {
                "id": c.customer.id,
                "phone": c.customer.phone,
                "name": c.customer.name,
            } if c.customer else None,
            "platform": c.platform.value,
            "current_flow": c.current_flow,
            "current_step": c.current_step,
            "ai_paused": c.ai_paused,
            "context": c.context,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in rows
    ]


# ============================================================
# Order Confirmation — payment settings + pending orders
# ============================================================

class PaymentSettingsIn(BaseModel):
    instapay_number: str | None = None
    instapay_link: str | None = None
    vodafone_number: str | None = None
    vodafone_link: str | None = None


@router.get("/order-confirmation/settings")
async def get_payment_settings(
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    return {
        "instapay_number": tenant.instapay_number,
        "instapay_link": tenant.instapay_link,
        "vodafone_number": tenant.vodafone_number,
        "vodafone_link": tenant.vodafone_link,
    }


@router.post("/order-confirmation/settings")
async def save_payment_settings(
    payload: PaymentSettingsIn,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    if payload.instapay_number is not None:
        tenant.instapay_number = payload.instapay_number.strip() or None
    if payload.instapay_link is not None:
        tenant.instapay_link = payload.instapay_link.strip() or None
    if payload.vodafone_number is not None:
        tenant.vodafone_number = payload.vodafone_number.strip() or None
    if payload.vodafone_link is not None:
        tenant.vodafone_link = payload.vodafone_link.strip() or None
    await db.commit()
    return {
        "instapay_number": tenant.instapay_number,
        "instapay_link": tenant.instapay_link,
        "vodafone_number": tenant.vodafone_number,
        "vodafone_link": tenant.vodafone_link,
    }


@router.get("/order-confirmation/pending")
async def list_pending_orders(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> list[dict[str, Any]]:
    """Orders waiting for payment confirmation (PENDING or AWAITING_PAYMENT/RECEIPT)."""
    from sqlalchemy.orm import selectinload
    stmt = (
        select(Order)
        .options(selectinload(Order.customer))
        .where(
            Order.tenant_id == tenant.id,
            Order.status.in_([
                OrderStatus.PENDING,
                OrderStatus.AWAITING_PAYMENT,
                OrderStatus.AWAITING_RECEIPT,
            ]),
        )
        .order_by(desc(Order.created_at))
        .offset(offset)
        .limit(limit)
    )
    rows = await db.execute(stmt)
    return [
        {
            "id": o.id,
            "shopify_order_id": o.shopify_order_id,
            "shopify_order_number": o.shopify_order_number,
            "status": o.status.value,
            "payment_method": o.payment_method.value if o.payment_method else None,
            "total_price": o.total_price,
            "currency": o.currency,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "customer": {
                "id": o.customer.id,
                "name": o.customer.name,
                "phone": o.customer.phone,
            } if o.customer else None,
        }
        for o in rows.scalars().all()
    ]
