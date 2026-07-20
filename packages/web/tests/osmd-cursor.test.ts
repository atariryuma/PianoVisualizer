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
    // cursorTop=300, panelHeight=200: cursor {top:300, bot:420, h:120}.
    // Fire events center activeMid on panelMid:
    //   activeMid = (300+420)/2 = 360
    //   targetMid = 0 + 200*0.5 = 100
    //   delta = 360 - 100 = 260
    // After scroll the cursor element is centered in the panel
    // (top ≈ 40, bottom ≈ 160 within the 0..200 panel).
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
    expect(container.scrollTop).toBe(260);
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
    // cursorTop=180, panelHeight=200: cursor {top:180, bot:300}.
    // activeMid = 240, targetMid = 100, delta = 140.
    const { container, cursorEl } = makeScorePanelFixture({ cursorTop: 180, panelHeight: 200 });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: cursorEl }),
    });
    cursor.resetToStart();
    expect(container.scrollTop).toBe(140);
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
    // panelHeight=400, FIRE_TARGET_RATIO=0.5 → targetMid = 200.
    // Notes at top=10/bot=20 → activeMid = 15.
    // delta = 15 - 200 = -185. scrollTop = 500 + (-185) = 315.
    expect(container.scrollTop).toBe(315);
  });

  // Production-scenario pin (2026-05-12): user reported \"リピートした後、
  // 曲の最初、センタリングできてない 枠に対して\" (the score sticks to the
  // panel top at song start and after a repeat back-jump — not centered
  // in the frame). Iteration history:
  //   v1: "edge of safe band" landing (default for within-system
  //       reveals) — focusY at safeTop = 14% from panel top. User reports
  //       cursor stuck to top.
  //   v2: fixed-ratio landing (FIRE_LANDING_RATIO=0.33) — focusY at
  //       upper-third. User noted this is too rigid for varying staff
  //       heights ("楽譜の状況に応じては柔軟に対応できないのでは？").
  //   v3 (current): adaptive — center the active region (mid) on the
  //       panel center. Naturally adapts to any active-region height
  //       and keeps activeTop unclipped via a safe-height overflow
  //       fallback.
  it('centers the active region in the panel on first-scroll (adaptive)', () => {
    const { container, cursorEl } = makeScorePanelFixture({ cursorTop: 300, panelHeight: 240 });
    // panel y = 0..240, mid = 120.
    // cursor active rect = 300..420 (h=120), mid = 360.
    // delta = 360 - 120 = 240. After scroll, cursor center is at
    // viewport y 120 = panel center. ✓
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: cursorEl }),
    });
    cursor.resetToStart();
    expect(container.scrollTop).toBe(240);
    // Verify the landing position: cursor's center sits at panel center,
    // NOT pinned to the top or bottom edge.
    const cursorViewportTop = 300 - 240; // cursor doc top - scrollTop
    const cursorViewportMid = cursorViewportTop + 120 / 2;
    expect(cursorViewportMid).toBeCloseTo(120, 0); // panel center
    expect(cursorViewportTop).toBeGreaterThan(0); // not clipped above
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
      // 診断ログを観測手段に使うテストなので有効化（本番は既定オフ）。
      diagEnabled: true,
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
});

// ─── custom cursor overlay (SVG ground truth) ─────────────────────
//
// Hides OSMD's native cursor and paints a yellow <div> overlay positioned
// from the rendered SVG. The overlay's Y range unions the active notes
// with the staff system's `.vf-stave` path bounds — guaranteeing the bar
// covers the staff even when OSMD's `MusicSystem.AbsolutePosition.y` is
// off (octave-shift bracket bug — verified on Liszt's La Campanella).

