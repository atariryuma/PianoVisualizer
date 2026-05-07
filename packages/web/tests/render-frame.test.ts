// Tests for packages/web/src/render-frame.ts.
//
// Stub the canvas 2D context (happy-dom doesn't provide one), pass
// vi.fn deps for the atmospheric layers + PianoCore helpers, and
// assert state mutations + call ordering.

import { describe, it, expect, vi } from 'vitest';
import {
  runRenderFramePrelude,
  type RenderFrameDeps,
  type RenderFrameStateRef,
  type RenderFrameTheme,
} from '../src/render-frame';

function makeStubCtx(): CanvasRenderingContext2D {
  const stub: Record<string, unknown> = {
    fillRect: vi.fn(),
    fillStyle: '',
  };
  return stub as unknown as CanvasRenderingContext2D;
}

function makeTheme(overrides: Partial<RenderFrameTheme> = {}): RenderFrameTheme {
  return {
    bg: [10, 20, 30],
    glow: 'rgba(255,200,200',
    colors: ['#fff', '#aaa'],
    ...overrides,
  };
}

function makeState(overrides: Partial<RenderFrameStateRef> = {}): RenderFrameStateRef {
  return {
    lastFrameTimeMs: 0,
    currentTheme: 0,
    smoothEnergy: 0.2,
    flow: 50,
    inputFlash: 0,
    glowPulseIntensity: 0,
    shimmerPhase: -1,
    shimmerStartMs: 0,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<RenderFrameDeps> = {}): RenderFrameDeps {
  return {
    ctx: makeStubCtx(),
    state: makeState(),
    getScreen: () => ({ W: 1024, H: 768 }),
    themes: [makeTheme()],
    drawBgStars: vi.fn(),
    drawAurora: vi.fn(),
    drawGroundFlowers: vi.fn(),
    decayWakeUpFlash: vi.fn(),
    drawCenterGlow: vi.fn(),
    wufOpts: { halfLifeSec: 0.4 },
    getEnergy: () => 0.4,
    ...overrides,
  };
}

// ─── dt calculation ───────────────────────────────────────────────────

describe('runRenderFramePrelude — dt', () => {
  it('uses default 16ms on the first frame (lastFrameTimeMs === 0)', () => {
    const deps = makeDeps();
    const result = runRenderFramePrelude(100, deps);
    expect(result.dt).toBe(16);
    expect(deps.state.lastFrameTimeMs).toBe(100);
  });

  it('computes dt from delta in subsequent frames', () => {
    const deps = makeDeps({ state: makeState({ lastFrameTimeMs: 100 }) });
    const result = runRenderFramePrelude(120, deps);
    expect(result.dt).toBe(20);
  });

  it('clamps dt at 50ms (tab-switch huge frame protection)', () => {
    const deps = makeDeps({ state: makeState({ lastFrameTimeMs: 100 }) });
    const result = runRenderFramePrelude(5000, deps);
    expect(result.dt).toBe(50);
  });
});

// ─── theme + energy smoothing ─────────────────────────────────────────

describe('runRenderFramePrelude — theme + energy', () => {
  it('returns the theme matching state.currentTheme', () => {
    const themes = [makeTheme({ glow: 'theme0' }), makeTheme({ glow: 'theme1' })];
    const deps = makeDeps({ themes, state: makeState({ currentTheme: 1 }) });
    const result = runRenderFramePrelude(100, deps);
    expect(result.theme.glow).toBe('theme1');
  });

  it('lerps smoothEnergy 15% toward the probed energy', () => {
    const deps = makeDeps({
      state: makeState({ smoothEnergy: 0 }),
      getEnergy: () => 1.0,
    });
    runRenderFramePrelude(100, deps);
    expect(deps.state.smoothEnergy).toBeCloseTo(0.15, 5);
  });
});

// ─── background fade ──────────────────────────────────────────────────

describe('runRenderFramePrelude — background fade', () => {
  it('paints the screen with theme.bg + flow-derived alpha', () => {
    const ctx = makeStubCtx();
    const deps = makeDeps({ ctx, state: makeState({ flow: 50 }) });
    runRenderFramePrelude(100, deps);
    // flow=50 → fadeRate = 0.08 + 0.06 * 0.5 = 0.11
    expect(ctx.fillStyle).toBe('rgba(10,20,30,0.11)');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1024, 768);
  });

  it('uses higher fadeRate when flow is low', () => {
    const ctx = makeStubCtx();
    const deps = makeDeps({ ctx, state: makeState({ flow: 0 }) });
    runRenderFramePrelude(100, deps);
    // flow=0 → fadeRate = 0.14
    expect(ctx.fillStyle).toBe('rgba(10,20,30,0.14)');
  });
});

// ─── atmospheric layers ───────────────────────────────────────────────

