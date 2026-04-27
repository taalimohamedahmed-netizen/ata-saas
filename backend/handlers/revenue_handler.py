"""
Revenue handler — upsells + abandoned-cart recovery.

Routed to from the WhatsApp router for UPSELL and ABANDONED_CART intents.
"""

from __future__ import annotations

import logging
from typing import Any

from core.intent_classifier import Intent
from models.customer import CustomerSegment
from services.ai_service import AIService
from services.shopify_service import ShopifyService

log = logging.getLogger("ata.handlers.revenue")


class RevenueHandler:
    """Generate revenue-bearing replies (upsell / cart recovery)."""

    def __init__(self, ai_service: AIService | None = None):
        self.ai = ai_service or AIService()

    async def handle(
        self,
        tenant,
        customer,
        message: str,
        intent: Intent,
        session: dict[str, Any],
    ) -> str:
        if intent == Intent.UPSELL:
            return await self._upsell(tenant, customer, message, session)
        if intent == Intent.ABANDONED_CART:
            return await self._abandoned_cart(tenant, customer, message, session)
        return await self._upsell(tenant, customer, message, session)

    # ----------------------------------------------------------------
    # Upsell — recommend a product based on segment
    # ----------------------------------------------------------------
    async def _upsell(self, tenant, customer, message: str, session: dict) -> str:
        """Pull top products from Shopify, ask Claude to pitch one."""
        product_block = "Top products are unavailable."
        if tenant.shopify_token:
            try:
                shopify = ShopifyService(tenant)
                products = await shopify.list_products(limit=5)
                lines = []
                for p in products:
                    title = p.get("title", "Product")
                    variants = p.get("variants") or []
                    price = variants[0].get("price") if variants else "?"
                    lines.append(f"- {title} ({price} EGP)")
                if lines:
                    product_block = "Available products:\n" + "\n".join(lines)
            except Exception:
                log.exception("Shopify list_products failed")

        segment_hint = {
            CustomerSegment.VIP: "Customer is VIP — recommend a premium item.",
            CustomerSegment.AT_RISK: (
                "Customer is at risk of churning — gently recommend a "
                "popular item and consider a small incentive."
            ),
            CustomerSegment.NEW: "Customer is new — recommend a best-seller.",
        }.get(customer.segment, "Recommend a best-seller.")

        extra = (
            f"{product_block}\n\n"
            f"Customer segment: {customer.segment.value}\n"
            f"Strategy: {segment_hint}\n"
            f"Pick ONE product and pitch it warmly in 2 sentences."
        )

        return await self.ai.generate_response(
            tenant=tenant,
            history=session.get("history", []),
            user_message=message,
            extra_context=extra,
        )

    # ----------------------------------------------------------------
    # Abandoned cart — recovery message
    # ----------------------------------------------------------------
    async def _abandoned_cart(
        self, tenant, customer, message: str, session: dict
    ) -> str:
        """Encourage the customer to complete checkout."""
        extra = (
            "Context: this customer has an abandoned cart. "
            "Encourage them to complete checkout. Be warm and brief; "
            "do NOT promise a discount unless brand policies allow it."
        )
        return await self.ai.generate_response(
            tenant=tenant,
            history=session.get("history", []),
            user_message=message,
            extra_context=extra,
        )
