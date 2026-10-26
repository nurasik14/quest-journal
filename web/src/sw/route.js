// @ts-check
/**
 * Fetch routing for the service worker (architect-AC11, designer-AC19/AC20, psychologist-AC15). Pure: the
 * worker and the unit tests share it. The build plugin (vite.config.ts) inlines this file into /sw.js.
 *
 * - "network":     /api/* and anything not same-origin or not GET. NEVER stored, NEVER served from a cache:
 *                  a stale balance or a stale day is worse than "offline".
 * - "shell":       page navigations: network first, the cached index.html when offline OR when the network takes
 *                  longer than NAV_TIMEOUT_MS (H1 #273: a sleeping PC over Tailscale hangs instead of failing).
 * - "precache":    hashed /assets/* (immutable): cache-first from the install-time precache.
 * - "runtime":     decor, stickers, icons: cache-first, filled on first use. Never precached: stickers and photos
 *                  are gitignored, so a 404 must not fail the install.
 *
 * @param {{ url: string, method: string, mode: string }} req
 * @param {string} origin  the worker's own origin (self.location.origin)
 * @returns {"network" | "shell" | "precache" | "runtime"}
 */
export function routeFor(req, origin) {
  if (req.method !== "GET") return "network";
  let u;
  try {
    u = new URL(req.url);
  } catch {
    return "network";
  }
  if (u.origin !== origin) return "network";
  const p = u.pathname;
  if (p === "/api" || p.startsWith("/api/")) return "network";
  if (p === "/sw.js") return "network";
  if (req.mode === "navigate") return "shell";
  if (p.startsWith("/assets/")) return "precache";
  if (p.startsWith("/decor/") || p.startsWith("/stickers/") || p.startsWith("/icons/") || p === "/manifest.webmanifest") return "runtime";
  return "network";
}

/** Cache names carry the build version, so `activate` can drop every older cache. */
export function cacheNames(version) {
  return { shell: `qj-shell-${version}`, runtime: `qj-runtime-${version}` };
}

/** Caches from older builds (anything of ours not named for this version). */
export function staleCaches(keys, version) {
  const keep = Object.values(cacheNames(version));
  return keys.filter((k) => k.startsWith("qj-") && !keep.includes(k));
}

/** How long a page navigation waits for the laptop before the cached shell is shown (PROVISIONAL, H1 #273). */
export const NAV_TIMEOUT_MS = 3000;

/**
 * Network first, but never longer than `ms`: resolves with the network's answer when it arrives in time, otherwise
 * (or when the network rejects) with `fallback()`. If the fallback has nothing (`null`/`undefined`), it waits for
 * the network after all, so a first visit with an empty cache still loads when the laptop is merely slow.
 * Pure apart from the injected timer, so it is unit-tested with fake timers.
 *
 * @template T
 * @param {Promise<T>} network
 * @param {number} ms
 * @param {() => Promise<T | null | undefined>} fallback
 * @param {{ setTimeout: (fn: () => void, ms: number) => unknown, clearTimeout: (id: unknown) => void }} [timers]
 * @returns {Promise<T>}
 */
export function raceTimeout(network, ms, fallback, timers = { setTimeout: (fn, t) => setTimeout(fn, t), clearTimeout: (id) => clearTimeout(/** @type {any} */ (id)) }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let usedFallback = false;
    const useFallback = (/** @type {unknown} */ err) => {
      if (settled || usedFallback) return;
      usedFallback = true;
      fallback().then(
        (r) => {
          if (settled) return;
          if (r !== null && r !== undefined) {
            settled = true;
            resolve(r);
          } else if (err !== undefined) {
            settled = true;
            reject(err);
          } else {
            usedFallback = false; // nothing cached: keep waiting for the network
          }
        },
        (e) => {
          if (!settled) {
            settled = true;
            reject(e);
          }
        },
      );
    };
    const timer = timers.setTimeout(() => useFallback(undefined), ms);
    network.then(
      (r) => {
        timers.clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve(r);
      },
      (err) => {
        timers.clearTimeout(timer);
        if (settled) return;
        usedFallback = false;
        useFallback(err);
      },
    );
  });
}
