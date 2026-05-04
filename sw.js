// Service worker — offline-friendly cache.
//   Network-first for the HTML shell so source updates ship without users having
//   to manually clear storage. Cache-first for immutable assets (CDN libs,
//   scores, icon).

const CACHE = 'piano-viz-v1';
const APP_SHELL = [
  './',
  './piano-visualizer.html',
  './manifest.json',
  './icon.svg',
  './assets/fur_elise.mxl',
  './assets/fur_elise.xml',
  './assets/alla_turca.mxl',
  './assets/alla_turca.xml',
  'https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js',
  'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.8.7/build/opensheetmusicdisplay.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(APP_SHELL.map((u) => c.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function putInCache(req, resp) {
  if (!resp || resp.status !== 200 || resp.type === 'opaque') return;
  const clone = resp.clone();
  caches.open(CACHE).then((c) => {
    try { c.put(req, clone); } catch (_) { /* ignore */ }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname === '/log') return;

  // HTML shell — network-first so updates ship immediately when reachable.
  const isShell = url.origin === self.location.origin && (
    url.pathname === '/' ||
    url.pathname.endsWith('/piano-visualizer.html') ||
    url.pathname.endsWith('/manifest.json') ||
    req.mode === 'navigate'
  );

  if (isShell) {
    e.respondWith(
      fetch(req)
        .then((resp) => { putInCache(req, resp); return resp; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else — cache-first with background refresh.
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((resp) => { putInCache(req, resp); return resp; })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
