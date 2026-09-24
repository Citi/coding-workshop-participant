-- Employee-slice tables for the Facilities Helpdesk.
-- Safe to re-run: every statement uses IF NOT EXISTS. Use reset.sql to start over.

CREATE TABLE IF NOT EXISTS roles (
    role_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_name TEXT NOT NULL UNIQUE
);

INSERT INTO roles (role_name)
VALUES ('employee'), ('engineer'), ('admin')
ON CONFLICT (role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    user_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    full_name     TEXT NOT NULL,
    phone_number  TEXT,
    role_id       INTEGER NOT NULL REFERENCES roles (role_id),
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Databases created before the roles table kept each user's role as text in users.role.
-- Move it to users.role_id and drop the old column, all or nothing. Does nothing on a new
-- database. The old CHECK allowed only the three seeded names, so every user finds a role.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles (role_id);
        UPDATE users u SET role_id = r.role_id FROM roles r WHERE r.role_name = u.role;
        ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;
        ALTER TABLE users DROP COLUMN role;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS buildings (
    building_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_name TEXT NOT NULL UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS floors (
    floor_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    floor_number INTEGER NOT NULL,
    building_id  INTEGER NOT NULL REFERENCES buildings (building_id),
    is_active    BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (building_id, floor_number)
);

CREATE TABLE IF NOT EXISTS seats (
    seat_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seat_number TEXT NOT NULL,
    floor_id    INTEGER NOT NULL REFERENCES floors (floor_id),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (floor_id, seat_number)
);

-- Facility Admins deactivate a location instead of deleting it once tickets use it. An
-- inactive one (or one under an inactive building or floor) is hidden from new tickets.
-- Databases created before this get the column here; existing locations stay active.
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Admins type these names, so "building a" and "Building A" count as the same building,
-- and "12a" and "12A" as the same seat on a floor.
CREATE UNIQUE INDEX IF NOT EXISTS buildings_name_ci_key ON buildings (lower(building_name));
CREATE UNIQUE INDEX IF NOT EXISTS seats_floor_number_ci_key ON seats (floor_id, lower(seat_number));

CREATE TABLE IF NOT EXISTS tickets (
    ticket_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title                TEXT NOT NULL,
    description          TEXT NOT NULL,
    category             TEXT NOT NULL CHECK (category IN (
                             'network', 'hardware', 'printer', 'hvac',
                             'electrical', 'furniture', 'building_facilities', 'other'
                         )),
    affected_scope       TEXT NOT NULL CHECK (affected_scope IN ('me', 'floor', 'building')),
    priority             TEXT NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
    status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                             'open', 'in_progress', 'blocked', 'resolved', 'closed'
                         )),
    building_id          INTEGER NOT NULL REFERENCES buildings (building_id),
    floor_id             INTEGER REFERENCES floors (floor_id),
    seat_id              INTEGER REFERENCES seats (seat_id),
    created_by_user_id   INTEGER NOT NULL REFERENCES users (user_id),
    assigned_to_user_id  INTEGER REFERENCES users (user_id),
    escalation_requested BOOLEAN NOT NULL DEFAULT false,
    escalation_reason    TEXT,
    blocked_reason       TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at      TIMESTAMPTZ,
    assigned_at          TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    -- A seat only makes sense inside a floor. That the floor belongs to the building
    -- and the seat to the floor is checked in ticket_service before insert.
    CHECK (seat_id IS NULL OR floor_id IS NOT NULL)
);

-- Tickets no longer have an employee-chosen urgency or a short description: the title and
-- full description say what's wrong, and priority comes from who is affected. Databases
-- created before this drop the columns here.
ALTER TABLE tickets DROP COLUMN IF EXISTS urgency;
ALTER TABLE tickets DROP COLUMN IF EXISTS short_description;

CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

CREATE TABLE IF NOT EXISTS ticket_notes (
    note_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id  INTEGER NOT NULL REFERENCES tickets (ticket_id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users (user_id),
    note_text  TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket ON ticket_notes (ticket_id);

-- Append-only log of every status a ticket has been in, so a reopen
-- (resolved -> open) stays visible after the status column moves on.
CREATE TABLE IF NOT EXISTS ticket_status_history (
    history_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id          INTEGER NOT NULL REFERENCES tickets (ticket_id) ON DELETE CASCADE,
    from_status        TEXT CHECK (from_status IN (
                           'open', 'in_progress', 'blocked', 'resolved', 'closed'
                       )),  -- NULL on the row written when the ticket is created
    to_status          TEXT NOT NULL CHECK (to_status IN (
                           'open', 'in_progress', 'blocked', 'resolved', 'closed'
                       )),
    changed_by_user_id INTEGER NOT NULL REFERENCES users (user_id),
    reason             TEXT,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_status IS DISTINCT FROM to_status)
);

CREATE INDEX IF NOT EXISTS idx_status_history_ticket ON ticket_status_history (ticket_id);

-- Tickets created before this table existed get their creation row, dated when the
-- ticket was created. Their later changes weren't recorded, so their history starts here.
INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by_user_id, changed_at)
SELECT t.ticket_id, NULL, 'open', t.created_by_user_id, t.created_at
FROM tickets t
WHERE NOT EXISTS (SELECT 1 FROM ticket_status_history h WHERE h.ticket_id = t.ticket_id);
