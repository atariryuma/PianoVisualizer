# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-08** (active session). Layer C autonomous-bench
landed. `legacy-app.js` is **6,794 lines**. **1,238 tests** (786 core + 452
web). `pnpm verify` clean.

**Headless bench harness — landed batch 17 (autonomous feedback loop)**:
`pnpm --filter @piano/web bench` from a single Bash call spawns vite preview,
launches headless Chrome via puppeteer-core, navigates to
`?dev=1&autorun=bench&webhook=...`, polls until the report lands, and prints
markdown to stdout. The vite plugin (`packages/web/vite-bench-plugin.ts`)
exposes `/__bench/{result,last,clear}` middleware; dev-mode.ts adds
`?autorun=bench` + `?webhook=URL` URL-param hooks. Closes the "deploy → check by
hand" cycle — the LLM driving the codebase can now verify end-to-end behaviour
after every batch in ~5 s. **Verified 11/11 bench passing post-extraction at
every commit.**

**Recent batches (this session)**:

- batch 17 — autonomous bench harness (vite plugin + puppeteer + dev-mode
  autorun/webhook). +7 dev-mode tests, no shell change.
- batch 18 — `mic-pipeline.ts`: YIN throttle + AGC + game-state + mic-driven
  note spawn (-41 lines from shell, +28 tests).
- batch 19 — `midi-handlers.ts`: onMidiNoteOn/Off/CC + spawnMidiNoteVisuals (-26
  lines from shell, +29 tests).

**iPad verification — landed earlier**:
`https://atariryuma.github.io/PianoVisualizer/?dev=1` activates a hidden toolbar
with **🧪 Self-test** (10 pass/fail checks for every extracted module's
globalThis presence, DOM bag completeness, AudioContext, Web MIDI, Service
Worker, Wake Lock, prefs round-trip), **📊 Diag** (read-only state snapshot, 1Hz
refresh), **🎯 Benchmark** (11 long-running behavioural probes), **📋 Copy**
(markdown report → clipboard for chat paste, includes build SHA + UA), and **✕**
(deactivate). Persistent via localStorage; `?dev=0` clears.

---

## ✅ Completed (rotated out — see ROADMAP 0b.2)

