import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GripHorizontal,
  Menu,
  Plus,
  RefreshCcw,
  Settings,
  Users,
  X
} from 'lucide-react';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import { useNavigate } from 'react-router-dom';
import {
  fetchActivityApi,
  fetchDashboardSummaryApi,
  fetchHomeDashboardApi,
  saveHomeDashboardApi
} from '../../services/dashboardApi';
import { ApiExplorerWidget, EmbedWidget } from './widgets/DeveloperWidgets';
import { ActivityFeedWidget, JournalFeedWidget, MoodTrendWidget, NotesWidget } from './widgets/FeedWidgets';
import {
  CategoryBreakdownWidget,
  ImpactSummaryWidget,
  StreaksWidget,
  TodayFocusWidget,
  TopImpactWidget,
  TrackerOverviewWidget
} from './widgets/SummaryWidgets';
import { HeatmapWidget, QuickLogWidget, TrackerSpotlightWidget } from './widgets/TrackerWidgets';
import { EMPTY_LAYOUTS, GRID_BREAKPOINTS, GRID_COLS, appendWidgetToLayouts, ensureLayouts } from './widgets/layout';
import {
  ACTIVITY_WIDGET_TYPES,
  WIDGET_DEFINITIONS,
  WIDGET_TYPES,
  createWidgetId,
  getSelectedImpactTrackerIds,
  normalizeImpactConfig,
  normalizeWidgets
} from './widgets/registry';
import { WidgetSettingsPanel } from './widgets/WidgetSettingsPanel';
import { normalizeCategory } from './widgets/helpers';
import { createLogApi } from '../../services/trackerApi';
import { useAppState } from '../../state/appState';
import Modal from '../ui/Modal';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

