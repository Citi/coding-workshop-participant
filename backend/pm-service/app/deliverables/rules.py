"""Pure deliverable rules (no database), shared by the service and unit-tested directly."""

from datetime import date

COMPLETED = "completed"


def is_overdue(status: str, due_date: date, today: date) -> bool:
    """Not completed and the due date has passed (a deliverable due today is not overdue yet)."""
    return status != COMPLETED and due_date < today


def direct_prerequisites(chain: list[dict]) -> list[dict]:
    """The depth-1 entries of a dependency chain (its direct prerequisites), without ``depth``."""
    return [{key: value for key, value in item.items() if key != "depth"} for item in chain if item["depth"] == 1]


def format_ids(ids) -> str:
    """``[3, 1]`` -> ``"1, 3"`` for user-facing messages."""
    return ", ".join(str(value) for value in sorted(ids))
