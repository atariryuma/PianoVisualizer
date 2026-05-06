# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-07** (Phase 0b done; Phase 0c well under way. Four
typed modules extracted (`library/score-timing.ts`, `library/measure-timing.ts`,
`library/playback-order.ts`, `web/audio-scheduler.ts`), shrinking
`legacy-app.js` by ~470 lines. `OsmdAdapter` interface in `@piano/core` + thin
impl + all cursor / highlight call sites routed through it. `legacy-app.js` is a
real ES module (`export {}`), `allowJs: true` is on, boundary `@typedef`s for
Note / PracticeState / MidiState / Prefs are seeded. SW takeover hardened
(`skipWaiting + clientsClaim + cleanupOutdatedCaches` + one-shot legacy-cache
cleanup in `main.ts`). 734 vitest cases, `pnpm verify` clean.)

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

**Status: 734/734 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.** (audio-scheduler.ts is a web-shell typed module — no @piano/core unit
tests; runtime-verified via the iPad practice-mode A/B.)

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

## 1. Continue Phase 0c extractions — pick the next leaf

Probed 2026-05-07: enabling `// @ts-check` on the whole `legacy-app.js` yields
**1,041 errors** under `checkJs:true`. That's a 1-week grind, not a 1-day one —
most of it is `DOM.x is possibly null` (TypeScript's strict-null-checks on
`getElementById` results) and similar systematic issues. **Better strategy**:
keep extracting leaf-level chunks into typed modules; each extraction shrinks
the surface that `@ts-check` would have to grade.

Candidate next chunks (each is mostly free-standing, leaf-level):

- **`mergeTiedNotes`** — pure note-array transform, ~60 lines. Tied-note
  coalescing into single sustained events. Easy first target.
- **`extractNotesFromOsmd`** — the OSMD-iterator-driven note extractor, ~250
  lines. OSMD-coupled but pure data transformation. Would naturally consume the
  `OsmdAdapter` interface that's already in core.
- **Practice progress persistence** — `loadPracticeProgress` /
  `savePracticeProgress` / unlock-tier resolution, ~150 lines. Currently inline;
  pure state-machine + localStorage I/O.
- **DIAG / remoteLog plumbing** — `dumpLoadDiagnostics`, ~100 lines. Pure
  logging; clean candidate for a typed shell module.

**Acceptance**: pick one, follow the established score-timing / measure-timing /
playback-order pattern (typed module + Vitest cases + legacy delegation +
`pnpm verify` clean).

**Est**: per-chunk between 30 minutes (`mergeTiedNotes`) and a half-day
(`extractNotesFromOsmd`).

## 2. Whole-file `@ts-check` — sequenced once the file is < 4000 lines

**What**: Once leaf extractions have shrunk `legacy-app.js` enough that the
residual error count under `checkJs` is manageable (<200), enable `// @ts-check`
at the top and fix the remaining errors in one pass.

**Why**: 1,041 errors is too many to fix in a session, but the count goes down
monotonically with each extraction. Defer until the budget fits.

**Acceptance**:

- [ ] `// @ts-check` at the top of `legacy-app.js`
- [ ] `pnpm typecheck` clean

**Est**: depends on remaining surface — gauge by re-probing periodically.

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
