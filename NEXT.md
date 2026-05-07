# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-07** (Phase 0d batch 6 — `user-songs-ui.ts` — landed.
`legacy-app.js` is now **7,225 lines** (was 7,591 before batch 6, -366). The
Add/Manage Songs modal + start-screen tiles + library export/import all moved
into a typed module; both DOM bags (`DOM_ADDSONG` + `DOM_SECEDIT`) and the
forward-declared placeholders got consolidated into one clean wire-up block.
**924 tests across both packages** (786 core + 138 web, +31 from batch 6);
`pnpm verify` clean across 5 packages.)

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

**Status: 924/924 tests green (786 core + 138 web), 0 lint errors, 0 type
errors, 0 residual TS errors. `pnpm verify` clean.** Tag: `phase-0c.5-done`.
`legacy-app.js`: 7,225 lines (was 9,000+ at Phase 0a). Total Phase 0d extraction
so far: ≈1,775 lines moved out of the shell across 6 batches.

---

## ⏳ In queue

## 1. Phase 0d — Carve `legacy-app.js` into typed shell modules

The shell is currently **7,225 lines**. Goal: ≤200 lines, with each carved-out
module a focused, narrow-purpose `.ts` file under `packages/web/src/`. Each
extraction lands as a separate commit; `pnpm verify` + iPad A/B between each.

Batches 1-6 all landed cleanly. Remaining batches in order of size / ease:

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
- [ ] `web/event-wiring.ts` — DOM event handlers (~1500 lines, mechanical).
      Probably the biggest mechanical win left, but heterogeneous — consider
      sub-batching by feature surface (HUD buttons / lane-touch handlers /
      start-screen wiring / OSMD events / etc.) rather than one monolithic
      event-wiring.ts.
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
