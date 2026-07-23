# ACME CPM — Centralized Project Management & Tracking Platform

A full-stack web application that centralizes project tracking, deliverable
management, resource allocation, and budget monitoring for ACME Inc. — giving
project managers and stakeholders real-time visibility into project health.

**Live URL:** https://d16eh4xiirfv9z.cloudfront.net

---

## Table of Contents

- [Business Problem](#business-problem)
- [Solution Overview](#solution-overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Role-Based Access Control](#role-based-access-control)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [AWS Resources](#aws-resources)

---

## Business Problem

ACME Inc. operates multiple projects across different departments but lacks
visibility into project progress, resource allocation, and delivery timelines.
Project data is fragmented, leading to missed deadlines, resource conflicts, and
unreliable forecasting.

The platform answers the questions ACME could not:

- What is the current status of each active project?
- Which projects are at risk of missing their deadlines?
- How are resources allocated across projects?
- What are the key deliverables and their completion status?
- Which team members are over-allocated across multiple projects?
- What is the dependency chain between deliverables?
- How much budget has been consumed versus planned for each project?

---

## Solution Overview

A centralized, self-service platform where project managers and team leads manage
projects, track deliverables, allocate resources, and monitor budgets — with no
integration to external systems. Two SQL views answer the hardest questions
directly: `v_project_health` (deadline/budget risk) and `v_resource_utilization`
(over-allocation).

---

## Features

### Authentication & Authorization
- Email + password login with **JWT** access/refresh tokens (custom, via PyJWT — no third-party auth service)
- Passwords hashed with **bcrypt**; only the hash is ever stored
- Five roles, **derived from the email address** at registration (see [RBAC](#role-based-access-control))
- Access token auto-attached to every request; a failed refresh (401) signs the user out cleanly
- Route guards (`ProtectedRoute`) and control-level gates (`RoleGate`) on the frontend; every API route re-checks the token and role

### Project Management
- Full CRUD — create, view, edit, delete
- Fields: name, description, department, status, start/end dates, planned budget, owner (project manager)
- Status workflow: `planning → active → on_hold → completed / cancelled`
- Per-project summary (average completion, budget consumed, deliverable rollup)
- Search and filter by name, status, department

### Deliverables & Dependency Chains
- CRUD per project with status workflow and progress tracking
- Status update endpoint separate from full edit
- **Dependency graph** — declare `depends-on` links between deliverables and traverse the chain (`/deliverables/{id}/chain`, `/projects/{id}/graph`)

### Resource Allocation
- People (resources) with a capacity percentage
- **Allocations** commit a % of a person's capacity to a project over a date range
- **Utilization / over-allocation** report straight from `v_resource_utilization` — flags anyone allocated beyond 100%

### Budget Tracking
- Planned budget per project vs. **consumed** (sum of expenses)
- Expenses CRUD; variance surfaced on the dashboard and per project

### Dashboard & Reporting
Powered by the `reports` service:

| View | Endpoint | What it shows |
|---|---|---|
| Summary tiles | `GET /reports/summary` | Active/at-risk projects, overdue deliverables, over-allocated people, budget planned/consumed/variance |
| At-risk projects | `GET /reports/at-risk` | Projects flagged by `v_project_health` (overdue, over budget, low completion) |
| Resource utilization | `GET /reports/utilization` | Per-person load and over-allocation |
| Allocations | `GET /reports/allocations` | Allocation breakdown |
| Dependencies | `GET /reports/dependencies` | Cross-deliverable dependency data |
| Budget | `GET /reports/budget` | Planned vs consumed per project |

### UX
- **Responsive** layout (desktop table ↔ mobile card views via `react-responsive`)
- Modern **glassy UI with motion** — frosted surfaces, an indigo/teal brand, Inter type, and `framer-motion` page/list transitions
- Real-time client-side **search and filter** on every collection page
- Accessible: keyboard focus rings preserved, colour never the sole signal (status labels always present)

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 7 | Build tool and dev server |
| Material UI | 9 | Component library |
| @mui/icons-material | 9 | Icon set |
| @emotion/react, @emotion/styled | 11 | CSS-in-JS (MUI styling engine) |
| framer-motion | 12 | Page/list transitions and hover motion |
| Axios | 1.18 | HTTP client (auto JWT header, refresh interceptor) |
| React Router | 7 | Client-side routing |
| react-responsive | 10 | Breakpoint-driven layout switches |

### Backend
| Technology | Purpose |
|---|---|
| Python | Backend language (AWS Lambda runtime) |
| psycopg2 | PostgreSQL driver (vendored per service) |
| PyJWT | Stateless JWT authentication (custom) |
| bcrypt | Password hashing |
| Shared `Router` | Minimal regex router shared across all six services |

### Database
| Technology | Purpose |
|---|---|
| PostgreSQL | Relational database |
| AWS Aurora (PostgreSQL-compatible) | Managed cloud database (RDS) |
| pgcrypto | `gen_random_uuid()` for UUID primary keys |

### Infrastructure
| Service | Purpose |
|---|---|
| AWS Lambda | Six serverless Python services (ap-south-1) |
| Lambda Function URLs | Per-service HTTPS endpoints |
| AWS CloudFront | CDN, HTTPS, `/api/{service}*` routing, SPA rewrite function |
| AWS S3 | Static hosting for the built React app |
| AWS SQS | Dead-letter queue per Lambda |
| AWS RDS (Aurora PostgreSQL) | Database |
| Terraform | Infrastructure as Code |
| LocalStack | Local AWS emulation for development |

---

## Architecture

```
Browser
  │ HTTPS
  ▼
CloudFront (d16eh4xiirfv9z.cloudfront.net)
  │
  ├── /api/auth*         ─► Lambda: coding-workshop-auth-5745b97d
  ├── /api/projects*     ─► Lambda: coding-workshop-projects-5745b97d
  ├── /api/deliverables* ─► Lambda: coding-workshop-deliverables-5745b97d
  ├── /api/resources*    ─► Lambda: coding-workshop-resources-5745b97d
  ├── /api/budgets*      ─► Lambda: coding-workshop-budgets-5745b97d
  ├── /api/reports*      ─► Lambda: coding-workshop-reports-5745b97d
  │        │
  │        ▼   each service: function.py (Router) → routes.py → service.py
  │        ▼   shared: _shared/{auth,db,router,responses,validation}.py
  │        ▼   psycopg2
  │        ▼   Aurora PostgreSQL (RDS)
  │
  └── /*  ─► S3 (React static files); a CloudFront viewer-request function
            rewrites extensionless client routes (/login, /projects) to
            /index.html so deep links and refreshes work.
```

### Request flow
1. React signs in → `POST /api/auth/login` → CloudFront → auth Lambda
2. Lambda verifies the bcrypt hash, returns a JWT access + refresh token
3. Tokens stored client-side; the access token is attached as `Authorization: Bearer <token>` on every request
4. Each Lambda validates the token and the role before running the handler

> **API path convention (important):** the frontend axios client sets
> `baseURL = {origin}/api/{service}`, and each service method adds the
> resource path again — so the actual wire path is
> `/api/{service}/{service}/{id}` (the service name appears twice). The backend
> `Router` strips exactly one `/api/{service}` prefix, so routes are declared
> **with** the service prefix (e.g. `GET /projects/{id}`). Don't "simplify" the
> routes to a single prefix — it breaks every by-id call.

### Local development flow
```
React (Vite, localhost:3000)
  │ /api/{service}/... requests
  ▼
bin/proxy-server.js (localhost:3001)   ← strips /api/{service}, adds CORS
  │
  ▼
Lambda Function URLs on LocalStack
  │
  ▼
function.py → routes → psycopg2 → PostgreSQL (localhost:5432)
```

---

## Project Structure

```
coding-workshop-participant/
├── backend/
│   ├── auth/            # users, JWT, RBAC, register/login/refresh/me
│   ├── projects/        # CRUD /projects + summary
│   ├── deliverables/    # CRUD /deliverables + dependency chains / graph
│   ├── resources/       # people, allocations, utilization
│   ├── budgets/         # budgets + expenses
│   ├── reports/         # dashboard summary + analytics
│   │   └── (each service) function.py  # Lambda entry + Router registration
│   │                      routes.py     # request handlers
│   │                      service.py    # SQL / business logic
│   │                      models.py     # validation specs
│   │                      test_*.py     # service tests
│   ├── _shared/         # auth.py, db.py, router.py, responses.py, validation.py
│   ├── schema.sql       # tables, constraints, views
│   ├── seed.sql         # demo data (shared password: workshop-pass-2026)
│   ├── init-db.sh       # apply schema + seed to the local database
│   └── sync-shared.sh   # copy _shared into each service before packaging
│
├── frontend/
│   └── src/
│       ├── pages/        # Login, Dashboard, Projects, ProjectDetails,
│       │                 #   Deliverables, Resources, Budget, Reports, Users
│       ├── components/   # common/ (Layout, DataTable, PageHeader, StatusChip…),
│       │                 #   auth/, dashboard/, projects/, resources/, budget/,
│       │                 #   deliverables/
│       ├── services/     # api.js (axios + JWT + refresh) + one client per service
│       ├── context/      # AuthContext, ProjectContext
│       ├── hooks/        # useAuth, useApi
│       ├── utils/        # constants (roles, actions), permissions, formatters, motion
│       └── styles/       # theme.js (single source of truth for colour/type/elevation)
│
├── infra/               # Terraform: lambda.tf, s3.tf, cloudfront.tf, rds.tf, …
└── bin/                 # deploy-backend.sh, deploy-frontend.sh, start-dev.sh, proxy-server.js
```

---

## Database Schema

```sql
roles                     -- lookup: Admin / Project Manager / Team Leader / Employee / Stakeholder
users                     -- login accounts (email, bcrypt hash, role, is_active)
resources                 -- people being tracked (capacity_pct, optional link to a user)
projects                  -- name, department, status, dates, planned_budget, owner
deliverables              -- per-project work items (status, progress, due date)
deliverable_dependencies  -- depends-on edges between deliverables
allocations               -- % of a resource's capacity committed to a project over a date range
expenses                  -- spend recorded against a project (drives budget "consumed")

-- Views (answer the two hard questions directly)
v_resource_utilization    -- per-person load and over-allocation
v_project_health          -- deadline / budget / completion risk per project
```

All primary keys are UUIDs from `pgcrypto`'s `gen_random_uuid()`. Status columns
are guarded by `CHECK` constraints; the frontend stores the raw value and renders
a label.

---

## API Reference

All endpoints below are relative to a service and require a `Bearer` token
unless noted. (On the wire the client prepends `/api/{service}` — see the path
convention above.)

### Authentication — `auth`
| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/register` | No | First user becomes Admin; role otherwise derived from email |
| POST | `/login` | No | Returns access + refresh tokens |
| POST | `/refresh` | Refresh token | Rotates the access token |
| POST | `/logout` | Bearer | |
| GET | `/me` | Bearer | Current user |
| GET/POST | `/users`, `/users/{id}` | Admin | User management |
| PATCH | `/users/{id}/role` | Admin | Change a user's role |

### Projects — `projects`
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/projects` | Bearer |
| POST | `/projects` | Project Manager, Admin |
| GET | `/projects/{id}` | Bearer |
| GET | `/projects/{id}/summary` | Bearer |
| PUT | `/projects/{id}` | edit-projects |
| DELETE | `/projects/{id}` | delete-projects |

### Deliverables — `deliverables`
| Method | Endpoint |
|---|---|
| GET / POST | `/deliverables` |
| GET / PUT / DELETE | `/deliverables/{id}` |
| PATCH | `/deliverables/{id}/status` |
| GET | `/deliverables/{id}/chain` |
| POST / DELETE | `/deliverables/{id}/dependencies[/{dependsOnId}]` |
| GET | `/projects/{projectId}/graph` |

### Resources — `resources`
| Method | Endpoint |
|---|---|
| GET / POST | `/resources` |
| GET / PUT / DELETE | `/resources/{id}` |
| GET | `/resources/utilization` |
| GET | `/resources/{id}/allocations` |
| GET / POST | `/allocations` |
| PUT / DELETE | `/allocations/{id}` |

### Budgets — `budgets`
| Method | Endpoint |
|---|---|
| GET | `/budgets` |
| GET / PUT | `/budgets/{projectId}` |
| GET / POST | `/expenses` |
| GET / PUT / DELETE | `/expenses/{id}` |

### Reports — `reports`
| Method | Endpoint |
|---|---|
| GET | `/reports/summary` |
| GET | `/reports/at-risk` |
| GET | `/reports/utilization` |
| GET | `/reports/allocations` |
| GET | `/reports/dependencies` |
| GET | `/reports/budget` |

---

## Role-Based Access Control

Roles are assigned from the email address at registration (the first account is
always Admin):

| Email pattern | Role |
|---|---|
| `name.admin@acme.com` | Admin |
| `name.mr@acme.com` | Project Manager |
| `name.tl@acme.com` | Team Leader |
| `name@acme.com` | Employee |
| anything else | Stakeholder |

| Capability | Admin | Project Manager | Team Leader | Employee | Stakeholder |
|---|:--:|:--:|:--:|:--:|:--:|
| View dashboard / projects | ✅ | ✅ | ✅ | own / assigned | ✅ (read-only) |
| Create / delete projects | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit projects | ✅ | ✅ | assigned | ❌ | ❌ |
| Manage deliverables | ✅ | ✅ | ✅ | update assigned | ❌ |
| Assign employees / allocate | ✅ | ✅ | team | ❌ | ❌ |
| View / manage budgets | ✅ | ✅ | view | ❌ | view |
| Generate reports | ✅ | ✅ | team | ❌ | ✅ |
| Manage users | ✅ | ❌ | ❌ | ❌ | ❌ |

Scopes (`assigned`, `team`, `own`) mean "allowed, but only over certain rows."
Enforced on both the frontend (control visibility) and the backend (every route
validates the JWT role — the frontend checks are a usability affordance, never a
security boundary).

---

## Local Development

### Prerequisites
- Python 3
- Node.js 18+
- PostgreSQL running on `localhost:5432`
- Docker + LocalStack (for the Lambda emulation the proxy forwards to)

### Database
```bash
# Apply schema + seed to the local database
./backend/init-db.sh
```
> Schema changes require re-running `init-db.sh`; the seed does not backfill
> rows that already exist.

### Run the stack
```bash
./bin/start-dev.sh
# Frontend:  http://localhost:3000   (Vite may pick 3001/3002 if taken)
# Proxy:     http://localhost:3001   (CORS proxy → LocalStack Lambdas)
```

### Seeded login
All demo accounts share the password **`workshop-pass-2026`**, e.g.:
```
ada.admin@acme.com   (Admin)
ray.mr@acme.com      (Project Manager)
omar.tl@acme.com     (Team Leader)
sam@acme.com         (Employee)
board@gmail.com      (Stakeholder)
```

---

## Deployment

### Backend (Lambda + infrastructure)
```bash
./bin/deploy-backend.sh          # Terraform: packages & deploys the six Lambdas, RDS, CloudFront
```

### Frontend (S3 + CloudFront)
```bash
./bin/deploy-frontend.sh aws     # builds with the cloud API URL, syncs to S3, invalidates CloudFront
```

> **Region note:** the Terraform state bucket is in `ap-south-1`, but the deploy
> scripts default `AWS_REGION` to `us-east-1`. If `deploy-frontend.sh` can't read
> the bucket name from Terraform outputs, run it (or the AWS CLI fallback) with
> `AWS_REGION=ap-south-1` exported. The manual fallback is:
> ```bash
> cd frontend && VITE_API_URL="https://d16eh4xiirfv9z.cloudfront.net" npm run build
> aws s3 sync dist/ s3://coding-workshop-website-5745b97d/ --delete --region ap-south-1
> aws cloudfront create-invalidation --distribution-id E814RM2PLV8F5 --paths "/*"
> ```
> `index.html` is uploaded with `Cache-Control: no-cache` so new deploys are
> picked up without a hard refresh; hashed JS/CSS can cache indefinitely.

---

## Environment Variables

Injected automatically per environment (see `backend/README.md`).

### Backend (Lambda / local)
| Variable | Local | Cloud |
|---|---|---|
| `IS_LOCAL` | `true` | `false` |
| `POSTGRES_HOST` | `localhost` | Aurora endpoint |
| `POSTGRES_PORT` | `5432` | `5432` |
| `POSTGRES_NAME` | *(local db)* | Aurora database |
| `POSTGRES_USER` | *(local user)* | Aurora username |
| `POSTGRES_PASS` | *(local pass)* | Aurora password |

### Frontend
| Variable | Value |
|---|---|
| `VITE_API_URL` | CloudFront URL in production; empty locally (requests go through the proxy) |

---

## AWS Resources

| Resource | Name |
|---|---|
| Lambda functions | `coding-workshop-{auth,projects,deliverables,resources,budgets,reports}-5745b97d` |
| S3 bucket (website) | `coding-workshop-website-5745b97d` |
| CloudFront distribution | `E814RM2PLV8F5` |
| CloudFront domain | `d16eh4xiirfv9z.cloudfront.net` |
| Terraform state bucket | `coding-workshop-tfstate-5745b97d` |
| AWS Region | `ap-south-1` (Mumbai) |
