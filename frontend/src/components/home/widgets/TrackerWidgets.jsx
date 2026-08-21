import { CheckCircle2, ExternalLink, Flame, PlusCircle, RefreshCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchTrackerAnalyticsApi } from '../../../services/trackerApi';
import { accentFor, formatValue, normalizeCategory } from './helpers';
import { WidgetEmptyState, WidgetLoading } from './shared';

/**
 * Load one tracker's analytics for a widget.
 *
 * Widgets each fetch their own tracker rather than the dashboard preloading
 * every tracker's analytics, which would grow the home page's cost with the
 * user's whole library instead of with what they chose to display.
 */
function useTrackerAnalytics(trackerId, onError) {
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(
    async (signal) => {
      if (!trackerId) {
        setAnalytics(null);
        return;
      }
      setIsLoading(true);
      try {
        const data = await fetchTrackerAnalyticsApi(trackerId);
        if (!signal?.aborted) setAnalytics(data);
      } catch (error) {
        if (!signal?.aborted) {
          setAnalytics(null);
          onError?.(error);
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [trackerId, onError]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { analytics, isLoading, reload: () => load() };
}

export function TrackerSpotlightWidget({ config, trackerMap, onOpenTracker, onQuickLog, onError }) {
  const tracker = trackerMap[config.trackerId];
  const { analytics, isLoading, reload } = useTrackerAnalytics(tracker?.id, onError);

  if (!tracker) {
    return <WidgetEmptyState title="No tracker chosen" hint="Open widget settings and pick one." />;
  }
  if (isLoading && !analytics) return <WidgetLoading />;

  const accent = accentFor(tracker);
  const isQuit = tracker.type === 'quit';
  const progress = analytics?.dailyProgress;
  const isDone = progress && progress.target > 0 && progress.total >= progress.target;

  return (
    <div className="flex h-full flex-col gap-4">
      <button
        type="button"
        onClick={() => onOpenTracker(tracker)}
        className="group text-left"
      >
        <span className="flex items-center gap-2">
          {accent && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />}
          <span className="truncate text-sm font-semibold text-stone-900 group-hover:underline">
            {tracker.name}
          </span>
          <ExternalLink size={12} className="shrink-0 text-gray-400" />
        </span>
        <span className="mt-0.5 block text-xs text-gray-500">{normalizeCategory(tracker.category)}</span>
      </button>

      <div className="flex items-end gap-2">
        <span className="text-4xl font-semibold tracking-tight text-stone-900">
          {analytics?.currentMath?.mainUnit ?? '0.0'}
        </span>
        <span className="mb-1 text-sm text-gray-400">{tracker.unit}</span>
      </div>

      {!isQuit && progress?.target > 0 && (
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-gray-500">
            <span>This period</span>
            <span>
              {progress.total.toFixed(1)} / {progress.target.toFixed(1)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-stone-900'}`}
              style={{ width: `${Math.min(100, progress.percentage)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-100 bg-stone-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Streak</p>
          <p className="mt-0.5 text-xl font-semibold text-stone-900">{analytics?.streakStats?.current ?? 0}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-stone-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Consistency</p>
          <p className="mt-0.5 text-xl font-semibold text-stone-900">{analytics?.consistency?.rate ?? 0}%</p>
        </div>
      </div>

      <div className="mt-auto flex gap-2">
        {tracker.type !== 'quit' && !tracker.archived_at && (
          <button
            type="button"
            onClick={async () => {
              await onQuickLog(tracker);
              reload();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            {tracker.type === 'boolean' ? <CheckCircle2 size={15} /> : <PlusCircle size={15} />}
            {tracker.type === 'boolean' ? 'Mark done' : 'Log 1'}
          </button>
        )}
        <button
          type="button"
          onClick={reload}
          className="rounded-xl border border-gray-200 px-3 py-2 text-gray-500 transition-colors hover:bg-stone-50"
          aria-label="Refresh"
        >
          <RefreshCcw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}

export function QuickLogWidget({ config, trackerMap, onQuickLog, onError }) {
  const [busyId, setBusyId] = useState(null);
  const [justLogged, setJustLogged] = useState(null);

  const trackers = (config.trackerIds || []).map((id) => trackerMap[id]).filter(Boolean);

  if (!trackers.length) {
    return <WidgetEmptyState title="No trackers chosen" hint="Pick the ones you log most often." />;
  }

  const handleLog = async (tracker) => {
    setBusyId(tracker.id);
    try {
      await onQuickLog(tracker);
      setJustLogged(tracker.id);
      setTimeout(() => setJustLogged((current) => (current === tracker.id ? null : current)), 1800);
    } catch (error) {
      onError?.(error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid h-full auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
      {trackers.map((tracker) => {
        const accent = accentFor(tracker);
        const isDone = justLogged === tracker.id;

        return (
          <button
            key={tracker.id}
            type="button"
            disabled={busyId === tracker.id}
            onClick={() => handleLog(tracker)}
            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all disabled:opacity-60 ${
              isDone
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-gray-200 hover:border-stone-300 hover:bg-stone-50'
            }`}
          >
            <span className="flex w-full items-center gap-1.5">
              {accent && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">{tracker.name}</span>
              {isDone && <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />}
            </span>
            <span className="text-xs text-gray-500">
              {isDone ? 'Logged' : tracker.type === 'boolean' ? 'Tap to mark done' : `+1 ${tracker.unit}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const HEATMAP_SHADES = ['bg-stone-100', 'bg-emerald-100', 'bg-emerald-200', 'bg-emerald-300', 'bg-emerald-500'];

const shadeFor = (intensity) => {
  if (intensity <= 0) return HEATMAP_SHADES[0];
  if (intensity < 0.25) return HEATMAP_SHADES[1];
  if (intensity < 0.5) return HEATMAP_SHADES[2];
  if (intensity < 0.75) return HEATMAP_SHADES[3];
  return HEATMAP_SHADES[4];
};

export function HeatmapWidget({ config, trackerMap, onError }) {
  const tracker = trackerMap[config.trackerId];
  const { analytics, isLoading } = useTrackerAnalytics(tracker?.id, onError);

  if (!tracker) {
    return <WidgetEmptyState title="No tracker chosen" hint="Open widget settings and pick one." />;
  }
  if (isLoading && !analytics) return <WidgetLoading />;

  const heatmap = analytics?.buildHeatmap;
  if (!heatmap?.columns?.length) {
    return <WidgetEmptyState title="Nothing to chart yet" hint="Log some activity and it will show up here." />;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs text-gray-500">
        {tracker.name} · last 24 weeks
      </p>
      <div className="flex-1 overflow-x-auto">
        <div className="flex min-w-max gap-[3px]">
          {heatmap.columns.map((week, weekIndex) => (
            <div key={`week-${weekIndex}`} className="flex flex-col gap-[3px]">
              {week.map((cell) => {
                const intensity = heatmap.maxAmount > 0 ? cell.amount / heatmap.maxAmount : 0;
                const shade = cell.isRelapse ? 'bg-rose-400' : shadeFor(intensity);

                return (
                  <div
                    key={cell.date}
                    title={
                      cell.isRelapse
                        ? `${cell.date}: relapse`
                        : `${cell.date}: ${formatValue(cell.amount)} ${tracker.unit}`
                    }
                    className={`h-3 w-3 rounded-[2px] border border-white/60 ${
                      cell.isFiller ? 'opacity-0' : shade
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
        <span>Less</span>
        {HEATMAP_SHADES.map((shade) => (
          <span key={shade} className={`h-3 w-3 rounded-[2px] border border-white/60 ${shade}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

export function StreakLeaderboardWidget({ rows, onOpenTracker }) {
  const streaks = (rows || [])
    .filter((row) => !row.tracker.archived_at && row.current_streak > 0)
    .sort((a, b) => b.current_streak - a.current_streak)
    .slice(0, 8);

  if (!streaks.length) {
    return <WidgetEmptyState title="No active streaks" hint="Log something today to start one." />;
  }

  return (
    <div className="h-full space-y-2 overflow-y-auto">
      {streaks.map((row) => (
        <button
          key={row.tracker.id}
          type="button"
          onClick={() => onOpenTracker(row.tracker)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-stone-50"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-stone-900">{row.tracker.name}</span>
            <span className="block text-xs text-gray-500">{normalizeCategory(row.tracker.category)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-stone-900">
            <Flame size={15} className="text-amber-500" />
            <span className="text-lg font-semibold">{row.current_streak}</span>
            <span className="text-xs text-gray-400">{row.streak_label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
