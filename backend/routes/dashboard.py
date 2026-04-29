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
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_tenant
from core.database import get_db
from models.conversation import Conversation
from models.customer import Customer, CustomerSegment
from models.order import Order, OrderStatus
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
