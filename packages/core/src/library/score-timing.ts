// MusicXML score-timing parser — extracts everything that affects
// playback timing from raw MusicXML text:
//
//   * per-measure quarter-note BPM, normalized through <metronome
//     beat-unit> (so eighth=120 correctly resolves to quarter=60),
//   * time signature inheritance across measures,
//   * divisions inheritance,
//   * implicit (anacrusis) flag,
//   * mid-measure tempo events with their in-bar-division offset,
//   * the `actualDiv` content length — the maximum forward extent
//     reached by any voice in document order, which differs from
//     `durationDiv` when an exporter writes a partial measure
//     (e.g. La Campanella's m=5 with multiple <backup>/voices).
//
// We re-parse the XML ourselves rather than relying on OSMD's
// `TempoInBPM` because OSMD does NOT normalize <metronome beat-unit>
// (verified in OSMD 1.9.x ExpressionReader.ts — it stores raw `pm`
// regardless of the beat unit). The shell uses this output to drive
// the audio scheduler and to position the count-in beep correctly.
//
// Pure module — same DOMParser-injectable pattern as musicxml-meta:
// node tests inject linkedom; the browser uses globalThis.DOMParser.

export interface TempoEvent {
  /** Position of the tempo change inside the measure, in DIVISIONS
   *  units. 0 means "from the start of the bar". */
  inBarDiv: number;
  /** Quarter-note BPM in effect from this event onward. */
  qBpm: number;
  /** Human-readable source description for diagnostics — e.g.
   *  "metronome quarter=120" or "sound tempo=72". May include
   *  " [snapped to bar start]" if the bar-boundary heuristic fired. */
  src: string;
}

export interface MeasureTiming {
  /** Tempo events in document order; the first event applies from
   *  `inBarDiv` onward. The carried-in tempo from the prior measure
   *  governs everything before the first event (or the entire bar
   *  if `tempoEvents` is empty). */
  tempoEvents: TempoEvent[];
  /** Time signature in effect for this measure (numerator / denominator). */
  timeSig: { beats: number; beatType: number };
  /** Divisions per quarter-note. */
  divisions: number;
  /** True for `implicit="yes"` measures (anacrusis / pickup). */
  implicit: boolean;
  /** Nominal bar duration in divisions: beats × divisions × 4 / beatType. */
  durationDiv: number;
  /** Maximum forward extent reached by any voice in this measure,
   *  in divisions. Differs from `durationDiv` when the exporter wrote
   *  a partial measure or used multi-voice with <backup>. */
  actualDiv: number;
}

export interface ScoreTiming {
  measures: MeasureTiming[];
  /** Quarter-note BPM the score starts at. Falls back to 72 when no
   *  metronome / sound tempo marking is found. */
  leadingQuarterBpm: number;
  /** Diagnostic source of `leadingQuarterBpm` — e.g.
   *  "metronome quarter=120" or "default (no marking)". */
  leadingSource: string;
}

/** A minimal DOMParser-like object — typed structurally so node-side
 *  callers can inject linkedom without TS complaining about the
 *  Document return shape. */
type DOMParserLike = { parseFromString(text: string, type: string): Document };

export interface ScoreTimingOptions {
  /** Inject a DOMParser implementation (e.g. linkedom in node tests).
   *  Defaults to a fresh `globalThis.DOMParser` instance. */
  parser?: DOMParserLike;
}

/** beat-unit name → fraction-of-quarter-note. eighth = 0.5 means
 *  eighth=120 is a quarter=60 tempo. */
const BEAT_UNIT_Q: Record<string, number> = {
  long: 16,
  breve: 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 0.0625,
  '128th': 0.03125,
  '256th': 0.015625,
};

const dotMul = (d: number): number => (d === 1 ? 1.5 : d === 2 ? 1.75 : d === 3 ? 1.875 : 1);

/** Find the first direct child with the given lower-cased tag name. Avoids
 *  `:scope > X` selectors — linkedom parses them but doesn't always honor
 *  the scope boundary, which would let a deeply-nested `<duration>` match
 *  what should be a per-measure direct child. Browser DOM is fine; we
 *  iterate manually to keep node tests + browser behavior identical. */
const childByTag = (parent: Element, tag: string): Element | null => {
  for (const c of Array.from(parent.children)) {
    if (c.tagName.toLowerCase() === tag) return c;
  }
  return null;
};

const metronomeToQBpm = (met: Element): { qBpm: number; src: string } | null => {
  const buEl = met.querySelector('beat-unit');
  const bu = (buEl?.textContent || 'quarter').trim();
  const pmEl = met.querySelector('per-minute');
  const pm = parseFloat(pmEl?.textContent || '');
  if (!Number.isFinite(pm) || pm <= 0) return null;
  const dotted = met.querySelectorAll('beat-unit-dot').length;
  const factor = (BEAT_UNIT_Q[bu] ?? 1) * dotMul(dotted);
  return {
    qBpm: pm * factor,
    src: 'metronome ' + bu + (dotted ? '·'.repeat(dotted) : '') + '=' + pm,
  };
};

