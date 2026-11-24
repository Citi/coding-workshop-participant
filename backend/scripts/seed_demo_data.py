#!/usr/bin/env python3
"""Load a small, realistic demo portfolio through the public API (works locally and on AWS).

    python3 backend/scripts/seed_demo_data.py                       # local dev proxy
    python3 backend/scripts/seed_demo_data.py https://<cloudfront>  # AWS

Dates are relative to today, so the health rules always show a mix of on-track, at-risk and
overdue projects. Re-running is safe: records whose name/email already exists are skipped.
Only the standard library is used.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

DEFAULT_BASE_URL = "http://localhost:3001"
ALLOWED_SCHEMES = ("http", "https")
ADMIN = {"email": "admin@acme.com", "password": "Admin@123"}  # nosec B105 # the documented demo login
TODAY = date.today()


def _is_server_url(url: str) -> bool:
    """http(s) scheme, a host name, a usable port when one is given, and no ? or # part."""
    parts = urllib.parse.urlsplit(url)
    try:
        port_ok = parts.port is None or parts.port > 0
    except ValueError:  # the port is not a number from 0 to 65535
        return False
    return parts.scheme in ALLOWED_SCHEMES and bool(parts.hostname) and port_ok and "?" not in url and "#" not in url


def api_base(base_url: str) -> str:
    """The pm-service API root under ``base_url``.

    Only an http:// or https:// URL that names a host is accepted: urllib would also open file:// paths
    and other schemes. A ? or # part is refused too, because it would swallow the API path appended here
    (the app's own address, https://<cloudfront>/#/projects, would send the login to the wrong URL).
    """
    url = base_url.strip().rstrip("/")
    if not _is_server_url(url):
        raise ValueError(
            "The base URL must be an http:// or https:// address with a host name and no ? or # part"
            f" (for example {DEFAULT_BASE_URL}), got: {base_url!r}"
        )
    return url + "/api/pm-service"


BASE = api_base(DEFAULT_BASE_URL)  # main() replaces it with the validated URL from the command line


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:  # nosec B310 # api_base() allows only http(s)
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        return error.code, json.loads(raw) if raw else None


PROJECTS = [
    dict(
        name="Customer Portal Revamp",
        department="Digital",
        status="active",
        start_date=day(-90),
        end_date=day(60),
        budget=250000,
        description="Rebuild the self-service customer portal on the new design system.",
    ),
    dict(
        name="Data Warehouse Migration",
        department="Data & Analytics",
        status="active",
        start_date=day(-120),
        end_date=day(30),
        budget=400000,
        description="Move reporting from the on-premise warehouse to the cloud platform.",
    ),
    dict(
        name="Mobile App v2",
        department="Digital",
        status="active",
        start_date=day(-20),
        end_date=day(160),
        budget=180000,
        description="Second major release of the field-sales mobile app.",
    ),
    dict(
        name="Office Network Upgrade",
        department="IT Infrastructure",
        status="on_hold",
        start_date=day(-60),
        end_date=day(-2),
        budget=90000,
        description="Replace core switches and Wi-Fi in all regional offices.",
    ),
    dict(
        name="Compliance Audit 2026",
        department="Finance",
        status="planned",
        start_date=day(20),
        end_date=day(120),
        budget=60000,
        description="Prepare evidence and controls for the annual compliance audit.",
    ),
    dict(
        name="Legacy CRM Decommission",
        department="IT Infrastructure",
        status="completed",
        start_date=day(-200),
        end_date=day(-20),
        budget=75000,
        description="Archive data and switch off the legacy CRM.",
    ),
]

