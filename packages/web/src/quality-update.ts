// Quality-score per-frame reducer — Phase 0d batch 45.
//
// Throttled to SCORE_UPDATE_INTERVAL_MS, this:
//   1. Recomputes rhythm / dynamics / stability via @piano/core.
//   2. Composes the weighted total into `state.qualityScore`.
//   3. EMA-smooths into `state.displayedQualityScore`.
//   4. Updates the growth-trend ring (`state.qualityHistory` +
//      `state.growthScore`).
//   5. Picks coaching-feedback i18n keys → resolves them with the
//      shell's translator into `state.feedbackGood` /
//      `state.feedbackNext`.
//   6. Writes the on-screen quality-score text + visibility toggle
//      based on session state and a 0.25 displayed-score floor.
//
// All the math is delegated to deps (one function per axis + the two
// growth/coaching helpers). The shell already binds them to
// `PianoCore.*`; tests stub them with `vi.fn()` returning known
// scalars to verify the composition + DOM behavior.

export interface QualityStateRef {
  // Throttle / score storage.
  lastScoreUpdateMs: number;
  rhythmScore: number;
  dynamicsScore: number;
  stabilityScore: number;
  qualityScore: number;
  displayedQualityScore: number;

  // Per-axis source data the @piano/core fns read.
  ioiHistory: ArrayLike<number>;
  amplitudeHistory: ArrayLike<number>;
  pitchStability: number;
  sessionConfidence: number;

  // Growth-trend ring + scratch.
  qualityHistory: { timeMs: number; score: number }[];
  growthScore: number;

  // Coaching feedback (resolved strings, not keys).
  feedbackGood: string;
  feedbackNext: string;

  // DOM-gating.
  sessionState: string;
}

/** Tunables. The legacy shell pulls these from CONFIG.SCORE_*; the
 *  test plumbs explicit values. */
export interface QualityTuning {
  updateIntervalMs: number;
  rhythmWeight: number;
  dynamicsWeight: number;
  stabilityWeight: number;
  /** EMA alpha applied to the displayed score. */
  smoothing: number;
  /** Threshold above which the on-screen card becomes visible. */
  displayedScoreFloor: number;
}

/** Pure scoring fns from @piano/core, held by deps so the test can
 *  stub them. */
export interface QualityScoringFns {
  computeRhythmScore(
    ioiHistory: ArrayLike<number>,
    opts: { ioiIdealCV: number; ioiMaxCV: number }
  ): number;
  computeDynamicsScore(
    amps: ArrayLike<number>,
    opts: { dynamicsIdealCVMin: number; dynamicsIdealCVMax: number }
  ): number;
  computeStabilityScore(pitchStability: number, sessionConfidence: number): number;
  updateGrowthTrend(
    prevHistory: { timeMs: number; score: number }[],
    timeMs: number,
    displayedScore: number,
    opts: { growthWindowMs: number }
  ): { history: { timeMs: number; score: number }[]; growthScore: number };
  buildCoachingFeedback(input: {
    rhythm: number;
    dynamics: number;
    stability: number;
    growthScore: number;
  }): { strengthKey: string; nextKey: string };
}

/** Opts surface that the @piano/core fns expect — the shell builds
 *  one at module-init from CONFIG and we forward it through. */
export interface QualityScoringOpts {
  ioiIdealCV: number;
  ioiMaxCV: number;
  dynamicsIdealCVMin: number;
  dynamicsIdealCVMax: number;
  growthWindowMs: number;
}

export interface QualityUpdateDeps {
  state: QualityStateRef;
  tuning: QualityTuning;
  scoringOpts: QualityScoringOpts;
  fns: QualityScoringFns;
  /** DOM target for the multi-line score breakdown card. */
  qualityScoreEl: HTMLElement;
  /** i18n translator. The shell already resolves `'strengthFmt'` /
   *  `'nextStepFmt'` with `{ v: t(coachingKey) }` — we replicate that
   *  call. Pass any function that does the same. */
  t: (key: string, vars?: Record<string, string>) => string;
}

export interface QualityUpdate {
  tick(timeMs: number): void;
}

export function createQualityUpdate(deps: QualityUpdateDeps): QualityUpdate {
  return {
    tick(timeMs) {
      const s = deps.state;
      const t = deps.tuning;

      if (timeMs - s.lastScoreUpdateMs < t.updateIntervalMs) return;
      s.lastScoreUpdateMs = timeMs;

      // Recompute axes.
      s.rhythmScore = deps.fns.computeRhythmScore(s.ioiHistory, deps.scoringOpts);
      s.dynamicsScore = deps.fns.computeDynamicsScore(s.amplitudeHistory, deps.scoringOpts);
      s.stabilityScore = deps.fns.computeStabilityScore(s.pitchStability, s.sessionConfidence);

      // Compose + smooth.
      s.qualityScore =
        s.rhythmScore * t.rhythmWeight +
        s.dynamicsScore * t.dynamicsWeight +
        s.stabilityScore * t.stabilityWeight;
      s.displayedQualityScore += (s.qualityScore - s.displayedQualityScore) * t.smoothing;

      // Growth trend.
      const growth = deps.fns.updateGrowthTrend(
        s.qualityHistory,
        timeMs,
        s.displayedQualityScore,
        deps.scoringOpts
      );
      s.qualityHistory = growth.history;
      s.growthScore = growth.growthScore;

      // Coaching feedback (i18n keys → resolved strings).
      const fb = deps.fns.buildCoachingFeedback({
        rhythm: s.rhythmScore,
        dynamics: s.dynamicsScore,
        stability: s.stabilityScore,
        growthScore: s.growthScore,
      });
      s.feedbackGood = deps.t('strengthFmt', { v: deps.t(fb.strengthKey) });
      s.feedbackNext = deps.t('nextStepFmt', { v: deps.t(fb.nextKey) });

      // DOM gate: show only during performing/warmup AND once
      // displayed score has crept above the floor. Otherwise hide.
      if (
        (s.sessionState === 'performing' || s.sessionState === 'warmup') &&
        s.displayedQualityScore > t.displayedScoreFloor
      ) {
        const rhythmPct = Math.round(s.rhythmScore * 100);
        const dynamicsPct = Math.round(s.dynamicsScore * 100);
        const stabilityPct = Math.round(s.stabilityScore * 100);
        const growthPts = Math.round(s.growthScore * 100);
        const growthText = growthPts >= 0 ? '+' + growthPts : '' + growthPts;
        deps.qualityScoreEl.textContent =
          'Rhythm ' +
          rhythmPct +
          '% | Dynamics ' +
          dynamicsPct +
          '% | Stability ' +
          stabilityPct +
          '%\n' +
          'Last 30s growth: ' +
          growthText +
          'pt\n' +
          s.feedbackGood +
          ' -> ' +
          s.feedbackNext;
        deps.qualityScoreEl.classList.add('visible');
      } else {
        deps.qualityScoreEl.classList.remove('visible');
      }
    },
  };
}
