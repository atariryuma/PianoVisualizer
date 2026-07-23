// Multi-feature onset detector — Phase 0d batch 40.
//
// Per-frame audio onset classifier. Walks the onset-analyser's byte
// spectrum and combines five features into a single "is this a piano
// onset?" verdict, with hysteresis (practice mode) and an adaptive
// threshold so a quiet practice room and a noisy classroom both work
// without manual tuning:
//
//   1. Spectral flux — sum of positive bin-to-bin energy increases
//      across the piano frequency range. Spikes on attack transients.
//   2. Spectral spread — fraction of bins that contributed
//      meaningfully to the flux. Filters single-bin glitches AND
//      broadband noise (typing, claps).
//   3. Spectral flatness — high for piano (rich harmonics), low for
//      pure tones / sine-like sources.
//   4. Spectral crest — high for voice formants, low for piano.
//   5. Harmonicity — energy at integer-ratio harmonics of the YIN
//      fundamental. Practice mode tightens the threshold so non-
//      pitched sounds (voice, key clatter) can't masquerade as notes.
//
// All five must be in-range simultaneously to fire. Practice mode adds
// hysteresis: ONSET_HYSTERESIS_FRAMES consecutive all-passing frames
// before firing, filtering one-frame spikes. After a fire, an
// ONSET_COOLDOWN_MS lockout prevents double-counting a single attack.
//
// AGC voice suppression: when flux+spread pass but flatness/crest/
// harmonicity reject (typical voice signature), accumulate a counter
// — past AGC_VOICE_REJECT_COUNT we suppress AGC gain for
// AGC_VOICE_SUPPRESS_MS so the kid singing "C-D-E" doesn't crank the
// gain up into runaway feedback.
//
// All side effects flow through the deps.state ref. Pure-ish (no
// DOM, no I/O); the analyser + dataArray are the only "external"
// data and we read them, never mutate.

/** Subset of the shell `state` we read + write. */
export interface OnsetDetectStateRef {
  prevSpectrum: Float32Array | null;
  spectralFluxHistory: number[];
  centroidHistory: number[];
  consecutiveOnsetFrames?: number;
  lastOnsetTimeMs: number;
  agcVoiceRejectCount: number;
  agcVoiceSuppressUntilMs: number;
  debugLastRms: number;

  // Debug state writes (read by the diag overlay).
  debugLastFlux: number;
  debugLastSpread: number;
  debugLastFlatness: number;
  debugLastCrest: number;
  debugLastCentroid: number;
  debugCentroidCV: number;
  debugLastThreshold: number;
  debugHarmonicity: number;
  debugOnsetReason: string;
  debugGateOpen: boolean;
}

/** Subset of practice we read. */
export interface OnsetDetectPracticeRef {
  enabled: boolean;
}

/** Tunables — passed in so the detector is testable without pulling
 *  the whole CONFIG bag. Default values match the legacy CONFIG. */
export interface OnsetDetectTuning {
  pitchMinHz: number;
  fluxFreqMinHz: number;
  fluxFreqMaxHz: number;
  onsetGateDurationMs: number;
  onsetSpreadMinChange: number;
  onsetSpreadThreshold: number;
  onsetSpreadMax: number;
  flatnessPianoMin: number;
  crestVoiceMax: number;
  spectralFluxThreshold: number;
  spectralFluxAdaptiveK: number;
  spectralFluxHistorySize: number;
  centroidHistorySize: number;
  harmonicityMin: number;
  harmonicityMinPractice: number;
  onsetCooldownMs: number;
  /** Read at call-time so the legacy shell can hand a thunk that
   *  resolves the const after its TDZ unblocks. */
  getOnsetHysteresisFrames: () => number;
  agcVoiceRmsMin: number;
  agcVoiceRejectCount: number;
  agcVoiceSuppressMs: number;
}

export interface OnsetDetectAnalyserRef {
  fftSize: number;
  getByteFrequencyData(buf: Uint8Array): void;
}

export interface OnsetDetectAudioCtxRef {
  sampleRate: number;
}

/** Pure feature-computation functions — passed via deps so the shell
 *  can hand its existing PianoCore aliases. */
