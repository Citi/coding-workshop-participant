-- =====================================================================
-- ACME Facility Incident Management - PostgreSQL schema
--
-- Tables: users, buildings, floors, seats, engineer_profiles,
--         incidents, incident_notes, incident_history
--
-- Run:  psql -h <host> -U <user> -d <db> -f backend/db/schema.sql
-- WARNING: re-running drops and recreates all of these tables (data is lost).
-- =====================================================================

BEGIN;
SET LOCAL client_min_messages = warning;

-- ---------------------------------------------------------------------
-- Clean slate (reverse dependency order)
-- ---------------------------------------------------------------------
DROP VIEW  IF EXISTS engineer_workload;
DROP TABLE IF EXISTS incident_history  CASCADE;
DROP TABLE IF EXISTS incident_notes    CASCADE;
DROP TABLE IF EXISTS incidents         CASCADE;
DROP TABLE IF EXISTS engineer_profiles CASCADE;
DROP TABLE IF EXISTS seats             CASCADE;
DROP TABLE IF EXISTS floors            CASCADE;
DROP TABLE IF EXISTS buildings         CASCADE;
DROP TABLE IF EXISTS users             CASCADE;

DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS engineer_availability;
DROP TYPE IF EXISTS incident_category;
DROP TYPE IF EXISTS incident_priority;
DROP TYPE IF EXISTS incident_status;
DROP TYPE IF EXISTS history_event;

DROP FUNCTION IF EXISTS set_updated_at()              CASCADE;
DROP FUNCTION IF EXISTS check_engineer_role()         CASCADE;
DROP FUNCTION IF EXISTS log_incident_changes()        CASCADE;

-- ---------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('employee', 'facility_admin', 'engineer');

CREATE TYPE engineer_availability AS ENUM ('available', 'busy', 'on_leave', 'offline');

CREATE TYPE incident_category AS ENUM (
    'electrical', 'plumbing', 'hvac', 'furniture', 'cleaning', 'security',
    'it_hardware', 'network', 'audio_visual', 'other'
);

CREATE TYPE incident_priority AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE incident_status AS ENUM (
    'open',         -- reported, not yet assigned
    'assigned',     -- engineer assigned by facility admin
    'in_progress',  -- engineer working on it
    'on_hold',      -- waiting on parts / employee / access
    'resolved',     -- engineer considers it fixed
    'closed',       -- confirmed / finalised
    'cancelled'     -- withdrawn or invalid
);

CREATE TYPE history_event AS ENUM (
    'created', 'status_change', 'assignment', 'priority_change',
    'priority_request', 'escalation'
);

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Users - employees, facility admins and engineers
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name      VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role           user_role    NOT NULL DEFAULT 'employee',
    phone          VARCHAR(30),
    department     VARCHAR(100),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT users_email_acme_chk CHECK (email ~* '^[^@\s]+@acme\.inc$'),
    CONSTRAINT users_email_lower_chk CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_uq ON users (email);
