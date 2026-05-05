import { describe, it, expect } from 'vitest';
import {
  initFlowState,
  resetFlowState,
  applyFlowEvent,
  type FlowState,
  type FlowMeterOptions,
} from '../src/state/flow-meter';

const OPTS: FlowMeterOptions = {
  comboWindowMs: 3000,
  silenceDecayStartMs: 8000,
  silenceHardDecayMs: 12000,
  flowDecaySoft: 0.5,
  flowDecayHard: 2.0,
  comboDecayRate: 0.1,
  flowNoisePenalty: 8,
  comboNoisePenalty: 5,
  noisePenaltyCooldownMs: 500,
  flowGainBase: 2,
  flowGainComboMax: 3,
  flowGainStabilityMax: 2,
  flowGainQualityMax: 3,
  flowGainNonPerformingMultiplier: 1.5,
  midiBaseFlowGain: 1.0,
  midiVelocityFlowGain: 1.8,
};

describe('initFlowState', () => {
  it('zeroes everything except lastSilenceStartMs (=-1)', () => {
    const s = initFlowState();
    expect(s).toEqual({
      flow: 0,
      combo: 0,
      bestCombo: 0,
      peakFlow: 0,
      lastGoodNoteTimeMs: 0,
      lastSilenceStartMs: -1,
      lastNoisePenaltyMs: 0,
      comboDecayAccum: 0,
    });
  });
});

describe('resetFlowState', () => {
  it('returns a populated state to its initial values', () => {
    const s: FlowState = {
      flow: 80,
      combo: 50,
      bestCombo: 50,
      peakFlow: 95,
      lastGoodNoteTimeMs: 1000,
      lastSilenceStartMs: 5000,
      lastNoisePenaltyMs: 200,
      comboDecayAccum: 0.4,
    };
    resetFlowState(s);
    expect(s).toEqual(initFlowState());
  });
});

describe('applyFlowEvent — goodOnset', () => {
  it('starts combo at 1 on first onset (lastGoodNoteTimeMs was 0)', () => {
    const s = initFlowState();
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 1000, isPerformingOrWarmup: true }, OPTS);
    // First onset: lastGoodNoteTimeMs was 0 → "expired" branch → max(1, 0) = 1
    expect(s.combo).toBe(1);
    expect(s.lastGoodNoteTimeMs).toBe(1000);
  });

  it('grows combo monotonically when onsets arrive within the window', () => {
    const s = initFlowState();
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 1000, isPerformingOrWarmup: true }, OPTS);
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 2000, isPerformingOrWarmup: true }, OPTS);
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 3500, isPerformingOrWarmup: true }, OPTS);
    expect(s.combo).toBe(3);
    expect(s.bestCombo).toBe(3);
  });

  it('partially resets combo (× 0.6) when an onset arrives past the window', () => {
    const s = initFlowState();
    s.combo = 10;
    s.bestCombo = 10;
    s.lastGoodNoteTimeMs = 1000;
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 5000, isPerformingOrWarmup: true }, OPTS);
    // 4000ms gap > 3000ms window → floor(10 × 0.6) = 6
    expect(s.combo).toBe(6);
    expect(s.bestCombo).toBe(10);
  });

  it('does NOT touch combo when isPerformingOrWarmup is false (still in waiting)', () => {
    const s = initFlowState();
    s.combo = 5;
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 1000, isPerformingOrWarmup: false }, OPTS);
    expect(s.combo).toBe(5);
    // But it does still update lastGoodNoteTimeMs and cancel silence
    expect(s.lastGoodNoteTimeMs).toBe(1000);
    expect(s.lastSilenceStartMs).toBe(-1);
  });

  it('cancels an in-progress silence', () => {
    const s = initFlowState();
    s.lastSilenceStartMs = 500;
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 1000, isPerformingOrWarmup: true }, OPTS);
    expect(s.lastSilenceStartMs).toBe(-1);
  });

  it('updates bestCombo even when partial-reset path runs', () => {
    const s = initFlowState();
    s.combo = 50;
    s.bestCombo = 50;
    s.lastGoodNoteTimeMs = 1000;
    // Window expired → combo = floor(50 × 0.6) = 30; bestCombo stays at 50
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 5000, isPerformingOrWarmup: true }, OPTS);
    expect(s.combo).toBe(30);
    expect(s.bestCombo).toBe(50);
  });
});

