"""Order model — mirrors the parts of a Shopify order ATA needs."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"          # received from Shopify, awaiting WhatsApp
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    AWAITING_RECEIPT = "AWAITING_RECEIPT"
    CONFIRMED = "CONFIRMED"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class PaymentMethod(str, enum.Enum):
    COD = "COD"
    INSTAPAY = "INSTAPAY"
    VODAFONE_CASH = "VODAFONE_CASH"


class Order(Base):
    __tablename__ = "orders"
    # A Shopify order ID is unique within a tenant's store.
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "shopify_order_id",
            name="uq_order_tenant_shopify_id",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    shopify_order_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    shopify_order_number: Mapped[str | None] = mapped_column(String(60), nullable=True)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"),
        default=OrderStatus.PENDING,
        nullable=False,
    )

    total_price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="EGP", nullable=False)

    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="payment_method"),
        nullable=True,
    )
    payment_receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ----- Relationships -----
    tenant: Mapped["Tenant"] = relationship(back_populates="orders")  # noqa: F821
    customer: Mapped["Customer | None"] = relationship(  # noqa: F821
        back_populates="orders"
    )

    def __repr__(self) -> str:
        return (
            f"<Order id={self.id} tenant={self.tenant_id} "
            f"shopify={self.shopify_order_id} status={self.status}>"
        )