CREATE INDEX users_role_idx ON users (role);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Buildings - ACME office buildings
-- ---------------------------------------------------------------------
CREATE TABLE buildings (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE,      -- e.g. 'HQ1'
    name        VARCHAR(150) NOT NULL UNIQUE,
    address     VARCHAR(255),
    city        VARCHAR(100),
    country     VARCHAR(100),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by  BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER buildings_updated_at BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Floors - belong to a building
-- ---------------------------------------------------------------------
CREATE TABLE floors (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id   BIGINT       NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
    floor_number  INTEGER      NOT NULL,           -- 0 = ground, negatives = basement
    name          VARCHAR(100),                    -- e.g. 'Ground Floor - Reception'
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT floors_building_number_uq UNIQUE (building_id, floor_number),
    CONSTRAINT floors_id_building_uq UNIQUE (id, building_id)   -- target for composite FK
);

CREATE TRIGGER floors_updated_at BEFORE UPDATE ON floors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Seats - individual office locations on a floor
-- ---------------------------------------------------------------------
CREATE TABLE seats (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    floor_id    BIGINT       NOT NULL REFERENCES floors (id) ON DELETE CASCADE,
    seat_code   VARCHAR(30)  NOT NULL,             -- e.g. '3A-042'
    description VARCHAR(255),                      -- e.g. 'Window desk near pantry'
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT seats_floor_code_uq UNIQUE (floor_id, seat_code),
    CONSTRAINT seats_id_floor_uq UNIQUE (id, floor_id)          -- target for composite FK
);

CREATE TRIGGER seats_updated_at BEFORE UPDATE ON seats
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Engineer profiles - one per engineer user; availability & capacity
-- ---------------------------------------------------------------------
CREATE TABLE engineer_profiles (
    user_id             BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    specializations     incident_category[] NOT NULL DEFAULT '{}',
    availability        engineer_availability NOT NULL DEFAULT 'available',
    max_active_tickets  INTEGER     NOT NULL DEFAULT 5 CHECK (max_active_tickets > 0),
    home_building_id    BIGINT      REFERENCES buildings (id) ON DELETE SET NULL,
    notes               TEXT,
    created_by          BIGINT      REFERENCES users (id) ON DELETE SET NULL,  -- facility admin
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX engineer_profiles_availability_idx ON engineer_profiles (availability);

CREATE TRIGGER engineer_profiles_updated_at BEFORE UPDATE ON engineer_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only users with role 'engineer' may have an engineer profile
CREATE FUNCTION check_engineer_role() RETURNS trigger AS $$
BEGIN
    IF (SELECT role FROM users WHERE id = NEW.user_id) <> 'engineer' THEN
        RAISE EXCEPTION 'User % is not an engineer', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER engineer_profiles_role_chk BEFORE INSERT OR UPDATE OF user_id ON engineer_profiles
    FOR EACH ROW EXECUTE FUNCTION check_engineer_role();

-- ---------------------------------------------------------------------
-- Incidents - all reported problems
-- ---------------------------------------------------------------------
CREATE TABLE incidents (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference             VARCHAR(20) GENERATED ALWAYS AS ('INC-' || lpad(id::text, 6, '0')) STORED,
    title                 VARCHAR(200)      NOT NULL,
    description           TEXT              NOT NULL,
    category              incident_category NOT NULL DEFAULT 'other',
    priority              incident_priority NOT NULL DEFAULT 'medium',
    status                incident_status   NOT NULL DEFAULT 'open',

    -- people
    reported_by           BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    assigned_engineer_id  BIGINT REFERENCES engineer_profiles (user_id) ON DELETE SET NULL,
    assigned_by           BIGINT REFERENCES users (id) ON DELETE SET NULL,
    assigned_at           TIMESTAMPTZ,

    -- location (building required, floor/seat optional but must be consistent)
    building_id           BIGINT NOT NULL REFERENCES buildings (id) ON DELETE RESTRICT,
    floor_id              BIGINT,
    seat_id               BIGINT,
    location_details      VARCHAR(255),           -- e.g. 'Men's restroom by lift B'

    -- employee priority request / escalation
    requested_priority    incident_priority,
    is_escalated          BOOLEAN NOT NULL DEFAULT FALSE,
    escalation_reason     TEXT,
    escalated_at          TIMESTAMPTZ,

    -- lifecycle timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ,
    closed_at             TIMESTAMPTZ,

    CONSTRAINT incidents_reference_uq UNIQUE (reference),
    CONSTRAINT incidents_floor_fk FOREIGN KEY (floor_id, building_id)
        REFERENCES floors (id, building_id) ON DELETE RESTRICT,
    CONSTRAINT incidents_seat_fk FOREIGN KEY (seat_id, floor_id)
        REFERENCES seats (id, floor_id) ON DELETE RESTRICT,
    CONSTRAINT incidents_seat_needs_floor_chk CHECK (seat_id IS NULL OR floor_id IS NOT NULL),
    CONSTRAINT incidents_escalation_chk CHECK (
        (is_escalated AND escalated_at IS NOT NULL) OR (NOT is_escalated)
    ),
    CONSTRAINT incidents_assignment_chk CHECK (
        status IN ('open', 'cancelled') OR assigned_engineer_id IS NOT NULL
    )
);
CREATE INDEX incidents_status_idx      ON incidents (status);
CREATE INDEX incidents_reported_by_idx ON incidents (reported_by);
CREATE INDEX incidents_engineer_idx    ON incidents (assigned_engineer_id) WHERE assigned_engineer_id IS NOT NULL;
CREATE INDEX incidents_building_idx    ON incidents (building_id);
CREATE INDEX incidents_created_at_idx  ON incidents (created_at DESC);

CREATE TRIGGER incidents_updated_at BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Incident notes - conversation between employee, engineer and admin
-- ---------------------------------------------------------------------
CREATE TABLE incident_notes (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    incident_id  BIGINT      NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
    author_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    body         TEXT        NOT NULL CHECK (length(trim(body)) > 0),
    is_internal  BOOLEAN     NOT NULL DEFAULT FALSE,  -- visible to admins/engineers only
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX incident_notes_incident_idx ON incident_notes (incident_id, created_at);

CREATE TRIGGER incident_notes_updated_at BEFORE UPDATE ON incident_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Incident history - audit trail of status / assignment / priority changes
-- ---------------------------------------------------------------------
CREATE TABLE incident_history (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    incident_id  BIGINT        NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
    event_type   history_event NOT NULL,
    from_value   VARCHAR(100),
    to_value     VARCHAR(100),
    comment      TEXT,
    changed_by   BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX incident_history_incident_idx ON incident_history (incident_id, created_at);

-- Automatically record history whenever an incident is created or changed.
-- The backend should run   SET LOCAL app.user_id = '<id>';   inside the
-- transaction so the acting user is captured in changed_by.
CREATE FUNCTION log_incident_changes() RETURNS trigger AS $$
DECLARE
    actor BIGINT := NULLIF(current_setting('app.user_id', TRUE), '')::BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO incident_history (incident_id, event_type, to_value, changed_by)
        VALUES (NEW.id, 'created', NEW.status::text, COALESCE(actor, NEW.reported_by));
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO incident_history (incident_id, event_type, from_value, to_value, changed_by)
        VALUES (NEW.id, 'status_change', OLD.status::text, NEW.status::text, actor);
    END IF;

    IF NEW.assigned_engineer_id IS DISTINCT FROM OLD.assigned_engineer_id THEN
        INSERT INTO incident_history (incident_id, event_type, from_value, to_value, changed_by)
        VALUES (NEW.id, 'assignment', OLD.assigned_engineer_id::text, NEW.assigned_engineer_id::text, actor);
    END IF;

    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
        INSERT INTO incident_history (incident_id, event_type, from_value, to_value, changed_by)
        VALUES (NEW.id, 'priority_change', OLD.priority::text, NEW.priority::text, actor);
    END IF;

    IF NEW.requested_priority IS DISTINCT FROM OLD.requested_priority
       AND NEW.requested_priority IS NOT NULL THEN
        INSERT INTO incident_history (incident_id, event_type, from_value, to_value, changed_by)
        VALUES (NEW.id, 'priority_request', OLD.priority::text, NEW.requested_priority::text, actor);
    END IF;

    IF NEW.is_escalated AND NOT OLD.is_escalated THEN
        INSERT INTO incident_history (incident_id, event_type, to_value, comment, changed_by)
        VALUES (NEW.id, 'escalation', 'escalated', NEW.escalation_reason, actor);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incidents_history AFTER INSERT OR UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION log_incident_changes();

-- ---------------------------------------------------------------------
-- View: live engineer workload (for assignment decisions)
-- ---------------------------------------------------------------------
CREATE VIEW engineer_workload AS
SELECT
    ep.user_id                                   AS engineer_id,
    u.full_name,
    u.email,
    ep.availability,
    ep.specializations,
    ep.max_active_tickets,
    COUNT(i.id)                                  AS active_tickets,
    ep.max_active_tickets - COUNT(i.id)          AS remaining_capacity
FROM engineer_profiles ep
JOIN users u ON u.id = ep.user_id
LEFT JOIN incidents i
       ON i.assigned_engineer_id = ep.user_id
      AND i.status IN ('assigned', 'in_progress', 'on_hold')
WHERE u.is_active
GROUP BY ep.user_id, u.full_name, u.email, ep.availability,
         ep.specializations, ep.max_active_tickets;

COMMIT;
