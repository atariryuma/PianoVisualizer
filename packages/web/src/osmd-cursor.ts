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
  /** GraphicalMusicSheet — entry point for measure→graphical lookups.
   *  Typed as `any` because the OSMD types are deep + version-volatile;
   *  we only access `findGraphicalStaffEntryFromMeasureList` and use a
   *  try/catch fallback to GNotesUnderCursor() if it's missing. */
  GraphicSheet?: unknown;
}

/** OSMD cursor surface — only the bits we read/call. */
export interface OsmdCursorRef {
  cursorElement?: { offsetTop: number; offsetHeight?: number } | null;
  iterator?: OsmdIteratorRef;
  reset?(): void;
  next?(): void;
  show?(): void;
  hide?(): void;
  /** Re-run the visual position math against the current iterator
   *  state. We need to invoke this manually after a walk because
   *  `cursor.next()` (= moveToNextVisibleVoiceEntry + update) can
   *  throw inside `update()` for certain entries (grace notes,
   *  hidden voices, ...) — the iterator advances anyway, so without
   *  a recovery `update()` the visual lags behind permanently. */
  update?(): void;
  GNotesUnderCursor?(): OsmdGraphicalNote[];
  NotesUnderCursor?(): OsmdGraphicalNote[];
}

export interface OsmdIteratorRef {
  endReached: boolean;
  CurrentMeasureIndex: number;
  currentTimeStamp: { realValue: number };
  /** Advance to the next visible voice entry without running the
   *  cursor's `update()` — used by the walk loop to dodge the OSMD
   *  `update()` throw without losing iterator progress. */
  moveToNextVisibleVoiceEntry?(notIncludingGraceNote: boolean): void;
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

