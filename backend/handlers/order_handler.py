"""
Order handler — drives Flow 1 (Shopify webhook → confirmed order).

Two entry points:
  - `start_from_shopify_order` is called by the Shopify webhook route
    when a new order is created. It sends the customer the order summary
    and offers payment options.
  - `handle` is called by the WhatsApp router for every message that the
    intent classifier labels ORDER_CONFIRM (button clicks, receipt
    images, follow-up messages).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.session_manager import SessionManager
from models.order import Order, OrderStatus, PaymentMethod
from services.ai_service import AIService
from services.payment_service import PaymentService
from services.shopify_service import ShopifyService
from services.whatsapp_service import WhatsAppService

log = logging.getLogger("ata.handlers.order")


# Map WhatsApp button reply IDs → PaymentMethod.
_BUTTON_TO_METHOD = {
    "pay_cod": PaymentMethod.COD,
    "pay_instapay": PaymentMethod.INSTAPAY,
    "pay_vodafone": PaymentMethod.VODAFONE_CASH,
}


class OrderHandler:
    """Drives the new-order → payment → confirmation flow."""

    def __init__(self, ai_service: AIService | None = None):
        self.ai = ai_service or AIService()

    # ================================================================
    # Flow 1, step 1: triggered by the Shopify webhook
    # ================================================================
    async def start_from_shopify_order(
        self,
        tenant,
        order: Order,
        customer,
        shopify_payload: dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """
        Send the customer a WhatsApp summary + payment-method buttons.

        - `order` is the newly inserted local Order row
        - `shopify_payload` is the raw webhook body (used for line items)
        """
        line_items = shopify_payload.get("line_items", []) or []
        items_lines = []
        for item in line_items[:5]:
            qty = item.get("quantity", 1)
            title = item.get("title", "منتج")
            items_lines.append(f"• {qty}× {title}")
        items_block = "\n".join(items_lines) if items_lines else "—"

        body = (
            f"أهلاً! 👋\n"
            f"استلمنا طلبك من {tenant.brand_name or tenant.name}.\n\n"
            f"📦 رقم الأوردر: {order.shopify_order_number or order.shopify_order_id}\n"
            f"{items_block}\n\n"
            f"💰 الإجمالي: {order.total_price:.2f} {order.currency}\n\n"
            f"اختار طريقة الدفع المناسبة ليك:"
        )

        try:
            wa = WhatsAppService(tenant)
            await wa.send_buttons(
                to=customer.phone,
                body=body,
                buttons=[
                    {"id": "pay_cod",      "title": "الدفع عند الاستلام"},
                    {"id": "pay_instapay", "title": "إنستا باي"},
                    {"id": "pay_vodafone", "title": "فودافون كاش"},
                ],
            )
        except Exception:
            log.exception(
                "Failed to send order kickoff message tenant=%s order=%s",
                tenant.id, order.id,
            )
            return

        order.status = OrderStatus.AWAITING_PAYMENT
        await db.commit()

        await SessionManager.set_flow(
            tenant_id=tenant.id,
            phone=customer.phone,
            flow="ORDER_CONFIRM",
            step="AWAIT_PAYMENT_METHOD",
            context={"order_id": order.id},
        )

    # ================================================================
    # Flow 1, step N: incoming WhatsApp messages while in ORDER_CONFIRM
    # ================================================================
    async def handle(
        self,
        tenant,
        customer,
        message: str,
        message_meta: dict[str, Any],
        session: dict[str, Any],
        db: AsyncSession,
    ) -> str | None:
        """
        Drive the conversation forward by one step.
        Returns None when an interactive (buttons) message was already sent
        directly via WhatsApp — caller should skip sending a text reply.

        `message_meta` carries non-text payloads from the WhatsApp router:
          - {"type": "button",  "button_id": "pay_instapay"}
          - {"type": "image",   "media_id": "..."}
          - {"type": "text"}
        """
        ctx = session.get("context", {}) or {}
        order_id = ctx.get("order_id")
        step = session.get("current_step") or "AWAIT_PAYMENT_METHOD"

        order = await self._load_order(db, tenant.id, order_id) if order_id else None

        # ── Customer-initiated: no order in session ─────────────────
        if order is None and step != "DONE":
            order = await self._find_pending_order(db, tenant.id, customer.id)
            if order is None:
                await SessionManager.clear(tenant.id, customer.phone)
                return "مش لاقيش أوردر معلق ليك. لو عندك مشكلة تانية كلمني وهساعدك. 🙏"
            # Restart the flow from scratch with the found order
            await self.start_from_shopify_order(tenant, order, customer, {}, db)
            return None  # interactive buttons already sent

        # Step A: pick a payment method (button reply or text)
        if step == "AWAIT_PAYMENT_METHOD":
            method = self._extract_method(message, message_meta)
            if method is None:
                return "اختار من الأزرار: الدفع عند الاستلام / إنستا باي / فودافون كاش."
            return await self._on_method_chosen(tenant, customer, order, method, db)

        # Step B: waiting for the receipt image
        if step == "AWAIT_RECEIPT":
            if message_meta.get("type") != "image":
                return "محتاج صورة الإيصال من فضلك. ابعتها هنا في الشات. 📸"
            return await self._verify_receipt(tenant, customer, order, message_meta, db)

        # Step C: already confirmed
        if step == "DONE":
            return "طلبك مأكد بالفعل! ✅ هتلاقي تفاصيل الشحن بتوصلك قريباً."

        log.warning("OrderHandler unknown step=%s tenant=%s customer=%s", step, tenant.id, customer.id)
        await SessionManager.clear(tenant.id, customer.phone)
        return "ممكن نبدأ من جديد؟ ابعت 'مرحبا' عشان نبدأ."

    # ================================================================
    # Helpers
    # ================================================================
    @staticmethod
    def _extract_method(
        message: str, meta: dict[str, Any]
    ) -> PaymentMethod | None:
        """Pull a PaymentMethod from a button click or free-text message."""
        if meta.get("type") == "button":
            return _BUTTON_TO_METHOD.get(meta.get("button_id", ""))
        text = (message or "").lower()
        if "cod" in text or "عند الاستلام" in text or "كاش" in text and "فودا" not in text:
            return PaymentMethod.COD
        if "insta" in text or "إنستا" in text or "انستا" in text:
            return PaymentMethod.INSTAPAY
        if "vodafone" in text or "فودافون" in text:
            return PaymentMethod.VODAFONE_CASH
        return None

    async def _on_method_chosen(
        self,
        tenant,
        customer,
        order: Order | None,
        method: PaymentMethod,
        db: AsyncSession,
    ) -> str:
        """Handle the user picking COD / InstaPay / Vodafone Cash."""
        if order is None:
            return "ما لقيتش الأوردر. تقدر تتواصل معانا تاني عشان نعيد إرساله."

        order.payment_method = method

        payments = PaymentService(tenant, ai_service=self.ai)

        if method == PaymentMethod.COD:
            order.status = OrderStatus.CONFIRMED
            order.confirmed_at = datetime.now(timezone.utc)
            await db.commit()
            await SessionManager.update(
                tenant.id, customer.phone,
                current_step="DONE",
                context={"order_id": order.id},
            )
            try:
                shopify = ShopifyService(tenant)
                await shopify.update_order_note(
                    order.shopify_order_id, "ATA: confirmed (COD via WhatsApp)"
                )
                await shopify.tag_order(order.shopify_order_id, "ata-cod-confirmed")
            except Exception:
                log.warning("Could not annotate Shopify order (COD)")
            return payments.payment_instructions(method, order.total_price)

        # InstaPay or Vodafone Cash → wait for receipt
        recipient = payments.get_recipient(method)
        if not recipient:
            return (
                "آسف، طريقة الدفع دي مش مفعلة حالياً. اختار طريقة تانية."
            )

        order.status = OrderStatus.AWAITING_RECEIPT
        await db.commit()

        await SessionManager.update(
            tenant.id, customer.phone,
            current_step="AWAIT_RECEIPT",
            context={"order_id": order.id, "method": method.value},
        )
        return payments.payment_instructions(method, order.total_price)

    async def _verify_receipt(
        self,
        tenant,
        customer,
        order: Order | None,
        meta: dict[str, Any],
        db: AsyncSession,
    ) -> str:
        """Download the receipt image and verify it via AI."""
        if order is None or order.payment_method is None:
            return "ما لقيتش الأوردر. تواصل معانا تاني من فضلك."

        media_id = meta.get("media_id")
        if not media_id:
            return "محتاج صورة الإيصال من فضلك."

        try:
            wa = WhatsAppService(tenant)
            image_bytes, mime = await wa.fetch_media(media_id)
        except Exception:
            log.exception("Failed to fetch WhatsApp media id=%s", media_id)
            return "حصلت مشكلة في تحميل الصورة. ممكن تعيد إرسالها؟"

        payments = PaymentService(tenant, ai_service=self.ai)
        result = await payments.verify_receipt_image(
            method=order.payment_method,
            image_bytes=image_bytes,
            media_type=mime,
            expected_amount=order.total_price,
        )

        if not result.get("valid"):
            reason = result.get("reason", "verification_failed")
            log.info(
                "Receipt rejected tenant=%s order=%s reason=%s",
                tenant.id, order.id, reason,
            )
            return (
                "ما قدرتش أتأكد من الإيصال. تأكد إن المبلغ والرقم صح "
                "وابعت الصورة تاني من فضلك."
            )

        # Success → confirm in Shopify + DB.
        order.status = OrderStatus.CONFIRMED
        order.confirmed_at = datetime.now(timezone.utc)
        order.payment_receipt_url = result.get("reference") or None
        await db.commit()

        try:
            shopify = ShopifyService(tenant)
            await shopify.mark_order_paid(order.shopify_order_id)
            await shopify.update_order_note(
                order.shopify_order_id,
                f"ATA: payment verified ({order.payment_method.value})",
            )
            await shopify.tag_order(order.shopify_order_id, "ata-payment-verified")
        except Exception:
            log.exception("Shopify confirmation failed (still saved locally)")

        await SessionManager.update(
            tenant.id, customer.phone,
            current_step="DONE",
            context={"order_id": order.id},
        )

        order_label = order.shopify_order_number or order.shopify_order_id
        return (
            f"تم تأكيد الدفع! ✅\n"
            f"رقم أوردرك: {order_label}\n"
            f"هنبدأ تجهيز الطلب على طول وهنبعتلك تفاصيل الشحن."
        )

    @staticmethod
    async def _load_order(
        db: AsyncSession, tenant_id: int, order_id: int | None
    ) -> Order | None:
        if not order_id:
            return None
        result = await db.execute(
            select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def _find_pending_order(
        db: AsyncSession, tenant_id: int, customer_id: int
    ) -> Order | None:
        """Find the most recent PENDING or AWAITING_PAYMENT order for this customer."""
        result = await db.execute(
            select(Order).where(
                Order.tenant_id == tenant_id,
                Order.customer_id == customer_id,
                Order.status.in_([OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT]),
            ).order_by(desc(Order.created_at)).limit(1)
        )
        return result.scalar_one_or_none()
