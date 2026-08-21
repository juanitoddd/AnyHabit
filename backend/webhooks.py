"""Outbound webhook delivery.

Self-hosting means wiring AnyHabit into whatever else you run — Home Assistant,
Discord, n8n, a shell script behind a tiny HTTP server. These are the hooks for
that.

Delivery rules, all in service of one goal — **a webhook must never affect the
request that triggered it**:

* Dispatch happens on a background thread with a short timeout.
* Every failure is swallowed and recorded on the webhook row instead of raised.
* The outcome is stored so a broken endpoint is visible in the UI rather than
  only in the container log.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any

import httpx

from .database import SessionLocal
from .security import sign_webhook_payload
from .time_utils import utcnow
from .version import APP_VERSION

logger = logging.getLogger("anyhabit.webhooks")

DELIVERY_TIMEOUT_SECONDS = 5.0
MAX_ERROR_LENGTH = 500

# Everything a webhook can be subscribed to. Keep these stable: they are part
# of the integration contract, not internal names.
EVENT_TYPES = (
    "log.created",
    "log.deleted",
    "journal.created",
    "tracker.created",
    "tracker.relapse",
    "tracker.archived",
    "streak.milestone",
)

# Streak lengths worth announcing. Firing on every single day would make the
# event useless as a notification trigger.
STREAK_MILESTONES = (3, 7, 14, 21, 30, 50, 60, 75, 100, 150, 180, 200, 250, 300, 365, 500, 730, 1000)


def _matches(subscribed: str, event: str) -> bool:
    if not subscribed or subscribed.strip() == "*":
        return True
    return event in {part.strip() for part in subscribed.split(",") if part.strip()}


def _deliver(webhook_id: int, event: str, payload: dict[str, Any]) -> None:
    """Send one webhook and record the outcome. Runs off the request thread."""
    from . import models

    session = SessionLocal()
    try:
        webhook = session.query(models.Webhook).filter(models.Webhook.id == webhook_id).first()
        if webhook is None or not webhook.is_active:
            return

        body = json.dumps(
            {"event": event, "sent_at": utcnow().isoformat(), "version": APP_VERSION, "data": payload},
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": f"AnyHabit/{APP_VERSION}",
            "X-AnyHabit-Event": event,
        }
        if webhook.secret:
            # Receivers verify this instead of trusting the URL being secret.
            headers["X-AnyHabit-Signature"] = f"sha256={sign_webhook_payload(webhook.secret, body)}"

        webhook.last_triggered_at = utcnow()
        webhook.delivery_count = (webhook.delivery_count or 0) + 1

        try:
            response = httpx.post(
                webhook.url, content=body, headers=headers, timeout=DELIVERY_TIMEOUT_SECONDS
            )
            webhook.last_status = response.status_code
            if response.is_success:
                webhook.last_error = ""
            else:
                webhook.failure_count = (webhook.failure_count or 0) + 1
                webhook.last_error = f"HTTP {response.status_code}"[:MAX_ERROR_LENGTH]
        except Exception as exc:  # noqa: BLE001 - a bad URL must not surface to the user
            webhook.last_status = None
            webhook.failure_count = (webhook.failure_count or 0) + 1
            webhook.last_error = str(exc)[:MAX_ERROR_LENGTH]
            logger.info("Webhook %s failed: %s", webhook_id, exc)

        session.commit()
    except Exception:  # pragma: no cover - never let a delivery thread die loudly
        logger.exception("Webhook delivery raised unexpectedly")
        session.rollback()
    finally:
        session.close()


def dispatch(db, user_id: int, event: str, payload: dict[str, Any]) -> None:
    """Queue ``event`` to every active webhook the user has subscribed to it.

    Returns immediately; the HTTP calls happen on daemon threads.
    """
    from . import models

    try:
        webhooks = (
            db.query(models.Webhook)
            .filter(models.Webhook.user_id == user_id, models.Webhook.is_active.is_(True))
            .all()
        )
    except Exception:  # pragma: no cover - a lookup failure must not fail the request
        logger.exception("Could not load webhooks for user %s", user_id)
        return

    for webhook in webhooks:
        if not _matches(webhook.events or "*", event):
            continue
        threading.Thread(
            target=_deliver, args=(webhook.id, event, payload), daemon=True, name=f"webhook-{webhook.id}"
        ).start()


def milestone_reached(streak: int) -> bool:
    return streak in STREAK_MILESTONES
