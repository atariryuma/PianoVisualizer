# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-06** (Phase 0b done; Phase 0c well under way.
`OsmdAdapter` interface in `@piano/core`; legacy cursor / highlight call sites
all route through it. `legacy-app.js` is a real ES module (`export {}`),
`allowJs: true` is on, the `@ts-expect-error` shim is gone, boundary `@typedef`s
for Note / PracticeState / MidiState / Prefs are seeded at the top of the file.
Two typed modules already extracted (`library/score-timing.ts`,
`library/measure-timing.ts`), shrinking `legacy-app.js` by ~240 lines. SW
takeover hardened (`skipWaiting + clientsClaim + cleanupOutdatedCaches` + a
one-shot legacy-cache cleanup in `main.ts`). 717 vitest cases, `pnpm verify`
clean.)

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

**Status: 717/717 tests green, 0 lint errors, 0 type errors. `pnpm verify`
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

## 1. Extract `library/playback-order.ts` (XML repeat / ending parser)

**What**: Move `fetchPlaybackOrder` and `expandNotesByPlaybackOrder` from
`legacy-app.js` into `@piano/core/library/playback-order.ts`. Reads the raw
MusicXML for `<repeat>` / `<ending>` markers and emits the linear sequence of
measure indices in the order they should sound (OSMD's API doesn't surface these
in 1.9.9).

**Why**: Same shape as score-timing.ts / measure-timing.ts — a string- in,
plain-objects-out parser. Currently the only piece of repeat-aware playback
logic still in the legacy file. Once extracted, the audio scheduler can move to
a typed module against a stable contract.

**Acceptance**:

- [ ] `fetchPlaybackOrder(xmlText)` returns a flat array of measure indices in
      playback order
- [ ] `expandNotesByPlaybackOrder(notes, order)` shape stays compatible with the
      practice-state engine's `sectionNotes`
- [ ] Vitest cases: no repeats (passthrough), simple `|: ... :|`, first / second
      endings, nested repeats, D.C. al Fine bare-words
- [ ] legacy-app.js shrinks by ~150 lines

**Est**: ~250 lines core + ~250 lines tests.

## 2. Carve a typed entry point off the audio scheduler

**What**: Move `scheduleCountInBeeps` + the rhythm-mode `Tone.Transport`
scheduling block from `legacy-app.js` into `packages/web/src/audio-scheduler.ts`
(a typed `.ts` shell module, not core — it directly touches Tone.js, which is a
web-only dependency).

**Why**: The audio scheduler is the longest single chunk of Tone-coupled code in
the legacy file (~120 lines). Moving it to a typed module is a natural Phase 0c
milestone — the boundary `@typedef`s (`PracticeStateShape`) already cover what
it needs from the legacy `practice` object.

**Acceptance**:

- [ ] `audio-scheduler.ts` exports `scheduleCountInBeeps` +
      `scheduleSectionPlayback`
- [ ] Both functions are typed against `PracticeStateShape` from
      `legacy-app.js`'s boundary @typedefs
- [ ] legacy-app.js delegates via `import { scheduleCountInBeeps }`
- [ ] No runtime change (manual A/B against a Für Elise practice session: same
      count-in beep timing, same Listen-mode auto-play)

**Est**: ~150 lines move + ~50 lines wiring.

## 3. Enable `checkJs` per-region in `legacy-app.js`

**What**: Add `// @ts-check` to `legacy-app.js` and ratchet through the
resulting type errors, fixing them in place via JSDoc annotations or opting out
via `// @ts-nocheck` for stubbornly-untyped regions until later extractions
clean them up.

**Why**: Once `@ts-check` is on, every function in the file is a typed function
whether we like it or not. The rolling cleanup it forces makes each subsequent
extraction cheaper.

**Acceptance**:

- [ ] `// @ts-check` at the top of `legacy-app.js`
- [ ] `pnpm typecheck` clean (whatever it takes — typically a few hundred JSDoc
      additions or `/** @type {any} */` casts at edge points)

**Est**: One-day grind, no behavior change.

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
