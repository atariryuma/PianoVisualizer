import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// `--mode mobile` strips the service worker registration for Capacitor builds —
// SW lifecycle and WebView reload semantics don't mix well (vite-pwa FAQ).
// Capacitor reads `webDir: "dist"` from packages/mobile/capacitor.config.ts.
export default defineConfig(({ mode }) => ({
  root: __dirname,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: mode !== 'production',
    rollupOptions: {
      output: {
        // Cache-bust on web; harmless on Capacitor (capacitor:// has no HTTP cache).
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          // Split heavy libs into their own chunk so the entry stays small.
          // OSMD is the largest (~1.5MB minified) — keep it on a separate
          // chunk so dynamic-import in practice mode actually loads it lazily.
          osmd: ['opensheetmusicdisplay'],
          tone: ['tone'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 8443,
  },
  plugins: [
    // Skip SW entirely on Capacitor builds.
    ...(mode === 'mobile'
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
