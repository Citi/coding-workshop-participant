"""SQL for the tickets, ticket_notes and ticket_status_history tables."""

from typing import Any

import psycopg

from repositories.sql_text import like_pattern


def list_for_creator(
    conn: psycopg.Connection,
    user_id: int,
    *,
    status: str | None,
    closed: bool | None,
    search: str | None,
) -> list[dict[str, Any]]:
    """Return one user's tickets with location names, most recently updated first.

    Each filter is skipped when its value is None, so the SQL text never changes.
    """
    return conn.execute(
        """
        SELECT
            t.ticket_id, t.title, t.category, t.status,
            t.affected_scope, t.escalation_requested,
            t.building_id, b.building_name, t.floor_id, f.floor_number,
            t.seat_id, s.seat_number, t.created_at, t.updated_at
        FROM tickets t
        JOIN buildings b ON b.building_id = t.building_id
        LEFT JOIN floors f ON f.floor_id = t.floor_id
        LEFT JOIN seats s ON s.seat_id = t.seat_id
        WHERE t.created_by_user_id = %(user_id)s
          AND (%(status)s::text IS NULL OR t.status = %(status)s)
          AND (%(closed)s::boolean IS NULL OR (t.status = 'closed') = %(closed)s)
          AND (%(search)s::text IS NULL
               OR t.title ILIKE %(pattern)s
               OR t.description ILIKE %(pattern)s
               OR t.ticket_id::text = %(search)s)
        ORDER BY t.updated_at DESC, t.ticket_id DESC
        """,
        {
            "user_id": user_id,
            "status": status,
            "closed": closed,
            "search": search,
            "pattern": like_pattern(search) if search else None,
        },
    ).fetchall()


def get_detail(conn: psycopg.Connection, ticket_id: int) -> dict[str, Any] | None:
    """Return one ticket with location names and the assigned engineer's name, or None.

    Employee-facing: leaves out the internal priority column.
    """
    return conn.execute(
        """
        SELECT
            t.ticket_id, t.title, t.description, t.category,
            t.affected_scope, t.status, t.building_id,
            t.floor_id, t.seat_id, t.created_by_user_id, t.assigned_to_user_id,
            t.escalation_requested, t.escalation_reason, t.blocked_reason,
            t.created_at, t.updated_at, t.acknowledged_at, t.assigned_at, t.resolved_at,
            b.building_name, f.floor_number, s.seat_number,
            engineer.full_name AS assigned_to_name
        FROM tickets t
        JOIN buildings b ON b.building_id = t.building_id
        LEFT JOIN floors f ON f.floor_id = t.floor_id
        LEFT JOIN seats s ON s.seat_id = t.seat_id
        LEFT JOIN users engineer ON engineer.user_id = t.assigned_to_user_id
        WHERE t.ticket_id = %s
        """,
        (ticket_id,),
    ).fetchone()


def list_all(
    conn: psycopg.Connection,
    *,
    status: str | None,
    priority: str | None,
    category: str | None,
    building_id: int | None,
    assigned: bool | None,
    assigned_to: int | None,
    escalated: bool | None,
    closed: bool | None,
    search: str | None,
) -> list[dict[str, Any]]:
    """Return every ticket with priority, location, requester and engineer names, for triage.

    Highest priority first (P1 sorts before P2), then the longest-waiting. Each filter is
    skipped when its value is None, so the SQL text never changes.
    """
    return conn.execute(
        """
        SELECT
            t.ticket_id, t.title, t.category, t.status,
            t.affected_scope, t.priority, t.escalation_requested,
            t.building_id, b.building_name, t.floor_id, f.floor_number,
            t.seat_id, s.seat_number, t.created_at, t.updated_at,
            t.created_by_user_id, creator.full_name AS created_by_name,
            t.assigned_to_user_id, engineer.full_name AS assigned_to_name
        FROM tickets t
        JOIN buildings b ON b.building_id = t.building_id
        LEFT JOIN floors f ON f.floor_id = t.floor_id
        LEFT JOIN seats s ON s.seat_id = t.seat_id
        JOIN users creator ON creator.user_id = t.created_by_user_id
        LEFT JOIN users engineer ON engineer.user_id = t.assigned_to_user_id
        WHERE (%(status)s::text IS NULL OR t.status = %(status)s)
          AND (%(priority)s::text IS NULL OR t.priority = %(priority)s)
          AND (%(category)s::text IS NULL OR t.category = %(category)s)
          AND (%(building_id)s::integer IS NULL OR t.building_id = %(building_id)s)
          AND (%(assigned)s::boolean IS NULL
               OR (t.assigned_to_user_id IS NOT NULL) = %(assigned)s)
          AND (%(assigned_to)s::integer IS NULL OR t.assigned_to_user_id = %(assigned_to)s)
          AND (%(escalated)s::boolean IS NULL OR t.escalation_requested = %(escalated)s)
          AND (%(closed)s::boolean IS NULL OR (t.status = 'closed') = %(closed)s)
          AND (%(search)s::text IS NULL
               OR t.title ILIKE %(pattern)s
               OR t.description ILIKE %(pattern)s
               OR creator.full_name ILIKE %(pattern)s
               OR creator.email ILIKE %(pattern)s
               OR t.ticket_id::text = %(search)s)
        ORDER BY t.priority, t.created_at, t.ticket_id
        """,
        {
            "status": status,
            "priority": priority,
            "category": category,
            "building_id": building_id,
            "assigned": assigned,
            "assigned_to": assigned_to,
            "escalated": escalated,
            "closed": closed,
            "search": search,
            "pattern": like_pattern(search) if search else None,
        },
    ).fetchall()


