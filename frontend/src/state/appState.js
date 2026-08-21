import { createContext, useContext } from 'react';

/**
 * Held in its own module so that `AppStateProvider.jsx` exports a component and
 * nothing else, which is what React Fast Refresh needs to hot-reload it.
 */
export const AppStateContext = createContext(null);

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}
