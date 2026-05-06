// MusicXML playback-order parser + note re-timer.
//
// OSMD's public API doesn't surface <repeat> / <ending> / D.C. / D.S. /
// Coda / Fine markers (still true in 1.9.9), so we read them ourselves
// and walk the score's measure list to produce the linear playback
// order — the sequence of measure indices in the order they should
// sound.
//
// Then `expandNotesByPlaybackOrder` re-times a per-measure note list
// to follow that order, producing a flat monotonic timeline ready for
// the audio scheduler / lane renderer / cursor sync.
//
// Pure module — same DOMParser-injectable pattern as
// musicxml-meta.ts / score-timing.ts. Caller (legacy shell) handles
// the fetch + xml-text caching; this module just parses + re-times.

/** A minimal DOMParser-like — typed structurally so node-side
 *  callers can inject linkedom without TS complaining. */
type DOMParserLike = { parseFromString(text: string, type: string): Document };

export interface PlaybackOrderOptions {
  /** Inject a DOMParser implementation (e.g. linkedom in node tests).
   *  Defaults to `globalThis.DOMParser`. */
  parser?: DOMParserLike;
}

/** Per-measure structural marker bag — what the parser collected from
 *  the XML for one measure before walking the iterator. Exported so
 *  Phase 0c modules can build their own tests / fixtures around the
 *  shape without re-deriving it. */
export interface MeasureMarkers {
  startsEnding: Record<string, boolean>;
  stopsEnding: Record<string, boolean>;
  fwdRepeat: boolean;
  bwdRepeat: boolean;
  dacapo: boolean;
  fine: boolean;
  tocoda: boolean;
  coda: boolean;
  segno: boolean;
  dalsegno: boolean;
}

/** A note record consumed by `expandNotesByPlaybackOrder`. The legacy
 *  shell's note shape is wider (carries `tieStart` / `hit` / etc.); we
 *  only depend on the timing-relevant fields here so consumers with
 *  richer notes pass through cleanly via TypeScript's structural
 *  subtyping. */
export interface PlaybackOrderNote {
  midi: number;
  hand: 'L' | 'R';
  /** Onset in seconds at the score's authored tempo, relative to score start. */
  timeSec: number;
  /** Duration in seconds at the authored tempo. */
  durSec: number;
  measureIdx: number;
  inBarQuarters: number;
}

/** Output note for the expanded timeline. Adds `cursorJump` flagging
 *  the first note after a non-sequential measure transition. */
export interface ExpandedNote extends PlaybackOrderNote {
  /** When this note is the first after a back-jump or forward-skip,
   *  carries the new measure index so the cursor walker knows to
   *  re-anchor. Null on sequential transitions. */
  cursorJump: number | null;
}

/** Source measure timing — both arrays parallel to the score's
 *  measure list. The audio scheduler computes these via
 *  `buildMeasureTimingFromXml`. */
export interface SourceMeasureTiming {
  startSec: ReadonlyArray<number>;
  durSec: ReadonlyArray<number>;
}

/**
 * Parse the playback order from raw MusicXML text. Returns a flat
 * array of measure indices — `[0, 1, 2, ...]` for a linear score, but
 * with back-jumps + 2nd-ending skips for `|: ... :|`, `1. / 2.` voltas,
 * D.C. al Fine, D.S. al Coda, etc.
 *
 * Returns an empty array when the XML has no `<part>` elements (caller
 * should fall back to a linear `0..N-1` order).
 *
 * Algorithm walks the measure list with a safety counter so a degenerate
 * jump configuration can't infinite-loop.
 */
