// Tests for packages/web/src/onset-detect.ts.
//
// The detector is heavily stateful — most tests verify state mutations
// (gateOpen, debug fields, AGC voice rejection counters) and the
// 5-condition gate's branching against synthesized spectra.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateMultiFeatureOnset,
  type OnsetDetectDeps,
  type OnsetDetectStateRef,
  type OnsetDetectTuning,
  type OnsetDetectFeatures,
} from '../src/onset-detect';

// ─── fixtures ───────────────────────────────────────────────────────

const TUNING: OnsetDetectTuning = {
  pitchMinHz: 50,
  fluxFreqMinHz: 100,
  fluxFreqMaxHz: 4000,
  onsetGateDurationMs: 150,
  onsetSpreadMinChange: 5,
  onsetSpreadThreshold: 0.05,
  onsetSpreadMax: 0.6,
  flatnessPianoMin: 0.05,
  crestVoiceMax: 12,
  spectralFluxThreshold: 100,
  spectralFluxAdaptiveK: 1.5,
  spectralFluxHistorySize: 30,
  centroidHistorySize: 30,
  harmonicityMin: 0.4,
  harmonicityMinPractice: 0.55,
  onsetCooldownMs: 50,
  getOnsetHysteresisFrames: () => 1,
  agcVoiceRmsMin: 0.02,
  agcVoiceRejectCount: 3,
  agcVoiceSuppressMs: 2000,
};

function makeState(): OnsetDetectStateRef {
  return {
    prevSpectrum: null,
    spectralFluxHistory: [],
    centroidHistory: [],
    consecutiveOnsetFrames: 0,
    lastOnsetTimeMs: 0,
    agcVoiceRejectCount: 0,
    agcVoiceSuppressUntilMs: 0,
    debugLastRms: 0,
    debugLastFlux: 0,
    debugLastSpread: 0,
    debugLastFlatness: 0,
    debugLastCrest: 0,
    debugLastCentroid: 0,
    debugCentroidCV: 0,
    debugLastThreshold: 0,
    debugHarmonicity: 0,
    debugOnsetReason: '',
    debugGateOpen: false,
  };
}

function makeFeatures(over: Partial<OnsetDetectFeatures> = {}): OnsetDetectFeatures {
  return {
    computeSpectralFlatness: vi.fn().mockReturnValue(0.1),
    computeSpectralCrest: vi.fn().mockReturnValue(5),
    computeSpectralCentroid: vi.fn().mockReturnValue(1000),
    computeHarmonicity: vi.fn().mockReturnValue(0.7),
    coefficientOfVariation: vi.fn().mockReturnValue(0.1),
    ...over,
  };
}

interface Fixture {
  deps: OnsetDetectDeps;
  state: OnsetDetectStateRef;
  practice: { enabled: boolean };
  setSpectrum: (data: number[]) => void;
}