export interface OnsetDetectFeatures {
  computeSpectralFlatness(spec: Uint8Array, startBin: number, endBin: number): number;
  computeSpectralCrest(spec: Uint8Array, startBin: number, endBin: number): number;
  computeSpectralCentroid(
    spec: Uint8Array,
    startBin: number,
    endBin: number,
    binHz: number
  ): number;
  computeHarmonicity(
    spec: Uint8Array,
    fundamentalBin: number,
    startBin: number,
    endBin: number
  ): number;
  coefficientOfVariation(arr: readonly number[]): number;
}

/** CONFIG slice the wireup builder reads. Loose so this module
 *  stays free of the full PianoConfig type import. */
export interface OnsetDetectConfig {
  PITCH_MIN_HZ: number;
  FLUX_FREQ_MIN_HZ: number;
  FLUX_FREQ_MAX_HZ: number;
  ONSET_GATE_DURATION_MS: number;
  ONSET_SPREAD_MIN_CHANGE: number;
  ONSET_SPREAD_THRESHOLD: number;
  ONSET_SPREAD_MAX: number;
  FLATNESS_PIANO_MIN: number;
  CREST_VOICE_MAX: number;
  SPECTRAL_FLUX_THRESHOLD: number;
  SPECTRAL_FLUX_ADAPTIVE_K: number;
  SPECTRAL_FLUX_HISTORY_SIZE: number;
  CENTROID_HISTORY_SIZE: number;
  HARMONICITY_MIN: number;
  HARMONICITY_MIN_PRACTICE: number;
  ONSET_COOLDOWN_MS: number;
  AGC_VOICE_RMS_MIN: number;
  AGC_VOICE_REJECT_COUNT: number;
  AGC_VOICE_SUPPRESS_MS: number;
}

export interface OnsetDetectShellRefs {
  state: OnsetDetectStateRef;
  getPractice: () => OnsetDetectPracticeRef;
  config: OnsetDetectConfig;
  getOnsetHysteresisFrames: () => number;
  features: OnsetDetectFeatures;
  getOnsetAnalyser: () => OnsetDetectAnalyserRef | null;
  getOnsetDataArray: () => Uint8Array | null;
  getAudioCtx: () => OnsetDetectAudioCtxRef | null;
}

/** Build the OnsetDetectDeps from CONFIG + the shell refs. The
 *  CONFIG → tuning mapping (~20 lines) lives here now. */
export function buildOnsetDetectDeps(refs: OnsetDetectShellRefs): OnsetDetectDeps {
  return {
    state: refs.state,
    getPractice: refs.getPractice,
    tuning: {
      pitchMinHz: refs.config.PITCH_MIN_HZ,
      fluxFreqMinHz: refs.config.FLUX_FREQ_MIN_HZ,
      fluxFreqMaxHz: refs.config.FLUX_FREQ_MAX_HZ,
      onsetGateDurationMs: refs.config.ONSET_GATE_DURATION_MS,
      onsetSpreadMinChange: refs.config.ONSET_SPREAD_MIN_CHANGE,
      onsetSpreadThreshold: refs.config.ONSET_SPREAD_THRESHOLD,
      onsetSpreadMax: refs.config.ONSET_SPREAD_MAX,
      flatnessPianoMin: refs.config.FLATNESS_PIANO_MIN,
      crestVoiceMax: refs.config.CREST_VOICE_MAX,
      spectralFluxThreshold: refs.config.SPECTRAL_FLUX_THRESHOLD,
      spectralFluxAdaptiveK: refs.config.SPECTRAL_FLUX_ADAPTIVE_K,
      spectralFluxHistorySize: refs.config.SPECTRAL_FLUX_HISTORY_SIZE,
      centroidHistorySize: refs.config.CENTROID_HISTORY_SIZE,
      harmonicityMin: refs.config.HARMONICITY_MIN,
      harmonicityMinPractice: refs.config.HARMONICITY_MIN_PRACTICE,
      onsetCooldownMs: refs.config.ONSET_COOLDOWN_MS,
      getOnsetHysteresisFrames: refs.getOnsetHysteresisFrames,
      agcVoiceRmsMin: refs.config.AGC_VOICE_RMS_MIN,
      agcVoiceRejectCount: refs.config.AGC_VOICE_REJECT_COUNT,
      agcVoiceSuppressMs: refs.config.AGC_VOICE_SUPPRESS_MS,
    },
    features: refs.features,
    getOnsetAnalyser: refs.getOnsetAnalyser,
    getOnsetDataArray: refs.getOnsetDataArray,
    getAudioCtx: refs.getAudioCtx,
  };
}

