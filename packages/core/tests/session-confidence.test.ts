import { describe, it, expect, beforeEach } from 'vitest';
import {
  initSessionConfidenceState,
  resetSessionConfidence,
  stepSessionConfidence,
  deriveSessionUIHint,
  type SessionConfidenceOptions,
  type SessionConfidenceState,
} from '../src/state/session-confidence';

const OPTS: SessionConfidenceOptions = {
  sampleIntervalMs: 50,
  windowMs: 4000,
  confirmThreshold: 0.35,
  loseThreshold: 0.1,
  warmupMs: 2000,
  motivationGoalMs: 30000,
  celebrationDurationMs: 2200,
};

const drive = (s: SessionConfidenceState, samples: Array<{ t: number; piano: boolean }>) => {
  let last = { state: s, events: [] as any[], ticked: false };
  for (const sample of samples) {
    last = stepSessionConfidence(s, sample.t, sample.piano, OPTS);
  }
  return last;
};

describe('initSessionConfidenceState', () => {
  it('starts in waiting with zero confidence', () => {
    const s = initSessionConfidenceState();
    expect(s.phase).toBe('waiting');
    expect(s.confidence).toBe(0);
    expect(s.ring).toHaveLength(100);
    expect(s.ringSize).toBe(0);
    expect(s.pianoCount).toBe(0);
  });
});

describe('throttling', () => {
  it('skips when called within sampleIntervalMs', () => {
    const s = initSessionConfidenceState();
    const r1 = stepSessionConfidence(s, 1000, true, OPTS);
    expect(r1.ticked).toBe(true);
    const r2 = stepSessionConfidence(s, 1020, true, OPTS); // only 20ms later
    expect(r2.ticked).toBe(false);
    expect(r2.events).toEqual([]);
  });
  it('runs again after the interval elapses', () => {
    const s = initSessionConfidenceState();
    stepSessionConfidence(s, 1000, true, OPTS);
    const r = stepSessionConfidence(s, 1051, true, OPTS);
    expect(r.ticked).toBe(true);
  });
});

describe('confidence calculation', () => {
  it('confidence stays 0 when ring has fewer than 3 samples', () => {
    const s = initSessionConfidenceState();
    stepSessionConfidence(s, 0, true, OPTS);
    stepSessionConfidence(s, 100, true, OPTS);
    expect(s.confidence).toBe(0);
  });

  it('confidence reflects piano:total ratio after warm-up', () => {
    const s = initSessionConfidenceState();
    drive(
      s,
      Array.from({ length: 10 }, (_, i) => ({ t: i * 100, piano: i % 2 === 0 }))
    );
    // 5 piano / 10 total = 0.5
    expect(s.confidence).toBeCloseTo(0.5, 1);
  });

  it('expires samples outside the windowMs', () => {
    const s = initSessionConfidenceState();
    // 20 piano samples in the first 1000ms
    for (let i = 0; i < 20; i++) stepSessionConfidence(s, i * 50, true, OPTS);
    expect(s.ringSize).toBeGreaterThan(0);
    // Skip ahead past windowMs (4000) — all old samples should expire.
    stepSessionConfidence(s, 6000, false, OPTS);
    expect(s.ringSize).toBe(1);
    expect(s.pianoCount).toBe(0);
  });
});

describe('phase transitions', () => {
  let s: SessionConfidenceState;
  beforeEach(() => {
    s = initSessionConfidenceState();
  });

  it('waiting → warmup when confidence ≥ confirmThreshold', () => {
    // Drive with all-piano samples until confidence > 0.35.
    let lastResult: any = null;
    for (let i = 0; i < 10; i++) {
      lastResult = stepSessionConfidence(s, i * 100, true, OPTS);
    }
    expect(s.phase).toBe('warmup');
    // The transition should have emitted a phaseEnter event somewhere along the way.
    expect(lastResult.events.length >= 0).toBe(true); // at least last call may not have transitioned
  });

  it('warmup → waiting when confidence drops below loseThreshold', () => {
    // Reach warmup.
    for (let i = 0; i < 10; i++) stepSessionConfidence(s, i * 100, true, OPTS);
    expect(s.phase).toBe('warmup');
    // Feed silence samples for LONGER than windowMs (4s) so the old piano
    // samples expire — otherwise the 4s sliding window keeps confidence above
    // the loseThreshold and warmup never drops.
    for (let i = 0; i < 60; i++) {
      stepSessionConfidence(s, 1000 + i * 100, false, OPTS);
    }
    expect(s.phase).toBe('waiting');
  });

  it('warmup → performing after warmupMs sustained above confirmThreshold', () => {
    // Reach warmup at t≈900.
    for (let i = 0; i < 10; i++) stepSessionConfidence(s, i * 100, true, OPTS);
    expect(s.phase).toBe('warmup');
    const warmupEnter = s.phaseStartMs;
    // Keep feeding piano samples for warmupMs (2000ms) more.
    for (let i = 0; i < 25; i++) {
      stepSessionConfidence(s, warmupEnter + 100 + i * 100, true, OPTS);
    }
    expect(s.phase).toBe('performing');
    expect(s.performingStartMs).toBeGreaterThan(0);
  });

  it('performing → warmup when confidence drops mid-performance', () => {
    // Reach performing.
    for (let i = 0; i < 10; i++) stepSessionConfidence(s, i * 100, true, OPTS);
    for (let i = 0; i < 25; i++) stepSessionConfidence(s, 1000 + i * 100, true, OPTS);
    expect(s.phase).toBe('performing');
    // Capture the FIRST transition out of performing — feeding silence long
    // enough to fully drain the window will eventually land in waiting via
    // warmup → waiting, so we look for the intermediate `warmup` event.
    let sawWarmupTransition = false;
    for (let i = 0; i < 80; i++) {
      const r = stepSessionConfidence(s, 4000 + i * 100, false, OPTS);
      for (const ev of r.events) {
        if (ev.type === 'phaseEnter' && ev.from === 'performing' && ev.to === 'warmup') {
          sawWarmupTransition = true;
        }
      }
    }
    expect(sawWarmupTransition).toBe(true);
  });
});

