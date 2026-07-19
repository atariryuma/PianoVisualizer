import { beforeAll, describe, expect, it } from 'vitest';
import {
  expandNotesByPlaybackOrder,
  expandedMeasureStartSec,
  parsePlaybackOrderFromXml,
  type PlaybackOrderNote,
  type SourceMeasureTiming,
} from '../src/library/playback-order';

let parser: { parseFromString(text: string, type: string): Document };

beforeAll(async () => {
  const ld = await import('linkedom');
  const ldParser = new ld.DOMParser();
  parser = {
    parseFromString(text: string, type: string) {
      return ldParser.parseFromString(text, type as 'text/xml') as unknown as Document;
    },
  };
});

const HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">`;
const FOOTER = `</part>
</score-partwise>`;

interface MeasureSpec {
  fwdRepeat?: boolean;
  bwdRepeat?: boolean;
  ending?: { num: string; type: 'start' | 'stop' | 'discontinue' }[];
  dacapo?: boolean;
  dalsegno?: boolean;
  fine?: boolean;
  tocoda?: boolean;
  coda?: boolean;
  segno?: boolean;
  /** Plain text in <direction><words>…</words> for marker fallbacks. */
  words?: string;
}

function makeMeasure(num: number, spec: MeasureSpec = {}): string {
  const barlines: string[] = [];
  if (spec.fwdRepeat) {
    barlines.push(`<barline location="left"><repeat direction="forward"/></barline>`);
  }
  if (spec.bwdRepeat) {
    barlines.push(`<barline location="right"><repeat direction="backward"/></barline>`);
  }
  if (spec.ending) {
    for (const e of spec.ending) {
      barlines.push(`<barline><ending number="${e.num}" type="${e.type}"/></barline>`);
    }
  }
  const sounds: string[] = [];
  if (spec.dacapo) sounds.push('<sound dacapo="yes"/>');
  if (spec.dalsegno) sounds.push('<sound dalsegno="x"/>');
  if (spec.fine) sounds.push('<sound fine="yes"/>');
  if (spec.tocoda) sounds.push('<sound tocoda="x"/>');
  if (spec.coda) sounds.push('<sound coda="x"/>');
  if (spec.segno) sounds.push('<sound segno="x"/>');
  const directions = sounds.map((s) => `<direction>${s}</direction>`).join('');
  const wordsXml = spec.words
    ? `<direction><direction-type><words>${spec.words}</words></direction-type></direction>`
    : '';
  return `<measure number="${num}">${barlines.join('')}${directions}${wordsXml}</measure>`;
}

function buildScore(measures: MeasureSpec[]): string {
  const ms = measures.map((m, i) => makeMeasure(i + 1, m)).join('\n');
  return HEADER + ms + FOOTER;
}

describe('parsePlaybackOrderFromXml — basics', () => {
  it('returns empty array when there is no <part>', () => {
    const xml = '<?xml version="1.0"?><score-partwise/>';
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([]);
  });

  it('linear score with no markers passes through 0..N-1', () => {
    const xml = buildScore([{}, {}, {}, {}]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 2, 3]);
  });
});

describe('parsePlaybackOrderFromXml — simple repeat', () => {
  it('|: m1 m2 :| repeats once → 0, 1, 0, 1', () => {
    const xml = buildScore([{ fwdRepeat: true }, { bwdRepeat: true }]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 0, 1]);
  });

  it('|: m1 m2 :| m3 → 0, 1, 0, 1, 2', () => {
    const xml = buildScore([{ fwdRepeat: true }, { bwdRepeat: true }, {}]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 0, 1, 2]);
  });

  it('implicit forward repeat at start (no |: marker) still works', () => {
    // Backward-only repeat with no forward marker → forward-repeat point
    // is implicit measure 0 (the score start).
    const xml = buildScore([{}, { bwdRepeat: true }, {}]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 0, 1, 2]);
  });
});

