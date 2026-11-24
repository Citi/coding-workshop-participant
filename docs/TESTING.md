# Testing – ACME Project Tracker

How the application is tested, how to run every suite, the latest results, and known gaps.

## Strategy

| Level | What it proves | Tool | Location |
|---|---|---|---|
| Backend unit | business rules (health, progress, budget, over-allocation, dependency cycles), validation (incl. the comma-separated `health` filter), tokens, permission matrix, router; reconnect-once on a dropped database connection and its time budget under CloudFront's 60 s (fake connections, no database); the demo-data script accepts only http(s) URLs | pytest | `backend/tests/unit/` |
| Backend integration | every endpoint through the real Lambda handler against a real PostgreSQL database: CRUD, filters (incl. `health=at_risk,overdue` and a repeated parameter), computed fields, validation (400), auth (401), RBAC (403), not found (404), duplicates (409), cascades; `GET /health/db` (public, cold start, outage, 405); a connection closed by the server is replaced once and a write still runs exactly once | pytest + PostgreSQL | `backend/tests/integration/` |
| Frontend component | pages and shared components: loading/empty/error states, forms and validation, server errors on fields, role-based visibility, filters; KPI card links per role, filters and views in the URL (reload, Back/Forward, links, special characters), sortable headers, Projects timeline, Resources heat map, urgency labels, allocation what-if (also in the real dialog: `AllocationWhatIf.integration.test.jsx`), login wake-up call and 3 s hint | Vitest + React Testing Library | `frontend/src/**/*.test.jsx` |
| Frontend logic | pure helpers, e.g. timeline axis, bars and month ticks (`timelineLayout`), heat-map grid and totals (`heatmapGrid`), urgency wording in UTC days and impossible dates such as 2026-02-30 (`format`), sort keys (`labels`) | Vitest | `frontend/src/**/*.test.js` |
| Frontend API client | token header, silent refresh on expiry, session end, error normalisation, network failure (mocked `fetch`); database wake-up ping (`healthApi`: no token, at most one call per minute, never throws, no logout on 401) | Vitest | `frontend/src/services/apiClient.test.js`, `healthApi.test.js` |
| Security (static analysis) | no bandit findings in the Python code, with the same command as the repository's GitHub check | bandit 1.9.4 | `backend/.bandit`, `.github/workflows/python.actions.yml` |
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