| #   | Module                        | Tests | Where                                           |
| --- | ----------------------------- | ----- | ----------------------------------------------- |
| 1   | `audio/chord.ts`              | 12    | `packages/core/src/audio/chord.ts`              |
| 2   | `audio/yin.ts`                | 16    | `packages/core/src/audio/yin.ts`                |
| 3   | `audio/spectral.ts`           | 18    | `packages/core/src/audio/spectral.ts`           |
| 4   | `audio/harmonicity.ts`        | 7     | `packages/core/src/audio/harmonicity.ts`        |
| 5   | `audio/audio-context.ts`      | 10    | `packages/core/src/audio/audio-context.ts`      |
| 6   | `audio/agc.ts`                | 13    | `packages/core/src/audio/agc.ts`                |
| 7   | `audio/onset.ts`              | 11    | `packages/core/src/audio/onset.ts`              |
| 8   | `library/musicxml-meta.ts`    | 4     | `packages/core/src/library/musicxml-meta.ts`    |
| 9   | `library/auto-section.ts`     | 11    | `packages/core/src/library/auto-section.ts`     |
| 10  | `library/user-songs.ts`       | 15    | `packages/core/src/library/user-songs.ts`       |
| 11  | `state/session-confidence.ts` | 17    | `packages/core/src/state/session-confidence.ts` |
| 12  | `state/quality.ts`            | 27    | `packages/core/src/state/quality.ts`            |
| 13  | `i18n/`                       | 23    | `packages/core/src/i18n/index.ts` + strings.ts  |
| 14  | `config.ts`                   | 17    | `packages/core/src/config.ts`                   |
| 15  | `state/midi-state.ts`         | 21    | `packages/core/src/state/midi-state.ts`         |
| 16  | `state/practice-state.ts`     | 41    | `packages/core/src/state/practice-state.ts`     |
| 17  | `render/particles.ts`         | 34    | `packages/core/src/render/particles.ts`         |
| 18  | `render/ripples.ts`           | 10    | `packages/core/src/render/ripples.ts`           |
| 19  | `render/effects.ts`           | 17    | `packages/core/src/render/effects.ts`           |
| 20  | `render/keyboard.ts`          | 16    | `packages/core/src/render/keyboard.ts`          |
| 21  | `render/lane.ts`              | 18    | `packages/core/src/render/lane.ts`              |
| 22  | `render/background.ts`        | 17    | `packages/core/src/render/background.ts`        |
| 23  | `render/theme.ts`             | 17    | `packages/core/src/render/theme.ts`             |
| 24  | `render/spectrum.ts`          | 12    | `packages/core/src/render/spectrum.ts`          |
| 25  | `render/center-glow.ts`       | 9     | `packages/core/src/render/center-glow.ts`       |
| 26  | `render/stage.ts`             | 19    | `packages/core/src/render/stage.ts`             |
| 27  | `state/flow-meter.ts`         | 27    | `packages/core/src/state/flow-meter.ts`         |
| 28  | `state/encouragement.ts`      | 22    | `packages/core/src/state/encouragement.ts`      |
| 29  | `state/quest-tracker.ts`      | 16    | `packages/core/src/state/quest-tracker.ts`      |
| 30  | `state/quality-history.ts`    | 16    | `packages/core/src/state/quality-history.ts`    |
| 31  | `state/pitch-stability.ts`    | 26    | `packages/core/src/state/pitch-stability.ts`    |
| 32  | `audio/chord-window.ts`       | 16    | `packages/core/src/audio/chord-window.ts`       |
| 33  | `state/wake-up-flash.ts`      | 14    | `packages/core/src/state/wake-up-flash.ts`      |
| 34  | `state/streak.ts`             | 19    | `packages/core/src/state/streak.ts`             |
| 35  | `render/midi-beams.ts`        | 8     | `packages/core/src/render/midi-beams.ts`        |
| 36  | `library/score-timing.ts`     | 16    | `packages/core/src/library/score-timing.ts`     |
| 37  | `library/measure-timing.ts`   | 13    | `packages/core/src/library/measure-timing.ts`   |
| 38  | `library/playback-order.ts`   | 17    | `packages/core/src/library/playback-order.ts`   |
| 39  | `web/audio-scheduler.ts`      | —     | `packages/web/src/audio-scheduler.ts`           |
| 40  | `library/merge-tied-notes.ts` | 15    | `packages/core/src/library/merge-tied-notes.ts` |
| 41  | `library/diag-load.ts`        | 15    | `packages/core/src/library/diag-load.ts`        |
| 42  | `state/practice-progress.ts`  | 15    | `packages/core/src/state/practice-progress.ts`  |
| 43  | `web/note-extractor.ts`       | —     | `packages/web/src/note-extractor.ts`            |
| 44  | shape typedefs (state etc.)   | —     | `packages/web/src/legacy-app.js` (top of file)  |
| 45  | `@param` sweep (60+ helpers)  | —     | `packages/web/src/legacy-app.js`                |
| 46  | Phase 0c.5 — `// @ts-check`   | —     | `packages/web/src/legacy-app.js` (top of file)  |
| 47  | `web/wakelock.ts`             | —     | `packages/web/src/wakelock.ts`                  |
| 48  | web tests (3 shell modules)   | 46    | `packages/web/tests/*.test.ts`                  |
| 49  | `web/section-editor.ts`       | 20    | `packages/web/src/section-editor.ts`            |
| 50  | `web/settings-panel.ts`       | 20    | `packages/web/src/settings-panel.ts`            |
| 51  | i18n wire-up via `createT`    | —     | `packages/web/src/legacy-app.js` (-301 lines)   |
| 52  | `web/audio-init.ts`           | 21    | `packages/web/src/audio-init.ts`                |
| 53  | feat: 全曲再生 listen toggle  | —     | `packages/web/src/legacy-app.js` (+88 lines)    |
| 54  | `web/user-songs-ui.ts`        | 31    | `packages/web/src/user-songs-ui.ts`             |
| 55  | `web/theme-controls.ts`       | 17    | `packages/web/src/theme-controls.ts`            |
| 56  | `web/practice-flow.ts`        | 21    | `packages/web/src/practice-flow.ts`             |
| 57  | `web/song-panel-controls.ts`  | 12    | `packages/web/src/song-panel-controls.ts`       |
| 58  | `web/song-panel-render.ts`    | 31    | `packages/web/src/song-panel-render.ts`         |
| 59  | `web/practice-tick.ts`        | 20    | `packages/web/src/practice-tick.ts`             |
| 60  | `web/result-card.ts`          | 27    | `packages/web/src/result-card.ts`               |
| 61  | `web/session-summary.ts`      | 17    | `packages/web/src/session-summary.ts`           |
| 62  | `web/render-frame.ts`         | 18    | `packages/web/src/render-frame.ts`              |
| 63  | `web/dev-mode.ts`             | 24    | `packages/web/src/dev-mode.ts` (in-app testing) |
| 64  | `web/render-mid.ts`           | 14    | `packages/web/src/render-mid.ts`                |
| 65  | `web/render-late.ts`          | 16    | `packages/web/src/render-late.ts`               |
| 66  | `web/practice-lane.ts`        | 19    | `packages/web/src/practice-lane.ts`             |
| 67  | `web/section-editor.ts`       | 20    | `packages/web/src/section-editor.ts`            |
| 68  | `web/midi-render.ts`          | 9     | `packages/web/src/midi-render.ts`               |
| 69  | bench harness (autorun+wh)    | 7     | `packages/web/vite-bench-plugin.ts` + bench.mjs |
| 70  | `web/mic-pipeline.ts`         | 28    | `packages/web/src/mic-pipeline.ts`              |
| 71  | `web/midi-handlers.ts`        | 29    | `packages/web/src/midi-handlers.ts`             |

