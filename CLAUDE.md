# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Piano Visualizer is a real-time piano practice app for upper-elementary
children. It uses microphone audio analysis (YIN pitch detection + multi-feature
onset gating) and Web MIDI to detect piano notes, then renders responsive visual
effects on a canvas. The UI is bilingual (EN / 日本語).

Current version: **0.14**

## Gamification: banned-list (kid-safety)

Empirical reviews (Veiga et al. 2025; arXiv 2412.05039 dark-patterns in mobile
games; Frontiers Educ 2024) consistently rank these patterns as the highest-harm
mechanics for under-13 users. **Do not add any of them**, even when the request
looks reasonable:

- **FOMO timers** ("offer expires in 23:59", limited-time rewards on
  songs/stamps). Time pressure flips intrinsic motivation extrinsic.
- **Public leaderboards with named ranks**. Social-pressure ranking doubles the
  streak-shame harm for kids 9-12.
- **RNG / loot-box / gacha mechanics**. Every stamp/seal predicate is
  deterministic. A kid must be able to _see and chase_ the goal.
- **Daily streak with loss/shame copy**. Use lifetime-days counters or
  best-streak (non-decreasing). Streak counters that decrement carry a measured
  harm score (Hanus & Fox 2015; Decision Lab "Streak Creep").
- **False-progress** (bars that never complete, infinite metas with no defined
  finish). Every progress bar must resolve to a reachable end.
- **Surveillance-style parent monitoring**. Földi 2024: passive parent
  monitoring flips kid motivation extrinsic. Any family/share surface must be
  _kid-initiated_, not parent-pulled.
- **Performance-contingent rewards**. Deci/Koestner/Ryan 1999: stamps on
  "perfect" gate intrinsic motivation. Reward attempts, improvement, and
  milestones instead. (Current stamps already follow this.)
- **Variable-ratio reinforcement on core progression**. Acceptable as decorative
  _celebration_ (visual effects), but never as gating.

## Repository structure

The repo is a pnpm workspace; **`packages/web` is the production entry**. Phase
0e retired both the repo-root 3-file shell and `legacy-app.js`. The browser app
boots from [`packages/web/src/main.ts`](packages/web/src/main.ts) into
[`packages/web/src/shell-bootstrap.ts`](packages/web/src/shell-bootstrap.ts).

**Engine + shell extraction status (2026-05-13)**: `@piano/core` holds the
DOM-free engine, and `packages/web/src/shell-*.ts` holds the typed browser
composition layer. `pnpm verify` currently covers lint, typecheck, 845 core
tests, 1505 web tests, and the Vite web build.

**Type-narrowing status (2026-05-12)**: `osmd-cursor.ts` and
`shell-bootstrap.ts` are zero `any` references. Across
`packages/web/src/shell-*.ts` the count is 235 (down from 331 — ~29% reduction).
The remaining `any`s are mostly factory result pass-throughs (`Tone: any`,
`osmdAdapter: any`, `audioScheduler: any`) and the `} as any);` escape hatches
at ~25 createXxx() call sites; tightening those requires coordinated edits
across each upstream factory's deps interface.

