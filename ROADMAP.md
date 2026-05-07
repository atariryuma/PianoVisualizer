# Roadmap

The long arc — phase-by-phase. Each phase has a Definition of Done. AI agents
should pick up `NEXT.md` for immediate-next tasks; this file is for orientation.

Last updated: **2026-05-06**.

## Phase 0a — 3-file split ✅ DONE (2026-05-05)

Split monolithic `piano-visualizer.html` (~9000 lines) into a 3-file shell
(`index.html` + `app.css` + `app.js` + `sw.js` v2). The `piano-visualizer.html`
redirect stub was retired the next day once we confirmed
`manifest.json#start_url` was always `./`.

## Phase 0b — monorepo scaffold + extraction ✅ DONE (2026-05-06)

### 0b.1 Scaffold ✅ (pre-existing)

`packages/core` (TS, DOM-free), `packages/web` (Vite shell), `packages/mobile`
(Capacitor wrapper), `packages/plugins/capacitor-piano-midi` (Swift + Kotlin),
`MidiInputAdapter` interface + `perf-tier` extracted.

### 0b.2 Engine extraction ✅

35 modules now live in `@piano/core` with 680 vitest cases. The full table is
rotated into `NEXT.md` under "✅ Completed". Coverage spans: audio detection
(chord, YIN, spectral, harmonicity, onset, AGC, audio-context, chord-window),
library (musicxml-meta, auto-section, user-songs, musetrainer-catalog), state
(session-confidence, practice-state, midi-state, flow-meter, encouragement,
quest-tracker, quality + quality- history, pitch-stability, wake-up-flash,
streak), render (particles, ripples, effects, keyboard, lane, background, theme,
spectrum, center- glow, stage, midi-beams), and i18n + config.

### 0b.3 Dual-build wire-up ✅ (2026-05-06)

`packages/web` is now the production entry. `packages/web/src/main.ts` imports
Tone / OSMD / JSZip / `@piano/core` from npm, pins them to `globalThis`, and
dynamically imports `legacy-app.js` (formerly the root `app.js`) for its
IIFE-style side effects. Repo-root 3-file shell + `dist-legacy/core-bundle.js`
IIFE retired in the same commit set; `https_server.ps1` defaults to serving
`packages/web/dist/`.

**DoD met:** `pnpm verify` clean (lint + typecheck + 680/680 tests +
`pnpm build:web`); Windows + iPad smoke test verified end-to-end (DIAG tick log
shows OSMD cursor advance, Tone scheduler running, hit detection working). The
legacy 3-file shell at the repo root no longer exists; the only remaining
"vanilla shell" file is `packages/web/src/legacy-app.js`, which Phase 0c will
rewrite to TS.

## Phase 0c — TypeScript migration 🚧 IN PROGRESS (~91% done as of 2026-05-07)

The legacy 7,600-line `packages/web/src/legacy-app.js` is being rewritten as
typed TS. Current residual: **91 errors** (down from 1,041 baseline). Eight
modules already extracted into `@piano/core` (score-timing, measure-timing,
playback-order, merge-tied-notes, diag-load, practice-progress) and two into
`@piano/web` (audio-scheduler, note-extractor).

Sub-phases below split the remaining work along clean diff boundaries.

### Phase 0c.5 — Drive residual to 0, enable `// @ts-check` ratchet

The remaining 91 errors are per-site boundary engineering (TS2345/TS2322 at
`@piano/core` boundaries, scattered DOM-cast residuals, a handful of `let X`
decls still needing `@type`). Once driven to zero, flip
`packages/web/tsconfig.json: checkJs: true` and add `// @ts-check` to
`legacy-app.js` so future regressions error at typecheck time.

- [ ] Per-site fix the 91 residuals (estimated ~3-4h focused work)
- [ ] `// @ts-check` at top of `legacy-app.js`
- [ ] `checkJs: true` in `packages/web/tsconfig.json`
- [ ] DELETE `packages/web/tsconfig.probe.json` (no longer needed)
- [ ] Audit + replace `/** @type {any} */` casts with proper types (10-20 sites)

