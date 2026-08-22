from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import models, schemas, webhooks
from ..access import require_tracker_access
from ..analytics import _calculate_streak_stats
from ..deps import get_current_user, get_db, get_period_context
from ..time_utils import PeriodContext, to_utc, utcnow

router = APIRouter(prefix="/trackers/{tracker_id}/logs", tags=["logs"])


def _get_owned_log(db: Session, tracker: models.Tracker, tracker_id: int, log_id: int, user_id: int) -> models.HabitLog:
    log = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.id == log_id, models.HabitLog.tracker_id == tracker_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")

    if tracker.owner_id != user_id and log.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only change your own logs")
    return log


@router.post("/", response_model=schemas.HabitLog, status_code=status.HTTP_201_CREATED)
def create_log(
    tracker_id: int,
    log: schemas.HabitLogCreate,
    timestamp: datetime | None = Query(
        None, description="When the activity happened. Defaults to now; may also be sent in the body."
    ),
    current_user: models.User = Depends(get_current_user),
    context: PeriodContext = Depends(get_period_context),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id)

    # The query parameter is the historical interface and still wins; the body
    # field exists so newer clients do not have to build a URL to log a value.
    effective_timestamp = timestamp or log.timestamp or utcnow()

    db_log = models.HabitLog(
        amount=log.amount,
        note=log.note,
        tracker_id=tracker_id,
        user_id=current_user.id,
        timestamp=to_utc(effective_timestamp),
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)

    webhooks.dispatch(
        db,
        current_user.id,
        "log.created",
        {
            "log": {"id": db_log.id, "amount": db_log.amount, "note": db_log.note, "timestamp": db_log.timestamp},
            "tracker": {"id": tracker.id, "name": tracker.name, "unit": tracker.unit, "type": tracker.type},
        },
    )
    _announce_streak_milestone(db, tracker, current_user, context)

    return db_log


def _announce_streak_milestone(
    db: Session, tracker: models.Tracker, user: models.User, context: PeriodContext
) -> None:
    """Fire `streak.milestone` when this log pushed the streak onto a round number.

    Only round numbers, so the event stays useful as a notification trigger
    rather than firing every single day.
    """
    logs = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.tracker_id == tracker.id, models.HabitLog.user_id == user.id)
        .all()
    )
    journals = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.tracker_id == tracker.id, models.JournalEntry.user_id == user.id)
        .all()
    )

    streak = _calculate_streak_stats(tracker, logs, journals, context)
    if not webhooks.milestone_reached(streak.current):
        return

    webhooks.dispatch(
        db,
        user.id,
        "streak.milestone",
        {
            "tracker": {"id": tracker.id, "name": tracker.name, "type": tracker.type},
            "streak": {"current": streak.current, "longest": streak.longest, "unit": streak.period_label},
        },
    )


@router.get("/", response_model=list[schemas.HabitLog])
def read_logs(
    tracker_id: int,
    mine_only: bool = Query(False, description="Restrict to the signed-in user's own logs"),
    limit: int = Query(1000, ge=1, le=5000),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_tracker_access(db, current_user.id, tracker_id)

    query = db.query(models.HabitLog).filter(models.HabitLog.tracker_id == tracker_id)
    if mine_only:
        query = query.filter(models.HabitLog.user_id == current_user.id)

    return query.order_by(models.HabitLog.timestamp.desc()).limit(limit).all()


@router.patch("/{log_id}", response_model=schemas.HabitLog)
def update_log(
    tracker_id: int,
    log_id: int,
    payload: schemas.HabitLogUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Correct a log entry instead of deleting and re-adding it."""
    tracker = require_tracker_access(db, current_user.id, tracker_id)
    log = _get_owned_log(db, tracker, tracker_id, log_id, current_user.id)

    if payload.amount is not None:
        log.amount = payload.amount
    if payload.note is not None:
        log.note = payload.note
    if payload.timestamp is not None:
        log.timestamp = to_utc(payload.timestamp)

    db.commit()
    db.refresh(log)
    return log


@router.delete("/{log_id}")
def delete_log(
    tracker_id: int,
    log_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id)
    log = _get_owned_log(db, tracker, tracker_id, log_id, current_user.id)
    removed = {"id": log.id, "amount": log.amount, "timestamp": log.timestamp}

    db.delete(log)
    db.commit()

    webhooks.dispatch(
        db,
        current_user.id,
        "log.deleted",
        {"log": removed, "tracker": {"id": tracker.id, "name": tracker.name}},
    )
    return {"message": "Log deleted"}
