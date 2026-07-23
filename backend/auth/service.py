"""
Database operations for users.

Every query is parameterised. `role` is always joined in from the roles table
so callers get the role name rather than an opaque role_id.
"""

from _shared import db

# Joined into every read so serialise_user() always has a `role` name.
_SELECT = """
    SELECT u.id, u.email, u.password_hash, u.full_name, u.is_active,
           u.created_at, u.updated_at, r.name AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
"""


def find_by_email(email):
    """Case-insensitive lookup -- emails are stored lowercased by validation."""
    return db.query(f"{_SELECT} WHERE lower(u.email) = lower(%s)", (email,), one=True)


def find_by_id(user_id):
    return db.query(f"{_SELECT} WHERE u.id = %s", (user_id,), one=True)


def list_users(search=None, role=None):
    sql = _SELECT
    params = []
    conditions = []

    if search:
        conditions.append("(u.full_name ILIKE %s OR u.email ILIKE %s)")
        like = f"%{search}%"
        params.extend([like, like])

    if role:
        conditions.append("r.name = %s")
        params.append(role)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY u.full_name"
    return db.query(sql, params)


def count_users():
    """Used to decide whether a registration is the bootstrap Admin."""
    row = db.query("SELECT COUNT(*) AS total FROM users", one=True)
    return int(row["total"]) if row else 0


def create_user(email, password_hash, full_name, role):
    """Inserts a user and returns the created row.

    The role is resolved by name in a subquery, so an unknown role raises a
    NOT NULL violation rather than silently creating a user with no permissions.
    """
    return db.execute(
        """
        INSERT INTO users (email, password_hash, full_name, role_id)
        VALUES (%s, %s, %s, (SELECT id FROM roles WHERE name = %s))
        RETURNING id
        """,
        (email, password_hash, full_name, role),
        one=True,
    )


def update_user(user_id, full_name=None, role=None, is_active=None):
    """Applies only the fields that were supplied.

    Returns None when the id does not exist, which routes.py turns into a 404.
    """
    sets = []
    params = []

    if full_name is not None:
        sets.append("full_name = %s")
        params.append(full_name)

    if role is not None:
        sets.append("role_id = (SELECT id FROM roles WHERE name = %s)")
        params.append(role)

    if is_active is not None:
        sets.append("is_active = %s")
        params.append(is_active)

    if not sets:
        return find_by_id(user_id)

    params.append(user_id)
    updated = db.execute(
        f"UPDATE users SET {', '.join(sets)} WHERE id = %s RETURNING id",
        params,
        one=True,
    )
    return find_by_id(updated["id"]) if updated else None


def update_password(user_id, password_hash):
    return db.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s RETURNING id",
        (password_hash, user_id),
        one=True,
    )


def delete_user(user_id):
    """Returns the deleted id, or None when nothing matched."""
    return db.execute("DELETE FROM users WHERE id = %s RETURNING id", (user_id,), one=True)


def count_admins(exclude_id=None):
    """Counts active Admins, optionally ignoring one.

    Used to stop the last Admin demoting or deleting themselves and leaving the
    system with nobody able to manage users.
    """
    sql = """
        SELECT COUNT(*) AS total
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'Admin' AND u.is_active = TRUE
    """
    params = []
    if exclude_id:
        sql += " AND u.id <> %s"
        params.append(exclude_id)

    row = db.query(sql, params, one=True)
    return int(row["total"]) if row else 0
