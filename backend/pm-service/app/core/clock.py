"""Single source of "today" for business rules (UTC). Tests monkeypatch ``clock.today``.

Always call it as ``clock.today()`` (import the module, not the function) so patching works.
"""

from datetime import UTC, date, datetime


def today() -> date:
    return datetime.now(UTC).date()


def now() -> datetime:
    return datetime.now(UTC)
