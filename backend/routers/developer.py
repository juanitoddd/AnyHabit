"""Developer surface: personal access tokens, webhooks and Prometheus metrics.

The web UI is one client of this API, not the only one. These endpoints exist
so a self-hoster can script against their own data, wire AnyHabit into the rest
of their home setup, and graph it next to everything else they run.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, webhooks as webhook_service
from ..access import list_accessible_trackers
from ..analytics import build_dashboard_summary
from ..deps import get_current_user, get_db, get_period_context
from ..security import generate_api_token, generate_webhook_secret
from ..time_utils import PeriodContext, utcnow
from ..version import APP_VERSION

router = APIRouter(prefix="/developer", tags=["developer"])

MAX_TOKENS_PER_USER = 25
MAX_WEBHOOKS_PER_USER = 20


# ---------------------------------------------------------------------------
# Personal access tokens
# ---------------------------------------------------------------------------


@router.get("/tokens", response_model=list[schemas.ApiToken])
def list_tokens(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List tokens. The token values themselves are not stored and never returned."""
    return (
        db.query(models.ApiToken)
        .filter(models.ApiToken.user_id == current_user.id, models.ApiToken.revoked_at.is_(None))
        .order_by(models.ApiToken.created_at.desc())
        .all()
    )


@router.post("/tokens", response_model=schemas.ApiTokenCreated, status_code=status.HTTP_201_CREATED)
def create_token(
    payload: schemas.ApiTokenCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Issue a token.

    This is the only response that ever contains the token value, so the client
    must show it to the user immediately.
    """
    active_count = (
        db.query(models.ApiToken)
        .filter(models.ApiToken.user_id == current_user.id, models.ApiToken.revoked_at.is_(None))
        .count()
    )
    if active_count >= MAX_TOKENS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You already have {MAX_TOKENS_PER_USER} active tokens. Revoke one first.",
        )

    plaintext, token_hash, preview = generate_api_token()

    token = models.ApiToken(
        user_id=current_user.id,
        name=payload.name.strip(),
        token_hash=token_hash,
        token_prefix=preview,
        scope=payload.scope,
        created_at=utcnow(),
        expires_at=utcnow() + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None,
    )
    db.add(token)
    db.commit()
    db.refresh(token)

    return schemas.ApiTokenCreated(
        id=token.id,
        name=token.name,
        token_prefix=token.token_prefix,
        scope=token.scope,
        created_at=token.created_at,
        expires_at=token.expires_at,
        token=plaintext,
    )


@router.delete("/tokens/{token_id}")
def revoke_token(
    token_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = (
        db.query(models.ApiToken)
        .filter(models.ApiToken.id == token_id, models.ApiToken.user_id == current_user.id)
        .first()
    )
    if token is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    # Kept as a tombstone rather than deleted, so the row's hash stays reserved
    # and a revoked token can never be resurrected by a lucky collision.
    token.revoked_at = utcnow()
    db.commit()
    return {"message": f"Token '{token.name}' revoked"}


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------


@router.get("/webhooks", response_model=list[schemas.Webhook])
def list_webhooks(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Webhook)
        .filter(models.Webhook.user_id == current_user.id)
        .order_by(models.Webhook.created_at.desc())
        .all()
    )


@router.get("/webhooks/events", response_model=list[str])
def list_webhook_events():
    """The event names a webhook can subscribe to."""
    return list(webhook_service.EVENT_TYPES)


@router.post("/webhooks", response_model=schemas.Webhook, status_code=status.HTTP_201_CREATED)
def create_webhook(
    payload: schemas.WebhookCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.query(models.Webhook).filter(models.Webhook.user_id == current_user.id).count() >= MAX_WEBHOOKS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You already have {MAX_WEBHOOKS_PER_USER} webhooks. Delete one first.",
        )

    webhook = models.Webhook(
        user_id=current_user.id,
        name=payload.name.strip(),
        url=payload.url,
        events=payload.events.strip() or "*",
        # Generated rather than user-supplied so every hook is signed by default.
        secret=generate_webhook_secret(),
        is_active=payload.is_active,
        created_at=utcnow(),
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    return webhook


def _get_own_webhook(db: Session, webhook_id: int, user_id: int) -> models.Webhook:
    webhook = (
        db.query(models.Webhook)
        .filter(models.Webhook.id == webhook_id, models.Webhook.user_id == user_id)
        .first()
    )
    if webhook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return webhook


@router.patch("/webhooks/{webhook_id}", response_model=schemas.Webhook)
def update_webhook(
    webhook_id: int,
    payload: schemas.WebhookUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    webhook = _get_own_webhook(db, webhook_id, current_user.id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(webhook, field, value)

    db.commit()
    db.refresh(webhook)
    return webhook


@router.post("/webhooks/{webhook_id}/test", response_model=schemas.Webhook)
def test_webhook(
    webhook_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fire a sample payload so you can confirm the receiver works.

    Delivery is asynchronous; poll the webhook afterwards to read the outcome.
    """
    webhook = _get_own_webhook(db, webhook_id, current_user.id)

    webhook_service.dispatch(
        db,
        current_user.id,
        "webhook.test",
        {"message": "Test delivery from AnyHabit", "webhook_id": webhook.id, "user": current_user.username},
    )
    return webhook


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(
    webhook_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    webhook = _get_own_webhook(db, webhook_id, current_user.id)
    name = webhook.name or webhook.url

    db.delete(webhook)
    db.commit()
    return {"message": f"Webhook '{name}' deleted"}


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def _escape_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


@router.get("/metrics", response_class=Response)
def prometheus_metrics(
    current_user: models.User = Depends(get_current_user),
    context: PeriodContext = Depends(get_period_context),
    db: Session = Depends(get_db),
):
    """Prometheus exposition of the caller's own trackers.

    Authenticated like everything else — point Prometheus at it with an API
    token in an ``Authorization`` header. Scoped to the calling user so a
    shared instance never leaks one person's habits into another's dashboard.
    """
    trackers = list_accessible_trackers(db, current_user.id, include_archived=False)
    tracker_ids = [tracker.id for tracker in trackers]

    habit_logs = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.tracker_id.in_(tracker_ids), models.HabitLog.user_id == current_user.id)
        .all()
        if tracker_ids
        else []
    )
    journal_entries = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.tracker_id.in_(tracker_ids), models.JournalEntry.user_id == current_user.id)
        .all()
        if tracker_ids
        else []
    )

    summary = build_dashboard_summary(trackers, habit_logs, journal_entries, context)

    lines: list[str] = [
        "# HELP anyhabit_info Build information.",
        "# TYPE anyhabit_info gauge",
        f'anyhabit_info{{version="{APP_VERSION}",user="{_escape_label(current_user.username)}"}} 1',
        "# HELP anyhabit_trackers_total Number of trackers.",
        "# TYPE anyhabit_trackers_total gauge",
        f"anyhabit_trackers_total {summary.overview.total}",
        "# HELP anyhabit_trackers_active Number of active trackers.",
        "# TYPE anyhabit_trackers_active gauge",
        f"anyhabit_trackers_active {summary.overview.active}",
        "# HELP anyhabit_due_current_period Recurring trackers due in the current period.",
        "# TYPE anyhabit_due_current_period gauge",
        f"anyhabit_due_current_period {summary.overview.due_today}",
        "# HELP anyhabit_completed_current_period Recurring trackers already completed this period.",
        "# TYPE anyhabit_completed_current_period gauge",
        f"anyhabit_completed_current_period {summary.overview.completed_today}",
        "# HELP anyhabit_logs_total Habit log entries recorded.",
        "# TYPE anyhabit_logs_total counter",
        f"anyhabit_logs_total {len(habit_logs)}",
        "# HELP anyhabit_journal_entries_total Journal entries written.",
        "# TYPE anyhabit_journal_entries_total counter",
        f"anyhabit_journal_entries_total {len(journal_entries)}",
        "# HELP anyhabit_tracker_streak_current Current streak, per tracker.",
        "# TYPE anyhabit_tracker_streak_current gauge",
    ]

    for row in summary.impact_rows:
        labels = (
            f'tracker="{_escape_label(row.tracker.name or "")}",'
            f'category="{_escape_label(row.tracker.category or "General")}",'
            f'type="{_escape_label(row.tracker.type or "")}"'
        )
        lines.append(f"anyhabit_tracker_streak_current{{{labels}}} {row.current_streak}")

    lines.append("# HELP anyhabit_tracker_progress_percent Progress through the current period, per tracker.")
    lines.append("# TYPE anyhabit_tracker_progress_percent gauge")
    for row in summary.impact_rows:
        labels = f'tracker="{_escape_label(row.tracker.name or "")}"'
        lines.append(f"anyhabit_tracker_progress_percent{{{labels}}} {round(row.progress_percentage, 2)}")

    lines.append("# HELP anyhabit_tracker_impact_value Accumulated impact value, per tracker.")
    lines.append("# TYPE anyhabit_tracker_impact_value gauge")
    for row in summary.impact_rows:
        labels = (
            f'tracker="{_escape_label(row.tracker.name or "")}",'
            f'unit="{_escape_label(row.tracker.impact_unit or "")}"'
        )
        lines.append(f"anyhabit_tracker_impact_value{{{labels}}} {round(row.impact_value, 4)}")

    return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4; charset=utf-8")


