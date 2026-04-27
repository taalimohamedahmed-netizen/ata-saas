"""
Anthropic Claude wrapper.

Single entry point for everything AI: intent classification, generating
brand-aware replies, and verifying payment receipts from images.

Usage:
    ai = AIService()
    text = await ai.generate_response(tenant, history, user_message)
"""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

from anthropic import AsyncAnthropic

from core.brand_guardrails import build_system_prompt, validate_response

log = logging.getLogger("ata.ai")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")


class AIService:
    """Thin async wrapper around the Anthropic SDK."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or ANTHROPIC_API_KEY
        self.model = model or ANTHROPIC_MODEL
        if not self.api_key:
            log.warning(
                "ANTHROPIC_API_KEY not set — AIService will fail on use"
            )
        self.client = AsyncAnthropic(api_key=self.api_key) if self.api_key else None

    # ----------------------------------------------------------------
    # Intent classification (fallback when keywords don't match)
    # ----------------------------------------------------------------
    async def classify_intent(self, message: str) -> str:
        """
        Classify a message into one of the known Intent values.

        Returns one of:
            WISMO, RETURN_REQUEST, ORDER_CONFIRM, UPSELL,
            ABANDONED_CART, GENERAL.
        """
        if not self.client:
            return "GENERAL"

        prompt = (
            "Classify the customer message into exactly one of these labels:\n"
            "WISMO, RETURN_REQUEST, ORDER_CONFIRM, UPSELL, "
            "ABANDONED_CART, GENERAL.\n"
            "Reply with only the single label, nothing else.\n\n"
            f"Message:\n{message}"
        )
        try:
            resp = await self.client.messages.create(
                model=self.model,
                max_tokens=10,
                messages=[{"role": "user", "content": prompt}],
            )
            label = (resp.content[0].text or "").strip().upper()
            log.debug("AI intent classification → %s", label)
            return label
        except Exception:
            log.exception("Claude classify_intent failed")
            return "GENERAL"

    # ----------------------------------------------------------------
    # Brand-aware reply generation
    # ----------------------------------------------------------------
    async def generate_response(
        self,
        tenant,
        history: list[dict[str, Any]],
        user_message: str,
        extra_context: str | None = None,
    ) -> str:
        """
        Generate a single reply for the customer.

        - `tenant` drives brand voice + guardrails
        - `history` is the rolling Redis history (role/content/ts)
        - `extra_context` is appended to the system prompt (e.g. order info)
        """
        if not self.client:
            return "آسف، الخدمة مش متاحة دلوقتي. هنرجع نتواصل معاك قريب."

        system_prompt = build_system_prompt(tenant)
        if extra_context:
            system_prompt += f"\n\n=== CONTEXT ===\n{extra_context}\n"

        # Convert our history records into Anthropic's message format.
        messages: list[dict[str, str]] = []
        for h in history[-10:]:  # last 10 turns is plenty
            role = h.get("role")
            content = h.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message})

        try:
            resp = await self.client.messages.create(
                model=self.model,
                max_tokens=400,
                system=system_prompt,
                messages=messages,
            )
            raw = resp.content[0].text if resp.content else ""
        except Exception:
            log.exception("Claude generate_response failed")
            raw = ""

        check = validate_response(raw, tenant)
        return check.safe_text or raw

    # ----------------------------------------------------------------
    # Payment receipt verification (multimodal)
    # ----------------------------------------------------------------
    async def verify_receipt(
        self,
        image_bytes: bytes,
        media_type: str,
        expected_amount: float,
        expected_recipient: str,
    ) -> dict[str, Any]:
        """
        Ask Claude to inspect a payment-receipt screenshot.

        Returns:
            {
              "valid": bool,
              "amount": float | None,
              "recipient": str | None,
              "reference": str | None,
              "reason": str
            }
        """
        if not self.client:
            return {"valid": False, "reason": "ai_unavailable"}

        instructions = (
            "You are verifying an Egyptian e-payment receipt screenshot "
            "(InstaPay or Vodafone Cash).\n\n"
            f"Expected amount: {expected_amount} EGP\n"
            f"Expected recipient (phone or wallet): {expected_recipient}\n\n"
            "Return ONLY valid JSON with this shape:\n"
            "{\n"
            '  "valid": true/false,\n'
            '  "amount": number or null,\n'
            '  "recipient": string or null,\n'
            '  "reference": string or null,\n'
            '  "reason": short string explaining decision\n'
            "}\n"
            "Mark valid=true only if amount matches (±1 EGP) and recipient "
            "matches the expected phone/wallet."
        )

        try:
            b64 = base64.b64encode(image_bytes).decode("ascii")
            resp = await self.client.messages.create(
                model=self.model,
                max_tokens=300,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": b64,
                                },
                            },
                            {"type": "text", "text": instructions},
                        ],
                    }
                ],
            )
            text = resp.content[0].text if resp.content else "{}"
            return _parse_json_loose(text)
        except Exception:
            log.exception("Claude verify_receipt failed")
            return {"valid": False, "reason": "ai_error"}


def _parse_json_loose(text: str) -> dict[str, Any]:
    """Extract a JSON object from a text response, tolerating markdown fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Strip ```json ... ``` fences.
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Attempt to find the first {...} block.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                pass
        return {"valid": False, "reason": "unparseable_response"}
