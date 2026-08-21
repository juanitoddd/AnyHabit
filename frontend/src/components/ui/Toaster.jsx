import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const TONE_STYLES = {
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600'
  },
  error: {
    container: 'border-rose-200 bg-rose-50 text-rose-900',
    icon: AlertCircle,
    iconClass: 'text-rose-600'
  },
  info: {
    container: 'border-stone-200 bg-white text-stone-800',
    icon: Info,
    iconClass: 'text-stone-500'
  }
};

function Toaster({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-center gap-2 px-4"
      // Screen readers announce these without stealing focus from the page.
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const tone = TONE_STYLES[toast.tone] || TONE_STYLES.info;
        const Icon = tone.icon;

        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`app-toast pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${tone.container}`}
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${tone.iconClass}`} />
            <p className="flex-1 leading-6 break-words">{toast.text}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default Toaster;
