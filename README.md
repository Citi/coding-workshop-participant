# Facilities Helpdesk

Ticketing app for reporting and resolving facility issues. Frontend: React + Vite. Backend: FastAPI on AWS Lambda. Database: PostgreSQL.

## Local development

Run all commands from the repo root.

### One-time setup

The backend needs Python 3.13, which matches the Lambda runtime. The macOS system `python3` is too old for FastAPI.

```sh
python3.13 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/core/requirements-dev.txt
cd frontend && npm install
```

### Database

The backend uses a local PostgreSQL 17. The role and database below match the defaults in `config.py`.

```sh
brew install postgresql@17
brew services start postgresql@17
psql -d postgres -c "CREATE ROLE test LOGIN PASSWORD 'test';"
psql -d postgres -c "CREATE DATABASE codingworkshop OWNER test;"
```

Create the tables and load the demo buildings, floors and seats. Both files are safe to re-run.

```sh
PGPASSWORD=test psql -h localhost -U test -d codingworkshop \
  -f backend/core/sql/schema.sql -f backend/core/sql/seed.sql
```

To also get a Facility Admin you can sign in as, plus the demo people and tickets, run the same setup task AWS uses (see Deployment, "Setting up the database in AWS"). It runs both SQL files too:

```sh
cd backend/core && ../.venv/bin/python -c 'from function import handler; print(handler({"setup_task": "seed", "admin_email": "admin@acme.inc", "admin_password": "choose-a-password", "demo_data": True}, None))'
```

To start over with empty tables, run `backend/core/sql/reset.sql` first, then the command above. It deletes all data and refuses to run against anything but a local server.

### Run the backend

```sh
cd backend/core && ../.venv/bin/uvicorn function:app --reload --port 8000
```

You should see `Uvicorn running on http://127.0.0.1:8000`. Every route is served under `/api/core`, the same path CloudFront uses in AWS.

### Run the frontend

In a second terminal:

```sh
cd frontend && npm run dev
```

The app runs at http://localhost:3000. It calls the API at relative `/api/core/...` URLs, and the Vite dev server forwards `/api` to the backend on port 8000 (see [frontend/vite.config.js](frontend/vite.config.js)). In AWS, CloudFront does the same on one domain, so no API URL or CORS setup is needed. `VITE_API_URL` can still point the app at another API host if you need to.

Frontend code lives in `frontend/src/`:

