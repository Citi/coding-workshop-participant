-- =====================================================================
-- 001: in-app notifications
-- Additive and safe to re-run on an existing database (no data loss):
--   psql -h <host> -U <user> -d <db> -f backend/db/migrations/001_notifications.sql
-- schema.sql already contains this table for fresh databases.
-- =====================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,    -- recipient
    incident_id   BIGINT       REFERENCES incidents (id) ON DELETE SET NULL,        -- kept if incident deleted
    incident_ref  VARCHAR(20),                                                      -- e.g. INC-000042
    actor_id      BIGINT       REFERENCES users (id) ON DELETE SET NULL,            -- who made the change
    kind          VARCHAR(40)  NOT NULL,                                            -- e.g. status_changed
    message       VARCHAR(500) NOT NULL,
    is_read       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
    ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_incident_idx
    ON notifications (incident_id);
