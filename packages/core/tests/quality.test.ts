import { describe, it, expect } from 'vitest';
import {
  clamp01,
  computeRhythmScore,
  computeDynamicsScore,
  computeStabilityScore,
  composeQualityScore,
  smoothQualityScore,
  updateGrowthTrend,
  buildCoachingFeedback,
  type QualityScoringOptions,
} from '../src/state/quality';

const OPTS: QualityScoringOptions = {
  ioiIdealCV: 0.3,
  ioiMaxCV: 1.5,
  dynamicsIdealCVMin: 0.03,
  dynamicsIdealCVMax: 0.6,
  weights: { rhythm: 0.4, dynamics: 0.35, stability: 0.25 },
  smoothing: 0.08,
  growthWindowMs: 30000,
};

describe('clamp01', () => {
  it('clamps below 0', () => expect(clamp01(-0.5)).toBe(0));
  it('clamps above 1', () => expect(clamp01(1.5)).toBe(1));
  it('passes through valid', () => expect(clamp01(0.42)).toBe(0.42));
});

describe('computeRhythmScore', () => {
  it('returns 0.5 with too few samples', () => {
    expect(computeRhythmScore([100], OPTS)).toBe(0.5);
    expect(computeRhythmScore([100, 100], OPTS)).toBe(0.5);
  });

  it('high score for steady rhythm (low CV)', () => {
    // Constant array → CV = 0 → score = 0.85 + 0.15 * (1 - 0/0.3) = 1.0
    expect(computeRhythmScore([500, 500, 500, 500], OPTS)).toBeCloseTo(1.0, 2);
  });

  it('mid-range score for moderate CV', () => {
    // CV of [400, 500, 600] is moderate (~0.16). score = 0.85 + 0.15 * (1 - 0.16/0.3)
    const s = computeRhythmScore([400, 500, 600], OPTS);
    expect(s).toBeGreaterThan(0.85);
    expect(s).toBeLessThanOrEqual(1.0);
  });

  it('drops to 0.4 floor when CV exceeds ioiMaxCV', () => {
    // Need CV > 1.5 (ioiMaxCV). Mean ≈ 1000, std ≈ 1900 → CV ≈ 1.9.
    expect(computeRhythmScore([50, 50, 50, 5000, 50, 50], OPTS)).toBe(0.4);
  });
});

describe('computeDynamicsScore', () => {
  it('returns 0.5 with too few samples', () => {
    expect(computeDynamicsScore([0.5, 0.5], OPTS)).toBe(0.5);
  });

  it('returns 0.6 for too-flat playing (CV below ideal)', () => {
    // All identical → CV = 0 → returns 0.6 (the "too flat" branch)
    expect(computeDynamicsScore([0.5, 0.5, 0.5], OPTS)).toBe(0.6);
  });

  it('high score within ideal CV range', () => {
    // Build amplitudes with CV in the middle of [0.03, 0.6]
    const amps = [0.4, 0.6, 0.5, 0.55, 0.45]; // CV ≈ 0.13
    const s = computeDynamicsScore(amps, OPTS);
    expect(s).toBeGreaterThan(0.7);
    expect(s).toBeLessThanOrEqual(1.0);
  });

  it('drops for very wild dynamics (above ideal max)', () => {
    const amps = [0.05, 0.95, 0.05, 0.95, 0.05];
    const s = computeDynamicsScore(amps, OPTS);
    expect(s).toBeGreaterThanOrEqual(0.3);
    expect(s).toBeLessThan(0.7);
  });
});

describe('computeStabilityScore', () => {
  it('blends pitch stability and session confidence', () => {
    // pitchStability 0.8, sessionConf 0.4: 0.8*0.75 + 0.4*0.25 = 0.6 + 0.1 = 0.7
    expect(computeStabilityScore(0.8, 0.4)).toBeCloseTo(0.7, 5);
  });

  it('clamps to [0,1]', () => {
    expect(computeStabilityScore(2.0, 2.0)).toBe(1.0);
    expect(computeStabilityScore(-1.0, -1.0)).toBe(0);
  });
});

