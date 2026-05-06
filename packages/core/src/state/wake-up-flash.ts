// Wake-up flash — a brief screen-wide white overlay that fires when a kid
// plays a note while their flow score is low (legacy: flow < 10). The
// intent is "you woke it up!" feedback when sound finally lands after a
// quiet stretch, which research showed kids treated as confirmation more
// reliably than the gauge-fill animation alone.
//
// Two-phase model:
//   * `triggerWakeUpFlash` snaps the intensity to `triggerLevel` (0..1).
//   * `decayWakeUpFlash` exponentially decays toward 0 over `halfLifeSec`.
//
// The legacy decayed by `*= 0.85` inside the per-frame draw, which silently
// halved at half the wall-clock rate on 144 Hz screens vs 60 Hz. The
// time-based half-life here matches the legacy 60 Hz feel (≈71 ms half-life)
// while staying frame-rate-independent.
//
// Pure: state mutated in place. The renderer reads `state.inputFlash`
// directly to size the white-rect alpha.

export interface WakeUpFlashState {
  /** 0..1 flash intensity. The renderer reads this and draws a white
   *  full-screen rect at this alpha when > ~0.01. */
  inputFlash: number;
}

export interface WakeUpFlashOptions {
  /** Peak intensity set by `triggerWakeUpFlash`. Legacy: 0.2. */
  triggerLevel: number;
  /** Half-life of the exponential decay, in seconds. Legacy 60Hz frame-by-
   *  frame `*= 0.85` corresponds to ~0.071 s. */
  halfLifeSec: number;
}

/** Build a fresh state — flash off. */
export function initWakeUpFlashState(): WakeUpFlashState {
  return { inputFlash: 0 };
}

/** Reset a populated state in place. */
export function resetWakeUpFlashState(state: WakeUpFlashState): void {
  state.inputFlash = 0;
}

/**
 * Trigger a fresh flash. Snaps intensity to `triggerLevel`, clamped to
 * [0, 1] so a misconfigured `triggerLevel > 1` (or repeated triggers via
 * a hypothetical additive policy at the call site) can't blow out the
 * draw alpha.
 */
export function triggerWakeUpFlash(state: WakeUpFlashState, opts: WakeUpFlashOptions): void {
  state.inputFlash = Math.max(0, Math.min(1, opts.triggerLevel));
}

/**
 * Exponential decay toward 0. Frame-rate-independent: a 60 Hz screen and
 * a 144 Hz screen running for the same wall-clock duration land on the
 * same flash level. Below 0.001 the result snaps to 0 so the renderer's
 * `> 0.01` cutoff doesn't flicker on near-zero residuals.
 */
export function decayWakeUpFlash(
  state: WakeUpFlashState,
  dtSec: number,
  opts: WakeUpFlashOptions
): void {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return;
  if (state.inputFlash <= 0) return;
  const factor = Math.pow(0.5, dtSec / opts.halfLifeSec);
  const next = state.inputFlash * factor;
  state.inputFlash = next < 0.001 ? 0 : next;
}
