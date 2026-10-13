"""
Time and capacity calculations.

Business rule: every employee is assumed to work 8 hours per weekday, so a
person's planned capacity on a project is ``weekdays(start, end) * 8``.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from . import config


def business_days(start: date, end: date) -> int:
    """Count Monday-Friday days between ``start`` and ``end`` inclusive."""
    if end < start:
        return 0
    total_days = (end - start).days + 1
    full_weeks, remainder = divmod(total_days, 7)
    count = full_weeks * 5
    for offset in range(remainder):
        if (start + timedelta(days=full_weeks * 7 + offset)).weekday() < 5:
            count += 1
    return count


def planned_hours(start: date, end: date, people: int) -> int:
    """Planned capacity in hours for ``people`` working the whole period."""
    return business_days(start, end) * config.HOURS_PER_DAY * max(people, 0)


def hours_to_days(hours: Decimal | float | int) -> float:
    """Convert hours to 8-hour person-days, rounded to one decimal."""
    return round(float(hours) / config.HOURS_PER_DAY, 1)


def percent(part: float, whole: float) -> Optional[float]:
    """Safe percentage rounded to one decimal (None when whole is 0)."""
    if not whole:
        return None
    return round(100.0 * float(part) / float(whole), 1)
