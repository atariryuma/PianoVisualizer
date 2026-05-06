// Multi-feature onset detection — the 5-condition gate that decides whether
// the current audio frame contains a piano note attack.
//
// Conditions (all must pass simultaneously):
//   1. Spectral flux > adaptive threshold (mean + k·stddev) — energy increased
//   2. Spread (fraction of bins with diff > threshold) within bandpass —
//      reject single-bin glitches AND broadband typing/clatter
//   3. Spectral flatness > floor — reject pure noise
//   4. Spectral crest < ceiling — reject voice formants
//   5. Harmonicity > threshold — reject non-pitched sounds
//
// Plus N-frame hysteresis (practice mode) and a cooldown to prevent re-fires.
//
// Pure reducer: takes prev state + frame data, returns new state + decision.
// State mutations that used to live on the global `state` object (flux history,
// hysteresis counter, voice-reject counter, last-onset timestamp) are now
// explicit fields of OnsetState.

import {
  computeSpectralFlatness,
  computeSpectralCrest,
  computeSpectralCentroid,
  coefficientOfVariation,
} from './spectral';
import { computeHarmonicity } from './harmonicity';

export interface OnsetOptions {
  /** Frequency-bin range to analyse (typically piano-ish 20–4200 Hz). */
  fluxFreqMinHz: number;
  fluxFreqMaxHz: number;
  /** Adaptive threshold = mean + adaptiveK · stddev of recent flux. */
  spectralFluxThreshold: number;
  spectralFluxAdaptiveK: number;
  spectralFluxHistorySize: number;
  /** Spread bandpass: reject if too few/too many bins changed. */
  onsetSpreadThreshold: number;
  onsetSpreadMax: number;
  /** Per-bin diff threshold to count toward spread. */
  onsetSpreadMinChange: number;
  /** Floor for spectral flatness — below = pure noise rejection. */
  flatnessPianoMin: number;
  /** Ceiling for spectral crest — above = voice formant rejection. */
  crestVoiceMax: number;
  /** Minimum harmonicity for the gate to pass. */
  harmonicityMin: number;
  /** Cooldown between fires. */
  onsetCooldownMs: number;
  /** How many frames must consecutively meet all conditions before firing. */
  hysteresisFrames: number;
  /** Centroid history size for debug CV computation. */
  centroidHistorySize: number;
  /** Pitch min Hz — used as a sentinel: below this we skip harmonicity. */
  pitchMinHz: number;
  /** AGC voice-suppression triggers: count + RMS gate + duration. */
  agcVoiceRejectCount: number;
  agcVoiceRmsMin: number;
  agcVoiceSuppressMs: number;
  /** How long the gate stays "open" after a confirmed onset. */
  onsetGateDurationMs: number;
}

export interface OnsetState {
  /** Previous frame's spectrum (for flux). null on first frame. */
  prevSpectrum: Float32Array | null;
  /** Recent flux values for adaptive threshold. */
  fluxHistory: number[];
  /** Centroid window for debug CV. */
  centroidHistory: number[];
  /** Hysteresis counter. */
  consecutiveOnsetFrames: number;
  /** Counter for AGC voice suppression. */
  agcVoiceRejectCount: number;
  /** When the AGC voice-suppression window expires. 0 = no suppression active. */
  agcVoiceSuppressUntilMs: number;
  /** Timestamp of the last confirmed onset. -Infinity = never. */
  lastOnsetTimeMs: number;
}

export interface OnsetFrameInput {
  /** Current onset-FFT magnitude spectrum. */
  spectrum: Uint8Array;
  /** Bin width in Hz (sampleRate / fftSize). */
  binHz: number;
  /** YIN-derived pitch in Hz, or <= pitchMinHz if no pitch detected. */
  currentPitchHz: number;
  /** Current time. */
  timeMs: number;
  /** Recent observed input RMS — used for the AGC voice-reject gate. */
  rms: number;
}

