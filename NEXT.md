# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-06** (32 modules extracted; the per-onset reducer trio
— quality-history, pitch-stability, chord-window — is now in core. Next batch
focuses on persistence + small render adapters before the Phase 0b.3 dual-build
wire-up.)

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

**Status: 643/643 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Extract `state/wake-up-flash.ts`

**What**: Move the input-flash decay. Currently `state.inputFlash` is a 0..1
scalar set to 0.2 on flow drops + first-key feedback, multiplied by 0.85 each
frame in the canvas overlay path.

**Acceptance**:

- [ ] `triggerWakeUpFlash(state, opts)` and
      `decayWakeUpFlash(state, dtSec, opts)`
- [ ] Frame-rate-independent decay (half-life or exponential per second, not
      per-frame multiplier — same lesson as pitch-stability's idle decay)
- [ ] Tests: trigger sets to peak, decays to ~0 within a target window, repeated
      triggers don't compound past 1.0

**Est**: 60 + 40 tests.

## 2. Extract `state/streak.ts`

**What**: Move the daily-streak counter. Currently the
`practice.progress.streakDays` array and `streakCount` are computed inline in
the practice-state persistence layer (date-list dedupe → backward walk for
consecutive-day count). Pure date math that belongs in core.

**Acceptance**:

- [ ] `recordPracticeDay(state, todayIso)` adds today's date if absent
- [ ] `computeStreakCount(state, todayIso)` returns the current consecutive-day
      count (the shell only stores the day list; count is derived)
- [ ] Tests: same-day idempotent, gap > 1 day breaks streak, week-long streak
      counts correctly across month boundaries, future-date guard

**Est**: 90 + 50 tests.

## 3. Extract `state/quest-cooldown.ts`

**What**: Move the toast-completion queue + spacing. Currently the quest
completion celebration is gated by an ad-hoc `lastQuestCheckMs + 2500` delay
inside quest-tracker. A dedicated cooldown reducer would let multiple quests
queue up cleanly when several conditions fire close together (e.g. flow 50 +
combo 30 simultaneously).

**Acceptance**:

- [ ] `(state, completionEvent) → state` queue reducer
- [ ] `popReadyToast(state, timeMs, opts)` returns the next toast iff the
      previous toast's display window has elapsed
- [ ] Tests: empty queue → no toast, two-quest queue → spaced emission, drain
      order is FIFO

**Est**: 110 + 60 tests.

---

## Backlog (rotate up as items complete)

- `render/midi-beams.ts` — sustained-note beam overlay (per-key vertical light
  beams while held; currently ad-hoc canvas drawing in the lane renderer)

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
