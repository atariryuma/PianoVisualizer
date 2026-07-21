# Piano Visualizer

The honest, real-time piano practice app — **no ads, no tracking, no accounts,
audio stays on your device.** For learners of every age, it turns practice into
something you actually want to do: play a note (microphone _or_ MIDI keyboard)
and the screen comes alive with flowing notes and gentle effects.

**No tracking — and because it's open source, you can verify it:** there are no
analytics SDKs, no ad networks, and no server. Everything runs on-device.

- 🎹 **Try it in your browser:** <https://atariryuma.github.io/PianoVisualizer/>
- 🔒 **Privacy policy:**
  <https://atariryuma.github.io/PianoVisualizer/privacy.html>

> Vite + pnpm monorepo. Capacitor 6 wrapper for iOS (shipped-quality,
> hardware-verified) + Android (in progress).

## Features

- **Real-time piano detection** — YIN pitch detection + a multi-feature onset
  gate + harmonicity check (rejects voice / clatter).
- **Microphone _or_ MIDI** — USB + BLE-MIDI on desktop Chrome/Edge; iOS via the
  native build (CoreMIDI) or the Web MIDI Browser app. Falls back to mic.
- **57-piece bundled library**, graded beginner → advanced — all public-domain
  (our own engravings, CC0 OpenScore Lieder, and faithful transcriptions of
  famous PD solo works: Clair de Lune, Chopin, Bach, Joplin, Satie, and more).
  Plus **bring your own** MusicXML (`.mxl` / `.musicxml`).
- **Three practice modes** — Listen, Guided (wait for the right note), Rhythm
  (scored) — with one-hand practice, adjustable tempo, count-in, and section
  loop.
- **Gentle practice journal** — stars, stamps, and a growth chart that compares
  you only to your own past (no shame copy, no decrementing streaks).
- **Trilingual** — English · 日本語 · Deutsch.
- **Kid-safe by design** — zero data collection, no ads, no in-app purchases, no
  accounts. See the [banned-list](CLAUDE.md) design constraints.

## Quick start (web, dev)

The app needs HTTPS for microphone access and Service-Worker registration, so a
trusted dev cert is generated via
[mkcert](https://github.com/FiloSottile/mkcert).

```bash
pnpm install

# One-time: install mkcert, then generate trusted dev certs
brew install mkcert nss        # macOS   (Windows: scoop install mkcert)
./gen_cert.sh                  # macOS/Linux  (Windows: powershell -File gen_cert.ps1)
# → cert.pfx (server) + rootCA.cer (iPad/Android trust)

pnpm serve                     # build:web + Node HTTPS server on :8443
# open https://localhost:8443  (or https://<host-ip>:8443 from iPad)
```

iPad needs `rootCA.cer` installed once as a trusted profile — see
[`CLAUDE.md`](CLAUDE.md) for the walkthrough. `pnpm verify` runs lint,
typecheck, the full test suite, and the Vite build.

## Project layout

```text
.
├── packages/               ← source of truth (pnpm workspace)
│   ├── core/               ← pure-TS engine (DOM-free, testable, shared)
│   ├── web/                ← ★ Vite PWA shell — production entry
│   │   └── public/         ← manifest + icon + bundled scores + privacy.html
│   ├── mobile/             ← Capacitor 6 wrapper (iOS generated + verified)
│   └── plugins/
│       └── capacitor-piano-midi/  ← native MIDI plugin (Swift + Kotlin)
├── scripts/gen-library-scores.mjs ← generates the PD score library + manifest
├── gen_cert.sh · gen_cert.ps1     ← mkcert wrappers
└── docs/                   ← privacy / compliance / score licenses / submission
```

## Status

iOS-first, targeting the App Store **4+ / Education** category. The iOS app is
generated and hardware-verified on a physical iPad (mic, USB-MIDI, and BLE-MIDI
all work); the library, privacy policy, and submission artifacts are complete.
Android is a future milestone. See [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md)
for the submission checklist and [`docs/SUBMISSION.md`](docs/SUBMISSION.md) for
the paste-ready store artifacts.

## License

Code: **MIT** — see [`LICENSE`](LICENSE). Bundled music: **public domain / CC0**
— per-score documentation in [`docs/LICENSES/`](docs/LICENSES/).
