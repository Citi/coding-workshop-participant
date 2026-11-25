"""Unit tests for the HTTP layer, router and validation helpers (no database)."""

import base64
import json
from datetime import date
from decimal import Decimal

import pytest

from app.core.errors import MethodNotAllowedError, NotFoundError, ValidationError
from app.core.http import Request, Response, json_default, normalize_path, parse_event, to_lambda_response
from app.core.router import Router
from app.core.validation import (
    ApiModel,
    Email,
    Name150,
    parse_body,
    query_bool,
    query_date,
    query_enum,
    query_enum_list,
    query_int,
    query_str,
)

HEALTH = ("on_track", "at_risk", "overdue")


class TestNormalizePath:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("/projects", "/projects"),
            ("//projects/", "/projects"),
            ("/api/pm-service/projects/5", "/projects/5"),
            ("/api/pm-service", "/"),
            ("", "/"),
            ("/health", "/health"),
        ],
    )
    def test_strips_cloud_prefix_and_duplicate_slashes(self, raw, expected):
        assert normalize_path(raw) == expected


class TestParseEvent:
    def test_reads_lambda_url_event(self):
        req = parse_event(
            {
                "rawPath": "/api/pm-service/projects",
                "requestContext": {"http": {"method": "post"}, "requestId": "abc"},
                "headers": {"Authorization": "Bearer x"},
                "queryStringParameters": {"status": "active"},
                "body": '{"a": 1}',
            }
        )
        assert (req.method, req.path, req.request_id) == ("POST", "/projects", "abc")
        assert req.headers["authorization"] == "Bearer x"
        assert req.query == {"status": "active"}
        assert req.json() == {"a": 1}

    def test_decodes_base64_body(self):
        body = base64.b64encode(b'{"x": true}').decode()
        req = parse_event({"rawPath": "/", "body": body, "isBase64Encoded": True})
        assert req.json() == {"x": True}

    def test_invalid_base64_is_a_validation_error(self):
        with pytest.raises(ValidationError):
            parse_event({"rawPath": "/", "body": "%%%not-base64", "isBase64Encoded": True})

    def test_malformed_json_raises_invalid_json(self):
        with pytest.raises(ValidationError) as exc:
            Request("POST", "/", body="{bad").json()
        assert exc.value.code == "INVALID_JSON"

    def test_empty_body_is_none(self):
        assert Request("POST", "/", body="  ").json() is None


class TestResponses:
    def test_serialises_dates_and_decimals(self):
        result = to_lambda_response(Response(200, {"d": date(2026, 1, 2), "m": Decimal("1.50")}))
        assert json.loads(result["body"]) == {"d": "2026-01-02", "m": 1.5}
        assert result["headers"]["Content-Type"] == "application/json"

    def test_no_content_has_empty_body(self):
        assert to_lambda_response(Response(204, {"ignored": True}))["body"] == ""

    def test_json_default_rejects_unknown_types(self):
        with pytest.raises(TypeError):
            json_default(object())


class TestRouter:
    def setup_method(self):
        self.router = Router()
        self.router.add("GET", "/projects", lambda r: "list", permission="projects:read")
        self.router.add("GET", "/projects/{id}", lambda r: "one")

    def test_matches_and_converts_ids(self):
        route, params = self.router.resolve("GET", "/projects/42")
        assert route.pattern == "/projects/{id}" and params == {"id": 42}

    def test_unknown_path_is_404(self):
        with pytest.raises(NotFoundError):
            self.router.resolve("GET", "/nope")

    def test_wrong_method_is_405(self):
        with pytest.raises(MethodNotAllowedError):
            self.router.resolve("DELETE", "/projects")

    @pytest.mark.parametrize("bad", ["abc", "0", "-1", "99999999999"])
    def test_invalid_id_is_400(self, bad):
        with pytest.raises(ValidationError):
            self.router.resolve("GET", f"/projects/{bad}")


class _Sample(ApiModel):
    name: Name150
    email: Email


class TestBodyValidation:
    def _req(self, body):
        return Request("POST", "/", body=json.dumps(body) if body is not None else None)

    def test_valid_body_is_normalised(self):
        model = parse_body(_Sample, self._req({"name": "  Apollo ", "email": " A@Acme.COM ", "extra": 1}))
        assert model.name == "Apollo" and model.email == "a@acme.com"

    def test_missing_and_invalid_fields_are_reported_per_field(self):
        with pytest.raises(ValidationError) as exc:
            parse_body(_Sample, self._req({"name": "", "email": "nope"}))
        assert exc.value.details == {"name": "This field is required", "email": "Must be a valid email address"}

    def test_body_required(self):
        with pytest.raises(ValidationError) as exc:
            parse_body(_Sample, self._req(None))
        assert "body" in exc.value.details

    def test_body_must_be_object(self):
        with pytest.raises(ValidationError):
            parse_body(_Sample, self._req([1, 2]))


