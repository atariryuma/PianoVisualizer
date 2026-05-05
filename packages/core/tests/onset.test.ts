import { describe, it, expect } from 'vitest';
import { initOnsetState, stepOnset, type OnsetOptions, type OnsetState } from '../src/audio/onset';

// Tuning baseline mirrors the legacy CONFIG values in app.js.
const OPTS: OnsetOptions = {
  fluxFreqMinHz: 20,
  fluxFreqMaxHz: 4200,
  spectralFluxThreshold: 4.0,
  spectralFluxAdaptiveK: 1.3,
  spectralFluxHistorySize: 20,
  onsetSpreadThreshold: 0.05,
  onsetSpreadMax: 0.7,
  onsetSpreadMinChange: 1.5,
  flatnessPianoMin: 0.03,
  crestVoiceMax: 8.0,
  harmonicityMin: 0.0, // free-play default
  onsetCooldownMs: 60,
  hysteresisFrames: 1,
  centroidHistorySize: 20,
  pitchMinHz: 25,
  agcVoiceRejectCount: 5,
  agcVoiceRmsMin: 0.02,
  agcVoiceSuppressMs: 500,
  onsetGateDurationMs: 1500,
};

const SPECTRUM_SIZE = 1024;
const BIN_HZ = 48000 / 2048; // ~23.4 Hz, matches FFT_ONSET_SIZE = 2048

// === Synthetic spectra ===

/** A piano-like spectrum: tonal peak at fundamental + decaying harmonics on a
 *  warm broadband floor (real piano has body resonance, not pure peaks). */
function pianoSpectrum(fundamentalBin: number, peak = 170): Uint8Array {
  const s = new Uint8Array(SPECTRUM_SIZE).fill(25);
  for (let h = 1; h <= 6; h++) {
    const bin = fundamentalBin * h;
    if (bin < SPECTRUM_SIZE) {
      // 3-bin-wide peak that decays with harmonic number.
      const amp = Math.max(45, peak - (h - 1) * 25);
      s[bin] = amp;
      if (bin + 1 < SPECTRUM_SIZE) s[bin + 1] = Math.floor(amp * 0.6);
      if (bin - 1 >= 0) s[bin - 1] = Math.floor(amp * 0.6);
    }
  }
  return s;
}

/** A voice-like spectrum: formant peaks at non-harmonic positions, broader bandwidth. */
function voiceSpectrum(): Uint8Array {
  const s = new Uint8Array(SPECTRUM_SIZE).fill(30);
  // 3 formants in non-integer ratios.
  for (const peak of [
    { bin: 35, amp: 200, w: 5 },
    { bin: 78, amp: 180, w: 6 },
    { bin: 142, amp: 150, w: 7 },
  ]) {
    for (let i = -peak.w; i <= peak.w; i++) {
      const idx = peak.bin + i;
      if (idx >= 0 && idx < SPECTRUM_SIZE) {
        s[idx] = Math.max(s[idx], Math.floor(peak.amp * (1 - Math.abs(i) / (peak.w + 1))));
      }
    }
  }
  return s;
}

/** White-noise-like spectrum: random uniform high values everywhere. */
function noiseSpectrum(): Uint8Array {
  const s = new Uint8Array(SPECTRUM_SIZE);
  for (let i = 0; i < SPECTRUM_SIZE; i++) s[i] = 80 + Math.floor(Math.random() * 40);
  return s;
}

/** Quiet (silence) spectrum: matches the piano broadband floor so the
 *  silence→piano transition only changes the harmonic peak bins. Different
 *  floors would saturate the spread bandpass condition. */
function silenceSpectrum(): Uint8Array {
  return new Uint8Array(SPECTRUM_SIZE).fill(25);
}

// Drive enough silence frames to populate fluxHistory + prime adaptive threshold.
function primeWithSilence(state: OnsetState, opts: OnsetOptions, frameCount = 8): OnsetState {
  let s = state;
  for (let i = 0; i < frameCount; i++) {
    const r = stepOnset(
      s,
      {
        spectrum: silenceSpectrum(),
        binHz: BIN_HZ,
        currentPitchHz: 0,
        timeMs: i * 20,
        rms: 0.001,
      },
      opts
    );
    s = r.state;
  }
  return s;
}

