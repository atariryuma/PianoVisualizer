// @vitest-environment happy-dom
//
// Tests for packages/web/src/session-confidence-ui.ts.
//
// Covers:
//   • Sample-interval throttling.
//   • Ring buffer head/tail/size invariants + isPiano running count.
//   • State transitions: waiting → warmup → performing.
//   • Loss thresholds: warmup → waiting; performing → warmup.
//   • Goal completion + celebrate window + triggerEffect call.
//   • DOM sessionStatus writes for each state.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateSessionConfidence,
  type SessionConfidenceDeps,
  type SessionConfidenceStateRef,
  type SessionConfidenceTuning,
  type SessionSample,
} from '../src/session-confidence-ui';

const TUNING: SessionConfidenceTuning = {
  sampleIntervalMs: 250,
  windowMs: 5000,
  confirmThreshold: 0.7,
  loseThreshold: 0.4,
  warmupMs: 1500,
  motivationGoalMs: 30_000,
  ringCap: 20,
};

function makeState(): SessionConfidenceStateRef {
  return {
    lastSessionSampleMs: -10_000,
    sessionRingHead: 0,
    sessionRingTail: 0,
    sessionRingSize: 0,
    sessionPianoCount: 0,
    sessionConfidence: 0,
    sessionState: 'waiting',
    sessionStartMs: 0,
    sessionPerformingStartMs: 0,
    goalWindowStartMs: 0,
    goalCompletedCount: 0,
    goalCelebrateUntilMs: 0,
    debugSessionConf: 0,
    debugSessionState: '',
  };
}

function makeRing(cap: number): SessionSample[] {
  const r: SessionSample[] = [];
  for (let i = 0; i < cap; i++) r.push({ timeMs: 0, isPiano: false });
  return r;
}

interface Fixture {
  deps: SessionConfidenceDeps;
  state: SessionConfidenceStateRef;
  ring: SessionSample[];
  triggerEffect: ReturnType<typeof vi.fn>;
  sessionStatus: HTMLElement;
}

