"""Time helpers.

Every streak, window and heatmap cell in AnyHabit is anchored to a *calendar*
boundary, and a calendar boundary only means something inside a timezone.
Until 0.7 all of that maths ran in UTC, which meant a user in UTC-8 saw their
day roll over at 16:00 and a user in UTC+11 lost the last hours of theirs.
These helpers make the boundary follow the user instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

PERIODS = ("day", "week", "month", "year")
WEEK_STARTS = ("monday", "sunday", "saturday")

# Offset to subtract from ``datetime.weekday()`` (Monday == 0) to reach the
# configured first day of the week.
_WEEK_START_OFFSETS = {"monday": 0, "sunday": 1, "saturday": 2}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    """Normalise to an aware UTC datetime.

    Rows written by older versions are naive; they were always stored as UTC,
    so a missing tzinfo is interpreted as UTC rather than as local time.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def to_utc(value: datetime) -> datetime:
    normalized = ensure_utc(value)
    if normalized is None:
        raise ValueError("Datetime value is required")
    return normalized


@lru_cache(maxsize=256)
def resolve_timezone(name: str | None) -> ZoneInfo:
    """Look up an IANA zone, falling back to UTC for anything unusable.

    A bad value in the database must never take the API down, so this never
    raises — it degrades to the behaviour of every previous release.
    """
    if not name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return ZoneInfo("UTC")


def is_valid_timezone(name: str | None) -> bool:
    if not name:
        return False
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return False


@dataclass(frozen=True)
class PeriodContext:
    """The calendar a user's periods are measured against."""

    timezone_name: str = "UTC"
    week_start: str = "monday"

    @classmethod
    def for_user(cls, user) -> "PeriodContext":
        return cls(
            timezone_name=getattr(user, "timezone", None) or "UTC",
            week_start=(getattr(user, "week_start", None) or "monday").lower(),
        )

    @property
    def tzinfo(self) -> ZoneInfo:
        return resolve_timezone(self.timezone_name)

    @property
    def week_offset(self) -> int:
        return _WEEK_START_OFFSETS.get(self.week_start, 0)


UTC_CONTEXT = PeriodContext()


def to_local(value: datetime | None, context: PeriodContext) -> datetime:
    """Convert an instant into the user's wall-clock time."""
    normalized = ensure_utc(value) or utcnow()
    return normalized.astimezone(context.tzinfo)


def from_local_naive(naive_local: datetime, context: PeriodContext) -> datetime:
    """Turn a wall-clock datetime back into the UTC instant it names."""
    return naive_local.replace(tzinfo=context.tzinfo).astimezone(timezone.utc)


def local_date_key(value: datetime | None, context: PeriodContext) -> str:
    """``YYYY-MM-DD`` for the *user's* calendar day, not UTC's."""
    return to_local(value, context).strftime("%Y-%m-%d")


def _days_in_month(year: int, month: int) -> int:
    next_month = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    return (next_month - datetime(year, month, 1)).days


def _local_period_start_naive(local_value: datetime, period: str, context: PeriodContext) -> datetime:
    midnight = local_value.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

    if period == "week":
        weekday = (midnight.weekday() + context.week_offset) % 7
        return midnight - timedelta(days=weekday)
    if period == "month":
        return midnight.replace(day=1)
    if period == "year":
        return midnight.replace(month=1, day=1)
    return midnight


def period_start(value: datetime | None, period: str, context: PeriodContext = UTC_CONTEXT) -> datetime:
    """The UTC instant at which the containing local period began."""
    local_value = to_local(value, context)
    return from_local_naive(_local_period_start_naive(local_value, period, context), context)


def _shift_naive(naive_local: datetime, period: str, amount: int) -> datetime:
    if amount == 0:
        return naive_local
    if period == "week":
        return naive_local + timedelta(days=7 * amount)
    if period == "month":
        total_months = naive_local.year * 12 + (naive_local.month - 1) + amount
        year, month_index = divmod(total_months, 12)
        month = month_index + 1
        return naive_local.replace(year=year, month=month, day=min(naive_local.day, _days_in_month(year, month)))
    if period == "year":
        year = naive_local.year + amount
        return naive_local.replace(year=year, day=min(naive_local.day, _days_in_month(year, naive_local.month)))
    return naive_local + timedelta(days=amount)


def shift_period(value: datetime, period: str, amount: int, context: PeriodContext = UTC_CONTEXT) -> datetime:
    """Move by whole periods in local wall-clock terms.

    Doing the arithmetic on the naive local value and re-localising afterwards
    is what keeps "one day later" meaning the next local midnight across a
    daylight-saving change, rather than drifting by an hour.
    """
    local_naive = to_local(value, context).replace(tzinfo=None)
    return from_local_naive(_shift_naive(local_naive, period, amount), context)


def add_period(value: datetime, period: str, context: PeriodContext = UTC_CONTEXT) -> datetime:
    return shift_period(value, period, 1, context)


def periods_between(start_value: datetime, end_value: datetime, period: str, context: PeriodContext = UTC_CONTEXT) -> int:
    """Whole periods from ``start_value`` to ``end_value`` on the local calendar."""
    start_local = _local_period_start_naive(to_local(start_value, context), period, context)
    end_local = _local_period_start_naive(to_local(end_value, context), period, context)

    if period == "week":
        return (end_local - start_local).days // 7
    if period == "month":
        return (end_local.year - start_local.year) * 12 + (end_local.month - start_local.month)
    if period == "year":
        return end_local.year - start_local.year
    return (end_local - start_local).days


def format_short_date(value: datetime, context: PeriodContext = UTC_CONTEXT) -> str:
    """``Mar 4`` style label. Avoids ``%-d``, which is not portable to Windows."""
    local_value = to_local(value, context)
    return f"{local_value.strftime('%b')} {local_value.day}"


# Backwards-compatible aliases used by older call sites.
def utcnow_naive() -> datetime:
    return utcnow()


def to_utc_naive(value: datetime) -> datetime:
    return to_utc(value)
