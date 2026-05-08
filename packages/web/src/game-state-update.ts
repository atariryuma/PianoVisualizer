// Game-state per-frame reducer — Phase 0d batch 42.
//
// "Given the latest mic frame's pitch+conf+rms, what does the game
// state look like now?" — runs every render-frame in mic-driven mode
// and threads through the rest of the per-frame pipeline:
//
//   1. Pitch-median ring buffer (high-conf only; kills 1-octave YIN
//      errors at the moment of onset).
//   2. Adaptive RMS floor (EMA of background noise during quiet
//      windows; the "good note" threshold floats above this with a
//      hard upper cap).
//   3. Multi-feature onset detection (delegated to onset-detect.ts).
//   4. Session confidence (delegated to session-confidence-ui.ts).
//   5. Quality history feed (mic path only; MIDI events feed
//      separately so silent headphone practice still scores).
//   6. Flow / combo bookkeeping with idle-decay (frame-rate
//      independent via dtSec accumulator for the integer combo).
//   7. Stage transitions with up-transition celebrations
//      (spawnBurst × 40 + effectStarShower).
//   8. Periodic remote-log stats (only when REMOTE_LOG_ENABLED).
//   9. updateHUD dispatch.
//
// Returns isOnsetNote so the caller can route follow-up work
// (intro-hint hide, mic-driven note spawn).

/** Subset of `state` we read + write. */
export interface GameStateRef {
  // pitch median ring + adaptive floor
  recentPitches?: number[];
  adaptiveSilenceRms?: number | null;
  lastOnsetTimeMs: number;
  // debug snapshots
  debugLastRms: number;
  debugLastConf: number;
  debugLastPitch: number;
  debugIsGoodNote: boolean;
  debugIsActivePlay: boolean;
  debugHarmonicity: number;
  debugOnsetReason: string;
  debugMaxRms: number;
  debugMaxConf: number;
  debugMaxHarm: number;
  debugOnsetCount: number;
  // session
  sessionState: string;
  // combo / flow / stage
  lastSilenceStartMs: number;
  lastGoodNoteTimeMs: number;
  lastNoisePenaltyMs: number;
  combo: number;
  bestCombo: number;
  comboDecayAccum?: number;
  flow: number;
  peakFlow: number;
  qualityScore: number;
  pitchStability: number;
  currentStage: number;
  // diag
  lastDebugLogMs: number;
}

/** Practice ref. */
export interface GameStatePracticeRef {
  enabled: boolean;
}

/** Midi ref. */
export interface GameStateMidiRef {
  enabled: boolean;
  lastEventTime?: number;
}

/** Tunables — pulled out of CONFIG so the reducer is testable
 *  without the full bag. */
export interface GameStateTuning {
  pitchMinHz: number;
  pitchMinHzPractice: number;
  pitchMaxHz: number;
  confidenceThreshold: number;
  goodNoteRms: number;
  onsetGateDurationMs: number;
  pitchMedianFrames: number;
  comboWindowMs: number;
  silenceDecayStartMs: number;
  silenceHardDecayMs: number;
  flowDecaySoft: number;
  flowDecayHard: number;
  comboDecayRate: number;
  noiseRmsThreshold: number;
  noisePenaltyCooldownMs: number;
  flowNoisePenalty: number;
  comboNoisePenalty: number;
  flowGainBase: number;
  flowGainComboMax: number;
  flowGainStabilityMax: number;
  flowGainQualityMax: number;
}

/** Pure reducers from @piano/core. */
export interface GameStateCore {
  applyOnsetToHistory(state: unknown, timeMs: number, rms: number, opts: unknown): void;
  applyOnsetPitch(state: unknown, semitones: number, opts: unknown): void;
  applyActivePlay(state: unknown, opts: unknown): void;
  decayStability(state: unknown, dtSec: number, opts: unknown): void;
  stageForFlow(flow: number, stages: readonly unknown[]): number;
  classifyStageTransition(prev: number, next: number): 'up' | 'down' | 'same';
  pitchHzToSemitones(hz: number): number;
}

/** Pitch-detection result the reducer takes as input. */
export interface GameStatePitchResult {
  pitch: number;
  conf: number;
  rms: number;
}

/** Onset-detect surface. */
export interface GameStateOnsetState {
  isOnset: boolean;
  gateOpen: boolean;
}

/** Stage definition entry from CONFIG.STAGES. Loose-typed to match
 *  whatever shape the shell hands in (the actual shape has more
 *  fields like `nameKey`, `prefix`, `minFlow`; we don't use them
 *  here). */

export type GameStateStageDef = any;

