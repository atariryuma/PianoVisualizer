import { describe, it, expect } from 'vitest';
import {
  applyActivePlay,
  applyOnsetPitch,
  decayStability,
  initPitchStabilityState,
  pitchHzToSemitones,
  resetPitchStabilityState,
  type PitchStabilityOptions,
  type PitchStabilityState,
} from '../src/state/pitch-stability';

const OPTS: PitchStabilityOptions = {
  semitoneThreshold: 3,
  growth: 0.05,
  decayOnJump: 0.9,
  idleHalfLifeSec: 5.0,
  activePlayRate: 0.005,
  activePlayFloor: 0.2,
};

describe('pitchHzToSemitones', () => {
  it('A4 (440Hz) maps to MIDI 69', () => {
    expect(pitchHzToSemitones(440)).toBeCloseTo(69, 6);
  });

  it('A5 (880Hz) maps to MIDI 81 — one octave above A4', () => {
    expect(pitchHzToSemitones(880)).toBeCloseTo(81, 6);
  });

  it('A3 (220Hz) maps to MIDI 57', () => {
    expect(pitchHzToSemitones(220)).toBeCloseTo(57, 6);
  });

  it('returns null for non-positive frequencies', () => {
    expect(pitchHzToSemitones(0)).toBeNull();
    expect(pitchHzToSemitones(-100)).toBeNull();
  });

  it('returns null for non-finite frequencies', () => {
    expect(pitchHzToSemitones(NaN)).toBeNull();
    expect(pitchHzToSemitones(Infinity)).toBeNull();
  });
});

describe('initPitchStabilityState / resetPitchStabilityState', () => {
  it('initial state has stability 0 and no prior pitch', () => {
    const s = initPitchStabilityState();
    expect(s.pitchStability).toBe(0);
    expect(s.lastPitchSemitones).toBeNull();
  });

  it('reset returns a populated state to initial', () => {
    const s: PitchStabilityState = { pitchStability: 0.7, lastPitchSemitones: 60 };
    resetPitchStabilityState(s);
    expect(s).toEqual(initPitchStabilityState());
  });
});

describe('applyOnsetPitch — first onset', () => {
  it('seeds lastPitchSemitones and leaves stability at 0', () => {
    const s = initPitchStabilityState();
    applyOnsetPitch(s, 60, OPTS);
    expect(s.lastPitchSemitones).toBe(60);
    expect(s.pitchStability).toBe(0);
  });

  it('ignores null pitch (unknown / sentinel)', () => {
    const s = initPitchStabilityState();
    s.pitchStability = 0.5;
    applyOnsetPitch(s, null, OPTS);
    expect(s.pitchStability).toBe(0.5);
    expect(s.lastPitchSemitones).toBeNull();
  });

  it('ignores non-finite pitch', () => {
    const s = initPitchStabilityState();
    s.lastPitchSemitones = 60;
    applyOnsetPitch(s, NaN, OPTS);
    expect(s.lastPitchSemitones).toBe(60);
  });
});

describe('applyOnsetPitch — same pitch (delta < threshold)', () => {
  it('grows stability by `growth`', () => {
    const s: PitchStabilityState = { pitchStability: 0.4, lastPitchSemitones: 60 };
    applyOnsetPitch(s, 60.5, OPTS); // delta 0.5 < 3
    expect(s.pitchStability).toBeCloseTo(0.45, 6);
    expect(s.lastPitchSemitones).toBe(60.5);
  });

  it('caps stability at 1.0', () => {
    const s: PitchStabilityState = { pitchStability: 0.98, lastPitchSemitones: 60 };
    applyOnsetPitch(s, 60, OPTS);
    expect(s.pitchStability).toBe(1);
  });

  it('a sequence of stable onsets monotonically grows stability', () => {
    const s = initPitchStabilityState();
    applyOnsetPitch(s, 60, OPTS); // seed
    for (let i = 0; i < 10; i++) {
      applyOnsetPitch(s, 60, OPTS);
    }
    expect(s.pitchStability).toBeCloseTo(0.5, 6); // 10 * 0.05
  });
});

describe('applyOnsetPitch — pitch jump (delta >= threshold)', () => {
  it('multiplies stability by `decayOnJump`', () => {
    const s: PitchStabilityState = { pitchStability: 0.5, lastPitchSemitones: 60 };
    applyOnsetPitch(s, 67, OPTS); // delta 7 >= 3
    expect(s.pitchStability).toBeCloseTo(0.45, 6); // 0.5 * 0.9
    expect(s.lastPitchSemitones).toBe(67);
  });

  it('exactly-threshold delta counts as a jump', () => {
    const s: PitchStabilityState = { pitchStability: 0.5, lastPitchSemitones: 60 };
    applyOnsetPitch(s, 63, OPTS); // delta 3 — `< threshold` is false
    expect(s.pitchStability).toBeCloseTo(0.45, 6);
  });
});

