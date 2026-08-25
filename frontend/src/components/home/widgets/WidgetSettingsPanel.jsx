import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FIELD_CLASS, LABEL_CLASS, normalizeCategory } from './helpers';
import { normalizeImpactConfig } from './registry';
import { TrackerMultiPicker, TrackerPicker } from './shared';

export function WidgetSettingsPanel({
  widget,
  definition,
  trackerMap,
  impactCandidates,
  allTrackers,
  loggableTrackers,
  onTitleChange,
  onConfigChange
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Widget title</label>
          <button
            type="button"
            onClick={() => onTitleChange(definition.label)}
            className="text-xs font-medium text-gray-500 hover:text-stone-800"
          >
            Reset
          </button>
        </div>

        <input
          type="text"
          value={widget.title ?? ''}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={definition.label}
          className="w-full border border-gray-200 rounded-xl p-2.5 outline-none focus:border-stone-400 bg-white text-sm text-stone-800"
          maxLength={80}
        />

        <p className="text-xs text-gray-500">This title is only visible on your dashboard.</p>
      </div>

      {widget.type === 'impactSummary' && (
        <ImpactTrackerSourceSettings
          widget={widget}
          trackerMap={trackerMap}
          impactCandidates={impactCandidates}
          onConfigChange={onConfigChange}
        />
      )}

      {(widget.type === 'trackerSpotlight' || widget.type === 'heatmap') && (
        <TrackerPicker
          trackers={allTrackers}
          value={widget.config?.trackerId ?? null}
          onChange={(trackerId) => onConfigChange({ trackerId })}
          label={widget.type === 'heatmap' ? 'Tracker to chart' : 'Tracker to feature'}
        />
      )}

      {widget.type === 'quickLog' && (
        <TrackerMultiPicker
          trackers={loggableTrackers}
          selectedIds={widget.config?.trackerIds || []}
          onChange={(trackerIds) => onConfigChange({ trackerIds })}
          label="Trackers to show buttons for"
        />
      )}

      {widget.type === 'embed' && <EmbedSettings widget={widget} onConfigChange={onConfigChange} />}

      {widget.type === 'notes' && (
        <p className="text-xs text-gray-500">
          Type directly into the widget on the dashboard — the text saves as you go.
        </p>
      )}

      {widget.type === 'apiExplorer' && (
        <p className="text-xs text-gray-500">
          Pick the endpoint and language on the widget itself. Create the token it needs under Settings → Developer.
        </p>
      )}
    </div>
  );
}

function EmbedSettings({ widget, onConfigChange }) {
  const url = widget.config?.url || '';
  const isValid = !url || /^https?:\/\//i.test(url);

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL_CLASS} htmlFor="embed-url">
          Page URL
        </label>
        <input
          id="embed-url"
          type="url"
          value={url}
          onChange={(event) => onConfigChange({ url: event.target.value })}
          placeholder="https://grafana.local/d-solo/abc/panel"
          className={FIELD_CLASS}
        />
        {!isValid && <p className="mt-1.5 text-[11px] text-rose-600">Must start with http:// or https://</p>}
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="embed-title">
          Accessible title
        </label>
        <input
          id="embed-title"
          type="text"
          value={widget.config?.title || ''}
          onChange={(event) => onConfigChange({ title: event.target.value })}
          placeholder="Grafana — server load"
          className={FIELD_CLASS}
        />
      </div>

      <p className="text-[11px] leading-5 text-gray-500">
        The page is loaded in a sandboxed frame with no access to your AnyHabit session. Sites that send
        <code className="mx-1 rounded bg-stone-100 px-1 font-mono">X-Frame-Options</code>
        will refuse to load — most public sites do.
      </p>
    </div>
  );
}

function ImpactTrackerSourceSettings({ widget, trackerMap, impactCandidates, onConfigChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const config = normalizeImpactConfig(widget.config);
  const selectedTrackerIds = config.selectedTrackerIds.filter((trackerId) => !!trackerMap[trackerId]);

  const filteredCandidates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return impactCandidates;

    return impactCandidates.filter((tracker) => {
      const name = tracker.name.toLowerCase();
      const category = normalizeCategory(tracker.category).toLowerCase();
      return name.includes(query) || category.includes(query);
    });
  }, [impactCandidates, searchTerm]);

  const enableAutoMode = () => {
    onConfigChange({ autoSelect: true, selectedTrackerIds: [] });
  };

  const enableManualMode = () => {
    onConfigChange({
      autoSelect: false,
      selectedTrackerIds: selectedTrackerIds.length ? selectedTrackerIds : impactCandidates.map((tracker) => tracker.id)
    });
  };

  const toggleTrackerSelection = (trackerId) => {
    const nextSelection = selectedTrackerIds.includes(trackerId)
      ? selectedTrackerIds.filter((id) => id !== trackerId)
      : [...selectedTrackerIds, trackerId];

    onConfigChange({ autoSelect: false, selectedTrackerIds: nextSelection });
  };

  const selectAllTrackers = () => {
    onConfigChange({
      autoSelect: false,
      selectedTrackerIds: impactCandidates.map((tracker) => tracker.id)
    });
  };

  const clearSelectedTrackers = () => {
    onConfigChange({ autoSelect: false, selectedTrackerIds: [] });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tracker source</p>
        <p className="text-xs text-gray-500 mt-1">Choose which trackers should contribute to this widget.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={enableAutoMode}
          className={`rounded-xl px-3 py-2 text-sm font-medium border transition-colors ${
            config.autoSelect
              ? 'bg-stone-100 border-stone-300 text-stone-900 shadow-sm'
              : 'bg-white border-gray-200 text-stone-700 hover:bg-stone-50'
          }`}
        >
          All trackers
        </button>

        <button
          type="button"
          onClick={enableManualMode}
          className={`rounded-xl px-3 py-2 text-sm font-medium border transition-colors ${
            !config.autoSelect
              ? 'bg-stone-100 border-stone-300 text-stone-900 shadow-sm'
              : 'bg-white border-gray-200 text-stone-700 hover:bg-stone-50'
          }`}
        >
          Pick trackers
        </button>
      </div>

      <p className="text-xs text-gray-500">
        {config.autoSelect
          ? `Using all eligible trackers (${impactCandidates.length}).`
          : `Using ${selectedTrackerIds.length} selected tracker${selectedTrackerIds.length === 1 ? '' : 's'}.`}
      </p>

      {!config.autoSelect && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search tracker"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-stone-400 bg-white text-sm text-stone-800"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selectAllTrackers}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-stone-800 hover:bg-white"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearSelectedTrackers}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-stone-800 hover:bg-white"
            >
              Clear
            </button>
          </div>

          {impactCandidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3 text-xs text-gray-500">
              No eligible trackers available.
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3 text-xs text-gray-500">
              No tracker matches your search.
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto space-y-1">
              {filteredCandidates.map((tracker) => {
                const isSelected = selectedTrackerIds.includes(tracker.id);

                return (
                  <button
                    key={tracker.id}
                    type="button"
                    onClick={() => toggleTrackerSelection(tracker.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-stone-50 border-stone-400 text-stone-900 shadow-sm ring-1 ring-stone-400/20'
                        : 'bg-white border-gray-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{tracker.name}</span>
                      <span className={`block text-xs truncate ${isSelected ? 'text-stone-500' : 'text-gray-500'}`}>
                        {normalizeCategory(tracker.category)}
                      </span>
                    </span>

                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                        isSelected ? 'border-stone-900 bg-stone-900 text-white' : 'bg-white text-transparent'
                      }`}
                    >
                      {isSelected ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
