# Testing – ACME Project Tracker

How the application is tested, how to run every suite, the latest results, and known gaps.

## Strategy

| Level | What it proves | Tool | Location |
|---|---|---|---|
| Backend unit | business rules (health, progress, budget, over-allocation, dependency cycles), validation, tokens, permission matrix, router | pytest | `backend/tests/unit/` |
| Backend integration | every endpoint through the real Lambda handler against a real PostgreSQL database: CRUD, filters, computed fields, validation (400), auth (401), RBAC (403), not found (404), duplicates (409), cascades | pytest + PostgreSQL | `backend/tests/integration/` |
| Frontend component | pages and shared components: loading/empty/error states, forms and validation, server errors on fields, role-based visibility, filters | Vitest + React Testing Library | `frontend/src/**/*.test.jsx` |
| Frontend API client | token header, silent refresh on expiry, session end, error normalisation, network failure (mocked `fetch`) | Vitest | `frontend/src/services/apiClient.test.js` |
| End-to-end | critical user journeys in a real browser against the running stack (UI → API → database) | Cypress 16 | `e2e/cypress/e2e/` |
| Load | read-heavy API traffic with authentication | Artillery 2 | `e2e/load/api-load.yml` |
| Manual | checklist below | browser + `psql` | — |

Integration tests use a separate database (default `pm_test`, override with `TEST_DB_NAME`) that is
wiped before every test, so they never touch application data. End-to-end tests create uniquely named
records (`E2E <run-id> …`) through the API and delete them afterwards.

## How to run

Run everything from a VS Code terminal in the project folder. The local stack must be running for the
end-to-end and load tests (`./bin/start-dev.sh`).

```bash
# Backend (first time: create the virtual environment)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest --cov=app --cov-report=term-missing

# Frontend
cd frontend
npm test                 # all tests
npm run test:coverage    # with coverage (HTML report: frontend/coverage/index.html)
npm run lint

# End-to-end (first time: npm install)
cd e2e
npm install
npm run e2e              # headless, all specs
npm run e2e:open         # interactive runner - watch the browser
# against AWS:
E2E_BASE_URL=https://<cloudfront-domain> E2E_API_URL=https://<cloudfront-domain>/api/pm-service npm run e2e

# Load
cd e2e
npx artillery run load/api-load.yml                                   # local
npx artillery run -t https://<cloudfront-domain> load/api-load.yml    # AWS
```

## Critical user journeys covered end-to-end

| Journey | Spec |
|---|---|
| Login validation, wrong password, login → reload keeps session → logout, anonymous redirect, invalid token logs out, Users menu only for admins | `auth.cy.js` |
| Project create (with date validation) → search → open → edit → delete (cascade warning); duplicate name shown on the field | `projects.cy.js` |
| Deliverables with a dependency, key flag, dependency chain view, "key deliverables only" filter, circular dependency rejected | `deliverables.cy.js` |
| Allocate a person from the project's Team tab → over-allocation warning → "over-allocated only" list → person's page; duplicate allocation rejected | `allocations.cy.js` |
| Expense from the project's Budget tab (amount validation) → project over budget → Budget page | `budget.cy.js` |
| Admin creates a viewer → viewer signs in read-only; admin cannot delete themselves | `users.cy.js` |
| Viewer read-only, contributor cannot delete, API refuses what the UI hides, non-admins cannot open user management | `rbac.cy.js` |
| Dashboard shows at-risk projects, over-allocated people, key deliverables and budget; drill-down; matches the API | `dashboard.cy.js` |
| Every page at phone (375 px), tablet (768 px) and desktop (1366 px): no horizontal scrolling, drawer menu and card lists on small screens; axe-core WCAG 2.1 A/AA scan of every page (fails on serious/critical violations) | `responsive-a11y.cy.js` |

## Manual validation checklist (UI → API → database)

1. Log in as `manager@acme.com`, create a project → it appears in the list and in
   `psql -h 172.17.0.1 -U postgres -d postgres -c "select id, name, status, budget from projects;"`.
2. Edit it → the row changes in the database; delete it → the row (and its deliverables, allocations and
   expenses) is gone.
3. Add two deliverables, make the second depend on the first → its details show the dependency chain;
   try to make the first depend on the second → the form shows "Circular dependency: deliverable(s) …
   already depend on this deliverable".
