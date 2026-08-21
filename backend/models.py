from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint

from .database import Base
from .time_utils import utcnow


class Tracker(Base):
    __tablename__ = "trackers"
    __table_args__ = (Index("ix_trackers_owner_archived", "owner_id", "archived_at"),)

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, default="")
    color = Column(String, default="")
    category = Column(String, default="General", index=True)
    type = Column(String)
    start_date = Column(DateTime(timezone=True), default=utcnow)
    current_streak_start_date = Column(DateTime(timezone=True), default=utcnow)
    impact_amount = Column(Float, default=0.0)
    impact_unit = Column(String, default="$")
    impact_per = Column(String)
    unit = Column(String)
    units_per_amount = Column(Float, default=0.0)
    units_per = Column(String)
    units_per_interval = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    visibility = Column(String, default="private", index=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    is_active = Column(Boolean, default=True)

    # Presentation preferences.  ``timezone`` is the IANA zone the user's day
    # boundaries are computed in — without it every streak would roll over at
    # UTC midnight regardless of where the user actually lives.
    timezone = Column(String, default="UTC")
    week_start = Column(String, default="monday")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    join_code = Column(String, unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role = Column(String, default="member")
    joined_at = Column(DateTime(timezone=True), default=utcnow)


class TrackerParticipant(Base):
    __tablename__ = "tracker_participants"
    __table_args__ = (UniqueConstraint("tracker_id", "user_id", name="uq_tracker_participants_tracker_user"),)

    id = Column(Integer, primary_key=True, index=True)
    tracker_id = Column(Integer, ForeignKey("trackers.id", ondelete="CASCADE"), index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role = Column(String, default="participant")
    added_at = Column(DateTime(timezone=True), default=utcnow)


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    __table_args__ = (Index("ix_journal_entries_tracker_user", "tracker_id", "user_id"),)

    id = Column(Integer, primary_key=True, index=True)
    tracker_id = Column(Integer, ForeignKey("trackers.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow)
    mood = Column(Integer, nullable=True)
    content = Column(String)
    is_relapse = Column(Boolean, default=False)


class HabitLog(Base):
    __tablename__ = "habit_logs"
    __table_args__ = (Index("ix_habit_logs_tracker_user", "tracker_id", "user_id"),)

    id = Column(Integer, primary_key=True, index=True)
    tracker_id = Column(Integer, ForeignKey("trackers.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow)
    amount = Column(Float, default=1.0)
    note = Column(Text, default="")


class UserDashboardState(Base):
    __tablename__ = "user_dashboard_states"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_dashboard_state_name"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name = Column(String, index=True, default="home")
    widgets_json = Column(Text, default="[]")
    layouts_json = Column(Text, default="{}")
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ApiToken(Base):
    """A long-lived personal access token.

    Sessions expire and live in an HttpOnly cookie, which is deliberately
    awkward to use from a script. These are what you point cron, Home Assistant
    or your own dashboard at. Only a hash is stored — the plaintext is shown
    once, at creation, and cannot be recovered afterwards.
    """

    __tablename__ = "api_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name = Column(String, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    # First characters of the token, so the UI can tell two tokens apart.
    token_prefix = Column(String, index=True, default="")
    scope = Column(String, default="read_write")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class Webhook(Base):
    """An outbound HTTP callback fired when something happens.

    The point of self-hosting is wiring the app into everything else you run,
    so a log entry can light up a Home Assistant scene or post to Discord.
    """

    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name = Column(String, default="")
    url = Column(String, nullable=False)
    # Comma-separated event names; "*" means everything.
    events = Column(String, default="*")
    secret = Column(String, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    # Last delivery outcome, so a broken hook is visible without log diving.
    last_status = Column(Integer, nullable=True)
    last_error = Column(Text, default="")
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    delivery_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)


class SchemaMigration(Base):
    """Ledger of applied migrations.

    Its presence is what lets the runner tell a fresh install from an upgrade,
    which in turn decides whether a safety backup is worth taking.
    """

    __tablename__ = "schema_migrations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    applied_at = Column(DateTime(timezone=True), default=utcnow)
    app_version = Column(String, default="")
