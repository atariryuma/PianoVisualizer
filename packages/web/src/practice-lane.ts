// Practice lane — falling-notes renderer + per-frame OSMD cursor sync.
// Phase 0d batch 15 extraction from legacy-app.js.
//
// Per-frame work (called from the render-loop's late phase whenever
// practice.enabled):
//
//   1. OSMD cursor sync — sit OSMD's iterator on the note we're
//      currently working on. Uses (measureIdx, inBarQuarters) so the
//      iterator walks natively (no shadow timeline). Mode rules:
//        - rhythm/listen: latest note whose timeMs ≤ real elapsed
//        - guided:        practice.currentNoteIdx (kept in sync by
//                         the practice tick as the kid resolves notes)
//      Between two consecutive notes the cursor stays on the earlier
//      one — synthetic rest-step movement would visibly drift on
//      multi-voice scores where intermediate steps aren't uniform.
//
//   2. Lane region calculation — when the OSMD score is visible and
//      we're in phone-landscape mode, the lane shifts right of the
//      score (split-pane). Otherwise the lane occupies the full width
//      below the score.
//
//   3. View object population — `_laneView` / `_laneTiming` /
//      `_laneOpts` are persistent objects (declared once, mutated per
//      frame). This keeps JIT hidden classes stable + avoids GC churn
//      at 60fps. The lane drawer mutates `laneDrawFromIdx` in place —
//      we copy it back to practice.* at the end of the frame.
//
//   4. PianoCore.drawPracticeLane delegation.
//
// i18n: label strings (laneLeft / laneRight / countInGo) are pulled
// from `t()` once at boot + on every `langchange` event via
// `setLabels()` — the per-frame draw doesn't pay for translator calls.

/** Practice slice the lane reads + writes. */
export interface PracticeLanePracticeRef {
  enabled: boolean;
  mode: string;
  sectionNotes: Array<{
    timeMs: number;
    midi: number;
    measureIdx?: number;
    inBarQuarters?: number;
    hit?: boolean;
    missed?: boolean;
    _filtered?: boolean;
  }>;
  currentNoteIdx: number;
  sectionIdx: number;
  handRanges?: { lhMin: number; lhMax: number; rhMin: number; rhMax: number };
  laneDrawFromIdx?: number;
  _cursorScanIdx?: number;
  _lastCursorNoteIdx?: number;
}

/** Game-state slice — only `useSynesthesiaMode` is read. */
export interface PracticeLaneStateRef {
  useSynesthesiaMode: boolean;
}

/** Cached OSMD bounding rect — refreshed by the shell's syncLayout +
 *  ResizeObserver. The lane reads it without forcing a layout via
 *  getBoundingClientRect() each frame. */
export interface PracticeLaneOsmdRect {
  right: number;
  bottom: number;
  top: number;
  height: number;
}

/** Live layout snapshot the lane reads each frame. */
export interface PracticeLaneLayout {
  W: number;
  H: number;
  kbHeight: number;
  kbSafeBottom: number;
  safeRight: number;
  currentLayoutMode: string;
  cachedOsmdRect: PracticeLaneOsmdRect;
}

/** Current-song slice — only `sections[idx].isBoss` is read. */
export interface PracticeLaneSong {
  sections: Array<{ isBoss?: boolean }>;
}

/** OSMD adapter slice — only `cursorTo` is called. */
export interface PracticeLaneOsmdAdapter {
  cursorTo(measureIdx: number, inBarQuarters: number): void;
}

/** PianoCore.drawPracticeLane forwarder. The inner shapes are defined
 *  in @piano/core (LaneViewState / LaneTimings / LaneDrawOptions);
 *  we accept anything assignable to those via `any` so callers can
 *  pass the live PianoCore.drawPracticeLane reference without a cast.
 *  The internal call passes our own typed objects, so this stays safe
 *  in practice. */
 
export type DrawPracticeLaneFn = (
  ctx: CanvasRenderingContext2D,
  view: any,
  timing: any,
  opts: any
) => void;

