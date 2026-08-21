"""Restore a JSON export produced by ``GET /export/``.

Export without import is a one-way door: it lets you look at your data but not
get it back. This closes the loop, which is what makes "take a backup before
upgrading" real advice rather than a gesture.

Two modes:

``merge`` (default)
    Adds what is missing and leaves everything else alone.  Trackers are
    matched on name + category; logs and journals are matched on timestamp so
    re-importing the same file twice does not duplicate history.

``replace``
    Deletes the caller's existing trackers first, then imports.  Destructive by
    design, and gated behind an explicit confirmation string.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db
from ..time_utils import ensure_utc, to_utc, utcnow

router = APIRouter(prefix="/import", tags=["import"])

MAX_UPLOAD_BYTES = int(1024 * 1024 * 25)
REPLACE_CONFIRMATION = "REPLACE MY DATA"

VALID_TYPES = {"quit", "build", "boolean"}
VALID_PERIODS = {"day", "week", "month", "year"}


def _parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return to_utc(value)

    text = str(value).strip()
    if not text:
        return None

    # ``fromisoformat`` on Python 3.10 rejects the trailing "Z" that our own
    # exports and most other tools emit.
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"

    try:
        return to_utc(datetime.fromisoformat(text))
    except ValueError:
        return None


def _stamp_key(value: Any) -> str:
    """Comparable form of a timestamp, whatever shape it arrives in.

    SQLite hands datetimes back naive while parsed import values are aware, so
    comparing ``isoformat()`` directly never matched and every re-import
    duplicated the whole history.
    """
    normalized = ensure_utc(value) if value is not None else None
    return normalized.isoformat() if normalized else ""


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_int(value: Any, default: int = 1) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return default


def _clean_str(value: Any, default: str = "", limit: int = 2000) -> str:
    if value is None:
        return default
    return str(value).strip()[:limit]


def _tracker_key(name: str, category: str) -> tuple[str, str]:
    return (name.strip().lower(), (category or "General").strip().lower())


def _validated_tracker_fields(raw: dict, warnings: list[str]) -> dict | None:
    name = _clean_str(raw.get("name"), limit=120)
    if not name:
        warnings.append("Skipped a tracker with no name.")
        return None

    tracker_type = _clean_str(raw.get("type"), "build", limit=20).lower()
    if tracker_type not in VALID_TYPES:
        warnings.append(f"Skipped '{name}': unknown tracker type '{tracker_type}'.")
        return None

    units_per = _clean_str(raw.get("units_per"), "day", limit=10).lower()
    impact_per = _clean_str(raw.get("impact_per"), "day", limit=10).lower()

    start_date = _parse_timestamp(raw.get("start_date")) or utcnow()

    return {
        "name": name,
        "description": _clean_str(raw.get("description"), limit=2000),
        "color": _clean_str(raw.get("color"), limit=32),
        "category": _clean_str(raw.get("category"), "General", limit=60) or "General",
        "type": tracker_type,
        "unit": _clean_str(raw.get("unit"), limit=32),
        "impact_amount": max(0.0, _coerce_float(raw.get("impact_amount"))),
        "impact_unit": _clean_str(raw.get("impact_unit"), "$", limit=16) or "$",
        "impact_per": impact_per if impact_per in VALID_PERIODS else "day",
        "units_per_amount": max(0.0, _coerce_float(raw.get("units_per_amount"))),
        "units_per": units_per if units_per in VALID_PERIODS else "day",
        "units_per_interval": _coerce_int(raw.get("units_per_interval"), 1),
        "is_active": bool(raw.get("is_active", True)),
        "start_date": start_date,
        "current_streak_start_date": _parse_timestamp(raw.get("current_streak_start_date")) or start_date,
        "archived_at": _parse_timestamp(raw.get("archived_at")),
    }


def _apply_import(
    db: Session,
    payload: dict,
    user: models.User,
    mode: str,
    dry_run: bool,
) -> schemas.ImportSummary:
    warnings: list[str] = []

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The backup file is not valid JSON")

    declared_format = payload.get("format")
    if declared_format and declared_format != "anyhabit-backup":
        warnings.append(f"File declares format '{declared_format}'; importing it as a best-effort attempt.")

    raw_trackers = payload.get("trackers")
    if not isinstance(raw_trackers, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No trackers found in this file. Export with 'All Data' to get a restorable backup.",
        )

    summary = schemas.ImportSummary(
        dry_run=dry_run,
        mode=mode,
        source_version=payload.get("app_version"),
        source_exported_at=payload.get("export_date"),
    )

    existing_trackers = db.query(models.Tracker).filter(models.Tracker.owner_id == user.id).all()

    if mode == "replace":
        summary.trackers_deleted = len(existing_trackers)
        if not dry_run and existing_trackers:
            tracker_ids = [tracker.id for tracker in existing_trackers]
            db.query(models.HabitLog).filter(models.HabitLog.tracker_id.in_(tracker_ids)).delete(
                synchronize_session=False
            )
            db.query(models.JournalEntry).filter(models.JournalEntry.tracker_id.in_(tracker_ids)).delete(
                synchronize_session=False
            )
            db.query(models.TrackerParticipant).filter(
                models.TrackerParticipant.tracker_id.in_(tracker_ids)
            ).delete(synchronize_session=False)
            db.query(models.Tracker).filter(models.Tracker.id.in_(tracker_ids)).delete(synchronize_session=False)
            db.flush()
        existing_by_key: dict[tuple[str, str], models.Tracker] = {}
    else:
        existing_by_key = {
            _tracker_key(tracker.name or "", tracker.category or ""): tracker for tracker in existing_trackers
        }

    for raw_tracker in raw_trackers:
        if not isinstance(raw_tracker, dict):
            warnings.append("Skipped a malformed tracker entry.")
            continue

        fields = _validated_tracker_fields(raw_tracker, warnings)
        if fields is None:
            summary.trackers_skipped += 1
            continue

        key = _tracker_key(fields["name"], fields["category"])
        tracker = existing_by_key.get(key)

        if tracker is None:
            summary.trackers_created += 1
            if not dry_run:
                tracker = models.Tracker(owner_id=user.id, visibility="private", **fields)
                db.add(tracker)
                db.flush()
                db.add(
                    models.TrackerParticipant(
                        tracker_id=tracker.id, user_id=user.id, role="owner", added_at=utcnow()
                    )
                )
                existing_by_key[key] = tracker
        else:
            # An existing tracker keeps its own configuration; only its missing
            # history is filled in, so a merge can never silently rewrite the
            # settings someone is actively using.
            summary.trackers_updated += 1

        # Timestamps already on file, so re-importing the same backup is a
        # no-op rather than a duplicate.  Computed for dry runs too, otherwise a
        # preview would over-count history the user already has.
        existing_log_stamps: set[str] = set()
        existing_journal_stamps: set[str] = set()
        if tracker is not None:
            existing_log_stamps = {
                _stamp_key(ts)
                for (ts,) in db.query(models.HabitLog.timestamp)
                .filter(models.HabitLog.tracker_id == tracker.id, models.HabitLog.user_id == user.id)
                .all()
            }
            existing_journal_stamps = {
                _stamp_key(ts)
                for (ts,) in db.query(models.JournalEntry.timestamp)
                .filter(models.JournalEntry.tracker_id == tracker.id, models.JournalEntry.user_id == user.id)
                .all()
            }

        for raw_log in raw_tracker.get("logs") or []:
            if not isinstance(raw_log, dict):
                continue
            timestamp = _parse_timestamp(raw_log.get("timestamp"))
            if timestamp is None:
                warnings.append(f"Skipped a log on '{fields['name']}' with an unreadable timestamp.")
                continue
            if _stamp_key(timestamp) in existing_log_stamps:
                continue

            summary.logs_created += 1
            if not dry_run and tracker is not None:
                db.add(
                    models.HabitLog(
                        tracker_id=tracker.id,
                        user_id=user.id,
                        timestamp=timestamp,
                        amount=_coerce_float(raw_log.get("amount"), 1.0),
                        note=_clean_str(raw_log.get("note"), limit=500),
                    )
                )
                existing_log_stamps.add(_stamp_key(timestamp))

        for raw_journal in raw_tracker.get("journals") or []:
            if not isinstance(raw_journal, dict):
                continue
            timestamp = _parse_timestamp(raw_journal.get("timestamp"))
            if timestamp is None:
                warnings.append(f"Skipped a journal entry on '{fields['name']}' with an unreadable timestamp.")
                continue
            if _stamp_key(timestamp) in existing_journal_stamps:
                continue

            content = _clean_str(raw_journal.get("content"), limit=10000)
            if not content:
                continue

            mood = raw_journal.get("mood")
            try:
                mood_value = int(mood) if mood is not None else None
            except (TypeError, ValueError):
                mood_value = None
            if mood_value is not None and not 1 <= mood_value <= 5:
                mood_value = None

            summary.journals_created += 1
            if not dry_run and tracker is not None:
                db.add(
                    models.JournalEntry(
                        tracker_id=tracker.id,
                        user_id=user.id,
                        timestamp=timestamp,
                        mood=mood_value,
                        content=content,
                        is_relapse=bool(raw_journal.get("is_relapse", False)),
                    )
                )
                existing_journal_stamps.add(_stamp_key(timestamp))

    if dry_run:
        db.rollback()
    else:
        db.commit()

    summary.warnings = warnings[:50]
    return summary


@router.post("/", response_model=schemas.ImportSummary)
async def import_data(
    file: UploadFile = File(..., description="A JSON export produced by GET /export/"),
    mode: str = Query("merge", description="merge or replace"),
    dry_run: bool = Query(True, description="Preview the result without writing anything"),
    confirm: str = Query("", description=f"Required for replace mode: '{REPLACE_CONFIRMATION}'"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if mode not in {"merge", "replace"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mode must be 'merge' or 'replace'")

    if mode == "replace" and not dry_run and confirm.strip() != REPLACE_CONFIRMATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Replace mode deletes your existing trackers. Confirm with '{REPLACE_CONFIRMATION}'.",
        )

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Backup files are limited to {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file is not valid JSON. CSV exports cannot be imported.",
        ) from exc

    return _apply_import(db, payload, current_user, mode, dry_run)
