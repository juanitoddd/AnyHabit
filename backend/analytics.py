"""Derived statistics for trackers and the home dashboard.

Everything here is computed on demand from raw logs and journal entries — no
denormalised counters — so editing or deleting history always yields correct
numbers.  Period boundaries come from the caller's :class:`PeriodContext`, so
the same log set produces different (and correct) day buckets for users in
different timezones.
"""

from __future__ import annotations

from datetime import timedelta

from . import models, schemas
from .time_utils import (
    PeriodContext,
    UTC_CONTEXT,
    add_period,
    ensure_utc,
    format_short_date,
    local_date_key,
    period_start,
    periods_between,
    shift_period,
    utcnow,
)

DAY_MS = 1000 * 60 * 60 * 24

# How much history the tracker detail charts render.
CHART_LOOKBACK_DAYS = 120
HEATMAP_DAYS = 168
# Window used for the "recent consistency" figure on the tracker page.
RECENT_WINDOW_PERIODS = 30


def get_interval_count(tracker: models.Tracker) -> int:
    return max(1, int(tracker.units_per_interval or 1))


def _get_ms_per_period(period: str) -> float:
    """Average length of a period, for rate maths that must not depend on a calendar.

    Used only for continuously-accruing figures (a quit tracker's "avoided so
    far"), never for bucketing — bucketing goes through the calendar helpers.
    """
    ms_per_day = float(DAY_MS)
    if period == "week":
        return ms_per_day * 7
    if period == "month":
        return ms_per_day * 30.44
    if period == "year":
        return ms_per_day * 365.25
    return ms_per_day


def get_window_details(
    value,
    anchor,
    period: str,
    interval_count: int,
    context: PeriodContext = UTC_CONTEXT,
) -> dict:
    """Locate ``value`` within the repeating window grid that starts at ``anchor``.

    A tracker with ``units_per='day'`` and ``units_per_interval=3`` has windows
    three days wide; this returns which window an instant falls into and that
    window's bounds.
    """
    base_date = period_start(value, period, context)
    diff_periods = periods_between(anchor, base_date, period, context)
    window_index = diff_periods // interval_count
    start = shift_period(anchor, period, window_index * interval_count, context)
    end = shift_period(start, period, interval_count, context)
    return {"window_index": window_index, "start": start, "end": end}


def get_period_label(period: str, interval_count: int) -> str:
    labels = {
        "day": {"singular": "day", "plural": "days"},
        "week": {"singular": "week", "plural": "weeks"},
        "month": {"singular": "month", "plural": "months"},
        "year": {"singular": "year", "plural": "years"},
    }

    if interval_count == 1:
        return labels.get(period, labels["day"])["plural"]
    return f"{interval_count}-{labels.get(period, labels['day'])['singular']} windows"


# ---------------------------------------------------------------------------
# Shared building blocks
# ---------------------------------------------------------------------------


def _relapse_timestamps(journal_entries: list[models.JournalEntry]) -> list:
    return sorted(ensure_utc(entry.timestamp) for entry in journal_entries if entry.is_relapse)


def get_effective_start(
    tracker: models.Tracker,
    journal_entries: list[models.JournalEntry],
) -> object:
    """Where the *current* run of a tracker begins.

    For a quit tracker this is the moment of the most recent relapse, which is
    what makes "Log Relapse" actually reset the counters instead of only
    nudging the streak.  Lifetime figures still use ``tracker.start_date``.
    """
    start_date = ensure_utc(tracker.start_date)
    if tracker.type != "quit":
        return start_date

    relapses = _relapse_timestamps(journal_entries)
    if not relapses:
        return start_date

    latest_relapse = relapses[-1]
    if start_date is not None and latest_relapse < start_date:
        return start_date
    return latest_relapse


def _build_daily_log_map(habit_logs: list[models.HabitLog], context: PeriodContext) -> dict[str, float]:
    totals: dict[str, float] = {}
    for log in habit_logs:
        key = local_date_key(log.timestamp, context)
        totals[key] = totals.get(key, 0.0) + float(log.amount or 0)
    return totals


