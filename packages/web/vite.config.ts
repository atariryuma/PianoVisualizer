import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Phase 0b.3 (complete as of 2026-05-06): packages/web is the production
// entry. The repo-root 3-file shell has been retired; legacy-app.js now
// lives under src/ and is dynamically imported by main.ts after Tone /
// OSMD / JSZip / @piano/core get pinned to globalThis. Migrating the
// per-call-site references off `globalThis` is Phase 0c TypeScript work.
//
// `--mode mobile` strips the service worker registration for Capacitor
// builds — SW lifecycle + WebView reload semantics don't mix well. The
// Capacitor wrapper reads `webDir: "dist"` from packages/mobile.

export default defineConfig(({ mode }) => ({
  root: __dirname,
  publicDir: 'public',
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
            manifest: {
              name: 'Piano Visualizer',
              short_name: 'PianoViz',
              description: 'Real-time piano visualizer for upper-elementary children',
              start_url: './',
              scope: './',
              display: 'standalone',
              background_color: '#0a0a14',
              theme_color: '#6a5acd',
              orientation: 'any',
              icons: [
                {
                  src: 'icon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,mxl,xml,json}'],
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
