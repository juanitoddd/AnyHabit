"""Schema migrations and the upgrade-safety net around them.

AnyHabit is self-hosted, so an upgrade is usually "pull the new image and
restart".  Nobody is standing by with a database console when that goes wrong,
which drives two rules here:

1. **Never destroy data.**  Every migration is additive and idempotent, so
   re-running it against an already-upgraded database is a no-op.
2. **Always leave an escape hatch.**  Before the first migration touches an
   existing database, a byte-for-byte copy is written to ``data/backups/``.
   If an upgrade goes sideways the operator can stop the container, restore
   the copy, and pin the previous image.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .database import DATABASE_PATH, engine
from .security import BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_USERNAME, hash_password
from .version import APP_VERSION

logger = logging.getLogger("anyhabit.migrations")

BACKUP_DIR = Path(os.environ.get("ANYHABIT_BACKUP_DIR", str(DATABASE_PATH.parent / "backups")))
BACKUP_RETENTION = max(1, int(os.environ.get("ANYHABIT_BACKUP_RETENTION", "10")))
BACKUP_ENABLED = os.environ.get("ANYHABIT_AUTO_BACKUP", "true").strip().lower() in {"1", "true", "yes", "on"}


# ---------------------------------------------------------------------------
# Introspection helpers
# ---------------------------------------------------------------------------


def _table_exists(connection: Connection, table_name: str) -> bool:
    return (
        connection.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name = :table_name"),
            {"table_name": table_name},
        ).first()
        is not None
    )


def _column_names(connection: Connection, table_name: str) -> set[str]:
    if not _table_exists(connection, table_name):
        return set()
    return {row[1] for row in connection.execute(text(f"PRAGMA table_info({table_name})"))}


def _add_column_if_missing(connection: Connection, table: str, column: str, ddl: str) -> None:
    """``ALTER TABLE ... ADD COLUMN`` guarded by a PRAGMA check.

    SQLite has no ``ADD COLUMN IF NOT EXISTS``, and re-adding an existing
    column is a hard error, so every column migration goes through here.
    """
    if not _table_exists(connection, table):
        return
    if column in _column_names(connection, table):
        return
    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
    logger.info("Added column %s.%s", table, column)


def _resolve_primary_user_id(connection: Connection) -> int | None:
    """Find the account that inherits data from before AnyHabit had accounts.

    Pre-0.5 databases have trackers, logs and journals with no ``user_id`` at
    all.  Those rows are adopted by the bootstrap account when it exists — but
    a self-hoster who changed ``ANYHABIT_BOOTSTRAP_EMAIL`` before upgrading
    would otherwise leave every legacy row orphaned and invisible, so fall back
    to the oldest account in the database.
    """
    if not _table_exists(connection, "users"):
        return None

    row = connection.execute(
        text("SELECT id FROM users WHERE email = :email"), {"email": BOOTSTRAP_EMAIL}
    ).first()
    if row:
        return int(row[0])

    row = connection.execute(text("SELECT id FROM users ORDER BY id ASC LIMIT 1")).first()
    return int(row[0]) if row else None


# ---------------------------------------------------------------------------
# Backups
# ---------------------------------------------------------------------------


def create_backup(label: str = "upgrade") -> Path | None:
    """Snapshot the SQLite database using the online backup API.

    A plain file copy can tear when WAL mode is on; ``sqlite3.Connection.backup``
    produces a consistent snapshot even while the database is open.
    """
    if not DATABASE_PATH.exists() or DATABASE_PATH.stat().st_size == 0:
        return None

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = BACKUP_DIR / f"anyhabit-{label}-v{APP_VERSION}-{stamp}.db"

    source = sqlite3.connect(str(DATABASE_PATH))
    try:
        target = sqlite3.connect(str(destination))
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()

    logger.info("Wrote database backup to %s", destination)
    _prune_backups()
    return destination


def _prune_backups() -> None:
    backups = sorted(BACKUP_DIR.glob("anyhabit-*.db"), key=lambda path: path.stat().st_mtime, reverse=True)
    for stale in backups[BACKUP_RETENTION:]:
        try:
            stale.unlink()
        except OSError:  # pragma: no cover - best effort housekeeping
            logger.warning("Could not remove old backup %s", stale)


# ---------------------------------------------------------------------------
# Migrations
#
# Each entry is (name, callable).  Names are permanent identifiers — renaming
# one makes an already-applied migration look pending, so don't.
# ---------------------------------------------------------------------------


def _m_group_tables(connection: Connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS groups ("
            "id INTEGER PRIMARY KEY, "
            "name VARCHAR NOT NULL, "
            "join_code VARCHAR NOT NULL UNIQUE, "
            "owner_id INTEGER, "
            "created_at DATETIME"
            ")"
        )
    )
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS group_members ("
            "id INTEGER PRIMARY KEY, "
            "group_id INTEGER, "
            "user_id INTEGER, "
            "role VARCHAR DEFAULT 'member', "
            "joined_at DATETIME, "
            "UNIQUE(group_id, user_id)"
            ")"
        )
    )
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS tracker_participants ("
            "id INTEGER PRIMARY KEY, "
            "tracker_id INTEGER, "
            "user_id INTEGER, "
            "role VARCHAR DEFAULT 'participant', "
            "added_at DATETIME, "
            "UNIQUE(tracker_id, user_id)"
            ")"
        )
    )


def _m_seed_bootstrap_user(connection: Connection) -> None:
    """Create the first login for a database that has none.

    Only fires when the users table is empty, so it can never clobber real
    accounts on a re-run or on an install that already has users.
    """
    if not _table_exists(connection, "users"):
        return
    if connection.execute(text("SELECT id FROM users LIMIT 1")).first() is not None:
        return

    # Only the columns every historical schema is guaranteed to have — the
    # preference columns arrive in 0013 and are back-filled with defaults there.
    connection.execute(
        text(
            "INSERT INTO users (username, email, password_hash, created_at, is_active) "
            "VALUES (:username, :email, :password_hash, CURRENT_TIMESTAMP, 1)"
        ),
        {
            "username": BOOTSTRAP_USERNAME,
            "email": BOOTSTRAP_EMAIL,
            "password_hash": hash_password(BOOTSTRAP_PASSWORD),
        },
    )
    logger.info("Seeded bootstrap account %s", BOOTSTRAP_EMAIL)


def _m_tracker_category(connection: Connection) -> None:
    _add_column_if_missing(connection, "trackers", "category", "VARCHAR DEFAULT 'General'")


def _m_tracker_impact(connection: Connection) -> None:
    _add_column_if_missing(connection, "trackers", "impact_amount", "FLOAT DEFAULT 0.0")
    _add_column_if_missing(connection, "trackers", "impact_unit", "VARCHAR DEFAULT '$'")
    _add_column_if_missing(connection, "trackers", "impact_per", "VARCHAR DEFAULT 'day'")

    columns = _column_names(connection, "trackers")

    # v0.4 and earlier called this "money saved"; carry those values across so
    # nobody's savings counter resets to zero on upgrade.
    if "money_saved_amount" in columns:
        connection.execute(
            text(
                "UPDATE trackers SET impact_amount = COALESCE(money_saved_amount, 0.0) "
                "WHERE impact_amount IS NULL OR impact_amount = 0.0"
            )
        )
    if "money_saved_per" in columns:
        connection.execute(
            text(
                "UPDATE trackers SET impact_per = COALESCE(money_saved_per, 'day') "
                "WHERE impact_per IS NULL OR impact_per = ''"
            )
        )


def _m_tracker_ownership(connection: Connection) -> None:
    _add_column_if_missing(connection, "trackers", "owner_id", "INTEGER")
    _add_column_if_missing(connection, "trackers", "group_id", "INTEGER")
    _add_column_if_missing(connection, "trackers", "visibility", "VARCHAR DEFAULT 'private'")


def _m_tracker_streak_start(connection: Connection) -> None:
    _add_column_if_missing(connection, "trackers", "current_streak_start_date", "DATETIME")
    if _table_exists(connection, "trackers"):
        connection.execute(
            text("UPDATE trackers SET current_streak_start_date = start_date WHERE current_streak_start_date IS NULL")
        )


def _m_tracker_units_per_interval(connection: Connection) -> None:
    _add_column_if_missing(connection, "trackers", "units_per_interval", "INTEGER DEFAULT 1")
    if _table_exists(connection, "trackers"):
        connection.execute(
            text("UPDATE trackers SET units_per_interval = 1 WHERE units_per_interval IS NULL OR units_per_interval < 1")
        )


def _m_activity_user_columns(connection: Connection) -> None:
    _add_column_if_missing(connection, "journal_entries", "user_id", "INTEGER")
    _add_column_if_missing(connection, "habit_logs", "user_id", "INTEGER")


def _m_journal_relapse(connection: Connection) -> None:
    _add_column_if_missing(connection, "journal_entries", "is_relapse", "BOOLEAN DEFAULT 0")
    if not _table_exists(connection, "journal_entries"):
        return

    # Relapses used to be identified only by their auto-generated text.  Flag
    # those historical rows so streak maths keeps seeing them.
    connection.execute(
        text(
            "UPDATE journal_entries SET is_relapse = 1 "
            "WHERE (is_relapse IS NULL OR is_relapse = 0) "
            "AND content = 'Logged a relapse. Timer was reset to zero.'"
        )
    )


def _m_dashboard_state_table(connection: Connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS user_dashboard_states ("
            "id INTEGER PRIMARY KEY, "
            "user_id INTEGER, "
            "name VARCHAR DEFAULT 'home', "
            "widgets_json TEXT DEFAULT '[]', "
            "layouts_json TEXT DEFAULT '{}', "
            "updated_at DATETIME, "
            "UNIQUE(user_id, name)"
            ")"
        )
    )


def _m_adopt_legacy_rows(connection: Connection) -> None:
    """Give pre-accounts data an owner so it stays visible after upgrading."""
    primary_user_id = _resolve_primary_user_id(connection)
    if primary_user_id is None:
        return

    if _table_exists(connection, "trackers"):
        connection.execute(
            text(
                "UPDATE trackers SET owner_id = COALESCE(owner_id, :user_id), "
                "visibility = COALESCE(visibility, 'private')"
            ),
            {"user_id": primary_user_id},
        )
    if _table_exists(connection, "journal_entries"):
        connection.execute(
            text("UPDATE journal_entries SET user_id = COALESCE(user_id, :user_id)"),
            {"user_id": primary_user_id},
        )
    if _table_exists(connection, "habit_logs"):
        connection.execute(
            text("UPDATE habit_logs SET user_id = COALESCE(user_id, :user_id)"),
            {"user_id": primary_user_id},
        )

    # Owners must appear in tracker_participants for shared-tracker analytics
    # to see them; back-fill any tracker that predates that table.
    if _table_exists(connection, "trackers") and _table_exists(connection, "tracker_participants"):
        connection.execute(
            text(
                "INSERT OR IGNORE INTO tracker_participants (tracker_id, user_id, role, added_at) "
                "SELECT id, owner_id, 'owner', CURRENT_TIMESTAMP FROM trackers WHERE owner_id IS NOT NULL"
            )
        )


def _m_seed_dashboard_from_legacy(connection: Connection) -> None:
    """Move the single shared dashboard of pre-accounts builds onto its owner."""
    if not _table_exists(connection, "dashboard_states"):
        return

    primary_user_id = _resolve_primary_user_id(connection)
    if primary_user_id is None:
        return

    existing_state = connection.execute(
        text("SELECT widgets_json, layouts_json, updated_at FROM dashboard_states WHERE name = 'home' LIMIT 1")
    ).first()
    if existing_state is None:
        return

    connection.execute(
        text(
            "INSERT OR IGNORE INTO user_dashboard_states (user_id, name, widgets_json, layouts_json, updated_at) "
            "VALUES (:user_id, 'home', :widgets_json, :layouts_json, :updated_at)"
        ),
        {
            "user_id": primary_user_id,
            "widgets_json": existing_state[0],
            "layouts_json": existing_state[1],
            "updated_at": existing_state[2],
        },
    )


def _m_user_preferences(connection: Connection) -> None:
    """0.7: per-user timezone and week start.

    Existing users keep UTC, which is exactly how their streaks were already
    being calculated, so nobody's numbers move until they opt in.
    """
    _add_column_if_missing(connection, "users", "timezone", "VARCHAR DEFAULT 'UTC'")
    _add_column_if_missing(connection, "users", "week_start", "VARCHAR DEFAULT 'monday'")

    if _table_exists(connection, "users"):
        connection.execute(text("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL OR timezone = ''"))
        connection.execute(
            text("UPDATE users SET week_start = 'monday' WHERE week_start IS NULL OR week_start = ''")
        )


def _m_tracker_details(connection: Connection) -> None:
    """0.7: notes, colour and archiving for trackers."""
    _add_column_if_missing(connection, "trackers", "description", "TEXT DEFAULT ''")
    _add_column_if_missing(connection, "trackers", "color", "VARCHAR DEFAULT ''")
    _add_column_if_missing(connection, "trackers", "archived_at", "DATETIME")


def _m_habit_log_note(connection: Connection) -> None:
    """0.7: optional free-text note attached to a single log entry."""
    _add_column_if_missing(connection, "habit_logs", "note", "TEXT DEFAULT ''")


def _m_performance_indexes(connection: Connection) -> None:
    """Indexes the analytics and list endpoints lean on."""
    statements = [
        ("habit_logs", "CREATE INDEX IF NOT EXISTS ix_habit_logs_tracker_user ON habit_logs (tracker_id, user_id)"),
        (
            "journal_entries",
            "CREATE INDEX IF NOT EXISTS ix_journal_entries_tracker_user ON journal_entries (tracker_id, user_id)",
        ),
        ("trackers", "CREATE INDEX IF NOT EXISTS ix_trackers_owner_archived ON trackers (owner_id, archived_at)"),
        (
            "tracker_participants",
            "CREATE INDEX IF NOT EXISTS ix_tracker_participants_user ON tracker_participants (user_id)",
        ),
        ("group_members", "CREATE INDEX IF NOT EXISTS ix_group_members_user ON group_members (user_id)"),
    ]
    for table, statement in statements:
        if _table_exists(connection, table):
            connection.execute(text(statement))


MIGRATIONS: list[tuple[str, callable]] = [
    ("0001_group_tables", _m_group_tables),
    ("0002_seed_bootstrap_user", _m_seed_bootstrap_user),
    ("0003_tracker_category", _m_tracker_category),
    ("0004_tracker_impact", _m_tracker_impact),
    ("0005_tracker_ownership", _m_tracker_ownership),
    ("0006_tracker_streak_start", _m_tracker_streak_start),
    ("0007_tracker_units_per_interval", _m_tracker_units_per_interval),
    ("0008_activity_user_columns", _m_activity_user_columns),
    ("0009_journal_relapse", _m_journal_relapse),
    ("0010_dashboard_state_table", _m_dashboard_state_table),
    ("0011_adopt_legacy_rows", _m_adopt_legacy_rows),
    ("0012_seed_dashboard_from_legacy", _m_seed_dashboard_from_legacy),
    ("0013_user_preferences", _m_user_preferences),
    ("0014_tracker_details", _m_tracker_details),
    ("0015_habit_log_note", _m_habit_log_note),
    ("0016_performance_indexes", _m_performance_indexes),
]


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


def _ensure_ledger(connection: Connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "id INTEGER PRIMARY KEY, "
            "name VARCHAR NOT NULL UNIQUE, "
            "applied_at DATETIME, "
            "app_version VARCHAR DEFAULT ''"
            ")"
        )
    )


def _applied_migration_names(connection: Connection) -> set[str]:
    if not _table_exists(connection, "schema_migrations"):
        return set()
    return {row[0] for row in connection.execute(text("SELECT name FROM schema_migrations"))}


def _database_has_user_data() -> bool:
    """True when the database already holds something worth backing up."""
    if not DATABASE_PATH.exists():
        return False

    with engine.connect() as connection:
        for table in ("trackers", "habit_logs", "journal_entries", "users"):
            if not _table_exists(connection, table):
                continue
            row = connection.execute(text(f"SELECT 1 FROM {table} LIMIT 1")).first()
            if row is not None:
                return True
    return False


def prepare_database() -> dict[str, object]:
    """Bring the database up to date, backing it up first if anything changes.

    Order matters: the pending set is computed and the backup taken *before*
    any DDL runs, so the snapshot on disk is genuinely the pre-upgrade state.
    Returns a report that ``GET /health`` surfaces, so an operator can confirm
    from the outside what the container did on boot.
    """
    from . import models  # imported here to avoid a circular import at module load

    is_new_database = not DATABASE_PATH.exists() or DATABASE_PATH.stat().st_size == 0
    had_user_data = (not is_new_database) and _database_has_user_data()

    with engine.begin() as connection:
        _ensure_ledger(connection)
        already_applied = _applied_migration_names(connection)

    pending = [(name, fn) for name, fn in MIGRATIONS if name not in already_applied]

    backup_path: Path | None = None
    if pending and BACKUP_ENABLED and had_user_data:
        # There is data to lose and the schema is about to change: leave a
        # rollback point.  Never let a backup failure block startup.
        try:
            backup_path = create_backup(label="pre-migration")
        except Exception:  # pragma: no cover - best effort
            logger.exception("Could not create a pre-migration backup; continuing")

    # Creates tables that do not exist yet.  Existing tables are left alone —
    # widening those is what the ALTER migrations below are for.
    models.Base.metadata.create_all(bind=engine)

    applied: list[str] = []
    for name, migration in pending:
        # One transaction per migration: a failure rolls back only that step
        # and leaves the ledger accurate about what did land.
        with engine.begin() as connection:
            migration(connection)
            connection.execute(
                text(
                    "INSERT OR IGNORE INTO schema_migrations (name, applied_at, app_version) "
                    "VALUES (:name, CURRENT_TIMESTAMP, :app_version)"
                ),
                {"name": name, "app_version": APP_VERSION},
            )
        applied.append(name)
        logger.info("Applied migration %s", name)

    if applied:
        logger.info("Database ready at schema %s (%d migration(s) applied)", APP_VERSION, len(applied))

    return {
        "fresh_install": is_new_database,
        "applied": applied,
        "backup": str(backup_path) if backup_path else None,
        "version": APP_VERSION,
    }


# Kept for backwards compatibility with anything importing the old name.
run_startup_migrations = prepare_database
