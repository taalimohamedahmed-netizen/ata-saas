"""Setup Agent — Claude tool-use agent that helps tenants configure ATA."""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from core.encryption import decrypt, encrypt
from models.tenant import Tenant

log = logging.getLogger("ata.setup_agent")

_ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")
_JWT_SECRET = os.getenv("JWT_SECRET", "change-me")

_SHOPIFY_SCOPES = "read_orders,write_orders,read_products,write_products,read_customers,write_customers"
_SHOPIFY_CALLBACK = f"{_APP_BASE_URL}/integrations/shopify/oauth/callback"

SYSTEM_PROMPT = """\
أنت مساعد إعداد ذكي لمنصة ATA — منصة أتمتة خدمة عملاء التجارة الإلكترونية.

مهمتك مساعدة العميل في إعداد حسابه بطريقة سهلة وودية.
تستطيع تنفيذ إجراءات حقيقية مثل ربط Shopify وWhatsApp وتحديث الإعدادات.

قواعد:
- تحدث بالعربية دائماً
- اسأل عن معلومة واحدة في كل مرة
- قبل تنفيذ أي إجراء حساس (مثل قطع الاتصال)، تأكد من العميل أولاً
- عند الحاجة لبيانات، اشرح لماذا تحتاجها وأين يجدها
- عند ربط Shopify بنجاح، أخبر العميل أنه سيُفتح رابط في المتصفح لإتمام التفويض
"""

_TOOLS = [
    {
        "name": "get_integration_status",
        "description": "جلب الحالة الحالية لجميع عمليات الربط: Shopify و WhatsApp و AI",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "start_shopify_connection",
        "description": "بدء ربط Shopify OAuth. يحتاج نطاق المتجر وبيانات التطبيق من Shopify Partners.",
        "input_schema": {
            "type": "object",
            "properties": {
                "shop_domain": {"type": "string", "description": "نطاق المتجر مثل: yourstore.myshopify.com"},
                "client_id": {"type": "string", "description": "Client ID من Shopify Partners"},
                "client_secret": {"type": "string", "description": "Client Secret من Shopify Partners"},
            },
            "required": ["shop_domain", "client_id", "client_secret"],
        },
    },
    {
        "name": "disconnect_shopify",
        "description": "قطع اتصال Shopify وحذف بيانات الربط",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "connect_whatsapp",
        "description": "ربط حساب WhatsApp Business API مباشرة",
        "input_schema": {
            "type": "object",
            "properties": {
                "waba_id": {"type": "string", "description": "WhatsApp Business Account ID من Meta"},
                "phone_number_id": {"type": "string", "description": "Phone Number ID من Meta"},
                "phone_number": {"type": "string", "description": "رقم الهاتف (أرقام فقط، مثال: 201012345678)"},
                "access_token": {"type": "string", "description": "Access Token الدائم من Meta"},
            },
            "required": ["waba_id", "phone_number_id", "phone_number", "access_token"],
        },
    },
    {
        "name": "disconnect_whatsapp",
        "description": "قطع اتصال WhatsApp",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "update_ai_settings",
        "description": "تحديث إعدادات الذكاء الاصطناعي (OpenRouter API Key أو نموذج AI)",
        "input_schema": {
            "type": "object",
            "properties": {
                "openrouter_api_key": {"type": "string", "description": "OpenRouter API Key"},
                "ai_model": {"type": "string", "description": "اسم النموذج مثل: openai/gpt-4o-mini"},
            },
            "required": [],
        },
    },
]


