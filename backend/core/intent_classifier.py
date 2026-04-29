"""
Intent classification for incoming WhatsApp messages.

Decides which handler should respond:
  WISMO            → SupportHandler  ("where is my order")
  RETURN_REQUEST   → SupportHandler  (return/exchange/refund)
  ORDER_CONFIRM    → OrderHandler    (payment / receipt / confirmation)
  UPSELL           → RevenueHandler  (cross-sell, recommendations)
  ABANDONED_CART   → RevenueHandler  (cart recovery)
  GENERAL          → BrandHandler    (chitchat, brand questions)

Strategy: a fast keyword pre-filter (covers common Arabic + English
phrases) catches the easy cases; ambiguous messages fall back to Claude
for a single-token classification.
"""

from __future__ import annotations

import logging
import re
from enum import Enum
from typing import Any

log = logging.getLogger("ata.intent")


class Intent(str, Enum):
    WISMO = "WISMO"
    RETURN_REQUEST = "RETURN_REQUEST"
    ORDER_CONFIRM = "ORDER_CONFIRM"
    UPSELL = "UPSELL"
    ABANDONED_CART = "ABANDONED_CART"
    GENERAL = "GENERAL"


# Intent → list of regex patterns. Arabic + English mix on purpose.
_KEYWORDS: dict[Intent, list[str]] = {
    Intent.WISMO: [
        r"\bwhere.*order\b",
        r"\btrack(ing)?\b",
        r"\bshipment\b",
        r"\bdeliver(y|ed)?\b",
        r"فين.*طلب",
        r"الشحن",
        r"الشحنة",
        r"وصل",
    ],
    Intent.RETURN_REQUEST: [
        r"\breturn\b",
        r"\brefund\b",
        r"\bexchange\b",
        r"مرتجع",
        r"استرجاع",
        r"استبدال",
    ],
    Intent.ORDER_CONFIRM: [
        r"\bconfirm\b",
        r"\breceipt\b",
        r"\bpayment\b",
        r"\binstapay\b",
        r"\bvodafone\s*cash\b",
        r"تأكيد",
        r"تاكيد",           # without hamza (common Egyptian spelling)
        r"\bاكد\b",          # imperative verb "confirm"
        r"\bأكد\b",          # imperative verb with hamza
        r"عاوز.*اكد",       # "want to confirm"
        r"عايز.*اكد",
        r"عاوز.*أكد",
        r"عايز.*أكد",
        r"اكدلي",            # "confirm for me"
        r"اكدلى",
        r"أكدلي",
        r"إيصال",
        r"ايصال",
        r"دفع",
        r"حوالة",
    ],
    Intent.ABANDONED_CART: [
        r"\bcart\b",
        r"\bcheckout\b",
        r"السلة",
        r"العربة",
    ],
    Intent.UPSELL: [
        r"\brecommend\b",
        r"\bsuggest\b",
        r"\bbest\s*seller\b",
        r"تنصح",
        r"اقترح",
    ],
}

_COMPILED: dict[Intent, list[re.Pattern[str]]] = {
    intent: [re.compile(p, re.IGNORECASE) for p in patterns]
    for intent, patterns in _KEYWORDS.items()
}


class IntentClassifier:
    """
    Classify an inbound message into an `Intent`.

    Tries fast keyword matching first. If nothing matches and an AI
    service is provided, falls back to Claude for classification.
    """

    def __init__(self, ai_service: Any | None = None):
        # ai_service is optional so unit tests can run without Anthropic.
        self.ai_service = ai_service

    async def classify(
        self,
        message: str,
        session_context: dict | None = None,
    ) -> Intent:
        """Return the most likely Intent for the given message."""
        text = (message or "").strip()
        if not text:
            return Intent.GENERAL

        # If the user is mid-flow (e.g. waiting for a payment receipt),
        # stay in that flow regardless of keywords.
        if session_context:
            current_flow = session_context.get("current_flow")
            if current_flow == "ORDER_CONFIRM":
                return Intent.ORDER_CONFIRM
            if current_flow == "RETURN_REQUEST":
                return Intent.RETURN_REQUEST

        # Keyword pass: first match wins, in priority order.
        priority = [
            Intent.ORDER_CONFIRM,
            Intent.RETURN_REQUEST,
            Intent.WISMO,
            Intent.ABANDONED_CART,
            Intent.UPSELL,
        ]
        for intent in priority:
            for pattern in _COMPILED[intent]:
                if pattern.search(text):
                    log.debug("Keyword matched %s for: %s", intent, text[:60])
                    return intent

        # AI fallback.
        if self.ai_service is not None:
            try:
                ai_intent = await self.ai_service.classify_intent(text)
                if ai_intent in Intent.__members__:
                    return Intent(ai_intent)
            except Exception:
                log.exception("AI intent classification failed; using GENERAL")

        return Intent.GENERAL