export function parsePlaybackOrderFromXml(
  xmlText: string,
  opts: PlaybackOrderOptions = {}
): number[] {
  const ParserCtor = opts.parser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
  if (!ParserCtor) throw new Error('DOMParser not available; pass opts.parser');
  const parser: DOMParserLike =
    'parseFromString' in ParserCtor
      ? (ParserCtor as DOMParserLike)
      : new (ParserCtor as { new (): DOMParserLike })();
  const dom = parser.parseFromString(xmlText, 'text/xml');
  const partEls = dom.querySelectorAll('part');
  if (!partEls.length) return [];
  const measureEls = partEls[0].querySelectorAll('measure');

  const info: MeasureMarkers[] = [];
  measureEls.forEach((m) => {
    const startsEnding: Record<string, boolean> = {};
    const stopsEnding: Record<string, boolean> = {};
    for (const e of Array.from(m.querySelectorAll('ending'))) {
      const num = e.getAttribute('number');
      const type = e.getAttribute('type');
      if (num == null) continue;
      if (type === 'start') startsEnding[num] = true;
      if (type === 'stop' || type === 'discontinue') stopsEnding[num] = true;
    }
    let fwdRepeat = false;
    let bwdRepeat = false;
    for (const r of Array.from(m.querySelectorAll('barline repeat'))) {
      const dir = r.getAttribute('direction');
      if (dir === 'forward') fwdRepeat = true;
      if (dir === 'backward') bwdRepeat = true;
    }
    // D.C. / D.S. / Coda / Fine markers. MusicXML places these on
    // <direction><sound dacapo|dalsegno|tocoda|coda|segno|fine="..."/>;
    // some engravers omit the <sound> and use <words> only, so check
    // both. Jumps fire at most once each so safety can't loop.
    let dacapo = false;
    let fine = false;
    let tocoda = false;
    let coda = false;
    let segno = false;
    let dalsegno = false;
    for (const s of Array.from(m.querySelectorAll('direction sound'))) {
      if (s.getAttribute('dacapo') === 'yes') dacapo = true;
      if (s.getAttribute('fine') === 'yes') fine = true;
      if (s.getAttribute('tocoda')) tocoda = true;
      if (s.getAttribute('coda')) coda = true;
      if (s.getAttribute('segno')) segno = true;
      if (s.getAttribute('dalsegno')) dalsegno = true;
    }
    for (const w of Array.from(m.querySelectorAll('direction words'))) {
      const text = (w.textContent || '').trim();
      if (/^D\.?C\./i.test(text) || /Da\s*Capo/i.test(text)) dacapo = true;
      if (/^Fine\b/i.test(text)) fine = true;
      if (/^To\s*Coda/i.test(text)) tocoda = true;
      if (/^D\.?S\./i.test(text) || /Dal\s*Segno/i.test(text)) dalsegno = true;
    }
    info.push({
      startsEnding,
      stopsEnding,
      fwdRepeat,
      bwdRepeat,
      dacapo,
      fine,
      tocoda,
      coda,
      segno,
      dalsegno,
    });
  });

  // Pre-scan for segno / coda landing positions (used by D.S. and
  // To Coda jumps). First occurrence wins — multi-segno scores are
  // rare and we'd need name matching for those.
  let segnoIdx = -1;
  let codaIdx = -1;
  for (let k = 0; k < info.length; k++) {
    if (info[k].segno && segnoIdx < 0) segnoIdx = k;
    if (info[k].coda && codaIdx < 0) codaIdx = k;
  }

  const order: number[] = [];
  const repeatTaken = new Set<number>();
  let i = 0;
  let repeatStartIdx = 0;
  let dcFired = false;
  let dsFired = false;
  let safety = 0;
  while (i < info.length && safety < info.length * 8) {
    safety++;
    const m = info[i];
    // Skip 1st-ending volta on the second pass: jump forward to 2nd / 3rd
    // ending or out of the volta block.
    if (m.startsEnding['1'] && repeatTaken.has(repeatStartIdx)) {
      let j = i + 1;
      while (j < info.length && !info[j].startsEnding['2'] && !info[j].startsEnding['3']) {
        j++;
      }
      i = j;
      continue;
    }
    if (m.fwdRepeat) repeatStartIdx = i;
    order.push(i);
    // Fine — only stops the piece on the post-D.C./D.S. pass.
    if ((dcFired || dsFired) && m.fine) break;
    // To Coda — only on the post-D.C./D.S. pass.
    if ((dcFired || dsFired) && m.tocoda && codaIdx >= 0) {
      i = codaIdx;
      continue;
    }
    if (m.bwdRepeat && !repeatTaken.has(repeatStartIdx)) {
      repeatTaken.add(repeatStartIdx);
      i = repeatStartIdx;
      continue;
    }
    if (m.dacapo && !dcFired) {
      dcFired = true;
      repeatTaken.clear();
      repeatStartIdx = 0;
      i = 0;
      continue;
    }
    if (m.dalsegno && !dsFired && segnoIdx >= 0) {
      dsFired = true;
      repeatTaken.clear();
      repeatStartIdx = segnoIdx;
      i = segnoIdx;
      continue;
    }
    i++;
  }
  return order;
}

/**
 * Re-time a per-measure note list following the playback order. Returns
 * a flat array sorted by time, with `cursorJump` annotated on the first
 * note of each non-sequential measure transition (back-jumps, forward-
 * skips, D.C./D.S. landings).
 *
 * Both `timing.startSec` and `timing.durSec` are required and must be
 * parallel to the score's measure list. The legacy shell's
 * OSMD-shaped fallback (reading `m.TempoInBPM` / `m.Duration.realValue`)
 * is intentionally NOT pulled into core — that's an OSMD-coupling the
 * caller can handle before delegating here.
 */
export function expandNotesByPlaybackOrder<N extends PlaybackOrderNote>(
  baseNotes: ReadonlyArray<N>,
  order: ReadonlyArray<number>,
  timing: SourceMeasureTiming
): ExpandedNote[] {
  const byMeasure = new Map<number, N[]>();
  for (const n of baseNotes) {
    let arr = byMeasure.get(n.measureIdx);
    if (!arr) {
      arr = [];
      byMeasure.set(n.measureIdx, arr);
    }
    arr.push(n);
  }

  const expanded: ExpandedNote[] = [];
  let cumTime = 0;
  let prevMIdx = -1;
  for (const mIdx of order) {
    const measureNotes = byMeasure.get(mIdx) ?? [];
    const mStart = timing.startSec[mIdx] ?? 0;
    const isJump = prevMIdx >= 0 && mIdx !== prevMIdx + 1;
    for (let j = 0; j < measureNotes.length; j++) {
      const n = measureNotes[j];
      expanded.push({
        midi: n.midi,
        hand: n.hand,
        timeSec: cumTime + (n.timeSec - mStart),
        durSec: n.durSec,
        measureIdx: mIdx,
        inBarQuarters: n.inBarQuarters,
        cursorJump: j === 0 && isJump ? mIdx : null,
      });
    }
    cumTime += timing.durSec[mIdx] ?? 0.5;
    prevMIdx = mIdx;
  }
  expanded.sort((a, b) => a.timeSec - b.timeSec || a.midi - b.midi);
  return expanded;
}
