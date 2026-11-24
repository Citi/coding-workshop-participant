"""Demo data for the ACME portfolio (spec section 10).

Every date is an offset in days from ``T``, the date the seed runs (today's UTC
date unless the caller passes another). The offsets keep every risk rule more
than a day away from its boundary, so the golden risk scores in the spec still
hold on the day after seeding. Deliverable start dates are left empty.

The demo password comes from the caller (the task payload, or ``SEED_PASSWORD``
for the command line) and never from source. Each user gets their own bcrypt
hash. The seed writes no audit rows and does not commit: the caller runs it
inside one transaction.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models import (
    BudgetEntry,
    Deliverable,
    DeliverableDependency,
    Department,
    Project,
    ResourceAllocation,
    User,
)
from app.security import hash_password


@dataclass(frozen=True)
class SeedUser:
    """A demo user; ``key`` is the first name the spec tables use for them."""

    key: str
    name: str
    email: str
    role: str
    department: str


@dataclass(frozen=True)
class SeedProject:
    """A demo project; ``key`` is its short name and dates are day offsets from ``T``."""

    key: str
    name: str
    description: str
    department: str
    manager: str
    status: str
    start_offset: int
    end_offset: int
    planned_budget: Decimal


@dataclass(frozen=True)
class SeedBudgetEntry:
    """An amount spent on a demo project, dated ``offset`` days from ``T``."""

    project: str
    category: str
    amount: Decimal
    offset: int
    description: str


@dataclass(frozen=True)
class SeedDeliverable:
    """A demo deliverable; ``depends_on`` names its predecessors in the same project."""

    project: str
    title: str
    status: str
    completion: int
    due_offset: int
    assignee: str
    depends_on: tuple[str, ...] = ()
    blocked_reason: str | None = None


@dataclass(frozen=True)
class SeedAllocation:
    """A demo allocation; ``deliverable`` is ``None`` for a project-level allocation."""

    person: str
    project: str
    deliverable: str | None
    percentage: int
    start_offset: int
    end_offset: int


DEPARTMENTS: tuple[str, ...] = ("Engineering", "Marketing", "Finance", "Operations", "Human Resources")

USERS: tuple[SeedUser, ...] = (
    SeedUser("Asha", "Asha Rao", "admin@acme.example", "ADMIN", "Engineering"),
    SeedUser("Vikram", "Vikram Shah", "pm@acme.example", "PM", "Engineering"),
    SeedUser("Rohan", "Rohan Das", "lead@acme.example", "LEAD", "Engineering"),
    SeedUser("Neha", "Neha Kapoor", "viewer@acme.example", "VIEWER", "Finance"),
    SeedUser("Priya", "Priya Nair", "priya.nair@acme.example", "LEAD", "Engineering"),
    SeedUser("Arjun", "Arjun Mehta", "arjun.mehta@acme.example", "LEAD", "Engineering"),
    SeedUser("Meera", "Meera Iyer", "meera.iyer@acme.example", "PM", "Marketing"),
    SeedUser("Kabir", "Kabir Sethi", "kabir.sethi@acme.example", "PM", "Finance"),
    SeedUser("Sana", "Sana Khan", "sana.khan@acme.example", "PM", "Operations"),
    SeedUser("Divya", "Divya Menon", "divya.menon@acme.example", "PM", "Human Resources"),
)

PROJECTS: tuple[SeedProject, ...] = (
    SeedProject(
        "Alpha",
        "Project Alpha: Customer Payments Platform",
        "Replace the legacy card-payment stack with one payments platform for web and mobile checkout.",
        "Engineering",
        "Vikram",
        "ACTIVE",
        -60,
        25,
        Decimal("400000.00"),
    ),
    SeedProject(
        "Beta",
        "Project Beta: Brand Relaunch Campaign",
        "Relaunch the ACME brand with new creative, a refreshed website and a launch event.",
        "Marketing",
        "Meera",
        "ACTIVE",
        -45,
        50,
        Decimal("150000.00"),
    ),
    SeedProject(
        "Gamma",
        "Project Gamma: Ledger Automation",
        "Automate bank reconciliation and the month-end close in the general ledger.",
        "Finance",
        "Kabir",
        "ACTIVE",
        -40,
        90,
        Decimal("250000.00"),
    ),
    SeedProject(
        "Delta",
        "Project Delta: Warehouse Tracking Rollout",
        "Roll out barcode scanning and live stock tracking across the main warehouse.",
        "Operations",
        "Sana",
        "ACTIVE",
        -70,
        20,
        Decimal("200000.00"),
    ),
    SeedProject(
        "Epsilon",
        "Project Epsilon: Onboarding Portal",
        "Self-service onboarding portal for new joiners; delivered and live.",
        "Human Resources",
        "Divya",
        "COMPLETED",
        -120,
        -10,
        Decimal("80000.00"),
    ),
)

# Dated between T-50 and T-5 and inside each project's own dates. Per project they
# add up to the spec's "Spent" column: 300,000 / 105,000 / 137,500 / 210,000 / 76,000.
BUDGET_ENTRIES: tuple[SeedBudgetEntry, ...] = (
    SeedBudgetEntry("Alpha", "LABOR", Decimal("180000.00"), -20, "Engineering contractors"),
    SeedBudgetEntry("Alpha", "VENDOR", Decimal("60000.00"), -42, "Payment gateway integration partner"),
    SeedBudgetEntry("Alpha", "SOFTWARE", Decimal("35000.00"), -48, "API gateway and monitoring licences"),
    SeedBudgetEntry("Alpha", "HARDWARE", Decimal("20000.00"), -30, "Hardware security modules"),
    SeedBudgetEntry("Alpha", "TRAVEL", Decimal("5000.00"), -8, "Partner workshop travel"),
    SeedBudgetEntry("Beta", "VENDOR", Decimal("60000.00"), -40, "Creative agency retainer"),
    SeedBudgetEntry("Beta", "LABOR", Decimal("35000.00"), -15, "Campaign team contractors"),
    SeedBudgetEntry("Beta", "SOFTWARE", Decimal("10000.00"), -30, "Marketing automation licences"),
    SeedBudgetEntry("Gamma", "LABOR", Decimal("90000.00"), -10, "Finance systems analysts"),
    SeedBudgetEntry("Gamma", "SOFTWARE", Decimal("40000.00"), -38, "Reconciliation platform licences"),
    SeedBudgetEntry("Gamma", "OTHER", Decimal("7500.00"), -6, "Audit advisory fees"),
    SeedBudgetEntry("Delta", "HARDWARE", Decimal("110000.00"), -22, "Warehouse wireless network and scanner deposit"),
    SeedBudgetEntry("Delta", "LABOR", Decimal("70000.00"), -12, "Rollout and training staff"),
    SeedBudgetEntry("Delta", "VENDOR", Decimal("30000.00"), -48, "Site survey contractor"),
    SeedBudgetEntry("Epsilon", "LABOR", Decimal("50000.00"), -45, "Portal developers"),
    SeedBudgetEntry("Epsilon", "SOFTWARE", Decimal("26000.00"), -20, "Identity and e-signature licences"),
)

# In spec order, so ids follow the table (for example Payments Service Integration is 3).
DELIVERABLES: tuple[SeedDeliverable, ...] = (
    SeedDeliverable("Alpha", "Requirements Sign-off", "DONE", 100, -30, "Vikram"),
    SeedDeliverable(
        "Alpha",
        "API Schema",
        "BLOCKED",
        40,
        -5,
        "Priya",
        ("Requirements Sign-off",),
        "Awaiting security approval of the partner data contract",
    ),
    SeedDeliverable("Alpha", "Payments Service Integration", "IN_PROGRESS", 20, 10, "Arjun", ("API Schema",)),
    SeedDeliverable("Alpha", "Mobile Client Integration", "NOT_STARTED", 0, 14, "Rohan", ("API Schema",)),
    SeedDeliverable("Alpha", "End-to-End Testing", "NOT_STARTED", 0, 22, "Rohan", ("Payments Service Integration",)),
    SeedDeliverable("Alpha", "Data Migration Plan", "IN_PROGRESS", 50, -3, "Rohan"),
    SeedDeliverable("Beta", "Brand Guidelines", "DONE", 100, -20, "Meera"),
    SeedDeliverable("Beta", "Campaign Creative", "IN_PROGRESS", 60, -4, "Meera", ("Brand Guidelines",)),
    SeedDeliverable("Beta", "Website Refresh", "IN_PROGRESS", 40, 20, "Meera", ("Campaign Creative",)),
    SeedDeliverable("Beta", "Launch Event", "NOT_STARTED", 0, 35, "Meera", ("Campaign Creative",)),
    SeedDeliverable("Gamma", "Chart of Accounts Mapping", "DONE", 100, -15, "Kabir"),
    SeedDeliverable(
        "Gamma", "Reconciliation Rules Engine", "IN_PROGRESS", 70, 25, "Kabir", ("Chart of Accounts Mapping",)
    ),
    SeedDeliverable(
        "Gamma", "Bank Feed Integration", "IN_PROGRESS", 50, 45, "Arjun", ("Reconciliation Rules Engine",)
    ),
    SeedDeliverable("Gamma", "Month-End Close Pilot", "IN_PROGRESS", 20, 70, "Kabir", ("Bank Feed Integration",)),
    SeedDeliverable("Delta", "Site Survey", "DONE", 100, -25, "Sana"),
    SeedDeliverable(
        "Delta", "Scanner Procurement", "BLOCKED", 30, -7, "Sana", ("Site Survey",), "Vendor delivery delayed"
    ),
    SeedDeliverable("Delta", "Warehouse Staff Training", "IN_PROGRESS", 60, -2, "Sana"),
    SeedDeliverable("Delta", "Pilot Go-Live", "IN_PROGRESS", 30, 15, "Sana", ("Scanner Procurement",)),
    SeedDeliverable("Epsilon", "Portal Design", "DONE", 100, -80, "Divya"),
    SeedDeliverable("Epsilon", "Portal Build", "DONE", 100, -40, "Divya", ("Portal Design",)),
    SeedDeliverable("Epsilon", "Rollout", "DONE", 100, -12, "Divya", ("Portal Build",)),
)

# Priya's first two rows overlap at 120% from T-2 to T+12; her Gamma row comes later and
# must not be flagged. Arjun's rows are back to back (peak 60%). Priya is deliberately
# not assigned to any Beta deliverable: that would change Beta's risk score.
ALLOCATIONS: tuple[SeedAllocation, ...] = (
    SeedAllocation("Priya", "Alpha", "API Schema", 60, -10, 20),
    SeedAllocation("Priya", "Beta", None, 60, -2, 12),
    SeedAllocation("Priya", "Gamma", None, 50, 40, 70),
    SeedAllocation("Arjun", "Alpha", "Payments Service Integration", 60, -20, 9),
    SeedAllocation("Arjun", "Gamma", "Bank Feed Integration", 60, 10, 40),
    SeedAllocation("Rohan", "Alpha", None, 80, -30, 25),
    SeedAllocation("Sana", "Delta", None, 70, -30, 20),
    SeedAllocation("Kabir", "Gamma", None, 50, -40, 90),
)


def today_utc() -> date:
    """Return today's date in UTC, the default anchor date ``T`` for the seed."""
    return datetime.now(timezone.utc).date()


