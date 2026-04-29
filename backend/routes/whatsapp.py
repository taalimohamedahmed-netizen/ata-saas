"""
WhatsApp Business API (Meta Cloud API) webhook routes.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
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

# Cap the persisted history per conversation. Inbox UI needs enough to render
# the chat thread even when Redis is unavailable.
HISTORY_TAIL_LIMIT = 50


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
    log.info("Meta verification attempt for tenant_id=%s mode=%s", tenant_id, hub_mode)
    if hub_mode != "subscribe" or not hub_challenge:
        raise HTTPException(status_code=400, detail="bad_request")

    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        log.warning("Verification failed: tenant_id=%s not found", tenant_id)
        raise HTTPException(status_code=404, detail="tenant_not_found")

    expected = tenant.whatsapp_verify_token or os.getenv("WHATSAPP_VERIFY_TOKEN", "")
    if not expected or hub_verify_token != expected:
        log.warning("Verification failed: token mismatch for tenant_id=%s", tenant_id)
        raise HTTPException(status_code=403, detail="invalid_verify_token")

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
    log.info("WhatsApp webhook received for tenant_id=%s", tenant_id)
    tenant_row = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant: Tenant | None = tenant_row.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        log.warning("Webhook rejected: tenant %s not found or inactive", tenant_id)
        raise HTTPException(status_code=404, detail="tenant_not_found")

    try:
        body = await request.json()
        log.debug("WhatsApp payload: %s", body)
    except Exception:
        log.exception("WhatsApp webhook: invalid JSON")
        raise HTTPException(status_code=400, detail="invalid_json")

    # Meta batches messages
    for entry in body.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value") or {}
            
            # Handle messages
            for msg in value.get("messages", []) or []:
                try:
                    await _process_message(tenant, msg, db)
                except Exception:
                    log.exception("Failed to process message for tenant %s", tenant.id)
            
            # Handle statuses (delivered, read, etc) - useful for logging later
            for status in value.get("statuses", []) or []:
                log.info("Message status update: %s -> %s", status.get("id"), status.get("status"))

    return {"status": "ok"}


# ============================================================
# Per-message processing
# ============================================================
async def _process_message(tenant: Tenant, msg: dict[str, Any], db: AsyncSession) -> None:
    phone = msg.get("from")
    if not phone:
        log.warning("Inbound message has no 'from' field — skipping")
        return

    msg_type = msg.get("type", "text")
    text_content, meta = _extract_text_and_meta(msg, msg_type)
    log.info("Processing %s from %s for tenant=%s: %s", msg_type, phone, tenant.id, text_content[:50])

    # 1. Ensure customer exists
    customer = await _upsert_customer(db, tenant.id, phone)
    log.info("Customer resolved: id=%s phone=%s", customer.id, customer.phone)

    user_message_text = text_content or f"[{msg_type}]"

    # 2. Persist the user's message immediately — inbox shows it even if AI fails.
    await SessionManager.append_history(tenant.id, phone, "user", user_message_text)
    session = await SessionManager.get(tenant.id, phone)
    await _record_conversation(
        db, tenant.id, customer.id, session,
        Intent.GENERAL,
        new_message={"role": "user", "content": user_message_text},
    )

    # 2b. Check if AI is paused — human takes over, no auto-reply.
    if await _is_ai_paused(db, tenant.id, customer.id):
        log.info("AI paused for tenant=%s customer=%s — skipping auto-reply", tenant.id, customer.id)
        return

    # 3. Classification & Dispatch
    reply = "عذراً، حدث خطأ ما. يرجى المحاولة لاحقاً."
    intent = Intent.GENERAL

    try:
        ai = AIService(tenant=tenant)
        classifier = IntentClassifier(ai_service=ai)
        intent = await classifier.classify(text_content or "", session_context=session)
        log.info("Classified intent: %s", intent)

        if intent == Intent.ORDER_CONFIRM or session.get("current_flow") == "ORDER_CONFIRM":
            reply = await OrderHandler(ai_service=ai).handle(
                tenant=tenant, customer=customer, message=text_content or "",
                message_meta=meta, session=session, db=db,
            )
        elif intent in (Intent.WISMO, Intent.RETURN_REQUEST):
            reply = await SupportHandler(ai_service=ai).handle(tenant, customer, text_content or "", intent, session)
        elif intent in (Intent.UPSELL, Intent.ABANDONED_CART):
            reply = await RevenueHandler(ai_service=ai).handle(tenant, customer, text_content or "", intent, session)
        else:
            reply = await BrandHandler(ai_service=ai).handle(tenant, customer, text_content or "", session)
    except Exception:
        log.exception("AI Processing failed — using default error reply")

    # 4. Send reply
    if not reply or not reply.strip():
        reply = "عذراً، حدث خطأ ما. يرجى المحاولة لاحقاً."

    send_ok = False
    try:
        wa = WhatsAppService(tenant)
        await wa.send_text(to=phone, body=reply)
        send_ok = True
    except Exception:
        log.exception("Failed to send WhatsApp reply")

    if send_ok:
        await SessionManager.append_history(tenant.id, phone, "assistant", reply)
        session = await SessionManager.get(tenant.id, phone)

    # 5. Finalize conversation record — persist the assistant reply in DB too.
    await _record_conversation(
        db, tenant.id, customer.id, session, intent,
        new_message={"role": "assistant", "content": reply} if send_ok else None,
    )


def _extract_text_and_meta(msg: dict[str, Any], msg_type: str) -> tuple[str, dict[str, Any]]:
    if msg_type == "text":
        return msg.get("text", {}).get("body", "") or "", {"type": "text"}
    if msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        kind = interactive.get("type")
        if kind == "button_reply":
            br = interactive.get("button_reply") or {}
            return br.get("title") or "", {"type": "button", "button_id": br.get("id", "")}
        if kind == "list_reply":
            lr = interactive.get("list_reply") or {}
            return lr.get("title") or "", {"type": "list", "list_id": lr.get("id", "")}
    if msg_type == "image":
        image = msg.get("image") or {}
        return image.get("caption") or "", {"type": "image", "media_id": image.get("id", "")}
    return "", {"type": msg_type}


async def _is_ai_paused(db: AsyncSession, tenant_id: int, customer_id: int) -> bool:
    """Return True if the merchant has paused the AI for this conversation."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.tenant_id == tenant_id, Conversation.customer_id == customer_id)
        .limit(1)
    )
    convo = result.scalar_one_or_none()
    return bool(convo and convo.ai_paused)