/**
 * Parse score timing from raw MusicXML text. Returns null when the XML
 * has no `<part>` elements (caller falls back to OSMD's `TempoInBPM`).
 *
 * @param xmlText raw MusicXML text (already unzipped from `.mxl`).
 * @param opts pass `parser` to inject a DOMParser-like (linkedom for tests).
 */
export function parseScoreTimingFromXml(
  xmlText: string,
  opts: ScoreTimingOptions = {}
): ScoreTiming | null {
  try {
    const ParserCtor = opts.parser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
    if (!ParserCtor) throw new Error('DOMParser not available; pass opts.parser');
    const parser: DOMParserLike =
      'parseFromString' in ParserCtor
        ? (ParserCtor as DOMParserLike)
        : new (ParserCtor as { new (): DOMParserLike })();
    const dom = parser.parseFromString(xmlText, 'text/xml');
    const partEls = dom.querySelectorAll('part');
    if (!partEls.length) return null;
    const measureEls = partEls[0].querySelectorAll('measure');

    const out: MeasureTiming[] = [];
    let curDivisions = 1;
    let curBeats = 4;
    let curBeatType = 4;
    let leadingQuarterBpm: number | null = null;
    let leadingSource: string | null = null;

    measureEls.forEach((m) => {
      const implicit = m.getAttribute('implicit') === 'yes';
      const tempoEvents: TempoEvent[] = [];
      let inBarDiv = 0;
      let maxExtent = 0;

      for (const ch of Array.from(m.children)) {
        const name = ch.tagName.toLowerCase();
        if (name === 'attributes') {
          const div = childByTag(ch, 'divisions');
          if (div) {
            const v = parseInt(div.textContent ?? '', 10);
            if (Number.isFinite(v) && v > 0) curDivisions = v;
          }
          const tm = childByTag(ch, 'time');
          if (tm) {
            const b = parseInt(childByTag(tm, 'beats')?.textContent ?? '', 10);
            const bt = parseInt(childByTag(tm, 'beat-type')?.textContent ?? '', 10);
            if (Number.isFinite(b) && b > 0) curBeats = b;
            if (Number.isFinite(bt) && bt > 0) curBeatType = bt;
          }
        } else if (name === 'direction') {
          const met = ch.querySelector('direction-type metronome');
          if (met) {
            const r = metronomeToQBpm(met);
            if (r) {
              tempoEvents.push({ inBarDiv, qBpm: r.qBpm, src: r.src });
              if (leadingQuarterBpm == null) {
                leadingQuarterBpm = r.qBpm;
                leadingSource = r.src;
              }
            }
          } else {
            const sn = childByTag(ch, 'sound');
            if (sn?.hasAttribute('tempo')) {
              const tempoVal = parseFloat(sn.getAttribute('tempo') ?? '');
              if (Number.isFinite(tempoVal) && tempoVal > 0) {
                tempoEvents.push({
                  inBarDiv,
                  qBpm: tempoVal,
                  src: 'sound tempo=' + tempoVal,
                });
                if (leadingQuarterBpm == null) {
                  leadingQuarterBpm = tempoVal;
                  leadingSource = 'sound tempo=' + tempoVal;
                }
              }
            }
          }
        } else if (name === 'sound') {
          // Score-level <sound> outside <direction>.
          const tempoVal = parseFloat(ch.getAttribute('tempo') ?? '');
          if (Number.isFinite(tempoVal) && tempoVal > 0) {
            tempoEvents.push({
              inBarDiv,
              qBpm: tempoVal,
              src: 'sound tempo=' + tempoVal,
            });
            if (leadingQuarterBpm == null) {
              leadingQuarterBpm = tempoVal;
              leadingSource = 'sound tempo=' + tempoVal;
            }
          }
        } else if (name === 'note') {
          const isGrace = childByTag(ch, 'grace') != null;
          const isChord = childByTag(ch, 'chord') != null;
          if (!isGrace && !isChord) {
            const dEl = childByTag(ch, 'duration');
            if (dEl) {
              const dv = parseInt(dEl.textContent ?? '', 10);
              if (Number.isFinite(dv) && dv > 0) {
                inBarDiv += dv;
                if (inBarDiv > maxExtent) maxExtent = inBarDiv;
              }
            }
          }
        } else if (name === 'backup') {
          const dEl = childByTag(ch, 'duration');
          if (dEl) {
            const dv = parseInt(dEl.textContent ?? '', 10);
            if (Number.isFinite(dv) && dv > 0) inBarDiv -= dv;
          }
        } else if (name === 'forward') {
          const dEl = childByTag(ch, 'duration');
          if (dEl) {
            const dv = parseInt(dEl.textContent ?? '', 10);
            if (Number.isFinite(dv) && dv > 0) {
              inBarDiv += dv;
              if (inBarDiv > maxExtent) maxExtent = inBarDiv;
            }
          }
        }
      }

      const durationDiv = Math.round((curBeats * curDivisions * 4) / curBeatType);
      out.push({
        tempoEvents,
        timeSig: { beats: curBeats, beatType: curBeatType },
        divisions: curDivisions,
        implicit,
        durationDiv,
        actualDiv: maxExtent,
      });
    });

    if (leadingQuarterBpm == null) {
      leadingQuarterBpm = 72;
      leadingSource = 'default (no marking)';
    }

    // Tempo-direction snap to measure boundary. MusicXML exporters often
    // place tempo <direction> elements in document order, landing them
    // AFTER one or more notes of the measure they're meant to govern.
    // Reader's intent: "this whole measure plays at the new tempo."
    // Strict-position playback: "first N notes still use the old tempo,
    // then it changes mid-bar." La Campanella m=5 is the canonical case
    // — the ♪=194 metronome lives at inBarDiv=120 (after the 3rd 16th),
    // so the first two pickup sixteenths play at the carried-in 94 and
    // notes 3+ snap to 97. Heuristic: a measure's FIRST tempo event
    // sitting in the early half (< durationDiv/2) and differing from
    // the carried-in BPM is promoted to inBarDiv=0. Mid-bar ritardandos
    // (subsequent events) keep their actual position.
    let carriedQBpm: number = leadingQuarterBpm;
    for (const meas of out) {
      const ev0 = meas.tempoEvents[0];
      if (
        ev0 &&
        ev0.inBarDiv > 0 &&
        ev0.inBarDiv < meas.durationDiv / 2 &&
        Math.abs(ev0.qBpm - carriedQBpm) > 0.01
      ) {
        ev0.inBarDiv = 0;
        ev0.src = (ev0.src || '') + ' [snapped to bar start]';
      }
      for (const ev of meas.tempoEvents) carriedQBpm = ev.qBpm;
    }

    return {
      measures: out,
      leadingQuarterBpm: leadingQuarterBpm as number,
      leadingSource: leadingSource as string,
    };
  } catch {
    // Production: return null and let the caller fall back to OSMD's
    // TempoInBPM. The legacy logged via console.warn — preserve that
    // hint for browser dev tools.
    if (typeof console !== 'undefined') {
      console.warn('[parseScoreTimingFromXml] failed');
    }
    return null;
  }
}