def seed_portfolio(session: Session, password: str, today: date | None = None) -> dict[str, int]:
    """Add the spec section 10 demo data to ``session`` and flush it, without committing.

    ``today`` is the anchor date ``T`` (default: today's UTC date). Every user gets
    ``password``, hashed separately (bcrypt, fresh salt, ``BCRYPT_ROUNDS``). Returns
    the number of rows inserted per table.
    """
    anchor = today or today_utc()

    def day(offset: int) -> date:
        """Return the date ``offset`` days from the anchor date."""
        return anchor + timedelta(days=offset)

    departments = {name: Department(name=name) for name in DEPARTMENTS}
    users = {
        spec.key: User(
            name=spec.name,
            email=spec.email,
            password_hash=hash_password(password),
            role=spec.role,
            department=departments[spec.department],
        )
        for spec in USERS
    }
    projects = {
        spec.key: Project(
            project_name=spec.name,
            description=spec.description,
            department=departments[spec.department],
            project_manager=users[spec.manager],
            start_date=day(spec.start_offset),
            end_date=day(spec.end_offset),
            planned_budget=spec.planned_budget,
            status=spec.status,
        )
        for spec in PROJECTS
    }
    deliverables = {
        (spec.project, spec.title): Deliverable(
            project=projects[spec.project],
            title=spec.title,
            assigned_user=users[spec.assignee],
            start_date=None,
            due_date=day(spec.due_offset),
            completion_percentage=spec.completion,
            status=spec.status,
            blocked_reason=spec.blocked_reason,
        )
        for spec in DELIVERABLES
    }
    dependencies = [
        DeliverableDependency(
            predecessor=deliverables[(spec.project, predecessor)],
            successor=deliverables[(spec.project, spec.title)],
        )
        for spec in DELIVERABLES
        for predecessor in spec.depends_on
    ]
    allocations = [
        ResourceAllocation(
            user=users[spec.person],
            project=projects[spec.project],
            # Looked up within the allocation's own project, so the link is always valid.
            deliverable=deliverables[(spec.project, spec.deliverable)] if spec.deliverable else None,
            allocation_percentage=spec.percentage,
            start_date=day(spec.start_offset),
            end_date=day(spec.end_offset),
        )
        for spec in ALLOCATIONS
    ]
    budget_entries = [
        BudgetEntry(
            project=projects[spec.project],
            category=spec.category,
            description=spec.description,
            amount=spec.amount,
            entry_date=day(spec.offset),
        )
        for spec in BUDGET_ENTRIES
    ]

    # Added table by table in spec order, so identities follow the spec tables.
    for rows in (
        departments.values(),
        users.values(),
        projects.values(),
        deliverables.values(),
        dependencies,
        allocations,
        budget_entries,
    ):
        session.add_all(rows)
    session.flush()

    return {
        "departments": len(departments),
        "users": len(users),
        "projects": len(projects),
        "deliverables": len(deliverables),
        "deliverable_dependencies": len(dependencies),
        "resource_allocations": len(allocations),
        "budget_entries": len(budget_entries),
    }