export interface PracticeLaneDeps {
  ctx: CanvasRenderingContext2D;
  practice: PracticeLanePracticeRef;
  state: PracticeLaneStateRef;
  midiInput: { enabled: boolean };
  /** Live layout snapshot — re-read each frame. */
  getLayout(): PracticeLayoutAndDom;
  /** Live current song accessor. */
  getCurrentSong(): PracticeLaneSong | null;
  /** OSMD adapter + scroller (called on cursor advance). */
  osmdAdapter: PracticeLaneOsmdAdapter;
  osmdScrollToCursor(): void;
  /** Practice clocks. */
  practiceElapsedMs(): number;
  practiceRealElapsedMs(): number;
  /** Color + label helpers. */
  noteThemeColor: (midi: number) => string;
  midiToPitchName: (midi: number) => string;
  noteColors: Record<string, string>;
  noteNames: readonly string[];
  /** Layout constants (CONFIG-derived). */
  laneLookaheadMs: number;
  countInMs: number;
  hitWindowEarlyMs: number;
  hitWindowMs: number;
  perfectMs: number;
  /** PianoCore.drawPracticeLane. */
  drawPracticeLane: DrawPracticeLaneFn;
  /** Initial i18n labels. Refresh via setLabels(). */
  laneLabelL: string;
  laneLabelR: string;
  countInGoLabel: string;
}

/** Layout snapshot + the OSMD container element (for visibility check).
 *  Bundled into one object so the deps `getLayout` returns one shape. */
export interface PracticeLayoutAndDom extends PracticeLaneLayout {
  osmdContainerVisible: boolean;
}

export interface PracticeLane {
  /** Per-frame draw. Called from the render-loop's late phase. */
  draw(timeMs: number): void;
  /** Refresh i18n labels — called on langchange. */
  setLabels(labels: { laneLabelL: string; laneLabelR: string; countInGoLabel: string }): void;
  /** Refresh tempo-derived timings — called by recomputePracticeTimings
   *  at section start so the first frame's countdown + descent rate
   *  match the new section's tempo. */
  setTimings(timings: { laneLookaheadMs: number; countInMs: number }): void;
}

