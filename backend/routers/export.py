"""Data export.

The JSON output doubles as AnyHabit's backup format: it is what
``POST /import/`` consumes, so an export taken before an upgrade is a complete
restore path.  The CSV output is a flat, spreadsheet-friendly view and is not
importable.
"""

from __future__ import annotations

import csv
import json
from io import StringIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..analytics import build_tracker_analytics
from ..deps import get_current_user, get_db, get_period_context
from ..time_utils import PeriodContext, ensure_utc, utcnow
from ..version import APP_VERSION

router = APIRouter(prefix="/export", tags=["export"])

BACKUP_FORMAT = "anyhabit-backup"
BACKUP_FORMAT_VERSION = 1

DATA_TYPES = ("all", "trackers_only", "journals_only", "specific", "backup")

# v1.2.0 called a full export "backup" and stamped it `export_type: backup`.
# That name still works, and the marker is still written, so files produced by
# either version are readable by the importer of either version.
LEGACY_BACKUP_TYPE = "backup"
FORMATS = ("json", "csv")

MOOD_LABELS = {1: "Very Bad", 2: "Bad", 3: "Neutral", 4: "Good", 5: "Very Good"}


def _format_timestamp(value) -> str:
    if value is None:
        return utcnow().isoformat()
    normalized = ensure_utc(value)
    return normalized.isoformat() if normalized else ""


def _log_rows(db: Session, tracker: models.Tracker, user_id: int) -> List[dict]:
    logs = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.tracker_id == tracker.id, models.HabitLog.user_id == user_id)
        .order_by(models.HabitLog.timestamp.asc())
        .all()
    )

    rows = []
    for log in logs:
        timestamp = _format_timestamp(log.timestamp)
        row = {
            "id": log.id,
            "tracker_id": log.tracker_id,
            "timestamp": timestamp,
            "date": timestamp.split("T")[0],
            "amount": float(log.amount or 0),
            "note": log.note or "",
            "unit": tracker.unit or "",
        }

        if tracker.impact_amount and tracker.impact_per:
            row["impact"] = round(float(log.amount or 0) * float(tracker.impact_amount), 2)
            row["impact_unit"] = tracker.impact_unit or ""

        rows.append(row)

    return rows


def _journal_rows(db: Session, tracker: models.Tracker, user_id: int) -> List[dict]:
    journals = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.tracker_id == tracker.id, models.JournalEntry.user_id == user_id)
        .order_by(models.JournalEntry.timestamp.asc())
        .all()
    )

    rows = []
    for journal in journals:
        timestamp = _format_timestamp(journal.timestamp)
        rows.append(
            {
                "id": journal.id,
                "tracker_id": journal.tracker_id,
                "timestamp": timestamp,
                "date": timestamp.split("T")[0],
                "mood": journal.mood,
                "mood_label": MOOD_LABELS.get(journal.mood) if journal.mood is not None else None,
                "content": journal.content or "",
                "is_relapse": bool(journal.is_relapse),
            }
        )

    return rows


def _tracker_row(
    db: Session,
    tracker: models.Tracker,
    user_id: int,
    context: PeriodContext,
) -> dict:
    logs = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.tracker_id == tracker.id, models.HabitLog.user_id == user_id)
        .all()
    )
    journals = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.tracker_id == tracker.id, models.JournalEntry.user_id == user_id)
        .all()
    )

    analytics = build_tracker_analytics(tracker, logs, journals, current_user_id=user_id, context=context)

    return {
        "id": tracker.id,
        "name": tracker.name,
        "description": tracker.description or "",
        "color": tracker.color or "",
        "category": tracker.category,
        "type": tracker.type,
        "start_date": _format_timestamp(tracker.start_date),
        "current_streak_start_date": _format_timestamp(tracker.current_streak_start_date),
        "archived_at": _format_timestamp(tracker.archived_at) if tracker.archived_at else None,
        "is_active": bool(tracker.is_active),
        "unit": tracker.unit or "",
        "impact_unit": tracker.impact_unit or "",
        "impact_per": tracker.impact_per or "day",
        "impact_amount": float(tracker.impact_amount or 0),
        "units_per": tracker.units_per or "day",
        "units_per_interval": int(tracker.units_per_interval or 1),
        "units_per_amount": float(tracker.units_per_amount or 0),
        "statistics": {
            "total_logs": len(logs),
            "current_streak": analytics.streak_stats.current,
            "longest_streak": analytics.streak_stats.longest,
            "streak_period": analytics.streak_stats.period_label,
            "current_amount": float(analytics.current_math.main_unit),
            "target_amount": float(analytics.current_math.target_unit),
            "impact_value": float(analytics.current_math.impact_value),
            "lifetime_impact_value": float(analytics.current_math.lifetime_impact_value),
            "daily_progress": float(analytics.daily_progress.percentage),
            "completion_rate": float(analytics.consistency.rate),
        },
    }