| Folder / file | Holds |
|---|---|
| `pages/` | One component per route |
| `components/` | Shared UI: app header (with each role's page links, from `NAV_LINKS` in `utils/roles.js`) and layout, route guards (`ProtectedRoute roles={[...]}` shows a "You don't have access to this" page to other roles), `ErrorState`, `Panel`, `BackLink`, `FilterSelect`; `dashboard/`, `tickets/`, `admin/` and `engineer/` hold feature pieces. Staff pages share `tickets/StaffTicketList`, `StaffTicketSummary` and `PriorityChip`, which show priority, so they're for staff screens only: employee pages never show priority. |
| `services/` | All API calls. `apiClient.js` is the only place that uses `fetch`. |
| `auth/` | `AuthProvider` + `useAuth()`: the signed-in user, sign in/out, and sign-out when the API rejects the token (expired, forged, or the role changed). The access token lives in `services/session.js` (localStorage) and `apiClient.js` sends it as `Authorization: Bearer <token>`. |
| `hooks/` | `useApiData` (loads data, cancels outdated requests, retry), `useMyTickets`, `useAllTickets` (admin), `useDebouncedValue` (search waits 300 ms after typing), `useIsMobile` (react-responsive) |
| `utils/` | Pure helpers: form validation, ticket labels and formatting, dashboard counts, the workflow (Blocked is a side state off In Progress, not a step) and the moves an engineer can make from each status, the admin's metric cards and the filter each one applies (`adminMetrics.js`), the facilities rules and labels (`facilities.js`: names like "Floor 3", the same limits as the API), and each role's label and start page (`roles.js`) |
| `frontend/e2e/` (outside `src/`) | Playwright end-to-end tests (see Testing) |
| `theme.js` | MUI theme: Citi light blue `#056DAE`, navy `#003B70` headings, white surfaces |

## Testing

### Running the tests

The pytest suite runs against its own database, `codingworkshop_test`, so your dev data is never touched. Create it once:

```sh
psql -d postgres -c "CREATE DATABASE codingworkshop_test OWNER test;"
```

Then run the suite from `backend/core`, with or without coverage:

```sh
cd backend/core
../.venv/bin/pytest
../.venv/bin/pytest --cov --cov-report=term-missing
```

Each run rebuilds the test schema from `sql/`, and every test starts with no users, tickets or notes, and only the seeded buildings, floors and seats. The suite refuses to run against a database whose name doesn't end in `_test`. To use a different test database, set `TEST_POSTGRES_NAME`.

| File | Covers |
|---|---|
| `test_security.py`, `test_schemas.py` | Password hashing and request validation (no DB) |
| `test_db.py` | Commit, rollback, connection reuse and reconnecting after a dropped connection |
| `test_health_and_errors.py` | Health checks, domain errors → 400/401/404/409, generic JSON 500 |
| `test_tokens.py` | Signing and verifying access tokens: expiry, tampering, unsigned tokens, the `JWT_SECRET` rules (no DB) |
| `test_auth.py`, `test_locations.py` | Register, login, Bearer tokens (missing, invalid, expired, deleted user, changed role), location lookups |
| `test_roles.py` | The `roles` table: new users get `employee`, unknown roles are rejected, and `schema.sql` moves an older database's `users.role` text into `role_id` |
| `test_rbac.py` | Every non-public route needs sign-in (read from the app's routes, so new ones are covered); `/tickets` is employee-only (403 for engineers and admins); `/admin` is admin-only (403 for employees and engineers); `/engineer` is engineer-only (403 for employees and admins); shared routes work for every role |
| `test_admin_tickets.py` | The admin's all-tickets list: triage order (P1 first, then longest-waiting), every filter and search, 422s; details with priority and requester contact; reading any ticket's notes and history; 404s |
| `test_admin_assignment.py` | Assigning and reassigning: acknowledged once, `assigned_at` moves, status and history untouched, 409 for finished tickets or the same engineer, 400 for non-engineers, 404, 422. Engineer workload: only active tickets count, by status and P1, lightest first |
| `test_admin_users.py` | The people list (by name, role and active-ticket counts, role filter, name/email search, 422s) and role changes: promoting signs the person out and makes them assignable, demoting is blocked while they have active tickets, same role 409, admin accounts 403, `admin` can't be given (422), 404 |
| `test_admin_facilities.py` | Managing locations: the full tree in order with active-ticket counts (closed tickets don't count) and inactive items flagged; adding at each level (trimmed, negative floors, duplicates 409 ignoring case, missing parent 404, 422s); renaming (409 for a name in use, changing only the case of its own name is fine); deactivating hides the item and everything under it from the employee dropdowns and from new tickets (400), while existing tickets keep their location; reactivating; deleting only what nothing has used (409 for any ticket, even closed, or for floors or seats underneath); 404s and bad ids; `schema.sql` adding `is_active` to an older database |
| `test_admin_finish.py` | Finishing resolved tickets: closing keeps `resolved_at` and ends notes and status changes for everyone; sending back returns the work to the same engineer (reason required), or 409 if they're no longer an engineer; only resolved tickets (409); bad statuses and reasons (422); 404. Dashboard metrics: every count, and only recent closes |
| `test_engineer_tickets.py` | An engineer's queue: only their assigned tickets, triage order, every filter and search, 422s (including trying `assigned_to`); details with priority and requester contact; other people's, unassigned and reassigned-away tickets look missing (404); notes the employee also sees, allowed until closed (409); history |
| `test_engineer_status.py` | Status changes: start, block and unblock (reason kept, then cleared), resolve and reopen (`resolved_at` set, then cleared), the whole workflow recorded in order, the employee seeing reasons but not priority, workload following along; every move the workflow refuses (409 with a hint), missing or bad reasons and statuses (422), other people's tickets (404) |
| `test_tickets.py`, `test_ticket_actions.py` | Create, list/filter/search, details, notes, escalation, and one employee never seeing another's tickets |
| `test_status_history.py` | Creating a ticket records it as opened, a reopened ticket keeps every step in order, the table's constraints, and `schema.sql` backfilling tickets made before the history existed |
| `test_setup_tasks.py` | The Lambda setup task (see "Setting up the database in AWS"): builds an empty database, creates an admin who can sign in, re-runs change nothing, an existing account is never changed or promoted, bad admin details are refused without touching the database or echoing the password, and HTTP events still reach the API (a `setup_task` in a request body is just a 422) |
| `test_demo_data.py` | The demo data: who and what it adds, every status and dashboard count represented, its people can't sign in, every ticket's history follows the real workflow (engineer moves by the assigned engineer, closes and send-backs by an admin, reasons where required), fields agree with the status, timestamps in order and in the past, loaded only once, needs an admin, and a failure leaves nothing behind |

CI runs `bandit -r ./backend`. `backend/.bandit` skips `tests/` folders there, since tests use `assert` and fake passwords on purpose.

### Frontend tests

Vitest and React Testing Library, with API calls mocked. No backend needed.

```sh
cd frontend
npm test            # run once
npm run test:watch  # re-run on save
npm run coverage    # with a coverage report
npm run lint
```

Tests sit next to the code they cover (`apiClient.test.js` beside `apiClient.js`). `src/test/renderWithProviders.jsx` renders a component with the theme and router at a given URL and screen width, e.g. `{ width: 375 }` for a phone.

### End-to-end tests

Playwright drives a real Chrome through the app, against a real backend and Postgres. It starts its own backend (port 8100) and frontend (port 3100), so servers you already have running are left alone. It uses its own database, `codingworkshop_e2e`, which is rebuilt from `backend/core/sql/` before every run. Create it once:

```sh
psql -d postgres -c "CREATE DATABASE codingworkshop_e2e OWNER test;"
```

Then:

```sh
cd frontend
npm run e2e
```

It needs Google Chrome installed. To use Playwright's own Chromium instead, run `npx playwright install chromium` and set `E2E_BROWSER_CHANNEL=chromium`. On failure, a trace and an HTML report are saved: run `npx playwright show-report`.

| Spec | Covers |
|---|---|
| `engineer-journey.spec.js` | An engineer signs in to My queue → "Up next" and the counts → their tickets only, in triage order, with filters → Start work from the card, which makes it the Current ticket → its details (priority, requester) → add a note → block it with a reason, unblock, resolve it with a summary → the employee sees it resolved, with the summary, on their own page → someone else's ticket looks missing. Also fits a phone. |
| `employee-journey.spec.js` | The critical path: register → sign in → create a ticket (Building → Floor → Seat) → add a note → escalate → dashboard and search → sign out. Also checks that no tickets API response carries `priority`. |
| `access-and-edge-cases.spec.js` | Another employee's ticket shows "Ticket not found", a blocked ticket shows the engineer's reason, form errors from the client and the API, a stale session, an engineer landing on their own workspace (and never calling the tickets API), and the phone layout |
| `admin-journey.spec.js` | A Facility Admin signs in to `/admin` → the unassigned queue (priority, escalated) → search and filter all tickets in triage order → an escalated ticket's details (requester, reason, read-only notes) → back. Assigning: quick-assign from a queue card, the engineer's workload and filtering by them, then assign and reassign from a ticket's details (the employee sees the engineer, never the priority). People: open it from the header, promote an employee after confirming (they're signed out elsewhere and come back as an engineer), and an engineer with an active ticket can't be moved back, with a link to their tickets. Closing: the "Ready to close" card lists resolved tickets, one is closed with a note (the employee sees it) and another is sent back to its engineer, and "Closed (7 days)" counts it. Facilities: add a building, floor and seat (the same seat in another case is refused in the dialog), the employee can pick the new building, a ticket there makes delete refuse with "Deactivate instead", then the employee can't pick it but their ticket keeps it, and its ticket count opens the dashboard filtered to it. Also: employees can't open any admin page, and the admin pages (Facilities too) fit a phone. Roles are set with SQL (`setRole` in `e2e/helpers.js`) for test setup. |

### Manual checks with curl

For every route with its headers, request body, example response and errors, see [postman_testing.md](postman_testing.md). To test every route at once, import [postman_collection.json](postman_collection.json) into Postman and click **Run collection**, or run `npx newman run postman_collection.json`. The quick curl versions follow. With the backend running, run these in another terminal.

Health check:

```sh
curl http://localhost:8000/api/core/health
# {"status":"ok"}
```

Database check. It returns 503 `{"status":"error","db":"unavailable"}` if Postgres is down, and recovers without a restart once Postgres is back.

```sh
curl http://localhost:8000/api/core/health/db
# {"status":"ok","db":"ok"}
```

Register an employee. Only `@acme.inc` emails are accepted, and passwords need at least 8 characters.

```sh
curl -X POST http://localhost:8000/api/core/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@acme.inc","full_name":"Jane Doe","phone_number":"555-0101","password":"hunter2hunter2"}'
# 201 {"user_id":1,"email":"jane.doe@acme.inc",...,"role":"employee",...}
# Same email again: 409. Non-acme email or short password: 422.
```

Log in. The response has a signed access token (valid for 1 hour) and the user.

```sh
curl -X POST http://localhost:8000/api/core/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@acme.inc","password":"hunter2hunter2"}'
# 200 {"access_token":"eyJ...","token_type":"bearer","expires_in":3600,"user":{"user_id":1,...}}
# Wrong email or password: 401 {"detail":"Invalid email or password"}
```

Every other route needs that token as `Authorization: Bearer <token>`. Save it in a shell variable so the examples below can use it:

```sh
TOKEN=$(curl -s -X POST http://localhost:8000/api/core/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@acme.inc","password":"hunter2hunter2"}' \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])')
```

Who am I? Every protected route reads the caller from the token, then reloads them from the database.

```sh
curl http://localhost:8000/api/core/auth/me -H "Authorization: Bearer $TOKEN"
# 200 {"user_id":1,"email":"jane.doe@acme.inc",...}
```

| Problem | Status and `detail` |
|---|---|
| No `Authorization` header, or not `Bearer <token>` | 401 `Please sign in to continue.` |
| Token malformed, tampered with, or signed with another secret | 401 `Invalid token. Please sign in again.` |
| Token older than 1 hour | 401 `Your session has expired. Please sign in again.` |
| The account was deleted, or its role changed since sign-in | 401 `Unknown user` / `Your access has changed. Please sign in again.` |
| Valid token, but the role may not use the route (engineers and admins on `/tickets`, employees and engineers on `/admin`, employees and admins on `/engineer`) | 403 `You don't have access to this.` |

Locations for the create-ticket dropdowns (Building → Floor → Seat). Any signed-in role may read them. Only active locations are listed; Facility Admins manage them (see below).

```sh
curl http://localhost:8000/api/core/buildings -H "Authorization: Bearer $TOKEN"
# [{"building_id":1,"building_name":"Building A"},...]
curl http://localhost:8000/api/core/buildings/1/floors -H "Authorization: Bearer $TOKEN"
# [{"floor_id":1,"floor_number":1,"building_id":1},...]
curl http://localhost:8000/api/core/floors/3/seats -H "Authorization: Bearer $TOKEN"
# [{"seat_id":3,"seat_number":"301","floor_id":3},...]
# Unknown or inactive building or floor (or a floor in an inactive building): 404. Non-numeric id: 422.
```

Create a ticket (employees only). The server sets `status` to `open` and the creator from the token. It also stores an internal `priority` from `affected_scope` (building → P1, floor → P2, me → P3) for engineers and admins; employee responses never include it.

```sh
curl -X POST http://localhost:8000/api/core/tickets -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Wi-Fi keeps dropping",
       "description":"Since this morning my laptop loses Wi-Fi every 5-10 minutes.",
       "category":"network","affected_scope":"me",
       "building_id":1,"floor_id":3,"seat_id":3}'
# 201 {"ticket_id":1,...,"affected_scope":"me","status":"open",...}
```

| Problem | Status |
|---|---|
| `affected_scope` is `floor` without `floor_id`, or `me` without `seat_id`, or `seat_id` without `floor_id` | 422 |
| Unknown category/scope, blank title or description | 422 |
| Floor not in the building, seat not on the floor, unknown building/floor/seat | 400 |
| A building, floor or seat an admin has deactivated | 400 `Building A is no longer available` (or `Floor 3 …`, `Seat 301 …`) |

List my tickets, most recently updated first. Only the caller's own tickets are returned, with building name and floor/seat numbers filled in.

```sh
curl 'http://localhost:8000/api/core/tickets' -H "Authorization: Bearer $TOKEN"
curl 'http://localhost:8000/api/core/tickets?view=active&status=open' -H "Authorization: Bearer $TOKEN"
curl 'http://localhost:8000/api/core/tickets?q=printer' -H "Authorization: Bearer $TOKEN"
```

| Query param | Values |
|---|---|
| `view` | `active` (everything not closed) or `closed` |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` |
| `q` | Case-insensitive text in title or full description, or an exact ticket id |

Filters combine with AND. An unknown value, or an unknown parameter such as `priority`, returns 422.

Ticket details: the full ticket plus `building_name`, `floor_number`, `seat_number` and `assigned_to_name`.

```sh
curl http://localhost:8000/api/core/tickets/1 -H "Authorization: Bearer $TOKEN"
# 200 {"ticket_id":1,...,"building_name":"Building A","floor_number":3,"seat_number":"301","assigned_to_name":"Sam Tech"}
# Someone else's ticket, or one that doesn't exist: 404 {"detail":"Ticket not found"}
```

Notes. Adding one also moves the ticket's `updated_at` forward, so it rises to the top of the list.

```sh
curl http://localhost:8000/api/core/tickets/1/notes -H "Authorization: Bearer $TOKEN"
# 200 [{"note_id":2,"author_name":"Sam Tech","author_role":"engineer","note_text":"...",...},...] oldest first
curl -X POST http://localhost:8000/api/core/tickets/1/notes -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"note_text":"Thanks, I will be at my desk after 2pm."}'
# 201 {"note_id":3,...}. Closed ticket: 409. Blank note: 422. Not your ticket: 404.
```

Status history: every status the ticket has been in, oldest first, with who changed it. The first row is its creation (`from_status: null`), so a reopen shows up as `resolved` → `open`.

```sh
curl http://localhost:8000/api/core/tickets/1/history -H "Authorization: Bearer $TOKEN"
# 200 [{"history_id":7,"from_status":null,"to_status":"open","changed_by_name":"Jane Doe","changed_by_role":"employee","reason":null,...}]
# Not your ticket: 404.
```

Request escalation. It flags the ticket for Facility Admin review and returns the updated ticket.

```sh
curl -X POST http://localhost:8000/api/core/tickets/5/escalation -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"Whole floor can not print payroll docs, due today."}'
# 200 {"ticket_id":5,...,"escalation_requested":true,"escalation_reason":"Whole floor can not print..."}
# Already escalated or closed: 409. Blank reason: 422. Not your ticket: 404.
```

#### Facility Admin: all tickets

Admins only; `$ADMIN_TOKEN` is an admin's login token. The first admin account is created by the setup task (see Deployment, "Setting up the database in AWS"; it works locally too) or in SQL (see Known limitations); engineers can be promoted through the API below.

List every ticket, whoever created it. Sorted for triage: priority first (P1, P2, P3), then the oldest created first. Each row is the employee list row plus `priority`, `created_by_user_id`, `created_by_name`, `assigned_to_user_id` and `assigned_to_name`.

```sh
curl 'http://localhost:8000/api/core/admin/tickets' -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"ticket_id":3,"title":"Lobby lights out",...,"priority":"P1","created_by_name":"Jane Doe","assigned_to_user_id":null,"assigned_to_name":null},
#      {"ticket_id":2,"title":"Printer jam",...,"priority":"P2","created_by_name":"Eve Other","assigned_to_user_id":4,"assigned_to_name":"Sam Tech"},...]
curl 'http://localhost:8000/api/core/admin/tickets?assignment=unassigned' -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:8000/api/core/admin/tickets?escalated=true&view=active' -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:8000/api/core/admin/tickets?q=eve%20other' -H "Authorization: Bearer $ADMIN_TOKEN"
```

| Query param | Values |
|---|---|
| `view` | `active` (everything not closed) or `closed` |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` |
| `priority` | `P1`, `P2`, `P3` |
| `category` | `network`, `hardware`, `printer`, `hvac`, `electrical`, `furniture`, `building_facilities`, `other` |
| `building_id` | A building id |
| `assignment` | `unassigned` (the triage queue) or `assigned` |
| `assigned_to` | An engineer's user id |
| `escalated` | `true` or `false` |
| `q` | Case-insensitive text in title, full description, requester name or requester email, or an exact ticket id |

Filters combine with AND, so `assignment=unassigned&assigned_to=4` is always empty. An unknown value or parameter returns 422.

Ticket details: the employee's details view plus `priority` and the requester's `created_by_name`, `created_by_email` and `created_by_phone`. Any ticket, not just the admin's own.

```sh
curl http://localhost:8000/api/core/admin/tickets/1 -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 {"ticket_id":1,...,"escalation_requested":true,"escalation_reason":"I have client calls all afternoon.",
#      "assigned_to_name":null,"priority":"P3","created_by_name":"Jane Doe","created_by_email":"jane.doe@acme.inc","created_by_phone":"555-0100"}
# Doesn't exist: 404 {"detail":"Ticket not found"}. Non-numeric id: 422.
```

Notes and status history of any ticket, in the same shapes as the employee routes. Read-only: admins can't add notes yet.

```sh
curl http://localhost:8000/api/core/admin/tickets/1/notes -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"note_id":1,"author_name":"Jane Doe","author_role":"employee","note_text":"Still dropping after a restart.",...}]
curl http://localhost:8000/api/core/admin/tickets/1/history -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"history_id":1,"from_status":null,"to_status":"open","changed_by_name":"Jane Doe",...}]
# Doesn't exist: 404.
```

#### Facility Admin: engineers and assigning

Engineers with their workload: active tickets (open, in progress or blocked) split by status, and how many are P1. Lightest load first (then fewer P1s, then name), and engineers with nothing assigned are included.

```sh
curl http://localhost:8000/api/core/admin/engineers -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"user_id":3,"full_name":"Sam Tech","email":"sam.tech@acme.inc","active_count":0,"open_count":0,"in_progress_count":0,"blocked_count":0,"p1_count":0},
#      {"user_id":4,"full_name":"Kim Fixit",...,"active_count":1,"open_count":1,"in_progress_count":0,"blocked_count":0,"p1_count":1}]
```

Assign or reassign a ticket. It sets the engineer and `assigned_at`. The first assignment also sets `acknowledged_at`, which a reassignment keeps. Status doesn't change: the engineer moves it to In Progress. Returns the updated ticket in the admin details shape. No status history row is written, since the status is unchanged.

```sh
curl -X PUT http://localhost:8000/api/core/admin/tickets/1/assignment -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"engineer_id":3}'
# 200 {"ticket_id":1,...,"status":"open","assigned_to_user_id":3,"assigned_to_name":"Sam Tech",
#      "acknowledged_at":"2026-09-23T14:28:06.138246-04:00","assigned_at":"2026-09-23T14:28:06.138246-04:00","priority":"P1",...}
```

| Problem | Status and `detail` |
|---|---|
| Ticket doesn't exist | 404 `Ticket not found` |
| Ticket is resolved or closed | 409 `Resolved tickets can't be assigned` / `Closed tickets can't be assigned` |
| `engineer_id` isn't a user with the engineer role | 400 `User 1 is not an engineer` |
| Already assigned to that engineer | 409 `This ticket is already assigned to Sam Tech` |
| Missing or non-positive `engineer_id` | 422 |

#### Facility Admin: closing and metrics

Finish a resolved ticket: close it (optional note), or send it back to its engineer (`in_progress`, reason required: what's still wrong). Only resolved tickets can be finished, and closed is final. The status change and a history row (with the admin and the reason) are written together. Closing keeps `resolved_at`; sending back clears it. Returns the ticket in the admin details shape.

```sh
curl -X POST http://localhost:8000/api/core/admin/tickets/1/status -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"in_progress","reason":"Two lights still flicker"}'
# 200 {"ticket_id":1,...,"status":"in_progress","resolved_at":null,"assigned_to_name":"Sam Tech",...}
curl -X POST http://localhost:8000/api/core/admin/tickets/1/status -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"closed","reason":"Confirmed with Jane"}'
# 200 {"ticket_id":1,...,"status":"closed","resolved_at":"2026-09-23T18:09:25.645754-04:00",...}
```

| Problem | Status and `detail` |
|---|---|
| Not resolved yet | 409 `Only resolved tickets can be closed` / `Only resolved tickets can be sent back` |
| Already closed | 409 `This ticket is already closed` |
| Its engineer has since been made an employee (sending back) | 409 `Sam Tech is no longer an engineer, so it can't go back to them. Close it, or make them an engineer again.` |
| Sending back without a reason | 422 `A reason is required to send a ticket back` |
| `status` other than `closed` or `in_progress`, or a reason over 500 characters | 422 |
| Ticket doesn't exist | 404 `Ticket not found` |

Headline counts for the dashboard. "Active" means not closed, the same as the ticket list's `view=active`, so each count matches its filter. `closed_last_7_days` comes from the status history.

```sh
curl http://localhost:8000/api/core/admin/metrics -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 {"unassigned":0,"open":0,"in_progress":0,"blocked":0,"resolved":1,"active_p1":1,"escalated":0,"closed_last_7_days":0}
```

#### Facility Admin: people and roles

Everyone, by name, with their role and how many active tickets (open, in progress or blocked) are assigned to them. Filter by `role` (`employee`, `engineer`, `admin`); `q` searches name or email, case-insensitively.

```sh
curl 'http://localhost:8000/api/core/admin/users?role=engineer' -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"user_id":2,"email":"engineer1@acme.inc","full_name":"Sam Tech","phone_number":null,"role":"engineer",
#       "created_at":"2026-09-23T15:02:32.822430-04:00","active_ticket_count":1}]
```

Move someone between employee and engineer. Returns them updated. Their current token stops working (401 `Your access has changed. Please sign in again.`), so they sign in again with the new role.

```sh
curl -X PUT http://localhost:8000/api/core/admin/users/3/role -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"role":"engineer"}'
# 200 {"user_id":3,"email":"jane.doe@acme.inc","full_name":"Jane Doe",...,"role":"engineer","active_ticket_count":0}
```

| Problem | Status and `detail` |
|---|---|
| User doesn't exist | 404 `User not found` |
| The user is an admin (including yourself) | 403 `Admin accounts can't be changed here` |
| They already have that role | 409 `Jane Doe is already an engineer` |
| An engineer with active tickets back to employee | 409 `Sam Tech still has 1 active ticket. Reassign them first.` |
| `role` missing or not `employee`/`engineer` (e.g. `admin`) | 422 |

#### Facility Admin: facilities

Buildings, floors and seats, inactive ones included, as one tree: buildings by name, floors lowest first, seats by number. Every item has `is_active` and `active_ticket_count` (tickets there that aren't closed, the same "active" as `view=active`; a building counts every ticket in it).

```sh
curl http://localhost:8000/api/core/admin/facilities -H "Authorization: Bearer $ADMIN_TOKEN"
# 200 [{"building_id":1,"building_name":"Building A","is_active":true,"active_ticket_count":2,
#       "floors":[{"floor_id":1,"floor_number":1,"building_id":1,"is_active":true,"active_ticket_count":0,
#                  "seats":[{"seat_id":1,"seat_number":"101","floor_id":1,"is_active":true,"active_ticket_count":0},...]},...]},...]
```

Add a building, a floor to a building, or a seat to a floor. Each returns the new item (no children), active, with 201. Building names are unique ignoring case; floor numbers (-10 to 200, so basements work) are unique in their building; seat numbers (text, e.g. `12A`) are unique on their floor ignoring case.

```sh
curl -X POST http://localhost:8000/api/core/admin/buildings -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"building_name":"Annex"}'
# 201 {"building_id":3,"building_name":"Annex","is_active":true,"active_ticket_count":0}
curl -X POST http://localhost:8000/api/core/admin/buildings/3/floors -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"floor_number":-1}'
# 201 {"floor_id":6,"floor_number":-1,"building_id":3,"is_active":true,"active_ticket_count":0}
curl -X POST http://localhost:8000/api/core/admin/floors/6/seats -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"seat_number":"B-12"}'
# 201 {"seat_id":21,"seat_number":"B-12","floor_id":6,"is_active":true,"active_ticket_count":0}
```

Rename and/or deactivate with `PATCH /admin/buildings/{id}` (`building_name`, `is_active`), `PATCH /admin/floors/{id}` (`floor_number`, `is_active`) or `PATCH /admin/seats/{id}` (`seat_number`, `is_active`). Send only what changes. Deactivating never touches tickets: they keep their location. It only hides the item, and everything under it, from the dropdowns and from new tickets. Reactivating brings it back (a floor stays hidden while its building is inactive).

```sh
curl -X PATCH http://localhost:8000/api/core/admin/buildings/2 -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"is_active":false}'
# 200 {"building_id":2,"building_name":"Building B","is_active":false,"active_ticket_count":1}
```

Delete with `DELETE /admin/buildings/{id}`, `/admin/floors/{id}` or `/admin/seats/{id}` (204). Only for something nothing has used yet, like a typo: no tickets at all (closed ones included) and nothing underneath it. Otherwise deactivate it.

| Problem | Status and `detail` |
|---|---|
| Name or number already used | 409 `There's already a building called Annex` / `Building A already has floor 3` / `Floor 3 already has seat 301` |
| Deleting something a ticket has used | 409 `Building A has 4 tickets, so it can't be deleted. Deactivate it instead.` |
| Deleting a building with floors, or a floor with seats | 409 `Building B still has 2 floors. Delete them first, or deactivate it instead.` |
| The building, floor or seat doesn't exist (or the parent you're adding to) | 404 `Building not found` / `Floor not found` / `Seat not found` |
| Blank or too-long name (over 100 characters; seats 20), floor number outside -10 to 200, unknown fields, or a `PATCH` with nothing to change | 422 |

#### Engineer: my queue

Engineers only; `$ENGINEER_TOKEN` is an engineer's login token. Every route acts on the tickets **currently assigned to the caller**. Any other ticket (unassigned, someone else's, or reassigned away) is 404, not 403, so its existence isn't revealed. Rows and details use the same shapes as the admin routes, so they include `priority` and the requester's contact details.

The queue, P1 first, then the oldest created:

```sh
curl 'http://localhost:8000/api/core/engineer/tickets?view=active' -H "Authorization: Bearer $ENGINEER_TOKEN"
# 200 [{"ticket_id":1,"title":"Lobby lights out",...,"status":"open","priority":"P1","created_by_name":"Jane Doe",
#       "assigned_to_user_id":2,"assigned_to_name":"Sam Tech"},...]
curl 'http://localhost:8000/api/core/engineer/tickets?q=elevator' -H "Authorization: Bearer $ENGINEER_TOKEN"
```

| Query param | Values |
|---|---|
| `view` | `active` (everything not closed) or `closed`; leave it out for all |
| `status` | `open`, `in_progress`, `blocked`, `resolved`, `closed` |
| `priority` | `P1`, `P2`, `P3` |
| `building_id` | A building id |
| `q` | Case-insensitive text in title, full description, requester name or email, or an exact ticket id |

Filters combine with AND. There's no assignee filter, because the queue is always yours: an unknown parameter such as `assigned_to` is a 422.

Details, status history and notes of one of your tickets:

```sh
curl http://localhost:8000/api/core/engineer/tickets/1 -H "Authorization: Bearer $ENGINEER_TOKEN"
# 200 {"ticket_id":1,...,"status":"open","acknowledged_at":"...","assigned_at":"...","assigned_to_name":"Sam Tech",
#      "priority":"P1","created_by_name":"Jane Doe","created_by_email":"jane.doe@acme.inc","created_by_phone":null}
curl http://localhost:8000/api/core/engineer/tickets/1/history -H "Authorization: Bearer $ENGINEER_TOKEN"
curl http://localhost:8000/api/core/engineer/tickets/1/notes -H "Authorization: Bearer $ENGINEER_TOKEN"
# Not yours, or doesn't exist: 404 {"detail":"Ticket not found"}
```

Add a note. The employee sees it in their own notes list, and it moves the ticket's `updated_at` forward.

```sh
curl -X POST http://localhost:8000/api/core/engineer/tickets/1/notes -H "Authorization: Bearer $ENGINEER_TOKEN" \
  -H 'Content-Type: application/json' -d '{"note_text":"Replacing the breaker this afternoon."}'
# 201 {"note_id":1,"ticket_id":1,"user_id":2,"author_name":"Sam Tech","author_role":"engineer","note_text":"...",...}
# Closed ticket: 409. Blank or over 2000 characters: 422. Not yours: 404.
```

Change a ticket's status. Engineers move their tickets along the workflow; closing is for admins:

```
open --start--> in_progress --resolve--> resolved
                  |    ^                    |
           block  |    | unblock            | reopen
                  v    |                    v
                 blocked                in_progress
```

Blocking needs a reason (why the work is paused) and resolving needs a summary (what was done). Both are shown to the employee in the status history, and the blocked reason also appears next to "Blocked". Other moves take an optional `reason`. The status, `blocked_reason` (set while blocked, cleared after), `resolved_at` (set on resolve, cleared on reopen) and the history row are written together. Returns the updated ticket.

```sh
curl -X POST http://localhost:8000/api/core/engineer/tickets/1/status -H "Authorization: Bearer $ENGINEER_TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"blocked","reason":"Waiting on a replacement ballast"}'
# 200 {"ticket_id":1,...,"status":"blocked","blocked_reason":"Waiting on a replacement ballast","resolved_at":null,...}
```

| Problem | Status and `detail` |
|---|---|
| A move the workflow doesn't allow | 409, e.g. `Open tickets can't be resolved. Start work first.` / `Blocked tickets can't be resolved. Unblock it first.` / `Resolved tickets can't be blocked. Reopen it first.` |
| Already in that status | 409 `This ticket is already blocked` |
| The ticket is closed | 409 `Closed tickets can't change status` |
| Blocking or resolving without a reason | 422 `A reason is required to mark a ticket blocked` |
| `status` other than `in_progress`, `blocked`, `resolved` (e.g. `closed`), or a reason over 500 characters | 422 |
| Not yours, or doesn't exist | 404 `Ticket not found` |

CORS allows the frontend origin:

```sh
curl -i http://localhost:8000/api/core/health -H 'Origin: http://localhost:3000'
# HTTP/1.1 200 OK
# access-control-allow-origin: http://localhost:3000
```

CORS blocks other origins:

```sh
curl -i -X OPTIONS http://localhost:8000/api/core/health \
  -H 'Origin: http://evil.test' -H 'Access-Control-Request-Method: POST'
# HTTP/1.1 400 Bad Request
```

## Configuration

The backend reads its settings from environment variables in [backend/core/config.py](backend/core/config.py). Every setting has a local default.

| Variable | Default | Purpose |
|---|---|---|
| `IS_LOCAL` | `true` | Turns on local CORS and turns off Postgres SSL. Terraform sets it to `false` in AWS, where Aurora requires SSL. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of browser origins allowed locally |
| `POSTGRES_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASS` | `localhost` / `5432` / `codingworkshop` / `test` / `test` | Database connection settings |
| `JWT_SECRET` | Random per process, locally only | Signs access tokens (HS256). At least 32 characters. **Required in AWS**, where the backend refuses to sign tokens without it. Terraform generates one (`random_password.jwt_secret` in [infra/main.tf](infra/main.tf)) and passes it to every Lambda. |
| `JWT_EXPIRES_MINUTES` | `60` | How long an access token lasts |

CORS is only enabled locally. In AWS, the frontend and the API are served from the same CloudFront domain, so the browser doesn't need CORS.

Without `JWT_SECRET`, the local backend makes up a random secret each time it starts, and `--reload` restarts it on every code change. Each restart signs everyone out ("Invalid token. Please sign in again."). To stay signed in while you work, set a fixed secret in the terminal that runs the backend:

```sh
export JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
cd backend/core && ../.venv/bin/uvicorn function:app --reload --port 8000
```

In AWS the secret stays the same across deploys. Rotating it signs every user out. To rotate it, replace `random_password.jwt_secret` in a Terraform apply (`-replace=random_password.jwt_secret`), using the same credentials and backend setup as [bin/deploy-backend.sh](bin/deploy-backend.sh).

## Deployment

See [bin/README.md](bin/README.md). The deploy scripts change real AWS resources, so check before running them.

### Setting up the database in AWS

The deploy creates an empty Aurora database, with no tables, and until the tables exist, registering and signing in return 500. Aurora is in a private network, so `psql` can't reach it from your machine. Instead, the Lambda sets up its own database: invoke it directly with a `setup_task` payload ([backend/core/setup_tasks.py](backend/core/setup_tasks.py)). The public URL can't trigger this, because browser requests arrive in a different event shape. Only AWS credentials that can call `lambda:InvokeFunction` can.

After a deploy, run this once with the participant credentials. It creates the tables and demo locations, the first Facility Admin account, and the demo data:

```sh
read -rs ADMIN_PASSWORD   # type the admin password; it isn't shown or saved in your shell history
aws lambda invoke \
  --function-name "coding-workshop-core-$PARTICIPANT_ID" \
  --cli-binary-format raw-in-base64-out \
  --payload "{\"setup_task\":\"seed\",\"admin_email\":\"admin@acme.inc\",\"admin_password\":\"$ADMIN_PASSWORD\",\"demo_data\":true}" \
  out.json
cat out.json
# {"ok": true, "task": "seed", "sql_files": ["schema.sql", "seed.sql"],
#  "admin": {"email": "admin@acme.inc", "created": true},
#  "demo_data": {"created": true, "people": 7, "tickets": 25}}
```

Then sign in on the CloudFront URL as `admin@acme.inc`.

| Payload field | Meaning |
|---|---|
| `setup_task` | Always `"seed"`: runs `sql/schema.sql`, then `sql/seed.sql` |
| `admin_email`, `admin_password` | Optional. Creates a Facility Admin, using the registration rules (`@acme.inc`, 8+ character password). If the email is already taken, that account is left exactly as it is: no new password, no promotion. |
| `admin_name` | Optional display name, default `Facility Admin` |
| `demo_data` | Optional, `true` to add the demo people and tickets from [backend/core/demo_data.py](backend/core/demo_data.py): 2 engineers, 5 employees and 25 tickets in every status, with notes and history. Needs an admin to exist (this run's or an earlier one). None of these people can sign in. |

Every run is safe to repeat: the SQL files skip what exists, and the demo data is skipped if its people are already there. It all runs in one transaction, so a failed run changes nothing. After a change to `schema.sql`, deploy and run it again without the admin fields to update Aurora:

```sh
aws lambda invoke --function-name "coding-workshop-core-$PARTICIPANT_ID" \
  --cli-binary-format raw-in-base64-out --payload '{"setup_task":"seed"}' out.json
```

Bad input returns `{"ok": false, "error": "..."}` without changing anything, and the error never repeats the password. A database failure shows up as `"FunctionError": "Unhandled"` in the CLI output. See the Lambda logs for it: `aws logs tail /aws/lambda/coding-workshop-core-$PARTICIPANT_ID`. Leave `"` and `\` out of the password, or the payload isn't valid JSON.

## Known limitations

- **Access tokens in `localStorage`.** The frontend keeps its signed JWT (1 hour, no refresh tokens) in `localStorage` ([frontend/src/services/session.js](frontend/src/services/session.js)) and sends it as `Authorization: Bearer <token>`. A token there could be read by an injected script (XSS); React's output escaping and the short expiry limit that risk.
- List endpoints return every matching record, with no pagination yet.
- Employees, engineers and Facility Admins each have their pages. Facility admins have a dashboard (`/admin`: count cards that filter the list, the unassigned queue with quick assign, each engineer's workload, then all tickets with search and filters) a details page (`/admin/tickets/:id`) where they can assign or reassign the ticket, and close a resolved ticket or send it back (notes are read-only for them), a People page (`/admin/people`) to move people between employee and engineer, and a Facilities page (`/admin/facilities`: buildings beside the chosen one's floor accordions and seat chips, a building dropdown on phones) to add, rename, deactivate or reactivate, and delete buildings, floors and seats. The dashboard's Building filter lists inactive buildings too (marked), and `?building=<id>` opens it filtered to one. Engineers' Building filter still uses the employee list (`GET /buildings`), so it leaves out inactive buildings even when an engineer has tickets there. With many unassigned tickets the queue section gets long; it isn't paged or capped. Engineers have My queue (`/engineer`: the current or next ticket, counts, and their tickets with search and filters) and a details page (`/engineer/tickets/:id`) where they can add notes and move the ticket along: start, block (with a reason), unblock, resolve (with a summary) and reopen. Only the moves the workflow allows are offered, and "Up next" can be started from the dashboard. Admins can move people between employee and engineer (`PUT /admin/users/{id}/role`), but admin accounts can't be created through the API: use the setup task's `admin_email` (see Deployment), or in SQL set their `role_id` in the `users` table to the `admin` row in `roles`.
- Status history is written when a ticket is created and on every status change (engineers moving it along, admins closing it or sending it back). Any new endpoint that changes status must call `ticket_repository.set_status` and `insert_status_change` in the same transaction, or the history will miss that step. Tickets have no `closed_at` column: the close time is the history row's `changed_at`.
- Ticket **priority** (P1/P2/P3) is stored for engineer and admin triage but is not part of the employee API: no employee response includes it and employees can't filter by it. Employees see the impact they chose (who is affected) and the status. Tickets have no urgency or short description: both were removed at the managers' request. The admin ticket routes return priority, filter by it and sort by it. Admins can't change it yet.
- Deploy packaging: Terraform builds the Lambda zip with pip on the machine running it (`build_in_docker = false`), so compiled packages (psycopg-binary, pydantic-core) need Linux x86_64 wheels before deploying from a Mac. The zip also includes `backend/core/tests/`, which is harmless.
