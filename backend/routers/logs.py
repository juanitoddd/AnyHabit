from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..access import require_tracker_access
from ..deps import get_current_user, get_db
from ..time_utils import to_utc, utcnow

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
    db: Session = Depends(get_db),
):
    require_tracker_access(db, current_user.id, tracker_id)

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
    return db_log


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

    db.delete(log)
    db.commit()
    return {"message": "Log deleted"}
