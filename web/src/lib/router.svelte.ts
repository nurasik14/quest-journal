/**
 * Minimal history router. Paths: / · /evening · /evening/YYYY-MM-DD · /market (alias /shop) · /archive · /profile · /onboarding.
 * The server falls back to index.html for every non-/api path, so deep links work.
 */
export type Route =
  | { name: 'today' }
  | { name: 'evening'; date: string | null }
  | { name: 'market' }
  | { name: 'archive' }
  | { name: 'profile' }
  | { name: 'onboarding' }
  | { name: 'notfound' };

export type NavId = 'today' | 'evening' | 'market' | 'archive' | 'profile';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRoute(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const [head, arg, ...rest] = parts;
  if (rest.length > 0) return { name: 'notfound' };
  switch (head) {
    case undefined:
    case 'today':
      return arg === undefined ? { name: 'today' } : { name: 'notfound' };
    case 'evening':
    case 'ledger':
      if (arg === undefined) return { name: 'evening', date: null };
      return DATE.test(arg) ? { name: 'evening', date: arg } : { name: 'notfound' };
    case 'market':
    case 'shop':
      return arg === undefined ? { name: 'market' } : { name: 'notfound' };
    case 'archive':
    case 'garden':
      return arg === undefined ? { name: 'archive' } : { name: 'notfound' };
    case 'profile':
    case 'notes':
      return arg === undefined ? { name: 'profile' } : { name: 'notfound' };
    case 'onboarding':
      return arg === undefined ? { name: 'onboarding' } : { name: 'notfound' };
    default:
      return { name: 'notfound' };
  }
}

export const NAV_PATHS: Record<NavId, string> = {
  today: '/',
  evening: '/evening',
  market: '/market',
  archive: '/archive',
  profile: '/profile'
};

export function navIdOf(route: Route): NavId | null {
  if (route.name === 'notfound') return null;
  if (route.name === 'onboarding') return 'profile';
  return route.name;
}

class Router {
  route = $state<Route>(parseRoute(typeof location === 'undefined' ? '/' : location.pathname));
  /** Bumped on every navigation so pages can move focus to their h1. */
  seq = $state(0);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => this.sync());
    }
  }

  sync() {
    this.route = parseRoute(location.pathname);
    this.seq++;
  }

  go(path: string, replace = false) {
    if (path === location.pathname) return;
    if (replace) history.replaceState(null, '', path);
    else history.pushState(null, '', path);
    this.sync();
    window.scrollTo(0, 0);
  }
}

export const router = new Router();

/** Intercept same-origin <a href="/…"> clicks (no modifier keys, no target) for client-side navigation. */
export function linkHandler(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || a.target || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('//')) return;
  e.preventDefault();
  router.go(href);
}