export interface GameStateUpdateDeps {
  state: GameStateRef;
  /** Read at call time — the legacy shell's `practice` / `midiInput`
   *  consts live further down the file so a thunk avoids the TDZ. */
  getPractice: () => GameStatePracticeRef;
  getMidiInput: () => GameStateMidiRef;
  /** Likewise for tuning's pitchMedianFrames which lives in shell
   *  scope past this wire-up. */
  getPitchMedianFrames: () => number;
  tuning: Omit<GameStateTuning, 'pitchMedianFrames'>;
  stages: readonly GameStateStageDef[];
  qhOptsMic: unknown;
  psOpts: unknown;
  core: GameStateCore;

  // upstream / downstream reducer dispatches
  updateMultiFeatureOnset: (timeMs: number, pitch: number) => GameStateOnsetState;
  updateSessionConfidence: (timeMs: number, isActivePlay: boolean) => void;
  updateQualityScores: (timeMs: number) => void;
  updateHUD: (timeMs: number) => void;

  // visual flair on stage-up
  spawnBurst: (x: number, y: number, count: number, energy: number) => void;
  effectStarShower: (n: number) => void;
  /** Read fresh each tick — canvas could resize mid-session. */
  getScreen: () => { W: number; H: number };

  // DOM
  stageLabelEl: { textContent: string; classList: { toggle(c: string, on: boolean): void } } | null;
  stageLabelText: (stage: GameStateStageDef) => string;

  // diagnostics
  remoteLogEnabled: boolean;
  remoteLog: (line: string) => void;
}

/** Per-frame reducer. Returns isOnsetNote so the caller can route
 *  hooks (e.g. hide intro hint on first good note). */
