import { useAppState } from '../../state/appState';
import { toLocalInputValue } from '../../utils/date';
import Modal from '../ui/Modal';

const QUICK_AMOUNTS = [1, 5, 10, 25];

function LogModal() {
  const { isLogModalOpen, setIsLogModalOpen, selectedTracker, logFormData, setLogFormData, handleLogSubmit } =
    useAppState();

  if (!isLogModalOpen) return null;

  const unit = selectedTracker?.unit || 'units';
  const amount = Number(logFormData.amount);
  const isAmountValid = Number.isFinite(amount) && amount !== 0;

  const setAmount = (value) => setLogFormData((previous) => ({ ...previous, amount: value }));

  return (
    <Modal
      isOpen
      onClose={() => setIsLogModalOpen(false)}
      title="Log activity"
      description={selectedTracker ? `Record progress for ${selectedTracker.name}` : undefined}
      size="sm"
    >
      <form onSubmit={handleLogSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="log-amount"
            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            Amount ({unit})
          </label>
          <input
            id="log-amount"
            type="number"
            step="any"
            required
            value={logFormData.amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-stone-50 p-3 text-base font-medium text-stone-800 outline-none focus:border-stone-400"
          />

          {/* One tap covers the common amounts; typing still works for the rest. */}
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                onClick={() => setAmount(quickAmount)}
                className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50"
              >
                {quickAmount}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="log-note" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Note <span className="normal-case tracking-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="log-note"
            type="text"
            maxLength={500}
            value={logFormData.note || ''}
            onChange={(event) => setLogFormData((previous) => ({ ...previous, note: event.target.value }))}
            placeholder="What happened?"
            className="w-full rounded-xl border border-gray-200 bg-stone-50 p-3 text-sm text-stone-800 outline-none focus:border-stone-400"
          />
        </div>

        <div>
          <label htmlFor="log-when" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            When (your local time)
          </label>
          <input
            id="log-when"
            type="datetime-local"
            required
            value={toLocalInputValue(logFormData.timestamp)}
            onChange={(event) => {
              const parsed = new Date(event.target.value);
              setLogFormData((previous) => ({
                ...previous,
                timestamp: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
              }));
            }}
            className="w-full rounded-xl border border-gray-200 bg-stone-50 p-3 text-base font-medium text-stone-800 outline-none focus:border-stone-400"
          />
          <button
            type="button"
            onClick={() => setLogFormData((previous) => ({ ...previous, timestamp: new Date().toISOString() }))}
            className="mt-2 text-xs font-medium text-stone-500 hover:text-stone-800"
          >
            Set to now
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setIsLogModalOpen(false)}
            className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isAmountValid}
            className="rounded-xl bg-stone-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default LogModal;
