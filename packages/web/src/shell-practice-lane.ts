// Practice lane shell — Phase 0d batch 117.
//
// Bundles createPracticeLane + the langchange-driven label refresh
// into one factory call. PracticeLane reaches across many shells
// (viewport for layout, osmd for cursor scroll, midi-handlers for
// noteThemeColor / midiToPitchName, practice for lookahead /
// countIn / elapsedMs) — the shell threads each through.
//
// langchange handler internalized — was a 3-line listener in
// legacy-app.js. PracticeLane has a setLabels() mutator so the
// per-frame draw doesn't pay for translator calls.

import * as PianoCore from '@piano/core';
import * as PracticeLane from './practice-lane';

export interface ShellPracticeLaneDeps {
  ctx: CanvasRenderingContext2D;
  practice: any;
  state: any;
  midiInput: any;
  config: any;
  /** Viewport accessors. */
  getScreen: () => { W: number; H: number };
  getKbHeight: () => number;
  getKbSafeBottom: () => number;
  getSafeRight: () => number;
  getCurrentLayoutMode: () => any;
  cachedOsmdRect: any;
  osmdContainerEl: HTMLElement | null;
  /** Song + osmd. */
  getCurrentSong: () => any;
  osmdAdapter: any;
  /** Practice timing thunks. */
  practiceElapsedMs: () => number;
  practiceRealElapsedMs: () => number;
  laneLookaheadMs: number;
  countInMs: number;
  /** MIDI render helpers. */
  noteThemeColor: (m: any) => any;
  midiToPitchName: (m: any) => any;
  /** PianoCore drawer. */
  drawPracticeLane: any;
  /** Translator. */
  t: (key: string) => string;
}

export interface ShellPracticeLane {
  /** The underlying PracticeLane instance — `_practice.setPracticeLane()`
   *  needs this so practice-timings can call `setTimings()` on it. */
  instance: ReturnType<typeof PracticeLane.createPracticeLane>;
  /** Per-frame draw — render-loop calls each tick when practice.enabled. */
  draw: (timeMs: number) => void;
}

export function createShellPracticeLane(deps: ShellPracticeLaneDeps): ShellPracticeLane {
  const { t } = deps;
  const _lane = PracticeLane.createPracticeLane({
    ctx: deps.ctx,
    practice: deps.practice,
    state: deps.state,
    midiInput: deps.midiInput,
    getLayout: () => {
      const { W, H } = deps.getScreen();
      return {
        W,
        H,
        kbHeight: deps.getKbHeight(),
        kbSafeBottom: deps.getKbSafeBottom(),
        safeRight: deps.getSafeRight(),
        currentLayoutMode: deps.getCurrentLayoutMode(),
        cachedOsmdRect: deps.cachedOsmdRect,
        osmdContainerVisible: !!(
          deps.osmdContainerEl && deps.osmdContainerEl.classList.contains('visible')
        ),
      };
    },
    getCurrentSong: deps.getCurrentSong,
    osmdAdapter: deps.osmdAdapter,
    practiceElapsedMs: deps.practiceElapsedMs,
    practiceRealElapsedMs: deps.practiceRealElapsedMs,
    noteThemeColor: deps.noteThemeColor,
    midiToPitchName: deps.midiToPitchName,
    noteColors: deps.config.NOTE_COLORS,
    noteNames: deps.config.NOTE_NAMES,
    laneLookaheadMs: deps.laneLookaheadMs,
    countInMs: deps.countInMs,
    hitWindowEarlyMs: PianoCore.HIT_WINDOW_EARLY_MS,
    hitWindowMs: PianoCore.HIT_WINDOW_MS,
    perfectMs: PianoCore.PERFECT_MS,
    drawPracticeLane: deps.drawPracticeLane,
    laneLabelL: t('laneLeft'),
    laneLabelR: t('laneRight'),
    countInGoLabel: t('countInGo'),
  } as any);

  // langchange — refresh the i18n labels. setLabels mutates the cached
  // strings the per-frame draw reads, so this stays out of the hot path.
  window.addEventListener('langchange', () => {
    _lane.setLabels({
      laneLabelL: t('laneLeft'),
      laneLabelR: t('laneRight'),
      countInGoLabel: t('countInGo'),
    });
  });

  return {
    instance: _lane,
    draw: (timeMs: number) => _lane.draw(timeMs),
  };
}