    // Resolve graphical notes for the cursor's current iterator stop.
    // The natural choice — `cursor.GNotesUnderCursor()` — is broken
    // for tied bass / pedaled notes: it routes the source-note → graphical-
    // note lookup through `rules.GNote(note)`, which can return a
    // GraphicalNote anchored to the TIE's start (an earlier system).
    // OSMD's own playback API works around this with two filters that
    // GNotesUnderCursor doesn't apply:
    //   1. skip tie continuations  (note.NoteTie.StartNote !== note)
    //   2. resolve via findGraphicalStaffEntryFromMeasureList(staffIdx,
    //      measureIdx, sourceStaffEntry) — anchored to the iterator's
    //      CURRENT measure, not the tie start.
    // We replicate both here so the cursor visual + the painted notes
    // are guaranteed to live on the same MusicSystem. Falls back to
    // GNotesUnderCursor when the internal API isn't reachable (older
    // OSMD or test fixtures), so the legacy path stays as a safety net.
    const list = collectStartedAtCursor(osmd) ?? legacyGNotesFallback(osmd);
    // [DIAG-CURSORSYNC 2026-05-09] Capture the bounding rect of the
    // FIRST highlighted note so we can compare it to the visual cursor
    // position. REMOVE after diagnosis.
    let _diagFirstNoteTop: number | null = null;
    let _diagFirstNoteId = '';
    for (const n of list) {
      if (!n || typeof n.getSVGGElement !== 'function') continue;
      let g: SVGGElement | null;
      try {
        g = n.getSVGGElement();
      } catch {
        continue;
      }
      if (!g) continue;
      // [DIAG-CURSORSYNC] capture once
      if (_diagFirstNoteTop === null) {
        try {
          const r = g.getBoundingClientRect();
          _diagFirstNoteTop = r.top;
          _diagFirstNoteId = g.id || g.tagName;
        } catch {
          /* detached during song swap */
        }
      }
      const paths = g.querySelectorAll<SVGPathElement>('path');
      for (const p of paths) {
        if (p.dataset && !('_origFill' in p.dataset)) {
          p.dataset._origFill = p.style.fill || '';
        }
        p.style.fill = fill;
        highlightedPaths.push(p);
      }
    }
    // [DIAG-CURSORSYNC] Compare highlighted-note rect.top to the
    // visual cursor's rect.top. They should match within a few px on
    // every call. Logged at most every 8 calls to keep server.log
    // readable.
    _diagSyncProbe(osmd, list.length, _diagFirstNoteTop, _diagFirstNoteId);
  }

  /** Mirrors OSMD's `getAudibleEntries` tie filter + the cursor's own
   *  `getStaffEntryFromVoiceEntry` graphical-resolution path. Returns
   *  `null` when the internal OSMD shape isn't reachable so the caller
   *  can fall back to GNotesUnderCursor. */
  function collectStartedAtCursor(osmd: OsmdInstanceRef): OsmdGraphicalNote[] | null {
    // Reach into OSMD internals via `any` — the structure is deeply
    // nested and version-volatile, and the public types don't surface
    // it. Every nested access is wrapped in a try/catch so a single
    // shape change can't break the highlight altogether (we just
    // fall back to the legacy path).
     
    const cursor = osmd.cursor as any;
    const graphicSheet = osmd.GraphicSheet as any;
    if (!cursor?.iterator || !graphicSheet?.findGraphicalStaffEntryFromMeasureList) {
      return null;
    }
    const out: OsmdGraphicalNote[] = [];
    let voiceEntries: any[];
    try {
      voiceEntries = cursor.iterator.CurrentVisibleVoiceEntries?.() || [];
    } catch {
      return null;
    }
    for (const ve of voiceEntries) {
      if (!ve?.Notes) continue;
      const sourceStaffEntry = ve.ParentSourceStaffEntry;
      if (!sourceStaffEntry?.VerticalContainerParent?.ParentMeasure) continue;
      const measureIdx = sourceStaffEntry.VerticalContainerParent.ParentMeasure.measureListIndex;
      const staffIdx = sourceStaffEntry.ParentStaff?.idInMusicSheet;
      if (typeof measureIdx !== 'number' || typeof staffIdx !== 'number') continue;
      let gse: any;
      try {
        gse = graphicSheet.findGraphicalStaffEntryFromMeasureList(
          staffIdx,
          measureIdx,
          sourceStaffEntry
        );
      } catch {
        continue;
      }
      if (!gse?.graphicalVoiceEntries) continue;
      for (const note of ve.Notes) {
        // Skip tie continuations — same predicate OSMD's playback
        // uses in `getAudibleEntries`. The tie object stores the
        // first note as StartNote; subsequent notes in the same tie
        // chain reuse the same StartNote, so identity comparison
        // distinguishes start-of-tie from continuation cleanly.
        if (note?.NoteTie && note.NoteTie.StartNote !== note) continue;
        for (const gve of gse.graphicalVoiceEntries) {
          for (const gn of gve.notes ?? []) {
            if (gn?.sourceNote === note) out.push(gn as OsmdGraphicalNote);
          }
        }
      }
    }
    return out;
     
  }

  /** Pre-fix path. Kept so older OSMD builds + test fixtures (which
   *  don't surface `osmd.GraphicSheet`) still get notehead highlights,
   *  at the cost of the tied-note desync we documented above. */
  function legacyGNotesFallback(osmd: OsmdInstanceRef): OsmdGraphicalNote[] {
    if (!osmd.cursor) return [];
    try {
      if (typeof osmd.cursor.GNotesUnderCursor === 'function') {
        return osmd.cursor.GNotesUnderCursor() || [];
      }
      if (typeof osmd.cursor.NotesUnderCursor === 'function') {
        return osmd.cursor.NotesUnderCursor() || [];
      }
    } catch {
      /* swallow */
    }
    return [];
  }

  // [DIAG-CURSORSYNC 2026-05-09] Begin diagnostic block — REMOVE after
  // root cause is confirmed. grep for [DIAG-CURSORSYNC] to find every
  // touch point.
  let _diagSyncCalls = 0;
  function _diagSyncProbe(
    osmd: OsmdInstanceRef,
    listLen: number,
    noteTop: number | null,
    noteId: string
  ): void {
    _diagSyncCalls++;
    if (_diagSyncCalls % 8 !== 1) return;
    const ce = (osmd.cursor?.cursorElement as unknown as HTMLElement | null) ?? null;
    let cursorTop: number | null = null;
    try {
      if (ce && typeof (ce as Element).getBoundingClientRect === 'function') {
        cursorTop = ce.getBoundingClientRect().top;
      }
    } catch {
      /* hidden / detached */
    }
    const it = osmd.cursor?.iterator;
    const delta = noteTop !== null && cursorTop !== null ? Math.round(noteTop - cursorTop) : null;
    try {
      console.log(
        '[DIAG-CURSORSYNC] ' +
          JSON.stringify({
            calls: _diagSyncCalls,
            listLen,
            cursorTop: cursorTop !== null ? Math.round(cursorTop) : null,
            noteTop: noteTop !== null ? Math.round(noteTop) : null,
            delta,
            noteId,
            m: it?.CurrentMeasureIndex,
            ts:
              typeof it?.currentTimeStamp?.realValue === 'number'
                ? +it.currentTimeStamp.realValue.toFixed(3)
                : null,
          })
      );
    } catch {
      /* swallow — diag must never throw */
    }
  }
  // [DIAG-CURSORSYNC] End block

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
    // reaches the target. Use the iterator's own moveToNextVisibleVoiceEntry
    // when available — `cursor.next()` is "iterator advance + visual
    // update", and the visual update throws on grace notes / hidden
    // voices. Catching the throw inside the loop keeps the iterator
    // advancing but leaves the visual cursor stranded at the last
    // successful update — over a long song the visual desyncs from
    // the iterator (and from the highlighted notes downstream of
    // GNotesUnderCursor) by a full system or more (server.log
    // [DIAG-CURSORSYNC] 2026-05-09: delta drifts to −300 px+ in the
    // latter half of dense scores). Driving the iterator directly
    // dodges the throw entirely; we then call `cursor.update()` once
    // outside the loop to re-sync the visual to the iterator's final
    // position. The legacy `cursor.next()` path is kept as a fallback
    // for OSMD builds that haven't surfaced moveToNextVisibleVoiceEntry.
    let safety = safetyCap;
    const advance =
      typeof it.moveToNextVisibleVoiceEntry === 'function'
        ? () => it.moveToNextVisibleVoiceEntry!(false)
        : () => osmd.cursor!.next?.();
    while (!it.endReached && safety-- > 0) {
      const m = it.CurrentMeasureIndex;
      if (m > targetM) break;
      if (m === targetM && inBarQ() >= targetQ - eps) break;
      try {
        advance();
      } catch {
        /* hidden voice / grace note — iterator still advances */
      }
    }
    // Resync the visual cursor to the iterator's final position. If
    // we walked via moveToNextVisibleVoiceEntry, this is the only call
    // that paints the cursor at the new spot. If we walked via
    // cursor.next() and an intermediate update() threw, this is the
    // recovery call that catches the visual back up.
    try {
      osmd.cursor.update?.();
    } catch {
      /* same throw conditions as cursor.next()'s update — best effort */
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
