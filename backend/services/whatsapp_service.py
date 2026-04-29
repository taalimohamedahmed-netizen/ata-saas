"""
WhatsApp Business API (Meta Cloud API) client, per-tenant.

Each tenant brings their own:
  - whatsapp_token           (system user / app token)
  - whatsapp_phone_id        (numeric phone number ID)

Usage:
    wa = WhatsAppService(tenant)
    await wa.send_text(to="201001234567", body="Hello!")
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from core.encryption import decrypt

log = logging.getLogger("ata.whatsapp")

WHATSAPP_API_BASE = os.getenv(
    "WHATSAPP_API_BASE",
    "https://graph.facebook.com/v21.0",
)
DEFAULT_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


class WhatsAppService:
    """Async WhatsApp Cloud API client scoped to a single tenant."""

    def __init__(self, tenant):
        if not tenant.whatsapp_token or not tenant.whatsapp_phone_id:
            raise ValueError(
                f"Tenant {tenant.id} is not connected to WhatsApp"
            )
        
        # Token is stored encrypted in DB
        plain_token = decrypt(tenant.whatsapp_token)
        
        self.tenant = tenant
        self.base = (
            f"{WHATSAPP_API_BASE}/{tenant.whatsapp_phone_id}/messages"
        )
        self.headers = {
            "Authorization": f"Bearer {plain_token}",
            "Content-Type": "application/json",
        }

    # ----------------------------------------------------------------
    # Internals
    # ----------------------------------------------------------------
    async def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            resp = await client.post(
                self.base, headers=self.headers, json=payload
            )
        if resp.status_code >= 400:
            log.error(
                "WhatsApp send failed (%s): %s",
                resp.status_code, resp.text[:400],
            )
            resp.raise_for_status()
        return resp.json()

    # ----------------------------------------------------------------
    # Public sending API
    # ----------------------------------------------------------------
    async def send_text(self, to: str, body: str) -> dict[str, Any]:
        """Send a plain text message."""
        return await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"preview_url": False, "body": body[:4096]},
            }
        )

    async def send_buttons(
        self,
        to: str,
        body: str,
        buttons: list[dict[str, str]],
    ) -> dict[str, Any]:
        """
        Send an interactive reply-button message.

        `buttons` example:
            [
              {"id": "pay_cod",       "title": "Cash on Delivery"},
              {"id": "pay_instapay",  "title": "InstaPay"},
              {"id": "pay_vodafone",  "title": "Vodafone Cash"},
            ]
        """
        return await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {"text": body[:1024]},
                    "action": {
                        "buttons": [
                            {
                                "type": "reply",
                                "reply": {
                                    "id": b["id"],
                                    "title": b["title"][:20],
                                },
                            }
                            for b in buttons[:3]  # WhatsApp max = 3
                        ]
                    },
                },
            }
        )

    async def send_image(
        self,
        to: str,
        image_url: str,
        caption: str | None = None,
    ) -> dict[str, Any]:
        """Send an image by URL with an optional caption."""
        body: dict[str, Any] = {"link": image_url}
        if caption:
            body["caption"] = caption[:1024]
        return await self._post(
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "image",
                "image": body,
            }
        )

    # ----------------------------------------------------------------
    # Media download (for receipt verification)
    # ----------------------------------------------------------------
    async def fetch_media(self, media_id: str) -> tuple[bytes, str]:
        """
        Download a media payload by ID.

        Returns (image_bytes, mime_type).
        """
        # Step 1: get the media URL
        meta_url = f"{WHATSAPP_API_BASE}/{media_id}"
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            meta = await client.get(meta_url, headers=self.headers)
            meta.raise_for_status()
            meta_json = meta.json()
            media_url = meta_json.get("url")
            mime = meta_json.get("mime_type", "image/jpeg")
            if not media_url:
                raise ValueError("WhatsApp media meta missing 'url'")

            # Step 2: download bytes (still requires bearer auth)
            blob = await client.get(media_url, headers=self.headers)
            blob.raise_for_status()
            return blob.content, mime
