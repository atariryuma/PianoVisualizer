// OSMD cursor — four operations on the OSMD instance + its cursor.
// Industry-standard implementation matching musicxml-player and
// osmd-audio-player; OSMD handles cursor positioning AND scroll.
//
//   1. resetToStart() — reset cursor to score start, clear highlights.
//      OSMD's `cursor.reset()` repositions + scrolls (when
//      cursorOptions.follow is true).
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
//      `cursor.update()` then runs OSMD's `scrollIntoView` (cursor
//      option `follow: true` set in osmd-init.ts), so the score
//      auto-centers without us touching scrollTop.
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
    // [Bug fix 2026-05-09] OSMD's followCursor is now disabled, so
    // `cursor.reset()` no longer scrolls. Anchor cursor top to our
    // target Y so the score visually rewinds to its first system.
    _ensureCentered(osmd);
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
    // [Bug fix 2026-05-09] Centering safety-net.
    //
    // OSMD's `cursor.update()` calls `cursorElement.scrollIntoView(
    // {block: 'center'})` internally, but in 1.9.x the scroll doesn't
    // always settle synchronously when crossing a staff-system boundary
    // — DIAG showed the cursor's screen Y at ~480px (bottom of viewport)
    // immediately after update() instead of the expected ~170px (center)
    // for one onset, then snapping to center on the next onset. The
    // visual artifact is the cursor appearing well below the staff
    // (which the page hadn't yet scrolled to bring into the centre).
    //
    // We re-check the cursor's bounding rect; if it's drifted >25% of
    // viewport height from the center, kick scrollIntoView again. This
    // is a no-op on the common case (already centered) but fixes the
    // boundary lag. Keeping the original `update()` call so OSMD's
    // own positioning math + repaint still runs first.
    _ensureCentered(osmd);
    highlightCurrentNotes();
    // [DIAG-CURSORPOS 2026-05-09] Verify cursor visual lines up with
    // the staff. Logs once every 16 calls. Compares cursor top vs
    // first highlighted note top vs the system's expected top.
    _diagCursorPos(osmd);
  }

  /** Page-turn behavior:
   *
   *   - SAFE_TOP_FRACTION: don't scroll if cursor.top is at or below
   *     this fraction of viewport height (= cursor still on-screen above
   *     the safe zone).
   *   - TRIGGER_BOTTOM_FRACTION: scroll once cursor.bottom passes this
   *     fraction (= cursor about to slide below the viewport).
   *   - LAND_TOP_FRACTION: after the page-turn, the cursor's top edge
   *     lands at this fraction of viewport height — leaving the rest of
   *     the viewport for upcoming systems, like turning a page in a
   *     paper score.
   *
   *  Earlier we tried two simpler strategies:
   *
   *    1. OSMD's `block: 'center'` (cursor center → viewport center).
   *       Stable cursor center, but staff TOP swung 45px between
   *       differently-tall systems. User: "ちょっとずつずれていく."
   *
   *    2. Top-anchor (cursor top fixed at y=200 every onset). Stable
   *       staff top, but the page jumped 300px every system boundary,
   *       making the just-played staff fly upward off-screen. User:
   *       "弾いている五線譜が枠外に外れていく."
   *
   *  Page-turning trades scroll FREQUENCY for scroll AMPLITUDE: the
   *  staff stays put while the cursor walks down, then a single
   *  page-turn moves several systems at once. Mirrors how a kid would
   *  read sheet music. */
  const SAFE_TOP_FRACTION = 0;
  const TRIGGER_BOTTOM_FRACTION = 0.78;
  const LAND_TOP_FRACTION = 0.12;

  function _ensureCentered(osmd: OsmdInstanceRef): void {
    try {
      const ce = (osmd.cursor as any)?.cursorElement as HTMLElement | undefined;
      if (!ce?.getBoundingClientRect) return;
      const rect = ce.getBoundingClientRect();
      const vh = window.innerHeight;
      const triggerBottom = vh * TRIGGER_BOTTOM_FRACTION;
      const safeTop = vh * SAFE_TOP_FRACTION;
      // Inside the comfortable reading zone — no scroll. This is the
      // common case for consecutive onsets within the same staff
      // system, and even across short system jumps that don't cross
      // the bottom trigger line.
      if (rect.bottom <= triggerBottom && rect.top >= safeTop) return;
      // Page-turn: re-anchor cursor top to LAND_TOP_FRACTION.
      const landTop = vh * LAND_TOP_FRACTION;
      const delta = rect.top - landTop;
      if (Math.abs(delta) <= 4) return;
      let scrollEl: Element | null = ce.parentElement;
      while (scrollEl && scrollEl !== document.body) {
        const cs = getComputedStyle(scrollEl);
        const ovy = cs.overflowY;
        if (
          (ovy === 'auto' || ovy === 'scroll') &&
          (scrollEl as HTMLElement).scrollHeight > (scrollEl as HTMLElement).clientHeight
        ) {
          break;
        }
        scrollEl = scrollEl.parentElement;
      }
      if (!scrollEl || scrollEl === document.body) {
        scrollEl = document.scrollingElement ?? document.documentElement;
      }
      (scrollEl as HTMLElement).scrollBy({
        top: delta,
        behavior: 'instant' as ScrollBehavior,
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