def _build_relapse_day_keys(journal_entries: list[models.JournalEntry], context: PeriodContext) -> set[str]:
    return {
        local_date_key(entry.timestamp, context)
        for entry in journal_entries
        if entry.is_relapse
    }


def _totals_by_window(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    anchor,
    period: str,
    interval_count: int,
    context: PeriodContext,
) -> dict[int, float]:
    totals: dict[int, float] = {}
    for log in habit_logs:
        window = get_window_details(log.timestamp, anchor, period, interval_count, context)
        window_index = int(window["window_index"])
        if window_index < 0:
            continue
        totals[window_index] = totals.get(window_index, 0.0) + float(log.amount or 0)
    return totals


def _get_completion_threshold(tracker: models.Tracker) -> float:
    if tracker.type == "quit":
        return 0.0
    if tracker.type == "boolean":
        return 1.0
    return max(0.0, float(tracker.units_per_amount or 0))


# ---------------------------------------------------------------------------
# Core metrics
# ---------------------------------------------------------------------------


def _calculate_current_math(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry] | None = None,
    context: PeriodContext = UTC_CONTEXT,
) -> schemas.TrackerCurrentMath:
    start_date = ensure_utc(tracker.start_date)
    if start_date is None:
        return schemas.TrackerCurrentMath()

    journal_entries = journal_entries or []
    units_interval = get_interval_count(tracker)

    if tracker.type == "quit":
        # Counts run from the last relapse; the lifetime figures below keep the
        # full history visible so nothing looks like it was thrown away.
        run_start = get_effective_start(tracker, journal_entries) or start_date
        run_ms = max(0.0, (utcnow() - run_start).total_seconds() * 1000.0)
        lifetime_ms = max(0.0, (utcnow() - start_date).total_seconds() * 1000.0)

        def units_for(elapsed_ms: float) -> float:
            return float(tracker.units_per_amount or 0) * (
                elapsed_ms / (_get_ms_per_period(tracker.units_per) * units_interval)
            )

        def impact_for(elapsed_ms: float) -> float:
            return float(tracker.impact_amount or 0) * (elapsed_ms / _get_ms_per_period(tracker.impact_per))

        return schemas.TrackerCurrentMath(
            main_unit=max(0.0, units_for(run_ms)),
            target_unit=0.0,
            impact_value=max(0.0, impact_for(run_ms)),
            lifetime_main_unit=max(0.0, units_for(lifetime_ms)),
            lifetime_impact_value=max(0.0, impact_for(lifetime_ms)),
        )

    actual_logged_units = sum(float(log.amount or 0) for log in habit_logs)
    elapsed_ms = max(0.0, (utcnow() - start_date).total_seconds() * 1000.0)
    time_based_units = float(tracker.units_per_amount or 0) * (
        elapsed_ms / (_get_ms_per_period(tracker.units_per) * units_interval)
    )

    impact_per_ms = float(tracker.impact_amount or 0) / _get_ms_per_period(tracker.impact_per)
    units_per_ms = (
        float(tracker.units_per_amount or 0) / (_get_ms_per_period(tracker.units_per) * units_interval)
        if float(tracker.units_per_amount or 0) > 0
        else 0.0
    )
    impact_per_unit = impact_per_ms / units_per_ms if units_per_ms > 0 else 0.0
    impact_value = max(0.0, actual_logged_units * impact_per_unit)

    return schemas.TrackerCurrentMath(
        main_unit=actual_logged_units,
        target_unit=max(0.0, time_based_units),
        impact_value=impact_value,
        lifetime_main_unit=actual_logged_units,
        lifetime_impact_value=impact_value,
    )


