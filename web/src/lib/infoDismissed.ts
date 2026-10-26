/**
 * The dismissed Today info line (hardening H1, backlog 228; designer M5 review). ONE overwrite-only localStorage
 * key whose value is `"<logical date>:<kind>"`, so a reload the same day keeps the line hidden and the next day
 * starts fresh. It holds no journal text. DOM-free (bun-testable); memory fallback when storage is unavailable.
 */
export const INFO_KEY = 'qj.infoDismissed';

let memory: string | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getInfoDismissed(): string | null {
  try {
    // This page's own write wins: a failed setItem (quota) must not let yesterday's stored value back (H1 fix NIT-3).
    return memory ?? storage()?.getItem(INFO_KEY) ?? null;
  } catch {
    return memory;
  }
}

export function setInfoDismissed(value: string): void {
  memory = value;
  try {
    storage()?.setItem(INFO_KEY, value);
  } catch {
    /* private mode / quota: the dismissal lasts for this page only */
  }
}
