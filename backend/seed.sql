-- =============================================================================
-- ACME Inc. — sample portfolio
-- =============================================================================
-- Applied with:  ./backend/init-db.sh --seed
--            or: aws lambda invoke --payload '{"action":"seed"}' ...
--
-- Two properties this file deliberately holds:
--
--   Idempotent. Every row carries a fixed UUID and every INSERT ends with
--   ON CONFLICT (id) DO NOTHING, so re-running tops up what is missing instead
--   of duplicating the portfolio.
--
--   Relative dates. Everything is expressed as CURRENT_DATE ± n, so the
--   at-risk, overdue and utilization views keep telling the same story
--   whenever the seed is applied rather than going stale after a fortnight.
--
-- The data is shaped to exercise the reports, not just to fill tables:
--   * Orion is late AND overspent      -> High risk
--   * Draco has overdue deliverables   -> Medium risk
--   * Sam, Lena and Omar are over-allocated across projects
--   * Titan is on hold with spend already booked
--   * Lyra is complete and under budget (the healthy control case)
-- =============================================================================

-- All seeded accounts share this password.
--   Password: workshop-pass-2026
-- pgcrypto's bcrypt ($2a$) is what the API's Python bcrypt verifies against,
-- so these hashes work at the login endpoint without a round trip through the
-- application.