function makeFixture(
  over: {
    state?: OnsetDetectStateRef;
    practice?: { enabled: boolean };
    features?: Partial<OnsetDetectFeatures>;
    tuning?: Partial<OnsetDetectTuning>;
    spec?: number[];
    noAnalyser?: boolean;
  } = {}
): Fixture {
  const state = over.state ?? makeState();
  const practice = over.practice ?? { enabled: false };
  // Build a fake spec long enough that startBin..endBin yields >=10 bins.
  // sampleRate 44100, fftSize 2048 → binHz ≈ 21.5 → range [100..4000] Hz
  // ≈ bins 5..186, ~181 bins.
  const fftSize = 2048;
  const sampleRate = 44100;
  const dataArray = new Uint8Array(over.spec ?? new Array(fftSize / 2).fill(0));

  const analyser = over.noAnalyser
    ? null
    : {
        fftSize,
        getByteFrequencyData(buf: Uint8Array) {
          buf.set(dataArray);
        },
      };

  const deps: OnsetDetectDeps = {
    state,
    getPractice: () => practice,
    tuning: { ...TUNING, ...over.tuning },
    features: makeFeatures(over.features),
    getOnsetAnalyser: () => analyser,
    getOnsetDataArray: () => dataArray,
    getAudioCtx: () => ({ sampleRate }),
  };

  return {
    deps,
    state,
    practice,
    setSpectrum: (data: number[]) => {
      for (let i = 0; i < dataArray.length; i++) {
        dataArray[i] = data[i] ?? 0;
      }
    },
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ─── short-circuits ────────────────────────────────────────────────

describe('updateMultiFeatureOnset — short-circuits', () => {
  it('returns no-onset when analyser missing', () => {
    const fx = makeFixture({ noAnalyser: true });
    const r = updateMultiFeatureOnset(0, 0, fx.deps);
    expect(r).toEqual({ isOnset: false, gateOpen: false });
    expect(fx.state.debugGateOpen).toBe(false);
  });

  it('first call seeds prevSpectrum (no onset, no gate)', () => {
    const fx = makeFixture();
    const r = updateMultiFeatureOnset(0, 0, fx.deps);
    expect(r).toEqual({ isOnset: false, gateOpen: false });
    expect(fx.state.prevSpectrum).not.toBeNull();
  });

  it('returns gate-open when within onsetGateDuration of last onset', () => {
    const fx = makeFixture();
    fx.state.lastOnsetTimeMs = 100;
    // Run twice to seed prevSpectrum first.
    updateMultiFeatureOnset(0, 0, fx.deps);
    const r = updateMultiFeatureOnset(200, 0, fx.deps); // 100ms after last onset, within 150ms window
    expect(r.gateOpen).toBe(true);
  });

  it('no gate-open after onsetGateDuration elapsed', () => {
    const fx = makeFixture();
    fx.state.lastOnsetTimeMs = 100;
    updateMultiFeatureOnset(0, 0, fx.deps);
    const r = updateMultiFeatureOnset(300, 0, fx.deps); // 200ms after last
    expect(r.gateOpen).toBe(false);
  });
});

// ─── feature integration ───────────────────────────────────────────

describe('updateMultiFeatureOnset — feature gates', () => {
  it('all 5 conditions met → fires onset (non-practice, hysteresis=1)', () => {
    const fx = makeFixture({
      practice: { enabled: false },
      features: {
        computeSpectralFlatness: () => 0.2, // > 0.05
        computeSpectralCrest: () => 5, // < 12
        computeHarmonicity: () => 0.8, // > 0.4
      },
    });
    // Seed prevSpectrum with zeros (first call).
    updateMultiFeatureOnset(0, 440, fx.deps);
    // Now build flux history with low values so threshold stays low.
    for (let i = 0; i < 10; i++) {
      updateMultiFeatureOnset(i * 5 + 5, 440, fx.deps);
    }
    // Stage a big spec increase → big flux + spread.
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 200 : 0)));
    const r = updateMultiFeatureOnset(100, 440, fx.deps);
    expect(r.isOnset).toBe(true);
    expect(fx.state.debugOnsetReason).toBe('PIANO');
  });

  it('flatness fail → REJ:flat reason', () => {
    const fx = makeFixture({
      features: {
        computeSpectralFlatness: () => 0.01, // < 0.05
        computeSpectralCrest: () => 5,
        computeHarmonicity: () => 0.8,
      },
    });
    updateMultiFeatureOnset(0, 440, fx.deps);
    for (let i = 0; i < 10; i++) updateMultiFeatureOnset(i * 5 + 5, 440, fx.deps);
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 200 : 0)));
    const r = updateMultiFeatureOnset(100, 440, fx.deps);
    expect(r.isOnset).toBe(false);
    expect(fx.state.debugOnsetReason).toBe('REJ:flat');
  });

  it('crest fail → REJ:crest reason', () => {
    const fx = makeFixture({
      features: {
        computeSpectralFlatness: () => 0.2,
        computeSpectralCrest: () => 20, // > 12
        computeHarmonicity: () => 0.8,
      },
    });
    updateMultiFeatureOnset(0, 440, fx.deps);
    for (let i = 0; i < 10; i++) updateMultiFeatureOnset(i * 5 + 5, 440, fx.deps);
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 200 : 0)));
    const r = updateMultiFeatureOnset(100, 440, fx.deps);
    expect(r.isOnset).toBe(false);
    expect(fx.state.debugOnsetReason).toBe('REJ:crest');
  });

  it('harmonicity fail (practice mode strictly) → REJ:harm', () => {
    const fx = makeFixture({
      practice: { enabled: true },
      features: {
        computeSpectralFlatness: () => 0.2,
        computeSpectralCrest: () => 5,
        // harmonicity 0.5 — passes default (0.4) but fails practice (0.55)
        computeHarmonicity: () => 0.5,
      },
    });
    updateMultiFeatureOnset(0, 440, fx.deps);
    for (let i = 0; i < 10; i++) updateMultiFeatureOnset(i * 5 + 5, 440, fx.deps);
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 200 : 0)));
    const r = updateMultiFeatureOnset(100, 440, fx.deps);
    expect(r.isOnset).toBe(false);
    expect(fx.state.debugOnsetReason).toBe('REJ:harm');
  });

  it('skips harmonicity check when pitch < pitchMinHz', () => {
    const fx = makeFixture({
      features: {
        computeSpectralFlatness: () => 0.2,
        computeSpectralCrest: () => 5,
        computeHarmonicity: vi.fn(),
      },
    });
    updateMultiFeatureOnset(0, 0, fx.deps); // pitch=0 < 50
    expect(fx.deps.features.computeHarmonicity).not.toHaveBeenCalled();
  });
});

// ─── cooldown ──────────────────────────────────────────────────────

