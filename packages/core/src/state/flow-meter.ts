// Flow + combo state machine.
//
// Drives the visible "flow" gauge (0..100), the combo counter, peak/best
// trackers, silence decay, and noise penalties. The legacy code spread
// these mutations across several branches of the render loop ("good onset"
// vs "active play" vs "silence" vs "noise"); this module collects them
// into a single reducer over discrete event types so the shell only has
// to translate audio/MIDI signals to events and feed them in.
//
// Pure reducer pattern: `applyFlowEvent(state, event, opts)` mutates
// `state` in place and returns nothing. No globals, no ctx, no DOM, no
// CONFIG dep — every tunable arrives via `opts`.

export interface FlowState {
  /** Current flow gauge value, 0..100. */
  flow: number;
  /** Current combo count (consecutive good notes within the window). */
  combo: number;
  /** Highest combo reached this session — monotonic. */
  bestCombo: number;
  /** Highest flow reached this session — monotonic. */
  peakFlow: number;
  /** Wall-clock ms of the last good onset / MIDI note. 0 = never. */
  lastGoodNoteTimeMs: number;
  /** Wall-clock ms when silence began. `-1` = not currently silent. */
  lastSilenceStartMs: number;
  /** Wall-clock ms of the last noise penalty (for cooldown). */
  lastNoisePenaltyMs: number;
  /** Fractional combo-decay carried across ticks so the per-second drop rate
   *  stays framerate-independent (combo is integer; without an accumulator,
   *  Math.ceil(rate × dtSec) rounds up every frame and the effective rate
   *  scales with refresh rate — was 144/sec on 144 Hz vs 60/sec on 60 Hz). */
  comboDecayAccum: number;
}

export interface FlowMeterOptions {
  /** Max gap (ms) between good onsets that still counts toward combo. */
  comboWindowMs: number;
  /** Silence after which `idleTick` starts soft-decaying flow. */
  silenceDecayStartMs: number;
  /** Silence after which `idleTick` switches to hard decay (also drops combo). */
  silenceHardDecayMs: number;
  /** Soft flow decay rate (units per second) during the soft band. */
  flowDecaySoft: number;
  /** Hard flow decay rate (units per second) during the hard band. */
  flowDecayHard: number;
  /** Combo decay rate during hard silence, scaled as "drops per frame at
   *  60fps" for legacy parity (so e.g. rate=0.1 = 6 drops/sec). The reducer
   *  multiplies by `60 × dtSec` and accumulates fractional remainders into
   *  `state.comboDecayAccum` so the actual per-second rate is the same on
   *  60 Hz, 90 Hz, 120 Hz, and 144 Hz displays. */
  comboDecayRate: number;
  /** Flow penalty charged on a noise firing, as a RATE times that one frame's
   *  `dtSec` — so with the shipped 3 u/s and a 300 ms cooldown it removes about
   *  0.05 flow per firing, i.e. almost nothing. That is the long-standing
   *  behaviour and it is kept on purpose: the noise that trips this is usually
   *  someone TALKING, and a gauge that drains while a child is spoken to reads
   *  as a scold. The combo penalty below is the part that actually bites. */
  flowNoisePenalty: number;
  /** Flat combo drop on each noise penalty firing. */
  comboNoisePenalty: number;
  /** Min ms between noise penalties (rate-limit so a noisy room doesn't
   *  zero the meter in one frame). */
  noisePenaltyCooldownMs: number;
  /** Base flow gain rate during active play (units/second). */
  flowGainBase: number;
  /** Extra gain at max combo (combo-factor caps at combo/50). */
  flowGainComboMax: number;
  /** Extra gain at max pitch stability. */
  flowGainStabilityMax: number;
  /** Extra gain at max quality score. */
  flowGainQualityMax: number;
  /** Multiplier applied when sessionState !== 'performing' (default 1.5). */
  flowGainNonPerformingMultiplier: number;
  /** Base flow added by a single MIDI note. */
  midiBaseFlowGain: number;
  /** Per-(velocity/127) flow added by a MIDI note. */
  midiVelocityFlowGain: number;
}

/** Discriminated union of flow-meter input events. */
export type FlowEvent =
  | { type: 'goodOnset'; timeMs: number; isPerformingOrWarmup: boolean }
  | { type: 'midiNote'; timeMs: number; velocity: number }
  /** Sound is still going but nothing new was struck (a held key, the pedal).
   *  Stops the silence clock without adding gain — the gain belongs to the
   *  press. Without this, a player holding a long chord would be decayed as if
   *  they had walked away. */
  | { type: 'sustainTick'; timeMs: number }
  | {
      type: 'activeTick';
      timeMs: number;
      dtSec: number;
      isPerforming: boolean;
      pitchStability: number;
      qualityScore: number;
    }
  | { type: 'idleTick'; timeMs: number; dtSec: number }
  | { type: 'noiseTick'; timeMs: number; dtSec: number };

/** Build a fresh flow state — every counter at zero, no recorded silence. */
export function initFlowState(): FlowState {
  return {
    flow: 0,
    combo: 0,
    bestCombo: 0,
    peakFlow: 0,
    lastGoodNoteTimeMs: 0,
    lastSilenceStartMs: -1,
    lastNoisePenaltyMs: 0,
    comboDecayAccum: 0,
  };
}

