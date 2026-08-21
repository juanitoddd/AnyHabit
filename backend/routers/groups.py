from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..access import can_view_group, require_group_owner
from ..deps import get_current_user, get_db
from ..time_utils import utcnow

router = APIRouter(prefix="/groups", tags=["groups"])


def _generate_join_code() -> str:
    # Uppercase alphanumerics only: this gets read aloud and typed by hand.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _unique_join_code(db: Session) -> str:
    join_code = _generate_join_code()
    while db.query(models.Group).filter(models.Group.join_code == join_code).first() is not None:
        join_code = _generate_join_code()
    return join_code


def _serialize_group(db: Session, group: models.Group, current_user_id: int) -> schemas.Group:
    members = (
        db.query(models.GroupMember, models.User)
        .join(models.User, models.User.id == models.GroupMember.user_id)
        .filter(models.GroupMember.group_id == group.id)
        .order_by(models.GroupMember.joined_at.asc())
        .all()
    )

    serialized_members = [
        schemas.GroupMember(
            user=schemas.User.model_validate(user),
            role=member.role,
            joined_at=member.joined_at,
        )
        for member, user in members
    ]

    return schemas.Group(
        id=group.id,
        name=group.name,
        join_code=group.join_code,
        owner_id=group.owner_id,
        member_count=len(serialized_members),
        members=serialized_members,
        tracker_count=db.query(models.Tracker).filter(models.Tracker.group_id == group.id).count(),
        is_owner=group.owner_id == current_user_id,
    )


def _require_visible_group(db: Session, group_id: int, current_user_id: int) -> models.Group:
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if not can_view_group(db, current_user_id, group_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")
    return group


def _detach_member(db: Session, group_id: int, user_id: int) -> None:
    """Remove a member and pull them off that group's shared trackers.

    Their own logs and journals are left intact — leaving a group should not
    erase the history they built while in it.
    """
    db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id, models.GroupMember.user_id == user_id
    ).delete(synchronize_session=False)

    group_tracker_ids = [
        row[0] for row in db.query(models.Tracker.id).filter(models.Tracker.group_id == group_id).all()
    ]
    if group_tracker_ids:
        db.query(models.TrackerParticipant).filter(
            models.TrackerParticipant.tracker_id.in_(group_tracker_ids),
            models.TrackerParticipant.user_id == user_id,
        ).delete(synchronize_session=False)


@router.get("/", response_model=list[schemas.Group])
def read_groups(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    groups = (
        db.query(models.Group)
        .join(models.GroupMember, models.GroupMember.group_id == models.Group.id, isouter=True)
        .filter((models.Group.owner_id == current_user.id) | (models.GroupMember.user_id == current_user.id))
        .distinct()
        .order_by(models.Group.created_at.desc())
        .all()
    )
    return [_serialize_group(db, group, current_user.id) for group in groups]


@router.post("/", response_model=schemas.Group, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: schemas.GroupCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = models.Group(name=payload.name.strip(), join_code=_unique_join_code(db), owner_id=current_user.id)
    db.add(group)
    db.flush()
    db.add(models.GroupMember(group_id=group.id, user_id=current_user.id, role="owner", joined_at=utcnow()))
    db.commit()
    db.refresh(group)

    return _serialize_group(db, group, current_user.id)


@router.post("/join", response_model=schemas.Group)
def join_group(
    payload: schemas.GroupJoin,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.join_code == payload.join_code.strip().upper()).first()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No group matches that join code")

    existing_membership = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group.id, models.GroupMember.user_id == current_user.id)
        .first()
    )
    if existing_membership is None:
        db.add(
            models.GroupMember(group_id=group.id, user_id=current_user.id, role="member", joined_at=utcnow())
        )
        db.commit()

    return _serialize_group(db, group, current_user.id)


@router.get("/{group_id}", response_model=schemas.Group)
def read_group(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = _require_visible_group(db, group_id, current_user.id)
    return _serialize_group(db, group, current_user.id)


@router.get("/{group_id}/members", response_model=list[schemas.GroupMember])
def read_group_members(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_visible_group(db, group_id, current_user.id)

    memberships = (
        db.query(models.GroupMember, models.User)
        .join(models.User, models.User.id == models.GroupMember.user_id)
        .filter(models.GroupMember.group_id == group_id)
        .order_by(models.GroupMember.joined_at.asc())
        .all()
    )
    return [
        schemas.GroupMember(
            user=schemas.User.model_validate(user),
            role=membership.role,
            joined_at=membership.joined_at,
        )
        for membership, user in memberships
    ]


@router.patch("/{group_id}", response_model=schemas.Group)
def rename_group(
    group_id: int,
    payload: schemas.GroupUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = require_group_owner(db, current_user.id, group_id)
    group.name = payload.name.strip()
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group, current_user.id)


@router.post("/{group_id}/rotate-code", response_model=schemas.Group)
def rotate_join_code(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Issue a fresh join code, invalidating the old one.

    The only way to un-share a code that has leaked beyond the people it was
    meant for.
    """
    group = require_group_owner(db, current_user.id, group_id)
    group.join_code = _unique_join_code(db)
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group, current_user.id)


@router.delete("/{group_id}/members/{user_id}", response_model=schemas.Group)
def remove_group_member(
    group_id: int,
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = require_group_owner(db, current_user.id, group_id)

    if user_id == group.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The group owner cannot be removed. Delete the group instead.",
        )

    membership = (
        db.query(models.GroupMember)
        .filter(models.GroupMember.group_id == group_id, models.GroupMember.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That person is not in this group")

    _detach_member(db, group_id, user_id)
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group, current_user.id)


@router.post("/{group_id}/leave")
def leave_group(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = _require_visible_group(db, group_id, current_user.id)

    if group.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You own this group. Delete it instead of leaving.",
        )

    _detach_member(db, group_id, current_user.id)
    db.commit()
    return {"message": f"You left {group.name}"}


@router.delete("/{group_id}")
def delete_group(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disband a group.

    Shared trackers are converted back to private trackers owned by whoever
    created them rather than deleted, so no history is lost.
    """
    group = require_group_owner(db, current_user.id, group_id)

    group_tracker_ids = [
        row[0] for row in db.query(models.Tracker.id).filter(models.Tracker.group_id == group_id).all()
    ]
    if group_tracker_ids:
        db.query(models.Tracker).filter(models.Tracker.id.in_(group_tracker_ids)).update(
            {models.Tracker.group_id: None, models.Tracker.visibility: "private"}, synchronize_session=False
        )
        # Only the owner keeps a participant row on a now-private tracker.
        db.query(models.TrackerParticipant).filter(
            models.TrackerParticipant.tracker_id.in_(group_tracker_ids),
            models.TrackerParticipant.role != "owner",
        ).delete(synchronize_session=False)

    db.query(models.GroupMember).filter(models.GroupMember.group_id == group_id).delete(synchronize_session=False)
    db.delete(group)
    db.commit()

    return {"message": f"Group '{group.name}' was deleted"}
