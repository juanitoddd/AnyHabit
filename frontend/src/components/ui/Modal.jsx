import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl'
};

/**
 * Shared dialog shell.
 *
 * Each modal used to hand-roll its own overlay, which meant none of them
 * closed on Escape, none trapped focus, and none restored focus on close.
 * Centralising it fixes all of them at once.
 */
function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'lg',
  closeOnBackdrop = true,
  initialFocusRef
}) {
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      // Keep Tab inside the dialog so keyboard users cannot wander into the
      // inert page behind the overlay.
      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    // Stop the page behind the dialog from scrolling under the overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget =
      initialFocusRef?.current ||
      panelRef.current?.querySelector('input:not([type="hidden"]), textarea, select, button');
    focusTarget?.focus?.();

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose, initialFocusRef]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/25 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`app-modal-card flex max-h-[90vh] w-full ${SIZES[size] || SIZES.lg} flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl`}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 md:px-7 md:py-5">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-bold text-stone-900 md:text-xl">{title}</h2>}
              {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-gray-400 transition-colors hover:bg-stone-50 hover:text-stone-900"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">{children}</div>

        {footer && <div className="border-t border-gray-100 px-5 py-4 md:px-7">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