**DoD:** `pnpm typecheck` clean across the whole repo with `legacy-app.js`
included in the strict graph.

### Phase 0d — Carve `legacy-app.js` into typed shell modules

Each extraction reduces `legacy-app.js` and adds a focused `.ts` module under
`packages/web/src/`. The shell becomes a thin glue layer that imports + wires
typed modules. Rule: one extraction per PR, `pnpm verify` + iPad A/B between
each.

Target order (small / isolated first):

- [ ] `web/wakelock.ts` + `web/visibility.ts` (~150 lines, low difficulty)
- [ ] `web/section-editor.ts` (~300 lines, low difficulty)
- [ ] `web/settings-panel.ts` (~500 lines, low difficulty)
- [ ] `web/audio-init.ts` — getUserMedia + AudioContext seam (~200 lines, mid)
- [ ] `web/user-songs-ui.ts` — Add/Manage Songs modal (~700 lines, mid)
- [ ] `web/event-wiring.ts` — DOM event handlers (~1500 lines, mechanical)
- [ ] `web/practice-tick.ts` — `updatePractice` hot path (~250 lines, mid-high)
- [ ] `web/render-loop.ts` — `loop()` frame composer (~500 lines, hardest)

**DoD:** `wc -l packages/web/src/legacy-app.js` ≤ 200 lines.

### Phase 0e — Retire `legacy-app.js` entirely

The remaining ≤200 lines move into `main.ts` (or focused new modules). The file
gets deleted, `allowJs` gets flipped off, and every `legacy-app.js` mention in
tooling / docs gets stripped.

- [ ] Inline residual into `main.ts` / new modules
- [ ] DELETE `packages/web/src/legacy-app.js`
- [ ] `packages/web/tsconfig.json`: `allowJs: true` → `false`
- [ ] DELETE `packages/web/dist-legacy/` (if any residue)
- [ ] Strip `legacy-app.js` mentions from `.lintstagedrc.json`,
      `.husky/pre-commit`, `CLAUDE.md`, `AGENTS.md`, `README.md`
- [ ] `globalThis` pinning narrowed to Tone / OSMD / JSZip only (everything else
      routes via static import)

**DoD:** `git ls-files | grep -i legacy` returns 0 lines.
`find packages -name "*.js" -not -path "*/node_modules/*" -not -path "*/dist/*"`
returns 0 lines (config files like `eslint.config.mjs` excepted).

**Tag at completion: `phase-0e-done`.**

## Phase 0c (legacy DoD, retained for reference)

**DoD:** `tsconfig.base.json` strict mode enabled, no `// @ts-ignore` at
boundary points. (Strict mode + no `@ts-ignore` already met as of 2026-05-07;
the ratchet for Phase 0c is now codified as 0c.5 above.)

## Phase 1 — Capacitor first install ⏸ BLOCKED ON HUMAN

Requires Mac + Xcode + Android Studio. Pure setup work.

**Cleanup task on landing**: drop the WMB-specific MIDI workarounds from
`legacy-app.js`. They were added 2026-05-07 to keep iPad / Pages users
functional while the native build wasn't shipping yet, and are tagged for
mechanical removal:

```bash
grep -nE "@WMB-WORKAROUND" packages/web/src/legacy-app.js
# 4 blocks bracketed by `// @WMB-WORKAROUND ...` and `// /@WMB-WORKAROUND`
# headers. Once Capacitor + the CoreMIDI plugin land, native iOS/Android
# uses the plugin and Web MIDI Browser becomes irrelevant — desktop users
# don't need these quirks. Each block deletes cleanly without touching
# the universal patterns it sits next to (auto-rescan poller,
# visibility-resume re-enumeration, badge waiting state, manual rescan
# tap — those help every platform and STAY).
```

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
