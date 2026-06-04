import { Download, Upload, X, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { exportDataApi, importDataApi } from '../../services/exportApi';

function ExportModal({ isOpen, setIsExportOpen, trackers }) {
  const [activeTab, setActiveTab] = useState('export'); // 'export' or 'import'
  
  // Export State
  const [selectedTrackers, setSelectedTrackers] = useState([]);
  const [dataType, setDataType] = useState('all');
  const [exportFormat, setExportFormat] = useState('json');
  
  // Import State
  const [importFile, setImportFile] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // General State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (dataType === 'backup') {
      setExportFormat('json');
    }
  }, [dataType]);

  if (!isOpen) return null;

  const handleTrackerToggle = (trackerId) => {
    setSelectedTrackers((prev) =>
      prev.includes(trackerId) ? prev.filter((id) => id !== trackerId) : [...prev, trackerId]
    );
  };

  const handleSelectAllTrackers = () => {
    if (selectedTrackers.length === trackers.length) {
      setSelectedTrackers([]);
    } else {
      setSelectedTrackers(trackers.map((t) => t.id));
    }
  };

  const handleExport = async () => {
    try {
      setError(null);
      setIsLoading(true);

      const trackerIds = dataType === 'specific' ? selectedTrackers : (dataType === 'journals_only' ? [] : null);

      const data = await exportDataApi({
        data_type: dataType,
        format: exportFormat,
        tracker_ids: trackerIds
      });

      const blob = new Blob([data], {
        type: exportFormat === 'json' ? 'application/json' : 'text/csv'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileNameSuffix = dataType === 'backup' ? 'full-backup' : 'export';
      link.download = `anyhabit-${fileNameSuffix}-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsExportOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to export data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
      setError(null);
      setImportSuccess(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    try {
      setError(null);
      setIsLoading(true);
      
      await importDataApi(importFile);
      setImportSuccess(true);
      setImportFile(null);
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to import data');
    } finally {
      setIsLoading(false);
    }
  };

  const canExport = dataType !== 'specific' || selectedTrackers.length > 0;

  return (
    <div className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="app-modal-card bg-white p-5 md:p-8 rounded-3xl shadow-xl w-[95%] max-w-lg border border-gray-100 max-h-[90vh] overflow-y-auto scrollbar-hide">
        
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-xl font-bold text-stone-900">Data Management</h3>
            <p className="text-sm text-gray-500 mt-1">Export or restore your AnyHabit data.</p>
          </div>
          <button
            onClick={() => setIsExportOpen(false)}
            className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            className={`pb-3 px-4 text-sm font-medium transition-colors ${activeTab === 'export' ? 'border-b-2 border-stone-900 text-stone-900' : 'text-gray-500 hover:text-stone-700'}`}
            onClick={() => { setActiveTab('export'); setError(null); }}
          >
            Export Data
          </button>
          <button
            className={`pb-3 px-4 text-sm font-medium transition-colors ${activeTab === 'import' ? 'border-b-2 border-stone-900 text-stone-900' : 'text-gray-500 hover:text-stone-700'}`}
            onClick={() => { setActiveTab('import'); setError(null); }}
          >
            Import Backup
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* EXPORT TAB */}
        {activeTab === 'export' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">What to Export</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <input type="radio" name="dataType" value="backup" checked={dataType === 'backup'} onChange={(e) => setDataType(e.target.value)} className="w-4 h-4" />
                  <span className="text-sm font-medium text-stone-900">Full Backup (Re-Import)</span>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <input type="radio" name="dataType" value="all" checked={dataType === 'all'} onChange={(e) => setDataType(e.target.value)} className="w-4 h-4" />
                  <span className="text-sm font-medium text-stone-900">All Data (Readable)</span>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <input type="radio" name="dataType" value="specific" checked={dataType === 'specific'} onChange={(e) => setDataType(e.target.value)} className="w-4 h-4" />
                  <span className="text-sm font-medium text-stone-900">Specific Trackers</span>
                </label>
              </div>
            </div>

            {dataType === 'specific' && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select Trackers</h4>
                <button type="button" onClick={handleSelectAllTrackers} className="mb-3 text-sm font-medium text-stone-900 hover:text-stone-600 transition-colors">
                  {selectedTrackers.length === trackers.length ? 'Deselect All' : 'Select All'}
                </button>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {trackers.map((tracker) => (
                    <label key={tracker.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                      <input type="checkbox" checked={selectedTrackers.includes(tracker.id)} onChange={() => handleTrackerToggle(tracker.id)} className="w-4 h-4" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900 truncate">{tracker.name}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Export Format</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                  <input type="radio" name="format" value="json" checked={exportFormat === 'json'} onChange={(e) => setExportFormat(e.target.value)} className="w-4 h-4" />
                  <span className="text-sm font-medium text-stone-900">JSON</span>
                </label>
                <label className={`flex items-center gap-3 p-3 border border-gray-200 rounded-lg transition-colors ${dataType === 'backup' ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
                  <input type="radio" name="format" value="csv" checked={exportFormat === 'csv'} onChange={(e) => setExportFormat(e.target.value)} disabled={dataType === 'backup'} className="w-4 h-4 disabled:cursor-not-allowed" />
                  <span className="text-sm font-medium text-stone-900">CSV</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button type="button" onClick={() => setIsExportOpen(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleExport} disabled={!canExport || isLoading} className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${canExport && !isLoading ? 'bg-stone-900 text-white hover:bg-stone-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                <Download size={16} />
                {isLoading ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        )}

        {/* IMPORT TAB */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> Importing a backup will completely overwrite your Dashboard layout. Trackers, logs, and journals will be added to your current profile. Ensure you are uploading a valid "Full Backup" JSON file.
              </p>
            </div>

            {importSuccess ? (
              <div className="flex flex-col items-center justify-center py-8 text-green-600">
                <CheckCircle size={48} className="mb-4" />
                <p className="font-medium text-lg">Import Successful!</p>
                <p className="text-sm text-gray-500 mt-2">Reloading your dashboard...</p>
              </div>
            ) : (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select Backup File</h4>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-3 text-gray-400" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">{importFile ? importFile.name : "JSON backup file only"}</p>
                    </div>
                    <input type="file" className="hidden" accept=".json" onChange={handleFileChange} />
                  </label>
                </div>
              </div>
            )}

            {!importSuccess && (
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setIsExportOpen(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleImport} disabled={!importFile || isLoading} className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${importFile && !isLoading ? 'bg-stone-900 text-white hover:bg-stone-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                  <Upload size={16} />
                  {isLoading ? 'Importing...' : 'Restore Backup'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExportModal;