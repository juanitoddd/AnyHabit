import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'anyhabit-theme';
const THEMES = ['light', 'dark', 'system'];

const readStoredTheme = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    // Private browsing and blocked site data both throw here.
    return 'system';
  }
};

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    readStoredTheme() === 'system' ? (prefersDark() ? 'dark' : 'light') : readStoredTheme()
  );

  const setTheme = useCallback((next) => {
    const value = THEMES.includes(next) ? next : 'system';
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Preference simply will not persist; the session still honours it.
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');

    const apply = () => {
      const resolved = theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme;
      setResolvedTheme(resolved);

      // The class lives on <html> rather than the app shell so that screens
      // rendered outside it — the sign-in page above all — are themed too.
      document.documentElement.classList.toggle('theme-dark', resolved === 'dark');
      document.documentElement.style.colorScheme = resolved;
    };

    apply();

    if (theme !== 'system' || !media?.addEventListener) return undefined;

    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return { theme, resolvedTheme, setTheme };
}
