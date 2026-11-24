# Coding Workshop

The goal of this coding workshop is to enable and assess the hands-on skills
of participants through development of a practical technical solution that
solves a theoretical business problem.

## Getting Started

Navigate to [Coding Workshop - Main Guide](./docs/README.md) to get started.

## ACME Project Intelligence Platform

This repository contains a portfolio, capacity and delivery-risk tool for ACME
Inc. Every risk score comes with the database facts behind it and a
recommended action. It answers seven questions from live data:

| Question | Where |
|---|---|
| What is the status of each active project? | Dashboard, Projects |
| Which projects are at risk of missing deadlines, and why? | Risk, project Risk tab |
| How are resources allocated across projects? | Capacity |
| What are the key deliverables and their completion status? | Deliverables, project Deliverables tab |
| Which team members are over-allocated (>100%) across overlapping timelines? | Capacity |
| What is the dependency chain between deliverables, and what is affected when an upstream item is blocked or late? | project Dependencies tab |
| How much budget is consumed versus planned, per project and per department? | Budget, Dashboard |

### Architecture

```text
AWS:    browser ─► CloudFront ─┬─► S3: the React app
                               └─► /api/portfolio* ─► Lambda function URL ─► Aurora PostgreSQL
Local:  browser ─┬─► Vite :3000: the React app
                 └─► proxy :3001 ─► LocalStack Lambda (hot reload) ─► PostgreSQL :5432
```

- **One Lambda, `backend/portfolio/`** (Python 3.13, 512 MB). `function.py`
  passes HTTP events to a FastAPI app through Mangum (base path
  `/api/portfolio`), and direct-invoke events such as `{"task": "migrate"}` to
  `app/tasks.py` (`migrate`, `seed`, `reset`).
  - `app/api/` routers call `app/services/`, which run each change in one
    transaction and write one audit row. `app/db/` holds the SQLAlchemy 2
    models, `schema.sql` and the seed data.
  - `app/security.py`: bcrypt password hashes, HS256 JWTs (30-minute access
    token, 8-hour refresh token) and role checks.
  - `app/errors.py`: every error has the shape
    `{"error": ..., "message": ..., "details": [...]}`; invalid requests are
    400, not FastAPI's 422.
- **Analytics are computed on read.** Each request loads one snapshot of the
  portfolio (five SELECTs) and runs the pure engines in `app/engines/`:
  - **dependency:** cycle check, topological levels, impacted downstream items
  - **capacity:** load per person over time, over-allocation windows with the
    allocations behind them, bottleneck flag
  - **budget:** planned, spent, remaining, budget used against completion
  - **risk:** six factors adding up to 0-100: schedule (max 20), blocked
    items (15), blast radius (20), resource strain (15), budget (20) and
    deadline (10). Below 25 is LOW, below 50 MEDIUM, below 75 HIGH, otherwise
    CRITICAL. Each factor lists its evidence, and the risk detail adds
    recommended actions.
- **Integrity:** `audit_logs` is append-only (a trigger rejects UPDATE and
  DELETE). Adding a dependency takes an advisory lock and rejects any edge that
  would close a loop, naming the loop.
