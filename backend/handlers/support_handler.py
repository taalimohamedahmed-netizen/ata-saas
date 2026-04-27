"""
Support handler — WISMO, returns, exchanges, billing questions.

Routed to from the WhatsApp router when intent is WISMO or RETURN_REQUEST.
"""

from __future__ import annotations

import logging
from typing import Any

from core.intent_classifier import Intent
from core.session_manager import SessionManager
from services.ai_service import AIService
from services.shopify_service import ShopifyService

log = logging.getLogger("ata.handlers.support")


class SupportHandler:
    """Handles 'where is my order?' and return/exchange flows."""

    def __init__(self, ai_service: AIService | None = None):
        self.ai = ai_service or AIService()

    # ----------------------------------------------------------------
    # Entry point
    # ----------------------------------------------------------------
    async def handle(
        self,
        tenant,
        customer,
        message: str,
        intent: Intent,
        session: dict[str, Any],
    ) -> str:
        """Dispatch to the appropriate sub-handler based on intent."""
        if intent == Intent.WISMO:
            return await self._wismo(tenant, customer, message, session)
        if intent == Intent.RETURN_REQUEST:
            return await self._return_request(tenant, customer, message, session)
        # Fallback: generic support reply.
        return await self._generic_support(tenant, customer, message, session)

    # ----------------------------------------------------------------
    # WISMO — Where Is My Order
    # ----------------------------------------------------------------
    async def _wismo(self, tenant, customer, message: str, session: dict) -> str:
        """Look up the customer's most recent orders on Shopify and report."""
        if not tenant.shopify_token:
            return await self._ai_fallback(
                tenant, message, session,
                extra="Shopify is not connected for this tenant.",
            )

        try:
            shopify = ShopifyService(tenant)
            orders = await shopify.list_recent_orders(phone=customer.phone, limit=3)
        except Exception:
            log.exception("Shopify lookup failed for tenant=%s", tenant.id)
            return await self._ai_fallback(tenant, message, session)

        if not orders:
            return (
                "ما لقيتش طلب على رقمك. تقدر تبعتلي رقم الأوردر وأشوفه لك؟"
            )

        # Build a short summary of the most recent order(s).
        summary = []
        for o in orders:
            num = o.get("name") or o.get("order_number") or o.get("id")
            status = o.get("fulfillment_status") or "pending"
            financial = o.get("financial_status") or "unpaid"
            total = o.get("total_price") or "?"
            summary.append(
                f"#{num} • شحن: {status} • دفع: {financial} • {total} EGP"
            )

        context = "Recent orders for this customer:\n" + "\n".join(summary)
        return await self.ai.generate_response(
            tenant=tenant,
            history=session.get("history", []),
            user_message=message,
            extra_context=context,
        )

    # ----------------------------------------------------------------
    # Return / exchange / refund
    # ----------------------------------------------------------------
    async def _return_request(
        self, tenant, customer, message: str, session: dict
    ) -> str:
        """Multi-step return collection. State lives in the session."""
        # Drop the user into the RETURN_REQUEST flow so follow-up messages
        # stay routed here regardless of keywords.
        await SessionManager.set_flow(
            tenant_id=tenant.id,
            phone=customer.phone,
            flow="RETURN_REQUEST",
            step=session.get("current_step") or "ASK_ORDER_NUMBER",
            context=session.get("context", {}),
        )

        step = session.get("current_step") or "ASK_ORDER_NUMBER"

        if step == "ASK_ORDER_NUMBER":
            await SessionManager.update(
                tenant.id, customer.phone, current_step="ASK_REASON"
            )
            return (
                "تمام، هساعدك في طلب الإرجاع. ابعتلي رقم الأوردر اللي عايز "
                "ترجعه من فضلك."
            )

        if step == "ASK_REASON":
            ctx = session.get("context", {})
            ctx["order_number"] = message.strip()
            await SessionManager.update(
                tenant.id, customer.phone,
                current_step="CONFIRM",
                context=ctx,
            )
            return "ممكن توضح سبب الإرجاع باختصار؟ (مقاس / شكل / عيب / إلخ)"

        if step == "CONFIRM":
            ctx = session.get("context", {})
            ctx["return_reason"] = message.strip()
            await SessionManager.update(
                tenant.id, customer.phone,
                current_step="DONE",
                context=ctx,
            )
            # In a real deployment we'd open a ticket / Shopify return here.
            log.info(
                "Return request created tenant=%s customer=%s order=%s reason=%s",
                tenant.id, customer.id,
                ctx.get("order_number"), ctx.get("return_reason"),
            )
            return (
                "تمام! استلمنا طلب الإرجاع وفريق خدمة العملاء هيتواصل معاك "
                "خلال 24 ساعة لتأكيد الموعد."
            )

        # Unknown step → reset.
        await SessionManager.clear(tenant.id, customer.phone)
        return "نبدأ من الأول. تحب ترجع منتج معين؟ ابعتلي رقم الأوردر."

    # ----------------------------------------------------------------
    # Generic fallback
    # ----------------------------------------------------------------
    async def _generic_support(
        self, tenant, customer, message: str, session: dict
    ) -> str:
        return await self._ai_fallback(tenant, message, session)

    async def _ai_fallback(
        self, tenant, message: str, session: dict, extra: str | None = None
    ) -> str:
        return await self.ai.generate_response(
            tenant=tenant,
            history=session.get("history", []),
            user_message=message,
            extra_context=extra,
        )
