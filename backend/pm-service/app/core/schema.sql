-- ACME project tracker schema.
-- Idempotent: executed on every Lambda cold start (CREATE ... IF NOT EXISTS).
-- Business rules that the database can guarantee are enforced here too
-- (uniqueness, enums, ranges, date order, referential integrity).

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'manager', 'contributor', 'viewer')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150)  NOT NULL,
    description TEXT          NOT NULL DEFAULT '',
    department  VARCHAR(100)  NOT NULL,
    status      VARCHAR(20)   NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
    start_date  DATE          NOT NULL,
    end_date    DATE          NOT NULL,
    budget      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT projects_dates_check CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_name_key ON projects (lower(name));
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);

CREATE TABLE IF NOT EXISTS resources (
    id         SERIAL PRIMARY KEY,
    full_name  VARCHAR(120) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    job_title  VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resources_email_key ON resources (lower(email));

CREATE TABLE IF NOT EXISTS deliverables (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    status      VARCHAR(20)  NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed')),
    due_date    DATE         NOT NULL,
    is_key      BOOLEAN      NOT NULL DEFAULT FALSE,
    owner_id    INTEGER      REFERENCES resources (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS deliverables_project_name_key ON deliverables (project_id, lower(name));
CREATE INDEX IF NOT EXISTS deliverables_owner_idx ON deliverables (owner_id);
CREATE INDEX IF NOT EXISTS deliverables_due_date_idx ON deliverables (due_date);

CREATE TABLE IF NOT EXISTS deliverable_dependencies (
    deliverable_id INTEGER NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
    depends_on_id  INTEGER NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
    PRIMARY KEY (deliverable_id, depends_on_id),
    CONSTRAINT deliverable_dependencies_no_self CHECK (deliverable_id <> depends_on_id)
);
CREATE INDEX IF NOT EXISTS deliverable_dependencies_depends_on_idx ON deliverable_dependencies (depends_on_id);

CREATE TABLE IF NOT EXISTS allocations (
    id                 SERIAL PRIMARY KEY,
    resource_id        INTEGER     NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    project_id         INTEGER     NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    allocation_percent INTEGER     NOT NULL CHECK (allocation_percent BETWEEN 1 AND 100),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT allocations_resource_project_key UNIQUE (resource_id, project_id)
);
CREATE INDEX IF NOT EXISTS allocations_project_idx ON allocations (project_id);

CREATE TABLE IF NOT EXISTS expenses (
    id           SERIAL PRIMARY KEY,
    project_id   INTEGER       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    category     VARCHAR(20)   NOT NULL CHECK (category IN ('labor', 'software', 'hardware', 'travel', 'other')),
    description  VARCHAR(255)  NOT NULL,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    expense_date DATE          NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_project_idx ON expenses (project_id);
