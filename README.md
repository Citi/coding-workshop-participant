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

---

## 1. The business questions and where they are answered

| Question | Where in the app | API |
|---|---|---|
| What is the current status of each active project? | Dashboard → *Active projects*; Projects list (status, health, progress, budget) | `GET /dashboard`, `GET /projects?status=active` |
| Which projects are at risk of missing their deadlines? | Dashboard → *Projects at risk* (with reasons); Projects filter *Health* | `GET /projects?health=at_risk` |
| How are resources allocated across projects? | Project → *Team* tab; Resource details → *Project allocations* | `GET /allocations?project_id=…`, `GET /resources/{id}` |
| What are the key deliverables and their completion status? | Dashboard → *Key deliverables*; Deliverables → *Key deliverables only* | `GET /deliverables?is_key=true` |
| Which team members are over-allocated across multiple projects? | Dashboard → *Over-allocated team members*; Resources → *Over-allocated only* | `GET /resources?over_allocated=true` |
| What is the dependency chain between deliverables? | Deliverable details → *Depends on*, full *Dependency chain*, *Blocks* | `GET /deliverables/{id}` |
| How much budget has been consumed versus planned for each project? | Budget page; Dashboard → *Budget*; Project → *Budget* tab | `GET /projects`, `GET /expenses` |

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
app/main.py                  request pipeline: route → transaction → authenticate → authorize → handler
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
services/     apiClient (JWT, silent refresh, ApiError) + one module per API resource
context/      AuthProvider (session, permissions), NotificationProvider (toasts)
components/   AppLayout (responsive nav), DataTable (table ⇄ cards), FormDialog, ConfirmDialog,
              FilterBar, StatusChip, PercentBar, StatCard, route guards, state views
pages/        login, dashboard, projects, deliverables, resources, budget, users
hooks/ utils/ theme.js
```

### Request lifecycle
1. `parse_event` normalises the Lambda Function URL event (strips `/api/pm-service` when called
   through CloudFront).
2. The router resolves the route (404 / 405) and its declared permission.
3. One database transaction per request: the token is verified, the user is re-read from the
   database (role changes and deactivation apply immediately), the permission is checked (403),
   then the handler runs. Any error rolls the whole request back.
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
| **bcrypt cost 10 on a 128 MB Lambda** | Secure default | Warm login ≈ 1.2 s (other calls ≈ 70 ms); raising Lambda memory would speed it up |

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

**Latest results (24 Nov 2026):** backend 843 tests, 99 % coverage · frontend 339 tests, 97.7 %
line coverage · end-to-end 49/49 locally **and** against the AWS deployment · load test 3,420
requests, 100 % successful, median 38 ms · lint clean (ruff, ESLint) · axe-core: no serious or
critical WCAG 2.1 AA violations.

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
```

The first request after a long idle period takes ~15–20 s (Lambda cold start + Aurora Serverless
resuming from 0 ACU); later requests take ~70 ms.

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
