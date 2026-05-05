# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-05** (29 modules extracted; render layer fully in
core; state machines for flow, encouragement, and quests done. Remaining work is
IOI/dynamics history, pitch stability, and a few audio helpers.)

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

**Status: 497/497 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Extract `state/quality-history.ts`

**What**: Move the IOI + dynamics ring buffer that feeds `state/quality.ts`.
Currently lives as `noteOnsetTimes` + `noteVelocities` arrays directly in
app.js.

**Acceptance**:

- [ ] `(state, onset) → state` reducer; bounded buffer length via opts
- [ ] Computes derived stats (IOI mean / std, velocity CV) on demand
- [ ] Tests: bounded growth, FIFO eviction, IOI rejection of duplicate onsets
      within debounce window

**Est**: 130 + 80 tests.

## 2. Extract `state/pitch-stability.ts`

**What**: Move the per-onset semitone-deviation tracker. Currently mixed in with
the onset branch in app.js — when a clean onset arrives, compares its detected
pitch to the previous and grows or decays a 0..1 stability score.

**Acceptance**:

- [ ] `applyOnsetPitch(state, pitchHz, dtSec, opts)` reducer
- [ ] `decayStability(state, dtSec, opts)` for active-but-not-onset frames
- [ ] Tests: same-pitch growth, semitone-jump decay, idle decay rate

**Est**: 100 + 50 tests.

## 3. Extract `audio/chord-window.ts`

**What**: Move the chord aggregation window — collects MIDI/onset note events
within a short tolerance and emits a chord signature once the window closes.

**Acceptance**:

- [ ] `(state, event) → state` reducer; window closes on quiet-tick
- [ ] Pure: tolerance + window length from opts
- [ ] Tests: single-note (no chord), 3-note triad, late note dropped,
      chord-after-chord debounce

**Est**: 140 + 80 tests.

---

## Backlog (rotate up as items complete)

- `render/midi-beams.ts` — sustained-note beam overlay
- `state/streak.ts` — daily-streak persistence + calendar formatting
- `state/quest-cooldown.ts` — toast spacing + completion notification queue
- `state/wake-up-flash.ts` — input-flash decay state

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
