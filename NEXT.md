# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-05** (26 modules extracted; the entire render layer is
now in core (engine, 3D particles, encouragement effects, 88-key keyboard,
practice lane, background, theme, spectrum, center-glow, stage tiers). Remaining
work is state machines (flow / encouragement / quests) and a few audio helpers.)

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

**Status: 432/432 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Extract `state/flow-meter.ts`

**What**: Move the flow + combo state machine — onset adds, silence decay, combo
window expiry, best-combo tracking. Currently scattered across the loop's "good
note" branch in app.js.

**Acceptance**:

- [ ] `(state, event) → { state, events }` reducer over MIDI/onset events
- [ ] Pure: silence decay rate, combo window, peak-tracking all from opts
- [ ] Tests: combo accumulation, window expiry, decay during silence, best-combo
      monotonicity, flow ceiling at 100

**Est**: 220 + 130 tests.

## 2. Extract `state/encouragement.ts`

**What**: Move the tier escalator that picks the right Nice/Great/Awesome
message at each combo milestone, and dispatches the matching effect.

**Acceptance**:

- [ ] `pickTier(combo, opts)` returns the active tier or null
- [ ] `applyEncouragement(state, combo, opts)` returns
      `{ state, events: ['effect:starShower'], tier: 'great' }`
- [ ] Tier table + thresholds injected via opts (no CONFIG dep)
- [ ] Tests: threshold transitions, no-tier below first threshold, effect-name
      mapping, debounce within same tier

**Est**: 160 + 90 tests.

## 3. Extract `state/quest-tracker.ts`

**What**: Move the v10 magic-quests engine — given current QUESTS table +
runtime state slice, returns active quest + completion progress + reward events
on transition.

**Acceptance**:

- [ ] `(state, questsState) → { questsState, completedThisTick: QuestId[] }`
      reducer
- [ ] No DOM, no toast emission (caller handles UI)
- [ ] QUESTS table injected (already in core/config.ts)
- [ ] Tests: condition evaluation, monotonic completion, no double-completion,
      multi-quest completion in single tick

**Est**: 180 + 100 tests.

---

## Backlog (rotate up as items complete)

- `audio/chord-window.ts` — chord aggregation + progression detection
- `state/quality-history.ts` — IOI / dynamics ring buffer feeding quality.ts
- `render/midi-beams.ts` — sustained-note beam overlay
- `state/streak.ts` — daily-streak persistence + calendar formatting

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
