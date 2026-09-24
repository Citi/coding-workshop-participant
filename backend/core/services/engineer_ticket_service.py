"""An engineer's own queue: the tickets currently assigned to them, with priority and the
requester's contact details, plus their notes, status history and status changes.

Any other ticket (unassigned, someone else's, or reassigned away) is "not found", so an
engineer can't learn about tickets that aren't theirs.

The workflow engineers can move a ticket through (closing is for admins):

    open --start--> in_progress --resolve--> resolved
                      |    ^                    |
               block  |    | unblock            | reopen
                      v    |                    v
                     blocked                in_progress
"""

from typing import Any

import psycopg

import db
from errors import ConflictError, NotFoundError
from repositories import ticket_repository
from schemas import EngineerTicketFilters

# Where an engineer can move a ticket from each status.
ALLOWED_MOVES = {
    "open": {"in_progress"},
    "in_progress": {"blocked", "resolved"},
    "blocked": {"in_progress"},
    "resolved": {"in_progress"},
    "closed": set(),
}
LABELS = {
    "open": "Open",
    "in_progress": "In progress",
    "blocked": "Blocked",
    "resolved": "Resolved",
    "closed": "Closed",
}
# What to do first when a move isn't allowed from this status.
NEXT_STEP = {"open": "Start work first.", "blocked": "Unblock it first.", "resolved": "Reopen it first."}


def _get_assigned_ticket(conn: psycopg.Connection, user_id: int, ticket_id: int) -> dict[str, Any]:
    """Return the ticket if it's assigned to this engineer, else raise NotFoundError."""
    ticket = ticket_repository.get_admin_detail(conn, ticket_id)
    if ticket is None or ticket["assigned_to_user_id"] != user_id:
        raise NotFoundError("Ticket not found")
    return ticket


def list_my_queue(user_id: int, filters: EngineerTicketFilters) -> list[dict[str, Any]]:
    """Return the engineer's tickets matching the filters, P1 first then longest-waiting."""
    closed = None if filters.view is None else filters.view == "closed"
    with db.transaction() as conn:
        return ticket_repository.list_all(
            conn,
            status=filters.status,
            priority=filters.priority,
            category=None,
            building_id=filters.building_id,
            assigned=None,
            assigned_to=user_id,
            escalated=None,
            closed=closed,
            search=filters.q or None,
        )


def get_ticket(user_id: int, ticket_id: int) -> dict[str, Any]:
    """Return full details of one of the engineer's tickets."""
    with db.transaction() as conn:
        return _get_assigned_ticket(conn, user_id, ticket_id)


def list_notes(user_id: int, ticket_id: int) -> list[dict[str, Any]]:
    """Return every note on one of the engineer's tickets, oldest first."""
    with db.transaction() as conn:
        _get_assigned_ticket(conn, user_id, ticket_id)
        return ticket_repository.list_notes(conn, ticket_id)


def list_status_history(user_id: int, ticket_id: int) -> list[dict[str, Any]]:
    """Return every status one of the engineer's tickets has been in, oldest first."""
    with db.transaction() as conn:
        _get_assigned_ticket(conn, user_id, ticket_id)
        return ticket_repository.list_status_history(conn, ticket_id)


def add_note(user_id: int, ticket_id: int, note_text: str) -> dict[str, Any]:
    """Add a note to one of the engineer's unclosed tickets and bump its updated_at.

    The ticket row is locked, so it can't be reassigned or closed while the note is added.
    """
    with db.transaction() as conn:
        ticket_repository.lock(conn, ticket_id)
        ticket = _get_assigned_ticket(conn, user_id, ticket_id)
        if ticket["status"] == "closed":
            raise ConflictError("Closed tickets can't take new notes")
        note = ticket_repository.insert_note(conn, ticket_id, user_id, note_text)
        ticket_repository.touch(conn, ticket_id)
        return note


def _check_move(current: str, target: str) -> None:
    """Raise ConflictError with a helpful message unless current -> target is allowed."""
    if current == target:
        raise ConflictError(f"This ticket is already {LABELS[target].lower()}")
    if current == "closed":
        raise ConflictError("Closed tickets can't change status")
    if target not in ALLOWED_MOVES[current]:
        raise ConflictError(f"{LABELS[current]} tickets can't be {target}. {NEXT_STEP[current]}")


def change_status(user_id: int, ticket_id: int, status: str, reason: str | None) -> dict[str, Any]:
    """Move one of the engineer's tickets along the workflow and return it.

    The status, its dependent fields (blocked_reason, resolved_at) and the history row are
    written in one transaction, with the ticket locked so it can't be reassigned or closed
    halfway. The reason (required for blocked and resolved, see StatusChangeRequest) is
    kept on the history row, and as the blocked reason while blocked.
    """
    with db.transaction() as conn:
        ticket_repository.lock(conn, ticket_id)
        ticket = _get_assigned_ticket(conn, user_id, ticket_id)
        _check_move(ticket["status"], status)
        ticket_repository.set_status(
            conn, ticket_id, status, blocked_reason=reason if status == "blocked" else None
        )
        ticket_repository.insert_status_change(
            conn,
            ticket_id,
            from_status=ticket["status"],
            to_status=status,
            changed_by_user_id=user_id,
            reason=reason,
        )
        return ticket_repository.get_admin_detail(conn, ticket_id)
