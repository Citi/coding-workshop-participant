# ACME Project Tracker – API Contract

Single backend service **`pm-service`** (one AWS Lambda, Python 3.13, PostgreSQL).
This document is the contract between the backend (`backend/pm-service`) and the
frontend (`frontend/src/services`). Field names here are exact.

## Base URL

| Environment | Base URL |
|---|---|
| Local | `http://localhost:3001/api/pm-service` (dev proxy → LocalStack Lambda) |
| AWS   | `https://<cloudfront-domain>/api/pm-service` (same origin as the web app) |

Frontend: `` `${import.meta.env.VITE_API_URL ?? ''}/api/pm-service` ``.

## Conventions

* JSON in, JSON out. `Content-Type: application/json`.
* Authentication: `Authorization: Bearer <access_token>` on every endpoint except
  `POST /auth/login`, `POST /auth/refresh`, `GET /health` (and `GET /`), `GET /health/db`.
* IDs are positive integers. Dates are `YYYY-MM-DD`. Timestamps are ISO 8601 (UTC).
  Money values are JSON numbers with up to 2 decimals.
* "Today" for business rules is the current UTC date.
* **List responses** are always `{"items": [...], "total": <number of items>}` (no pagination).
* **Create** → `201` + the created object. **Read / Update** → `200` + the object.
  **Delete** → `204` with an empty body.
* **PUT is a full update**: send every field (same rules as POST). Unknown fields are ignored,
  so the frontend may send back an object it received (computed fields are ignored).
* Text fields are trimmed. Emails are trimmed and lower-cased. Uniqueness checks are case-insensitive.
  Text may not contain NUL characters.
* Strict input types: ids in request bodies must be JSON integers (`"1"`, `1.0` or `true` are rejected),
  dates must be `"YYYY-MM-DD"` strings, booleans must be JSON booleans.
* Percentages (`progress_percent`, elapsed time, `budget_used_percent`) round halves up.

## Error format (every error, every status)

```json
{"error": {"code": "VALIDATION_ERROR", "message": "Validation failed",
           "details": {"end_date": "Must be on or after start_date"}}}
```

`details` is optional; for validation errors it maps **field name → message**.

| Status | `code` values | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid/missing field, bad query parameter, bad id in URL, reference to a record that does not exist (e.g. `project_id`), dependency cycle |
| 400 | `INVALID_JSON` | body is not valid JSON |
| 400 | `INVALID_OPERATION` | business rule, e.g. an admin changing their own role or deleting themselves |
| 401 | `AUTH_REQUIRED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED` | not logged in / bad or expired token / wrong login / account disabled while logged in |
| 403 | `FORBIDDEN` | role lacks the permission (`details.required_permission`) |
| 403 | `ACCOUNT_DISABLED` | correct password but the account is disabled (login only) |
| 404 | `NOT_FOUND` | unknown route, or the record in the URL does not exist |
| 405 | `METHOD_NOT_ALLOWED` | path exists, method does not |
| 409 | `CONFLICT` | duplicate unique value (`details` names the field) |
| 500 | `INTERNAL_ERROR`, `DATABASE_ERROR`, `DATABASE_UNAVAILABLE` | server/database problems |

Frontend handling: on `401` with code `TOKEN_EXPIRED` call `/auth/refresh` once and retry;
any other `401` → log out and show the login page with the message.

