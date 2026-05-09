// Session state shell — Phase 0d batch 111.
//
// Bundles the two reset-shaped reducers that the shell uses across
// the session lifecycle:
//   • SessionSummary — the post-section + post-listen modal that
//     shows combo / peak flow / total sessions / radar chart of the
//     5-quality breakdown. Persists best-of via saveBestScores.
//   • SessionReset — the "go back to title" reset that drains every
//     reducer's per-tick state, clears the particle pool + ripple
//     pool, blanks the HUD DOM, and re-arms the dispatch dedupe.
//
// Both are pure-data wireups. They only stayed in legacy-app.js because
// SessionReset reaches for `_questState` / `_encState` which the shell
// owns directly (they're per-frame reducer state for ShellGameUpdate).

import * as SessionSummary from './session-summary';
import * as SessionReset from './session-reset';
import * as DomBag from './dom-bag';

 
export interface ShellSessionStateDeps {
  state: any;
  config: any;
  dom: any;
  t: any;
  /** prefs JSON store — saveBestScores writes through. */
  loadJSON: any;
  saveJSON: any;
  /** stageLabel + formatTime — reused from PianoCore re-exports. */
  stageLabel: any;
  formatTime: any;
  setupHiDPICanvas: any;
  /** Session-confidence ring buffer (shared with shell-game-update). */
  sessionRing: any[];
  sessionRingCap: number;
  /** Reducer state owned by the shell (per-tick game state). */
  questState: any;
  encState: any;
  /** Late-bound midi state — getter so we can build before midi-handlers. */
  getMidiState: () => any;
  /** Shared particle/ripple pools — drained on reset. */
  particles: any[];
  ripples: any[];
  /** Per-frame HUD reducer cache invalidator. */
  invalidateFlowCache: () => void;
  /** MIDI dispatch dedupe drain. */
  resetMidiDispatch: () => void;
  remoteLog: (msg: any) => void;
}

export interface ShellSessionState {
  /** SessionSummary forwarders — assigned into the shell forward-decls. */
  saveBestScores: (combo: number, flow: number) => any;
  renderSessionSummaryText: (animate: boolean) => void;
  showSessionSummary: () => void;
  /** SessionReset forwarder — `resetSession()` from practice-flow / dev-mode. */
  resetSession: () => void;
}

export function createShellSessionState(deps: ShellSessionStateDeps): ShellSessionState {
  const PianoCore: any = (globalThis as any).PianoCore;

  const _sessionSummary = SessionSummary.createSessionSummary({
    dom: DomBag.pickDom(
      deps.dom,
      'sessionSummary',
      'sumCombo',
      'sumStage',
      'sumTime',
      'sumQuestList',
      'sumBest',
      'radarChart'
    ) as any,
    state: deps.state,
    config: deps.config,
    loadJSON: deps.loadJSON,
    saveJSON: deps.saveJSON,
    stageLabel: deps.stageLabel,
    formatTime: deps.formatTime,
    t: deps.t,
    setupHiDPICanvas: deps.setupHiDPICanvas,
  } as any);

  const _sessionReset = SessionReset.createSessionReset({
    refs: {
      state: deps.state,
      questState: deps.questState,
      encState: deps.encState,
      getMidiState: deps.getMidiState,
      sessionRing: deps.sessionRing,
      ripples: deps.ripples,
      particles: deps.particles,
    },
    reducers: {
      resetQualityHistoryState: PianoCore.resetQualityHistoryState,
      resetQuestTrackerState: PianoCore.resetQuestTrackerState,
      resetEncouragementState: PianoCore.resetEncouragementState,
      resetWakeUpFlashState: PianoCore.resetWakeUpFlashState,
      resetChordWindowState: PianoCore.resetChordWindowState,
    },
    dom: DomBag.pickDom(
      deps.dom,
      'stageLabel',
      'encouragement',
      'qualityScore',
      'noteDisplay',
      'questDisplay',
      'questDots',
      'questLabel',
      'questToast',
      'flowFill',
      'sessionStatus',
      'playTime'
    ) as any,
    sessionRingCap: deps.sessionRingCap,
    invalidateFlowCache: deps.invalidateFlowCache,
    resetMidiDispatch: deps.resetMidiDispatch,
    remoteLog: deps.remoteLog,
    now: () => performance.now(),
  } as any);

  return {
    saveBestScores: _sessionSummary.saveBestScores,
    renderSessionSummaryText: _sessionSummary.renderSessionSummaryText,
    showSessionSummary: _sessionSummary.showSessionSummary,
    resetSession: () => _sessionReset.reset(),
  };
}