def _build_csv(export_payload: dict, db: Session, trackers: List[models.Tracker], user_id: int, data_type: str) -> str:
    output = StringIO()
    writer = csv.writer(output)

    writer.writerow(["AnyHabit Data Export"])
    writer.writerow(["Export Date", export_payload["export_date"]])
    writer.writerow(["App Version", export_payload["app_version"]])
    writer.writerow(["User", export_payload["user"]])
    writer.writerow(["Email", export_payload["email"]])
    writer.writerow([])

    if data_type != "journals_only":
        for tracker in trackers:
            writer.writerow(["Tracker:", tracker.name])
            writer.writerow(["Category", tracker.category])
            writer.writerow(["Type", tracker.type])
            writer.writerow(["Unit", tracker.unit or ""])
            writer.writerow(["Start Date", _format_timestamp(tracker.start_date)])
            writer.writerow(["Is Active", "Yes" if tracker.is_active else "No"])
            writer.writerow(["Archived", "Yes" if tracker.archived_at else "No"])
            writer.writerow([])

            logs = _log_rows(db, tracker, user_id)
            if logs:
                writer.writerow(["Logs:"])
                headers = list(logs[0].keys())
                writer.writerow(headers)
                for log in logs:
                    writer.writerow([log.get(header, "") for header in headers])
                writer.writerow([])

            if data_type == "all":
                journals = _journal_rows(db, tracker, user_id)
                if journals:
                    writer.writerow(["Journals:"])
                    headers = list(journals[0].keys())
                    writer.writerow(headers)
                    for journal in journals:
                        writer.writerow([journal.get(header, "") for header in headers])
                    writer.writerow([])

    if data_type == "journals_only":
        writer.writerow(["All Journals:"])
        writer.writerow(["Date", "Mood", "Mood Label", "Tracker", "Content", "Is Relapse"])
        for journal in export_payload.get("journals", []):
            writer.writerow(
                [
                    journal["date"],
                    journal["mood"] or "",
                    journal["mood_label"] or "",
                    journal.get("tracker_name", ""),
                    journal["content"],
                    "Yes" if journal["is_relapse"] else "No",
                ]
            )

    return output.getvalue()


@router.get("/")
def export_data(
    data_type: str = Query("all", description="all, trackers_only, journals_only or specific"),
    format: str = Query("json", description="json or csv"),
    tracker_id: Optional[List[int]] = Query(None, description="Tracker IDs, used with data_type=specific"),
    include_archived: bool = Query(True, description="Include archived trackers in the export"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    context: PeriodContext = Depends(get_period_context),
) -> Response:
    """Export the signed-in user's data.

    JSON exports are restorable through ``POST /import/``; keep one before
    upgrading if you want a rollback that does not involve the database file.
    """
    if data_type not in DATA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"data_type must be one of: {', '.join(DATA_TYPES)}",
        )
    if format not in FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"format must be one of: {', '.join(FORMATS)}"
        )

    is_backup = data_type == LEGACY_BACKUP_TYPE
    if is_backup:
        if format != "json":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="A backup must be exported as JSON"
            )
        # "backup" is a full export under an older name.
        data_type = "all"

    query = db.query(models.Tracker).filter(models.Tracker.owner_id == current_user.id)
    if not include_archived:
        query = query.filter(models.Tracker.archived_at.is_(None))
    user_trackers = query.order_by(models.Tracker.id.asc()).all()

    if data_type == "specific":
        if not tracker_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one tracker for a specific export",
            )
        selected = set(tracker_id)
        export_trackers = [tracker for tracker in user_trackers if tracker.id in selected]
    else:
        export_trackers = user_trackers

    export_payload: dict = {
        "format": BACKUP_FORMAT,
        "format_version": BACKUP_FORMAT_VERSION,
        "app_version": APP_VERSION,
        "export_date": _format_timestamp(None),
        "user": current_user.username,
        "email": current_user.email,
        "timezone": current_user.timezone or "UTC",
        "week_start": current_user.week_start or "monday",
        "data_type": data_type,
        # Read by v1.2.0's importer, which rejects anything without it.
        "export_type": LEGACY_BACKUP_TYPE,
    }

    if data_type != "journals_only":
        export_payload["trackers"] = []
        for tracker in export_trackers:
            row = _tracker_row(db, tracker, current_user.id, context)
            row["logs"] = _log_rows(db, tracker, current_user.id)
            if data_type == "all":
                row["journals"] = _journal_rows(db, tracker, current_user.id)
            export_payload["trackers"].append(row)

    if data_type == "journals_only":
        tracker_names = {tracker.id: tracker.name for tracker in user_trackers}
        all_journals = (
            db.query(models.JournalEntry)
            .filter(models.JournalEntry.user_id == current_user.id)
            .order_by(models.JournalEntry.timestamp.asc())
            .all()
        )

        export_payload["journals"] = []
        for journal in all_journals:
            timestamp = _format_timestamp(journal.timestamp)
            export_payload["journals"].append(
                {
                    "id": journal.id,
                    "tracker_name": tracker_names.get(journal.tracker_id, ""),
                    "tracker_id": journal.tracker_id,
                    "timestamp": timestamp,
                    "date": timestamp.split("T")[0],
                    "mood": journal.mood,
                    "mood_label": MOOD_LABELS.get(journal.mood) if journal.mood is not None else None,
                    "content": journal.content or "",
                    "is_relapse": bool(journal.is_relapse),
                }
            )

    stamp = utcnow().strftime("%Y-%m-%d")
    filename = f"anyhabit-{'backup' if is_backup else 'export'}-{stamp}.{format}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    if format == "json":
        return Response(
            content=json.dumps(export_payload, indent=2, default=str),
            media_type="application/json",
            headers=headers,
        )

    return Response(
        content=_build_csv(export_payload, db, export_trackers, current_user.id, data_type),
        media_type="text/csv",
        headers=headers,
    )
