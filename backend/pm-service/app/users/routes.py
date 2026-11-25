"""User administration endpoints (admin only, ``users:*``): CRUD under /users."""

from app.auth.permissions import ROLES
from app.core.http import created, no_content, ok
from app.core.validation import parse_body, query_bool, query_enum, query_str
from app.users import service
from app.users.schemas import UserCreateRequest, UserUpdateRequest


def list_users(req):
    """GET /users?search=&role=&is_active="""
    return ok(
        service.list_users(
            req.conn,
            search=query_str(req, "search"),
            role=query_enum(req, "role", ROLES),
            is_active=query_bool(req, "is_active"),
        )
    )


def get_user(req):
    """GET /users/{id}"""
    return ok(service.get_user(req.conn, req.path_params["id"]))


def create_user(req):
    """POST /users"""
    return created(service.create_user(req.conn, parse_body(UserCreateRequest, req)))


def update_user(req):
    """PUT /users/{id} (full update; ``password`` only when changing it)"""
    data = parse_body(UserUpdateRequest, req)
    return ok(service.update_user(req.conn, req.path_params["id"], data, current_user=req.user))


def delete_user(req):
    """DELETE /users/{id}"""
    service.delete_user(req.conn, req.path_params["id"], current_user=req.user)
    return no_content()


def register(router) -> None:
    """Register the users routes on the shared router."""
    router.add("GET", "/users", list_users, permission="users:read")
    router.add("POST", "/users", create_user, permission="users:create")
    router.add("GET", "/users/{id}", get_user, permission="users:read")
    router.add("PUT", "/users/{id}", update_user, permission="users:update")
    router.add("DELETE", "/users/{id}", delete_user, permission="users:delete")
