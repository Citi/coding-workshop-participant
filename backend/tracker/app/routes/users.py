"""
User (employee / manager / admin) endpoints.

* Admins create users, change roles and reporting lines, and archive users.
* Managers may edit only the name and email of employees on their team.
* Employees have exactly one manager (``manager_id``) that only admins change.
"""

from typing import Any, Optional

from psycopg import Connection

from ..db import execute, fetch_all, fetch_one
from ..errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from ..permissions import can_view_user, is_admin, is_manager, manager_can_edit, require_roles
from ..router import ROLES, Context, router
from ..security import hash_password
from ..validation import USERNAME_RE, Validator, parse_id, query_int

PUBLIC_FIELDS = ("id", "name", "email", "username", "job_title", "role", "manager_id",
                 "created_at", "updated_at", "archived_at")

USER_SELECT = """
    SELECT u.*, m.name AS manager_name,
           COALESCE((SELECT sum(t.hours) FROM time_entries t
                     WHERE t.user_id = u.id AND t.archived_at IS NULL), 0) AS total_hours,
           (SELECT count(*) FROM project_members pm JOIN projects p ON p.id = pm.project_id
             WHERE pm.user_id = u.id AND pm.removed_at IS NULL AND p.archived_at IS NULL) AS project_count,
           (SELECT count(*) FROM users r WHERE r.manager_id = u.id AND r.archived_at IS NULL) AS team_size
    FROM users u LEFT JOIN users m ON m.id = u.manager_id
"""


def public_user(user: dict, extra: Optional[dict] = None) -> dict:
    """Strip private fields (password hash) from a user row."""
    data = {key: user.get(key) for key in PUBLIC_FIELDS}
    for key in ("manager_name", "total_hours", "project_count", "team_size"):
        if key in user:
            data[key] = user[key]
    if extra:
        data.update(extra)
    return data


def get_user_or_404(conn: Connection, user_id: int) -> dict:
    """Load any user row (including archived) or raise 404."""
    user = fetch_one(conn, USER_SELECT + " WHERE u.id = %s", (user_id,))
    if user is None:
        raise NotFoundError("User not found.")
    return user


def _ensure_unique(conn: Connection, username: Optional[str], email: Optional[str],
                   exclude_id: Optional[int] = None) -> None:
    """Raise 409 when the username or email already belongs to another user."""
    errors: dict[str, str] = {}
    if username and fetch_one(conn, "SELECT 1 FROM users WHERE lower(username) = %s AND id <> %s",
                              (username.lower(), exclude_id or 0)):
        errors["username"] = "This username is already taken."
    if email and fetch_one(conn, "SELECT 1 FROM users WHERE lower(email) = %s AND id <> %s",
                           (email.lower(), exclude_id or 0)):
        errors["email"] = "This email is already in use."
    if errors:
        raise ConflictError("A user with these details already exists.", errors)


def _validate_manager(conn: Connection, v: Validator, manager_id: Optional[int], role: str) -> None:
    """An employee's manager must be an active user with the manager role."""
    if manager_id is None:
        return
    if role != "employee":
        v.add_error("manager_id", "Only employees report to a manager.")
        return
    mgr = fetch_one(conn, "SELECT role, archived_at FROM users WHERE id = %s", (manager_id,))
    if mgr is None or mgr["archived_at"] is not None or mgr["role"] != "manager":
        v.add_error("manager_id", "Select an active manager.")


def _active_admin_count(conn: Connection) -> int:
    return fetch_one(conn, "SELECT count(*) AS n FROM users WHERE role = 'admin' AND archived_at IS NULL")["n"]


@router.add("GET", "/users")
def list_users(ctx: Context) -> tuple[int, list[dict]]:
    """List active users visible to the caller, with optional role/search/manager filters."""
    user = ctx.user
    where = ["u.archived_at IS NULL"]
    params: list[Any] = []
    if is_manager(user):
        where.append("(u.role = 'employee' OR u.id = %s)")
        params.append(user["id"])
    elif not is_admin(user):
        where.append("(u.id = %s OR u.id = %s)")
        params.extend([user["id"], user.get("manager_id") or 0])

    query = ctx.request.query
    if query.get("role") in ROLES:
        where.append("u.role = %s")
        params.append(query["role"])
    manager_id = query_int(query, "manager_id")
    if manager_id:
        where.append("u.manager_id = %s")
        params.append(manager_id)
    search = (query.get("search") or "").strip()
    if search:
        where.append("(u.name ILIKE %s OR u.email ILIKE %s OR u.username ILIKE %s OR u.job_title ILIKE %s)")
        params.extend([f"%{search}%"] * 4)

    rows = fetch_all(ctx.conn, USER_SELECT + " WHERE " + " AND ".join(where) + " ORDER BY u.name", params)
    return 200, [public_user(r, {"on_my_team": r["manager_id"] == user["id"]}) for r in rows]


