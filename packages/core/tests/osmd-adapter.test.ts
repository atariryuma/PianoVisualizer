// Type-level smoke test for the OsmdAdapter interface.
//
// There's no runtime to exercise here — the interface is a contract, the
// real implementation lives in the web shell with the OSMD npm package.
// What this test guards is the SHAPE: a stub adapter that satisfies the
// interface compiles, and a small set of value-level assertions confirm
// the supporting types are usable from a typed-test consumer (which is
// how Phase 0c modules will eventually import them).

import { describe, it, expect } from 'vitest';
import type {
  OsmdAdapter,
  OsmdNote,
  OsmdExtractResult,
  OsmdCursorGeometry,
} from '../src/adapters/osmd-adapter';

const stub: OsmdAdapter = {
  async load(_url) {},
  isLoaded() {
    return false;
  },
  extractNotes() {
    return { notes: [], measureTiming: [] };
  },
  cursorTo(_m, _q) {},
  resetCursor() {},
  showCursor() {},
  hideCursor() {},
  getCursorGeometry() {
    return null;
  },
  highlightCurrentNotes(_color) {},
  clearHighlights() {},
};

describe('OsmdAdapter interface contract', () => {
  it('a minimal stub satisfies the interface', () => {
    // Compile-time check: if the stub didn't satisfy the interface the
    // file would not type-check. The runtime assertion is just to make
    // vitest happy.
    expect(typeof stub.load).toBe('function');
    expect(typeof stub.cursorTo).toBe('function');
    expect(typeof stub.highlightCurrentNotes).toBe('function');
  });

  it('isLoaded returns a boolean', () => {
    const v: boolean = stub.isLoaded();
    expect(v).toBe(false);
  });

  it('extractNotes returns the expected shape', () => {
    const r: OsmdExtractResult = stub.extractNotes();
    expect(r.notes).toEqual([]);
    expect(r.measureTiming).toEqual([]);
  });

  it('getCursorGeometry returns null or a geometry record', () => {
    const g: OsmdCursorGeometry | null = stub.getCursorGeometry();
    expect(g).toBeNull();
  });
});

describe('OsmdNote shape', () => {
  it("accepts the legacy shell's note shape", () => {
    const n: OsmdNote = {
      midi: 60,
      hand: 'L',
      timeSec: 1.5,
      durSec: 0.5,
      measureIdx: 2,
      inBarQuarters: 0.5,
    };
    expect(n.midi).toBe(60);
    expect(n.hand).toBe('L');
  });

  it('accepts tied notes', () => {
    const start: OsmdNote = {
      midi: 67,
      hand: 'R',
      timeSec: 0,
      durSec: 1,
      measureIdx: 0,
      inBarQuarters: 0,
      tieStart: true,
    };
    const end: OsmdNote = {
      midi: 67,
      hand: 'R',
      timeSec: 1,
      durSec: 0.5,
      measureIdx: 0,
      inBarQuarters: 2,
      tieEnd: true,
    };
    expect(start.tieStart).toBe(true);
    expect(end.tieEnd).toBe(true);
  });
});

describe('OsmdAdapter usage shape', () => {
  it('cursorTo accepts (number, number)', () => {
    stub.cursorTo(0, 0);
    stub.cursorTo(10, 2.5);
    // No throw expected — the stub is a no-op.
    expect(true).toBe(true);
  });

  it('highlightCurrentNotes accepts any CSS color string', () => {
    stub.highlightCurrentNotes('#ff3b6b');
    stub.highlightCurrentNotes('rgb(255, 59, 107)');
    stub.highlightCurrentNotes('hotpink');
    expect(true).toBe(true);
  });
});
