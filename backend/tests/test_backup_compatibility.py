"""Cross-version backup compatibility.

v1.2.0 shipped its own export/import pair using a different marker
(`export_type: "backup"`) and a different address (`POST /export/import/`).
Anyone upgrading may be holding a file from that release, or running a script
against that URL, so both must keep working.

Run with:  python -m backend.tests.test_backup_compatibility
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

# A backup exactly as v1.2.0 wrote it: raw model dicts, no `format` key.
V12_BACKUP = {
    "version": "1.0",
    "export_type": "backup",
    "export_date": "2026-08-01T10:00:00+00:00",
    "trackers": [
        {
            "id": 41,
            "owner_id": 1,
            "group_id": None,
            "name": "Legacy Reading",
            "category": "Learning",
            "type": "build",
            "start_date": "2026-05-01T00:00:00Z",
            "current_streak_start_date": "2026-05-01T00:00:00Z",
            "impact_amount": 0.0,
            "impact_unit": "$",
            "impact_per": "day",
            "unit": "Pages",
            "units_per_amount": 20.0,
            "units_per": "day",
            "units_per_interval": 1,
            "is_active": True,
            "visibility": "private",
            "logs": [
                {"id": 900, "tracker_id": 41, "user_id": 1, "timestamp": "2026-05-02T19:00:00Z", "amount": 25.0},
                {"id": 901, "tracker_id": 41, "user_id": 1, "timestamp": "2026-05-03T19:00:00Z", "amount": 30.0},
            ],
            "journals": [
                {
                    "id": 700,
                    "tracker_id": 41,
                    "user_id": 1,
                    "timestamp": "2026-05-02T20:00:00Z",
                    "mood": 4,
                    "content": "Written on v1.2.0.",
                    "is_relapse": False,
                }
            ],
        }
    ],
}


def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="anyhabit-compat-"))
    os.environ["ANYHABIT_DATA_DIR"] = str(workdir / "data")
    os.environ["ANYHABIT_SECRET_KEY"] = "compat-secret"
    os.environ["ANYHABIT_COOKIE_SECURE"] = "false"
    os.environ["ANYHABIT_BOOTSTRAP_PASSWORD"] = "compat-password"

    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.version import APP_VERSION

    failures: list[str] = []

    def check(label: str, condition: bool, detail: str = "") -> None:
        if condition:
            print(f"  PASS  {label}")
        else:
            failures.append(f"{label} {detail}".strip())
            print(f"  FAIL  {label} {detail}")

    client = TestClient(app)
    client.post("/auth/login", json={"identifier": "owner@anyhabit.local", "password": "compat-password"})

    print(f"\n[1] A v1.2.0 backup restores on {APP_VERSION}")
    payload = json.dumps(V12_BACKUP).encode()
    response = client.post(
        "/import/",
        params={"mode": "merge", "dry_run": "false"},
        files={"file": ("v120-backup.json", payload, "application/json")},
    )
    check("import accepted", response.status_code == 200, response.text[:250])

    if response.status_code == 200:
        summary = response.json()
        check("tracker created", summary["trackers_created"] == 1, str(summary))
        check("logs restored", summary["logs_created"] == 2, str(summary))
        check("journal restored", summary["journals_created"] == 1, str(summary))
        check("no format warning for a recognised file", summary["warnings"] == [], str(summary["warnings"]))

    trackers = client.get("/trackers/").json()
    restored = next((t for t in trackers if t["name"] == "Legacy Reading"), None)
    check("tracker is readable through the API", restored is not None)
    if restored:
        check("unit survived", restored["unit"] == "Pages", restored["unit"])
        check("target survived", restored["units_per_amount"] == 20.0, str(restored["units_per_amount"]))
        logs = client.get(f"/trackers/{restored['id']}/logs/").json()
        check("both logs present", len(logs) == 2, f"got {len(logs)}")

    print("\n[2] The v1.2.0 endpoint address still works")
    legacy = client.post(
        "/export/import/",
        params={"mode": "merge", "dry_run": "true"},
        files={"file": ("v120-backup.json", payload, "application/json")},
    )
    check("POST /export/import/ still routes", legacy.status_code == 200, legacy.text[:200])
    if legacy.status_code == 200:
        check(
            "re-importing the same data is a no-op",
            legacy.json()["logs_created"] == 0,
            str(legacy.json()),
        )

    print("\n[3] Exports stay readable by v1.2.0")
    export = client.get("/export/", params={"data_type": "backup", "format": "json"})
    check("data_type=backup still accepted", export.status_code == 200, export.text[:200])
    if export.status_code == 200:
        body = json.loads(export.content)
        # v1.2.0's importer rejects any file without this exact marker.
        check("carries v1.2.0's export_type marker", body.get("export_type") == "backup", str(body.get("export_type")))
        check("carries the current format marker", body.get("format") == "anyhabit-backup", str(body.get("format")))
        check("contains the restored tracker", any(t["name"] == "Legacy Reading" for t in body.get("trackers", [])))

    csv_backup = client.get("/export/", params={"data_type": "backup", "format": "csv"})
    check("a CSV 'backup' is refused, not silently useless", csv_backup.status_code == 400, csv_backup.text[:150])

    print("\n[4] Our own export still round-trips")
    own = client.get("/export/", params={"data_type": "all", "format": "json"})
    replay = client.post(
        "/import/",
        params={"mode": "merge", "dry_run": "true"},
        files={"file": ("own.json", own.content, "application/json")},
    )
    check("own export re-imports cleanly", replay.status_code == 200, replay.text[:200])
    if replay.status_code == 200:
        check("nothing duplicated", replay.json()["logs_created"] == 0, str(replay.json()))

    shutil.rmtree(workdir, ignore_errors=True)

    print("\n" + "=" * 60)
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("ALL BACKUP COMPATIBILITY CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
