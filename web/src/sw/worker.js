// The service worker body. The build prepends `const VERSION`, `const PRECACHE` and the contents of route.js.
/* global VERSION, PRECACHE, routeFor, cacheNames, staleCaches, raceTimeout, NAV_TIMEOUT_MS */
const NAMES = cacheNames(VERSION);

self.addEventListener("install", (event) => {
  // The shell (index.html + hashed assets) only. Decor/stickers are runtime-cached (designer-AC20).
  event.waitUntil(caches.open(NAMES.shell).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(staleCaches(keys, VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for the update to take over only when the user taps "Reload" (no auto-reload).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const route = routeFor({ url: req.url, method: req.method, mode: req.mode }, self.location.origin);
  if (route === "network") return; // the browser's own fetch: never cached, never served from a cache
  if (route === "shell") {
    // Network first, but a laptop that doesn't answer within NAV_TIMEOUT_MS gets the cached shell (H1 #273); the
    // shell then shows the offline card. With no cached shell it keeps waiting for the network.
    const shell = () => caches.open(NAMES.shell).then((c) => c.match("/index.html"));
    event.respondWith(raceTimeout(fetch(req), NAV_TIMEOUT_MS, shell).catch(() => shell().then((r) => r || Response.error())));
    return;
  }
  const name = route === "precache" ? NAMES.shell : NAMES.runtime;
  event.respondWith(
    caches.open(name).then((c) =>
      c.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === "basic") void c.put(req, res.clone());
            return res;
          }),
      ),
    ),
  );
});