def _calculate_daily_progress(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    context: PeriodContext = UTC_CONTEXT,
) -> schemas.TrackerDailyProgress:
    if tracker.start_date is None or tracker.type not in {"build", "boolean"}:
        return schemas.TrackerDailyProgress()

    period_to_check = tracker.units_per
    interval_count = get_interval_count(tracker)
    anchor = period_start(tracker.start_date, period_to_check, context)
    window = get_window_details(utcnow(), anchor, period_to_check, interval_count, context)

    window_total = sum(
        float(log.amount or 0)
        for log in habit_logs
        if window["start"] <= (ensure_utc(log.timestamp) or utcnow()) < window["end"]
    )
    window_target = 1.0 if tracker.type == "boolean" else max(0.0, float(tracker.units_per_amount or 0))
    percentage = min(100.0, (window_total / window_target) * 100) if window_target > 0 else 0.0

    return schemas.TrackerDailyProgress(
        total=window_total,
        target=window_target,
        percentage=percentage,
        window_start=window["start"],
        window_end=window["end"],
    )


def _calculate_streak_stats(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry],
    context: PeriodContext = UTC_CONTEXT,
) -> schemas.TrackerStreakStats:
    if tracker.start_date is None:
        return schemas.TrackerStreakStats()

    if tracker.type == "quit":
        today = period_start(utcnow(), "day", context)
        tracker_start_day = period_start(tracker.start_date, "day", context)
        relapse_days = sorted(
            {period_start(entry.timestamp, "day", context) for entry in journal_entries if entry.is_relapse}
        )

        segment_start = tracker_start_day
        longest = 0
        for relapse_day in relapse_days:
            if relapse_day < segment_start:
                continue
            longest = max(longest, max(0, (relapse_day - segment_start).days))
            segment_start = add_period(relapse_day, "day", context)

        current = (today - segment_start).days + 1 if today >= segment_start else 0
        return schemas.TrackerStreakStats(
            current=current,
            longest=max(longest, current),
            period_label="days",
            total_relapses=len(relapse_days),
        )

    streak_period = tracker.units_per if tracker.type in {"boolean", "build"} else "day"
    interval_count = get_interval_count(tracker)
    threshold = _get_completion_threshold(tracker) or 0.0001

    tracker_start = period_start(tracker.start_date, streak_period, context)
    totals_by_window = _totals_by_window(
        tracker, habit_logs, tracker_start, streak_period, interval_count, context
    )
    current_window = int(
        get_window_details(utcnow(), tracker_start, streak_period, interval_count, context)["window_index"]
    )

    longest = 0
    running = 0
    completed_periods: list[bool] = []
    for index in range(current_window + 1):
        done = totals_by_window.get(index, 0.0) >= threshold
        completed_periods.append(done)

        if done:
            running += 1
            longest = max(longest, running)
        else:
            running = 0

    current = 0
    for completed in reversed(completed_periods):
        if not completed:
            break
        current += 1

    return schemas.TrackerStreakStats(
        current=current,
        longest=longest,
        period_label=get_period_label(streak_period, interval_count),
        total_relapses=0,
    )


def _build_completion_history(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry],
    context: PeriodContext = UTC_CONTEXT,
) -> list[bool]:
    if tracker.start_date is None:
        return []

    if tracker.type == "quit":
        today = period_start(utcnow(), "day", context)
        cursor = period_start(tracker.start_date, "day", context)
        relapse_days = {
            period_start(entry.timestamp, "day", context) for entry in journal_entries if entry.is_relapse
        }

        history: list[bool] = []
        # Guard against a start date far in the past producing an unbounded loop.
        while cursor <= today and len(history) <= 20000:
            history.append(cursor not in relapse_days)
            cursor = add_period(cursor, "day", context)
        return history

    streak_period = tracker.units_per
    interval_count = get_interval_count(tracker)
    tracker_start = period_start(tracker.start_date, streak_period, context)
    current_window = int(
        get_window_details(utcnow(), tracker_start, streak_period, interval_count, context)["window_index"]
    )
    threshold = _get_completion_threshold(tracker)
    totals_by_window = _totals_by_window(
        tracker, habit_logs, tracker_start, streak_period, interval_count, context
    )

    return [totals_by_window.get(index, 0.0) >= threshold for index in range(current_window + 1)]


