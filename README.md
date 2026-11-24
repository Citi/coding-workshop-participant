# ACME Project Tracker

A centralized project management and tracking platform for ACME Inc. It gives project managers
and team leads real-time visibility of **project health, resource utilization, deliverables and
budgets** — with full CRUD, search and filters, role-based access control, and a responsive UI
for desktop and mobile.

| | |
|---|---|
| **Live app (AWS)** | https://d1t3qq29ya5gnv.cloudfront.net |
| **Local app** | http://localhost:3000 (after `./bin/start-dev.sh`) |
| **API contract** | [docs/API.md](docs/API.md) |
| **Testing guide & results** | [docs/TESTING.md](docs/TESTING.md) |
| **Workshop guides** | [docs/README.md](docs/README.md) |

### Demo accounts (seeded on first start)

| Role | Email | Password | Can do |
|---|---|---|---|
| Admin | admin@acme.com | Admin@123 | everything, including managing users and roles |
| Manager | manager@acme.com | Manager@123 | everything except users and roles |
| Contributor | contributor@acme.com | Contributor@123 | create and update, no delete |
| Viewer | viewer@acme.com | Viewer@123 | read-only |

> These are demo credentials for evaluation. In a real deployment the admin would change them
> (Users page) or seeding would be disabled.

## What's new – UX upgrade

