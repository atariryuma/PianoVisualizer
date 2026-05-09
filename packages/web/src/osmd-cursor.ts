// OSMD cursor — four operations on the OSMD instance + its cursor,
// plus the scroll-tracking concern.
//
// Industry-standard architecture (mirrors musicxml-player +
// osmd-audio-player), with one local choice: OSMD's built-in
// `followCursor` is OFF and we drive scroll ourselves with the
// browser-native `scrollIntoView({ block: 'nearest' })` idiom (see
// `ensureCursorVisible` below for rationale).
//
//   1. resetToStart() — reset cursor to score start, clear highlights,
//      ensure visible.
//
//   2. clearHighlights() — restore each painted notehead's original
//      inline `fill`, captured into `dataset._origFill` at paint time.
//      OSMD doesn't always rely on inline style for noteheads (some
//      use the SVG `fill` attribute, some inherit from the parent <g>),
//      so a blanket reset of `style.fill` would wipe user-applied
//      colors that happened to be inline. We track every touched path.
//
//   3. highlightCurrentNotes() — paint pink on the noteheads under
//      the cursor. Reads `cursor.GNotesUnderCursor()` directly. The
//      cursor's iterator and the painted notes share one source of
//      truth, so they cannot diverge by construction.
//
//   4. setCursorToNote({measureIdx, inBarQuarters}) — drive the cursor
//      by sheet timestamp. We assign a fresh
//      `new MusicPartManagerIterator(sheet, sheetTimestamp)` to
//      `cursor.iterator`, then call `cursor.update()`. With
//      `EngravingRules.CursorIgnoreRepetitions = false` the
//      constructor's walk takes back-jumps at repeat ends, so the
//      iterator naturally lands at the correct repeat iteration.
//      Finally `ensureCursorVisible()` keeps the cursor on-screen.
//
// All side-effects flow through deps; the factory closes over the
// highlighted-paths tracker.

/** Subset of the OSMD instance we touch — narrow to keep the deps
 *  bag small + decouple from the lib's full surface. */
export interface OsmdInstanceRef {
  cursor?: OsmdCursorRef | null;
  Sheet?: {
    SourceMeasures?: Array<{
      AbsoluteTimestamp?: { realValue?: number; clone?: () => unknown };
    }>;
  } | null;
}

/** OSMD cursor surface — only the bits we read/call. */
export interface OsmdCursorRef {
  iterator?: OsmdIteratorRef;
  reset?(): void;
  show?(): void;
  hide?(): void;
  /** Re-runs the visual position math against the current iterator
   *  state. Called after we swap `iterator` so the cursor element
   *  follows the freshly-seeded position; with `cursorOptions.follow:
   *  true` it also scrolls the container to keep the cursor in view. */
  update?(): void;
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

/** Constructors we need from the OSMD library to drive the cursor by
 *  sheet timestamp (the musicxml-player pattern). Typed loosely — the
 *  OSMD types are version-volatile and we only call constructors. */
export interface OsmdLibRef {
  /** `new MusicPartManagerIterator(sheet, startTimestamp?, endTimestamp?)`.
   *  When `EngravingRules.CursorIgnoreRepetitions` is false, the
   *  constructor walks from sheet start to startTimestamp, taking
   *  back-jumps at repeat ends — the iterator lands at the correct
   *  repeat iteration without us tracking it. */
  MusicPartManagerIterator?: new (
    sheet: unknown,
    startTimestamp?: unknown,
    endTimestamp?: unknown
  ) => unknown;
  /** `new Fraction(numerator, denominator)`. */
  Fraction?: new (numerator: number, denominator?: number) => unknown;
}

export interface OsmdCursorDeps {
  /** Read at every call so a song-swap mid-run resolves to the
   *  right OSMD instance. */
  getOsmd: () => OsmdInstanceRef | null;
  /** Returns the imported OSMD library namespace. Required for
   *  setCursorToNote — the cursor is driven by sheet timestamp via
   *  `new MusicPartManagerIterator(sheet, ts)`. When unavailable
   *  (test fixtures), setCursorToNote is a no-op. */
  getLib?: () => OsmdLibRef | null | undefined;
  /** Highlight color — defaults to pink that contrasts with the
   *  gold cursor + black notes. */
  highlightFill?: string;
}

export interface OsmdCursor {
  resetToStart(): void;
  clearHighlights(): void;
  highlightCurrentNotes(): void;
  setCursorToNote(target: CursorTarget): void;
}

const DEFAULT_HIGHLIGHT_FILL = '#ff3b6b';
/** OSMD's `Fraction` is in whole-note units. We add a quarter-note
 *  offset to a measure's AbsoluteTimestamp at 96th-note precision —
 *  fine enough for 16th-note grids and triplets, coarse enough to
 *  reduce to clean integers. `1 quarter = 24/96 whole`. */
const FRACTION_DENOM = 96;
const FRACTION_NUM_PER_QUARTER = 24;

export function createOsmdCursor(deps: OsmdCursorDeps): OsmdCursor {
  const fill = deps.highlightFill ?? DEFAULT_HIGHLIGHT_FILL;
  const highlightedPaths: SVGPathElement[] = [];

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
    ensureCursorVisible(osmd);
  }