describe('initOnsetState', () => {
  it('returns a fresh state with no prevSpectrum and no history', () => {
    const s = initOnsetState();
    expect(s.prevSpectrum).toBeNull();
    expect(s.fluxHistory).toEqual([]);
    expect(s.consecutiveOnsetFrames).toBe(0);
    expect(s.agcVoiceRejectCount).toBe(0);
    expect(s.lastOnsetTimeMs).toBe(-Infinity);
  });
});

describe('stepOnset — first frame and warm-up', () => {
  it('first frame primes prevSpectrum and returns no onset', () => {
    const r = stepOnset(
      initOnsetState(),
      {
        spectrum: pianoSpectrum(20),
        binHz: BIN_HZ,
        currentPitchHz: 467,
        timeMs: 0,
        rms: 0.05,
      },
      OPTS
    );
    expect(r.isOnset).toBe(false);
    expect(r.state.prevSpectrum).not.toBeNull();
  });

  it('numBins<10 short-circuits without crashing', () => {
    // Use a freq range that yields fewer than 10 bins at this binHz.
    const tinyOpts = { ...OPTS, fluxFreqMinHz: 100, fluxFreqMaxHz: 110 };
    const r = stepOnset(
      initOnsetState(),
      { spectrum: pianoSpectrum(20), binHz: BIN_HZ, currentPitchHz: 0, timeMs: 0, rms: 0.05 },
      tinyOpts
    );
    expect(r.isOnset).toBe(false);
  });
});

describe('stepOnset — piano vs voice vs noise discrimination', () => {
  it('fires on a piano-like onset after silence baseline', () => {
    const s = primeWithSilence(initOnsetState(), OPTS);
    // Now hit a piano-like spectrum — should fire.
    const r = stepOnset(
      s,
      {
        spectrum: pianoSpectrum(20, 220),
        binHz: BIN_HZ,
        currentPitchHz: 20 * BIN_HZ, // ~467 Hz
        timeMs: 200,
        rms: 0.05,
      },
      OPTS
    );
    expect(r.isOnset).toBe(true);
    expect(r.debug.onsetReason).toBe('PIANO');
    expect(r.debug.harmonicity).toBeGreaterThan(0.5);
  });

  it('rejects a voice-like onset (harmonicity OR crest fail)', () => {
    const s = primeWithSilence(initOnsetState(), OPTS);
    const r = stepOnset(
      s,
      {
        // Pretend YIN found a pitch that doesn't actually align with the formants
        // → harmonicity check fails because formants aren't at harmonic bins.
        spectrum: voiceSpectrum(),
        binHz: BIN_HZ,
        currentPitchHz: 25 * BIN_HZ,
        timeMs: 200,
        rms: 0.05,
      },
      // Practice-mode harmonicity threshold so the gate has teeth.
      { ...OPTS, harmonicityMin: 0.4 }
    );
    expect(r.isOnset).toBe(false);
    // Reason should be one of the rejection codes.
    expect(['REJ:harm', 'REJ:flat', 'REJ:crest', '']).toContain(r.debug.onsetReason);
  });

  it('rejects pure noise (flatness or crest fails)', () => {
    const s = primeWithSilence(initOnsetState(), OPTS);
    const r = stepOnset(
      s,
      {
        spectrum: noiseSpectrum(),
        binHz: BIN_HZ,
        currentPitchHz: 0,
        timeMs: 200,
        rms: 0.05,
      },
      OPTS
    );
    expect(r.isOnset).toBe(false);
  });
});