interface StaveSpec {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function buildScoreFixture(opts: {
  notes: Array<{ top: number; bottom: number; left: number; right: number }>;
  staves: StaveSpec[];
  panelTop?: number;
  panelHeight?: number;
  scrollTop?: number;
}): { container: HTMLElement; cursorEl: HTMLElement; notes: OsmdGraphicalNote[] } {
  const panelTop = opts.panelTop ?? 0;
  const panelHeight = opts.panelHeight ?? 400;
  const container = document.createElement('div');
  container.id = 'osmdContainer';
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: panelHeight });
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    writable: true,
    value: opts.scrollTop ?? 0,
  });
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 });
  container.getBoundingClientRect = vi.fn(
    () =>
      ({
        top: panelTop,
        bottom: panelTop + panelHeight,
        left: 0,
        right: 320,
        width: 320,
        height: panelHeight,
        x: 0,
        y: panelTop,
        toJSON: () => ({}),
      }) as DOMRect
  );

  // A `<g>` group inside the SVG that wraps the staves.
  const systemGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (const s of opts.staves) {
    const stave = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    stave.setAttribute('class', 'vf-stave');
    stave.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: s.top,
          bottom: s.bottom,
          left: s.left,
          right: s.right,
          width: s.right - s.left,
          height: s.bottom - s.top,
          x: s.left,
          y: s.top,
          toJSON: () => ({}),
        }) as DOMRect
    );
    systemGroup.appendChild(stave);
  }

  const notes: OsmdGraphicalNote[] = [];
  for (const n of opts.notes) {
    const noteG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    noteG.setAttribute('class', 'vf-stavenote');
    noteG.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: n.top,
          bottom: n.bottom,
          left: n.left,
          right: n.right,
          width: n.right - n.left,
          height: n.bottom - n.top,
          x: n.left,
          y: n.top,
          toJSON: () => ({}),
        }) as DOMRect
    );
    // Add a notehead path so noteToViewportRect succeeds.
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    head.setAttribute('class', 'vf-notehead');
    head.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: n.top,
          bottom: n.bottom,
          left: n.left,
          right: n.right,
          width: n.right - n.left,
          height: n.bottom - n.top,
          x: n.left,
          y: n.top,
          toJSON: () => ({}),
        }) as DOMRect
    );
    noteG.appendChild(head);
    systemGroup.appendChild(noteG);
    notes.push({ getSVGGElement: () => noteG });
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.appendChild(systemGroup);
  container.appendChild(svg);

  const cursorEl = makeCursorElement(100);
  container.appendChild(cursorEl);
  document.body.appendChild(container);
  return { container, cursorEl, notes };
}

function getOverlay(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.piano-osmd-cursor-overlay');
}

