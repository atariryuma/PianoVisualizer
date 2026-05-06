import { describe, it, expect } from 'vitest';
import { buildMeasureTimingFromXml } from '../src/library/measure-timing';
import type { ScoreTiming, MeasureTiming } from '../src/library/score-timing';

/** Helper: build a ScoreTiming for a single measure with no tempo events,
 *  divisions=4, beats=4, beatType=4 (one quarter = one division). */
function oneBarTiming(over: Partial<MeasureTiming> = {}, leadingQBpm = 60): ScoreTiming {
  const meas: MeasureTiming = {
    tempoEvents: [],
    timeSig: { beats: 4, beatType: 4 },
    divisions: 4,
    implicit: false,
    durationDiv: 16, // 4 beats × 4 divisions × 4/4 = 16
    actualDiv: 16,
    ...over,
  };
  return {
    measures: [meas],
    leadingQuarterBpm: leadingQBpm,
    leadingSource: 'test',
  };
}

describe('buildMeasureTimingFromXml — null + empty', () => {
  it('returns null when given null', () => {
    expect(buildMeasureTimingFromXml(null)).toBeNull();
  });

  it('returns empty arrays for an empty measure list', () => {
    const r = buildMeasureTimingFromXml({
      measures: [],
      leadingQuarterBpm: 72,
      leadingSource: 'test',
    });
    expect(r).toEqual({ startSec: [], durSec: [] });
  });
});

describe('buildMeasureTimingFromXml — constant tempo', () => {
  it('one 4/4 bar at 60 bpm = 4 seconds', () => {
    const r = buildMeasureTimingFromXml(oneBarTiming({}, 60))!;
    expect(r.durSec[0]).toBeCloseTo(4, 6);
    expect(r.startSec[0]).toBe(0);
  });

  it('one 4/4 bar at 120 bpm = 2 seconds', () => {
    const r = buildMeasureTimingFromXml(oneBarTiming({}, 120))!;
    expect(r.durSec[0]).toBeCloseTo(2, 6);
  });

  it('three bars at 60 bpm produce monotonic startSec at 0, 4, 8', () => {
    const meas: MeasureTiming = {
      tempoEvents: [],
      timeSig: { beats: 4, beatType: 4 },
      divisions: 4,
      implicit: false,
      durationDiv: 16,
      actualDiv: 16,
    };
    const r = buildMeasureTimingFromXml({
      measures: [meas, meas, meas],
      leadingQuarterBpm: 60,
      leadingSource: 'test',
    })!;
    expect(r.startSec).toEqual([0, 4, 8]);
    expect(r.durSec).toEqual([4, 4, 4]);
  });

  it('a 6/8 bar at 90 bpm (quarter) = 2 seconds', () => {
    // 6/8 with divisions=8 → durationDiv = 6 × 8 × 4 / 8 = 24 (= 6 eighths)
    // 6 eighths = 3 quarters, at quarter=90 → 60/90 × 3 = 2 sec
    const r = buildMeasureTimingFromXml(
      oneBarTiming(
        {
          timeSig: { beats: 6, beatType: 8 },
          divisions: 8,
          durationDiv: 24,
          actualDiv: 24,
        },
        90
      )
    )!;
    expect(r.durSec[0]).toBeCloseTo(2, 6);
  });
});

