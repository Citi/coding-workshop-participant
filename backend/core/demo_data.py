"""Mock people and tickets so a fresh deployment has something to show. Demo use only.

Loaded by the setup task when invoked with "demo_data": true (see setup_tasks.py). Adds 2
engineers, 5 employees and 25 tickets across every status, dated over the last three
weeks, each with the notes and status history the app would have recorded.

Each ticket is written as the story of what happened to it, as events that happened some
hours after it was created. The ticket's final fields (status, assignee, timestamps,
blocked reason) are worked out from those events, so they always agree with its history.

None of these accounts can sign in: their password hash matches no password.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

import psycopg

from services.ticket_service import PRIORITY_BY_SCOPE

# security.verify_password rejects anything not in its "algorithm$iterations$salt$hash" form.
NO_LOGIN_HASH = "!demo-account-no-login"

DAY = 24  # hours


class Person(NamedTuple):
    """A background account."""

    email: str
    full_name: str
    role: str
    phone_number: str | None = None


class Event(NamedTuple):
    """Something that happened to a ticket, `hours` after it was created."""

    kind: str  # "assign", "move", "note" or "escalate"
    hours: float
    who: str | None = None  # a PEOPLE key or "admin"; the requester for escalations
    status: str | None = None  # the new status, for "move"
    text: str | None = None  # the note, the reason for a move, or the escalation reason


class Ticket(NamedTuple):
    """A ticket as its requester reported it, plus what happened to it since."""

    by: str
    title: str
    description: str
    category: str
    affected_scope: str
    where: tuple[str, int | None, str | None]  # building name, floor number, seat number
    age_hours: float
    events: tuple[Event, ...] = ()


def assign(hours: float, engineer: str) -> Event:
    """An admin gives the ticket to an engineer."""
    return Event("assign", hours, who=engineer)


def move(hours: float, who: str, status: str, reason: str | None = None) -> Event:
    """The engineer (or, to close or send back, the admin) changes the status."""
    return Event("move", hours, who=who, status=status, text=reason)


def note(hours: float, who: str, text: str) -> Event:
    """The requester or the engineer adds a note."""
    return Event("note", hours, who=who, text=text)


def escalate(hours: float, reason: str) -> Event:
    """The requester asks a Facility Admin to look at the ticket."""
    return Event("escalate", hours, text=reason)


PEOPLE: dict[str, Person] = {
    "sam": Person("sam.okafor@acme.inc", "Sam Okafor", "engineer", "+1 555 0101"),
    "priya": Person("priya.nair@acme.inc", "Priya Nair", "engineer", "+1 555 0102"),
    "maria": Person("maria.lopez@acme.inc", "Maria Lopez", "employee", "+1 555 0141"),
    "james": Person("james.chen@acme.inc", "James Chen", "employee", "+1 555 0142"),
    "aisha": Person("aisha.bello@acme.inc", "Aisha Bello", "employee"),
    "tom": Person("tom.walsh@acme.inc", "Tom Walsh", "employee", "+1 555 0144"),
    "lena": Person("lena.fischer@acme.inc", "Lena Fischer", "employee"),
}

A, B = "Building A", "Building B"

TICKETS: tuple[Ticket, ...] = (
    # --- Closed ---
    Ticket(
        "maria", "Wi-Fi drops in the east wing",
        "Everyone near the east stairwell on floor 2 keeps losing Wi-Fi, several times an hour.",
        "network", "floor", (A, 2, None), 21 * DAY,
        (
            assign(1, "sam"),
            move(3, "sam", "in_progress"),
            note(4, "sam", "The access point by the east stairwell is overheating."),
            move(6, "sam", "resolved", "Replaced the faulty access point by the east stairwell."),
            move(30, "admin", "closed"),
        ),
    ),
    Ticket(
        "james", "Printer jams on double-sided jobs",
        "The printer next to my desk jams on every double-sided job. Single-sided is fine.",
        "printer", "me", (A, 1, "102"), 18 * DAY,
        (
            assign(2, "priya"),
            move(20, "priya", "in_progress"),
            move(22, "priya", "resolved", "Replaced the duplex roller and ran 50 test pages."),
            move(44, "admin", "closed"),
        ),
    ),
    Ticket(
        "aisha", "Floor 3 is freezing",
        "The whole of floor 3 has been freezing since Monday. People are wearing coats.",
        "hvac", "floor", (A, 3, None), 14 * DAY,
        (
            assign(1, "sam"),
            move(5, "sam", "in_progress"),
            move(26, "sam", "resolved", "Freed a stuck damper and rebalanced the thermostat."),
            move(50, "admin", "closed"),
        ),
    ),
    Ticket(
        "tom", "Power strip sparked",
        "The power strip under my desk sparked when I plugged in my charger. I've unplugged it.",
        "electrical", "me", (B, 1, "103"), 9 * DAY,
        (
            assign(0.5, "priya"),
            move(1, "priya", "in_progress"),
            note(1.5, "priya", "Strip isolated. Please don't plug anything in until it's replaced."),
            move(3, "priya", "resolved", "Replaced the power strip and tested the outlet."),
            move(26, "admin", "closed"),
        ),
    ),
    Ticket(
        "lena", "Chair won't stay up",
        "My chair slowly sinks to the lowest height within a few minutes of adjusting it.",
        "furniture", "me", (A, 2, "201"), 6 * DAY,
        (
            assign(4, "sam"),
            move(24, "sam", "in_progress"),
            move(48, "sam", "resolved", "Swapped it for a new chair from storage."),
            move(70, "admin", "closed"),
        ),
    ),
    Ticket(
        "maria", "Monitor flickers",
        "My second monitor flickers every few seconds, which makes it hard to read.",
        "hardware", "me", (A, 3, "302"), 5 * DAY,
        (
            assign(2, "priya"),
            move(6, "priya", "in_progress"),
            move(8, "priya", "resolved", "Replaced the DisplayPort cable."),
            note(28, "maria", "Still flickering after the cable swap, sorry."),
            move(30, "admin", "in_progress", "The requester says the flicker is back."),
            note(31, "priya", "The monitor itself is faulty. A replacement is on order."),
            move(72, "priya", "resolved", "Replaced the monitor."),
            move(90, "admin", "closed"),
        ),
    ),
    # --- Resolved, waiting for an admin to close ---
    Ticket(
        "james", "Wi-Fi weak at my desk",
        "Video calls freeze at my desk. It's fine in the meeting rooms.",
        "network", "me", (B, 2, "202"), 4 * DAY,
        (
            assign(3, "sam"),
            move(20, "sam", "in_progress"),
            move(40, "sam", "resolved", "Patched in the wired port at your desk; Wi-Fi is weak there."),
        ),
    ),
    Ticket(
        "aisha", "Kitchen sink leaking",
        "There's a puddle under the kitchen sink on floor 1 and it's spreading.",
        "building_facilities", "floor", (B, 1, None), 3 * DAY,
        (
            assign(1, "priya"),
            move(2, "priya", "in_progress"),
            note(2.5, "priya", "Water shut off under the sink. Plumber booked for tomorrow."),
            move(30, "priya", "resolved", "The plumber replaced the trap seal. No more leaks."),
        ),
    ),
    Ticket(
        "tom", "Printer out of toner",
        "The floor 1 printer says it's out of toner and prints blank pages.",
        "printer", "floor", (A, 1, None), 2 * DAY,
        (
            assign(2, "sam"),
            move(3, "sam", "in_progress"),
            move(4, "sam", "resolved", "Installed a new toner cartridge."),
        ),
    ),
    Ticket(
        "lena", "Air conditioning very loud",
        "The air conditioning on floor 3 makes a loud rattling noise all day.",
        "hvac", "floor", (A, 3, None), 6 * DAY,
        (
            escalate(50, "It's been two days and the noise makes calls impossible."),
            assign(52, "sam"),
            move(53, "sam", "in_progress"),
            move(100, "sam", "resolved", "Replaced a worn fan belt in the ceiling unit."),
        ),
    ),
    # --- Blocked ---
    Ticket(
        "maria", "No heating on floor 2",
        "None of the radiators on floor 2 are warm this morning.",
        "hvac", "floor", (A, 2, None), 5 * DAY,
        (
            assign(1, "sam"),
            move(2, "sam", "in_progress"),
            note(3, "sam", "The boiler pump for floor 2 is failing."),
            move(4, "sam", "blocked", "Waiting for a replacement pump from the supplier (due Friday)."),
            escalate(50, "The floor is still cold and people are working from home."),
        ),
    ),
    Ticket(
        "james", "Lights flicker across the building",
        "The lights on every floor of Building B flicker, mostly in the afternoon.",
        "electrical", "building", (B, None, None), 4 * DAY,
        (
            assign(0.5, "priya"),
            move(1, "priya", "in_progress"),
            move(6, "priya", "blocked", "Needs the building's electrical contractor. Visit booked for Thursday."),
            note(30, "james", "It's getting worse in the afternoons."),
        ),
    ),
    Ticket(
        "aisha", "Standing desk stuck",
        "My standing desk won't go up. The motor clicks but nothing moves.",
        "furniture", "me", (A, 1, "104"), 7 * DAY,
        (
            assign(20, "sam"),
            move(30, "sam", "in_progress"),
            move(32, "sam", "blocked", "The motor is under warranty. Waiting for the manufacturer to ship a part."),
        ),
    ),
    # --- In progress ---
    Ticket(
        "tom", "Network port dead",
        "The network port at my desk gives no connection. I've tried two cables.",
        "network", "me", (B, 2, "203"), 2 * DAY,
        (
            assign(2, "priya"),
            move(5, "priya", "in_progress"),
            note(6, "priya", "The port isn't patched in the comms room. Tracing the cable."),
        ),
    ),
    Ticket(
        "lena", "Lift out of service",
        "The lift in Building B is stuck on floor 1 with its doors closed.",
        "building_facilities", "building", (B, None, None), 1 * DAY,
        (
            assign(0.5, "sam"),
            move(1, "sam", "in_progress"),
            note(2, "sam", "The lift company is on site."),
            escalate(3, "Colleagues with mobility needs can't reach floor 2."),
        ),
    ),
    Ticket(
        "maria", "Badge reader rejects badges",
        "The badge reader at the Building A main entrance rejects every badge. Reception is buzzing people in.",
        "hardware", "building", (A, None, None), 1 * DAY,
        (
            assign(1, "priya"),
            move(1.5, "priya", "in_progress"),
        ),
    ),
    Ticket(
        "james", "Paint smell near the stairwell",
        "There's a strong smell of paint near the floor 3 stairwell.",
        "other", "floor", (A, 3, None), 3 * DAY,
        (
            assign(24, "sam"),
            move(40, "sam", "in_progress"),
            note(41, "sam", "Contractors are repainting. I've asked them to ventilate."),
        ),
    ),
    Ticket(
        "aisha", "Scanner saves blank PDFs",
        "Anything I scan at my desk scanner saves as a blank PDF.",
        "printer", "me", (B, 1, "101"), 2 * DAY,
        (
            assign(10, "priya"),
            move(30, "priya", "in_progress"),
            move(32, "priya", "blocked", "Need a reset code from the vendor."),
            move(40, "priya", "in_progress", "The vendor sent the reset code."),
        ),
    ),
    # --- Open and assigned, not started ---
    Ticket(
        "tom", "Radiator won't turn off",
        "The radiator by my desk is stuck on full heat and the valve won't turn.",
        "hvac", "me", (A, 2, "203"), 1 * DAY,
        (assign(3, "sam"),),
    ),
    Ticket(
        "lena", "Socket has no power",
        "The socket under my desk has no power. The one next to it works.",
        "electrical", "me", (A, 3, "304"), 20,
        (assign(2, "priya"),),
    ),
    Ticket(
        "maria", "Broken blind in the meeting room",
        "The blind in the floor 2 meeting room is stuck halfway and the sun is in everyone's eyes.",
        "furniture", "floor", (B, 2, None), 2 * DAY,
        (assign(30, "sam"),),
    ),
    # --- Open, waiting for an admin to assign ---
    Ticket(
        "james", "Guest Wi-Fi login page won't load",
        "The guest Wi-Fi connects, but the login page never loads, so visitors can't get online.",
        "network", "building", (A, None, None), 6,
    ),
    Ticket(
        "aisha", "Toilets out of order",
        "Both toilets on floor 1 won't flush.",
        "building_facilities", "floor", (A, 1, None), 3,
    ),
    Ticket(
        "tom", "Fire exit sign is out",
        "The fire exit sign by the floor 2 stairwell isn't lit.",
        "other", "floor", (B, 2, None), 1 * DAY,
        (escalate(20, "It's a safety issue and nobody has picked it up yet."),),
    ),
    Ticket(
        "lena", "Keyboard missing keys",
        "The E and R keys have come off my keyboard.",
        "hardware", "me", (A, 1, "101"), 2,
    ),
)


def load(conn: psycopg.Connection, admin_id: int, now: datetime | None = None) -> dict[str, Any]:
    """Add the demo people and tickets, unless any demo account already exists.

    admin_id is who closes and sends back tickets in the history. Runs in the caller's
    transaction. Returns what was added, or {"created": False} if it was already loaded.
    """
    emails = [person.email for person in PEOPLE.values()]
    if conn.execute("SELECT 1 FROM users WHERE email = ANY(%s)", (emails,)).fetchone():
        return {"created": False}

    user_ids = {key: _insert_person(conn, person) for key, person in PEOPLE.items()}
    user_ids["admin"] = admin_id
    now = now or datetime.now(UTC)
    for ticket in TICKETS:
        _insert_ticket(conn, ticket, user_ids, now)
    return {"created": True, "people": len(PEOPLE), "tickets": len(TICKETS)}


def _insert_person(conn: psycopg.Connection, person: Person) -> int:
    """Insert a background account that can't sign in and return its id."""
    return conn.execute(
        """
        INSERT INTO users (email, full_name, phone_number, password_hash, role_id)
        VALUES (%s, %s, %s, %s, (SELECT role_id FROM roles WHERE role_name = %s))
        RETURNING user_id
        """,
        (person.email, person.full_name, person.phone_number, NO_LOGIN_HASH, person.role),
    ).fetchone()["user_id"]


