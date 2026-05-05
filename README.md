# Piano Visualizer

Real-time piano visualizer for upper-elementary children. Plays beautifully on
iPad with mic input or a USB / Bluetooth MIDI keyboard.

> Single-file vanilla-JS PWA today. Capacitor 6 monorepo (iOS + Android + web)
> in progress.

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
# Generate self-signed certs for HTTPS (mic requires HTTPS):
powershell -File gen_cert.ps1

# Start the LAN HTTPS server (port 8443):
powershell -File https_server.ps1

# Open in your browser:
# https://localhost:8443
# or from iPad: https://<host-ip>:8443
```

iPad needs the cert installed as a trusted profile — see
[`CLAUDE.md`](CLAUDE.md) for the walkthrough.

## Project layout

This repo is mid-migration from a single-file PWA to a Vite + Capacitor
monorepo. **The single-file build (`index.html` + `app.css` + `app.js`) is
authoritative for now.**

```
.                           ← Authoritative web app (PWA, LAN-served)
├── index.html
├── app.css
├── app.js
├── sw.js
├── manifest.json
├── assets/                 ← Bundled MusicXML scores
│
├── packages/               ← Migration target (Phase 0/1/2 in progress)
│   ├── core/               ← Pure-TS engine
│   ├── web/                ← Vite PWA shell
│   ├── mobile/             ← Capacitor wrapper
│   └── plugins/
│       └── capacitor-piano-midi/  ← Native MIDI plugin
│
└── docs/                   ← Privacy / compliance / score licenses
```

## Roadmap

- [x] **Phase 0a**: 3-file split (HTML/CSS/JS) — _2026-05-05_
- [x] **Phase 0b setup**: monorepo scaffold + perf tier + AudioContext fixes —
      _2026-05-05_
- [ ] **Phase 0b extraction**: move engine into `packages/core/` modules
- [ ] **Phase 0c**: TypeScript migration (incremental, JSDoc-first)
- [ ] **Phase 1**: `npx cap add ios && npx cap add android` + first installable
      build
- [ ] **Phase 2a**: Validate `capacitor-piano-midi` against real iOS hardware
- [ ] **Phase 2b**: Same on Android
- [ ] **Phase 3**: CDN bundle removal + privacy manifest + 5.2.3 evidence
      collection
- [ ] **Phase 4**: App Store + Play Store submission

See [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the submission checklist.

## License

Code: MIT. See [`LICENSE`](LICENSE) (TBA — currently MIT by default).

Bundled music: public domain. See [`docs/LICENSES/`](docs/LICENSES/).
