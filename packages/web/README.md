# @piano/web

PWA shell for Piano Visualizer. Targets desktop browsers + Android Chrome (PWA
install). iOS users get a working but mic-only experience here; the full MIDI
experience lives in `@piano/mobile` (native CoreMIDI plugin).

## Status

**Scaffold (Phase 0b in progress).** The actual app code lives in `app.js` at
the repo root; this package contains the eventual entry point + adapters.

## Build

```bash
pnpm --filter @piano/web dev          # vite dev server, port 8443
pnpm --filter @piano/web build        # → packages/web/dist/
pnpm --filter @piano/web preview
```

The build output (`dist/`) is what Capacitor picks up via
`packages/mobile/capacitor.config.ts → webDir`.

## Migration from the legacy single file

Until the migration completes, the LAN-served root files (`index.html`,
`app.css`, `app.js`) remain authoritative. To validate this package against real
users without breaking the LAN setup:

1. `pnpm --filter @piano/web dev` → http://localhost:8443
2. iPad on same LAN points at `https://<dev-host-ip>:8443` (after Vite SSL
   setup)
3. Once feature parity confirmed, delete the root `index.html` / `app.css` /
   `app.js` and update `https_server.ps1` to serve `packages/web/dist/` instead.

## SW behavior

- Web build: vite-plugin-pwa registers a SW with autoUpdate, jsdelivr.net cached
- Mobile build (`vite build --mode mobile`): SW completely stripped (Capacitor
  WebView + SW lifecycle = bad combo per vite-pwa FAQ)
