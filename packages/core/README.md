# @piano/core

Platform-agnostic engine for Piano Visualizer. Imported by `@piano/web` (PWA
shell) and `@piano/mobile` (Capacitor app).

## Status

**Scaffold (Phase 0b in progress).** Only the contract surfaces have been
extracted so far:

- `src/input/types.ts` — `MidiInputAdapter` interface that web/mobile shells
  implement
- `src/render/perf-tier.ts` — device performance tier detection

The bulk of the engine still lives in `app.js` at the repo root.
Module-by-module extraction happens in Phase 0b (planned 3-5 days) following
this order:

1. `audio/yin.ts`, `audio/onset.ts`, `audio/agc.ts`, `audio/chord.ts` — pure DSP
2. `practice/auto-section.ts`, `practice/matcher.ts`, `practice/scoring.ts`
3. `render/particles.ts`, `render/lane.ts`, `render/keyboard.ts`,
   `render/effects.ts`
4. `state/game-state.ts`, `state/practice-state.ts`, `state/midi-state.ts`
5. `i18n/`
6. `library/` (IndexedDB user songs)
7. `config.ts`

Until extraction is complete, the legacy single-file build at the repo root
(`app.js`) remains the source of truth.

## Why "core"

Three downstream consumers, one shared brain:

```
   ┌──────────────┐
   │ @piano/core  │   ← pure logic, no DOM-specific code
   └──────┬───────┘
          │
   ┌──────┼───────┬──────────────┐
   ▼      ▼       ▼              ▼
 web/   mobile/   tests/      future apps
        (Cap)              (Electron, etc.)
```

## Build

```bash
pnpm --filter @piano/core build       # tsc → dist/
pnpm --filter @piano/core test        # vitest
pnpm --filter @piano/core typecheck
```

## Conventions

- **No DOM-specific globals** (`window`, `document`) at module top level. Pass
  `Document` / `CanvasRenderingContext2D` as arguments instead — keeps the
  module Worker-compatible and testable in node.
- **No CDN imports**. Tone.js / OSMD are wired in by the shell, not core.
- **Pure functions where possible.** Reducers > setters when state is involved.
