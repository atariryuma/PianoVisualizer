// Quality scoring — pure functions for rhythm, dynamics, stability, and the
// composite/displayed/growth scores plus coaching-feedback selection.
//
// Scoring philosophy (kid-friendly):
//   - Lower coefficient-of-variation in inter-onset intervals → better rhythm
//   - Moderate dynamic CV (some variation, not too much, not too little) → better dynamics
//   - High pitch-stability + session-confidence → better stability
//   - Composite is a weighted blend (default 40/35/25)
//
// All functions here are pure. The legacy app.js wrappers wrote results back
// onto the global `state` object — that side effect lives at the call site now.

import { coefficientOfVariation } from '../audio/spectral';

export interface QualityWeights {
  rhythm: number;
  dynamics: number;
  stability: number;
}

export interface QualityScoringOptions {
  /** Inter-onset CV at and below which rhythm scores 0.85+. */
  ioiIdealCV: number;
  /** Inter-onset CV at and above which rhythm bottoms at 0.4. */
  ioiMaxCV: number;
  /** Dynamics CV ideal range — moderate variation rewarded. */
  dynamicsIdealCVMin: number;
  dynamicsIdealCVMax: number;
  /** Composite weights (must sum to ~1.0). */
  weights: QualityWeights;
  /** EMA coefficient for the displayed (smoothed) score. */
  smoothing: number;
  /** Sliding window for growth-trend (ms). */
  growthWindowMs: number;
}

/** Clamp v to [0, 1]. */
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Rhythm regularity score from inter-onset intervals (ms).
 * Lower CV (steadier) → higher score. Returns 0.5 when not enough data.
 */
export function computeRhythmScore(
  ioiHistory: ArrayLike<number>,
  opts: QualityScoringOptions
): number {
  if (ioiHistory.length < 3) return 0.5;
  const cv = coefficientOfVariation(ioiHistory);
  if (cv <= opts.ioiIdealCV) {
    return 0.85 + 0.15 * (1 - cv / opts.ioiIdealCV);
  }
  if (cv <= opts.ioiMaxCV) {
    const t = (cv - opts.ioiIdealCV) / (opts.ioiMaxCV - opts.ioiIdealCV);
    return 0.85 - 0.45 * t;
  }
  return 0.4;
}

/**
 * Dynamics-control score from amplitude history.
 * Rewards a moderate CV — flat (robotic) and wild (chaotic) both score lower.
 */
export function computeDynamicsScore(amps: ArrayLike<number>, opts: QualityScoringOptions): number {
  if (amps.length < 3) return 0.5;
  const cv = coefficientOfVariation(amps);
  if (cv >= opts.dynamicsIdealCVMin && cv <= opts.dynamicsIdealCVMax) {
    return 0.8 + 0.2 * (1 - Math.abs(cv - 0.15) / 0.45);
  }
  if (cv < opts.dynamicsIdealCVMin) return 0.6;
  return Math.max(0.3, 0.8 - (cv - opts.dynamicsIdealCVMax) * 0.5);
}

/**
 * Stability score blends short-term pitch consistency with session confidence.
 * Both inputs are 0..1.
 */
export function computeStabilityScore(pitchStability: number, sessionConfidence: number): number {
  return clamp01(pitchStability * 0.75 + sessionConfidence * 0.25);
}

/**
 * Composite score: weighted blend of rhythm + dynamics + stability.
 * Weights typically sum to 1.0 (40% rhythm, 35% dynamics, 25% stability).
 */
export function composeQualityScore(
  rhythm: number,
  dynamics: number,
  stability: number,
  weights: QualityWeights
): number {
  return rhythm * weights.rhythm + dynamics * weights.dynamics + stability * weights.stability;
}

/** EMA-smooth a target into a displayed value. */
export function smoothQualityScore(displayed: number, target: number, alpha: number): number {
  return displayed + (target - displayed) * alpha;
}

// =====================================================================
// Growth trend (last N seconds of displayed score)
// =====================================================================

export interface QualityHistoryEntry {
  timeMs: number;
  score: number;
}

export interface GrowthTrendResult {
  history: QualityHistoryEntry[];
  /** newest - oldest. 0 if fewer than 2 entries. */
  growthScore: number;
}

/**
 * Append a sample, prune entries outside the growth window, return new history
 * and growth score. Pure: input array isn't mutated.
 */
export function updateGrowthTrend(
  prevHistory: QualityHistoryEntry[],
  timeMs: number,
  displayedScore: number,
  opts: QualityScoringOptions
): GrowthTrendResult {
  const windowStart = timeMs - opts.growthWindowMs;
  const next = prevHistory
    .filter((e) => e.timeMs >= windowStart)
    .concat({ timeMs, score: displayedScore });
  if (next.length < 2) return { history: next, growthScore: 0 };
  return { history: next, growthScore: next[next.length - 1].score - next[0].score };
}

// =====================================================================
// Coaching feedback (which strength to highlight + which next-step)
// =====================================================================

export type CoachingStrengthKey =
  | 'strNotesClear'
  | 'strGrowing'
  | 'strRhythmSteady'
  | 'strDynamicsGood'
  | 'strPitchStable';

export type CoachingNextKey = 'nxtBreathe' | 'nxtOneHand' | 'nxtSoftLoud' | 'nxtHoldNotes';

export interface CoachingInput {
  rhythm: number;
  dynamics: number;
  stability: number;
  growthScore: number;
}

export interface CoachingFeedback {
  strengthKey: CoachingStrengthKey;
  nextKey: CoachingNextKey;
}

/**
 * Pick coaching strings based on which axis is strongest / weakest. Returns
 * i18n keys (caller resolves to a localized string).
 */
export function buildCoachingFeedback(input: CoachingInput): CoachingFeedback {
  const axes = [
    { key: 'rhythm' as const, score: input.rhythm },
    { key: 'dynamics' as const, score: input.dynamics },
    { key: 'stability' as const, score: input.stability },
  ].sort((a, b) => b.score - a.score);

  let strengthKey: CoachingStrengthKey = 'strNotesClear';
  if (input.growthScore > 0.05) {
    strengthKey = 'strGrowing';
  } else if (axes[0].key === 'rhythm' && axes[0].score > 0.7) {
    strengthKey = 'strRhythmSteady';
  } else if (axes[0].key === 'dynamics' && axes[0].score > 0.7) {
    strengthKey = 'strDynamicsGood';
  } else if (axes[0].key === 'stability' && axes[0].score > 0.7) {
    strengthKey = 'strPitchStable';
  }

  const weakest = axes[axes.length - 1];
  let nextKey: CoachingNextKey = 'nxtBreathe';
  if (weakest.key === 'rhythm') nextKey = 'nxtOneHand';
  else if (weakest.key === 'dynamics') nextKey = 'nxtSoftLoud';
  else if (weakest.key === 'stability') nextKey = 'nxtHoldNotes';

  return { strengthKey, nextKey };
}