def count_metrics(conn: psycopg.Connection) -> dict[str, Any]:
    """Return the admin dashboard's headline counts in one row.

    "Active" means not closed, the same as the ticket list's `view=active`, so each count
    matches what its filter shows. Closes in the last 7 days come from the status history,
    since tickets don't store when they were closed.
    """
    return conn.execute(
        """
        SELECT
            count(*) FILTER (WHERE status <> 'closed' AND assigned_to_user_id IS NULL) AS unassigned,
            count(*) FILTER (WHERE status = 'open') AS open,
            count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
            count(*) FILTER (WHERE status = 'blocked') AS blocked,
            count(*) FILTER (WHERE status = 'resolved') AS resolved,
            count(*) FILTER (WHERE status <> 'closed' AND priority = 'P1') AS active_p1,
            count(*) FILTER (WHERE status <> 'closed' AND escalation_requested) AS escalated,
            (
                SELECT count(DISTINCT h.ticket_id)
                FROM ticket_status_history h
                JOIN tickets closed ON closed.ticket_id = h.ticket_id AND closed.status = 'closed'
                WHERE h.to_status = 'closed' AND h.changed_at >= now() - interval '7 days'
            ) AS closed_last_7_days
        FROM tickets
        """
    ).fetchone()


def get_admin_detail(conn: psycopg.Connection, ticket_id: int) -> dict[str, Any] | None:
    """Return one ticket as get_detail does, plus priority and the requester's contact details."""
    return conn.execute(
        """
        SELECT
            t.ticket_id, t.title, t.description, t.category,
            t.affected_scope, t.priority, t.status, t.building_id,
            t.floor_id, t.seat_id, t.created_by_user_id, t.assigned_to_user_id,
            t.escalation_requested, t.escalation_reason, t.blocked_reason,
            t.created_at, t.updated_at, t.acknowledged_at, t.assigned_at, t.resolved_at,
            b.building_name, f.floor_number, s.seat_number,
            engineer.full_name AS assigned_to_name,
            creator.full_name AS created_by_name, creator.email AS created_by_email,
            creator.phone_number AS created_by_phone
        FROM tickets t
        JOIN buildings b ON b.building_id = t.building_id
        LEFT JOIN floors f ON f.floor_id = t.floor_id
        LEFT JOIN seats s ON s.seat_id = t.seat_id
        JOIN users creator ON creator.user_id = t.created_by_user_id
        LEFT JOIN users engineer ON engineer.user_id = t.assigned_to_user_id
        WHERE t.ticket_id = %s
        """,
        (ticket_id,),
    ).fetchone()


def lock(conn: psycopg.Connection, ticket_id: int) -> None:
    """Lock a ticket row until the transaction ends, so its status can't change mid-update."""
    conn.execute("SELECT 1 FROM tickets WHERE ticket_id = %s FOR UPDATE", (ticket_id,))


def touch(conn: psycopg.Connection, ticket_id: int) -> None:
    """Set a ticket's updated_at to now."""
    conn.execute("UPDATE tickets SET updated_at = now() WHERE ticket_id = %s", (ticket_id,))


def assign(conn: psycopg.Connection, ticket_id: int, engineer_id: int) -> None:
    """Give a ticket to an engineer. The first assignment also marks it acknowledged.

    assigned_at always moves to now, so it records the current engineer's start.
    acknowledged_at keeps its first value across reassignments. Status is left alone.
    """
    conn.execute(
        """
        UPDATE tickets
        SET assigned_to_user_id = %s,
            assigned_at = now(),
            acknowledged_at = COALESCE(acknowledged_at, now()),
            updated_at = now()
        WHERE ticket_id = %s
        """,
        (engineer_id, ticket_id),
    )


