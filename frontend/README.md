# Facilities Helpdesk: Frontend

React 19 + Vite, with Material UI, React Router and react-responsive. This is the employee app: register, sign in, see a dashboard of your tickets, report an issue, and follow it through notes and escalation. The API and database setup are in the [root README](../README.md).

## Pages

| Route | Page | Who |
|---|---|---|
| `/register` | Create an account (`@acme.inc` emails only) | Guests |
| `/login` | Sign in | Guests |
| `/dashboard` | Greeting, the most recent active ticket with its progress and latest message, and a searchable list with status chips and counts | Signed in |
| `/tickets/new` | Report an issue: what, how urgent, where (Building → Floor → Seat) | Signed in |
| `/tickets/:id` | Workflow, details, notes and escalation for one of your tickets | Signed in |

Employees see a ticket's status and impact (who is affected). The internal priority is never shown or sent to them. Tickets have no urgency or short description.

## Commands

Run from `frontend/`:

```sh
npm install
npm run dev        # http://localhost:3000, proxies /api to the backend on :8000
npm test           # unit and component tests (Vitest), API mocked
npm run coverage   # the same, with a coverage report
npm run e2e        # end-to-end tests in Chrome against a real backend and database
npm run lint
npm run build      # production build in dist/
```

`npm run e2e` needs local Postgres and the backend venv, set up as in the root README, plus a one-time `codingworkshop_e2e` database. See "End-to-end tests" in the root README.

## Structure

```
frontend/
├── e2e/                  # Playwright end-to-end tests (real browser, API, database)
├── src/
│   ├── pages/            # One component per route
│   ├── components/       # Shared UI; dashboard/ and tickets/ hold feature pieces
│   ├── services/         # API calls. apiClient.js is the only place that uses fetch
│   ├── auth/             # AuthProvider + useAuth: the signed-in user; token in services/session.js
│   ├── hooks/            # useApiData, useMyTickets, useDebouncedValue, useIsMobile
│   ├── utils/            # Validation, labels and formatting, workflow and stats helpers
│   ├── test/             # Test setup, fixtures, renderWithProviders
│   └── theme.js          # Citi light blue #056DAE, navy #003B70, white
├── playwright.config.js
└── vite.config.js        # Dev proxy, build chunks, Vitest settings
```

Unit and component tests sit next to the code they cover, e.g. `apiClient.test.js` beside `apiClient.js`.

## Configuration

`VITE_API_URL` is optional (see `.env.sample`). Leave it empty and the app calls `/api/core/...` on its own origin: the Vite proxy locally, CloudFront in AWS.

## Deployment

```sh
./bin/deploy-frontend.sh      # from the repo root: build, upload to S3, invalidate CloudFront
./bin/cleanup-environment.sh  # removes ALL deployed resources; cannot be undone
```

Both change real AWS resources, so check before running them.
