"""Python mirrors of the PostgreSQL enum types defined in schema.sql."""

import enum

from sqlalchemy.dialects.postgresql import ENUM


class UserRole(enum.StrEnum):
    EMPLOYEE = "employee"
    FACILITY_ADMIN = "facility_admin"
    ENGINEER = "engineer"


class EngineerAvailability(enum.StrEnum):
    AVAILABLE = "available"
    BUSY = "busy"
    ON_LEAVE = "on_leave"
    OFFLINE = "offline"


class IncidentCategory(enum.StrEnum):
    ELECTRICAL = "electrical"
    PLUMBING = "plumbing"
    HVAC = "hvac"
    FURNITURE = "furniture"
    CLEANING = "cleaning"
    SECURITY = "security"
    IT_HARDWARE = "it_hardware"
    NETWORK = "network"
    AUDIO_VISUAL = "audio_visual"
    OTHER = "other"


class IncidentPriority(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

    @property
    def rank(self) -> int:
        return list(IncidentPriority).index(self)


class IncidentStatus(enum.StrEnum):
    OPEN = "open"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    RESOLVED = "resolved"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class HistoryEvent(enum.StrEnum):
    CREATED = "created"
    STATUS_CHANGE = "status_change"
    ASSIGNMENT = "assignment"
    PRIORITY_CHANGE = "priority_change"
    PRIORITY_REQUEST = "priority_request"
    ESCALATION = "escalation"


# Statuses where work is finished and the ticket is read-only for most users
FINAL_STATUSES = {IncidentStatus.CLOSED, IncidentStatus.CANCELLED}
# Statuses that count toward an engineer's workload
ACTIVE_STATUSES = {IncidentStatus.ASSIGNED, IncidentStatus.IN_PROGRESS, IncidentStatus.ON_HOLD}


def pg_enum(py_enum: type[enum.Enum], name: str) -> ENUM:
    """Map a Python enum onto an existing PostgreSQL enum type (never created here)."""
    return ENUM(
        py_enum,
        name=name,
        create_type=False,
        values_callable=lambda e: [m.value for m in e],
    )


user_role_t = pg_enum(UserRole, "user_role")
availability_t = pg_enum(EngineerAvailability, "engineer_availability")
category_t = pg_enum(IncidentCategory, "incident_category")
priority_t = pg_enum(IncidentPriority, "incident_priority")
status_t = pg_enum(IncidentStatus, "incident_status")
history_event_t = pg_enum(HistoryEvent, "history_event")
