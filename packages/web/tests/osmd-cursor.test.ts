// @vitest-environment happy-dom
//
// Tests for packages/web/src/osmd-cursor.ts.
//
// Covers:
//   • scrollToCursor: throttled to 100 ms, scrolls only when cursor
//     would be off-screen, no-op when cursor element / container
//     missing.
//   • resetScrollThrottle: bypasses the throttle gate.
//   • resetToStart: clears highlights, calls cursor.reset, scrolls
//     container to top.
//   • clearHighlights: restores each tracked path's _origFill,
//     empties the tracker, swallows errors from detached elements.
//   • highlightCurrentNotes: GNotesUnderCursor preferred, falls
//     back to NotesUnderCursor, stores _origFill before painting,
//     skips notes without getSVGGElement.
//   • setCursorToNote: skip when already at target, reset+walk on
//     past-target / endReached, walk forward on ahead-target,
//     safety cap protects against stuck iterators, calls
//     highlightCurrentNotes after walk.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOsmdCursor,
  type OsmdInstanceRef,
  type OsmdCursorRef,
  type OsmdGraphicalNote,
} from '../src/osmd-cursor';

// ─── fixture helpers ───────────────────────────────────────────────

function makeIterator(over: { measureIdx?: number; inBar?: number; endReached?: boolean } = {}) {
  // Inputs: measureIdx + inBarQuarters (we map back to OSMD's
  // (CurrentMeasureIndex, currentTimeStamp.realValue) shape).
  const M = over.measureIdx ?? 0;
  const inBar = over.inBar ?? 0;
  // measureStart in WHOLE notes is M (each measure = 1 whole note in
  // the test fixture). currentTimeStamp.realValue is whole-notes; so
  // currentTimeStamp = M + inBar/4.
  return {
    endReached: over.endReached ?? false,
    CurrentMeasureIndex: M,
    currentTimeStamp: { realValue: M + inBar / 4 },
  };
}

function makeOsmd(over: {
  iterator?: ReturnType<typeof makeIterator>;
  reset?: () => void;
  next?: () => void;
  cursorElement?: {
    offsetTop: number;
    offsetHeight?: number;
    scrollIntoView?: (...args: unknown[]) => void;
  } | null;
  noCursor?: boolean;
  measures?: number; // count of source measures
  notesUnderCursor?: OsmdGraphicalNote[] | null;
  useGNotes?: boolean;
}): OsmdInstanceRef {
  if (over.noCursor) return { cursor: null };
  const it = over.iterator ?? makeIterator();
  const sm: Array<{ AbsoluteTimestamp?: { realValue?: number } }> = [];
  for (let i = 0; i < (over.measures ?? 8); i++) {
    sm.push({ AbsoluteTimestamp: { realValue: i } });
  }
  const cursor: OsmdCursorRef = {
    iterator: it,
    cursorElement: over.cursorElement,
    reset: over.reset ?? vi.fn(),
    next:
      over.next ??
      (() => {
        // Default next() advances the iterator by 1 quarter-note.
        it.currentTimeStamp.realValue += 0.25;
        // Cross measure boundary?
        const m = Math.floor(it.currentTimeStamp.realValue);
        if (m !== it.CurrentMeasureIndex) it.CurrentMeasureIndex = m;
      }),
    show: vi.fn(),
    hide: vi.fn(),
  };
  if (over.useGNotes) {
    cursor.GNotesUnderCursor = vi.fn().mockReturnValue(over.notesUnderCursor ?? []);
  } else if (over.notesUnderCursor !== null) {
    cursor.NotesUnderCursor = vi.fn().mockReturnValue(over.notesUnderCursor ?? []);
  }
  return { cursor, Sheet: { SourceMeasures: sm } };
}

function makeContainer(): { scrollTop: number; clientHeight: number } {
  return { scrollTop: 0, clientHeight: 400 };
}

function makeCursorElement(offsetTop: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetTop', { configurable: true, value: offsetTop });
  return el;
}

