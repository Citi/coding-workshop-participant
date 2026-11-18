"""Registration, login and token handling."""

from datetime import datetime, timedelta, timezone

import jwt

from app.core import config
from tests.integration.conftest import PASSWORD


def register(client, email="new.person@acme.inc", **extra):
    return client.post("/auth/register", json={"name": "New Person", "email": email, "password": PASSWORD, **extra})


def login(client, email, password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_register_creates_employee_and_can_log_in(client):
    r = register(client, email="New.Person@ACME.inc")
    assert r.status_code == 201
    user = r.json()["user"]
    assert user["role"] == "employee" and user["email"] == "new.person@acme.inc"
    assert "password" not in r.text and "hash" not in r.text

    token = login(client, "new.person@acme.inc").json()["token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["id"] == user["id"]


def test_register_cannot_choose_role(client):
    """Privilege escalation guard: extra 'role' input is ignored."""
    r = register(client, role="facility_admin")
    assert r.status_code == 201 and r.json()["user"]["role"] == "employee"


def test_register_duplicate_email_is_conflict(client):
    r = register(client, email="EMMA@acme.inc")
    assert r.status_code == 409
    assert r.json() == {"message": "An account with this email already exists."}


def test_register_validation_errors(client):
    r = register(client, email="someone@gmail.com")
    assert r.status_code == 422 and "acme.inc" in r.json()["message"]
    r = client.post("/auth/register", json={"email": "x@acme.inc"})
    assert r.status_code == 422 and r.json()["errors"]


def test_login_returns_token_and_user(client):
    r = login(client, " Alice.Admin@ACME.inc ")
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "facility_admin"
    claims = jwt.decode(body["token"], config.JWT_SECRET, algorithms=["HS256"])
    assert claims["sub"] == str(body["user"]["id"])


def test_login_failures_do_not_reveal_which_part_was_wrong(client):
    wrong_pw = login(client, "emma@acme.inc", "nope")
    unknown = login(client, "ghost@acme.inc")
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json() == {"message": "Invalid email or password."}


def test_disabled_account_cannot_log_in(client, seed_conn):
    seed_conn.execute("UPDATE users SET is_active = FALSE WHERE email = 'liam.lee@acme.inc'")
    r = login(client, "liam.lee@acme.inc")
    assert r.status_code == 403 and "disabled" in r.json()["message"]


def test_protected_endpoints_require_a_valid_token(client):
    assert client.get("/incidents").status_code == 401
    assert client.get("/auth/me").json() == {"message": "Please sign in."}
    r = client.get("/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401 and "Invalid session" in r.json()["message"]


def test_expired_token_gets_clear_message(client):
    past = datetime.now(timezone.utc) - timedelta(hours=9)
    token = jwt.encode({"sub": "6", "role": "employee", "iat": past, "exp": past + timedelta(hours=8)},
                       config.JWT_SECRET, algorithm="HS256")
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401 and "expired" in r.json()["message"]


def test_token_stops_working_when_account_is_deactivated(client, as_, seed_conn):
    headers = as_("noah")
    assert client.get("/auth/me", headers=headers).status_code == 200
    seed_conn.execute("UPDATE users SET is_active = FALSE WHERE email = 'noah.patel@acme.inc'")
    r = client.get("/auth/me", headers=headers)
    assert r.status_code == 401 and "no longer active" in r.json()["message"]
