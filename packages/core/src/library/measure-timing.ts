// Per-measure timing in wall-clock seconds, derived from the XML
// `ScoreTiming` produced by `parseScoreTimingFromXml`. The audio
// scheduler uses this to:
//
//   * place the count-in beep relative to bar 1's first note,
//   * map a "user is at measure i, beat q" cursor position back to
//     a Tone.Transport time,
//   * keep the lane's falling-note timing aligned with the OSMD
//     cursor across measures with mid-bar tempo changes.
//
// Pure: no DOM, no globals. The legacy shell handed this to OSMD's
// extractor, which preferred these XML-derived values over OSMD's own
// `length.realValue` walk because OSMD's tempo bookkeeping ignores
// `<metronome beat-unit>` (see score-timing.ts header for the bug).

import type { ScoreTiming } from './score-timing';

export interface MeasureTimingResult {
  /** Wall-clock seconds from score start at which each measure begins.
   *  `startSec[0] === 0` always; `startSec[i+1] === startSec[i] + durSec[i]`. */
  startSec: number[];
  /** Duration of each measure in seconds, accounting for any mid-bar
   *  tempo changes within `tempoEvents`. */
  durSec: number[];
}

/**
 * Compute (start, duration) seconds for each measure from XML score
 * timing data. Returns `null` when `scoreTiming` is null (caller falls
 * back to OSMD's `TempoInBPM` walk).
 *
 * Per-measure algorithm:
 *
 *   * The "current tempo at measure start" carries forward from the
 *     previous measure (or `leadingQuarterBpm` for measure 0).
 *   * Within a measure, walk `tempoEvents` in document order: each
 *     event closes a segment at `inBarDiv` and opens the next at the
 *     event's `qBpm`. The tempo carried forward to the next measure
 *     is the LAST segment's bpm.
 *   * Effective bar duration is `actualDiv` when the bar has explicit
 *     content, else `durationDiv` (silent bars don't collapse to 0).
 *
 * The "actualDiv" honoring matters for partial-measure exporters. A
 * MuseScore export of La Campanella's m=5 has 8/12 sixteenths followed
 * by no trailing rest: actualDiv=480, durationDiv=720. Without this
 * honoring, m=6 would land 240 ticks later in our XML clock than OSMD
 * visits it, producing a phantom-gap mistiming in the lane.
 */
export function buildMeasureTimingFromXml(
  scoreTiming: ScoreTiming | null
): MeasureTimingResult | null {
  if (!scoreTiming) return null;
  const measures = scoreTiming.measures;
  const startSec = new Array<number>(measures.length).fill(0);
  const durSec = new Array<number>(measures.length).fill(0);

  let curQBpm = scoreTiming.leadingQuarterBpm;
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    const usedDiv = m.actualDiv > 0 ? m.actualDiv : m.durationDiv;

    let acc = 0;
    let prevDiv = 0;
    let segBpm = curQBpm;
    for (const ev of m.tempoEvents) {
      const segDiv = Math.max(0, ev.inBarDiv - prevDiv);
      if (segDiv > 0) {
        const segQuarters = segDiv / m.divisions;
        acc += (segQuarters * 60) / segBpm;
      }
      segBpm = ev.qBpm;
      prevDiv = ev.inBarDiv;
    }
    const tailDiv = Math.max(0, usedDiv - prevDiv);
    if (tailDiv > 0) {
      const tailQuarters = tailDiv / m.divisions;
      acc += (tailQuarters * 60) / segBpm;
    }

    durSec[i] = acc;
    if (i + 1 < measures.length) startSec[i + 1] = startSec[i] + acc;
    curQBpm = segBpm;
  }

  return { startSec, durSec };
}