function makeScorePanelFixture(opts: {
  cursorTop: number;
  panelTop?: number;
  panelHeight: number;
}): { container: HTMLElement; cursorEl: HTMLElement } {
  const panelTop = opts.panelTop ?? 0;
  const container = document.createElement('div');
  container.id = 'osmdContainer';
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: opts.panelHeight });
  container.getBoundingClientRect = vi.fn(
    () =>
      ({
        top: panelTop,
        bottom: panelTop + opts.panelHeight,
        left: 0,
        right: 320,
        width: 320,
        height: opts.panelHeight,
        x: 0,
        y: panelTop,
        toJSON: () => ({}),
      }) as DOMRect
  );
  const cursorEl = makeCursorElement(opts.cursorTop);
  cursorEl.getBoundingClientRect = vi.fn(
    () =>
      ({
        top: opts.cursorTop,
        bottom: opts.cursorTop + 120,
        left: 0,
        right: 2,
        width: 2,
        height: 120,
        x: 0,
        y: opts.cursorTop,
        toJSON: () => ({}),
      }) as DOMRect
  );
  container.appendChild(cursorEl);
  document.body.appendChild(container);
  return { container, cursorEl };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// Custom scroll-tracking drives #osmdContainer.scrollTop directly.
// OSMD's built-in `followCursor` is OFF.

// ─── resetToStart ──────────────────────────────────────────────────