describe('runRenderFramePrelude — atmospheric layers', () => {
  it('calls drawBgStars + drawAurora + drawGroundFlowers in order', () => {
    const calls: string[] = [];
    const deps = makeDeps({
      drawBgStars: vi.fn(() => calls.push('stars')),
      drawAurora: vi.fn(() => calls.push('aurora')),
      drawGroundFlowers: vi.fn(() => calls.push('flowers')),
    });
    runRenderFramePrelude(100, deps);
    expect(calls).toEqual(['stars', 'aurora', 'flowers']);
  });
});

// ─── wake-up flash ───────────────────────────────────────────────────

describe('runRenderFramePrelude — wake-up flash', () => {
  it('paints a white wash when inputFlash > 0.01', () => {
    const ctx = makeStubCtx();
    const deps = makeDeps({ ctx, state: makeState({ inputFlash: 0.5 }) });
    runRenderFramePrelude(100, deps);
    // The last fillRect is the flash overlay (after the bg fade).
    // Just check that fillStyle was set to a 0.5-alpha white at some point.
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });

  it('skips the white wash when inputFlash is below 0.01', () => {
    const ctx = makeStubCtx();
    const deps = makeDeps({ ctx, state: makeState({ inputFlash: 0.005 }) });
    runRenderFramePrelude(100, deps);
    // Only the bg fade fillRect — no flash overlay.
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('always calls decayWakeUpFlash (regardless of inputFlash level)', () => {
    const deps = makeDeps();
    runRenderFramePrelude(100, deps);
    expect(deps.decayWakeUpFlash).toHaveBeenCalledWith(
      deps.state,
      expect.any(Number),
      deps.wufOpts
    );
  });
});

// ─── glow pulse ──────────────────────────────────────────────────────

describe('runRenderFramePrelude — glow pulse', () => {
  it('decays glowPulseIntensity by 4% per frame when above 0.01', () => {
    const deps = makeDeps({ state: makeState({ glowPulseIntensity: 0.5 }) });
    runRenderFramePrelude(100, deps);
    expect(deps.state.glowPulseIntensity).toBeCloseTo(0.48, 5);
  });

  it('does not decay glowPulseIntensity below 0.01', () => {
    const deps = makeDeps({ state: makeState({ glowPulseIntensity: 0.005 }) });
    runRenderFramePrelude(100, deps);
    expect(deps.state.glowPulseIntensity).toBe(0.005);
  });

  it('returns glowExtra in the result for downstream consumption', () => {
    const deps = makeDeps({ state: makeState({ glowPulseIntensity: 0.7 }) });
    const result = runRenderFramePrelude(100, deps);
    expect(result.glowExtra).toBe(0.7);
  });
});

// ─── center glow ──────────────────────────────────────────────────────

describe('runRenderFramePrelude — center glow', () => {
  it('forwards screen + state + theme to drawCenterGlow', () => {
    const deps = makeDeps({
      state: makeState({ smoothEnergy: 0.3, flow: 60, glowPulseIntensity: 0.2 }),
    });
    runRenderFramePrelude(100, deps);
    expect(deps.drawCenterGlow).toHaveBeenCalledWith(
      deps.ctx,
      expect.objectContaining({
        screenW: 1024,
        screenH: 768,
        flow: 60,
        glowExtra: 0.2,
        glowPrefix: 'rgba(255,200,200',
      })
    );
    // smoothEnergy is the post-lerp value (drift toward getEnergy()=0.4)
    const call = (deps.drawCenterGlow as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(call.smoothEnergy).toBeCloseTo(0.3 + (0.4 - 0.3) * 0.15, 5);
  });
});

// ─── shimmer overlay ──────────────────────────────────────────────────

describe('runRenderFramePrelude — shimmer overlay', () => {
  it('skips entirely when shimmerPhase is -1 (no shimmer active)', () => {
    const deps = makeDeps({ state: makeState({ shimmerPhase: -1 }) });
    runRenderFramePrelude(100, deps);
    // Only the bg fade fillRect — no shimmer overlay.
    expect((deps.ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(
      1
    );
  });

  it('paints shimmer wash when within 1.5s lifetime', () => {
    const ctx = makeStubCtx();
    const deps = makeDeps({
      ctx,
      state: makeState({ shimmerPhase: 0, shimmerStartMs: 80 }),
    });
    // shimmerAge = 100 - 80 = 20ms
    // Math.sin(20*0.02) = sin(0.4) ≈ 0.389; alpha = 0.08 * 0.389 * (1 - 20/1500) ≈ 0.0307
    runRenderFramePrelude(100, deps);
    // bg fade + shimmer = 2 fillRect calls
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('flips shimmerPhase to -1 when lifetime expires (>=1.5s)', () => {
    const deps = makeDeps({
      state: makeState({ shimmerPhase: 0, shimmerStartMs: 0 }),
    });
    runRenderFramePrelude(2000, deps); // 2s past start
    expect(deps.state.shimmerPhase).toBe(-1);
  });
});