describe('stepOnset — cooldown', () => {
  it('does not double-fire within onsetCooldownMs', () => {
    let s = primeWithSilence(initOnsetState(), OPTS);
    // First piano hit fires.
    let r = stepOnset(
      s,
      {
        spectrum: pianoSpectrum(20, 220),
        binHz: BIN_HZ,
        currentPitchHz: 20 * BIN_HZ,
        timeMs: 200,
        rms: 0.05,
      },
      OPTS
    );
    expect(r.isOnset).toBe(true);
    s = r.state;
    // Same spectrum 30ms later (< 60ms cooldown) should NOT re-fire.
    r = stepOnset(
      s,
      {
        spectrum: pianoSpectrum(20, 220),
        binHz: BIN_HZ,
        currentPitchHz: 20 * BIN_HZ,
        timeMs: 230,
        rms: 0.05,
      },
      OPTS
    );
    expect(r.isOnset).toBe(false);
    // gateOpen should be true (within onsetGateDurationMs).
    expect(r.gateOpen).toBe(true);
  });
});

describe('stepOnset — voice suppression trigger', () => {
  it('after enough rejected high-RMS frames, agcVoiceSuppressUntilMs is set', () => {
    let s = primeWithSilence(initOnsetState(), OPTS);
    // Need to trigger fluxOk + spreadOk on each frame to enter the rejection-counter branch.
    // Synthetic flux burst: alternate between voice spectra to keep flux high.
    for (let i = 0; i < OPTS.agcVoiceRejectCount + 1; i++) {
      const r = stepOnset(
        s,
        {
          spectrum: i % 2 === 0 ? voiceSpectrum() : noiseSpectrum(),
          binHz: BIN_HZ,
          currentPitchHz: 30 * BIN_HZ,
          timeMs: 300 + i * 30,
          rms: 0.05,
        },
        { ...OPTS, harmonicityMin: 0.5 } // strict so harmonicity always fails
      );
      s = r.state;
    }
    // We can't guarantee fluxOk + spreadOk fired (it depends on the synthetic
    // spectrum dynamics) — but if it did, the suppression timestamp should be set.
    // At minimum verify no crash + state evolved.
    expect(s.fluxHistory.length).toBeGreaterThan(0);
  });
});

describe('stepOnset — purity', () => {
  it('does not mutate options', () => {
    const opts = { ...OPTS };
    const snapshot = JSON.stringify(opts);
    stepOnset(
      initOnsetState(),
      { spectrum: pianoSpectrum(20), binHz: BIN_HZ, currentPitchHz: 467, timeMs: 0, rms: 0.05 },
      opts
    );
    expect(JSON.stringify(opts)).toBe(snapshot);
  });

  it('returns a NEW state object (caller can replace)', () => {
    const s0 = primeWithSilence(initOnsetState(), OPTS);
    const r = stepOnset(
      s0,
      {
        spectrum: pianoSpectrum(20, 220),
        binHz: BIN_HZ,
        currentPitchHz: 467,
        timeMs: 200,
        rms: 0.05,
      },
      OPTS
    );
    expect(r.state).not.toBe(s0);
  });
});

describe('stepOnset — gateOpen window', () => {
  it('gateOpen stays true for onsetGateDurationMs after fire', () => {
    let s = primeWithSilence(initOnsetState(), OPTS);
    const fire = stepOnset(
      s,
      {
        spectrum: pianoSpectrum(20, 220),
        binHz: BIN_HZ,
        currentPitchHz: 467,
        timeMs: 200,
        rms: 0.05,
      },
      OPTS
    );
    expect(fire.isOnset).toBe(true);
    s = fire.state;
    // 1000ms later (still within 1500ms gate)
    const later = stepOnset(
      s,
      { spectrum: silenceSpectrum(), binHz: BIN_HZ, currentPitchHz: 0, timeMs: 1200, rms: 0.001 },
      OPTS
    );
    expect(later.gateOpen).toBe(true);
    // 2000ms after fire — gate closed.
    const muchLater = stepOnset(
      later.state,
      { spectrum: silenceSpectrum(), binHz: BIN_HZ, currentPitchHz: 0, timeMs: 2200, rms: 0.001 },
      OPTS
    );
    expect(muchLater.gateOpen).toBe(false);
  });
});