# Security check (bandit) – the exact command of GitHub's "Security Check - Python" job
# (.github/workflows/python.actions.yml), run from the repository root on a copy of the files git
# would commit (-c tracked, -o new, --exclude-standard leaves out ignored files): start-dev.sh installs
# third-party packages into backend/pm-service, which git ignores and CI never sees
dest=$(mktemp -d)
git ls-files -co --exclude-standard -z backend | xargs -0 cp --parents -t "$dest"
bandit=$PWD/backend/.venv/bin/bandit       # bandit 1.9.4 from requirements-dev.txt
(cd "$dest" && "$bandit" -r ./backend)     # expect "No issues identified."
```

bandit picks up `backend/.bandit` (the tests are excluded) by itself; keep only one `.bandit` file
under `backend/`. CI uses Python 3.11, which skips `app/core/validation.py` (Python 3.12+ syntax);
the virtual environment's Python 3.13 scans that file too.

## Critical user journeys covered end-to-end

| Journey | Spec |
|---|---|
| Login validation, wrong password, login → reload keeps session → logout, anonymous redirect, invalid token logs out, Users menu only for admins | `auth.cy.js` |
| Project create (with date validation) → search (kept in the URL, narrows the list) → *List ↔ Timeline* keeps the search → open → edit → delete (cascade warning); duplicate name shown on the field | `projects.cy.js` |
| Deliverables with a dependency, key flag, dependency chain view with urgency labels ("Due in 2 weeks"; a completed one is never "overdue"), "key deliverables only" filter from the URL reflected in its switch, circular dependency rejected | `deliverables.cy.js` |
| Allocate a person from the project's Team tab → live what-if before saving ("60% now → 130% after this change", over-allocation warning) → over-allocation message → "over-allocated only" list → person's page; duplicate allocation rejected | `allocations.cy.js` |
| Expense from the project's Budget tab (amount validation) → project over budget → Budget page | `budget.cy.js` |
| Admin creates a viewer → viewer signs in read-only; admin cannot delete themselves | `users.cy.js` |
| Viewer read-only, contributor cannot delete, API refuses what the UI hides, non-admins cannot open user management | `rbac.cy.js` |
| Dashboard shows at-risk projects, over-allocated people, key deliverables and budget; drill-down (incl. the *Over-allocated* KPI card); matches the API | `dashboard.cy.js` |
| UX upgrade: each KPI card opens a list with exactly the card's number; a filter survives reload and Back from a project page; sortable headers (ascending → descending → API order); Projects timeline (dates, health, *Today* line; Health *At risk or overdue* in both views); heat-map totals match the list and mark over-allocation; allocation what-if warns before saving; login page pings `GET /health/db` and still signs in when the ping fails; "N days overdue" label | `ux.cy.js` |
| Every page at phone (375 px), tablet (768 px) and desktop (1366 px), plus the Projects *Timeline* and Resources *Heat map* views: no horizontal scrolling, drawer menu and card lists on small screens; axe-core WCAG 2.1 A/AA scan of every page and both views (fails on serious/critical violations) | `responsive-a11y.cy.js` |

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

UX upgrade:

9. Dashboard → click each KPI card → the matching list opens filtered and agrees with the card (e.g.
   *Projects at risk* → Projects with Health *At risk or overdue*, as many rows as the card's number);
   repeat as `viewer@acme.com`.
10. Projects → set *Status* and *Health*, open a project, press Back → the filters are still set; reload
    and paste the URL into a new tab → same list. Same on Deliverables and Resources.
11. Click a column header → ascending, again → descending, a third time → original order (desktop).
12. Projects → *Timeline* → one bar per project in its health colour with dates and health in text, a
    darker progress fill and the *Today* line; the URL has `view=timeline` and the filters still apply.
13. Resources → *Heat map* → people × projects, non-active projects marked "not counted", a person above
    100% marked *Over-allocated*; Tab into the table and scroll it sideways with the arrow keys.
14. Project → *Team* → *New allocation* → pick a person and a percentage → "<name>: X% now → Y% after this
    change"; above 100% it warns, and *Create allocation* still saves.
15. Set a deliverable's due date to yesterday → "1 day overdue" next to it; mark it completed → no label.
16. On AWS after a quiet period (or with browser network throttling), open the login page → the
    Network tab shows `GET /health/db`; a sign-in that takes over 3 s shows "Waking up the database – …".

## Latest results

Final run on 25 Nov 2026, after the UX upgrade (all suites green), next to the 24 Nov 2026 run from
before the upgrade.

| Suite | Result | Before the upgrade (24 Nov) | Coverage |
|---|---|---|---|
| Backend unit + integration | **949 passed**, 0 failed | 843 passed | **99 %** of `app/` |
| Backend lint / format | `ruff check` and `ruff format --check`: clean | clean | — |
| Security check (bandit, the GitHub command) | **No issues identified** (19 reviewed `# nosec` annotations) | 742 findings (723 in the tests), check failing | — |
| Frontend component + API client | **676 passed**, 0 failed (57 files) | 339 passed (37 files) | **98.8 %** lines, 98.4 % statements, 96.7 % branches |
| Frontend lint | ESLint: clean | clean | — |
| End-to-end (local stack) | **72 passed**, 0 failed (10 specs) | 49 passed (9 specs) | critical journeys + UX journeys + responsive (3 sizes) + accessibility |
| End-to-end (AWS / CloudFront) | **72 passed**, 0 failed (same specs against the live site) | 49 passed | real CloudFront → S3 + Lambda → Aurora path |
| Load (AWS) | **3,420 requests, 100 % OK**, 0 failed users; median 22 ms, **p95 257 ms**, thresholds enforced | 3,420 requests, 100 % OK, median 38 ms, p95 1.06 s | see below |

Measured on AWS after the upgrade (512 MB Lambda): warm login **0.33–0.45 s** (was ~1.2 s at 128 MB);
a database wake-up (Aurora resuming from 0 ACU) answered in **16.8 s**.

### Load test (AWS, Artillery) – 25 Nov 2026, after the upgrade (512 MB Lambda)

