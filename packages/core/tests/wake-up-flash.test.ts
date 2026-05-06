import { describe, it, expect } from 'vitest';
import {
  decayWakeUpFlash,
  initWakeUpFlashState,
  resetWakeUpFlashState,
  triggerWakeUpFlash,
  type WakeUpFlashOptions,
  type WakeUpFlashState,
} from '../src/state/wake-up-flash';

const OPTS: WakeUpFlashOptions = {
  triggerLevel: 0.2,
  halfLifeSec: 0.071, // matches legacy 60Hz `*= 0.85` per-frame feel
};

describe('initWakeUpFlashState / resetWakeUpFlashState', () => {
  it('initial state has flash 0', () => {
    expect(initWakeUpFlashState()).toEqual({ inputFlash: 0 });
  });

  it('reset zeros a populated state', () => {
    const s: WakeUpFlashState = { inputFlash: 0.7 };
    resetWakeUpFlashState(s);
    expect(s.inputFlash).toBe(0);
  });
});

describe('triggerWakeUpFlash', () => {
  it('snaps intensity to triggerLevel', () => {
    const s = initWakeUpFlashState();
    triggerWakeUpFlash(s, OPTS);
    expect(s.inputFlash).toBe(0.2);
  });

  it('overrides any existing decaying value (legacy behavior)', () => {
    const s: WakeUpFlashState = { inputFlash: 0.05 };
    triggerWakeUpFlash(s, OPTS);
    expect(s.inputFlash).toBe(0.2);
  });

  it('clamps triggerLevel to [0, 1] for misconfigured options', () => {
    const s = initWakeUpFlashState();
    triggerWakeUpFlash(s, { ...OPTS, triggerLevel: 1.5 });
    expect(s.inputFlash).toBe(1);
    triggerWakeUpFlash(s, { ...OPTS, triggerLevel: -0.5 });
    expect(s.inputFlash).toBe(0);
  });

  it('repeated triggers do not compound past 1.0', () => {
    const s = initWakeUpFlashState();
    for (let i = 0; i < 100; i++) triggerWakeUpFlash(s, OPTS);
    expect(s.inputFlash).toBe(0.2);
    expect(s.inputFlash).toBeLessThanOrEqual(1);
  });
});

describe('decayWakeUpFlash', () => {
  it('halves intensity after one half-life', () => {
    const s: WakeUpFlashState = { inputFlash: 0.2 };
    decayWakeUpFlash(s, OPTS.halfLifeSec, OPTS);
    expect(s.inputFlash).toBeCloseTo(0.1, 6);
  });

  it('quarters intensity after two half-lives', () => {
    const s: WakeUpFlashState = { inputFlash: 0.2 };
    decayWakeUpFlash(s, OPTS.halfLifeSec * 2, OPTS);
    expect(s.inputFlash).toBeCloseTo(0.05, 6);
  });

  it('snaps to 0 below the 0.001 floor (no shimmer at near-zero)', () => {
    const s: WakeUpFlashState = { inputFlash: 0.2 };
    // Eight half-lives → 0.2 * (1/2)^8 = 0.00078 → snaps to 0.
    decayWakeUpFlash(s, OPTS.halfLifeSec * 8, OPTS);
    expect(s.inputFlash).toBe(0);
  });

  it('60Hz frame steps and 144Hz frame steps converge to the same level (frame-rate independence)', () => {
    const s60: WakeUpFlashState = { inputFlash: 0.2 };
    const s144: WakeUpFlashState = { inputFlash: 0.2 };
    const totalSec = 0.5;
    const frames60 = 30;
    const frames144 = 72;
    for (let i = 0; i < frames60; i++) decayWakeUpFlash(s60, totalSec / frames60, OPTS);
    for (let i = 0; i < frames144; i++) decayWakeUpFlash(s144, totalSec / frames144, OPTS);
    expect(s60.inputFlash).toBeCloseTo(s144.inputFlash, 6);
  });

  it('rejects non-positive dtSec', () => {
    const s: WakeUpFlashState = { inputFlash: 0.2 };
    decayWakeUpFlash(s, 0, OPTS);
    decayWakeUpFlash(s, -1, OPTS);
    expect(s.inputFlash).toBe(0.2);
  });

  it('no-op when already at zero', () => {
    const s: WakeUpFlashState = { inputFlash: 0 };
    decayWakeUpFlash(s, 1.0, OPTS);
    expect(s.inputFlash).toBe(0);
  });
});

describe('full lifecycle', () => {
  it('a single trigger decays to 0 within ~0.6 s of frames', () => {
    const s = initWakeUpFlashState();
    triggerWakeUpFlash(s, OPTS);
    expect(s.inputFlash).toBe(0.2);
    // 0.2 starts ~7 half-lives above the 0.001 snap-to-zero floor; 0.6 s
    // wall-clock = ~8.5 half-lives → snap fires.
    for (let i = 0; i < 36; i++) decayWakeUpFlash(s, 1 / 60, OPTS);
    expect(s.inputFlash).toBe(0);
  });

  it('a trigger mid-decay snaps back to peak (override semantics)', () => {
    const s = initWakeUpFlashState();
    triggerWakeUpFlash(s, OPTS);
    decayWakeUpFlash(s, OPTS.halfLifeSec * 3, OPTS);
    expect(s.inputFlash).toBeLessThan(0.05);
    triggerWakeUpFlash(s, OPTS);
    expect(s.inputFlash).toBe(0.2);
  });
});
