#!/usr/bin/env bash
# Run the automated test suites.
#
#   ./bin/run-tests.sh          backend (pytest) + frontend (Vitest), with coverage
#   ./bin/run-tests.sh --e2e    ...plus end-to-end browser tests (needs ./bin/start-dev.sh running)
#
# Backend tests need local PostgreSQL (they create and drop a throwaway
# 'facility_desk_test' database; your data is not touched).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/backend/api-service"
WEB="$ROOT/frontend"
RUN_E2E=false
[[ "${1:-}" == "--e2e" ]] && RUN_E2E=true

echo "==> Backend: pytest (unit + integration) with coverage"
if [[ ! -x "$API/.venv/bin/pytest" ]]; then
  python3.13 -m venv "$API/.venv"
  "$API/.venv/bin/pip" install -q -r "$API/requirements-dev.txt"
fi
(cd "$API" && .venv/bin/pytest --cov=app --cov-report=term:skip-covered --cov-fail-under=80)

echo "==> Frontend: Vitest (components, services, pages) with coverage"
[[ -d "$WEB/node_modules" ]] || (cd "$WEB" && npm install)
(cd "$WEB" && npm run test:coverage)

if $RUN_E2E; then
  echo "==> End-to-end: Playwright against http://localhost:3000"
  (cd "$WEB" && npm run test:e2e)
fi

echo "==> All test suites passed"
