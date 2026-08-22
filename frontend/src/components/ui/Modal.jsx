import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl'
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog shell.
 *
 * Each modal used to hand-roll its own overlay, which meant none of them
 * closed on Escape, none trapped focus, and none restored focus on close.
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
  const contentRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Callers pass inline arrow functions, so these identities change on every
  // render. Reading them through refs keeps the setup effect below dependent
  // on `isOpen` alone — when it also depended on `onClose`, every keystroke
  // re-ran it and yanked focus out of whatever field was being typed into.
  const onCloseRef = useRef(onClose);
  const initialFocusTargetRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusTargetRef.current = initialFocusRef;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      // Keep Tab inside the dialog so keyboard users cannot wander into the
      // inert page behind the overlay.
      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement
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

    // Prefer a real field inside the body over the header's close button,
    // which is simply the first focusable element in DOM order.
    const focusTarget =
      initialFocusTargetRef.current?.current ||
      contentRef.current?.querySelector(FOCUSABLE) ||
      panelRef.current?.querySelector(FOCUSABLE);
    focusTarget?.focus?.();

    const restoreFocusTo = previouslyFocusedRef.current;

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo?.focus?.();
    };
  }, [isOpen]);

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

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
          {children}
        </div>

        {footer && <div className="border-t border-gray-100 px-5 py-4 md:px-7">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
