import { CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatDate, formatTime } from '../../utils/date';

const cardClass = 'mb-8 w-full rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6';
const chartAxisTick = { fontSize: 11, fill: '#9ca3af' };

const HEATMAP_SHADES = ['bg-stone-100', 'bg-emerald-100', 'bg-emerald-200', 'bg-emerald-300', 'bg-emerald-500'];

const shadeFor = (intensity) => {
  if (intensity <= 0) return HEATMAP_SHADES[0];
  if (intensity < 0.25) return HEATMAP_SHADES[1];
  if (intensity < 0.5) return HEATMAP_SHADES[2];
  if (intensity < 0.75) return HEATMAP_SHADES[3];
  return HEATMAP_SHADES[4];
};

function TrackerCharts({ selectedTracker, historicalChartData, buildHeatmap, weekdayBreakdown, habitLogs, deleteLog, updateLog }) {
  const [editingLogId, setEditingLogId] = useState(null);
  const [draftAmount, setDraftAmount] = useState('');

  const isQuit = selectedTracker.type === 'quit';
  const showsLogList = selectedTracker.type === 'build' || selectedTracker.type === 'boolean';

  const weekdayData = useMemo(
    () => (weekdayBreakdown || []).map((entry) => ({ ...entry, short: entry.label.slice(0, 3) })),
    [weekdayBreakdown]
  );

  const hasWeekdayData = weekdayData.some((entry) => entry.entries > 0);

  const startEditing = (log) => {
    setEditingLogId(log.id);
    setDraftAmount(String(log.amount));
  };

  const saveEdit = async (logId) => {
    const amount = parseFloat(draftAmount);
    if (Number.isFinite(amount)) {
      await updateLog(logId, { amount });
    }
    setEditingLogId(null);
  };

  return (
    <>
      <div className={cardClass}>
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <h2 className="text-sm font-semibold text-stone-700">Historical progress</h2>
          <p className="text-xs text-gray-400">Last 120 days</p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {isQuit ? (
              <LineChart data={historicalChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" minTickGap={35} tick={chartAxisTick} />
                <YAxis tick={chartAxisTick} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#111827" strokeWidth={2.5} dot={false} name="Streak days" />
              </LineChart>
            ) : (
              <AreaChart data={historicalChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#111827" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#111827" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" minTickGap={35} tick={chartAxisTick} />
                <YAxis tick={chartAxisTick} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#111827"
                  fill="url(#progressArea)"
                  strokeWidth={2.2}
                  name="Daily amount"
                />
                <Line type="monotone" dataKey="cumulative" stroke="#6b7280" strokeWidth={1.4} dot={false} name="Cumulative" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* The heatmap now covers quit trackers too, where a red cell marks a
          relapse — the clearest view of a pattern the streak number hides. */}
      {buildHeatmap && (
        <div className={`${cardClass} overflow-x-auto`}>
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="text-sm font-semibold text-stone-700">Consistency heatmap</h2>
            <p className="text-xs text-gray-400">Last 24 weeks</p>
          </div>

          <div className="flex min-w-max gap-[3px]">
            {buildHeatmap.columns.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="flex flex-col gap-[3px]">
                {week.map((cell) => {
                  const intensity = buildHeatmap.maxAmount > 0 ? cell.amount / buildHeatmap.maxAmount : 0;
                  const shade = cell.isRelapse ? 'bg-rose-400' : shadeFor(intensity);

                  return (
                    <div
                      key={cell.date}
                      title={
                        cell.isRelapse
                          ? `${cell.date}: relapse logged`
                          : isQuit
                            ? `${cell.date}: ${cell.amount > 0 ? 'clean day' : 'not tracked'}`
                            : `${cell.date}: ${cell.amount.toFixed(1)} ${selectedTracker.unit}`
                      }
                      className={`h-3.5 w-3.5 rounded-[3px] border border-white/60 ${
                        cell.isFiller ? 'opacity-0' : shade
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            <span>Less</span>
            {HEATMAP_SHADES.map((shade) => (
              <span key={shade} className={`h-3.5 w-3.5 rounded-[3px] border border-white/60 ${shade}`} />
            ))}
            <span>More</span>
            {isQuit && (
              <>
                <span className="ml-3 h-3.5 w-3.5 rounded-[3px] border border-white/60 bg-rose-400" />
                <span>Relapse</span>
              </>
            )}
          </div>
        </div>
      )}

      {!isQuit && hasWeekdayData && (
        <div className={cardClass}>
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="text-sm font-semibold text-stone-700">Which days you show up</h2>
            <p className="text-xs text-gray-400">All-time totals by weekday</p>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="short" tick={chartAxisTick} />
                <YAxis tick={chartAxisTick} />
                <Tooltip
                  formatter={(value) => [`${value} ${selectedTracker.unit}`, 'Total']}
                  labelFormatter={(label) => weekdayData.find((entry) => entry.short === label)?.label || label}
                />
                <Bar dataKey="total" fill="#111827" radius={[6, 6, 0, 0]} name="Total" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showsLogList && habitLogs.length > 0 && (
        <div className="mb-8 w-full">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Recent activity</h2>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-2">
            {habitLogs.map((log) => (
              <div
                key={log.id}
                className="group flex flex-shrink-0 items-center gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-3 transition-all hover:border-gray-200"
              >
                <div className="min-w-0">
                  {editingLogId === log.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        value={draftAmount}
                        onChange={(event) => setDraftAmount(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveEdit(log.id);
                          if (event.key === 'Escape') setEditingLogId(null);
                        }}
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-stone-400"
                        aria-label="Amount"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(log.id)}
                        className="rounded-lg bg-stone-900 px-2 py-1 text-xs font-medium text-white"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 font-medium text-stone-800">
                      <CheckCircle2 size={14} className="shrink-0 text-stone-400" />
                      {selectedTracker.type === 'boolean' ? 'Completed' : `${log.amount} ${selectedTracker.unit}`}
                    </div>
                  )}
                  <div className="mt-0.5 whitespace-nowrap text-xs text-gray-400">
                    {formatDate(log.timestamp, { month: 'short', day: 'numeric' })} · {formatTime(log.timestamp)}
                  </div>
                  {log.note && <div className="mt-1 max-w-[14rem] truncate text-xs text-stone-500">{log.note}</div>}
                </div>

                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  {selectedTracker.type !== 'boolean' && (
                    <button
                      onClick={() => startEditing(log)}
                      className="text-gray-300 hover:text-stone-600"
                      aria-label="Edit this log entry"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteLog(log.id)}
                    className="text-gray-300 hover:text-rose-500"
                    aria-label="Delete this log entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default TrackerCharts;