export interface OnsetResult {
  /** Updated state (caller replaces previous OnsetState with this). */
  state: OnsetState;
  /** True if a piano onset was confirmed THIS frame. */
  isOnset: boolean;
  /** True if we're inside the post-onset gate window. */
  gateOpen: boolean;
  /** Per-frame debug telemetry. Cheap to compute, useful in the overlay.
   *  Treated as read-only — non-onset frames share a frozen sentinel, so
   *  consumers must not mutate this object. */
  debug: Readonly<{
    flux: number;
    spread: number;
    flatness: number;
    crest: number;
    centroid: number;
    centroidCV: number;
    harmonicity: number;
    threshold: number;
    onsetReason: string;
  }>;
}

// Frozen so a stray `result.debug.flux = ...` from a caller can't poison the
// next early-return — every non-onset frame returns the same shared object,
// and any in-place mutation would silently corrupt subsequent reads.
const EMPTY_DEBUG = Object.freeze({
  flux: 0,
  spread: 0,
  flatness: 0,
  crest: 0,
  centroid: 0,
  centroidCV: 0,
  harmonicity: 0,
  threshold: 0,
  onsetReason: '',
});

export function initOnsetState(): OnsetState {
  return {
    prevSpectrum: null,
    fluxHistory: [],
    centroidHistory: [],
    consecutiveOnsetFrames: 0,
    agcVoiceRejectCount: 0,
    agcVoiceSuppressUntilMs: 0,
    lastOnsetTimeMs: -Infinity,
  };
}

/**
 * Step the onset detector. Pure: returns new state + decision + debug.
 *
 * @param prev Previous OnsetState.
 * @param frame Current-frame audio data.
 * @param opts Tuning parameters (typically from CONFIG).
 */
