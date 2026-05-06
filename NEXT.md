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

**Status: 688/688 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

The OSMD adapter (interface in core + thin wrapper in legacy-app.js) and the
Phase 0c kickoff (allowJs, ES-module conversion via `export {}`,
`@ts-expect-error` shim removed, boundary `@typedef`s) both landed in this
session.

---

## ⏳ In queue

## 1. Phase 0c — extract first typed module from `legacy-app.js`

**What**: Pick a small, self-contained chunk of `legacy-app.js` and convert it
to a `.ts` module under `packages/web/src/`. Candidate chunks (each is mostly
free-standing, leaf-level):

- `loadCurrentSong` + `practice.progress` save/load (persistence layer)
- The XML measure-timing parser (`parseScoreTimingFromXml` — already pure-ish,
  reads MusicXML strings, returns plain objects)
- The auto-section UI helpers (`openSectionEditor`, `renderSectionList`)
- The result / summary card rendering helpers

**Why**: Now that allowJs is on and `OsmdAdapter` exists, a typed module CAN
talk back to the still-legacy file via the boundary @typedefs. This is the first
of probably 8–12 typed modules that will collectively shrink `legacy-app.js` to
a thin entry-shaped glue.

**Acceptance**:

- [ ] One chunk picked + carved into `packages/web/src/<name>.ts`
- [ ] Old function deleted from `legacy-app.js`; call sites import from the new
      module
- [ ] Vitest cases for the new module if it has pure parts
- [ ] `pnpm verify` clean

**Est**: ~300 lines / ~100 tests, depending on chunk choice.

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
