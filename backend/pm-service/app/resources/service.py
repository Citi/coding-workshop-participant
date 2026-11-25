"""Business rules for resources: unique emails, computed utilization, detail with allocations."""

from app.allocations import repository as allocations_repository
from app.core.errors import ConflictError, NotFoundError
from app.core.http import list_result
from app.resources import repository
from app.resources.schemas import ResourceRequest
from app.resources.utilization import enrich_resource, fetch_resource_utilization

# The allocation fields shown on a person's detail page (GET /resources/{id} in docs/API.md).
ALLOCATION_SUMMARY_FIELDS = ("id", "project_id", "project_name", "project_status", "allocation_percent")


def list_resources(conn, *, search=None, department=None, over_allocated=None) -> dict:
    """Filtered resources with utilization; ``over_allocated`` filters on the computed flag."""
    items = _enrich_all(conn, repository.list_resources(conn, search=search, department=department))
    if over_allocated is not None:
        items = [item for item in items if item["is_over_allocated"] is over_allocated]
    return list_result(items)


def get_resource(conn, resource_id: int) -> dict:
    """One resource with utilization plus all of their allocations (any project status)."""
    resource = _enrich_one(conn, _require(conn, resource_id))
    allocations = allocations_repository.list_allocations(conn, resource_id=resource_id)
    return {**resource, "allocations": [_allocation_summary(row) for row in allocations]}


def create_resource(conn, data: ResourceRequest) -> dict:
    """Create a resource after checking that the email is not in use."""
    _check_email_available(conn, data.email)
    return _enrich_one(conn, repository.insert_resource(conn, data.model_dump()))


def update_resource(conn, resource_id: int, data: ResourceRequest) -> dict:
    """Full update; the email must stay unique among the other resources."""
    _require(conn, resource_id)
    _check_email_available(conn, data.email, exclude_id=resource_id)
    return _enrich_one(conn, _found(repository.update_resource(conn, resource_id, data.model_dump())))


def delete_resource(conn, resource_id: int) -> None:
    """Delete a resource (404 when it does not exist)."""
    if not repository.delete_resource(conn, resource_id):
        raise NotFoundError("Resource not found")


def _require(conn, resource_id: int) -> dict:
    """The resource row, or 404."""
    return _found(repository.find_resource(conn, resource_id))


def _found(resource: dict | None) -> dict:
    """404 when a lookup or an UPDATE matched no row (e.g. another request deleted it meanwhile)."""
    if resource is None:
        raise NotFoundError("Resource not found")
    return resource


def _check_email_available(conn, email: str, *, exclude_id: int | None = None) -> None:
    """409 when another resource already uses this email."""
    if repository.email_taken(conn, email, exclude_id=exclude_id):
        raise ConflictError(
            "A resource with this email already exists",
            details={"email": "A resource with this email already exists"},
        )


def _enrich_all(conn, resources: list[dict]) -> list[dict]:
    """Add the computed utilization fields (one query for the whole list)."""
    utilization = fetch_resource_utilization(conn, [resource["id"] for resource in resources])
    return [enrich_resource(resource, utilization.get(resource["id"])) for resource in resources]


def _enrich_one(conn, resource: dict) -> dict:
    """Single-resource form of ``_enrich_all``."""
    return _enrich_all(conn, [resource])[0]


def _allocation_summary(allocation: dict) -> dict:
    """The subset of an allocation row shown on the resource detail."""
    return {field: allocation[field] for field in ALLOCATION_SUMMARY_FIELDS}
