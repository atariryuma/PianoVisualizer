// Session reset reducer — Phase 0d batch 48.
//
// Zeros the entire session state (flow / combo / quality scores /
// quest tracker / encouragement tier / pitch stability / spectral
// history / etc.), clears the DOM HUD strip, drops queued ripples /
// particles, resets MIDI input bookkeeping (active notes, sustain,
// chord-window cache, BLE-redelivery dedupe), and stamps the new
// `sessionStartTimeMs`.
//
// The legacy shell called this from one place (a "Reset" button) so
// there's only one entry — `reset()`. Many fields are widened to
// `any` because the legacy `state` bag is a shapeless grab-bag that
// touches ~50 fields in this one function; tightening every one
// would balloon the deps shape without changing behavior. Phase 0c.5
// (`// @ts-check` on legacy-app.js) is the right place to harden the
// state contract.

export interface SessionResetCoreReducers {
  resetQualityHistoryState(state: unknown): void;
  resetQuestTrackerState(trackerState: unknown): void;
  resetEncouragementState(encState: unknown): void;
  resetWakeUpFlashState(state: unknown): void;
  resetChordWindowState(midiState: unknown): void;
}

/** DOM elements the reducer hides / clears on reset. */
export interface SessionResetDom {
  stageLabel: HTMLElement;
  encouragement: HTMLElement;
  qualityScore: HTMLElement;
  noteDisplay: HTMLElement;
  questDisplay: HTMLElement;
  questDots: HTMLElement;
  questLabel: HTMLElement;
  questToast: HTMLElement;
  flowFill: HTMLElement;
  sessionStatus: HTMLElement;
  playTime: HTMLElement;
}

/** Closure refs the shell passes through; we mutate them in place
 *  so the rest of the legacy code keeps reading the same objects.
 *  `getMidiState` is a thunk because midiState is declared further
 *  down the legacy scope (after this factory's build site) — at
 *  module-init time the binding is still in TDZ. */
export interface SessionResetMidiState {
  activeNotes: { clear(): void };
  sustainedNotes: { clear(): void };
  sustainOn: boolean;
}

export interface SessionResetRefs {
  /** `state` bag (legacy big-bag). */
  state: Record<string, unknown> & {
    completedQuests: { length: number };
    sessionStartTimeMs: number;
  };
  /** Quest-tracker state object owned by @piano/core. */
  questState: { completedIds: unknown };
  /** Encouragement state object owned by @piano/core. */
  encState: { currentTier: number; lastShownTimeMs: number; hideTimeMs: number };
  /** Lazy lookup — see comment above. */
  getMidiState: () => SessionResetMidiState;
  /** Pre-allocated session-confidence ring (zero-allocation deque). */
  sessionRing: { isPiano: boolean }[];
  /** Active ripples list — cleared in place. */
  ripples: unknown[];
  /** Active particles list — cleared in place. */
  particles: unknown[];
}

export interface SessionResetDeps {
  refs: SessionResetRefs;
  reducers: SessionResetCoreReducers;
  dom: SessionResetDom;
  /** Capacity of `sessionRing`. */
  sessionRingCap: number;
  /** Force the next HUD tick to repaint the flow gauge. */
  invalidateFlowCache: () => void;
  /** Drop the BLE-redelivery dedupe cache (src/midi-dispatch.ts). */
  resetMidiDispatch: () => void;
  /** Diagnostic logger (best-effort, never throws). */
  remoteLog: (msg: string) => void;
  /** Wall-clock now, for the session-start-time stamp. */
  now: () => number;
}

export interface SessionReset {
  reset(): void;
}

