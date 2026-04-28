"""Product model — mirrors Shopify products for the AI to recommend."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Product(Base):
    __tablename__ = "products"
    
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "shopify_product_id",
            name="uq_product_tenant_shopify_id",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    shopify_product_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    product_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str | None] = mapped_column(String(40), nullable=True)  # active, draft, archived
    
    price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    inventory_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
    tenant: Mapped["Tenant"] = relationship(back_populates="products")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Product id={self.id} title={self.title!r} price={self.price}>"
