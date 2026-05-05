import { describe, it, expect } from 'vitest';
import { initAgcState, stepAgc, suppressVoice, type AgcOptions } from '../src/audio/agc';

const OPTS: AgcOptions = {
  targetRms: 0.06,
  minGain: 1.0,
  maxGain: 40.0,
  attackCoeff: 0.02,
  releaseCoeff: 0.08,
  silenceFloor: 0.0003,
  updateIntervalMs: 100,
  voiceSuppressMax: 8.0,
};

describe('initAgcState', () => {
  it('starts at gain 1.0 by default', () => {
    const s = initAgcState();
    expect(s.gain).toBe(1.0);
    expect(s.smoothedRms).toBe(0);
    expect(s.lastUpdateMs).toBe(0);
    expect(s.voiceSuppressUntilMs).toBe(0);
  });
  it('honors initialGain override', () => {
    expect(initAgcState(5.0).gain).toBe(5.0);
  });
});

describe('stepAgc — throttling', () => {
  it('skips when called within updateIntervalMs', () => {
    const s0 = { ...initAgcState(), lastUpdateMs: 1000 };
    const r = stepAgc(s0, 1050, 0.05, OPTS);
    expect(r.gainOut).toBeNull();
    expect(r.state).toBe(s0); // unchanged reference
  });
  it('runs when interval has elapsed', () => {
    const s0 = { ...initAgcState(), lastUpdateMs: 1000 };
    const r = stepAgc(s0, 1101, 0.05, OPTS);
    expect(r.state.lastUpdateMs).toBe(1101);
  });
});

describe('stepAgc — silence floor', () => {
  it('does NOT push gain when below silence floor', () => {
    const s0 = initAgcState();
    const r = stepAgc(s0, 1000, 0.0001, OPTS); // very quiet
    expect(r.gainOut).toBeNull();
    // Smoothed RMS still updates so the state evolves.
    expect(r.state.smoothedRms).toBeGreaterThan(0);
    expect(r.state.gain).toBe(1.0);
  });
});

describe('stepAgc — gain trajectory', () => {
  it('raises gain over many steps when input is quiet but above floor', () => {
    let state = initAgcState();
    // Simulate 50 steps of input at 0.01 RMS (well below 0.06 target) → gain should climb.
    for (let i = 0; i < 50; i++) {
      const r = stepAgc(state, i * 200, 0.01 * state.gain, OPTS);
      state = r.state;
    }
    expect(state.gain).toBeGreaterThan(1.5);
    expect(state.gain).toBeLessThanOrEqual(OPTS.maxGain);
  });

  it('lowers gain when input is too loud', () => {
    let state = { ...initAgcState(20.0) };
    state.smoothedRms = 0.3; // wildly hot
    for (let i = 0; i < 30; i++) {
      const r = stepAgc(state, i * 200, 0.3, OPTS);
      state = r.state;
    }
    expect(state.gain).toBeLessThan(20.0);
  });

  it('clamps to maxGain', () => {
    let state = initAgcState(OPTS.maxGain);
    for (let i = 0; i < 100; i++) {
      const r = stepAgc(state, i * 200, 0.001 * state.gain, OPTS);
      state = r.state;
    }
    expect(state.gain).toBeLessThanOrEqual(OPTS.maxGain);
  });

  it('clamps to minGain', () => {
    let state = initAgcState();
    for (let i = 0; i < 50; i++) {
      const r = stepAgc(state, i * 200, 1.0, OPTS); // very loud
      state = r.state;
    }
    expect(state.gain).toBeGreaterThanOrEqual(OPTS.minGain);
  });
});

describe('voice suppression', () => {
  it('clamps NEW gain decisions to voiceSuppressMax during the window', () => {
    // Start ABOVE the suppression cap; one step within the window must land
    // the result at or below voiceSuppressMax (the clamp is applied when
    // computing newGain, not retroactively).
    let state = initAgcState(OPTS.maxGain);
    state.smoothedRms = 0.5; // hot enough that AGC will WANT to lower gain
    state = suppressVoice(state, 1000, 500);
    const r = stepAgc(state, 1100, 0.5, OPTS);
    expect(r.state.gain).toBeLessThanOrEqual(OPTS.voiceSuppressMax);
  });

  it('does NOT clamp once suppression deadline has passed', () => {
    // Start at minGain, very quiet input (post-gain RMS slightly above silence
    // floor for a gain=1 baseline). After deadline, AGC pushes gain up freely.
    let state = initAgcState(1.0);
    state = suppressVoice(state, 1000, 500); // deadline t=1500
    let cur = state;
    // First step at t=1600 (past deadline). Use post-gain RMS 0.001 = pre-gain
    // 0.001 (above 0.0003 floor at gain=1). Many steps to let gain climb.
    for (let i = 0; i < 500; i++) {
      const r = stepAgc(cur, 1600 + i * 110, 0.001 * cur.gain, OPTS);
      cur = r.state;
    }
    expect(cur.gain).toBeGreaterThan(OPTS.voiceSuppressMax);
  });
});

describe('purity', () => {
  it('does not mutate the input state', () => {
    const s0 = initAgcState();
    const snapshot = { ...s0 };
    stepAgc(s0, 1000, 0.05, OPTS);
    expect(s0).toEqual(snapshot);
  });

  it('does not mutate options', () => {
    const opts = { ...OPTS };
    const snapshot = { ...opts };
    stepAgc(initAgcState(), 1000, 0.05, opts);
    expect(opts).toEqual(snapshot);
  });
});
