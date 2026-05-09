// OSMD cursor manipulation — Phase 0d batch 32.
//
// Five cohesive cursor concerns, all running against the OSMD
// instance + its `cursor` iterator:
//
//   1. scrollToCursor() — scroll the OSMD container so the cursor
//      stays visible. Throttled to once per 100 ms so rapid passages
//      (Turkish March 16th-note runs etc.) don't bog the main thread.
//
//   2. resetToStart() — reset cursor to score start + scroll the
//      container to the top + clear the notehead highlights.
//
//   3. clearHighlights() — restore the per-<path> inline fill we
//      cached in `dataset._origFill`. OSMD doesn't always rely on
//      inline style for noteheads (some are SVG `fill` attrs, some
//      pick up the parent <g>'s color); blanket-clearing style.fill
//      would wipe user-applied per-note colors that happened to live
//      inline. We track every touched path so the restore is exact.
//
//   4. highlightCurrentNotes() — paint the notehead(s) under the
//      cursor pink so the kid can spot "which ledger-line dot is it"
//      without scanning the column. Color every <path> inside the
//      note's <g> (head + stem + accidental + ledger line if
//      grouped) — coloring just the notehead would lose the stem and
//      "pink notehead with black stem" reads less clearly. Falls
//      back to OSMD < 1.x's `NotesUnderCursor` when the newer
//      `GNotesUnderCursor` isn't present.
//
//   5. setCursorToNote({measureIdx, inBarQuarters}) — walk the OSMD
//      iterator forward until its (CurrentMeasureIndex,
//      currentTimeStamp - measureStart) match. Backward seeks always
//      reset() and walk forward; cursor.previous() in OSMD 1.9.x
//      leaves the visual cursor at the previous position while
//      iterator state moves backward (ghost cursor). Bounded loop
//      cap (20 000 steps) protects against a cursor.next() that
//      throws repeatedly without advancing.
//
// All side-effects flow through deps; the factory closes over the
// scroll-throttle timestamp + the highlighted-paths tracker.

/** Subset of the OSMD instance we touch — narrow to keep the deps
 *  bag small + decouple from the lib's full surface. */
export interface OsmdInstanceRef {
  cursor?: OsmdCursorRef | null;
  Sheet?: { SourceMeasures?: Array<{ AbsoluteTimestamp?: { realValue?: number } }> } | null;
}

/** OSMD cursor surface — only the bits we read/call. */
export interface OsmdCursorRef {
  cursorElement?: { offsetTop: number; offsetHeight?: number } | null;
  iterator?: OsmdIteratorRef;
  reset?(): void;
  next?(): void;
  show?(): void;
  hide?(): void;
  GNotesUnderCursor?(): OsmdGraphicalNote[];
  NotesUnderCursor?(): OsmdGraphicalNote[];
}

export interface OsmdIteratorRef {
  endReached: boolean;
  CurrentMeasureIndex: number;
  currentTimeStamp: { realValue: number };
}

/** Minimal graphical-note shape we touch — `getSVGGElement` returns
 *  the <g> wrapping the notehead + stem + accidentals + ledger lines. */
export interface OsmdGraphicalNote {
  getSVGGElement?(): SVGGElement | null;
}

/** Coordinates the cursor walks toward. */
export interface CursorTarget {
  measureIdx: number;
  inBarQuarters: number;
}

export interface OsmdCursorDeps {
  /** Read at every call so a song-swap mid-run resolves to the
   *  right OSMD instance. */
  getOsmd: () => OsmdInstanceRef | null;
  /** Container the cursor scrolls inside. */
  getContainer: () => { scrollTop: number; clientHeight: number } | null;
  /** Time source — pulled out so tests drive the throttle
   *  deterministically. Defaults to performance.now. */
  now?: () => number;
  /** Highlight color — defaults to the legacy pink that contrasts
   *  with the gold cursor + black notes. */
  highlightFill?: string;
  /** Throttle window (ms) for scrollToCursor. Default 100. */
  scrollThrottleMs?: number;
  /** Hard cap on cursor.next() iterations inside setCursorToNote.
   *  Default 20 000 — protects against a stuck iterator. */
  walkSafetyCap?: number;
}

export interface OsmdCursor {
  scrollToCursor(): void;
  resetToStart(): void;
  clearHighlights(): void;
  highlightCurrentNotes(): void;
  setCursorToNote(target: CursorTarget): void;
  /** Reset the scroll throttle so the very next `scrollToCursor()`
   *  fires regardless of the 100 ms gate. Used on section transitions
   *  where the previous section's last frame may have just scrolled
   *  and would otherwise swallow the new section's first scroll. */
  resetScrollThrottle(): void;
}

const DEFAULT_HIGHLIGHT_FILL = '#ff3b6b';
const DEFAULT_SCROLL_THROTTLE_MS = 100;
const DEFAULT_WALK_SAFETY_CAP = 20_000;

