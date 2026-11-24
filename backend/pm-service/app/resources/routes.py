"""HTTP routes for the resources domain (team members): CRUD under /resources."""

from app.core.http import created, no_content, ok
from app.core.validation import parse_body, query_bool, query_str
from app.resources import service
from app.resources.schemas import ResourceRequest


def list_resources(req):
    """GET /resources - filters: search, department, over_allocated."""
    return ok(
        service.list_resources(
            req.conn,
            search=query_str(req, "search"),
            department=query_str(req, "department", max_length=100),
            over_allocated=query_bool(req, "over_allocated"),
        )
    )


def create_resource(req):
    """POST /resources."""
    return created(service.create_resource(req.conn, parse_body(ResourceRequest, req)))


def get_resource(req):
    """GET /resources/{id} - includes the person's allocations."""
    return ok(service.get_resource(req.conn, req.path_params["id"]))


def update_resource(req):
    """PUT /resources/{id} - full update."""
    return ok(service.update_resource(req.conn, req.path_params["id"], parse_body(ResourceRequest, req)))


def delete_resource(req):
    """DELETE /resources/{id}."""
    service.delete_resource(req.conn, req.path_params["id"])
    return no_content()


def register(router) -> None:
    """Register resources routes on the shared router."""
    router.add("GET", "/resources", list_resources, permission="resources:read")
    router.add("POST", "/resources", create_resource, permission="resources:create")
    router.add("GET", "/resources/{id}", get_resource, permission="resources:read")
    router.add("PUT", "/resources/{id}", update_resource, permission="resources:update")
    router.add("DELETE", "/resources/{id}", delete_resource, permission="resources:delete")
