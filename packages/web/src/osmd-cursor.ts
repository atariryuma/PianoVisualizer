// OSMD cursor — five operations on the OSMD instance + its cursor,
// plus the scroll-tracking concern, plus a custom SVG-ground-truth
// cursor overlay.
//
// Industry-standard architecture (mirrors musicxml-player +
// osmd-audio-player + Verovio's CSS-class approach), with two local
// choices:
//
//   1. OSMD's built-in `followCursor` is OFF and we drive the fixed
//      OSMD panel's scrollTop ourselves (see `ensureCursorVisible`).
//
//   2. OSMD's native cursor element is HIDDEN and we paint our own
//      yellow overlay from the rendered SVG's bounding rects (see
//      `paintCustomCursor`). Rationale: OSMD's cursor uses
//      `MusicSystem.PositionAndShape.AbsolutePosition.y +
//      StaffLine[0].RelativePosition.y` for its top, but with
//      `<octave-shift>` brackets — especially nested / overlapping
//      ones (size="8" + size="15" + number="2" channels) — the
//      renderer doesn't shift the staff lines down by the bracket
//      space OSMD reserved, leaving the cursor 200-300px BELOW the
//      actual staff. Verified against Liszt's La Campanella (78
//      octave-shift brackets, drift -232 → -328px over 56s). The
//      SVG-ground-truth approach reads `getBoundingClientRect` from
//      the actually-rendered notes + stave path elements, bypassing
//      OSMD's data-model bug for ANY MusicXML (Verovio uses the same
//      "DOM is the source of truth" pattern).
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

import { clamp } from '@piano/core';

/** Subset of the OSMD instance we touch — narrow to keep the deps
 *  bag small + decouple from the lib's full surface. */
export interface OsmdInstanceRef {
  cursor?: OsmdCursorRef | null;
  Sheet?: {
    SourceMeasures?: Array<{
      AbsoluteTimestamp?: { realValue?: number; clone?: () => unknown };
    }>;
  } | null;
  /** OSMD zoom factor (1 = 100%). Diagnostics multiply OSMD's internal
   *  10-units coordinates by this to map to screen pixels. */
  zoom?: number;
  /** Layout-graph view of the score. `computeSystemIdx` walks
   *  `MeasureList[m][0].parentMusicSystem.Id` to identify the music
   *  system the cursor is currently on (the same chain OSMD's own
   *  `Cursor.update` uses for positioning). */
  GraphicalMusicSheet?: OsmdGraphicalSheetRef;
  /** Legacy alias of `GraphicalMusicSheet` — some OSMD builds expose
   *  the layout graph under `.graphic` instead. */
  graphic?: OsmdGraphicalSheetRef;
}

/** Minimal layout-graph shape: a matrix of staves indexed by
 *  source-measure → staff. */
export interface OsmdGraphicalSheetRef {
  MeasureList?: Array<Array<OsmdGraphicalMeasureRef | undefined> | undefined>;
}

export interface OsmdGraphicalMeasureRef {
  parentMusicSystem?: OsmdMusicSystemRef;
}

/** A music system = one row of staves laid out at the same vertical
 *  position. `Id` / `id` differ across OSMD versions; both are read. */
export interface OsmdMusicSystemRef {
  Id?: number;
  id?: number;
  PositionAndShape?: { AbsolutePosition?: { y?: number } };
  StaffLines?: Array<OsmdStaffLineRef | undefined>;
}

export interface OsmdStaffLineRef {
  PositionAndShape?: { RelativePosition?: { y?: number } };
  StaffHeight?: number;
}

/** OSMD cursor surface — only the bits we read/call. */
export interface OsmdCursorRef {
  iterator?: OsmdIteratorRef;
  /** OSMD positions a bare `<img>` / overlay element as the visible
   *  cursor bar; we read its viewport rect for scroll math and patch
   *  its `style.top` / `style.height` to cover noteheads outside the
   *  staff lines (see `stretchCursorToNotes`). */
  cursorElement?: HTMLElement;
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
  /** OSMD's per-version `next()` — advances the iterator a single
   *  voice-entry. Used by the test fixture's default `next` builder. */
  next?(): void;
}

export interface OsmdIteratorRef {
  endReached: boolean;
  CurrentMeasureIndex: number;
  currentTimeStamp: { realValue: number };
  /** Repetition index (which iteration of a repeat block). OSMD names
   *  this `currentRepetitionIndex` in some versions and
   *  `CurrentRepetitionIndex` in others — both optional. */
  currentRepetitionIndex?: number;
  CurrentRepetitionIndex?: number;
}

/** Minimal graphical-note shape we touch — `getSVGGElement` returns
 *  the <g> wrapping the notehead + stem + accidentals + ledger lines.
 *  The parent chain (voice entry → staff entry → measure) is walked
 *  by `_diagCursorPos` to compare the highlighted note's measure +
 *  system against the cursor's. All optional — older builds may not
 *  expose every link. */
export interface OsmdGraphicalNote {
  getSVGGElement?(): SVGGElement | null;
  parentVoiceEntry?: {
    parentStaffEntry?: {
      parentMeasure?: {
        MeasureNumber?: number;
        measureListIndex?: number;
        parentMusicSystem?: OsmdMusicSystemRef;
      };
    };
  };
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
  /** Re-paint the custom SVG-ground-truth cursor overlay against the
   *  current cursor position. Call after window resize / OSMD re-
   *  render / zoom change to keep the overlay aligned. Cheap +
   *  idempotent — does nothing in non-DOM environments or when the
   *  cursor has no notes. */
  repaintCustomCursor(): void;
}

