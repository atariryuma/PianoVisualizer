# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-05** (24 modules extracted; engine, 3D particles,
encouragement effects, 88-key keyboard, practice lane, background composites,
theme tables, and frequency spectrum now in core. Remaining render is
center-glow and stage banner.)

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

**Status: 404/404 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Extract `render/center-glow.ts`

**What**: Move the energy-reactive radial gradient (the soft glow at canvas
center that swells with RMS / quality).

**Acceptance**:

- [ ] `drawCenterGlow(ctx, opts)` — pure
- [ ] Takes `screenW/H/intensity/themeColor` — no state ownership
- [ ] Tests: intensity scaling, palette injection, no-op at 0

**Est**: 90 + 40 tests.

## 2. Extract `render/stage.ts`

**What**: Move stage tier banner + transitions (Awakening → Blooming → Aurora →
Cosmos → Radiance → Legend). Animates a top-of-screen banner when the flow tier
changes.

**Acceptance**:

- [ ] `STAGES` exported as a readonly tuple of `{ id, nameKey, threshold }`
- [ ] `stageForFlow(flow)` returns the active stage (pure)
- [ ] `drawStageBanner(ctx, opts)` paints the transition flash + label
- [ ] Tests: tier mapping, threshold edges, banner visibility window

**Est**: 140 + 70 tests.

## 3. Extract `state/flow-meter.ts`

**What**: Move the flow + combo state machine — onset adds, silence decay, combo
window expiry, best-combo tracking. Currently scattered across the loop's "good
note" branch in app.js.

**Acceptance**:

- [ ] `(state, event) → { state, events }` reducer over MIDI/onset events
- [ ] Pure: silence decay rate, combo window, peak-tracking all from opts
- [ ] Tests: combo accumulation, window expiry, decay during silence, best-combo
      monotonicity, flow ceiling at 100

**Est**: 220 + 130 tests.

---

## Backlog (rotate up as items complete)

- `state/encouragement.ts` — tier escalator (Nice → Awesome) + dispatch
- `state/quest-tracker.ts` — quest progress + completion accounting
- `audio/chord-window.ts` — chord aggregation + progression detection
- `state/quality-history.ts` — IOI / dynamics ring buffer feeding quality.ts

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
