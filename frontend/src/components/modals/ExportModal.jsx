import { Download, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { exportDataApi, downloadTextFile } from '../../services/exportApi';
import { useAppState } from '../../state/appState';
import Modal from '../ui/Modal';

const DATA_TYPES = [
  { value: 'all', label: 'Everything', hint: 'Trackers, logs and journals — the full backup' },
  { value: 'trackers_only', label: 'Trackers and logs', hint: 'No journal entries' },
  { value: 'journals_only', label: 'Journals only', hint: 'Every journal entry you have written' },
  { value: 'specific', label: 'Selected trackers', hint: 'Pick exactly what to include' }
];

function ExportModal() {
  const { isExportOpen, setIsExportOpen, trackers, notify } = useAppState();

  const [selectedTrackers, setSelectedTrackers] = useState([]);
  const [dataType, setDataType] = useState('all');
  const [exportFormat, setExportFormat] = useState('json');
  const [isLoading, setIsLoading] = useState(false);

  if (!isExportOpen) return null;

  const toggleTracker = (trackerId) =>
    setSelectedTrackers((current) =>
      current.includes(trackerId) ? current.filter((id) => id !== trackerId) : [...current, trackerId]
    );

  const toggleAll = () =>
    setSelectedTrackers((current) => (current.length === trackers.length ? [] : trackers.map((t) => t.id)));

  const canExport = dataType !== 'specific' || selectedTrackers.length > 0;

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const data = await exportDataApi({
        data_type: dataType,
        format: exportFormat,
        tracker_ids: dataType === 'specific' ? selectedTrackers : null
      });

      downloadTextFile(
        data,
        `anyhabit-export-${new Date().toISOString().split('T')[0]}.${exportFormat}`,
        exportFormat === 'json' ? 'application/json' : 'text/csv'
      );

      notify.success('Export downloaded');
      setIsExportOpen(false);
    } catch (error) {
      notify.error(error.message || 'Could not export your data');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => setIsExportOpen(false)}
      title="Export your data"
      description="Download a copy you own. JSON exports can be restored later."
      size="lg"
    >
      <div className="space-y-6">
        {exportFormat === 'json' && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="leading-6">
              A full JSON export is a complete backup. Keep one before upgrading — Settings → Data can restore it.
            </p>
          </div>
        )}

        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">What to export</legend>
          <div className="space-y-2">
            {DATA_TYPES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                  dataType === option.value
                    ? 'border-stone-400 bg-stone-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="dataType"
                  value={option.value}
                  checked={dataType === option.value}
                  onChange={(event) => setDataType(event.target.value)}
                  className="h-4 w-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-stone-900">{option.label}</span>
                  <span className="block text-xs text-gray-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {dataType === 'specific' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Select trackers</h3>
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm font-medium text-stone-900 transition-colors hover:text-stone-600"
              >
                {selectedTrackers.length === trackers.length ? 'Deselect all' : 'Select all'} (
                {selectedTrackers.length}/{trackers.length})
              </button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {trackers.map((tracker) => (
                <label
                  key={tracker.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3 transition-colors hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedTrackers.includes(tracker.id)}
                    onChange={() => toggleTracker(tracker.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-900">{tracker.name}</span>
                    <span className="block text-xs text-gray-500">
                      {tracker.category}
                      {tracker.archived_at ? ' · archived' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Format</legend>
          <div className="space-y-2">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                exportFormat === 'json' ? 'border-stone-400 bg-stone-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="format"
                value="json"
                checked={exportFormat === 'json'}
                onChange={(event) => setExportFormat(event.target.value)}
                className="h-4 w-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-stone-900">JSON</span>
                <span className="block text-xs text-gray-500">Restorable backup. Use this one.</span>
              </span>
            </label>

            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                exportFormat === 'csv' ? 'border-stone-400 bg-stone-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="format"
                value="csv"
                checked={exportFormat === 'csv'}
                onChange={(event) => setExportFormat(event.target.value)}
                className="h-4 w-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-stone-900">CSV</span>
                <span className="block text-xs text-gray-500">
                  For spreadsheets. Cannot be imported back into AnyHabit.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="flex gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => setIsExportOpen(false)}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-900 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport || isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            <Download size={16} />
            {isLoading ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ExportModal;