export function createSessionReset(deps: SessionResetDeps): SessionReset {
  return {
    reset() {
      const r = deps.refs;
      const s = r.state as Record<string, unknown> & {
        completedQuests: unknown[] & { length: number };
        sessionStartTimeMs: number;
      };

      // ── 1. Numeric / scoring scalars ────────────────────────────
      s.flow = 0;
      s.combo = 0;
      s.bestCombo = 0;
      s.currentStage = 0;
      s.pitchStability = 0;

      // In-place buffer reset preserves array identity so consumers
      // (quality.ts) caching the ref keep working.
      deps.reducers.resetQualityHistoryState(s);
      s.centroidHistory = [];
      s.rhythmScore = 0;
      s.dynamicsScore = 0;
      s.stabilityScore = 0;
      s.qualityScore = 0;
      s.displayedQualityScore = 0;
      s.growthScore = 0;
      s.qualityHistory = [];

      // ── 2. Quest tracker — share the SAME completedQuests array ─
      // (since _questState.completedIds aliases it) by clearing in
      // place.
      s.completedQuests.length = 0;
      deps.reducers.resetQuestTrackerState(r.questState);
      r.questState.completedIds = s.completedQuests; // re-share after reset
      s.activeQuestId = null;
      s.lastQuestCheckMs = 0;

      // ── 3. Encouragement tier ───────────────────────────────────
      deps.reducers.resetEncouragementState(r.encState);
      s.currentEncouragementTier = r.encState.currentTier;
      s.lastEncouragementTimeMs = r.encState.lastShownTimeMs;
      s.encouragementHideTimeMs = r.encState.hideTimeMs > 0 ? r.encState.hideTimeMs : 0;

      // ── 4. Per-note timing ──────────────────────────────────────
      s.lastGoodNoteTimeMs = 0;
      s.lastSilenceStartMs = -1;
      s.lastPitchSemitones = null;
      s.peakFlow = 0;
      s.sessionStartTimeMs = deps.now();
      s.lastNoteTimeMs = 0;
      s.lastDetectedNote = '';

      // ── 5. Session-confidence state machine ─────────────────────
      s.sessionState = 'waiting';
      s.sessionConfidence = 0;
      s.sessionPianoCount = 0;
      s.sessionRingHead = 0;
      s.sessionRingTail = 0;
      s.sessionRingSize = 0;
      for (let i = 0; i < deps.sessionRingCap; i++) r.sessionRing[i].isPiano = false;

      // ── 6. Coaching feedback + goal window ──────────────────────
      s.feedbackGood = '';
      s.feedbackNext = '';
      s.goalWindowStartMs = 0;
      s.goalCelebrateUntilMs = 0;
      s.goalCompletedCount = 0;

      // ── 7. Spectral / onset history ─────────────────────────────
      s.spectralFluxHistory = [];
      s.prevSpectrum = null;
      s.lastOnsetTimeMs = -9999;
      s.smoothEnergy = 0;
      // マイク照合の median リング — 前セッション最後の音高が次セッション
      // 最初の照合に混入するのを防ぐ。
      s.recentPitches = [];
      // voice 抑制カウンタ — 5 に達したまま残るとリセット後もヘアトリガー
      // 状態（voice様フレーム1発で500ms抑制）が持続する。
      s.agcVoiceRejectCount = 0;
      s.comboDecayAccum = 0;
      s.lastNoisePenaltyMs = 0;
      deps.reducers.resetWakeUpFlashState(s);
      s.glowPulseIntensity = 0;
      s.shimmerPhase = -1;

      // ── 8. Visual buffers ───────────────────────────────────────
      r.ripples.length = 0;
      r.particles.length = 0;

      // ── 9. DOM hide / clear ─────────────────────────────────────
      deps.dom.stageLabel.textContent = '';
      deps.dom.stageLabel.classList.remove('visible');
      deps.dom.encouragement.classList.remove('visible');
      deps.dom.qualityScore.classList.remove('visible');
      deps.dom.noteDisplay.classList.remove('visible');
      deps.dom.questDisplay.classList.remove('visible');
      deps.dom.questDots.innerHTML = '';
      deps.dom.questLabel.textContent = '';
      deps.dom.questToast.classList.remove('show');
      deps.dom.flowFill.style.height = '0%';
      deps.invalidateFlowCache(); // next HUD tick re-paints the gauge
      deps.dom.sessionStatus.classList.remove('visible');
      deps.dom.sessionStatus.textContent = '';
      deps.dom.playTime.textContent = '0:00';

      // ── 10. MIDI bookkeeping ────────────────────────────────────
      // Drop any held MIDI keys / sustain so the next session starts
      // clean. Chord-window fields cleared via the dedicated reducer.
      const ms = r.getMidiState();
      ms.activeNotes.clear();
      ms.sustainedNotes.clear();
      ms.sustainOn = false;
      deps.reducers.resetChordWindowState(ms);
      // BLE-redelivery dedupe cache: a long mic-only session that
      // included a stray MIDI note can theoretically swallow the
      // first MIDI note after a reconnect (same `(midi<<8)|velocity`
      // happening to fall inside the 30 ms window). Cache lives
      // inside packages/web/src/midi-dispatch.ts since batch 22.
      deps.resetMidiDispatch();

      deps.remoteLog('[RESET] Session reset by user');
    },
  };
}