export function createPracticeLane(deps: PracticeLaneDeps): PracticeLane {
  // Honour the synesthesia toggle: when off, fall back to the active
  // theme's cyclic palette so the lane tiles match the keyboard's
  // resting colors (rainbow lane while synesthesia is OFF was a leak
  // from before).
  const noteRestingColor = (m: number): string => {
    if (deps.state.useSynesthesiaMode) {
      return deps.noteColors[deps.noteNames[m % 12]] || '#fff';
    }
    return deps.noteThemeColor(m);
  };

  // Persistent _laneView reference — drawPracticeLane mutates
  // laneDrawFromIdx in place each frame; the legacy code re-uses one
  // object instead of re-allocating. sectionNotes / handRanges start
  // null and get populated at section build.
  const laneView = {
    enabled: true,
    sectionNotes: [] as PracticeLanePracticeRef['sectionNotes'],
    handRanges: { lhMin: 48, lhMax: 60, rhMin: 60, rhMax: 72 },
    laneDrawFromIdx: 0,
    currentNoteIdx: 0,
    isBoss: false,
  };
  const laneTiming = { elapsedMs: 0, realElapsedMs: 0, nowMs: 0 };
  const laneOpts = {
    screenW: 0,
    screenH: 0,
    osmdVisible: false,
    laneTopOverride: undefined as number | undefined,
    kbReserve: 0,
    laneLookaheadMs: deps.laneLookaheadMs,
    countInMs: deps.countInMs,
    hitWindowEarlyMs: deps.hitWindowEarlyMs,
    hitWindowMs: deps.hitWindowMs,
    perfectMs: deps.perfectMs,
    laneLabelL: deps.laneLabelL,
    laneLabelR: deps.laneLabelR,
    countInGoLabel: deps.countInGoLabel,
    midiToPitchName: deps.midiToPitchName,
    noteRestingColor,
  };

  function setLabels(labels: {
    laneLabelL: string;
    laneLabelR: string;
    countInGoLabel: string;
  }): void {
    laneOpts.laneLabelL = labels.laneLabelL;
    laneOpts.laneLabelR = labels.laneLabelR;
    laneOpts.countInGoLabel = labels.countInGoLabel;
  }

  function setTimings(timings: { laneLookaheadMs: number; countInMs: number }): void {
    laneOpts.laneLookaheadMs = timings.laneLookaheadMs;
    laneOpts.countInMs = timings.countInMs;
  }

  function draw(timeMs: number): void {
    if (!deps.practice.enabled) return;
    const layout = deps.getLayout();
    const osmdVisible = layout.osmdContainerVisible;
    const kbReserve = deps.midiInput.enabled ? layout.kbHeight + layout.kbSafeBottom + 16 : 60;

    // === Per-frame cursor sync ===
    if (osmdVisible && deps.practice.sectionNotes.length > 0) {
      const notes = deps.practice.sectionNotes;
      let targetIdx: number;
      if (deps.practice.mode === 'guided') {
        targetIdx = Math.min(deps.practice.currentNoteIdx | 0, notes.length - 1);
      } else {
        const elapsed = deps.practiceRealElapsedMs();
        let pIdx = (deps.practice._cursorScanIdx ?? 0) | 0;
        if (pIdx >= notes.length || notes[pIdx].timeMs > elapsed) pIdx = 0;
        while (pIdx + 1 < notes.length && notes[pIdx + 1].timeMs <= elapsed) pIdx++;
        deps.practice._cursorScanIdx = pIdx;
        targetIdx = pIdx;
      }
      if (targetIdx !== deps.practice._lastCursorNoteIdx) {
        const note = notes[targetIdx];
        if (note && note.measureIdx !== undefined && note.inBarQuarters !== undefined) {
          deps.osmdAdapter.cursorTo(note.measureIdx, note.inBarQuarters);
          deps.osmdScrollToCursor();
        }
        deps.practice._lastCursorNoteIdx = targetIdx;
      }
    }

    // === Lane region ===
    let laneLeft = 0;
    let laneWidth = layout.W;
    let laneTopOverride: number | undefined;
    if (osmdVisible && layout.cachedOsmdRect.height > 0) {
      if (layout.currentLayoutMode === 'phone-landscape') {
        laneLeft = Math.round(layout.cachedOsmdRect.right + 8);
        // Subtract safeRight so notes near the right edge don't fall
        // into the home-indicator / notch zone on iPhones held landscape.
        laneWidth = Math.max(160, layout.W - laneLeft - 4 - layout.safeRight);
        laneTopOverride = Math.round(layout.cachedOsmdRect.top);
      } else {
        laneTopOverride = Math.round(layout.cachedOsmdRect.bottom + 12);
      }
    }

    // === View / timing / opts population ===
    laneView.sectionNotes = deps.practice.sectionNotes;
    if (deps.practice.handRanges) laneView.handRanges = deps.practice.handRanges;
    laneView.laneDrawFromIdx = deps.practice.laneDrawFromIdx ?? 0;
    laneView.currentNoteIdx = deps.practice.currentNoteIdx;
    const currentSong = deps.getCurrentSong();
    laneView.isBoss = !!currentSong?.sections[deps.practice.sectionIdx]?.isBoss;
    laneTiming.elapsedMs = deps.practiceElapsedMs();
    laneTiming.realElapsedMs = deps.practiceRealElapsedMs();
    laneTiming.nowMs = timeMs;
    laneOpts.screenW = laneWidth;
    laneOpts.screenH = layout.H;
    laneOpts.osmdVisible = osmdVisible;
    laneOpts.laneTopOverride = laneTopOverride;
    laneOpts.kbReserve = kbReserve;

    // === Draw + cursor amortization writeback ===
    const translated = laneLeft !== 0;
    if (translated) {
      deps.ctx.save();
      deps.ctx.translate(laneLeft, 0);
    }
    deps.drawPracticeLane(deps.ctx, laneView, laneTiming, laneOpts);
    if (translated) deps.ctx.restore();
    deps.practice.laneDrawFromIdx = laneView.laneDrawFromIdx;
  }

  return { draw, setLabels, setTimings };
}
