# @piano/web

PWA shell for Piano Visualizer. Targets desktop browsers + Android Chrome (PWA
install). iOS users get a working but mic-only experience here; the full MIDI
experience lives in `@piano/mobile` (native CoreMIDI plugin).

## Status

**Production entry.** Phase 0e retired `legacy-app.js`; the app now boots from
`src/main.ts` into `src/shell-bootstrap.ts`, which wires typed shell modules.

## Build

```bash
pnpm --filter @piano/web dev          # vite dev server, port 8443
pnpm --filter @piano/web build        # → packages/web/dist/
pnpm --filter @piano/web preview
```

The build output (`dist/`) is what Capacitor picks up via
`packages/mobile/capacitor.config.ts → webDir`.

## Runtime shape

- `src/main.ts` imports Tone / OSMD / JSZip / `@piano/core`, keeps them on
  `globalThis` for console diagnostics, clears stale pre-Vite caches, and calls
  `ShellBootstrap.boot()`.
- `src/shell-bootstrap.ts` is the only high-level composition point. It creates
  shared state, DOM bags, modal routing, shell factories, dev-mode hooks, and
  the start buttons.
- `src/app.css` is Vite-managed CSS. `public/manifest.json`, `public/icon.svg`,
  and `public/assets/*` are copied as static assets.

## SW behavior

- Web build: vite-plugin-pwa registers a SW with autoUpdate, jsdelivr.net cached
- Mobile build (`vite build --mode mobile`): SW completely stripped (Capacitor
  WebView + SW lifecycle = bad combo per vite-pwa FAQ)
