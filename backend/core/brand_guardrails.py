"""
Brand guardrails — keep AI responses on-brand and on-policy per tenant.

Two responsibilities:

1. `build_system_prompt(tenant)` — produce the system prompt the AI must
   use for *this* tenant: name, tone, language, allowed topics, hard
   policies (returns/shipping/etc.).

2. `validate_response(text, tenant)` — sanity check the AI output before
   it's sent to the customer. Catches obvious failure modes:
     - empty / placeholder responses
     - leaking competitor brand names
     - revealing internal prompts / "as an AI" leakage
     - violating banned phrases declared in tenant.brand_policies
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

log = logging.getLogger("ata.guardrails")


# Phrases that indicate the model is breaking character / leaking prompt.
_LEAKAGE_PATTERNS = [
    r"\bas an ai\b",
    r"\bi am an ai\b",
    r"\blanguage model\b",
    r"\bsystem prompt\b",
    r"\bopenai\b",
    r"\banthropic\b",
    r"\bclaude\b",
]
_LEAKAGE_RE = re.compile("|".join(_LEAKAGE_PATTERNS), re.IGNORECASE)


@dataclass
class GuardrailResult:
    """Outcome of validating a candidate response."""
    ok: bool
    reason: str | None = None
    safe_text: str | None = None


def build_system_prompt(tenant) -> str:
    """
    Compose the system prompt for the AI based on tenant configuration.

    `tenant` is a `models.tenant.Tenant` ORM instance.
    """
    brand_name = tenant.brand_name or tenant.name or "the store"
    tone = tenant.brand_tone or "friendly, helpful, concise"
    policies = tenant.brand_policies or "Standard e-commerce policies apply."
    custom_prompt = tenant.ai_system_prompt or ""

    prompt = (
        f"You are the official customer service assistant for {brand_name}.\n"
        f"Tone: {tone}.\n"
        f"You speak both Arabic (Egyptian dialect) and English — match the "
        f"customer's language.\n\n"
        f"=== BRAND POLICIES ===\n{policies}\n\n"
    )

    if custom_prompt:
        prompt += f"=== CUSTOM INSTRUCTIONS ===\n{custom_prompt}\n\n"

    prompt += (
        f"=== HARD RULES ===\n"
        f"- Never invent product details, prices, stock, or shipping times. "
        f"If you do not know, say so and offer to escalate.\n"
        f"- Never mention you are an AI, a language model, OpenAI, "
        f"Anthropic, or Claude.\n"
        f"- Never recommend competitors.\n"
        f"- Never make promises that contradict the brand policies above.\n"
        f"- Keep replies short (≤ 3 sentences) unless the customer asks for "
        f"more detail.\n"
        f"- Always be respectful, even if the customer is rude.\n"
    )
    return prompt


def validate_response(text: str, tenant) -> GuardrailResult:
    """
    Inspect a candidate response. Returns a GuardrailResult describing
    whether it passes; if not, `safe_text` is a fallback to use instead.
    """
    if not text or not text.strip():
        return GuardrailResult(
            ok=False,
            reason="empty_response",
            safe_text="آسف، حصل خطأ بسيط. ممكن تعيد رسالتك؟",
        )

    if _LEAKAGE_RE.search(text):
        log.warning("Guardrails: AI leakage detected, replacing response")
        return GuardrailResult(
            ok=False,
            reason="ai_identity_leak",
            safe_text=(
                f"أهلاً! أنا مساعد {tenant.brand_name or tenant.name}. "
                f"كيف ممكن أساعدك؟"
            ),
        )

    # Tenant-defined banned phrases (one per line in brand_policies, prefixed
    # with "BANNED:"). Example policy line: "BANNED: refund within 24h"
    banned: list[str] = []
    for line in (tenant.brand_policies or "").splitlines():
        line = line.strip()
        if line.upper().startswith("BANNED:"):
            phrase = line.split(":", 1)[1].strip()
            if phrase:
                banned.append(phrase)

    for phrase in banned:
        if phrase.lower() in text.lower():
            log.warning("Guardrails: banned phrase '%s' detected", phrase)
            return GuardrailResult(
                ok=False,
                reason=f"banned_phrase:{phrase}",
                safe_text=(
                    "هحوّلك لفريق خدمة العملاء عشان يساعدك في ده. "
                    "لحظة من فضلك."
                ),
            )

    # Length sanity: WhatsApp soft caps around 4096 chars.
    if len(text) > 3500:
        return GuardrailResult(ok=True, safe_text=text[:3500] + "…")

    return GuardrailResult(ok=True, safe_text=text)