4. Allocate one person 60% + 50% to two **active** projects → Resources shows *Over-allocated* (110%).
5. Add an expense larger than a project's budget → the project and Budget page show *Over budget*.
6. Log in as `viewer@acme.com` → no New/Edit/Delete buttons anywhere; `contributor@acme.com` → no Delete.
7. Resize the browser (or Firefox *Responsive Design Mode*, Ctrl+Shift+M) → tables become cards, the menu
   becomes a drawer, dialogs go full screen.
8. Stop the proxy (`kill $(cat /tmp/proxy-server.pid)`) and reload a page → a clear "Cannot reach the
   server" message with Retry; start it again with `./bin/start-dev.sh`.

## Latest results

Final run on 24 Nov 2026 (all suites green).

| Suite | Result | Coverage |
|---|---|---|
| Backend unit + integration | **843 passed**, 0 failed (~37 s; order-independent: also run reversed and shuffled) | **99 %** of `app/` (1,398 statements, 16 missed – unused scaffold branches); every domain module 100 % |
| Backend lint / format | `ruff check` and `ruff format --check`: clean (80 files) | — |
| Frontend component + API client | **339 passed**, 0 failed (37 files) | **97.7 %** lines, 96.9 % statements, 95.6 % branches; every page folder 100 % lines |
| Frontend lint | ESLint: clean | — |
| End-to-end (local stack) | **49 passed**, 0 failed (9 specs, ~1.5 min) | 8 critical journeys + responsive (3 sizes) + accessibility (7 pages) |
| End-to-end (AWS / CloudFront) | **49 passed**, 0 failed (same 9 specs against the live site, ~1 min) | real CloudFront → S3 + Lambda → Aurora path |
| Load (AWS) | **3,420 requests, 100 % OK**, 0 failed users; median 38 ms, p95 1.06 s | see below |

### Load test (AWS, Artillery) – 24 Nov 2026

Scenario: each virtual user logs in, then opens the dashboard, active projects, key deliverables,
over-allocated resources and expenses (6 requests). 2 → 5 new users per second over 150 s.

| Metric | Value |
|---|---|
| Virtual users / requests | 570 / 3,420 |
| Successful responses | 3,420 (100 % HTTP 200), 0 failed users |
| Response time median | 38 ms |
| Response time p95 / p99 | 1,064 ms / 1,176 ms (dominated by login: bcrypt on a 128 MB Lambda) |
| Max | 3,172 ms (Lambda cold start of new concurrent instances) |
| Thresholds (`ensure`) | p95 < 1,500 ms and no failed users → **passed** |

Read endpoints answer in ~40–70 ms when warm; the first request after a long idle period takes
~15–20 s because Aurora Serverless resumes from 0 ACU.

### Accessibility findings fixed
* The side navigation rendered links directly inside `<ul>` (invalid list for screen readers) →
  each link is now wrapped in a list item.
* The *Contributor* role chip used MUI's default info blue (contrast 3.9:1) → darker theme colour
  (≈ 5.9:1, WCAG AA).
* Found in the UX/accessibility review (Playwright + axe-core audit at 320–1440 px):
  * MUI v9 silently ignores `Typography color="text.secondary"` (secondary text rendered black) →
    switched to the supported `textSecondary` value app-wide.
  * Keyboard-focused clickable table rows had no visible focus indicator (WCAG 2.4.7) → focus ring added.
  * Empty-state titles were `<h6>`, skipping heading levels → plain text (pages keep h1 → h2).
  * Every route had the same browser tab title (WCAG 2.4.2) → each page sets "<Page> · ACME Project Tracker".
  * The fixed app bar could cover the focused element (WCAG 2.4.11) → `scroll-padding-top`.
  * Delete confirmations now expose their consequences as the dialog description to screen readers.
  * The amber "Blocker" chip in the dependency chain failed contrast → darker text.

## Known gaps

* The user journeys run at desktop width; small screens are covered by the responsive layout checks
  (all pages × 3 sizes) and component tests, not by full journeys on a phone viewport.
* axe-core only detects part of WCAG issues automatically; a full manual keyboard-only and
  screen-reader audit has not been done yet.
* Load tests target read endpoints; write-heavy load was not tested.
* No contract test generated from `docs/API.md` (the contract is enforced by integration tests and
  reviewed manually against the frontend).
