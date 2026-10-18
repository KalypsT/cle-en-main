import { useEffect } from 'react';
import type { ThemeChoice } from './settings.ts';
import { useMediaQuery } from './ui/media.ts';

export type Theme = 'light' | 'dark';

/**
 * Clair, Sombre, Automatique (dark during the game's night, given by the
 * engine; light outside a game) or Selon le téléphone (docs/04, 4.2).
 */
export function resolveTheme(choice: ThemeChoice, gameNight: boolean, systemDark: boolean): Theme {
  switch (choice) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'auto':
      return gameNight ? 'dark' : 'light';
    case 'system':
      return systemDark ? 'dark' : 'light';
  }
}

/** Applies the theme to the page (CSS tokens of styles.css) and returns it. */
export function useTheme(choice: ThemeChoice, gameNight = false): Theme {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = resolveTheme(choice, gameNight, systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return theme;
}
