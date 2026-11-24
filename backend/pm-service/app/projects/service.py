"""Project business rules: existence, unique names and the computed read model (``metrics.py``)."""

from collections.abc import Collection

from app.core import clock
from app.core.errors import ConflictError, NotFoundError
from app.core.http import list_result
from app.projects import repository
from app.projects.metrics import enrich_project, fetch_project_metrics
from app.projects.schemas import ProjectRequest

DUPLICATE_NAME = "A project with this name already exists"


def enrich_projects(conn, projects: list[dict]) -> list[dict]:
    """Add the computed fields to every row using ONE metrics query (not one per project)."""
    today = clock.today()
    metrics = fetch_project_metrics(conn, [project["id"] for project in projects], today=today)
    return [enrich_project(project, metrics.get(project["id"]), today=today) for project in projects]


def _enrich_one(conn, project: dict) -> dict:
    """A single row with its computed fields."""
    return enrich_projects(conn, [project])[0]


def _found(result):
    """``result`` itself; 404 when it is empty: the project in the URL does not exist (or was just deleted)."""
    if not result:
        raise NotFoundError("Project not found")
    return result


def _ensure_unique_name(conn, name: str, exclude_id: int | None = None) -> None:
    """409 when another project already uses the name (case-insensitive)."""
    if repository.name_taken(conn, name, exclude_id=exclude_id):
        raise ConflictError(DUPLICATE_NAME, details={"name": DUPLICATE_NAME})


def list_projects(
    conn, *, search=None, status=None, department=None, health: str | Collection[str] | None = None
) -> dict:
    """Filtered projects with computed fields; ``health`` keeps projects whose computed health is any listed value.

    ``health`` is one value (``"at_risk"``) or several (``("at_risk", "overdue")``); a single string is one
    value, never a set of characters to match against.
    """
    rows = repository.list_projects(conn, search=search, status=status, department=department)
    items = enrich_projects(conn, rows)
    if health:
        wanted = {health} if isinstance(health, str) else set(health)
        items = [item for item in items if item["health"] in wanted]
    return list_result(items)


def get_project(conn, project_id: int) -> dict:
    """One project with its computed fields (404 when it does not exist)."""
    return _enrich_one(conn, _found(repository.find_project(conn, project_id)))


def create_project(conn, data: ProjectRequest) -> dict:
    """Insert a project with a unique name and return it with its computed fields."""
    _ensure_unique_name(conn, data.name)
    return _enrich_one(conn, repository.insert_project(conn, data.model_dump()))


def update_project(conn, project_id: int, data: ProjectRequest) -> dict:
    """Full update: 404 for an unknown id, 409 when the name belongs to another project."""
    _found(repository.project_exists(conn, project_id))
    _ensure_unique_name(conn, data.name, exclude_id=project_id)
    return _enrich_one(conn, _found(repository.update_project(conn, project_id, data.model_dump())))


def delete_project(conn, project_id: int) -> None:
    """Delete a project together with everything that belongs to it (404 for an unknown id)."""
    _found(repository.delete_project(conn, project_id))