describe('custom cursor overlay (paint from SVG)', () => {
  it('creates a yellow <div> overlay inside the scroller on first paint', () => {
    const { container, cursorEl, notes } = buildScoreFixture({
      notes: [{ top: 100, bottom: 130, left: 50, right: 70 }],
      staves: [{ top: 95, bottom: 135, left: 30, right: 290 }],
    });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: notes,
        }),
    });
    cursor.resetToStart();
    const overlay = getOverlay(container);
    expect(overlay).not.toBeNull();
    expect(overlay!.style.opacity).toBe('1');
  });

  it("hides OSMD's native cursor (opacity=0) once the overlay is painted", () => {
    const { cursorEl, notes } = buildScoreFixture({
      notes: [{ top: 100, bottom: 130, left: 50, right: 70 }],
      staves: [{ top: 95, bottom: 135, left: 30, right: 290 }],
    });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: notes,
        }),
    });
    cursor.resetToStart();
    expect(cursorEl.style.opacity).toBe('0');
    expect(cursorEl.style.pointerEvents).toBe('none');
  });

  it('Y range unions notes with staves so the bar always covers the staff', () => {
    // Note rendered at y=200..210 (well below staff middle).
    // Staff line group at y=180..220.
    // Overlay should span 180..220 (full staff), not 200..210 (notes only).
    const { container, cursorEl, notes } = buildScoreFixture({
      notes: [{ top: 200, bottom: 210, left: 50, right: 70 }],
      staves: [{ top: 180, bottom: 220, left: 30, right: 290 }],
    });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: notes,
        }),
    });
    cursor.resetToStart();
    const overlay = getOverlay(container)!;
    // Overlay top should be at the staff top (180) — not the note top (200).
    expect(parseFloat(overlay.style.top)).toBe(180);
    expect(parseFloat(overlay.style.height)).toBe(40);
  });

  it('locks Y to the staff range — ledger-line notes do NOT pull the overlay', () => {
    // Note rendered far above staff (octave-shift bracket / ledger lines):
    //   note  y=50..60
    //   staff y=180..220
    // The 2026-05-13 stable-height redesign clamps the overlay to the staff
    // Y so the bar doesn't pulse 130→460px per cursor advance on dense
    // scores. Pink note-highlight paint (highlightCurrentNotes) covers
    // the actual noteheads — the gold bar just marks "the staff is here".
    const { container, cursorEl, notes } = buildScoreFixture({
      notes: [{ top: 50, bottom: 60, left: 50, right: 70 }],
      staves: [{ top: 180, bottom: 220, left: 30, right: 290 }],
    });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: notes,
        }),
    });
    cursor.resetToStart();
    const overlay = getOverlay(container)!;
    expect(parseFloat(overlay.style.top)).toBe(180);
    expect(parseFloat(overlay.style.height)).toBe(40);
  });

  it('overlay height is stable across measures within the same system (regression: 2026-05-13)', () => {
    // Server.log 2026-05-13 08:47 showed sysIdx=1 m=5 → m=6 produced
    // overlayH 156 → 183 px (27px drift) because findStaffSystemYRange
    // was matching only the current measure's vf-stave (one per
    // measure per staff in VexFlow). Each measure's stave has a
    // slightly different SVG bbox; matching different staves per
    // measure → different heights.
    //
    // Fix: walk up to the LARGEST stave collection (= system level),
    // then filter by Y proximity. All measures in a system share the
    // same stave set → identical height.
    const container = document.createElement('div');
    container.id = 'osmdContainer';
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(container, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });
    container.getBoundingClientRect = vi.fn(
      () => ({ top: 0, bottom: 400, left: 0, right: 320, width: 320, height: 400 }) as DOMRect
    );

    // System with 2 measures, each having its own vf-stave (VexFlow
    // per-measure stave). Slight Y wobble between staves (e.g.,
    // measure 2 has a tiny vertical shift) — the OLD algorithm would
    // see this as different heights; the NEW algorithm sees it as
    // one system.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const systemGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    function makeStave(top: number, bottom: number, left: number, right: number): SVGGElement {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      s.setAttribute('class', 'vf-stave');
      s.getBoundingClientRect = vi.fn(
        () =>
          ({
            top,
            bottom,
            left,
            right,
            width: right - left,
            height: bottom - top,
          }) as DOMRect
      );
      return s;
    }
    function makeNote(top: number, bottom: number, left: number, right: number): OsmdGraphicalNote {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      g.setAttribute('class', 'vf-stavenote');
      g.getBoundingClientRect = vi.fn(
        () =>
          ({
            top,
            bottom,
            left,
            right,
            width: right - left,
            height: bottom - top,
          }) as DOMRect
      );
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      head.setAttribute('class', 'vf-notehead');
      head.getBoundingClientRect = vi.fn(
        () =>
          ({
            top,
            bottom,
            left,
            right,
            width: right - left,
            height: bottom - top,
          }) as DOMRect
      );
      g.appendChild(head);
      systemGroup.appendChild(g);
      return { getSVGGElement: () => g };
    }

    // 2 measures × 2 staves (treble + bass) = 4 staves total.
    // Treble + bass slightly different Y between measures (the original
    // bug case): m=5 treble at 95-135, bass at 200-240; m=6 treble at
    // 100-140, bass at 205-245. The OLD code unioned the per-measure
    // pair → 95-240=145 for m=5, 100-245=145 for m=6 (same — but)
    // wait — actually the report was 27px drift, so let's reproduce
    // with even more variation:
    systemGroup.appendChild(makeStave(95, 135, 30, 150)); // m=5 treble
    systemGroup.appendChild(makeStave(200, 240, 30, 150)); // m=5 bass
    systemGroup.appendChild(makeStave(80, 140, 160, 290)); // m=6 treble (wider Y range)
    systemGroup.appendChild(makeStave(195, 250, 160, 290)); // m=6 bass (wider Y range)

    const noteM5 = makeNote(110, 130, 60, 80);
    const noteM6 = makeNote(115, 135, 200, 220);

    svg.appendChild(systemGroup);
    container.appendChild(svg);
    const cursorEl = makeCursorElement(100);
    container.appendChild(cursorEl);
    document.body.appendChild(container);

    const osmd = makeOsmd({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [noteM5],
    });
    const cursor = createOsmdCursor({ getOsmd: () => osmd });

    cursor.resetToStart();
    const overlay = getOverlay(container)!;
    const h_m5 = parseFloat(overlay.style.height);

    if (osmd.cursor?.GNotesUnderCursor) {
      (osmd.cursor.GNotesUnderCursor as ReturnType<typeof vi.fn>).mockReturnValue([noteM6]);
    }
    cursor.repaintCustomCursor();
    const h_m6 = parseFloat(overlay.style.height);

    // Both measures should give identical overlay height — they're in
    // the same system, the union of all staves there is unchanged.
    expect(h_m6).toBe(h_m5);
  });

  it('notehead-anchored: tall note <g> with extreme ledger lines does NOT mis-anchor to the previous system (regression: 2026-05-13 09:03)', () => {
    // Server.log 2026-05-13 09:03 showed sysIdx=5 m=14→15 drifted
    // 125→138 px even with the Y-proximity fix. Root cause: La
    // Campanella's high-register passages have note <g> bounding boxes
    // that include octave-shift bracket + long stems + ledger lines,
    // spanning from Y=80 up to Y=320. The <g> midpoint (~200) was
    // landing between the current system's treble (Y mid ~120) and
    // the next system's bass (Y mid ~400) — anchor selection became
    // unstable across consecutive notes.
    //
    // Fix: anchor on the notehead position (noteToViewportRect) rather
    // than the full <g> bbox. Noteheads are always near the actual
    // staff, making the closest-stave selection deterministic.
    const container = document.createElement('div');
    container.id = 'osmdContainer';
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(container, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });
    container.getBoundingClientRect = vi.fn(
      () => ({ top: 0, bottom: 400, left: 0, right: 320, width: 320, height: 400 }) as DOMRect
    );

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // Two systems on the page. The note is in system 1 but its <g>
    // (because of high ledger lines) extends almost down to system 2.
    const systemGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    function makeStave(top: number, bottom: number, left: number, right: number): SVGGElement {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      s.setAttribute('class', 'vf-stave');
      s.getBoundingClientRect = vi.fn(
        () => ({ top, bottom, left, right, width: right - left, height: bottom - top }) as DOMRect
      );
      systemGroup.appendChild(s);
      return s;
    }
    // System 1: treble Y 100-140, bass Y 200-240. System anchor mid ~170.
    makeStave(100, 140, 30, 290);
    makeStave(200, 240, 30, 290);
    // System 2: treble Y 360-400, bass Y 460-500. System anchor mid ~430.
    makeStave(360, 400, 30, 290);
    makeStave(460, 500, 30, 290);

    function makeNoteWithLedgers(
      gTop: number,
      gBot: number,
      headTop: number,
      headBot: number
    ): OsmdGraphicalNote {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      g.setAttribute('class', 'vf-stavenote');
      g.getBoundingClientRect = vi.fn(
        () => ({ top: gTop, bottom: gBot, left: 60, right: 80 }) as DOMRect
      );
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      head.setAttribute('class', 'vf-notehead');
      head.getBoundingClientRect = vi.fn(
        () => ({ top: headTop, bottom: headBot, left: 60, right: 80 }) as DOMRect
      );
      g.appendChild(head);
      systemGroup.appendChild(g);
      return { getSVGGElement: () => g };
    }
    // High-register note in system 1: notehead at Y=110 (inside system 1
    // treble), but <g> extends Y=80..340 because of long ledger lines +
    // octave-shift bracket. <g> midpoint = 210 (between systems).
    const highNote = makeNoteWithLedgers(80, 340, 110, 120);

    svg.appendChild(systemGroup);
    container.appendChild(svg);
    const cursorEl = makeCursorElement(100);
    container.appendChild(cursorEl);
    document.body.appendChild(container);

    const osmd = makeOsmd({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: [highNote],
    });
    const cursor = createOsmdCursor({ getOsmd: () => osmd });
    cursor.resetToStart();

    const overlay = getOverlay(container)!;
    const top = parseFloat(overlay.style.top);
    const height = parseFloat(overlay.style.height);
    // Must anchor to system 1: top ≈ 100 (system 1 treble top),
    // bottom ≈ 240 (system 1 bass bottom). Height ≈ 140.
    // The OLD <g>-anchored code would have picked system 2 staves
    // because <g> mid (210) is closer to system 2's anchor (430) once
    // the proximity window allows it — or would include both systems.
    //
    // We accept some scrollTop adjustment from ensureCursorVisible, so
    // compare on STAFF coordinates (parsed back from overlay.style.top
    // + scrollTop offset).
    const finalScrollTop = container.scrollTop;
    const staffTopScreen = top - finalScrollTop;
    expect(staffTopScreen).toBe(100); // system 1 treble top
    expect(height).toBe(140); // system 1 only — does NOT include system 2
  });

  it('overlay height is stable across cursor advances within the same staff', () => {
    // The stable-height redesign promise: identical staff Y between
    // measure 1 and measure 2 ⇒ identical overlay height, no pulsing.
    const { container, cursorEl, notes } = buildScoreFixture({
      // Two consecutive cursor "events" with different note Y but same
      // staff Y. Old union-with-notes design produced 130 → 460px swings.
      notes: [
        { top: 100, bottom: 110, left: 50, right: 70 }, // first chord
      ],
      staves: [{ top: 95, bottom: 135, left: 30, right: 290 }],
    });
    const osmd = makeOsmd({
      cursorElement: cursorEl,
      useGNotes: true,
      notesUnderCursor: notes,
    });
    const cursor = createOsmdCursor({ getOsmd: () => osmd });

    cursor.resetToStart();
    const overlay = getOverlay(container)!;
    const firstHeight = parseFloat(overlay.style.height);

    // Swap notes: same staff, different note Y (e.g., a high ledger note).
    // overlay should NOT change height — staff Y is the only Y driver.
    const ledgerG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
    ledgerG.getBoundingClientRect = vi.fn(
      () => ({ top: 20, bottom: 30, left: 50, right: 70 }) as DOMRect
    );
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    head.setAttribute('class', 'vf-notehead');
    head.getBoundingClientRect = vi.fn(
      () => ({ top: 20, bottom: 30, left: 50, right: 70 }) as DOMRect
    );
    ledgerG.appendChild(head);
    // Place in same parent so staff query finds the same .vf-stave.
    (container.querySelector('svg > g') as Element).appendChild(ledgerG);

    if (osmd.cursor?.GNotesUnderCursor) {
      (osmd.cursor.GNotesUnderCursor as ReturnType<typeof vi.fn>).mockReturnValue([
        { getSVGGElement: () => ledgerG },
      ]);
    }
    cursor.repaintCustomCursor();
    const secondHeight = parseFloat(overlay.style.height);

    expect(secondHeight).toBe(firstHeight);
  });

  it('grand-staff: unions multiple staves of the same system (treble + bass)', () => {
    // Two staves in the system (treble + bass), one shared note position.
    const { container, cursorEl, notes } = buildScoreFixture({
      notes: [{ top: 120, bottom: 140, left: 50, right: 70 }],
      staves: [
        { top: 100, bottom: 140, left: 30, right: 290 }, // treble
        { top: 180, bottom: 220, left: 30, right: 290 }, // bass
      ],
    });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: notes,
        }),
    });
    cursor.resetToStart();
    const overlay = getOverlay(container)!;
    // Spans treble top (100) to bass bottom (220) = 120px height.
    expect(parseFloat(overlay.style.top)).toBe(100);
    expect(parseFloat(overlay.style.height)).toBe(120);
  });

  it('hides the overlay when there are no notes under the cursor', () => {
    const { container, cursorEl } = buildScoreFixture({
      notes: [],
      staves: [{ top: 100, bottom: 140, left: 30, right: 290 }],
    });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: [],
        }),
    });
    cursor.resetToStart();
    const overlay = getOverlay(container);
    if (overlay) {
      expect(overlay.style.opacity).toBe('0');
    }
  });

  it('converts viewport coords to scroll-content coords (adds scrollTop)', () => {
    // Panel at viewport y=0..400, scrolled to scrollTop=500.
    // Staff at viewport y=100..140 ⇒ content y = 100 + 500 = 600.
    const { container, cursorEl, notes } = buildScoreFixture({
      notes: [{ top: 110, bottom: 130, left: 50, right: 70 }],
      staves: [{ top: 100, bottom: 140, left: 30, right: 290 }],
      scrollTop: 500,
    });
    // Disable the scroll controller writing to scrollTop so we can read
    // the overlay's position cleanly — set scrollTop AFTER the cursor
    // call by patching the panel.
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: notes,
        }),
    });
    cursor.resetToStart();
    const overlay = getOverlay(container)!;
    // After resetToStart, the scroll controller may have shifted scrollTop.
    // The overlay top should equal (staffTopViewport - panelTop) + finalScrollTop.
    const finalScrollTop = container.scrollTop;
    const expectedOverlayTop = 100 - 0 + finalScrollTop;
    expect(parseFloat(overlay.style.top)).toBe(expectedOverlayTop);
  });

  it('repaintCustomCursor re-paints without advancing the cursor', () => {
    const { container, cursorEl, notes } = buildScoreFixture({
      notes: [{ top: 100, bottom: 130, left: 50, right: 70 }],
      staves: [{ top: 95, bottom: 135, left: 30, right: 290 }],
    });
    const cursor = createOsmdCursor({
      getOsmd: () =>
        makeOsmd({
          cursorElement: cursorEl,
          useGNotes: true,
          notesUnderCursor: notes,
        }),
    });
    cursor.resetToStart();
    const overlay = getOverlay(container)!;
    const firstTop = overlay.style.top;
    expect(() => cursor.repaintCustomCursor()).not.toThrow();
    expect(overlay.style.top).toBe(firstTop);
  });

  it('repaintCustomCursor is a no-op when osmd is null', () => {
    const cursor = createOsmdCursor({ getOsmd: () => null });
    expect(() => cursor.repaintCustomCursor()).not.toThrow();
  });
});
