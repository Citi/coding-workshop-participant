CREATE TABLE IF NOT EXISTS departments (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_name ON departments (lower(name));

CREATE TABLE IF NOT EXISTS users (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(10)  NOT NULL DEFAULT 'VIEWER'
                   CHECK (role IN ('ADMIN', 'PM', 'LEAD', 'VIEWER')),
    department_id  BIGINT REFERENCES departments (id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (lower(email));

CREATE TABLE IF NOT EXISTS projects (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_name        VARCHAR(200) NOT NULL,
    description         TEXT,
    department_id       BIGINT NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
    project_manager_id  BIGINT REFERENCES users (id) ON DELETE SET NULL,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    planned_budget      NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (planned_budget >= 0),
    status              VARCHAR(12) NOT NULL DEFAULT 'PLANNED'
                        CHECK (status IN ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_projects_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_projects_department ON projects (department_id);
CREATE INDEX IF NOT EXISTS ix_projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS deliverables (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id             BIGINT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title                  VARCHAR(200) NOT NULL,
    description            TEXT,
    assigned_user_id       BIGINT REFERENCES users (id) ON DELETE SET NULL,
    start_date             DATE,
    due_date               DATE NOT NULL,
    completion_percentage  SMALLINT NOT NULL DEFAULT 0
                           CHECK (completion_percentage BETWEEN 0 AND 100),
    status                 VARCHAR(12) NOT NULL DEFAULT 'NOT_STARTED'
                           CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE')),
    blocked_reason         TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_deliverables_dates CHECK (start_date IS NULL OR due_date >= start_date),
    CONSTRAINT ck_deliverables_done  CHECK (status <> 'DONE' OR completion_percentage = 100)
);
CREATE INDEX IF NOT EXISTS ix_deliverables_project ON deliverables (project_id);
CREATE INDEX IF NOT EXISTS ix_deliverables_assignee ON deliverables (assigned_user_id);
CREATE INDEX IF NOT EXISTS ix_deliverables_status ON deliverables (status);

CREATE TABLE IF NOT EXISTS deliverable_dependencies (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    predecessor_deliverable_id  BIGINT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
    successor_deliverable_id    BIGINT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dependency_edge UNIQUE (predecessor_deliverable_id, successor_deliverable_id),
    CONSTRAINT ck_dependency_not_self CHECK (predecessor_deliverable_id <> successor_deliverable_id)
);
CREATE INDEX IF NOT EXISTS ix_dependencies_successor ON deliverable_dependencies (successor_deliverable_id);

CREATE TABLE IF NOT EXISTS resource_allocations (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id                BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id             BIGINT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    deliverable_id         BIGINT REFERENCES deliverables (id) ON DELETE SET NULL,
    allocation_percentage  SMALLINT NOT NULL CHECK (allocation_percentage BETWEEN 1 AND 100),
    start_date             DATE NOT NULL,
    end_date               DATE NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_allocations_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_allocations_user ON resource_allocations (user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS ix_allocations_project ON resource_allocations (project_id);

CREATE TABLE IF NOT EXISTS budget_entries (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id   BIGINT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    category     VARCHAR(10) NOT NULL
                 CHECK (category IN ('LABOR', 'SOFTWARE', 'HARDWARE', 'VENDOR', 'TRAVEL', 'OTHER')),
    description  VARCHAR(300),
    amount       NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    entry_date   DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_budget_entries_project ON budget_entries (project_id);

-- actor_id has no foreign key on purpose: the table is append-only, and a
-- cascading SET NULL would count as an update and be rejected by the trigger.
CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id      BIGINT,
    actor_email   VARCHAR(255),
    entity_type   VARCHAR(40) NOT NULL,
    entity_id     BIGINT,
    action        VARCHAR(10) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    before_state  JSONB,
    after_state   JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
