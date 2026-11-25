"""Unit tests for passwords, tokens and the RBAC permission matrix (no database)."""

from datetime import timedelta

import pytest

from app.auth.passwords import check_password_strength, hash_password, verify_password
from app.auth.permissions import ROLE_PERMISSIONS, has_permission, permissions_for
from app.auth.tokens import ACCESS, REFRESH, create_access_token, create_refresh_token, create_token, decode_token
from app.core.errors import UnauthorizedError

USER = {"id": 7, "role": "manager"}


class TestPasswords:
    def test_hash_and_verify(self):
        hashed = hash_password("Secret123")
        assert hashed != "Secret123"
        assert verify_password("Secret123", hashed)
        assert not verify_password("secret123", hashed)

    def test_verify_never_raises_on_garbage(self):
        assert not verify_password("x", "not-a-bcrypt-hash")

    @pytest.mark.parametrize("weak", ["short1", "lettersonly", "12345678", "a1" * 40])
    def test_policy_rejects_weak_passwords(self, weak):
        with pytest.raises(ValueError):
            check_password_strength(weak)

    def test_policy_accepts_strong_password(self):
        assert check_password_strength("Welcome2026") == "Welcome2026"


class TestTokens:
    def test_access_token_round_trip(self):
        payload = decode_token(create_access_token(USER), ACCESS)
        assert payload["sub"] == "7" and payload["role"] == "manager" and payload["type"] == ACCESS

    def test_refresh_token_cannot_be_used_as_access_token(self):
        with pytest.raises(UnauthorizedError) as exc:
            decode_token(create_refresh_token(USER), ACCESS)
        assert exc.value.code == "INVALID_TOKEN"
        assert decode_token(create_refresh_token(USER), REFRESH)["sub"] == "7"

    def test_expired_token(self):
        token = create_token(USER, ACCESS, timedelta(seconds=-5))
        with pytest.raises(UnauthorizedError) as exc:
            decode_token(token, ACCESS)
        assert exc.value.code == "TOKEN_EXPIRED"

    def test_tampered_token(self):
        token = create_access_token(USER)
        with pytest.raises(UnauthorizedError) as exc:
            decode_token(token[:-2] + ("A" if token[-2] != "A" else "B") + token[-1], ACCESS)
        assert exc.value.code == "INVALID_TOKEN"


class TestPermissions:
    def test_admin_manages_users(self):
        assert has_permission("admin", "users:delete")
        assert not has_permission("manager", "users:read")

    def test_contributor_cannot_delete(self):
        assert has_permission("contributor", "projects:update")
        assert not has_permission("contributor", "projects:delete")

    def test_viewer_is_read_only(self):
        assert all(p.endswith(":read") for p in ROLE_PERMISSIONS["viewer"])
        assert has_permission("viewer", "dashboard:read")

    def test_unknown_role_has_nothing(self):
        assert permissions_for("intruder") == [] and not has_permission("intruder", "projects:read")

    def test_permissions_are_sorted_lists(self):
        perms = permissions_for("manager")
        assert perms == sorted(perms) and "expenses:delete" in perms
