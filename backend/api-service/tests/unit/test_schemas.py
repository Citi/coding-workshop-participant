"""Request validation (Pydantic schemas) - runs before anything touches the DB."""

import pytest
from pydantic import ValidationError

from app.models import IncidentPriority
from app.schemas.admin import BuildingCreate, EngineerCreate, FloorCreate, SeatUpdate
from app.schemas.auth import LoginIn, RegisterIn
from app.schemas.incident import EscalateIn, IncidentCreate, NoteCreate


def errors(model, **data) -> str:
    with pytest.raises(ValidationError) as exc:
        model(**data)
    return str(exc.value)


# ---------------------------------------------------------------- auth

def test_register_normalises_email_and_name():
    r = RegisterIn(name="  Ada Lovelace ", email=" Ada@ACME.inc ", password="Password123!")
    assert r.name == "Ada Lovelace" and r.email == "ada@acme.inc"


@pytest.mark.parametrize("email", ["ada@gmail.com", "ada@acme.inc.evil.com", "ada@sub.acme.inc", "no-at-sign", "a b@acme.inc"])
def test_register_rejects_non_acme_email(email):
    assert "acme.inc" in errors(RegisterIn, name="Ada", email=email, password="Password123!")


@pytest.mark.parametrize("password, message", [
    ("short", "at least 8"),
    ("x" * 73, "at most 72"),
])
def test_register_password_length(password, message):
    assert message in errors(RegisterIn, name="Ada", email="ada@acme.inc", password=password)


def test_register_requires_name():
    assert "full name" in errors(RegisterIn, name="   ", email="ada@acme.inc", password="Password123!")


def test_login_email_is_case_insensitive():
    assert LoginIn(email=" Emma@ACME.INC", password="x").email == "emma@acme.inc"


# ---------------------------------------------------------------- incidents

BASE = dict(title="Leak", description="Water on floor", category="plumbing", building_id=1)


def test_incident_defaults_and_trimming():
    inc = IncidentCreate(**{**BASE, "title": "  Leak  "})
    assert inc.title == "Leak" and inc.priority == IncidentPriority.MEDIUM


@pytest.mark.parametrize("field, value", [
    ("title", "   "), ("title", "x" * 201), ("description", ""),
    ("category", "plumbingg"), ("priority", "urgent"), ("building_id", "abc"),
])
def test_incident_invalid_fields(field, value):
    errors(IncidentCreate, **{**BASE, field: value})


def test_incident_missing_required():
    msg = errors(IncidentCreate, title="Leak")
    for field in ("description", "category", "building_id"):
        assert field in msg


def test_note_and_escalation_require_text():
    errors(NoteCreate, body="  ")
    errors(EscalateIn, reason="")
    assert EscalateIn(reason=" urgent ").reason == "urgent"


# ---------------------------------------------------------------- facilities / engineers

def test_building_code_uppercased_and_blank_optional_becomes_none():
    b = BuildingCreate(code=" hq2 ", name="HQ Two", city="   ")
    assert b.code == "HQ2" and b.city is None


def test_floor_number_range():
    errors(FloorCreate, building_id=1, floor_number=301)
    assert FloorCreate(building_id=1, floor_number=-2).floor_number == -2


def test_seat_update_optional_fields():
    assert SeatUpdate(description=None).description is None
    errors(SeatUpdate, seat_code="  ")


def test_engineer_create_validates_like_registration():
    e = EngineerCreate(name="Eve", email="EVE@acme.inc", password="Password123!", specializations=["hvac"])
    assert e.email == "eve@acme.inc" and e.max_active_tickets == 5
    errors(EngineerCreate, name="Eve", email="eve@acme.inc", password="Password123!", specializations=["magic"])
    errors(EngineerCreate, name="Eve", email="eve@acme.inc", password="Password123!", max_active_tickets=0)
