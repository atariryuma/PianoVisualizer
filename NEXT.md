# NEXT — agent task queue

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-06** (35 modules extracted; per-onset trio
(quality-history / pitch-stability / chord-window) plus the wake-up flash,
daily-streak, and MIDI-beam adapters are now all in core. Quest-cooldown turned
out to be subsumed by the existing quest-tracker's `postCompletionDelayMs` and
was not extracted separately. Phase 0b.3 dual-build wire-up is the next
architectural milestone.)

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

**Status: 684/684 tests green, 0 lint errors, 0 type errors. `pnpm verify`
clean.**

---

## ⏳ In queue

## 1. Phase 0b.3 — dual-build wire-up

**What**: Make `packages/web` the real production entry, not a placeholder. Vite
consumes `@piano/core` directly; `app.js` shrinks to glue + DOM wiring.
Eventually `index.html` loads the Vite output (or a copy of it) instead of the
legacy 3-file shell.

**Why**: With 35 modules extracted, the legacy app.js is now mostly adapters /
DOM glue / per-frame composition. The next major reduction requires moving the
entry, which is an architectural cut — needs a single PR with full LAN-test +
iPad + service-worker validation, not piecemeal.

**Acceptance**:

- [ ] `pnpm --filter @piano/web build` produces a working `dist/` that serves
      equivalently to the current root `index.html`
- [ ] PWA service worker still caches the right asset list
- [ ] OSMD load path still works (Vite handles the dynamic-import properly)
- [ ] LAN HTTPS server renamed/repurposed to serve the Vite output
- [ ] iPad + Web MIDI Browser both render the visualizer end-to-end
- [ ] Manual A/B against legacy build: identical behavior on at least three
      songs (Für Elise, La Campanella, a user-imported piece)

**Est**: ~400 lines of moves + a handful of new files. Roughly 1 day's work.

## 2. OSMD adapter design

**What**: Wrap the OpenSheetMusicDisplay touch points (cursor positioning,
notehead highlight, score load, note extraction) behind a thin core interface so
the legacy `app.js` and the future `packages/web` can share the same OSMD wiring
without copy-paste.

**Why**: The recent cursor / notehead-highlight work touched several legacy-
shaped surfaces (DOM lookups, SVG mutation, OSMD object property reads) that
will be a friction point once `packages/web` becomes authoritative. Easier to
design the abstraction now while the call sites are fresh.

**Acceptance**:

- [ ] `packages/core/src/adapters/osmd-adapter.ts` interface (no concrete
      implementation; the OSMD library itself stays in the shells)
- [ ] Methods cover: `loadScore`, `getCursorPositionAt`, `getCurrentNotes`,
      `walkIteratorTo`, `highlightNotes`, `clearHighlights`
- [ ] Legacy app.js implements the interface as a thin adapter over its existing
      `osmd` instance
- [ ] All cursor / highlight / scroll call sites go through the adapter

**Est**: ~250 lines core + ~150 lines legacy adapter. ~half-day.

---

## Backlog (rotate up as items complete)

(empty — the in-queue items now blockers for further work)

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
