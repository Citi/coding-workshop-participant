"""User lookups needed by authentication (the admin CRUD lives in ``app.users``)."""

PUBLIC_USER_COLUMNS = "id, email, full_name, role, is_active, created_at, updated_at"


def find_by_email_with_password(conn, email: str) -> dict | None:
    return conn.execute(
        f"""SELECT {PUBLIC_USER_COLUMNS}, password_hash FROM users
            WHERE lower(email) = lower(%s)""",  # nosec B608 # constant columns; the email is a bound parameter
        (email,),
    ).fetchone()


def find_by_id(conn, user_id: int) -> dict | None:
    return conn.execute(
        f"SELECT {PUBLIC_USER_COLUMNS} FROM users WHERE id = %s",  # nosec B608 # constant columns; the id is bound
        (user_id,),
    ).fetchone()
