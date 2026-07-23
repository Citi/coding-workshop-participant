-- =============================================================================
-- ACME Inc. — Project Management & Tracking Platform
-- PostgreSQL schema
-- =============================================================================
-- Design goal: each of ACME's seven business questions should be answerable
-- by a straightforward query against this model. See the views at the bottom
-- for the two non-trivial ones (project risk, resource over-allocation).
--
-- Apply with:  ./backend/init-db.sh
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- provides gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh on any UPDATE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- AUTH / RBAC
-- =============================================================================

-- Small fixed lookup table -> SERIAL is fine here (contrast with the UUID
-- domain entities below). Admin / Manager / Contributor / Viewer.
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,          -- store a hash, never plaintext
    full_name     VARCHAR(150) NOT NULL,
    role_id       INTEGER NOT NULL REFERENCES roles(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- PEOPLE BEING TRACKED (distinct from login accounts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS resources (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name    VARCHAR(150) NOT NULL,
    email        VARCHAR(255) UNIQUE,
    role_title   VARCHAR(100),                    -- e.g. "Backend Engineer"
    capacity_pct SMALLINT NOT NULL DEFAULT 100
                 CHECK (capacity_pct BETWEEN 0 AND 100),  -- max available %
    user_id      UUID UNIQUE REFERENCES users(id),        -- optional login link
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- PROJECTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(200) NOT NULL,
    description    TEXT,
    department     VARCHAR(100),
    status         VARCHAR(20) NOT NULL DEFAULT 'planning'
                   CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
    start_date     DATE,
    end_date       DATE,                          -- planned delivery date
    planned_budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (planned_budget >= 0),
    owner_id       UUID REFERENCES users(id),     -- the project manager
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- =============================================================================
-- DELIVERABLES  (belong to a project; can depend on each other)
-- =============================================================================
CREATE TABLE IF NOT EXISTS deliverables (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                  VARCHAR(200) NOT NULL,
    description           TEXT,
    status                VARCHAR(20) NOT NULL DEFAULT 'not_started'
                          CHECK (status IN ('not_started','in_progress','blocked','completed','cancelled')),
    completion_percentage SMALLINT NOT NULL DEFAULT 0
                          CHECK (completion_percentage BETWEEN 0 AND 100),
    due_date              DATE,
    assignee_id           UUID REFERENCES resources(id),  -- who's doing it
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Self-referencing many-to-many: the dependency graph.
-- "deliverable_id depends on depends_on_id."
CREATE TABLE IF NOT EXISTS deliverable_dependencies (
    deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    depends_on_id  UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    PRIMARY KEY (deliverable_id, depends_on_id),
    CHECK (deliverable_id <> depends_on_id)   -- can't depend on itself
    -- NOTE: this prevents direct self-loops but NOT longer cycles
    -- (A->B->A). Enforce acyclicity in application logic before insert.
);

-- =============================================================================
-- RESOURCE ALLOCATION  (the engine behind the over-allocation question)
-- =============================================================================
CREATE TABLE IF NOT EXISTS allocations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id    UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    allocation_pct SMALLINT NOT NULL CHECK (allocation_pct BETWEEN 1 AND 100),
    start_date     DATE NOT NULL,
    end_date       DATE,                          -- NULL = open-ended
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- =============================================================================
-- BUDGET ACTUALS  (planned lives on projects; actuals are line items here)
-- =============================================================================
CREATE TABLE IF NOT EXISTS expenses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description VARCHAR(255),
    amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    category    VARCHAR(50),                       -- labor, tooling, travel...
    incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES  (foreign keys + columns you'll filter/aggregate on)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_role            ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_resources_user        ON resources(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status       ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner        ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_project  ON deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_status   ON deliverables(status);
CREATE INDEX IF NOT EXISTS idx_deliverables_assignee ON deliverables(assignee_id);
CREATE INDEX IF NOT EXISTS idx_dep_depends_on        ON deliverable_dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS idx_alloc_resource        ON allocations(resource_id);
CREATE INDEX IF NOT EXISTS idx_alloc_project         ON allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project      ON expenses(project_id);

-- =============================================================================
-- updated_at TRIGGERS
-- =============================================================================
-- DROP first so re-running the schema is idempotent (CREATE TRIGGER has no
-- IF NOT EXISTS before PostgreSQL 14, and this must work on any version here).
DROP TRIGGER IF EXISTS trg_users_updated        ON users;
DROP TRIGGER IF EXISTS trg_resources_updated    ON resources;
DROP TRIGGER IF EXISTS trg_projects_updated     ON projects;
DROP TRIGGER IF EXISTS trg_deliverables_updated ON deliverables;
DROP TRIGGER IF EXISTS trg_allocations_updated  ON allocations;

CREATE TRIGGER trg_users_updated        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_resources_updated    BEFORE UPDATE ON resources    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated     BEFORE UPDATE ON projects     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_deliverables_updated BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_allocations_updated  BEFORE UPDATE ON allocations  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SEED: RBAC roles
-- =============================================================================
INSERT INTO roles (name, description) VALUES
    ('ADMIN',           'Full system access. Manages users, projects, budgets, resources, and reports.'),
    ('PROJECT_MANAGER', 'Creates and manages projects, assigns team leaders, allocates budgets and resources, monitors progress.'),
    ('TEAM_LEADER',     'Leads a project team, assigns deliverables, updates progress, monitors team workload.'),
    ('EMPLOYEE',        'Views assigned projects and deliverables, updates task status and progress.'),
    ('STAKEHOLDER',     'Read-only access to dashboards, project status, budgets, timelines, and reports.')
ON CONFLICT (name) DO NOTHING;

-- Migrate anyone still on the original four-role model onto the new values.
-- Idempotent: after the first run no user matches, so this is a no-op.
UPDATE users u SET role_id = (SELECT id FROM roles WHERE name = 'ADMIN')
    WHERE u.role_id = (SELECT id FROM roles WHERE name = 'Admin');
UPDATE users u SET role_id = (SELECT id FROM roles WHERE name = 'PROJECT_MANAGER')
    WHERE u.role_id = (SELECT id FROM roles WHERE name = 'Manager');
UPDATE users u SET role_id = (SELECT id FROM roles WHERE name = 'EMPLOYEE')
    WHERE u.role_id = (SELECT id FROM roles WHERE name = 'Contributor');
UPDATE users u SET role_id = (SELECT id FROM roles WHERE name = 'STAKEHOLDER')
    WHERE u.role_id = (SELECT id FROM roles WHERE name = 'Viewer');

-- Retire the superseded rows once nothing references them. The NOT EXISTS
-- guard means a role still in use is left alone rather than failing on its
-- foreign key.
DELETE FROM roles r
 WHERE r.name IN ('Admin', 'Manager', 'Contributor', 'Viewer')
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role_id = r.id);

-- =============================================================================
-- VIEWS — the two questions that aren't a plain SELECT
-- =============================================================================

-- Q: "Which team members are over-allocated across multiple projects?"
-- Sum each resource's CURRENTLY ACTIVE allocations; flag if over capacity.
CREATE OR REPLACE VIEW v_resource_utilization AS
SELECT
    r.id,
    r.full_name,
    r.role_title,
    r.capacity_pct,
    COALESCE(SUM(a.allocation_pct), 0)                    AS allocated_pct,
    COUNT(DISTINCT a.project_id)                          AS project_count,
    COALESCE(SUM(a.allocation_pct), 0) > r.capacity_pct   AS is_over_allocated
FROM resources r
LEFT JOIN allocations a
       ON a.resource_id = r.id
      AND a.start_date <= CURRENT_DATE
      AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
GROUP BY r.id, r.full_name, r.role_title, r.capacity_pct;

-- Q: "Which projects are at risk?" + "budget consumed vs planned?"
-- IMPORTANT: deliverables and expenses are aggregated in SEPARATE subqueries.
-- Joining both directly to projects would fan out rows and inflate the SUMs.
CREATE OR REPLACE VIEW v_project_health AS
SELECT
    p.id,
    p.name,
    p.status,
    p.end_date,
    p.planned_budget,
    COALESCE(bud.consumed, 0)          AS budget_consumed,
    del.avg_completion,
    COALESCE(del.total_count, 0)       AS deliverable_count,
    COALESCE(del.overdue_count, 0)     AS overdue_count,
    (   p.status = 'active'
        AND p.end_date IS NOT NULL
        AND p.end_date < CURRENT_DATE + INTERVAL '14 days'
        AND COALESCE(del.avg_completion, 0) < 80
    )                                  AS at_risk
FROM projects p
LEFT JOIN (
    SELECT project_id,
           ROUND(AVG(completion_percentage), 1) AS avg_completion,
           COUNT(*)                             AS total_count,
           COUNT(*) FILTER (
               WHERE due_date < CURRENT_DATE
                 AND status NOT IN ('completed','cancelled')
           )                                    AS overdue_count
    FROM deliverables GROUP BY project_id
) del ON del.project_id = p.id
LEFT JOIN (
    SELECT project_id, SUM(amount) AS consumed
    FROM expenses GROUP BY project_id
) bud ON bud.project_id = p.id;

-- =============================================================================
-- Q: "What is the dependency chain between deliverables?"
-- Recursive CTE — not a view because it takes a starting deliverable.
-- Implemented in deliverables/service.py; kept here for reference.
-- =============================================================================
-- WITH RECURSIVE chain AS (
--     SELECT deliverable_id, depends_on_id, 1 AS depth
--     FROM deliverable_dependencies
--     WHERE deliverable_id = :start_id
--   UNION ALL
--     SELECT dd.deliverable_id, dd.depends_on_id, c.depth + 1
--     FROM deliverable_dependencies dd
--     JOIN chain c ON dd.deliverable_id = c.depends_on_id
-- )
-- SELECT * FROM chain;
