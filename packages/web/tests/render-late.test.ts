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

  it('draws beams in free-play even when MIDI is off (mic-pipeline feeds activeNotes)', () => {
    // Beams are no longer gated on midiInput.enabled — mic-pipeline
    // populates midiState.activeNotes for detected pitches too, and
    // the drawMidiBeams renderer self-exits when activeNotes is
    // empty. So calling it unconditionally outside practice is safe
    // + cheap and unlocks mic-only beam rendering.
    const deps = makeDeps({ midiInput: { enabled: false }, practice: { enabled: false } });
    runRenderLate(100, deps);
    expect(deps.drawMidiBeams).toHaveBeenCalledWith(100);
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
  it('always invokes the chord-display renderer (renderer self-exits when empty)', () => {
    // Chord display is no longer gated on midiInput.enabled — mic
    // arpeggios now feed the chord-window detector too. The
    // drawMidiChordDisplay renderer checks lastChordName itself and
    // returns immediately when there's nothing to show, so calling
    // it on every frame is cheap and unifies the gating logic.
    const a = makeDeps({ midiInput: { enabled: true }, practice: { enabled: true } });
    runRenderLate(100, a);
    expect(a.drawMidiChordDisplay).toHaveBeenCalledWith(100);

    const b = makeDeps({ midiInput: { enabled: false }, practice: { enabled: false } });
    runRenderLate(100, b);
    expect(b.drawMidiChordDisplay).toHaveBeenCalledWith(100);
  });

  it('always invokes the virtual-keyboard renderer (loop only ticks during a session)', () => {
    // Same rationale: render-loop.tick() returns early when
    // state.running is false, so reaching runRenderLate already
    // implies an active session. Keyboard renders unconditionally;
    // mic-detected pitches, MIDI presses, and the practice ▼ hint
    // all show on the same surface.
    const off = makeDeps({ midiInput: { enabled: false }, practice: { enabled: false } });
    runRenderLate(100, off);
    expect(off.drawMidiKeyboard).toHaveBeenCalled();

    const midi = makeDeps({ midiInput: { enabled: true } });
    runRenderLate(100, midi);
    expect(midi.drawMidiKeyboard).toHaveBeenCalled();

    const prac = makeDeps({ midiInput: { enabled: false }, practice: { enabled: true } });
    runRenderLate(100, prac);
    expect(prac.drawMidiKeyboard).toHaveBeenCalled();
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

// ─── [R2-5] skipDraw（タイトル表示中） ──────────────────────────────

describe('runRenderLate — skipDraw', () => {
  it('skipDraw=true: update+cull は継続、draw と canvas 描画は全スキップ', () => {
    const alive = makeRipple(5);
    const dead = makeRipple(0);
    const p1 = makeParticle(2);
    const pDead = makeParticle(0);
    const deps = makeDeps({
      ripples: [alive, dead] as unknown as RippleArray,
      particles: [p1, pDead] as unknown as ParticleArray,
      midiInput: { enabled: true },
      practice: { enabled: true },
      skipDraw: true,
    });
    runRenderLate(100, deps);
    // 物理は進む + cull される（タイトル中の滞留防止）
    expect(alive.update).toHaveBeenCalled();
    expect(p1.update).toHaveBeenCalled();
    expect(deps.ripples.length).toBe(1);
    expect(deps.particles.length).toBe(1);
    // 描画は一切走らない
    expect(alive.draw).not.toHaveBeenCalled();
    expect(p1.draw).not.toHaveBeenCalled();
    expect(deps.drawMidiBeams).not.toHaveBeenCalled();
    expect(deps.drawMidiChordDisplay).not.toHaveBeenCalled();
    expect(deps.drawMidiKeyboard).not.toHaveBeenCalled();
    expect(deps.drawPracticeLane).not.toHaveBeenCalled();
  });

  it('skipDraw=true でも playtime + debug overlay の状態更新は継続', () => {
    const deps = makeDeps({ skipDraw: true });
    runRenderLate(100, deps);
    expect(deps.updatePlayTime).toHaveBeenCalledWith(100);
    expect(deps.updateDebugOverlay).toHaveBeenCalled();
  });

  it('skipDraw 省略時は従来どおり全描画（practice / フリープレイ不変）', () => {
    const r = makeRipple(1);
    const deps = makeDeps({
      ripples: [r] as unknown as RippleArray,
      practice: { enabled: true },
    });
    runRenderLate(100, deps);
    expect(r.draw).toHaveBeenCalledWith(deps.ctx);
    expect(deps.drawMidiChordDisplay).toHaveBeenCalled();
    expect(deps.drawMidiKeyboard).toHaveBeenCalled();
    expect(deps.drawPracticeLane).toHaveBeenCalled();
  });
});

// ─── dtNorm 貫通 ────────────────────────────────────────────────────

describe('runRenderLate — dtNorm', () => {
  it('dtNorm をリップル・パーティクルの update に貫通させる', () => {
    const r = makeRipple(1);
    const p = makeParticle(1);
    const deps = makeDeps({
      ripples: [r] as unknown as RippleArray,
      particles: [p] as unknown as ParticleArray,
    });
    runRenderLate(100, deps, 2);
    expect(r.update).toHaveBeenCalledWith(2);
    expect(p.update).toHaveBeenCalledWith(2);
  });

  it('省略時は dtNorm=1（60fps の従来挙動）', () => {
    const r = makeRipple(1);
    const deps = makeDeps({ ripples: [r] as unknown as RippleArray });
    runRenderLate(100, deps);
    expect(r.update).toHaveBeenCalledWith(1);
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
