# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-05** (15 modules extracted; engine layer is now
content-complete except for render/ and practice-state).

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
| 12  | `state/quality.ts`            | 27    | `packages/core/src/state/quality.ts`            |
| 13  | `i18n/`                       | 23    | `packages/core/src/i18n/index.ts` + strings.ts  |
| 14  | `config.ts`                   | 17    | `packages/core/src/config.ts`                   |
| 15  | `state/midi-state.ts`         | 21    | `packages/core/src/state/midi-state.ts`         |

**Status: 222/222 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Extract `state/practice-state.ts`

**What**: Move the `practice` object + lifecycle (`startPracticeSection`,
`updatePractice`, `matchNoteOnset`, hit-window judging, section completion).
This is the largest single extraction yet — practice is the killer feature.

**Why**: Lifting practice into core makes the engine self-contained for
mobile-shell use without dragging in DOM-coupled UI.

**Acceptance**:

- [ ] `PracticeState` interface; `init`/`step`/`matchNote`/`completeSection`
      functions
- [ ] OSMD interaction stays in the shell (cursor.show/hide/next abstracted as a
      `CursorAdapter` interface the shell implements)
- [ ] Tests cover hit-window scoring (early/perfect/late/miss), chord-mate
      forgiveness, mode switching (guided/rhythm/listen)

**Est**: 400 + 350 tests.

## 3. Extract `render/particles.ts`

**What**: Move the `Particle` class, `spawnBurst`, `spawnStream`,
`MAX_PARTICLES_3D`, 3D projection helpers.

**Acceptance**:

- [ ] Particle class (or factory) with explicit deps for `W/H` (canvas size) and
      theme colors — no global reads
- [ ] `update()` is pure-ish (mutates self, no globals)
- [ ] `draw(ctx, perfProfile)` — perfProfile gates shadowBlur
- [ ] Tests: spawn count, lifetime decay, projection math

**Est**: 250 + 150 tests.

---

## Backlog (rotate up as items complete)

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
