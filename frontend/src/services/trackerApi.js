import { apiClient } from './apiClient';

export const fetchTrackersApi = (includeArchived = false) =>
  apiClient.get(`/trackers/?include_archived=${includeArchived ? 'true' : 'false'}`);

export async function fetchJournalsApi(trackerId, { mineOnly = true, search = '' } = {}) {
  const params = new URLSearchParams({ mine_only: String(mineOnly) });
  if (search.trim()) params.set('search', search.trim());

  const journals = await apiClient.get(`/trackers/${trackerId}/journal/?${params.toString()}`);
  return journals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export async function fetchHabitLogsApi(trackerId, { mineOnly = true } = {}) {
  const logs = await apiClient.get(`/trackers/${trackerId}/logs/?mine_only=${mineOnly ? 'true' : 'false'}`);
  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatValue = (value, digits) => toNumber(value).toFixed(digits);

const normalizeMemberEntry = (entry) => ({
  user: entry.user,
  currentMath: {
    mainUnit: formatValue(entry?.current_math?.main_unit, 1),
    targetUnit: formatValue(entry?.current_math?.target_unit, 1),
    impactValue: formatValue(entry?.current_math?.impact_value, 2),
    lifetimeMainUnit: formatValue(entry?.current_math?.lifetime_main_unit, 1),
    lifetimeImpactValue: formatValue(entry?.current_math?.lifetime_impact_value, 2)
  },
  dailyProgress: {
    total: toNumber(entry?.daily_progress?.total),
    target: toNumber(entry?.daily_progress?.target),
    percentage: toNumber(entry?.daily_progress?.percentage)
  },
  streakStats: {
    current: toNumber(entry?.streak_stats?.current),
    longest: toNumber(entry?.streak_stats?.longest),
    periodLabel: entry?.streak_stats?.period_label ?? 'days',
    totalRelapses: toNumber(entry?.streak_stats?.total_relapses)
  },
  lastActivityAt: entry?.last_activity_at || null
});

/** Convert the API's snake_case payload into the camelCase shape the UI uses. */
export function normalizeTrackerAnalytics(data) {
  return {
    currentMath: {
      mainUnit: formatValue(data?.current_math?.main_unit, 1),
      targetUnit: formatValue(data?.current_math?.target_unit, 1),
      impactValue: formatValue(data?.current_math?.impact_value, 2),
      lifetimeMainUnit: formatValue(data?.current_math?.lifetime_main_unit, 1),
      lifetimeImpactValue: formatValue(data?.current_math?.lifetime_impact_value, 2)
    },
    dailyProgress: {
      total: toNumber(data?.daily_progress?.total),
      target: toNumber(data?.daily_progress?.target),
      percentage: toNumber(data?.daily_progress?.percentage),
      windowStart: data?.daily_progress?.window_start || null,
      windowEnd: data?.daily_progress?.window_end || null
    },
    historicalChartData: (data?.historical_chart_data ?? []).map((point) => ({
      date: point.date,
      label: point.label,
      value: toNumber(point.value),
      ...(point.cumulative !== null && point.cumulative !== undefined
        ? { cumulative: toNumber(point.cumulative) }
        : {})
    })),
    streakStats: {
      current: toNumber(data?.streak_stats?.current),
      longest: toNumber(data?.streak_stats?.longest),
      periodLabel: data?.streak_stats?.period_label ?? 'days',
      totalRelapses: toNumber(data?.streak_stats?.total_relapses)
    },
    consistency: {
      completedPeriods: toNumber(data?.consistency?.completed_periods),
      totalPeriods: toNumber(data?.consistency?.total_periods),
      rate: toNumber(data?.consistency?.rate),
      recentRate: toNumber(data?.consistency?.recent_rate),
      recentWindow: toNumber(data?.consistency?.recent_window)
    },
    weekdayBreakdown: (data?.weekday_breakdown ?? []).map((entry) => ({
      weekday: toNumber(entry.weekday),
      label: entry.label,
      total: toNumber(entry.total),
      entries: toNumber(entry.entries)
    })),
    moodTrend: (data?.mood_trend ?? []).map((point) => ({
      date: point.date,
      average: toNumber(point.average),
      entries: toNumber(point.entries)
    })),
    effectiveStartDate: data?.effective_start_date || null,
    logCount: toNumber(data?.log_count),
    journalCount: toNumber(data?.journal_count),
    timezone: data?.timezone || 'UTC',
    memberProgress: (data?.member_progress ?? []).map(normalizeMemberEntry),
    shareStats: data?.share_stats
      ? {
          memberCount: toNumber(data.share_stats.member_count),
          trackerParticipants: data.share_stats.tracker_participants ?? [],
          leaderboard: (data.share_stats.leaderboard ?? []).map(normalizeMemberEntry),
          groupStreakStats: data.share_stats.group_streak_stats
            ? {
                current: toNumber(data.share_stats.group_streak_stats.current),
                longest: toNumber(data.share_stats.group_streak_stats.longest),
                periodLabel: data.share_stats.group_streak_stats.period_label ?? 'days',
                ruleLabel: data.share_stats.group_streak_stats.rule_label ?? 'All assigned members'
              }
            : null
        }
      : null,
    buildHeatmap: data?.build_heatmap
      ? {
          maxAmount: toNumber(data.build_heatmap.max_amount),
          columns: (data.build_heatmap.columns ?? []).map((week) =>
            week.map((cell) => ({
              date: cell.date,
              amount: toNumber(cell.amount),
              isFiller: Boolean(cell.is_filler),
              isRelapse: Boolean(cell.is_relapse)
            }))
          )
        }
      : null
  };
}

export async function fetchTrackerAnalyticsApi(trackerId) {
  return normalizeTrackerAnalytics(await apiClient.get(`/trackers/${trackerId}/analytics`));
}

export async function saveTrackerApi(trackerFormData) {
  const isEdit = Boolean(trackerFormData.id);
  const isBoolean = trackerFormData.type === 'boolean';

  const parsedInterval = parseInt(trackerFormData.units_per_interval, 10);
  const unitsPerInterval = Number.isNaN(parsedInterval) ? 1 : Math.max(1, parsedInterval);

  const payload = {
    name: trackerFormData.name.trim(),
    description: (trackerFormData.description || '').trim(),
    color: trackerFormData.color || '',
    category: (trackerFormData.category || '').trim() || 'General',
    type: trackerFormData.type,
    // A boolean tracker is "done or not done", so its unit and impact fields
    // are fixed rather than asked for in the form.
    unit: isBoolean ? 'Times' : (trackerFormData.unit || '').trim(),
    impact_amount: isBoolean ? 0 : Math.max(0, parseFloat(trackerFormData.impact_amount) || 0),
    impact_unit: isBoolean ? '$' : (trackerFormData.impact_unit || '$').trim() || '$',
    impact_per: trackerFormData.impact_per,
    units_per_amount: isBoolean ? 1 : Math.max(0, parseFloat(trackerFormData.units_per_amount) || 0),
    units_per: trackerFormData.units_per,
    units_per_interval: unitsPerInterval,
    is_active: trackerFormData.is_active,
    group_id: trackerFormData.group_id ? Number(trackerFormData.group_id) : null,
    participant_ids: Array.isArray(trackerFormData.participant_ids)
      ? trackerFormData.participant_ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []
  };

  if (trackerFormData.start_date) {
    payload.start_date = new Date(trackerFormData.start_date).toISOString();
  }

  return isEdit
    ? apiClient.patch(`/trackers/${trackerFormData.id}/`, payload)
    : apiClient.post('/trackers/', payload);
}

export const deleteTrackerApi = (id) => apiClient.delete(`/trackers/${id}`);

export const toggleTrackerStatusApi = (tracker) =>
  apiClient.put(`/trackers/${tracker.id}/${tracker.is_active ? 'stop' : 'start'}`);

export const archiveTrackerApi = (trackerId) => apiClient.put(`/trackers/${trackerId}/archive`);

export const unarchiveTrackerApi = (trackerId) => apiClient.put(`/trackers/${trackerId}/unarchive`);

export const resetTrackerApi = (trackerId, note = '') =>
  apiClient.post(`/trackers/${trackerId}/reset${note ? `?note=${encodeURIComponent(note)}` : ''}`);

export function saveJournalApi(trackerId, journalFormData) {
  const body = {
    content: journalFormData.content,
    mood: parseInt(journalFormData.mood, 10) || 3
  };

  return journalFormData.id
    ? apiClient.put(`/trackers/${trackerId}/journal/${journalFormData.id}`, body)
    : apiClient.post(`/trackers/${trackerId}/journal/`, body);
}

export const deleteJournalApi = (trackerId, journalId) =>
  apiClient.delete(`/trackers/${trackerId}/journal/${journalId}`);

export function createLogApi(trackerId, logFormData) {
  return apiClient.post(`/trackers/${trackerId}/logs/`, {
    amount: parseFloat(logFormData.amount) || 0,
    note: (logFormData.note || '').trim(),
    timestamp: logFormData.timestamp || new Date().toISOString()
  });
}

export const createBooleanLogApi = (trackerId) =>
  apiClient.post(`/trackers/${trackerId}/logs/`, { amount: 1, timestamp: new Date().toISOString() });

export const updateLogApi = (trackerId, logId, payload) =>
  apiClient.patch(`/trackers/${trackerId}/logs/${logId}`, payload);

export const deleteLogApi = (trackerId, logId) => apiClient.delete(`/trackers/${trackerId}/logs/${logId}`);
