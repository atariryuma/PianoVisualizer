// Software AGC controller — Phase 0d batch 43.
//
// Per-frame software auto-gain-control. The legacy mic stream has
// AGC disabled at getUserMedia (so we control it ourselves and avoid
// the browser fighting our note-detection thresholds). This reducer
// nudges the GainNode value toward AGC_TARGET_RMS using:
//
//   - Throttled to AGC_UPDATE_INTERVAL_MS (~100 ms) ticks.
//   - Smoothed-RMS EMA (alpha=0.15) so a single loud frame doesn't
//     yank the gain down.
//   - Silence-floor early-exit (preGainRms < floor → no update; the
//     room's quiet, don't crank the mic).
//   - Voice suppression: when the onset detector has flagged
//     repeated voice-shaped rejections, max gain is clamped to
//     AGC_VOICE_SUPPRESS_MAX until agcVoiceSuppressUntilMs.
//   - Asymmetric attack/release: gain rises with AGC_ATTACK_COEFF
//     (slow), falls with AGC_RELEASE_COEFF (fast) so a sudden loud
//     attack doesn't dim the mic before the rest of the note plays.
//
// The reducer writes both `state.agcGain` (for the next-tick math)
// and `gainNode.gain.setValueAtTime` (for the actual audio path).

/** Subset of `state` we read + write. */
export interface AgcStateRef {
  agcLastUpdateMs: number;
  agcSmoothedRms: number;
  agcGain: number;
  agcVoiceSuppressUntilMs: number;
  /** Debug overlay snapshot. */
  debugAgcGain: number;
}

/** Tunables. */
export interface AgcTuning {
  updateIntervalMs: number;
  silenceFloor: number;
  voiceSuppressMax: number;
  maxGain: number;
  minGain: number;
  targetRms: number;
  attackCoeff: number;
  releaseCoeff: number;
}

/** Subset of GainNode we touch. */
export interface AgcGainNodeRef {
  gain: { setValueAtTime(value: number, when: number): void };
}

/** Subset of AudioContext we touch. */
export interface AgcAudioCtxRef {
  currentTime: number;
}

export interface AgcControllerDeps {
  state: AgcStateRef;
  tuning: AgcTuning;
  /** Read at every tick — post-recovery the audio nodes get
   *  swapped, so a thunk picks up the fresh refs. */
  getGainNode: () => AgcGainNodeRef | null;
  getAudioCtx: () => AgcAudioCtxRef | null;
}

/** Single per-frame call. Mutates state.agcGain + writes the
 *  GainNode value. Throttled internally. */
export function updateAGC(timeMs: number, postGainRms: number, deps: AgcControllerDeps): void {
  const s = deps.state;
  const t = deps.tuning;

  if (timeMs - s.agcLastUpdateMs < t.updateIntervalMs) return;
  s.agcLastUpdateMs = timeMs;

  // Smoothed-RMS EMA so a single loud frame doesn't yank the gain.
  s.agcSmoothedRms += (postGainRms - s.agcSmoothedRms) * 0.15;

  // Pre-gain RMS = post-gain / current-gain. If the room itself is
  // quiet, don't crank the mic up trying to hit target.
  // Guard the divisor: today AGC_MIN_GAIN=1.0 so agcGain is never 0, but the
  // core twin (agc.ts) guards this and the shipped path didn't — a future
  // minGain ≤ 0 would yield Infinity/NaN gain and a dead mic. Cheap insurance.
  const preGainRms = s.agcSmoothedRms / Math.max(s.agcGain, 1e-6);
  if (preGainRms < t.silenceFloor) return;

  // Voice suppression — clamp max gain when the onset detector has
  // flagged voice-shaped rejections.
  const effectiveMaxGain = timeMs < s.agcVoiceSuppressUntilMs ? t.voiceSuppressMax : t.maxGain;

  const ratio = t.targetRms / (s.agcSmoothedRms + 1e-10);
  const targetGain = Math.max(t.minGain, Math.min(effectiveMaxGain, s.agcGain * ratio));

  // Asymmetric attack/release: gain rises slow, falls fast so a
  // sudden loud attack doesn't dim the mic before the rest of the
  // note plays.
  const alpha = targetGain > s.agcGain ? t.attackCoeff : t.releaseCoeff;
  s.agcGain += (targetGain - s.agcGain) * alpha;
  s.agcGain = Math.max(t.minGain, Math.min(effectiveMaxGain, s.agcGain));

  const gainNode = deps.getGainNode();
  const audioCtx = deps.getAudioCtx();
  if (gainNode && audioCtx) {
    gainNode.gain.setValueAtTime(s.agcGain, audioCtx.currentTime);
  }
  s.debugAgcGain = s.agcGain;
}
