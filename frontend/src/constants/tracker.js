export const TRACKER_TYPE_OPTIONS = [
  { value: 'quit', label: 'Quit', hint: 'Stop something. Counts time avoided.' },
  { value: 'build', label: 'Build', hint: 'Do more of something. Counts amounts you log.' },
  { value: 'boolean', label: 'Yes/No', hint: 'Simply done or not done each period.' }
];

export const PERIOD_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' }
];

/** Accent colours a tracker can be tagged with, for scanning a long list. */
export const TRACKER_COLORS = [
  { value: '', label: 'Default', swatch: '#a8a29e' },
  { value: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { value: 'sky', label: 'Sky', swatch: '#0ea5e9' },
  { value: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { value: 'amber', label: 'Amber', swatch: '#f59e0b' },
  { value: 'rose', label: 'Rose', swatch: '#f43f5e' }
];

export const TRACKER_COLOR_HEX = TRACKER_COLORS.reduce((accumulator, option) => {
  if (option.value) accumulator[option.value] = option.swatch;
  return accumulator;
}, {});

export const WEEK_START_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'saturday', label: 'Saturday' }
];

export const MOOD_LABELS = {
  1: 'Very bad',
  2: 'Bad',
  3: 'Neutral',
  4: 'Good',
  5: 'Very good'
};

export const DEFAULT_TRACKER_FORM = {
  id: null,
  name: '',
  description: '',
  color: '',
  category: 'General',
  type: 'quit',
  unit: '',
  impact_amount: 0,
  impact_unit: '$',
  impact_per: 'day',
  units_per_amount: 0,
  units_per: 'day',
  units_per_interval: 1,
  is_active: true,
  start_date: '',
  group_id: null,
  participant_ids: []
};

export const DEFAULT_JOURNAL_FORM = { id: null, content: '', mood: 3 };

export const DEFAULT_LOG_FORM = {
  amount: 1,
  note: '',
  timestamp: new Date().toISOString()
};
