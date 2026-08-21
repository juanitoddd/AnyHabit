const PERIOD_LABELS = {
  day: { singular: 'day', plural: 'days' },
  week: { singular: 'week', plural: 'weeks' },
  month: { singular: 'month', plural: 'months' },
  year: { singular: 'year', plural: 'years' }
};

export const normalizeCategory = (value) => (value || 'General').trim() || 'General';

/** "30 Pages / day", "Habit every 3 weeks" — the tracker's schedule in words. */
export const formatScheduleLabel = (tracker) => {
  const interval = Math.max(1, Number(tracker.units_per_interval || 1));
  const period = PERIOD_LABELS[tracker.units_per] || PERIOD_LABELS.day;
  const periodLabel = interval === 1 ? period.singular : period.plural;

  if (tracker.type === 'boolean') {
    return interval === 1
      ? `${period.singular.charAt(0).toUpperCase()}${period.singular.slice(1)} habit`
      : `Habit every ${interval} ${periodLabel}`;
  }

  return `${tracker.units_per_amount} ${tracker.unit} / ${interval} ${periodLabel}`;
};

/** "this day", "these 3 weeks" — names the window a target applies to. */
export const formatWindowLabel = (tracker) => {
  const interval = Math.max(1, Number(tracker.units_per_interval || 1));
  const period = PERIOD_LABELS[tracker.units_per] || PERIOD_LABELS.day;
  const label = interval === 1 ? period.singular : period.plural;
  return interval === 1 ? `this ${label}` : `these ${interval} ${label}`;
};
