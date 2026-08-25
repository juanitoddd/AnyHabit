import { toSafeNumber } from './helpers';
import { WIDGET_DEFINITIONS } from './registry';

export const GRID_BREAKPOINTS = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0
};

export const GRID_COLS = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2
};

export const EMPTY_LAYOUTS = Object.keys(GRID_COLS).reduce((acc, breakpoint) => {
  acc[breakpoint] = [];
  return acc;
}, {});

export const buildLayoutItem = (widget, breakpoint, index) => {
  const definition = WIDGET_DEFINITIONS[widget.type] || WIDGET_DEFINITIONS.trackerOverview;
  const { defaultSize } = definition;
  const cols = GRID_COLS[breakpoint];

  const width = Math.max(1, Math.min(toSafeNumber(defaultSize.w) || 1, cols));
  const height = Math.max(2, toSafeNumber(defaultSize.h) || 2);
  const minW = Math.max(1, Math.min(toSafeNumber(defaultSize.minW) || 1, width));
  const minH = Math.max(2, toSafeNumber(defaultSize.minH) || 2);

  const itemsPerRow = Math.max(1, Math.floor(cols / width));
  const x = (index % itemsPerRow) * width;
  const y = Math.floor(index / itemsPerRow) * height;

  return {
    i: widget.id,
    x,
    y,
    w: width,
    h: height,
    minW,
    minH
  };
};

export const normalizeLayoutItem = (item, cols, fallback) => {
  const width = Math.max(1, Math.min(toSafeNumber(item.w) || fallback.w, cols));
  const minW = Math.max(1, Math.min(toSafeNumber(item.minW) || fallback.minW, width));
  const minH = Math.max(2, toSafeNumber(item.minH) || fallback.minH);
  const height = Math.max(minH, toSafeNumber(item.h) || fallback.h);

  const maxX = Math.max(0, cols - width);
  const x = Math.max(0, Math.min(Math.floor(toSafeNumber(item.x)), maxX));
  const y = Math.max(0, Math.floor(toSafeNumber(item.y)));

  return {
    i: fallback.i,
    x,
    y,
    w: width,
    h: height,
    minW,
    minH
  };
};

export const ensureLayouts = (widgets, rawLayouts = {}) => {
  const sourceLayouts = rawLayouts && typeof rawLayouts === 'object' ? rawLayouts : {};

  return Object.keys(GRID_COLS).reduce((acc, breakpoint) => {
    const cols = GRID_COLS[breakpoint];
    const entries = Array.isArray(sourceLayouts[breakpoint]) ? sourceLayouts[breakpoint] : [];

    const layoutById = new Map(
      entries
        .filter((entry) => entry && typeof entry.i === 'string')
        .map((entry) => [entry.i, entry])
    );

    acc[breakpoint] = widgets.map((widget, index) => {
      const fallback = buildLayoutItem(widget, breakpoint, index);
      const existing = layoutById.get(widget.id);

      if (!existing) return fallback;
      return normalizeLayoutItem(existing, cols, fallback);
    });

    return acc;
  }, {});
};

export const appendWidgetToLayouts = (currentLayouts, existingWidgets, nextWidget) => {
  const normalizedLayouts = ensureLayouts(existingWidgets, currentLayouts);

  return Object.keys(GRID_COLS).reduce((acc, breakpoint) => {
    const breakpointLayout = normalizedLayouts[breakpoint] || [];
    const baseItem = buildLayoutItem(nextWidget, breakpoint, breakpointLayout.length);
    const nextY = breakpointLayout.reduce((maxY, item) => Math.max(maxY, item.y + item.h), 0);

    acc[breakpoint] = [
      ...breakpointLayout,
      {
        ...baseItem,
        x: 0,
        y: nextY
      }
    ];

    return acc;
  }, {});
};