@router.add("GET", "/users/{id}")
def get_user(ctx: Context) -> tuple[int, dict]:
    """Return a user's profile plus the projects and hours visible to the caller."""
    target = get_user_or_404(ctx.conn, parse_id(ctx.params["id"]))
    if not can_view_user(ctx.user, target):
        raise NotFoundError("User not found.")

    sql = """SELECT p.id, p.name, p.status, p.start_date, p.estimated_end_date,
                    COALESCE((SELECT sum(t.hours) FROM time_entries t WHERE t.project_id = p.id
                              AND t.user_id = %s AND t.archived_at IS NULL), 0) AS hours
             FROM projects p
             WHERE p.archived_at IS NULL AND (p.manager_id = %s OR EXISTS (
                   SELECT 1 FROM project_members pm WHERE pm.project_id = p.id
                   AND pm.user_id = %s AND pm.removed_at IS NULL))"""
    params: list[Any] = [target["id"], target["id"], target["id"]]
    if is_manager(ctx.user) and target["id"] != ctx.user["id"]:
        # Managers only see this person's work on projects they run.
        sql += " AND p.manager_id = %s"
        params.append(ctx.user["id"])
    projects = fetch_all(ctx.conn, sql + " ORDER BY p.name", params)
    return 200, public_user(target, {
        "projects": projects,
        "can_edit": is_admin(ctx.user) or manager_can_edit(ctx.user, target),
    })