describe('applyActivePlay — attractor', () => {
  it('pulls a high stability down toward the floor', () => {
    const s: PitchStabilityState = { pitchStability: 0.9, lastPitchSemitones: 60 };
    applyActivePlay(s, OPTS);
    // s' = 0.9 * 0.995 + 0.005 * 0.2 = 0.8955 + 0.001 = 0.8965
    expect(s.pitchStability).toBeCloseTo(0.8965, 6);
  });

  it('pulls a low stability up toward the floor', () => {
    const s: PitchStabilityState = { pitchStability: 0.0, lastPitchSemitones: 60 };
    applyActivePlay(s, OPTS);
    // s' = 0 * 0.995 + 0.005 * 0.2 = 0.001
    expect(s.pitchStability).toBeCloseTo(0.001, 6);
  });

  it('many calls converge to the floor', () => {
    const s: PitchStabilityState = { pitchStability: 1.0, lastPitchSemitones: 60 };
    for (let i = 0; i < 5000; i++) applyActivePlay(s, OPTS);
    expect(s.pitchStability).toBeCloseTo(0.2, 4);
  });

  it('clamps the result to [0, 1]', () => {
    const s: PitchStabilityState = { pitchStability: 1.0, lastPitchSemitones: 60 };
    // With activePlayFloor>1 (unusual config), the formula could exceed 1.
    const overshoot: PitchStabilityOptions = { ...OPTS, activePlayFloor: 2.0, activePlayRate: 1.0 };
    applyActivePlay(s, overshoot);
    expect(s.pitchStability).toBeLessThanOrEqual(1);
    expect(s.pitchStability).toBeGreaterThanOrEqual(0);
  });
});

describe('decayStability — idle decay', () => {
  it('halves stability after one full half-life', () => {
    const s: PitchStabilityState = { pitchStability: 0.8, lastPitchSemitones: 60 };
    decayStability(s, 5.0, OPTS); // exactly idleHalfLifeSec
    expect(s.pitchStability).toBeCloseTo(0.4, 6);
  });

  it('quarters stability after two half-lives', () => {
    const s: PitchStabilityState = { pitchStability: 0.8, lastPitchSemitones: 60 };
    decayStability(s, 10.0, OPTS);
    expect(s.pitchStability).toBeCloseTo(0.2, 6);
  });

  it('many small frames at 60Hz match one big step (frame-rate independence)', () => {
    const s60: PitchStabilityState = { pitchStability: 0.8, lastPitchSemitones: 60 };
    const sBig: PitchStabilityState = { pitchStability: 0.8, lastPitchSemitones: 60 };
    const totalSec = 5.0;
    const frames = 300; // 60 fps * 5s
    for (let i = 0; i < frames; i++) decayStability(s60, totalSec / frames, OPTS);
    decayStability(sBig, totalSec, OPTS);
    expect(s60.pitchStability).toBeCloseTo(sBig.pitchStability, 6);
  });

  it('many small frames at 144Hz also match (high-refresh parity)', () => {
    const s144: PitchStabilityState = { pitchStability: 0.8, lastPitchSemitones: 60 };
    const sBig: PitchStabilityState = { pitchStability: 0.8, lastPitchSemitones: 60 };
    const totalSec = 5.0;
    const frames = 720; // 144 fps * 5s
    for (let i = 0; i < frames; i++) decayStability(s144, totalSec / frames, OPTS);
    decayStability(sBig, totalSec, OPTS);
    expect(s144.pitchStability).toBeCloseTo(sBig.pitchStability, 6);
  });

  it('rejects non-positive dtSec', () => {
    const s: PitchStabilityState = { pitchStability: 0.5, lastPitchSemitones: 60 };
    decayStability(s, 0, OPTS);
    expect(s.pitchStability).toBe(0.5);
    decayStability(s, -1, OPTS);
    expect(s.pitchStability).toBe(0.5);
  });
});

describe('cross-source pitch coherence', () => {
  it('a mic onset followed by a same-pitch MIDI onset registers as stable', () => {
    const s = initPitchStabilityState();
    // Mic detects A4 (440Hz) → semitones 69
    const micSemis = pitchHzToSemitones(440)!;
    applyOnsetPitch(s, micSemis, OPTS); // seed
    // User switches to MIDI, plays MIDI 69 (same pitch)
    applyOnsetPitch(s, 69, OPTS);
    // delta should be ~0, stability grows
    expect(s.pitchStability).toBeCloseTo(0.05, 6);
  });

  it('a mic onset followed by an octave-up MIDI onset registers as a jump', () => {
    const s: PitchStabilityState = {
      pitchStability: 0.5,
      lastPitchSemitones: pitchHzToSemitones(440)!,
    };
    applyOnsetPitch(s, 81, OPTS); // 12 semitones up
    expect(s.pitchStability).toBeCloseTo(0.45, 6); // 0.5 * 0.9
  });
});
