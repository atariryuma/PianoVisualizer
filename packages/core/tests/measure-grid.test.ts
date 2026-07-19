// Tests for src/library/measure-grid.ts — 小節グリッド（展開後時計）。
//
// カウントイン / メトロノームの唯一の真実になるテーブルなので、
//   * 展開時計が expandNotesByPlaybackOrder と同じ累積則であること
//   * 弱起（implicit / 部分小節）の検出とピックアップ長
//   * 複合拍子の拍単位（6/8 → 付点四分 2 拍、3/8 → 1 拍/小節）
//   * 途中の拍子変更が per-measure に保持されること
// を固定する。

import { describe, it, expect } from 'vitest';
import {
  buildMeasureGrid,
  meterBeatInfo,
  gridIndexAtSec,
  isPartialMeasure,
  countInPickupSec,
  countInMeterAtAnchor,
  type MeasureGridEntry,
  type MeasureGridSourceMeasure,
} from '../src/library/measure-grid';

// ─── helpers ────────────────────────────────────────────────────────

function srcMeasure(over: Partial<MeasureGridSourceMeasure> = {}): MeasureGridSourceMeasure {
  return {
    timeSig: { beats: 4, beatType: 4 },
    implicit: false,
    durationDiv: 16,
    actualDiv: 16,
    ...over,
  };
}

function gridEntry(over: Partial<MeasureGridEntry> = {}): MeasureGridEntry {
  return { startSec: 0, durSec: 2, beats: 4, beatType: 4, ...over };
}

// ─── buildMeasureGrid ──────────────────────────────────────────────

describe('buildMeasureGrid', () => {
  it('linear order → cumulative startSec from durSec', () => {
    const measures = [srcMeasure(), srcMeasure(), srcMeasure()];
    const grid = buildMeasureGrid([0, 1, 2], measures, [2, 2, 2]);
    expect(grid.map((g) => g.startSec)).toEqual([0, 2, 4]);
    expect(grid.map((g) => g.durSec)).toEqual([2, 2, 2]);
  });

  it('repeat-expanded order re-times the second traversal (展開後時計)', () => {
    const measures = [srcMeasure(), srcMeasure()];
    // |: m0 m1 :| → m0 m1 m0 m1
    const grid = buildMeasureGrid([0, 1, 0, 1], measures, [2, 3]);
    expect(grid.map((g) => g.startSec)).toEqual([0, 2, 5, 7]);
  });

  it('missing durSec falls back to 0.5s (expandNotesByPlaybackOrder と同じ)', () => {
    const measures = [srcMeasure(), srcMeasure()];
    const grid = buildMeasureGrid([0, 1], measures, [2]);
    expect(grid[1].startSec).toBe(2);
    expect(grid[1].durSec).toBe(0.5);
  });

  it('carries per-measure time signature (途中の拍子変更)', () => {
    const measures = [
      srcMeasure({ timeSig: { beats: 4, beatType: 4 } }),
      srcMeasure({ timeSig: { beats: 3, beatType: 4 }, durationDiv: 12, actualDiv: 12 }),
    ];
    const grid = buildMeasureGrid([0, 1], measures, [2, 1.5]);
    expect(grid[0].beats).toBe(4);
    expect(grid[1].beats).toBe(3);
  });

  it('flags implicit (弱起) and partial (barFrac < 1) measures', () => {
    const measures = [
      // 1 拍ぶんだけのピックアップ小節 (4/4, durationDiv 16, actualDiv 4)
      srcMeasure({ implicit: true, actualDiv: 4 }),
      srcMeasure(),
    ];
    const grid = buildMeasureGrid([0, 1], measures, [0.5, 2]);
    expect(grid[0].implicit).toBe(true);
    expect(grid[0].barFrac).toBeCloseTo(0.25, 5);
    expect(grid[1].implicit).toBeUndefined();
    expect(grid[1].barFrac).toBeUndefined();
  });

  it('unknown measure index → 4/4 完全小節扱い', () => {
    const grid = buildMeasureGrid([0, 5], [srcMeasure()], [2]);
    expect(grid[1]).toEqual({ startSec: 2, durSec: 0.5, beats: 4, beatType: 4 });
  });
});

// ─── meterBeatInfo ─────────────────────────────────────────────────

