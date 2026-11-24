"""Response models for the analytics endpoints and the project risk detail.

Conventions (CONTRACT section 4): money is ``Decimal`` and serializes as a
string such as ``"400000.00"``; percentages are JSON numbers with one decimal
place, or ``null`` when undefined (no planned budget); risk scores and loads
are integers; dates are ISO ``YYYY-MM-DD`` strings.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator
from pydantic_core import PydanticCustomError

from app.schemas.audit_logs import AuditLogOut
from app.schemas.common import ResponseModel

RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
CapacityStatus = Literal["OVER_ALLOCATED", "FULLY_ALLOCATED", "AVAILABLE"]

# Exactly four, two and two ASCII digits; the calendar check is left to the date parser.
_ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def require_iso_date_text(value: Any) -> Any:
    """Accept text only in the ``YYYY-MM-DD`` form before it is parsed as a date.

    Without this check Pydantic's lax mode would read ``0`` as 1970-01-01 (a Unix
    timestamp) and accept full datetimes. Non-text values pass through unchanged.
    """
    if isinstance(value, str) and not _ISO_DATE.fullmatch(value):
        raise PydanticCustomError("date_format", "Use the YYYY-MM-DD format, for example 2026-11-25.")
    return value


#: A calendar date written as ``YYYY-MM-DD`` (query parameters ``as_of``, ``from`` and ``to``).
IsoDate = Annotated[date, BeforeValidator(require_iso_date_text)]


# --- Risk (spec section 9.4) -----------------------------------------------------------------------


class RiskFactorOut(ResponseModel):
    """One risk factor: the points it scored out of its maximum and a one-line summary."""

    key: str
    label: str
    points: int
    max_points: int
    detail: str


class ImpactedDeliverableOut(ResponseModel):
    """A deliverable put at risk by a blocked or overdue deliverable upstream of it.

    ``depth`` counts the edges from the root cause (1 = direct successor) and
    ``caused_by`` is the root cause's title.
    """

    id: int
    title: str
    depth: int
    caused_by: str


class ProjectRiskOut(ResponseModel):
    """``GET /projects/{id}/risk``: the spec section 9.4 risk detail plus ``project_name``."""

    project_id: int
    project_name: str
    risk_score: int
    risk_level: RiskLevel
    as_of: date
    factors: list[RiskFactorOut]
    evidence: list[str]
    impacted_deliverables: list[ImpactedDeliverableOut]
    recommended_actions: list[str]


class RiskSummaryOut(ResponseModel):
    """One project in the portfolio risk ranking; ``headline`` is its first evidence line."""

    project_id: int
    project_name: str
    department_name: str
    status: str
    risk_score: int
    risk_level: RiskLevel
    factors: list[RiskFactorOut]
    headline: str


class RiskListOut(ResponseModel):
    """``GET /analytics/risk``: every project, highest score first."""

    as_of: date
    items: list[RiskSummaryOut]


# --- Budget (spec section 9.3) ---------------------------------------------------------------------


class ProjectBudgetOut(ResponseModel):
    """Spend against plan and progress for one project.

    ``utilization_pct`` and ``divergence_pp`` (utilization minus completion, in
    percentage points) are ``null`` when the planned budget is zero.
    """

    project_id: int
    project_name: str
    department_id: int
    department_name: str
    status: str
    planned_budget: Decimal
    actual_spend: Decimal
    remaining: Decimal
    utilization_pct: float | None
    completion_pct: float
    divergence_pp: float | None


class DepartmentBudgetOut(ResponseModel):
    """Planned and actual spend summed over a department's projects.

    ``completion_pct`` is the projects' completion weighted by planned budget.
    """

    department_id: int
    department_name: str
    planned_budget: Decimal
    actual_spend: Decimal
    remaining: Decimal
    utilization_pct: float | None
    completion_pct: float


class BudgetTotalsOut(ResponseModel):
    """Planned and actual spend summed over the whole portfolio."""

    planned_budget: Decimal
    actual_spend: Decimal
    remaining: Decimal
    utilization_pct: float | None


class BudgetAnalyticsOut(ResponseModel):
    """``GET /analytics/budget``: per-project and per-department rollups plus portfolio totals."""

    as_of: date
    projects: list[ProjectBudgetOut]
    departments: list[DepartmentBudgetOut]
    totals: BudgetTotalsOut


# --- Capacity (spec section 9.2) -------------------------------------------------------------------


class SegmentOut(ResponseModel):
    """A date range (both ends inclusive) in which one person's active allocations do not change."""

    start_date: date
    end_date: date
    load: int
    allocation_ids: list[int]


class ConflictAllocationOut(ResponseModel):
    """An allocation that contributes to a conflict window, with its own (unclipped) dates."""

    id: int
    project_id: int
    project_name: str
    deliverable_id: int | None
    deliverable_title: str | None
    allocation_percentage: int
    start_date: date
    end_date: date


class ConflictOut(ResponseModel):
    """A window in which one person is allocated above 100%, with the allocations behind it."""

    start_date: date
    end_date: date
    load: int
    allocations: list[ConflictAllocationOut]


class BottleneckDeliverableOut(ResponseModel):
    """A root-cause or impacted deliverable that an over-allocated person is responsible for."""

    id: int
    title: str
    project_id: int


class EmployeeCapacityOut(ResponseModel):
    """One person's load: peak, load on ``as_of``, status, segments and conflict windows.

    ``is_compound_bottleneck`` is true when the person has a conflict that has
    not ended by ``as_of`` and is the assignee of, or allocated to, a root-cause
    or impacted deliverable (listed in ``bottleneck_deliverables``).
    """

    user_id: int
    user_name: str
    department_id: int | None
    peak_load: int
    current_load: int
    status: CapacityStatus
    segments: list[SegmentOut]
    conflicts: list[ConflictOut]
    is_compound_bottleneck: bool
    bottleneck_deliverables: list[BottleneckDeliverableOut]


class CapacityOut(ResponseModel):
    """``GET /analytics/capacity``: every allocated person, ordered by name."""

    as_of: date
    employees: list[EmployeeCapacityOut]
    over_allocated_count: int


# --- Dashboard -------------------------------------------------------------------------------------


class BudgetSummaryOut(ResponseModel):
    """Portfolio budget totals for the dashboard tiles."""

    planned_total: Decimal
    spent_total: Decimal
    remaining_total: Decimal
    utilization_pct: float | None


class DepartmentSpendOut(ResponseModel):
    """Planned against spent for one department (the dashboard's department chart)."""

    department_id: int
    department_name: str
    planned_budget: Decimal
    actual_spend: Decimal


class TopRiskOut(ResponseModel):
    """One of the highest-scoring projects; ``headline`` is its first evidence line."""

    project_id: int
    project_name: str
    risk_score: int
    risk_level: RiskLevel
    headline: str


class DashboardOut(ResponseModel):
    """``GET /analytics/dashboard``: portfolio counts, budget totals, top risks and recent activity.

    ``recent_activity`` holds the latest audit events, in the same shape as
    ``GET /audit-logs`` items, for ADMIN and PM callers; it is always an empty
    list for LEAD and VIEWER (spec section 7).
    """

    as_of: date
    total_projects: int
    projects_by_status: dict[str, int]
    risk_by_level: dict[str, int]
    budget: BudgetSummaryOut
    departments: list[DepartmentSpendOut]
    over_allocated_count: int
    top_risks: list[TopRiskOut]
    recent_activity: list[AuditLogOut]
