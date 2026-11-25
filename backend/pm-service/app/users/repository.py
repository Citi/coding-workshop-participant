"""SQL for the users table (admin CRUD). Every value is passed as a query parameter.

Queries return ``PUBLIC_USER_COLUMNS`` only, so ``password_hash`` is written here but never read back.
Look-ups by id reuse ``app.auth.repository.find_by_id``.
"""

from app.auth.repository import PUBLIC_USER_COLUMNS
from app.core.sql import like_pattern

_LIST_SQL = f"""
SELECT {PUBLIC_USER_COLUMNS}
FROM users
WHERE (%(search)s::text IS NULL
       OR full_name ILIKE %(search)s ESCAPE '\\'
       OR email ILIKE %(search)s ESCAPE '\\')
  AND (%(role)s::text IS NULL OR role = %(role)s)
  AND (%(is_active)s::boolean IS NULL OR is_active = %(is_active)s)
ORDER BY lower(full_name), id
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters

_EMAIL_TAKEN_SQL = """
SELECT EXISTS (
    SELECT 1 FROM users
    WHERE lower(email) = lower(%(email)s) AND id IS DISTINCT FROM %(exclude_id)s::int
) AS taken
"""

_INSERT_SQL = f"""
INSERT INTO users (email, full_name, role, is_active, password_hash)
VALUES (%(email)s, %(full_name)s, %(role)s, %(is_active)s, %(password_hash)s)
RETURNING {PUBLIC_USER_COLUMNS}
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters

# A NULL password_hash keeps the stored one (PUT only carries a password when it changes).
_UPDATE_SQL = f"""
UPDATE users
SET email = %(email)s, full_name = %(full_name)s, role = %(role)s, is_active = %(is_active)s,
    password_hash = COALESCE(%(password_hash)s::text, password_hash), updated_at = now()
WHERE id = %(id)s
RETURNING {PUBLIC_USER_COLUMNS}
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters


def list_users(conn, *, search=None, role=None, is_active=None) -> list[dict]:
    """Users matching the filters, sorted by full name; ``search`` matches the name or the email."""
    params = {"search": like_pattern(search) if search else None, "role": role, "is_active": is_active}
    return conn.execute(_LIST_SQL, params).fetchall()


def email_taken(conn, email: str, *, exclude_id: int | None = None) -> bool:
    """Case-insensitive email check; ``exclude_id`` skips the user being updated."""
    return conn.execute(_EMAIL_TAKEN_SQL, {"email": email, "exclude_id": exclude_id}).fetchone()["taken"]


def insert_user(conn, values: dict) -> dict:
    """Insert a user (``values`` carries the bcrypt ``password_hash``) and return the public row."""
    return conn.execute(_INSERT_SQL, values).fetchone()


def update_user(conn, user_id: int, values: dict) -> dict | None:
    """Overwrite the editable columns (a ``password_hash`` of None keeps the password) and return the row."""
    return conn.execute(_UPDATE_SQL, {**values, "id": user_id}).fetchone()


def delete_user(conn, user_id: int) -> bool:
    """Delete a user; False when the id is unknown."""
    return conn.execute("DELETE FROM users WHERE id = %s", (user_id,)).rowcount > 0
