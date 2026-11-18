from datetime import datetime

from sqlalchemy import DateTime, FetchedValue, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.enums import EngineerAvailability, availability_t, category_t
from app.models.user import User


class EngineerProfile(Base):
    __tablename__ = "engineer_profiles"
    __mapper_args__ = {"eager_defaults": True}

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    specializations: Mapped[list[str]] = mapped_column(ARRAY(category_t), server_default="{}")
    availability: Mapped[EngineerAvailability] = mapped_column(
        availability_t, server_default=EngineerAvailability.AVAILABLE.value
    )
    max_active_tickets: Mapped[int] = mapped_column(Integer, server_default="5")
    home_building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column("created_by", ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )

    user: Mapped[User] = relationship(foreign_keys=[user_id])
