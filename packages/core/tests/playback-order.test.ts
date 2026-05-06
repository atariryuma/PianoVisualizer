import { beforeAll, describe, expect, it } from 'vitest';
import {
  expandNotesByPlaybackOrder,
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