- **Frontend, `frontend/`** (React 19, Vite, MUI, `@mui/x-charts`):
  - `src/services/apiClient.js` adds the token, refreshes it once on a 401,
    treats an HTML page (CloudFront's app fallback) as a 404, and retries a
    GET once on a network error or 5xx.
  - `src/auth/permissions.js` mirrors the server's role rules to hide actions
    a role cannot perform.
  - `src/pages/`: Dashboard, Projects, Project detail (Overview, Deliverables,
    Dependencies, Budget and Risk tabs), Deliverables, Capacity, Budget, Risk,
    Audit Log and Users.

### Roles

The server enforces these; the UI only hides what a role cannot do.

| Role | Shown in the UI as | Can |
|---|---|---|
| ADMIN | Admin | do everything, including managing users and departments |
| PM | Manager | create, edit and delete projects, deliverables, allocations and budget entries; add and remove dependencies; read the audit log |
| LEAD | Contributor | create and edit deliverables; add dependencies; read everything except the audit log |
| VIEWER | Viewer | read everything except the audit log |

Public registration always creates a VIEWER. Only an ADMIN changes roles.

### Run it locally

```sh
./bin/start-dev.sh                               # PostgreSQL, LocalStack Lambda, proxy :3001, Vite :3000
./bin/db-task.sh local migrate
read -rs SEED_PASSWORD && export SEED_PASSWORD   # demo password, 8-72 characters, typed and never stored
./bin/db-task.sh local seed                      # or: reset, which deletes all data and seeds again
```

Then open <http://localhost:3000>.

### Deploy to AWS

```sh
./bin/deploy-backend.sh                          # the first run creates Aurora and CloudFront, which is slow
./bin/db-task.sh aws migrate
./bin/db-task.sh aws seed                        # reads SEED_PASSWORD from the environment
./bin/deploy-frontend.sh                         # prints the CloudFront URL
BASE_URL=https://<distribution>.cloudfront.net/api/portfolio python3 tests/e2e/smoke_test.py
```

### Tests

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r backend/portfolio/requirements.txt -r requirements-dev.txt
.venv/bin/pytest --cov=app --cov-report=term-missing     # needs the local PostgreSQL; uses schema pip_test
(cd frontend && npm test)                                # Vitest with coverage
BASE_URL=http://localhost:3001/api/portfolio .venv/bin/python tests/e2e/smoke_test.py   # needs SEED_PASSWORD
```

Results recorded on 2026-11-25:

| Suite | Result |
|---|---|
| Backend, `pytest --cov=app` | 1184 passed. Line coverage 99% (3,112 of 3,117 statements); engines, routers, schemas and error handling at 100% |
| Frontend, `npm test` | 36 files, 574 tests passed. Statements 95.67%, branches 87.00%, functions 95.54%, lines 95.69% |
| End-to-end smoke, local | 8 of 8 steps pass |
| End-to-end smoke, AWS (CloudFront URL) | 8 of 8 steps pass. Step 8 gets the app page instead of a JSON 404 (CloudFront's fallback), which the spec accepts |

`npm run lint`, `npm run build`, `npm audit --audit-level=high` (0
vulnerabilities), `bandit -r ./backend` (0 issues) and
`terraform -chdir=infra validate` all pass.

### Demo accounts

Every seeded account uses the password given to `seed` or `reset`. The
password is not stored in the repository.

| Email | Name | Role |
|---|---|---|
| `admin@acme.example` | Asha Rao | ADMIN |
| `pm@acme.example` | Vikram Shah | PM |
| `lead@acme.example` | Rohan Das | LEAD |
| `viewer@acme.example` | Neha Kapoor | VIEWER |

Six more seeded people (Priya Nair, Arjun Mehta and four project managers)
hold allocations and run projects.

### Five-minute demo

1. Sign in as `pm@acme.example`. The dashboard shows Project Alpha as the top
   risk: 78, CRITICAL.
2. Open Projects, then Project Alpha. The Overview tab shows that 75.0% of the
   budget is spent while the work is 35.0% complete.
3. Open the Risk tab: six factor bars, the evidence for each, the three
   impacted deliverables (Payments Service Integration, Mobile Client
   Integration, End-to-End Testing) and the recommended actions.
4. Open the Dependencies tab and add End-to-End Testing → API Schema. It is
   rejected, and the message names the loop: API Schema → Payments Service
   Integration → End-to-End Testing → API Schema.
5. Open Capacity. Priya Nair is at 120% from two days before the seed date to
   twelve days after it. Arjun Mehta peaks at 60% and is not flagged.
6. Sign in as `viewer@acme.example`. No edit actions are shown, and the API
   answers 403 to any write.

### Changes from the build spec, and why

- `bin/start-dev.sh` installs the Lambda's packages with
  `python3.13 -m pip`. Plain `pip` on the workshop machine is Python 3.14, but
  the Lambda runtime is 3.13. This is a change beyond the files listed in the
  spec.
- `bin/proxy-server.js`: the 404 for an unknown endpoint also lists the
  available endpoints.
- `bin/db-task.sh` builds the Lambda's name the way Terraform does,
  `<project>-portfolio-<app code>`, and only invokes it: the workshop's AWS
  role is not allowed to list functions.
- `infra/cloudfront.tf`: the S3 bucket policy also lets this CloudFront
  distribution list the bucket (`s3:ListBucket`). Without it, S3 answers 403
  for a path that is not a file, so refreshing or opening any page other than
  `/` showed S3's AccessDenied page; CloudFront sends only 404s to
  `index.html`. A CloudFront rule for 403 would also have replaced the API's
  real 403 answers. This is a fourth infrastructure change; the spec allows
  three.
- Input that PostgreSQL cannot handle is a 400, not a 500: control characters
  such as NUL in text and search fields, offsets beyond the BIGINT range, and
  any other database data error.
- `as_of`, `from` and `to` must be written exactly `YYYY-MM-DD`. Otherwise
  `as_of=0` would be read as 1970-01-01.
- `PUT` changes only the fields sent.
- A token issued before its user record was created is rejected, so a token
  from before a `reset` cannot act as whoever gets the same id.
- A 401 carries `WWW-Authenticate: Bearer`. `/health` answers 503 with the
  standard error fields when the database is down.
- Local PostgreSQL 18 reports a blocked `ON DELETE RESTRICT` as SQLSTATE
  23001; it is mapped to 409 like the other conflicts.
- Frontend: an HTML page with a 5xx status (a CloudFront error page) stays a
  server error, so GETs are retried, instead of becoming a 404. Every other
  HTML response is a 404, as the spec says.
- Frontend: `npm run build` uses `frontend/vite.build.config.js`, which splits
  the bundle into chunks below Vite's 500 kB warning. `vite.config.js` is
  unchanged, so the dev server is not affected.

### Known limitations

- A PM can manage every project; per-project ownership is not enforced.
- Tokens are stateless: there is no server-side revocation and no login rate
  limiting.
- The JWT secret and the database password live in Terraform state and Lambda
  environment variables. In production they would move to a secrets manager.
- Risk is recomputed on each request from the whole portfolio. That suits
  hundreds of projects; beyond that, add stored snapshots and recursive SQL.
- "Today" is the UTC date.
- The first request after about five idle minutes waits for Aurora to resume.
- In AWS, CloudFront may return the app's page for an API 404; the client
  treats it as a 404.
- Single currency.
- Locally, the proxy answers CORS preflight requests with
  `Access-Control-Allow-Headers: *`. The Fetch standard says this wildcard
  does not cover `Authorization`. Firefox accepts it (tested); Chrome was not
  tested, because the workshop machine has no Chrome. AWS serves the app and
  the API from one origin, so it is not affected.

## Coding Workshop Example

Coding workshop organizer(s) will provide instructions to follow by email. Here
below is a real example of requirements and expectations for participant(s):

### Requirements: Business Problem

Our company ACME Inc. is going through a massive organizational transformation
to become a more data-driven organization. Information about teams structure
and performance is currently scattered across multiple systems, making it
difficult to get a comprehensive view of team dynamics and achievements.

We are struggling to answer simple questions like:

* Who are the members of each team?
* Where are the teams located?
* What are the key achievements of each team on a monthly basis?
* How many teams have team leader not co-located with team members?
* How many teams have team leader as a non-direct staff?
* How many teams have non-direct staff to employees ratio above 20%?
* How many teams are reporting to an organization leader?

### Requirements: Technical Solution

As part of this transformation, we are looking to build a centralized team
management tool that will allow us to track team members, team locations,
monthly team achievements, as well as individual-level and team-level metadata.
Initial focus is to provide a self-service capability without any integrations
with other tools such as Employee Directory, Project Tracking, or Performance
Management.

The technical solution involves developing a stand-alone web application using
modern technologies. The application will have the following features:

* User authentication and authorization
* Role-based access control
* CRUD operations for individuals, teams, achievements and metadata
* Search and filter functionality
* Responsive design for mobile and desktop usage

### Requirements: Technology Stack

The following technologies are required to build the application:

* Frontend: HTML, CSS, React.js with React Responsive and Material UI Components
* Backend: Python
* Database: PostgreSQL

The following technologies are good to know, as they are used to manage and
deploy code:

* Version Control: Git, GitHub
* Infrastructure: Terraform
* Deployment Mode: Shell Scripts
* Deployment Target: AWS Serverless (e.g. S3, CloudFront, Lambda, RDS)

### Expectations: Value-Based Outcomes

By the end of the workshop, participants will have developed a functional
web application that meets the requirements outlined above. The application
will be deployed to a cloud environment and accessible via a web browser.
Participants will also gain hands-on experience with modern web development
technologies and best practices.

## Contributing

See the [CONTRIBUTING](./CONTRIBUTING.md) resource for more details.

## License

This library is licensed under the MIT-0 License.
See the [LICENSE](./LICENSE) resource for more details.

## Roadmap

See the
[open issues](https://github.com/citi/coding-workshop-participant/issues)
for a list of proposed roadmap features (and known issues).

## Security

See the
[Security Issue Notifications](./CONTRIBUTING.md#security-issue-notifications)
resource for more details.

## Authors

The following people have contributed to this workshop:

* Colin Heilman - [@heilmancs](https://github.com/heilmancs)
* Eugene Istrati - [@eistrati](https://github.com/eistrati)
* Isaiah Cornelius Smith - [@corneliusmith](https://github.com/corneliusmith)
* Juan Arevalo - [@jparevalo27](https://github.com/jparevalo27)
* Michael Annucci - [@michael-annucci](https://github.com/michael-annucci)

## Feedback

We'd love to hear your feedback! Please:

* ⭐ Star the repository if you find it helpful
* 🐛 Report issues on GitHub
* 💡 Suggest improvements
* 📝 Share your experience