async def _upsert_customer(db: AsyncSession, tenant_id: int, phone: str) -> Customer:
    phone = "".join(ch for ch in phone if ch.isdigit())
    result = await db.execute(select(Customer).where(Customer.tenant_id == tenant_id, Customer.phone == phone))
    customer = result.scalar_one_or_none()
    if customer is None:
        customer = Customer(tenant_id=tenant_id, phone=phone, name=f"Customer {phone[-4:]}")
        db.add(customer)
        await db.flush()
    return customer


async def _record_conversation(
    db: AsyncSession,
    tenant_id: int,
    customer_id: int,
    session: dict[str, Any],
    intent: Intent,
    new_message: dict[str, str] | None = None,
) -> None:
    """
    Persist the conversation snapshot to the DB.

    History is the union of:
      - what's already stored in `conversations.context.history_tail` (DB-truth)
      - what's in Redis session (if available)
      - the new_message just observed (if provided)

    This guarantees the inbox shows the full chat thread even when Redis is down.
    """
    # Look up existing conversation (and its persisted history) first
    try:
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.tenant_id == tenant_id,
                Conversation.customer_id == customer_id,
            )
            .order_by(Conversation.updated_at.desc())
            .limit(1)
        )
        convo = result.scalar_one_or_none()
    except Exception:
        log.exception("Failed to query conversations table for tenant=%s customer=%s", tenant_id, customer_id)
        await db.rollback()
        convo = None

    # ── Merge histories ─────────────────────────────────────────────
    persisted_history: list[dict[str, Any]] = []
    if convo and isinstance(convo.context, dict):
        existing_tail = convo.context.get("history_tail") or []
        if isinstance(existing_tail, list):
            persisted_history = [m for m in existing_tail if isinstance(m, dict)]

    redis_history = session.get("history") or []
    if not isinstance(redis_history, list):
        redis_history = []

    # Use the longer source of history as the base.
    base_history = redis_history if len(redis_history) > len(persisted_history) else persisted_history

    history: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for m in base_history:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role", ""))
        content = str(m.get("content", ""))
        key = (role, content)
        if not role or not content or key in seen:
            continue
        seen.add(key)
        history.append({"role": role, "content": content, "ts": m.get("ts")})

    # Append the brand-new message (avoid exact duplicate of last entry)
    if new_message:
        nm_role = str(new_message.get("role", ""))
        nm_content = str(new_message.get("content", ""))
        if nm_role and nm_content:
            last = history[-1] if history else None
            if not last or last.get("role") != nm_role or last.get("content") != nm_content:
                history.append({
                    "role": nm_role,
                    "content": nm_content,
                    "ts": datetime.now(timezone.utc).isoformat(),
                })

    history = history[-HISTORY_TAIL_LIMIT:]

    snapshot = {
        "last_intent": intent.value if hasattr(intent, "value") else str(intent),
        "history_tail": history,
    }

    try:
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
            log.info("Created new conversation tenant=%s customer=%s", tenant_id, customer_id)
        else:
            convo.current_flow = session.get("current_flow") or convo.current_flow
            convo.current_step = session.get("current_step") or convo.current_step
            convo.context = snapshot
            convo.updated_at = datetime.now(timezone.utc)

        await db.commit()
    except Exception:
        log.exception("Failed to persist conversation for tenant=%s customer=%s", tenant_id, customer_id)
        await db.rollback()
