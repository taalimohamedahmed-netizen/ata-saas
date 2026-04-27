"""
WhatsApp Business API webhook routes.

Endpoints:
  GET  /webhook/whatsapp/{tenant_id}  → Meta verification handshake
  POST /webhook/whatsapp/{tenant_id}  → Inbound messages

Inbound flow:
  1. Load tenant by URL
  2. Upsert customer by (tenant_id, phone)
  3. Load Redis session
  4. Classify intent (current flow takes priority)
  5. Dispatch to the right handler
  6. Send the reply via WhatsApp
  7. Log the conversation in Postgres
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.intent_classifier import Intent, IntentClassifier
from core.session_manager import SessionManager
from handlers.brand_handler import BrandHandler
from handlers.order_handler import OrderHandler
from handlers.revenue_handler import RevenueHandler
from handlers.support_handler import SupportHandler
from models.conversation import Conversation, Platform
from models.customer import Customer
from models.tenant import Tenant
from services.ai_service import AIService
from services.whatsapp_service import WhatsAppService

log = logging.getLogger("ata.routes.whatsapp")
router = APIRouter()


# ============================================================
# GET — verification handshake
# ============================================================
@router.get("/whatsapp/{tenant_id}")
async def verify_whatsapp(
    tenant_id: int,
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    db: AsyncSession = Depends(get_db),
):
    """
    Meta calls this with `hub.mode=subscribe` to verify the webhook.

    Echo back hub.challenge if the verify token matches the tenant's
    configured one (or the global one in env).
    """
    if hub_mode != "subscribe" or not hub_challenge:
        raise HTTPException(status_code=400, detail="bad_request")

    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    expected = (
        tenant.whatsapp_verify_token
        or os.getenv("WHATSAPP_VERIFY_TOKEN", "")
    )
    if not expected or hub_verify_token != expected:
        raise HTTPException(status_code=403, detail="invalid_verify_token")

    # Meta requires the raw challenge string back (not JSON).
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(hub_challenge)


# ============================================================
# POST — inbound messages
# ============================================================
@router.post("/whatsapp/{tenant_id}", status_code=200)
async def whatsapp_webhook(
    tenant_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Receive messages from Meta and route them to the right handler."""
    tenant_row = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant: Tenant | None = tenant_row.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    try:
        body = await request.json()
    except Exception:
        log.exception("WhatsApp webhook: invalid JSON tenant=%s", tenant_id)
        raise HTTPException(status_code=400, detail="invalid_json")

    # Iterate change/value/messages — Meta batches messages.
    for entry in body.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value") or {}
            for msg in value.get("messages", []) or []:
                try:
                    await _process_message(tenant, msg, db)
                except Exception:
                    log.exception(
                        "Failed to process WhatsApp message tenant=%s", tenant.id
                    )

    return {"status": "ok"}


# ============================================================
# Per-message processing
# ============================================================
async def _process_message(tenant: Tenant, msg: dict[str, Any], db: AsyncSession) -> None:
    """Handle a single inbound message dict from Meta."""
    phone = msg.get("from")
    if not phone:
        log.warning("WhatsApp message missing 'from' tenant=%s", tenant.id)
        return

    msg_type = msg.get("type", "text")
    text, meta = _extract_text_and_meta(msg, msg_type)

    # Upsert customer
    customer = await _upsert_customer(db, tenant.id, phone)

    # Load session + record incoming text
    session = await SessionManager.get(tenant.id, phone)
    if text:
        await SessionManager.append_history(tenant.id, phone, "user", text)
        session = await SessionManager.get(tenant.id, phone)

    # ----- Classify intent (mid-flow takes priority) -----
    ai = AIService()
    classifier = IntentClassifier(ai_service=ai)
    intent = await classifier.classify(text or "", session_context=session)

    # ----- Dispatch -----
    reply: str
    if (
        intent == Intent.ORDER_CONFIRM
        or session.get("current_flow") == "ORDER_CONFIRM"
    ):
        reply = await OrderHandler(ai_service=ai).handle(
            tenant=tenant,
            customer=customer,
            message=text or "",
            message_meta=meta,
            session=session,
            db=db,
        )
    elif intent in (Intent.WISMO, Intent.RETURN_REQUEST):
        reply = await SupportHandler(ai_service=ai).handle(
            tenant, customer, text or "", intent, session
        )
    elif intent in (Intent.UPSELL, Intent.ABANDONED_CART):
        reply = await RevenueHandler(ai_service=ai).handle(
            tenant, customer, text or "", intent, session
        )
    else:
        reply = await BrandHandler(ai_service=ai).handle(
            tenant, customer, text or "", session
        )

    # ----- Send reply -----
    try:
        wa = WhatsAppService(tenant)
        await wa.send_text(to=phone, body=reply)
    except Exception:
        log.exception(
            "Failed to send WhatsApp reply tenant=%s phone=%s",
            tenant.id, phone,
        )

    # ----- Persist for analytics -----
    await SessionManager.append_history(tenant.id, phone, "assistant", reply)
    await _record_conversation(db, tenant.id, customer.id, session, intent)


