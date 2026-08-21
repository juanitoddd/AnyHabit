"""Upgrade check for the *other* starting point: a v0.6.x install that already
has accounts, groups and shared trackers.

The pre-accounts path is covered by ``test_upgrade_path``; this one proves the
migrations are equally safe for the schema most existing installs are actually
on, including that a second user's data stays attached to the second user.

Run with:  python -m backend.tests.test_upgrade_from_current
"""

from __future__ import annotations

import hashlib
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

# The v0.6.x schema: accounts and groups exist, but none of the 0.7 columns do.
SCHEMA = """
CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY,
    username VARCHAR NOT NULL UNIQUE,
    email VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    created_at DATETIME,
    is_active BOOLEAN DEFAULT 1
);
CREATE TABLE groups (
    id INTEGER NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    join_code VARCHAR NOT NULL UNIQUE,
    owner_id INTEGER,
    created_at DATETIME
);
CREATE TABLE group_members (
    id INTEGER NOT NULL PRIMARY KEY,
    group_id INTEGER,
    user_id INTEGER,
    role VARCHAR DEFAULT 'member',
    joined_at DATETIME,
    UNIQUE(group_id, user_id)
);
CREATE TABLE tracker_participants (
    id INTEGER NOT NULL PRIMARY KEY,
    tracker_id INTEGER,
    user_id INTEGER,
    role VARCHAR DEFAULT 'participant',
    added_at DATETIME,
    UNIQUE(tracker_id, user_id)
);
CREATE TABLE trackers (
    id INTEGER NOT NULL PRIMARY KEY,
    owner_id INTEGER,
    group_id INTEGER,
    name VARCHAR,
    category VARCHAR DEFAULT 'General',
    type VARCHAR,
    start_date DATETIME,
    current_streak_start_date DATETIME,
    impact_amount FLOAT DEFAULT 0.0,
    impact_unit VARCHAR DEFAULT '$',
    impact_per VARCHAR,
    unit VARCHAR,
    units_per_amount FLOAT DEFAULT 0.0,
    units_per VARCHAR,
    units_per_interval INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    visibility VARCHAR DEFAULT 'private'
);
CREATE TABLE journal_entries (
    id INTEGER NOT NULL PRIMARY KEY,
    tracker_id INTEGER,
    user_id INTEGER,
    timestamp DATETIME,
    mood INTEGER,
    content VARCHAR,
    is_relapse BOOLEAN DEFAULT 0
);
CREATE TABLE habit_logs (
    id INTEGER NOT NULL PRIMARY KEY,
    tracker_id INTEGER,
    user_id INTEGER,
    timestamp DATETIME,
    amount FLOAT DEFAULT 1.0
);
CREATE TABLE user_dashboard_states (
    id INTEGER NOT NULL PRIMARY KEY,
    user_id INTEGER,
    name VARCHAR DEFAULT 'home',
    widgets_json TEXT DEFAULT '[]',
    layouts_json TEXT DEFAULT '{}',
    updated_at DATETIME,
    UNIQUE(user_id, name)
);
"""


def _legacy_hash(password: str) -> str:
    """Reproduce the existing PBKDF2 format so old passwords still verify."""
    salt = bytes.fromhex("00112233445566778899aabbccddeeff")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200000)
    return f"{salt.hex()}${digest.hex()}"


