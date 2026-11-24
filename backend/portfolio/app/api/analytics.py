"""Analytics routes (``/analytics/*``) and the per-project risk detail (``GET /projects/{id}/risk``).

Every signed-in role can read them (spec section 7); a request without a valid
access token gets 401. Each request loads the portfolio once and runs the
engines once (``services.analytics.analyze``); nothing is stored. ``as_of``
(``YYYY-MM-DD``, default today's UTC date) is the date the analysis is made for.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.api.deps import today_utc
from app.db.models import User
from app.db.session import get_db
from app.errors import ValidationFailed
from app.schemas.analytics import (
    BudgetAnalyticsOut,
    CapacityOut,
    DashboardOut,
    IsoDate,
    ProjectRiskOut,
    RiskListOut,
)
from app.schemas.departments import MAX_ID
from app.security import MANAGERS, get_current_user
from app.services import analytics as service

router = APIRouter(tags=["analytics"])

#: Roles that see recent activity on the dashboard: only they may read the audit log (spec section 7).
AUDIT_READERS: tuple[str, ...] = MANAGERS

AsOf = Annotated[
    IsoDate | None,
    Query(description="Date to analyse as of, YYYY-MM-DD. Default: today's UTC date."),
]
ProjectId = Annotated[int, Path(ge=1, le=MAX_ID, description="Project id.")]


@router.get("/analytics/dashboard", response_model=DashboardOut)
def get_dashboard(
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardOut:
    """Portfolio counts by status and risk level, budget totals, departments, top risks, recent activity.

    ``recent_activity`` lists the last 10 audit events for ADMIN and PM; for
    LEAD and VIEWER it is always empty and the audit log is not queried.
    """
    analysis = service.analyze(db, as_of or today_utc())
    events = service.recent_activity(db) if user.role in AUDIT_READERS else []
    return service.dashboard(analysis, events)


@router.get("/analytics/capacity", response_model=CapacityOut)
def get_capacity(
    department_id: Annotated[
        int | None, Query(ge=1, le=MAX_ID, description="Only people in this department.")
    ] = None,
    window_from: Annotated[
        IsoDate | None, Query(alias="from", description="First day of the window (inclusive), YYYY-MM-DD.")
    ] = None,
    window_to: Annotated[
        IsoDate | None, Query(alias="to", description="Last day of the window (inclusive), YYYY-MM-DD.")
    ] = None,
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CapacityOut:
    """Per-person peak load, load on ``as_of``, conflict windows and compound-bottleneck flag.

    ``from`` and ``to`` restrict every figure to that window (either may be
    left out); ``from`` after ``to`` is a 400.
    """
    if window_from is not None and window_to is not None and window_from > window_to:
        raise ValidationFailed(
            "The window is empty: 'from' must be on or before 'to'.",
            details=[
                {
                    "field": "from",
                    "issue": f"{window_from.isoformat()} is after 'to' ({window_to.isoformat()}).",
                }
            ],
        )
    analysis = service.analyze(db, as_of or today_utc())
    return service.capacity_overview(
        analysis, department_id=department_id, window_from=window_from, window_to=window_to
    )


@router.get("/analytics/budget", response_model=BudgetAnalyticsOut)
def get_budget(
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BudgetAnalyticsOut:
    """Planned, spent, remaining, utilization and completion per project and per department, plus totals."""
    return service.budget_overview(service.analyze(db, as_of or today_utc()))


@router.get("/analytics/risk", response_model=RiskListOut)
def get_risk(
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> RiskListOut:
    """Risk summary of every project (score, level, factors, headline), highest score first."""
    return service.risk_ranking(service.analyze(db, as_of or today_utc()))


@router.get("/projects/{project_id}/risk", response_model=ProjectRiskOut, tags=["projects"])
def get_project_risk(
    project_id: ProjectId,
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProjectRiskOut:
    """Full risk detail of one project: factors, evidence, impacted deliverables, actions; 404 if unknown."""
    return service.project_risk(service.analyze(db, as_of or today_utc()), project_id)