def _extract_text_and_meta(
    msg: dict[str, Any], msg_type: str
) -> tuple[str, dict[str, Any]]:
    """
    Pull the user-visible text + structured metadata out of a Meta message.

    Meta represents button replies, image messages, etc. with different
    payload shapes — flatten them here so handlers don't have to care.
    """
    if msg_type == "text":
        return msg.get("text", {}).get("body", "") or "", {"type": "text"}

    if msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        kind = interactive.get("type")
        if kind == "button_reply":
            br = interactive.get("button_reply") or {}
            return br.get("title") or "", {
                "type": "button",
                "button_id": br.get("id", ""),
            }
        if kind == "list_reply":
            lr = interactive.get("list_reply") or {}
            return lr.get("title") or "", {
                "type": "list",
                "list_id": lr.get("id", ""),
            }
        return "", {"type": "interactive"}

    if msg_type == "image":
        image = msg.get("image") or {}
        return (
            image.get("caption") or "",
            {
                "type": "image",
                "media_id": image.get("id", ""),
                "mime_type": image.get("mime_type", "image/jpeg"),
            },
        )

    if msg_type == "button":
        # Older button format (template replies)
        button = msg.get("button") or {}
        return button.get("text", "") or "", {
            "type": "button",
            "button_id": button.get("payload", ""),
        }

    # Audio / document / location / contacts → treat as plain text fallback.
    return "", {"type": msg_type}


async def _upsert_customer(
    db: AsyncSession, tenant_id: int, phone: str
) -> Customer:
    """Find or create the (tenant_id, phone) customer row."""
    phone = "".join(ch for ch in phone if ch.isdigit())
    result = await db.execute(
        select(Customer).where(
            Customer.tenant_id == tenant_id,
            Customer.phone == phone,
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        customer = Customer(tenant_id=tenant_id, phone=phone)
        db.add(customer)
        await db.commit()
        await db.refresh(customer)
    return customer


async def _record_conversation(
    db: AsyncSession,
    tenant_id: int,
    customer_id: int,
    session: dict[str, Any],
    intent: Intent,
) -> None:
    """Persist the latest flow snapshot to the conversations table."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.customer_id == customer_id,
            Conversation.platform == Platform.WHATSAPP,
        )
    )
    convo = result.scalar_one_or_none()
    snapshot = {
        "last_intent": intent.value,
        "history_tail": session.get("history", [])[-6:],
    }
    if convo is None:
        convo = Conversation(
            tenant_id=tenant_id,
            customer_id=customer_id,
            platform=Platform.WHATSAPP,
            current_flow=session.get("current_flow"),
            current_step=session.get("current_step"),
            context=snapshot,
        )
        db.add(convo)
    else:
        convo.current_flow = session.get("current_flow")
        convo.current_step = session.get("current_step")
        convo.context = snapshot
    await db.commit()