Scenario: each virtual user logs in, then opens the dashboard, active projects, key deliverables,
over-allocated resources and expenses (6 requests). 2 → 5 new users per second over 150 s.

| Metric | 25 Nov 2026 (512 MB) | 24 Nov 2026 baseline (128 MB) |
|---|---|---|
| Virtual users / requests | 570 / 3,420 | 570 / 3,420 |
| Successful responses | 3,420 (100 % HTTP 200), 0 failed users | 3,420 (100 % HTTP 200), 0 failed users |
| Response time median | 22 ms | 38 ms |
| Response time p95 / p99 | **257 ms** / 290 ms | 1,064 ms / 1,176 ms (dominated by login: bcrypt on 128 MB) |
| Max | 312 ms | 3,172 ms (Lambda cold start of new concurrent instances) |
| Thresholds (`ensure`: p95 < 1,500 ms, no failed users) | **passed, enforced** (`Checks: ok`, exit 0) | values met, but not enforced: the `ensure` plugin was not enabled in the config then |

What changed in `e2e/load/api-load.yml`: the `ensure` plugin is now enabled (`plugins.ensure`), so a
breached threshold fails the run with exit code 1 (checked with a deliberately impossible threshold),
and each request may take up to 60 s (`http.timeout: 60`), like CloudFront's API timeout. A first run
the same night started while Aurora was paused: during its first 20 s, 17 of 570 virtual users hit
Artillery's former 10 s client timeout while the database resumed; every request after that
succeeded. Browsers wait for the wake-up instead (CloudFront allows 60 s and the UI shows the
"Waking up the database" hint).

Read endpoints answer in ~20–70 ms when warm; the first request after a long idle period takes
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

### Review findings fixed (UX upgrade)

Two independent reviews of the upgrade – correctness/contracts (including the live dev API as admin,
contributor and viewer) and UX/accessibility/responsive in a real browser at 375, 768 and 1366 px –
applied 16 fixes, among them:

* KPI card links: their accessible name now contains the visible text, "label: value, helper"
  (WCAG 2.5.3 Label in Name, axe `label-content-name-mismatch`).
* Opening a project within the 300 ms search debounce: the pending search could take the user back to
  the list → every page has its own loading boundary, so the previous page is left at once.
* Urgency labels broke mid-phrase in narrow columns ("Ends in 2 / months") → kept on one line.
* The what-if status message re-announced on every keystroke → announced once the user pauses (500 ms).
* Impossible dates such as 2026-02-30 were read as 2 March (and labelled as months overdue) → treated
  as invalid: shown as "—", no label.
* The backend's health filter matched a single value as a substring (wrong matches, or an error in one
  edge case) → one value or a set of values.
* Retry time budget: two 30 s connection attempts could pass CloudFront's 60 s → 25 s per attempt, which
  still covers a 15–20 s Aurora resume.

Found later by the full end-to-end run (`projects.cy.js`, 2 of 2 attempts): switching *List → Timeline*
right after typing a search could drop the search from the URL (and a filter change right after a view
switch could drop the view). HashRouter updates the address bar at once but re-renders inside a React
transition, and both controls built the next URL from the last render → they now build it from the
address bar (`useLatestSearchParams` in `hooks/useUrlFilters.js`). Four unit tests reproduce the race
(they fail on the old code).

## Known gaps

* The user journeys run at desktop width; small screens are covered by the responsive layout checks
  (all pages × 3 sizes) and component tests, not by full journeys on a phone viewport.
* axe-core only detects part of WCAG issues automatically; a full manual keyboard-only and
  screen-reader audit has not been done yet.
* Load tests target read endpoints; write-heavy load was not tested.
* No contract test generated from `docs/API.md` (the contract is enforced by integration tests and
  reviewed manually against the frontend).
* A real Aurora pause is exercised manually on AWS (wake-up answered in 16.8 s); automated tests
  simulate the dropped connection (unit and integration) and check that the login page sends the
  wake-up call (end-to-end).
* GitHub's bandit job runs on Python 3.11 and skips `app/core/validation.py` (Python 3.12+ syntax);
  the file is scanned, and passes, with the Python 3.13 command above.