describe('applyFlowEvent — midiNote', () => {
  it('grows flow + combo on each note and respects velocity', () => {
    const s = initFlowState();
    applyFlowEvent(s, { type: 'midiNote', timeMs: 100, velocity: 127 }, OPTS);
    // base 1.0 + (127/127) × 1.8 = 2.8
    expect(s.flow).toBeCloseTo(2.8);
    expect(s.combo).toBe(1);
  });

  it('caps flow at 100 with repeated peak-velocity notes', () => {
    const s = initFlowState();
    s.flow = 99.5;
    applyFlowEvent(s, { type: 'midiNote', timeMs: 1, velocity: 127 }, OPTS);
    expect(s.flow).toBe(100);
    expect(s.peakFlow).toBe(100);
  });

  it('clamps out-of-range velocity', () => {
    const s = initFlowState();
    applyFlowEvent(s, { type: 'midiNote', timeMs: 1, velocity: 200 }, OPTS);
    // velocity clamped to 127 → flow = 1.0 + 1.8 = 2.8
    expect(s.flow).toBeCloseTo(2.8);
  });

  it('treats velocity 0 as base-only', () => {
    const s = initFlowState();
    applyFlowEvent(s, { type: 'midiNote', timeMs: 1, velocity: 0 }, OPTS);
    expect(s.flow).toBe(1.0);
  });

  it('cancels an in-progress silence', () => {
    const s = initFlowState();
    s.lastSilenceStartMs = 500;
    applyFlowEvent(s, { type: 'midiNote', timeMs: 1000, velocity: 64 }, OPTS);
    expect(s.lastSilenceStartMs).toBe(-1);
  });
});

describe('applyFlowEvent — activeTick', () => {
  it('grows flow at the composite rate × dtSec', () => {
    const s = initFlowState();
    s.combo = 50; // comboFactor saturates at 1
    applyFlowEvent(
      s,
      {
        type: 'activeTick',
        timeMs: 1000,
        dtSec: 1,
        isPerforming: true,
        pitchStability: 1,
        qualityScore: 1,
      },
      OPTS
    );
    // (2 + 1×3 + 1×2 + 1×3) × 1 = 10
    expect(s.flow).toBeCloseTo(10);
    expect(s.peakFlow).toBeCloseTo(10);
  });

  it('boosts gain by 1.5× when not yet performing', () => {
    const s1 = initFlowState();
    const s2 = initFlowState();
    const tick = (isPerf: boolean) => ({
      type: 'activeTick' as const,
      timeMs: 0,
      dtSec: 1,
      isPerforming: isPerf,
      pitchStability: 0,
      qualityScore: 0,
    });
    applyFlowEvent(s1, tick(true), OPTS);
    applyFlowEvent(s2, tick(false), OPTS);
    // base only: 2 vs 2 × 1.5 = 3
    expect(s1.flow).toBeCloseTo(2);
    expect(s2.flow).toBeCloseTo(3);
  });

  it('caps flow at 100 even with peak inputs', () => {
    const s = initFlowState();
    s.flow = 99.9;
    applyFlowEvent(
      s,
      {
        type: 'activeTick',
        timeMs: 0,
        dtSec: 5,
        isPerforming: true,
        pitchStability: 1,
        qualityScore: 1,
      },
      OPTS
    );
    expect(s.flow).toBe(100);
  });

  it('cancels an in-progress silence', () => {
    const s = initFlowState();
    s.lastSilenceStartMs = 500;
    applyFlowEvent(
      s,
      {
        type: 'activeTick',
        timeMs: 1000,
        dtSec: 0.016,
        isPerforming: true,
        pitchStability: 0,
        qualityScore: 0,
      },
      OPTS
    );
    expect(s.lastSilenceStartMs).toBe(-1);
  });
});

