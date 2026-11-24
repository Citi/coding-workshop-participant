"""Portfolio loader: read every fact the engines need in exactly five queries.

Analytics endpoints call ``load_snapshot`` once per request and pass the result
to ``app.engines.risk.analyze_portfolio``. There are no per-project query loops:
one query each for projects, deliverables, dependency edges, allocations and
spend grouped by project. The queries select plain columns, so the ORM's
eager-loaded relationships never add extra statements.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    BudgetEntry,
    Deliverable,
    DeliverableDependency,
    Department,
    Project,
    ResourceAllocation,
    User,
)
from app.engines.types import (
    AllocationFact,
    DeliverableFact,
    DependencyEdge,
    PortfolioSnapshot,
    ProjectFact,
)

__all__ = ["load_snapshot"]

# 1. Projects with their department and project manager names.
_PROJECTS = (
    select(
        Project.id,
        Project.project_name,
        Project.description,
        Project.department_id,
        Department.name.label("department_name"),
        Project.project_manager_id,
        User.name.label("project_manager_name"),
        Project.status,
        Project.start_date,
        Project.end_date,
        Project.planned_budget,
    )
    .join(Department, Department.id == Project.department_id)
    .outerjoin(User, User.id == Project.project_manager_id)
    .order_by(Project.id)
)

# 2. Deliverables with their assignee names.
_DELIVERABLES = (
    select(
        Deliverable.id,
        Deliverable.project_id,
        Deliverable.title,
        Deliverable.status,
        Deliverable.completion_percentage,
        Deliverable.start_date,
        Deliverable.due_date,
        Deliverable.assigned_user_id,
        User.name.label("assigned_user_name"),
        Deliverable.blocked_reason,
    )
    .outerjoin(User, User.id == Deliverable.assigned_user_id)
    .order_by(Deliverable.id)
)

# 3. Dependency edges.
_DEPENDENCIES = select(
    DeliverableDependency.id,
    DeliverableDependency.predecessor_deliverable_id,
    DeliverableDependency.successor_deliverable_id,
).order_by(DeliverableDependency.id)

# 4. Allocations with the person's name and department.
_ALLOCATIONS = (
    select(
        ResourceAllocation.id,
        ResourceAllocation.user_id,
        User.name.label("user_name"),
        User.department_id.label("user_department_id"),
        ResourceAllocation.project_id,
        ResourceAllocation.deliverable_id,
        ResourceAllocation.allocation_percentage,
        ResourceAllocation.start_date,
        ResourceAllocation.end_date,
    )
    .join(User, User.id == ResourceAllocation.user_id)
    .order_by(ResourceAllocation.id)
)

# 5. Actual spend: the sum of budget entries per project.
_SPEND = (
    select(BudgetEntry.project_id, func.sum(BudgetEntry.amount).label("actual_spend"))
    .group_by(BudgetEntry.project_id)
    .order_by(BudgetEntry.project_id)
)


def load_snapshot(session: Session) -> PortfolioSnapshot:
    """Load the whole portfolio as frozen facts using exactly five SELECT statements."""
    projects = tuple(
        ProjectFact(
            id=row.id,
            name=row.project_name,
            description=row.description,
            department_id=row.department_id,
            department_name=row.department_name,
            project_manager_id=row.project_manager_id,
            project_manager_name=row.project_manager_name,
            status=row.status,
            start_date=row.start_date,
            end_date=row.end_date,
            planned_budget=Decimal(row.planned_budget),
        )
        for row in session.execute(_PROJECTS)
    )
    deliverables = tuple(
        DeliverableFact(
            id=row.id,
            project_id=row.project_id,
            title=row.title,
            status=row.status,
            completion_percentage=row.completion_percentage,
            start_date=row.start_date,
            due_date=row.due_date,
            assigned_user_id=row.assigned_user_id,
            assigned_user_name=row.assigned_user_name,
            blocked_reason=row.blocked_reason,
        )
        for row in session.execute(_DELIVERABLES)
    )
    dependencies = tuple(
        DependencyEdge(
            id=row.id,
            predecessor_id=row.predecessor_deliverable_id,
            successor_id=row.successor_deliverable_id,
        )
        for row in session.execute(_DEPENDENCIES)
    )
    allocations = tuple(
        AllocationFact(
            id=row.id,
            user_id=row.user_id,
            user_name=row.user_name,
            user_department_id=row.user_department_id,
            project_id=row.project_id,
            deliverable_id=row.deliverable_id,
            allocation_percentage=row.allocation_percentage,
            start_date=row.start_date,
            end_date=row.end_date,
        )
        for row in session.execute(_ALLOCATIONS)
    )
    spend_by_project = {row.project_id: Decimal(row.actual_spend) for row in session.execute(_SPEND)}
    return PortfolioSnapshot(
        projects=projects,
        deliverables=deliverables,
        dependencies=dependencies,
        allocations=allocations,
        spend_by_project=spend_by_project,
    )
