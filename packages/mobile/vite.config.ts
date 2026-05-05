import { defineConfig } from 'vite';

// Mobile build is a stripped-down web build: no PWA service worker, no
// hashed asset names (Capacitor serves from capacitor:// — no HTTP cache to bust),
// outputs to ./dist which Capacitor's `webDir` points at.

export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Predictable filenames so Xcode/Gradle pipelines don't churn on every build.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks: {
          osmd: ['opensheetmusicdisplay'],
          tone: ['tone'],
        },
      },
    },
  },
});