/** Reset all counters in place. Equivalent to `initFlowState()` but mutating. */
export function resetFlowState(state: FlowState): void {
  state.flow = 0;
  state.combo = 0;
  state.bestCombo = 0;
  state.peakFlow = 0;
  state.lastGoodNoteTimeMs = 0;
  state.lastSilenceStartMs = -1;
  state.lastNoisePenaltyMs = 0;
  state.comboDecayAccum = 0;
}

/** One more note in the combo — or, after a gap longer than the window, a
 *  softened restart that keeps 60 % (a phrase break is not a mistake). */
function advanceCombo(state: FlowState, timeMs: number, opts: FlowMeterOptions): void {
  if (state.lastGoodNoteTimeMs > 0 && timeMs - state.lastGoodNoteTimeMs < opts.comboWindowMs) {
    state.combo++;
  } else {
    state.combo = Math.max(1, Math.floor(state.combo * 0.6));
  }
  if (state.combo > state.bestCombo) state.bestCombo = state.combo;
}

/** Bookkeeping every struck note shares: it ends any silence, and the idle
 *  combo decay starts again from zero rather than from a leftover fraction. */
function noteStruck(state: FlowState, timeMs: number): void {
  state.lastGoodNoteTimeMs = timeMs;
  state.lastSilenceStartMs = -1;
  state.comboDecayAccum = 0;
}

/**
 * Apply one input event to the flow state. Mutates `state` in place.
 *
 * Event semantics:
 * - `goodOnset` — increment combo if within window (else `Math.max(1, floor(combo×0.6))`).
 *   Cancels silence. Updates `lastGoodNoteTimeMs`.
 * - `midiNote` — adds `base + (velocity/127) × velMax` to flow; combo follows
 *   the SAME window rule as `goodOnset`. Cancels silence.
 * - `sustainTick` — cancels silence, nothing else.
 * - `activeTick` — adds the composite (base + combo + stability + quality) flow
 *   gain × dtSec; multiplied by `flowGainNonPerformingMultiplier` when not yet
 *   in performing mode. Cancels silence.
 * - `idleTick` — opens silence if not already; soft-decays flow after
 *   `silenceDecayStartMs`; hard-decays flow + combo after `silenceHardDecayMs`.
 * - `noiseTick` — when cooldown has elapsed, applies flow + flat combo penalty
 *   and resets cooldown. Does not cancel or extend silence.
 */
export function applyFlowEvent(state: FlowState, event: FlowEvent, opts: FlowMeterOptions): void {
  switch (event.type) {
    case 'goodOnset': {
      if (event.isPerformingOrWarmup) advanceCombo(state, event.timeMs, opts);
      noteStruck(state, event.timeMs);
      return;
    }

    case 'midiNote': {
      const v = Math.max(0, Math.min(127, event.velocity)) / 127;
      state.flow = Math.min(
        100,
        state.flow + opts.midiBaseFlowGain + v * opts.midiVelocityFlowGain
      );
      if (state.flow > state.peakFlow) state.peakFlow = state.flow;
      // The same window rule as the mic. This used to be an unconditional
      // `combo += 1`, which is why the MIDI handler grew its own copy of the
      // combo logic — with a DIFFERENT reset (back to 1, where the mic keeps
      // 60 %). Two inputs, two meanings of the same number.
      advanceCombo(state, event.timeMs, opts);
      noteStruck(state, event.timeMs);
      return;
    }

    case 'sustainTick': {
      state.lastSilenceStartMs = -1;
      return;
    }

    case 'activeTick': {
      state.lastSilenceStartMs = -1;
      const comboFactor = Math.min(state.combo / 50, 1);
      let flowGain =
        (opts.flowGainBase +
          comboFactor * opts.flowGainComboMax +
          event.pitchStability * opts.flowGainStabilityMax +
          event.qualityScore * opts.flowGainQualityMax) *
        event.dtSec;
      if (!event.isPerforming) flowGain *= opts.flowGainNonPerformingMultiplier;
      state.flow = Math.min(100, state.flow + flowGain);
      if (state.flow > state.peakFlow) state.peakFlow = state.flow;
      return;
    }

    case 'idleTick': {
      if (state.lastSilenceStartMs < 0) state.lastSilenceStartMs = event.timeMs;
      const silenceDuration = event.timeMs - state.lastSilenceStartMs;
      if (silenceDuration > opts.silenceDecayStartMs) {
        state.flow = Math.max(0, state.flow - opts.flowDecaySoft * event.dtSec);
        if (silenceDuration > opts.silenceHardDecayMs) {
          state.flow = Math.max(0, state.flow - opts.flowDecayHard * event.dtSec);
          state.comboDecayAccum += opts.comboDecayRate * 60 * event.dtSec;
          if (state.comboDecayAccum >= 1) {
            const drops = Math.floor(state.comboDecayAccum);
            state.combo = Math.max(0, state.combo - drops);
            state.comboDecayAccum -= drops;
          }
        }
      }
      return;
    }

    case 'noiseTick': {
      if (event.timeMs - state.lastNoisePenaltyMs > opts.noisePenaltyCooldownMs) {
        state.flow = Math.max(0, state.flow - opts.flowNoisePenalty * event.dtSec);
        state.combo = Math.max(0, state.combo - opts.comboNoisePenalty);
        state.lastNoisePenaltyMs = event.timeMs;
      }
      return;
    }
  }
}
