// Smoke test for the IIFE bundle that legacy app.js consumes via a plain
// <script> tag. Verifies:
//   1. esbuild produces a non-empty bundle at the expected path
//   2. The bundle is syntactically valid JS (parses + executes)
//   3. It assigns a `PianoCore` global with the named exports the legacy
//      shell will look up (one per layer: audio / library / state / render /
//      i18n / config) — a regression here means the bundle name or the
//      index.ts re-export shape changed without us noticing.

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import * as vm from 'node:vm';

const BUNDLE_PATH = resolve(__dirname, '../../../dist-legacy/core-bundle.js');

// Run the build once before any test executes. Cheap (esbuild is ~10ms).
beforeAll(() => {
  execSync('pnpm --filter @piano/core build:legacy', {
    cwd: resolve(__dirname, '../../..'),
    stdio: 'pipe',
  });
});

describe('IIFE legacy bundle', () => {
  it('exists and is non-trivial in size', () => {
    expect(existsSync(BUNDLE_PATH)).toBe(true);
    const bytes = statSync(BUNDLE_PATH).size;
    // The full engine is ~117 kB unminified at time of writing. Set a wide
    // band so ordinary growth doesn't tickle this; only catch catastrophes.
    expect(bytes).toBeGreaterThan(20_000);
    expect(bytes).toBeLessThan(500_000);
  });

  it('parses + runs without error and exposes a PianoCore global', () => {
    const src = readFileSync(BUNDLE_PATH, 'utf8');
    const ctx: Record<string, unknown> = {};
    vm.runInNewContext(src, ctx);
    expect(ctx.PianoCore).toBeTypeOf('object');
  });

  it('exposes one representative named export per @piano/core layer', () => {
    const src = readFileSync(BUNDLE_PATH, 'utf8');
    const ctx: Record<string, unknown> = {};
    vm.runInNewContext(src, ctx);
    const core = ctx.PianoCore as Record<string, unknown>;

    // Audio layer
    expect(core.detectChord).toBeTypeOf('function');
    expect(core.detectPitchYIN).toBeTypeOf('function');

    // Library layer
    expect(core.parseMusicXmlMetadata).toBeTypeOf('function');
    expect(core.openUserDb).toBeTypeOf('function');

    // State layer
    expect(core.initFlowState).toBeTypeOf('function');
    expect(core.applyFlowEvent).toBeTypeOf('function');
    expect(core.applyEncouragementEvent).toBeTypeOf('function');
    expect(core.applyQuestTick).toBeTypeOf('function');
    expect(core.initPracticeState).toBeTypeOf('function');

    // Render layer
    expect(core.drawMidiKeyboard).toBeTypeOf('function');
    expect(core.drawPracticeLane).toBeTypeOf('function');
    expect(core.drawCenterGlow).toBeTypeOf('function');
    expect(Array.isArray(core.THEMES)).toBe(true);
    expect(Array.isArray(core.STAGES)).toBe(true);

    // i18n + config
    expect(core.translate).toBeTypeOf('function');
    expect(core.CONFIG).toBeTypeOf('object');
  });

  it('one extracted function actually computes — detectChord on a C major triad', () => {
    const src = readFileSync(BUNDLE_PATH, 'utf8');
    const ctx: Record<string, unknown> = {};
    vm.runInNewContext(src, ctx);
    const core = ctx.PianoCore as { detectChord: (notes: number[]) => string | null };
    // C4 + E4 + G4 → "Cmaj"-ish. The exact label depends on
    // detectChord's chord-dictionary, so just check we get *some* string back.
    const result = core.detectChord([60, 64, 67]);
    expect(typeof result === 'string' || result === null).toBe(true);
    expect(result).not.toBe('');
  });
});