describe('resetToStart', () => {
  // resetToStart calls cursor.reset() then ensureCursorVisible(); the
  // latter adjusts the fixed #osmdContainer scrollTop.

  it('calls cursor.reset', () => {
    const reset = vi.fn();
    const ce = makeCursorElement(100);
    const cursor = createOsmdCursor({ getOsmd: () => makeOsmd({ reset, cursorElement: ce }) });
    cursor.resetToStart();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('scrolls the score panel directly on the first-scroll path', () => {
    // resetToStart is the "first-scroll" branch — _lastSysIdx is null
    // before this call, so ensureCursorVisible always fires here even
    // though the score-follow controller would normally skip same-system
    // onsets.
    //
    // cursorTop=300, panelHeight=200: cursor {top:300, bot:420, h:120}
    // margin=32, safeBottom=168. focusY=300+120*0.42=350.4,
    // belowFocus=420-350.4=69.6, effectiveSafeBottom=168-69.6≈98.
    // delta=350.4-98=252 → cursor bottom lands at safeBottom (168).
    const reset = vi.fn();
    const { container, cursorEl } = makeScorePanelFixture({ cursorTop: 300, panelHeight: 200 });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          reset,
          cursorElement: cursorEl,
        }),
    });
    cursor.resetToStart();
    expect(container.scrollTop).toBe(252);
  });

  it('no-op when osmd cursor missing', () => {
    const cursor = createOsmdCursor({ getOsmd: () => ({ cursor: null }) });
    expect(() => cursor.resetToStart()).not.toThrow();
  });

  it('swallows reset() throws', () => {
    const reset = vi.fn(() => {
      throw new Error('reset boom');
    });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ reset, cursorElement: { offsetTop: 0 } }),
    });
    expect(() => cursor.resetToStart()).not.toThrow();
  });

  it('swallows scrollIntoView throws (best-effort scroll)', () => {
    const cursorEl = makeCursorElement(0);
    vi.spyOn(cursorEl, 'getBoundingClientRect').mockImplementation(() => {
      throw new Error('rect boom');
    });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: cursorEl }),
    });
    expect(() => cursor.resetToStart()).not.toThrow();
  });

  it('first-scroll: fires even with null systemIdx (graceful degradation)', () => {
    // When the GraphicalMusicSheet path isn't populated (mid-load fixture),
    // computeSystemIdx returns null. The first-scroll branch (_lastSysIdx
    // === null) still fires so the cursor lands at score start.
    // cursorTop=180, panelHeight=200: cursor {top:180, bot:300, h:120}
    // focusY=180+120*0.42=230.4, belowFocus=69.6, effectiveSafeBottom=98.
    // delta=230.4-98=132 → cursor bottom lands at safeBottom (168).
    const { container, cursorEl } = makeScorePanelFixture({ cursorTop: 180, panelHeight: 200 });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: cursorEl }),
    });
    cursor.resetToStart();
    expect(container.scrollTop).toBe(132);
  });

  it('uses current notehead bounds as the scroll target when available', () => {
    const { container, cursorEl } = makeScorePanelFixture({ cursorTop: 220, panelHeight: 400 });
    container.scrollTop = 500;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    p.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: 10,
          bottom: 20,
          left: 0,
          right: 10,
          width: 10,
          height: 10,
          x: 0,
          y: 10,
          toJSON: () => ({}),
        }) as DOMRect
    );
    g.appendChild(p);
    container.appendChild(g);

    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: [{ getSVGGElement: () => g }],
        }),
    });
    cursor.resetToStart();
    expect(container.scrollTop).toBe(459);
  });

  it('does not re-scroll inside the same system while the active region stays in the hysteresis band', () => {
    const { container, cursorEl } = makeScorePanelFixture({ cursorTop: 220, panelHeight: 400 });
    const osmd = makeOsmd({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [],
    }) as OsmdInstanceRef & {
      GraphicalMusicSheet: {
        MeasureList: Array<Array<{ parentMusicSystem: { Id: number } }>>;
      };
    };
    osmd.GraphicalMusicSheet = {
      MeasureList: [[{ parentMusicSystem: { Id: 1 } }]],
    };
    osmd.Sheet!.SourceMeasures![0].AbsoluteTimestamp = {
      realValue: 0,
      clone: () => ({ realValue: 0 }),
    };
    const fakeLib = {
      Fraction: vi.fn(),
      MusicPartManagerIterator: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fakeLib,
    });

    cursor.resetToStart();
    const firstScroll = container.scrollTop;
    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });

    expect(container.scrollTop).toBe(firstScroll);
  });

  it('does not treat every call as first-scroll when system index is unavailable', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { cursorEl } = makeScorePanelFixture({ cursorTop: 220, panelHeight: 400 });
    const osmd = makeOsmd({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [],
    });
    osmd.Sheet!.SourceMeasures![0].AbsoluteTimestamp = {
      realValue: 0,
      clone: () => ({ realValue: 0 }),
    };
    const fakeLib = {
      Fraction: vi.fn(),
      MusicPartManagerIterator: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fakeLib,
    });

    cursor.resetToStart();
    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });

    const scrollLogs = logSpy.mock.calls.map((c) => String(c[0]));
    expect(scrollLogs.filter((s) => s.includes('"reason":"first-scroll"'))).toHaveLength(1);
  });

  it('guards same-system scroll direction reversals for tall active regions', () => {
    vi.useFakeTimers();
    const { container, cursorEl } = makeScorePanelFixture({ cursorTop: 220, panelHeight: 400 });
    container.scrollTop = 300;
    const topPath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    ) as SVGPathElement;
    const bottomPath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    ) as SVGPathElement;
    topPath.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: -80,
          bottom: 180,
          left: 0,
          right: 20,
          width: 20,
          height: 260,
          x: 0,
          y: -80,
          toJSON: () => ({}),
        }) as DOMRect
    );
    bottomPath.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: 320,
          bottom: 580,
          left: 0,
          right: 20,
          width: 20,
          height: 260,
          x: 0,
          y: 320,
          toJSON: () => ({}),
        }) as DOMRect
    );
    const topG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const bottomG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    topG.appendChild(topPath);
    bottomG.appendChild(bottomPath);
    let activeG = topG;

    const osmd = makeOsmd({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [{ getSVGGElement: () => activeG }],
    }) as OsmdInstanceRef & {
      GraphicalMusicSheet: {
        MeasureList: Array<Array<{ parentMusicSystem: { Id: number } }>>;
      };
    };
    osmd.GraphicalMusicSheet = {
      MeasureList: [[{ parentMusicSystem: { Id: 1 } }]],
    };
    osmd.Sheet!.SourceMeasures![0].AbsoluteTimestamp = {
      realValue: 0,
      clone: () => ({ realValue: 0 }),
    };
    const fakeLib = {
      Fraction: vi.fn(),
      MusicPartManagerIterator: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fakeLib,
    });

    cursor.resetToStart();
    const afterTop = container.scrollTop;
    vi.advanceTimersByTime(200);
    activeG = bottomG;
    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });

    expect(container.scrollTop).toBe(afterTop);
    vi.useRealTimers();
  });
});

