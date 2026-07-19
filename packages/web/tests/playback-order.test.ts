// Tests for packages/web/src/playback-order.ts.

import { describe, it, expect, vi } from 'vitest';
import { createPlaybackOrder, type PlaybackOrderMeasure } from '../src/playback-order';

interface FakeNote {
  startSec: number;
  measureIdx: number;
}

interface FakeOrder {
  measureIndices: number[];
}

function makeFixture(
  over: {
    parseResult?: FakeOrder;
    fetchOk?: boolean;
    fetchStatus?: number;
    fetchText?: string;
  } = {}
) {
  const parsePlaybackOrderFromXml = vi.fn(
    (_text: string): FakeOrder => over.parseResult ?? { measureIndices: [0, 1, 2] }
  );
  const expandNotesByPlaybackOrder = vi.fn(
    (
      baseNotes: FakeNote[],
      order: FakeOrder,
      timing: { startSec: number[]; durSec: number[] }
    ): FakeNote[] => {
      // Project an empty result that still encodes the timing arrays
      // for the assertions to read back.
      return order.measureIndices.map((m) => ({
        startSec: timing.startSec[m] ?? 0,
        measureIdx: m,
      }));
    }
  );
  const fetchFn = vi.fn(async () => {
    return {
      ok: over.fetchOk ?? true,
      status: over.fetchStatus ?? 200,
      async text() {
        return over.fetchText ?? '<score-fetched/>';
      },
    } as unknown as Response;
  });
  const expandedMeasureStartSec = vi.fn(
    (order: FakeOrder, timing: { startSec: number[]; durSec: number[] }): number[] => {
      // Simplified first-occurrence walk mirroring the core impl so the
      // web wrapper's timing-resolution is what's under test here.
      const first = new Array<number>(timing.startSec.length).fill(-1);
      let cum = 0;
      for (const m of order.measureIndices) {
        if (m >= 0 && m < first.length && first[m] < 0) first[m] = cum;
        cum += timing.durSec[m] ?? 0.5;
      }
      let last = 0;
      for (let i = 0; i < first.length; i++) {
        if (first[i] < 0) first[i] = last;
        else last = first[i];
      }
      return first;
    }
  );
  const pb = createPlaybackOrder<FakeNote, FakeNote, FakeOrder>({
    fns: { parsePlaybackOrderFromXml, expandNotesByPlaybackOrder, expandedMeasureStartSec },
    fetch: fetchFn as unknown as typeof fetch,
  });
  return {
    pb,
    parsePlaybackOrderFromXml,
    expandNotesByPlaybackOrder,
    expandedMeasureStartSec,
    fetchFn,
  };
}

describe('createPlaybackOrder — fetchPlaybackOrder', () => {
  it('uses cached _xmlText when present (no fetch)', async () => {
    const fx = makeFixture();
    await fx.pb.fetchPlaybackOrder({ _xmlText: '<cached/>', xmlUrl: 'http://test/a.xml' });
    expect(fx.fetchFn).not.toHaveBeenCalled();
    expect(fx.parsePlaybackOrderFromXml).toHaveBeenCalledWith('<cached/>');
  });

  it('fetches xmlUrl when _xmlText absent', async () => {
    const fx = makeFixture({ fetchText: '<network/>' });
    await fx.pb.fetchPlaybackOrder({ xmlUrl: 'http://test/a.xml' });
    expect(fx.fetchFn).toHaveBeenCalledWith('http://test/a.xml');
    expect(fx.parsePlaybackOrderFromXml).toHaveBeenCalledWith('<network/>');
  });

  it('throws "XML fetch failed: <status>" on non-OK response', async () => {
    const fx = makeFixture({ fetchOk: false, fetchStatus: 404 });
    await expect(fx.pb.fetchPlaybackOrder({ xmlUrl: 'http://test/missing.xml' })).rejects.toThrow(
      'XML fetch failed: 404'
    );
  });

  it('returns the parser result verbatim', async () => {
    const fx = makeFixture({ parseResult: { measureIndices: [9, 8, 7] } });
    const out = await fx.pb.fetchPlaybackOrder({ _xmlText: '<x/>', xmlUrl: '' });
    expect(out).toEqual({ measureIndices: [9, 8, 7] });
  });

  it('partIndex 指定時は { partIndex } としてパーサに貫通する（P2-21）', async () => {
    const fx = makeFixture();
    await fx.pb.fetchPlaybackOrder({ _xmlText: '<two-part/>', xmlUrl: '' }, 2);
    expect(fx.parsePlaybackOrderFromXml).toHaveBeenCalledWith('<two-part/>', { partIndex: 2 });
  });
});

