# Roadmap

The long arc — phase-by-phase. Each phase has a Definition of Done. AI agents
should pick up `NEXT.md` for immediate-next tasks; this file is for orientation.

Last updated: **2026-05-05**.

## Phase 0a — 3-file split ✅ DONE

Split monolithic `piano-visualizer.html` (~9000 lines) into:

- [x] `index.html`
- [x] `app.css`
- [x] `app.js`
- [x] `sw.js` v2 with new cache list
- [x] `piano-visualizer.html` becomes a redirect stub for back-compat

**DoD met:** `node --check app.js && node --check sw.js` green; legacy URL still
resolves; PWA install path unchanged.

## Phase 0b — monorepo scaffold + extraction 🟡 IN PROGRESS

### 0b.1 Scaffold ✅ DONE

- [x] `packages/core` (TypeScript, no DOM globals)
- [x] `packages/web` (Vite shell)
- [x] `packages/mobile` (Capacitor wrapper)
- [x] `packages/plugins/capacitor-piano-midi` (Swift + Kotlin)
- [x] `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- [x] `MidiInputAdapter` interface + `perf-tier` extracted

### 0b.2 Engine extraction ⏳ TODO

Extract pure modules from `app.js` into `packages/core/src/`. Each row below
corresponds to a leaf-level agent task. Order is by complexity asc.

- [ ] `audio/chord.ts` — already pure, ~30 lines, low risk
- [ ] `audio/yin.ts` — pure DSP, requires Float32Array tests
- [ ] `audio/spectral.ts` — flatness, crest, centroid, CV
- [ ] `audio/harmonicity.ts` — partials check
- [ ] `audio/audio-context.ts` — `createAudioContext`, `recoverAudioContext`
- [ ] `audio/onset.ts` — uses spectral + harmonicity (depends on above)
- [ ] `audio/agc.ts` — software AGC + voice suppression
- [ ] `library/musicxml-meta.ts` — parser for title/composer/measure count
- [ ] `library/auto-section.ts` — already pure
- [ ] `library/user-songs.ts` — IndexedDB CRUD
- [ ] `state/game-state.ts` — flow / combo / stage transitions
- [ ] `state/practice-state.ts` — section progression, hit windows
- [ ] `state/midi-state.ts` — active notes, sustained, chord window
- [ ] `state/session-confidence.ts` — ring buffer + waiting/warmup/performing
- [ ] `state/quality.ts` — rhythm/dynamics/stability scoring
- [ ] `i18n/index.ts` — `t()` + T_STRINGS
- [ ] `render/particles.ts` — Particle class + spawn helpers
- [ ] `render/lane.ts` — falling notes lane
- [ ] `render/keyboard.ts` — virtual keyboard
- [ ] `render/effects.ts` — encouragement effects
- [ ] `render/theme.ts` — themes + synesthesia
- [ ] `config.ts` — CONFIG object

**DoD:** `app.js` imports `<core-bundle>` and uses extracted functions. Behavior
identical (manual A/B test on iPad).

### 0b.3 Dual-build wire-up ⏳ TODO

- [ ] Vite build outputs `dist/core-bundle.js` consumable from `app.js`
- [ ] `app.js` thinned to glue + DOM wiring
- [ ] Eventually: `index.html` updated to load Vite bundle directly

**DoD:** Repo root `index.html` is the same shell that `packages/web` serves.

## Phase 0c — TypeScript migration ⏸ NOT STARTED

- [ ] Per-file `// @ts-check` opt-in across all `packages/`
- [ ] JSDoc types for legacy `app.js` boundaries
- [ ] Rename `.js` → `.ts` file by file, fix `noImplicitAny`
- [ ] Enable `strictNullChecks` after rename phase

**DoD:** `tsconfig.base.json` strict mode enabled, no `// @ts-ignore` at
boundary points.

## Phase 1 — Capacitor first install ⏸ BLOCKED ON HUMAN

Requires Mac + Xcode + Android Studio. Pure setup work.

- [ ] `pnpm install` first run; commit `pnpm-lock.yaml`
- [ ] `pnpm --filter @piano/mobile build:web` produces `dist/`
- [ ] `cd packages/mobile && npx cap add ios` → commit `ios/`
- [ ] `npx cap add android` → commit `android/`
- [ ] Manual: Info.plist `NSMicrophoneUsageDescription` +
      `UIBackgroundModes: audio`
- [ ] Manual: AndroidManifest permissions (RECORD*AUDIO, BLUETOOTH*\*)
- [ ] Manual: `assets/icon.png` (1024²) + `splash.png` (2732²) +
      `pnpm assets:generate`
- [ ] First simulator boot — title screen renders, mic permission prompt fires
- [ ] CI green on `android.yml` + `ios.yml`

**DoD:** Both store binaries build via CI on a clean machine.

## Phase 2a — iOS native MIDI hardware test ⏸ BLOCKED ON HARDWARE

- [ ] Test USB MIDI via Lightning Camera Adapter
- [ ] Test USB-C MIDI direct
- [ ] Test BLE-MIDI (Roland GO:PIANO, Yamaha P-series)
- [ ] Verify CoreMIDI plugin pulls running-status correctly
- [ ] Verify port hot-plug enumeration
- [ ] Lock-screen audio survival

**DoD:** Same hardware that works in desktop Chrome works in the iOS app without
manual reconnect.

## Phase 2b — Android native MIDI hardware test ⏸ BLOCKED ON HARDWARE

- [ ] Test USB OTG MIDI
- [ ] Test BLE-MIDI
- [ ] Verify `android.media.midi` enumeration on Android 13+ permission model
- [ ] BluetoothLeScanner permissions on Android 12+

**DoD:** Same as 2a, on Android.

## Phase 3 — Bundle CDN deps + privacy hardening ⏸ NOT STARTED

- [ ] Replace `<script src="cdn.jsdelivr.net/npm/tone">` with
      `import { ... } from 'tone'`
- [ ] Same for OSMD, JSZip
- [ ] `dynamic import('opensheetmusicdisplay')` from practice mode entry
- [ ] Audit `Tone.js` / `OSMD` `PrivacyInfo.xcprivacy` files; merge into app's
      manifest
- [ ] Build-time strip of `remoteLog` for native (`vite --define`)
- [ ] Verify zero outbound HTTP from native build at runtime (mitmproxy /
      Charles)

**DoD:** Native build runs fully offline. No `console.log` `[ERROR]` POST
attempts.

## Phase 4 — App Store + Play Store submission ⏸ BLOCKED ON HUMAN

- [ ] Apple Developer enrollment
- [ ] Google Play Console enrollment
- [ ] Privacy policy hosted at a stable HTTPS URL
- [ ] Per-score PD documentation PDFs in `docs/LICENSES/`
- [ ] App icon, splash, store screenshots (3 mandatory iPad sizes)
- [ ] Age rating questionnaire (2025 system: 4+/9+/13+/16+/18+)
- [ ] Apple App Privacy nutrition label: "Data Not Collected"
- [ ] Google Play Data Safety form: same
- [ ] Apple App Review notes (template in `docs/COMPLIANCE.md`)
- [ ] Submit. Pray.

**DoD:** App live on both stores.

## Post-MVP backlog (no scheduled phase)

- [ ] More than 3 sections per song (requires unlock-schema migration)
- [ ] Recording / export performance to MIDI file
- [ ] Multi-user (parent + N kids) profiles
- [ ] Cloud progress sync (would change privacy posture — defer indefinitely)
- [ ] Custom theme creator
- [ ] Accessibility audit (screen reader, larger fonts)
- [ ] Apple TV / large-display variant
