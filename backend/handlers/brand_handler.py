"""
Brand handler — generic conversational replies on the tenant's brand voice.

Used as the catch-all when no other intent fires (GENERAL).
"""

from __future__ import annotations

import logging
from typing import Any

from services.ai_service import AIService

log = logging.getLogger("ata.handlers.brand")


class BrandHandler:
    """Brand-aware general conversation handler."""

    def __init__(self, ai_service: AIService | None = None):
        self.ai = ai_service or AIService()

    async def handle(
        self,
        tenant,
        customer,
        message: str,
        session: dict[str, Any],
    ) -> str:
        """Generate an on-brand reply with no extra context beyond history."""
        return await self.ai.generate_response(
            tenant=tenant,
            history=session.get("history", []),
            user_message=message,
            extra_context=None,
        )