**Status: 1,238/1,238 tests green (786 core + 452 web), 0 lint errors, 0 type
errors, 0 residual TS errors. `pnpm verify` clean.** Bench: 11/11 passed, frame
avg 7.0ms. `legacy-app.js`: 6,794 lines (was 9,000+ at Phase 0a; 6,861 at
session start last cycle).

---

## ⏳ In queue

## 1. Phase 0d — Carve `legacy-app.js` into typed shell modules

The shell is currently **6,683 lines**. Goal: ≤200 lines, with each carved-out
module a focused, narrow-purpose `.ts` file under `packages/web/src/`. Each
extraction lands as a separate commit; iPad verification now runs via the in-app
**🧪 Self-test** at `?dev=1` (no manual A/B checklist needed for the mechanical
wire-up checks).

Batches 1-12 all landed cleanly. Remaining work:

- [x] `web/section-editor.ts` — section-edit modal (landed batch 2)
- [x] `web/settings-panel.ts` — settings panel + persist (landed batch 3)
- [x] i18n wire-up via `PianoCore.createT()` (landed batch 4, -301 lines)
- [x] `web/audio-init.ts` — AudioContext factory + recovery seam (landed batch
      5, -28 lines, +21 tests). Note: `initAudio` / `acquireMic` / `suspendMic`
      / `resumeMic` and the devicechange + visibilitychange listeners
      deliberately stayed in the shell — they're tied to the state-machine and
      reach into too many shell-private vars to extract without churning every
      audio-node read across the rest of the file.
- [x] `web/user-songs-ui.ts` — Add/Manage Songs modal + start-screen tiles +
      library export/import (landed batch 6, -366 lines, +31 tests).
- [x] `web/theme-controls.ts` — theme bar + synesthesia toggle + lang toggle
      (landed batch 7a, -42 lines, +17 tests).
- [x] `web/practice-flow.ts` — ptbQuit / ptbToggleOsmd / result-card buttons /
      sumClose / 🏠 Title buttons / returnToTitle / transitionToSection (landed
      batch 7b, -46 lines, +21 tests).
- [x] `web/song-panel-controls.ts` — hand row + mode row + ghost / metronome /
      full-song toggles + songBack (landed batch 7c, -10 lines, +12 tests).
      Note: songStart + startBtn deliberately stayed in the shell — they pull in
      initAudio, showRunningUI, initBgStars, requestAnimationFrame(loop), and
      startPracticeSection, which are practice-tick / render-loop batch
      concerns.
- [x] `web/song-panel-render.ts` — the 150-line renderSongPanel (header / streak
      / BPM hint / tempo row / section list / mode + hand active / toggle
      visibility / start-button copy) (landed batch 7d, -118 lines, +31 tests).
- [x] `web/practice-tick.ts` — per-frame updatePractice hot path: diag log,
      auto-mark missed / auto-advance, mic-onset matching, cursor skip, progress
      HUD, section-complete + 600ms grace timer with race-guard (landed batch 8,
      -93 lines, +20 tests).
- [x] `web/result-card.ts` — renderResultCard + completePracticeSection +
      drawHistoryChart (landed batch 10, -213 lines, +27 tests). Forward-
      declared placeholders + thunked practice-tick wiring so the deps DAG stays
      acyclic even though result-card is declared after the practice-tick
      wire-up.
- [x] `web/session-summary.ts` — saveBestScores + renderSessionSummaryText +
      showSessionSummary + drawRadarChart (landed batch 11, -193 lines, +17
      tests). The shared formatTime / updatePlayTime / setupHiDPICanvas helpers
      stay in legacy-app.js (used by both result-card and the loop) under a
      'Shared helpers' header right above the wire-up.
- [ ] `web/render-loop.ts` — `loop()` frame composer (~240 lines). Hardest
      remaining batch: ~50 deps (every render layer + state + MIDI + practice
      tick). Recommend sub-batching by render phase (background fade +
      bg-stars + aurora + ground flowers; center-glow + spectrum; ripples +
      beams + particles + keyboard; HUD + practice lane) rather than one mega
      extraction.
