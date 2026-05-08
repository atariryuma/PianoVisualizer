// @vitest-environment happy-dom
// Tests for packages/web/src/quality-update.ts.

import { describe, it, expect, vi } from 'vitest';
import {
  createQualityUpdate,
  type QualityStateRef,
  type QualityTuning,
  type QualityScoringOpts,
  type QualityScoringFns,
} from '../src/quality-update';

const TUNING: QualityTuning = {
  updateIntervalMs: 250,
  rhythmWeight: 0.4,
  dynamicsWeight: 0.35,
  stabilityWeight: 0.25,
  smoothing: 0.5,
  displayedScoreFloor: 0.25,
};

const SCORING: QualityScoringOpts = {
  ioiIdealCV: 0.05,
  ioiMaxCV: 0.4,
  dynamicsIdealCVMin: 0.1,
  dynamicsIdealCVMax: 0.45,
  growthWindowMs: 30000,
};

function makeFixture(
  over: { state?: Partial<QualityStateRef>; fns?: Partial<QualityScoringFns> } = {}
) {
  const state: QualityStateRef = {
    lastScoreUpdateMs: -1000,
    rhythmScore: 0,
    dynamicsScore: 0,
    stabilityScore: 0,
    qualityScore: 0,
    displayedQualityScore: 0,
    ioiHistory: [200, 210, 195],
    amplitudeHistory: [0.1, 0.12, 0.09],
    pitchStability: 0.6,
    sessionConfidence: 0.4,
    qualityHistory: [],
    growthScore: 0,
    feedbackGood: '',
    feedbackNext: '',
    sessionState: 'performing',
    ...over.state,
  };
  const fns: QualityScoringFns = {
    computeRhythmScore: vi.fn(() => 0.8),
    computeDynamicsScore: vi.fn(() => 0.6),
    computeStabilityScore: vi.fn(() => 0.5),
    updateGrowthTrend: vi.fn((hist, timeMs, score) => ({
      history: hist.concat({ timeMs, score }),
      growthScore: 0.05,
    })),
    buildCoachingFeedback: vi.fn(() => ({ strengthKey: 'strRhythmSteady', nextKey: 'nxtBreathe' })),
    ...over.fns,
  };
  const qualityScoreEl = document.createElement('div');
  const t = vi.fn((key: string, vars?: Record<string, string>) => {
    if (vars && vars.v) return key + '(' + vars.v + ')';
    return key.toUpperCase();
  });
  const update = createQualityUpdate({
    state,
    tuning: TUNING,
    scoringOpts: SCORING,
    fns,
    qualityScoreEl,
    t,
  });
  return { state, fns, qualityScoreEl, t, update };
}

describe('createQualityUpdate — throttle', () => {
  it('skips when timeMs - lastScoreUpdateMs < updateIntervalMs', () => {
    const fx = makeFixture({ state: { lastScoreUpdateMs: 1000 } });
    fx.update.tick(1100); // 100ms < 250ms throttle
    expect(fx.fns.computeRhythmScore).not.toHaveBeenCalled();
    expect(fx.state.lastScoreUpdateMs).toBe(1000); // unchanged
  });

  it('runs when interval elapsed', () => {
    const fx = makeFixture({ state: { lastScoreUpdateMs: 1000 } });
    fx.update.tick(1300);
    expect(fx.state.lastScoreUpdateMs).toBe(1300);
    expect(fx.fns.computeRhythmScore).toHaveBeenCalled();
  });
});

describe('createQualityUpdate — composition', () => {
  it('writes axis scores from fns + composes weighted total', () => {
    const fx = makeFixture();
    fx.update.tick(1000);

    expect(fx.state.rhythmScore).toBe(0.8);
    expect(fx.state.dynamicsScore).toBe(0.6);
    expect(fx.state.stabilityScore).toBe(0.5);
    // 0.8*0.4 + 0.6*0.35 + 0.5*0.25 = 0.32 + 0.21 + 0.125 = 0.655
    expect(fx.state.qualityScore).toBeCloseTo(0.655, 4);
  });

  it('EMA-smooths displayedQualityScore', () => {
    const fx = makeFixture({ state: { displayedQualityScore: 0 } });
    fx.update.tick(1000);
    // start 0, target ~0.655, alpha 0.5 → ~0.328
    expect(fx.state.displayedQualityScore).toBeCloseTo(0.3275, 3);
  });
});

