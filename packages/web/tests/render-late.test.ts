// Tests for packages/web/src/render-late.ts.
//
// The orchestrator phase has 9 ordered concerns; we cover each with
// stub deps and assert call ordering, gate logic, and the in-place
// array-trim semantics.

import { describe, it, expect, vi } from 'vitest';
import {
  runRenderLate,
  type RenderLateDeps,
  type RippleArray,
  type ParticleArray,
} from '../src/render-late';

function makeRipple(life = 1): {
  update: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  life: number;
} {
  return { update: vi.fn(), draw: vi.fn(), life };
}
function makeParticle(life = 1): ReturnType<typeof makeRipple> {
  return makeRipple(life);
}

function makeDeps(over: Partial<RenderLateDeps> = {}): RenderLateDeps {
  return {
    ctx: {} as CanvasRenderingContext2D,
    ripples: [] as unknown as RippleArray,
    particles: [] as unknown as ParticleArray,
    midiInput: { enabled: false },
    practice: { enabled: false },
    isFreeplayActive: () => false,
    maxParticles: 100,
    drawMidiBeams: vi.fn(),
    drawMidiChordDisplay: vi.fn(),
    drawMidiKeyboard: vi.fn(),
    drawPracticeLane: vi.fn(),
    updateQuestState: vi.fn(),
    updatePlayTime: vi.fn(),
    updateDebugOverlay: vi.fn(),
    ...over,
  };
}

// ─── MIDI beams gating ───────────────────────────────────────────────

describe('runRenderLate — MIDI beams', () => {
  it('draws beams when midi enabled + practice off', () => {
    const deps = makeDeps({
      midiInput: { enabled: true },
      practice: { enabled: false },
    });
    runRenderLate(100, deps);
    expect(deps.drawMidiBeams).toHaveBeenCalledWith(100);
  });

  it('skips beams in practice mode (lane takes priority)', () => {
    const deps = makeDeps({
      midiInput: { enabled: true },
      practice: { enabled: true },
    });
    runRenderLate(100, deps);
    expect(deps.drawMidiBeams).not.toHaveBeenCalled();
  });

  it('skips beams when MIDI is disabled', () => {
    const deps = makeDeps({ midiInput: { enabled: false } });
    runRenderLate(100, deps);
    expect(deps.drawMidiBeams).not.toHaveBeenCalled();
  });
});

// ─── ripples loop ────────────────────────────────────────────────────

describe('runRenderLate — ripples', () => {
  it('calls update + draw for every ripple', () => {
    const r1 = makeRipple();
    const r2 = makeRipple();
    const ripples = [r1, r2] as unknown as RippleArray;
    const deps = makeDeps({ ripples });
    runRenderLate(100, deps);
    expect(r1.update).toHaveBeenCalled();
    expect(r1.draw).toHaveBeenCalledWith(deps.ctx);
    expect(r2.update).toHaveBeenCalled();
  });

  it('culls dead ripples (life <= 0)', () => {
    const alive = makeRipple(5);
    const dead = makeRipple(0);
    const ripples = [dead, alive, dead] as unknown as RippleArray;
    const deps = makeDeps({ ripples });
    runRenderLate(100, deps);
    expect(deps.ripples.length).toBe(1);
    expect(deps.ripples[0]).toBe(alive);
  });

  it('preserves order while culling', () => {
    const ripples = [
      makeRipple(1),
      makeRipple(0),
      makeRipple(2),
      makeRipple(0),
      makeRipple(3),
    ] as unknown as RippleArray;
    const deps = makeDeps({ ripples });
    runRenderLate(100, deps);
    expect(deps.ripples.map((r) => r.life)).toEqual([1, 2, 3]);
  });
});

// ─── particles loop ──────────────────────────────────────────────────

describe('runRenderLate — particles', () => {
  it('updates + draws every particle + culls dead ones', () => {
    const p1 = makeParticle(2);
    const p2 = makeParticle(0);
    const particles = [p1, p2] as unknown as ParticleArray;
    const deps = makeDeps({ particles });
    runRenderLate(100, deps);
    expect(p1.update).toHaveBeenCalled();
    expect(deps.particles.length).toBe(1);
    expect(deps.particles[0]).toBe(p1);
  });

  it('caps the live count at maxParticles', () => {
    // 5 alive particles, cap at 3 — only first 3 survive.
    const arr = Array.from({ length: 5 }, () => makeParticle(1)) as unknown as ParticleArray;
    const deps = makeDeps({ particles: arr, maxParticles: 3 });
    runRenderLate(100, deps);
    expect(deps.particles.length).toBe(3);
  });
});

