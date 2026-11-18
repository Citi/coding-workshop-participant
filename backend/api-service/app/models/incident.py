from datetime import datetime

from sqlalchemy import (
    BigInteger, Computed, DateTime, FetchedValue, ForeignKey, Identity, String, Text, false, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.enums import (
    HistoryEvent, IncidentCategory, IncidentPriority, IncidentStatus,
    category_t, history_event_t, priority_t, status_t,
)
from app.models.facility import Building, Floor, Seat
from app.models.user import User


class Incident(Base):
    __tablename__ = "incidents"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reference: Mapped[str] = mapped_column(
        String(20), Computed("'INC-' || lpad(id::text, 6, '0')", persisted=True)
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[IncidentCategory] = mapped_column(category_t)
    priority: Mapped[IncidentPriority] = mapped_column(priority_t)
    status: Mapped[IncidentStatus] = mapped_column(status_t, server_default=IncidentStatus.OPEN.value)

    reported_by_id: Mapped[int] = mapped_column("reported_by", ForeignKey("users.id"))
    assigned_engineer_id: Mapped[int | None] = mapped_column(ForeignKey("engineer_profiles.user_id"))
    assigned_by_id: Mapped[int | None] = mapped_column("assigned_by", ForeignKey("users.id"))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"))
    floor_id: Mapped[int | None] = mapped_column(BigInteger)  # composite FK (floor, building) in DB
    seat_id: Mapped[int | None] = mapped_column(BigInteger)   # composite FK (seat, floor) in DB
    location_details: Mapped[str | None] = mapped_column(String(255))

    requested_priority: Mapped[IncidentPriority | None] = mapped_column(priority_t)
    is_escalated: Mapped[bool] = mapped_column(server_default=false())
    escalation_reason: Mapped[str | None] = mapped_column(Text)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    building: Mapped[Building] = relationship()
    floor: Mapped[Floor | None] = relationship(
        primaryjoin="Incident.floor_id == Floor.id", foreign_keys=[floor_id], viewonly=True
    )
    seat: Mapped[Seat | None] = relationship(
        primaryjoin="Incident.seat_id == Seat.id", foreign_keys=[seat_id], viewonly=True
    )
    reporter: Mapped[User] = relationship(foreign_keys=[reported_by_id])
    engineer: Mapped[User | None] = relationship(
        primaryjoin="Incident.assigned_engineer_id == User.id",
        foreign_keys=[assigned_engineer_id],
        viewonly=True,
    )
    notes: Mapped[list["IncidentNote"]] = relationship(
        back_populates="incident",
        order_by="IncidentNote.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,  # DB's ON DELETE CASCADE removes notes
    )
    history: Mapped[list["IncidentHistory"]] = relationship(
        order_by="[IncidentHistory.created_at, IncidentHistory.id]", viewonly=True
    )


class IncidentNote(Base):
    __tablename__ = "incident_notes"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    is_internal: Mapped[bool] = mapped_column(server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )

    incident: Mapped[Incident] = relationship(back_populates="notes")
    author: Mapped[User] = relationship()


class IncidentHistory(Base):
    """Rows are written by the log_incident_changes() trigger, never by the app."""

    __tablename__ = "incident_history"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    event_type: Mapped[HistoryEvent] = mapped_column(history_event_t)
    from_value: Mapped[str | None] = mapped_column(String(100))
    to_value: Mapped[str | None] = mapped_column(String(100))
    comment: Mapped[str | None] = mapped_column(Text)
    changed_by_id: Mapped[int | None] = mapped_column("changed_by", ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    actor: Mapped[User | None] = relationship()
