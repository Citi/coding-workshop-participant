"""Project endpoints: CRUD; every project carries computed progress, health and budget fields."""

from app.core.http import created, no_content, ok
from app.core.validation import parse_body, query_enum, query_enum_list, query_str
from app.projects import service
from app.projects.health import HEALTH_VALUES
from app.projects.schemas import PROJECT_STATUSES, ProjectRequest


def list_projects(req):
    """GET /projects?search=&status=&department=&health= (``health`` may list several values: at_risk,overdue)"""
    return ok(
        service.list_projects(
            req.conn,
            search=query_str(req, "search"),
            status=query_enum(req, "status", PROJECT_STATUSES),
            department=query_str(req, "department", max_length=100),
            health=query_enum_list(req, "health", HEALTH_VALUES),
        )
    )


def get_project(req):
    """GET /projects/{id}"""
    return ok(service.get_project(req.conn, req.path_params["id"]))


def create_project(req):
    """POST /projects"""
    return created(service.create_project(req.conn, parse_body(ProjectRequest, req)))


def update_project(req):
    """PUT /projects/{id} (full update)"""
    return ok(service.update_project(req.conn, req.path_params["id"], parse_body(ProjectRequest, req)))


def delete_project(req):
    """DELETE /projects/{id}"""
    service.delete_project(req.conn, req.path_params["id"])
    return no_content()


def register(router) -> None:
    """Register the projects routes on the shared router."""
    router.add("GET", "/projects", list_projects, permission="projects:read")
    router.add("POST", "/projects", create_project, permission="projects:create")
    router.add("GET", "/projects/{id}", get_project, permission="projects:read")
    router.add("PUT", "/projects/{id}", update_project, permission="projects:update")
    router.add("DELETE", "/projects/{id}", delete_project, permission="projects:delete")
