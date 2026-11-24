"""Business rules for project health, progress and budget (pure functions, no database).

Rules (documented in the README):
* Progress % = completed deliverables / all deliverables.
* Health is only evaluated for planned / active / on-hold projects (closed projects -> None):
    - overdue  : today is after the project's end date
    - at_risk  : any deliverable overdue or blocked, or time elapsed % is more than
                 SCHEDULE_SLIPPAGE_POINTS ahead of progress %
    - on_track : otherwise
* Budget: spent = sum of expenses; used % = spent / budget; over budget when spent > budget.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

SCHEDULE_SLIPPAGE_POINTS = 20
CLOSED_STATUSES = frozenset({"completed", "cancelled"})
HEALTH_VALUES = ("on_track", "at_risk", "overdue")


def whole_percent(part: int, whole: int) -> int:
    """part / whole as a whole percentage, halves rounded up like the budget % and the UI (1 of 8 -> 13)."""
    return int((Decimal(part) * 100 / Decimal(whole)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def progress_percent(total: int, completed: int) -> int:
    return whole_percent(completed, total) if total else 0


def elapsed_percent(start_date: date, end_date: date, today: date) -> int:
    if today <= start_date:
        return 0
    if today >= end_date:
        return 100
    span = (end_date - start_date).days
    return whole_percent((today - start_date).days, span) if span > 0 else 100


def _deliverables(count: int) -> str:
    return f"{count} deliverable{'' if count == 1 else 's'}"


def _display_date(value: date) -> str:
    """Same style as the web app's dates: 'Jun 1, 2026'."""
    return f"{value:%b} {value.day}, {value.year}"


def evaluate_health(*, status, start_date, end_date, total, completed, overdue, blocked, today):
    """Return ``(health, reasons)``; health is None for completed/cancelled projects."""
    if status in CLOSED_STATUSES:
        return None, []
    reasons = []
    if today > end_date:
        reasons.append(f"End date {_display_date(end_date)} has passed")
    if overdue:
        reasons.append(f"{_deliverables(overdue)} overdue")
    if blocked:
        reasons.append(f"{_deliverables(blocked)} blocked")
    progress = progress_percent(total, completed)
    elapsed = elapsed_percent(start_date, end_date, today)
    if elapsed - progress > SCHEDULE_SLIPPAGE_POINTS:
        reasons.append(f"{elapsed}% of the schedule has elapsed but only {progress}% of deliverables are complete")
    if today > end_date:
        return "overdue", reasons
    return ("at_risk" if reasons else "on_track"), reasons


def _money(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def budget_summary(budget, spent) -> dict:
    budget = _money(budget)
    spent = _money(spent)
    if budget > 0:
        used = float((spent * 100 / budget).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    else:
        used = 0.0 if spent == 0 else None  # spending against a zero budget has no meaningful %
    return {
        "budget_spent": spent,
        "budget_remaining": budget - spent,
        "budget_used_percent": used,
        "over_budget": spent > budget,
    }
