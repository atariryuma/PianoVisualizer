# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-05** (17 modules extracted; engine + 3D particle
system in core. Remaining render layer is largely thin Canvas glue.)

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
| 16  | `state/practice-state.ts`     | 41    | `packages/core/src/state/practice-state.ts`     |
| 17  | `render/particles.ts`         | 34    | `packages/core/src/render/particles.ts`         |

**Status: 297/297 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Extract `render/effects.ts`

**What**: Move encouragement effects (`effectGlowPulse`, `effectGlowParticles`,
`effectColorWave`, `effectStarShower`, `effectFlowerBurst`, `effectShimmer`,
`effectRadiance`, `effectGoldenBurst`) and the `triggerEffect(name)` dispatcher.

**Why**: These are the celebration feedback fired at combo milestones. Each is a
thin wrapper over `spawnBurst` / `Ripple` / state nudges, so extraction is
mostly mechanical now that particles is in core.

**Acceptance**:

- [ ] Each effect takes a deps bag (particles, ripples, themeColors, W/H/flow)
      and returns void / event records
- [ ] No reads of globals (`state`, `CONFIG`, `W`, `H`)
- [ ] `triggerEffect(name, deps)` looks up by name and dispatches
- [ ] Tests assert each effect spawns the expected particle types/counts

**Est**: 250 + 150 tests.

## 2. Extract `render/keyboard.ts`

**What**: Move `drawMidiKeyboard()` + the `KB_WHITE` / `KB_BLACK` /
`KB_BLACK_LEFT_WHITE_IDX` precomputed tables.

**Acceptance**:

- [ ] Pure helper: `drawMidiKeyboard(ctx, opts)` where opts carries the
      midiState (active/sustained), W/kbHeight/kbY/sustainLabel
- [ ] Key tables exposed as exports (built once at module load)
- [ ] Tests: white/black indexing, paint per-key state (lit/sustained/idle)

**Est**: 200 + 100 tests.

## 3. Extract `render/lane.ts`

**What**: Move `drawPracticeLane(ctx, opts, practiceState)` — the falling-notes
lane + count-in countdown + hit zones.

**Acceptance**:

- [ ] Pure: takes ctx + state + opts (W/H/kbHeight/laneTop/etc.) + i18n callback
- [ ] Computes geometry without globals
- [ ] Tests: visible window culling, position math, count-in countdown timing

**Est**: 350 + 150 tests.

---

## Backlog (rotate up as items complete)

- `render/theme.ts` — theme application + synesthesia
- `render/background.ts` — bg stars + aurora + ground flowers
- `render/ripples.ts` — Ripple class

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
