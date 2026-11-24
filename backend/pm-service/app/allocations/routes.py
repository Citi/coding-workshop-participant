"""HTTP routes for the allocations domain (resource <-> project): CRUD under /allocations."""

from app.allocations import service
from app.allocations.schemas import AllocationRequest
from app.core.http import created, no_content, ok
from app.core.validation import parse_body, query_int


def list_allocations(req):
    """GET /allocations - filters: project_id, resource_id."""
    return ok(
        service.list_allocations(
            req.conn,
            project_id=query_int(req, "project_id"),
            resource_id=query_int(req, "resource_id"),
        )
    )


def create_allocation(req):
    """POST /allocations."""
    return created(service.create_allocation(req.conn, parse_body(AllocationRequest, req)))


def get_allocation(req):
    """GET /allocations/{id}."""
    return ok(service.get_allocation(req.conn, req.path_params["id"]))


def update_allocation(req):
    """PUT /allocations/{id} - full update."""
    return ok(service.update_allocation(req.conn, req.path_params["id"], parse_body(AllocationRequest, req)))


def delete_allocation(req):
    """DELETE /allocations/{id}."""
    service.delete_allocation(req.conn, req.path_params["id"])
    return no_content()


def register(router) -> None:
    """Register allocations routes on the shared router."""
    router.add("GET", "/allocations", list_allocations, permission="allocations:read")
    router.add("POST", "/allocations", create_allocation, permission="allocations:create")
    router.add("GET", "/allocations/{id}", get_allocation, permission="allocations:read")
    router.add("PUT", "/allocations/{id}", update_allocation, permission="allocations:update")
    router.add("DELETE", "/allocations/{id}", delete_allocation, permission="allocations:delete")
