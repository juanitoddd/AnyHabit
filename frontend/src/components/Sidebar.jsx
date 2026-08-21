import { Archive, ChevronDown, Download, Home, Plus, Search, Settings, Upload, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TRACKER_COLOR_HEX } from '../constants/tracker';
import { useAppState } from '../state/appState';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'private', label: 'Private' },
  { id: 'groups', label: 'Groups' }
];

function Sidebar({ isHomeActive }) {
  const navigate = useNavigate();
  const {
    isSidebarOpen,
    setIsSidebarOpen,
    visibleTrackers,
    sortedCategoryEntries,
    activeCategory,
    archivedCount,
    showArchived,
    setShowArchived,
    collapsedCategories,
    setCollapsedCategories,
    selectedTrackerId,
    openTrackerModal,
    setIsSettingsOpen,
    setIsExportOpen,
    setIsImportOpen,
    setIsGroupManagementOpen,
    setIsCommandPaletteOpen,
    setSelectedCategory,
    setSelectedTrackerId
  } = useAppState();

  const [trackerTab, setTrackerTab] = useState('all');
  const [query, setQuery] = useState('');

  const openHome = () => {
    setSelectedTrackerId(null);
    setSelectedCategory(null);
    setIsSidebarOpen(false);
    navigate('/');
  };

  const openCategory = (category) => {
    setSelectedCategory(category);
    setSelectedTrackerId(null);
    setIsSidebarOpen(false);
    navigate(`/category/${encodeURIComponent(category)}`);
  };

  const openTracker = (trackerId, category) => {
    if (category) setSelectedCategory(category);
    setSelectedTrackerId(trackerId);
    setIsSidebarOpen(false);
    navigate(`/tracker/${trackerId}`);
  };

  const privateCount = visibleTrackers.filter((tracker) => !tracker.group_id).length;
  const groupCount = visibleTrackers.filter((tracker) => tracker.group_id).length;

  const filteredEntries = useMemo(() => {
    const search = query.trim().toLowerCase();

    const matchesTab = (tracker) =>
      trackerTab === 'all' ||
      (trackerTab === 'private' && !tracker.group_id) ||
      (trackerTab === 'groups' && tracker.group_id);

    const matchesQuery = (tracker) =>
      !search ||
      tracker.name.toLowerCase().includes(search) ||
      (tracker.category || '').toLowerCase().includes(search);

    return sortedCategoryEntries
      .map(([category, items]) => [category, items.filter((item) => matchesTab(item) && matchesQuery(item))])
      .filter(([, items]) => items.length > 0);
  }, [sortedCategoryEntries, trackerTab, query]);

  const hasResults = filteredEntries.length > 0;

  return (
    <div
      className={`app-sidebar fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r border-gray-100 bg-white p-6 transition-transform duration-300 md:relative md:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={openHome}
          className="flex items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-stone-50"
        >
          <img src="/AnyHabit.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-xl font-bold tracking-tight">AnyHabit</span>
        </button>
        <button
          className="text-gray-400 hover:text-stone-900 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setIsSidebarOpen(false);
          setIsCommandPaletteOpen(true);
        }}
        className="mb-4 flex w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-stone-300 hover:text-stone-600"
      >
        <Search size={15} />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>

      <button
        type="button"
        onClick={openHome}
        className={`mb-6 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          isHomeActive ? 'bg-stone-100 text-stone-900' : 'text-gray-500 hover:bg-gray-100 hover:text-stone-800'
        }`}
      >
        <Home size={16} />
        <span>Home</span>
      </button>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Trackers</h2>
        <button
          onClick={() => openTrackerModal()}
          className="flex items-center justify-center text-gray-400 transition-colors hover:text-stone-900"
          aria-label="Create a tracker"
        >
          <Plus size={18} />
        </button>
      </div>

      {visibleTrackers.length > 0 && (
        <>
          <div className="mb-3 flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTrackerTab(tab.id)}
                aria-pressed={trackerTab === tab.id}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  trackerTab === tab.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {tab.label}
                {tab.id === 'private' && ` (${privateCount})`}
                {tab.id === 'groups' && ` (${groupCount})`}
              </button>
            ))}
          </div>

          {/* Filtering the list in place beats scrolling once you keep more
              than a handful of trackers. */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <label htmlFor="sidebar-filter" className="sr-only">
              Filter trackers
            </label>
            <input
              id="sidebar-filter"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter…"
              className="w-full rounded-lg border border-gray-200 bg-stone-50 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-stone-400"
            />
          </div>
        </>
      )}

      <ul className="flex-1 space-y-4 overflow-y-auto pr-1">
        {!hasResults ? (
          <li className="mt-6 text-center text-sm text-gray-400">
            {query ? 'No tracker matches that filter.' : 'No trackers yet.'}
          </li>
        ) : (
          filteredEntries.map(([category, items]) => (
            <li key={category} className="pb-1">
              <div
                className={`mb-2 flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors ${
                  activeCategory === category ? 'bg-stone-50' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    openCategory(category);
                    setCollapsedCategories((previous) => ({ ...previous, [category]: false }));
                  }}
                  className="flex min-w-0 flex-1 items-center justify-between rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-stone-100/60"
                >
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                    {category}
                  </span>
                  <span className="category-count-badge ml-2 rounded-full bg-stone-100/80 px-2 py-0.5 text-[10px] font-medium text-stone-400">
                    {items.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedCategories((previous) => ({ ...previous, [category]: !previous[category] }))
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-stone-100/70 hover:text-stone-700"
                  aria-label={`${collapsedCategories[category] ? 'Expand' : 'Collapse'} ${category}`}
                  aria-expanded={!collapsedCategories[category]}
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${collapsedCategories[category] ? '-rotate-90' : ''}`}
                  />
                </button>
              </div>

              {!collapsedCategories[category] && (
                <ul className="ml-2 space-y-1 border-l border-stone-200/70 pl-4 pr-1">
                  {items.map((tracker) => {
                    const accent = TRACKER_COLOR_HEX[tracker.color];

                    return (
                      <li key={tracker.id}>
                        <button
                          type="button"
                          onClick={() => openTracker(tracker.id, category)}
                          className={`flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-all ${
                            selectedTrackerId === tracker.id
                              ? 'bg-stone-100 font-medium text-stone-900'
                              : 'text-gray-500 hover:bg-stone-50 hover:text-stone-700'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              {accent && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: accent }}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate">{tracker.name}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {tracker.archived_at && <Archive size={11} className="text-amber-500" />}
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  tracker.archived_at
                                    ? 'bg-amber-400'
                                    : tracker.is_active
                                      ? 'bg-emerald-400'
                                      : 'bg-rose-400'
                                }`}
                                title={
                                  tracker.archived_at ? 'Archived' : tracker.is_active ? 'Active' : 'Paused'
                                }
                              />
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))
        )}
      </ul>

      {archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          aria-pressed={showArchived}
          className={`mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
            showArchived ? 'bg-stone-100 text-stone-800' : 'text-gray-500 hover:bg-gray-100 hover:text-stone-800'
          }`}
        >
          <Archive size={16} />
          <span className="flex-1 text-left">{showArchived ? 'Hide archived' : 'Show archived'}</span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
            {archivedCount}
          </span>
        </button>
      )}

      <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
        {[
          { label: 'Groups', Icon: Users, action: () => setIsGroupManagementOpen(true) },
          { label: 'Export data', Icon: Download, action: () => setIsExportOpen(true) },
          { label: 'Restore backup', Icon: Upload, action: () => setIsImportOpen(true) },
          { label: 'Settings', Icon: Settings, action: () => setIsSettingsOpen(true) }
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.action();
              setIsSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-stone-800"
          >
            <item.Icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;
