/** Light / dark theme selection, persisted in localStorage. */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'molecular-viewer-theme';

/** 3Dmol viewer background for each theme. */
export const VIEWER_BACKGROUND: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0f1720',
};

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** A saved choice wins; otherwise follow the operating-system preference. */
export function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // localStorage can throw (private mode, blocked cookies); fall through.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Reflect the theme on <html> for CSS. Does not save it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Remember an explicit choice. Only called when the user flips the switch, so
 * a visitor who never touches it keeps following their OS setting.
 */
export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not being able to persist is fine; the theme still applies this session.
  }
}