def _calculate_consistency(history: list[bool]) -> schemas.TrackerConsistency:
    """Completion rate overall and across the most recent windows."""
    if not history:
        return schemas.TrackerConsistency()

    recent = history[-RECENT_WINDOW_PERIODS:]
    return schemas.TrackerConsistency(
        completed_periods=sum(1 for done in history if done),
        total_periods=len(history),
        rate=round((sum(1 for done in history if done) / len(history)) * 100, 1),
        recent_rate=round((sum(1 for done in recent if done) / len(recent)) * 100, 1),
        recent_window=len(recent),
    )


def _build_weekday_breakdown(
    habit_logs: list[models.HabitLog],
    context: PeriodContext,
) -> list[schemas.TrackerWeekdayStat]:
    """Which weekdays the user actually shows up on.

    Surfaces the "I always miss Sundays" pattern that a streak number hides.
    """
    names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    totals = [0.0] * 7
    counts = [0] * 7

    for log in habit_logs:
        local_value = ensure_utc(log.timestamp)
        if local_value is None:
            continue
        weekday = local_value.astimezone(context.tzinfo).weekday()
        totals[weekday] += float(log.amount or 0)
        counts[weekday] += 1

    return [
        schemas.TrackerWeekdayStat(weekday=index, label=names[index], total=round(totals[index], 2), entries=counts[index])
        for index in range(7)
    ]


def _build_mood_trend(
    journal_entries: list[models.JournalEntry],
    context: PeriodContext,
) -> list[schemas.TrackerMoodPoint]:
    """Average logged mood per day, for the journal mood chart."""
    buckets: dict[str, list[int]] = {}
    for entry in journal_entries:
        if entry.mood is None:
            continue
        buckets.setdefault(local_date_key(entry.timestamp, context), []).append(int(entry.mood))

    return [
        schemas.TrackerMoodPoint(
            date=date_key,
            average=round(sum(moods) / len(moods), 2),
            entries=len(moods),
        )
        for date_key, moods in sorted(buckets.items())
    ]


def _build_historical_chart_data(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry],
    context: PeriodContext = UTC_CONTEXT,
) -> list[schemas.TrackerChartPoint]:
    if tracker.start_date is None:
        return []

    today = period_start(utcnow(), "day", context)
    start_date = shift_period(today, "day", -(CHART_LOOKBACK_DAYS - 1), context)

    daily_log_map = _build_daily_log_map(habit_logs, context)
    relapse_day_keys = _build_relapse_day_keys(journal_entries, context)

    points: list[schemas.TrackerChartPoint] = []
    cursor = start_date

    if tracker.type == "quit":
        tracker_start = period_start(tracker.start_date, "day", context)
        running_streak = 0

        for _ in range(CHART_LOOKBACK_DAYS):
            key = local_date_key(cursor, context)

            if cursor < tracker_start or key in relapse_day_keys:
                running_streak = 0
            else:
                running_streak += 1

            points.append(
                schemas.TrackerChartPoint(
                    date=key,
                    label=format_short_date(cursor, context),
                    value=running_streak,
                )
            )
            cursor = add_period(cursor, "day", context)
        return points

    running_total = 0.0
    for _ in range(CHART_LOOKBACK_DAYS):
        key = local_date_key(cursor, context)
        daily_amount = daily_log_map.get(key, 0.0)
        running_total += daily_amount

        points.append(
            schemas.TrackerChartPoint(
                date=key,
                label=format_short_date(cursor, context),
                value=daily_amount,
                cumulative=round(running_total, 2),
            )
        )
        cursor = add_period(cursor, "day", context)
    return points


