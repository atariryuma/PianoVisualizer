# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-06** (Phase 0b done; Phase 0c started. `OsmdAdapter`
interface lives in `@piano/core` and `legacy-app.js` implements it; external
cursor / highlight call sites now route through the adapter. `legacy-app.js` is
now a real ES module (`export {}` at the end), `packages/web/tsconfig.json` has
`allowJs: true`, and the `@ts-expect-error` shim in `main.ts` is gone. Boundary
`@typedef`s for the long-lived shapes (Note / PracticeState / MidiState / Prefs)
seeded at the top of `legacy-app.js`. 688 vitest cases.)

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

**Status: 704/704 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

This session also added:

- `OsmdAdapter` interface in `packages/core/src/adapters/` (8 type-shape
  tests) + thin implementation in `legacy-app.js`.
- Phase 0c kickoff: `allowJs: true`, `legacy-app.js` is a real ES module
  (`export {}`), `@ts-expect-error` shim removed, boundary `@typedef`s for the
  long-lived shapes (Note / PracticeState / MidiState / Prefs).
- First Phase-0c-style typed module extraction: `score-timing.ts` — the MusicXML
  per-measure tempo / divisions / actualDiv parser, with injectable DOMParser so
  it tests cleanly in node. legacy-app.js shrank by ~190 lines.

---

## ⏳ In queue

## 1. Extract `library/measure-timing.ts` (the second pure parser)

**What**: Move `buildMeasureTimingFromXml` from `legacy-app.js` into
`@piano/core/library/measure-timing.ts`. It consumes the `ScoreTiming` output of
`parseScoreTimingFromXml` (already extracted) and produces per-measure
`(startSec, durationSec)` accounting for mid-bar tempo changes — the audio
scheduler's source of truth.

**Why**: Companion to `score-timing.ts`. Pure (string in, plain objects out),
already tested via OSMD A/B on real scores. Same extraction shape as
score-timing, ~80 lines.

**Acceptance**:

- [ ] `parseScoreTiming` output is consumed via the existing `ScoreTiming` type
      from core
- [ ] Vitest cases: constant tempo, mid-bar ramp, anacrusis, partial measure
      (`actualDiv < durationDiv`)
- [ ] legacy-app.js shrinks by ~80 lines

**Est**: ~120 lines core + ~150 lines tests.

## 2. Enable `checkJs` per-region in `legacy-app.js`

**What**: Use TypeScript's `@ts-check` directive at the top of specific FUNCTION
blocks in `legacy-app.js` to opt-in regions to type checking, without flipping
the whole file's `checkJs` switch.

**Why**: Once a region is `@ts-check`-clean, it's a clear extraction candidate
(no implicit `any`s, no missing parameter types). It also gives the editor full
IntelliSense for that region.

**Acceptance**:

- [ ] At least 3 regions marked `@ts-check`
- [ ] `pnpm typecheck` clean with those regions checked
- [ ] Bumps the boundary `@typedef`s where needed

**Est**: ~50 lines of incremental annotation per region, no behavior change.

---

## Backlog (rotate up as items complete)

(empty — Phase 0c items dominate near-term planning. The next major non-Phase-0c
work is Phase 1 Capacitor install, but that needs Mac + Xcode + Android Studio,
so it's blocked on human hardware.)

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