def build_database(path: Path) -> None:
    connection = sqlite3.connect(str(path))
    try:
        connection.executescript(SCHEMA)

        connection.execute(
            "INSERT INTO users (id, username, email, password_hash, created_at, is_active) VALUES "
            "(1, 'owner', 'owner@anyhabit.local', ?, '2025-01-01 00:00:00', 1)",
            (_legacy_hash("existing-password"),),
        )
        connection.execute(
            "INSERT INTO users (id, username, email, password_hash, created_at, is_active) VALUES "
            "(2, 'partner', 'partner@example.com', ?, '2025-01-02 00:00:00', 1)",
            (_legacy_hash("partner-password"),),
        )

        connection.execute(
            "INSERT INTO groups (id, name, join_code, owner_id, created_at) "
            "VALUES (1, 'Household', 'HOUSE123', 1, '2025-01-03 00:00:00')"
        )
        connection.execute(
            "INSERT INTO group_members (group_id, user_id, role, joined_at) "
            "VALUES (1, 1, 'owner', '2025-01-03 00:00:00')"
        )
        connection.execute(
            "INSERT INTO group_members (group_id, user_id, role, joined_at) "
            "VALUES (1, 2, 'member', '2025-01-04 00:00:00')"
        )

        connection.execute(
            "INSERT INTO trackers (id, owner_id, group_id, name, category, type, start_date, "
            "current_streak_start_date, impact_amount, impact_unit, impact_per, unit, "
            "units_per_amount, units_per, units_per_interval, is_active, visibility) VALUES "
            "(1, 1, 1, 'Daily Walk', 'Fitness', 'boolean', '2025-01-05 00:00:00', "
            "'2025-01-05 00:00:00', 0, '$', 'day', 'Times', 1, 'day', 1, 1, 'group')"
        )
        connection.execute(
            "INSERT INTO trackers (id, owner_id, group_id, name, category, type, start_date, "
            "current_streak_start_date, impact_amount, impact_unit, impact_per, unit, "
            "units_per_amount, units_per, units_per_interval, is_active, visibility) VALUES "
            "(2, 2, NULL, 'Private Notes', 'Personal', 'build', '2025-01-06 00:00:00', "
            "'2025-01-06 00:00:00', 0, '$', 'day', 'Entries', 1, 'day', 1, 1, 'private')"
        )

        for tracker_id, user_id in ((1, 1), (1, 2)):
            connection.execute(
                "INSERT INTO tracker_participants (tracker_id, user_id, role, added_at) "
                "VALUES (?, ?, 'participant', '2025-01-05 00:00:00')",
                (tracker_id, user_id),
            )
        connection.execute(
            "INSERT INTO tracker_participants (tracker_id, user_id, role, added_at) "
            "VALUES (2, 2, 'owner', '2025-01-06 00:00:00')"
        )

        for day in range(1, 11):
            connection.execute(
                "INSERT INTO habit_logs (tracker_id, user_id, timestamp, amount) VALUES (1, 1, ?, 1)",
                (f"2025-02-{day:02d} 07:00:00",),
            )
            connection.execute(
                "INSERT INTO habit_logs (tracker_id, user_id, timestamp, amount) VALUES (1, 2, ?, 1)",
                (f"2025-02-{day:02d} 08:00:00",),
            )
        connection.execute(
            "INSERT INTO habit_logs (tracker_id, user_id, timestamp, amount) "
            "VALUES (2, 2, '2025-02-01 09:00:00', 3)"
        )

        connection.execute(
            "INSERT INTO journal_entries (tracker_id, user_id, timestamp, mood, content, is_relapse) "
            "VALUES (1, 1, '2025-02-01 20:00:00', 4, 'Good walk today.', 0)"
        )
        connection.execute(
            "INSERT INTO journal_entries (tracker_id, user_id, timestamp, mood, content, is_relapse) "
            "VALUES (2, 2, '2025-02-01 21:00:00', 3, 'Private thought.', 0)"
        )

        connection.execute(
            "INSERT INTO user_dashboard_states (user_id, name, widgets_json, layouts_json, updated_at) "
            "VALUES (1, 'home', '[{\"id\":\"a\",\"type\":\"trackerOverview\",\"title\":\"Mine\"}]', '{}', "
            "'2025-02-01 00:00:00')"
        )
        connection.commit()
    finally:
        connection.close()