const DEFAULT_HIGHLIGHT_FILL = '#ff3b6b';
/** OSMD's `Fraction` is in whole-note units. We add a quarter-note
 *  offset to a measure's AbsoluteTimestamp at 96th-note precision —
 *  fine enough for 16th-note grids and triplets, coarse enough to
 *  reduce to clean integers. `1 quarter = 24/96 whole`. */
const FRACTION_DENOM = 96;
const FRACTION_NUM_PER_QUARTER = 24;
const SCROLL_LOG_VERSION = 'v10';
const OSMD_CONTAINER_ID = 'osmdContainer';
const SAFE_MARGIN_RATIO = 0.14;
const SAFE_MARGIN_MIN_PX = 32;
const SCROLL_HYSTERESIS_PX = 48;
const MIN_SCROLL_DELTA_PX = 8;
const ACTIVE_SCROLL_COOLDOWN_MS = 120;
const SAME_SYSTEM_REVERSAL_COOLDOWN_MS = 450;
const MAX_ACTIVE_SCROLL_DELTA_PX = 120;
/** Where to anchor the active region's vertical center on a "fire"
 *  event (first-scroll / system-change). 0.5 = exact panel center —
 *  whatever-sized active region (short notehead, tall grand staff,
 *  chord cluster with ledger lines) lands centered in the panel. This
 *  is more flexible than a fixed-ratio focusY landing because it
 *  adapts to the actual height of what's being shown: a single staff
 *  system gets equal breathing room above and below; a tall grand
 *  staff naturally uses more of the panel without clipping top or
 *  bottom. */
const FIRE_TARGET_RATIO = 0.5;

/** Custom-cursor overlay tuning. Mirrors OSMD's original cursor visual
 *  (gold, semi-transparent) but reads its position from the rendered
 *  SVG rather than OSMD's data-model — so it stays glued to the actual
 *  staff even on scores where `MusicSystem.AbsolutePosition.y` is
 *  thrown off by octave-shift brackets / multi-voice layouts. */
const CUSTOM_CURSOR_COLOR = 'rgba(255, 215, 0, 0.30)';
const CUSTOM_CURSOR_PAD_X = 4;
const CUSTOM_CURSOR_CLASS = 'piano-osmd-cursor-overlay';
/** Maximum number of ancestor walk-up steps when searching for a
 *  parent SVG group that contains stave path elements. 8 covers every
 *  layout VexFlow has shipped (note → voice → stave → system → page). */
const STAVE_LOOKUP_MAX_DEPTH = 8;
/** VexFlow stave selector — `.vf-stave` is the class VexFlow 4.x + 5.x put
 *  on the per-staff group element. Bare class selector is intentional (it
 *  walks the element's actual class list, immune to substring collisions
 *  like `class="vf-stavenote"` on note groups, which is critical because
 *  note groups are siblings of the stave under the system group). */
const STAVE_SELECTOR = '.vf-stave';
/** Vertical-proximity tolerance for grouping `.vf-stave` elements into
 *  the "current system". A grand-staff system spans treble (top) ~120
 *  px gap ~ bass (bottom) ≈ 100-180px total; an octave-shift-padded
 *  system can reach ~250px. 200 covers both with room to spare while
 *  staying tight enough to exclude the neighbouring system on dense
 *  pages. */
const STAFF_Y_PROXIMITY_PX = 200;

type ScrollReason =
  | 'first-scroll'
  | 'system-change'
  | 'active-outside-safe'
  | 'inside-safe'
  | 'throttled'
  | 'reversal-guard';

