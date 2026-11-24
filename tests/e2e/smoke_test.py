#!/usr/bin/env python3
"""End-to-end smoke test of the demo path over plain HTTP (spec section 13.3).

It runs against the local stack or AWS and uses only the Python standard library::

    BASE_URL=http://localhost:3001/api/portfolio SEED_PASSWORD=... python tests/e2e/smoke_test.py
    BASE_URL=https://<dist>.cloudfront.net/api/portfolio SEED_PASSWORD=... python tests/e2e/smoke_test.py

``SEED_PASSWORD`` is the demo password the seed task was given; it is never
printed, and neither are tokens. The eight steps run in order and each prints
PASS or FAIL with its evidence. The exit code is 0 when every step passes, 1
when any step fails and 2 for a usage error.

The test leaves nothing behind: logging in and reading change nothing, the
cycle is refused and so is the viewer's project. If either write were wrongly
accepted, the step fails and deletes the new record again.

The golden values hold on the day the database was seeded and on the day after
(the server's ``as_of`` is today's UTC date); step 3 prints the seed day.
"""

from __future__ import annotations

import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

DEFAULT_BASE_URL = "http://localhost:3001/api/portfolio"
TIMEOUT_SECONDS = 60
# GET requests are retried on network errors and 5xx responses: Aurora may be resuming.
GET_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 5
USER_AGENT = "acme-portfolio-smoke-test/1.0"

PM_EMAIL = "pm@acme.example"
VIEWER_EMAIL = "viewer@acme.example"
ALPHA_PREFIX = "Project Alpha"
ALPHA_START_OFFSET_DAYS = 60  # Alpha starts at T-60 in the seed (spec section 10)
ALPHA_SCORE, ALPHA_LEVEL, ALPHA_UTILIZATION, ALPHA_COMPLETION = 78, "CRITICAL", 75.0, 35.0
EXPECTED_IMPACTED = {"Payments Service Integration", "Mobile Client Integration", "End-to-End Testing"}
CYCLE_TEXT = "API Schema → Payments Service Integration → End-to-End Testing → API Schema"
MISSING_PROJECT_ID = 999999
SNIPPET_LENGTH = 160


class StepFailed(Exception):
    """A step's check did not hold; the message is the evidence."""


@dataclass(frozen=True)
class HttpResult:
    """One HTTP exchange: what was asked and what came back."""

    method: str
    path: str
    status: int
    content_type: str
    body: bytes

    def json(self) -> Any:
        """Return the parsed JSON body, or None when the body is not JSON."""
        text = self.text().strip()
        if "json" not in self.content_type and not text.startswith(("{", "[")):
            return None
        try:
            return json.loads(text)
        except ValueError:
            return None

    def text(self) -> str:
        """Return the body decoded as UTF-8 (undecodable bytes replaced)."""
        return self.body.decode("utf-8", errors="replace")

    @property
    def is_html(self) -> bool:
        """Return True for an HTML page, such as the SPA's index.html."""
        start = self.text().lstrip()[:15].lower()
        return "text/html" in self.content_type or start.startswith(("<!doctype html", "<html"))

    def snippet(self) -> str:
        """Return the start of the body on one line."""
        flat = " ".join(self.text().split())
        return flat if len(flat) <= SNIPPET_LENGTH else flat[:SNIPPET_LENGTH] + "..."

    def describe(self) -> str:
        """Summarise the response: status plus the standard error fields, or a body snippet."""
        data = self.json()
        head = f"{self.method} {self.path} -> HTTP {self.status}"
        if isinstance(data, dict) and "error" in data:
            return f"{head} {data.get('error')}: {data.get('message')}"
        return f"{head} ({self.content_type or 'no content-type'}): {self.snippet()}"


