"""End-to-end check that upgrading an old install keeps every row.

Builds a database with the exact v0.6.2 schema (no users, no groups, no
relapse flag), fills it with data, then boots the current app against it and
asserts that every tracker, log and journal is still reachable through the API
under the account the migration adopted them onto.

Run with:  python -m backend.tests.test_upgrade_path
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

LEGACY_SCHEMA = """
CREATE TABLE trackers (
    id INTEGER NOT NULL PRIMARY KEY,
    name VARCHAR,
    category VARCHAR DEFAULT 'General',
    type VARCHAR,
    start_date DATETIME,
    impact_amount FLOAT DEFAULT 0.0,
    impact_unit VARCHAR DEFAULT '$',
    impact_per VARCHAR,
    unit VARCHAR,
    units_per_amount FLOAT DEFAULT 0.0,
    units_per VARCHAR,
    is_active BOOLEAN DEFAULT 1
);
CREATE TABLE journal_entries (
    id INTEGER NOT NULL PRIMARY KEY,
    tracker_id INTEGER REFERENCES trackers(id) ON DELETE CASCADE,
    timestamp DATETIME,
    mood INTEGER,
    content VARCHAR
);
CREATE TABLE habit_logs (
    id INTEGER NOT NULL PRIMARY KEY,
    tracker_id INTEGER REFERENCES trackers(id) ON DELETE CASCADE,
    timestamp DATETIME,
    amount FLOAT DEFAULT 1.0
);
CREATE TABLE dashboard_states (
    id INTEGER NOT NULL PRIMARY KEY,
    name VARCHAR DEFAULT 'home',
    widgets_json TEXT DEFAULT '[]',
    layouts_json TEXT DEFAULT '{}',
    updated_at DATETIME
);
"""

LEGACY_WIDGETS = '[{"id":"w1","type":"finance","title":"Money","config":{}}]'


def build_legacy_database(path: Path) -> dict:
    connection = sqlite3.connect(str(path))
    try:
        connection.executescript(LEGACY_SCHEMA)

        connection.execute(
            "INSERT INTO trackers (id, name, category, type, start_date, impact_amount, impact_unit, "
            "impact_per, unit, units_per_amount, units_per, is_active) VALUES "
            "(1, 'Quit Smoking', 'Health', 'quit', '2025-01-01 08:00:00', 12.5, '$', 'day', "
            "'Cigarettes', 20, 'day', 1)"
        )
        connection.execute(
            "INSERT INTO trackers (id, name, category, type, start_date, impact_amount, impact_unit, "
            "impact_per, unit, units_per_amount, units_per, is_active) VALUES "
            "(2, 'Read Books', 'Learning', 'build', '2025-02-01 08:00:00', 0, '$', 'day', "
            "'Pages', 30, 'day', 1)"
        )

        for index in range(25):
            connection.execute(
                "INSERT INTO habit_logs (tracker_id, timestamp, amount) VALUES (2, ?, ?)",
                (f"2025-02-{index + 1:02d} 19:30:00", 30 + index),
            )

        connection.execute(
            "INSERT INTO journal_entries (tracker_id, timestamp, mood, content) VALUES "
            "(1, '2025-03-04 10:00:00', 1, 'Logged a relapse. Timer was reset to zero.')"
        )
        connection.execute(
            "INSERT INTO journal_entries (tracker_id, timestamp, mood, content) VALUES "
            "(1, '2025-03-05 10:00:00', 4, 'Back on track today.')"
        )
        connection.execute(
            "INSERT INTO journal_entries (tracker_id, timestamp, mood, content) VALUES "
            "(2, '2025-02-10 21:00:00', 5, 'Finished a great chapter.')"
        )

        connection.execute(
            "INSERT INTO dashboard_states (name, widgets_json, layouts_json, updated_at) "
            "VALUES ('home', ?, '{}', '2025-03-01 00:00:00')",
            (LEGACY_WIDGETS,),
        )

        connection.commit()

        counts = {
            "trackers": connection.execute("SELECT COUNT(*) FROM trackers").fetchone()[0],
            "habit_logs": connection.execute("SELECT COUNT(*) FROM habit_logs").fetchone()[0],
            "journal_entries": connection.execute("SELECT COUNT(*) FROM journal_entries").fetchone()[0],
        }
    finally:
        connection.close()

    return counts


def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="anyhabit-upgrade-"))
    data_dir = workdir / "data"
    data_dir.mkdir()

    legacy_counts = build_legacy_database(data_dir / "anyhabit.db")
    print(f"Legacy database seeded: {legacy_counts}")

    os.environ["ANYHABIT_DATA_DIR"] = str(data_dir)
    os.environ["ANYHABIT_SECRET_KEY"] = "test-secret-key"
    os.environ["ANYHABIT_BOOTSTRAP_EMAIL"] = "owner@anyhabit.local"
    os.environ["ANYHABIT_BOOTSTRAP_PASSWORD"] = "anyhabit-test-pw"
    os.environ["ANYHABIT_COOKIE_SECURE"] = "false"

    # Imported after the environment is set so the engine binds to the temp dir.
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

    print("\n[1] Upgrade preserves legacy rows")
    with sqlite3.connect(str(data_dir / "anyhabit.db")) as connection:
        upgraded_counts = {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in ("trackers", "habit_logs", "journal_entries")
        }
        owned = connection.execute("SELECT COUNT(*) FROM trackers WHERE owner_id IS NOT NULL").fetchone()[0]
        flagged = connection.execute("SELECT COUNT(*) FROM journal_entries WHERE is_relapse = 1").fetchone()[0]
        migrated_widgets = connection.execute(
            "SELECT widgets_json FROM user_dashboard_states WHERE name = 'home'"
        ).fetchone()

    check("row counts unchanged", upgraded_counts == legacy_counts, f"{legacy_counts} -> {upgraded_counts}")
    check("every tracker adopted by a user", owned == legacy_counts["trackers"], f"owned={owned}")
    check("legacy relapse text flagged", flagged == 1, f"flagged={flagged}")
    check("legacy dashboard carried over", bool(migrated_widgets) and "w1" in migrated_widgets[0])

    print("\n[2] Bootstrap account can sign in and sees the migrated data")
    login = client.post(
        "/auth/login", json={"identifier": "owner@anyhabit.local", "password": "anyhabit-test-pw"}
    )
    check("login succeeds", login.status_code == 200, login.text[:200])

    trackers = client.get("/trackers/")
    check("tracker list returns 200", trackers.status_code == 200, trackers.text[:200])
    tracker_rows = trackers.json() if trackers.status_code == 200 else []
    check("both legacy trackers visible", len(tracker_rows) == 2, f"got {len(tracker_rows)}")

    quit_tracker = next((t for t in tracker_rows if t["type"] == "quit"), None)
    build_tracker = next((t for t in tracker_rows if t["type"] == "build"), None)
    check("quit tracker present", quit_tracker is not None)
    check("build tracker present", build_tracker is not None)
    check(
        "units_per_interval back-filled to 1",
        all(t["units_per_interval"] == 1 for t in tracker_rows),
        str([t["units_per_interval"] for t in tracker_rows]),
    )

    if build_tracker:
        logs = client.get(f"/trackers/{build_tracker['id']}/logs/")
        check("all 25 legacy logs readable", len(logs.json()) == 25, f"got {len(logs.json())}")

        bundle = client.get(f"/trackers/{build_tracker['id']}/bundle")
        check("bundle endpoint works", bundle.status_code == 200, bundle.text[:200])
        if bundle.status_code == 200:
            analytics = bundle.json()["analytics"]
            check("logged units carried into analytics", analytics["current_math"]["main_unit"] > 0)
            check("consistency computed", analytics["consistency"]["total_periods"] > 0)

    print("\n[3] Relapse now resets the quit tracker's totals")
    if quit_tracker:
        before = client.get(f"/trackers/{quit_tracker['id']}/analytics").json()
        streak_before = before["streak_stats"]["current"]
        avoided_before = before["current_math"]["main_unit"]

        client.post(f"/trackers/{quit_tracker['id']}/reset")
        after = client.get(f"/trackers/{quit_tracker['id']}/analytics").json()

        check("streak resets to 0 on the relapse day", after["streak_stats"]["current"] == 0, str(after["streak_stats"]))
        check(
            "avoided total resets too",
            after["current_math"]["main_unit"] < avoided_before,
            f"{avoided_before} -> {after['current_math']['main_unit']}",
        )
        check(
            "lifetime total is preserved",
            after["current_math"]["lifetime_main_unit"] >= avoided_before,
            f"lifetime={after['current_math']['lifetime_main_unit']}",
        )
        check("relapse counted", after["streak_stats"]["total_relapses"] >= 2, str(after["streak_stats"]))
        print(f"       (streak was {streak_before}, avoided was {avoided_before:.1f})")

    print("\n[4] Timezone preference changes day bucketing, not stored data")
    prefs = client.patch("/auth/me", json={"timezone": "Pacific/Kiritimati", "week_start": "sunday"})
    check("preferences saved", prefs.status_code == 200, prefs.text[:200])
    check("timezone echoed back", prefs.json().get("timezone") == "Pacific/Kiritimati")

    bad_tz = client.patch("/auth/me", json={"timezone": "Mars/Olympus_Mons"})
    check("invalid timezone rejected", bad_tz.status_code == 400, bad_tz.text[:120])

    if build_tracker:
        shifted = client.get(f"/trackers/{build_tracker['id']}/analytics").json()
        check("analytics reports the active timezone", shifted["timezone"] == "Pacific/Kiritimati")
        logs_after_tz = client.get(f"/trackers/{build_tracker['id']}/logs/")
        check("log rows untouched by timezone change", len(logs_after_tz.json()) == 25)

    client.patch("/auth/me", json={"timezone": "UTC", "week_start": "monday"})

    print("\n[5] Export -> import round trip")
    export = client.get("/export/", params={"data_type": "all", "format": "json"})
    check("export returns 200", export.status_code == 200, export.text[:200])
    backup_bytes = export.content
    check("export declares the backup format", b"anyhabit-backup" in backup_bytes)

    dry = client.post(
        "/import/",
        params={"mode": "merge", "dry_run": "true"},
        files={"file": ("backup.json", backup_bytes, "application/json")},
    )
    check("dry run accepted", dry.status_code == 200, dry.text[:300])
    if dry.status_code == 200:
        summary = dry.json()
        check("dry run creates nothing new for identical data", summary["logs_created"] == 0, str(summary))
        check("dry run matches existing trackers", summary["trackers_updated"] == 2, str(summary))

    trackers_before_import = len(client.get("/trackers/").json())
    real = client.post(
        "/import/",
        params={"mode": "merge", "dry_run": "false"},
        files={"file": ("backup.json", backup_bytes, "application/json")},
    )
    check("real merge accepted", real.status_code == 200, real.text[:300])
    check(
        "re-importing the same backup does not duplicate trackers",
        len(client.get("/trackers/").json()) == trackers_before_import,
    )
    if build_tracker:
        check(
            "re-importing does not duplicate logs",
            len(client.get(f"/trackers/{build_tracker['id']}/logs/").json()) == 25,
        )

    print("\n[6] Restoring into an empty account")
    client.post("/auth/logout")
    signup = client.post(
        "/auth/register",
        json={"username": "restorer", "email": "restore@example.com", "password": "a-strong-password"},
    )
    check("registration succeeds", signup.status_code == 200, signup.text[:200])
    check("new account starts empty", len(client.get("/trackers/").json()) == 0)

    restored = client.post(
        "/import/",
        params={"mode": "merge", "dry_run": "false"},
        files={"file": ("backup.json", backup_bytes, "application/json")},
    )
    check("restore accepted", restored.status_code == 200, restored.text[:300])
    restored_trackers = client.get("/trackers/").json()
    check("both trackers restored", len(restored_trackers) == 2, f"got {len(restored_trackers)}")

    restored_build = next((t for t in restored_trackers if t["type"] == "build"), None)
    if restored_build:
        check(
            "all 25 logs restored",
            len(client.get(f"/trackers/{restored_build['id']}/logs/").json()) == 25,
        )
        journals = client.get(f"/trackers/{restored_build['id']}/journal/").json()
        check("journal restored", len(journals) == 1, f"got {len(journals)}")

    print("\n[7] Password rules and login throttling")
    weak = client.post(
        "/auth/register", json={"username": "weak", "email": "weak@example.com", "password": "123"}
    )
    check("short password rejected", weak.status_code == 422, weak.text[:160])
    check("rejection message is readable", "at least 8" in weak.text, weak.text[:160])

    dupe = client.post(
        "/auth/register",
        json={"username": "restorer", "email": "other@example.com", "password": "a-strong-password"},
    )
    check("duplicate username rejected", dupe.status_code == 409, dupe.text[:160])

    for _ in range(11):
        client.post("/auth/login", json={"identifier": "restore@example.com", "password": "wrong-password"})
    throttled = client.post("/auth/login", json={"identifier": "restore@example.com", "password": "wrong"})
    check("brute force is throttled", throttled.status_code == 429, throttled.text[:160])

    print("\n[8] Archive keeps history instead of destroying it")
    client.post("/auth/login", json={"identifier": "owner@anyhabit.local", "password": "anyhabit-test-pw"})
    if build_tracker:
        archived = client.put(f"/trackers/{build_tracker['id']}/archive")
        check("archive succeeds", archived.status_code == 200, archived.text[:200])
        check("archived tracker hidden by default", all(
            t["id"] != build_tracker["id"] for t in client.get("/trackers/").json()
        ))
        check("archived tracker visible on request", any(
            t["id"] == build_tracker["id"]
            for t in client.get("/trackers/", params={"include_archived": "true"}).json()
        ))
        check(
            "archived tracker keeps its logs",
            len(client.get(f"/trackers/{build_tracker['id']}/logs/").json()) == 25,
        )
        client.put(f"/trackers/{build_tracker['id']}/unarchive")

    print("\n[9] The upgrade left a rollback point, and a no-op boot adds nothing")
    from backend.migrations import prepare_database

    backups_after_upgrade = list((data_dir / "backups").glob("*.db"))
    check("upgrade wrote one pre-migration backup", len(backups_after_upgrade) == 1, f"found {len(backups_after_upgrade)}")

    if backups_after_upgrade:
        # The snapshot must be the *pre-upgrade* database: old schema, all rows.
        with sqlite3.connect(str(backups_after_upgrade[0])) as snapshot:
            snapshot_trackers = snapshot.execute("SELECT COUNT(*) FROM trackers").fetchone()[0]
            snapshot_logs = snapshot.execute("SELECT COUNT(*) FROM habit_logs").fetchone()[0]
            snapshot_columns = {row[1] for row in snapshot.execute("PRAGMA table_info(trackers)")}
        check("backup holds the original trackers", snapshot_trackers == legacy_counts["trackers"])
        check("backup holds the original logs", snapshot_logs == legacy_counts["habit_logs"])
        check("backup predates the new columns", "archived_at" not in snapshot_columns, str(sorted(snapshot_columns)))

    report = prepare_database()
    check("no migrations pending on rerun", report["applied"] == [], str(report["applied"]))
    check("no backup taken when nothing changes", report["backup"] is None, str(report["backup"]))
    check(
        "no extra backup on a same-version boot",
        len(list((data_dir / "backups").glob("*.db"))) == len(backups_after_upgrade),
    )

    print("\n[10] Health endpoint reports the upgrade")
    health = client.get("/health")
    check("health returns 200", health.status_code == 200)
    if health.status_code == 200:
        body = health.json()
        from backend.version import APP_VERSION

        check("health reports the version", body["version"] == APP_VERSION, str(body))
        check("health lists boot migrations", len(body["migrations_applied_on_boot"]) == 16, str(body))

    shutil.rmtree(workdir, ignore_errors=True)

    print("\n" + "=" * 60)
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("ALL UPGRADE CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