export function createOsmdCursor(deps: OsmdCursorDeps): OsmdCursor {
  const now = deps.now ?? (() => performance.now());
  const fill = deps.highlightFill ?? DEFAULT_HIGHLIGHT_FILL;
  const throttleMs = deps.scrollThrottleMs ?? DEFAULT_SCROLL_THROTTLE_MS;
  const safetyCap = deps.walkSafetyCap ?? DEFAULT_WALK_SAFETY_CAP;

  let lastScrollMs = 0;
  const highlightedPaths: SVGPathElement[] = [];

  function scrollToCursor(): void {
    const container = deps.getContainer();
    const osmd = deps.getOsmd();
    if (!container || !osmd?.cursor?.cursorElement) return;
    const t = now();
    if (t - lastScrollMs < throttleMs) return;
    lastScrollMs = t;

    const cTop = osmd.cursor.cursorElement.offsetTop;
    const cH = osmd.cursor.cursorElement.offsetHeight || 30;
    const viewH = container.clientHeight;
    if (cTop < container.scrollTop || cTop + cH > container.scrollTop + viewH) {
      // Grand-staff cursors (~350–460 px) can exceed phone-portrait
      // viewports (~240–364 px); the legacy `cTop - viewH/3` anchor
      // then drops the bass clef off-screen. Center instead when 1/3
      // padding doesn't fit — for cH > viewH that's also the least-bad
      // option (symmetric overflow rather than a one-sided cut).
      const fitsWithThird = cH + viewH / 3 <= viewH;
      const target = fitsWithThird ? cTop - viewH / 3 : cTop - (viewH - cH) / 2;
      container.scrollTop = Math.max(0, target);
    }
  }

  function clearHighlights(): void {
    for (const p of highlightedPaths) {
      try {
        if (p.dataset && '_origFill' in p.dataset) {
          p.style.fill = p.dataset._origFill ?? '';
          delete p.dataset._origFill;
        } else {
          p.style.fill = '';
        }
      } catch {
        /* element may have been detached on song swap */
      }
    }
    highlightedPaths.length = 0;
  }

  function highlightCurrentNotes(): void {
    clearHighlights();
    const osmd = deps.getOsmd();
    if (!osmd?.cursor) return;

    // GNotesUnderCursor (graphical notes, has getSVGGElement) was
    // added mid-1.x. Fall back to NotesUnderCursor + a property
    // probe so older OSMD builds still work.
    let list: OsmdGraphicalNote[] = [];
    try {
      if (typeof osmd.cursor.GNotesUnderCursor === 'function') {
        list = osmd.cursor.GNotesUnderCursor() || [];
      } else if (typeof osmd.cursor.NotesUnderCursor === 'function') {
        list = osmd.cursor.NotesUnderCursor() || [];
      }
    } catch {
      return;
    }
    for (const n of list) {
      if (!n || typeof n.getSVGGElement !== 'function') continue;
      let g: SVGGElement | null;
      try {
        g = n.getSVGGElement();
      } catch {
        continue;
      }
      if (!g) continue;
      const paths = g.querySelectorAll<SVGPathElement>('path');
      for (const p of paths) {
        if (p.dataset && !('_origFill' in p.dataset)) {
          p.dataset._origFill = p.style.fill || '';
        }
        p.style.fill = fill;
        highlightedPaths.push(p);
      }
    }
  }

  function resetToStart(): void {
    const osmd = deps.getOsmd();
    if (!osmd?.cursor) return;
    clearHighlights();
    try {
      osmd.cursor.reset?.();
    } catch {
      /* OSMD's reset can throw on a partially-loaded score */
    }
    const container = deps.getContainer();
    if (container) container.scrollTop = 0;
  }

  function setCursorToNote(target: CursorTarget): void {
    const osmd = deps.getOsmd();
    if (!osmd?.cursor || !osmd.cursor.iterator || !target) return;
    const it = osmd.cursor.iterator;
    const sm = osmd.Sheet?.SourceMeasures;
    if (!sm) return;

    const targetM = target.measureIdx | 0;
    const targetQ = +target.inBarQuarters || 0;
    const eps = 1e-6;

    const measureStartWhole = (m: number): number => sm[m]?.AbsoluteTimestamp?.realValue || 0;
    const inBarQ = (): number =>
      Math.max(0, (it.currentTimeStamp.realValue - measureStartWhole(it.CurrentMeasureIndex)) * 4);

    // Already at target? Skip.
    const startM = it.CurrentMeasureIndex;
    if (!it.endReached && startM === targetM && Math.abs(inBarQ() - targetQ) < eps) return;

    // Past target → reset; otherwise we'd walk forever forward.
    if (it.endReached || startM > targetM || (startM === targetM && inBarQ() > targetQ + eps)) {
      try {
        osmd.cursor.reset?.();
      } catch {
        /* ignore */
      }
    }

    // Walk forward until iterator's (measureIdx, inBarQuarters)
    // reaches the target. Bounded loop in case cursor.next() throws
    // repeatedly without advancing — without the cap we'd hang.
    let safety = safetyCap;
    while (!it.endReached && safety-- > 0) {
      const m = it.CurrentMeasureIndex;
      if (m > targetM) break;
      if (m === targetM && inBarQ() >= targetQ - eps) break;
      try {
        osmd.cursor.next?.();
      } catch {
        /* grace-note throws — iterator still advances */
      }
    }
    // Light up the freshly-current notehead(s).
    highlightCurrentNotes();
  }

  return {
    scrollToCursor,
    resetToStart,
    clearHighlights,
    highlightCurrentNotes,
    setCursorToNote,
    resetScrollThrottle: () => {
      lastScrollMs = 0;
    },
  };
}