function makeFixture(over: { tuning?: Partial<SessionConfidenceTuning> } = {}): Fixture {
  const state = makeState();
  const tuning = { ...TUNING, ...over.tuning };
  const ring = makeRing(tuning.ringCap);
  const sessionStatus = document.createElement('div');
  document.body.appendChild(sessionStatus);
  const triggerEffect = vi.fn();
  const deps: SessionConfidenceDeps = {
    state,
    sessionRing: ring,
    tuning,
    dom: { sessionStatus },
    t: (key, vars) => (vars ? `T(${key},${JSON.stringify(vars)})` : `T(${key})`),
    triggerEffect,
  };
  return { deps, state, ring, triggerEffect, sessionStatus };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('updateSessionConfidence — throttle', () => {
  it('skips when called within sampleIntervalMs of last sample', () => {
    const fx = makeFixture();
    fx.state.lastSessionSampleMs = 1000;
    updateSessionConfidence(1100, true, fx.deps); // 100ms after, < 250ms
    expect(fx.state.sessionRingSize).toBe(0);
  });

  it('runs after sampleIntervalMs has elapsed', () => {
    const fx = makeFixture();
    fx.state.lastSessionSampleMs = 1000;
    updateSessionConfidence(1300, true, fx.deps);
    expect(fx.state.sessionRingSize).toBe(1);
  });
});

describe('updateSessionConfidence — ring buffer', () => {
  it('size grows up to ringCap, then evictions kick in', () => {
    const fx = makeFixture({ tuning: { ringCap: 4 } });
    for (let i = 0; i < 10; i++) {
      updateSessionConfidence(i * 300, true, fx.deps);
    }
    expect(fx.state.sessionRingSize).toBe(4);
  });

  it('expires samples outside windowMs', () => {
    const fx = makeFixture({ tuning: { windowMs: 1000 } });
    for (let i = 0; i < 4; i++) {
      updateSessionConfidence(i * 300, true, fx.deps);
    }
    // Last batch: samples at t=0,300,600,900. windowStart at 2000-1000=1000.
    // ALL of {0,300,600,900} < 1000 → all expired. Only the 2000 sample remains.
    updateSessionConfidence(2000, true, fx.deps);
    expect(fx.state.sessionRingSize).toBe(1);
  });

  it('sessionPianoCount tracks isPiano sum', () => {
    const fx = makeFixture();
    updateSessionConfidence(0, true, fx.deps);
    updateSessionConfidence(300, false, fx.deps);
    updateSessionConfidence(600, true, fx.deps);
    expect(fx.state.sessionPianoCount).toBe(2);
  });
});

describe('updateSessionConfidence — state machine', () => {
  function pumpSamples(fx: Fixture, count: number, isPiano: boolean, startMs = 0): number {
    let t = startMs;
    for (let i = 0; i < count; i++) {
      updateSessionConfidence(t, isPiano, fx.deps);
      t += 300;
    }
    return t;
  }

  it('waiting → warmup when confidence ≥ confirmThreshold', () => {
    const fx = makeFixture();
    pumpSamples(fx, 5, true);
    expect(fx.state.sessionState).toBe('warmup');
  });

  it('warmup → performing after warmupMs at confidence ≥ confirmThreshold', () => {
    const fx = makeFixture({ tuning: { warmupMs: 600 } });
    const t = pumpSamples(fx, 5, true); // → warmup at t≈300
    fx.state.sessionStartMs = 0; // align baseline
    // Pump more samples past warmupMs.
    pumpSamples(fx, 5, true, t);
    expect(fx.state.sessionState).toBe('performing');
  });

  it('warmup → waiting on confidence < loseThreshold', () => {
    const fx = makeFixture();
    pumpSamples(fx, 5, true); // → warmup
    const t = 5 * 300;
    pumpSamples(fx, 8, false, t); // confidence drops
    expect(fx.state.sessionState).toBe('waiting');
  });

  it('leaves performing on confidence < loseThreshold', () => {
    // Use a small ringCap so a short burst of false samples actually
    // drops confidence below loseThreshold. Confidence drop transitions
    // performing → warmup (and a continued drop drops further to
    // waiting); both are valid "left performing".
    const fx = makeFixture({ tuning: { warmupMs: 100, ringCap: 6 } });
    let t = pumpSamples(fx, 5, true); // → warmup
    fx.state.sessionStartMs = 0;
    t = pumpSamples(fx, 5, true, t); // → performing
    expect(fx.state.sessionState).toBe('performing');
    pumpSamples(fx, 8, false, t);
    expect(fx.state.sessionState).not.toBe('performing');
  });
});

describe('updateSessionConfidence — DOM', () => {
  it('writes listeningFmt during warmup', () => {
    const fx = makeFixture();
    for (let i = 0; i < 5; i++) updateSessionConfidence(i * 300, true, fx.deps);
    expect(fx.sessionStatus.textContent).toContain('listeningFmt');
    expect(fx.sessionStatus.classList.contains('visible')).toBe(true);
  });

  it('writes goalCelebrate within celebrate window', () => {
    const fx = makeFixture({ tuning: { warmupMs: 100 } });
    let t = 0;
    for (let i = 0; i < 5; i++) {
      updateSessionConfidence(t, true, fx.deps);
      t += 300;
    }
    fx.state.sessionStartMs = 0;
    for (let i = 0; i < 5; i++) {
      updateSessionConfidence(t, true, fx.deps);
      t += 300;
    }
    fx.state.goalCelebrateUntilMs = t + 5000;
    updateSessionConfidence(t + 300, true, fx.deps);
    expect(fx.sessionStatus.textContent).toBe('T(goalCelebrate)');
  });

  it('hides indicator when in waiting state', () => {
    const fx = makeFixture();
    fx.sessionStatus.classList.add('visible');
    // Pump non-piano samples — confidence stays 0, state stays waiting.
    for (let i = 0; i < 5; i++) updateSessionConfidence(i * 300, false, fx.deps);
    expect(fx.sessionStatus.classList.contains('visible')).toBe(false);
  });
});

describe('updateSessionConfidence — goal celebration', () => {
  it('triggers radiance effect after motivationGoalMs in performing', () => {
    const fx = makeFixture({ tuning: { warmupMs: 100, motivationGoalMs: 1000 } });
    let t = 0;
    // Climb to performing.
    for (let i = 0; i < 5; i++) {
      updateSessionConfidence(t, true, fx.deps);
      t += 300;
    }
    fx.state.sessionStartMs = 0;
    for (let i = 0; i < 3; i++) {
      updateSessionConfidence(t, true, fx.deps);
      t += 300;
    }
    expect(fx.state.sessionState).toBe('performing');
    const goalStart = fx.state.goalWindowStartMs;
    // Pump until we cross motivationGoalMs.
    while (t - goalStart < 1500) {
      updateSessionConfidence(t, true, fx.deps);
      t += 300;
    }
    expect(fx.triggerEffect).toHaveBeenCalledWith('radiance');
    expect(fx.state.goalCompletedCount).toBeGreaterThan(0);
  });
});
