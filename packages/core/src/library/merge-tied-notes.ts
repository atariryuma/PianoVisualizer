// Tied-note coalescer — collapses MusicXML <tied type="start">…
// <tied type="stop"> chains into a single sustained event so the
// learner doesn't have to re-strike a held pitch.
//
// Operates in place on an array sorted by `timeSec`. The first note in
// each chain absorbs the chain's total duration (timeSec stays put,
// durSec extends to cover the tail), and continuation entries are
// removed by compaction.
//
// Pure: no globals, no DOM. The legacy shell injects `collectSamples`
// when the load-time DIAG dump is active (REMOTE_LOG_ENABLED) so the
// production path doesn't pay for the per-merge `toFixed` + push.

/** Note shape consumed by the merger. The legacy shell carries wider
 *  records (hit / missed / etc.); we only depend on the fields used
 *  during coalescing. */
export interface TiedNote {
  midi: number;
  hand: string;
  /** Onset time (seconds, score-relative). The merger expects `notes`
   *  to be sorted by this field. */
  timeSec: number;
  /** Sustained duration (seconds). The first note in each chain has
   *  this field extended to cover the chain. */
  durSec: number;
  /** Source measure index — pass-through, used only for diagnostic
   *  samples when `collectSamples` is set. */
  measureIdx?: number;
  /** True when MusicXML flagged this note `<tied type="start">`. */
  tieStart?: boolean;
  /** True when MusicXML flagged this note `<tied type="stop">`. */
  tieEnd?: boolean;
}

/** Per-merge telemetry record. Useful only for the load-time DIAG dump
 *  during development; production callers should leave `collectSamples`
 *  off. */
export interface MergeTiedSample {
  midi: number;
  hand: string;
  /** Tied chain's onset, rounded to 3 decimal places. */
  t0: number;
  /** Number of notes in the chain (≥ 2 — one tieStart + ≥ 1 tieEnd). */
  chain: number;
  /** Original `durSec` of the chain head. */
  durBefore: number;
  /** Extended `durSec` after coalescing. */
  durAfter: number;
  /** `measureIdx` of the chain head. */
  m?: number;
}

export interface MergeTiedOptions {
  /** Collect up to 5 per-merge samples for diagnostics. Default false. */
  collectSamples?: boolean;
  /** Reject tied chains whose tieEnd lands more than this many seconds
   *  past the tieStart — a runaway-search guard for malformed scores.
   *  Legacy default: 30. */
  maxChainGapSec?: number;
}

export interface MergeTiedResult {
  /** Number of continuation entries removed (chain length − 1 per merge). */
  merged: number;
  /** Per-merge samples (empty when `collectSamples` is false). */
  samples: MergeTiedSample[];
}

/**
 * Coalesce tied note chains in place. Matching notes (same midi, same
 * hand, in time order) are collapsed into the chain head; intermediate
 * `<tied stop>` entries are removed by compaction (the input array's
 * `length` is shortened, no reallocation).
 *
 * Returns `{ merged, samples }` for caller diagnostics.
 */
export function mergeTiedNotes<N extends TiedNote>(
  notes: N[],
  opts: MergeTiedOptions = {}
): MergeTiedResult {
  const collectSamples = opts.collectSamples ?? false;
  const maxChainGapSec = opts.maxChainGapSec ?? 30;

  if (!notes || notes.length < 2) {
    return { merged: 0, samples: [] };
  }

  const removeMask = new Array<boolean>(notes.length).fill(false);
  const samples: MergeTiedSample[] = [];
  let mergedCount = 0;

  for (let i = 0; i < notes.length; i++) {
    const a = notes[i];
    if (!a.tieStart || removeMask[i]) continue;

    // Walk forward looking for the matching tieEnd of the same midi/hand.
    let endIdx = -1;
    for (let j = i + 1; j < notes.length; j++) {
      if (removeMask[j]) continue;
      const b = notes[j];
      if (b.timeSec - a.timeSec > maxChainGapSec) break;
      if (b.tieEnd && b.midi === a.midi && b.hand === a.hand) {
        endIdx = j;
        // If b is also a tieStart (mid-chain), keep going to find the
        // chain's true terminator.
        if (!b.tieStart) break;
      }
    }

    if (endIdx > i) {
      const tail = notes[endIdx];
      const oldDur = a.durSec;
      a.durSec = Math.max(a.durSec, tail.timeSec + tail.durSec - a.timeSec);

      let chainLen = 1;
      for (let j = i + 1; j <= endIdx; j++) {
        const b = notes[j];
        if (b.tieEnd && b.midi === a.midi && b.hand === a.hand) {
          removeMask[j] = true;
          chainLen++;
        }
      }
      mergedCount += chainLen - 1;

      if (collectSamples && samples.length < 5) {
        samples.push({
          midi: a.midi,
          hand: a.hand,
          t0: +a.timeSec.toFixed(3),
          chain: chainLen,
          durBefore: +oldDur.toFixed(3),
          durAfter: +a.durSec.toFixed(3),
          m: a.measureIdx,
        });
      }
    }
  }

  if (removeMask.some(Boolean)) {
    let w = 0;
    for (let r = 0; r < notes.length; r++) {
      if (!removeMask[r]) notes[w++] = notes[r];
    }
    notes.length = w;
  }

  return { merged: mergedCount, samples };
}
