"""
Centralized role-based access rules.

Every authorization decision in the API goes through these helpers so the
rules from the requirements live in exactly one place:

* admin    - full control, sees the archive.
* manager  - manages only projects assigned to them (cannot create/archive
             projects), owns milestones, edits name/email of direct reports.
* employee - sees only projects they are assigned to and logs their own time.
"""

from typing import Optional

from psycopg import Connection

from .db import fetch_one
from .errors import ForbiddenError, NotFoundError


def is_admin(user: dict) -> bool:
    """True for administrators."""
    return user["role"] == "admin"


def is_manager(user: dict) -> bool:
    """True for managers."""
    return user["role"] == "manager"


def require_roles(user: dict, *roles: str) -> None:
    """Reject the request unless the caller has one of ``roles``."""
    if user["role"] not in roles:
        raise ForbiddenError("You do not have permission to perform this action.")


def is_project_member(conn: Connection, project_id: int, user_id: int) -> bool:
    """True when the user is currently assigned to the project."""
    row = fetch_one(
        conn,
        "SELECT 1 FROM project_members WHERE project_id = %s AND user_id = %s AND removed_at IS NULL",
        (project_id, user_id),
    )
    return row is not None


def can_view_project(conn: Connection, user: dict, project: dict) -> bool:
    """Admins see all; managers see projects they manage; employees see assigned projects."""
    if is_admin(user):
        return True
    if project.get("archived_at") is not None:
        return False  # Archived records are admin-only.
    if is_manager(user):
        return project["manager_id"] == user["id"]
    return is_project_member(conn, project["id"], user["id"])


def can_manage_project(user: dict, project: dict) -> bool:
    """Admins, or the manager who owns the project (and it is not archived)."""
    if is_admin(user):
        return True
    return is_manager(user) and project["manager_id"] == user["id"] and project.get("archived_at") is None


def load_project(conn: Connection, user: dict, project_id: int, manage: bool = False) -> dict:
    """
    Fetch a project the caller may see (404 otherwise) and optionally may manage (403).

    Returning 404 for invisible projects avoids leaking which ids exist.
    """
    project = fetch_one(conn, "SELECT * FROM projects WHERE id = %s", (project_id,))
    if project is None or not can_view_project(conn, user, project):
        raise NotFoundError("Project not found.")
    if manage and not can_manage_project(user, project):
        raise ForbiddenError("Only the project's manager or an admin can change this project.")
    return project


def can_view_user(user: dict, target: dict) -> bool:
    """Admins see everyone; managers see active employees and themselves; employees see self and their manager."""
    if is_admin(user):
        return True
    if target.get("archived_at") is not None:
        return False
    if target["id"] == user["id"]:
        return True
    if is_manager(user):
        return target["role"] == "employee"
    return target["id"] == user.get("manager_id")


def manager_can_edit(user: dict, target: dict) -> bool:
    """Managers may edit only employees on their immediate team."""
    return is_manager(user) and target["role"] == "employee" and target.get("manager_id") == user["id"]


def check_time_entry_access(conn: Connection, user: dict, entry: dict, write: bool) -> Optional[dict]:
    """Authorize reading/writing a time entry; returns the parent project."""
    project = fetch_one(conn, "SELECT * FROM projects WHERE id = %s", (entry["project_id"],))
    if project is None:
        raise NotFoundError("Time entry not found.")
    if is_admin(user):
        return project
    if entry.get("archived_at") is not None:
        raise NotFoundError("Time entry not found.")
    if is_manager(user) and project["manager_id"] == user["id"]:
        return project
    if entry["user_id"] == user["id"] and (not write or is_project_member(conn, project["id"], user["id"])):
        return project
    raise NotFoundError("Time entry not found.")
