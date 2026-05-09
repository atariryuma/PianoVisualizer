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
  cursorElement?: { offsetTop: number; offsetHeight?: number } | null;
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

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── scrollToCursor ────────────────────────────────────────────────

describe('scrollToCursor', () => {
  it('no-op when container is null', () => {
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 100 } }),
      getContainer: () => null,
    });
    expect(() => cursor.scrollToCursor()).not.toThrow();
  });

  it('no-op when osmd has no cursor element', () => {
    const container = makeContainer();
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: null }),
      getContainer: () => container,
    });
    cursor.scrollToCursor();
    expect(container.scrollTop).toBe(0);
  });

  it('scrolls when cursor is below the visible area', () => {
    // viewH = 400, scrollTop = 0 → visible 0..400. Cursor at 500 is below.
    const container: ReturnType<typeof makeContainer> = { scrollTop: 0, clientHeight: 400 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 500, offsetHeight: 30 } }),
      getContainer: () => container,
      now: () => 1000,
    });
    cursor.scrollToCursor();
    expect(container.scrollTop).toBeGreaterThan(0);
  });

  it('scrolls when cursor is above the visible area', () => {
    const container: ReturnType<typeof makeContainer> = { scrollTop: 600, clientHeight: 400 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 100, offsetHeight: 30 } }),
      getContainer: () => container,
      now: () => 1000,
    });
    cursor.scrollToCursor();
    // Should have scrolled UP; new scrollTop = max(0, cTop - viewH/3) = max(0, 100-133) = 0
    expect(container.scrollTop).toBe(0);
  });

  it('no scroll when cursor is fully in view', () => {
    const container: ReturnType<typeof makeContainer> = { scrollTop: 0, clientHeight: 400 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 100, offsetHeight: 30 } }),
      getContainer: () => container,
      now: () => 1000,
    });
    cursor.scrollToCursor();
    expect(container.scrollTop).toBe(0);
  });

  it('throttles to 100 ms by default', () => {
    let t = 1000;
    const container: ReturnType<typeof makeContainer> = { scrollTop: 0, clientHeight: 400 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 500 } }),
      getContainer: () => container,
      now: () => t,
    });
    cursor.scrollToCursor();
    const after1 = container.scrollTop;
    container.scrollTop = 0; // reset
    t = 1050; // 50 ms later
    cursor.scrollToCursor();
    expect(container.scrollTop).toBe(0); // throttled
    t = 1101;
    cursor.scrollToCursor();
    expect(container.scrollTop).toBeGreaterThan(0);
    expect(after1).toBeGreaterThan(0);
  });

  it('resetScrollThrottle bypasses the gate', () => {
    let t = 1000;
    const container: ReturnType<typeof makeContainer> = { scrollTop: 0, clientHeight: 400 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 500 } }),
      getContainer: () => container,
      now: () => t,
    });
    cursor.scrollToCursor();
    container.scrollTop = 0;
    t = 1050;
    cursor.scrollToCursor();
    expect(container.scrollTop).toBe(0); // throttled
    cursor.resetScrollThrottle();
    cursor.scrollToCursor();
    expect(container.scrollTop).toBeGreaterThan(0); // bypassed
  });

  // Adaptive placement: 1/3-from-top when the cursor fits, centered
  // otherwise. Pinned because grand-staff cursors used to overflow the
  // bottom of small viewports (the bass clef would fall off-screen).
  it('keeps legacy 1/3-from-top placement when cursor + 1/3 padding fits', () => {
    const container: ReturnType<typeof makeContainer> = { scrollTop: 0, clientHeight: 400 };
    // cH=200, viewH=400 → cH + viewH/3 = 333 ≤ 400, fits with 1/3 padding.
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 600, offsetHeight: 200 } }),
      getContainer: () => container,
      now: () => 1000,
    });
    cursor.scrollToCursor();
    expect(container.scrollTop).toBeCloseTo(600 - 400 / 3, 0);
  });

  it('centers a tall cursor that would overflow the bottom under 1/3 placement', () => {
    // viewH=364, cH=345 — actual phone-portrait grand-staff case.
    const container: ReturnType<typeof makeContainer> = { scrollTop: 0, clientHeight: 364 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 15284, offsetHeight: 345 } }),
      getContainer: () => container,
      now: () => 1000,
    });
    cursor.scrollToCursor();
    expect(container.scrollTop).toBeCloseTo(15284 - (364 - 345) / 2, 0);
    // cursor fully in view: cTop ≥ scrollTop AND cTop+cH ≤ scrollTop+viewH
    expect(15284 >= container.scrollTop).toBe(true);
    expect(15284 + 345 <= container.scrollTop + container.clientHeight).toBe(true);
  });

  it('centers an oversized cursor (cH > viewH) so overflow is symmetric', () => {
    // viewH=364, cH=460 — cursor 26 % taller than viewport; no scroll
    // target fits the whole element, so symmetric overflow is the goal.
    const container: ReturnType<typeof makeContainer> = { scrollTop: 0, clientHeight: 364 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ cursorElement: { offsetTop: 20000, offsetHeight: 460 } }),
      getContainer: () => container,
      now: () => 1000,
    });
    cursor.scrollToCursor();
    expect(container.scrollTop).toBeCloseTo(20000 + (460 - 364) / 2, 0);
    const overflowTop = container.scrollTop - 20000;
    const overflowBot = 20000 + 460 - (container.scrollTop + 364);
    expect(overflowTop).toBe(overflowBot);
  });
});

