"""The portfolio loader reads every engine fact from PostgreSQL in exactly five SELECT statements."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import event
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
from app.engines.risk import analyze_portfolio
from app.engines.types import (
    AllocationFact,
    DeliverableFact,
    DependencyEdge,
    PortfolioSnapshot,
    ProjectFact,
)
from app.services.portfolio import load_snapshot

T = date(2026, 11, 25)


def day(offset: int) -> date:
    """Return the date ``offset`` days from ``T``."""
    return T + timedelta(days=offset)


@pytest.fixture
def statement_log(db_session: Session) -> Iterator[Callable[[], list[str]]]:
    """Return a function that starts recording every SQL statement sent through the test engine."""
    engine = db_session.get_bind()
    statements: list[str] = []

    def _record(conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        statements.append(statement)

    def _start() -> list[str]:
        event.listen(engine, "before_cursor_execute", _record)
        return statements

    yield _start
    if event.contains(engine, "before_cursor_execute", _record):
        event.remove(engine, "before_cursor_execute", _record)


def _insert_portfolio(session: Session) -> dict[str, Any]:
    """Insert a small portfolio through the ORM and return the objects by name."""
    engineering = Department(name="Engineering")
    finance = Department(name="Finance")
    session.add_all([engineering, finance])
    session.flush()

    vikram = User(name="Vikram Shah", email="pm@loader.example", password_hash="not-a-hash", role="PM",
                  department_id=engineering.id)
    priya = User(name="Priya Nair", email="priya@loader.example", password_hash="not-a-hash", role="LEAD",
                 department_id=engineering.id)
    neha = User(name="Neha Kapoor", email="neha@loader.example", password_hash="not-a-hash", role="VIEWER")
    session.add_all([vikram, priya, neha])
    session.flush()

    alpha = Project(project_name="Project Alpha", description="Payments platform", department_id=engineering.id,
                    project_manager_id=vikram.id, start_date=day(-60), end_date=day(25),
                    planned_budget=Decimal("400000.00"), status="ACTIVE")
    ledger = Project(project_name="Ledger Automation", department_id=finance.id, start_date=day(-10),
                     end_date=day(90), planned_budget=Decimal("0"), status="PLANNED")
    session.add_all([alpha, ledger])
    session.flush()

    api = Deliverable(project_id=alpha.id, title="API Schema", assigned_user_id=priya.id, due_date=day(-5),
                      completion_percentage=40, status="BLOCKED", blocked_reason="Awaiting security approval")
    payments = Deliverable(project_id=alpha.id, title="Payments Service Integration", start_date=day(-20),
                           due_date=day(10), completion_percentage=20, status="IN_PROGRESS")
    mapping = Deliverable(project_id=ledger.id, title="Chart of Accounts Mapping", due_date=day(-15),
                          completion_percentage=100, status="DONE")
    session.add_all([api, payments, mapping])
    session.flush()

    edge = DeliverableDependency(predecessor_deliverable_id=api.id, successor_deliverable_id=payments.id)
    priya_alpha = ResourceAllocation(user_id=priya.id, project_id=alpha.id, deliverable_id=api.id,
                                     allocation_percentage=60, start_date=day(-10), end_date=day(20))
    neha_ledger = ResourceAllocation(user_id=neha.id, project_id=ledger.id, allocation_percentage=30,
                                     start_date=day(0), end_date=day(30))
    session.add_all([
        edge,
        priya_alpha,
        neha_ledger,
        BudgetEntry(project_id=alpha.id, category="LABOR", amount=Decimal("180000.00"), entry_date=day(-20)),
        BudgetEntry(project_id=alpha.id, category="VENDOR", amount=Decimal("120000.50"), entry_date=day(-10)),
    ])
    session.commit()
    return {
        "engineering": engineering, "finance": finance, "vikram": vikram, "priya": priya, "neha": neha,
        "alpha": alpha, "ledger": ledger, "api": api, "payments": payments, "mapping": mapping, "edge": edge,
        "priya_alpha": priya_alpha, "neha_ledger": neha_ledger,
    }


def test_load_snapshot_reads_every_fact_in_five_queries(
    db_session: Session, statement_log: Callable[[], list[str]]
) -> None:
    """Projects, deliverables, edges, allocations and spend come back as facts from five SELECTs."""
    rows = _insert_portfolio(db_session)
    ids = {name: obj.id for name, obj in rows.items()}

    statements = statement_log()
    snapshot = load_snapshot(db_session)
    executed = list(statements)

    assert len(executed) == 5, executed
    assert all(statement.lstrip().upper().startswith("SELECT") for statement in executed)

    assert snapshot.projects == (
        ProjectFact(
            id=ids["alpha"], name="Project Alpha", description="Payments platform",
            department_id=ids["engineering"], department_name="Engineering",
            project_manager_id=ids["vikram"], project_manager_name="Vikram Shah", status="ACTIVE",
            start_date=day(-60), end_date=day(25), planned_budget=Decimal("400000.00"),
        ),
        ProjectFact(
            id=ids["ledger"], name="Ledger Automation", description=None,
            department_id=ids["finance"], department_name="Finance",
            project_manager_id=None, project_manager_name=None, status="PLANNED",
            start_date=day(-10), end_date=day(90), planned_budget=Decimal("0.00"),
        ),
    )
    assert snapshot.deliverables == (
        DeliverableFact(
            id=ids["api"], project_id=ids["alpha"], title="API Schema", status="BLOCKED",
            completion_percentage=40, start_date=None, due_date=day(-5), assigned_user_id=ids["priya"],
            assigned_user_name="Priya Nair", blocked_reason="Awaiting security approval",
        ),
        DeliverableFact(
            id=ids["payments"], project_id=ids["alpha"], title="Payments Service Integration",
            status="IN_PROGRESS", completion_percentage=20, start_date=day(-20), due_date=day(10),
            assigned_user_id=None, assigned_user_name=None, blocked_reason=None,
        ),
        DeliverableFact(
            id=ids["mapping"], project_id=ids["ledger"], title="Chart of Accounts Mapping", status="DONE",
            completion_percentage=100, start_date=None, due_date=day(-15), assigned_user_id=None,
            assigned_user_name=None, blocked_reason=None,
        ),
    )
    assert snapshot.dependencies == (
        DependencyEdge(id=ids["edge"], predecessor_id=ids["api"], successor_id=ids["payments"]),
    )
    assert snapshot.allocations == (
        AllocationFact(
            id=ids["priya_alpha"], user_id=ids["priya"], user_name="Priya Nair",
            user_department_id=ids["engineering"], project_id=ids["alpha"], deliverable_id=ids["api"],
            allocation_percentage=60, start_date=day(-10), end_date=day(20),
        ),
        AllocationFact(
            id=ids["neha_ledger"], user_id=ids["neha"], user_name="Neha Kapoor", user_department_id=None,
            project_id=ids["ledger"], deliverable_id=None, allocation_percentage=30,
            start_date=day(0), end_date=day(30),
        ),
    )
    # Spend is summed in SQL; a project without entries has no row.
    assert dict(snapshot.spend_by_project) == {ids["alpha"]: Decimal("300000.50")}
    assert isinstance(snapshot.spend_by_project[ids["alpha"]], Decimal)


def test_loaded_snapshot_feeds_the_engines(db_session: Session) -> None:
    """A snapshot loaded from the database runs through every engine."""
    rows = _insert_portfolio(db_session)
    analysis = analyze_portfolio(load_snapshot(db_session), T)

    alpha = analysis.risks[rows["alpha"].id]
    budget = analysis.project_budgets[rows["alpha"].id]
    assert (budget.utilization_pct, budget.completion_pct) == (Decimal("75.0"), Decimal("30.0"))
    assert [item.title for item in alpha.impacted_deliverables] == ["Payments Service Integration"]
    assert alpha.factor("blocked").points == 10
    ledger_budget = analysis.project_budgets[rows["ledger"].id]
    assert (ledger_budget.actual_spend, ledger_budget.utilization_pct) == (Decimal("0.00"), None)


def test_empty_database_still_uses_five_queries(
    db_session: Session, statement_log: Callable[[], list[str]]
) -> None:
    """An empty portfolio loads as an empty snapshot with the same five statements."""
    statements = statement_log()
    snapshot = load_snapshot(db_session)
    assert len(statements) == 5
    assert snapshot == PortfolioSnapshot()
