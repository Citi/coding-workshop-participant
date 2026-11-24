"""Deliverable endpoints: CRUD with owner/project names, overdue flag and dependency graph."""

from app.core.http import created, no_content, ok
from app.core.validation import parse_body, query_bool, query_enum, query_int, query_str
from app.deliverables import service
from app.deliverables.schemas import DELIVERABLE_STATUSES, DeliverableRequest


def list_deliverables(req):
    """GET /deliverables?search=&project_id=&status=&is_key=&overdue=&owner_id="""
    return ok(
        service.list_deliverables(
            req.conn,
            search=query_str(req, "search"),
            project_id=query_int(req, "project_id"),
            status=query_enum(req, "status", DELIVERABLE_STATUSES),
            is_key=query_bool(req, "is_key"),
            owner_id=query_int(req, "owner_id"),
            overdue=query_bool(req, "overdue"),
        )
    )


def get_deliverable(req):
    """GET /deliverables/{id} (adds depends_on, dependency_chain and blocks)"""
    return ok(service.get_deliverable(req.conn, req.path_params["id"]))


def create_deliverable(req):
    """POST /deliverables"""
    return created(service.create_deliverable(req.conn, parse_body(DeliverableRequest, req)))


def update_deliverable(req):
    """PUT /deliverables/{id} (full update; depends_on_ids replaces the whole set)"""
    return ok(service.update_deliverable(req.conn, req.path_params["id"], parse_body(DeliverableRequest, req)))


def delete_deliverable(req):
    """DELETE /deliverables/{id}"""
    service.delete_deliverable(req.conn, req.path_params["id"])
    return no_content()


def register(router) -> None:
    """Register the deliverables routes on the shared router."""
    router.add("GET", "/deliverables", list_deliverables, permission="deliverables:read")
    router.add("POST", "/deliverables", create_deliverable, permission="deliverables:create")
    router.add("GET", "/deliverables/{id}", get_deliverable, permission="deliverables:read")
    router.add("PUT", "/deliverables/{id}", update_deliverable, permission="deliverables:update")
    router.add("DELETE", "/deliverables/{id}", delete_deliverable, permission="deliverables:delete")
