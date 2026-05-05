# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Piano Visualizer is a real-time piano practice app for upper-elementary
children. It uses microphone audio analysis (YIN pitch detection + multi-feature
onset gating) and Web MIDI to detect piano notes, then renders responsive visual
effects on a canvas. The UI is bilingual (EN / 日本語).

Current version: **0.14**

## Repository structure

This repo is mid-migration from a single-file HTML build (legacy, still
authoritative as of 2026-05-05) to a Vite + Capacitor monorepo (scaffold in
place, extraction in progress).

```text
piano-visualizer/
├── index.html              # ★ Authoritative web app entry (LAN HTTPS server)
├── app.css                 # ★ Authoritative styles
├── app.js                  # ★ Authoritative script (~9000 lines, vanilla JS)
├── piano-visualizer.html   # Legacy URL — redirects to ./
├── sw.js                   # Service worker (caches index/css/js + assets)
├── manifest.json           # PWA manifest
├── icon.svg                # PWA icon
├── assets/                 # Bundled MusicXML scores (.mxl + .xml)
├── gen_cert.ps1            # Self-signed cert generator (LAN dev)
├── https_server.ps1        # PowerShell HTTPS server (port 8443)
│
├── packages/               # ★ Monorepo (Phase 0b/c — scaffolded, not yet primary)
│   ├── core/               # Pure-TS engine (DOM-free, testable, shared)
│   ├── web/                # Vite PWA shell
│   ├── mobile/             # Capacitor 6 wrapper (iOS + Android)
│   └── plugins/
│       └── capacitor-piano-midi/   # Native MIDI plugin (Swift + Kotlin)
│
├── docs/
│   ├── PRIVACY.md          # Privacy policy (App Store + Play Store)
│   ├── COMPLIANCE.md       # Submission checklist (4.7 / 5.2.3 / Kids etc.)
│   └── LICENSES/           # Per-score PD documentation
│
├── .github/workflows/      # CI/CD (web + iOS + Android)
└── package.json            # pnpm workspaces root
```

## Two source-of-truth realities right now

**The legacy single-file build (`index.html` + `app.css` + `app.js`) is what
runs in production today.** All bug fixes and feature work on existing behavior,
and LAN deploys, go here. The PowerShell HTTPS server expects this.

**The `packages/` monorepo is the migration target.** It has the structure plus
contracts (`MidiInputAdapter` interface, `perf-tier`) plus native plugin source
plus all CI/docs. The actual engine code (audio/render/state) is still being
extracted from `app.js` module by module. Until extraction completes, the
monorepo's `web` and `mobile` shells are placeholders.

When making changes, decide:

- Hot bug fix or new feature on existing behavior → edit `app.js` / `app.css`.
- New abstraction or platform-specific code → edit `packages/*` and document
  what needs to flow back to `app.js`.

The 3-file root build was split from a single 9000-line `piano-visualizer.html`
on 2026-05-05.

## Running the Application (legacy / production)

The app requires HTTPS for microphone access (especially on iPad/Safari). A
PowerShell HTTPS server is provided:

1. **Generate certs** with `powershell -File gen_cert.ps1` (auto-detects LAN IP,
   outputs `cert.pfx` for the server + `cert.cer` for iOS to trust). Re-run any
   time the LAN IP changes.
2. **Run server**: `powershell -File https_server.ps1` — serves on port 8443.
3. **Access** at `https://<host-ip>:8443`.

### iPad / strict-cert browser (Web MIDI Browser etc.) setup

Stock Safari lets you bypass the self-signed-cert warning, but Web MIDI Browser
and many WKWebView-based apps don't. Install the cert as trusted:

1. iPad Safari → `https://<host-ip>:8443/cert.cer` → tap through the cert
   warning once → tap **"Download Profile"** → **OK**.
2. **Settings → General → VPN & Device Management** → tap the downloaded
   _PianoVisualizer_ profile → tap **Install**.
3. **Settings → General → About → Certificate Trust Settings** → enable the
   _PianoVisualizer_ root certificate.
4. Re-open `https://<host-ip>:8443/` in Web MIDI Browser — no more cert error.

For local development, any HTTPS-capable static server works, or simply open the
HTML file directly in a desktop browser.

