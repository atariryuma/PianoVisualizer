# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Piano Visualizer is a real-time piano practice app for **learners of any age** —
originally designed for upper-elementary children, and the kid-safe design (see
the banned-list below) is retained as a product value ("the honest, no-ads,
no-tracking, on-device practice app") for a broad audience of beginner-to-
intermediate self-learners, students, and teachers. It uses microphone audio
analysis (YIN pitch detection + multi-feature onset gating) and Web MIDI to
detect piano notes, then renders responsive visual effects on a canvas. The UI
is trilingual (EN / 日本語 / Deutsch).

**Release strategy (2026-07-20): iOS-first, App Store 4+ / Education category —
NOT the strict "Kids" category.** Rationale: the Kids category's requirements
(mandatory parental gates, no third-party analytics/ads, COPPA age-gating) are
heavy, and this app collects essentially no data (on-device processing, no
accounts, no third-party SDKs, only a SHA-pinned static library fetch), so a 4+
Education listing keeps compliance light while broadening the audience — without
giving up the kid-safe design. Keep the banned-list; keep "no ads / no tracking
/ audio stays on device" as the headline promise.

Version: **1.0** is the store marketing version (iOS `MARKETING_VERSION`).
Internal package/dev version tracks separately in `package.json` (0.14.x).

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
composition layer. `pnpm verify` currently covers lint, typecheck, 863 core
tests, 1542 web tests, and the Vite web build.

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
pnpm cap:ios                   # opens iOS project (generated, hardware-verified)
pnpm cap:android               # ⚠ fails until `cap add android` is run — the
                               #   Android host app is not generated yet
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
- **Growth chart (trajectory)**: `result-card.ts drawHistoryChart` plots the
  last 8 attempts as two trend lines — **accuracy (gold, primary, 3-star
  halos)** and **timing (cyan)** — over a shared 0–100% axis, with a legend. The
  caption is **self-referenced and growth-framed**: new personal best → "🌟 Best
  yet!", else gain-vs-first-attempt → "↑ +X%", else "Keep going". The old red "↓
  -X%" loss-frame was removed — there is no "you went down" branch by design
  (banned-list: no shame/loss copy, SDT competence).
- **Pre-flight scaffold (feed-forward)**: the song panel shows a gentle "Tricky
  last time? Tap 🎧 Listen first" nudge **above the Start button** when the
  selected section's recent attempts ended in a run of misses — scaffolding
  _before_ the next try, not only after failing again (Hattie & Timperley 2007
  "where to next?"). `PianoCore.needsPreflightScaffold(historyStars)` (pure;
  trailing 0-star run ≥ 2, same threshold as the result-card escalation) drives
  it; `song-panel-render.ts` renders `#songPreflightHint`. Hidden in Listen mode
  (already listening) and clears the moment a star is earned. Kid-initiated, no
  shame copy. The nudge is **adaptive**:
  `PianoCore.planSectionScaffold(history)` escalates with struggle depth — a
  shallow run (2) gets the low-friction "Listen first"; a deeper run (≥3)
  escalates to the strategy matched to the latest attempt's bottleneck —
  **one-hand** when notes are still missed (accuracy < 70), **slower tempo**
  when notes land but timing lags (the render falls back to one-hand when
  already at the slowest tempo). Mirrors Wood/Bruner/Ross 1976 (more support the
  more the learner struggles). A one-tap `#songPreflightApply` button
  **applies** the suggestion (sets mode / hand filter / tempo, then re-renders)
  — all three mutations are side-effect-free, matching the manual rows; autonomy
  is kept (the kid can still change it by hand).
- **Weekly growth rollup (journal)**:
  `PianoCore.weeklyLibraryGrowth(sections, weekStartMs)` (pure) averages each
  section's accuracy/timing gain (latest − first) across the current ISO week
  and reports the larger **positive** axis; the journal's `renderLibraryRollup`
  shows a "📈 This week: Accuracy/Timing +Xpt" row **only when the kid
  improved** (axis null → no row). Positive-only by design — no "you went down"
  line (banned-list; SDT competence). Lifts the per-section growth framing to
  the whole library. (Both the aggregation and the journal render are
  unit-tested — `journal-modal.test.ts` drives the real `render()` through
  `@piano/core` and asserts the growth row + its positive-only suppression.)

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

### Multi-part scores — backing-part playback（おともパート, 2026-07-19）

Multi-part MusicXML (e.g. P1=Voice + P2=Piano 歌+伴奏譜) auto-splits into "your
part" and "backing parts" at extraction time — the SmartMusic My
Part/Accompaniment model, deliberately without a mixer UI (kid-simple):

- **Part classification**: `pickPracticeStaffPlan`
  ([note-extractor.ts](packages/web/src/note-extractor.ts)) reads
  `osmd.Sheet.Instruments` and scores each part (2 staves +4, keyboard-ish name
  +2, GM program 1–8 +2). Best keyboard-ish part = practice part (hand from
  staff order **within** that part); all other parts = backing. No keyboard-ish
  part or single-part score → everything is practice (legacy behavior, zero
  regression).
- **Data**: backing notes live in `song.backingNotes` (tie-merged separately,
  repeat-expanded via the same playback order). They never enter
  `practice.sectionNotes`, the lane, scoring, or progress counts.
- **Playback**: `buildBackingNotes(sectionIdx | null)` (section-notes.ts) builds
  the timeline (same tempo scaling + count-in anchor as practice notes;
  full-song mode shares `fullSongAnchorSec` so a vocal pickup before the piano
  shifts both timelines consistently). `scheduleSectionPlayback` plays it on a
  dedicated `melody` PolySynth (soft sine, -17dB ≈ 70% of the ghost piano) in
  **listen AND rhythm** modes, independent of the ghost toggle — the kid plays
  the piano part, the app sings the melody. Guided (wait) mode has no transport,
  so no backing there. Voice timbre is piano-family on purpose: GM 53/54 synth
  voices sound worse than a clean pitched tone (SmartMusic precedent).
- **Extraction invariants**: the extraction walk temporarily sets
  `EngravingRules.CursorIgnoreRepetitions = true` (restored in finally) so
  `|: :|` doesn't double-extract; tie ends are detected via `Tie.Notes[last]`
  (OSMD 1.9 has no `Tie.EndNote`).

## User-added songs

Added 0.13: users can browse and import MusicXML scores (`.mxl` / `.musicxml`).
**Score library (2026-07-21): self-owned + bundled.** The former
`musetrainer/library` jsDelivr dependency was removed — it shipped no LICENSE
and mislabeled copyrighted works (e.g. de Senneville's 1978 "Mariage d'Amour" as
PD; see [`docs/LICENSES/README.md`](docs/LICENSES/README.md)). The in-app "Add a
song" catalog is now the app's OWN transcriptions of public-domain compositions,
generated by [`scripts/gen-library-scores.mjs`](scripts/gen-library-scores.mjs)
into `packages/web/public/assets/library/*.musicxml` + `manifest.json`, read by
[`packages/web/src/bundled-library.ts`](packages/web/src/bundled-library.ts).
Composition = PD worldwide; engraving = authored by us → clean in every
jurisdiction, and the app fetches no external catalog at runtime (works
offline). **Do not re-introduce a runtime dependency on an outside score repo.**
Users can still paste a URL to import their own score (their responsibility;
stored on- device only).

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
[`packages/plugins/capacitor-piano-midi/`](packages/plugins/capacitor-piano-midi/).

**Platform status (2026-07-20 — iOS-first release):**

- **iOS: shipped-quality.** The Capacitor app under `packages/mobile/ios/` is
  generated, builds, and was **hardware-verified on a physical iPad Pro 12.9"
  (3rd gen) / iPadOS 26.5.2**: mic detection, BLE-MIDI (Roland GO:PIANO88 via
  the OS pairing sheet `CABTMIDICentralViewController`), and the splash screen
  all work. Native MIDI reaches the shell through the Web-MIDI polyfill
  (`packages/web/src/native-midi-polyfill.ts`), not the `packages/mobile/src`
  adapters (those were removed — the shipped bundle is `packages/web`'s Vite
  build).
- **Android: NOT generated yet.** `packages/mobile/android/` does not exist
  (`cap add android` has not been run), so `pnpm cap:android` will fail until it
  is. The plugin's Kotlin side (`android.media.midi` + `BluetoothLeScanner`) is
  implemented but has no host app, and **native BLE-MIDI is not wired to JS on
  Android** (`native-midi-polyfill.ts` only wires `showBleMidiPairing` for iOS;
  Android would need scanBle/connectBle + a device-picker UI). Treat Android as
  a future milestone, not a shippable target.
- **No background audio.** This is a foreground-only practice app;
  `UIBackgroundModes` was intentionally removed from `Info.plist` (it was
  declared but never backed by an `AVAudioSession` setup). If lock-screen /
  background continuation is ever needed, add both the plist key AND a real
  `AVAudioSession` category — don't re-add the declaration alone (App Store
  review flags a declared-but-unimplemented background mode).
