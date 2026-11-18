# Testing — ACME Facility Desk

How the app is tested, how to run the tests, the latest results, and what is
not covered yet.

## Quick start

```sh
./bin/run-tests.sh          # backend + frontend, with coverage (≈1 min)
./bin/run-tests.sh --e2e    # ...plus browser end-to-end tests (app must be running)
```

| Suite | Tool | Command | Needs |
|---|---|---|---|
| Backend unit + integration | pytest, FastAPI TestClient | `cd backend/api-service && .venv/bin/pytest --cov=app` | local PostgreSQL |
| Frontend components, services, pages | Vitest + React Testing Library (jsdom) | `cd frontend && npm run test:coverage` | nothing |
| End-to-end user journeys | Playwright (system Chrome) | `cd frontend && npm run test:e2e` | `./bin/start-dev.sh` running |
| API load | Artillery | see [Load testing](#load-testing) | API running |

First-time setup for the backend tests:

```sh
cd backend/api-service
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```

## Latest results (18 Nov 2026, local)

| Suite | Tests | Result | Coverage |
|---|---|---|---|
| Backend (pytest) | 198 | all pass, ~6 s | **99 %** of `app/` (1186 statements, 9 missed) |
| Frontend (Vitest) | 80 | all pass, ~6 s | **99 %** lines, 93 % branches, 89 % functions |
| End-to-end (Playwright) | 12 | all pass, ~30 s | every critical user path (below) |
| Load (Artillery) | 1 scenario | see below | — |

Both coverage runs enforce a minimum of 80 % and fail below it.

## What is tested

### Backend — `backend/api-service/tests/`

**Unit tests** (`tests/unit/`, no database):

- `test_permissions.py`: every role rule in `app/services/permissions.py`.
  - Who can view an incident.
  - Each role's allowed status transitions.
  - Editing, escalation, and note / internal-note rights.
  - The `permissions` object the UI renders from.
- `test_security.py`
  - bcrypt hashing and verification.
  - JWT round trip, plus rejection of tampered or expired tokens.
  - Connection-pool sizing per runtime.
- `test_schemas.py`: request validation.
  - Only acme.inc emails are accepted.
  - Password length limits.
  - Trimming, and required / blank fields.
  - Enum and range checks.

**Integration tests** (`tests/integration/`) run against a real PostgreSQL database:
- The run creates a throwaway `facility_desk_test` database from `backend/db/schema.sql`.
- `seed.sql` is reloaded before every test, so each test starts from the same 9 users and 7 incidents.
- The database is dropped at the end. Your `postgres` database is never touched.

| File | Covers |
|---|---|
| `test_auth.py` | register (incl. ignoring a forged `role`), duplicates, login, generic login errors, disabled accounts, missing/invalid/expired tokens, deactivated users |
| `test_incidents.py` | CRUD per role, visibility, filters, search, pagination, location validation, inactive buildings, edit rules, priority rules, delete with cascade |
| `test_workflow.py` | full lifecycle, every forbidden transition, assignment (busy / on-leave / non-engineer), escalation rules, notes and internal-note visibility |
| `test_admin.py` | buildings / floors / seats CRUD, duplicates (409), delete-while-in-use (409), engineer create/update/deactivate, availability, admin-only endpoints |
| `test_notifications.py` | who is notified for each event, never the actor, internal notes never reach employees, read / read-all, ownership |
| `test_dashboard.py` | each role's dashboard numbers against the seed |
| `test_api_contract.py` | `{"message": ...}` error shape (404/405/422/500/503), CloudFront path prefix, the Lambda handler with a real Function-URL event |

### Frontend: `frontend/src/**/*.test.{js,jsx}`

These tests mock `fetch` with a small fake backend (`src/test/mockApi.js`), so they run offline.

| Area | Covers |
|---|---|
| `services/` | auth header, query strings, 204, error messages, network failure, auto sign-out on expired session (not on wrong password), email normalisation |
| `Login` | sign in, client-side validation, server errors, loading state, registration, show password |
| `IncidentForm` | required fields, building → floor → seat cascade, numeric payload, critical priority for admins only, server errors |
| `IncidentDetail` | role-based actions shown/hidden, status change with comment, confirm before cancel, internal notes, escalation, assign + approve priority, edit, delete, errors, closed notes |
| `NotificationBell` | unread badge, list, open → mark read + navigate, mark all read, empty state, Escape, 30 s polling |
| `Dashboard` | employee / engineer / admin views, availability switch, empty and error states, refresh |
| `IncidentList` | filters and search sent to the API, role headings, paging, errors |
| `admin/Facilities`, `admin/Engineers` | create / edit / deactivate / delete, validation, conflict messages, inactive toggle |
| `App` | sign in/out, tab title shows the user, admin nav and route guard, expired session |

### End-to-end: `frontend/e2e/`

These tests drive the real stack in Chrome: React → proxy → Lambda (LocalStack) → PostgreSQL.

| Spec | Journey |
|---|---|
| `incident-lifecycle.spec.js` | the full flow below, with each hand-off reached through the notification bell |
| `access.spec.js` | registration (domain check, duplicate), wrong password, employee blocked from admin pages, engineer sees only own tickets, "cannot reach the server" message |
| `admin.spec.js` | admin builds a building/floor/seat, the employee can pick it, then it is deleted; building in use cannot be deleted; admin creates an engineer who signs in and sets availability |
| `responsive.spec.js` | every role's main pages have no horizontal scroll on a phone (Pixel 7) |

The full lifecycle in `incident-lifecycle.spec.js`:
1. The employee reports an incident and escalates it.
2. The admin approves the priority and assigns an engineer.
3. The engineer works the ticket, adds a public note and an internal note, and resolves it.
4. The employee confirms the fix and the incident closes.

The E2E tests use the seeded accounts and tag everything they create:
- incidents titled `[e2e] …`
- users with `e2e.…@acme.inc` emails
- buildings with codes starting `E2E…`

Those records are deleted before and after every run. Failure screenshots and traces go to `frontend/test-results/`, and the HTML report to `frontend/playwright-report/`.

## Load testing

`backend/api-service/tests/load/api-load.yml` is an Artillery scenario that only reads data:
- Each simulated user logs in, loads the dashboard and the incident list, then polls the notification count three times.
- The run lasts 75 s and ramps up to 10 new users per second, about 14 requests per second.
- The run passes when the p95 response time is under 1.5 s and fewer than 1 % of users fail.

```sh
cd backend/api-service && .venv/bin/uvicorn app.main:app --port 8000   # terminal 1
npx --yes artillery@2.0.32 run backend/api-service/tests/load/api-load.yml   # terminal 2
# in AWS: add  --target https://<cloudfront-domain>/api/api-service
```

**What the first run found, and the fix.** The first run failed: 434 of 510 users timed out, and the
server log showed 207 errors reading `QueuePool limit of size 2 overflow 2 reached`.
- **Cause:** the database pool was fixed at 4 connections. FastAPI serves up to 40 requests at once,
  each on its own thread, so most requests waited for a connection and gave up after 30 s.
- **Why it doesn't matter on Lambda:** each instance serves one request at a time, so 4 was plenty there.
- **Fix:** the pool is now sized for how the API runs (`app/core/config.py`).
  - On Lambda: 1 connection plus 1 extra.
  - As a long-running server: 10 plus 30 extra.
  - Both can be overridden with `DB_POOL_SIZE` and `DB_MAX_OVERFLOW`.
- **Fail fast:** a request that still can't get a connection gives up after 10 s and receives
  `503 "The service is busy right now..."` with a `Retry-After` header instead of hanging.
  A database outage also returns a clear 503.

| Run (local, 2-core machine) | Users failed | Requests/s | Median | p95 | p99 |
|---|---|---|---|---|---|
| Before the fix | 434 / 510 | 12 | 147 ms | 1,620 ms | 2,019 ms |
| **After the fix** | **0 / 510** | **37** | **14 ms** | **228 ms** | **596 ms** |

The same scenario through LocalStack (`:3001`) is limited by LocalStack, not by the app:
- Even `/health` takes 3–4 s when 20 requests arrive together.
- LocalStack started more than 100 Lambda containers during the test.

On real AWS, Lambda scales by adding instances.

## Known gaps

- **Load test only run locally.** It hasn't been run against AWS yet; the numbers above come from a 2-core development machine.
- **No tests for the dev scripts.** The shell and Terraform scripts in `bin/` and `infra/` have no automated tests. They were checked by deploying to LocalStack.
- **E2E tests need the full stack.** They need the local stack running and the seeded accounts with their default passwords, and they don't run in CI.
- **Desktop E2E is Chrome only.** Only the responsive checks use the phone profile.
- **Accessibility is only partly covered.** It is exercised through role- and label-based queries; there is no automated audit such as axe.
