from __future__ import annotations

from collections import defaultdict
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, webhooks
from ..access import (
    accessible_trackers_query,
    can_view_group,
    list_accessible_trackers,
    require_tracker_access,
)
from ..analytics import build_tracker_analytics
from ..deps import get_current_user, get_db, get_period_context
from ..time_utils import PeriodContext, to_utc, utcnow

router = APIRouter(prefix="/trackers", tags=["trackers"])


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def _participant_counts(db: Session, tracker_ids: list[int]) -> dict[int, int]:
    if not tracker_ids:
        return {}
    rows = (
        db.query(models.TrackerParticipant.tracker_id, func.count(models.TrackerParticipant.id))
        .filter(models.TrackerParticipant.tracker_id.in_(tracker_ids))
        .group_by(models.TrackerParticipant.tracker_id)
        .all()
    )
    return {int(tracker_id): int(count) for tracker_id, count in rows}


def _decorate(db: Session, tracker: models.Tracker) -> models.Tracker:
    """Attach the computed fields the ``Tracker`` schema expects."""
    setattr(
        tracker,
        "participant_count",
        db.query(models.TrackerParticipant)
        .filter(models.TrackerParticipant.tracker_id == tracker.id)
        .count(),
    )
    setattr(
        tracker,
        "participant_ids",
        [
            int(row[0])
            for row in db.query(models.TrackerParticipant.user_id)
            .filter(models.TrackerParticipant.tracker_id == tracker.id)
            .all()
        ],
    )
    return tracker


def _serialize_group(db: Session, group_id: int | None, current_user_id: int) -> schemas.Group | None:
    if group_id is None:
        return None

    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if group is None:
        return None

    memberships = (
        db.query(models.GroupMember, models.User)
        .join(models.User, models.User.id == models.GroupMember.user_id)
        .filter(models.GroupMember.group_id == group.id)
        .order_by(models.GroupMember.joined_at.asc())
        .all()
    )

    members = [
        schemas.GroupMember(
            user=schemas.User.model_validate(user),
            role=membership.role,
            joined_at=membership.joined_at,
        )
        for membership, user in memberships
    ]

    return schemas.Group(
        id=group.id,
        name=group.name,
        join_code=group.join_code,
        owner_id=group.owner_id,
        member_count=len(members),
        members=members,
        tracker_count=db.query(models.Tracker).filter(models.Tracker.group_id == group.id).count(),
        is_owner=group.owner_id == current_user_id,
    )


def _load_tracker_participants(db: Session, tracker_id: int) -> list[models.User]:
    return (
        db.query(models.User)
        .join(models.TrackerParticipant, models.TrackerParticipant.user_id == models.User.id)
        .filter(models.TrackerParticipant.tracker_id == tracker_id)
        .order_by(models.User.username.asc())
        .all()
    )


def _load_tracker_activity_maps(db: Session, tracker_id: int):
    habit_logs = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.tracker_id == tracker_id)
        .order_by(models.HabitLog.timestamp.asc())
        .all()
    )
    journal_entries = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.tracker_id == tracker_id)
        .order_by(models.JournalEntry.timestamp.asc())
        .all()
    )

    logs_by_user: dict[int, list[models.HabitLog]] = defaultdict(list)
    journals_by_user: dict[int, list[models.JournalEntry]] = defaultdict(list)

    for log in habit_logs:
        if log.user_id is not None:
            logs_by_user[int(log.user_id)].append(log)

    for journal in journal_entries:
        if journal.user_id is not None:
            journals_by_user[int(journal.user_id)].append(journal)

    return habit_logs, journal_entries, logs_by_user, journals_by_user


def _assign_tracker_participants(db: Session, tracker_id: int, participant_ids: list[int], owner_id: int):
    normalized_ids = sorted(
        {int(participant_id) for participant_id in participant_ids if int(participant_id) > 0} | {owner_id}
    )
    db.query(models.TrackerParticipant).filter(models.TrackerParticipant.tracker_id == tracker_id).delete(
        synchronize_session=False
    )
    db.flush()

    for participant_id in normalized_ids:
        db.add(
            models.TrackerParticipant(
                tracker_id=tracker_id,
                user_id=participant_id,
                role="owner" if participant_id == owner_id else "participant",
                added_at=utcnow(),
            )
        )


def _resolve_group_participants(
    db: Session, group_id: int, current_user_id: int, participant_ids: list[int]
) -> tuple[models.Group, list[int]]:
    group = db.query(models.Group).filter(models.Group.id == int(group_id)).first()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if not can_view_group(db, current_user_id, group.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")
    if group.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the group owner can manage shared trackers",
        )

    allowed_ids = {
        member.user_id for member in db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).all()
    }
    allowed_ids.add(current_user_id)
    return group, sorted({int(pid) for pid in participant_ids if int(pid) in allowed_ids})