describe('createQualityUpdate — growth trend', () => {
  it('feeds qualityHistory + writes growthScore', () => {
    const fx = makeFixture();
    fx.update.tick(1000);
    expect(fx.fns.updateGrowthTrend).toHaveBeenCalled();
    expect(fx.state.qualityHistory.length).toBe(1);
    expect(fx.state.growthScore).toBe(0.05);
  });
});

describe('createQualityUpdate — coaching feedback', () => {
  it('runs strengthKey + nextKey through t() with the strengthFmt/nextStepFmt wrappers', () => {
    const fx = makeFixture();
    fx.update.tick(1000);

    // Mocked t: 'STRENGTHFMT(STRRHYTHMSTEADY)' (uppercased + wrapped).
    expect(fx.state.feedbackGood).toBe('strengthFmt(STRRHYTHMSTEADY)');
    expect(fx.state.feedbackNext).toBe('nextStepFmt(NXTBREATHE)');
  });
});

describe('createQualityUpdate — DOM gating', () => {
  it('shows the card when sessionState=performing AND displayed > floor', () => {
    const fx = makeFixture({
      state: { sessionState: 'performing', displayedQualityScore: 0.4 },
    });
    fx.update.tick(1000);

    expect(fx.qualityScoreEl.classList.contains('visible')).toBe(true);
    expect(fx.qualityScoreEl.textContent).toContain('Rhythm');
    expect(fx.qualityScoreEl.textContent).toContain('Dynamics');
    expect(fx.qualityScoreEl.textContent).toContain('Stability');
  });

  it('shows the card when sessionState=warmup AND displayed > floor', () => {
    const fx = makeFixture({
      state: { sessionState: 'warmup', displayedQualityScore: 0.4 },
    });
    fx.update.tick(1000);
    expect(fx.qualityScoreEl.classList.contains('visible')).toBe(true);
  });

  it('hides the card when sessionState=waiting', () => {
    const fx = makeFixture({
      state: { sessionState: 'waiting', displayedQualityScore: 0.9 },
    });
    fx.qualityScoreEl.classList.add('visible');
    fx.update.tick(1000);
    expect(fx.qualityScoreEl.classList.contains('visible')).toBe(false);
  });

  it('hides the card when displayed score < floor', () => {
    const fx = makeFixture({
      state: { sessionState: 'performing', displayedQualityScore: 0.1 },
      fns: {
        // Force smoothing to keep score near 0 (rhythm/dynamics/stability all 0).
        computeRhythmScore: vi.fn(() => 0),
        computeDynamicsScore: vi.fn(() => 0),
        computeStabilityScore: vi.fn(() => 0),
      },
    });
    fx.qualityScoreEl.classList.add('visible');
    fx.update.tick(1000);
    expect(fx.qualityScoreEl.classList.contains('visible')).toBe(false);
  });

  it('formats positive growth with leading +', () => {
    const fx = makeFixture({
      state: { sessionState: 'performing', displayedQualityScore: 0.4 },
      fns: {
        updateGrowthTrend: vi.fn((hist, timeMs, score) => ({
          history: hist.concat({ timeMs, score }),
          growthScore: 0.07, // → +7
        })),
      },
    });
    fx.update.tick(1000);
    expect(fx.qualityScoreEl.textContent).toContain('+7pt');
  });

  it('formats negative growth without forced sign', () => {
    const fx = makeFixture({
      state: { sessionState: 'performing', displayedQualityScore: 0.4 },
      fns: {
        updateGrowthTrend: vi.fn((hist, timeMs, score) => ({
          history: hist.concat({ timeMs, score }),
          growthScore: -0.04, // → -4
        })),
      },
    });
    fx.update.tick(1000);
    expect(fx.qualityScoreEl.textContent).toContain('-4pt');
  });
});
