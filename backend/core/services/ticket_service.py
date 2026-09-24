"""Ticket rules: initial priority, location hierarchy and ownership.

Priority is stored for engineer/admin triage; employee responses never include it.
"""

from typing import Any

import psycopg

import db
from errors import BadRequestError, ConflictError, NotFoundError
from repositories import location_repository, ticket_repository
from schemas import TicketCreate, TicketFilters

# Initial priority from the blueprint. Facility Admins can override it later.
PRIORITY_BY_SCOPE = {"building": "P1", "floor": "P2", "me": "P3"}


def _check_location(conn: psycopg.Connection, data: TicketCreate) -> None:
    """Make sure the building exists, the floor is in it and the seat is on that floor.

    Each level must also be active. Checking the whole chain means a seat under an
    inactive floor or building is refused too, as the dropdowns no longer offer it.
    """
    building = location_repository.get_building(conn, data.building_id)
    if building is None:
        raise BadRequestError(f"Building {data.building_id} does not exist")
    if not building["is_active"]:
        raise BadRequestError(f"{building['building_name']} is no longer available")

    if data.floor_id is not None:
        floor = location_repository.get_floor(conn, data.floor_id)
        if floor is None:
            raise BadRequestError(f"Floor {data.floor_id} does not exist")
        if floor["building_id"] != data.building_id:
            raise BadRequestError(
                f"Floor {data.floor_id} is not in building {data.building_id}"
            )
        if not floor["is_active"]:
            raise BadRequestError(f"Floor {floor['floor_number']} is no longer available")

    if data.seat_id is not None:
        seat = location_repository.get_seat(conn, data.seat_id)
        if seat is None:
            raise BadRequestError(f"Seat {data.seat_id} does not exist")
        if seat["floor_id"] != data.floor_id:
            raise BadRequestError(f"Seat {data.seat_id} is not on floor {data.floor_id}")
        if not seat["is_active"]:
            raise BadRequestError(f"Seat {seat['seat_number']} is no longer available")


def _get_own_ticket(conn: psycopg.Connection, user_id: int, ticket_id: int) -> dict[str, Any]:
    """Return the caller's ticket. Someone else's ticket is 'not found', so its existence stays private."""
    ticket = ticket_repository.get_detail(conn, ticket_id)
    if ticket is None or ticket["created_by_user_id"] != user_id:
        raise NotFoundError("Ticket not found")
    return ticket


def get_my_ticket(user_id: int, ticket_id: int) -> dict[str, Any]:
    """Return full details of one of the caller's tickets."""
    with db.transaction() as conn:
        return _get_own_ticket(conn, user_id, ticket_id)


def list_notes(user_id: int, ticket_id: int) -> list[dict[str, Any]]:
    """Return the history of notes on one of the caller's tickets."""
    with db.transaction() as conn:
        _get_own_ticket(conn, user_id, ticket_id)
        return ticket_repository.list_notes(conn, ticket_id)


def list_status_history(user_id: int, ticket_id: int) -> list[dict[str, Any]]:
    """Return every status one of the caller's tickets has been in, oldest first."""
    with db.transaction() as conn:
        _get_own_ticket(conn, user_id, ticket_id)
        return ticket_repository.list_status_history(conn, ticket_id)


def add_note(user_id: int, ticket_id: int, note_text: str) -> dict[str, Any]:
    """Add a note to one of the caller's open tickets and bump its updated_at."""
    with db.transaction() as conn:
        ticket_repository.lock(conn, ticket_id)
        ticket = _get_own_ticket(conn, user_id, ticket_id)
        if ticket["status"] == "closed":
            raise ConflictError("Closed tickets can't take new notes")
        note = ticket_repository.insert_note(conn, ticket_id, user_id, note_text)
        ticket_repository.touch(conn, ticket_id)
        return note


def request_escalation(user_id: int, ticket_id: int, reason: str) -> dict[str, Any]:
    """Ask a Facility Admin to review one of the caller's tickets. Once per ticket."""
    with db.transaction() as conn:
        ticket_repository.lock(conn, ticket_id)
        ticket = _get_own_ticket(conn, user_id, ticket_id)
        if ticket["status"] == "closed":
            raise ConflictError("Closed tickets can't be escalated")
        if ticket["escalation_requested"]:
            raise ConflictError("Escalation has already been requested for this ticket")
        ticket_repository.request_escalation(conn, ticket_id, reason)
        return ticket_repository.get_detail(conn, ticket_id)


def list_my_tickets(user_id: int, filters: TicketFilters) -> list[dict[str, Any]]:
    """Return the caller's own tickets, filtered. Never includes anyone else's."""
    closed = None if filters.view is None else filters.view == "closed"
    with db.transaction() as conn:
        return ticket_repository.list_for_creator(
            conn,
            user_id,
            status=filters.status,
            closed=closed,
            search=filters.q or None,
        )


def create_ticket(user_id: int, data: TicketCreate) -> dict[str, Any]:
    """Validate the location and create an open ticket owned by the caller.

    The ticket's status history starts with its creation, in the same transaction.
    """
    with db.transaction() as conn:
        _check_location(conn, data)
        ticket = ticket_repository.insert(
            conn,
            title=data.title,
            description=data.description,
            category=data.category,
            affected_scope=data.affected_scope,
            priority=PRIORITY_BY_SCOPE[data.affected_scope],
            building_id=data.building_id,
            floor_id=data.floor_id,
            seat_id=data.seat_id,
            created_by_user_id=user_id,
        )
        ticket_repository.insert_status_change(
            conn,
            ticket["ticket_id"],
            from_status=None,
            to_status=ticket["status"],
            changed_by_user_id=user_id,
        )
        return ticket
