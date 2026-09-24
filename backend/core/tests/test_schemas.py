"""Request validation that doesn't need the database."""

import pytest
from pydantic import ValidationError

from schemas import LoginRequest, RegisterRequest, TicketCreate, TicketFilters

VALID_TICKET = {
    "title": "t",
    "description": "d",
    "category": "network",
    "building_id": 1,
}


def test_register_trims_and_lowercases_email() -> None:
    body = RegisterRequest(
        email="  Jane.Doe@ACME.inc ", full_name=" Jane ", password="password123"
    )
    assert body.email == "jane.doe@acme.inc"
    assert body.full_name == "Jane"


@pytest.mark.parametrize(
    "email", ["jane@gmail.com", "jane@acme.inc.evil.com", "jane@notacme.inc", "@acme.inc", "a b@acme.inc"]
)
def test_register_rejects_non_acme_emails(email: str) -> None:
    with pytest.raises(ValidationError, match="acme.inc"):
        RegisterRequest(email=email, full_name="Jane", password="password123")


def test_register_does_not_trim_passwords() -> None:
    assert RegisterRequest(email="j@acme.inc", full_name="J", password=" padded pw ").password == " padded pw "


def test_login_lowercases_email_without_domain_check() -> None:
    assert LoginRequest(email="Someone@Gmail.com", password="x").email == "someone@gmail.com"


@pytest.mark.parametrize(
    ("location", "scope"),
    [
        ({}, "building"),
        ({"floor_id": 3}, "building"),
        ({"floor_id": 3}, "floor"),
        ({"floor_id": 3, "seat_id": 7}, "floor"),
        ({"floor_id": 3, "seat_id": 7}, "me"),
    ],
)
def test_ticket_accepts_minimum_location_per_scope(location: dict, scope: str) -> None:
    TicketCreate(**VALID_TICKET, **location, affected_scope=scope)


@pytest.mark.parametrize(
    ("location", "scope", "message"),
    [
        ({"seat_id": 7}, "building", "A seat_id requires a floor_id"),
        ({}, "floor", "Floor-wide issues need a floor_id"),
        ({}, "me", "need a floor_id and seat_id"),
        ({"floor_id": 3}, "me", "need a floor_id and seat_id"),
    ],
)
def test_ticket_rejects_missing_location_levels(location: dict, scope: str, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        TicketCreate(**VALID_TICKET, **location, affected_scope=scope)


def test_ticket_trims_text_and_rejects_blank_title() -> None:
    ticket = TicketCreate(**{**VALID_TICKET, "title": "  Printer  "}, affected_scope="building")
    assert ticket.title == "Printer"
    with pytest.raises(ValidationError):
        TicketCreate(**{**VALID_TICKET, "title": "   "}, affected_scope="building")


def test_filters_reject_unknown_values() -> None:
    with pytest.raises(ValidationError):
        TicketFilters(view="archived")
