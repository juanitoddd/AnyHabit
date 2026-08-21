import { AlertTriangle, CheckCircle2, NotebookPen } from 'lucide-react';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MOOD_LABELS } from '../../../constants/tracker';
import { formatRelative } from '../../../utils/date';
import MoodIcon from '../../MoodIcon';
import { formatValue } from './helpers';
import { WidgetEmptyState, WidgetLoading } from './shared';

export function ActivityFeedWidget({ activity, isLoading, onOpenTracker }) {
  if (isLoading && !activity) return <WidgetLoading />;

  const logs = activity?.logs || [];
  if (!logs.length) {
    return <WidgetEmptyState title="No activity yet" hint="Logged entries appear here as you record them." />;
  }

  return (
    <div className="h-full space-y-2 overflow-y-auto">
      {logs.map((entry) => (
        <button
          key={`log-${entry.id}`}
          type="button"
          onClick={() => onOpenTracker(entry.tracker_id)}
          className="flex w-full items-start gap-3 rounded-xl border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-stone-50"
        >
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-stone-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-stone-900">{entry.tracker_name}</span>
            <span className="block text-xs text-gray-500">
              {formatValue(entry.amount)} {entry.unit} · {formatRelative(entry.timestamp)}
            </span>
            {entry.note && <span className="mt-0.5 block truncate text-xs text-stone-500">{entry.note}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function JournalFeedWidget({ activity, isLoading, onOpenTracker }) {
  if (isLoading && !activity) return <WidgetLoading />;

  const journals = activity?.journals || [];
  if (!journals.length) {
    return <WidgetEmptyState title="No journal entries yet" hint="Write one on any tracker page." />;
  }

  return (
    <div className="h-full space-y-2 overflow-y-auto">
      {journals.map((entry) => (
        <button
          key={`journal-${entry.id}`}
          type="button"
          onClick={() => onOpenTracker(entry.tracker_id)}
          className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
            entry.is_relapse
              ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-50'
              : 'border-gray-200 hover:bg-stone-50'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="shrink-0 text-stone-400" title={MOOD_LABELS[entry.mood || 3]}>
              <MoodIcon moodValue={entry.mood || 3} size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">
              {entry.tracker_name}
            </span>
            {entry.is_relapse && <AlertTriangle size={12} className="shrink-0 text-rose-500" />}
            <span className="shrink-0 text-[11px] text-gray-400">{formatRelative(entry.timestamp)}</span>
          </span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-stone-600">{entry.content}</span>
        </button>
      ))}
    </div>
  );
}

export function MoodTrendWidget({ activity, isLoading }) {
  const data = useMemo(
    () => (activity?.mood_trend || []).slice(-60).map((point) => ({ ...point, label: point.date.slice(5) })),
    [activity]
  );

  if (isLoading && !activity) return <WidgetLoading />;

  if (data.length < 2) {
    return (
      <WidgetEmptyState
        title="Not enough mood data"
        hint="Journal with a mood on a couple of days and a trend appears."
      />
    );
  }

  const average = data.reduce((total, point) => total + point.average, 0) / data.length;

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs text-gray-500">
        Average mood <span className="font-semibold text-stone-800">{average.toFixed(2)}</span> over{' '}
        {data.length} days
      </p>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" minTickGap={28} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip formatter={(value) => [value, 'Average mood']} />
            <Line type="monotone" dataKey="average" stroke="#111827" strokeWidth={2} dot={{ r: 2 }} name="Mood" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function NotesWidget({ config, onConfigChange }) {
  return (
    <div className="flex h-full flex-col">
      <label htmlFor="widget-note" className="sr-only">
        Note
      </label>
      <textarea
        id="widget-note"
        value={config.text || ''}
        onChange={(event) => onConfigChange({ text: event.target.value.slice(0, 5000) })}
        placeholder="Anything you want on your dashboard — a reminder, a quote, this week's intention…"
        className="h-full w-full resize-none rounded-xl border border-transparent bg-transparent p-1 text-sm leading-6 text-stone-700 outline-none transition-colors focus:border-gray-200 focus:bg-stone-50"
      />
      <p className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
        <NotebookPen size={11} /> Saved automatically
      </p>
    </div>
  );
}
