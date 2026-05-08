// Tests for packages/web/src/render-loop.ts.
//
// The orchestrator is a thin glue layer. Tests pin:
//   • state.running gate — stop returning early.
//   • Self-rAF — calls raf with itself.
//   • Phase order — frame prelude → mic pipeline → mid → late.
//   • Theme propagation — RenderFrame.runRenderFramePrelude's theme
//     flows into the deps-builders called for mic + ambient + spectrum.
//   • Spectrum gate — null-return from buildSpectrumDeps skips the
//     RenderMid.runSpectrumBars call.
//   • Builder freshness — builders are called fresh each tick (so
//     mid-frame state changes propagate).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRenderLoop, type RenderLoopDeps } from '../src/render-loop';

// ─── fixture ────────────────────────────────────────────────────────

interface ModuleSpies {
  runRenderFramePrelude: ReturnType<typeof vi.fn>;
  tickMicPipeline: ReturnType<typeof vi.fn>;
  tickNoteDisplayFade: ReturnType<typeof vi.fn>;
  spawnAmbientParticle: ReturnType<typeof vi.fn>;
  runSpectrumBars: ReturnType<typeof vi.fn>;
  runRenderLate: ReturnType<typeof vi.fn>;
}

function makeFixture(over: { spectrumDeps?: unknown | null; running?: boolean } = {}) {
  const theme = { colors: ['#aaa'], bg: '#000', glow: '#fff' };
  const spies: ModuleSpies = {
    runRenderFramePrelude: vi.fn().mockReturnValue({ dt: 16, theme }),
    tickMicPipeline: vi.fn().mockReturnValue({ isGoodNote: false }),
    tickNoteDisplayFade: vi.fn(),
    spawnAmbientParticle: vi.fn(),
    runSpectrumBars: vi.fn(),
    runRenderLate: vi.fn(),
  };
  const buildFrameDeps = vi.fn().mockReturnValue({ tag: 'frame' });
  const buildMicPipelineDeps = vi.fn().mockReturnValue({ tag: 'mic' });
  const buildNoteFadeDeps = vi.fn().mockReturnValue({ tag: 'note-fade' });
  const buildAmbientDeps = vi.fn().mockReturnValue({ tag: 'ambient' });
  const buildSpectrumDeps = vi
    .fn()
    .mockReturnValue(over.spectrumDeps !== undefined ? over.spectrumDeps : { tag: 'spectrum' });
  const buildLateDeps = vi.fn().mockReturnValue({ tag: 'late' });
  const raf = vi.fn();
  const state = { running: over.running ?? true };

  const deps: RenderLoopDeps = {
    state,
    modules: {
       
      RenderFrame: { runRenderFramePrelude: spies.runRenderFramePrelude as any },
       
      MicPipeline: { tickMicPipeline: spies.tickMicPipeline as any },
      RenderMid: {
         
        tickNoteDisplayFade: spies.tickNoteDisplayFade as any,
         
        spawnAmbientParticle: spies.spawnAmbientParticle as any,
         
        runSpectrumBars: spies.runSpectrumBars as any,
      },
       
      RenderLate: { runRenderLate: spies.runRenderLate as any },
    },
    builders: {
       
      buildFrameDeps: buildFrameDeps as any,
       
      buildMicPipelineDeps: buildMicPipelineDeps as any,
       
      buildNoteFadeDeps: buildNoteFadeDeps as any,
       
      buildAmbientDeps: buildAmbientDeps as any,
       
      buildSpectrumDeps: buildSpectrumDeps as any,
       
      buildLateDeps: buildLateDeps as any,
    },
     
    raf: raf as any,
  };

  return {
    loop: createRenderLoop(deps),
    spies,
    builders: {
      buildFrameDeps,
      buildMicPipelineDeps,
      buildNoteFadeDeps,
      buildAmbientDeps,
      buildSpectrumDeps,
      buildLateDeps,
    },
    raf,
    state,
    theme,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── state.running gate ────────────────────────────────────────────

describe('tick — running gate', () => {
  it('returns early when state.running is false', () => {
    const fx = makeFixture({ running: false });
    fx.loop.tick(123);
    expect(fx.spies.runRenderFramePrelude).not.toHaveBeenCalled();
    expect(fx.raf).not.toHaveBeenCalled();
  });

  it('runs the full pipeline when state.running is true', () => {
    const fx = makeFixture();
    fx.loop.tick(123);
    expect(fx.spies.runRenderFramePrelude).toHaveBeenCalledOnce();
    expect(fx.spies.tickMicPipeline).toHaveBeenCalledOnce();
    expect(fx.spies.tickNoteDisplayFade).toHaveBeenCalledOnce();
    expect(fx.spies.spawnAmbientParticle).toHaveBeenCalledOnce();
    expect(fx.spies.runSpectrumBars).toHaveBeenCalledOnce();
    expect(fx.spies.runRenderLate).toHaveBeenCalledOnce();
  });
});

// ─── self-rAF ──────────────────────────────────────────────────────

describe('tick — self-rAF', () => {
  it('schedules itself for the next frame when running', () => {
    const fx = makeFixture();
    fx.loop.tick(0);
    expect(fx.raf).toHaveBeenCalledOnce();
    // The cb passed to raf is `tick` itself.
    expect(fx.raf.mock.calls[0][0]).toBe(fx.loop.tick);
  });

  it('does not schedule when stopped', () => {
    const fx = makeFixture({ running: false });
    fx.loop.tick(0);
    expect(fx.raf).not.toHaveBeenCalled();
  });
});

// ─── phase order ───────────────────────────────────────────────────

describe('tick — phase order', () => {
  it('frame → mic → note-fade → ambient → spectrum → late', () => {
    const fx = makeFixture();
    const order: string[] = [];
    fx.spies.runRenderFramePrelude.mockImplementation(() => {
      order.push('frame');
      return { dt: 16, theme: fx.theme };
    });
    fx.spies.tickMicPipeline.mockImplementation(() => {
      order.push('mic');
      return { isGoodNote: false };
    });
    fx.spies.tickNoteDisplayFade.mockImplementation(() => {
      order.push('noteFade');
    });
    fx.spies.spawnAmbientParticle.mockImplementation(() => {
      order.push('ambient');
    });
    fx.spies.runSpectrumBars.mockImplementation(() => {
      order.push('spectrum');
    });
    fx.spies.runRenderLate.mockImplementation(() => {
      order.push('late');
    });
    fx.loop.tick(123);
    expect(order).toEqual(['frame', 'mic', 'noteFade', 'ambient', 'spectrum', 'late']);
  });

  it('passes timeMs + dt to the mic pipeline', () => {
    const fx = makeFixture();
    fx.loop.tick(456);
    expect(fx.spies.tickMicPipeline).toHaveBeenCalledWith(456, 16, expect.any(Object));
  });

  it('passes timeMs to the frame prelude + note-fade', () => {
    const fx = makeFixture();
    fx.loop.tick(789);
    expect(fx.spies.runRenderFramePrelude).toHaveBeenCalledWith(789, expect.any(Object));
    expect(fx.spies.tickNoteDisplayFade).toHaveBeenCalledWith(789, expect.any(Object));
  });
});

// ─── theme propagation ────────────────────────────────────────────

describe('tick — theme propagation', () => {
  it('passes the prelude theme into mic / ambient / spectrum builders', () => {
    const fx = makeFixture();
    fx.loop.tick(0);
    expect(fx.builders.buildMicPipelineDeps).toHaveBeenCalledWith(0, 16, fx.theme);
    expect(fx.builders.buildAmbientDeps).toHaveBeenCalledWith(fx.theme);
    expect(fx.builders.buildSpectrumDeps).toHaveBeenCalledWith(fx.theme);
  });
});

// ─── spectrum silence gate ────────────────────────────────────────

describe('tick — spectrum silence gate', () => {
  it('skips runSpectrumBars when buildSpectrumDeps returns null', () => {
    const fx = makeFixture({ spectrumDeps: null });
    fx.loop.tick(0);
    expect(fx.spies.runSpectrumBars).not.toHaveBeenCalled();
    // But the surrounding phases still run.
    expect(fx.spies.spawnAmbientParticle).toHaveBeenCalledOnce();
    expect(fx.spies.runRenderLate).toHaveBeenCalledOnce();
  });

  it('still calls buildSpectrumDeps so it can decide each frame', () => {
    const fx = makeFixture({ spectrumDeps: null });
    fx.loop.tick(0);
    expect(fx.builders.buildSpectrumDeps).toHaveBeenCalledOnce();
  });
});

// ─── builder freshness ────────────────────────────────────────────

describe('tick — builder freshness', () => {
  it('calls every builder fresh each tick', () => {
    const fx = makeFixture();
    fx.loop.tick(0);
    fx.loop.tick(16);
    fx.loop.tick(32);
    expect(fx.builders.buildFrameDeps).toHaveBeenCalledTimes(3);
    expect(fx.builders.buildMicPipelineDeps).toHaveBeenCalledTimes(3);
    expect(fx.builders.buildNoteFadeDeps).toHaveBeenCalledTimes(3);
    expect(fx.builders.buildAmbientDeps).toHaveBeenCalledTimes(3);
    expect(fx.builders.buildSpectrumDeps).toHaveBeenCalledTimes(3);
    expect(fx.builders.buildLateDeps).toHaveBeenCalledTimes(3);
  });

  it('mid-tick state.running flip stops further frames', () => {
    const fx = makeFixture();
    fx.loop.tick(0);
    expect(fx.spies.runRenderLate).toHaveBeenCalledOnce();
    fx.state.running = false;
    fx.loop.tick(16);
    expect(fx.spies.runRenderLate).toHaveBeenCalledOnce(); // still one
  });
});

// ─── default raf fallback ────────────────────────────────────────

describe('tick — default raf', () => {
  it('falls back to global requestAnimationFrame when raf dep omitted', () => {
    const original = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    const rafSpy = vi.fn().mockReturnValue(0);
    (globalThis as { requestAnimationFrame: unknown }).requestAnimationFrame = rafSpy;
    const fx = makeFixture();
    // Recreate without explicit raf.
    const loop = createRenderLoop({
      state: fx.state,
      modules: {
        RenderFrame: {
          runRenderFramePrelude: vi.fn().mockReturnValue({ dt: 16, theme: fx.theme }),
        },
        MicPipeline: { tickMicPipeline: vi.fn().mockReturnValue({ isGoodNote: false }) },
        RenderMid: {
          tickNoteDisplayFade: vi.fn(),
          spawnAmbientParticle: vi.fn(),
          runSpectrumBars: vi.fn(),
        },
        RenderLate: { runRenderLate: vi.fn() },
      },
      builders: {
        buildFrameDeps: () => ({}) as never,
        buildMicPipelineDeps: () => ({}) as never,
        buildNoteFadeDeps: () => ({}) as never,
        buildAmbientDeps: () => ({}) as never,
        buildSpectrumDeps: () => null,
        buildLateDeps: () => ({}) as never,
      },
    });
    loop.tick(0);
    expect(rafSpy).toHaveBeenCalledOnce();
    if (original) {
      (globalThis as { requestAnimationFrame: unknown }).requestAnimationFrame = original;
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  });
});