/**
 * Per-measure leading quarter-BPM — the tempo carried INTO each
 * measure (before any of that measure's own tempo events fire).
 * measureBpms[0] is always `scoreTiming.leadingQuarterBpm`; subsequent
 * entries are the LAST segBpm from the previous measure.
 *
 * The note extractor uses this as a carry-in tempo when walking
 * intra-measure positions via `timeAtInBarQuarters` — that helper
 * needs the measure-start tempo separately from any mid-bar events.
 */
export function computeLeadingMeasureBpms(scoreTiming: ScoreTiming): number[] {
  const bpms = new Array<number>(scoreTiming.measures.length).fill(0);
  let cur = scoreTiming.leadingQuarterBpm;
  for (let i = 0; i < scoreTiming.measures.length; i++) {
    bpms[i] = cur;
    for (const ev of scoreTiming.measures[i].tempoEvents) cur = ev.qBpm;
  }
  return bpms;
}

/**
 * Given a position within a measure (in quarter-note units) and the
 * tempo carried into that measure, walk the measure's tempo events to
 * find both the elapsed seconds from bar-start and the local quarter-
 * BPM at that position.
 *
 * Used by the note extractor to time notes precisely across mid-bar
 * tempo changes — a note at inBarQuarters=2.5 in a bar with a tempo
 * jump at inBarQuarters=1 needs the SECOND segment's bpm, not the
 * carried-in one.
 */
export function timeAtInBarQuarters(
  measure: MeasureTiming,
  leadingMeasureBpm: number,
  inBarQuarters: number
): { offsetSec: number; localQBpm: number } {
  const inBarDiv = inBarQuarters * measure.divisions;
  let segBpm = leadingMeasureBpm;
  let prevDiv = 0;
  let acc = 0;
  for (const ev of measure.tempoEvents) {
    if (ev.inBarDiv > inBarDiv) break;
    const segDiv = Math.max(0, ev.inBarDiv - prevDiv);
    if (segDiv > 0) acc += ((segDiv / measure.divisions) * 60) / segBpm;
    segBpm = ev.qBpm;
    prevDiv = ev.inBarDiv;
  }
  const tailDiv = Math.max(0, inBarDiv - prevDiv);
  if (tailDiv > 0) acc += ((tailDiv / measure.divisions) * 60) / segBpm;
  return { offsetSec: acc, localQBpm: segBpm };
}
