---
name: extract-module
description:
  Move a function (or small set of related functions) from the legacy
  `legacy-app.js` into a typed `packages/core/` module with Vitest tests. Use
  when NEXT.md or an issue lists a "Extract X" item.
---

# extract-module

Standard operating procedure for the Phase 0b extraction work.

## When to use

A `NEXT.md` row says "Extract `path/foo.ts`" or an `agent-task` issue says the
same. The function being extracted is **pure** or has a small, explicit set of
side effects.

If the function mutates global `state` or DOM, the playbook still works but
you'll add a "state-machine refactor" step (see Step 5b).

## Don't use this for

- New features (use `add-song-to-library` or open a feature issue first)
- Changes to legacy `legacy-app.js` behavior (those go in their own commit, not
  bundled with extraction)
- Capacitor plugin work (touches Swift/Kotlin — separate skill)

## Steps

### 1. Confirm scope

Find the lines in `legacy-app.js` you're moving:

```bash
grep -n "^    function <NAME>" packages/web/src/legacy-app.js
```

Read the function and **everything it depends on** (constants, helpers called
inside). If it depends on another not-yet-extracted module, **stop and extract
that first** — pick the dependency from NEXT.md instead.

### 2. Create the new file

Path: `packages/core/src/<group>/<name>.ts` where `<group>` is one of `audio`,
`library`, `state`, `render`, `i18n`.

Skeleton:

```ts
// packages/core/src/audio/foo.ts
//
// Brief 1-3 line description of what this does.
// If there's a non-obvious algorithmic choice, explain WHY, not WHAT.
//
// Reference (optional): WebKit Bug XXXX, paper citation, etc.

export interface FooResult {
  // ...
}

export function foo(input: Float32Array, sampleRate: number): FooResult {
  // body — copy from legacy-app.js, add types
}
```

Conventions:

- **No DOM globals** at module top level (`window`, `document`, `navigator`). If
  you need them, take them as arguments. This makes the module unit-testable in
  node without jsdom.
- **No CONFIG references**. CONFIG isn't extracted yet — pass values as args or
  accept an `options` bag.
- **No `state.X` reads/writes**. State stays at the call site. If the legacy
  code does `state.X++`, refactor to return the new value.
- **Strict TypeScript**: every export gets explicit types. Use `unknown` in
  place of `any` where you need to escape.

### 3. Add the test

Path: `packages/core/tests/<name>.test.ts`. Use Vitest.

Skeleton:

```ts
import { describe, it, expect } from 'vitest';
import { foo } from '../src/audio/foo';

describe('foo', () => {
  it('returns expected result for normal input', () => {
    const input = new Float32Array(1024);
    const result = foo(input, 48000);
    expect(result.something).toBeCloseTo(0.5, 2);
  });

  it('handles edge case: empty input', () => {
    expect(() => foo(new Float32Array(0), 48000)).not.toThrow();
  });
});
```

For audio DSP, build synthetic test inputs:

- **Pure tone**: `Math.sin(2 * Math.PI * freq * t / sampleRate)`
- **White noise**: `Math.random() * 2 - 1`
- **Impulse**: `i === 0 ? 1 : 0`
- **Harmonic series**: sum of pure tones at integer multiples of fundamental

Aim for **at least 3 cases** per function: typical, edge, regression-trap.

### 4. Re-export from the package entry

Add to `packages/core/src/index.ts`:

```ts
export { foo } from './audio/foo';
export type { FooResult } from './audio/foo';
```

### 5a. Replace the legacy implementation with a `PianoCore.*` delegation

Phase 0b.3 retired the dual-shell mirror dance. The new `legacy-app.js` imports
`PianoCore` off `globalThis` (seeded by `main.ts`); replace the old function
body with a one-line delegation:

```js
// Phase 0b.3: delegated to @piano/core/audio/foo.
const fooResult = PianoCore.foo(buf, sr, opts);
```

No "MIRROR" annotation, no second copy — the old body is deleted in the same
commit that adds the core module.

### 5b. State-machine refactor (only if your function mutates state)

If the legacy function reads/writes `state.X` directly:

1. Lift those into explicit parameters / return values in the new module.
2. Wrap a call site in `legacy-app.js` that does the state plumbing:

```js
const result = PianoCore.foo(buf, sr, { config, prevState: state.foo });
state.foo = result.newState;
```

### 6. Verify

```bash
pnpm --filter @piano/core typecheck                 # TS clean
pnpm --filter @piano/core test                      # Vitest green
node --check packages/web/src/legacy-app.js         # legacy parses
pnpm verify                                         # full sweep
```

If `pnpm verify` fails on something unrelated to your extraction, **don't fix it
in this PR** — open a separate issue.

### 7. Commit + PR

Commit message:

```text
refactor(core): extract <name> from legacy-app.js

- New module packages/core/src/audio/<name>.ts with X tests
- legacy-app.js delegates via PianoCore.<name>
- No behavior change

Closes #<issue>
```

Then:

```bash
git push -u origin agent/extract-<name>
gh pr create --draft --title "refactor(core): extract <name>" \
             --body "$(cat <<EOF
## Summary
- Extract \`<name>\` from \`app.js\` to \`packages/core/src/audio/<name>.ts\`
- Add Vitest coverage (3 cases)
- Mirror retained in \`app.js\` per Phase 0b.3 plan

## Test plan
- [x] \`pnpm verify\` green
- [x] \`node --check app.js\` green
- [x] No legacy behavior change (function moved verbatim)

## Compliance check
- [x] N/A (pure refactor)
EOF
)"
```

### 8. Update NEXT.md

Mark the row `✅ DONE` with link to the new file. Move the next item from
ROADMAP.md 0b.2 list onto NEXT.md to keep the queue at 5–10 items.

## Common pitfalls

- **Forgetting to re-export from index.ts** — module exists but downstream
  packages can't `import { foo } from '@piano/core'`.
- **Leaving CONFIG references** — `core/` doesn't have CONFIG yet. Either add a
  `config.ts` extraction first, or accept the relevant numbers as args.
- **Test depends on legacy `state` global** — tests must be self-contained.
- **Mirror gets out of date** — if you tweak `legacy-app.js` later, also tweak
  the core copy. The MIRROR comment is the reminder.
- **`@piano/core` not in workspace deps of consumer** — usually only matters for
  `packages/web` and `packages/mobile`; their package.json already has
  `"@piano/core": "workspace:*"`.

## Quality bar (reviewer will check)

- Function signature uses explicit types (no `any` unless escaping a browser
  API).
- Comments explain WHY, not WHAT.
- Tests cover at least 3 cases including 1 edge case.
- No new dependencies added unless absolutely needed (Vitest fixtures > new
  libs).
- Legacy mirror has the MIRROR comment.
- `pnpm verify` green.