  function setCursorToNote(target: CursorTarget): void {
    const osmd = deps.getOsmd();
    if (!osmd?.cursor || !osmd.Sheet || !target) return;
    const Lib = deps.getLib?.();
    if (!Lib?.MusicPartManagerIterator || !Lib?.Fraction) return;

    if (!seedIteratorFromTimestamp(osmd, Lib, target)) return;
    try {
      osmd.cursor.update?.();
    } catch {
      /* cursor.update math can throw on grace notes / unformatted
       * notes; the visual stays at the last successful place. */
    }
    ensureCursorVisible(osmd);
    highlightCurrentNotes();
    // [DIAG-CURSORPOS] Verify cursor visual lines up with the staff.
    // Logs once every 16 calls. Compares cursor top vs first highlighted
    // note top vs the system's expected top.
    _diagCursorPos(osmd);
  }

  /**
   * Industry-standard "follow this element" idiom: scroll the minimum
   * amount necessary to keep the cursor visible, with smooth animation.
   *
   *   - In viewport: no-op (zero scroll churn).
   *   - About to leave viewport: minimal scroll to bring it back.
   *   - System-boundary cross: naturally page-turns because the next
   *     system is the "nearest off-screen" target.
   *
   * Replaces the prior SAFE_TOP / TRIGGER_BOTTOM / LAND_TOP magic-number
   * page-turn logic with browser-native `scrollIntoView({ block: 'nearest' })`
   * semantics. References:
   *   - {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView MDN scrollIntoView}
   *   - {@link https://github.com/scroll-into-view/scroll-into-view-if-needed scroll-into-view-if-needed}
   *   - {@link https://github.com/infojunkie/musicxml-player musicxml-player}, the canonical OSMD-based player
   *
   * Honors `prefers-reduced-motion` per WCAG 2.3.3 — falls back to
   * 'instant' for users who opt out of motion.
   */
  function ensureCursorVisible(osmd: OsmdInstanceRef): void {
    try {
      const ce = (osmd.cursor as any)?.cursorElement as HTMLElement | undefined;
      if (!ce?.scrollIntoView) return;
      const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      ce.scrollIntoView({
        behavior: reduceMotion ? 'instant' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    } catch {
      /* swallow — scroll is a nice-to-have, never block the cursor. */
    }
  }

  let _diagCalls = 0;
  function _diagCursorPos(osmd: OsmdInstanceRef): void {
    _diagCalls++;
    if (_diagCalls % 16 !== 1) return;

    try {
      const cursor = osmd.cursor as any;
      const ce = cursor?.cursorElement as HTMLElement | undefined;
      if (!ce?.getBoundingClientRect) return;
      const cr = ce.getBoundingClientRect();
      const it = cursor?.iterator;
      const cursorM = it?.CurrentMeasureIndex;
      const cursorRep = it?.currentRepetitionIndex ?? it?.CurrentRepetitionIndex ?? null;
      const zoom = (osmd as any).zoom ?? 1;

      // [Cursor expected-top via GraphicalMusicSheet] Walk
      // GraphicalMusicSheet.MeasureList[m][0] → parentMusicSystem →
      // StaffLines[0]. This is the path OSMD's own Cursor.update uses.
      const gms = (osmd as any).GraphicalMusicSheet ?? (osmd as any).graphic;
      const gMeasureRow = gms?.MeasureList?.[cursorM];
      const gMeasure = gMeasureRow?.[0];
      const cursorSys = gMeasure?.parentMusicSystem;
      const cursorSysIdx = cursorSys?.Id ?? cursorSys?.id ?? null;
      const sysY = cursorSys?.PositionAndShape?.AbsolutePosition?.y;
      const sl0 = cursorSys?.StaffLines?.[0];
      const slLast = cursorSys?.StaffLines?.[cursorSys?.StaffLines?.length - 1];
      const expectedTopOp =
        typeof sysY === 'number' && typeof sl0?.PositionAndShape?.RelativePosition?.y === 'number'
          ? Math.round(10 * (sysY + sl0.PositionAndShape.RelativePosition.y) * zoom)
          : null;
      const expectedBotOp =
        typeof sysY === 'number' &&
        typeof slLast?.PositionAndShape?.RelativePosition?.y === 'number' &&
        typeof slLast?.StaffHeight === 'number'
          ? Math.round(
              10 * (sysY + slLast.PositionAndShape.RelativePosition.y + slLast.StaffHeight) * zoom
            )
          : null;

      // Highlighted note: compare its measure + system to the cursor's.
      // Note: the <g> bbox includes stems/ledgers/beams so it can extend
      // far above the staff. We compare the *note-head path* bbox (the
      // first <path> child) instead — that's the actual notehead glyph
      // position and matches what the eye reads as "the note".
      let noteHeadTop: number | null = null;
      let noteGTop: number | null = null;
      let noteM: number | null = null;
      let noteSysIdx: any = null;
      try {
        const list =
          (cursor.GNotesUnderCursor?.() as Array<{
            getSVGGElement?(): SVGGElement | null;
            sourceNote?: any;
            parentVoiceEntry?: any;
          }>) ?? [];
        const n = list[0];
        const g = n?.getSVGGElement?.();
        if (g?.getBoundingClientRect) noteGTop = g.getBoundingClientRect().top;
        const headPath = g?.querySelector?.('path');
        if (headPath?.getBoundingClientRect) noteHeadTop = headPath.getBoundingClientRect().top;
        const noteMeasure = n?.parentVoiceEntry?.parentStaffEntry?.parentMeasure;
        noteM = noteMeasure?.MeasureNumber ?? noteMeasure?.measureListIndex ?? null;
        const noteSys = noteMeasure?.parentMusicSystem;
        noteSysIdx = noteSys?.Id ?? noteSys?.id ?? null;
      } catch {
        /* noop */
      }
      console.log(
        '[DIAG-CURSORPOS] ' +
          JSON.stringify({
            cssTop: ce.style.top,
            cssH: ce.style.height,
            cursorScreenTop: Math.round(cr.top),
            cursorScreenH: Math.round(cr.height),
            cursorM,
            cursorRep,
            cursorSysIdx,
            noteHeadTop: noteHeadTop !== null ? Math.round(noteHeadTop) : null,
            noteGTop: noteGTop !== null ? Math.round(noteGTop) : null,
            noteM,
            noteSysIdx,
            // Cursor (staff line 0 top) → note-head top. Positive = head
            // below staff line 0, negative = above. Should be small for
            // notes near the middle of the staff.
            head_dy: noteHeadTop !== null ? Math.round(noteHeadTop - cr.top) : null,
            // Cursor staff system bottom on screen.
            cursorScreenBot: Math.round(cr.bottom),
            expectedTopOp,
            expectedBotOp,
            zoom,
          })
      );
    } catch (e) {
      console.warn('[DIAG-CURSORPOS] threw: ' + (e as Error).message);
    }
  }

  /** Seeds `cursor.iterator` from a fresh `MusicPartManagerIterator`
   *  constructed at the target's sheet timestamp. Returns true on
   *  success, false when the OSMD object shape we need isn't reachable. */
  function seedIteratorFromTimestamp(
    osmd: OsmdInstanceRef,
    Lib: OsmdLibRef,
    target: CursorTarget
  ): boolean {
    const measure = osmd.Sheet?.SourceMeasures?.[target.measureIdx | 0];
    const absTs = measure?.AbsoluteTimestamp;
    if (!absTs || typeof absTs.clone !== 'function') return false;

    let startTs: { Add?: (other: unknown) => unknown };
    try {
      startTs = absTs.clone() as { Add?: (other: unknown) => unknown };
    } catch {
      return false;
    }

    const q = +target.inBarQuarters || 0;
    if (q > 0 && typeof startTs.Add === 'function') {
      try {
        const offset = new Lib.Fraction!(Math.round(q * FRACTION_NUM_PER_QUARTER), FRACTION_DENOM);
        startTs.Add(offset);
      } catch {
        /* Fraction ctor / Add unavailable — start from measure top. */
      }
    }

    try {
      (osmd.cursor as any).iterator = new Lib.MusicPartManagerIterator!(
        osmd.Sheet,
        startTs,
        undefined
      );
      return true;
    } catch {
      return false;
    }
  }

  return {
    resetToStart,
    clearHighlights,
    highlightCurrentNotes,
    setCursorToNote,
  };
}
