"""Business rules for allocations: existing references, one allocation per person per project,
and the person's utilization after every change (over-allocation is reported, not blocked)."""

from app.allocations import repository
from app.allocations.schemas import AllocationRequest
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.http import list_result
from app.projects import repository as projects_repository
from app.resources import repository as resources_repository
from app.resources.utilization import fetch_resource_utilization, is_over_allocated


def enrich_allocation(allocation: dict, utilization: dict | None) -> dict:
    """Add the person's current total across active projects and the over-allocation flag."""
    total = (utilization or {}).get("total_allocation_percent", 0)
    return {
        **allocation,
        "resource_total_allocation_percent": total,
        "resource_over_allocated": is_over_allocated(total),
    }


def list_allocations(conn, *, project_id=None, resource_id=None) -> dict:
    """Filtered allocations, each with the person's current totals."""
    items = _enrich_all(conn, repository.list_allocations(conn, project_id=project_id, resource_id=resource_id))
    return list_result(items)


def get_allocation(conn, allocation_id: int) -> dict:
    """One allocation with the person's current totals (404 when it does not exist)."""
    return _enrich_all(conn, [_require(conn, allocation_id)])[0]


def create_allocation(conn, data: AllocationRequest) -> dict:
    """Create an allocation; the response carries the person's totals after the change."""
    _validate(conn, data)
    return get_allocation(conn, repository.insert_allocation(conn, data.model_dump()))


def update_allocation(conn, allocation_id: int, data: AllocationRequest) -> dict:
    """Full update; the response carries the person's totals after the change."""
    _require(conn, allocation_id)
    _validate(conn, data, exclude_id=allocation_id)
    repository.update_allocation(conn, allocation_id, data.model_dump())
    return get_allocation(conn, allocation_id)


def delete_allocation(conn, allocation_id: int) -> None:
    """Delete an allocation (404 when it does not exist)."""
    if not repository.delete_allocation(conn, allocation_id):
        raise NotFoundError("Allocation not found")


def _require(conn, allocation_id: int) -> dict:
    """The allocation row, or 404."""
    allocation = repository.find_allocation(conn, allocation_id)
    if allocation is None:
        raise NotFoundError("Allocation not found")
    return allocation


def _validate(conn, data: AllocationRequest, *, exclude_id: int | None = None) -> None:
    """400 when the resource or project does not exist, 409 when the pair is already allocated."""
    errors = {}
    if not resources_repository.resource_exists(conn, data.resource_id):
        errors["resource_id"] = "Resource not found"
    if not projects_repository.project_exists(conn, data.project_id):
        errors["project_id"] = "Project not found"
    if errors:
        raise ValidationError("Validation failed", details=errors)
    if repository.pair_taken(conn, data.resource_id, data.project_id, exclude_id=exclude_id):
        raise ConflictError(
            "This person is already allocated to this project",
            details={"resource_id": "This person is already allocated to this project"},
        )


def _enrich_all(conn, allocations: list[dict]) -> list[dict]:
    """Add each person's totals (one utilization query for the whole list)."""
    utilization = fetch_resource_utilization(conn, {row["resource_id"] for row in allocations})
    return [enrich_allocation(row, utilization.get(row["resource_id"])) for row in allocations]
