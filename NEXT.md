# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-07** (Phase 0b done; Phase 0c deep dive. Eight typed
modules extracted (`library/score-timing.ts`, `library/measure-timing.ts`,
`library/playback-order.ts`, `library/merge-tied-notes.ts`,
`library/diag-load.ts`, `state/practice-progress.ts`, `web/audio-scheduler.ts`,
`web/note-extractor.ts`), shrinking `legacy-app.js` by ~1,000 lines
cumulatively. `OsmdAdapter` interface in `@piano/core` + impl + all cursor /
highlight call sites routed through it. `legacy-app.js` is a real ES module
(`export {}`), `allowJs: true` is on, boundary `@typedef`s for Note /
PracticeState / MidiState / Prefs are seeded, and bare-identifier globals (Tone
/ OSMD / JSZip / PianoCore / AudioScheduler / NoteExtractor / osmdAdapter) are
`declare global { var }`- typed in `main.ts` so a future `@ts-check` doesn't see
TS2304s for them. SW takeover hardened. 786 vitest cases, `pnpm verify` clean.)

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
| 40  | `library/merge-tied-notes.ts` | 15    | `packages/core/src/library/merge-tied-notes.ts` |
| 41  | `library/diag-load.ts`        | 15    | `packages/core/src/library/diag-load.ts`        |
| 42  | `state/practice-progress.ts`  | 15    | `packages/core/src/state/practice-progress.ts`  |
| 43  | `web/note-extractor.ts`       | —     | `packages/web/src/note-extractor.ts`            |

**Status: 786/786 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.** (audio-scheduler.ts and note-extractor.ts are web-shell typed modules —
no @piano/core unit tests; runtime-verified via iPad practice-mode A/B.)

---

## ⏳ In queue

## 1. Type the long-lived globals (`H`, `W`, `audioCtx`, `osmd`, `state`, `DOM`, `CONFIG`)

The next-cheapest scaffolding win. Re-probe (2026-05-07): with the
`declare global { var X }` block already covering library globals, the remaining
`// @ts-check + checkJs` count is **902** errors. The top categories are:

- TS7005
  `Variable 'H'/'W'/'audioCtx'/'osmd'/'particles'/'gainNode' implicitly has any type`
  — ~120 errors. Fixed by JSDoc-typing the module-scoped `let`/`const`
  declarations.
- TS18047 `'DOM.X' is possibly 'null'` — ~248 errors. Fixed by typing
  `const DOM = { ... }` as `Record<string, HTMLElement>` (with a defensive `!`
  cast or as-pattern, since the legacy assumes the IDs exist in index.html).
- TS7006 `Parameter 's' implicitly has any` — ~206 errors. Fixed per-function
  via JSDoc `@param {Type} s`.

**Strategy**: type the few wide identifiers (~10 declarations) for the biggest
leverage, then enable `@ts-check` at the file top and use the remaining errors
as a TODO list.

**Est**: ~2-3 hours for the scaffolding pass; another full day to ratchet down
the per-function annotations.

## 2. Whole-file `@ts-check` — once the residual count is manageable

**What**: Add `// @ts-check` at the top of `legacy-app.js` and fix the remaining
errors. The 902-error count is too many for one session; but each upstream
extraction or scaffolding pass drops it monotonically.

**Acceptance**:

- [ ] `// @ts-check` at the top of `legacy-app.js`
- [ ] `pnpm typecheck` clean

**Est**: budget depends on the residual count when scheduling — re- probe via
`// @ts-check` + `tsconfig.probe.json` to gauge.

## 3. More leaf extractions — pick from the remaining chunks

Each extraction reduces the `@ts-check` surface by 50-200 errors. Candidates
that haven't been tackled:

- **DOM bag setup** — `const DOM = { foo: document.getElementById(…), … }` ~100
  lines of getElementById calls. Could move to a typed
  `packages/web/src/dom-bag.ts` with explicit field types.
- **The big `loop()` render frame composer** — ~500 lines of canvas draw
  orchestration, mostly already calling `PianoCore.draw*` / `osmdAdapter.*`.
  Hard target — many fragile lookahead reads of the `state` object.
- **Per-frame practice tick (`updatePractice`)** — ~250 lines, the hot-path
  note-onset → flow / combo / quality pipeline. Already delegates most reducers
  to `PianoCore.*`; the remaining glue is state.X mutation that would type-check
  well once `state` has a named shape.
- **DOM event handlers** — ~1500 lines of `DOM.btn.addEventListener` blocks.
  Could move to a typed `packages/web/src/event-wiring.ts`.

**Est**: per-chunk between 30 minutes (DOM bag) and a half-day (updatePractice).

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
