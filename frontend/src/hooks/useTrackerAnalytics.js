import { useCallback, useEffect, useState } from 'react';
import { fetchTrackerAnalyticsApi } from '../services/trackerApi';

export const DEFAULT_ANALYTICS = {
  currentMath: {
    mainUnit: '0.0',
    targetUnit: '0.0',
    impactValue: '0.00',
    lifetimeMainUnit: '0.0',
    lifetimeImpactValue: '0.00'
  },
  dailyProgress: { total: 0, target: 0, percentage: 0, windowStart: null, windowEnd: null },
  historicalChartData: [],
  streakStats: { current: 0, longest: 0, periodLabel: 'days', totalRelapses: 0 },
  consistency: { completedPeriods: 0, totalPeriods: 0, rate: 0, recentRate: 0, recentWindow: 0 },
  weekdayBreakdown: [],
  moodTrend: [],
  effectiveStartDate: null,
  logCount: 0,
  journalCount: 0,
  timezone: 'UTC',
  memberProgress: [],
  shareStats: null,
  buildHeatmap: null
};

export function useTrackerAnalytics(selectedTracker, habitLogs, journals, isAuthenticated, onError) {
  const [analytics, setAnalytics] = useState(DEFAULT_ANALYTICS);
  const [isLoading, setIsLoading] = useState(false);

  const trackerId = selectedTracker?.id;

  const load = useCallback(
    async (signal) => {
      if (!isAuthenticated || !trackerId) {
        setAnalytics(DEFAULT_ANALYTICS);
        return;
      }

      setIsLoading(true);
      try {
        const data = await fetchTrackerAnalyticsApi(trackerId);
        if (!signal?.aborted) setAnalytics(data);
      } catch (error) {
        if (!signal?.aborted) {
          setAnalytics(DEFAULT_ANALYTICS);
          onError?.(error);
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [isAuthenticated, trackerId, onError]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
    // Logs and journals are dependencies because analytics are derived from
    // them server-side: a new log means the numbers on screen are now stale.
  }, [load, habitLogs, journals]);

  return { ...analytics, isAnalyticsLoading: isLoading };
}