export function updateGameState(
  timeMs: number,
  dt: number,
  pitchResult: GameStatePitchResult,
  deps: GameStateUpdateDeps
): boolean {
  const { pitch, conf, rms } = pitchResult;
  const s = deps.state;
  const t = deps.tuning;

  // 1. Pitch median ring (high-conf only).
  if (!s.recentPitches) s.recentPitches = [];
  if (pitch > t.pitchMinHz && conf > 0.5) {
    s.recentPitches.push(pitch);
    if (s.recentPitches.length > deps.getPitchMedianFrames()) s.recentPitches.shift();
  }

  // 2. Adaptive RMS floor — EMA of background noise during confirmed
  // quiet (very low RMS + no recent onset).
  if (s.adaptiveSilenceRms == null) s.adaptiveSilenceRms = 0.001;
  const inQuietWindow = rms < 0.01 && timeMs - s.lastOnsetTimeMs > t.onsetGateDurationMs;
  if (inQuietWindow) {
    s.adaptiveSilenceRms = s.adaptiveSilenceRms * 0.97 + rms * 0.03;
  }
  const adaptiveGoodNoteRms = Math.max(
    t.goodNoteRms,
    Math.min(0.02, (s.adaptiveSilenceRms ?? 0.001) * 2.0)
  );

  // 3. Onset detector.
  const onsetState = deps.updateMultiFeatureOnset(timeMs, pitch);

  const pitchMinHz = deps.getPractice().enabled ? t.pitchMinHzPractice : t.pitchMinHz;
  const pitchOk =
    pitch > pitchMinHz &&
    pitch < t.pitchMaxHz &&
    conf > t.confidenceThreshold &&
    rms > adaptiveGoodNoteRms;
  const isOnsetNote = pitchOk && onsetState.isOnset;
  const isActivePlay = pitchOk && onsetState.gateOpen;

  s.debugLastRms = rms;
  s.debugLastConf = conf;
  s.debugLastPitch = pitch;
  s.debugIsGoodNote = isOnsetNote;
  s.debugIsActivePlay = isActivePlay;

  // 4. Session confidence.
  deps.updateSessionConfidence(timeMs, isActivePlay);

  // v13: When MIDI is the active source, MIDI events drive the
  // quality histories (rhythm/dynamics/stability). Skip the mic
  // push to avoid double-counting and keep silent (headphone)
  // practice fully evaluable.
  const midi = deps.getMidiInput();
  const midiDrivingHistories = midi.enabled && timeMs - (midi.lastEventTime || 0) < 2000;

  if (isOnsetNote && !midiDrivingHistories) {
    deps.core.applyOnsetToHistory(s, timeMs, rms, deps.qhOptsMic);
  }

  // 5. Quality scores.
  deps.updateQualityScores(timeMs);

  const dtSec = dt / 1000;
  const isPerforming = s.sessionState === 'performing';
  const isWarmup = s.sessionState === 'warmup';

  // 6. Combo / flow bookkeeping.
  if (isOnsetNote && !midiDrivingHistories) {
    deps.core.applyOnsetPitch(s, deps.core.pitchHzToSemitones(pitch), deps.psOpts);
    s.lastSilenceStartMs = -1;

    if (isPerforming || isWarmup) {
      if (s.lastGoodNoteTimeMs > 0 && timeMs - s.lastGoodNoteTimeMs < t.comboWindowMs) {
        s.combo++;
        if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      } else {
        s.combo = Math.max(1, Math.floor(s.combo * 0.6));
      }
    }
    s.lastGoodNoteTimeMs = timeMs;
  } else if (isActivePlay) {
    s.lastSilenceStartMs = -1;
    deps.core.applyActivePlay(s, deps.psOpts);
  } else {
    // Idle decay (frame-rate independent via dtSec).
    deps.core.decayStability(s, dtSec, deps.psOpts);

    if (s.lastSilenceStartMs < 0) s.lastSilenceStartMs = timeMs;
    const silenceDuration = timeMs - s.lastSilenceStartMs;

    if (silenceDuration > t.silenceDecayStartMs) {
      // Slow decay start.
      s.flow = Math.max(0, s.flow - t.flowDecaySoft * dtSec);
      if (silenceDuration > t.silenceHardDecayMs) {
        // Hard decay later. Combo is integer, so accumulate
        // fractional decay across frames — Math.ceil rounds up
        // every frame and combo would drop at framerate
        // (144/sec on 144Hz vs 60/sec on 60Hz). The accumulator
        // keeps drops/sec constant.
        s.flow = Math.max(0, s.flow - t.flowDecayHard * dtSec);
        s.comboDecayAccum = (s.comboDecayAccum || 0) + t.comboDecayRate * 60 * dtSec;
        if (s.comboDecayAccum >= 1) {
          const drops = Math.floor(s.comboDecayAccum);
          s.combo = Math.max(0, s.combo - drops);
          s.comboDecayAccum -= drops;
        }
      }
    }

    if (rms > t.noiseRmsThreshold && !isActivePlay) {
      if (timeMs - s.lastNoisePenaltyMs > t.noisePenaltyCooldownMs) {
        s.flow = Math.max(0, s.flow - t.flowNoisePenalty * dtSec);
        s.combo = Math.max(0, s.combo - t.comboNoisePenalty);
        s.lastNoisePenaltyMs = timeMs;
      }
    }
  }

  if (isActivePlay) {
    // v10: Always allow flow gain regardless of session state.
    const comboFactor = Math.min(s.combo / 50, 1);
    const qualityFactor = s.qualityScore;
    let flowGain =
      (t.flowGainBase +
        comboFactor * t.flowGainComboMax +
        s.pitchStability * t.flowGainStabilityMax +
        qualityFactor * t.flowGainQualityMax) *
      dtSec;
    // Boost gain in warmup/waiting to get started faster.
    if (s.sessionState !== 'performing') flowGain *= 1.5;
    s.flow = Math.min(100, s.flow + flowGain);
    if (s.flow > s.peakFlow) s.peakFlow = s.flow;
  }

  // 7. Stage transitions.
  const prevStage = s.currentStage;
  const newStage = deps.core.stageForFlow(s.flow, deps.stages);
  if (newStage !== prevStage) {
    s.currentStage = newStage;
    if (deps.stageLabelEl) {
      deps.stageLabelEl.textContent = deps.stageLabelText(deps.stages[newStage]);
      deps.stageLabelEl.classList.toggle('visible', newStage > 0);
    }
    if (deps.core.classifyStageTransition(prevStage, newStage) === 'up' && newStage > 0) {
      const screen = deps.getScreen();
      for (let i = 0; i < 40; i++) {
        deps.spawnBurst(Math.random() * screen.W, Math.random() * screen.H, 3, 0.9);
      }
      deps.effectStarShower(6);
    }
  }

  // 8. Periodic per-frame stats — only when remote logging is on.
  if (deps.remoteLogEnabled) {
    if (rms > s.debugMaxRms) s.debugMaxRms = rms;
    if (conf > s.debugMaxConf) s.debugMaxConf = conf;
    if (s.debugHarmonicity > s.debugMaxHarm) s.debugMaxHarm = s.debugHarmonicity;
    if (isOnsetNote) s.debugOnsetCount++;
    if (timeMs - s.lastDebugLogMs > 2000) {
      s.lastDebugLogMs = timeMs;
      deps.remoteLog(
        `[Stats] Flow=${s.flow.toFixed(1)} | MaxRMS=${s.debugMaxRms.toFixed(4)}` +
          ` | MaxConf=${s.debugMaxConf.toFixed(2)} | MaxHarm=${s.debugMaxHarm.toFixed(2)}` +
          ` | onsets=${s.debugOnsetCount} | reason=${s.debugOnsetReason || '-'}` +
          ` | Stab=${s.pitchStability.toFixed(2)} | Combo=${s.combo} | Stg=${s.currentStage}`
      );
      s.debugMaxRms = 0;
      s.debugMaxConf = 0;
      s.debugMaxHarm = 0;
      s.debugOnsetCount = 0;
    }
  }

  // 9. HUD.
  deps.updateHUD(timeMs);

  return isOnsetNote;
}