export function stepOnset(
  prev: OnsetState,
  frame: OnsetFrameInput,
  opts: OnsetOptions
): OnsetResult {
  const { spectrum, binHz, currentPitchHz, timeMs, rms } = frame;

  const startBin = Math.max(1, Math.floor(opts.fluxFreqMinHz / binHz));
  const endBin = Math.min(spectrum.length, Math.floor(opts.fluxFreqMaxHz / binHz));
  const numBins = endBin - startBin;

  const gateOpenStandard = timeMs - prev.lastOnsetTimeMs < opts.onsetGateDurationMs;

  if (numBins < 10) {
    return { state: prev, isOnset: false, gateOpen: gateOpenStandard, debug: EMPTY_DEBUG };
  }

  // First frame: prime prevSpectrum, return no onset.
  if (!prev.prevSpectrum) {
    const seeded = new Float32Array(spectrum.length);
    seeded.set(spectrum);
    return {
      state: { ...prev, prevSpectrum: seeded },
      isOnset: false,
      gateOpen: false,
      debug: EMPTY_DEBUG,
    };
  }

  // === Feature 1: spectral flux + spread (positive-difference fraction) ===
  let flux = 0;
  let spreadCount = 0;
  for (let i = startBin; i < endBin; i++) {
    const diff = spectrum[i] - prev.prevSpectrum[i];
    if (diff > 0) {
      flux += diff;
      if (diff > opts.onsetSpreadMinChange) spreadCount++;
    }
  }
  const spread = spreadCount / numBins;

  // === Features 2-4: flatness, crest, centroid (centroid is debug-only) ===
  const flatness = computeSpectralFlatness(spectrum, startBin, endBin);
  const crest = computeSpectralCrest(spectrum, startBin, endBin);
  const centroid = computeSpectralCentroid(spectrum, startBin, endBin, binHz);

  // Update centroid history (bounded) — used for debug CV display.
  // Mutate the prev array in place + return the same reference (matches the
  // prevSpectrum pattern below); concat() would allocate ~60 throwaway arrays
  // per second on the per-frame onset path.
  const centroidHistory = prev.centroidHistory;
  centroidHistory.push(centroid);
  while (centroidHistory.length > opts.centroidHistorySize) centroidHistory.shift();
  const centroidCV = coefficientOfVariation(centroidHistory);

  // === Feature 5: harmonicity (only when we have a pitch to anchor on) ===
  let harmonicity = 0;
  let harmonicityOk = true;
  if (currentPitchHz > opts.pitchMinHz) {
    const fundamentalBin = Math.round(currentPitchHz / binHz);
    harmonicity = computeHarmonicity(spectrum, fundamentalBin, startBin, endBin);
    harmonicityOk = harmonicity >= opts.harmonicityMin;
  }

  // Update prevSpectrum (mutate in place; it's owned by us via the seed step).
  prev.prevSpectrum.set(spectrum);

  // Update flux history for adaptive threshold (mutate in place, see above).
  const fluxHistory = prev.fluxHistory;
  fluxHistory.push(flux);
  while (fluxHistory.length > opts.spectralFluxHistorySize) fluxHistory.shift();

  // === Combined decision (need at least 5 history samples for adaptive threshold) ===
  let isOnset = false;
  let onsetReason = '';
  let threshold = 0;
  let consecutiveOnsetFrames = prev.consecutiveOnsetFrames;
  let agcVoiceRejectCount = prev.agcVoiceRejectCount;
  let agcVoiceSuppressUntilMs = prev.agcVoiceSuppressUntilMs;
  let lastOnsetTimeMs = prev.lastOnsetTimeMs;

  if (fluxHistory.length >= 5) {
    let mean = 0;
    for (let i = 0; i < fluxHistory.length; i++) mean += fluxHistory[i];
    mean /= fluxHistory.length;
    let variance = 0;
    for (let i = 0; i < fluxHistory.length; i++) {
      const d = fluxHistory[i] - mean;
      variance += d * d;
    }
    variance /= fluxHistory.length;
    const stddev = Math.sqrt(variance);

    const adaptiveThreshold = mean + opts.spectralFluxAdaptiveK * stddev;
    threshold = Math.max(opts.spectralFluxThreshold, adaptiveThreshold);

    const fluxOk = flux > threshold;
    const spreadOk = spread > opts.onsetSpreadThreshold && spread < opts.onsetSpreadMax;
    const flatnessOk = flatness > opts.flatnessPianoMin;
    const crestOk = crest < opts.crestVoiceMax;

    const allConditionsMet = fluxOk && spreadOk && flatnessOk && crestOk && harmonicityOk;

    if (allConditionsMet) {
      consecutiveOnsetFrames++;
    } else {
      consecutiveOnsetFrames = 0;
    }

    if (allConditionsMet && consecutiveOnsetFrames >= opts.hysteresisFrames) {
      if (timeMs - lastOnsetTimeMs > opts.onsetCooldownMs) {
        lastOnsetTimeMs = timeMs;
        isOnset = true;
        onsetReason = 'PIANO';
        consecutiveOnsetFrames = 0;
        agcVoiceRejectCount = 0;
      }
    } else if (fluxOk && spreadOk) {
      // Track non-piano rejections for AGC voice suppression.
      if (rms > opts.agcVoiceRmsMin) {
        agcVoiceRejectCount++;
        if (agcVoiceRejectCount >= opts.agcVoiceRejectCount) {
          agcVoiceSuppressUntilMs = timeMs + opts.agcVoiceSuppressMs;
        }
      }
      if (!harmonicityOk) onsetReason = 'REJ:harm';
      else if (!flatnessOk) onsetReason = 'REJ:flat';
      else if (!crestOk) onsetReason = 'REJ:crest';
    }
  }

  const gateOpen = timeMs - lastOnsetTimeMs < opts.onsetGateDurationMs;

  return {
    state: {
      prevSpectrum: prev.prevSpectrum,
      fluxHistory,
      centroidHistory,
      consecutiveOnsetFrames,
      agcVoiceRejectCount,
      agcVoiceSuppressUntilMs,
      lastOnsetTimeMs,
    },
    isOnset,
    gateOpen,
    debug: {
      flux,
      spread,
      flatness,
      crest,
      centroid,
      centroidCV,
      harmonicity,
      threshold,
      onsetReason,
    },
  };
}
