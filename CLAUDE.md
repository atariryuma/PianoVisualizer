# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Piano Visualizer is a single-file HTML application for iPad piano practice. It uses real-time microphone audio analysis to detect piano notes and render responsive visual effects on a canvas. The UI is in Japanese and designed for children.

Current version: **v9** (`piano-visualizer.html`)

## Running the Application

The app requires HTTPS for microphone access (especially on iPad/Safari). A PowerShell HTTPS server is provided:

1. Generate a self-signed certificate (`cert.pfx`) in the project directory (not tracked by git)
2. Run `powershell -File https_server.ps1` — serves on port 8443
3. Access from iPad at `https://<host-ip>:8443`

For local development, any HTTPS-capable static server works, or simply open the HTML file directly in a desktop browser.

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
- **Stages**: 6 visual tiers (`めざめ → はなひらく → オーロラ → コスモス → かがやき`) triggered by flow thresholds.
- **Quality scoring**: rhythm regularity (IOI coefficient of variation) + dynamics variation, weighted 50/50.
- **Encouragement system (v9)**: replaces numeric combo display with escalating Japanese messages (`いいよ！→ すごい！→ ... → さいこう！`), each triggering a unique visual effect.

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