class TestQueryHelpers:
    def _req(self, **query):
        return Request("GET", "/", query=query)

    def test_parses_valid_values(self):
        req = self._req(q=" hi ", n="7", b="TRUE", e="active", d="2026-05-01")
        assert query_str(req, "q") == "hi"
        assert query_int(req, "n") == 7
        assert query_bool(req, "b") is True
        assert query_enum(req, "e", ("active", "planned")) == "active"
        assert query_date(req, "d") == date(2026, 5, 1)

    def test_absent_values_are_none(self):
        req = self._req(q="  ")
        assert query_str(req, "q") is None and query_int(req, "n") is None and query_bool(req, "b") is None

    @pytest.mark.parametrize(
        "helper, value",
        [(query_int, "x"), (query_int, "0"), (query_bool, "maybe"), (query_date, "2026-13-01")],
    )
    def test_invalid_values_raise(self, helper, value):
        with pytest.raises(ValidationError):
            helper(self._req(p=value), "p")

    def test_enum_rejects_unknown_value(self):
        with pytest.raises(ValidationError):
            query_enum(self._req(p="x"), "p", ("a", "b"))

    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("at_risk", ("at_risk",)),
            ("at_risk,overdue", ("at_risk", "overdue")),
            (" overdue , at_risk ", ("overdue", "at_risk")),
            ("at_risk,,at_risk,", ("at_risk",)),
            ("on_track,at_risk,overdue", HEALTH),
        ],
    )
    def test_enum_list_trims_skips_empty_items_and_drops_duplicates(self, raw, expected):
        assert query_enum_list(self._req(p=raw), "p", HEALTH) == expected

    @pytest.mark.parametrize("query", [{}, {"p": "  "}, {"p": " , ,"}])
    def test_enum_list_without_values_is_none(self, query):
        assert query_enum_list(self._req(**query), "p", HEALTH) is None

    @pytest.mark.parametrize("raw", ["red", "at_risk,red", "AT_RISK", "at_risk;overdue"])
    def test_enum_list_rejects_any_unknown_value(self, raw):
        with pytest.raises(ValidationError) as exc:
            query_enum_list(self._req(p=raw), "p", iter(HEALTH))  # any iterable of allowed values
        assert exc.value.details == {"p": "Must be one of: on_track, at_risk, overdue"}

    @pytest.mark.parametrize(
        "raw, message",
        [
            # the whole raw value goes through query_str first: its length and NUL rules apply
            ("at_risk," * 25 + "x", "Must be at most 200 characters"),
            ("at_risk,\x00overdue", "Must not contain NUL characters"),
            ("at_risk\x00", "Must not contain NUL characters"),
        ],
    )
    def test_enum_list_keeps_the_query_string_limits(self, raw, message):
        with pytest.raises(ValidationError) as exc:
            query_enum_list(self._req(p=raw), "p", HEALTH)
        assert exc.value.details == {"p": message}

    def test_enum_list_accepts_a_long_list_of_valid_items_up_to_the_limit(self):
        raw = ",".join(["at_risk"] * 25)  # 199 characters
        assert query_enum_list(self._req(p=raw), "p", HEALTH) == ("at_risk",)

    def test_enum_list_reports_a_bad_single_value_exactly_like_query_enum(self):
        errors = []
        for helper in (query_enum, query_enum_list):
            with pytest.raises(ValidationError) as exc:
                helper(self._req(health="red"), "health", HEALTH)
            errors.append((exc.value.code, exc.value.message, exc.value.details))
        assert errors[0] == errors[1]
        assert errors[0] == (
            "VALIDATION_ERROR",
            "Invalid query parameter 'health'",
            {"health": "Must be one of: on_track, at_risk, overdue"},
        )

    def test_string_length_limit(self):
        with pytest.raises(ValidationError):
            query_str(self._req(p="x" * 201), "p")


class TestSqlHelpers:
    def test_like_pattern_escapes_wildcards(self):
        from app.core.sql import like_pattern

        assert like_pattern("50%_off\\") == "%50\\%\\_off\\\\%"
        assert like_pattern("crm") == "%crm%"