// ─── MIDI chord + keyboard ──────────────────────────────────────────

describe('runRenderLate — MIDI chord + keyboard', () => {
  it('draws chord display when MIDI is enabled (regardless of practice)', () => {
    const a = makeDeps({ midiInput: { enabled: true }, practice: { enabled: true } });
    runRenderLate(100, a);
    expect(a.drawMidiChordDisplay).toHaveBeenCalledWith(100);

    const b = makeDeps({ midiInput: { enabled: true }, practice: { enabled: false } });
    runRenderLate(100, b);
    expect(b.drawMidiChordDisplay).toHaveBeenCalledWith(100);
  });

  it('skips chord display when MIDI is off', () => {
    const deps = makeDeps({ midiInput: { enabled: false } });
    runRenderLate(100, deps);
    expect(deps.drawMidiChordDisplay).not.toHaveBeenCalled();
  });

  it('draws virtual keyboard when MIDI is on', () => {
    const deps = makeDeps({ midiInput: { enabled: true } });
    runRenderLate(100, deps);
    expect(deps.drawMidiKeyboard).toHaveBeenCalled();
  });

  it('draws virtual keyboard during practice even when MIDI is off (▼ next-key marker)', () => {
    // Mic-only practice used to lose the keyboard + ▼ marker; the
    // kid had no visual reference for which key to press. Practice
    // mode now forces the keyboard on regardless of MIDI state.
    const deps = makeDeps({ midiInput: { enabled: false }, practice: { enabled: true } });
    runRenderLate(100, deps);
    expect(deps.drawMidiKeyboard).toHaveBeenCalled();
  });

  it('skips virtual keyboard outside practice when MIDI is off', () => {
    const deps = makeDeps({ midiInput: { enabled: false }, practice: { enabled: false } });
    runRenderLate(100, deps);
    expect(deps.drawMidiKeyboard).not.toHaveBeenCalled();
  });
});

// ─── practice lane ──────────────────────────────────────────────────

describe('runRenderLate — practice lane', () => {
  it('draws lane when practice is enabled', () => {
    const deps = makeDeps({ practice: { enabled: true } });
    runRenderLate(100, deps);
    expect(deps.drawPracticeLane).toHaveBeenCalledWith(100);
  });

  it('skips lane outside of practice mode', () => {
    const deps = makeDeps({ practice: { enabled: false } });
    runRenderLate(100, deps);
    expect(deps.drawPracticeLane).not.toHaveBeenCalled();
  });
});

// ─── tail ───────────────────────────────────────────────────────────

describe('runRenderLate — tail', () => {
  it('runs the quest tracker only during active free-play', () => {
    const a = makeDeps({ isFreeplayActive: () => true });
    runRenderLate(100, a);
    expect(a.updateQuestState).toHaveBeenCalledWith(100);

    const b = makeDeps({ isFreeplayActive: () => false });
    runRenderLate(100, b);
    expect(b.updateQuestState).not.toHaveBeenCalled();
  });

  it('always updates play-time + debug overlay', () => {
    const deps = makeDeps();
    runRenderLate(100, deps);
    expect(deps.updatePlayTime).toHaveBeenCalledWith(100);
    expect(deps.updateDebugOverlay).toHaveBeenCalled();
  });
});

// ─── ordering ───────────────────────────────────────────────────────

describe('runRenderLate — ordering', () => {
  it('runs phases in the documented order: beams → ripples → particles → MIDI chord → keyboard → lane → tail', () => {
    const calls: string[] = [];
    const deps = makeDeps({
      midiInput: { enabled: true },
      practice: { enabled: true },
      isFreeplayActive: () => false, // practice → not free-play
      drawMidiBeams: vi.fn(() => calls.push('beams')),
      drawMidiChordDisplay: vi.fn(() => calls.push('chord')),
      drawMidiKeyboard: vi.fn(() => calls.push('keyboard')),
      drawPracticeLane: vi.fn(() => calls.push('lane')),
      updatePlayTime: vi.fn(() => calls.push('playtime')),
      updateDebugOverlay: vi.fn(() => calls.push('debug')),
    });
    runRenderLate(100, deps);
    // Beams skipped because practice is on; chord+keyboard fire; lane fires;
    // tail (no quest because !freeplayActive); playtime + debug fire.
    expect(calls).toEqual(['chord', 'keyboard', 'lane', 'playtime', 'debug']);
  });
});
