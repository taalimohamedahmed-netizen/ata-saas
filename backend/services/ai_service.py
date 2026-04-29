"""
AI wrapper — supports Anthropic Claude (default) and OpenRouter.

If a tenant has `openrouter_api_key` set, all calls go through OpenRouter
using their OpenAI-compatible endpoint. Otherwise falls back to Anthropic.

Usage:
    ai = AIService(tenant=tenant)
    text = await ai.generate_response(tenant, history, user_message)

Or tenant-less (uses global env vars):
    ai = AIService()
"""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

import httpx

from core.brand_guardrails import build_system_prompt, validate_response
from core.encryption import decrypt

log = logging.getLogger("ata.ai")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=5.0)

# Models the merchant can pick from in the Settings UI
AVAILABLE_MODELS = [
    {"id": "openai/gpt-4o-mini",                "label": "GPT-4o Mini (سريع وزهيد)"},
    {"id": "openai/gpt-4o",                      "label": "GPT-4o (أقوى)"},
    {"id": "anthropic/claude-3-5-haiku",         "label": "Claude 3.5 Haiku (سريع)"},
    {"id": "anthropic/claude-3-5-sonnet",        "label": "Claude 3.5 Sonnet (ذكي)"},
    {"id": "google/gemini-flash-1.5",            "label": "Gemini Flash 1.5"},
    {"id": "meta-llama/llama-3.1-8b-instruct",  "label": "Llama 3.1 8B (مجاني)"},
]


class AIService:
    """
    Provider-agnostic async AI client.

    Priority order:
      1. tenant.openrouter_api_key  → OpenRouter (any model)
      2. ANTHROPIC_API_KEY env var  → Anthropic Claude
    """

    def __init__(self, tenant=None, api_key: str | None = None, model: str | None = None):
        self._openrouter_key: str | None = None
        self._anthropic_key: str | None = None
        self._model: str = model or ANTHROPIC_MODEL

        if tenant is not None:
            raw_or_key = getattr(tenant, "openrouter_api_key", None)
            if raw_or_key:
                self._openrouter_key = decrypt(raw_or_key)
                self._model = getattr(tenant, "ai_model", None) or "openai/gpt-4o-mini"

        if not self._openrouter_key:
            self._anthropic_key = api_key or ANTHROPIC_API_KEY
            if not self._anthropic_key:
                log.warning("No AI key configured — AIService will use fallback replies")

    # ----------------------------------------------------------------
    # Internal dispatch
    # ----------------------------------------------------------------
    @property
    def _uses_openrouter(self) -> bool:
        return bool(self._openrouter_key)

    async def _chat(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int = 400,
    ) -> str:
        if self._uses_openrouter:
            return await self._openrouter_chat(system, messages, max_tokens)
        if self._anthropic_key:
            return await self._anthropic_chat(system, messages, max_tokens)
        return ""

    async def _openrouter_chat(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, *messages],
        }
        headers = {
            "Authorization": f"Bearer {self._openrouter_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("FRONTEND_URL", "https://saas.ataproject.cloud"),
            "X-Title": "ATA SaaS",
        }
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.post(
                f"{OPENROUTER_BASE}/chat/completions",
                headers=headers,
                json=payload,
            )
        if resp.status_code >= 400:
            log.error("OpenRouter error %s: %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        data = resp.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""

    async def _anthropic_chat(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> str:
        try:
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=self._anthropic_key)
            resp = await client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            )
            return resp.content[0].text if resp.content else ""
        except Exception:
            log.exception("Anthropic call failed")
            return ""

    # ----------------------------------------------------------------
    # Intent classification
    # ----------------------------------------------------------------
    async def classify_intent(self, message: str) -> str:
        if not self._openrouter_key and not self._anthropic_key:
            return "GENERAL"
        prompt = (
            "Classify the customer message into exactly one of these labels:\n"
            "WISMO, RETURN_REQUEST, ORDER_CONFIRM, UPSELL, ABANDONED_CART, GENERAL.\n"
            "Reply with only the single label, nothing else.\n\n"
            f"Message:\n{message}"
        )
        try:
            result = await self._chat(
                system="You are an e-commerce intent classifier. Reply with one word only.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=10,
            )
            label = (result or "").strip().upper()
            log.debug("AI intent → %s", label)
            return label
        except Exception:
            log.exception("classify_intent failed")
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
        if not self._openrouter_key and not self._anthropic_key:
            return "آسف، خدمة الذكاء الاصطناعي مش متاحة دلوقتي."

        system_prompt = build_system_prompt(tenant)
        if extra_context:
            system_prompt += f"\n\n=== CONTEXT ===\n{extra_context}\n"

        messages: list[dict[str, str]] = []
        for h in history[-14:]: # Increased to 14 messages (7 turns)
            role = h.get("role")
            content = h.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message})

        try:
            raw = await self._chat(system_prompt, messages, max_tokens=400)
        except Exception:
            log.exception("generate_response failed")
            raw = ""

        check = validate_response(raw, tenant)
        return check.safe_text or raw

    # ----------------------------------------------------------------
    # Payment receipt verification (multimodal — Anthropic only for now)
    # ----------------------------------------------------------------
    async def verify_receipt(
        self,
        image_bytes: bytes,
        media_type: str,
        expected_amount: float,
        expected_recipient: str,
    ) -> dict[str, Any]:
        if not self._anthropic_key:
            return {"valid": False, "reason": "ai_unavailable"}

        instructions = (
            "You are verifying an Egyptian e-payment receipt screenshot "
            "(InstaPay or Vodafone Cash).\n\n"
            f"Expected amount: {expected_amount} EGP\n"
            f"Expected recipient (phone or wallet): {expected_recipient}\n\n"
            "Return ONLY valid JSON:\n"
            '{"valid": true/false, "amount": number|null, "recipient": string|null,'
            ' "reference": string|null, "reason": string}\n'
            "Mark valid=true only if amount matches (±1 EGP) and recipient matches."
        )
        try:
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=self._anthropic_key)
            b64 = base64.b64encode(image_bytes).decode("ascii")
            resp = await client.messages.create(
                model=self._model,
                max_tokens=300,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                        {"type": "text", "text": instructions},
                    ],
                }],
            )
            text = resp.content[0].text if resp.content else "{}"
            return _parse_json_loose(text)
        except Exception:
            log.exception("verify_receipt failed")
            return {"valid": False, "reason": "ai_error"}


def _parse_json_loose(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start: end + 1])
            except json.JSONDecodeError:
                pass
    return {"valid": False, "reason": "unparseable_response"}