// ─── resetToStart ──────────────────────────────────────────────────

describe('resetToStart', () => {
  it('calls cursor.reset and scrolls container to top', () => {
    const reset = vi.fn();
    const container: ReturnType<typeof makeContainer> = { scrollTop: 999, clientHeight: 400 };
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ reset, cursorElement: { offsetTop: 100 } }),
      getContainer: () => container,
    });
    cursor.resetToStart();
    expect(reset).toHaveBeenCalledOnce();
    expect(container.scrollTop).toBe(0);
  });

  it('no-op when osmd cursor missing', () => {
    const cursor = createOsmdCursor({
      getOsmd: () => ({ cursor: null }),
      getContainer: () => makeContainer(),
    });
    expect(() => cursor.resetToStart()).not.toThrow();
  });

  it('swallows reset() throws', () => {
    const reset = vi.fn(() => {
      throw new Error('reset boom');
    });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ reset, cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
    });
    expect(() => cursor.resetToStart()).not.toThrow();
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

  // Tie-aware highlighting (server.log analysis 2026-05-09): GNotesUnderCursor
  // returns graphical notes anchored to the tie's START system, causing the
  // pink highlight to drift away from the cursor as the song progresses.
  // The fix replicates OSMD's playback-side "audible entries" filter:
  //   1. skip tie continuations (note.NoteTie.StartNote !== note),
  //   2. resolve graphical notes via findGraphicalStaffEntryFromMeasureList
  //      so they land on the iterator's CURRENT measure, not the tie start.
  describe('tie-aware highlighting (path A: osmd.GraphicSheet present)', () => {
    interface TieFixture {
      sourceNote: object;
      tie: { StartNote: object } | null;
      gn: { getSVGGElement: () => SVGGElement; sourceNote: object };
    }

    function makeTieFixture(): { tieStart: TieFixture; tieContinuation: TieFixture } {
      const startG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      const startP = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      ) as SVGPathElement;
      startG.appendChild(startP);
      const contG = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      const contP = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      ) as SVGPathElement;
      contG.appendChild(contP);
      document.body.append(startG, contG);

      const startNote = {} as object;
      const contNote = {} as object;
      const tie = { StartNote: startNote };
      return {
        tieStart: {
          sourceNote: startNote,
          tie: null,
          gn: { getSVGGElement: () => startG, sourceNote: startNote },
        },
        tieContinuation: {
          sourceNote: contNote,
          tie,
          gn: { getSVGGElement: () => contG, sourceNote: contNote },
        },
      };
    }

    /** Build an OsmdInstanceRef whose iterator + GraphicSheet expose the
     *  internal shape collectStartedAtCursor walks. The voice entries
     *  reference both fixtures so the test can assert which was painted. */
    function osmdWithFixtures(
      fixtures: TieFixture[],
      cursorElement = { offsetTop: 0 }
    ): OsmdInstanceRef {
      const sourceStaffEntry = {
        VerticalContainerParent: { ParentMeasure: { measureListIndex: 5 } },
        ParentStaff: { idInMusicSheet: 0 },
      };
      const voiceEntry = {
        ParentSourceStaffEntry: sourceStaffEntry,
        Notes: fixtures.map((f) => ({
          NoteTie: f.tie,
          // sourceNote isn't a real OSMD field on Note — collectStartedAtCursor
          // identifies a Note via the `note === note` reference, which is
          // already what OSMD's getAudibleEntries uses.
        })),
      };
      // Pair the synthetic Notes back to the fixtures' sourceNote refs so
      // the gn.sourceNote === note check inside collectStartedAtCursor
      // matches: do this by re-pointing the Notes array to the fixtures'
      // sourceNote objects directly.
      voiceEntry.Notes = fixtures.map((f) => ({
        NoteTie: f.tie,
        // tie continuation predicate is `tie && tie.StartNote !== note`; we
        // need `note === sourceNote` so the predicate works on the source
        // identity, and so the gn.sourceNote === note check matches too.
        ...(f.sourceNote as object),
      }));
      // Replace each Note with a stable reference identical to fixture.sourceNote
      // so identity comparison flows end-to-end.
      voiceEntry.Notes = fixtures.map((f) => f.sourceNote as { NoteTie?: typeof f.tie });
      // Set NoteTie on the source-note-shaped Note so the predicate sees it.
      for (let i = 0; i < fixtures.length; i++) {
        (voiceEntry.Notes[i] as { NoteTie: TieFixture['tie'] }).NoteTie = fixtures[i].tie;
      }

      const iterator = {
        endReached: false,
        CurrentMeasureIndex: 5,
        currentTimeStamp: { realValue: 5 },
        CurrentVisibleVoiceEntries: () => [voiceEntry],
      };
      const cursor = {
        cursorElement,
        iterator,
        reset: vi.fn(),
        next: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
      const graphicalStaffEntry = {
        graphicalVoiceEntries: [
          {
            notes: fixtures.map((f) => f.gn),
          },
        ],
      };
      const GraphicSheet = {
        findGraphicalStaffEntryFromMeasureList: (_staff: number, _m: number, _sse: object) =>
          graphicalStaffEntry,
      };
      return { cursor, GraphicSheet } as unknown as OsmdInstanceRef;
    }

    it('paints tie-START notes', () => {
      const { tieStart } = makeTieFixture();
      const cursor = createOsmdCursor({
        getOsmd: () => osmdWithFixtures([tieStart]),
        getContainer: () => makeContainer(),
      });
      cursor.highlightCurrentNotes();
      const startPath = tieStart.gn.getSVGGElement().querySelector('path') as SVGPathElement;
      expect(startPath.style.fill).toBe('#ff3b6b');
    });

    it('skips tie CONTINUATION notes (the desync source)', () => {
      const { tieContinuation } = makeTieFixture();
      const cursor = createOsmdCursor({
        getOsmd: () => osmdWithFixtures([tieContinuation]),
        getContainer: () => makeContainer(),
      });
      cursor.highlightCurrentNotes();
      const contPath = tieContinuation.gn.getSVGGElement().querySelector('path') as SVGPathElement;
      // Tie continuation should NOT be painted — that's the whole fix.
      expect(contPath.style.fill).toBe('');
    });

    it('paints starts AND skips continuations when both are at the cursor', () => {
      const { tieStart, tieContinuation } = makeTieFixture();
      const cursor = createOsmdCursor({
        getOsmd: () => osmdWithFixtures([tieStart, tieContinuation]),
        getContainer: () => makeContainer(),
      });
      cursor.highlightCurrentNotes();
      const startPath = tieStart.gn.getSVGGElement().querySelector('path') as SVGPathElement;
      const contPath = tieContinuation.gn.getSVGGElement().querySelector('path') as SVGPathElement;
      expect(startPath.style.fill).toBe('#ff3b6b');
      expect(contPath.style.fill).toBe('');
    });
  });

  it('falls back to GNotesUnderCursor when osmd.GraphicSheet is missing', () => {
    // Older OSMD builds + the rest of our existing tests don't surface
    // `osmd.GraphicSheet`. The fallback path (legacyGNotesFallback) keeps
    // those scenarios working — this is regression coverage for the
    // fallback itself, since the tie-aware path is preferred when available.
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
});