describe('meterBeatInfo', () => {
  it('4/4 → 4 clicks of a quarter note', () => {
    expect(meterBeatInfo(4, 4)).toEqual({ clicksPerBar: 4, clickQuarters: 1 });
  });

  it('3/4 → 3 clicks of a quarter note', () => {
    expect(meterBeatInfo(3, 4)).toEqual({ clicksPerBar: 3, clickQuarters: 1 });
  });

  it('6/8 → 2 clicks of a dotted quarter (複合拍子)', () => {
    expect(meterBeatInfo(6, 8)).toEqual({ clicksPerBar: 2, clickQuarters: 1.5 });
  });

  it('3/8 → 1 click per bar of a dotted quarter (Für Elise 型)', () => {
    expect(meterBeatInfo(3, 8)).toEqual({ clicksPerBar: 1, clickQuarters: 1.5 });
  });

  it('2/2 → 2 clicks of a half note', () => {
    expect(meterBeatInfo(2, 2)).toEqual({ clicksPerBar: 2, clickQuarters: 2 });
  });

  it('non-triple x/8 (e.g. 5/8) stays simple: 5 clicks of an eighth', () => {
    expect(meterBeatInfo(5, 8)).toEqual({ clicksPerBar: 5, clickQuarters: 0.5 });
  });

  it('invalid input falls back to 4/4', () => {
    expect(meterBeatInfo(0, 0)).toEqual({ clicksPerBar: 4, clickQuarters: 1 });
  });
});

// ─── gridIndexAtSec / isPartialMeasure ─────────────────────────────

describe('gridIndexAtSec', () => {
  const grid = [
    gridEntry({ startSec: 0, durSec: 2 }),
    gridEntry({ startSec: 2, durSec: 2 }),
    gridEntry({ startSec: 4, durSec: 2 }),
  ];

  it('returns the measure containing the position', () => {
    expect(gridIndexAtSec(grid, 0)).toBe(0);
    expect(gridIndexAtSec(grid, 1.5)).toBe(0);
    expect(gridIndexAtSec(grid, 2)).toBe(1);
    expect(gridIndexAtSec(grid, 5.9)).toBe(2);
  });

  it('clamps before/after the grid', () => {
    expect(gridIndexAtSec(grid, -1)).toBe(0);
    expect(gridIndexAtSec(grid, 100)).toBe(2);
  });
});

describe('isPartialMeasure', () => {
  it('true for implicit or barFrac < 1, false for full bars', () => {
    expect(isPartialMeasure(gridEntry({ implicit: true }))).toBe(true);
    expect(isPartialMeasure(gridEntry({ barFrac: 0.25 }))).toBe(true);
    expect(isPartialMeasure(gridEntry())).toBe(false);
  });
});

// ─── countInPickupSec / countInMeterAtAnchor ───────────────────────

describe('countInPickupSec', () => {
  it('0 for a full first measure (従来挙動 — GO = セクション頭)', () => {
    const grid = [gridEntry(), gridEntry({ startSec: 2 })];
    expect(countInPickupSec(grid, 0)).toBe(0);
  });

  it('pickup measure → its remaining length up to the next downbeat', () => {
    // 1 拍ピックアップ (4/4): durSec 0.5 → ダウンビートは 0.5s
    const grid = [
      gridEntry({ implicit: true, barFrac: 0.25, durSec: 0.5 }),
      gridEntry({ startSec: 0.5 }),
    ];
    expect(countInPickupSec(grid, 0)).toBe(0.5);
  });

  it('mid-song section starting at a full measure → 0', () => {
    const grid = [
      gridEntry({ implicit: true, barFrac: 0.25, durSec: 0.5 }),
      gridEntry({ startSec: 0.5 }),
      gridEntry({ startSec: 2.5 }),
    ];
    expect(countInPickupSec(grid, 2.5)).toBe(0);
  });

  it('anchor inside a partial measure → distance to next measure start', () => {
    const grid = [
      gridEntry({ implicit: true, barFrac: 0.5, durSec: 1 }),
      gridEntry({ startSec: 1 }),
    ];
    // アンカーがピックアップ小節の途中 (0.25s) — 残り 0.75s
    expect(countInPickupSec(grid, 0.25)).toBeCloseTo(0.75, 9);
  });

  it('empty grid → 0', () => {
    expect(countInPickupSec([], 0)).toBe(0);
  });
});

describe('countInMeterAtAnchor', () => {
  it('returns the anchor measure meter for a full bar', () => {
    const grid = [gridEntry({ beats: 3, beatType: 4 })];
    expect(countInMeterAtAnchor(grid, 0)).toEqual({ beats: 3, beatType: 4 });
  });

  it('skips a pickup measure — カウントインは最初の完全小節の拍子', () => {
    const grid = [
      gridEntry({ implicit: true, barFrac: 0.3, durSec: 0.6, beats: 3, beatType: 8 }),
      gridEntry({ startSec: 0.6, beats: 3, beatType: 8 }),
    ];
    expect(countInMeterAtAnchor(grid, 0)).toEqual({ beats: 3, beatType: 8 });
  });

  it('empty grid → null', () => {
    expect(countInMeterAtAnchor([], 0)).toBeNull();
  });
});