def set_status(
    conn: psycopg.Connection, ticket_id: int, status: str, *, blocked_reason: str | None = None
) -> None:
    """Move a ticket to a new status and keep the fields that depend on it in step.

    blocked_reason only means something while blocked, so it's cleared otherwise.
    resolved_at is stamped on resolving, kept on closing, and cleared when work starts
    again. The caller records the change in the status history.
    """
    conn.execute(
        """
        UPDATE tickets
        SET status = %(status)s,
            blocked_reason = CASE WHEN %(status)s = 'blocked' THEN %(blocked_reason)s END,
            resolved_at = CASE %(status)s
                              WHEN 'resolved' THEN now()
                              WHEN 'closed' THEN resolved_at
                          END,
            updated_at = now()
        WHERE ticket_id = %(ticket_id)s
        """,
        {"status": status, "blocked_reason": blocked_reason, "ticket_id": ticket_id},
    )


def request_escalation(conn: psycopg.Connection, ticket_id: int, reason: str) -> None:
    """Flag a ticket for admin review with the employee's reason."""
    conn.execute(
        """
        UPDATE tickets
        SET escalation_requested = true, escalation_reason = %s, updated_at = now()
        WHERE ticket_id = %s
        """,
        (reason, ticket_id),
    )


def list_notes(conn: psycopg.Connection, ticket_id: int) -> list[dict[str, Any]]:
    """Return a ticket's notes with author names, oldest first."""
    return conn.execute(
        """
        SELECT n.note_id, n.ticket_id, n.user_id, u.full_name AS author_name,
               r.role_name AS author_role, n.note_text, n.created_at
        FROM ticket_notes n
        JOIN users u ON u.user_id = n.user_id
        JOIN roles r ON r.role_id = u.role_id
        WHERE n.ticket_id = %s
        ORDER BY n.created_at, n.note_id
        """,
        (ticket_id,),
    ).fetchall()


def insert_note(
    conn: psycopg.Connection, ticket_id: int, user_id: int, note_text: str
) -> dict[str, Any]:
    """Insert a note and return it with the author's name and role."""
    return conn.execute(
        """
        WITH n AS (
            INSERT INTO ticket_notes (ticket_id, user_id, note_text)
            VALUES (%s, %s, %s)
            RETURNING note_id, ticket_id, user_id, note_text, created_at
        )
        SELECT n.note_id, n.ticket_id, n.user_id, u.full_name AS author_name,
               r.role_name AS author_role, n.note_text, n.created_at
        FROM n
        JOIN users u ON u.user_id = n.user_id
        JOIN roles r ON r.role_id = u.role_id
        """,
        (ticket_id, user_id, note_text),
    ).fetchone()


def list_status_history(conn: psycopg.Connection, ticket_id: int) -> list[dict[str, Any]]:
    """Return every status a ticket has been in, with who changed it, oldest first."""
    return conn.execute(
        """
        SELECT h.history_id, h.ticket_id, h.from_status, h.to_status,
               h.changed_by_user_id, u.full_name AS changed_by_name,
               r.role_name AS changed_by_role, h.reason, h.changed_at
        FROM ticket_status_history h
        JOIN users u ON u.user_id = h.changed_by_user_id
        JOIN roles r ON r.role_id = u.role_id
        WHERE h.ticket_id = %s
        ORDER BY h.changed_at, h.history_id
        """,
        (ticket_id,),
    ).fetchall()


def insert_status_change(
    conn: psycopg.Connection,
    ticket_id: int,
    *,
    from_status: str | None,
    to_status: str,
    changed_by_user_id: int,
    reason: str | None = None,
) -> None:
    """Append one row to a ticket's status history. from_status is None only at creation."""
    conn.execute(
        """
        INSERT INTO ticket_status_history
            (ticket_id, from_status, to_status, changed_by_user_id, reason)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (ticket_id, from_status, to_status, changed_by_user_id, reason),
    )


def insert(
    conn: psycopg.Connection,
    *,
    title: str,
    description: str,
    category: str,
    affected_scope: str,
    priority: str,
    building_id: int,
    floor_id: int | None,
    seat_id: int | None,
    created_by_user_id: int,
) -> dict[str, Any]:
    """Insert a ticket (status defaults to 'open') and return it, without the internal priority."""
    return conn.execute(
        """
        INSERT INTO tickets (
            title, description, category,
            affected_scope, priority, building_id, floor_id, seat_id, created_by_user_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING
            ticket_id, title, description, category,
            affected_scope, status, building_id, floor_id, seat_id,
            created_by_user_id, assigned_to_user_id, escalation_requested,
            escalation_reason, blocked_reason, created_at, updated_at,
            acknowledged_at, assigned_at, resolved_at
        """,
        (
            title, description, category,
            affected_scope, priority, building_id, floor_id, seat_id, created_by_user_id,
        ),
    ).fetchone()