RESOURCES = [
    dict(full_name="Priya Shah", email="priya.shah@acme.com", job_title="Senior Developer", department="Digital"),
    dict(full_name="Marcus Lee", email="marcus.lee@acme.com", job_title="Data Engineer", department="Data & Analytics"),
    dict(full_name="Elena Petrova", email="elena.petrova@acme.com", job_title="UX Designer", department="Digital"),
    dict(
        full_name="Tom Walker",
        email="tom.walker@acme.com",
        job_title="Network Engineer",
        department="IT Infrastructure",
    ),
    dict(full_name="Aisha Khan", email="aisha.khan@acme.com", job_title="Project Manager", department="PMO"),
    dict(full_name="Diego Alvarez", email="diego.alvarez@acme.com", job_title="QA Engineer", department="Digital"),
]

# (project, name, status, due offset, is_key, owner email, depends on names)
DELIVERABLES = [
    ("Customer Portal Revamp", "Requirements sign-off", "completed", -70, True, "aisha.khan@acme.com", []),
    (
        "Customer Portal Revamp",
        "UX design",
        "completed",
        -40,
        False,
        "elena.petrova@acme.com",
        ["Requirements sign-off"],
    ),
    ("Customer Portal Revamp", "API integration", "in_progress", 15, True, "priya.shah@acme.com", ["UX design"]),
    ("Customer Portal Revamp", "Load testing", "not_started", 35, False, "diego.alvarez@acme.com", ["API integration"]),
    (
        "Customer Portal Revamp",
        "Beta release",
        "not_started",
        45,
        True,
        "priya.shah@acme.com",
        ["API integration", "Load testing"],
    ),
    ("Data Warehouse Migration", "Source inventory", "completed", -90, False, "marcus.lee@acme.com", []),
    ("Data Warehouse Migration", "Schema mapping", "blocked", -5, True, "marcus.lee@acme.com", ["Source inventory"]),
    ("Data Warehouse Migration", "ETL pipelines", "in_progress", 10, False, "marcus.lee@acme.com", ["Schema mapping"]),
    ("Data Warehouse Migration", "Cutover", "not_started", 28, True, "aisha.khan@acme.com", ["ETL pipelines"]),
    ("Mobile App v2", "Feature backlog", "completed", -10, False, "aisha.khan@acme.com", []),
    ("Mobile App v2", "Offline mode", "in_progress", 40, True, "priya.shah@acme.com", ["Feature backlog"]),
    (
        "Mobile App v2",
        "App store release",
        "not_started",
        150,
        True,
        "diego.alvarez@acme.com",
        ["Offline mode", "API integration"],
    ),
    ("Office Network Upgrade", "Site surveys", "completed", -40, False, "tom.walker@acme.com", []),
    ("Office Network Upgrade", "Switch replacement", "in_progress", -10, True, "tom.walker@acme.com", ["Site surveys"]),
    ("Compliance Audit 2026", "Controls catalogue", "not_started", 50, True, "aisha.khan@acme.com", []),
]

# (resource email, project, %) - Priya and Marcus end up over-allocated across active projects
ALLOCATIONS = [
    ("priya.shah@acme.com", "Customer Portal Revamp", 60),
    ("priya.shah@acme.com", "Mobile App v2", 50),
    ("marcus.lee@acme.com", "Data Warehouse Migration", 80),
    ("marcus.lee@acme.com", "Customer Portal Revamp", 30),
    ("elena.petrova@acme.com", "Customer Portal Revamp", 50),
    ("elena.petrova@acme.com", "Mobile App v2", 40),
    ("aisha.khan@acme.com", "Data Warehouse Migration", 40),
    ("aisha.khan@acme.com", "Customer Portal Revamp", 30),
    ("aisha.khan@acme.com", "Mobile App v2", 20),
    ("tom.walker@acme.com", "Office Network Upgrade", 100),
    ("diego.alvarez@acme.com", "Mobile App v2", 50),
    ("diego.alvarez@acme.com", "Customer Portal Revamp", 30),
]

