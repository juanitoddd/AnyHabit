from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..access import require_tracker_access
from ..deps import get_current_user, get_db
from ..time_utils import to_utc, utcnow

router = APIRouter(prefix="/trackers/{tracker_id}/journal", tags=["journals"])


def _get_own_entry(db: Session, tracker_id: int, journal_id: int, user_id: int) -> models.JournalEntry:
    entry = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.id == journal_id, models.JournalEntry.tracker_id == tracker_id)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found")

    # Journals stay private to their author even on a shared tracker.
    if entry.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only change your own journal entries"
        )
    return entry


@router.post("/", response_model=schemas.JournalEntry, status_code=status.HTTP_201_CREATED)
def create_journal_entry(
    tracker_id: int,
    entry: schemas.JournalEntryCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_tracker_access(db, current_user.id, tracker_id)

    db_entry = models.JournalEntry(
        tracker_id=tracker_id,
        user_id=current_user.id,
        content=entry.content,
        mood=entry.mood,
        timestamp=to_utc(entry.timestamp) if entry.timestamp else utcnow(),
    )
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry


@router.get("/", response_model=List[schemas.JournalEntry])
def read_journal_entries(
    tracker_id: int,
    mine_only: bool = Query(False, description="Restrict to the signed-in user's own entries"),
    search: str = Query("", max_length=200, description="Case-insensitive text filter"),
    limit: int = Query(500, ge=1, le=5000),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_tracker_access(db, current_user.id, tracker_id)

    query = db.query(models.JournalEntry).filter(models.JournalEntry.tracker_id == tracker_id)
    if mine_only:
        query = query.filter(models.JournalEntry.user_id == current_user.id)
    if search.strip():
        query = query.filter(models.JournalEntry.content.ilike(f"%{search.strip()}%"))

    return query.order_by(models.JournalEntry.timestamp.desc()).limit(limit).all()


@router.put("/{journal_id}", response_model=schemas.JournalEntry)
def edit_journal_entry(
    tracker_id: int,
    journal_id: int,
    entry: schemas.JournalEntryBase,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_tracker_access(db, current_user.id, tracker_id)
    db_journal = _get_own_entry(db, tracker_id, journal_id, current_user.id)

    db_journal.content = entry.content
    if entry.mood is not None:
        db_journal.mood = entry.mood

    db.commit()
    db.refresh(db_journal)
    return db_journal


@router.delete("/{journal_id}")
def delete_journal_entry(
    tracker_id: int,
    journal_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_tracker_access(db, current_user.id, tracker_id)
    db_journal = _get_own_entry(db, tracker_id, journal_id, current_user.id)

    db.delete(db_journal)
    db.commit()
    return {"message": f"Journal with ID {journal_id} was deleted successfully"}
