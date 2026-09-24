"""Facility Admin view of tickets: every ticket, whoever created it, with its priority;
assigning tickets to engineers; finishing resolved tickets (close, or send back to the
engineer); and the dashboard's headline counts. Admin notes aren't built.
"""

from typing import Any

import psycopg

import db
from errors import BadRequestError, ConflictError, NotFoundError
from repositories import ticket_repository, user_repository
from schemas import AdminTicketFilters

# Finished tickets keep the engineer who did the work.
UNASSIGNABLE_STATUSES = {"resolved": "Resolved", "closed": "Closed"}


def _get_ticket(conn: psycopg.Connection, ticket_id: int) -> dict[str, Any]:
    """Return any ticket with its admin-only fields, or raise NotFoundError."""
    ticket = ticket_repository.get_admin_detail(conn, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket not found")
    return ticket


def list_tickets(filters: AdminTicketFilters) -> list[dict[str, Any]]:
    """Return all tickets matching the filters, highest priority and longest-waiting first."""
    closed = None if filters.view is None else filters.view == "closed"
    assigned = None if filters.assignment is None else filters.assignment == "assigned"
    with db.transaction() as conn:
        return ticket_repository.list_all(
            conn,
            status=filters.status,
            priority=filters.priority,
            category=filters.category,
            building_id=filters.building_id,
            assigned=assigned,
            assigned_to=filters.assigned_to,
            escalated=filters.escalated,
            closed=closed,
            search=filters.q or None,
        )


def get_ticket(ticket_id: int) -> dict[str, Any]:
    """Return full details of any ticket."""
    with db.transaction() as conn:
        return _get_ticket(conn, ticket_id)


def list_notes(ticket_id: int) -> list[dict[str, Any]]:
    """Return every note on a ticket, from the employee and engineers alike, oldest first."""
    with db.transaction() as conn:
        _get_ticket(conn, ticket_id)
        return ticket_repository.list_notes(conn, ticket_id)


def list_status_history(ticket_id: int) -> list[dict[str, Any]]:
    """Return every status a ticket has been in, oldest first."""
    with db.transaction() as conn:
        _get_ticket(conn, ticket_id)
        return ticket_repository.list_status_history(conn, ticket_id)


def assign_ticket(ticket_id: int, engineer_id: int) -> dict[str, Any]:
    """Give an unfinished ticket to an engineer (or move it to another) and return it.

    The ticket row is locked, so two admins assigning at once can't interleave. Status
    is left alone: the engineer starts the work. Checks, in order: the ticket exists
    (404), isn't resolved or closed (409), the user is an engineer (400), and isn't
    already the assignee (409).
    """
    with db.transaction() as conn:
        ticket_repository.lock(conn, ticket_id)
        ticket = _get_ticket(conn, ticket_id)
        if ticket["status"] in UNASSIGNABLE_STATUSES:
            raise ConflictError(f"{UNASSIGNABLE_STATUSES[ticket['status']]} tickets can't be assigned")

        # Locked too, so the engineer can't be demoted while this assignment commits.
        user_repository.lock(conn, engineer_id)
        engineer = user_repository.get_by_id(conn, engineer_id)
        if engineer is None or engineer["role"] != "engineer":
            raise BadRequestError(f"User {engineer_id} is not an engineer")
        if ticket["assigned_to_user_id"] == engineer_id:
            raise ConflictError(f"This ticket is already assigned to {engineer['full_name']}")

        ticket_repository.assign(conn, ticket_id, engineer_id)
        return ticket_repository.get_admin_detail(conn, ticket_id)


def get_metrics() -> dict[str, Any]:
    """Return the admin dashboard's headline counts."""
    with db.transaction() as conn:
        return ticket_repository.count_metrics(conn)


def finish_resolved(admin_id: int, ticket_id: int, status: str, reason: str | None) -> dict[str, Any]:
    """Close a resolved ticket, or send it back to its engineer (in progress), and return it.

    Only resolved tickets can be finished: closed is final, and anything earlier is still
    the engineer's to work. Sending back needs the engineer to still be one, since a
    resolved ticket can't be reassigned. The status change and its history row are written
    together, with the ticket (and engineer) locked.
    """
    action = "closed" if status == "closed" else "sent back"
    with db.transaction() as conn:
        ticket_repository.lock(conn, ticket_id)
        ticket = _get_ticket(conn, ticket_id)
        if ticket["status"] == "closed":
            raise ConflictError("This ticket is already closed")
        if ticket["status"] != "resolved":
            raise ConflictError(f"Only resolved tickets can be {action}")

        if status == "in_progress":
            engineer_id = ticket["assigned_to_user_id"]
            user_repository.lock(conn, engineer_id)
            engineer = user_repository.get_by_id(conn, engineer_id)
            if engineer["role"] != "engineer":
                raise ConflictError(
                    f"{engineer['full_name']} is no longer an engineer, so it can't go back to them. "
                    "Close it, or make them an engineer again."
                )

        ticket_repository.set_status(conn, ticket_id, status)
        ticket_repository.insert_status_change(
            conn,
            ticket_id,
            from_status="resolved",
            to_status=status,
            changed_by_user_id=admin_id,
            reason=reason,
        )
        return ticket_repository.get_admin_detail(conn, ticket_id)

