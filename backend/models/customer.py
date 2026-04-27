"""Customer model — one row per (tenant, phone) pair."""

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


class CustomerSegment(str, enum.Enum):
    """Segment used by the AI to tailor tone + offers."""
    NEW = "NEW"
    VIP = "VIP"
    AT_RISK = "AT_RISK"


class Customer(Base):
    __tablename__ = "customers"
    # Same phone can exist in two tenants — uniqueness is per-tenant.
    __table_args__ = (
        UniqueConstraint("tenant_id", "phone", name="uq_customer_tenant_phone"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    segment: Mapped[CustomerSegment] = mapped_column(
        Enum(CustomerSegment, name="customer_segment"),
        default=CustomerSegment.NEW,
        nullable=False,
    )

    total_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_spent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    last_order_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ----- Relationships -----
    tenant: Mapped["Tenant"] = relationship(back_populates="customers")  # noqa: F821
    orders: Mapped[list["Order"]] = relationship(  # noqa: F821
        back_populates="customer", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(  # noqa: F821
        back_populates="customer", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Customer id={self.id} tenant={self.tenant_id} "
            f"phone={self.phone!r} segment={self.segment}>"
        )
