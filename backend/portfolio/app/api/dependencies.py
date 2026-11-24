"""Dependency routes and the project dependency graph.

Every signed-in role reads. ADMIN, PM and LEAD add edges; only ADMIN and PM
remove them. Edges are never edited: delete and re-add instead.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params, today_utc
from app.db.models import User
from app.db.session import get_db
from app.schemas.analytics import IsoDate
from app.schemas.common import Page
from app.schemas.dependencies import DependencyCreate, DependencyGraphOut, DependencyOut
from app.schemas.departments import MAX_ID
from app.security import CONTRIBUTORS, MANAGERS, get_current_user, require_roles
from app.services import dependencies as service

router = APIRouter(tags=["dependencies"])

DependencyId = Annotated[int, Path(ge=1, le=MAX_ID, description="Dependency id.")]
ProjectId = Annotated[int, Path(ge=1, le=MAX_ID, description="Project id.")]


@router.get("/dependencies", response_model=Page[DependencyOut])
def list_dependencies(
    project_id: Annotated[
        int | None, Query(ge=1, le=MAX_ID, description="Only edges with either end in this project.")
    ] = None,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[DependencyOut]:
    """List dependency edges ordered by id: ``{items, total}``, optionally for one project."""
    rows, total = service.list_dependencies(db, project_id=project_id, limit=page.limit, offset=page.offset)
    return Page[DependencyOut](items=[DependencyOut.model_validate(row) for row in rows], total=total)


@router.post("/dependencies", status_code=201, response_model=DependencyOut)
def create_dependency(
    body: DependencyCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*CONTRIBUTORS)),
) -> DependencyOut:
    """Add the edge predecessor -> successor (ADMIN, PM, LEAD).

    400 ``VALIDATION_ERROR`` for a self-edge, 400 ``INVALID_REFERENCE`` for an
    unknown deliverable, 409 for a duplicate, and 400 ``DEPENDENCY_CYCLE`` (with
    the path spelled out by title) when the edge would close a cycle.
    """
    return service.create_dependency(db, actor=actor, data=body)


@router.delete("/dependencies/{dependency_id}", status_code=204, response_class=Response)
def delete_dependency(
    dependency_id: DependencyId,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> Response:
    """Remove a dependency edge (ADMIN, PM): 204 with no body; 404 when it does not exist."""
    service.delete_dependency(db, actor=actor, dependency_id=dependency_id)
    return Response(status_code=204)


@router.get("/projects/{project_id}/dependency-graph", response_model=DependencyGraphOut)
def get_dependency_graph(
    project_id: ProjectId,
    as_of: Annotated[
        IsoDate | None, Query(description="Analysis date (YYYY-MM-DD); defaults to today (UTC).")
    ] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DependencyGraphOut:
    """Return the project's dependency chain: nodes by topological level, root causes and impacted items."""
    return service.dependency_graph(db, project_id=project_id, as_of=as_of or today_utc())
