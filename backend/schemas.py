from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

TRACKER_TYPES = {"quit", "build", "boolean"}
PERIODS = {"day", "week", "month", "year"}
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 200

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------------------
# Users and auth
# ---------------------------------------------------------------------------


def _validate_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(value) > MAX_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters long")
    return value


class UserBase(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not _EMAIL_PATTERN.match(normalized):
            raise ValueError("Enter a valid email address")
        return normalized

    @field_validator("username")
    @classmethod
    def _check_username(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Username is required")
        return normalized


class UserCreate(UserBase):
    password: str

    _check_password = field_validator("password")(_validate_password)


class UserLogin(BaseModel):
    identifier: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    _check_password = field_validator("new_password")(_validate_password)


class UserPreferences(BaseModel):
    """Everything a user can change about how their data is presented."""

    timezone: Optional[str] = None
    week_start: Optional[Literal["monday", "sunday", "saturday"]] = None
    username: Optional[str] = Field(default=None, max_length=64)


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    created_at: Optional[datetime] = None
    timezone: str = "UTC"
    week_start: str = "monday"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------


class GroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class GroupCreate(GroupBase):
    pass


class GroupUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class GroupJoin(BaseModel):
    join_code: str = Field(min_length=1, max_length=32)


class GroupMember(BaseModel):
    user: User
    role: str = "member"
    joined_at: Optional[datetime] = None


class Group(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    join_code: str
    owner_id: int
    member_count: int = 0
    members: list[GroupMember] = Field(default_factory=list)
    tracker_count: int = 0
    is_owner: bool = False


# ---------------------------------------------------------------------------
# Trackers
# ---------------------------------------------------------------------------


class TrackerParticipant(BaseModel):
    user: User
    role: str = "participant"
    added_at: Optional[datetime] = None


class TrackerCurrentMath(BaseModel):
    main_unit: float = 0.0
    target_unit: float = 0.0
    impact_value: float = 0.0
    # Totals across the tracker's whole life, ignoring relapse resets.
    lifetime_main_unit: float = 0.0
    lifetime_impact_value: float = 0.0


class TrackerDailyProgress(BaseModel):
    total: float = 0.0
    target: float = 0.0
    percentage: float = 0.0
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None


class TrackerStreakStats(BaseModel):
    current: int = 0
    longest: int = 0
    period_label: str = "days"
    total_relapses: int = 0


class TrackerConsistency(BaseModel):
    completed_periods: int = 0
    total_periods: int = 0
    rate: float = 0.0
    recent_rate: float = 0.0
    recent_window: int = 0


class TrackerWeekdayStat(BaseModel):
    weekday: int
    label: str
    total: float = 0.0
    entries: int = 0


class TrackerMoodPoint(BaseModel):
    date: str
    average: float
    entries: int = 0


class TrackerMemberProgress(BaseModel):
    user: User
    current_math: TrackerCurrentMath
    daily_progress: TrackerDailyProgress
    streak_stats: TrackerStreakStats
    last_activity_at: Optional[datetime] = None


class TrackerLeaderboardEntry(TrackerMemberProgress):
    pass


class GroupStreakStats(BaseModel):
    current: int = 0
    longest: int = 0
    period_label: str = "days"
    rule_label: str = "All assigned members"


class TrackerShareStats(BaseModel):
    member_count: int = 0
    tracker_participants: list[TrackerParticipant] = Field(default_factory=list)
    leaderboard: list[TrackerLeaderboardEntry] = Field(default_factory=list)
    group_streak_stats: Optional[GroupStreakStats] = None


class TrackerBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    color: str = Field(default="", max_length=32)
    category: str = Field(default="General", max_length=60)
    type: str
    impact_amount: float = Field(default=0.0, ge=0)
    impact_unit: str = Field(default="$", max_length=16)
    impact_per: str = "day"
    unit: str = Field(default="", max_length=32)
    units_per_amount: float = Field(default=0.0, ge=0)
    units_per: str = "day"
    units_per_interval: int = Field(default=1, ge=1, le=365)
    is_active: bool = True
    group_id: Optional[int] = None
    participant_ids: list[int] = Field(default_factory=list)

    @field_validator("type")
    @classmethod
    def _check_type(cls, value: str) -> str:
        if value not in TRACKER_TYPES:
            raise ValueError(f"Tracker type must be one of: {', '.join(sorted(TRACKER_TYPES))}")
        return value

    @field_validator("impact_per", "units_per")
    @classmethod
    def _check_period(cls, value: str) -> str:
        if value not in PERIODS:
            raise ValueError(f"Period must be one of: {', '.join(sorted(PERIODS))}")
        return value

    @field_validator("category")
    @classmethod
    def _check_category(cls, value: str) -> str:
        return value.strip() or "General"


class TrackerCreate(TrackerBase):
    start_date: Optional[datetime] = None


class TrackerUpdate(BaseModel):
    """PATCH payload — every field optional.

    Only fields actually present in the request body are applied, so a client
    can send one key without accidentally resetting the rest of the tracker.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    color: Optional[str] = Field(default=None, max_length=32)
    category: Optional[str] = Field(default=None, max_length=60)
    type: Optional[str] = None
    impact_amount: Optional[float] = Field(default=None, ge=0)
    impact_unit: Optional[str] = Field(default=None, max_length=16)
    impact_per: Optional[str] = None
    unit: Optional[str] = Field(default=None, max_length=32)
    units_per_amount: Optional[float] = Field(default=None, ge=0)
    units_per: Optional[str] = None
    units_per_interval: Optional[int] = Field(default=None, ge=1, le=365)
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    group_id: Optional[int] = None
    participant_ids: Optional[list[int]] = None

    @field_validator("type")
    @classmethod
    def _check_type(cls, value: str | None) -> str | None:
        if value is not None and value not in TRACKER_TYPES:
            raise ValueError(f"Tracker type must be one of: {', '.join(sorted(TRACKER_TYPES))}")
        return value

    @field_validator("impact_per", "units_per")
    @classmethod
    def _check_period(cls, value: str | None) -> str | None:
        if value is not None and value not in PERIODS:
            raise ValueError(f"Period must be one of: {', '.join(sorted(PERIODS))}")
        return value

    @field_validator("category")
    @classmethod
    def _check_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or "General"


class Tracker(TrackerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: Optional[int] = None
    start_date: datetime
    current_streak_start_date: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    visibility: str = "private"
    participant_count: int = 0


class TrackerChartPoint(BaseModel):
    date: str
    label: str
    value: float
    cumulative: Optional[float] = None


class TrackerHeatmapCell(BaseModel):
    date: str
    amount: float
    is_filler: bool = False
    is_relapse: bool = False


class TrackerHeatmap(BaseModel):
    columns: list[list[TrackerHeatmapCell]]
    max_amount: float = 0.0


class TrackerAnalytics(BaseModel):
    tracker_id: Optional[int] = None
    current_math: TrackerCurrentMath
    daily_progress: TrackerDailyProgress
    historical_chart_data: list[TrackerChartPoint]
    streak_stats: TrackerStreakStats
    build_heatmap: Optional[TrackerHeatmap] = None
    consistency: TrackerConsistency = Field(default_factory=TrackerConsistency)
    weekday_breakdown: list[TrackerWeekdayStat] = Field(default_factory=list)
    mood_trend: list[TrackerMoodPoint] = Field(default_factory=list)
    effective_start_date: Optional[datetime] = None
    log_count: int = 0
    journal_count: int = 0
    timezone: str = "UTC"
    member_progress: list[TrackerMemberProgress] = Field(default_factory=list)
    share_stats: Optional[TrackerShareStats] = None
    current_user_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Journals and logs
# ---------------------------------------------------------------------------


class JournalEntryBase(BaseModel):
    mood: Optional[int] = Field(default=None, ge=1, le=5)
    content: str = Field(min_length=1, max_length=10000)


class JournalEntryCreate(JournalEntryBase):
    timestamp: Optional[datetime] = None


class JournalEntry(JournalEntryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tracker_id: int
    user_id: Optional[int] = None
    timestamp: datetime
    is_relapse: bool = False


class HabitLogBase(BaseModel):
    amount: float = Field(default=1.0)
    note: str = Field(default="", max_length=500)


class HabitLogCreate(HabitLogBase):
    # Accepted in the body so clients do not have to pass it as a query
    # parameter; the legacy query parameter still wins when both are sent.
    timestamp: Optional[datetime] = None


class HabitLogUpdate(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = Field(default=None, max_length=500)
    timestamp: Optional[datetime] = None


class HabitLog(HabitLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tracker_id: int
    user_id: Optional[int] = None
    timestamp: datetime


class TrackerBundle(BaseModel):
    tracker: Tracker
    habit_logs: list[HabitLog]
    journal_entries: list[JournalEntry]
    analytics: TrackerAnalytics
    group: Optional[Group] = None
    share_stats: Optional[TrackerShareStats] = None


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


class DashboardStatePayload(BaseModel):
    widgets: list[dict[str, Any]] = Field(default_factory=list, max_length=60)
    layouts: dict[str, Any] = Field(default_factory=dict)


class DashboardStateResponse(DashboardStatePayload):
    updated_at: Optional[datetime] = None


class DashboardOverview(BaseModel):
    total: int = 0
    active: int = 0
    paused: int = 0
    categories: int = 0
    groups: int = 0
    by_type: dict[str, int] = Field(default_factory=dict)
    shared_trackers: int = 0
    active_streaks: int = 0
    longest_active_streak: int = 0
    due_today: int = 0
    completed_today: int = 0


class DashboardCategoryStat(BaseModel):
    category: str
    count: int = 0


class DashboardImpactRow(BaseModel):
    tracker: Tracker
    main_amount: float = 0.0
    impact_value: float = 0.0
    month_impact: float = 0.0
    current_streak: int = 0
    streak_label: str = "days"
    progress_percentage: float = 0.0
    mode_label: str = ""


class DashboardSummary(BaseModel):
    overview: DashboardOverview
    category_breakdown: list[DashboardCategoryStat]
    impact_rows: list[DashboardImpactRow]
    top_impact_rows: list[DashboardImpactRow]


class DailyStat(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: str
    total_amount: float


# ---------------------------------------------------------------------------
# Backup / restore
# ---------------------------------------------------------------------------


class ImportSummary(BaseModel):
    """What an import did, or would do when ``dry_run`` is set."""

    dry_run: bool = True
    mode: str = "merge"
    trackers_created: int = 0
    trackers_updated: int = 0
    trackers_skipped: int = 0
    logs_created: int = 0
    journals_created: int = 0
    trackers_deleted: int = 0
    warnings: list[str] = Field(default_factory=list)
    source_version: Optional[str] = None
    source_exported_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Developer surface: tokens, webhooks, activity
# ---------------------------------------------------------------------------


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    # Days until expiry. Omit for a token that never expires.
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=3650)
    scope: Literal["read", "read_write"] = "read_write"


class ApiToken(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    token_prefix: str = ""
    scope: str = "read_write"
    created_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


class ApiTokenCreated(ApiToken):
    """Returned once, at creation. ``token`` is never retrievable again."""

    token: str


class WebhookBase(BaseModel):
    name: str = Field(default="", max_length=80)
    url: str = Field(min_length=1, max_length=2000)
    events: str = Field(default="*", max_length=500)
    is_active: bool = True

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("Webhook URL must start with http:// or https://")
        return normalized


class WebhookCreate(WebhookBase):
    pass


class WebhookUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    url: Optional[str] = Field(default=None, max_length=2000)
    events: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("Webhook URL must start with http:// or https://")
        return normalized


class Webhook(WebhookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    secret: str = ""
    created_at: Optional[datetime] = None
    last_status: Optional[int] = None
    last_error: str = ""
    last_triggered_at: Optional[datetime] = None
    delivery_count: int = 0
    failure_count: int = 0


class ActivityEntry(BaseModel):
    """One row in the dashboard activity/journal feeds."""

    kind: str
    id: int
    tracker_id: int
    tracker_name: str
    tracker_color: str = ""
    timestamp: datetime
    amount: Optional[float] = None
    unit: str = ""
    note: str = ""
    content: str = ""
    mood: Optional[int] = None
    is_relapse: bool = False


class ActivityFeed(BaseModel):
    logs: list[ActivityEntry] = Field(default_factory=list)
    journals: list[ActivityEntry] = Field(default_factory=list)
    mood_trend: list[TrackerMoodPoint] = Field(default_factory=list)


class SystemInfo(BaseModel):
    name: str
    version: str
    schema_version: int
    database_ready: bool = True
    migrations_applied_on_boot: list[str] = Field(default_factory=list)
    backup_created_on_boot: Optional[str] = None