export function createOsmdCursor(deps: OsmdCursorDeps): OsmdCursor {
  const fill = deps.highlightFill ?? DEFAULT_HIGHLIGHT_FILL;
  const highlightedPaths: SVGPathElement[] = [];
  const scrollState = {
    hasAnchor: false,
    lastSysIdx: null as number | null,
    lastScrollAtMs: 0,
    lastScrollDirection: 0,
  };
  /** The custom SVG-ground-truth cursor overlay. Lazily created on
   *  first paint, lives inside #osmdContainer so it scrolls with the
   *  score content. Re-attached if the container is replaced on
   *  song-swap (detected via `isConnected`). */
  let customOverlay: HTMLDivElement | null = null;
  /** ResizeObserver tied to the score scroller so the overlay re-
   *  paints when OSMD re-renders (font load, orientation change, zoom
   *  flip). Set once per scroller element. */
  let overlayResizeObserver: ResizeObserver | null = null;
  let overlayObservedScroller: HTMLElement | null = null;
  let _diagSkipTick = 0;

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

  /** Read the cursor's current notes via OSMD's `GNotesUnderCursor`,
   *  falling back to `NotesUnderCursor` for older builds. Returns an
   *  empty array on any throw — both call sites treat absence as
   *  "skip this onset's painting/measurement" rather than an error. */
  function getNotesUnderCursor(cursor: OsmdCursorRef | null | undefined): OsmdGraphicalNote[] {
    if (!cursor) return [];
    try {
      if (typeof cursor.GNotesUnderCursor === 'function') {
        return cursor.GNotesUnderCursor() || [];
      }
      if (typeof cursor.NotesUnderCursor === 'function') {
        return cursor.NotesUnderCursor() || [];
      }
    } catch {
      /* OSMD throws on partially-loaded sheets; treat as no notes. */
    }
    return [];
  }

  function highlightCurrentNotes(): void {
    clearHighlights();
    const osmd = deps.getOsmd();
    if (!osmd?.cursor) return;
    const list = getNotesUnderCursor(osmd.cursor);
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
    resetScrollTracking();
    try {
      osmd.cursor.reset?.();
    } catch {
      /* OSMD's reset can throw on a partially-loaded score */
    }
    ensureCursorVisible(osmd);
    paintCustomCursor(osmd);
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
    // NOTE 2026-05-13: the previous `stretchCursorToNotes` approach
    // (extending cursorElement.style.{top,height}) was retired on
    // 2026-05-12 because OSMD only resets `style.top` on each
    // cursor.update(), not `style.height` — so any undo path either
    // over-corrected top (slow drift) or grew height unbounded (130
    // → 12061px over 2 minutes in production). The current solution
    // sidesteps the issue entirely by hiding OSMD's native cursor
    // and painting our own overlay from the rendered SVG's bounding
    // rects (see `paintCustomCursor`). The SVG ground truth is
    // immune to the OSMD layout bug that places systems hundreds of
    // pixels off when octave-shift brackets are present (verified
    // on Liszt's La Campanella: drift -232 → -328px gone).
    ensureCursorVisible(osmd);
    highlightCurrentNotes();
    paintCustomCursor(osmd);
    // [DIAG-CURSORPOS] Verify cursor visual lines up with the staff.
    // Logs once every 16 calls. Compares cursor top vs first highlighted
    // note top vs the system's expected top.
    _diagCursorPos(osmd);
  }

  /**
   * Score-follow controller (v10 — 2026-05-10).
   *
   * This intentionally uses a small "reveal active region" policy:
   * cursor.update() remains OSMD's job, while we only write the fixed
   * panel's scrollTop when the current musical region leaves a safe
   * reading band. That avoids anchoring every onset, which caused
   * oscillation in dense passages, and matches the behavior of common
   * score readers: scroll on system changes, otherwise minimally reveal
   * the active note/staff region only when it is genuinely out of view.
   */
  function ensureCursorVisible(osmd: OsmdInstanceRef): void {
    try {
      const cursor = osmd.cursor;
      if (!cursor) return;
      const ce = cursor.cursorElement;
      const scroller = resolveScoreScroller(ce);
      if (!ce || !scroller) return;

      const sysIdx = computeSystemIdx(osmd);
      const prevSysIdx = scrollState.lastSysIdx;
      const sysChanged = prevSysIdx !== null && sysIdx !== null && sysIdx !== prevSysIdx;
      const isFirstScroll = !scrollState.hasAnchor;
      if (sysIdx !== null) scrollState.lastSysIdx = sysIdx;
      const activeRect = computeActiveCursorRect(cursor, ce);
      const panelRect = safeRect(scroller);
      if (!activeRect || !panelRect) return;
      scrollState.hasAnchor = true;

      const metrics = measureSafePanel(scroller, panelRect, activeRect);
      const reason: ScrollReason = isFirstScroll
        ? 'first-scroll'
        : sysChanged
          ? 'system-change'
          : metrics.outside
            ? 'active-outside-safe'
            : 'inside-safe';
      const plan = planPanelScroll(scroller, metrics, reason);

      if (reason === 'inside-safe' || plan.absDelta < MIN_SCROLL_DELTA_PX) {
        logScrollEvent('skip', cursor, sysIdx, prevSysIdx, reason, metrics, plan);
        return;
      }

      const now = Date.now();
      const recentlyScrolled = now - scrollState.lastScrollAtMs < ACTIVE_SCROLL_COOLDOWN_MS;
      if (reason === 'active-outside-safe' && recentlyScrolled) {
        logScrollEvent('skip', cursor, sysIdx, prevSysIdx, 'throttled', metrics, plan);
        return;
      }
      const direction = Math.sign(plan.delta);
      const isReversal =
        reason === 'active-outside-safe' &&
        direction !== 0 &&
        scrollState.lastScrollDirection !== 0 &&
        direction !== scrollState.lastScrollDirection;
      if (isReversal && now - scrollState.lastScrollAtMs < SAME_SYSTEM_REVERSAL_COOLDOWN_MS) {
        logScrollEvent('skip', cursor, sysIdx, prevSysIdx, 'reversal-guard', metrics, plan);
        return;
      }

      // After rounding the delta can collapse to zero against the live
      // scrollTop — skip the DOM write so the scroll event doesn't fire
      // on a no-op.
      if (scroller.scrollTop !== plan.nextScrollTop) {
        scroller.scrollTop = plan.nextScrollTop;
      }
      scrollState.lastScrollAtMs = now;
      scrollState.lastScrollDirection = direction;

      logScrollEvent('fire', cursor, sysIdx, prevSysIdx, reason, metrics, plan);
    } catch (e) {
      console.warn(`[CURSOR-SCROLL ${SCROLL_LOG_VERSION}] error:`, e);
    }
  }

  function resolveScoreScroller(ce: HTMLElement | undefined): HTMLElement | null {
    if (!ce) return null;
    const byClosest =
      typeof ce.closest === 'function'
        ? (ce.closest(`#${OSMD_CONTAINER_ID}`) as HTMLElement | null)
        : null;
    if (byClosest) return byClosest;
    if (typeof document !== 'undefined') {
      const byId = document.getElementById(OSMD_CONTAINER_ID);
      if (byId) return byId;
    }
    return null;
  }

  interface RectLike {
    top: number;
    bottom: number;
    left?: number;
    right?: number;
  }

  function computeActiveCursorRect(cursor: OsmdCursorRef, ce: HTMLElement): RectLike | null {
    const cursorRect = safeRect(ce);
    let notesRect: RectLike | null = null;
    for (const note of getNotesUnderCursor(cursor)) {
      const noteRect = noteToViewportRect(note);
      if (!noteRect) continue;
      notesRect = notesRect ? unionRects(notesRect, noteRect) : noteRect;
    }
    return notesRect ?? cursorRect;
  }

  function noteToViewportRect(note: OsmdGraphicalNote): RectLike | null {
    let g: SVGGElement | null | undefined;
    try {
      g = typeof note?.getSVGGElement === 'function' ? note.getSVGGElement() : null;
    } catch {
      return null;
    }
    if (!g) return null;

    const explicitHead = Array.from(
      g.querySelectorAll<SVGGraphicsElement>(
        '[class*="notehead" i], [id*="notehead" i], [data-name*="notehead" i], [class*="head" i], [id*="head" i]'
      )
    );
    const headPaths =
      explicitHead.length > 0 ? explicitHead : inferCompactNoteGlyphs(g.querySelectorAll('path'));
    let rect: RectLike | null = null;
    for (const path of headPaths) {
      const pathRect = safeRect(path);
      if (!pathRect) continue;
      rect = rect ? unionRects(rect, pathRect) : pathRect;
    }
    return rect ?? safeRect(g);
  }

  function inferCompactNoteGlyphs(paths: NodeListOf<SVGGraphicsElement>): SVGGraphicsElement[] {
    const candidates = Array.from(paths).filter((path) => {
      const r = safeRect(path);
      if (!r) return false;
      const w = Math.max(0, (r.right ?? 0) - (r.left ?? 0));
      const h = Math.max(0, r.bottom - r.top);
      if (w < 3 || h < 3) return false;
      if (w > 80 || h > 80) return false;
      const aspect = Math.max(w / h, h / w);
      return aspect <= 8;
    });
    return candidates.length > 0 ? candidates : Array.from(paths).slice(0, 1);
  }

  function safeRect(el: Element | undefined | null): RectLike | null {
    try {
      const r = el?.getBoundingClientRect?.();
      if (!r || !Number.isFinite(r.top) || !Number.isFinite(r.bottom)) return null;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    } catch {
      return null;
    }
  }

  function unionRects(a: RectLike, b: RectLike): RectLike {
    return {
      top: Math.min(a.top, b.top),
      bottom: Math.max(a.bottom, b.bottom),
      left: Math.min(a.left ?? 0, b.left ?? 0),
      right: Math.max(a.right ?? 0, b.right ?? 0),
    };
  }

  /** Find the Y range (top/bottom) of the staff system the given notes
   *  are rendered on, using the actual SVG bounding rects of VexFlow's
   *  stave path elements as ground truth.
   *
   *  This is the core of the OSMD-bug workaround: instead of trusting
   *  `MusicSystem.PositionAndShape.AbsolutePosition.y` (which is off
   *  by hundreds of pixels on scores with nested octave-shifts), we
   *  read where the stave was actually drawn in the SVG. Returns null
   *  on any failure — callers fall back to the notes' own Y range.
   *
   *  Algorithm (2026-05-13 revision — system-stable + notehead-anchor):
   *    1. Walk up from a note's `<g>` collecting the LARGEST set of
   *       `.vf-stave` descendants found at any ancestor level. VexFlow
   *       creates one `.vf-stave` per measure per staff, so a measure-
   *       level ancestor sees only this measure's staves while a
   *       system-level ancestor sees all measures' staves — we want
   *       the broader set so two adjacent measures in the same system
   *       pick the SAME stave union (the previous X-overlap filter
   *       picked different staves per measure → 27px height drift
   *       within a single system, server.log 2026-05-13 08:47).
   *    2. Use the **notehead's** Y midpoint (from `noteToViewportRect`,
   *       which picks the notehead path specifically) as the anchor
   *       point — NOT the note `<g>` bounding box, because that <g>
   *       includes stems, beams, and ledger lines that can extend
   *       hundreds of pixels from the staff. For octave-shift-padded
   *       passages a `<g>` midpoint can land between two systems and
   *       pick the wrong anchor stave → wrong system identified →
   *       drift across measures in the same system (server.log
   *       2026-05-13 09:03, sysIdx=5 m=14→15 drifted 125→138 px).
   *       The notehead is always on or one-staff-spacing from the
   *       actual staff, making it a reliable anchor.
   *    3. Find the stave whose Y midpoint is closest to the notehead.
   *    4. Union all staves within ±STAFF_Y_PROXIMITY_PX of that
   *       anchor's Y midpoint — that's the current system row.
   *       Neighbouring systems are filtered out by distance. */
  function findStaffSystemYRange(notes: OsmdGraphicalNote[]): RectLike | null {
    for (const note of notes) {
      let g: SVGGElement | null = null;
      try {
        g = typeof note?.getSVGGElement === 'function' ? note.getSVGGElement() : null;
      } catch {
        continue;
      }
      if (!g) continue;
      // Prefer the notehead position for anchor selection — it's stable
      // and always near the actual staff. Fall back to the <g> rect
      // only when the notehead can't be isolated (rests / partial
      // renders), accepting some imprecision in that edge case.
      const noteHeadRect = noteToViewportRect(note) ?? safeRect(g);
      if (!noteHeadRect) continue;

      // Walk up to the highest ancestor with stave descendants. Keep
      // the LARGEST collection encountered so we have all of the
      // system's staves (not just the current measure's).
      let parent: Element | null = g.parentElement;
      let bestStaves: Element[] = [];
      for (let i = 0; i < STAVE_LOOKUP_MAX_DEPTH && parent; i++) {
        try {
          const found = parent.querySelectorAll(STAVE_SELECTOR);
          if (found.length > bestStaves.length) {
            bestStaves = Array.from(found);
          }
        } catch {
          /* invalid selector on this browser — bail */
          break;
        }
        parent = parent.parentElement;
      }
      if (bestStaves.length === 0) continue;

      // Find the stave whose Y midpoint is closest to the notehead's Y —
      // that's our system anchor. Notehead Y is always inside or one-
      // staff-spacing from the staff, so the closest stave is reliably
      // the current system's.
      const headYMid = (noteHeadRect.top + noteHeadRect.bottom) / 2;
      let anchorYMid = NaN;
      let anchorDist = Infinity;
      const staveRects: RectLike[] = [];
      for (const stave of bestStaves) {
        const sr = safeRect(stave);
        if (!sr) continue;
        staveRects.push(sr);
        const sYMid = (sr.top + sr.bottom) / 2;
        const dist = Math.abs(sYMid - headYMid);
        if (dist < anchorDist) {
          anchorDist = dist;
          anchorYMid = sYMid;
        }
      }
      if (!Number.isFinite(anchorYMid)) continue;

      // Union all staves within Y_PROXIMITY of the anchor — that's the
      // current system row. Identical for every measure in that row.
      let top = Infinity;
      let bottom = -Infinity;
      for (const sr of staveRects) {
        const sYMid = (sr.top + sr.bottom) / 2;
        if (Math.abs(sYMid - anchorYMid) > STAFF_Y_PROXIMITY_PX) continue;
        if (sr.top < top) top = sr.top;
        if (sr.bottom > bottom) bottom = sr.bottom;
      }
      if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) {
        return { top, bottom, left: noteHeadRect.left, right: noteHeadRect.right };
      }
    }
    return null;
  }

  /** Ensures the custom cursor overlay div exists inside the score
   *  scroller. Returns the element, or null in non-DOM environments.
   *  Idempotent + survives song-swap (re-creates the div if its
   *  previous parent was torn down). */
  function ensureCustomOverlay(scroller: HTMLElement): HTMLDivElement | null {
    if (customOverlay && customOverlay.isConnected && scroller.contains(customOverlay)) {
      return customOverlay;
    }
    if (typeof document === 'undefined') return null;
    let existing: HTMLDivElement | null = null;
    try {
      existing = scroller.querySelector<HTMLDivElement>(`.${CUSTOM_CURSOR_CLASS}`);
    } catch {
      /* ignore — selector errors only in pathological environments */
    }
    if (existing) {
      customOverlay = existing;
      return existing;
    }
    const div = document.createElement('div');
    div.className = CUSTOM_CURSOR_CLASS;
    div.setAttribute('aria-hidden', 'true');
    div.style.position = 'absolute';
    div.style.pointerEvents = 'none';
    div.style.background = CUSTOM_CURSOR_COLOR;
    div.style.borderRadius = '4px';
    div.style.transition = 'opacity 80ms linear, top 100ms ease-out, left 100ms ease-out';
    div.style.opacity = '0';
    div.style.zIndex = '2';
    div.style.willChange = 'top, left, width, height';
    // Ensure the scroller can position children — only set when not
    // already positioned, so we don't override app.css.
    const computed = typeof getComputedStyle === 'function' ? getComputedStyle(scroller) : null;
    if (computed && computed.position === 'static') {
      scroller.style.position = 'relative';
    }
    scroller.appendChild(div);
    customOverlay = div;
    // Wire a ResizeObserver once per scroller so re-renders (font
    // load, orientation flip, zoom change) trigger a re-paint without
    // the shell having to know about us. happy-dom + older Safari
    // don't always expose ResizeObserver — degrade silently.
    if (typeof ResizeObserver !== 'undefined' && overlayObservedScroller !== scroller) {
      try {
        overlayResizeObserver?.disconnect();
      } catch {
        /* prior observer may already be GC'd */
      }
      try {
        overlayResizeObserver = new ResizeObserver(() => {
          const osmd = deps.getOsmd();
          if (osmd) paintCustomCursor(osmd);
        });
        overlayResizeObserver.observe(scroller);
        overlayObservedScroller = scroller;
      } catch {
        /* observer creation failed — paint-on-cursor-change still works */
      }
    }
    return div;
  }

  /** Hides OSMD's built-in cursor element. The native cursor is mis-
   *  positioned on octave-shift-heavy scores; our custom overlay takes
   *  over visually. We leave the element in the DOM (OSMD keeps its
   *  iterator state through it) and just zero out its visibility. */
  function hideOsmdNativeCursor(ce: HTMLElement | undefined): void {
    if (!ce) return;
    if (ce.style.opacity !== '0') ce.style.opacity = '0';
    if (ce.style.pointerEvents !== 'none') ce.style.pointerEvents = 'none';
  }

  /** Paint the custom cursor overlay at the current cursor position.
   *
   *  Design (2026-05-13 revision — stable-height):
   *
   *  - **Y range = staff system only** (the `.vf-stave` group union).
   *    The previous notes-union approach varied height 120 → 460 px
   *    per cursor advance because note `<g>` elements include stems,
   *    beams, and ledger lines that can extend hundreds of pixels
   *    above/below the staff. Snapping to staff Y gives a stable
   *    ~staff-height bar that only changes on system transitions —
   *    matches Soundslice's "wide rectangle" cursor and OSMD's
   *    native type=1 (current-measure) intent.
   *  - **X range = current notes' notehead cluster** with horizontal
   *    padding. Narrower than a full-measure highlight but unambiguous
   *    about which note is sounding right now (the pink notehead
   *    paint from `highlightCurrentNotes` reinforces this).
   *  - **Notes outside the staff** (extreme ledger lines, octave
   *    shifts) are still visible via the pink note highlight — the
   *    gold bar marks "look here, this is the staff", not "this is
   *    where every note lives".
   *
   *  All positions come from `getBoundingClientRect` on rendered SVG
   *  elements, bypassing OSMD's `MusicSystem.AbsolutePosition` bug
   *  (verified on La Campanella's 78 octave-shifts). Safe to call on
   *  every cursor change; idempotent + cheap. */
  function paintCustomCursor(osmd: OsmdInstanceRef): void {
    const cursor = osmd.cursor;
    if (!cursor) return;
    const ce = cursor.cursorElement;
    const scroller = resolveScoreScroller(ce);
    if (!scroller) return;

    hideOsmdNativeCursor(ce);

    const overlay = ensureCustomOverlay(scroller);
    if (!overlay) return;

    const notes = getNotesUnderCursor(cursor);
    if (notes.length === 0) {
      overlay.style.opacity = '0';
      return;
    }

    // X range from the notes' noteheads — that's where the action is.
    let notesRect: RectLike | null = null;
    for (const note of notes) {
      const r = noteToViewportRect(note);
      if (r) notesRect = notesRect ? unionRects(notesRect, r) : r;
    }
    if (!notesRect) {
      overlay.style.opacity = '0';
      return;
    }

    // Y range from the staff system's `.vf-stave` elements — stable
    // per system, immune to note `<g>` bounding-rect variation. Falls
    // back to notesRect Y when no staves are found (e.g. happy-dom
    // tests without rendered SVG).
    const staffRange = findStaffSystemYRange(notes);
    const visualRect: RectLike = staffRange ?? notesRect;

    // Convert viewport rect → scroll-content rect. The overlay lives
    // inside `scroller`, so adding scrollTop/scrollLeft anchors it to
    // the content (it then scrolls naturally with the page).
    let panelRect: RectLike | null = null;
    try {
      const r = scroller.getBoundingClientRect();
      panelRect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    } catch {
      return;
    }
    const scrollTop = scroller.scrollTop || 0;
    const scrollLeft = scroller.scrollLeft || 0;
    const top = visualRect.top - panelRect.top + scrollTop;
    // X: prefer notes' X for the chord cluster; staff X would span the
    // whole system which is wider than needed for "the note playing
    // right now."
    const left = (notesRect.left ?? 0) - (panelRect.left ?? 0) + scrollLeft;
    const width = (notesRect.right ?? 0) - (notesRect.left ?? 0);
    const height = visualRect.bottom - visualRect.top;
    if (!Number.isFinite(top) || !Number.isFinite(left) || width <= 0 || height <= 0) {
      overlay.style.opacity = '0';
      return;
    }

    overlay.style.top = `${top}px`;
    overlay.style.left = `${left - CUSTOM_CURSOR_PAD_X}px`;
    overlay.style.width = `${width + 2 * CUSTOM_CURSOR_PAD_X}px`;
    overlay.style.height = `${height}px`;
    overlay.style.opacity = '1';

    _diagOverlay(overlay, visualRect, panelRect, scrollTop, scroller);
  }

  /** [DIAG-OVERLAY] Verify the painted overlay rect matches the staff
   *  position. Logs once every 16 paints (matches `_diagCursorPos`
   *  cadence). Forwarded to server.log via the remote-log gate. */
  let _diagOverlayCalls = 0;
  function _diagOverlay(
    overlay: HTMLDivElement,
    visualRect: RectLike,
    panelRect: RectLike,
    scrollTop: number,
    scroller: HTMLElement
  ): void {
    _diagOverlayCalls++;
    if (_diagOverlayCalls % 16 !== 1) return;
    try {
      const top = parseFloat(overlay.style.top);
      const left = parseFloat(overlay.style.left);
      const width = parseFloat(overlay.style.width);
      const height = parseFloat(overlay.style.height);
      // Compute overlay's current screen rect (where the user actually
      // sees the bar) to compare against the staff's screen position.
      const overlayScreenTop = top - scrollTop + (panelRect.top ?? 0);
      const overlayScreenBot = overlayScreenTop + height;
      const panelTop = panelRect.top ?? 0;
      const panelBot = panelRect.bottom ?? panelTop + (scroller.clientHeight || 0);
      const aboveSafe = Math.max(0, panelTop - overlayScreenTop);
      const belowSafe = Math.max(0, overlayScreenBot - panelBot);
      console.log(
        '[DIAG-OVERLAY] ' +
          JSON.stringify({
            overlayTop: Math.round(top),
            overlayLeft: Math.round(left),
            overlayW: Math.round(width),
            overlayH: Math.round(height),
            overlayScreenTop: Math.round(overlayScreenTop),
            overlayScreenBot: Math.round(overlayScreenBot),
            staffTop: Math.round(visualRect.top),
            staffBot: Math.round(visualRect.bottom),
            panelTop: Math.round(panelTop),
            panelBot: Math.round(panelBot),
            // How much the overlay extends past the panel (clipped px).
            // 0/0 = fits cleanly; >0 above or below = doesn't fit.
            clippedAbove: Math.round(aboveSafe),
            clippedBelow: Math.round(belowSafe),
            scrollTop: Math.round(scrollTop),
          })
      );
    } catch (e) {
      console.warn('[DIAG-OVERLAY] threw: ' + (e as Error).message);
    }
  }

  function scorePanelMargins(scroller: HTMLElement): { top: number; bottom: number } {
    const h = scroller.clientHeight || 0;
    const margin = Math.max(SAFE_MARGIN_MIN_PX, Math.round(h * SAFE_MARGIN_RATIO));
    return { top: margin, bottom: margin };
  }

  interface ScrollMetrics {
    panelTop: number;
    panelBottom: number;
    safeTop: number;
    safeBottom: number;
    activeTop: number;
    activeBottom: number;
    focusY: number;
    outside: boolean;
  }

  interface ScrollPlan {
    delta: number;
    absDelta: number;
    nextScrollTop: number;
  }

  function measureSafePanel(
    scroller: HTMLElement,
    panelRect: RectLike,
    activeRect: RectLike
  ): ScrollMetrics {
    const margin = scorePanelMargins(scroller);
    const safeTop = panelRect.top + margin.top;
    const safeBottom = panelRect.bottom - margin.bottom;
    const focusY = activeFocusY(activeRect);
    return {
      panelTop: panelRect.top,
      panelBottom: panelRect.bottom,
      safeTop,
      safeBottom,
      activeTop: activeRect.top,
      activeBottom: activeRect.bottom,
      focusY,
      outside:
        focusY < safeTop - SCROLL_HYSTERESIS_PX || focusY > safeBottom + SCROLL_HYSTERESIS_PX,
    };
  }

  function planPanelScroll(
    scroller: HTMLElement,
    metrics: ScrollMetrics,
    reason: ScrollReason
  ): ScrollPlan {
    let delta = 0;
    if (reason === 'first-scroll' || reason === 'system-change') {
      // Center the active region in the panel. Works whether the active
      // region is a single notehead, the cursor element spanning a staff,
      // or a tall chord with ledger lines on both sides. Pure
      // edge-of-safe-band landing (the within-system rule) sticks the
      // cursor too close to the panel top after big jumps (first-scroll
      // / repeat back-jumps); centering instead leaves breathing room
      // above (context: previous system or empty start padding) and
      // below (lookahead).
      //
      // If the active region is taller than the panel's safe band we
      // could clip, so fall back to pinning activeTop to safeTop in that
      // overflow case (preserves the top of the system, which is
      // typically more important than the bottom for reading).
      const panelHeight = metrics.panelBottom - metrics.panelTop;
      const safeHeight = metrics.safeBottom - metrics.safeTop;
      const activeHeight = metrics.activeBottom - metrics.activeTop;
      if (activeHeight > safeHeight) {
        delta = metrics.activeTop - metrics.safeTop;
      } else {
        const targetMid = metrics.panelTop + panelHeight * FIRE_TARGET_RATIO;
        const activeMid = (metrics.activeTop + metrics.activeBottom) / 2;
        delta = activeMid - targetMid;
      }
    } else {
      // Within-system reveals: minimum scroll to bring focusY back into
      // the safe band. The active region extends belowFocus pixels below
      // focusY (stem, ledger lines, lower staff), so shrink
      // effectiveSafeBottom so that when focusY lands there,
      // activeRect.bottom lands at safeBottom — keeping the entire staff
      // visible instead of clipping the bottom.
      const belowFocus = Math.max(0, metrics.activeBottom - metrics.focusY);
      const effectiveSafeBottom = Math.max(metrics.safeTop + 1, metrics.safeBottom - belowFocus);
      if (metrics.focusY < metrics.safeTop) {
        delta = metrics.focusY - metrics.safeTop;
      } else if (metrics.focusY > effectiveSafeBottom) {
        delta = metrics.focusY - effectiveSafeBottom;
      }
      if (reason === 'active-outside-safe') {
        delta = clamp(delta, -MAX_ACTIVE_SCROLL_DELTA_PX, MAX_ACTIVE_SCROLL_DELTA_PX);
      }
    }

    const nextScrollTop = Math.round(Math.max(0, scroller.scrollTop + delta));
    return {
      delta,
      absDelta: Math.abs(nextScrollTop - scroller.scrollTop),
      nextScrollTop,
    };
  }

  function activeFocusY(rect: RectLike): number {
    const h = rect.bottom - rect.top;
    if (h <= 0) return rect.top;
    // For tall chords/beams/ledger groups, chase the reading point in
    // the upper half instead of trying to fit the entire vertical span.
    // That is how score readers avoid oscillating between top and bottom
    // of wide-range passages.
    return h > 96 ? rect.top + h * 0.42 : (rect.top + rect.bottom) / 2;
  }

  /** Single scroll-event logger for both fire + skip cases. Skip events
   *  rate-limit to 1-in-16 to keep the console readable in dense
   *  passages; fire events are rare (only on system change / safe-band
   *  exit) so they always log. */
  function logScrollEvent(
    event: 'fire' | 'skip',
    cursor: OsmdCursorRef,
    sysIdx: number | null,
    prevSysIdx: number | null,
    reason: ScrollReason,
    metrics: ScrollMetrics,
    plan: ScrollPlan
  ): void {
    if (event === 'skip' && ++_diagSkipTick % 16 !== 1) return;
    console.log(
      `[CURSOR-SCROLL ${SCROLL_LOG_VERSION}] ` +
        JSON.stringify({
          event,
          reason,
          m: cursor?.iterator?.CurrentMeasureIndex ?? null,
          sysIdx,
          prevSysIdx,
          panelTop: Math.round(metrics.panelTop),
          panelBottom: Math.round(metrics.panelBottom),
          safeTop: Math.round(metrics.safeTop),
          safeBottom: Math.round(metrics.safeBottom),
          activeTop: Math.round(metrics.activeTop),
          activeBottom: Math.round(metrics.activeBottom),
          focusY: Math.round(metrics.focusY),
          delta: Math.round(plan.delta),
          nextScrollTop: Math.round(plan.nextScrollTop),
        })
    );
  }

  /** Resolve the music-system index of the cursor's current measure.
   *  Returns null when the GraphicalMusicSheet path is unpopulated
   *  (mid-load) or the OSMD library doesn't expose the chain (test
   *  fixtures). The chain
   *  `GraphicalMusicSheet.MeasureList[m][0].parentMusicSystem` mirrors
   *  what OSMD's own Cursor.update uses to position the cursor. */
  function computeSystemIdx(osmd: OsmdInstanceRef): number | null {
    try {
      const m = osmd.cursor?.iterator?.CurrentMeasureIndex;
      if (typeof m !== 'number') return null;
      const gms = osmd.GraphicalMusicSheet ?? osmd.graphic;
      const sys = gms?.MeasureList?.[m]?.[0]?.parentMusicSystem;
      const idRaw = sys?.Id ?? sys?.id;
      return typeof idRaw === 'number' ? idRaw : null;
    } catch {
      return null;
    }
  }

  /** Reset the scroll tracker (called from resetToStart). After reset
   *  the cursor is at the score's beginning; the next ensureCursorVisible
   *  call should fire the first-scroll branch. */
  function resetScrollTracking(): void {
    scrollState.hasAnchor = false;
    scrollState.lastSysIdx = null;
    scrollState.lastScrollAtMs = 0;
    scrollState.lastScrollDirection = 0;
  }

  let _diagCalls = 0;
  function _diagCursorPos(osmd: OsmdInstanceRef): void {
    _diagCalls++;
    if (_diagCalls % 16 !== 1) return;

    try {
      const cursor = osmd.cursor;
      if (!cursor) return;
      const ce = cursor.cursorElement;
      if (!ce?.getBoundingClientRect) return;
      const cr = ce.getBoundingClientRect();
      const it = cursor.iterator;
      const cursorM = it?.CurrentMeasureIndex;
      const cursorRep = it?.currentRepetitionIndex ?? it?.CurrentRepetitionIndex ?? null;
      const zoom = osmd.zoom ?? 1;

      // [Cursor expected-top via GraphicalMusicSheet] Walk
      // GraphicalMusicSheet.MeasureList[m][0] → parentMusicSystem →
      // StaffLines[0]. This is the path OSMD's own Cursor.update uses.
      const gms = osmd.GraphicalMusicSheet ?? osmd.graphic;
      const gMeasureRow = typeof cursorM === 'number' ? gms?.MeasureList?.[cursorM] : null;
      const gMeasure = gMeasureRow?.[0];
      const cursorSys = gMeasure?.parentMusicSystem;
      const cursorSysIdx = cursorSys?.Id ?? cursorSys?.id ?? null;
      const sysY = cursorSys?.PositionAndShape?.AbsolutePosition?.y;
      const sl0 = cursorSys?.StaffLines?.[0];
      const slLast = cursorSys?.StaffLines?.[(cursorSys?.StaffLines?.length ?? 0) - 1];
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
      // The visual top uses the same active-note rectangle as the scroll
      // controller, so diagnostics and behavior share one target.
      let noteHeadTop: number | null = null;
      let noteGTop: number | null = null;
      let noteM: number | null = null;
      let noteSysIdx: number | null = null;
      try {
        const n = getNotesUnderCursor(cursor)[0];
        const g = n?.getSVGGElement?.();
        if (g?.getBoundingClientRect) noteGTop = g.getBoundingClientRect().top;
        const noteRect = n ? noteToViewportRect(n) : null;
        noteHeadTop = noteRect ? noteRect.top : null;
        const noteMeasure = n?.parentVoiceEntry?.parentStaffEntry?.parentMeasure;
        noteM = noteMeasure?.MeasureNumber ?? noteMeasure?.measureListIndex ?? null;
        const noteSys = noteMeasure?.parentMusicSystem;
        const rawNoteSysIdx = noteSys?.Id ?? noteSys?.id;
        noteSysIdx = typeof rawNoteSysIdx === 'number' ? rawNoteSysIdx : null;
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
            activeRect: (() => {
              const active = computeActiveCursorRect(cursor, ce);
              const panel = resolveScoreScroller(ce);
              const panelRect = safeRect(panel);
              if (!active || !panel || !panelRect) return null;
              const metrics = measureSafePanel(panel, panelRect, active);
              return {
                top: Math.round(metrics.activeTop),
                bottom: Math.round(metrics.activeBottom),
                focusY: Math.round(metrics.focusY),
                safeTop: Math.round(metrics.safeTop),
                safeBottom: Math.round(metrics.safeBottom),
                outside: metrics.outside,
              };
            })(),
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
      if (!osmd.cursor) return false;
      // OSMD's MusicPartManagerIterator constructor returns `unknown` in
      // our narrow lib type; we trust the lib's shape lines up with
      // OsmdIteratorRef well enough for the cursor.update() that runs
      // next to read its CurrentMeasureIndex / currentTimeStamp.
      osmd.cursor.iterator = new Lib.MusicPartManagerIterator!(
        osmd.Sheet,
        startTs,
        undefined
      ) as OsmdIteratorRef;
      return true;
    } catch {
      return false;
    }
  }

  /** Public entry point for re-painting the custom overlay when the
   *  caller knows the layout changed (resize / zoom / re-render).
   *  Internal updates from setCursorToNote / resetToStart bypass this
   *  wrapper and call `paintCustomCursor(osmd)` directly. */
  function repaintCustomCursor(): void {
    const osmd = deps.getOsmd();
    if (!osmd) return;
    paintCustomCursor(osmd);
  }

  return {
    resetToStart,
    clearHighlights,
    highlightCurrentNotes,
    setCursorToNote,
    repaintCustomCursor,
  };
}
