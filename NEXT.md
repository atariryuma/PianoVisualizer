# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-05** (after 11-module extraction including the
session-confidence state machine).

---

## ✅ Completed (rotated out — see ROADMAP 0b.2)

| #   | Module                        | Tests | Where                                           |
| --- | ----------------------------- | ----- | ----------------------------------------------- |
| 1   | `audio/chord.ts`              | 12    | `packages/core/src/audio/chord.ts`              |
| 2   | `audio/yin.ts`                | 16    | `packages/core/src/audio/yin.ts`                |
| 3   | `audio/spectral.ts`           | 18    | `packages/core/src/audio/spectral.ts`           |
| 4   | `audio/harmonicity.ts`        | 6     | `packages/core/src/audio/harmonicity.ts`        |
| 5   | `audio/audio-context.ts`      | 8     | `packages/core/src/audio/audio-context.ts`      |
| 6   | `audio/agc.ts`                | 13    | `packages/core/src/audio/agc.ts`                |
| 7   | `audio/onset.ts`              | 11    | `packages/core/src/audio/onset.ts`              |
| 8   | `library/musicxml-meta.ts`    | 4     | `packages/core/src/library/musicxml-meta.ts`    |
| 9   | `library/auto-section.ts`     | 11    | `packages/core/src/library/auto-section.ts`     |
| 10  | `library/user-songs.ts`       | 15    | `packages/core/src/library/user-songs.ts`       |
| 11  | `state/session-confidence.ts` | 17    | `packages/core/src/state/session-confidence.ts` |

**Status: 134/134 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Extract `state/quality.ts`

**What**: Move `computeRhythmScore`, `computeDynamicsScore`,
`computeStabilityScore`, `updateQualityScores`, `updateGrowthTrend`,
`buildCoachingFeedback`.

**Why**: Pure scoring functions, easy targets, valuable to test.

**Acceptance**:

- [ ] All 6 functions exported, no `state.X` reads/writes (pass values in)
- [ ] Tests: rhythm CV → score curve; dynamics CV → score curve
- [ ] `buildCoachingFeedback` returns object instead of mutating

**Playbook**: extract-module. **Est**: 150 + 200 tests.

## 2. Extract `i18n/index.ts`

**What**: Move `T_STRINGS` + `t()` + `applyI18n` (split: applyI18n stays in
DOM-coupled web shell, `t()` and table go to core).

**Why**: Many other extractions need `t()`. Establishes the pattern for
DOM-decoupled extraction.

**Acceptance**:

- [ ] `t()` extracted as pure function
- [ ] `T_STRINGS` exported as const
- [ ] User-song key handler (`__userTitle:` etc.) takes a song-resolver callback
      instead of importing SONGS
- [ ] Tests: en/jp lookup, var substitution, fallback to key

**Est**: 100 + 80 tests.

## 3. Extract `config.ts`

**What**: Move the `CONFIG` object literal.

**Why**: Many extracted modules currently take options as args; once `config.ts`
exists they can import their own slice.

**Acceptance**:

- [ ] `CONFIG` exported as `as const`
- [ ] Type `Config` exported (derived via typeof)
- [ ] No tests needed — it's a constant

**Est**: 200 lines (just the literal).

---

## Backlog (rotate up as items complete)

- `state/practice-state.ts`
- `state/midi-state.ts`
- `render/particles.ts`
- `render/lane.ts`
- `render/keyboard.ts`
- `render/effects.ts`
- `render/theme.ts`

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
