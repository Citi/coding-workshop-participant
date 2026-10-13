"""Unit tests for pure helpers (no database required)."""

from datetime import date
from decimal import Decimal

import pytest

from app.errors import AuthenticationError, NotFoundError, ValidationError
from app.http import Request, normalize_path
from app.metrics import business_days, hours_to_days, percent, planned_hours
from app.router import MethodNotAllowed, Router
from app.security import decode_token, hash_password, issue_tokens, verify_password
from app.validation import Validator, parse_id, query_date


class TestMetrics:
    def test_business_days_full_week(self):
        assert business_days(date(2026, 10, 12), date(2026, 10, 18)) == 5  # Mon..Sun

    def test_business_days_weekend_only(self):
        assert business_days(date(2026, 10, 17), date(2026, 10, 18)) == 0

    def test_business_days_reversed_range(self):
        assert business_days(date(2026, 10, 18), date(2026, 10, 12)) == 0

    @pytest.mark.parametrize("start,end,expected", [
        (date(2026, 1, 1), date(2026, 1, 31), 22),
        (date(2026, 10, 14), date(2026, 10, 14), 1),
        (date(2026, 10, 9), date(2026, 10, 13), 3),  # Fri..Tue
    ])
    def test_business_days_matches_brute_force(self, start, end, expected):
        assert business_days(start, end) == expected

    def test_planned_hours_assumes_eight_hours_per_person_day(self):
        assert planned_hours(date(2026, 10, 12), date(2026, 10, 16), 3) == 5 * 8 * 3

    def test_hours_to_days_and_percent(self):
        assert hours_to_days(Decimal("12")) == 1.5
        assert percent(50, 200) == 25.0
        assert percent(1, 0) is None


class TestValidation:
    def test_collects_all_errors(self):
        v = Validator({"name": "", "email": "bad", "hours": "x"})
        v.string("name", required=True)
        v.email("email", required=True)
        v.decimal("hours", required=True)
        with pytest.raises(ValidationError) as exc:
            v.raise_if_errors()
        assert set(exc.value.details) == {"name", "email", "hours"}

    def test_partial_skips_missing_required(self):
        v = Validator({}, partial=True)
        assert v.string("name", required=True) is None
        v.raise_if_errors()

    def test_partial_rejects_blank_required(self):
        v = Validator({"name": "  "}, partial=True)
        v.string("name", required=True)
        assert "name" in v.errors

    def test_decimal_bounds(self):
        v = Validator({"a": 0, "b": 25, "c": "8.5", "d": True})
        v.decimal("a", min_value=Decimal(0), exclusive_min=True)
        v.decimal("b", max_value=Decimal(24))
        assert v.decimal("c") == Decimal("8.5")
        v.decimal("d")
        assert set(v.errors) == {"a", "b", "d"}

    def test_int_list(self):
        v = Validator({"ids": [3, 3, 1], "bad": [1, "x"]})
        assert v.int_list("ids") == [3, 1]
        v.int_list("bad")
        assert "bad" in v.errors

    def test_date_and_ids(self):
        v = Validator({"d": "2026-13-01"})
        v.date("d")
        assert "d" in v.errors
        assert parse_id("12") == 12
        with pytest.raises(ValidationError):
            parse_id("abc")
        with pytest.raises(ValidationError):
            query_date({"from": "nope"}, "from")


class TestSecurity:
    def test_hash_and_verify(self):
        stored = hash_password("s3cret-pass")
        assert stored.startswith("pbkdf2_sha256$")
        assert verify_password("s3cret-pass", stored)
        assert not verify_password("wrong", stored)
        assert not verify_password("x", "garbage")

    def test_token_roundtrip_and_type_check(self):
        tokens = issue_tokens({"id": 7, "role": "admin"})
        assert decode_token(tokens["access_token"], "access") == 7
        with pytest.raises(AuthenticationError):
            decode_token(tokens["access_token"], "refresh")
        with pytest.raises(AuthenticationError):
            decode_token("not-a-jwt", "access")


class TestHttp:
    @pytest.mark.parametrize("raw,expected", [
        ("/api/tracker/projects/5", "/projects/5"),
        ("/projects/5/", "/projects/5"),
        ("/api/tracker", "/"),
        ("", "/"),
    ])
    def test_normalize_path(self, raw, expected):
        assert normalize_path(raw) == expected

    def test_request_parsing(self):
        req = Request.from_event({
            "rawPath": "/api/tracker/users",
            "requestContext": {"http": {"method": "post"}},
            "headers": {"Authorization": "Bearer abc"},
            "body": '{"a": 1}',
        })
        assert req.method == "POST" and req.path == "/users"
        assert req.bearer_token() == "abc"
        assert req.json() == {"a": 1}

    def test_malformed_json(self):
        with pytest.raises(ValidationError):
            Request(method="POST", path="/", raw_body="{oops").json()
        with pytest.raises(ValidationError):
            Request(method="POST", path="/", raw_body="[1]").json()


class TestRouter:
    def test_resolve(self):
        r = Router()

        @r.add("GET", "/things/{id}")
        def get_thing(ctx):  # pragma: no cover - not invoked
            return 200, {}

        route, params = r.resolve("GET", "/things/9")
        assert route.handler is get_thing and params == {"id": "9"}
        with pytest.raises(MethodNotAllowed):
            r.resolve("POST", "/things/9")
        with pytest.raises(NotFoundError):
            r.resolve("GET", "/nope")
