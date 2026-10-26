/**
 * Theme switching. Default is "system" (prefers-color-scheme); a stored
 * choice sets [data-theme] on <html>. Call applyTheme(getStoredTheme())
 * as early as possible (ideally an inline script in index.html, see README)
 * to avoid a light→dark flash.
 */
import type { ThemeName } from './types';

const KEY = 'qj-theme';

export function getStoredTheme(): ThemeName {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: ThemeName, persist = true): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // keep the browser chrome (PWA status bar) in sync
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark =
      theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#15120e' : '#f3ead6');
  }
  if (persist) {
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: ignore */
    }
  }
}
