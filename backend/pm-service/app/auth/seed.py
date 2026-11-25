"""Default accounts (one per role) created the first time the database is initialised.

Seeding only happens while the users table is empty, so accounts an admin deletes later
are not re-created on the next cold start. Credentials are documented in the README.
"""

from app.auth.passwords import hash_password

DEFAULT_USERS = (
    # (email, full name, role, password)
    ("admin@acme.com", "System Administrator", "admin", "Admin@123"),
    ("manager@acme.com", "Project Manager", "manager", "Manager@123"),
    ("contributor@acme.com", "Team Contributor", "contributor", "Contributor@123"),
    ("viewer@acme.com", "Read-only Viewer", "viewer", "Viewer@123"),
)


def seed_default_users(conn) -> None:
    if conn.execute("SELECT EXISTS (SELECT 1 FROM users) AS has_users").fetchone()["has_users"]:
        return
    for email, full_name, role, password in DEFAULT_USERS:
        conn.execute(
            "INSERT INTO users (email, full_name, password_hash, role) VALUES (%s, %s, %s, %s)",
            (email, full_name, hash_password(password), role),
        )
