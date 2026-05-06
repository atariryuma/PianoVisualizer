// Service worker — offline-friendly cache.
//   Network-first for the HTML shell so source updates ship without users having
//   to manually clear storage. Cache-first for immutable assets (CDN libs,
//   scores, icon).
//
// 2026-05-05: bumped to v2 after splitting the monolith into index.html +
// app.css + app.js. Old v1 cache is purged on activate so no clients see
// the stale piano-visualizer.html monolith.
// 2026-05-05 (Phase 0b.3): bumped to v3 after wiring @piano/core's IIFE
// bundle into index.html. v2 clients had no core-bundle.js so they'd 404.
// 2026-05-05: bumped to v4 + core-bundle moved to network-first. Several
// post-v3 deploys updated dist-legacy/core-bundle.js but the cache-first
// branch in fetch() kept serving stale bytes, leaving Android users on a
// pre-fix build that broke user-added song loading. v4 forces a one-time
// re-cache on activate; ongoing updates ship via the network-first path.
// 2026-05-05: bumped to v5 — deployed to GitHub Pages under /PianoVisualizer/
// subpath. Shell/log path checks now use endsWith() so the SW works on both
// `https://atariryuma.github.io/PianoVisualizer/` and the LAN root path.
// Navigation fallback added for offline launches.
// 2026-05-06: bumped to v6 — sync OSMD CDN version with index.html (was
// pre-caching @1.8.7 but the page actually loads @1.9.9, wasting bytes and
// risking a stale fallback). Also bumps to invalidate caches that picked
// up the la Campanella partial-measure timing fix in app.js.
// 2026-05-06: bumped to v7 — removed the legacy piano-visualizer.html
// redirect stub. Old shell entries cached under v6 are flushed on activate
// so a stale redirect can't shadow the canonical index.html navigation.
// 2026-05-06: bumped to v8 — fix #osmdCustomCursor disappearing after song
// switch. selectSong()'s `osmdContainer.innerHTML = ''` was wiping our
// cursor element along with the previous score. v7 clients see a frozen
// detached cursor; v8 re-attaches after the wipe and defensively in
// positionCustomCursor (isConnected guard).
// 2026-05-06: bumped to v9 — drop the custom-cursor overlay entirely.
// User feedback: the OSMD built-in wide-yellow-block + per-step jump look
// was preferred to the thin interpolated overlay. Keep the per-step
// stepTimeline (which lets OSMD's cursor advance through rests instead of
// freezing on the last note onset) but drive OSMD's own cursor directly
// — no overlay element, no interpolation, no rect capture.
// 2026-05-06: bumped to v10 — fix cursor drifting from notes on songs
// with repeats. stepTimeline was on the first-pass time domain while
// notes were expanded by playbackOrder; v10 expands stepTimeline the
// same way so both share one timeline.

const CACHE = 'piano-viz-v10';
const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './dist-legacy/core-bundle.js',
  './manifest.json',
  './icon.svg',
  './assets/fur_elise.mxl',
  './assets/fur_elise.xml',
  './assets/alla_turca.mxl',
  './assets/alla_turca.xml',
  'https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js',
  'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.9/build/opensheetmusicdisplay.min.js',
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
  // Skip the dev-time remote-log endpoint. endsWith handles both the LAN
  // root path (/log) and the GH Pages sub-path (/PianoVisualizer/log).
  if (url.pathname.endsWith('/log')) return;

  // HTML shell + CSS + JS — network-first so updates ship immediately when reachable.
  // CSS/JS join the shell here because they're effectively part of the same release
  // unit; cache-first would strand kids on a stale UI after we deploy a fix.
  // dist-legacy/core-bundle.js is part of the release surface too — the legacy
  // app.js is hard-coupled to its symbol shape, so a stale bundle paired with
  // a fresh app.js produces silent runtime errors (e.g. "PianoCore.X is not a
  // function"). Treat it as shell for the same reason CSS/JS are.
  const isShell =
    url.origin === self.location.origin &&
    (url.pathname === '/' ||
      url.pathname.endsWith('/') ||                  // GH Pages sub-path root
      url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/app.css') ||
      url.pathname.endsWith('/app.js') ||
      url.pathname.endsWith('/dist-legacy/core-bundle.js') ||
      url.pathname.endsWith('/manifest.json') ||
      req.mode === 'navigate');

  if (isShell) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          putInCache(req, resp);
          return resp;
        })
        // Offline: try the exact request, then fall back to index.html for
        // navigations so a stranded user gets the shell instead of a blank
        // browser-error page.
        .catch(() => caches.match(req).then((c) => c || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
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
