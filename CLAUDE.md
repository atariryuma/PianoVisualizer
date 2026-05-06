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

The repo is a pnpm workspace; **`packages/web` is the production entry** (Phase
0b.3 complete as of 2026-05-06). The legacy 3-file shell at the repo root has
been retired — `legacy-app.js` lives at
[`packages/web/src/legacy-app.js`](packages/web/src/legacy-app.js) until its
Phase 0c TypeScript conversion.

**Engine extraction status (2026-05-06)**: 680 tests across 38 test files; 35
pure modules in `@piano/core` covering audio detection, render layers,
practice + free-play state machines, library catalog + section assembly, i18n,
result-tier / unlock gating, per-onset reducers, daily-streak math, and the MIDI
sustained-note beam adapter. The remaining work is Phase 0c (TypeScript
conversion of `legacy-app.js` into proper modules) and the OSMD adapter design —
see [NEXT.md](NEXT.md).

```text
piano-visualizer/
├── packages/               # ★ Monorepo source of truth
│   ├── core/               # Pure-TS engine (DOM-free, testable, shared)
│   ├── web/                # ★ Vite PWA shell — production entry
│   │   ├── index.html      # Web app shell
│   │   ├── public/         # app.css + manifest + icon + assets/
│   │   └── src/
│   │       ├── main.ts     # Module entry — seeds globals, imports legacy
│   │       ├── legacy-app.js   # Vanilla shell (Phase 0c rewrite pending)
│   │       └── adapters/   # WebMIDI / WebAudio (Phase 0c wiring pending)
│   ├── mobile/             # Capacitor 6 wrapper (iOS + Android)
│   └── plugins/
│       └── capacitor-piano-midi/   # Native MIDI plugin (Swift + Kotlin)
│
├── gen_cert.ps1            # mkcert wrapper: cert.pfx (server) + rootCA.cer (iPad)
├── https_server.ps1        # PowerShell HTTPS server (port 8443) — serves
│                           # packages/web/dist by default
│
├── docs/
│   ├── PRIVACY.md          # Privacy policy (App Store + Play Store)
│   ├── COMPLIANCE.md       # Submission checklist (4.7 / 5.2.3 / Kids etc.)
│   └── LICENSES/           # Per-score PD documentation
│
├── .github/workflows/      # CI/CD (web + iOS + Android)
└── package.json            # pnpm workspaces root
```

## Single source of truth: packages/web

Phase 0b.3 retired the repo-root 3-file shell on 2026-05-06. The flow is:

- `packages/web/src/main.ts` — module entry. Imports Tone / OSMD / JSZip /
  `@piano/core` from npm, pins each to `globalThis` (legacy code still reads
  them as browser globals), then dynamically imports `legacy-app.js` for its
  IIFE-style side effects.
- `packages/web/src/legacy-app.js` — the still-vanilla shell. Most pure logic
  now delegates via `PianoCore.*`; awaiting Phase 0c TS conversion.
- `packages/web/public/` — static assets (`app.css`, `manifest.json`,
  `icon.svg`, `assets/*.{mxl,xml}`) copied through unchanged at build time.
- `pnpm build:web` → `packages/web/dist/` is the deployable output.

When making changes, decide:

- Hot bug fix or new feature on existing behavior → edit
  `packages/web/src/legacy-app.js` + `packages/web/public/app.css`.
- New abstraction or platform-specific code → edit `packages/*` and document
  what needs to flow back into the legacy shell.

The 9000-line `piano-visualizer.html` monolith was split into a 3-file shell on
2026-05-05; that 3-file shell was retired into `packages/web` on 2026-05-06 once
35 modules were extracted into `@piano/core`.

## Running the Application

The app requires HTTPS for microphone access (especially on iPad/Safari) and for
Service Worker registration. A PowerShell HTTPS server is provided. Cert
generation is delegated to [mkcert](https://github.com/FiloSottile/mkcert) so
Chrome accepts the cert for SW registration over both `localhost` and the LAN IP
— the previous self-signed-leaf-with-`CA:TRUE` approach passed page navigation
but failed Chrome's stricter SW SSL validator
(`Failed to register a ServiceWorker ... An SSL certificate error occurred when fetching the script`).

1. **One-time mkcert install**: `scoop install mkcert` (or
   `choco install mkcert`, or download `mkcert.exe` from
   [releases](https://github.com/FiloSottile/mkcert/releases) and put it on
   PATH). Only needed once per dev machine.
2. **Generate certs** with `powershell -File gen_cert.ps1` — auto-detects LAN
   IP, runs `mkcert -install` (idempotent), outputs `cert.pfx` (server leaf,
   password `piano123`) + `rootCA.cer` (mkcert root CA in DER, for iPad /
   Android trust install). Re-run any time the LAN IP changes; the root stays
   the same so devices that already trust `rootCA.cer` keep working.
3. **Build** with `pnpm build:web` — produces `packages/web/dist/`.
4. **Run server**: `powershell -File https_server.ps1` — serves
   `packages/web/dist` on port 8443. (Or `pnpm serve` to do step 3 + 4.)
5. **Access** at `https://localhost:8443/` (same machine — just works) or
   `https://<host-ip>:8443/` (LAN — also works because mkcert's root is in the
   OS trust store).

### iPad / strict-cert browser (Web MIDI Browser etc.) setup

This is a **one-time setup per iPad**. Once the mkcert root CA is installed,
every `cert.pfx` regeneration (LAN IP change, expiry, etc.) is picked up
automatically — no per-cert reinstall.

1. iPad Safari → `https://<host-ip>:8443/rootCA.cer` → tap through the cert
   warning once → tap **"Download Profile"** → **OK**.
2. **Settings → General → VPN & Device Management** → tap the downloaded
   _mkcert_ profile → tap **Install**.
3. **Settings → General → About → Certificate Trust Settings** → enable **mkcert
   development CA** as a trusted root.
4. Re-open `https://<host-ip>:8443/` in Web MIDI Browser — no more cert error.

For local development, any HTTPS-capable static server works once
`packages/web/dist/` is built.

## Building

```bash
pnpm install
pnpm build:web                 # → packages/web/dist/
pnpm --filter @piano/web dev   # vite dev server (port 8443) for HMR
pnpm serve                     # build:web + https_server.ps1 in one step

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

All tunable parameters are in the `CONFIG` object at the top of `legacy-app.js`.
Key groups:

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

Enable in the settings panel (⚙ → その他 → デバッグ表示) to toggle a debug
overlay showing real-time values for all detection layers (flux, flatness,
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
  `openSectionEditor`, `exportUserLibrary`, `importUserLibrary` in
  `legacy-app.js`.

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
