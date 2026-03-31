// ============================================================
// Domnotate — Theme Toggle
// ============================================================

const STORAGE_KEY = 'domnotate-theme';

export type Theme = 'light' | 'dark' | 'system';

/** Read stored preference, default to 'system'. */
export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'system';
}

/** Apply the theme to the document root. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

/** Initialize theme on page load. */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}
