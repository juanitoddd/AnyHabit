import { FIELD_CLASS, LABEL_CLASS, normalizeCategory } from './helpers';

/** Shown when a widget needs configuring before it can display anything. */
export function WidgetEmptyState({ title, hint }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-gray-500">
      <div>
        <p className="font-medium text-stone-700">{title}</p>
        {hint && <p className="mt-1 text-sm">{hint}</p>}
      </div>
    </div>
  );
}

export function WidgetLoading() {
  return <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading…</div>;
}

/** Single-tracker picker used by the spotlight and heatmap widgets. */
export function TrackerPicker({ trackers, value, onChange, label = 'Tracker' }) {
  return (
    <div>
      <label className={LABEL_CLASS} htmlFor="widget-tracker-picker">
        {label}
      </label>
      <select
        id="widget-tracker-picker"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        className={FIELD_CLASS}
      >
        <option value="">Choose a tracker…</option>
        {trackers.map((tracker) => (
          <option key={tracker.id} value={tracker.id}>
            {tracker.name} · {normalizeCategory(tracker.category)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Multi-tracker picker used by the quick-log widget. */
export function TrackerMultiPicker({ trackers, selectedIds, onChange, label = 'Trackers' }) {
  const toggle = (trackerId) =>
    onChange(
      selectedIds.includes(trackerId)
        ? selectedIds.filter((id) => id !== trackerId)
        : [...selectedIds, trackerId]
    );

  return (
    <div>
      <span className={LABEL_CLASS}>{label}</span>
      {trackers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-3 text-xs text-gray-500">
          No eligible trackers yet.
        </p>
      ) : (
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {trackers.map((tracker) => (
            <label
              key={tracker.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm transition-colors hover:bg-stone-50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(tracker.id)}
                onChange={() => toggle(tracker.id)}
                className="h-4 w-4"
              />
              <span className="min-w-0 flex-1 truncate text-stone-800">{tracker.name}</span>
              <span className="shrink-0 text-xs text-gray-400">{normalizeCategory(tracker.category)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