describe('composeQualityScore', () => {
  it('weighted sum', () => {
    // 0.5 * 0.4 + 0.6 * 0.35 + 0.7 * 0.25 = 0.2 + 0.21 + 0.175 = 0.585
    expect(composeQualityScore(0.5, 0.6, 0.7, OPTS.weights)).toBeCloseTo(0.585, 5);
  });
});

describe('smoothQualityScore', () => {
  it('moves displayed toward target by alpha fraction', () => {
    expect(smoothQualityScore(0.5, 1.0, 0.5)).toBe(0.75);
    expect(smoothQualityScore(0, 1, 1)).toBe(1);
    expect(smoothQualityScore(0.5, 0.5, 0.1)).toBe(0.5); // no change when equal
  });
});

describe('updateGrowthTrend', () => {
  it('returns 0 growth with empty history', () => {
    const r = updateGrowthTrend([], 1000, 0.5, OPTS);
    expect(r.history).toHaveLength(1);
    expect(r.growthScore).toBe(0);
  });

  it('positive growth when score increases over window', () => {
    const r = updateGrowthTrend([{ timeMs: 0, score: 0.3 }], 5000, 0.7, OPTS);
    expect(r.history).toHaveLength(2);
    expect(r.growthScore).toBeCloseTo(0.4, 5);
  });

  it('expires entries outside the growthWindowMs', () => {
    const r = updateGrowthTrend(
      [
        { timeMs: 0, score: 0.1 }, // too old at t=40000 (window 30000)
        { timeMs: 20000, score: 0.5 },
      ],
      40000,
      0.8,
      OPTS
    );
    expect(r.history).toHaveLength(2); // 20000 entry survives + new
    expect(r.history[0].timeMs).toBe(20000);
  });

  it('does not mutate input array', () => {
    const input = [{ timeMs: 0, score: 0.3 }];
    const snapshot = JSON.stringify(input);
    updateGrowthTrend(input, 1000, 0.5, OPTS);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('buildCoachingFeedback', () => {
  it('praises growing when growthScore > 0.05', () => {
    const f = buildCoachingFeedback({
      rhythm: 0.5,
      dynamics: 0.5,
      stability: 0.5,
      growthScore: 0.1,
    });
    expect(f.strengthKey).toBe('strGrowing');
  });

  it('praises rhythm when rhythm is strongest > 0.7', () => {
    const f = buildCoachingFeedback({
      rhythm: 0.85,
      dynamics: 0.5,
      stability: 0.5,
      growthScore: 0,
    });
    expect(f.strengthKey).toBe('strRhythmSteady');
  });

  it('praises dynamics when dynamics is strongest > 0.7', () => {
    const f = buildCoachingFeedback({
      rhythm: 0.5,
      dynamics: 0.85,
      stability: 0.5,
      growthScore: 0,
    });
    expect(f.strengthKey).toBe('strDynamicsGood');
  });

  it('praises pitch stability when stability is strongest > 0.7', () => {
    const f = buildCoachingFeedback({
      rhythm: 0.5,
      dynamics: 0.5,
      stability: 0.85,
      growthScore: 0,
    });
    expect(f.strengthKey).toBe('strPitchStable');
  });

  it('falls back to "notes clear" when nothing dominant', () => {
    const f = buildCoachingFeedback({ rhythm: 0.5, dynamics: 0.5, stability: 0.5, growthScore: 0 });
    expect(f.strengthKey).toBe('strNotesClear');
  });

  it('suggests one-hand practice when rhythm is weakest', () => {
    const f = buildCoachingFeedback({ rhythm: 0.3, dynamics: 0.7, stability: 0.7, growthScore: 0 });
    expect(f.nextKey).toBe('nxtOneHand');
  });

  it('suggests soft-loud when dynamics is weakest', () => {
    const f = buildCoachingFeedback({ rhythm: 0.7, dynamics: 0.3, stability: 0.7, growthScore: 0 });
    expect(f.nextKey).toBe('nxtSoftLoud');
  });

  it('suggests holding notes when stability is weakest', () => {
    const f = buildCoachingFeedback({ rhythm: 0.7, dynamics: 0.7, stability: 0.3, growthScore: 0 });
    expect(f.nextKey).toBe('nxtHoldNotes');
  });
});