@router.add("POST", "/users")
def create_user(ctx: Context) -> tuple[int, dict]:
    """Admin-only: create a user with a role, optional manager and initial password."""
    require_roles(ctx.user, "admin")
    v = Validator(ctx.request.json())
    name = v.string("name", required=True, max_len=120)
    email = v.email("email", required=True)
    username = v.string("username", required=True, pattern=USERNAME_RE, lower=True,
                        pattern_msg="3-30 characters: lowercase letters, numbers, . _ -")
    job_title = v.string("job_title", max_len=120) or ""
    role = v.choice("role", ROLES, required=True) or "employee"
    password = v.string("password", required=True, min_len=8, max_len=200)
    manager_id = v.integer("manager_id")
    _validate_manager(ctx.conn, v, manager_id, role)
    v.raise_if_errors()
    _ensure_unique(ctx.conn, username, email)

    row = fetch_one(
        ctx.conn,
        """INSERT INTO users (name, email, username, job_title, role, manager_id, password_hash)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (name, email, username, job_title, role, manager_id, hash_password(password)),
    )
    return 201, public_user(get_user_or_404(ctx.conn, row["id"]))


@router.add("PUT", "/users/{id}")
def update_user(ctx: Context) -> tuple[int, dict]:
    """Admins edit any field; managers edit name/email of their own team members."""
    target = get_user_or_404(ctx.conn, parse_id(ctx.params["id"]))
    if target["archived_at"] is not None and not is_admin(ctx.user):
        raise NotFoundError("User not found.")
    body = ctx.request.json()

    if not is_admin(ctx.user):
        if not manager_can_edit(ctx.user, target):
            raise ForbiddenError("You can only edit employees on your own team.")
        disallowed = set(body) - {"name", "email"}
        if disallowed:
            raise ForbiddenError("Managers can only change an employee's name and email.")

    v = Validator(body, partial=True)
    name = v.string("name", required=True, max_len=120)
    email = v.email("email", required=True)
    username = v.string("username", required=True, pattern=USERNAME_RE, lower=True,
                        pattern_msg="3-30 characters: lowercase letters, numbers, . _ -")
    job_title = v.string("job_title", max_len=120)
    role = v.choice("role", ROLES, required=True)
    password = v.string("password", min_len=8, max_len=200)
    new_role = role or target["role"]
    manager_id = v.integer("manager_id") if v.has("manager_id") else target["manager_id"]
    if new_role != "employee" and not v.has("manager_id"):
        manager_id = None  # Promoting an employee clears their reporting line.
    _validate_manager(ctx.conn, v, manager_id, new_role)
    v.raise_if_errors()

    if new_role != target["role"]:
        _check_role_change(ctx, target, new_role)
    _ensure_unique(ctx.conn, username, email, exclude_id=target["id"])

    updates = {
        "name": name, "email": email, "username": username, "job_title": job_title,
        "role": role,
    }
    sets = [f"{col} = %s" for col, val in updates.items() if val is not None]
    params: list[Any] = [val for val in updates.values() if val is not None]
    if is_admin(ctx.user):
        sets.append("manager_id = %s")
        params.append(manager_id)
        if password:
            sets.append("password_hash = %s")
            params.append(hash_password(password))
    sets.append("updated_at = now()")
    execute(ctx.conn, f"UPDATE users SET {', '.join(sets)} WHERE id = %s", [*params, target["id"]])  # nosec B608
    return 200, public_user(get_user_or_404(ctx.conn, target["id"]))


def _check_role_change(ctx: Context, target: dict, new_role: str) -> None:
    """Block role changes that would orphan projects, teams or the last admin."""
    if target["id"] == ctx.user["id"]:
        raise ConflictError("You cannot change your own role.")
    if target["role"] == "admin" and _active_admin_count(ctx.conn) <= 1:
        raise ConflictError("At least one active admin is required.")
    if target["role"] == "manager":
        owned = fetch_one(ctx.conn, "SELECT count(*) AS n FROM projects WHERE manager_id = %s AND archived_at IS NULL",
                          (target["id"],))["n"]
        team = fetch_one(ctx.conn, "SELECT count(*) AS n FROM users WHERE manager_id = %s AND archived_at IS NULL",
                         (target["id"],))["n"]
        if owned or team:
            raise ConflictError(f"Reassign this manager's {owned} project(s) and {team} team member(s) first.")
    if target["role"] == "employee":
        active = fetch_one(ctx.conn,
                           """SELECT count(*) AS n FROM project_members pm JOIN projects p ON p.id = pm.project_id
                              WHERE pm.user_id = %s AND pm.removed_at IS NULL AND p.archived_at IS NULL""",
                           (target["id"],))["n"]
        if active:
            raise ConflictError(f"Remove this employee from their {active} project(s) before changing their role.")


@router.add("DELETE", "/users/{id}")
def archive_user(ctx: Context) -> tuple[int, None]:
    """Admin-only: archive (soft-delete) a user. Nothing is permanently removed."""
    require_roles(ctx.user, "admin")
    target = get_user_or_404(ctx.conn, parse_id(ctx.params["id"]))
    if target["archived_at"] is not None:
        raise ConflictError("User is already archived.")
    if target["id"] == ctx.user["id"]:
        raise ConflictError("You cannot archive your own account.")
    if target["role"] == "admin" and _active_admin_count(ctx.conn) <= 1:
        raise ConflictError("At least one active admin is required.")
    if target["role"] == "manager":
        _check_role_change(ctx, target, "archived")
    execute(ctx.conn, "UPDATE project_members SET removed_at = now() WHERE user_id = %s AND removed_at IS NULL",
            (target["id"],))
    execute(ctx.conn, "UPDATE milestone_members SET removed_at = now() WHERE user_id = %s AND removed_at IS NULL",
            (target["id"],))
    execute(ctx.conn, "UPDATE users SET archived_at = now(), archived_by = %s WHERE id = %s",
            (ctx.user["id"], target["id"]))
    return 204, None


def ensure_valid_ids(conn: Connection, user_ids: list[int], role: str = "employee") -> None:
    """Validate that every id is an active user with the given role."""
    if not user_ids:
        return
    rows = fetch_all(conn, "SELECT id FROM users WHERE id = ANY(%s) AND role = %s AND archived_at IS NULL",
                     (user_ids, role))
    missing = set(user_ids) - {r["id"] for r in rows}
    if missing:
        raise ValidationError("Some selected people are not active employees.",
                              {"user_ids": f"Invalid employee id(s): {sorted(missing)}"})
