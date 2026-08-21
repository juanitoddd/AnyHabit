import { AlertTriangle, FileJson, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { importDataApi } from '../../services/exportApi';
import { useAppState } from '../../state/appState';
import Modal from '../ui/Modal';

const REPLACE_CONFIRMATION = 'REPLACE MY DATA';

const MODES = [
  {
    value: 'merge',
    label: 'Merge',
    hint: 'Add what is missing. Existing trackers and entries are left untouched.'
  },
  {
    value: 'replace',
    label: 'Replace',
    hint: 'Delete your current trackers first, then import. Destructive.'
  }
];

function SummaryRow({ label, value, tone = 'default' }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
      <span className="text-stone-600">{label}</span>
      <span className={`font-semibold ${tone === 'danger' ? 'text-rose-600' : 'text-stone-900'}`}>{value}</span>
    </div>
  );
}

function ImportModal() {
  const { isImportOpen, setIsImportOpen, refreshTrackers, notify } = useAppState();

  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('merge');
  const [preview, setPreview] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const fileInputRef = useRef(null);

  if (!isImportOpen) return null;

  const close = () => {
    setFile(null);
    setPreview(null);
    setConfirmText('');
    setMode('merge');
    setIsImportOpen(false);
  };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    // Any previous preview described a different file, so drop it.
    setPreview(null);
  };

  const runPreview = async () => {
    if (!file) return;
    setIsWorking(true);
    try {
      setPreview(await importDataApi(file, { mode, dryRun: true }));
    } catch (error) {
      setPreview(null);
      notify.error(error.message || 'Could not read that backup file');
    } finally {
      setIsWorking(false);
    }
  };

  const runImport = async () => {
    if (!file || !preview) return;
    setIsWorking(true);
    try {
      const summary = await importDataApi(file, {
        mode,
        dryRun: false,
        confirm: mode === 'replace' ? confirmText.trim() : ''
      });

      await refreshTrackers();
      notify.success(
        `Restored ${summary.trackers_created} new tracker${summary.trackers_created === 1 ? '' : 's'}, ` +
          `${summary.logs_created} log${summary.logs_created === 1 ? '' : 's'} and ` +
          `${summary.journals_created} journal entr${summary.journals_created === 1 ? 'y' : 'ies'}.`
      );
      close();
    } catch (error) {
      notify.error(error.message || 'Could not import that backup');
    } finally {
      setIsWorking(false);
    }
  };

  const replaceReady = mode !== 'replace' || confirmText.trim() === REPLACE_CONFIRMATION;

  return (
    <Modal
      isOpen
      onClose={close}
      title="Restore from a backup"
      description="Import a JSON export taken from AnyHabit."
      size="lg"
    >
      <div className="space-y-6">
        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">Backup file</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-4 py-5 text-left transition-colors hover:border-stone-400 hover:bg-stone-50"
          >
            <FileJson size={22} className="shrink-0 text-stone-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-stone-900">
                {file ? file.name : 'Choose a .json export'}
              </span>
              <span className="block text-xs text-gray-500">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV exports cannot be restored'}
              </span>
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Backup file"
          />
        </div>

        <fieldset>
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Import mode</legend>
          <div className="space-y-2">
            {MODES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                  mode === option.value ? 'border-stone-400 bg-stone-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={(event) => {
                    setMode(event.target.value);
                    setPreview(null);
                  }}
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

        {/* Nothing is written until the user has seen what would change. */}
        {preview && (
          <div className="rounded-2xl border border-gray-200 bg-stone-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Preview — nothing has been changed yet
            </h3>
            <div className="space-y-2">
              {preview.trackers_deleted > 0 && (
                <SummaryRow label="Existing trackers deleted" value={preview.trackers_deleted} tone="danger" />
              )}
              <SummaryRow label="New trackers" value={preview.trackers_created} />
              <SummaryRow label="Existing trackers matched" value={preview.trackers_updated} />
              <SummaryRow label="Logs added" value={preview.logs_created} />
              <SummaryRow label="Journal entries added" value={preview.journals_created} />
              {preview.trackers_skipped > 0 && (
                <SummaryRow label="Skipped entries" value={preview.trackers_skipped} tone="danger" />
              )}
            </div>

            {preview.source_version && (
              <p className="mt-3 text-xs text-gray-500">
                Backup from AnyHabit {preview.source_version}
                {preview.source_exported_at ? ` · ${preview.source_exported_at.split('T')[0]}` : ''}
              </p>
            )}

            {preview.warnings?.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-gray-200 pt-3">
                {preview.warnings.map((warning) => (
                  <li key={warning} className="flex gap-2 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mode === 'replace' && preview && (
          <label className="block rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-800">
              <AlertTriangle size={16} /> This deletes your current trackers
            </span>
            <span className="mb-3 block text-xs leading-5 text-rose-700">
              Type <span className="font-mono font-semibold">{REPLACE_CONFIRMATION}</span> to continue. Export a
              backup first if you have not already.
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="w-full rounded-xl border border-rose-200 bg-white p-2.5 text-sm outline-none focus:border-rose-400"
              autoComplete="off"
              aria-label="Replace confirmation"
            />
          </label>
        )}

        <div className="flex gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-900 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>

          {!preview ? (
            <button
              type="button"
              onClick={runPreview}
              disabled={!file || isWorking}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Upload size={16} />
              {isWorking ? 'Checking…' : 'Preview import'}
            </button>
          ) : (
            <button
              type="button"
              onClick={runImport}
              disabled={isWorking || !replaceReady}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 ${
                mode === 'replace' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-stone-900 hover:bg-stone-800'
              }`}
            >
              <Upload size={16} />
              {isWorking ? 'Importing…' : mode === 'replace' ? 'Replace and import' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ImportModal;
