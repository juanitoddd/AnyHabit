import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 8000;
const MAX_VISIBLE = 4;

let nextToastId = 0;

/**
 * Transient notifications.
 *
 * Before this, every failed request was swallowed into `console.error` and the
 * user simply saw nothing happen. Errors now surface where they can be read.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (message, { tone = 'info', duration } = {}) => {
      const text = typeof message === 'string' ? message : message?.message || 'Something went wrong';
      const id = ++nextToastId;
      const life = duration ?? (tone === 'error' ? ERROR_DURATION : DEFAULT_DURATION);

      // Keep the stack short so a burst of failures cannot bury the screen.
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, text, tone }]);

      if (life > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismissToast(id), life)
        );
      }
      return id;
    },
    [dismissToast]
  );

  // Clear pending timers so a toast cannot fire after unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const notify = useMemo(
    () => ({
      success: (message, options) => pushToast(message, { ...options, tone: 'success' }),
      error: (message, options) => pushToast(message, { ...options, tone: 'error' }),
      info: (message, options) => pushToast(message, { ...options, tone: 'info' })
    }),
    [pushToast]
  );

  return { toasts, dismissToast, notify };
}
