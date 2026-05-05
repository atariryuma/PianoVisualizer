// Software AGC (Automatic Gain Control) — pure reducer.
//
// Smoothly drives the GainNode so quiet pianos and loud pianos both land near
// AGC_TARGET_RMS. Browser's built-in AGC is disabled at getUserMedia time
// because we want our own control over voice suppression.
//
// Voice suppression: when the onset gate keeps rejecting (consecutive non-piano
// audio while RMS is high), the engine sets `voiceSuppressUntilMs` in the
// future. This pure reducer reads that field and clamps max gain to
// AGC_VOICE_SUPPRESS_MAX until the deadline passes — preventing the gain
// from amplifying speech to ear-piercing levels.

export interface AgcOptions {
  /** Target post-gain RMS (ideal level we drive toward). */
  targetRms: number;
  /** Lower bound on gain. */
  minGain: number;
  /** Upper bound on gain (when not voice-suppressed). */
  maxGain: number;
  /** Smoothing toward target when increasing gain (smaller = slower). */
  attackCoeff: number;
  /** Smoothing toward target when decreasing gain. */
  releaseCoeff: number;
  /** Don't update if smoothed pre-gain RMS is below this. */
  silenceFloor: number;
  /** Throttle: don't process more often than this. */
  updateIntervalMs: number;
  /** Cap during voice-suppression window. */
  voiceSuppressMax: number;
  /** Coefficient for the smoothed-RMS EMA. */
  rmsSmoothingCoeff?: number;
}

export interface AgcState {
  /** Current GainNode gain value (read-only-ish — `step` returns the new value). */
  gain: number;
  /** Internal smoothed RMS. */
  smoothedRms: number;
  /** Last time `step` ran (so the throttle works). */
  lastUpdateMs: number;
  /** When voice suppression expires (epoch ms). 0 = no suppression. */
  voiceSuppressUntilMs: number;
}

export interface AgcStepResult {
  /** Updated state. Caller should replace its previous AgcState with this. */
  state: AgcState;
  /** New gain to write to the GainNode. null = no update this tick (throttled or below silence floor). */
  gainOut: number | null;
}

/** Initial state for a fresh session. */
export function initAgcState(initialGain = 1.0): AgcState {
  return {
    gain: initialGain,
    smoothedRms: 0,
    lastUpdateMs: 0,
    voiceSuppressUntilMs: 0,
  };
}

/**
 * Step the AGC. Pure: returns new state + (optional) new gain to write.
 *
 * @param prev    Previous state.
 * @param timeMs  Current time (performance.now()).
 * @param postGainRms  Observed RMS AFTER the gain stage (i.e., what the analyser sees).
 * @param opts    Tuning knobs (typically from CONFIG).
 */
export function stepAgc(
  prev: AgcState,
  timeMs: number,
  postGainRms: number,
  opts: AgcOptions
): AgcStepResult {
  if (timeMs - prev.lastUpdateMs < opts.updateIntervalMs) {
    return { state: prev, gainOut: null };
  }

  const rmsCoeff = opts.rmsSmoothingCoeff ?? 0.15;
  const smoothedRms = prev.smoothedRms + (postGainRms - prev.smoothedRms) * rmsCoeff;
  const preGainRms = smoothedRms / Math.max(prev.gain, 1e-6);

  if (preGainRms < opts.silenceFloor) {
    return {
      state: { ...prev, smoothedRms, lastUpdateMs: timeMs },
      gainOut: null,
    };
  }

  const effectiveMax = timeMs < prev.voiceSuppressUntilMs ? opts.voiceSuppressMax : opts.maxGain;

  const ratio = opts.targetRms / (smoothedRms + 1e-10);
  const targetGain = Math.max(opts.minGain, Math.min(effectiveMax, prev.gain * ratio));
  const alpha = targetGain > prev.gain ? opts.attackCoeff : opts.releaseCoeff;
  let newGain = prev.gain + (targetGain - prev.gain) * alpha;
  newGain = Math.max(opts.minGain, Math.min(effectiveMax, newGain));

  return {
    state: {
      gain: newGain,
      smoothedRms,
      lastUpdateMs: timeMs,
      voiceSuppressUntilMs: prev.voiceSuppressUntilMs,
    },
    gainOut: newGain,
  };
}

/** Engage voice suppression for `durationMs` from `nowMs`. */
export function suppressVoice(prev: AgcState, nowMs: number, durationMs: number): AgcState {
  return { ...prev, voiceSuppressUntilMs: nowMs + durationMs };
}