function HomePage() {
  const navigate = useNavigate();
  const {
    trackers,
    visibleTrackers,
    groups,
    setIsSidebarOpen,
    openTrackerModal,
    setIsGroupManagementOpen,
    setSelectedCategory,
    setSelectedTrackerId,
    confirm,
    notify,
    reportError,
    setIsSettingsOpen,
    isLoadingTrackers
  } = useAppState();

  const openTracker = (trackerId, category) => {
    if (category) {
      setSelectedCategory(category);
    }
    setSelectedTrackerId(trackerId);
    navigate(`/tracker/${trackerId}`);
  };

  const openCategory = (category) => {
    setSelectedCategory(category);
    setSelectedTrackerId(null);
    navigate(`/category/${encodeURIComponent(category)}`);
  };
  const {
    width: gridWidth,
    mounted: isGridMounted,
    containerRef: gridContainerRef
  } = useContainerWidth({ measureBeforeMount: true, initialWidth: 1280 });

  const [widgets, setWidgets] = useState([]);
  const [layouts, setLayouts] = useState({ ...EMPTY_LAYOUTS });
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardLoadError, setDashboardLoadError] = useState('');
  const [isSavingDashboard, setIsSavingDashboard] = useState(false);
  const [dashboardSaveError, setDashboardSaveError] = useState('');
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [activity, setActivity] = useState(null);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  const [isWidgetPickerOpen, setIsWidgetPickerOpen] = useState(false);
  const [activeWidgetSettingsId, setActiveWidgetSettingsId] = useState(null);

  const saveRequestIdRef = useRef(0);

  const trackerMap = useMemo(
    () =>
      trackers.reduce((acc, tracker) => {
        acc[tracker.id] = tracker;
        return acc;
      }, {}),
    [trackers]
  );

  // Widgets read from the visible set so an archived tracker stops skewing
  // dashboard totals the moment it is archived.
  const impactCandidates = useMemo(
    () =>
      visibleTrackers
        .filter((tracker) => tracker.type !== 'boolean')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [visibleTrackers]
  );

  const impactCandidateIds = useMemo(() => impactCandidates.map((tracker) => tracker.id), [impactCandidates]);

  const widgetTrackerOptions = useMemo(
    () => [...visibleTrackers].sort((a, b) => a.name.localeCompare(b.name)),
    [visibleTrackers]
  );

  // A quit tracker has nothing to "log one of", so it is not offered here.
  const loggableTrackerOptions = useMemo(
    () => widgetTrackerOptions.filter((tracker) => tracker.type !== 'quit'),
    [widgetTrackerOptions]
  );

  const activeWidgetForSettings = useMemo(
    () => widgets.find((widget) => widget.id === activeWidgetSettingsId) || null,
    [widgets, activeWidgetSettingsId]
  );

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setIsLoadingDashboard(true);
      setDashboardLoadError('');

      try {
        const response = await fetchHomeDashboardApi();
        if (cancelled) return;

        const loadedWidgets = normalizeWidgets(response.widgets);
        setWidgets(loadedWidgets);
        setLayouts(ensureLayouts(loadedWidgets, response.layouts));
      } catch (error) {
        console.error(error);
        if (cancelled) return;

        setDashboardLoadError('Could not load your dashboard.');
        setWidgets([]);
        setLayouts({ ...EMPTY_LAYOUTS });
      } finally {
        if (!cancelled) {
          setIsLoadingDashboard(false);
          setIsHydrated(true);
        }
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDashboardSummary = async () => {
      try {
        const response = await fetchDashboardSummaryApi();
        if (!cancelled) {
          setDashboardSummary(response);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setDashboardSummary(null);
        }
      }
    };

    loadDashboardSummary();

    return () => {
      cancelled = true;
    };
  }, [trackers]);

  // Loaded only when a widget that needs it is on the board, so a dashboard
  // without feed widgets does not pay for the query.
  const needsActivity = useMemo(
    () => widgets.some((widget) => ACTIVITY_WIDGET_TYPES.has(widget.type)),
    [widgets]
  );

  useEffect(() => {
    if (!needsActivity) return undefined;

    let cancelled = false;
    setIsLoadingActivity(true);

    fetchActivityApi(25)
      .then((response) => {
        if (!cancelled) setActivity(response);
      })
      .catch((error) => {
        if (!cancelled) reportError(error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingActivity(false);
      });

    return () => {
      cancelled = true;
    };
  }, [needsActivity, trackers, reportError]);

  useEffect(() => {
    if (!isHydrated) return;

    const currentRequestId = ++saveRequestIdRef.current;

    const timer = setTimeout(async () => {
      setDashboardSaveError('');
      setIsSavingDashboard(true);

      try {
        await saveHomeDashboardApi({ widgets, layouts });

        if (saveRequestIdRef.current === currentRequestId) {
          setIsSavingDashboard(false);
        }
      } catch (error) {
        console.error(error);

        if (saveRequestIdRef.current === currentRequestId) {
          setDashboardSaveError('Could not save dashboard changes.');
          setIsSavingDashboard(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [widgets, layouts, isHydrated]);

  const handleAddWidget = (widgetType) => {
    const definition = WIDGET_DEFINITIONS[widgetType];
    if (!definition) return;

    const nextWidget = {
      id: `${widgetType}-${createWidgetId()}`,
      type: widgetType,
      title: definition.label,
      config: { ...definition.defaultConfig }
    };

    setWidgets((prevWidgets) => {
      const updatedWidgets = [...prevWidgets, nextWidget];
      setLayouts((prevLayouts) => appendWidgetToLayouts(prevLayouts, prevWidgets, nextWidget));
      return updatedWidgets;
    });

    setIsWidgetPickerOpen(false);
  };

  const handleRemoveWidget = (widgetId) => {
    setWidgets((prevWidgets) => {
      const updatedWidgets = prevWidgets.filter((widget) => widget.id !== widgetId);
      setLayouts((prevLayouts) => ensureLayouts(updatedWidgets, prevLayouts));
      return updatedWidgets;
    });

    setActiveWidgetSettingsId((prev) => (prev === widgetId ? null : prev));
  };

  const handleClearDashboard = async () => {
    if (widgets.length === 0) return;

    // One misplaced click used to remove every widget with no way back.
    const accepted = await confirm({
      title: 'Clear your dashboard?',
      message: `All ${widgets.length} widget${
        widgets.length === 1 ? '' : 's'
      } will be removed. Your trackers and their history are not affected.`,
      confirmLabel: 'Clear dashboard',
      tone: 'danger'
    });
    if (!accepted) return;

    setWidgets([]);
    setLayouts({ ...EMPTY_LAYOUTS });
    setActiveWidgetSettingsId(null);
    notify.success('Dashboard cleared');
  };

  const updateWidget = (widgetId, patch) => {
    setWidgets((prevWidgets) =>
      prevWidgets.map((widget) => {
        if (widget.id !== widgetId) return widget;
        return { ...widget, ...patch };
      })
    );
  };

  const updateWidgetTitle = (widgetId, nextTitle) => {
    updateWidget(widgetId, {
      title: String(nextTitle ?? '').slice(0, 80)
    });
  };

  const updateWidgetConfig = (widgetId, patch) => {
    setWidgets((prevWidgets) =>
      prevWidgets.map((widget) => {
        if (widget.id !== widgetId) return widget;

        return {
          ...widget,
          config: {
            ...(widget.config || {}),
            ...patch
          }
        };
      })
    );
  };

  /** Log one unit against a tracker straight from a widget. */
  const handleWidgetQuickLog = async (tracker) => {
    await createLogApi(tracker.id, { amount: 1, timestamp: new Date().toISOString() });
    notify.success(`Logged ${tracker.name}`);

    // The summary drives the streak and focus widgets, so it is now stale.
    refreshDashboardSummary();
    if (needsActivity) {
      fetchActivityApi(25).then(setActivity).catch(reportError);
    }
  };

  const refreshDashboardSummary = async () => {
    try {
      const response = await fetchDashboardSummaryApi();
      setDashboardSummary(response);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="home-page flex-1 flex flex-col overflow-hidden bg-[#fcfcfc]">
      <div className="px-4 md:px-10 pt-6 md:pt-10 pb-6 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-stone-500 hover:text-stone-900">
              <Menu size={24} />
            </button>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900">Home</h2>
              <p className="text-sm text-gray-500 mt-1">Build your own dashboard with custom widgets.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGroupManagementOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <Users size={16} /> Groups
              {groups.length > 0 && <span className="text-xs font-bold bg-stone-100 px-2 py-0.5 rounded-full">{groups.length}</span>}
            </button>

            <button
              type="button"
              onClick={() => openTrackerModal()}
              className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors"
            >
              Create Tracker
            </button>

            <button
              type="button"
              onClick={() => setIsWidgetPickerOpen(true)}
              className="px-3 py-2 text-sm font-medium rounded-xl bg-stone-900 text-white hover:bg-stone-800 transition-colors inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Add Widget
            </button>

            <button
              type="button"
              onClick={handleClearDashboard}
              className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCcw size={14} />
              Clear Dashboard
            </button>
          </div>
        </div>

        <div className="mt-3 min-h-5 text-xs text-gray-500 flex items-center gap-2">
          {isSavingDashboard && <span>Saving changes...</span>}
          {!isSavingDashboard && dashboardSaveError && <span className="text-rose-600">{dashboardSaveError}</span>}
          {!isSavingDashboard && !dashboardSaveError && isHydrated && <span>All changes saved to server.</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-10 py-6" ref={gridContainerRef}>
        {isLoadingDashboard ? (
          <div className="bg-white border border-gray-100 rounded-3xl p-10 text-center text-gray-500">Loading dashboard...</div>
        ) : dashboardLoadError ? (
          <div className="bg-white border border-rose-100 rounded-3xl p-10 text-center text-rose-600">
            <p className="font-semibold">{dashboardLoadError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        ) : widgets.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-3xl p-10 text-center text-gray-500">
            <p className="text-lg font-semibold text-stone-800">Your dashboard is empty</p>
            <p className="text-sm mt-1">Add widgets to start building your personalized home screen.</p>
            <button
              type="button"
              onClick={() => setIsWidgetPickerOpen(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition-colors"
            >
              Add your first widget
            </button>
          </div>
        ) : (
          !isGridMounted ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-10 text-center text-gray-500">Preparing layout...</div>
          ) : (
            <ResponsiveGridLayout
              className="home-grid"
              width={gridWidth}
              layouts={ensureLayouts(widgets, layouts)}
              breakpoints={GRID_BREAKPOINTS}
              cols={GRID_COLS}
              rowHeight={28}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              isDraggable={true}
              isResizable={true}
              draggableHandle=".widget-drag-handle"
              compactType={null}
              preventCollision={false}
              onLayoutChange={(_, allLayouts) => {
                setLayouts(ensureLayouts(widgets, allLayouts));
              }}
            >
              {widgets.map((widget) => {
                const definition = WIDGET_DEFINITIONS[widget.type];
                if (!definition) return null;

                const Icon = definition.icon;
                const isImpactWidget = widget.type === 'impactSummary';
                const impactConfig = isImpactWidget ? normalizeImpactConfig(widget.config) : null;
                const selectedTrackerIds = isImpactWidget
                  ? getSelectedImpactTrackerIds(widget, trackerMap, impactCandidateIds)
                  : [];
                const impactSourceLabel = isImpactWidget
                  ? impactConfig?.autoSelect
                    ? `Source: all eligible trackers (${selectedTrackerIds.length})`
                    : `Source: ${selectedTrackerIds.length} selected tracker${selectedTrackerIds.length === 1 ? '' : 's'}`
                  : '';

                return (
                  <div key={widget.id}>
                    <div className="home-widget-card h-full bg-white border border-gray-100 rounded-3xl shadow-sm flex flex-col overflow-hidden">
                      <div className="widget-drag-handle px-4 py-3 border-b border-gray-100 bg-white/90 cursor-grab flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <GripHorizontal size={16} className="text-gray-400 flex-shrink-0" />
                          <span className="rounded-md p-1.5 bg-stone-100 text-stone-700 flex-shrink-0">
                            <Icon size={14} />
                          </span>
                          <span className="text-sm font-semibold text-stone-900 truncate">
                            {widget.title || definition.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActiveWidgetSettingsId((prev) => (prev === widget.id ? null : widget.id))}
                            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:text-stone-800 hover:bg-stone-50 flex items-center justify-center transition-colors"
                            aria-label="Edit widget"
                          >
                            <Settings size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveWidget(widget.id)}
                            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                            aria-label="Remove widget"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto p-4">
                        {widget.type === 'impactSummary' && (
                          <ImpactSummaryWidget
                            selectedTrackers={selectedTrackerIds.map((trackerId) => trackerMap[trackerId]).filter(Boolean)}
                            impactRows={dashboardSummary?.impact_rows || []}
                            isRefreshing={isLoadingDashboard && !dashboardSummary}
                            onRefresh={refreshDashboardSummary}
                            onOpenTracker={(tracker) => openTracker(tracker.id, normalizeCategory(tracker.category))}
                            sourceLabel={impactSourceLabel}
                          />
                        )}

                        {widget.type === 'trackerOverview' && <TrackerOverviewWidget overview={dashboardSummary?.overview} />}

                        {widget.type === 'categoryBreakdown' && (
                          <CategoryBreakdownWidget
                            categories={dashboardSummary?.category_breakdown || []}
                            onOpenCategory={(category) => openCategory(category)}
                          />
                        )}

                        {widget.type === 'topImpact' && (
                          <TopImpactWidget
                            rows={dashboardSummary?.top_impact_rows || []}
                            onOpenTracker={(tracker) => openTracker(tracker.id, normalizeCategory(tracker.category))}
                          />
                        )}

                        {widget.type === 'todayFocus' && (
                          <TodayFocusWidget
                            rows={dashboardSummary?.impact_rows || []}
                            overview={dashboardSummary?.overview}
                            isLoading={isLoadingTrackers && !dashboardSummary}
                            onOpenTracker={(tracker) => openTracker(tracker.id, normalizeCategory(tracker.category))}
                          />
                        )}

                        {widget.type === 'streaks' && (
                          <StreaksWidget
                            rows={dashboardSummary?.impact_rows || []}
                            onOpenTracker={(tracker) => openTracker(tracker.id, normalizeCategory(tracker.category))}
                          />
                        )}

                        {widget.type === 'trackerSpotlight' && (
                          <TrackerSpotlightWidget
                            config={widget.config || {}}
                            trackerMap={trackerMap}
                            onOpenTracker={(tracker) => openTracker(tracker.id, normalizeCategory(tracker.category))}
                            onQuickLog={handleWidgetQuickLog}
                            onError={reportError}
                          />
                        )}

                        {widget.type === 'quickLog' && (
                          <QuickLogWidget
                            config={widget.config || {}}
                            trackerMap={trackerMap}
                            onQuickLog={handleWidgetQuickLog}
                            onError={reportError}
                          />
                        )}

                        {widget.type === 'heatmap' && (
                          <HeatmapWidget
                            config={widget.config || {}}
                            trackerMap={trackerMap}
                            onError={reportError}
                          />
                        )}

                        {widget.type === 'activityFeed' && (
                          <ActivityFeedWidget
                            activity={activity}
                            isLoading={isLoadingActivity}
                            onOpenTracker={(trackerId) =>
                              openTracker(trackerId, normalizeCategory(trackerMap[trackerId]?.category))
                            }
                          />
                        )}

                        {widget.type === 'journalFeed' && (
                          <JournalFeedWidget
                            activity={activity}
                            isLoading={isLoadingActivity}
                            onOpenTracker={(trackerId) =>
                              openTracker(trackerId, normalizeCategory(trackerMap[trackerId]?.category))
                            }
                          />
                        )}

                        {widget.type === 'moodTrend' && (
                          <MoodTrendWidget activity={activity} isLoading={isLoadingActivity} />
                        )}

                        {widget.type === 'notes' && (
                          <NotesWidget
                            config={widget.config || {}}
                            onConfigChange={(patch) => updateWidgetConfig(widget.id, patch)}
                          />
                        )}

                        {widget.type === 'apiExplorer' && (
                          <ApiExplorerWidget
                            config={widget.config || {}}
                            onConfigChange={(patch) => updateWidgetConfig(widget.id, patch)}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                          />
                        )}

                        {widget.type === 'embed' && <EmbedWidget config={widget.config || {}} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </ResponsiveGridLayout>
          )
        )}
      </div>

      {/* Both of these used to be hand-rolled overlays, which is why neither
          closed on Escape while every other dialog did. */}
      <Modal
        isOpen={Boolean(activeWidgetForSettings)}
        onClose={() => setActiveWidgetSettingsId(null)}
        title="Widget settings"
        description="Customise the title and this widget's own options."
        size="xl"
      >
        {activeWidgetForSettings && (
          <WidgetSettingsPanel
            key={activeWidgetForSettings.id}
            widget={activeWidgetForSettings}
            definition={WIDGET_DEFINITIONS[activeWidgetForSettings.type]}
            trackerMap={trackerMap}
            impactCandidates={impactCandidates}
            allTrackers={widgetTrackerOptions}
            loggableTrackers={loggableTrackerOptions}
            onTitleChange={(nextTitle) => updateWidgetTitle(activeWidgetForSettings.id, nextTitle)}
            onConfigChange={(patch) => updateWidgetConfig(activeWidgetForSettings.id, patch)}
          />
        )}
      </Modal>

      <Modal
        isOpen={isWidgetPickerOpen}
        onClose={() => setIsWidgetPickerOpen(false)}
        title="Add a widget"
        description="Pick what you want on your home dashboard."
        size="2xl"
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {WIDGET_TYPES.map((widgetType) => {
            const definition = WIDGET_DEFINITIONS[widgetType];
            const Icon = definition.icon;

            return (
              <button
                key={widgetType}
                type="button"
                onClick={() => handleAddWidget(widgetType)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50"
              >
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-stone-100 p-1.5 text-stone-700">
                    <Icon size={14} />
                  </span>
                  <span className="block min-w-0">
                    <span className="block text-sm font-semibold text-stone-900">{definition.label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{definition.description}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

export default HomePage;
