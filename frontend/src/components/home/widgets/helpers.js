import { TRACKER_COLOR_HEX } from '../../../constants/tracker';

export const normalizeCategory = (value) => (value || 'General').trim() || 'General';

export const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatImpact = (value) =>
  toSafeNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatValue = (value, decimals = 1) =>
  toSafeNumber(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const accentFor = (tracker) => TRACKER_COLOR_HEX[tracker?.color] || null;

export const FIELD_CLASS =
  'w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm text-stone-800 outline-none focus:border-stone-400';

export const LABEL_CLASS = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500';
