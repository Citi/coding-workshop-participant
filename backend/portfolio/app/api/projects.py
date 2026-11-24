"""Project routes: every signed-in role can read; ADMIN and PM can create, change and delete.

Every project in a response carries ``completion_pct``, ``actual_spend``,
``remaining_budget``, ``utilization_pct``, ``risk_score`` and ``risk_level``,
computed by one portfolio analysis per request as of ``as_of`` (default: today,
UTC). ``GET /projects/{id}/risk`` and ``/dependency-graph`` live in the
analytics and dependencies routers.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params, today_utc
from app.db.models import User
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.departments import MAX_ID
from app.schemas.projects import ProjectCreate, ProjectOut, ProjectStatus, ProjectUpdate, RiskLevel
from app.security import MANAGERS, get_current_user, require_roles
from app.services import projects as service
from app.services.projects import ProjectMetrics

router = APIRouter(prefix="/projects", tags=["projects"])

ProjectId = Annotated[int, Path(ge=1, le=MAX_ID, description="Project id.")]
AsOf = Annotated[
    date | None, Query(description="Date the metrics and risk are computed for (YYYY-MM-DD); default today (UTC).")
]


def _out(metrics: ProjectMetrics) -> ProjectOut:
    """Render a project with its metrics."""
    return ProjectOut.build(metrics.project, metrics.budget, metrics.risk)


@router.get("", response_model=Page[ProjectOut])
def list_projects(
    q: Annotated[str | None, Query(max_length=200, description="Name contains (ignoring case).")] = None,
    department_id: Annotated[int | None, Query(ge=1, le=MAX_ID, description="Only this department.")] = None,
    status: Annotated[ProjectStatus | None, Query(description="Only projects with this status.")] = None,
    risk_level: Annotated[RiskLevel | None, Query(description="Only projects at this computed risk level.")] = None,
    as_of: AsOf = None,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[ProjectOut]:
    """List projects ordered by id with their computed metrics: ``{items, total}``.

    Filters: ``q``, ``department_id``, ``status`` and ``risk_level``; paged by
    ``limit`` and ``offset`` after every filter is applied.
    """
    items, total = service.list_projects(
        db,
        as_of=as_of or today_utc(),
        q=q,
        department_id=department_id,
        status=status,
        risk_level=risk_level,
        limit=page.limit,
        offset=page.offset,
    )
    return Page[ProjectOut](items=[_out(item) for item in items], total=total)


@router.post("", status_code=201, response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> ProjectOut:
    """Create a project (ADMIN, PM) and return it with its metrics.

    400 ``VALIDATION_ERROR`` for bad fields or an end date before the start
    date; 400 ``INVALID_REFERENCE`` for an unknown department or manager.
    """
    return _out(service.create_project(db, actor=actor, data=body, as_of=as_of or today_utc()))


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: ProjectId,
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProjectOut:
    """Return one project with its computed metrics; 404 when it does not exist."""
    return _out(service.get_project_metrics(db, project_id, as_of or today_utc()))


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: ProjectId,
    body: ProjectUpdate,
    as_of: AsOf = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> ProjectOut:
    """Change any subset of a project's fields (ADMIN, PM); dates are re-checked on the merged values."""
    metrics = service.update_project(db, actor=actor, project_id=project_id, data=body, as_of=as_of or today_utc())
    return _out(metrics)


@router.delete("/{project_id}", status_code=204, response_class=Response)
def delete_project(
    project_id: ProjectId,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> Response:
    """Delete a project and everything that belongs to it (ADMIN, PM): 204 with no body."""
    service.delete_project(db, actor=actor, project_id=project_id)
    return Response(status_code=204)
