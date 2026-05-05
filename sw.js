// Service worker — offline-friendly cache.
//   Network-first for the HTML shell so source updates ship without users having
//   to manually clear storage. Cache-first for immutable assets (CDN libs,
//   scores, icon).
//
// 2026-05-05: bumped to v2 after splitting the monolith into index.html +
// app.css + app.js. Old v1 cache is purged on activate so no clients see
// the stale piano-visualizer.html monolith.

const CACHE = 'piano-viz-v2';
const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './assets/fur_elise.mxl',
  './assets/fur_elise.xml',
  './assets/alla_turca.mxl',
  './assets/alla_turca.xml',
  'https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js',
  'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.8.7/build/opensheetmusicdisplay.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(APP_SHELL.map((u) => c.add(u).catch(() => null))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function putInCache(req, resp) {
  if (!resp || resp.status !== 200 || resp.type === 'opaque') return;
  const clone = resp.clone();
  caches.open(CACHE).then((c) => {
    try {
      c.put(req, clone);
    } catch (_) {
      /* ignore */
    }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname === '/log') return;

  // HTML shell + CSS + JS — network-first so updates ship immediately when reachable.
  // CSS/JS join the shell here because they're effectively part of the same release
  // unit; cache-first would strand kids on a stale UI after we deploy a fix.
  const isShell =
    url.origin === self.location.origin &&
    (url.pathname === '/' ||
      url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/piano-visualizer.html') ||
      url.pathname.endsWith('/app.css') ||
      url.pathname.endsWith('/app.js') ||
      url.pathname.endsWith('/manifest.json') ||
      req.mode === 'navigate');

  if (isShell) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          putInCache(req, resp);
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else — cache-first with background refresh.
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((resp) => {
          putInCache(req, resp);
          return resp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