describe('applyFlowEvent — idleTick', () => {
  it('opens silence on the first idle tick (was not silent)', () => {
    const s = initFlowState();
    applyFlowEvent(s, { type: 'idleTick', timeMs: 1000, dtSec: 0.016 }, OPTS);
    expect(s.lastSilenceStartMs).toBe(1000);
  });

  it('does NOT decay flow during the grace period (silence < 8000ms)', () => {
    const s = initFlowState();
    s.flow = 50;
    s.lastSilenceStartMs = 1000;
    applyFlowEvent(s, { type: 'idleTick', timeMs: 5000, dtSec: 1 }, OPTS);
    expect(s.flow).toBe(50);
  });

  it('soft-decays flow once silence exceeds the start threshold', () => {
    const s = initFlowState();
    s.flow = 50;
    s.lastSilenceStartMs = 1000;
    // 9000 ms silence > 8000 → soft decay 0.5 × 1 = 0.5
    applyFlowEvent(s, { type: 'idleTick', timeMs: 10000, dtSec: 1 }, OPTS);
    expect(s.flow).toBeCloseTo(49.5);
  });

  it('hard-decays flow + combo once silence exceeds the hard threshold', () => {
    const s = initFlowState();
    s.flow = 50;
    s.combo = 30;
    s.lastSilenceStartMs = 1000;
    // 13000 ms silence > 12000 → soft 0.5 + hard 2.0 = 2.5 per second
    applyFlowEvent(s, { type: 'idleTick', timeMs: 14000, dtSec: 1 }, OPTS);
    expect(s.flow).toBeCloseTo(47.5);
    // combo drop = ceil(0.1 × 1 × 60) = 6
    expect(s.combo).toBe(24);
  });

  it('floors flow at 0 (no negative)', () => {
    const s = initFlowState();
    s.flow = 0.1;
    s.lastSilenceStartMs = 0;
    applyFlowEvent(s, { type: 'idleTick', timeMs: 13000, dtSec: 5 }, OPTS);
    expect(s.flow).toBe(0);
  });

  it('floors combo at 0 (no negative)', () => {
    const s = initFlowState();
    s.combo = 1;
    s.lastSilenceStartMs = 0;
    applyFlowEvent(s, { type: 'idleTick', timeMs: 13000, dtSec: 5 }, OPTS);
    expect(s.combo).toBe(0);
  });
});

describe('applyFlowEvent — noiseTick', () => {
  it('applies penalty + records cooldown timestamp', () => {
    const s = initFlowState();
    s.flow = 50;
    s.combo = 10;
    applyFlowEvent(s, { type: 'noiseTick', timeMs: 1000, dtSec: 1 }, OPTS);
    expect(s.flow).toBeCloseTo(42);
    expect(s.combo).toBe(5);
    expect(s.lastNoisePenaltyMs).toBe(1000);
  });

  it('respects cooldown — second penalty within window is a no-op', () => {
    const s = initFlowState();
    s.flow = 50;
    s.combo = 10;
    s.lastNoisePenaltyMs = 800; // recent penalty
    applyFlowEvent(s, { type: 'noiseTick', timeMs: 1000, dtSec: 1 }, OPTS);
    expect(s.flow).toBe(50);
    expect(s.combo).toBe(10);
  });

  it('does NOT cancel silence (noise rate-limit, not user input)', () => {
    const s = initFlowState();
    s.lastSilenceStartMs = 500;
    applyFlowEvent(s, { type: 'noiseTick', timeMs: 5000, dtSec: 1 }, OPTS);
    expect(s.lastSilenceStartMs).toBe(500);
  });
});

describe('cross-event integration', () => {
  it('combo can grow, drop on silence, then resume on next onset', () => {
    const s = initFlowState();
    // Build combo
    for (let t = 0; t < 5; t++) {
      applyFlowEvent(
        s,
        { type: 'goodOnset', timeMs: 1000 + t * 1000, isPerformingOrWarmup: true },
        OPTS
      );
    }
    expect(s.combo).toBe(5);
    expect(s.bestCombo).toBe(5);

    // Silence drops some combo
    s.lastSilenceStartMs = 6000;
    applyFlowEvent(s, { type: 'idleTick', timeMs: 19000, dtSec: 1 }, OPTS);
    expect(s.combo).toBeLessThan(5);

    // Next onset (within window of last good = 5000) — but 14s gap > window,
    // so partial reset path runs.
    applyFlowEvent(s, { type: 'goodOnset', timeMs: 19000, isPerformingOrWarmup: true }, OPTS);
    // Whatever combo was after decay, the partial reset is max(1, floor(× 0.6))
    expect(s.combo).toBeGreaterThanOrEqual(1);
    // Best combo is preserved across all of this
    expect(s.bestCombo).toBe(5);
  });
});