// ─── clearHighlights ───────────────────────────────────────────────

describe('clearHighlights', () => {
  it('restores _origFill on tracked paths + clears tracker', () => {
    // Setup: paint a couple notes so the tracker has entries.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    p1.style.fill = 'orange';
    p2.style.fill = 'green';
    g.appendChild(p1);
    g.appendChild(p2);
    container.appendChild(g);

    const note: OsmdGraphicalNote = { getSVGGElement: () => g };
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({ useGNotes: true, notesUnderCursor: [note], cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
    });

    cursor.highlightCurrentNotes();
    expect(p1.style.fill).toBe('#ff3b6b'); // pink
    expect(p2.style.fill).toBe('#ff3b6b');

    cursor.clearHighlights();
    expect(p1.style.fill).toBe('orange');
    expect(p2.style.fill).toBe('green');
    expect(p1.dataset._origFill).toBeUndefined();
    expect(p2.dataset._origFill).toBeUndefined();
  });

  it('idempotent: second clear is a no-op', () => {
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({}),
      getContainer: () => makeContainer(),
    });
    cursor.clearHighlights();
    expect(() => cursor.clearHighlights()).not.toThrow();
  });
});

// ─── highlightCurrentNotes ─────────────────────────────────────────

describe('highlightCurrentNotes', () => {
  it('paints noteheads pink', () => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    g.appendChild(p);
    document.body.appendChild(g);
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          useGNotes: true,
          notesUnderCursor: [{ getSVGGElement: () => g }],
          cursorElement: { offsetTop: 0 },
        }),
      getContainer: () => makeContainer(),
    });
    cursor.highlightCurrentNotes();
    expect(p.style.fill).toBe('#ff3b6b');
  });

  it('uses custom highlightFill when provided', () => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    g.appendChild(p);
    document.body.appendChild(g);
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          useGNotes: true,
          notesUnderCursor: [{ getSVGGElement: () => g }],
          cursorElement: { offsetTop: 0 },
        }),
      getContainer: () => makeContainer(),
      highlightFill: '#0000ff',
    });
    cursor.highlightCurrentNotes();
    expect(p.style.fill).toBe('#0000ff');
  });

  it('falls back to NotesUnderCursor when GNotesUnderCursor missing', () => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    g.appendChild(p);
    document.body.appendChild(g);
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          useGNotes: false, // → use NotesUnderCursor
          notesUnderCursor: [{ getSVGGElement: () => g }],
          cursorElement: { offsetTop: 0 },
        }),
      getContainer: () => makeContainer(),
    });
    cursor.highlightCurrentNotes();
    expect(p.style.fill).toBe('#ff3b6b');
  });

  it('skips notes without getSVGGElement', () => {
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          useGNotes: true,
          notesUnderCursor: [{}, { getSVGGElement: undefined }],
          cursorElement: { offsetTop: 0 },
        }),
      getContainer: () => makeContainer(),
    });
    expect(() => cursor.highlightCurrentNotes()).not.toThrow();
  });

  it('clears previous highlights before painting fresh', () => {
    const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    g1.appendChild(p1);
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    g2.appendChild(p2);
    document.body.append(g1, g2);

    let nextNote = g1;
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          useGNotes: true,
          notesUnderCursor: [{ getSVGGElement: () => nextNote }],
          cursorElement: { offsetTop: 0 },
        }),
      getContainer: () => makeContainer(),
    });
    cursor.highlightCurrentNotes();
    expect(p1.style.fill).toBe('#ff3b6b');
    nextNote = g2;
    cursor.highlightCurrentNotes();
    // p1 was restored; p2 is now pink.
    expect(p1.style.fill).toBe('');
    expect(p2.style.fill).toBe('#ff3b6b');
  });

  // Tie filtering is now delegated to OSMD's native `cursor.GNotesUnderCursor()`
  // — same pattern musicxml-player and osmd-audio-player use. Our previous
  // collectStartedAtCursor wrapper was removed when setCursorToNote moved to
  // the timestamp-driven MusicPartManagerIterator path: the cursor's iterator
  // and GNotesUnderCursor share one source of truth, so they can't desync by
  // construction. (For tied notes whose graphical representation lives on an
  // earlier system, that's now an OSMD library concern — falling back to
  // OSMD's behavior avoids the parallel-track divergence we hit with our
  // custom resolver.)
});