`DATABASE_UNAVAILABLE`: the database could not be reached, even after the API reconnected once
(see [Database connection and cold starts](#database-connection-and-cold-starts)); try again later.

## Roles and permissions

Permission strings are `"<resource>:<action>"`, actions `read | create | update | delete`.

| Permission | admin | manager | contributor | viewer |
|---|:-:|:-:|:-:|:-:|
| `dashboard:read` | ✓ | ✓ | ✓ | ✓ |
| `projects / deliverables / resources / allocations / expenses : read` | ✓ | ✓ | ✓ | ✓ |
| `… : create`, `… : update` | ✓ | ✓ | ✓ | – |
| `… : delete` | ✓ | ✓ | – | – |
| `users:read / create / update / delete` | ✓ | – | – | – |

The list for the current user is returned by login and `GET /auth/me` as `user.permissions`;
the UI hides/disables actions the user lacks. The API always enforces it as well.

### Seeded accounts (created when the users table is empty)

| Email | Password | Role |
|---|---|---|
| admin@acme.com | Admin@123 | admin |
| manager@acme.com | Manager@123 | manager |
| contributor@acme.com | Contributor@123 | contributor |
| viewer@acme.com | Viewer@123 | viewer |

---

## Auth

### `POST /auth/login` (public)
Body: `{"email": "admin@acme.com", "password": "Admin@123"}`
`200`:
```json
{"access_token": "...", "refresh_token": "...", "token_type": "Bearer", "expires_in": 1800,
 "user": {"id": 1, "email": "admin@acme.com", "full_name": "System Administrator",
          "role": "admin", "is_active": true, "permissions": ["dashboard:read", "projects:create", "..."]}}
```
Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`.

### `POST /auth/refresh` (public)
Body: `{"refresh_token": "..."}` → `200` same shape as login (new access **and** refresh token).
Errors: `401 TOKEN_EXPIRED | INVALID_TOKEN`.

### `GET /auth/me`
`200`: the `user` object from login (with `permissions`).

Access token lifetime 30 minutes; refresh token 7 days. Logout is client-side (discard tokens).

---

## Users (admin only: `users:*`)

**User object**
```json
{"id": 5, "email": "jane@acme.com", "full_name": "Jane Doe", "role": "manager",
 "is_active": true, "created_at": "2026-11-24T10:00:00+00:00", "updated_at": "..."}
```
(`password_hash` is never returned.)

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | filters: `search` (name or email, contains, case-insensitive), `role`, `is_active` (`true`/`false`); sorted by `full_name` |
| POST | `/users` | body `{email, full_name, role, password, is_active?=true}` |
| GET | `/users/{id}` | |
| PUT | `/users/{id}` | body `{email, full_name, role, is_active, password?}` — to keep the current password leave `password` out or send `null` (an empty string is a validation error) |
| DELETE | `/users/{id}` | |

Validation: `email` valid & unique (409 `details.email`); `full_name` 1–120; `role` ∈ admin, manager,
contributor, viewer; `password` ≥ 8 chars, ≤ 72 bytes, at least one letter and one number.
Rules (400 `INVALID_OPERATION`): an admin cannot change their **own** role, deactivate themselves,
or delete themselves.

---

## Projects

**Project object** (stored fields + computed fields)
```json
{"id": 1, "name": "Apollo CRM", "description": "", "department": "Sales", "status": "active",
 "start_date": "2026-01-01", "end_date": "2026-12-31", "budget": 150000.0,
 "created_at": "...", "updated_at": "...",
 "progress_percent": 40, "deliverables_total": 5, "deliverables_completed": 2,
 "deliverables_overdue": 1, "deliverables_blocked": 0,
 "key_deliverables_total": 2, "key_deliverables_completed": 1, "team_size": 3,
 "health": "at_risk", "health_reasons": ["1 deliverable(s) overdue"],
 "budget_spent": 61000.0, "budget_remaining": 89000.0, "budget_used_percent": 40.7, "over_budget": false}
```
* `status` ∈ `planned | active | on_hold | completed | cancelled`
* `health` ∈ `on_track | at_risk | overdue`, or `null` for completed/cancelled projects.
* `budget_used_percent` is `null` only when budget is 0 and something was spent.

| Method | Path | Notes |
|---|---|---|
| GET | `/projects` | filters: `search` (name, description, department), `status`, `department` (exact, case-insensitive), `health` (one value or a comma-separated list, see below); sorted by `end_date`, then `name` |
| POST | `/projects` | body `{name, description?="", department, status?="planned", start_date, end_date, budget?=0}` |
| GET | `/projects/{id}` | project object |
| PUT | `/projects/{id}` | full body |
| DELETE | `/projects/{id}` | also deletes its deliverables, dependencies, allocations and expenses |

Validation: `name` 1–150, unique (409 `details.name`); `department` 1–100; `description` ≤ 5000;
`end_date` ≥ `start_date` (`details.end_date`); `budget` ≥ 0, ≤ 999,999,999,999.99, max 2 decimals.

**`health` filter**: one value (`?health=at_risk`) or several separated by commas
(`?health=at_risk,overdue`, also sent URL-encoded as `at_risk%2Coverdue`) returns the projects whose
computed health is **any** of them, still sorted by `end_date`, then `name`. Repeating the parameter
(`?health=at_risk&health=overdue`) gives the same result, because Lambda Function URLs join repeated
parameters with commas. Spaces around values and empty items are ignored, duplicates count once, and a
value with no items at all (`?health=` or `?health=,`) is no filter. Every value must be `on_track`,
`at_risk` or `overdue` (lower case), otherwise `400 VALIDATION_ERROR` with `details.health`
(`"Must be one of: on_track, at_risk, overdue"`). Completed and cancelled projects have no health, so
any `health` filter leaves them out, even combined with `status=completed`.

### Health rules
* **overdue**: today > `end_date` (project not completed/cancelled)
* **at_risk**: any deliverable overdue (not completed and `due_date` < today) or blocked, **or**
  elapsed-time % − progress % > 20 points
* **on_track**: otherwise. `health_reasons` lists every triggered rule.

---

## Deliverables

**Deliverable object** (list and single)
```json
{"id": 10, "project_id": 1, "project_name": "Apollo CRM", "name": "Requirements sign-off",
 "description": "", "status": "in_progress", "due_date": "2026-03-01", "is_key": true,
 "owner_id": 4, "owner_name": "Priya Shah", "is_overdue": false,
 "depends_on_ids": [8, 9], "created_at": "...", "updated_at": "..."}
```
`status` ∈ `not_started | in_progress | blocked | completed`. `is_overdue` = not completed and
`due_date` < today. `owner_id` / `owner_name` may be `null`.

`GET /deliverables/{id}` additionally returns:
```json
{"depends_on": [{"id": 8, "name": "...", "status": "completed", "due_date": "...", "project_id": 1, "project_name": "..."}],
 "dependency_chain": [{"id": 8, "name": "...", "status": "...", "due_date": "...", "project_id": 1, "project_name": "...", "depth": 1}],
 "blocks": [{"id": 12, "name": "...", "status": "...", "due_date": "...", "project_id": 1, "project_name": "..."}]}
```
* `depends_on`: direct prerequisites. `dependency_chain`: **all** upstream prerequisites,
  recursively (`depth` 1 = direct), each listed once at its smallest depth, ordered by depth then due date.
* `blocks`: deliverables that directly depend on this one.

| Method | Path | Notes |
|---|---|---|
| GET | `/deliverables` | filters: `search` (name, description), `project_id`, `status`, `is_key`, `overdue` (`true` → only overdue), `owner_id`; sorted by `due_date`, then `id` |
| POST | `/deliverables` | body `{project_id, name, description?="", status?="not_started", due_date, is_key?=false, owner_id?=null, depends_on_ids?=[]}` |
| GET | `/deliverables/{id}` | object + `depends_on`, `dependency_chain`, `blocks` |
| PUT | `/deliverables/{id}` | full body; `depends_on_ids` replaces the whole set |
| DELETE | `/deliverables/{id}` | dependency links are removed with it |

Validation: `project_id` must exist (400 `details.project_id`); `owner_id`, when given, must be an
existing resource (400 `details.owner_id`); `name` 1–150, unique within its project
(409 `details.name`); every id in `depends_on_ids` must exist, no duplicates, not itself, and must
not create a cycle (400 `details.depends_on_ids`). Dependencies may point to other projects.

---

## Resources (team members)

**Resource object**
```json
{"id": 4, "full_name": "Priya Shah", "email": "priya@acme.com", "job_title": "Developer",
 "department": "IT", "total_allocation_percent": 120, "active_project_count": 2,
 "is_over_allocated": true, "created_at": "...", "updated_at": "..."}
```
`total_allocation_percent` sums allocations to **active** projects only;
`is_over_allocated` = total > 100.

`GET /resources/{id}` additionally returns
`"allocations": [{"id": 3, "project_id": 1, "project_name": "Apollo CRM", "project_status": "active", "allocation_percent": 60}]`
(all of the person's allocations, any project status, sorted by project name).

| Method | Path | Notes |
|---|---|---|
| GET | `/resources` | filters: `search` (name, email, job title), `department` (exact, case-insensitive), `over_allocated` (`true`/`false`); sorted by `full_name` |
| POST | `/resources` | body `{full_name, email, job_title, department}` |
| GET | `/resources/{id}` | object + `allocations` |
| PUT | `/resources/{id}` | full body |
| DELETE | `/resources/{id}` | removes their allocations; deliverables they owned get `owner_id = null` |

Validation: `full_name` 1–120; `email` valid & unique (409 `details.email`); `job_title`,
`department` 1–100.

---

## Allocations (resource ↔ project)

**Allocation object**
```json
{"id": 3, "resource_id": 4, "resource_name": "Priya Shah", "project_id": 1,
 "project_name": "Apollo CRM", "project_status": "active", "allocation_percent": 60,
 "resource_total_allocation_percent": 120, "resource_over_allocated": true,
 "created_at": "...", "updated_at": "..."}
```
`resource_total_allocation_percent` / `resource_over_allocated` are the person's current totals
(active projects) **after** this change — the UI uses them to warn about over-allocation. Before
saving, the allocation dialog previews the same total by the same rule from `GET /resources`
(`total_allocation_percent`, loaded when the dialog opens).

| Method | Path | Notes |
|---|---|---|
| GET | `/allocations` | filters: `project_id`, `resource_id`; sorted by project name, then resource name |
| POST | `/allocations` | body `{resource_id, project_id, allocation_percent}` |
| GET | `/allocations/{id}` | |
| PUT | `/allocations/{id}` | full body |
| DELETE | `/allocations/{id}` | |

Validation: `resource_id` / `project_id` must exist (400, field in `details`); `allocation_percent`
integer 1–100; one allocation per resource per project (409 `details.resource_id`).
Over-allocation is **allowed** (it is reported, not blocked).

---

## Expenses (budget tracking)

**Expense object**
```json
{"id": 7, "project_id": 1, "project_name": "Apollo CRM", "category": "software",
 "description": "CRM licences", "amount": 12000.0, "expense_date": "2026-02-15",
 "created_at": "...", "updated_at": "..."}
```
`category` ∈ `labor | software | hardware | travel | other`.

| Method | Path | Notes |
|---|---|---|
| GET | `/expenses` | filters: `project_id`, `category`, `date_from`, `date_to` (inclusive; `date_from` ≤ `date_to`), `search` (description); sorted by `expense_date` desc, then `id` desc |
| POST | `/expenses` | body `{project_id, category, description, amount, expense_date}` |
| GET | `/expenses/{id}` | |
| PUT | `/expenses/{id}` | full body |
| DELETE | `/expenses/{id}` | |

Validation: `project_id` must exist (400 `details.project_id`); `description` 1–255;
`amount` > 0, ≤ 999,999,999,999.99, max 2 decimals; `expense_date` valid date.
Planned budget lives on the project (`budget`); consumed = sum of its expenses.

---

## Dashboard

### `GET /dashboard` (`dashboard:read`, every role)
```json
{
  "generated_at": "2026-11-24T12:00:00+00:00",
  "projects": {"total": 12,
               "by_status": {"planned": 2, "active": 7, "on_hold": 1, "completed": 1, "cancelled": 1},
               "by_health": {"on_track": 4, "at_risk": 3, "overdue": 1}},
  "active_projects": [ProjectSummary],
  "at_risk_projects": [ProjectSummary],
  "deliverables": {"total": 40, "completed": 12, "overdue": 3, "blocked": 2, "key_total": 8, "key_completed": 3},
  "key_deliverables": [DeliverableSummary],
  "upcoming_deliverables": [DeliverableSummary],
  "overdue_deliverables": [DeliverableSummary],
  "resources": {"total": 15, "over_allocated": 2},
  "over_allocated_resources": [{"id": 4, "full_name": "Priya Shah", "job_title": "Developer", "department": "IT",
                                "total_allocation_percent": 120,
                                "allocations": [{"project_id": 1, "project_name": "Apollo CRM", "allocation_percent": 60}]}],
  "budget": {"total_planned": 1000000.0, "total_spent": 420000.0, "used_percent": 42.0, "over_budget_projects": 1},
  "budget_by_project": [{"project_id": 1, "project_name": "Apollo CRM", "status": "active", "budget": 150000.0,
                         "budget_spent": 61000.0, "budget_remaining": 89000.0, "budget_used_percent": 40.7, "over_budget": false}]
}
```
* `generated_at`: when the snapshot was built. The web app words the dashboard's due and end dates
  ("3 days overdue") against the UTC date of `generated_at`.
* **ProjectSummary**: `{id, name, department, status, start_date, end_date, progress_percent, health, health_reasons, budget, budget_spent, budget_used_percent, over_budget, team_size}`
* **DeliverableSummary**: `{id, name, project_id, project_name, status, due_date, is_key, owner_name, is_overdue}`
* `active_projects`: status `active`, sorted by `end_date`.
* `at_risk_projects`: health `at_risk` or `overdue` (overdue first, then `end_date`).
* `by_health` counts only projects that have a health value.
* `key_deliverables`: `is_key` and not completed, by `due_date` (max 10).
* `upcoming_deliverables`: not completed, due today … today+14 days, by `due_date` (max 10).
* `overdue_deliverables`: not completed and `due_date` < today, by `due_date` (max 10).
* `over_allocated_resources`: sorted by total desc; `allocations` lists active-project allocations.
* `budget` and `budget_by_project` exclude **cancelled** projects; `budget_by_project` sorted by
  `budget_used_percent` desc (nulls first). `used_percent` = total_spent / total_planned × 100
  (1 decimal; `0` when nothing is planned).

## Health check
`GET /health` (public, no database) → `{"status": "ok", "service": "pm-service"}`. `GET /` answers the same.

`GET /health/db` (public, no token needed; a token that is sent is ignored) → runs `SELECT 1` and returns
`{"status": "ok", "service": "pm-service", "database": "ok"}`. It goes through the normal request
pipeline, so on a cold start it also opens the database connection and applies the schema bootstrap.
It is meant as a wake-up call: a client can send it early (for example when the login page opens)
so the first real request, such as the login, does not pay for the cold start. The web app's login
page does exactly that, without a token, at most once a minute, and ignores a failed call.
Errors: `500 DATABASE_UNAVAILABLE` when the database cannot be reached, even after one reconnect
(see below; retry later), `500 DATABASE_ERROR` for any other database failure;
`405 METHOD_NOT_ALLOWED` for any other method (`POST`, `PUT`, `PATCH`, `DELETE`).
An `OPTIONS` preflight gets `204` without touching the database, like every other path.

### Database connection and cold starts
Each Lambda container opens one database connection and reuses it for the requests it serves. While
the container is idle, the database may close that connection (Aurora Serverless v2 scaling to 0 ACU,
an idle timeout, a failover), and the API only notices when the next request opens its transaction,
before any of the request's own work. It then drops the connection, opens a new one and tries once
more. Connecting waits while Aurora resumes, so that request is slow (about 15–20 s after a pause) but
succeeds, whichever endpoint it calls.

* If the second attempt fails too (or connecting fails twice): `500 DATABASE_UNAVAILABLE`, and the
  next request opens a new connection. Each connection attempt waits at most 25 s, so even two failed
  attempts are answered before CloudFront stops waiting for the API (60 s, after which it would send
  its own `504` page instead of this JSON error).
* Nothing is retried once authentication or the handler has started, so a request never runs twice;
  a connection lost at that point gives `500 DATABASE_UNAVAILABLE`.
* Each reconnect is logged as one line, without the error message:
  `{"event": "db_reconnect", "request_id": "…", "error": "OperationalError"}`.