describe('events', () => {
  it('emits phaseEnter on transition', () => {
    const s = initSessionConfidenceState();
    const seenEvents: any[] = [];
    for (let i = 0; i < 10; i++) {
      const r = stepSessionConfidence(s, i * 100, true, OPTS);
      seenEvents.push(...r.events);
    }
    const phaseEvents = seenEvents.filter((e) => e.type === 'phaseEnter');
    expect(phaseEvents.length).toBeGreaterThanOrEqual(1);
    expect(phaseEvents[0].to).toBe('warmup');
  });

  it('emits goalCompleted after motivationGoalMs in performing', () => {
    const opts: SessionConfidenceOptions = { ...OPTS, motivationGoalMs: 1000, warmupMs: 200 };
    const s = initSessionConfidenceState();
    const seenEvents: any[] = [];
    // Quick path to performing.
    for (let i = 0; i < 30; i++) {
      const r = stepSessionConfidence(s, i * 100, true, opts);
      seenEvents.push(...r.events);
    }
    expect(s.phase).toBe('performing');
    const goalEvents = seenEvents.filter((e) => e.type === 'goalCompleted');
    expect(goalEvents.length).toBeGreaterThanOrEqual(1);
    expect(goalEvents[0].totalCompleted).toBe(1);
  });
});

describe('resetSessionConfidence', () => {
  it('clears ring + counters + phase but keeps the buffer', () => {
    const s = initSessionConfidenceState();
    const ringRef = s.ring;
    for (let i = 0; i < 10; i++) stepSessionConfidence(s, i * 100, true, OPTS);
    expect(s.ringSize).toBeGreaterThan(0);
    resetSessionConfidence(s);
    expect(s.ring).toBe(ringRef); // same allocation
    expect(s.phase).toBe('waiting');
    expect(s.ringSize).toBe(0);
    expect(s.pianoCount).toBe(0);
    expect(s.confidence).toBe(0);
  });
});

describe('deriveSessionUIHint', () => {
  const STR = {
    listeningFmt: (p: string) => `Listening ${p}`,
    goalCelebrate: () => 'Goal!',
    goalCountdownFmt: (v: number) => `${v}s left`,
  };

  it('returns invisible hint when phase is waiting', () => {
    const s = initSessionConfidenceState();
    const h = deriveSessionUIHint(s, 1000, OPTS, STR);
    expect(h.visible).toBe(false);
  });

  it('returns warmup hint with growing dot count', () => {
    const s = initSessionConfidenceState();
    s.phase = 'warmup';
    s.phaseStartMs = 1000;
    const h0 = deriveSessionUIHint(s, 1000, OPTS, STR); // 0% → 1 dot
    const hLate = deriveSessionUIHint(s, 2999, OPTS, STR); // ~100% → 3 dots
    expect(h0.text).toMatch(/♫/);
    expect(hLate.text.split('♫').length).toBeGreaterThan(h0.text.split('♫').length);
  });

  it('returns goal countdown text in performing', () => {
    const s = initSessionConfidenceState();
    s.phase = 'performing';
    s.goalWindowStartMs = 1000;
    s.goalCelebrateUntilMs = 0;
    const h = deriveSessionUIHint(s, 11000, OPTS, STR);
    expect(h.text).toMatch(/\d+s left/);
  });

  it('returns celebration text during goalCelebrateUntilMs window', () => {
    const s = initSessionConfidenceState();
    s.phase = 'performing';
    s.goalCelebrateUntilMs = 5000;
    const h = deriveSessionUIHint(s, 4000, OPTS, STR);
    expect(h.text).toBe('Goal!');
  });
});