describe('buildMeasureTimingFromXml — mid-bar tempo change', () => {
  it('an event at inBarDiv=8 (half-bar) splits the duration', () => {
    // 4/4 bar, divisions=4 (durationDiv=16). Event at inBarDiv=8 changes
    // 60→120 mid-bar. First half (8 div = 2 quarters) at 60 = 2 sec.
    // Second half (8 div = 2 quarters) at 120 = 1 sec. Total 3 sec.
    const r = buildMeasureTimingFromXml(
      oneBarTiming({ tempoEvents: [{ inBarDiv: 8, qBpm: 120, src: 'test' }] }, 60)
    )!;
    expect(r.durSec[0]).toBeCloseTo(3, 6);
  });

  it('an event at inBarDiv=0 overrides the carried-in tempo for the whole bar', () => {
    const r = buildMeasureTimingFromXml(
      oneBarTiming({ tempoEvents: [{ inBarDiv: 0, qBpm: 240, src: 'test' }] }, 60)
    )!;
    // Whole bar at 240 = 4 quarters × 60/240 = 1 sec
    expect(r.durSec[0]).toBeCloseTo(1, 6);
  });

  it("the last segment's bpm carries to the next measure", () => {
    // Bar 1: starts at 60, event at div 8 → 120, ends at 120.
    // Bar 2: no events; should run at 120 (carried).
    const meas1: MeasureTiming = {
      tempoEvents: [{ inBarDiv: 8, qBpm: 120, src: 'test' }],
      timeSig: { beats: 4, beatType: 4 },
      divisions: 4,
      implicit: false,
      durationDiv: 16,
      actualDiv: 16,
    };
    const meas2: MeasureTiming = { ...meas1, tempoEvents: [] };
    const r = buildMeasureTimingFromXml({
      measures: [meas1, meas2],
      leadingQuarterBpm: 60,
      leadingSource: 'test',
    })!;
    // Bar 2 entirely at 120 → 4 quarters / 120 × 60 = 2 sec
    expect(r.durSec[1]).toBeCloseTo(2, 6);
    expect(r.startSec[1]).toBeCloseTo(3, 6); // bar 1 was 3 sec
  });
});

describe('buildMeasureTimingFromXml — partial measure (actualDiv vs durationDiv)', () => {
  it('uses actualDiv when smaller than durationDiv (anacrusis-like)', () => {
    // Bar with durationDiv=16 but only 4 div of content → 1 quarter at 60 = 1 sec
    const r = buildMeasureTimingFromXml(oneBarTiming({ actualDiv: 4, implicit: true }, 60))!;
    expect(r.durSec[0]).toBeCloseTo(1, 6);
  });

  it('falls back to durationDiv when actualDiv=0 (silent bar)', () => {
    const r = buildMeasureTimingFromXml(oneBarTiming({ actualDiv: 0 }, 60))!;
    // Empty bar still consumes nominal time (4 sec at 60 bpm).
    expect(r.durSec[0]).toBeCloseTo(4, 6);
  });

  it('La Campanella m=5-like: actualDiv 480 of 720 (8 of 12 sixteenths)', () => {
    // 4/4 bar, divisions=120 → durationDiv = 4 × 120 = 480? Hmm let me redo.
    // Actually la Campanella's m=5 has divisions=24, time=12/8 → durationDiv = 12 × 24 × 4 / 8 = 144
    // The README mentions 720 ticks but with high divisions. Let's use a simpler test:
    // divisions=4, 4/4 → durationDiv=16. actualDiv=8 (half-filled). At 60 bpm:
    //   actualDiv used → 8 div = 2 quarters = 2 sec, NOT 4 sec
    const r = buildMeasureTimingFromXml(oneBarTiming({ actualDiv: 8 }, 60))!;
    expect(r.durSec[0]).toBeCloseTo(2, 6);
  });
});

describe('buildMeasureTimingFromXml — multi-bar accumulation', () => {
  it('startSec[i+1] = startSec[i] + durSec[i] always', () => {
    const meas = (qBpm: number): MeasureTiming => ({
      tempoEvents: [{ inBarDiv: 0, qBpm, src: 'test' }],
      timeSig: { beats: 4, beatType: 4 },
      divisions: 4,
      implicit: false,
      durationDiv: 16,
      actualDiv: 16,
    });
    const r = buildMeasureTimingFromXml({
      measures: [meas(60), meas(120), meas(90), meas(60)],
      leadingQuarterBpm: 60,
      leadingSource: 'test',
    })!;
    for (let i = 0; i < r.startSec.length - 1; i++) {
      expect(r.startSec[i + 1]).toBeCloseTo(r.startSec[i] + r.durSec[i], 6);
    }
  });
});