def _build_heatmap(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry],
    context: PeriodContext = UTC_CONTEXT,
) -> schemas.TrackerHeatmap | None:
    """Calendar heatmap of the last ~24 weeks.

    Built for every tracker type, not just ``build`` — a quit tracker's
    relapse days are exactly the kind of thing a calendar view makes obvious.
    """
    if tracker.start_date is None:
        return None

    end = period_start(utcnow(), "day", context)
    start = shift_period(end, "day", -(HEATMAP_DAYS - 1), context)
    aligned_start = period_start(start, "week", context)

    daily_log_map = _build_daily_log_map(habit_logs, context)
    relapse_day_keys = _build_relapse_day_keys(journal_entries, context)
    tracker_start = period_start(tracker.start_date, "day", context)

    cells: list[schemas.TrackerHeatmapCell] = []
    cursor = aligned_start
    while cursor <= end:
        key = local_date_key(cursor, context)
        is_filler = cursor < start
        is_relapse = (not is_filler) and key in relapse_day_keys

        if tracker.type == "quit":
            # 1 marks a clean day, 0 a relapse, so the same colour ramp works
            # for both tracker families.
            amount = 0.0 if (is_filler or cursor < tracker_start or is_relapse) else 1.0
        else:
            amount = 0.0 if is_filler else daily_log_map.get(key, 0.0)

        cells.append(
            schemas.TrackerHeatmapCell(
                date=key,
                amount=amount,
                is_filler=is_filler,
                is_relapse=is_relapse,
            )
        )
        cursor = add_period(cursor, "day", context)

    max_amount = max([0.0, *[cell.amount for cell in cells]])
    columns = [cells[index : index + 7] for index in range(0, len(cells), 7)]

    return schemas.TrackerHeatmap(columns=columns, max_amount=max_amount)


# ---------------------------------------------------------------------------
# Shared trackers
# ---------------------------------------------------------------------------


def _build_member_progress(
    tracker: models.Tracker,
    user: models.User,
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry],
    context: PeriodContext,
) -> schemas.TrackerMemberProgress:
    latest_activity = max(
        [
            *[ensure_utc(log.timestamp) for log in habit_logs],
            *[ensure_utc(entry.timestamp) for entry in journal_entries],
        ],
        default=None,
    )

    return schemas.TrackerMemberProgress(
        user=schemas.User.model_validate(user),
        current_math=_calculate_current_math(tracker, habit_logs, journal_entries, context),
        daily_progress=_calculate_daily_progress(tracker, habit_logs, context),
        streak_stats=_calculate_streak_stats(tracker, habit_logs, journal_entries, context),
        last_activity_at=latest_activity,
    )


def _calculate_group_streak_stats(
    tracker: models.Tracker,
    member_logs: dict[int, list[models.HabitLog]],
    member_journals: dict[int, list[models.JournalEntry]],
    participant_ids: set[int],
    context: PeriodContext,
) -> schemas.GroupStreakStats | None:
    """A group period counts only when *every* assigned member completed it."""
    if tracker.group_id is None or tracker.start_date is None:
        return None

    period_label = (
        "days" if tracker.type == "quit" else get_period_label(tracker.units_per, get_interval_count(tracker))
    )

    if not participant_ids:
        return schemas.GroupStreakStats(current=0, longest=0, period_label=period_label)

    histories = [
        _build_completion_history(
            tracker,
            member_logs.get(user_id, []),
            member_journals.get(user_id, []),
            context,
        )
        for user_id in sorted(participant_ids)
    ]

    max_length = max((len(history) for history in histories), default=0)
    group_history = [
        all(history[index] if index < len(history) else False for history in histories)
        for index in range(max_length)
    ]

    longest = 0
    run = 0
    for period_done in group_history:
        run = run + 1 if period_done else 0
        longest = max(longest, run)

    current = 0
    for period_done in reversed(group_history):
        if not period_done:
            break
        current += 1

    return schemas.GroupStreakStats(current=current, longest=longest, period_label=period_label)


