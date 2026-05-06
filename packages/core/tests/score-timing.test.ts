import { beforeAll, describe, expect, it } from 'vitest';
import {
  computeLeadingMeasureBpms,
  parseScoreTimingFromXml,
  timeAtInBarQuarters,
} from '../src/library/score-timing';
import type { MeasureTiming } from '../src/library/score-timing';

let parser: { parseFromString(text: string, type: string): Document };

beforeAll(async () => {
  // Use linkedom's DOMParser with text/xml so self-closing tags
  // (<sound tempo="..."/>) parse as siblings instead of getting nested
  // by HTML5's permissive open-tag handling.
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

/** Build a measure with explicit divisions, optional time, optional tempo,
 *  and a list of note durations (in DIVISIONS units). */
function makeMeasure(opts: {
  num: number;
  divisions?: number;
  time?: { beats: number; beatType: number };
  metronome?: { beatUnit: string; perMinute: number; dots?: number };
  soundTempo?: number;
  notes?: number[];
  implicit?: boolean;
  // Tempo placed BETWEEN notes — used to test the bar-boundary snap.
  midBarTempo?: { afterNote: number; perMinute: number; beatUnit?: string };
}) {
  const attrParts: string[] = [];
  if (opts.divisions != null) attrParts.push(`<divisions>${opts.divisions}</divisions>`);
  if (opts.time) {
    attrParts.push(
      `<time><beats>${opts.time.beats}</beats><beat-type>${opts.time.beatType}</beat-type></time>`
    );
  }
  const attrs = attrParts.length ? `<attributes>${attrParts.join('')}</attributes>` : '';

  const tempoXml = opts.metronome
    ? `<direction><direction-type><metronome>` +
      `<beat-unit>${opts.metronome.beatUnit}</beat-unit>` +
      (opts.metronome.dots ? '<beat-unit-dot/>'.repeat(opts.metronome.dots) : '') +
      `<per-minute>${opts.metronome.perMinute}</per-minute>` +
      `</metronome></direction-type></direction>`
    : opts.soundTempo
      ? `<direction><direction-type/><sound tempo="${opts.soundTempo}"/></direction>`
      : '';

  const noteItems = (opts.notes ?? []).map(
    (d) => `<note><pitch><step>C</step><octave>4</octave></pitch><duration>${d}</duration></note>`
  );
  let body = tempoXml + noteItems.join('');
  if (opts.midBarTempo) {
    const items: string[] = [];
    for (let i = 0; i < (opts.notes?.length ?? 0); i++) {
      items.push(
        `<note><pitch><step>C</step><octave>4</octave></pitch><duration>${opts.notes![i]}</duration></note>`
      );
      if (i + 1 === opts.midBarTempo.afterNote) {
        items.push(
          `<direction><direction-type><metronome>` +
            `<beat-unit>${opts.midBarTempo.beatUnit ?? 'quarter'}</beat-unit>` +
            `<per-minute>${opts.midBarTempo.perMinute}</per-minute>` +
            `</metronome></direction-type></direction>`
        );
      }
    }
    body = tempoXml + items.join('');
  }

  const implicit = opts.implicit ? ' implicit="yes"' : '';
  return `<measure number="${opts.num}"${implicit}>${attrs}${body}</measure>`;
}

function buildScore(measures: string[]): string {
  return HEADER + measures.join('\n') + FOOTER;
}

describe('parseScoreTimingFromXml — basics', () => {
  it('returns null when there is no <part>', () => {
    const xml = `<?xml version="1.0"?><score-partwise/>`;
    expect(parseScoreTimingFromXml(xml, { parser })).toBeNull();
  });

  it('default leading tempo is 72 when score has no markings', () => {
    const xml = buildScore([
      makeMeasure({ num: 1, divisions: 4, time: { beats: 4, beatType: 4 }, notes: [4, 4, 4, 4] }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.leadingQuarterBpm).toBe(72);
    expect(r.leadingSource).toBe('default (no marking)');
  });

  it('extracts leading tempo from <sound tempo>', () => {
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        soundTempo: 96,
        notes: [4, 4, 4, 4],
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.leadingQuarterBpm).toBe(96);
    expect(r.leadingSource).toBe('sound tempo=96');
  });
});

describe('parseScoreTimingFromXml — metronome beat-unit normalization', () => {
  it('normalizes <metronome beat-unit="eighth" per-minute="120"> to quarter=60', () => {
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        metronome: { beatUnit: 'eighth', perMinute: 120 },
        notes: [4, 4, 4, 4],
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    // eighth=120 → quarter=60
    expect(r.leadingQuarterBpm).toBe(60);
    expect(r.leadingSource).toMatch(/^metronome eighth=120/);
  });

  it('normalizes <metronome beat-unit="half" per-minute="60"> to quarter=120', () => {
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        metronome: { beatUnit: 'half', perMinute: 60 },
        notes: [4, 4, 4, 4],
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.leadingQuarterBpm).toBe(120);
  });

  it('handles dotted beat-unit (dotted-quarter = 90 → quarter = 135)', () => {
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        metronome: { beatUnit: 'quarter', perMinute: 90, dots: 1 },
        notes: [4, 4, 4, 4],
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.leadingQuarterBpm).toBeCloseTo(135, 5);
  });
});

describe('parseScoreTimingFromXml — measure shape', () => {
  it('produces one MeasureTiming per <measure>', () => {
    const xml = buildScore([
      makeMeasure({ num: 1, divisions: 4, time: { beats: 4, beatType: 4 }, notes: [16] }),
      makeMeasure({ num: 2, notes: [16] }),
      makeMeasure({ num: 3, notes: [16] }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.measures).toHaveLength(3);
  });

  it('inherits divisions and time signature across measures', () => {
    const xml = buildScore([
      makeMeasure({ num: 1, divisions: 8, time: { beats: 3, beatType: 4 }, notes: [24] }),
      makeMeasure({ num: 2, notes: [24] }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.measures[0].divisions).toBe(8);
    expect(r.measures[0].timeSig).toEqual({ beats: 3, beatType: 4 });
    expect(r.measures[1].divisions).toBe(8);
    expect(r.measures[1].timeSig).toEqual({ beats: 3, beatType: 4 });
  });

  it('computes durationDiv = beats × divisions × 4 / beatType', () => {
    const xml = buildScore([
      // 6/8 with divisions=8 → 6 × 8 × 4 / 8 = 24
      makeMeasure({ num: 1, divisions: 8, time: { beats: 6, beatType: 8 }, notes: [24] }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.measures[0].durationDiv).toBe(24);
  });

  it('records implicit=true for anacrusis measures', () => {
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        implicit: true,
        notes: [4],
      }),
      makeMeasure({ num: 2, notes: [16] }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.measures[0].implicit).toBe(true);
    expect(r.measures[1].implicit).toBe(false);
  });

  it('actualDiv equals the sum of note durations in a single-voice bar', () => {
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        notes: [4, 4, 4, 4],
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.measures[0].actualDiv).toBe(16);
  });

  it('actualDiv of an empty measure falls to 0', () => {
    const xml = buildScore([
      makeMeasure({ num: 1, divisions: 4, time: { beats: 4, beatType: 4 }, notes: [] }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    expect(r.measures[0].actualDiv).toBe(0);
  });
});

describe('parseScoreTimingFromXml — bar-boundary tempo snap', () => {
  it('promotes a first-half tempo direction to inBarDiv=0', () => {
    // m=1 establishes 60 bpm, m=2 has a tempo direction AFTER note 1
    // (inBarDiv=4 in a 16-div bar = early half) at 90 bpm → should snap.
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        metronome: { beatUnit: 'quarter', perMinute: 60 },
        notes: [4, 4, 4, 4],
      }),
      makeMeasure({
        num: 2,
        notes: [4, 4, 4, 4],
        midBarTempo: { afterNote: 1, perMinute: 90 },
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    const ev = r.measures[1].tempoEvents[0];
    expect(ev.inBarDiv).toBe(0);
    expect(ev.qBpm).toBe(90);
    expect(ev.src).toMatch(/snapped to bar start/);
  });

  it('does NOT snap a tempo event in the second half (mid-bar ritardando)', () => {
    // m=2: tempo direction after note 3 (inBarDiv=12 in a 16-div bar = late half).
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        metronome: { beatUnit: 'quarter', perMinute: 60 },
        notes: [4, 4, 4, 4],
      }),
      makeMeasure({
        num: 2,
        notes: [4, 4, 4, 4],
        midBarTempo: { afterNote: 3, perMinute: 30 },
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    const ev = r.measures[1].tempoEvents[0];
    expect(ev.inBarDiv).toBe(12);
    expect(ev.src).not.toMatch(/snapped/);
  });

  it('does NOT snap when the new BPM matches the carried-in BPM', () => {
    // Same tempo restated mid-bar — no snap.
    const xml = buildScore([
      makeMeasure({
        num: 1,
        divisions: 4,
        time: { beats: 4, beatType: 4 },
        metronome: { beatUnit: 'quarter', perMinute: 90 },
        notes: [4, 4, 4, 4],
      }),
      makeMeasure({
        num: 2,
        notes: [4, 4, 4, 4],
        midBarTempo: { afterNote: 1, perMinute: 90 },
      }),
    ]);
    const r = parseScoreTimingFromXml(xml, { parser })!;
    const ev = r.measures[1].tempoEvents[0];
    expect(ev.inBarDiv).toBe(4); // unchanged
  });
});

describe('parseScoreTimingFromXml — robustness', () => {
  it('returns null on completely unparseable input (no part-list)', () => {
    expect(parseScoreTimingFromXml('not xml at all', { parser })).toBeNull();
  });
});

const meas = (over: Partial<MeasureTiming> = {}): MeasureTiming => ({
  tempoEvents: [],
  timeSig: { beats: 4, beatType: 4 },
  divisions: 4,
  implicit: false,
  durationDiv: 16,
  actualDiv: 16,
  ...over,
});

describe('computeLeadingMeasureBpms', () => {
  it('all bars at the leading bpm when there are no tempo events', () => {
    const r = computeLeadingMeasureBpms({
      measures: [meas(), meas(), meas()],
      leadingQuarterBpm: 60,
      leadingSource: 'test',
    });
    expect(r).toEqual([60, 60, 60]);
  });

  it('a tempo event in measure 0 carries forward to measure 1', () => {
    const r = computeLeadingMeasureBpms({
      measures: [meas({ tempoEvents: [{ inBarDiv: 8, qBpm: 120, src: 't' }] }), meas(), meas()],
      leadingQuarterBpm: 60,
      leadingSource: 'test',
    });
    // Bar 0 carries in 60; bar 1 picks up 120 from bar 0's last segment.
    expect(r).toEqual([60, 120, 120]);
  });

  it("bar 0's leading bpm is always scoreTiming.leadingQuarterBpm", () => {
    // Even with an inBarDiv=0 tempo event in measure 0, the leading
    // quarter-bpm should still be reported as the carry-in (matches
    // what the legacy walker produces).
    const r = computeLeadingMeasureBpms({
      measures: [meas({ tempoEvents: [{ inBarDiv: 0, qBpm: 200, src: 't' }] })],
      leadingQuarterBpm: 72,
      leadingSource: 'test',
    });
    expect(r[0]).toBe(72);
  });
});

describe('timeAtInBarQuarters', () => {
  it('constant tempo: offsetSec = inBarQuarters * 60 / bpm', () => {
    const r = timeAtInBarQuarters(meas(), 60, 2);
    expect(r.offsetSec).toBeCloseTo(2, 6);
    expect(r.localQBpm).toBe(60);
  });

  it('mid-bar tempo change shifts both offsetSec and localQBpm', () => {
    // Bar with event at inBarDiv=8 (= inBarQuarters=2) changing 60→120.
    // For inBarQuarters=3 (inBarDiv=12):
    //   first 8 div (= 2 quarters) at 60 = 2 sec
    //   next 4 div (= 1 quarter) at 120 = 0.5 sec
    //   total = 2.5 sec, local bpm = 120
    const r = timeAtInBarQuarters(
      meas({ tempoEvents: [{ inBarDiv: 8, qBpm: 120, src: 't' }] }),
      60,
      3
    );
    expect(r.offsetSec).toBeCloseTo(2.5, 6);
    expect(r.localQBpm).toBe(120);
  });

  it('inBarQuarters=0 returns 0 sec at the carried-in bpm', () => {
    const r = timeAtInBarQuarters(
      meas({ tempoEvents: [{ inBarDiv: 4, qBpm: 200, src: 't' }] }),
      60,
      0
    );
    expect(r.offsetSec).toBe(0);
    expect(r.localQBpm).toBe(60); // still at the carry-in (event hasn't fired)
  });

  it('event at inBarDiv=0 immediately overrides the carried-in bpm', () => {
    const r = timeAtInBarQuarters(
      meas({ tempoEvents: [{ inBarDiv: 0, qBpm: 120, src: 't' }] }),
      60,
      2
    );
    // Whole 2 quarters at 120 → 1 sec
    expect(r.offsetSec).toBeCloseTo(1, 6);
    expect(r.localQBpm).toBe(120);
  });
});
