// Tests for packages/web/src/agc-controller.ts.

import { describe, it, expect, vi } from 'vitest';
import {
  updateAGC,
  type AgcControllerDeps,
  type AgcStateRef,
  type AgcTuning,
} from '../src/agc-controller';

const TUNING: AgcTuning = {
  updateIntervalMs: 100,
  silenceFloor: 0.001,
  voiceSuppressMax: 5,
  maxGain: 40,
  minGain: 1,
  targetRms: 0.05,
  attackCoeff: 0.05,
  releaseCoeff: 0.3,
};

function makeFixture(over: { state?: Partial<AgcStateRef>; tuning?: Partial<AgcTuning> } = {}) {
  const state: AgcStateRef = {
    agcLastUpdateMs: -1000,
    agcSmoothedRms: 0,
    agcGain: 10,
    agcVoiceSuppressUntilMs: 0,
    debugAgcGain: 0,
    ...over.state,
  };
  const setValueAtTime = vi.fn();
  const deps: AgcControllerDeps = {
    state,
    tuning: { ...TUNING, ...over.tuning },
    getGainNode: () => ({ gain: { setValueAtTime } }),
    getAudioCtx: () => ({ currentTime: 1.5 }),
  };
  return { state, deps, setValueAtTime };
}

describe('updateAGC — throttle', () => {
  it('skips when called within updateIntervalMs', () => {
    const fx = makeFixture({ state: { agcLastUpdateMs: 1000 } });
    updateAGC(1050, 0.05, fx.deps);
    expect(fx.setValueAtTime).not.toHaveBeenCalled();
  });

  it('runs after updateIntervalMs has elapsed', () => {
    const fx = makeFixture({ state: { agcLastUpdateMs: 1000 } });
    updateAGC(1101, 0.05, fx.deps);
    expect(fx.state.agcLastUpdateMs).toBe(1101);
  });
});

describe('updateAGC — silence floor', () => {
  it('skips gain update when preGainRms < silenceFloor', () => {
    const fx = makeFixture({
      state: { agcGain: 10, agcSmoothedRms: 0.005 }, // preGainRms = 0.0005 < 0.001
    });
    updateAGC(1000, 0.005, fx.deps);
    expect(fx.setValueAtTime).not.toHaveBeenCalled();
  });
});

describe('updateAGC — gain math', () => {
  it('writes to GainNode + state.debugAgcGain', () => {
    // Seed smoothedRms above silenceFloor so the first call exits the
    // pre-gain-RMS gate (preGainRms = smoothedRms / agcGain >= floor).
    const fx = makeFixture({ state: { agcGain: 10, agcSmoothedRms: 0.05 } });
    updateAGC(1000, 0.05, fx.deps);
    expect(fx.setValueAtTime).toHaveBeenCalled();
    expect(fx.state.debugAgcGain).toBe(fx.state.agcGain);
  });

  it('clamps gain to [minGain, maxGain]', () => {
    // Need preGainRms = smoothedRms / agcGain >= silenceFloor (0.001).
    // 0.5 / 100 = 0.005 > 0.001 ✓.
    const fx = makeFixture({
      state: { agcGain: 100, agcSmoothedRms: 0.5 },
    });
    updateAGC(1000, 0.5, fx.deps);
    expect(fx.state.agcGain).toBeLessThanOrEqual(40);
    expect(fx.state.agcGain).toBeGreaterThanOrEqual(1);
  });

  it('voice suppression caps gain at voiceSuppressMax', () => {
    // Loop a few ticks to let the asymmetric release pull the gain
    // down toward the suppress cap. Single-tick attack/release alpha
    // means we don't fully jump in one frame.
    const fx = makeFixture({
      state: {
        agcGain: 30,
        agcSmoothedRms: 0.05,
        agcVoiceSuppressUntilMs: 5000,
      },
    });
    let t = 1000;
    for (let i = 0; i < 60; i++) {
      updateAGC(t, 0.05, fx.deps);
      t += 100;
    }
    expect(fx.state.agcGain).toBeLessThanOrEqual(5);
  });

  it('attack vs release: rising gain uses attack coeff', () => {
    // smoothedRms < target means AGC wants to push gain UP. seed
    // smoothed enough to clear silenceFloor.
    const fx = makeFixture({
      state: { agcGain: 5, agcSmoothedRms: 0.01 }, // preGainRms=0.002 > 0.001 floor
    });
    updateAGC(1000, 0.01, fx.deps);
    expect(fx.state.agcGain).toBeGreaterThan(5);
    // Slow rise (alpha=0.05) — not a full ratio jump from 5 → 25.
    expect(fx.state.agcGain).toBeLessThan(7);
  });

  it('falling gain uses release coeff (faster)', () => {
    const fx = makeFixture({
      state: { agcGain: 30, agcSmoothedRms: 0.5 }, // way over target
    });
    updateAGC(1000, 0.5, fx.deps);
    expect(fx.state.agcGain).toBeLessThan(28);
  });
});
