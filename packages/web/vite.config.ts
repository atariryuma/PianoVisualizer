import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { benchPlugin } from './vite-bench-plugin';

// Best-effort short SHA — `git rev-parse --short HEAD` on the build
// host. Falls back to '(dev)' if git isn't available (e.g. CI tarball
// extraction). Used by the dev-mode panel's 📋 Copy report so iPad-
// pasted bug reports pin to a specific commit.
function readGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '(dev)';
  }
}
const APP_VERSION = readGitSha();
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// Phase 0e (complete as of 2026-05-09): packages/web is the production
// entry. legacy-app.js is retired; main.ts pins vendor libraries for
// console diagnostics, then boots the typed shell via shell-bootstrap.ts.
//
// `--mode mobile` strips the service worker registration for Capacitor
// builds — SW lifecycle + WebView reload semantics don't mix well. The
// Capacitor wrapper reads `webDir: "dist"` from packages/mobile.

export default defineConfig(({ mode }) => ({
  root: __dirname,
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
    // H4: hard-disable the off-device remote-log POST path in the NATIVE
    // (App Store) build. Native ships on https://localhost, which the runtime
    // hostname heuristic false-positives, and a localStorage override could
    // otherwise force-enable POSTing — breaking the "no tracking / audio stays
    // on device" promise. The LAN-dev build (default mode, served by
    // https_server for server.log) keeps its localhost/LAN gate.
    __REMOTE_LOG_DISABLED__: JSON.stringify(mode === 'mobile'),
  },
  // Relative `./` so the same build artifact works under any base path:
  //   - `/`                       (LAN dev via https_server.ps1, Capacitor wrapper)
  //   - `/PianoVisualizer/`       (GitHub Pages project URL)
  //   - `https://anything.com/x/` (any future custom-domain or CDN host)
  // Vite emits `<script src="./assets/…">` instead of absolute `/assets/…`,
  // and `start_url: './'` / `scope: './'` in the PWA manifest already use
  // relative paths so this stays consistent across the whole shell.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: mode !== 'production',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          // Heavy libs into their own chunks so the entry stays small and
          // OSMD doesn't bloat first paint (it's only needed in practice mode).
          osmd: ['opensheetmusicdisplay'],
          tone: ['tone'],
        },
      },
    },
    // OSMD's bundled output is ~1.2 MB minified — that's a known fixed
    // cost, not a regression. Bump the warning threshold so the build
    // stays clean instead of nagging on every run.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: 8443,
  },
  plugins: [
    // Bench harness — exposes /__bench/{result,last,clear} on the dev
    // + preview servers. Pairs with dev-mode's `?webhook=URL` so a
    // headless script can drive a benchmark run end-to-end without
    // human input.
    benchPlugin(),
    // Skip SW entirely on Capacitor builds — SW + WKWebView reload don't
    // play well. For web builds during the dev/prod transition we keep
    // VitePWA generating a manifest + workbox-cached service worker,
    // covering the offline-shell behavior the legacy sw.js used to handle.
    ...(mode === 'mobile'
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            // NOTE: `includeAssets` was previously set to
            //   ['icon.svg', 'assets/*.mxl', 'assets/*.xml']
            // but those exact files are already swept up by
            // workbox.globPatterns below. The two paths build the precache
            // list independently — includeAssets emits `{ url, revision: null }`
            // entries while globPatterns emits `{ url, revision: <hash> }`
            // entries — so every overlapping file ended up registered twice
            // and Workbox threw `add-to-cache-list-conflicting-entries` on
            // SW startup. globPatterns is the right home for these (revision
            // is required for stable URLs to invalidate correctly).
            // G16 (2026-07-25): DO NOT generate a manifest here. The app ships a
            // hand-written public/manifest.json linked from index.html; VitePWA
            // used to also emit manifest.webmanifest + inject a second
            // <link rel=manifest>. Per spec only the FIRST link wins, so the
            // generated one was dead weight and the two disagreed on
            // display/lang/description. `manifest: false` keeps the hand-written
            // one as the single source of truth (VitePWA still builds the SW).
            manifest: false,
            workbox: {
              // `musicxml` is NOT covered by `xml` — a glob alternative is a
              // literal suffix, and "…arabesque.musicxml" does not end in
              // ".xml". Leaving it out silently excluded 36 of the 58 library
              // scores from the precache: every one of our own transcriptions
              // and every OpenScore Lied (the 22 musetrainer files are .mxl, so
              // only those were ever cached). They still LOADED — an uncached
              // request just goes to the network — so the gap was invisible
              // online and only bit offline, which is exactly when a practice
              // app on an iPad at a piano needs them. It also made a freshly
              // added score look like it "didn't ship" until the SW rotated.
              globPatterns: ['**/*.{js,css,html,svg,mxl,xml,musicxml,json}'],
              // Bump the per-file cache cap for the OSMD chunk (~1.2 MB).
              maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
              // Phase 0b.3 follow-up: takeover semantics for users still
              // running the retired pre-Vite legacy sw.js.
              //   - skipWaiting    : new SW activates without waiting for
              //                      every tab to close.
              //   - clientsClaim   : the active SW immediately controls
              //                      open tabs (so the next request goes
              //                      through the new fetch handler).
              //   - cleanupOutdatedCaches: drop Workbox precache versions
              //                      from previous builds; pairs with
              //                      main.ts's legacy-cache cleanup that
              //                      handles the hand-rolled pianoViz_*
              //                      caches the old sw.js created.
              skipWaiting: true,
              clientsClaim: true,
              cleanupOutdatedCaches: true,
              runtimeCaching: [
                {
                  urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*$/,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'jsdelivr-cache',
                    expiration: { maxAgeSeconds: 30 * 24 * 60 * 60 },
                  },
                },
              ],
            },
          }),
        ]),
  ],
}));
