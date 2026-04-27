"""
Conversation model — durable record of an ongoing chat with a customer.

Note: short-term, fast-mutating state (current step, last message, etc.)
lives in Redis via `core.session_manager`. This table is the long-term
audit log + analytics source.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Platform(str, enum.Enum):
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    platform: Mapped[Platform] = mapped_column(
        Enum(Platform, name="conversation_platform"),
        default=Platform.WHATSAPP,
        nullable=False,
    )

    current_flow: Mapped[str | None] = mapped_column(String(60), nullable=True)
    current_step: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # Free-form JSON for handler-specific state, persisted snapshots, etc.
    context: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ----- Relationships -----
    tenant: Mapped["Tenant"] = relationship(  # noqa: F821
        back_populates="conversations"
    )
    customer: Mapped["Customer"] = relationship(  # noqa: F821
        back_populates="conversations"
    )

    def __repr__(self) -> str:
        return (
            f"<Conversation id={self.id} tenant={self.tenant_id} "
            f"customer={self.customer_id} flow={self.current_flow}>"
        )