def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="anyhabit-current-"))
    data_dir = workdir / "data"
    data_dir.mkdir()
    build_database(data_dir / "anyhabit.db")

    os.environ["ANYHABIT_DATA_DIR"] = str(data_dir)
    os.environ["ANYHABIT_SECRET_KEY"] = "test-secret-key"
    os.environ["ANYHABIT_COOKIE_SECURE"] = "false"

    from fastapi.testclient import TestClient

    from backend.main import app

    failures: list[str] = []

    def check(label: str, condition: bool, detail: str = "") -> None:
        if condition:
            print(f"  PASS  {label}")
        else:
            failures.append(f"{label} {detail}".strip())
            print(f"  FAIL  {label} {detail}")

    client = TestClient(app)

    print("\n[1] Existing passwords still work after the upgrade")
    owner_login = client.post(
        "/auth/login", json={"identifier": "owner", "password": "existing-password"}
    )
    check("owner signs in with the old password", owner_login.status_code == 200, owner_login.text[:200])
    check(
        "preferences defaulted to UTC",
        owner_login.json().get("user", {}).get("timezone") == "UTC",
        owner_login.text[:200],
    )

    print("\n[2] Ownership boundaries survive")
    owner_trackers = client.get("/trackers/").json()
    owner_names = sorted(t["name"] for t in owner_trackers)
    # The owner owns the shared tracker and is not a participant on the
    # partner's private one, so exactly one tracker should come back.
    check("owner sees only the tracker they own", owner_names == ["Daily Walk"], str(owner_names))
    check(
        "owner cannot see the partner's private tracker",
        all(t["name"] != "Private Notes" for t in owner_trackers),
    )

    forbidden = client.get("/trackers/2/bundle")
    check("direct access to another user's tracker is refused", forbidden.status_code == 403, forbidden.text[:120])

    shared = next((t for t in owner_trackers if t["name"] == "Daily Walk"), None)
    check("shared tracker kept its group", shared is not None and shared["group_id"] == 1, str(shared))
    check("shared tracker kept both participants", shared is not None and shared["participant_count"] == 2, str(shared))

    groups = client.get("/groups/").json()
    check("group survived", len(groups) == 1 and groups[0]["name"] == "Household", str(groups))
    check("group membership survived", groups[0]["member_count"] == 2, str(groups))
    check("join code unchanged", groups[0]["join_code"] == "HOUSE123", str(groups))
    check("owner flagged as owner", groups[0]["is_owner"] is True, str(groups))

    print("\n[3] Shared-tracker analytics still resolve per member")
    if shared:
        bundle = client.get(f"/trackers/{shared['id']}/bundle")
        check("bundle loads", bundle.status_code == 200, bundle.text[:300])
        if bundle.status_code == 200:
            share_stats = bundle.json()["share_stats"]
            check("leaderboard has both members", len(share_stats["leaderboard"]) == 2, str(share_stats))
            check("group streak computed", share_stats["group_streak_stats"] is not None)

    print("\n[4] The partner's data is still the partner's")
    client.post("/auth/logout")
    partner_login = client.post(
        "/auth/login", json={"identifier": "partner@example.com", "password": "partner-password"}
    )
    check("partner signs in", partner_login.status_code == 200, partner_login.text[:200])

    partner_trackers = client.get("/trackers/").json()
    names = sorted(t["name"] for t in partner_trackers)
    check("partner sees their own plus the shared tracker", names == ["Daily Walk", "Private Notes"], str(names))

    private = next((t for t in partner_trackers if t["name"] == "Private Notes"), None)
    if private:
        logs = client.get(f"/trackers/{private['id']}/logs/").json()
        check("partner's private log preserved", len(logs) == 1 and logs[0]["amount"] == 3, str(logs))

    print("\n[5] Dashboard layouts stay per user")
    partner_dashboard = client.get("/dashboard/home").json()
    check("partner's dashboard is untouched and empty", partner_dashboard["widgets"] == [], str(partner_dashboard))

    client.post("/auth/logout")
    client.post("/auth/login", json={"identifier": "owner", "password": "existing-password"})
    owner_dashboard = client.get("/dashboard/home").json()
    check(
        "owner's saved widget survived",
        len(owner_dashboard["widgets"]) == 1 and owner_dashboard["widgets"][0]["title"] == "Mine",
        str(owner_dashboard),
    )

    print("\n[6] New 0.7 columns are present and defaulted")
    with sqlite3.connect(str(data_dir / "anyhabit.db")) as connection:
        tracker_columns = {row[1] for row in connection.execute("PRAGMA table_info(trackers)")}
        user_columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
        log_columns = {row[1] for row in connection.execute("PRAGMA table_info(habit_logs)")}
        null_timezones = connection.execute(
            "SELECT COUNT(*) FROM users WHERE timezone IS NULL OR timezone = ''"
        ).fetchone()[0]

    check("trackers gained description/color/archived_at", {"description", "color", "archived_at"} <= tracker_columns)
    check("users gained timezone/week_start", {"timezone", "week_start"} <= user_columns)
    check("habit_logs gained note", "note" in log_columns)
    check("no user left without a timezone", null_timezones == 0, f"{null_timezones} rows")

    print("\n[7] A pre-migration backup was written")
    backups = list((data_dir / "backups").glob("*.db"))
    check("backup exists", len(backups) == 1, f"found {len(backups)}")
    if backups:
        with sqlite3.connect(str(backups[0])) as snapshot:
            snapshot_users = snapshot.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            snapshot_logs = snapshot.execute("SELECT COUNT(*) FROM habit_logs").fetchone()[0]
        check("backup holds both users", snapshot_users == 2, f"got {snapshot_users}")
        check("backup holds all 21 logs", snapshot_logs == 21, f"got {snapshot_logs}")

    shutil.rmtree(workdir, ignore_errors=True)

    print("\n" + "=" * 60)
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("ALL CURRENT-VERSION UPGRADE CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
