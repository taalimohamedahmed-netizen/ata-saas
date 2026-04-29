"""
Brand handler — generic conversational replies on the tenant's brand voice.

Used as the catch-all when no other intent fires (GENERAL).
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, desc
from models.product import Product
from models.order import Order
from services.ai_service import AIService

log = logging.getLogger("ata.handlers.brand")


class BrandHandler:
    """Brand-aware general conversation handler."""

    def __init__(self, ai_service: AIService | None = None):
        self.ai = ai_service or AIService()

    async def handle(
        self,
        tenant,
        customer,
        message: str,
        session: dict[str, Any],
        db=None, # Added db dependency
    ) -> str:
        """Generate an on-brand reply with database context (products + orders)."""
        
        extra_context = ""
        
        if db:
            # 1. Fetch available products (limit to 10 for context size)
            res = await db.execute(
                select(Product)
                .where(Product.tenant_id == tenant.id, Product.status == "active")
                .limit(10)
            )
            products = res.scalars().all()
            if products:
                shop_domain = getattr(tenant, "shopify_domain", None)
                extra_context += "\n=== AVAILABLE PRODUCTS ===\n"
                for p in products:
                    line = f"- {p.title}: {p.price} EGP (Stock: {p.inventory_qty})"
                    if shop_domain and p.handle:
                        line += f" | Link: https://{shop_domain}/products/{p.handle}"
                    extra_context += line + "\n"

            # 2. Fetch customer's recent orders
            res = await db.execute(
                select(Order)
                .where(Order.tenant_id == tenant.id, Order.customer_id == customer.id)
                .order_by(desc(Order.created_at))
                .limit(3)
            )
            orders = res.scalars().all()
            if orders:
                extra_context += "\n=== CUSTOMER RECENT ORDERS ===\n"
                for o in orders:
                    extra_context += f"- Order {o.shopify_order_number}: {o.status} ({o.total_price} {o.currency})\n"

        return await self.ai.generate_response(
            tenant=tenant,
            history=session.get("history", []),
            user_message=message,
            extra_context=extra_context if extra_context else None,
        )
