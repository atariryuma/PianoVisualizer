# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Piano Visualizer is a single-file HTML application for iPad piano practice. It uses real-time microphone audio analysis to detect piano notes and render responsive visual effects on a canvas. The UI is in English and designed for upper-elementary children.

Current version: **v9** (`piano-visualizer.html`)

## Running the Application

The app requires HTTPS for microphone access (especially on iPad/Safari). A PowerShell HTTPS server is provided:

1. **Generate certs** with `powershell -File gen_cert.ps1` (auto-detects LAN IP, outputs `cert.pfx` for the server + `cert.cer` for iOS to trust). Re-run any time the LAN IP changes.
2. **Run server**: `powershell -File https_server.ps1` — serves on port 8443.
3. **Access** at `https://<host-ip>:8443`.

### iPad / strict-cert browser (Web MIDI Browser etc.) setup

Stock Safari lets you bypass the self-signed-cert warning, but Web MIDI Browser and many WKWebView-based apps don't. Install the cert as trusted:

1. iPad Safari → `https://<host-ip>:8443/cert.cer` → tap through the cert warning once → tap **"Download Profile"** → **OK**.
2. **Settings → General → VPN & Device Management** → tap the downloaded *PianoVisualizer* profile → tap **Install**.
3. **Settings → General → About → Certificate Trust Settings** → enable the *PianoVisualizer* root certificate.
4. Re-open `https://<host-ip>:8443/` in Web MIDI Browser — no more cert error.

For local development, any HTTPS-capable static server works, or simply open the HTML file directly in a desktop browser.

## MIDI input by platform

The app prefers Web MIDI input (polyphonic, velocity-aware) and falls back to mic detection. Support is **not uniform across platforms**:

- **Desktop Chrome / Edge / Steam Deck browser**: Full Web MIDI API + USB MIDI + (on Chrome) BLE-MIDI. Best experience.
- **Android Chrome**: Web MIDI API works for **USB MIDI only**. BLE-MIDI devices are not enumerated (long-standing Chromium limitation). Users must connect via USB-C OTG or fall back to mic.
- **iPad / iPhone (any browser)**: **Web MIDI API is not implemented in WebKit** (Bug 107250, no roadmap). All iOS browsers use WebKit, so Chrome/Firefox/Edge on iPad are equally blocked. The app detects this via `isAppleMobile()` and surfaces a tooltip on the input indicator pointing users to the [Web MIDI Browser](https://apps.apple.com/us/app/web-midi-browser/id953846217) iOS app (a third-party browser that polyfills Web MIDI + BLE-MIDI). Without that app, iPad users are mic-only.
- **Roland GO:PIANO88 / similar BLE-MIDI keyboards**: Pairing via Roland Piano App / GarageBand works for native iOS apps but does **not** make the keyboard available to Safari. Don't pair via iOS Settings → Bluetooth either; Roland's docs say to pair through the music app.

## Architecture

Everything lives in `piano-visualizer.html` — a self-contained `<style>` + `<script>` single-page app with no dependencies or build step.

### Audio Pipeline

```
Microphone → getUserMedia (AGC/noise suppression disabled)
  → GainNode (Software AGC)
    → Main AnalyserNode (FFT 4096, smoothing 0.82) — pitch detection + visualization
    → Onset AnalyserNode (FFT 2048, smoothing 0.15) — transient/onset detection
```

### Detection Layers (evaluated every frame)

1. **YIN Pitch Detection** — time-domain autocorrelation algorithm detecting piano notes (25–5000 Hz). Uses CMNDF with parabolic interpolation.
2. **Multi-Feature Onset Gate** — 5-condition classifier using spectral flux, spread, flatness, crest factor, and harmonicity. Prevents sustained noise from registering as notes. Gate stays open for `ONSET_GATE_DURATION_MS` after a valid onset.
3. **Harmonicity Gate (v9)** — checks energy at integer-ratio harmonics of the detected fundamental. Piano has strong harmonic partials; voice/speech does not. Rejects non-piano audio.
4. **Session Confidence Layer** — sliding-window state machine (`waiting → warmup → performing`) that requires sustained piano detection before enabling full game mechanics.

### Software AGC

Custom gain control via `GainNode` (browser's built-in AGC is disabled). Smoothly adjusts gain between 1x–40x to normalize quiet/loud pianos. v9 adds voice suppression: if multiple consecutive onsets are rejected (non-piano), AGC temporarily limits max gain to prevent amplifying speech.

### Game Systems

- **Flow meter** (0–100): rises with good notes, decays during silence. Affected by combo, pitch stability, and quality score.
- **Combo**: consecutive notes within `COMBO_WINDOW_MS`. Drives encouragement tiers.
- **Stages**: 6 visual tiers (`Awakening → Blooming → Aurora → Cosmos → Radiance → Legend`) triggered by flow thresholds.
- **Quality scoring**: rhythm regularity (IOI coefficient of variation) + dynamics variation, weighted 50/50.
- **Encouragement system (v9)**: replaces numeric combo display with escalating English messages (`Nice! → Great! → ... → Awesome!`), each triggering a unique visual effect.

### Rendering

Canvas-based with `requestAnimationFrame`. Layers drawn back-to-front:
1. Background fade (theme-colored)
2. Background stars (twinkling, visibility scales with flow)
3. Aurora bands (sinusoidal, appears above flow 40)
4. Ground flowers (appears above flow 55)
5. Center glow (radial gradient, energy-reactive)
6. Shimmer overlay (triggered by encouragement effects)
7. Frequency spectrum bars (64 bars, piano range)
8. Ripples (expanding circles at note positions)
9. Particles (circle, ring, star, note, flower types — max 800)

### Key Configuration

All tunable parameters are in the `CONFIG` object at the top of the script. Key groups:
- Audio analysis: `FFT_SIZE`, `SMOOTHING`, `YIN_*`
- Onset detection: `SPECTRAL_FLUX_*`, `ONSET_*`, `FLATNESS_*`, `CREST_*`, `HARMONICITY_*`
- AGC: `AGC_*`
- Game balance: `FLOW_*`, `COMBO_*`, `SILENCE_*`
- Visual: `MAX_PARTICLES`, `STAGES`, `THEMES`, `ENCOURAGEMENT_TIERS`

### Themes

4 color themes selectable via dots in the top-right corner:
0. Purple/pink (default)
1. Cyan/green
2. Orange/red
3. White/lavender

### Debug Mode

Triple-tap the bottom-left corner to toggle a debug overlay showing real-time values for all detection layers (flux, flatness, crest, harmonicity, AGC gain, session state, pitch, RMS, etc.).
