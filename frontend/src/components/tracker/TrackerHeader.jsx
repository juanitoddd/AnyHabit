import {
  Archive,
  ArchiveRestore,
  Calendar,
  CheckCircle2,
  Clock,
  Menu,
  Pause,
  Pencil,
  Play,
  PlusCircle,
  RotateCcw,
  Target,
  Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TRACKER_COLOR_HEX } from '../../constants/tracker';
import { formatDateTime } from '../../utils/date';
import { formatScheduleLabel } from '../../utils/tracker';


function TrackerHeader({
  selectedTracker,
  canManageTracker,
  dailyProgress,
  effectiveStartDate,
  setIsSidebarOpen,
  setSelectedCategory,
  setIsLogModalOpen,
  setLogFormData,
  onQuickBooleanLog,
  handleResetTracker,
  toggleTrackerStatus,
  archiveTracker,
  unarchiveTracker,
  openTrackerModal,
  deleteTracker
}) {
  const navigate = useNavigate();
  const isArchived = Boolean(selectedTracker.archived_at);
  const accent = TRACKER_COLOR_HEX[selectedTracker.color];

  const ownerOnlyClass = canManageTracker
    ? 'bg-white border border-gray-200 text-stone-700 hover:bg-gray-50'
    : 'bg-stone-100 border border-stone-200 text-stone-400 cursor-not-allowed';

  const category = (selectedTracker.category || 'General').trim() || 'General';
  const hasRestarted =
    effectiveStartDate && new Date(effectiveStartDate).getTime() !== new Date(selectedTracker.start_date).getTime();

  return (
    <header className="flex flex-col px-4 pb-6 pt-6 md:px-10 md:pt-10">
      <div className="flex w-full flex-col items-start justify-between gap-4 xl:flex-row">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="mr-1 text-stone-500 hover:text-stone-900 md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={24} />
            </button>

            {accent && (
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              />
            )}

            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{selectedTracker.name}</h1>

            <button
              type="button"
              onClick={() => {
                setSelectedCategory(category);
                navigate(`/category/${encodeURIComponent(category)}`);
              }}
              className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 transition-colors hover:bg-stone-200"
            >
              {category}
            </button>

            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-800">
              {selectedTracker.type}
            </span>

            {selectedTracker.group_id && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Shared{selectedTracker.participant_count ? ` · ${selectedTracker.participant_count} members` : ''}
              </span>
            )}

            {isArchived && (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                Archived
              </span>
            )}

            {!selectedTracker.is_active && !isArchived && (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Paused
              </span>
            )}
          </div>

          {selectedTracker.description && (
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-stone-600">
              {selectedTracker.description}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-1">
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Target size={14} className="shrink-0" />
              {selectedTracker.type === 'boolean'
                ? formatScheduleLabel(selectedTracker)
                : selectedTracker.type === 'quit'
                  ? `Avoiding ${formatScheduleLabel(selectedTracker)}`
                  : `Goal: ${formatScheduleLabel(selectedTracker)}`}
            </p>

            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar size={14} className="shrink-0" />
              Started {formatDateTime(selectedTracker.start_date)}
            </p>

            {/* After a relapse the two dates diverge; showing both makes the
                reset legible instead of looking like lost history. */}
            {hasRestarted && (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <Clock size={14} className="shrink-0" />
                Current run since {formatDateTime(effectiveStartDate)}
              </p>
            )}
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 xl:w-auto">
          {!isArchived && selectedTracker.type === 'build' && (
            <button
              onClick={() => {
                setLogFormData({ amount: 1, note: '', timestamp: new Date().toISOString() });
                setIsLogModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              <PlusCircle size={16} /> Log activity
            </button>
          )}

          {!isArchived && selectedTracker.type === 'boolean' && dailyProgress.total < dailyProgress.target && (
            <button
              onClick={onQuickBooleanLog}
              className="flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              <CheckCircle2 size={16} /> Mark as done
            </button>
          )}

          {!isArchived && selectedTracker.type === 'quit' && (
            <button
              onClick={() => handleResetTracker(selectedTracker.id)}
              className="flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              <RotateCcw size={16} /> Log relapse
            </button>
          )}

          {!isArchived && (
            <button
              onClick={() => canManageTracker && toggleTrackerStatus(selectedTracker)}
              disabled={!canManageTracker}
              title={!canManageTracker ? 'Only the owner can do this' : undefined}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${ownerOnlyClass}`}
            >
              {selectedTracker.is_active ? (
                <>
                  <Pause size={16} /> Pause
                </>
              ) : (
                <>
                  <Play size={16} /> Resume
                </>
              )}
            </button>
          )}

          <button
            onClick={() =>
              canManageTracker &&
              (isArchived ? unarchiveTracker(selectedTracker.id) : archiveTracker(selectedTracker.id))
            }
            disabled={!canManageTracker}
            title={
              !canManageTracker
                ? 'Only the owner can do this'
                : isArchived
                  ? 'Bring this tracker back'
                  : 'Hide this tracker but keep all of its history'
            }
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${ownerOnlyClass}`}
          >
            {isArchived ? (
              <>
                <ArchiveRestore size={16} /> Restore
              </>
            ) : (
              <>
                <Archive size={16} /> Archive
              </>
            )}
          </button>

          <button
            onClick={() => canManageTracker && openTrackerModal(selectedTracker)}
            disabled={!canManageTracker}
            title={!canManageTracker ? 'Only the owner can do this' : undefined}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${ownerOnlyClass}`}
          >
            <Pencil size={16} /> Edit
          </button>

          <button
            onClick={() => canManageTracker && deleteTracker(selectedTracker.id)}
            disabled={!canManageTracker}
            title={!canManageTracker ? 'Only the owner can do this' : 'Deletes all history too'}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              canManageTracker
                ? 'border border-gray-200 bg-white text-rose-600 hover:bg-rose-50'
                : 'cursor-not-allowed border border-stone-200 bg-stone-100 text-stone-400'
            }`}
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>
    </header>
  );
}

export default TrackerHeader;
