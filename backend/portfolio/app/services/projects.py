"""Projects: lists and reads with metrics computed on read, and audited ADMIN/PM changes.

Every project returned by the API carries its completion, spend, utilization
and risk, taken from ONE ``analyze_portfolio(load_snapshot(db), as_of)`` per
request (five queries for the whole portfolio, never one per project). Risk
is never stored, so it cannot drift from the data.

Each create, update and delete runs in one transaction with exactly one audit
row. The reference and date checks here are also used by the allocation and
budget-entry services.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Department, Project, User
from app.db.session import transaction
from app.engines.risk import analyze_portfolio
from app.engines.types import PortfolioAnalysis, ProjectBudget, RiskAssessment
from app.errors import InvalidReference, NotFound, ValidationFailed
from app.schemas.projects import ProjectCreate, ProjectUpdate
from app.services.audit import record_audit, to_state
from app.services.portfolio import load_snapshot

ENTITY_TYPE = "project"


@dataclass(frozen=True)
class ProjectMetrics:
    """A stored project with its budget and risk results from one portfolio analysis."""

    project: Project
    budget: ProjectBudget
    risk: RiskAssessment


# --- Shared checks (also used by allocations and budget entries) -----------------------------------


def invalid_reference(field: str, kind: str, record_id: int) -> InvalidReference:
    """Build the 400 ``INVALID_REFERENCE`` for an id that matches no row, naming the field."""
    return InvalidReference(
        f"{kind.capitalize()} {record_id} does not exist.",
        details=[{"field": field, "issue": f"No {kind} has id {record_id}."}],
    )


def check_dates(start_date: date, end_date: date) -> None:
    """Raise 400 ``VALIDATION_ERROR`` on ``end_date`` when it is before ``start_date`` (equal is fine)."""
    if end_date < start_date:
        issue = f"end_date ({end_date.isoformat()}) must be on or after start_date ({start_date.isoformat()})."
        raise ValidationFailed(
            "The end date must be on or after the start date.",
            details=[{"field": "end_date", "issue": issue}],
        )


def resolve_project(db: Session, project_id: int, *, field: str = "project_id") -> Project:
    """Load a referenced project; raise 400 ``INVALID_REFERENCE`` naming ``field`` when it does not exist."""
    project = db.get(Project, project_id)
    if project is None:
        raise invalid_reference(field, "project", project_id)
    return project


def resolve_user(db: Session, user_id: int, *, field: str) -> User:
    """Load a referenced user; raise 400 ``INVALID_REFERENCE`` naming ``field`` when they do not exist."""
    user = db.get(User, user_id)
    if user is None:
        raise invalid_reference(field, "user", user_id)
    return user


def _resolve_department(db: Session, department_id: int) -> Department:
    """Load the project's department; raise 400 ``INVALID_REFERENCE`` on ``department_id`` when missing."""
    department = db.get(Department, department_id)
    if department is None:
        raise invalid_reference("department_id", "department", department_id)
    return department


def _resolve_manager(db: Session, user_id: int | None) -> User | None:
    """Load the project manager, or None when none is given."""
    return None if user_id is None else resolve_user(db, user_id, field="project_manager_id")


# --- Reads -----------------------------------------------------------------------------------------


def get_project(db: Session, project_id: int) -> Project:
    """Return the project with this id, or raise 404 ``NOT_FOUND``."""
    project = db.get(Project, project_id)
    if project is None:
        raise NotFound(f"Project {project_id} was not found.")
    return project


def analyze(db: Session, as_of: date) -> PortfolioAnalysis:
    """Run every engine once over the whole portfolio (five queries)."""
    return analyze_portfolio(load_snapshot(db), as_of)


def _attach(project: Project, analysis: PortfolioAnalysis) -> ProjectMetrics | None:
    """Pair a project with its results; None when the analysis no longer contains it."""
    risk = analysis.risks.get(project.id)
    budget = analysis.project_budgets.get(project.id)
    if risk is None or budget is None:
        return None
    return ProjectMetrics(project=project, budget=budget, risk=risk)


def _metrics(db: Session, project: Project, as_of: date) -> ProjectMetrics:
    """Analyse the portfolio after reading ``project``; 404 when it was deleted in between."""
    metrics = _attach(project, analyze(db, as_of))
    if metrics is None:
        raise NotFound(f"Project {project.id} was not found.")
    return metrics


def list_projects(
    db: Session,
    *,
    as_of: date,
    q: str | None = None,
    department_id: int | None = None,
    status: str | None = None,
    risk_level: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ProjectMetrics], int]:
    """Return one page of projects ordered by id with their metrics, plus the number of matches.

    ``q`` (name contains, ignoring case), ``department_id`` and ``status`` are
    applied in SQL. The metrics come from one analysis of the whole portfolio;
    ``risk_level`` is then applied to the computed levels before counting and
    slicing. The projects are read before the analysis, so a project deleted
    in between is simply left out.
    """
    conditions: list[Any] = []
    term = (q or "").strip()
    if term:
        conditions.append(Project.project_name.icontains(term, autoescape=True))
    if department_id is not None:
        conditions.append(Project.department_id == department_id)
    if status is not None:
        conditions.append(Project.status == status)
    projects = db.scalars(select(Project).where(*conditions).order_by(Project.id)).all()
    if not projects:
        return [], 0
    analysis = analyze(db, as_of)
    items = [metrics for metrics in (_attach(project, analysis) for project in projects) if metrics is not None]
    if risk_level is not None:
        items = [metrics for metrics in items if metrics.risk.risk_level == risk_level]
    return items[offset : offset + limit], len(items)


def get_project_metrics(db: Session, project_id: int, as_of: date) -> ProjectMetrics:
    """Return one project with its metrics as of ``as_of``; 404 when it does not exist."""
    return _metrics(db, get_project(db, project_id), as_of)


# --- Changes ---------------------------------------------------------------------------------------


def create_project(db: Session, *, actor: User, data: ProjectCreate, as_of: date) -> ProjectMetrics:
    """Create a project and its CREATE audit row in one transaction; return it with its metrics.

    400 ``VALIDATION_ERROR`` when ``end_date`` is before ``start_date``; 400
    ``INVALID_REFERENCE`` for an unknown department or project manager.
    """
    with transaction(db):
        check_dates(data.start_date, data.end_date)
        department = _resolve_department(db, data.department_id)
        manager = _resolve_manager(db, data.project_manager_id)
        project = Project(
            project_name=data.project_name,
            description=data.description,
            department=department,
            project_manager=manager,
            start_date=data.start_date,
            end_date=data.end_date,
            planned_budget=data.planned_budget,
            status=data.status,
        )
        db.add(project)
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=project.id,
            action="CREATE",
            before=None,
            after=to_state(project),
        )
    return _metrics(db, project, as_of)


def update_project(
    db: Session, *, actor: User, project_id: int, data: ProjectUpdate, as_of: date
) -> ProjectMetrics:
    """Apply the fields sent in ``data`` with one UPDATE audit row, in one transaction.

    The dates are checked on the merged values (stored values for the fields not
    sent). ``updated_at`` is set to ``now()`` on every update. 404 for an unknown
    project; 400 as for create.
    """
    changes = data.model_fields_set
    with transaction(db):
        project = get_project(db, project_id)
        # Null is refused for these fields, so None here means "not sent": keep the stored value.
        start_date = data.start_date if data.start_date is not None else project.start_date
        end_date = data.end_date if data.end_date is not None else project.end_date
        check_dates(start_date, end_date)
        department = _resolve_department(db, data.department_id) if data.department_id is not None else None
        manager = _resolve_manager(db, data.project_manager_id) if "project_manager_id" in changes else None

        before = to_state(project)
        if data.project_name is not None:
            project.project_name = data.project_name
        if "description" in changes:
            project.description = data.description
        if department is not None:
            project.department = department
        if "project_manager_id" in changes:
            project.project_manager = manager
        project.start_date = start_date
        project.end_date = end_date
        if data.planned_budget is not None:
            project.planned_budget = data.planned_budget
        if data.status is not None:
            project.status = data.status
        project.updated_at = func.now()
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=project.id,
            action="UPDATE",
            before=before,
            after=to_state(project),
        )
    return _metrics(db, project, as_of)


def delete_project(db: Session, *, actor: User, project_id: int) -> None:
    """Delete a project with one DELETE audit row, in one transaction.

    The database removes its deliverables (and their dependency edges),
    allocations and budget entries (``ON DELETE CASCADE`` in ``schema.sql``).
    """
    with transaction(db):
        project = get_project(db, project_id)
        before = to_state(project)
        db.delete(project)
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=before["id"],
            action="DELETE",
            before=before,
            after=None,
        )
