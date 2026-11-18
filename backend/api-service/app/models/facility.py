from datetime import datetime

from sqlalchemy import BigInteger, DateTime, FetchedValue, ForeignKey, Identity, Integer, String, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Building(Base):
    __tablename__ = "buildings"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(server_default=true())
    created_by_id: Mapped[int | None] = mapped_column("created_by", ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )

    floors: Mapped[list["Floor"]] = relationship(
        back_populates="building", order_by="Floor.floor_number", passive_deletes=True
    )


class Floor(Base):
    __tablename__ = "floors"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"))
    floor_number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )

    building: Mapped[Building] = relationship(back_populates="floors")
    seats: Mapped[list["Seat"]] = relationship(
        back_populates="floor", order_by="Seat.seat_code", passive_deletes=True
    )


class Seat(Base):
    __tablename__ = "seats"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    floor_id: Mapped[int] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"))
    seat_code: Mapped[str] = mapped_column(String(30))
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )

    floor: Mapped[Floor] = relationship(back_populates="seats")