def build_tracker_share_stats(
    tracker: models.Tracker,
    participants: list[models.User],
    member_logs: dict[int, list[models.HabitLog]],
    member_journals: dict[int, list[models.JournalEntry]],
    context: PeriodContext,
) -> schemas.TrackerShareStats:
    leaderboard = [
        schemas.TrackerLeaderboardEntry(
            user=schemas.User.model_validate(user),
            current_math=_calculate_current_math(
                tracker, member_logs.get(user.id, []), member_journals.get(user.id, []), context
            ),
            daily_progress=_calculate_daily_progress(tracker, member_logs.get(user.id, []), context),
            streak_stats=_calculate_streak_stats(
                tracker, member_logs.get(user.id, []), member_journals.get(user.id, []), context
            ),
            last_activity_at=max(
                [
                    *[ensure_utc(log.timestamp) for log in member_logs.get(user.id, [])],
                    *[ensure_utc(entry.timestamp) for entry in member_journals.get(user.id, [])],
                ],
                default=None,
            ),
        )
        for user in participants
    ]

    leaderboard.sort(
        key=lambda entry: (
            -entry.streak_stats.current,
            -entry.daily_progress.percentage,
            -(ensure_utc(entry.last_activity_at).timestamp() if entry.last_activity_at else 0.0),
            entry.user.username.lower(),
        )
    )

    return schemas.TrackerShareStats(
        member_count=len(participants),
        tracker_participants=[
            schemas.TrackerParticipant(user=entry.user, role="participant", added_at=None) for entry in leaderboard
        ],
        leaderboard=leaderboard,
        group_streak_stats=_calculate_group_streak_stats(
            tracker,
            member_logs,
            member_journals,
            {user.id for user in participants},
            context,
        ),
    )


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------


def build_tracker_analytics(
    tracker: models.Tracker,
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry],
    current_user_id: int | None = None,
    participants: list[models.User] | None = None,
    member_logs: dict[int, list[models.HabitLog]] | None = None,
    member_journals: dict[int, list[models.JournalEntry]] | None = None,
    context: PeriodContext = UTC_CONTEXT,
) -> schemas.TrackerAnalytics:
    active_logs = habit_logs
    active_journals = journal_entries

    if current_user_id is not None and member_logs is not None and member_journals is not None:
        active_logs = member_logs.get(current_user_id, [])
        active_journals = member_journals.get(current_user_id, [])

    share_stats = None
    member_progress: list[schemas.TrackerMemberProgress] = []
    if tracker.group_id is not None and participants is not None and member_logs is not None and member_journals is not None:
        share_stats = build_tracker_share_stats(tracker, participants, member_logs, member_journals, context)
        member_progress = [
            _build_member_progress(
                tracker,
                participant,
                member_logs.get(participant.id, []),
                member_journals.get(participant.id, []),
                context,
            )
            for participant in participants
        ]

    completion_history = _build_completion_history(tracker, active_logs, active_journals, context)

    return schemas.TrackerAnalytics(
        tracker_id=tracker.id,
        current_math=_calculate_current_math(tracker, active_logs, active_journals, context),
        daily_progress=_calculate_daily_progress(tracker, active_logs, context),
        historical_chart_data=_build_historical_chart_data(tracker, active_logs, active_journals, context),
        streak_stats=_calculate_streak_stats(tracker, active_logs, active_journals, context),
        build_heatmap=_build_heatmap(tracker, active_logs, active_journals, context),
        consistency=_calculate_consistency(completion_history),
        weekday_breakdown=_build_weekday_breakdown(active_logs, context),
        mood_trend=_build_mood_trend(active_journals, context),
        effective_start_date=get_effective_start(tracker, active_journals),
        log_count=len(active_logs),
        journal_count=len(active_journals),
        timezone=context.timezone_name,
        member_progress=member_progress,
        share_stats=share_stats,
        current_user_id=current_user_id,
    )