class Api:
    """A tiny JSON-over-HTTP client for the portfolio API."""

    def __init__(self, base_url: str) -> None:
        """Remember the API base URL, for example ``http://localhost:3001/api/portfolio``."""
        self.base_url = base_url

    def call(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        body: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> HttpResult:
        """Send one request and return the response, whatever its status.

        GET requests are retried on network errors and 5xx responses. A network
        error that persists raises ``StepFailed``.
        """
        url = self.base_url + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"

        attempts = GET_ATTEMPTS if method == "GET" else 1
        for attempt in range(1, attempts + 1):
            request = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                # main() accepts only http and https base URLs.
                with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # nosec B310
                    result = HttpResult(method, path, response.status, response.headers.get("Content-Type", ""),
                                        response.read())
            except urllib.error.HTTPError as error:
                result = HttpResult(method, path, error.code, error.headers.get("Content-Type", ""), error.read())
            except (OSError, http.client.HTTPException) as error:
                if attempt == attempts:
                    raise StepFailed(f"{method} {path}: network error: {error}") from error
                time.sleep(RETRY_DELAY_SECONDS)
                continue
            if result.status >= 500 and attempt < attempts:
                time.sleep(RETRY_DELAY_SECONDS)
                continue
            return result
        raise StepFailed(f"{method} {path}: no response")  # not reached: the loop returns or raises


@dataclass
class Context:
    """State carried from one step to the next. The password is never printed."""

    password: str
    pm_token: str | None = None
    viewer_token: str | None = None
    alpha_id: int | None = None
    alpha_risk: dict[str, Any] | None = None
    alpha_nodes: dict[str, int] = field(default_factory=dict)


class Checks:
    """Collects the facts a step verified; any failed fact fails the step with all the evidence."""

    def __init__(self) -> None:
        """Start with no facts."""
        self.lines: list[str] = []
        self.failed = False

    def add(self, ok: bool, line: str) -> bool:
        """Record one fact; return whether it held."""
        self.lines.append(line if ok else f"MISMATCH: {line}")
        self.failed = self.failed or not ok
        return ok

    def finish(self) -> str:
        """Return the evidence, or raise ``StepFailed`` with it if anything did not hold."""
        evidence = "\n".join(self.lines)
        if self.failed:
            raise StepFailed(evidence)
        return evidence


def require(value: Any, reason: str) -> Any:
    """Return ``value``, or fail the step because an earlier step could not provide it."""
    if value is None:
        raise StepFailed(f"not run: {reason}")
    return value


def json_object(result: HttpResult, expected_status: int = 200) -> dict[str, Any]:
    """Return the JSON object of a response with the expected status, or fail with the evidence."""
    data = result.json()
    if result.status != expected_status or not isinstance(data, dict):
        raise StepFailed(result.describe())
    return data


def login(api: Api, email: str, password: str, role: str) -> tuple[str, str]:
    """Sign in and return ``(access token, evidence)``; fail unless the user has ``role``."""
    data = json_object(api.call("POST", "/auth/login", body={"email": email, "password": password}))
    user = data.get("user") or {}
    if not data.get("access_token") or user.get("role") != role:
        raise StepFailed(f"login as {email}: expected an access token for a {role}, got role {user.get('role')!r}")
    return data["access_token"], f"HTTP 200, signed in as {user.get('name')} <{email}> ({role})"


# --- Steps -------------------------------------------------------------------------------------------


def step_health(api: Api, ctx: Context) -> str:
    """1. ``/health`` is healthy."""
    result = api.call("GET", "/health")
    data = result.json()
    if result.status == 200 and isinstance(data, dict) and data.get("status") == "healthy":
        return f"HTTP 200, status=healthy, database={data.get('database')}, latency_ms={data.get('latency_ms')}"
    raise StepFailed(result.describe())


def step_login_pm(api: Api, ctx: Context) -> str:
    """2. Log in as the PM."""
    ctx.pm_token, evidence = login(api, PM_EMAIL, ctx.password, "PM")
    return evidence


def _find_alpha(items: Any) -> dict[str, Any] | None:
    """Return the Alpha item of a project list, if present."""
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and str(item.get("project_name", "")).startswith(ALPHA_PREFIX):
            return item
    return None


def step_alpha_is_critical(api: Api, ctx: Context) -> str:
    """3. Alpha is CRITICAL with score 78, 75.0% utilization and 35.0% completion."""
    token = require(ctx.pm_token, "no PM token (step 2 failed)")
    checks = Checks()
    listing = api.call("GET", "/projects", token=token, query={"q": ALPHA_PREFIX, "limit": 200})
    data = listing.json()
    alpha = _find_alpha(data.get("items") if isinstance(data, dict) else None)
    seed_day = None
    if listing.status == 200 and alpha is not None:
        ctx.alpha_id = alpha.get("id")
        values = (alpha.get("risk_score"), alpha.get("risk_level"), alpha.get("utilization_pct"),
                  alpha.get("completion_pct"))
        checks.add(
            values == (ALPHA_SCORE, ALPHA_LEVEL, ALPHA_UTILIZATION, ALPHA_COMPLETION),
            f"GET /projects: {alpha.get('project_name')} (id {ctx.alpha_id}): score {values[0]} {values[1]}, "
            f"utilization {values[2]}%, completion {values[3]}%",
        )
        try:
            seed_day = date.fromisoformat(str(alpha.get("start_date"))) + timedelta(days=ALPHA_START_OFFSET_DAYS)
        except ValueError:
            seed_day = None
    else:
        checks.add(False, f"GET /projects did not list {ALPHA_PREFIX}: {listing.describe()}")
        # Look the id up elsewhere so that the later steps can still run.
        ranking = api.call("GET", "/analytics/risk", token=token).json()
        alpha = _find_alpha(ranking.get("items") if isinstance(ranking, dict) else None)
        ctx.alpha_id = alpha.get("project_id") if alpha else None
    if ctx.alpha_id is None:
        checks.add(False, f"{ALPHA_PREFIX} was not found, so its risk detail cannot be checked")
        return checks.finish()

    risk_result = api.call("GET", f"/projects/{ctx.alpha_id}/risk", token=token)
    risk = risk_result.json()
    if risk_result.status == 200 and isinstance(risk, dict):
        ctx.alpha_risk = risk
        checks.add(
            (risk.get("risk_score"), risk.get("risk_level")) == (ALPHA_SCORE, ALPHA_LEVEL),
            f"GET /projects/{ctx.alpha_id}/risk: score {risk.get('risk_score')} {risk.get('risk_level')} "
            f"as of {risk.get('as_of')}",
        )
    else:
        checks.add(False, f"risk detail: {risk_result.describe()}")
        risk = {}
    if seed_day is not None:
        checks.lines.append(f"seed day T = {seed_day.isoformat()} (Alpha starts at T-60)")
        try:
            age = (date.fromisoformat(str(risk.get("as_of"))) - seed_day).days
        except ValueError:
            age = 0
        if checks.failed and age > 1:
            checks.lines.append(f"hint: the data was seeded {age} days ago; golden values hold on T and T+1 only")
    return checks.finish()


def step_alpha_impacted(api: Api, ctx: Context) -> str:
    """4. Alpha's impacted set has the three expected titles."""
    token = require(ctx.pm_token, "no PM token (step 2 failed)")
    alpha_id = require(ctx.alpha_id, "Alpha's id is unknown (step 3 failed)")
    checks = Checks()
    risk = ctx.alpha_risk or json_object(api.call("GET", f"/projects/{alpha_id}/risk", token=token))
    risk_titles = {item.get("title") for item in risk.get("impacted_deliverables", [])}
    checks.add(risk_titles == EXPECTED_IMPACTED, f"risk detail impacted: {sorted(risk_titles)}")

    graph_result = api.call("GET", f"/projects/{alpha_id}/dependency-graph", token=token)
    graph = graph_result.json()
    if graph_result.status == 200 and isinstance(graph, dict):
        graph_titles = {item.get("title") for item in graph.get("impacted", [])}
        checks.add(graph_titles == EXPECTED_IMPACTED, f"dependency graph impacted: {sorted(graph_titles)}")
        ctx.alpha_nodes = {node.get("title"): node.get("id") for node in graph.get("nodes", [])}
    else:
        checks.add(False, f"dependency graph: {graph_result.describe()}")
    return checks.finish()


def _alpha_deliverable_ids(api: Api, token: str, alpha_id: int, ctx: Context) -> dict[str, int]:
    """Return Alpha's deliverable ids by title, from ``GET /deliverables`` or else the graph nodes."""
    result = api.call("GET", "/deliverables", token=token, query={"project_id": alpha_id, "limit": 200})
    data = result.json()
    if result.status == 200 and isinstance(data, dict):
        return {item.get("title"): item.get("id") for item in data.get("items", [])}
    if ctx.alpha_nodes:
        return ctx.alpha_nodes
    raise StepFailed(f"cannot find Alpha's deliverables: {result.describe()}")


def step_cycle_rejected(api: Api, ctx: Context) -> str:
    """5. Adding End-to-End Testing -> API Schema returns 400 DEPENDENCY_CYCLE."""
    token = require(ctx.pm_token, "no PM token (step 2 failed)")
    alpha_id = require(ctx.alpha_id, "Alpha's id is unknown (step 3 failed)")
    ids = _alpha_deliverable_ids(api, token, alpha_id, ctx)
    e2e = require(ids.get("End-to-End Testing"), "deliverable 'End-to-End Testing' not found")
    schema = require(ids.get("API Schema"), "deliverable 'API Schema' not found")
    result = api.call(
        "POST", "/dependencies", token=token,
        body={"predecessor_deliverable_id": e2e, "successor_deliverable_id": schema},
    )
    data = result.json()
    if 200 <= result.status < 300:
        created = data.get("id") if isinstance(data, dict) else None
        cleanup = "no id returned, nothing deleted"
        if created is not None:
            deleted = api.call("DELETE", f"/dependencies/{created}", token=token)
            cleanup = f"deleted it again: HTTP {deleted.status}"
        raise StepFailed(f"the cycle was ACCEPTED (HTTP {result.status}, edge id {created}); {cleanup}")
    if result.status == 400 and isinstance(data, dict) and data.get("error") == "DEPENDENCY_CYCLE":
        message = str(data.get("message"))
        if CYCLE_TEXT in message:
            return f"HTTP 400 DEPENDENCY_CYCLE: {message}"
        raise StepFailed(f"HTTP 400 DEPENDENCY_CYCLE without the expected path {CYCLE_TEXT!r}: {message}")
    raise StepFailed(result.describe())


def step_capacity(api: Api, ctx: Context) -> str:
    """6. Capacity shows Priya Nair at 120% and Arjun Mehta not flagged."""
    token = require(ctx.pm_token, "no PM token (step 2 failed)")
    data = json_object(api.call("GET", "/analytics/capacity", token=token))
    people = {item.get("user_name"): item for item in data.get("employees", []) if isinstance(item, dict)}
    checks = Checks()
    priya = people.get("Priya Nair")
    if priya is None:
        checks.add(False, f"Priya Nair is not listed; people: {sorted(map(str, people))}")
    else:
        conflicts = priya.get("conflicts") or []
        windows = [f"{c.get('start_date')}..{c.get('end_date')} at {c.get('load')}%" for c in conflicts]
        checks.add(
            priya.get("peak_load") == 120
            and priya.get("status") == "OVER_ALLOCATED"
            and any(c.get("load") == 120 for c in conflicts),
            f"Priya Nair: peak {priya.get('peak_load')}%, status {priya.get('status')}, conflicts {windows}",
        )
    arjun = people.get("Arjun Mehta")
    if arjun is None:
        checks.add(False, f"Arjun Mehta is not listed; people: {sorted(map(str, people))}")
    else:
        conflicts = arjun.get("conflicts") or []
        checks.add(
            arjun.get("status") != "OVER_ALLOCATED" and not conflicts and arjun.get("peak_load") == 60,
            f"Arjun Mehta: peak {arjun.get('peak_load')}%, status {arjun.get('status')}, "
            f"{len(conflicts)} conflicts (not flagged)",
        )
    return checks.finish()


def step_viewer_denied(api: Api, ctx: Context) -> str:
    """7. Log in as the viewer; ``POST /projects`` returns 403."""
    token, evidence = login(api, VIEWER_EMAIL, ctx.password, "VIEWER")
    ctx.viewer_token = token
    departments = api.call("GET", "/departments", token=token, query={"limit": 1}).json()
    items = departments.get("items") if isinstance(departments, dict) else None
    department_id = items[0].get("id") if items else 1
    today = datetime.now(timezone.utc).date()
    body = {
        "project_name": "Smoke test project (must be refused)",
        "department_id": department_id,
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
        "planned_budget": "1000.00",
        "status": "PLANNED",
    }
    result = api.call("POST", "/projects", token=token, body=body)
    data = result.json()
    if 200 <= result.status < 300:
        created = data.get("id") if isinstance(data, dict) else None
        cleanup = "no id returned, nothing deleted"
        if created is not None and ctx.pm_token:
            deleted = api.call("DELETE", f"/projects/{created}", token=ctx.pm_token)
            cleanup = f"deleted it again as PM: HTTP {deleted.status}"
        raise StepFailed(f"the VIEWER created a project (HTTP {result.status}, id {created}); {cleanup}")
    if result.status == 403 and isinstance(data, dict) and data.get("error") == "ACCESS_DENIED":
        return f"{evidence}\nPOST /projects -> HTTP 403 ACCESS_DENIED: {data.get('message')}"
    raise StepFailed(f"{evidence}\n{result.describe()}")


def step_missing_project(api: Api, ctx: Context) -> str:
    """8. ``GET /projects/999999`` returns 404 or an HTML body; report which."""
    token = require(ctx.pm_token or ctx.viewer_token, "no access token (steps 2 and 7 failed)")
    result = api.call("GET", f"/projects/{MISSING_PROJECT_ID}", token=token)
    data = result.json()
    if result.status == 404 and isinstance(data, dict) and data.get("error") == "NOT_FOUND":
        return f"outcome: 404 JSON NOT_FOUND ({data.get('message')})"
    if result.is_html:
        return (
            f"outcome: HTML body (HTTP {result.status}, {result.content_type or 'no content-type'}): the CloudFront "
            "SPA fallback replaced the API 404 with index.html; the web client treats this as NOT_FOUND"
        )
    hint = ""
    if "xml" in result.content_type or result.text().lstrip().startswith(("<?xml", "<Error")):
        hint = (
            "\nhint: an XML error page, such as S3's 403 AccessDenied, usually means CloudFront's 404 rule "
            "fetched /index.html and the frontend is not deployed yet (./bin/deploy-frontend.sh)"
        )
    raise StepFailed(
        f"outcome: something else: HTTP {result.status}, content-type {result.content_type or 'none'}: "
        f"{result.snippet()}{hint}"
    )


STEPS: tuple[tuple[str, Callable[[Api, Context], str]], ...] = (
    ("/health is healthy", step_health),
    (f"log in as {PM_EMAIL}", step_login_pm),
    ("Alpha is CRITICAL with score 78, 75.0% utilization, 35.0% completion", step_alpha_is_critical),
    ("Alpha's impacted set has the three expected titles", step_alpha_impacted),
    ("adding End-to-End Testing -> API Schema returns 400 DEPENDENCY_CYCLE", step_cycle_rejected),
    ("capacity shows Priya Nair at 120% and Arjun Mehta not flagged", step_capacity),
    (f"log in as {VIEWER_EMAIL}; POST /projects returns 403", step_viewer_denied),
    (f"GET /projects/{MISSING_PROJECT_ID} returns 404 or an HTML body", step_missing_project),
)


def main() -> int:
    """Run the eight steps in order and return the process exit code."""
    base_url = (os.environ.get("BASE_URL") or DEFAULT_BASE_URL).strip().rstrip("/")
    parts = urllib.parse.urlsplit(base_url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        print(f"BASE_URL must be an http(s) URL such as {DEFAULT_BASE_URL}", file=sys.stderr)
        return 2
    password = os.environ.get("SEED_PASSWORD", "")
    if not password:
        print("Set SEED_PASSWORD to the demo password, for example: read -rs SEED_PASSWORD && export SEED_PASSWORD",
              file=sys.stderr)
        return 2

    api = Api(base_url)
    ctx = Context(password=password)
    print(f"Smoke test against {base_url}")
    failures = 0
    for number, (title, run) in enumerate(STEPS, start=1):
        try:
            outcome, evidence = "PASS", run(api, ctx)
        except StepFailed as failure:
            outcome, evidence = "FAIL", str(failure)
        except Exception as error:  # a crash in one step is reported as its failure; the rest still run
            outcome, evidence = "FAIL", f"unexpected {type(error).__name__}: {error}"
        if outcome == "FAIL":
            failures += 1
        print(f"{outcome}  {number}. {title}")
        for line in evidence.splitlines():
            print(f"        {line}")
    print(f"{len(STEPS) - failures}/{len(STEPS)} steps passed" + (f", {failures} failed" if failures else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
