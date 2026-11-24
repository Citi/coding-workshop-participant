"""SQLAlchemy 2 ORM models mirroring ``db/schema.sql``.

``schema.sql`` is the source of truth for the DDL; these classes only map the
tables for the ORM and are never used to create tables.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

ROLES = ("ADMIN", "PM", "LEAD", "VIEWER")
PROJECT_STATUSES = ("PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED")
DELIVERABLE_STATUSES = ("NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE")
BUDGET_CATEGORIES = ("LABOR", "SOFTWARE", "HARDWARE", "VENDOR", "TRAVEL", "OTHER")
AUDIT_ACTIONS = ("CREATE", "UPDATE", "DELETE")


class Base(DeclarativeBase):
    """Declarative base for every portfolio model."""


class Department(Base):
    """An organisational unit that owns projects and groups users."""

    __tablename__ = "departments"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class User(Base):
    """A person who signs in and/or is allocated to work."""

    __tablename__ = "users"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False, server_default="VIEWER")
    department_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    department: Mapped[Department | None] = relationship(lazy="joined")


class Project(Base):
    """A funded piece of work owned by a department and run by a PM."""

    __tablename__ = "projects"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    project_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    department_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False
    )
    project_manager_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default="PLANNED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    department: Mapped[Department] = relationship(lazy="joined")
    project_manager: Mapped[User | None] = relationship(lazy="joined")


class Deliverable(Base):
    """A dated output of a project with an owner, progress and status."""

    __tablename__ = "deliverables"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    completion_percentage: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default="NOT_STARTED")
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[Project] = relationship(lazy="joined")
    assigned_user: Mapped[User | None] = relationship(lazy="joined")


class DeliverableDependency(Base):
    """A directed edge: the successor cannot finish before the predecessor."""

    __tablename__ = "deliverable_dependencies"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    predecessor_deliverable_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("deliverables.id", ondelete="CASCADE"), nullable=False
    )
    successor_deliverable_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("deliverables.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    predecessor: Mapped[Deliverable] = relationship(foreign_keys=[predecessor_deliverable_id], lazy="joined")
    successor: Mapped[Deliverable] = relationship(foreign_keys=[successor_deliverable_id], lazy="joined")


class ResourceAllocation(Base):
    """A share of a person's time assigned to a project for a date range."""

    __tablename__ = "resource_allocations"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    deliverable_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("deliverables.id", ondelete="SET NULL"), nullable=True
    )
    allocation_percentage: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user: Mapped[User] = relationship(lazy="joined")
    project: Mapped[Project] = relationship(lazy="joined")
    deliverable: Mapped[Deliverable | None] = relationship(lazy="joined")


class BudgetEntry(Base):
    """An amount spent on a project; actual spend is the sum of these."""

    __tablename__ = "budget_entries"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    project: Mapped[Project] = relationship(lazy="joined")


class AuditLog(Base):
    """One append-only record of a create, update or delete (enforced by a trigger)."""

    __tablename__ = "audit_logs"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    action: Mapped[str] = mapped_column(String(10), nullable=False)
    before_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


ALL_TABLES = (
    "audit_logs",
    "budget_entries",
    "resource_allocations",
    "deliverable_dependencies",
    "deliverables",
    "projects",
    "users",
    "departments",
)