def _location_ids(
    conn: psycopg.Connection, where: tuple[str, int | None, str | None]
) -> tuple[int, int | None, int | None]:
    """Look up the building, floor and seat ids that seed.sql created."""
    building, floor, seat = where
    row = conn.execute(
        """
        SELECT b.building_id, f.floor_id, s.seat_id
        FROM buildings b
        LEFT JOIN floors f ON f.building_id = b.building_id AND f.floor_number = %s
        LEFT JOIN seats s ON s.floor_id = f.floor_id AND s.seat_number = %s
        WHERE b.building_name = %s
        """,
        (floor, seat, building),
    ).fetchone()
    if row is None or (floor and not row["floor_id"]) or (seat and not row["seat_id"]):
        raise ValueError(f"Demo location {where} is missing; run seed.sql first")
    return row["building_id"], row["floor_id"], row["seat_id"]


def _insert_ticket(
    conn: psycopg.Connection, ticket: Ticket, user_ids: dict[str, int], now: datetime
) -> None:
    """Replay a ticket's events to get its final fields, then write it, its history and notes."""
    created_at = now - timedelta(hours=ticket.age_hours)
    creator_id = user_ids[ticket.by]
    state: dict[str, Any] = {
        "status": "open",
        "assigned_to_user_id": None,
        "acknowledged_at": None,
        "assigned_at": None,
        "resolved_at": None,
        "blocked_reason": None,
        "escalation_reason": None,
    }
    history = [(None, "open", creator_id, None, created_at)]
    notes = []

    for event in ticket.events:
        at = created_at + timedelta(hours=event.hours)
        if event.kind == "assign":
            state["assigned_to_user_id"] = user_ids[event.who]
            state["acknowledged_at"] = state["acknowledged_at"] or at
            state["assigned_at"] = at
        elif event.kind == "move":
            history.append((state["status"], event.status, user_ids[event.who], event.text, at))
            state["status"] = event.status
            state["blocked_reason"] = event.text if event.status == "blocked" else None
            if event.status == "resolved":
                state["resolved_at"] = at
            elif event.status != "closed":
                state["resolved_at"] = None
        elif event.kind == "note":
            notes.append((user_ids[event.who], event.text, at))
        else:  # escalate
            state["escalation_reason"] = event.text

    building_id, floor_id, seat_id = _location_ids(conn, ticket.where)
    last_event = max((event.hours for event in ticket.events), default=0)
    ticket_id = conn.execute(
        """
        INSERT INTO tickets (
            title, description, category, affected_scope,
            priority, status, building_id, floor_id, seat_id, created_by_user_id,
            assigned_to_user_id, escalation_requested, escalation_reason, blocked_reason,
            created_at, updated_at, acknowledged_at, assigned_at, resolved_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING ticket_id
        """,
        (
            ticket.title, ticket.description, ticket.category,
            ticket.affected_scope, PRIORITY_BY_SCOPE[ticket.affected_scope],
            state["status"], building_id, floor_id, seat_id, creator_id,
            state["assigned_to_user_id"], state["escalation_reason"] is not None,
            state["escalation_reason"], state["blocked_reason"], created_at,
            created_at + timedelta(hours=last_event), state["acknowledged_at"],
            state["assigned_at"], state["resolved_at"],
        ),
    ).fetchone()["ticket_id"]

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO ticket_status_history
                (ticket_id, from_status, to_status, changed_by_user_id, reason, changed_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            [(ticket_id, *row) for row in history],
        )
        cur.executemany(
            "INSERT INTO ticket_notes (ticket_id, user_id, note_text, created_at) VALUES (%s, %s, %s, %s)",
            [(ticket_id, *row) for row in notes],
        )