-- =============================================================================
-- USERS  (emails follow the role rules in backend/auth/models.py)
-- =============================================================================
INSERT INTO users (id, email, password_hash, full_name, role_id) VALUES
    ('00000000-0000-4000-8000-000000000001', 'ada.admin@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Ada Sanders',
     (SELECT id FROM roles WHERE name = 'ADMIN')),
    ('00000000-0000-4000-8000-000000000002', 'ray.mr@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Ray Okafor',
     (SELECT id FROM roles WHERE name = 'PROJECT_MANAGER')),
    ('00000000-0000-4000-8000-000000000003', 'nina.mr@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Nina Petrova',
     (SELECT id FROM roles WHERE name = 'PROJECT_MANAGER')),
    ('00000000-0000-4000-8000-000000000004', 'omar.tl@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Omar Haddad',
     (SELECT id FROM roles WHERE name = 'TEAM_LEADER')),
    ('00000000-0000-4000-8000-000000000005', 'priya.tl@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Priya Raman',
     (SELECT id FROM roles WHERE name = 'TEAM_LEADER')),
    ('00000000-0000-4000-8000-000000000006', 'sam@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Sam Whitfield',
     (SELECT id FROM roles WHERE name = 'EMPLOYEE')),
    ('00000000-0000-4000-8000-000000000007', 'lena@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Lena Fischer',
     (SELECT id FROM roles WHERE name = 'EMPLOYEE')),
    ('00000000-0000-4000-8000-000000000008', 'theo@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Theo Nakamura',
     (SELECT id FROM roles WHERE name = 'EMPLOYEE')),
    ('00000000-0000-4000-8000-000000000009', 'iris@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Iris Bello',
     (SELECT id FROM roles WHERE name = 'EMPLOYEE')),
    ('00000000-0000-4000-8000-000000000010', 'marcus@acme.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Marcus Lindqvist',
     (SELECT id FROM roles WHERE name = 'EMPLOYEE')),
    ('00000000-0000-4000-8000-000000000011', 'board@gmail.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Jordan Reeves',
     (SELECT id FROM roles WHERE name = 'STAKEHOLDER')),
    ('00000000-0000-4000-8000-000000000012', 'cfo@gmail.com',
     crypt('workshop-pass-2026', gen_salt('bf', 12)), 'Helen Marsh',
     (SELECT id FROM roles WHERE name = 'STAKEHOLDER'))
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- RESOURCES  (the people being tracked; capacity varies for part-timers)
-- =============================================================================
INSERT INTO resources (id, full_name, email, role_title, capacity_pct, user_id) VALUES
    ('00000000-0000-4000-8001-000000000001', 'Omar Haddad',      'omar.eng@acme.com',   'Engineering Lead',    100, '00000000-0000-4000-8000-000000000004'),
    ('00000000-0000-4000-8001-000000000002', 'Priya Raman',      'priya.eng@acme.com',  'Data Lead',           100, '00000000-0000-4000-8000-000000000005'),
    ('00000000-0000-4000-8001-000000000003', 'Sam Whitfield',    'sam.eng@acme.com',    'Backend Engineer',    100, '00000000-0000-4000-8000-000000000006'),
    ('00000000-0000-4000-8001-000000000004', 'Lena Fischer',     'lena.eng@acme.com',   'Frontend Engineer',   100, '00000000-0000-4000-8000-000000000007'),
    ('00000000-0000-4000-8001-000000000005', 'Theo Nakamura',    'theo.eng@acme.com',   'Data Engineer',       100, '00000000-0000-4000-8000-000000000008'),
    ('00000000-0000-4000-8001-000000000006', 'Iris Bello',       'iris.des@acme.com',   'UX Designer',          80, '00000000-0000-4000-8000-000000000009'),
    ('00000000-0000-4000-8001-000000000007', 'Marcus Lindqvist', 'marcus.qa@acme.com',  'QA Engineer',         100, '00000000-0000-4000-8000-000000000010'),
    -- Contractors and part-timers with no login account.
    ('00000000-0000-4000-8001-000000000008', 'Yuki Tanaka',      'yuki.c@acme.com',     'DevOps Engineer',      60, NULL),
    ('00000000-0000-4000-8001-000000000009', 'Priscilla Adeyemi','pris.c@acme.com',     'Security Consultant',  50, NULL),
    ('00000000-0000-4000-8001-000000000010', 'Dan Whelan',       'dan.c@acme.com',      'Technical Writer',     40, NULL),
    ('00000000-0000-4000-8001-000000000011', 'Sofia Marchetti',  'sofia.c@acme.com',    'Business Analyst',    100, NULL),
    ('00000000-0000-4000-8001-000000000012', 'Kwame Mensah',     'kwame.c@acme.com',    'Solutions Architect',  80, NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- PROJECTS
-- =============================================================================
INSERT INTO projects (id, name, description, department, status, start_date, end_date, planned_budget, owner_id) VALUES
    ('00000000-0000-4000-8002-000000000001', 'Atlas Billing Migration',
     'Move billing off the legacy mainframe onto the new platform.',
     'Engineering', 'active',    CURRENT_DATE - 180, CURRENT_DATE + 45,  450000.00, '00000000-0000-4000-8000-000000000002'),

    -- Late and overspent: the High-risk case.
    ('00000000-0000-4000-8002-000000000002', 'Orion Analytics Platform',
     'Self-service reporting and dashboards for the commercial teams.',
     'Data', 'active',           CURRENT_DATE - 300, CURRENT_DATE - 20,  320000.00, '00000000-0000-4000-8000-000000000003'),

    ('00000000-0000-4000-8002-000000000003', 'Helios Mobile App',
     'Customer-facing iOS and Android application.',
     'Product', 'active',        CURRENT_DATE - 90,  CURRENT_DATE + 120, 275000.00, '00000000-0000-4000-8000-000000000002'),

    ('00000000-0000-4000-8002-000000000004', 'Vega Compliance Audit',
     'SOC 2 Type II readiness assessment and remediation.',
     'Legal', 'planning',        CURRENT_DATE + 30,  CURRENT_DATE + 210,  95000.00, '00000000-0000-4000-8000-000000000003'),

    ('00000000-0000-4000-8002-000000000005', 'Nova CRM Rollout',
     'Replace the in-house CRM with a vendor platform.',
     'Sales', 'active',          CURRENT_DATE - 60,  CURRENT_DATE + 90,  180000.00, '00000000-0000-4000-8000-000000000002'),

    -- Paused with money already spent.
    ('00000000-0000-4000-8002-000000000006', 'Titan Warehouse Automation',
     'Robotics pilot for the Rotterdam distribution centre.',
     'Operations', 'on_hold',    CURRENT_DATE - 150, CURRENT_DATE + 60,  620000.00, '00000000-0000-4000-8000-000000000003'),

    -- The healthy control case: delivered, under budget.
    ('00000000-0000-4000-8002-000000000007', 'Lyra Website Refresh',
     'Rebrand and rebuild of the public marketing site.',
     'Marketing', 'completed',   CURRENT_DATE - 240, CURRENT_DATE - 60,   85000.00, '00000000-0000-4000-8000-000000000002'),

    -- Overdue deliverables: the Medium-risk case.
    ('00000000-0000-4000-8002-000000000008', 'Draco Security Hardening',
     'Close the findings raised by the external penetration test.',
     'Engineering', 'active',    CURRENT_DATE - 120, CURRENT_DATE + 10,  140000.00, '00000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- DELIVERABLES
-- =============================================================================
INSERT INTO deliverables (id, project_id, name, description, status, completion_percentage, due_date, assignee_id) VALUES
    -- Atlas: mostly on track, one blocked
    ('00000000-0000-4000-8003-000000000001', '00000000-0000-4000-8002-000000000001', 'Provision target database',  'Aurora cluster, schema and roles.',            'completed',   100, CURRENT_DATE - 150, '00000000-0000-4000-8001-000000000008'),
    ('00000000-0000-4000-8003-000000000002', '00000000-0000-4000-8002-000000000001', 'Migrate customer records',   'Move and reconcile 2.4M customer rows.',       'completed',   100, CURRENT_DATE - 100, '00000000-0000-4000-8001-000000000003'),
    ('00000000-0000-4000-8003-000000000003', '00000000-0000-4000-8002-000000000001', 'Migrate billing tables',     'Invoices, payments and adjustments.',          'in_progress',  65, CURRENT_DATE + 10,  '00000000-0000-4000-8001-000000000003'),
    ('00000000-0000-4000-8003-000000000004', '00000000-0000-4000-8002-000000000001', 'Parallel-run reconciliation','Run both systems and compare output.',         'blocked',      20, CURRENT_DATE + 25,  '00000000-0000-4000-8001-000000000007'),
    ('00000000-0000-4000-8003-000000000005', '00000000-0000-4000-8002-000000000001', 'Cutover and decommission',   'Final switch and mainframe shutdown.',         'not_started',   0, CURRENT_DATE + 44,  '00000000-0000-4000-8001-000000000001'),

    -- Orion: badly behind, several overdue
    ('00000000-0000-4000-8003-000000000006', '00000000-0000-4000-8002-000000000002', 'Data warehouse design',      'Star schema and ingestion design.',            'completed',   100, CURRENT_DATE - 240, '00000000-0000-4000-8001-000000000002'),
    ('00000000-0000-4000-8003-000000000007', '00000000-0000-4000-8002-000000000002', 'Build ingestion pipelines',  'Nightly loads from twelve source systems.',    'in_progress',  45, CURRENT_DATE - 60,  '00000000-0000-4000-8001-000000000005'),
    ('00000000-0000-4000-8003-000000000008', '00000000-0000-4000-8002-000000000002', 'Legacy report parity',       'Reproduce the 40 reports finance rely on.',    'blocked',      15, CURRENT_DATE - 30,  '00000000-0000-4000-8001-000000000005'),
    ('00000000-0000-4000-8003-000000000009', '00000000-0000-4000-8002-000000000002', 'Self-service dashboards',    'Commercial team dashboard pack.',              'not_started',   0, CURRENT_DATE - 10,  '00000000-0000-4000-8001-000000000011'),
    ('00000000-0000-4000-8003-000000000010', '00000000-0000-4000-8002-000000000002', 'User training',              'Workshops for 120 commercial users.',          'not_started',   0, CURRENT_DATE + 15,  '00000000-0000-4000-8001-000000000010'),

    -- Helios: healthy, early
    ('00000000-0000-4000-8003-000000000011', '00000000-0000-4000-8002-000000000003', 'Design system',              'Shared component library and tokens.',         'completed',   100, CURRENT_DATE - 40,  '00000000-0000-4000-8001-000000000006'),
    ('00000000-0000-4000-8003-000000000012', '00000000-0000-4000-8002-000000000003', 'Authentication flow',        'Sign-in, sign-up and password reset.',         'in_progress',  70, CURRENT_DATE + 20,  '00000000-0000-4000-8001-000000000004'),
    ('00000000-0000-4000-8003-000000000013', '00000000-0000-4000-8002-000000000003', 'Offline mode',               'Local cache and background sync.',             'in_progress',  30, CURRENT_DATE + 60,  '00000000-0000-4000-8001-000000000004'),
    ('00000000-0000-4000-8003-000000000014', '00000000-0000-4000-8002-000000000003', 'App store submission',       'Store listings, review and release.',          'not_started',   0, CURRENT_DATE + 115, '00000000-0000-4000-8001-000000000001'),

    -- Vega: not started yet
    ('00000000-0000-4000-8003-000000000015', '00000000-0000-4000-8002-000000000004', 'Control gap analysis',       'Assess current state against SOC 2.',          'not_started',   0, CURRENT_DATE + 60,  '00000000-0000-4000-8001-000000000009'),
    ('00000000-0000-4000-8003-000000000016', '00000000-0000-4000-8002-000000000004', 'Policy documentation',       'Write and approve the missing policies.',      'not_started',   0, CURRENT_DATE + 120, '00000000-0000-4000-8001-000000000010'),
    ('00000000-0000-4000-8003-000000000017', '00000000-0000-4000-8002-000000000004', 'Evidence collection',        'Automate evidence gathering.',                 'not_started',   0, CURRENT_DATE + 180, '00000000-0000-4000-8001-000000000009'),

    -- Nova
    ('00000000-0000-4000-8003-000000000018', '00000000-0000-4000-8002-000000000005', 'Vendor selection',           'RFP, scoring and contract.',                   'completed',   100, CURRENT_DATE - 30,  '00000000-0000-4000-8001-000000000011'),
    ('00000000-0000-4000-8003-000000000019', '00000000-0000-4000-8002-000000000005', 'Data migration',             'Move accounts, contacts and opportunities.',   'in_progress',  55, CURRENT_DATE + 25,  '00000000-0000-4000-8001-000000000005'),
    ('00000000-0000-4000-8003-000000000020', '00000000-0000-4000-8002-000000000005', 'Sales team training',        'Train 60 sellers across three regions.',       'not_started',   0, CURRENT_DATE + 75,  '00000000-0000-4000-8001-000000000010'),

    -- Titan: paused mid-flight
    ('00000000-0000-4000-8003-000000000021', '00000000-0000-4000-8002-000000000006', 'Site survey',                'Rotterdam floor plan and constraints.',        'completed',   100, CURRENT_DATE - 120, '00000000-0000-4000-8001-000000000012'),
    ('00000000-0000-4000-8003-000000000022', '00000000-0000-4000-8002-000000000006', 'Robotics vendor pilot',      'Two-vendor bake-off in a live aisle.',         'blocked',      40, CURRENT_DATE - 15,  '00000000-0000-4000-8001-000000000012'),
    ('00000000-0000-4000-8003-000000000023', '00000000-0000-4000-8002-000000000006', 'Safety certification',       'External sign-off before go-live.',            'not_started',   0, CURRENT_DATE + 55,  '00000000-0000-4000-8001-000000000009'),

    -- Lyra: delivered
    ('00000000-0000-4000-8003-000000000024', '00000000-0000-4000-8002-000000000007', 'Brand guidelines',           'Typography, palette and voice.',               'completed',   100, CURRENT_DATE - 200, '00000000-0000-4000-8001-000000000006'),
    ('00000000-0000-4000-8003-000000000025', '00000000-0000-4000-8002-000000000007', 'Site build',                 'Rebuild on the new stack.',                    'completed',   100, CURRENT_DATE - 120, '00000000-0000-4000-8001-000000000004'),
    ('00000000-0000-4000-8003-000000000026', '00000000-0000-4000-8002-000000000007', 'Content migration',          'Move 340 pages and redirect the old URLs.',    'completed',   100, CURRENT_DATE - 70,  '00000000-0000-4000-8001-000000000010'),

    -- Draco: overdue security work
    ('00000000-0000-4000-8003-000000000027', '00000000-0000-4000-8002-000000000008', 'Patch critical findings',    'The eleven criticals from the pen test.',      'completed',   100, CURRENT_DATE - 60,  '00000000-0000-4000-8001-000000000009'),
    ('00000000-0000-4000-8003-000000000028', '00000000-0000-4000-8002-000000000008', 'Rotate service credentials', 'Every shared secret and API key.',             'in_progress',  50, CURRENT_DATE - 12,  '00000000-0000-4000-8001-000000000008'),
    ('00000000-0000-4000-8003-000000000029', '00000000-0000-4000-8002-000000000008', 'Enforce MFA everywhere',     'All staff and all admin consoles.',            'in_progress',  35, CURRENT_DATE - 5,   '00000000-0000-4000-8001-000000000001'),
    ('00000000-0000-4000-8003-000000000030', '00000000-0000-4000-8002-000000000008', 'Re-test and sign-off',       'Second pen test to confirm closure.',          'not_started',   0, CURRENT_DATE + 9,   '00000000-0000-4000-8001-000000000009')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- DEPENDENCIES  ("deliverable_id depends on depends_on_id")
-- Chains stay inside one project, as the API enforces on write.
-- =============================================================================
INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) VALUES
    -- Atlas: provision -> customers -> billing -> reconcile -> cutover
    ('00000000-0000-4000-8003-000000000002', '00000000-0000-4000-8003-000000000001'),
    ('00000000-0000-4000-8003-000000000003', '00000000-0000-4000-8003-000000000002'),
    ('00000000-0000-4000-8003-000000000004', '00000000-0000-4000-8003-000000000003'),
    ('00000000-0000-4000-8003-000000000005', '00000000-0000-4000-8003-000000000004'),

    -- Orion: design -> pipelines -> {parity, dashboards} -> training
    ('00000000-0000-4000-8003-000000000007', '00000000-0000-4000-8003-000000000006'),
    ('00000000-0000-4000-8003-000000000008', '00000000-0000-4000-8003-000000000007'),
    ('00000000-0000-4000-8003-000000000009', '00000000-0000-4000-8003-000000000007'),
    ('00000000-0000-4000-8003-000000000010', '00000000-0000-4000-8003-000000000009'),

    -- Helios: design system -> auth -> offline -> submission
    ('00000000-0000-4000-8003-000000000012', '00000000-0000-4000-8003-000000000011'),
    ('00000000-0000-4000-8003-000000000013', '00000000-0000-4000-8003-000000000012'),
    ('00000000-0000-4000-8003-000000000014', '00000000-0000-4000-8003-000000000013'),

    -- Vega: gaps -> policies -> evidence
    ('00000000-0000-4000-8003-000000000016', '00000000-0000-4000-8003-000000000015'),
    ('00000000-0000-4000-8003-000000000017', '00000000-0000-4000-8003-000000000016'),

    -- Nova: vendor -> migration -> training
    ('00000000-0000-4000-8003-000000000019', '00000000-0000-4000-8003-000000000018'),
    ('00000000-0000-4000-8003-000000000020', '00000000-0000-4000-8003-000000000019'),

    -- Titan: survey -> pilot -> certification
    ('00000000-0000-4000-8003-000000000022', '00000000-0000-4000-8003-000000000021'),
    ('00000000-0000-4000-8003-000000000023', '00000000-0000-4000-8003-000000000022'),

    -- Lyra: brand -> build -> content
    ('00000000-0000-4000-8003-000000000025', '00000000-0000-4000-8003-000000000024'),
    ('00000000-0000-4000-8003-000000000026', '00000000-0000-4000-8003-000000000025'),

    -- Draco: patch -> {credentials, MFA} -> re-test
    ('00000000-0000-4000-8003-000000000028', '00000000-0000-4000-8003-000000000027'),
    ('00000000-0000-4000-8003-000000000029', '00000000-0000-4000-8003-000000000027'),
    ('00000000-0000-4000-8003-000000000030', '00000000-0000-4000-8003-000000000029')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- ALLOCATIONS
-- Sam (140%), Lena (130%) and Omar (120%) are deliberately over capacity, so
-- v_resource_utilization has something real to flag.
-- =============================================================================
INSERT INTO allocations (id, resource_id, project_id, allocation_pct, start_date, end_date) VALUES
    -- Omar: 120% across Atlas and Draco
    ('00000000-0000-4000-8004-000000000001', '00000000-0000-4000-8001-000000000001', '00000000-0000-4000-8002-000000000001', 70, CURRENT_DATE - 180, CURRENT_DATE + 45),
    ('00000000-0000-4000-8004-000000000002', '00000000-0000-4000-8001-000000000001', '00000000-0000-4000-8002-000000000008', 50, CURRENT_DATE - 120, CURRENT_DATE + 10),

    -- Priya: 90%, within capacity
    ('00000000-0000-4000-8004-000000000003', '00000000-0000-4000-8001-000000000002', '00000000-0000-4000-8002-000000000002', 90, CURRENT_DATE - 300, NULL),

    -- Sam: 140% across three projects
    ('00000000-0000-4000-8004-000000000004', '00000000-0000-4000-8001-000000000003', '00000000-0000-4000-8002-000000000001', 60, CURRENT_DATE - 180, CURRENT_DATE + 45),
    ('00000000-0000-4000-8004-000000000005', '00000000-0000-4000-8001-000000000003', '00000000-0000-4000-8002-000000000002', 50, CURRENT_DATE - 90,  NULL),
    ('00000000-0000-4000-8004-000000000006', '00000000-0000-4000-8001-000000000003', '00000000-0000-4000-8002-000000000005', 30, CURRENT_DATE - 60,  CURRENT_DATE + 90),

    -- Lena: 130% across Helios and Nova
    ('00000000-0000-4000-8004-000000000007', '00000000-0000-4000-8001-000000000004', '00000000-0000-4000-8002-000000000003', 80, CURRENT_DATE - 90,  CURRENT_DATE + 120),
    ('00000000-0000-4000-8004-000000000008', '00000000-0000-4000-8001-000000000004', '00000000-0000-4000-8002-000000000005', 50, CURRENT_DATE - 60,  CURRENT_DATE + 90),

    -- Theo
    ('00000000-0000-4000-8004-000000000009', '00000000-0000-4000-8001-000000000005', '00000000-0000-4000-8002-000000000002', 60, CURRENT_DATE - 200, NULL),
    ('00000000-0000-4000-8004-000000000010', '00000000-0000-4000-8001-000000000005', '00000000-0000-4000-8002-000000000005', 40, CURRENT_DATE - 60,  CURRENT_DATE + 90),

    -- Iris: 80% capacity, 70% used
    ('00000000-0000-4000-8004-000000000011', '00000000-0000-4000-8001-000000000006', '00000000-0000-4000-8002-000000000003', 70, CURRENT_DATE - 90,  CURRENT_DATE + 120),

    -- Marcus
    ('00000000-0000-4000-8004-000000000012', '00000000-0000-4000-8001-000000000007', '00000000-0000-4000-8002-000000000001', 50, CURRENT_DATE - 120, CURRENT_DATE + 45),
    ('00000000-0000-4000-8004-000000000013', '00000000-0000-4000-8001-000000000007', '00000000-0000-4000-8002-000000000003', 40, CURRENT_DATE - 60,  CURRENT_DATE + 120),

    -- Yuki: 60% capacity, exactly at it
    ('00000000-0000-4000-8004-000000000014', '00000000-0000-4000-8001-000000000008', '00000000-0000-4000-8002-000000000001', 30, CURRENT_DATE - 180, CURRENT_DATE + 45),
    ('00000000-0000-4000-8004-000000000015', '00000000-0000-4000-8001-000000000008', '00000000-0000-4000-8002-000000000008', 30, CURRENT_DATE - 120, CURRENT_DATE + 10),

    -- Priscilla: 50% capacity, 50% used
    ('00000000-0000-4000-8004-000000000016', '00000000-0000-4000-8001-000000000009', '00000000-0000-4000-8002-000000000008', 50, CURRENT_DATE - 120, CURRENT_DATE + 10),

    -- Dan
    ('00000000-0000-4000-8004-000000000017', '00000000-0000-4000-8001-000000000010', '00000000-0000-4000-8002-000000000002', 20, CURRENT_DATE - 60,  NULL),
    ('00000000-0000-4000-8004-000000000018', '00000000-0000-4000-8001-000000000010', '00000000-0000-4000-8002-000000000005', 20, CURRENT_DATE - 30,  CURRENT_DATE + 90),

    -- Sofia
    ('00000000-0000-4000-8004-000000000019', '00000000-0000-4000-8001-000000000011', '00000000-0000-4000-8002-000000000005', 60, CURRENT_DATE - 60,  CURRENT_DATE + 90),
    ('00000000-0000-4000-8004-000000000020', '00000000-0000-4000-8001-000000000011', '00000000-0000-4000-8002-000000000002', 30, CURRENT_DATE - 45,  NULL),

    -- Kwame: 80% capacity; Titan is paused so only Helios is live
    ('00000000-0000-4000-8004-000000000021', '00000000-0000-4000-8001-000000000012', '00000000-0000-4000-8002-000000000003', 50, CURRENT_DATE - 90,  CURRENT_DATE + 120),
    -- Ended when Titan was paused -- excluded from current utilization.
    ('00000000-0000-4000-8004-000000000022', '00000000-0000-4000-8001-000000000012', '00000000-0000-4000-8002-000000000006', 40, CURRENT_DATE - 150, CURRENT_DATE - 30)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- EXPENSES
-- Orion (352k of 320k) and Titan (655k of 620k) run over; the rest are within.
-- =============================================================================
INSERT INTO expenses (id, project_id, description, amount, category, incurred_on) VALUES
    -- Atlas: 268k of 450k
    ('00000000-0000-4000-8005-000000000001', '00000000-0000-4000-8002-000000000001', 'Migration contractors Q1',   96000.00,  'labor',     CURRENT_DATE - 160),
    ('00000000-0000-4000-8005-000000000002', '00000000-0000-4000-8002-000000000001', 'Migration contractors Q2',   88000.00,  'labor',     CURRENT_DATE - 70),
    ('00000000-0000-4000-8005-000000000003', '00000000-0000-4000-8002-000000000001', 'Aurora cluster',             42000.00,  'tooling',   CURRENT_DATE - 150),
    ('00000000-0000-4000-8005-000000000004', '00000000-0000-4000-8002-000000000001', 'Data validation tooling',    28000.00,  'tooling',   CURRENT_DATE - 90),
    ('00000000-0000-4000-8005-000000000005', '00000000-0000-4000-8002-000000000001', 'Mainframe egress fees',      14000.00,  'other',     CURRENT_DATE - 40),

    -- Orion: 352k of 320k -- overspent
    ('00000000-0000-4000-8005-000000000006', '00000000-0000-4000-8002-000000000002', 'Data engineering team',     145000.00,  'labor',     CURRENT_DATE - 260),
    ('00000000-0000-4000-8005-000000000007', '00000000-0000-4000-8002-000000000002', 'Warehouse licences',         78000.00,  'licensing', CURRENT_DATE - 240),
    ('00000000-0000-4000-8005-000000000008', '00000000-0000-4000-8002-000000000002', 'Pipeline rework',            64000.00,  'labor',     CURRENT_DATE - 80),
    ('00000000-0000-4000-8005-000000000009', '00000000-0000-4000-8002-000000000002', 'Emergency consultants',      45000.00,  'labor',     CURRENT_DATE - 25),
    ('00000000-0000-4000-8005-000000000010', '00000000-0000-4000-8002-000000000002', 'Extra compute',              20000.00,  'tooling',   CURRENT_DATE - 10),

    -- Helios: 118k of 275k
    ('00000000-0000-4000-8005-000000000011', '00000000-0000-4000-8002-000000000003', 'Mobile squad Q1',            72000.00,  'labor',     CURRENT_DATE - 75),
    ('00000000-0000-4000-8005-000000000012', '00000000-0000-4000-8002-000000000003', 'Design tooling',              9000.00,  'tooling',   CURRENT_DATE - 80),
    ('00000000-0000-4000-8005-000000000013', '00000000-0000-4000-8002-000000000003', 'Device lab',                 22000.00,  'hardware',  CURRENT_DATE - 60),
    ('00000000-0000-4000-8005-000000000014', '00000000-0000-4000-8002-000000000003', 'App store fees',             15000.00,  'licensing', CURRENT_DATE - 20),

    -- Vega: nothing spent yet (planning)

    -- Nova: 96k of 180k
    ('00000000-0000-4000-8005-000000000015', '00000000-0000-4000-8002-000000000005', 'CRM platform licences',      52000.00,  'licensing', CURRENT_DATE - 45),
    ('00000000-0000-4000-8005-000000000016', '00000000-0000-4000-8002-000000000005', 'Implementation partner',     34000.00,  'labor',     CURRENT_DATE - 30),
    ('00000000-0000-4000-8005-000000000017', '00000000-0000-4000-8002-000000000005', 'Regional workshops travel',  10000.00,  'travel',    CURRENT_DATE - 12),

    -- Titan: 655k of 620k -- overspent, and paused
    ('00000000-0000-4000-8005-000000000018', '00000000-0000-4000-8002-000000000006', 'Robotics hardware pilot',   380000.00,  'hardware',  CURRENT_DATE - 130),
    ('00000000-0000-4000-8005-000000000019', '00000000-0000-4000-8002-000000000006', 'Integration engineering',   145000.00,  'labor',     CURRENT_DATE - 100),
    ('00000000-0000-4000-8005-000000000020', '00000000-0000-4000-8002-000000000006', 'Site modifications',         92000.00,  'other',     CURRENT_DATE - 80),
    ('00000000-0000-4000-8005-000000000021', '00000000-0000-4000-8002-000000000006', 'Rotterdam site visits',      38000.00,  'travel',    CURRENT_DATE - 60),

    -- Lyra: 71k of 85k -- delivered under budget
    ('00000000-0000-4000-8005-000000000022', '00000000-0000-4000-8002-000000000007', 'Brand agency',               34000.00,  'labor',     CURRENT_DATE - 210),
    ('00000000-0000-4000-8005-000000000023', '00000000-0000-4000-8002-000000000007', 'Front-end build',            26000.00,  'labor',     CURRENT_DATE - 130),
    ('00000000-0000-4000-8005-000000000024', '00000000-0000-4000-8002-000000000007', 'Stock photography',           4000.00,  'licensing', CURRENT_DATE - 150),
    ('00000000-0000-4000-8005-000000000025', '00000000-0000-4000-8002-000000000007', 'CDN and hosting',             7000.00,  'tooling',   CURRENT_DATE - 90),

    -- Draco: 104k of 140k
    ('00000000-0000-4000-8005-000000000026', '00000000-0000-4000-8002-000000000008', 'Penetration test',           45000.00,  'labor',     CURRENT_DATE - 115),
    ('00000000-0000-4000-8005-000000000027', '00000000-0000-4000-8002-000000000008', 'Security consultant',        32000.00,  'labor',     CURRENT_DATE - 70),
    ('00000000-0000-4000-8005-000000000028', '00000000-0000-4000-8002-000000000008', 'Secrets manager',            15000.00,  'tooling',   CURRENT_DATE - 50),
    ('00000000-0000-4000-8005-000000000029', '00000000-0000-4000-8002-000000000008', 'MFA hardware tokens',        12000.00,  'hardware',  CURRENT_DATE - 30)
ON CONFLICT (id) DO NOTHING;
