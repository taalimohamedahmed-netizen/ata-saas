"""
Tenant model — every other table in the system has FK → tenants.id.

A tenant is a single merchant account. Their Shopify store, WhatsApp
number, brand voice, and Egyptian payment numbers all live here.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class TenantPlan(str, enum.Enum):
    BASIC = "basic"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ----- Account -----
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(180), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    plan: Mapped[TenantPlan] = mapped_column(
        Enum(TenantPlan, name="tenant_plan"),
        default=TenantPlan.BASIC,
        nullable=False,
    )

    # ----- Shopify -----
    shopify_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    shopify_domain: Mapped[str | None] = mapped_column(String(180), nullable=True)
    shopify_webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shopify_webhook_orders_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shopify_webhook_products_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shopify_webhook_customers_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shopify_connected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    shopify_client_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    shopify_client_secret: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted

    # ----- WhatsApp Business API -----
    whatsapp_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_phone_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    whatsapp_phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    whatsapp_waba_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    whatsapp_verify_token: Mapped[str | None] = mapped_column(String(120), nullable=True)
    whatsapp_connected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ----- Brand -----
    brand_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    brand_tone: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brand_policies: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ----- Egyptian payments -----
    instapay_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    vodafone_number: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # ----- AI provider (optional OpenRouter override) -----
    openrouter_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted
    ai_model: Mapped[str | None] = mapped_column(String(120), nullable=True)  # e.g. openai/gpt-4o-mini

    # ----- Status -----
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ----- Relationships -----
    customers: Mapped[list["Customer"]] = relationship(  # noqa: F821
        back_populates="tenant", cascade="all, delete-orphan", lazy="selectin"
    )
    products: Mapped[list["Product"]] = relationship(  # noqa: F821
        back_populates="tenant", cascade="all, delete-orphan", lazy="selectin"
    )
    orders: Mapped[list["Order"]] = relationship(  # noqa: F821
        back_populates="tenant", cascade="all, delete-orphan", lazy="selectin"
    )
    conversations: Mapped[list["Conversation"]] = relationship(  # noqa: F821
        back_populates="tenant", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Tenant id={self.id} name={self.name!r} plan={self.plan}>"
