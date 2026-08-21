"""Authorisation helpers shared by the routers."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import models


def get_group_membership(db: Session, user_id: int, group_id: int) -> models.GroupMember | None:
    return (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id, models.GroupMember.user_id == user_id)
        .first()
    )


def get_tracker_participant(db: Session, tracker_id: int, user_id: int) -> models.TrackerParticipant | None:
    return (
        db.query(models.TrackerParticipant)
        .filter(models.TrackerParticipant.tracker_id == tracker_id, models.TrackerParticipant.user_id == user_id)
        .first()
    )


def get_tracker_or_404(db: Session, tracker_id: int) -> models.Tracker:
    tracker = db.query(models.Tracker).filter(models.Tracker.id == tracker_id).first()
    if tracker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tracker not found")
    return tracker


def can_view_group(db: Session, user_id: int, group_id: int) -> bool:
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if group is None:
        return False
    return group.owner_id == user_id or get_group_membership(db, user_id, group_id) is not None


def require_group_owner(db: Session, user_id: int, group_id: int) -> models.Group:
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if group.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can do this"
        )
    return group


def can_access_tracker(db: Session, user_id: int, tracker: models.Tracker) -> bool:
    if tracker.owner_id == user_id:
        return True
    return get_tracker_participant(db, tracker.id, user_id) is not None


def require_tracker_access(db: Session, user_id: int, tracker_id: int, write: bool = False) -> models.Tracker:
    tracker = get_tracker_or_404(db, tracker_id)
    if not can_access_tracker(db, user_id, tracker):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this tracker")
    if write and tracker.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the tracker owner can modify it")
    return tracker


def accessible_trackers_query(db: Session, user_id: int):
    """Trackers the user owns or participates in, as a single query.

    Replaces the previous "load every tracker in the database, then run one
    membership query per row" pattern, which grew linearly with *all* users'
    data rather than the caller's.
    """
    return (
        db.query(models.Tracker)
        .outerjoin(
            models.TrackerParticipant,
            (models.TrackerParticipant.tracker_id == models.Tracker.id)
            & (models.TrackerParticipant.user_id == user_id),
        )
        .filter(or_(models.Tracker.owner_id == user_id, models.TrackerParticipant.id.isnot(None)))
        .distinct()
    )


def list_accessible_trackers(db: Session, user_id: int, include_archived: bool = True) -> list[models.Tracker]:
    query = accessible_trackers_query(db, user_id)
    if not include_archived:
        query = query.filter(models.Tracker.archived_at.is_(None))
    return query.order_by(models.Tracker.id.desc()).all()
