"""
Payment service — InstaPay + Vodafone Cash receipt verification.

There is no public InstaPay/Vodafone Cash API for merchants in Egypt,
so verification works by inspecting the customer's receipt screenshot
with Claude's vision model.

Usage:
    payments = PaymentService(tenant, ai_service)
    msg = payments.payment_instructions(PaymentMethod.INSTAPAY)
    result = await payments.verify_receipt_image(
        method=PaymentMethod.INSTAPAY,
        image_bytes=img,
        media_type="image/jpeg",
        expected_amount=order.total_price,
    )
"""

from __future__ import annotations

import logging
from typing import Any

from models.order import PaymentMethod
from services.ai_service import AIService

log = logging.getLogger("ata.payments")


class PaymentService:
    """Per-tenant payment instructions + receipt verification."""

    def __init__(self, tenant, ai_service: AIService | None = None):
        self.tenant = tenant
        self.ai = ai_service or AIService()

    # ----------------------------------------------------------------
    # Customer-facing helpers
    # ----------------------------------------------------------------
    def get_recipient(self, method: PaymentMethod) -> str | None:
        """Return the merchant's receiving number for a given method."""
        if method == PaymentMethod.INSTAPAY:
            return self.tenant.instapay_number
        if method == PaymentMethod.VODAFONE_CASH:
            return self.tenant.vodafone_number
        return None

    def payment_instructions(
        self,
        method: PaymentMethod,
        amount: float,
    ) -> str:
        """Build a payment instructions message for the customer."""
        if method == PaymentMethod.COD:
            return "✅ تم اختيار الدفع عند الاستلام. هنشحن طلبك في أقرب وقت!"

        recipient = self.get_recipient(method)
        if not recipient:
            return "آسف، طريقة الدفع دي مش متاحة حالياً. تحب تختار طريقة تانية؟"

        if method == PaymentMethod.INSTAPAY:
            method_name_ar = "إنستا باي"
            link = getattr(self.tenant, "instapay_link", None)
        else:
            method_name_ar = "فودافون كاش"
            link = getattr(self.tenant, "vodafone_link", None)

        msg = (
            f"تمام! 💳\n"
            f"حوّل *{amount:.2f} جنيه* على {method_name_ar}\n"
            f"على الرقم: *{recipient}*\n"
        )
        if link:
            msg += f"\n🔗 رابط الدفع:\n{link}\n"
        msg += "\nبعد التحويل، ابعت صورة الإيصال هنا. 📸"
        return msg

    # ----------------------------------------------------------------
    # AI-backed receipt verification
    # ----------------------------------------------------------------
    async def verify_receipt_image(
        self,
        method: PaymentMethod,
        image_bytes: bytes,
        media_type: str,
        expected_amount: float,
    ) -> dict[str, Any]:
        """
        Verify a receipt screenshot using Claude vision.

        Returns the full verification dict from AIService plus the
        recipient number it was checked against.
        """
        recipient = self.get_recipient(method) or ""
        result = await self.ai.verify_receipt(
            image_bytes=image_bytes,
            media_type=media_type,
            expected_amount=expected_amount,
            expected_recipient=recipient,
        )
        result["expected_recipient"] = recipient
        result["method"] = method.value
        log.info(
            "Receipt verification (tenant=%s, method=%s) → valid=%s",
            self.tenant.id, method.value, result.get("valid"),
        )
        return result