- [ ] More event-wiring sub-batches (~1100 lines remain). Highest-ROI
      candidates: ptbInput (MIDI rescan toggle); songStart + startBtn (boot
      coupling, currently tied to initAudio + requestAnimationFrame(loop));
      BLE-MIDI listener cluster; OSMD click-to-seek in lane code.
- [ ] `web/practice-tick.ts` — `updatePractice` hot path (~250 lines, mid-high)
- [ ] `web/render-loop.ts` — `loop()` frame composer (~500 lines, hardest)

**Acceptance per extraction**:

- [ ] New `.ts` file under `packages/web/src/` with focused exports
- [ ] Wired into `main.ts` (typed import) + pinned to `globalThis` if shell
      needs
- [ ] Old block deleted from `legacy-app.js`
- [ ] `pnpm verify` clean
- [ ] iPad practice-mode A/B (or desktop Chrome equivalent) — section start +
      hit detection + scoring all work end-to-end

**DoD for Phase 0d**: `wc -l packages/web/src/legacy-app.js` ≤ 200.

**WMB-workaround tagging note** (added 2026-05-07): the iPad / Web MIDI
Browser-specific MIDI hacks in `legacy-app.js` are bracketed by
`// @WMB-WORKAROUND` … `// /@WMB-WORKAROUND` markers. They're temporary
scaffolding until Phase 1 ships the Capacitor native build (which uses
`packages/plugins/capacitor-piano-midi/` instead of Web MIDI Browser). After
Phase 1 lands, run

```bash
grep -nE "@WMB-WORKAROUND" packages/web/src/legacy-app.js
```

and delete each tagged block. Universal MIDI improvements that sit next to the
WMB blocks (auto-rescan poller, visibility-resume re-enumeration, badge waiting
state, manual rescan tap) STAY — those help every platform.

**Note for next agent — audio-init is next, but read this first**: the four
batches that landed (wakelock, section-editor, settings-panel, i18n) followed
the same deps-injection pattern. `audio-init` is harder than its predecessors
because the audio nodes (`audioCtx`, `gainNode`, `analyser`, `dataArray`,
`freqArray`, `onsetAnalyser`, `onsetDataArray`) are read from many callsites
across the shell, not just `initAudio` + `recoverAudioContext`. Two viable
shapes:

1. **Return-and-assign**: `createAudio(deps)` returns the seven node handles for
   the shell to assign to its `let` locals. Clean for first-init but
   `recoverAudioContext` mutates `audioCtx` mid-session — it would need to live
   in the same module and accept a mutable-ref bag for the nodes it re-creates.
2. **Mutable-ref bag throughout**: pass `{ audioCtx, gainNode, ... }` in/out;
   shell reads `nodes.audioCtx` everywhere. Bigger callsite churn but cleaner
   ownership.

Either way, **iPad A/B is mandatory before pushing**: AudioContext recreation on
`visibilitychange` and `devicechange` (mkpts 4367..4445 in the current shell) is
the highest-stakes seam in the whole app. WebKit Bugs 237878 + 261554 mean any
half-working recovery results in dead audio post-background.

The wakelock extraction commit (`fa479f4`) is the canonical pattern for the
mechanical parts. Replicate:

1. Read the legacy code block in `legacy-app.js`.
2. Create `packages/web/src/<name>.ts` with explicit exports and
   `@piano/core`-compatible types. Keep deps narrow — pass them in via function
   args or an init object rather than reaching for shell globals from inside the
   module.
3. Add the import + `globalThis` pin in `packages/web/src/main.ts`. Avoid
   identifier names that clash with lib.dom (e.g. `WakeLock` → `PianoWakeLock`).
4. In `legacy-app.js`, replace the inline implementation with thin
   alias-from-global forwarders so the rest of the shell keeps calling the short
   names.
5. `pnpm verify` clean.
6. **iPad practice-mode A/B**: load a song, start a section, play through to
   completion, verify scoring + section-result modal. Especially watch the SW
   console (some extractions have triggered SW SecurityErrors).

## 2. Phase 0e — Retire `legacy-app.js` entirely

Once `legacy-app.js` is ≤200 lines, fold the residual into `main.ts` and delete
the file. Detailed checklist in
[ROADMAP.md](ROADMAP.md#phase-0e--retire-legacy-appjs-entirely).

**Tag at completion: `phase-0e-done`.** This is the agreed waypoint before Phase
1 (Capacitor first install, blocked on Mac + Xcode + Android Studio).

---

## Backlog (rotate up as items complete)

(empty — Phase 0d / 0e dominate near-term planning. The next major non-0d/0e
work is Phase 1 Capacitor install, but that needs Mac + Xcode + Android Studio,
so it's blocked on human hardware. See
[ROADMAP.md](ROADMAP.md#phase-1--capacitor-first-install--blocked-on-human).)

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