export interface OnsetDetectDeps {
  state: OnsetDetectStateRef;
  /** Read at call time — the legacy shell's `practice` const lives
   *  further down the file so a thunk avoids the TDZ. */
  getPractice: () => OnsetDetectPracticeRef;
  tuning: OnsetDetectTuning;
  features: OnsetDetectFeatures;
  /** Read at every call so a post-recovery analyser swap is picked up. */
  getOnsetAnalyser: () => OnsetDetectAnalyserRef | null;
  getOnsetDataArray: () => Uint8Array | null;
  getAudioCtx: () => OnsetDetectAudioCtxRef | null;
}

export interface OnsetDetectResult {
  isOnset: boolean;
  gateOpen: boolean;
}

/** Single per-frame call. Returns the onset verdict + gate-open
 *  state; mutates deps.state for the debug overlay + AGC suppression
 *  counters. */
export function updateMultiFeatureOnset(
  timeMs: number,
  currentPitchHz: number,
  deps: OnsetDetectDeps
): OnsetDetectResult {
  const onsetAnalyser = deps.getOnsetAnalyser();
  const onsetDataArray = deps.getOnsetDataArray();
  const audioCtx = deps.getAudioCtx();
  const t = deps.tuning;
  const s = deps.state;

  if (!onsetAnalyser || !onsetDataArray || !audioCtx) {
    s.debugGateOpen = false;
    return { isOnset: false, gateOpen: false };
  }

  onsetAnalyser.getByteFrequencyData(onsetDataArray);

  const binHz = audioCtx.sampleRate / onsetAnalyser.fftSize;
  const startBin = Math.max(1, Math.floor(t.fluxFreqMinHz / binHz));
  const endBin = Math.min(onsetDataArray.length, Math.floor(t.fluxFreqMaxHz / binHz));
  const numBins = endBin - startBin;

  if (numBins < 10) {
    const gateOpen = timeMs - s.lastOnsetTimeMs < t.onsetGateDurationMs;
    s.debugGateOpen = gateOpen;
    return { isOnset: false, gateOpen };
  }

  if (!s.prevSpectrum) {
    s.prevSpectrum = new Float32Array(onsetDataArray.length);
    s.prevSpectrum.set(onsetDataArray);
    s.debugGateOpen = false;
    return { isOnset: false, gateOpen: false };
  }

  // Feature 1: Spectral Flux
  let flux = 0;
  let spreadCount = 0;
  for (let i = startBin; i < endBin; i++) {
    const diff = onsetDataArray[i] - s.prevSpectrum[i];
    if (diff > 0) {
      flux += diff;
      if (diff > t.onsetSpreadMinChange) {
        spreadCount++;
      }
    }
  }
  const spread = spreadCount / numBins;

  // Feature 2: Spectral Flatness
  const flatness = deps.features.computeSpectralFlatness(onsetDataArray, startBin, endBin);

  // Feature 3: Spectral Crest
  const crest = deps.features.computeSpectralCrest(onsetDataArray, startBin, endBin);

  // Feature 4: Spectral Centroid (debug tracking)
  const centroid = deps.features.computeSpectralCentroid(onsetDataArray, startBin, endBin, binHz);
  s.centroidHistory.push(centroid);
  if (s.centroidHistory.length > t.centroidHistorySize) {
    s.centroidHistory.shift();
  }
  const centroidCV = deps.features.coefficientOfVariation(s.centroidHistory);

  // v9: Feature 5 — Harmonicity check.
  // Practice mode tightens the threshold so non-pitched sounds (voice,
  // key noise, chair creaks, claps) can't masquerade as notes.
  let harmonicity = 0;
  // H6 (2026-07-25): harmonicityOk defaults TRUE when YIN found no pitch
  // (currentPitchHz ≤ pitchMinHz). This is DELIBERATE, not a bypass bug: an
  // onset IS the attack transient, and a piano attack is broadband — YIN
  // frequently can't lock a fundamental in that first frame, so demanding
  // harmonicity there would reject real notes. The gate still needs 4 of the
  // 5 features (flux/spread/flatness/crest + harmonicity), so a no-pitch frame
  // must pass the other 4 on its own merits; harmonicity only *adds* rejection
  // power once a pitch exists. Keep the true-default.
  let harmonicityOk = true;
  if (currentPitchHz > t.pitchMinHz) {
    const fundamentalBin = Math.round(currentPitchHz / binHz);
    harmonicity = deps.features.computeHarmonicity(
      onsetDataArray,
      fundamentalBin,
      startBin,
      endBin
    );
    const harmMin = deps.getPractice().enabled ? t.harmonicityMinPractice : t.harmonicityMin;
    harmonicityOk = harmonicity >= harmMin;
  }
  s.debugHarmonicity = harmonicity;

  // Save current spectrum for next frame
  s.prevSpectrum.set(onsetDataArray);

  // Update flux history for adaptive threshold
  const fHist = s.spectralFluxHistory;
  fHist.push(flux);
  if (fHist.length > t.spectralFluxHistorySize) fHist.shift();

  // Combined onset decision
  let isOnset = false;
  let onsetReason = '';
  if (fHist.length >= 5) {
    let mean = 0;
    for (let i = 0; i < fHist.length; i++) mean += fHist[i];
    mean /= fHist.length;

    let variance = 0;
    for (let i = 0; i < fHist.length; i++) {
      const d = fHist[i] - mean;
      variance += d * d;
    }
    variance /= fHist.length;
    const stddev = Math.sqrt(variance);

    const adaptiveThreshold = mean + t.spectralFluxAdaptiveK * stddev;
    const threshold = Math.max(t.spectralFluxThreshold, adaptiveThreshold);

    s.debugLastThreshold = threshold;

    const fluxOk = flux > threshold;
    // v10: Bandpass Spread - Reject too low (glitch) AND too high
    // (noise/typing).
    const spreadOk = spread > t.onsetSpreadThreshold && spread < t.onsetSpreadMax;
    const flatnessOk = flatness > t.flatnessPianoMin;
    const crestOk = crest < t.crestVoiceMax;

    // v9: 5-condition gate (added harmonicity).
    const allConditionsMet = fluxOk && spreadOk && flatnessOk && crestOk && harmonicityOk;
    // N-frame hysteresis (practice mode): require ONSET_HYSTERESIS_FRAMES
    // consecutive frames of all-conditions-met before firing. Filters
    // one-frame spectral spikes from key clatter, environmental
    // clicks, etc.
    if (allConditionsMet) {
      s.consecutiveOnsetFrames = (s.consecutiveOnsetFrames || 0) + 1;
    } else {
      s.consecutiveOnsetFrames = 0;
    }
    const hysteresisRequirement = deps.getPractice().enabled ? t.getOnsetHysteresisFrames() : 1;
    if (allConditionsMet && (s.consecutiveOnsetFrames || 0) >= hysteresisRequirement) {
      if (timeMs - s.lastOnsetTimeMs > t.onsetCooldownMs) {
        s.lastOnsetTimeMs = timeMs;
        isOnset = true;
        onsetReason = 'PIANO';
        s.consecutiveOnsetFrames = 0; // reset after firing
        s.agcVoiceRejectCount = 0;
      }
    } else if (fluxOk && spreadOk) {
      // v9: track rejections for AGC voice suppression
      if (s.debugLastRms > t.agcVoiceRmsMin) {
        s.agcVoiceRejectCount++;
        if (s.agcVoiceRejectCount >= t.agcVoiceRejectCount) {
          s.agcVoiceSuppressUntilMs = timeMs + t.agcVoiceSuppressMs;
        }
      }
      if (!harmonicityOk) onsetReason = 'REJ:harm';
      else if (!flatnessOk) onsetReason = 'REJ:flat';
      else if (!crestOk) onsetReason = 'REJ:crest';
    }
  }

  // Store debug info
  s.debugLastFlux = flux;
  s.debugLastSpread = spread;
  s.debugLastFlatness = flatness;
  s.debugLastCrest = crest;
  s.debugOnsetReason = onsetReason;
  s.debugLastCentroid = centroid;
  s.debugCentroidCV = centroidCV;

  const gateOpen = timeMs - s.lastOnsetTimeMs < t.onsetGateDurationMs;
  s.debugGateOpen = gateOpen;

  return { isOnset, gateOpen };
}
