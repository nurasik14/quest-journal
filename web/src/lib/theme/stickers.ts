/**
 * Sticker manifest loading + deterministic picking.
 * The manifest is fetched once per URL and cached. If it is missing or
 * malformed, DEFAULT_MANIFEST (fallback SVGs only) is used, so the UI
 * never breaks on a fresh clone where the gitignored stickers are absent.
 */
import { assetBase } from './assets';
import type { StickerEntry, StickerEvent, StickerManifest } from './types';
import { STICKER_FALLBACK } from './vocab';

export const DEFAULT_MANIFEST: StickerManifest = {
  version: 1,
  base: '/stickers/',
  pick: 'seeded',
  events: Object.fromEntries(
    (Object.keys(STICKER_FALLBACK) as StickerEvent[]).map((e) => [e, { files: [], fallback: STICKER_FALLBACK[e] }])
  )
};

const cache = new Map<string, Promise<StickerManifest>>();

function isEntry(v: unknown): v is StickerEntry {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.files) && o.files.every((f) => typeof f === 'string') && typeof o.fallback === 'string';
}

export function loadStickerManifest(url = `${assetBase()}stickers/manifest.json`): Promise<StickerManifest> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw: unknown) => {
        const m = raw as Partial<StickerManifest>;
        const events: StickerManifest['events'] = { ...DEFAULT_MANIFEST.events };
        for (const [k, v] of Object.entries(m.events ?? {})) if (isEntry(v)) events[k] = v;
        return {
          version: typeof m.version === 'number' ? m.version : 1,
          base: typeof m.base === 'string' ? m.base : '/stickers/',
          pick: m.pick ?? 'seeded',
          events
        } satisfies StickerManifest;
      })
      .catch(() => DEFAULT_MANIFEST);
    cache.set(url, p);
  }
  return p;
}

/** FNV-1a: tiny, stable string hash */
export function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Order the candidate files: the picked one first, the rest after it (used
 * as successive fallbacks if an image fails to load).
 */
export function orderStickerFiles(
  files: readonly string[],
  seed: string | number,
  pick: StickerManifest['pick'] = 'seeded'
): string[] {
  if (files.length <= 1 || pick === 'first') return [...files];
  const start = pick === 'random' ? Math.floor(Math.random() * files.length) : hashSeed(seed) % files.length;
  return files.map((_, i) => files[(start + i) % files.length]);
}
