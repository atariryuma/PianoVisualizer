// Quality history — the per-onset ring buffers that feed quality.ts:
//   * `noteOnsetTimes` — wall-clock ms timestamps; capped at IOI_HISTORY_SIZE+1
//     so the most recent IOI can always be computed against its prev.
//   * `ioiHistory` — debounce-passing inter-onset intervals (ms), bounded.
//   * `amplitudeHistory` — normalized 0..1 amplitudes (mic RMS or MIDI
//     velocity/127), one push per onset event regardless of debounce.
//
// Two upstream paths feed this in legacy app.js — the mic onset detector
// (80ms debounce) and the MIDI note-on handler (30ms debounce). They were
// near-duplicates of the same buffer-maintenance logic; centralizing here
// removes the copy-paste drift risk.
//
// Pure: no globals, no DOM. The reducer mutates the supplied state in-place
// to match the caller's existing imperative-array idiom (legacy app.js
// holds these arrays on a long-lived state singleton and consumes them
// directly via ArrayLike from quality.ts) — no reallocation churn per
// onset on hot paths.

export interface QualityHistoryState {
  /** Wall-clock ms of recorded onset events (debounce-passing). */
  noteOnsetTimes: number[];
  /** Inter-onset intervals (ms) within [minIoiMs, maxIoiMs]. */
  ioiHistory: number[];
  /** Normalized 0..1 amplitudes — one entry per onset event. */
  amplitudeHistory: number[];
}

export interface QualityHistoryOptions {
  /** Min ms gap between onsets to count the new one as separate. */
  debounceMs: number;
  /** Inclusive lower bound for an IOI to be recorded — anything tighter is
   *  treated as a same-event echo even after debounce passes. Legacy: 100. */
  minIoiMs: number;
  /** Exclusive upper bound — anything looser is treated as a fresh start
   *  (long pause), no IOI recorded. Legacy: 5000. */
  maxIoiMs: number;
  /** Cap for `ioiHistory`. `noteOnsetTimes` is sized one larger so the
   *  next IOI can always reference its prev. Legacy: 16. */
  ioiHistorySize: number;
  /** Cap for `amplitudeHistory`. Legacy: 30. */
  amplitudeHistorySize: number;
}

export interface OnsetPushResult {
  /** True when the timestamp passed the debounce and went into
   *  `noteOnsetTimes`. False ⇒ the call was a same-event echo and only
   *  amplitudeHistory got a new entry. */
  recorded: boolean;
  /** The IOI (ms) added to `ioiHistory` this call, or null if no IOI was
   *  produced (first onset / debounced-out / outside [minIoiMs, maxIoiMs]). */
  ioi: number | null;
}

/** Build a fresh state — every buffer empty. */
export function initQualityHistoryState(): QualityHistoryState {
  return {
    noteOnsetTimes: [],
    ioiHistory: [],
    amplitudeHistory: [],
  };
}

/** Empty all three buffers in place. Called between sessions / on song
 *  change so the next session starts with a clean rhythm/dynamics radar. */
export function resetQualityHistoryState(state: QualityHistoryState): void {
  state.noteOnsetTimes.length = 0;
  state.ioiHistory.length = 0;
  state.amplitudeHistory.length = 0;
}

/**
 * Apply one onset event. Always pushes `amplitude` to amplitudeHistory
 * (one entry per onset). The timestamp is pushed (and any resulting IOI
 * recorded) only when `timeMs` is at least `opts.debounceMs` past the most
 * recent recorded onset.
 *
 * Returns a `{ recorded, ioi }` summary the caller can branch on for
 * telemetry / coaching display.
 */
export function applyOnsetToHistory(
  state: QualityHistoryState,
  timeMs: number,
  amplitude: number,
  opts: QualityHistoryOptions
): OnsetPushResult {
  // Amplitude is always pushed — both legacy paths did this unconditionally
  // on a fresh onset event regardless of the debounce decision.
  state.amplitudeHistory.push(amplitude);
  if (state.amplitudeHistory.length > opts.amplitudeHistorySize) {
    state.amplitudeHistory.shift();
  }

  const onsets = state.noteOnsetTimes;
  const lastOnset = onsets.length > 0 ? onsets[onsets.length - 1] : 0;
  if (timeMs - lastOnset <= opts.debounceMs) {
    // Same-event echo — don't add to onset/IOI history. Caller can still
    // infer "an event happened" from the (recorded:false) result if needed.
    return { recorded: false, ioi: null };
  }

  onsets.push(timeMs);
  // noteOnsetTimes carries one extra slot vs ioiHistory so the next IOI
  // computation can always reference the prior onset.
  if (onsets.length > opts.ioiHistorySize + 1) {
    onsets.shift();
  }

  let ioi: number | null = null;
  if (onsets.length >= 2) {
    const candidate = timeMs - onsets[onsets.length - 2];
    if (candidate >= opts.minIoiMs && candidate < opts.maxIoiMs) {
      state.ioiHistory.push(candidate);
      if (state.ioiHistory.length > opts.ioiHistorySize) {
        state.ioiHistory.shift();
      }
      ioi = candidate;
    }
  }

  return { recorded: true, ioi };
}
