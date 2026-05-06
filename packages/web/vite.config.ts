import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Phase 0b.3 dual-build (Stage 1A): Vite is rooted at packages/web/. The
// shell's index.html replaces the legacy CDN <script> tags + dist-legacy
// IIFE bundle with a single <script type="module" src="/src/main.ts"> —
// main.ts imports tone / opensheetmusicdisplay / jszip / @piano/core from
// npm, seeds them as globals (so the still-vanilla app.js keeps working
// unchanged), and dynamically imports the legacy app.js for side effects.
//
// The repo-root 3-file shell stays authoritative until iPad testing of
// dist/ confirms behavior parity. Then Stage 1B retires the root files
// and switches https_server.ps1 to serve packages/web/dist/.
//
// `--mode mobile` strips the service worker registration for Capacitor
// builds — SW lifecycle + WebView reload semantics don't mix well. The
// Capacitor wrapper reads `webDir: "dist"` from packages/mobile.
const REPO_ROOT = path.resolve(__dirname, '../..');

// Mirror the legacy shell's static files (app.css, manifest.json, icon.svg,
// assets/) into dist/ at build time + serve them in dev. This keeps the
// repo-root files as the single source of truth — no checked-in duplicates
// under packages/web/public/ that would drift from root.
const ROOT_STATIC_FILES = ['app.css', 'manifest.json', 'icon.svg'] as const;
const ROOT_STATIC_DIRS = ['assets'] as const;

const copyLegacyStatic = (): Plugin => ({
  name: 'piano-copy-legacy-static',
  apply: 'build',
  closeBundle() {
    const out = path.resolve(__dirname, 'dist');
    for (const f of ROOT_STATIC_FILES) {
      const src = path.resolve(REPO_ROOT, f);
      if (existsSync(src)) cpSync(src, path.join(out, f));
    }
    for (const d of ROOT_STATIC_DIRS) {
      const src = path.resolve(REPO_ROOT, d);
      if (existsSync(src)) cpSync(src, path.join(out, d), { recursive: true });
    }
  },
  // Dev-server static serving is intentionally skipped here; the
  // primary use case for Stage 1A is the BUILD output served via
  // https_server.ps1. `pnpm dev` would 404 on app.css / assets/* until
  // Stage 1B; that's acceptable since dev iteration still happens
  // against the legacy 3-file shell at the repo root.
});

export default defineConfig(({ mode }) => ({
  root: __dirname,
  // No checked-in publicDir — copyLegacyStatic() handles dist/ population
  // from the authoritative repo-root files.
  publicDir: false,
  resolve: {
    alias: {
      // The legacy app.js lives at the repo root during the transition.
      // main.ts does `await import('@legacy/app.js')` so the Vite bundler
      // can statically resolve it from anywhere in the dep graph.
      '@legacy': REPO_ROOT,
    },
  },
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
  },
  server: {
    host: true,
    port: 8443,
    fs: {
      // Allow vite dev to read the legacy app.js from the repo root.
      allow: [REPO_ROOT],
    },
  },
  plugins: [
    copyLegacyStatic(),
    // Skip SW entirely on Capacitor builds. For Stage 1A web builds we
    // also skip — the legacy sw.js at repo root is the authoritative
    // service worker until Stage 1B reconciles VitePWA's cache list.
    ...(mode === 'mobile' || mode === 'production'
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg', 'assets/*.mxl', 'assets/*.xml'],
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
