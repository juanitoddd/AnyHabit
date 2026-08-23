import {
  Activity,
  BarChart3,
  CalendarRange,
  Code2,
  Coins,
  Flame,
  Layers,
  MonitorPlay,
  NotebookPen,
  Smile,
  Sparkles,
  Target,
  Zap
} from 'lucide-react';
import { toSafeNumber } from './helpers';

export const WIDGET_DEFINITIONS = {
  impactSummary: {
    label: 'Impact Totals',
    icon: Coins,
    description: 'Aggregate all impact units from selected trackers.',
    defaultSize: { w: 7, h: 10, minW: 4, minH: 6 },
    defaultConfig: { autoSelect: true, selectedTrackerIds: [] }
  },
  trackerOverview: {
    label: 'Tracker Overview',
    icon: Activity,
    description: 'See active tracker stats at a glance.',
    defaultSize: { w: 5, h: 6, minW: 3, minH: 5 },
    defaultConfig: {}
  },
  categoryBreakdown: {
    label: 'Category Breakdown',
    icon: Layers,
    description: 'View tracker distribution by category.',
    defaultSize: { w: 5, h: 6, minW: 3, minH: 4 },
    defaultConfig: {}
  },
  topImpact: {
    label: 'Top Impact Rates',
    icon: BarChart3,
    description: 'Trackers ranked by estimated monthly impact rate.',
    defaultSize: { w: 6, h: 6, minW: 3, minH: 4 },
    defaultConfig: {}
  },
  todayFocus: {
    label: "Today's Focus",
    icon: Target,
    description: 'What still needs doing in the current period.',
    defaultSize: { w: 6, h: 8, minW: 3, minH: 5 },
    defaultConfig: {}
  },
  streaks: {
    label: 'Active Streaks',
    icon: Flame,
    description: 'Your longest running streaks right now.',
    defaultSize: { w: 6, h: 7, minW: 3, minH: 4 },
    defaultConfig: {}
  },
  trackerSpotlight: {
    label: 'Tracker Spotlight',
    icon: Sparkles,
    description: 'One tracker up close, with a one-tap log button.',
    defaultSize: { w: 4, h: 11, minW: 3, minH: 9 },
    defaultConfig: { trackerId: null }
  },
  quickLog: {
    label: 'Quick Log',
    icon: Zap,
    description: 'One-tap logging for the trackers you touch most.',
    defaultSize: { w: 5, h: 8, minW: 3, minH: 4 },
    defaultConfig: { trackerIds: [] }
  },
  heatmap: {
    label: 'Consistency Heatmap',
    icon: CalendarRange,
    description: "A single tracker's last 24 weeks at a glance.",
    defaultSize: { w: 6, h: 8, minW: 4, minH: 6 },
    defaultConfig: { trackerId: null }
  },
  activityFeed: {
    label: 'Recent Activity',
    icon: Activity,
    description: 'The latest entries logged across every tracker.',
    defaultSize: { w: 5, h: 10, minW: 3, minH: 5 },
    defaultConfig: {}
  },
  journalFeed: {
    label: 'Journal Feed',
    icon: NotebookPen,
    description: 'Your most recent journal entries, wherever you wrote them.',
    defaultSize: { w: 5, h: 10, minW: 3, minH: 5 },
    defaultConfig: {}
  },
  moodTrend: {
    label: 'Mood Trend',
    icon: Smile,
    description: 'Average journalled mood over time.',
    defaultSize: { w: 6, h: 8, minW: 3, minH: 5 },
    defaultConfig: {}
  },
  notes: {
    label: 'Notes',
    icon: NotebookPen,
    description: 'A free-text note pinned to your dashboard.',
    defaultSize: { w: 4, h: 7, minW: 2, minH: 3 },
    defaultConfig: { text: '' }
  },
  apiExplorer: {
    label: 'API Explorer',
    icon: Code2,
    description: 'Copy-ready request snippets against your own instance.',
    defaultSize: { w: 6, h: 11, minW: 4, minH: 9 },
    defaultConfig: { path: '/trackers/', snippet: 'curl' }
  },
  embed: {
    label: 'Embed',
    icon: MonitorPlay,
    description: 'Show another page — a Grafana panel, a status board.',
    defaultSize: { w: 6, h: 10, minW: 3, minH: 5 },
    defaultConfig: { url: '', title: '' }
  }
};

export const WIDGET_TYPE_ALIASES = {
  finance: 'impactSummary'
};

export const WIDGET_TYPES = Object.keys(WIDGET_DEFINITIONS);

// Widgets served by /dashboard/activity rather than /dashboard/summary.
export const ACTIVITY_WIDGET_TYPES = new Set(['activityFeed', 'journalFeed', 'moodTrend']);

export const createWidgetId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeImpactConfig = (config) => {
  const base = config && typeof config === 'object' ? config : {};

  return {
    autoSelect: base.autoSelect !== false,
    selectedTrackerIds: Array.isArray(base.selectedTrackerIds)
      ? [...new Set(base.selectedTrackerIds.map((id) => toSafeNumber(id)).filter((id) => id > 0))]
      : []
  };
};

export const normalizeWidget = (rawWidget) => {
  if (!rawWidget || typeof rawWidget !== 'object') return null;

  const rawType = typeof rawWidget.type === 'string' ? rawWidget.type : '';
  const resolvedType = WIDGET_TYPE_ALIASES[rawType] || rawType;
  const definition = WIDGET_DEFINITIONS[resolvedType];
  if (!definition) return null;

  const id = typeof rawWidget.id === 'string' && rawWidget.id.trim() ? rawWidget.id : `${resolvedType}-${createWidgetId()}`;
  const title =
    typeof rawWidget.title === 'string' && rawWidget.title.trim() ? rawWidget.title.trim() : definition.label;

  const config =
    resolvedType === 'impactSummary'
      ? normalizeImpactConfig(rawWidget.config)
      : rawWidget.config && typeof rawWidget.config === 'object'
        ? { ...rawWidget.config }
        : { ...definition.defaultConfig };

  return {
    id,
    type: resolvedType,
    title,
    config
  };
};

export const normalizeWidgets = (rawWidgets) => {
  if (!Array.isArray(rawWidgets)) return [];

  return rawWidgets
    .map(normalizeWidget)
    .filter(Boolean)
    .map((widget, index) => {
      if (index === 0) return widget;
      return {
        ...widget,
        id: widget.id || `${widget.type}-${createWidgetId()}`
      };
    });
};

export const getSelectedImpactTrackerIds = (widget, trackerMap, candidateIds) => {
  const config = normalizeImpactConfig(widget.config);

  if (config.autoSelect) {
    return candidateIds;
  }

  return config.selectedTrackerIds.filter((trackerId) => !!trackerMap[trackerId]);
};
