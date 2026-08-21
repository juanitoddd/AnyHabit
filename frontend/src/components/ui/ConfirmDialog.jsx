import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

/**
 * Replacement for `window.confirm`.
 *
 * Beyond looking like the rest of the app, this can require the user to type a
 * confirmation phrase — worth having when the action deletes history that no
 * amount of clicking Undo will bring back.
 */
function ConfirmDialog({ request, onResolve }) {
  const [typed, setTyped] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const inputRef = useRef(null);
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    setTyped('');
    setIsWorking(false);
  }, [request]);

  if (!request) return null;

  const {
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'danger',
    requireText = ''
  } = request;

  const canConfirm = !requireText || typed.trim() === requireText;

  const handleConfirm = async () => {
    if (!canConfirm || isWorking) return;
    setIsWorking(true);
    await onResolve(true);
  };

  return (
    <Modal isOpen onClose={() => onResolve(false)} size="sm" initialFocusRef={requireText ? inputRef : confirmButtonRef}>
      <div className="flex gap-4">
        <span
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-stone-100 text-stone-600'
          }`}
        >
          <AlertTriangle size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-stone-900">{title}</h2>
          {message && <p className="mt-2 text-sm leading-6 text-gray-600">{message}</p>}

          {requireText && (
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Type <span className="font-mono text-stone-900">{requireText}</span> to confirm
              </span>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleConfirm();
                }}
                className="w-full rounded-xl border border-gray-200 bg-stone-50 p-2.5 text-sm outline-none focus:border-stone-400"
                autoComplete="off"
              />
            </label>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onResolve(false)}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50"
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmButtonRef}
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || isWorking}
          className={`rounded-xl px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-stone-900 hover:bg-stone-800'
          }`}
        >
          {isWorking ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