describe('parsePlaybackOrderFromXml — voltas (1st / 2nd ending)', () => {
  it('|: m1 [1.] m2 :| [2.] m3 → 0, 1, 0, 2', () => {
    const xml = buildScore([
      { fwdRepeat: true },
      {
        ending: [{ num: '1', type: 'start' }],
        bwdRepeat: true,
      },
      { ending: [{ num: '2', type: 'start' }] },
    ]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 0, 2]);
  });

  it('multi-bar voltas: |: m1 m2 [1.] m3 m4 :| [2.] m5 → 0,1,2,3,0,1,4', () => {
    const xml = buildScore([
      { fwdRepeat: true },
      {},
      { ending: [{ num: '1', type: 'start' }] },
      { bwdRepeat: true },
      { ending: [{ num: '2', type: 'start' }] },
    ]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 2, 3, 0, 1, 4]);
  });

  it('comma-shared ending: |: m1 [1,2. m2] :| m3 plays the ending on both passes', () => {
    // number="1,2" は1つの括弧を1周目・2周目で共有する正規の MusicXML。
    // カンマを番号ごとに正規化していれば両周とも括弧を鳴らして 0,1,0,1,2 になる。
    const xml = buildScore([
      { fwdRepeat: true },
      { ending: [{ num: '1,2', type: 'start' }], bwdRepeat: true },
      {},
    ]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 0, 1, 2]);
  });

  it('whitespace in ending number="1, 2" is trimmed and behaves like "1,2"', () => {
    const xml = buildScore([
      { fwdRepeat: true },
      { ending: [{ num: '1, 2', type: 'start' }], bwdRepeat: true },
      {},
    ]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 0, 1, 2]);
  });

  it('comma-shared ending WITH a stop marker plays on both passes (regression)', () => {
    // |: m0  [1,2. m1 … m2 .stop] :| m3
    // A multi-bar shared ending carries a stop marker on m2. The 2nd-pass
    // 1st-ending skip must NOT fire for a shared ending (only pure "1"),
    // or it would jump past the ending's second pass, dropping m1/m2.
    const xml = buildScore([
      { fwdRepeat: true },
      { ending: [{ num: '1,2', type: 'start' }] },
      { ending: [{ num: '1,2', type: 'stop' }], bwdRepeat: true },
      {},
    ]);
    // Both passes play the shared ending: 0,1,2, back to 0, 1,2, then 3.
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 2, 0, 1, 2, 3]);
  });

  it('comma-shared 2nd ending: |: m1 [1.] :| [2,3. m3] m4 does not truncate', () => {
    // 2周目の再開点(2番括弧)が number="2,3" で書かれても、正規化後は '2'/'3' が
    // 立つので探索が成立し、以降の小節が脱落しない。旧実装は '2'/'3' 完全一致に
    // 失敗して 0,1,0 で切れていた。
    const xml = buildScore([
      { fwdRepeat: true },
      { ending: [{ num: '1', type: 'start' }], bwdRepeat: true },
      { ending: [{ num: '2,3', type: 'start' }] },
      {},
    ]);
    const r = parsePlaybackOrderFromXml(xml, { parser });
    expect(r).toEqual([0, 1, 0, 2, 3]);
    expect(r).toContain(3);
  });

  it('no matching 2nd bracket: |: m1 [1.] :| m3 m4 keeps the trailing measures', () => {
    // 明示的な2番括弧が無い譜面。探索が末尾まで走ってもフォールバックで素通しし、
    // 以降の小節(2,3)を落とさない。旧実装は 0,1,0 で末尾が消えていた。
    const xml = buildScore([
      { fwdRepeat: true },
      { ending: [{ num: '1', type: 'start' }], bwdRepeat: true },
      {},
      {},
    ]);
    const r = parsePlaybackOrderFromXml(xml, { parser });
    expect(r).toContain(2);
    expect(r).toContain(3);
    expect(r).toEqual([0, 1, 0, 1, 2, 3]);
  });
});

