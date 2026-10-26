/**
 * Device settings (designer-AC16): theme (theme.ts), motion and stickers. Stored in localStorage and applied to
 * <html> before first paint by the inline script in index.html (keep the two in sync). Memory fallback when
 * storage is unavailable.
 */
export type MotionSetting = 'system' | 'reduce';
export type StickerSetting = 'on' | 'off';

export type CountdownSetting = 'on' | 'off';

export const MOTION_KEY = 'qj-motion';
export const COUNTDOWN_KEY = 'qj-countdown';
export const STICKERS_KEY = 'qj-stickers';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

export function getMotion(): MotionSetting {
  return read(MOTION_KEY) === 'reduce' ? 'reduce' : 'system';
}

export function applyMotion(m: MotionSetting, persist = true) {
  const root = document.documentElement;
  if (m === 'reduce') root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
  if (persist) write(MOTION_KEY, m === 'reduce' ? 'reduce' : null);
}

export function getStickers(): StickerSetting {
  return read(STICKERS_KEY) === 'off' ? 'off' : 'on';
}

export function applyStickers(s: StickerSetting, persist = true) {
  const root = document.documentElement;
  if (s === 'off') root.dataset.stickers = 'off';
  else delete root.dataset.stickers;
  if (persist) write(STICKERS_KEY, s === 'off' ? 'off' : null);
}

/** The "next page in …" line on Today (on by default; device-local, no server state). */
export function getCountdown(): CountdownSetting {
  return read(COUNTDOWN_KEY) === 'off' ? 'off' : 'on';
}

export function setCountdown(s: CountdownSetting) {
  write(COUNTDOWN_KEY, s === 'off' ? 'off' : null);
}

/**
 * Keep both media `theme-color` metas right (index.html has a light and a dark one). The theme module only
 * updates the first meta, so after a choice both are pinned to it; "system" restores the media defaults.
 */
export function syncThemeColor(theme: 'system' | 'light' | 'dark') {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  for (const m of metas) {
    const media = m.getAttribute('media') ?? '';
    if (theme === 'system') m.content = media.includes('dark') ? '#15120e' : '#f3ead6';
    else m.content = theme === 'dark' ? '#15120e' : '#f3ead6';
  }
}
