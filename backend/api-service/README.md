# api-service — ACME Facility Desk API

FastAPI + SQLAlchemy 2.0 (psycopg 3) backend, deployed as a single AWS Lambda
via [Mangum](https://mangum.fastapiexpert.com/). The database schema lives in
[`backend/db/schema.sql`](../db/schema.sql); the ORM models map onto it.

## Structure

```
api-service/
├── function.py            # Lambda entry point (Mangum wraps the FastAPI app)
├── requirements.txt
└── app/
    ├── main.py            # FastAPI app, error handlers, path-prefix middleware
    ├── core/
    │   ├── config.py      # settings from env (POSTGRES_*, JWT_SECRET, CORS_ORIGINS)
    │   └── security.py    # bcrypt password hashing, JWT tokens
    ├── db/session.py      # SQLAlchemy engine, SessionLocal, Base, get_db()
    ├── models/            # ORM models: User, Building/Floor/Seat, EngineerProfile,
    │                      #   Incident, IncidentNote, IncidentHistory + enums
    ├── schemas/           # Pydantic request/response models
    ├── services/
    │   ├── permissions.py # role-based rules (single source of truth)
    │   └── incidents.py   # query helpers, response builders
    └── api/
        ├── deps.py        # get_current_user, require_roles(), AdminUser
        └── routes/        # auth, incidents, dashboard, lookups
```

## Endpoints

All routes except `/auth/register`, `/auth/login` and `/health` need
`Authorization: Bearer <token>`. Errors are returned as `{"message": "..."}`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Employee sign-up (`@acme.inc` only) |
| POST | `/auth/login` | public | Returns `{token, user}` (8h token) |
| GET | `/auth/me` | any | Current user |
| GET | `/incidents` | any | List (scoped by role); filters `status`, `priority`, `escalated`, `unassigned`, `q`, `limit`, `offset` |
| POST | `/incidents` | any | Report an incident |
| GET | `/incidents/{id}` | can view | Detail + notes + history + `permissions` |
| PATCH | `/incidents/{id}` | reporter (while open) / admin | Edit details; admin also `priority`, `is_escalated: false` |
| DELETE | `/incidents/{id}` | admin | Delete |
| POST | `/incidents/{id}/status` | role-dependent | Change status (+ optional comment) |
| POST | `/incidents/{id}/assign` | admin | Assign / reassign engineer |
| POST | `/incidents/{id}/escalate` | reporter | Escalate, optionally request higher priority |
| POST | `/incidents/{id}/notes` | can view, not closed | Add note (`is_internal` for engineers/admins) |
| GET | `/dashboard` | any | Role-specific summary |
| GET | `/facilities` | any | Buildings → floors → seats |
| GET | `/engineers` | admin | Engineers with workload |

### Role rules (see `app/services/permissions.py`)

- **Employee** sees own incidents; edits while `open`; escalates; cancels before
  work starts; closes (confirms) or reopens a `resolved` incident.
- **Engineer** sees assigned incidents; `assigned → in_progress ⇄ on_hold → resolved`
  (and can reopen `resolved`); can add internal notes.
- **Facility Admin** sees and manages everything.

Status, assignment, priority and escalation changes are written to
`incident_history` by a database trigger; the API sets `app.user_id` per request
so the acting user is recorded.

## Running

Through the workshop tooling (Lambda in LocalStack, behind the dev proxy):

```sh
./bin/start-dev.sh
curl http://localhost:3001/api/api-service/health
```

Directly with uvicorn, for interactive docs at http://localhost:8000/docs:

```sh
cd backend/api-service
python3.13 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt uvicorn
CORS_ORIGINS=http://localhost:3000 uvicorn app.main:app --reload --port 8000
```