describe('parsePlaybackOrderFromXml — D.C. al Fine', () => {
  it('m1 m2 m3 D.C. → 0, 1, 2, 0, 1, 2 (no Fine, plays through)', () => {
    const xml = buildScore([{}, {}, { dacapo: true }]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('m1 [Fine] m2 m3 D.C. → 0, 1, 2, 0 (stops at Fine on second pass)', () => {
    const xml = buildScore([{ fine: true }, {}, { dacapo: true }]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 2, 0]);
  });

  it('D.C. via <words>Da Capo</words> fallback also works', () => {
    const xml = buildScore([{ fine: true }, {}, { words: 'D.C. al Fine' }]);
    expect(parsePlaybackOrderFromXml(xml, { parser })).toEqual([0, 1, 2, 0]);
  });
});

describe('parsePlaybackOrderFromXml — D.S. al Coda', () => {
  it('m1 [Segno] m2 [ToCoda] m3 D.S. m4 [Coda] m5 → walks Segno + skips to Coda', () => {
    const xml = buildScore([
      {},
      { segno: true },
      { tocoda: true },
      { dalsegno: true },
      { coda: true },
      {},
    ]);
    // 0,1,2,3 → D.S. → 1,2 (tocoda fires post-DS) → 4,5
    const r = parsePlaybackOrderFromXml(xml, { parser });
    expect(r).toEqual([0, 1, 2, 3, 1, 2, 4, 5]);
  });

  it('element-only <segno/> / <coda/> landings still fire the D.S. al Coda jump', () => {
    // 着地点を <sound segno|coda> 属性ではなく <direction-type><segno/> /
    // <coda/> の記号要素だけで書く譜面。旧実装は属性しか見ず segnoIdx/codaIdx が
    // 立たないためジャンプが不発だった。
    const raw =
      HEADER +
      `<measure number="1"></measure>` +
      `<measure number="2"><direction><direction-type><segno/></direction-type></direction></measure>` +
      `<measure number="3"><direction><sound tocoda="x"/></direction></measure>` +
      `<measure number="4"><direction><sound dalsegno="x"/></direction></measure>` +
      `<measure number="5"><direction><direction-type><coda/></direction-type></direction></measure>` +
      `<measure number="6"></measure>` +
      FOOTER;
    const r = parsePlaybackOrderFromXml(raw, { parser });
    expect(r).toEqual([0, 1, 2, 3, 1, 2, 4, 5]);
  });

  it('measure-level <sound> (no <direction> wrapper) is honored — D.C. al Fine', () => {
    // score-timing.ts が対応済みの measure 直下 <sound> を playback-order でも読む。
    const raw =
      HEADER +
      `<measure number="1"><sound fine="yes"/></measure>` +
      `<measure number="2"></measure>` +
      `<measure number="3"><sound dacapo="yes"/></measure>` +
      FOOTER;
    const r = parsePlaybackOrderFromXml(raw, { parser });
    expect(r).toEqual([0, 1, 2, 0]);
  });
});

describe('parsePlaybackOrderFromXml — safety', () => {
  it('would-be-infinite back-jump terminates via the safety counter', () => {
    // A backward repeat that always retakes (dcFired never fires) wouldn't
    // truly loop because repeatTaken blocks the second re-take, but verify
    // a degenerate D.C. + D.S. interleave doesn't hang.
    const xml = buildScore([{ segno: true }, { dalsegno: true }, { dacapo: true }]);
    const r = parsePlaybackOrderFromXml(xml, { parser });
    // Must terminate (test runs synchronously); content is best-effort.
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(100);
  });
});

describe('expandNotesByPlaybackOrder — linear', () => {
  it('no jumps → notes pass through with cursorJump=null', () => {
    const notes: PlaybackOrderNote[] = [
      { midi: 60, hand: 'L', timeSec: 0, durSec: 0.5, measureIdx: 0, inBarQuarters: 0 },
      { midi: 62, hand: 'R', timeSec: 1, durSec: 0.5, measureIdx: 1, inBarQuarters: 0 },
      { midi: 64, hand: 'R', timeSec: 2, durSec: 0.5, measureIdx: 2, inBarQuarters: 0 },
    ];
    const timing: SourceMeasureTiming = { startSec: [0, 1, 2], durSec: [1, 1, 1] };
    const r = expandNotesByPlaybackOrder(notes, [0, 1, 2], timing);
    expect(r).toHaveLength(3);
    expect(r.every((n) => n.cursorJump === null)).toBe(true);
    expect(r.map((n) => n.timeSec)).toEqual([0, 1, 2]);
  });
});

describe('expandNotesByPlaybackOrder — repeats', () => {
  it('repeat re-times notes with cumulative cumTime', () => {
    const notes: PlaybackOrderNote[] = [
      { midi: 60, hand: 'L', timeSec: 0, durSec: 0.5, measureIdx: 0, inBarQuarters: 0 },
      { midi: 62, hand: 'R', timeSec: 1, durSec: 0.5, measureIdx: 1, inBarQuarters: 0 },
    ];
    const timing: SourceMeasureTiming = { startSec: [0, 1], durSec: [1, 1] };
    // Order 0,1,0,1 (a |: ... :| repeat).
    const r = expandNotesByPlaybackOrder(notes, [0, 1, 0, 1], timing);
    expect(r).toHaveLength(4);
    expect(r.map((n) => n.timeSec)).toEqual([0, 1, 2, 3]);
    expect(r.map((n) => n.midi)).toEqual([60, 62, 60, 62]);
  });

  it('annotates cursorJump on the first note of a back-jump', () => {
    const notes: PlaybackOrderNote[] = [
      { midi: 60, hand: 'L', timeSec: 0, durSec: 0.5, measureIdx: 0, inBarQuarters: 0 },
      { midi: 62, hand: 'R', timeSec: 1, durSec: 0.5, measureIdx: 1, inBarQuarters: 0 },
    ];
    const timing: SourceMeasureTiming = { startSec: [0, 1], durSec: [1, 1] };
    const r = expandNotesByPlaybackOrder(notes, [0, 1, 0, 1], timing);
    // Notes 0,1 (linear) → cursorJump null; the 0 after 1 is a back-jump.
    expect(r[0].cursorJump).toBeNull();
    expect(r[1].cursorJump).toBeNull();
    expect(r[2].cursorJump).toBe(0); // back to measure 0
    expect(r[3].cursorJump).toBeNull(); // 1 follows 0 sequentially again
  });
});

describe('expandNotesByPlaybackOrder — skip (volta)', () => {
  it('order with a forward-skip flags the skipped-into note as a jump', () => {
    const notes: PlaybackOrderNote[] = [
      { midi: 60, hand: 'L', timeSec: 0, durSec: 0.5, measureIdx: 0, inBarQuarters: 0 },
      { midi: 62, hand: 'R', timeSec: 1, durSec: 0.5, measureIdx: 1, inBarQuarters: 0 },
      { midi: 64, hand: 'R', timeSec: 2, durSec: 0.5, measureIdx: 2, inBarQuarters: 0 },
    ];
    const timing: SourceMeasureTiming = { startSec: [0, 1, 2], durSec: [1, 1, 1] };
    // 1st-ending volta skip: 0, 1 (m1) is the volta1; 2nd pass skips to m3 (idx 2).
    // Order: 0, 1, 0, 2. The 2 after 0 is a forward-skip.
    const r = expandNotesByPlaybackOrder(notes, [0, 1, 0, 2], timing);
    expect(r[2].cursorJump).toBe(0); // back-jump to m1
    expect(r[3].cursorJump).toBe(2); // forward-skip to m3
  });
});

describe('expandedMeasureStartSec — section boundaries on the expanded clock', () => {
  it('linear order → equals the source starts', () => {
    const timing: SourceMeasureTiming = { startSec: [0, 1, 2, 3], durSec: [1, 1, 1, 1] };
    expect(expandedMeasureStartSec([0, 1, 2, 3], timing)).toEqual([0, 1, 2, 3]);
  });

  it('repeat pushes later measures out to their FIRST occurrence', () => {
    // Measures 0..3 with 0..1 repeated: order = 0,1,0,1,2,3.
    // Expanded timeline: m0@0, m1@1, m0@2, m1@3, m2@4, m3@5.
    // First occurrences: m0=0, m1=1, m2=4, m3=5.
    const timing: SourceMeasureTiming = { startSec: [0, 1, 2, 3], durSec: [1, 1, 1, 1] };
    const table = expandedMeasureStartSec([0, 1, 0, 1, 2, 3], timing);
    expect(table).toEqual([0, 1, 4, 5]);
    // A section starting at source measure 2 now lands at 4s (after both
    // passes of 0..1), not the source-clock 2s — so it no longer inherits
    // the tail of the repeated block.
  });

  it('shares the cumulative walk with expandNotesByPlaybackOrder', () => {
    const timing: SourceMeasureTiming = { startSec: [0, 1, 2], durSec: [1, 1, 1] };
    const order = [0, 1, 0, 1, 2];
    const table = expandedMeasureStartSec(order, timing);
    // The note in measure 2 sits at cumTime for m2's first occurrence.
    const notes: PlaybackOrderNote[] = [
      { midi: 60, hand: 'R', timeSec: 2, durSec: 0.5, measureIdx: 2, inBarQuarters: 0 },
    ];
    const expanded = expandNotesByPlaybackOrder(notes, order, timing);
    expect(expanded[0].timeSec).toBe(table[2]); // 4s
  });

  it('unvisited measures inherit the nearest prior visited value', () => {
    const timing: SourceMeasureTiming = { startSec: [0, 1, 2], durSec: [1, 1, 1] };
    // Order never visits measure 2.
    const table = expandedMeasureStartSec([0, 1], timing);
    expect(table[0]).toBe(0);
    expect(table[1]).toBe(1);
    expect(table[2]).toBe(1); // inherits m1
  });
});

describe('expandNotesByPlaybackOrder — chord stability', () => {
  it('within the same time slot, output is sorted by midi (chord stability)', () => {
    const notes: PlaybackOrderNote[] = [
      // Three notes of a C-major triad, all at the same timeSec.
      { midi: 67, hand: 'R', timeSec: 0, durSec: 0.5, measureIdx: 0, inBarQuarters: 0 },
      { midi: 60, hand: 'L', timeSec: 0, durSec: 0.5, measureIdx: 0, inBarQuarters: 0 },
      { midi: 64, hand: 'R', timeSec: 0, durSec: 0.5, measureIdx: 0, inBarQuarters: 0 },
    ];
    const timing: SourceMeasureTiming = { startSec: [0], durSec: [1] };
    const r = expandNotesByPlaybackOrder(notes, [0], timing);
    expect(r.map((n) => n.midi)).toEqual([60, 64, 67]);
  });
});
