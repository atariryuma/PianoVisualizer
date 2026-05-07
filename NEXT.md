# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-07** (Phase 0c.5 ✅ DONE — `// @ts-check` is now ON at
the top of `packages/web/src/legacy-app.js`. Residual TS error count: **1,041 →
0** (-100%). Tag: `phase-0c.5-done`. The 7,624-line legacy shell type-checks
under `pnpm typecheck` as part of the regular verify cycle — regressions error
at typecheck time, no silent re-introduction possible. Wakelock first leaf
extraction landed (`packages/web/src/wakelock.ts`). Vitest infra in
`@piano/web` + 46 unit tests for the 3 typed shell modules (audio-scheduler,
note-extractor, wakelock) closed Phase 0c.5's testing gap. **832 tests across
both packages**; `pnpm verify` clean across 5 packages. CI green; deployed to
<https://atariryuma.github.io/PianoVisualizer/>.)

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

**Status: 832/832 tests green (786 core + 46 web), 0 lint errors, 0 type errors,
0 residual TS errors. `pnpm verify` clean.** Tag: `phase-0c.5-done`.

---

## ⏳ In queue

## 1. Phase 0d — Carve `legacy-app.js` into typed shell modules

The shell is currently 7,708 lines. Goal: ≤200 lines, with each carved-out
module a focused, narrow-purpose `.ts` file under `packages/web/src/`. Each
extraction lands as a separate commit; `pnpm verify` + iPad A/B between each.

Wakelock landed in this session (commit `fa479f4`). Remaining batches in order
of size / ease:

- [ ] `web/section-editor.ts` — section-edit modal (~300 lines, low difficulty)
- [ ] `web/settings-panel.ts` — settings panel + persist (~500 lines, low)
- [ ] `web/audio-init.ts` — getUserMedia + AudioContext + visibility-recovery
      seam (~250 lines, mid)
- [ ] `web/user-songs-ui.ts` — Add/Manage Songs modal (~700 lines, mid)
- [ ] `web/event-wiring.ts` — DOM event handlers (~1500 lines, mechanical)
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

**Note for next agent / picking up from `phase-0c.5-done`**: the wakelock
extraction commit (`fa479f4`) is the canonical pattern. Replicate:

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