// ─── setCursorToNote ───────────────────────────────────────────────

describe('setCursorToNote', () => {
  it('skips when iterator is already at target', () => {
    const it = makeIterator({ measureIdx: 2, inBar: 1 });
    const next = vi.fn();
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ iterator: it, next, cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
    });
    cursor.setCursorToNote({ measureIdx: 2, inBarQuarters: 1 });
    expect(next).not.toHaveBeenCalled();
  });

  it('walks forward when target is ahead', () => {
    const it = makeIterator({ measureIdx: 0, inBar: 0 });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ iterator: it, cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
    });
    cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 });
    expect(it.CurrentMeasureIndex).toBe(1);
  });

  it('resets + walks forward when target is behind', () => {
    const it = makeIterator({ measureIdx: 5, inBar: 2 });
    const reset = vi.fn(() => {
      it.CurrentMeasureIndex = 0;
      it.currentTimeStamp.realValue = 0;
    });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ iterator: it, reset, cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
    });
    cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 });
    expect(reset).toHaveBeenCalledOnce();
    expect(it.CurrentMeasureIndex).toBe(1);
  });

  it('resets when iterator endReached', () => {
    const it = makeIterator({ measureIdx: 8, inBar: 0, endReached: true });
    const reset = vi.fn(() => {
      it.endReached = false;
      it.CurrentMeasureIndex = 0;
      it.currentTimeStamp.realValue = 0;
    });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ iterator: it, reset, cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
    });
    cursor.setCursorToNote({ measureIdx: 2, inBarQuarters: 0 });
    expect(reset).toHaveBeenCalledOnce();
  });

  it('safety cap protects against a stuck iterator', () => {
    // next() that throws every call without advancing.
    const it = makeIterator({ measureIdx: 0, inBar: 0 });
    const next = vi.fn(() => {
      throw new Error('grace-note throw');
    });
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ iterator: it, next, cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
      walkSafetyCap: 50,
    });
    cursor.setCursorToNote({ measureIdx: 9, inBarQuarters: 0 });
    expect(next).toHaveBeenCalledTimes(50);
  });

  it('no-op when target is null/undefined', () => {
    const it = makeIterator();
    const next = vi.fn();
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ iterator: it, next, cursorElement: { offsetTop: 0 } }),
      getContainer: () => makeContainer(),
    });
    cursor.setCursorToNote(null as unknown as { measureIdx: number; inBarQuarters: number });
    expect(next).not.toHaveBeenCalled();
  });

  it('no-op when osmd.cursor missing', () => {
    const cursor = createOsmdCursor({
      getOsmd: () => makeOsmd({ noCursor: true }),
      getContainer: () => makeContainer(),
    });
    expect(() => cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 })).not.toThrow();
  });

  // Visual-vs-iterator desync recovery — server.log [DIAG-CURSORSYNC]
  // 2026-05-09 showed cursor.next()'s internal update() throws on
  // grace notes / hidden voices, leaving the visual stranded while
  // the iterator advances. setCursorToNote now drives the iterator
  // directly via moveToNextVisibleVoiceEntry and resyncs the visual
  // via cursor.update() once at the end.
  it('prefers iterator.moveToNextVisibleVoiceEntry over cursor.next() during the walk', () => {
    const it = makeIterator({ measureIdx: 0, inBar: 0 });
    // Wire the iterator-level advance directly. cursor.next() should
    // NOT be called when this is available.
    (
      it as unknown as { moveToNextVisibleVoiceEntry: (g: boolean) => void }
    ).moveToNextVisibleVoiceEntry = vi.fn(() => {
      it.currentTimeStamp.realValue += 0.25;
      const m = Math.floor(it.currentTimeStamp.realValue);
      if (m !== it.CurrentMeasureIndex) it.CurrentMeasureIndex = m;
    });
    const next = vi.fn();
    const update = vi.fn();
    const osmd = makeOsmd({ iterator: it, next, cursorElement: { offsetTop: 0 } });
    osmd.cursor!.update = update;
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getContainer: () => makeContainer(),
    });
    cursor.setCursorToNote({ measureIdx: 1, inBarQuarters: 0 });
    expect(next).not.toHaveBeenCalled();
    expect(
      (it as unknown as { moveToNextVisibleVoiceEntry: ReturnType<typeof vi.fn> })
        .moveToNextVisibleVoiceEntry
    ).toHaveBeenCalled();
    // cursor.update() must run once after the walk to resync the visual.
    expect(update).toHaveBeenCalledOnce();
  });

  it('still resyncs the visual via cursor.update() even when cursor.next() throws on every step', () => {
    // Reproduces the [DIAG-CURSORSYNC] failure mode: each cursor.next()
    // throws inside OSMD's update(), but iterator advances. Without the
    // recovery update() call, the visual would be stranded; with it,
    // the visual is forced back to the final iterator position.
    const it = makeIterator({ measureIdx: 0, inBar: 0 });
    const next = vi.fn(() => {
      it.currentTimeStamp.realValue += 0.25;
      const m = Math.floor(it.currentTimeStamp.realValue);
      if (m !== it.CurrentMeasureIndex) it.CurrentMeasureIndex = m;
      throw new Error('grace-note throw inside update()');
    });
    const update = vi.fn();
    const osmd = makeOsmd({ iterator: it, next, cursorElement: { offsetTop: 0 } });
    osmd.cursor!.update = update;
    const cursor = createOsmdCursor({
      getOsmd: () => osmd,
      getContainer: () => makeContainer(),
    });
    cursor.setCursorToNote({ measureIdx: 2, inBarQuarters: 0 });
    expect(it.CurrentMeasureIndex).toBe(2);
    expect(update).toHaveBeenCalledOnce();
  });
});