def _get_impact_per_day(tracker: models.Tracker) -> float:
    impact_amount = float(tracker.impact_amount or 0)
    if impact_amount <= 0 or tracker.type == "boolean":
        return 0.0

    return (impact_amount / _get_ms_per_period(tracker.impact_per)) * DAY_MS


def build_dashboard_summary(
    trackers: list[models.Tracker],
    habit_logs: list[models.HabitLog],
    journal_entries: list[models.JournalEntry],
    context: PeriodContext = UTC_CONTEXT,
) -> schemas.DashboardSummary:
    logs_by_tracker_id: dict[int, list[models.HabitLog]] = {}
    for log in habit_logs:
        logs_by_tracker_id.setdefault(log.tracker_id, []).append(log)

    journals_by_tracker_id: dict[int, list[models.JournalEntry]] = {}
    for entry in journal_entries:
        journals_by_tracker_id.setdefault(entry.tracker_id, []).append(entry)

    impact_rows: list[schemas.DashboardImpactRow] = []
    category_counts: dict[str, int] = {}
    by_type: dict[str, int] = {"quit": 0, "build": 0, "boolean": 0}
    group_ids: set[int] = set()

    active_streaks = 0
    longest_active_streak = 0
    due_today = 0
    completed_today = 0

    for tracker in trackers:
        category = tracker.category.strip() if isinstance(tracker.category, str) and tracker.category.strip() else "General"
        category_counts[category] = category_counts.get(category, 0) + 1
        by_type[tracker.type] = by_type.get(tracker.type, 0) + 1
        if tracker.group_id is not None:
            group_ids.add(tracker.group_id)

        tracker_logs = logs_by_tracker_id.get(tracker.id, [])
        tracker_journals = journals_by_tracker_id.get(tracker.id, [])

        current_math = _calculate_current_math(tracker, tracker_logs, tracker_journals, context)
        streak_stats = _calculate_streak_stats(tracker, tracker_logs, tracker_journals, context)
        daily_progress = _calculate_daily_progress(tracker, tracker_logs, context)

        if streak_stats.current > 0:
            active_streaks += 1
        longest_active_streak = max(longest_active_streak, streak_stats.current)

        if tracker.is_active and tracker.type in {"build", "boolean"}:
            due_today += 1
            if daily_progress.target > 0 and daily_progress.total >= daily_progress.target:
                completed_today += 1

        impact_rows.append(
            schemas.DashboardImpactRow(
                tracker=tracker,
                main_amount=current_math.main_unit,
                impact_value=current_math.impact_value,
                month_impact=_get_impact_per_day(tracker) * 30,
                current_streak=streak_stats.current,
                streak_label=streak_stats.period_label,
                progress_percentage=daily_progress.percentage,
                mode_label=(
                    "Time based"
                    if tracker.type == "quit"
                    else "From logs"
                    if tracker.type in {"build", "boolean"} and float(tracker.impact_amount or 0) > 0
                    else "No impact configured"
                ),
            )
        )

    top_impact_rows = sorted(
        (row for row in impact_rows if row.tracker.type != "boolean" and float(row.tracker.impact_amount or 0) > 0),
        key=lambda row: row.month_impact,
        reverse=True,
    )

    category_breakdown = [
        schemas.DashboardCategoryStat(category=category, count=count)
        for category, count in sorted(category_counts.items(), key=lambda item: (-item[1], item[0].lower()))
    ]

    total = len(trackers)
    active = sum(1 for tracker in trackers if tracker.is_active)

    return schemas.DashboardSummary(
        overview=schemas.DashboardOverview(
            total=total,
            active=active,
            paused=max(0, total - active),
            categories=len(category_counts),
            groups=len(group_ids),
            by_type=by_type,
            shared_trackers=sum(1 for tracker in trackers if tracker.group_id is not None),
            active_streaks=active_streaks,
            longest_active_streak=longest_active_streak,
            due_today=due_today,
            completed_today=completed_today,
        ),
        category_breakdown=category_breakdown,
        impact_rows=impact_rows,
        top_impact_rows=top_impact_rows[:6],
    )
