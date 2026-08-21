import { useEffect, useRef } from 'react';

/**
 * Close menus when a click lands outside them.
 *
 * The handler list is kept in a ref, updated from an effect, so callers can
 * pass a freshly built array on every render without re-binding the document
 * listener each time — which is what the previous version did.
 */
export function useOutsideClick(refsWithHandlers) {
  const handlersRef = useRef(refsWithHandlers);

  useEffect(() => {
    handlersRef.current = refsWithHandlers;
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      handlersRef.current.forEach(({ ref, onOutsideClick }) => {
        if (ref?.current && !ref.current.contains(event.target)) {
          onOutsideClick();
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
}