```text
piano-visualizer/
├── packages/               # ★ Monorepo source of truth
│   ├── core/               # Pure-TS engine (DOM-free, testable, shared)
│   ├── web/                # ★ Vite PWA shell — production entry
│   │   ├── index.html      # Web app shell
│   │   ├── public/         # manifest + icon + assets/
│   │   └── src/
│   │       ├── app.css     # Vite-managed stylesheet
│   │       ├── main.ts     # Module entry — pins vendor globals, boots shell
│   │       ├── shell-bootstrap.ts  # High-level typed composition point
│   │       ├── shell-*.ts  # Browser shell factories
│   │       └── adapters/   # WebMIDI / WebAudio adapters
│   ├── mobile/             # Capacitor 6 wrapper (iOS + Android)
│   └── plugins/
│       └── capacitor-piano-midi/   # Native MIDI plugin (Swift + Kotlin)
│
├── gen_cert.ps1            # Windows mkcert wrapper → cert.pfx + rootCA.cer
├── gen_cert.sh             # Mac / Linux mkcert wrapper (same outputs)
├── https_server.ps1        # PowerShell HTTPS server (port 8443) — legacy
├── https_server.mjs        # Node HTTPS server (port 8443) — cross-platform,
│                           # used by `pnpm serve`
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

Phase 0e retired `legacy-app.js` on 2026-05-09. The flow is:

- `packages/web/src/main.ts` — module entry. Imports Tone / OSMD / JSZip /
  `@piano/core` from npm, pins each to `globalThis` for diagnostics, clears
  stale pre-Vite caches, then calls `ShellBootstrap.boot()`.
- `packages/web/src/shell-bootstrap.ts` — the high-level composition point for
  state, DOM bags, shell factories, modal routing, dev-mode hooks, and start
  buttons.
- `packages/web/src/shell-*.ts` and focused `*.ts` modules — typed browser shell
  code.
- `packages/web/src/app.css` — Vite-managed stylesheet.
- `packages/web/public/` — static assets (`manifest.json`, `icon.svg`,
  `assets/*.{mxl,xml}`) copied through unchanged at build time.
- `pnpm build:web` → `packages/web/dist/` is the deployable output.

When making changes, decide:

- Hot bug fix or new feature on existing behavior → edit the focused
  `packages/web/src/*.ts` module, `shell-bootstrap.ts` if it is composition
  only, and `packages/web/src/app.css` for styling.
- New abstraction or platform-specific code → edit `packages/*` and document the
  web/mobile call sites that need it.

The 9000-line `piano-visualizer.html` monolith was split into a 3-file shell on
2026-05-05; that 3-file shell was retired into `packages/web` on 2026-05-06 once
35 modules were extracted into `@piano/core`.

## Running the Application

The app requires HTTPS for microphone access (especially on iPad/Safari) and for
Service Worker registration. Cert generation is delegated to
[mkcert](https://github.com/FiloSottile/mkcert) so Chrome accepts the cert for
SW registration over both `localhost` and the LAN IP — the previous
self-signed-leaf-with-`CA:TRUE` approach passed page navigation but failed
Chrome's stricter SW SSL validator
(`Failed to register a ServiceWorker ... An SSL certificate error occurred when fetching the script`).

Two interchangeable HTTPS servers ship in the repo. They read the same
`cert.pfx` (password `piano123` or `$PIANO_CERT_PASS`), serve
`packages/web/dist/` on port 8443, write to `server.log`, and block the same
files (cert.pfx, gen_cert scripts, server.log) from the file tree:

- `https_server.mjs` — Node.js / cross-platform. `pnpm serve` uses this.
- `https_server.ps1` — PowerShell on Windows (legacy). `pnpm serve:ps`.

### Setup (one-time per dev machine)

#### Windows

1. `scoop install mkcert` (or `choco install mkcert`, or download `mkcert.exe`
   from [releases](https://github.com/FiloSottile/mkcert/releases) and put it on
   PATH).
2. `powershell -File gen_cert.ps1` — auto-detects LAN IP, runs `mkcert -install`
   (idempotent), outputs `cert.pfx` + `rootCA.cer`.
3. `pnpm serve` — runs `pnpm build:web` then `node https_server.mjs`.

#### Mac / Linux

1. `brew install mkcert nss` (the `nss` package covers Firefox / NSS trust
   stores). On Linux: `brew install mkcert` + `sudo apt install libnss3-tools`.
2. `./gen_cert.sh` — mirrors `gen_cert.ps1` (mkcert root install, LAN-IP
   auto-detect, leaf cert + `rootCA.cer` export). Set `PIANO_CERT_PASS` to
   override the default `piano123`.
3. `pnpm serve` — same as Windows.

Both flows produce `cert.pfx` (server leaf, gitignored) and `rootCA.cer` (mkcert
root CA in DER, for iPad / Android trust install). Re-run the cert generator any
time the LAN IP changes; the root stays the same so devices that already trust
`rootCA.cer` keep working.

Access at `https://localhost:8443/` (same machine — just works) or
`https://<host-ip>:8443/` (LAN — also works because mkcert's root is in the OS
trust store).

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

### Agent / VSCode environment

- **Node + pnpm**: pinned via `.nvmrc` (Node 22.20.0) and
  `package.json#packageManager` (pnpm 9.12.3). `nvm use && corepack enable` on a
  fresh machine.
- **VSCode**: `.vscode/extensions.json` recommends ESLint, Prettier, Vitest
  Explorer, EditorConfig, and Claude Code. VSCode prompts on first open;
  `.vscode/settings.json` is gitignored so personal preferences stay local.
- **Claude Code permissions**: the project-shared baseline is
  `.claude/settings.json` (pnpm / node / git wildcards — safe). Per-machine
  permissions live in `.claude/settings.local.json` which is **gitignored**;
  Claude Code adds entries to it interactively on first use of a new tool.
  Skills live in `.claude/skills/` (markdown, cross-platform).

## Building

```bash
pnpm install
pnpm build:web                 # → packages/web/dist/
pnpm --filter @piano/web dev   # vite dev server (port 8443) for HMR
pnpm serve                     # build:web + node https_server.mjs (any OS)
pnpm serve:ps                  # build:web + PowerShell server (Windows legacy)

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

### MIDI pipeline invariants (2026-05-12)

The MIDI cluster was reshaped on 2026-05-12 to keep the connection + reflection
flow platform-uniform and predictable. The contracts the cluster now relies on:

- **`sysex:true` only on Apple mobile.** Boot-time `requestMIDIAccess` is
  `{sysex:false}` everywhere except iPad/iPhone Web MIDI Browser, where BLE-MIDI
  requires sysex. This stops Chrome from surfacing a SysEx permission prompt on
  every page load.
- **WMB quirk-pass (`state!=='connected'` loose attach) is Apple-mobile only.**
  On desktop / Android the spec-strict pass is enough; a loose attach there
  could grab transient pre-init ports (IAC Driver mid- bringup, USB still
  negotiating descriptors).
- **Visual reflection runs without a session.** `onMidiNoteOn` always updates
  `midiState.activeNotes` + the chord-window reducer so the on-screen keyboard
  lights up even before ▶ Start. Flow / combo / particle bursts / quality
  histories stay gated on `state.running`.
- **Mic muting is `enabled`-only.** Both `mic-pipeline.ts` and
  `game-state-update.ts` mute mic-driven visuals + history pushes for the entire
  duration a MIDI port is attached. The previous "MIDI active within 2 s" window
  let mic data leak back in during silent gaps between presses.
- **Reconnect is always one-shot polling.** `detach` (Web MIDI) and
  `onGattDisconnect` (BLE-MIDI) both `startMidiAutoRescan()` so a hot-replug
  recovers without user action. The poller self-stops the moment anything
  re-attaches.
- **Auto-rescan during practice still enumerates.** `isPaused()=true` (=
  `practice.enabled`) skips only the periodic `ensureAccess(true)` call (=
  force-fresh `MIDIAccess` re-request, the source of dt=50 ms frame spikes per
  server.log 03:52). Plain enumeration via the cached access still runs so
  mid-practice hot-plugs recover.
- **`attach()` respects BLE.** If `bleMidi.connected`, attach skips so a
  parallel Web MIDI port can't silently overwrite the BlePortMarker.
- **`attach()` binds the dispatcher before flipping `enabled`.** Mic pipeline
  mutes itself the instant `enabled` flips; the old ordering left a tiny window
  where a note-on between `enabled=true` and `onmidimessage=handler` was
  silently dropped.
- **Practice cursor needs `state.running` AND `practice.enabled`.** A press
  while practice is enabled but the session is paused (settings panel,
  post-section result card) no longer phantom-advances the cursor.

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
- **Section-result coaching (Knowledge of Performance)**: after a scored
  (rhythm-mode) section, the result card pairs one genuine _strength_ with one
  specific _next step_, derived from the already-computed accuracy / timing /
  note-length percentages, and tints the matching stat row.
  `PianoCore.pickSectionFocus(accPct, timingPct, durPct, stars)` is the pure
  selector (`packages/core/src/state/practice-state.ts`); `result-card.ts`
  renders it into `#resFocus`. Research basis: KP > KR for multi-dimensional
  motor tasks (systematic review, 2021); pair strength + specific strategy (EEF
  2019; Mueller & Dweck 1998 process-praise). **Faded feedback** — a clean ★3
  run returns `null` (celebrate, don't coach), per the guidance hypothesis
  (Salmoni 1984). A dimension is named as a strength only above
  `SECTION_FOCUS_STRENGTH_FLOOR` (55); below that the praise is effort-based so
  it stays calibrated to reality. The free-play HUD coaching
  (`quality.ts buildCoachingFeedback`) is the live-play sibling; this is its
  end-of-section counterpart.
- **Self-assessment (self-regulated-learning reflection)**: the result card ends
  with an optional, **non-persisted** "How did that feel?" tap (😣 / 🙂 / 😄).
  The reply is calibration-aware but never contradicts the child's own feeling
  and never shames a low score — the "earned-confidence" replies fire only on a
  scored run that actually cleared (★2+); every other path uses a reply that
  makes no score claim. The choice lives only in a `result-card.ts` closure
  (`selfAssessChoice`), resets per attempt, and is **never stored**
  (kid-initiated reflection, not surveillance — banned-list). Research: the act
  of self-rating itself raises both motivation and performance in children's
  piano practice (Int J Soc Robotics 2023) and is the self-evaluation phase of
  Zimmerman / McPherson self-regulated learning. DOM: `#resSelfAssess` (prompt +
  `#resFeelTricky` / `#resFeelOk` / `#resFeelGreat` + `#resFeelResult`);
  listeners attach once at factory creation.

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

### Score-follow controller (OSMD cursor)

OSMD's built-in `followCursor` is **OFF**;
[`packages/web/src/osmd-cursor.ts`](packages/web/src/osmd-cursor.ts) drives the
fixed `#osmdContainer` scrollTop directly. The controller (`v10`, 2026-05-12)
uses a small **"reveal active region"** policy — scroll only when the active
note region leaves a safe reading band, with guards to avoid the oscillation
that earlier scrollIntoView-based attempts (v1-v4) hit on dense passages:

- **Safe band**: top/bottom margin ≈ 14% of panel height (≥32px), so a cursor
  that's already comfortably visible doesn't trigger scroll.
- **Hysteresis 48px**: focusY must leave the band by this much before an
  `active-outside-safe` scroll fires.
- **Active-scroll cooldown 120ms**: within-system reveal scrolls throttle to
  prevent micro-thrashing.
- **Same-system reversal guard 450ms**: tall chords/beams whose active region
  toggles top/bottom can otherwise yank the panel up-down-up.
- **`belowFocus` correction**: `planPanelScroll` subtracts the active-region's
  extent below focusY from `safeBottom` so the staff bottom always lands inside
  the viewport, not 28px below.
- **Layout-graph chain**: system-change detection walks
  `GraphicalMusicSheet.MeasureList[m][0].parentMusicSystem.Id` — the same path
  OSMD's own `Cursor.update` uses internally.
- **`[CURSOR-SCROLL v10]` + `[DIAG-CURSORPOS]` diag logs**: forwarded to
  `server.log` via the remote-log gate so the in-the-wild scroll cadence stays
  inspectable (event / reason / panel + safe band + focusY / delta).

### Custom cursor overlay (SVG ground truth, 2026-05-13)

OSMD's native yellow cursor element is **hidden** and we paint our own gold
overlay (`rgba(255, 215, 0, 0.30)`) from the rendered SVG's bounding rects.
Rationale: OSMD positions its cursor from
`MusicSystem.PositionAndShape.AbsolutePosition.y + StaffLine[0].RelativePosition.y`,
but on scores with `<octave-shift>` brackets — especially nested ones
(`size="8"` plus `size="15"` plus multi-channel `number="N"`) — OSMD reserves
bracket-padding space in the system's bounding box but the renderer doesn't
shift the staff lines down by that amount. Result: the cursor lands 200–328 px
below the actual staff, drift growing as the score progresses (verified on
Liszt's _La Campanella_, 78 octave-shifts, head_dy −232 → −328 px over 56 s).

The fix mirrors **Verovio's "DOM is the source of truth" pattern** + OSMD's own
recommended approach (`graphicalNote.getSVGGElement().getBoundingClientRect()`):

- **Hide OSMD's native cursor**: `cursor.cursorElement.style.opacity = '0'` (the
  iterator still advances, only the visible bar is replaced).
- **Paint a `<div>` overlay**: lazy-created child of `#osmdContainer`,
  `position: absolute`, gold tint, no pointer events. Scrolls naturally with the
  score content because it lives inside the scrollable container.
- **X range from notes**: union of `noteToViewportRect()` over
  `GNotesUnderCursor()` — already correct in the SVG even when OSMD's data model
  is off.
- **Y range from stave path elements (stable-height, 2026-05-13)**: walk up from
  each note's `<g>` to find ancestors with VexFlow `.vf-stave` children, filter
  by horizontal overlap with the note (so only the current system contributes),
  union those Y ranges. **Y does NOT extend to noteheads** — the first iteration
  unioned with notes and made the bar pulse 120 → 460 px per cursor advance
  (note `<g>` bounding rects include stems, beams, and ledger lines that spread
  far from the staff). Pink notehead paint (`highlightCurrentNotes`) covers the
  actual sounding notes; the gold bar marks "the staff is here, look at this
  measure." Matches Soundslice's "Wide rectangle" cursor + OSMD's native type=1
  intent. Falls back to notes' Y when no `.vf-stave` is found (happy-dom tests,
  partial-load fixtures).
- **`[DIAG-OVERLAY]` log (every 16 paints)**: overlayTop/Left/W/H +
  overlayScreenTop/Bot + staffTop/Bot + panelTop/Bot + clippedAbove/Below.
  `clippedAbove`/`clippedBelow` measure overlay-vs-panel fit objectively — 0/0
  means the bar fits cleanly, anything else means the system is too tall for the
  panel and the user sees a partial view.
- **ResizeObserver self-attached**: the overlay re-paints on container resize
  (font load, orientation flip, OSMD re-render) without the shell wiring up
  anything. happy-dom / older Safari without ResizeObserver still get paint-
  on-cursor-change behavior.
- **Public `repaintCustomCursor()` API**: for callers (settings panel zoom,
  manual scroll) that need to nudge the overlay without advancing the cursor.

The previous `stretchCursorToNotes` approach (extending OSMD's native cursor's
`style.top` / `style.height`) was retired on 2026-05-12 because OSMD resets
`style.top` on each `cursor.update()` but not `style.height`, leading to
unbounded growth (production log: 130 → 12061 px over 2 min). The custom-
overlay approach owns its own element entirely, so this class of bug cannot
recur.

### Tab visibility + clock freeze

[`packages/web/src/practice-visibility.ts`](packages/web/src/practice-visibility.ts)
freezes the practice clock and pauses `Tone.Transport` on
`visibilitychange→hidden`, then rebases `startAudioTime` on
`visibilitychange→visible` so the cursor doesn't jump forward when the tab
returns. Without it, Tone's Web Audio Transport keeps advancing while the rAF
loop is throttled and the cursor catches up multiple pages at once (production
log showed a 20,837px first-scroll after ~10min of background). Verified working
in `server.log`: `[PRACTICE-VISIBILITY] hidden freeze {"elapsedMs":4858,...}`
followed by a matching resume after the user came back.

### Key Configuration

All tunable parameters are created in
[`packages/web/src/piano-config.ts`](packages/web/src/piano-config.ts). Key
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
- See the user-song modules in `packages/web/src/user-songs-*.ts`,
  `packages/web/src/shell-user-library.ts`, and
  `packages/web/src/shell-add-song.ts`.

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