# ---------------------------------------------------------------------------
# Activity feed
# ---------------------------------------------------------------------------


activity_router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@activity_router.get("/activity", response_model=schemas.ActivityFeed)
def read_activity(
    limit: int = Query(20, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    context: PeriodContext = Depends(get_period_context),
    db: Session = Depends(get_db),
):
    """Recent logs and journal entries across every accessible tracker.

    Feeds the dashboard's activity, journal and mood widgets, which would
    otherwise need one request per tracker.
    """
    from ..analytics import _build_mood_trend

    trackers = {tracker.id: tracker for tracker in list_accessible_trackers(db, current_user.id)}
    if not trackers:
        return schemas.ActivityFeed()

    tracker_ids = list(trackers.keys())

    logs = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.tracker_id.in_(tracker_ids), models.HabitLog.user_id == current_user.id)
        .order_by(models.HabitLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    journals = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.tracker_id.in_(tracker_ids), models.JournalEntry.user_id == current_user.id)
        .order_by(models.JournalEntry.timestamp.desc())
        .limit(limit)
        .all()
    )

    # The mood chart needs the full history, not just the page shown above it.
    all_journals = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.tracker_id.in_(tracker_ids), models.JournalEntry.user_id == current_user.id)
        .all()
    )

    return schemas.ActivityFeed(
        logs=[
            schemas.ActivityEntry(
                kind="log",
                id=log.id,
                tracker_id=log.tracker_id,
                tracker_name=trackers[log.tracker_id].name,
                tracker_color=trackers[log.tracker_id].color or "",
                timestamp=log.timestamp,
                amount=float(log.amount or 0),
                unit=trackers[log.tracker_id].unit or "",
                note=log.note or "",
            )
            for log in logs
            if log.tracker_id in trackers
        ],
        journals=[
            schemas.ActivityEntry(
                kind="journal",
                id=entry.id,
                tracker_id=entry.tracker_id,
                tracker_name=trackers[entry.tracker_id].name,
                tracker_color=trackers[entry.tracker_id].color or "",
                timestamp=entry.timestamp,
                content=entry.content or "",
                mood=entry.mood,
                is_relapse=bool(entry.is_relapse),
            )
            for entry in journals
            if entry.tracker_id in trackers
        ],
        mood_trend=_build_mood_trend(all_journals, context),
    )