// ─── setCursorToNote ───────────────────────────────────────────────

describe('setCursorToNote', () => {
  /** Build a fake OSMD lib whose `MusicPartManagerIterator` records the
   *  startTimestamp it was constructed with, so the test can assert the
   *  computed sheet timestamp matches `measure.AbsoluteTimestamp +
   *  inBarQuarters/4`. Mirrors the OSMD shape that
   *  seedIteratorFromTimestamp expects. */
  function makeFakeLib(): {
    Lib: { MusicPartManagerIterator: ReturnType<typeof vi.fn>; Fraction: ReturnType<typeof vi.fn> };
    addedFractions: Array<{ n: number; d: number | undefined }>;
    constructorCalls: Array<{ sheet: unknown; ts: { realValue: number; n?: number; d?: number } }>;
  } {
    const addedFractions: Array<{ n: number; d: number | undefined }> = [];
    const constructorCalls: Array<{
      sheet: unknown;
      ts: { realValue: number; n?: number; d?: number };
    }> = [];
    const Fraction = vi.fn(function (this: { n: number; d?: number }, n: number, d?: number) {
      this.n = n;
      this.d = d;
      addedFractions.push({ n, d });
      return this;
    });
    const MusicPartManagerIterator = vi.fn(function (
      this: unknown,
      sheet: unknown,
      ts: { realValue: number; n?: number; d?: number }
    ) {
      constructorCalls.push({ sheet, ts });
      return this;
    });
    return {
      Lib: { MusicPartManagerIterator, Fraction },
      addedFractions,
      constructorCalls,
    };
  }

  /** Wraps makeOsmd's Sheet so source measures' AbsoluteTimestamp has
   *  the `clone()` + `Add()` shape that seedIteratorFromTimestamp uses. */
  function makeOsmdWithCloneable(over: Parameters<typeof makeOsmd>[0]): OsmdInstanceRef {
    const osmd = makeOsmd(over) as unknown as {
      Sheet: { SourceMeasures: Array<{ AbsoluteTimestamp: { realValue: number } }> };
    } & OsmdInstanceRef;
    for (const m of osmd.Sheet.SourceMeasures) {
      const realValue = m.AbsoluteTimestamp.realValue;
      m.AbsoluteTimestamp = {
        realValue,
        clone: () => ({
          realValue,
          Add: (other: { n?: number; d?: number }) => {
            // record the add — no-op on realValue for assertions below
            void other;
          },
        }),
      } as unknown as { realValue: number };
    }
    return osmd;
  }

  it('seeds cursor.iterator from a sheet timestamp built from the target', () => {
    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({ cursorElement: { offsetTop: 0 } });
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fake.Lib,
    });
    cursor.setCursorToNote({ measureIdx: 2, inBarQuarters: 1 });
    // MusicPartManagerIterator constructed once with our sheet.
    expect(fake.constructorCalls).toHaveLength(1);
    expect(fake.constructorCalls[0].sheet).toBe(osmd.Sheet);
    // Fraction(24, 96) added — 1 quarter = 24/96 whole.
    expect(fake.addedFractions).toEqual([{ n: 24, d: 96 }]);
  });

  it('does NOT add a Fraction when inBarQuarters is 0 (start of measure)', () => {
    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({ cursorElement: { offsetTop: 0 } });
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fake.Lib,
    });
    cursor.setCursorToNote({ measureIdx: 3, inBarQuarters: 0 });
    expect(fake.addedFractions).toEqual([]);
    expect(fake.constructorCalls).toHaveLength(1);
  });

  it('calls cursor.update() after seeding the iterator', () => {
    const fake = makeFakeLib();
    const update = vi.fn();
    const osmd = makeOsmdWithCloneable({ cursorElement: { offsetTop: 0 } });
    osmd.cursor!.update = update;
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fake.Lib,
    });
    cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 2 });
    expect(update).toHaveBeenCalledOnce();
  });

  it('no-op when getLib is not provided (test fixtures + older OSMD)', () => {
    const osmd = makeOsmdWithCloneable({ cursorElement: { offsetTop: 0 } });
    const update = vi.fn();
    osmd.cursor!.update = update;
    const cursor = createOsmdCursor({ getOsmd: () => osmd });
    cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it('no-op when MusicPartManagerIterator missing from lib', () => {
    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({ cursorElement: { offsetTop: 0 } });
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => ({ Fraction: fake.Lib.Fraction }), // no iterator ctor
    });
    expect(() => cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 })).not.toThrow();
    expect(fake.Lib.MusicPartManagerIterator).not.toHaveBeenCalled();
  });

  it('no-op when target is null/undefined', () => {
    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({ cursorElement: { offsetTop: 0 } });
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fake.Lib,
    });
    cursor.setCursorToNote(null as unknown as { measureIdx: number; inBarQuarters: number });
    expect(fake.Lib.MusicPartManagerIterator).not.toHaveBeenCalled();
  });

  it('no-op when osmd.cursor missing', () => {
    const fake = makeFakeLib();
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ noCursor: true }),
      getLib: () => fake.Lib,
    });
    expect(() => cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 })).not.toThrow();
    expect(fake.Lib.MusicPartManagerIterator).not.toHaveBeenCalled();
  });

  it('swallows errors from the iterator constructor', () => {
    const fake = makeFakeLib();
    fake.Lib.MusicPartManagerIterator.mockImplementationOnce(() => {
      throw new Error('iterator ctor boom');
    });
    const osmd = makeOsmdWithCloneable({ cursorElement: { offsetTop: 0 } });
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getLib: () => fake.Lib,
    });
    expect(() => cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 })).not.toThrow();
  });

  it('stretches cursor element upward when a notehead lies above the staff bar', () => {
    // OSMD sizes the cursor to span only the staff lines. Very high notes
    // (e.g. Eb7 with ledger lines) render above the cursor top and appear
    // visually disconnected from the blue bar. stretchCursorToNotes fixes
    // this by adjusting style.top / style.height after cursor.update().
    const { cursorEl } = makeScorePanelFixture({ cursorTop: 300, panelHeight: 400 });
    cursorEl.style.top = '300px';
    cursorEl.style.height = '120px'; // cursor spans 300-420 viewport

    const noteG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const notePath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    ) as SVGPathElement;
    // Notehead 50px above cursor top (viewport 250) and well within cursor bottom.
    notePath.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: 250,
          bottom: 270,
          left: 50,
          right: 60,
          width: 10,
          height: 20,
          x: 50,
          y: 250,
          toJSON: () => ({}),
        }) as DOMRect
    );
    noteG.appendChild(notePath);

    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [{ getSVGGElement: () => noteG }],
    });
    const cursor = createOsmdCursor({ getOsmd: () => osmd, getLib: () => fake.Lib });

    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });

    // Cursor top should have moved up by 50px (300→250), height extended by 50px.
    expect(parseFloat(cursorEl.style.top)).toBeCloseTo(250, 0);
    expect(parseFloat(cursorEl.style.height)).toBeCloseTo(170, 0);
  });

  it('stretches cursor element downward when a notehead lies below the staff bar', () => {
    // makeScorePanelFixture mocks getBoundingClientRect to {top:200, bot:320}
    // (cursorTop + fixed 120px). Note at bottom=360 → extendDown=40.
    const { cursorEl } = makeScorePanelFixture({ cursorTop: 200, panelHeight: 400 });
    cursorEl.style.top = '200px';
    cursorEl.style.height = '120px'; // matches mocked getBCR height

    const noteG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const notePath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    ) as SVGPathElement;
    // Notehead bottom 40px below cursor bottom (320 → 360).
    notePath.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: 340,
          bottom: 360,
          left: 50,
          right: 60,
          width: 10,
          height: 20,
          x: 50,
          y: 340,
          toJSON: () => ({}),
        }) as DOMRect
    );
    noteG.appendChild(notePath);

    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [{ getSVGGElement: () => noteG }],
    });
    const cursor = createOsmdCursor({ getOsmd: () => osmd, getLib: () => fake.Lib });

    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });

    // Top unchanged, height extended by 40px (120→160).
    expect(parseFloat(cursorEl.style.top)).toBeCloseTo(200, 0);
    expect(parseFloat(cursorEl.style.height)).toBeCloseTo(160, 0);
  });

  it('does not modify cursor element when all noteheads are within bounds', () => {
    const { cursorEl } = makeScorePanelFixture({ cursorTop: 200, panelHeight: 400 });
    cursorEl.style.top = '200px';
    cursorEl.style.height = '100px';

    const noteG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const notePath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    ) as SVGPathElement;
    // Notehead within cursor bounds (220-240 is inside 200-300).
    notePath.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: 220,
          bottom: 240,
          left: 50,
          right: 60,
          width: 10,
          height: 20,
          x: 50,
          y: 220,
          toJSON: () => ({}),
        }) as DOMRect
    );
    noteG.appendChild(notePath);

    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [{ getSVGGElement: () => noteG }],
    });
    const cursor = createOsmdCursor({ getOsmd: () => osmd, getLib: () => fake.Lib });

    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });

    expect(cursorEl.style.top).toBe('200px');
    expect(cursorEl.style.height).toBe('100px');
  });

  // Regression-blocks the 2026-05-12 unbounded-height bug: OSMD doesn't
  // reset style.height between cursor.update() calls, and the original
  // stretchCursorToNotes added (extendUp + extendDown) to the
  // previously-stretched height every call. Production log showed the
  // cursor element growing from 130px to 12000+ over a 2-minute session.
  // The fix stashes prev stretch deltas on dataset and undoes them
  // before each new stretch.
  it('does not accumulate stretch across repeated cursor.update() calls', () => {
    const { cursorEl } = makeScorePanelFixture({ cursorTop: 300, panelHeight: 400 });
    cursorEl.style.top = '300px';
    cursorEl.style.height = '120px';

    const noteG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    const notePath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    ) as SVGPathElement;
    // Notehead 50px above the cursor — extendUp=50 every call.
    notePath.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: 250,
          bottom: 270,
          left: 50,
          right: 60,
          width: 10,
          height: 20,
          x: 50,
          y: 250,
          toJSON: () => ({}),
        }) as DOMRect
    );
    noteG.appendChild(notePath);

    const fake = makeFakeLib();
    const osmd = makeOsmdWithCloneable({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [{ getSVGGElement: () => noteG }],
    });
    const cursor = createOsmdCursor({ getOsmd: () => osmd, getLib: () => fake.Lib });

    // First call: extendUp=50, height should be 120+50=170, top should be
    // 300-50=250.
    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });
    expect(parseFloat(cursorEl.style.top)).toBeCloseTo(250, 0);
    expect(parseFloat(cursorEl.style.height)).toBeCloseTo(170, 0);

    // Second call with same notehead position: undo the previous 50px
    // stretch first, then re-apply. Result should stay at the same 170px
    // — NOT grow to 220, 270, … as the buggy version did.
    cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });
    expect(parseFloat(cursorEl.style.top)).toBeCloseTo(250, 0);
    expect(parseFloat(cursorEl.style.height)).toBeCloseTo(170, 0);

    // Many more calls — stretch must remain stable.
    for (let i = 0; i < 50; i++) {
      cursor.setCursorToNote({ measureIdx: 0, inBarQuarters: 0 });
    }
    expect(parseFloat(cursorEl.style.top)).toBeCloseTo(250, 0);
    expect(parseFloat(cursorEl.style.height)).toBeCloseTo(170, 0);
  });
});
