/**
 * Service-worker registration (architect-AC12, designer-AC19, psychologist-AC14).
 * - Production build only (never in Vite dev, so HMR modules are never pinned).
 * - Only in a secure context (HTTPS via `tailscale serve`, or localhost). Over plain http://<ip> this is a
 *   silent no-op: the app works fully without a worker and shows no error.
 * - A waiting update shows ONE quiet toast "A fresh page is ready" + Reload. It never reloads by itself, so a
 *   dirty Evening/Notes draft can't be wiped.
 * - No push, notifications, badges or periodic sync, by design.
 */
import { COPY } from './copy';
import { shouldRegister, type SwEnv } from './pwaRules';
import { showToast } from './toast.svelte';

export function registerServiceWorker(): void {
  const env: SwEnv = {
    prod: import.meta.env.PROD,
    secure: typeof window !== 'undefined' && window.isSecureContext === true,
    hasSw: typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  };
  if (!shouldRegister(env)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(
      (reg) => {
        const offer = (w: ServiceWorker) => {
          showToast(COPY.freshPage, 30_000, {
            label: COPY.reload,
            run: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
              w.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            // Only an UPDATE (an old worker controls the page) is offered; the very first install is silent.
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
      },
      (e) => console.warn('[pwa] service worker not registered', e)
    );
  });
}