describe('createPlaybackOrder — expandNotesByPlaybackOrder pre-built table', () => {
  it('uses sourceMeasureStartSec when provided + length matches', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
    ];
    const baseNotes: FakeNote[] = [];
    const order = { measureIndices: [0, 1, 2] };
    fx.pb.expandNotesByPlaybackOrder(baseNotes, order, measures, [0, 4, 8]);

    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    expect(callArg.startSec).toEqual([0, 4, 8]);
    // dur[0] = 4-0 = 4, dur[1] = 8-4 = 4, dur[2] last bar = (0.25*4*60/60) = 1
    expect(callArg.durSec[0]).toBe(4);
    expect(callArg.durSec[1]).toBe(4);
    expect(callArg.durSec[2]).toBe(1);
  });

  it('uses 72 BPM as the last-bar fallback when TempoInBPM is missing', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { Duration: { realValue: 0.25 } },
      { Duration: { realValue: 0.25 } }, // no TempoInBPM on last bar
    ];
    fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1] }, measures, [0, 1]);

    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    // last bar: 0.25 * 4 * 60 / 72 = 60/72 ≈ 0.833…
    expect(callArg.durSec[1]).toBeCloseTo(60 / 72, 5);
  });

  it('uses XML-authoritative sourceMeasureDurSec for every bar including the last (P1-7)', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
    ];
    // Pass explicit XML durations — the last bar must NOT fall back to
    // the 72-BPM / Duration-diff heuristic (which shifted D.C./D.S.).
    fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1] }, measures, [0, 2], [2, 1.5]);
    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    expect(callArg.durSec).toEqual([2, 1.5]); // last bar honored, not 60/72
  });

  it('uses 0.25 as the last-bar Duration fallback when Duration missing', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60 }, // no Duration on last bar
    ];
    fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1] }, measures, [0, 1]);

    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    expect(callArg.durSec[1]).toBe(1); // 0.25 * 4 * 60 / 60 = 1
  });
});

describe('createPlaybackOrder — expandNotesByPlaybackOrder cumulative-sum fallback', () => {
  it('walks bars cumulatively when no source table is provided', () => {
    const fx = makeFixture();
    // 3 bars at 60 BPM, each 1 sec long (0.25 * 4 * 60 / 60).
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
    ];
    fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1, 2] }, measures);

    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    expect(callArg.startSec).toEqual([0, 1, 2]);
    expect(callArg.durSec).toEqual([1, 1, 1]);
  });

  it('falls back to source table when length mismatches the measures array', () => {
    // Mismatched length → factory ignores the supplied table and runs
    // the cumulative-sum walk.
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 120, Duration: { realValue: 0.25 } },
      { TempoInBPM: 120, Duration: { realValue: 0.25 } },
    ];
    fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1] }, measures, [0, 5, 10]); // 3-elt table for 2 bars

    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    // 0.25 * 4 * 60 / 120 = 0.5 per bar
    expect(callArg.startSec).toEqual([0, 0.5]);
    expect(callArg.durSec).toEqual([0.5, 0.5]);
  });

  it('carries prevBpm forward when a bar omits TempoInBPM', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } }, // 1 sec/bar
      { Duration: { realValue: 0.25 } }, // inherits 60 → 1 sec/bar
      { TempoInBPM: 120, Duration: { realValue: 0.25 } }, // 0.5 sec/bar
      { Duration: { realValue: 0.25 } }, // inherits 120 → 0.5 sec/bar
    ];
    fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1, 2, 3] }, measures);

    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    expect(callArg.durSec).toEqual([1, 1, 0.5, 0.5]);
    expect(callArg.startSec).toEqual([0, 1, 2, 2.5]);
  });

  it('seeds prevBpm at 72 when bar 0 has no tempo', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { Duration: { realValue: 0.25 } }, // → 0.25 * 4 * 60 / 72
      { Duration: { realValue: 0.25 } },
    ];
    fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1] }, measures);

    const callArg = fx.expandNotesByPlaybackOrder.mock.calls[0][2] as {
      startSec: number[];
      durSec: number[];
    };
    expect(callArg.durSec[0]).toBeCloseTo(60 / 72, 5);
  });

  it('forwards through to the core fn — return value is whatever core produces', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
    ];
    const out = fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1] }, measures);
    // Our fake core returns one entry per measureIndex with that bar's startSec.
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ startSec: 0, measureIdx: 0 });
    expect(out[1]).toEqual({ startSec: 1, measureIdx: 1 });
  });
});

describe('createPlaybackOrder — empty measures NaN guard (2026-05-09 regression)', () => {
  it('throws "measures array is empty" when measures.length === 0', () => {
    const fx = makeFixture();
    expect(() => fx.pb.expandNotesByPlaybackOrder([], { measureIndices: [0, 1, 2] }, [])).toThrow(
      /measures array is empty/
    );
  });

  it('throws when measures is undefined / null (defensive)', () => {
    const fx = makeFixture();
    expect(() =>
      fx.pb.expandNotesByPlaybackOrder(
        [],
        { measureIndices: [0] },
        undefined as unknown as PlaybackOrderMeasure[]
      )
    ).toThrow(/measures array is empty/);
  });
});

describe('createPlaybackOrder — expandedMeasureStartSec (section boundaries, P0-2)', () => {
  it('maps section boundaries onto the repeat-unfolded timeline', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
    ];
    // Repeat of measures 0..1: order = 0,1,0,1,2,3. XML durations 1s each.
    const table = fx.pb.expandedMeasureStartSec(
      { measureIndices: [0, 1, 0, 1, 2, 3] },
      measures,
      [0, 1, 2, 3],
      [1, 1, 1, 1]
    );
    // m2/m3 pushed out past both passes of 0..1.
    expect(table).toEqual([0, 1, 4, 5]);
  });

  it('uses the same resolved timing as expansion (falls back cleanly)', () => {
    const fx = makeFixture();
    const measures: PlaybackOrderMeasure[] = [
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
      { TempoInBPM: 60, Duration: { realValue: 0.25 } },
    ];
    // No XML table → OSMD cumulative fallback (1s/bar at 60 BPM).
    const table = fx.pb.expandedMeasureStartSec({ measureIndices: [0, 1] }, measures);
    expect(table).toEqual([0, 1]);
  });
});
