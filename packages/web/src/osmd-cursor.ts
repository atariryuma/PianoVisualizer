// OSMD cursor — four operations on the OSMD instance + its cursor,
// plus the scroll-tracking concern.
//
// Industry-standard architecture (mirrors musicxml-player +
// osmd-audio-player), with one local choice: OSMD's built-in
// `followCursor` is OFF and we drive the fixed OSMD panel's scrollTop
// ourselves (see `ensureCursorVisible` below for rationale).
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
const SCROLL_LOG_VERSION = 'v10';
const OSMD_CONTAINER_ID = 'osmdContainer';
const SAFE_MARGIN_RATIO = 0.14;
const SAFE_MARGIN_MIN_PX = 32;
const SCROLL_HYSTERESIS_PX = 48;
const MIN_SCROLL_DELTA_PX = 8;
const ACTIVE_SCROLL_COOLDOWN_MS = 120;
const SAME_SYSTEM_REVERSAL_COOLDOWN_MS = 450;
const MAX_ACTIVE_SCROLL_DELTA_PX = 120;

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
      const cursor = osmd.cursor as any;
      const ce = cursor?.cursorElement as HTMLElement | undefined;
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

  function computeActiveCursorRect(cursor: any, ce: HTMLElement): RectLike | null {
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
    if (metrics.focusY < metrics.safeTop) {
      delta = metrics.focusY - metrics.safeTop;
    } else if (metrics.focusY > metrics.safeBottom) {
      delta = metrics.focusY - metrics.safeBottom;
    }
    if (reason === 'active-outside-safe') {
      delta = clamp(delta, -MAX_ACTIVE_SCROLL_DELTA_PX, MAX_ACTIVE_SCROLL_DELTA_PX);
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
    cursor: any,
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
      const cursor = osmd.cursor as any;
      const m = cursor?.iterator?.CurrentMeasureIndex;
      if (typeof m !== 'number') return null;
      const gms = (osmd as any).GraphicalMusicSheet ?? (osmd as any).graphic;
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
      // The visual top uses the same active-note rectangle as the scroll
      // controller, so diagnostics and behavior share one target.
      let noteHeadTop: number | null = null;
      let noteGTop: number | null = null;
      let noteM: number | null = null;
      let noteSysIdx: any = null;
      try {
        const n = getNotesUnderCursor(cursor)[0] as
          | {
              getSVGGElement?(): SVGGElement | null;
              parentVoiceEntry?: any;
            }
          | undefined;
        const g = n?.getSVGGElement?.();
        if (g?.getBoundingClientRect) noteGTop = g.getBoundingClientRect().top;
        const noteRect = n ? noteToViewportRect(n) : null;
        noteHeadTop = noteRect ? noteRect.top : null;
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
