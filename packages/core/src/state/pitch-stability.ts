// Pitch stability — a 0..1 score that grows when consecutive onsets land
// on (roughly) the same pitch and decays when they jump or when no onset
// has arrived for a while.
//
// Three input regimes the caller picks per frame/event:
//   1. **applyOnsetPitch**  — a fresh onset's pitch arrived; compare to the
//      previous one and grow / decay.
//   2. **applyActivePlay**  — sound is happening but no clean onset boundary
//      (legato passage, sustained tone). Pull stability gently toward a
//      mid-band attractor so it doesn't collapse from absence of onsets.
//   3. **decayStability**   — silent frame; time-based exponential decay.
//
// Pure: no globals. The caller mutates state in place to match the legacy
// app.js's long-lived `state` singleton (no allocation churn per frame).
//
// Pitch unit: **continuous MIDI semitones** (`pitchHzToSemitones(hz)` for
// mic input, the raw `midiNum` for MIDI input). This unification lets a
// session that switches mid-way between mic and MIDI keep a coherent
// `lastPitchSemitones` value without losing the score.

export interface PitchStabilityState {
  /** Current 0..1 stability score. */
  pitchStability: number;
  /** Continuous-semitone value of the most recent onset, or null when no
   *  onset has been observed yet this session. */
  lastPitchSemitones: number | null;
}

export interface PitchStabilityOptions {
  /** Semitone delta below which the new onset counts as "stable" with the
   *  prior one. Legacy `STABILITY_SEMITONE_THRESHOLD`: 3. */
  semitoneThreshold: number;
  /** Additive grow per stable onset. Legacy `STABILITY_GROWTH`: 0.05. */
  growth: number;
  /** Multiplier applied per onset when the pitch jumped past the threshold.
   *  Legacy `STABILITY_DECAY_GOOD`: 0.90. */
  decayOnJump: number;
  /** Idle exponential half-life (seconds). Legacy: 5.0 — half decays every
   *  5s of pure silence. */
  idleHalfLifeSec: number;
  /** Active-play attractor pull rate per frame (NOT per second — the legacy
   *  did per-frame math without dt). Legacy: 0.005. */
  activePlayRate: number;
  /** Active-play attractor floor / target value. Legacy: 0.2 — an extended
   *  legato passage settles around here. */
  activePlayFloor: number;
}

/** A4 = 440 Hz = MIDI 69. Continuous-semitone scale (so 440.5 Hz returns
 *  ~69.02). Returns null for non-positive frequencies — the mic detector
 *  occasionally yields 0 / -1 sentinel values. */
export function pitchHzToSemitones(hz: number): number | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  return 12 * Math.log2(hz / 440) + 69;
}

/** Build a fresh state — stability 0, no prior pitch. */
export function initPitchStabilityState(): PitchStabilityState {
  return {
    pitchStability: 0,
    lastPitchSemitones: null,
  };
}

/** Reset a populated state in place. */
export function resetPitchStabilityState(state: PitchStabilityState): void {
  state.pitchStability = 0;
  state.lastPitchSemitones = null;
}

/**
 * Apply a fresh onset's pitch (continuous MIDI semitones; use
 * `pitchHzToSemitones` to convert mic Hz, or pass the raw `midiNum` for
 * MIDI input). The first onset of a session only seeds `lastPitchSemitones`
 * and leaves stability untouched.
 *
 * Pass `null` to record an onset whose pitch is unknown — `lastPitchSemitones`
 * is left unchanged and stability is untouched.
 */
export function applyOnsetPitch(
  state: PitchStabilityState,
  semitones: number | null,
  opts: PitchStabilityOptions
): void {
  if (semitones == null || !Number.isFinite(semitones)) return;
  if (state.lastPitchSemitones != null) {
    const delta = Math.abs(semitones - state.lastPitchSemitones);
    if (delta < opts.semitoneThreshold) {
      state.pitchStability = Math.min(1, state.pitchStability + opts.growth);
    } else {
      state.pitchStability *= opts.decayOnJump;
    }
  }
  state.lastPitchSemitones = semitones;
}

/** Active-play attractor — call once per frame when sound is present but
 *  no onset just fired. Stability slides toward `activePlayFloor` at
 *  `activePlayRate`. Result is clamped to [0, 1]. */
export function applyActivePlay(state: PitchStabilityState, opts: PitchStabilityOptions): void {
  const next =
    state.pitchStability * (1 - opts.activePlayRate) + opts.activePlayRate * opts.activePlayFloor;
  state.pitchStability = Math.max(0, Math.min(1, next));
}

/** Time-based exponential decay — call once per silent frame. Uses
 *  `idleHalfLifeSec` so 60Hz and 144Hz screens decay at the same wall-clock
 *  rate (the pre-2026 codebase used a per-frame multiplier and silently
 *  decayed faster on high-refresh devices). */
export function decayStability(
  state: PitchStabilityState,
  dtSec: number,
  opts: PitchStabilityOptions
): void {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return;
  const factor = Math.pow(0.5, dtSec / opts.idleHalfLifeSec);
  state.pitchStability = Math.max(0, state.pitchStability * factor);
}
