// @vitest-environment happy-dom
//
// Tests for packages/web/src/render-mid.ts.
//
// Three small phases — note-display fade, ambient particle spawn,
// spectrum bars wrapper. We stub the canvas 2D context (happy-dom
// doesn't have one) and the Particle ctor.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  tickNoteDisplayFade,
  spawnAmbientParticle,
  runSpectrumBars,
  type RenderMidStateRef,
} from '../src/render-mid';

// ─── tickNoteDisplayFade ─────────────────────────────────────────────

describe('tickNoteDisplayFade', () => {
  let el: HTMLElement;
  let state: RenderMidStateRef;

  beforeEach(() => {
    el = document.createElement('div');
    el.classList.add('visible');
    state = { noteShowTimeMs: 1000, smoothEnergy: 0.1, flow: 0 };
  });

  it('removes .visible when timeMs exceeds noteShowTimeMs + duration', () => {
    tickNoteDisplayFade(2500, {
      noteDisplayEl: el,
      state,
      noteDisplayDurationMs: 1000,
    });
    expect(el.classList.contains('visible')).toBe(false);
  });

  it('keeps .visible when within the duration window', () => {
    tickNoteDisplayFade(1500, {
      noteDisplayEl: el,
      state,
      noteDisplayDurationMs: 1000,
    });
    expect(el.classList.contains('visible')).toBe(true);
  });

  it('boundary — exactly noteShowTimeMs + duration is considered visible', () => {
    tickNoteDisplayFade(2000, {
      noteDisplayEl: el,
      state,
      noteDisplayDurationMs: 1000,
    });
    expect(el.classList.contains('visible')).toBe(true);
  });
});

// ─── spawnAmbientParticle ────────────────────────────────────────────

describe('spawnAmbientParticle', () => {
  class FakeParticle {
    args: unknown[];
    constructor(...args: unknown[]) {
      this.args = args;
    }
  }

  function makeDeps(overrides: Record<string, unknown> = {}) {
    return {
      state: { noteShowTimeMs: 0, smoothEnergy: 0.02, flow: 50 } as RenderMidStateRef,
      theme: { colors: ['#fff', '#aaa'] as const },
      screen: { W: 1024, H: 768 },
      particles: { length: 0, push: vi.fn() } as { length: number; push: ReturnType<typeof vi.fn> },
      maxParticles: 100,
      ambientChance: 1.5, // > 1 ensures roll > threshold no matter what random returns
      Particle: FakeParticle as never,
      ...overrides,
    };
  }

  it('does NOT spawn when smoothEnergy >= 0.04 (active playing)', () => {
    const deps = makeDeps({
      state: { noteShowTimeMs: 0, smoothEnergy: 0.05, flow: 0 } as RenderMidStateRef,
    });
    spawnAmbientParticle(deps);
    expect(deps.particles.push).not.toHaveBeenCalled();
  });

  it('spawns when energy is low + roll passes threshold', () => {
    // ambientChance=1.5 → threshold = 1 - 1.5 - 50*0.003 = -0.65
    // roll always > -0.65, so we spawn.
    const deps = makeDeps();
    spawnAmbientParticle(deps);
    expect(deps.particles.push).toHaveBeenCalledTimes(1);
  });

  it('does NOT spawn when at MAX_PARTICLES cap', () => {
    const deps = makeDeps({
      particles: { length: 100, push: vi.fn() },
    });
    spawnAmbientParticle(deps);
    expect(deps.particles.push).not.toHaveBeenCalled();
  });

  it('does NOT spawn when roll falls below threshold', () => {
    // ambientChance=0, flow=0 → threshold=1; Math.random returns [0,1) so
    // roll is always <= threshold → never spawn.
    const deps = makeDeps({
      state: { noteShowTimeMs: 0, smoothEnergy: 0.02, flow: 0 } as RenderMidStateRef,
      ambientChance: 0,
    });
    spawnAmbientParticle(deps);
    expect(deps.particles.push).not.toHaveBeenCalled();
  });

  it('passes a Particle instance with the right ctor arity', () => {
    const deps = makeDeps();
    spawnAmbientParticle(deps);
    const p = (deps.particles.push as ReturnType<typeof vi.fn>).mock.calls[0][0] as FakeParticle;
    // Particle ctor: x, y, z, color, size, vx, vy, vz, life, kind = 10 args
    expect(p.args.length).toBe(10);
    expect(typeof p.args[0]).toBe('number'); // x
    expect(typeof p.args[1]).toBe('number'); // y
    expect(typeof p.args[2]).toBe('number'); // z
    expect(['#fff', '#aaa']).toContain(p.args[3]); // color
    expect(p.args[9]).toBe('circle'); // kind
  });

  it('honors flow boost — higher flow → larger spawn density window', () => {
    // We can't easily assert this without mocking Math.random, but we can
    // at least confirm the threshold formula's flow term reads correctly.
    const deps = makeDeps({
      state: { noteShowTimeMs: 0, smoothEnergy: 0.02, flow: 100 } as RenderMidStateRef,
      ambientChance: 0.3,
    });
    // With flow=100: threshold = 1 - 0.3 - 100*0.003 = 0.4
    // Force Math.random sequence: first call (the roll) = 0.5 > 0.4, should spawn.
    const rand = vi.spyOn(Math, 'random');
    rand.mockReturnValueOnce(0.5); // roll
    rand.mockReturnValue(0.5); // subsequent calls inside the spawn body
    spawnAmbientParticle(deps);
    expect(deps.particles.push).toHaveBeenCalled();
    rand.mockRestore();
  });
});

// ─── runSpectrumBars ─────────────────────────────────────────────────

describe('runSpectrumBars', () => {
  it('forwards bin range + theme colors + flow to drawSpectrumBars', () => {
    const drawSpectrumBars = vi.fn();
    const ctx = {} as CanvasRenderingContext2D;
    const dataArray = new Uint8Array(2048) as Uint8Array<ArrayBuffer>;
    runSpectrumBars({
      ctx,
      dataArray,
      sampleRate: 48000,
      fftSize: 4096,
      pianoFreqMin: 27.5,
      pianoFreqMax: 4186,
      barCount: 64,
      themeColors: ['#fff', '#aaa'],
      flow: 30,
      screen: { W: 1024, H: 768 },
      drawSpectrumBars,
    });
    // binHz = 48000 / 4096 ≈ 11.72
    // startBin = floor(27.5 / 11.72) = 2
    // endBin = floor(4186 / 11.72) = 357
    expect(drawSpectrumBars).toHaveBeenCalledWith(
      ctx,
      dataArray,
      expect.objectContaining({
        screenW: 1024,
        screenH: 768,
        startBin: 2,
        endBin: 357,
        barCount: 64,
        themeColors: ['#fff', '#aaa'],
        flow: 30,
      })
    );
  });
});