class SetupAgentService:
    def __init__(self, db: AsyncSession, tenant: Tenant):
        self._db = db
        self._tenant = tenant
        self._client = AsyncAnthropic(api_key=_ANTHROPIC_KEY)
        self._redirect_url: str | None = None

    async def chat(
        self,
        user_message: str,
        history: list[dict[str, Any]],
    ) -> dict[str, Any]:
        messages: list[dict[str, Any]] = [*history, {"role": "user", "content": user_message}]

        for _ in range(6):
            resp = await self._client.messages.create(
                model=_MODEL,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=_TOOLS,
                messages=messages,
            )

            if resp.stop_reason == "end_turn":
                text = ""
                for block in resp.content:
                    if hasattr(block, "text"):
                        text = block.text
                        break
                return {"reply": text, "redirect_url": self._redirect_url}

            if resp.stop_reason != "tool_use":
                break

            # Append assistant turn then execute tools
            messages.append({"role": "assistant", "content": resp.content})
            tool_results = []
            for block in resp.content:
                if block.type == "tool_use":
                    result = await self._execute_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "user", "content": tool_results})

        return {"reply": "حدث خطأ غير متوقع، حاول مرة أخرى.", "redirect_url": None}

    async def _execute_tool(self, name: str, inputs: dict[str, Any]) -> str:
        try:
            match name:
                case "get_integration_status":
                    return self._status_summary()
                case "start_shopify_connection":
                    return await self._start_shopify(inputs)
                case "disconnect_shopify":
                    return await self._disconnect_shopify()
                case "connect_whatsapp":
                    return await self._connect_whatsapp(inputs)
                case "disconnect_whatsapp":
                    return await self._disconnect_whatsapp()
                case "update_ai_settings":
                    return await self._update_ai_settings(inputs)
                case _:
                    return f"أداة غير معروفة: {name}"
        except Exception as exc:
            log.exception("Tool %s failed", name)
            return f"فشل تنفيذ العملية: {exc}"

    # ----------------------------------------------------------------
    # Tools
    # ----------------------------------------------------------------

    def _status_summary(self) -> str:
        t = self._tenant
        shopify_ok = bool(t.shopify_domain and t.shopify_token)
        wa_ok = bool(t.whatsapp_token and t.whatsapp_phone_id)
        ai_model = t.ai_model or "افتراضي"
        has_ai_key = bool(t.openrouter_api_key)

        lines = [
            f"Shopify: {'✅ متصل (' + t.shopify_domain + ')' if shopify_ok else '❌ غير متصل'}",
            f"WhatsApp: {'✅ متصل (' + (t.whatsapp_phone_number or '') + ')' if wa_ok else '❌ غير متصل'}",
            f"نموذج AI: {ai_model}",
            f"OpenRouter API Key: {'✅ موجود' if has_ai_key else '❌ غير موجود'}",
        ]
        return "\n".join(lines)

    async def _start_shopify(self, inputs: dict) -> str:
        from jose import jwt as jose_jwt

        shop = inputs["shop_domain"].strip().lower().removesuffix("/")
        if not shop.endswith(".myshopify.com"):
            return "خطأ: النطاق يجب أن يكون بصيغة yourstore.myshopify.com"

        t = self._tenant
        t.shopify_client_id = inputs["client_id"].strip()
        t.shopify_client_secret = encrypt(inputs["client_secret"].strip())
        await self._db.commit()

        state = jose_jwt.encode(
            {
                "tenant_id": t.id,
                "shop": shop,
                "nonce": secrets.token_hex(8),
                "exp": int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp()),
            },
            _JWT_SECRET,
            algorithm="HS256",
        )
        params = {
            "client_id": inputs["client_id"].strip(),
            "scope": _SHOPIFY_SCOPES,
            "redirect_uri": _SHOPIFY_CALLBACK,
            "state": state,
        }
        auth_url = f"https://{shop}/admin/oauth/authorize?{urlencode(params)}"
        self._redirect_url = auth_url
        return f"تم حفظ البيانات بنجاح. رابط تفويض Shopify جاهز. سيُفتح في المتصفح."

    async def _disconnect_shopify(self) -> str:
        t = self._tenant
        for attr in [
            "shopify_domain", "shopify_token", "shopify_client_id",
            "shopify_client_secret", "shopify_webhook_secret",
            "shopify_webhook_orders_id", "shopify_webhook_products_id",
            "shopify_webhook_customers_id", "shopify_connected_at",
        ]:
            setattr(t, attr, None)
        await self._db.commit()
        return "تم قطع اتصال Shopify بنجاح وحذف جميع بيانات الربط."

    async def _connect_whatsapp(self, inputs: dict) -> str:
        t = self._tenant
        if not t.whatsapp_verify_token:
            t.whatsapp_verify_token = secrets.token_hex(24)
        t.whatsapp_waba_id = inputs["waba_id"]
        t.whatsapp_phone_id = inputs["phone_number_id"]
        t.whatsapp_phone_number = inputs["phone_number"]
        t.whatsapp_token = encrypt(inputs["access_token"])
        t.whatsapp_connected_at = datetime.now(timezone.utc)
        await self._db.commit()
        webhook_url = f"{_APP_BASE_URL}/webhook/whatsapp/{t.id}"
        return (
            f"تم ربط WhatsApp بنجاح!\n"
            f"Webhook URL: {webhook_url}\n"
            f"Verify Token: {t.whatsapp_verify_token}\n"
            f"أضف هذه البيانات في إعدادات Meta Developer Console."
        )

    async def _disconnect_whatsapp(self) -> str:
        t = self._tenant
        for attr in [
            "whatsapp_waba_id", "whatsapp_phone_id", "whatsapp_phone_number",
            "whatsapp_token", "whatsapp_verify_token", "whatsapp_connected_at",
        ]:
            setattr(t, attr, None)
        await self._db.commit()
        return "تم قطع اتصال WhatsApp بنجاح."

    async def _update_ai_settings(self, inputs: dict) -> str:
        t = self._tenant
        changed: list[str] = []
        if inputs.get("openrouter_api_key"):
            t.openrouter_api_key = encrypt(inputs["openrouter_api_key"].strip())
            changed.append("OpenRouter API Key")
        if inputs.get("ai_model"):
            t.ai_model = inputs["ai_model"].strip()
            changed.append(f"نموذج AI → {t.ai_model}")
        if changed:
            await self._db.commit()
            return "تم التحديث: " + "، ".join(changed)
        return "لم يتم تحديد أي إعدادات للتغيير."