describe('updateMultiFeatureOnset — cooldown', () => {
  it('blocks second onset within onsetCooldownMs', () => {
    const fx = makeFixture({
      features: {
        computeSpectralFlatness: () => 0.2,
        computeSpectralCrest: () => 5,
        computeHarmonicity: () => 0.8,
      },
    });
    updateMultiFeatureOnset(0, 440, fx.deps);
    for (let i = 0; i < 10; i++) updateMultiFeatureOnset(i * 5 + 5, 440, fx.deps);
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 200 : 0)));
    const r1 = updateMultiFeatureOnset(100, 440, fx.deps);
    expect(r1.isOnset).toBe(true);
    // Still hot — second call within 50 ms cooldown should NOT fire.
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 250 : 0)));
    const r2 = updateMultiFeatureOnset(120, 440, fx.deps);
    expect(r2.isOnset).toBe(false);
  });
});

// ─── AGC voice suppression ─────────────────────────────────────────

describe('updateMultiFeatureOnset — AGC voice suppression', () => {
  it('counts up rejections when flux+spread pass but harmonicity fails', () => {
    const fx = makeFixture({
      features: {
        computeSpectralFlatness: () => 0.2,
        computeSpectralCrest: () => 5,
        computeHarmonicity: () => 0.1, // fail
      },
    });
    fx.state.debugLastRms = 0.05; // > agcVoiceRmsMin (0.02)
    updateMultiFeatureOnset(0, 440, fx.deps);
    for (let i = 0; i < 10; i++) updateMultiFeatureOnset(i * 5 + 5, 440, fx.deps);
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 200 : 0)));
    updateMultiFeatureOnset(100, 440, fx.deps);
    expect(fx.state.agcVoiceRejectCount).toBeGreaterThan(0);
  });

  it('triggers AGC voice suppress when agcVoiceRejectCount threshold reached', () => {
    // Drive the suppress trigger directly by pre-loading
    // agcVoiceRejectCount close to the threshold + crafting one
    // single passing flux+spread that fails harmonicity.
    const fx = makeFixture({
      tuning: { agcVoiceRejectCount: 2 }, // lower threshold for test
      features: {
        computeSpectralFlatness: () => 0.2,
        computeSpectralCrest: () => 5,
        computeHarmonicity: () => 0.1,
      },
    });
    fx.state.debugLastRms = 0.05;
    fx.state.agcVoiceRejectCount = 1; // 1 + this fire = 2 → triggers suppress
    updateMultiFeatureOnset(0, 440, fx.deps); // seed prevSpectrum
    // Build flux history with small values so adaptive threshold stays low.
    for (let i = 0; i < 10; i++) updateMultiFeatureOnset(i * 5 + 5, 440, fx.deps);
    fx.setSpectrum(new Array(1024).fill(0).map((_, j) => (j >= 5 && j <= 100 ? 200 : 0)));
    updateMultiFeatureOnset(100, 440, fx.deps);
    expect(fx.state.agcVoiceSuppressUntilMs).toBeGreaterThan(0);
  });
});

// ─── debug field writes ───────────────────────────────────────────

describe('updateMultiFeatureOnset — debug writes', () => {
  it('writes flux/spread/flatness/crest/centroid/harmonicity to state', () => {
    const fx = makeFixture({
      features: {
        computeSpectralFlatness: () => 0.123,
        computeSpectralCrest: () => 4.5,
        computeSpectralCentroid: () => 850,
        computeHarmonicity: () => 0.66,
      },
    });
    updateMultiFeatureOnset(0, 440, fx.deps);
    fx.setSpectrum(new Array(1024).fill(0).map((_, i) => (i >= 5 && i <= 100 ? 100 : 0)));
    updateMultiFeatureOnset(20, 440, fx.deps);
    expect(fx.state.debugLastFlatness).toBe(0.123);
    expect(fx.state.debugLastCrest).toBe(4.5);
    expect(fx.state.debugLastCentroid).toBe(850);
    expect(fx.state.debugHarmonicity).toBe(0.66);
  });

  it('maintains centroidHistory bounded by centroidHistorySize', () => {
    const fx = makeFixture({
      tuning: { centroidHistorySize: 5 },
      features: { computeSpectralCentroid: () => 1000 },
    });
    updateMultiFeatureOnset(0, 0, fx.deps);
    for (let i = 0; i < 20; i++) {
      updateMultiFeatureOnset(i * 5 + 5, 0, fx.deps);
    }
    expect(fx.state.centroidHistory.length).toBeLessThanOrEqual(5);
  });

  it('maintains spectralFluxHistory bounded by spectralFluxHistorySize', () => {
    const fx = makeFixture({ tuning: { spectralFluxHistorySize: 5 } });
    updateMultiFeatureOnset(0, 0, fx.deps);
    for (let i = 0; i < 20; i++) {
      updateMultiFeatureOnset(i * 5 + 5, 0, fx.deps);
    }
    expect(fx.state.spectralFluxHistory.length).toBeLessThanOrEqual(5);
  });
});
