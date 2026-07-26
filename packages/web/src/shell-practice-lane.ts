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

import type { JudgeProfile } from '@piano/core';
import type { MidiInputRef } from './shell-midi';
import type { InitialPracticeState } from './practice-state-init';
import type { InitialGameState } from './game-state-init';
import type { PianoConfig } from './piano-config';
import * as PracticeLane from './practice-lane';

export interface ShellPracticeLaneDeps {
  ctx: CanvasRenderingContext2D;
  practice: InitialPracticeState;
  state: InitialGameState;
  midiInput: MidiInputRef;
  config: PianoConfig;
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
  /** 現在有効な判定窓（入力パス × 厳しさ）。毎フレーム読む。 */
  getJudgeProfile: () => JudgeProfile;
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
    // 判定帯は現在の入力パス（MIDI/マイク）× 厳しさの窓を毎フレーム読む。
    // セクション途中でキーボードを挿しても、設定を変えても帯が追従する。
    getJudgeProfile: deps.getJudgeProfile,
    // Low-tier iPads (PERF_PROFILE.shadowBlur=false) skip the tile glow —
    // up to 25 shadowed roundRects/frame forced software rasterization.
    useShadow: deps.config.SHADOW_BLUR_ENABLED,
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