A second iteration on top of the workshop requirements: a faster first visit, shorter paths to the
right list, two visual views and fewer planning mistakes. Before/after test numbers:
[docs/TESTING.md › Latest results](docs/TESTING.md#latest-results).

| | What changed | Where to see it |
|---|---|---|
| **Speed you can feel** | The login page pre-warms the database (public `GET /health/db`) while you type; a sign-in or data load that takes over 3 s shows *"Waking up the database – the first request after a quiet period can take up to 20 seconds."* | Login page on AWS after a quiet period |
| | If the database dropped the idle connection, the API reconnects and retries once, before the request runs; CloudFront now waits up to 60 s for the API (was 30 s) | The first request after a pause answers instead of failing |
| | Lambda memory 512 MB (was 128 MB). Measured on AWS: warm login **0.33–0.45 s** (was ~1.2 s); a database wake-up answered in **16.8 s** | Sign in |
| **Find things faster** | Dashboard KPI cards are links to the matching filtered list, and the list matches the card's number (checked as admin, contributor and viewer) | Dashboard → click a card, e.g. *Projects at risk* |
| | Filters live in the URL on Projects, Deliverables and Resources: reload, Back and shared links keep them | Filter a list, open a record, press Back |
| | Health filter *At risk or overdue* (`GET /projects?health=at_risk,overdue`) | Projects → *Health* |
| | Sortable columns in all 7 tables: ascending → descending → original order, exposed as `aria-sort` (desktop) | Click a column header |
| **See the picture** | Projects timeline: one bar per project from start to end date, coloured by health with text labels, a darker progress fill and a *Today* marker | Projects → *List \| Timeline* (`#/projects?view=timeline`) |
| | Resources heat map: people × projects, only active projects count, *Over-allocated* marker; scrolls sideways in its own keyboard-reachable region | Resources → *List \| Heat map* (`#/resources?view=heatmap`) |
| **Fewer mistakes** | Urgency labels next to due and end dates – *Due tomorrow*, *Ends in 3 weeks*, *5 days overdue* – in UTC calendar days; none for completed or cancelled work | Projects and Deliverables lists, project page, deliverable details, dashboard |
| | Allocation what-if: *"Priya Shah: 60% now → 110% after this change"* plus an over-allocation warning, by the API's rule; it never blocks saving | *New allocation* on a project's *Team* tab or a person's page |
| **Quality & security** | The repository's GitHub *Security Check - Python* (bandit) passes – 742 findings before, 0 now: `backend/.bandit` excludes the tests, 19 reviewed `# nosec` annotations with reasons, the demo-data script accepts only http(s) URLs; bandit pinned in `requirements-dev.txt` | GitHub → Actions; [run it locally](docs/TESTING.md#how-to-run) |
| | Two independent reviews – correctness/contracts, and UX/accessibility/responsive in a real browser at 375/768/1366 px – applied 16 fixes | [docs/TESTING.md › Review findings](docs/TESTING.md#review-findings-fixed-ux-upgrade) |

---

## 1. The business questions and where they are answered

| Question | Where in the app | API |
|---|---|---|
| What is the current status of each active project? | Dashboard → *Active projects* (the KPI card opens the filtered list); Projects list (status, health, progress, budget; sortable); Projects → *Timeline* | `GET /dashboard`, `GET /projects?status=active` |
| Which projects are at risk of missing their deadlines? | Dashboard → *Projects at risk* KPI card and section (with reasons); Projects → Health *At risk or overdue*; Projects → *Timeline* (health colours, *Today* marker); "Ends in …" / "… overdue" labels | `GET /projects?health=at_risk,overdue` |
| How are resources allocated across projects? | Resources → *Heat map* (people × projects); Project → *Team* tab; Resource details → *Project allocations* | `GET /resources` + `GET /allocations`, `GET /allocations?project_id=…`, `GET /resources/{id}` |
| What are the key deliverables and their completion status? | Dashboard → *Key deliverables* KPI card and section; Deliverables → *Key deliverables only* (with due-date labels) | `GET /deliverables?is_key=true` |
| Which team members are over-allocated across multiple projects? | Dashboard → *Over-allocated* KPI card and section; Resources → *Over-allocated only*; Resources → *Heat map* (*Over-allocated* marker); what-if preview before an allocation is saved | `GET /resources?over_allocated=true` |
| What is the dependency chain between deliverables? | Deliverable details → *Depends on*, full *Dependency chain*, *Blocks* (each with its due-date label) | `GET /deliverables/{id}` |
| How much budget has been consumed versus planned for each project? | Dashboard → *Budget used* KPI card → Budget page (sortable per-project table); Dashboard → *Budget*; Project → *Budget* tab | `GET /projects`, `GET /expenses` |

### Business rules

* **Progress %** = completed deliverables ÷ all deliverables of the project.
* **Health** (planned / active / on-hold projects; closed projects have none):
  * **Overdue** – today is past the project end date.
  * **At risk** – any deliverable is overdue or blocked, **or** the share of the schedule that has
    elapsed is more than **20 points** ahead of progress %.
  * **On track** – otherwise. Every triggered rule is listed as a reason.
* **Over-allocated** – a person's allocation % across **active** projects adds up to more than 100%
  (allocations to planned/on-hold projects are kept but do not count yet).
* **Budget** – planned budget is set on the project; consumed = sum of its expenses;
  used % = consumed ÷ planned; *over budget* when consumed > planned.
* **Dependencies** – a deliverable can depend on any other deliverable (also across projects);
  self-dependencies and circular chains are rejected.
* "Today" is the current **UTC** date.

---

## 2. Architecture

```
                        ┌──────────────────────── AWS ────────────────────────┐
 Browser                │  CloudFront ──┬── /*               → S3 (React build) │
 (React + MUI) ─HTTPS──▶│               └── /api/pm-service/* → Lambda URL      │
                        │                                        │ Python 3.13   │
                        │                                        ▼               │
                        │                              Aurora PostgreSQL (SSL)   │
                        └─────────────────────────────────────────────────────────┘

 Local:  Vite :3000 ──▶ dev proxy :3001 ──▶ LocalStack Lambda (hot reload) ──▶ PostgreSQL :5432
```

**Backend – one Lambda, organised by domain (`backend/pm-service`)**

```
function.py                  Lambda entry point
app/main.py                  request pipeline: route → transaction (reconnect once) → authenticate → authorize → handler
app/core/                    router, HTTP/JSON, errors, validation (pydantic), db, schema.sql, clock
app/auth/                    login/refresh/me, JWT, bcrypt, central permission matrix, seeding
app/<domain>/                users, projects, deliverables, resources, allocations, expenses, dashboard
    routes.py  (HTTP)  →  service.py (business rules)  →  repository.py (parameterized SQL)
    schemas.py (request validation)
app/projects/health.py       health / progress / budget rules (pure functions)
app/projects/metrics.py      per-project aggregates shared by projects and dashboard
app/resources/utilization.py over-allocation rule shared by resources, allocations and dashboard
```

**Frontend – feature folders (`frontend/src`)**

```
services/     apiClient (JWT, silent refresh, ApiError), healthApi (database wake-up) + one module per API resource
context/      AuthProvider (session, permissions), NotificationProvider (toasts)
components/   AppLayout (responsive nav), DataTable (table ⇄ cards, sortable columns), FormDialog, ConfirmDialog,
              FilterBar, ViewSwitch (List | Timeline / Heat map), StatCard (KPI link), DueDate (urgency label),
              StatusChip, PercentBar, route guards, state views (with the slow-request hint)
pages/        login, dashboard, projects (+ timeline), deliverables, resources (+ heat map, allocation what-if),
              budget, users
hooks/        useUrlFilters (filters and views in the URL), useDelayedFlag (hint after 3 s), …
utils/ theme.js
```

### Request lifecycle
1. `parse_event` normalises the Lambda Function URL event (strips `/api/pm-service` when called
   through CloudFront).
2. The router resolves the route (404 / 405) and its declared permission.
3. One database transaction per request. If the database closed the container's idle connection, it
   is replaced and the transaction opened again – once, before anything of the request has run. Then
   the token is verified, the user is re-read from the database (role changes and deactivation apply
   immediately), the permission is checked (403), and the handler runs. Any error rolls the whole
   request back.
4. Every error is returned as `{"error": {"code", "message", "details"}}` with the right status
   (400/401/403/404/405/409/500).

---

## 3. Design decisions and trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| **One Lambda (`pm-service`) with domain modules** instead of one Lambda per entity | No copy-pasted DB/auth code (Terraform packages each service folder separately), one cold start, one connection per container, one deploy | All domains scale together; splitting later is straightforward because each domain is already isolated |
| **PostgreSQL schema applied on cold start** (`CREATE … IF NOT EXISTS`, advisory lock) | Zero manual setup locally and in AWS (Aurora is only reachable from inside the VPC) | Not a migration tool; schema changes beyond additive ones would need one (e.g. Alembic) |
| **Computed fields on read** (health, progress, spend, utilization) | Always consistent with the data; no counters to keep in sync | Aggregation queries per list request (single query per request, indexed) |
| **JWT access (30 min) + refresh (7 days) tokens, bcrypt passwords** | Stateless auth that suits Lambda; silent refresh in the UI | Refresh tokens cannot be revoked individually (deactivating a user blocks them immediately though) |
| **Permissions defined once** in `app/auth/permissions.py`, sent to the UI via `/auth/me` | UI hides what a role cannot do; API enforces everything | — |
| **Tokens in `localStorage`** | Simple for a static S3/CloudFront site | Exposed to XSS; httpOnly cookies would need cookie/CSRF handling on the API |
| **Hash-based routes (`/#/projects`)** and **no CloudFront 404→index.html rule** | That rule applies to every origin and turned API 404s into "200 + HTML" | URLs contain `#` |
| **Validation in both layers** (pydantic on the API, same rules in forms) | Immediate feedback in the UI; the API is the source of truth | Rules are duplicated on purpose |
| **bcrypt cost 10 on a 512 MB Lambda** (was 128 MB) | Secure default; CPU scales with Lambda memory, so bcrypt and cold starts got faster: warm login 0.33–0.45 s on AWS (was ~1.2 s), other calls ≈ 70 ms | 4× the price per millisecond, partly offset by shorter runs – negligible at this traffic |
| **URL as the single source of truth for filters and views** (`useUrlFilters`, `ViewSwitch`) | Reload, Back/Forward, shared links and the dashboard's KPI links all show the same list; no second copy of the filters to keep in sync | A filter change replaces the history entry, so Back leaves the page rather than undoing one filter; invalid values in a link are ignored |
| **Client-side sorting of the rows already loaded** | Instant, no API change, works with every filter (lists are not paginated) | Desktop tables only (the mobile cards keep the API order); the sort order is not kept in the URL |
| **Urgency rules in whole UTC calendar days** | Same "today" as the API's overdue and health rules; the dashboard words dates against its snapshot date (`generated_at`), so its labels match the lists it was sent | Far from UTC a label changes at a local time other than midnight (e.g. 05:30 IST) |
| **What-if mirrors the backend rule** (only active projects count; above 100% is over-allocated) | A warning before saving, with no extra request; it never blocks, because the API allows over-allocation | The rule lives in both layers (like validation); it uses the totals loaded when the dialog opened |
| **Wake-up ping + retry once + 60 s CloudFront timeout** | Aurora Serverless v2 pauses at 0 ACU: the login page starts the resume while the user types; a connection the database dropped is replaced once *before* the request runs, so nothing runs twice; two 25 s connection attempts end inside CloudFront's 60 s | The first request after a pause still takes ~15–20 s (the hint explains it); a failure after the handler started is not retried |
| **bandit configuration**: tests excluded (`backend/.bandit`), application findings reviewed in place (`# nosec <id> # reason`) | GitHub runs `bandit -r ./backend`; plain `assert` and fake passwords are how tests work; each of the 19 annotations says why it is safe: 15 SQL f-strings that only insert constant column lists (values are bound parameters), 3 strings that are not secrets (the documented demo login, the local-only JWT placeholder, the token type "Bearer") and the seed script's `urlopen`, which only gets http(s) URLs | An annotation must be re-checked when its line changes; CI's Python 3.11 skips `app/core/validation.py` (see known gaps) |

### Changes made to the workshop scaffolding (found while setting up)
1. `bin/start-dev.sh` – `pip` on the VDI runs Python 3.14 while Lambda runs 3.13, so the hot-reload
   dependency install failed silently (`No module named 'psycopg'` → 500). It now installs wheels
   for the Lambda runtime and reports failures.
2. `bin/start-dev.sh` – the "is React already running?" check matched ports 30000–30003 used by
   JetBrains IDEs, so the frontend never started. It now matches port 3000 exactly.
3. `bin/proxy-server.js` – forwarded no `Authorization` header and answered CORS preflights with
   `Allow-Headers: *` (which browsers do not apply to `Authorization`), so authenticated calls failed locally.
4. `infra/cloudfront.tf` – removed the distribution-wide 404 → `/index.html` (200) rule.
5. `infra/main.tf`, `infra/locals.tf` – a random 256-bit `JWT_SECRET` is generated by Terraform and
   passed to the Lambda.
6. Locally, LocalStack Lambdas live in **us-east-1** (not `$AWS_REGION`), so log commands need
   `--region us-east-1`.
7. `frontend/package.json` – `eslint.config.js` imported `eslint-plugin-react-hooks` and
   `eslint-plugin-react-refresh`, which were not installed, so `npm run lint` failed; both were added.
8. `infra/cloudfront.tf` – the API origin's read timeout is 60 s (`origin_read_timeout`; the default
   is 30 s, and 60 s is the maximum without a quota increase), so a request that waits for Aurora to
   resume gets the API's answer instead of a CloudFront 504.
9. `infra/lambda.tf` – Lambda memory 128 → 512 MB (CPU scales with memory: faster bcrypt and cold
   starts). `infra/locals.tf` only has `terraform fmt` alignment changes.

---

## 4. Run it locally

Prerequisites: the workshop VDI set-up (`./bin/setup-participant.sh`, `./bin/setup-environment.sh -d`).

```bash
source ~/.bashrc
./bin/start-dev.sh          # PostgreSQL, LocalStack, Lambda (hot reload), proxy :3001, React :3000
```

Open http://localhost:3000 and log in with a demo account. Backend code changes are picked up
automatically (hot reload); `requirements.txt` changes need `./bin/start-dev.sh` again.

Optional – load a realistic demo portfolio (6 projects in every state, dependency chains, two
over-allocated people, one over-budget project) through the public API:

```bash
python3 backend/scripts/seed_demo_data.py                                   # local
python3 backend/scripts/seed_demo_data.py https://d1t3qq29ya5gnv.cloudfront.net   # AWS
```

The script accepts only an `http://` or `https://` base URL with a host name and no `?` or `#` part
(the site root, not an app link such as `…/#/projects`).

Useful commands:

```bash
# API through the dev proxy
curl -s -X POST http://localhost:3001/api/pm-service/auth/login \
     -H 'Content-Type: application/json' -d '{"email":"admin@acme.com","password":"Admin@123"}'

# Lambda logs (LocalStack runs functions in us-east-1)
AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 aws logs tail \
    /aws/lambda/coding-workshop-pm-service-$PARTICIPANT_ID --region us-east-1 --follow --format short
```

## 5. Tests

| Layer | Tool | Command |
|---|---|---|
| Backend unit + integration (real PostgreSQL) | pytest, pytest-cov | `cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest --cov=app` |
| Frontend components + API client | Vitest, React Testing Library | `cd frontend && npm test` · coverage: `npm run test:coverage` |
| End-to-end (critical user journeys) | Cypress 16 | `cd e2e && npm install && npm run e2e` (needs `./bin/start-dev.sh` running) |
| Load | Artillery 2 | `cd e2e && npx artillery run load/api-load.yml` (add `-t https://<cloudfront>` for AWS) |
| Lint / format | ruff (Python), ESLint (React) | `cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .` · `cd frontend && npm run lint` |
| Security (static analysis) | bandit 1.9.4, as in GitHub's *Security Check - Python* | `bandit -r ./backend` on a copy of the files git would commit – see [docs/TESTING.md › How to run](docs/TESTING.md#how-to-run) |

**Latest results (25 Nov 2026, after the UX upgrade):** backend 949 tests,
99 % coverage · frontend 676 tests, 98.8 % line
coverage · end-to-end 72 passed locally and 72 against the AWS deployment
(10 specs) · load test 3,420 requests 100 % OK, p95 257 ms (was 1,064 ms) · lint clean (ruff, ESLint) · bandit: no issues
(742 before) · axe-core: no serious or critical WCAG 2.1 AA violations.
Before the upgrade (24 Nov 2026): backend 843 tests · frontend 339 tests · end-to-end 49 tests in 9 specs.

Results, coverage and known gaps: **[docs/TESTING.md](docs/TESTING.md)**.

### Repository layout

```
backend/pm-service/     the Lambda (function.py + app/ package)       backend/tests/   pytest suites
backend/scripts/        demo data loader                              backend/ruff.toml lint rules
frontend/               React app (Vite, MUI)                          e2e/             Cypress + Artillery
infra/                  Terraform (workshop scaffolding + JWT secret)  bin/             workshop scripts
docs/API.md             API contract                                   docs/TESTING.md  test guide and results
```

## 6. Deploy to AWS

```bash
source ~/.bashrc
./bin/deploy-backend.sh     # Terraform: Lambda, Aurora PostgreSQL, S3, CloudFront, JWT secret
./bin/deploy-frontend.sh    # builds the React app with the CloudFront URL and uploads it to S3
```

Do not run `start-dev.sh` while a deploy is running (both use the Terraform folder in `infra/`).
Verify:

```bash
curl -s https://<cloudfront-domain>/api/pm-service/health      # {"status": "ok", ...}
curl -s https://<cloudfront-domain>/api/pm-service/health/db   # {..., "database": "ok"} – also wakes the database
```

The first request after a long idle period takes ~15–20 s (Aurora Serverless resuming from 0 ACU,
plus a Lambda cold start). The login page starts that wake-up as soon as it opens, a sign-in or data
load that takes over 3 s shows *"Waking up the database…"*, and CloudFront waits up to 60 s for the API. Measured on AWS after
the upgrade: a database wake-up answered in 16.8 s, warm login 0.33–0.45 s; other calls take ~70 ms.

## 7. Assumptions and known gaps

* Single currency (USD) and UTC business dates.
* Allocation % is a share of one person's full-time capacity; no calendar-based scheduling.
* No pagination (lists are small for a department-level tool); search and filters are server-side.
* No password-reset e-mails, audit log, real-time push or offline/PWA support (out of the stated scope).
* Refresh tokens are stateless (see trade-offs).
* An admin cannot demote, disable or delete themselves, but there is no "last active admin" lock:
  two admins acting on each other at the same moment could leave none.
* Dashboard deliverable counters and lists include deliverables of completed/cancelled projects
  (same as `GET /deliverables`); only the budget figures exclude cancelled projects.
* The dashboard's queries run in one READ COMMITTED transaction, so under concurrent writes its
  sections can reflect slightly different moments.
* Sorting is client-side on the desktop tables and not kept in the URL: a reload, Back or a shared
  link shows the API order.
* The dashboard words due and end dates against its snapshot date (the UTC date of `generated_at`),
  while the API takes "today" when the request starts: for a request straddling midnight UTC its
  labels could be one day off.
* The "Waking up the database" hint is time-based (a sign-in or data load over 3 s), so a request
  that is slow for another reason shows it too.
* GitHub's bandit job runs on Python 3.11, which cannot parse `app/core/validation.py` (PEP 695
  generics, Python 3.12+) and skips it; on Python 3.13 (the Lambda runtime) the file is scanned and
  passes.
* Below about 1264 px wide (with the side menu shown) the Projects table scrolls sideways inside its
  own box; the page itself never scrolls.