# (project, category, description, amount, date offset) - the warehouse migration goes over budget
EXPENSES = [
    ("Customer Portal Revamp", "labor", "Development sprint 1-4", 98000, -60),
    ("Customer Portal Revamp", "software", "Design system licences", 12000, -80),
    ("Customer Portal Revamp", "labor", "Development sprint 5-6", 41000, -10),
    ("Data Warehouse Migration", "labor", "Migration team (Q1-Q2)", 260000, -70),
    ("Data Warehouse Migration", "software", "Cloud data platform", 145000, -40),
    ("Data Warehouse Migration", "travel", "On-site cutover planning", 8500, -15),
    ("Mobile App v2", "labor", "Discovery and backlog", 22000, -12),
    ("Mobile App v2", "hardware", "Test devices", 6500, -8),
    ("Office Network Upgrade", "hardware", "Core switches (deposit)", 52000, -30),
    ("Legacy CRM Decommission", "labor", "Data archiving", 61000, -60),
    ("Legacy CRM Decommission", "other", "Storage for archived data", 4800, -25),
]


def main(argv=None):
    global BASE
    args = sys.argv[1:] if argv is None else argv
    try:
        BASE = api_base(args[0] if args else DEFAULT_BASE_URL)
    except ValueError as error:
        sys.exit(str(error))

    status, login = call("POST", "/auth/login", ADMIN)
    if status != 200:
        sys.exit(f"Login failed ({status}): {login}")
    token = login["access_token"]

    def existing(collection, key):
        _, body = call("GET", f"/{collection}", token=token)
        return {item[key].lower(): item for item in body["items"]}

    def create(collection, payload, label):
        status, body = call("POST", f"/{collection}", payload, token)
        if status != 201:
            print(f"  ! {label}: {status} {body}")
            return None
        print(f"  + {label}")
        return body

    print("Projects")
    projects = existing("projects", "name")
    for p in PROJECTS:
        if p["name"].lower() not in projects:
            projects[p["name"].lower()] = create("projects", p, p["name"])

    print("Resources")
    resources = existing("resources", "email")
    for r in RESOURCES:
        if r["email"] not in resources:
            resources[r["email"]] = create("resources", r, r["full_name"])

    print("Deliverables")
    _, body = call("GET", "/deliverables", token=token)
    deliverables = {(d["project_id"], d["name"].lower()): d for d in body["items"]}
    by_name = {d["name"].lower(): d for d in body["items"]}
    for project, name, status, due, is_key, owner, deps in DELIVERABLES:
        project_id = projects[project.lower()]["id"]
        if (project_id, name.lower()) in deliverables:
            continue
        payload = dict(
            project_id=project_id,
            name=name,
            status=status,
            due_date=day(due),
            is_key=is_key,
            owner_id=resources[owner]["id"],
            depends_on_ids=[by_name[d.lower()]["id"] for d in deps],
            description=f"{name} for {project}.",
        )
        created = create("deliverables", payload, f"{project} / {name}")
        if created:
            deliverables[(project_id, name.lower())] = created
            by_name[name.lower()] = created

    print("Allocations")
    _, body = call("GET", "/allocations", token=token)
    allocated = {(a["resource_id"], a["project_id"]) for a in body["items"]}
    for email, project, percent in ALLOCATIONS:
        pair = (resources[email]["id"], projects[project.lower()]["id"])
        if pair not in allocated:
            create(
                "allocations",
                dict(resource_id=pair[0], project_id=pair[1], allocation_percent=percent),
                f"{email} -> {project} {percent}%",
            )

    print("Expenses")
    _, body = call("GET", "/expenses", token=token)
    spent = {(e["project_id"], e["description"].lower()) for e in body["items"]}
    for project, category, description, amount, offset in EXPENSES:
        project_id = projects[project.lower()]["id"]
        if (project_id, description.lower()) not in spent:
            create(
                "expenses",
                dict(
                    project_id=project_id,
                    category=category,
                    description=description,
                    amount=amount,
                    expense_date=day(offset),
                ),
                f"{project}: {description}",
            )

    _, dashboard = call("GET", "/dashboard", token=token)
    print("\nDashboard:", json.dumps({k: dashboard[k] for k in ("projects", "resources", "budget")}, indent=1))


if __name__ == "__main__":
    main()
