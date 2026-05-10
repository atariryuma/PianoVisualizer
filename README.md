# Piano Visualizer

Real-time piano visualizer for upper-elementary children. Plays beautifully on
iPad with mic input or a USB / Bluetooth MIDI keyboard.

> Vite + pnpm monorepo. Capacitor 6 wrapper for iOS + Android in progress.

## Features

- **Real-time piano detection** — YIN pitch detection + multi-feature onset
  gate + harmonicity check (rejects voice / clatter)
- **Polyphonic MIDI support** — USB + BLE-MIDI on Chrome / Edge / Steam Deck;
  iOS via Web MIDI Browser (third-party app) or the upcoming native build
- **Practice mode** — 2 bundled pieces (Für Elise, Turkish March) + user-addable
  library from any public-domain MusicXML source
- **Bilingual** — English + Japanese
- **Kid-safe by design** — zero data collection, no ads, no IAP, no accounts

## Quick start (web, dev)

```bash
pnpm install

# One-time: install mkcert (https://github.com/FiloSottile/mkcert)
scoop install mkcert         # or: choco install mkcert

# Generate trusted dev certs (mic + Service Worker both require HTTPS):
powershell -File gen_cert.ps1
# → cert.pfx (server) + rootCA.cer (iPad/Android trust)

# Build + serve the web shell on port 8443:
pnpm serve

# Or run them separately:
pnpm build:web                 # → packages/web/dist/
powershell -File https_server.ps1

# Open in your browser:
# https://localhost:8443
# or from iPad: https://<host-ip>:8443
```

iPad needs `rootCA.cer` installed once as a trusted profile — see
[`CLAUDE.md`](CLAUDE.md) for the walkthrough.

## Project layout

```
.
├── packages/               ← Source of truth
│   ├── core/               ← Pure-TS engine (35 modules, 680 tests)
│   ├── web/                ← ★ Vite PWA shell — production entry
│   │   ├── index.html
│   │   ├── public/         ← manifest + icon + bundled scores
│   │   └── src/
│   │       ├── app.css     ← Vite-managed stylesheet
│   │       ├── main.ts     ← Module entry — pins vendor globals, boots shell
│   │       └── shell-*.ts  ← Typed web shell modules (Phase 0e complete)
│   ├── mobile/             ← Capacitor 6 wrapper
│   └── plugins/
│       └── capacitor-piano-midi/  ← Native MIDI plugin (Swift + Kotlin)
│
├── gen_cert.ps1            ← mkcert wrapper: cert.pfx + rootCA.cer
├── https_server.ps1        ← PowerShell HTTPS server (port 8443)
└── docs/                   ← Privacy / compliance / score licenses
```

## Roadmap

- [x] **Phase 0a**: split 9000-line monolith into 3-file HTML/CSS/JS shell —
      _2026-05-05_
- [x] **Phase 0b extraction**: move engine into `packages/core/` modules — 35
      modules, 680 tests — _2026-05-06_
- [x] **Phase 0b.3**: dual-build wire-up — `packages/web` is the production
      entry, legacy 3-file shell retired — _2026-05-06_
- [x] **Phase 0c–0e**: TypeScript migration and retirement of `legacy-app.js` —
      _2026-05-09_
- [ ] **Phase 1**: `npx cap add ios && npx cap add android` + first installable
      build
- [ ] **Phase 2a**: Validate `capacitor-piano-midi` against real iOS hardware
- [ ] **Phase 2b**: Same on Android
- [ ] **Phase 3**: Privacy manifest + 5.2.3 evidence collection (CDN deps are
      already npm-bundled via Vite)
- [ ] **Phase 4**: App Store + Play Store submission

See [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the submission checklist.

## License

Code: MIT — see [`LICENSE`](LICENSE).

Bundled music: public domain. See [`docs/LICENSES/`](docs/LICENSES/).