def _analytics_for(
    db: Session,
    tracker: models.Tracker,
    current_user: models.User,
    context: PeriodContext,
) -> tuple[schemas.TrackerAnalytics, list[models.HabitLog], list[models.JournalEntry]]:
    habit_logs, journal_entries, logs_by_user, journals_by_user = _load_tracker_activity_maps(db, tracker.id)

    participants = [current_user]
    if tracker.group_id is not None:
        loaded = _load_tracker_participants(db, tracker.id)
        participants = loaded or [current_user]

    analytics = build_tracker_analytics(
        tracker,
        habit_logs,
        journal_entries,
        current_user_id=current_user.id,
        participants=participants,
        member_logs=dict(logs_by_user),
        member_journals=dict(journals_by_user),
        context=context,
    )
    return analytics, habit_logs, journal_entries


# ---------------------------------------------------------------------------
# Collection endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=List[schemas.Tracker])
def read_trackers(
    include_archived: bool = Query(False, description="Include trackers that have been archived"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trackers = list_accessible_trackers(db, current_user.id, include_archived=include_archived)
    tracker_ids = [tracker.id for tracker in trackers]

    counts = _participant_counts(db, tracker_ids)
    participants_by_tracker: dict[int, list[int]] = defaultdict(list)
    if tracker_ids:
        for tracker_id, user_id in (
            db.query(models.TrackerParticipant.tracker_id, models.TrackerParticipant.user_id)
            .filter(models.TrackerParticipant.tracker_id.in_(tracker_ids))
            .all()
        ):
            participants_by_tracker[int(tracker_id)].append(int(user_id))

    for tracker in trackers:
        setattr(tracker, "participant_count", counts.get(tracker.id, 0))
        setattr(tracker, "participant_ids", participants_by_tracker.get(tracker.id, []))
    return trackers


@router.post("/", response_model=schemas.Tracker)
def create_tracker(
    tracker: schemas.TrackerCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = tracker.model_dump()
    group_id = payload.pop("group_id", None)
    participant_ids = payload.pop("participant_ids", []) or []

    start_date = payload.get("start_date")
    payload["start_date"] = to_utc(start_date) if start_date else utcnow()
    payload["current_streak_start_date"] = payload["start_date"]
    payload["owner_id"] = current_user.id
    payload["group_id"] = group_id
    payload["visibility"] = "group" if group_id else "private"

    if group_id is not None:
        _, participant_ids = _resolve_group_participants(db, group_id, current_user.id, participant_ids)
    else:
        participant_ids = []

    db_tracker = models.Tracker(**payload)
    db.add(db_tracker)
    db.flush()
    _assign_tracker_participants(db, db_tracker.id, participant_ids, current_user.id)
    db.commit()
    db.refresh(db_tracker)

    webhooks.dispatch(
        db,
        current_user.id,
        "tracker.created",
        {"tracker": {"id": db_tracker.id, "name": db_tracker.name, "type": db_tracker.type,
                     "category": db_tracker.category}},
    )
    return _decorate(db, db_tracker)


# ---------------------------------------------------------------------------
# Single-tracker endpoints
# ---------------------------------------------------------------------------


@router.get("/{tracker_id}/", response_model=schemas.Tracker)
def read_tracker(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id)
    return _decorate(db, tracker)


@router.get("/{tracker_id}/analytics", response_model=schemas.TrackerAnalytics)
def read_tracker_analytics(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    context: PeriodContext = Depends(get_period_context),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id)
    analytics, _, _ = _analytics_for(db, tracker, current_user, context)
    return analytics


@router.get("/{tracker_id}/bundle", response_model=schemas.TrackerBundle)
def read_tracker_bundle(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    context: PeriodContext = Depends(get_period_context),
    db: Session = Depends(get_db),
):
    """Everything the tracker page needs in one round trip."""
    tracker = require_tracker_access(db, current_user.id, tracker_id)
    analytics, habit_logs, journal_entries = _analytics_for(db, tracker, current_user, context)

    return schemas.TrackerBundle(
        tracker=_decorate(db, tracker),
        habit_logs=habit_logs,
        journal_entries=journal_entries,
        analytics=analytics,
        group=_serialize_group(db, tracker.group_id, current_user.id),
        share_stats=analytics.share_stats,
    )


@router.post("/{tracker_id}/reset", response_model=schemas.Tracker)
def reset_tracker(
    tracker_id: int,
    note: str = Query("", max_length=2000, description="Optional context to store with the relapse"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a relapse.

    The relapse journal entry is the source of truth for streak maths, and
    ``current_streak_start_date`` is moved with it so the tracker's headline
    numbers restart too — previously the timestamp column was never updated,
    which is why "Log Relapse" reset the streak but not the totals beside it.
    """
    tracker = require_tracker_access(db, current_user.id, tracker_id)

    reset_at = utcnow()
    content = note.strip() or "Logged a relapse. Timer was reset to zero."

    db.add(
        models.JournalEntry(
            tracker_id=tracker_id,
            user_id=current_user.id,
            content=content,
            mood=1,
            is_relapse=True,
            timestamp=reset_at,
        )
    )

    if tracker.owner_id == current_user.id:
        tracker.current_streak_start_date = reset_at

    db.commit()
    db.refresh(tracker)

    webhooks.dispatch(
        db,
        current_user.id,
        "tracker.relapse",
        {"tracker": {"id": tracker.id, "name": tracker.name}, "note": content, "at": reset_at},
    )
    return _decorate(db, tracker)


@router.put("/{tracker_id}/stop", response_model=schemas.Tracker)
def stop_tracker(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id, write=True)
    tracker.is_active = False
    db.commit()
    db.refresh(tracker)
    return _decorate(db, tracker)


@router.put("/{tracker_id}/start", response_model=schemas.Tracker)
def start_tracker(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id, write=True)
    tracker.is_active = True
    db.commit()
    db.refresh(tracker)
    return _decorate(db, tracker)


@router.put("/{tracker_id}/archive", response_model=schemas.Tracker)
def archive_tracker(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hide a finished tracker without destroying its history.

    The alternative used to be deletion, which took every log and journal entry
    with it — a bad trade for a habit someone simply stopped tracking.
    """
    tracker = require_tracker_access(db, current_user.id, tracker_id, write=True)
    tracker.archived_at = utcnow()
    tracker.is_active = False
    db.commit()
    db.refresh(tracker)

    webhooks.dispatch(
        db,
        current_user.id,
        "tracker.archived",
        {"tracker": {"id": tracker.id, "name": tracker.name}},
    )
    return _decorate(db, tracker)


@router.put("/{tracker_id}/unarchive", response_model=schemas.Tracker)
def unarchive_tracker(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id, write=True)
    tracker.archived_at = None
    tracker.is_active = True
    db.commit()
    db.refresh(tracker)
    return _decorate(db, tracker)


@router.patch("/{tracker_id}/", response_model=schemas.Tracker)
def edit_tracker(
    tracker_id: int,
    entry: schemas.TrackerUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id, write=True)

    # exclude_unset keeps this a true PATCH: a field the client did not send is
    # left alone, while a field sent as "" or 0 is applied rather than ignored.
    payload = entry.model_dump(exclude_unset=True)
    group_id = payload.pop("group_id", ...)
    participant_ids = payload.pop("participant_ids", None)

    if group_id is not ...:
        if group_id is not None:
            group, participant_ids = _resolve_group_participants(
                db, group_id, current_user.id, participant_ids or []
            )
            tracker.group_id = group.id
            tracker.visibility = "group"
        else:
            tracker.group_id = None
            tracker.visibility = "private"
            participant_ids = []
        _assign_tracker_participants(db, tracker.id, participant_ids or [], current_user.id)
    elif participant_ids is not None and tracker.group_id is not None:
        _, participant_ids = _resolve_group_participants(
            db, tracker.group_id, current_user.id, participant_ids
        )
        _assign_tracker_participants(db, tracker.id, participant_ids, current_user.id)

    if "start_date" in payload:
        start_date = payload.pop("start_date")
        if start_date is not None:
            tracker.start_date = to_utc(start_date)

    for field_name, field_value in payload.items():
        setattr(tracker, field_name, field_value)

    db.commit()
    db.refresh(tracker)
    return _decorate(db, tracker)


@router.delete("/{tracker_id}")
def delete_tracker(
    tracker_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tracker = require_tracker_access(db, current_user.id, tracker_id, write=True)

    db.query(models.JournalEntry).filter(models.JournalEntry.tracker_id == tracker_id).delete(
        synchronize_session=False
    )
    db.query(models.HabitLog).filter(models.HabitLog.tracker_id == tracker_id).delete(synchronize_session=False)
    db.query(models.TrackerParticipant).filter(models.TrackerParticipant.tracker_id == tracker_id).delete(
        synchronize_session=False
    )
    db.delete(tracker)
    db.commit()

    return {"message": f"Tracker with ID {tracker_id} was deleted successfully"}