## Building (monorepo, future)

Once the extraction is far enough along to make the monorepo authoritative:

```bash
pnpm install
pnpm build:web                 # → packages/web/dist/
pnpm --filter @piano/web dev   # vite dev server (port 8443)

pnpm build:mobile              # → packages/mobile/dist/ + cap sync
pnpm cap:ios                   # opens iOS simulator
pnpm cap:android               # opens Android emulator
```

## MIDI input by platform

The app prefers Web MIDI input (polyphonic, velocity-aware) and falls back to
mic detection. Support is **not uniform across platforms**:

- **Desktop Chrome / Edge / Steam Deck browser**: Full Web MIDI API + USB MIDI +
  (on Chrome) BLE-MIDI. Best experience.
- **Android Chrome**: Web MIDI API works for **USB MIDI only**. BLE-MIDI devices
  are not enumerated (long-standing Chromium limitation). Users must connect via
  USB-C OTG or fall back to mic.
- **iPad / iPhone (any browser)**: **Web MIDI API is not implemented in WebKit**
  (Bug 107250, no roadmap). All iOS browsers use WebKit, so Chrome/Firefox/Edge
  on iPad are equally blocked. The app detects this via `isAppleMobile()` and
  surfaces a tooltip pointing users to the
  [Web MIDI Browser](https://apps.apple.com/us/app/web-midi-browser/id953846217)
  iOS app (a third-party browser that polyfills Web MIDI + BLE-MIDI). Without
  that app, iPad users are mic-only.
- **Native iOS/Android app (Phase 2+)**: Full MIDI via the
  [`capacitor-piano-midi`](packages/plugins/capacitor-piano-midi/) plugin —
  CoreMIDI on iOS, `android.media.midi` on Android. USB + BLE both work
  natively.
- **Roland GO:PIANO88 / similar BLE-MIDI keyboards**: Pairing via Roland Piano
  App / GarageBand works for native iOS apps but does **not** make the keyboard
  available to Safari. Don't pair via iOS Settings → Bluetooth either; Roland's
  docs say to pair through the music app.

## Architecture

### Audio Pipeline

```text
Microphone → getUserMedia (AGC/noise suppression disabled, 48000 Hz forced)
  → GainNode (Software AGC)
    → Main AnalyserNode (FFT 4096, smoothing 0.82) — pitch detection + visualization
    → Onset AnalyserNode (FFT 2048, smoothing 0.15) — transient/onset detection
```

Sample rate is locked to 48000 Hz at AudioContext creation to dodge the AirPods
24/48 sample-rate flip (WebKit Bug 154538). On `devicechange` (headphone
plug/unplug) the entire AudioContext is closed and recreated — `suspend/resume`
alone is unreliable on iOS WKWebView per WebKit Bugs 237878 and 261554.

### Detection Layers (evaluated every frame)

1. **YIN Pitch Detection** — time-domain autocorrelation algorithm detecting
   piano notes (25–5000 Hz). Uses CMNDF with parabolic interpolation.
2. **Multi-Feature Onset Gate** — 5-condition classifier using spectral flux,
   spread, flatness, crest factor, and harmonicity. Prevents sustained noise
   from registering as notes. Gate stays open for `ONSET_GATE_DURATION_MS` after
   a valid onset.
3. **Harmonicity Gate** — checks energy at integer-ratio harmonics of the
   detected fundamental. Piano has strong harmonic partials; voice/speech does
   not. Rejects non-piano audio.
4. **Session Confidence Layer** — sliding-window state machine
   (`waiting → warmup → performing`) that requires sustained piano detection
   before enabling full game mechanics.

### Performance tier

`PERF_TIER` is detected at startup from `navigator.deviceMemory`,
`hardwareConcurrency`, and UA hints. Maps to `PERF_PROFILE`:

- **low** (iPad 10, low-end Android): 400 particles, no shadowBlur.
- **mid** (iPad Air 4+ / mid-range Android): 600 particles, shadowBlur on.
- **high** (M-series iPad / desktop): 1200 particles, shadowBlur on.

Override via `localStorage.pianoViz_perfTier = 'low'|'mid'|'high'`.

### Software AGC

Custom gain control via `GainNode` (browser's built-in AGC is disabled).
Smoothly adjusts gain between 1×–40× to normalize quiet/loud pianos. Voice
suppression: if multiple consecutive onsets are rejected (non-piano), AGC
temporarily limits max gain to prevent amplifying speech.

### Game Systems

- **Flow meter** (0–100): rises with good notes, decays during silence. Affected
  by combo, pitch stability, and quality score.
- **Combo**: consecutive notes within `COMBO_WINDOW_MS`. Drives encouragement
  tiers.
- **Stages**: 6 visual tiers
  (`Awakening → Blooming → Aurora → Cosmos → Radiance → Legend`) triggered by
  flow thresholds.
- **Quality scoring**: rhythm regularity (IOI coefficient of variation) +
  dynamics variation + pitch stability, weighted 40/35/25.
- **Encouragement system**: replaces numeric combo display with escalating
  bilingual messages (`Nice! → Great! → ... → Awesome!`), each triggering a
  unique visual effect.

### Rendering

Canvas-based with `requestAnimationFrame`. Layers drawn back-to-front:

1. Background fade (theme-colored)
2. Background stars (twinkling, count from `PERF_PROFILE.bgStarCount`)
3. Aurora bands (sinusoidal, appears above flow 40)
4. Ground flowers (appears above flow 55)
5. Center glow (radial gradient, energy-reactive)
6. Shimmer overlay (triggered by encouragement effects)
7. Frequency spectrum bars (64 bars, piano range)
8. Ripples (expanding circles at note positions)
9. Particles (circle, ring, star, note, flower types; cap from `PERF_PROFILE`)

### Key Configuration

All tunable parameters are in the `CONFIG` object at the top of `app.js`. Key
groups:

- Audio analysis: `FFT_SIZE`, `SMOOTHING`, `YIN_*`
- Onset detection: `SPECTRAL_FLUX_*`, `ONSET_*`, `FLATNESS_*`, `CREST_*`,
  `HARMONICITY_*`
- AGC: `AGC_*`
- Game balance: `FLOW_*`, `COMBO_*`, `SILENCE_*`
- Visual: `MAX_PARTICLES`, `STAGES`, `THEMES`, `ENCOURAGEMENT_TIERS`

`MAX_PARTICLES`, `SHADOW_BLUR_ENABLED`, `AMBIENT_PARTICLE_CHANCE`, and the
background star count are overridden at runtime by the detected `PERF_PROFILE`.

### Themes

4 color themes selectable via dots in the settings panel:

0. Purple/pink (default)
1. Cyan/green
2. Orange/red
3. White/lavender

### Debug Mode

Triple-tap the bottom-left corner OR enable in the settings panel to toggle a
debug overlay showing real-time values for all detection layers (flux, flatness,
crest, harmonicity, AGC gain, session state, pitch, RMS, etc.).

## User-added songs

Added 0.13: users can browse, download, and import MusicXML scores (`.mxl` /
`.musicxml`). Source: the
[musetrainer/library](https://github.com/musetrainer/library) GitHub repo,
served via jsDelivr, **pinned to a specific commit SHA** so the catalog cannot
change between releases (App Store 4.7 compliance).

- IndexedDB-backed (`pianoViz_v1` / store `userSongs`).
- Auto-section detection: rehearsal marks → double bars → repeats → key changes
  → length-thirds fallback.
- Manual section editor for parents/teachers.
- Export/import as JSON.
- See: `addUserSongFromBlob`, `addUserSongFromUrl`, `autoSectionDefs`,
  `openSectionEditor`, `exportUserLibrary`, `importUserLibrary` in `app.js`.

## Native (Capacitor) plans

See [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the App Store / Play Store
submission checklist, and
[`packages/mobile/README.md`](packages/mobile/README.md) for the Capacitor
wrapper instructions.

The native MIDI plugin lives at
[`packages/plugins/capacitor-piano-midi/`](packages/plugins/capacitor-piano-midi/)
— both iOS (Swift + CoreMIDI + CoreBluetooth) and Android (Kotlin +
android.media.midi + BluetoothLeScanner) implementations are ready, but not yet
hardware-tested.
