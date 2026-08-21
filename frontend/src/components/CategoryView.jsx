import { Archive, Menu, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TRACKER_COLOR_HEX } from '../constants/tracker';
import { useAppState } from '../state/appState';
import { formatDate } from '../utils/date';
import { formatScheduleLabel } from '../utils/tracker';

function CategoryView() {
  const navigate = useNavigate();
  const {
    selectedCategory,
    selectedCategoryTrackers,
    setIsSidebarOpen,
    setSelectedTrackerId,
    openTrackerModal
  } = useAppState();

  const openTracker = (trackerId) => {
    setSelectedTrackerId(trackerId);
    navigate(`/tracker/${trackerId}`);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-10 pt-6 md:px-10 md:pt-10">
      <div className="mb-7 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="text-stone-500 hover:text-stone-900 md:hidden"
            aria-label="Open navigation"
          >
            <Menu size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">{selectedCategory}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {selectedCategoryTrackers.length} tracker{selectedCategoryTrackers.length === 1 ? '' : 's'} in this
              category.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openTrackerModal()}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
        >
          <Plus size={16} /> New
        </button>
      </div>

      {selectedCategoryTrackers.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-gray-400">
          No trackers in this category yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <ul className="divide-y divide-gray-100">
            {selectedCategoryTrackers.map((tracker) => {
              const accent = TRACKER_COLOR_HEX[tracker.color];
              const isArchived = Boolean(tracker.archived_at);

              return (
                <li key={tracker.id} className="px-5 py-4 transition-colors hover:bg-stone-50/70">
                  <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {accent && (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                            aria-hidden="true"
                          />
                        )}
                        <h2 className="truncate text-base font-semibold text-stone-900">{tracker.name}</h2>
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-800">
                          {tracker.type}
                        </span>
                        {isArchived ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                            <Archive size={10} /> Archived
                          </span>
                        ) : (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              tracker.is_active ? 'bg-stone-100 text-stone-800' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {tracker.is_active ? 'Active' : 'Paused'}
                          </span>
                        )}
                      </div>

                      {tracker.description && (
                        <p className="mb-2 line-clamp-2 text-sm text-stone-600">{tracker.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500">
                        <span>
                          {tracker.type === 'boolean'
                            ? formatScheduleLabel(tracker)
                            : `${tracker.type === 'quit' ? 'Avoid' : 'Goal'}: ${formatScheduleLabel(tracker)}`}
                        </span>
                        {tracker.type !== 'boolean' && tracker.impact_amount > 0 && (
                          <span>
                            Rate: {tracker.impact_amount} {tracker.impact_unit || '$'} / {tracker.impact_per}
                          </span>
                        )}
                        <span>Started {formatDate(tracker.start_date)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openTracker(tracker.id)}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:border-stone-300 hover:bg-white"
                    >
                      Open
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CategoryView;
