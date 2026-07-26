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

import type { RecentPitchEntry } from './core-opts';

/** Subset of `state` we read + write. */
export interface GameStateRef {
  // pitch median ring + adaptive floor
  // R2-3: `{ hz, t }` エントリ — 読む側（practice-scoring の
  // medianRecentPitch）が直近 150ms に時間フィルタするための時刻付き。
  recentPitches?: RecentPitchEntry[];
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

/** CONFIG slice the wireup builder reads. Mirrors PianoConfig but
 *  declared loose so this module stays @piano/core-free. */
export interface GameStateUpdateConfig {
  PITCH_MIN_HZ: number;
  PITCH_MIN_HZ_PRACTICE: number;
  PITCH_MAX_HZ: number;
  CONFIDENCE_THRESHOLD: number;
  GOOD_NOTE_RMS: number;
  ONSET_GATE_DURATION_MS: number;
  COMBO_WINDOW_MS: number;
  SILENCE_DECAY_START_MS: number;
  SILENCE_HARD_DECAY_MS: number;
  FLOW_DECAY_SOFT: number;
  FLOW_DECAY_HARD: number;
  COMBO_DECAY_RATE: number;
  NOISE_RMS_THRESHOLD: number;
  NOISE_PENALTY_COOLDOWN_MS: number;
  FLOW_NOISE_PENALTY: number;
  COMBO_NOISE_PENALTY: number;
  FLOW_GAIN_BASE: number;
  FLOW_GAIN_COMBO_MAX: number;
  FLOW_GAIN_STABILITY_MAX: number;
  FLOW_GAIN_QUALITY_MAX: number;
  STAGES: readonly GameStateStageDef[];
}

/** Slim shell-side bag the wireup builder consumes. `state` /
 *  `getPractice` / `getMidiInput` etc. are the same shape as
 *  GameStateUpdateDeps — the builder forwards them through. */
export interface GameStateWireupShellRefs {
  state: GameStateRef;
  getPractice: () => GameStatePracticeRef;
  /** Is MIDI the input that drives scoring + visuals? (prefs.inputSource ×
   *  a port being attached — ShellMidi.isMidiActive.) */
  isMidiActive: () => boolean;
  getPitchMedianFrames: () => number;
  config: GameStateUpdateConfig;
  qhOptsMic: unknown;
  psOpts: unknown;
  core: GameStateCore;
  updateMultiFeatureOnset: (timeMs: number, pitch: number) => GameStateOnsetState;
  updateSessionConfidence: (timeMs: number, isActivePlay: boolean) => void;
  updateQualityScores: (timeMs: number) => void;
  updateHUD: (timeMs: number) => void;
  spawnBurst: (x: number, y: number, count: number, energy: number) => void;
  effectStarShower: (n: number) => void;
  getScreen: () => { W: number; H: number };
  stageLabelEl: { textContent: string; classList: { toggle(c: string, on: boolean): void } } | null;
  stageLabelText: (stage: GameStateStageDef) => string;
  remoteLogEnabled: boolean;
  remoteLog: (line: string) => void;
}

/** Build the GameStateUpdateDeps from the wider shell refs +
 *  CONFIG slice. The CONFIG → tuning mapping (~20 lines of
 *  CONFIG.X → tuning.x) lives here now instead of inline in
 *  legacy-app.js. */
export function buildGameStateUpdateDeps(refs: GameStateWireupShellRefs): GameStateUpdateDeps {
  return {
    state: refs.state,
    getPractice: refs.getPractice,
    isMidiActive: refs.isMidiActive,
    getPitchMedianFrames: refs.getPitchMedianFrames,
    tuning: {
      pitchMinHz: refs.config.PITCH_MIN_HZ,
      pitchMinHzPractice: refs.config.PITCH_MIN_HZ_PRACTICE,
      pitchMaxHz: refs.config.PITCH_MAX_HZ,
      confidenceThreshold: refs.config.CONFIDENCE_THRESHOLD,
      goodNoteRms: refs.config.GOOD_NOTE_RMS,
      onsetGateDurationMs: refs.config.ONSET_GATE_DURATION_MS,
      comboWindowMs: refs.config.COMBO_WINDOW_MS,
      silenceDecayStartMs: refs.config.SILENCE_DECAY_START_MS,
      silenceHardDecayMs: refs.config.SILENCE_HARD_DECAY_MS,
      flowDecaySoft: refs.config.FLOW_DECAY_SOFT,
      flowDecayHard: refs.config.FLOW_DECAY_HARD,
      comboDecayRate: refs.config.COMBO_DECAY_RATE,
      noiseRmsThreshold: refs.config.NOISE_RMS_THRESHOLD,
      noisePenaltyCooldownMs: refs.config.NOISE_PENALTY_COOLDOWN_MS,
      flowNoisePenalty: refs.config.FLOW_NOISE_PENALTY,
      comboNoisePenalty: refs.config.COMBO_NOISE_PENALTY,
      flowGainBase: refs.config.FLOW_GAIN_BASE,
      flowGainComboMax: refs.config.FLOW_GAIN_COMBO_MAX,
      flowGainStabilityMax: refs.config.FLOW_GAIN_STABILITY_MAX,
      flowGainQualityMax: refs.config.FLOW_GAIN_QUALITY_MAX,
    },
    stages: refs.config.STAGES,
    qhOptsMic: refs.qhOptsMic,
    psOpts: refs.psOpts,
    core: refs.core,
    updateMultiFeatureOnset: refs.updateMultiFeatureOnset,
    updateSessionConfidence: refs.updateSessionConfidence,
    updateQualityScores: refs.updateQualityScores,
    updateHUD: refs.updateHUD,
    spawnBurst: refs.spawnBurst,
    effectStarShower: refs.effectStarShower,
    getScreen: refs.getScreen,
    stageLabelEl: refs.stageLabelEl,
    stageLabelText: refs.stageLabelText,
    remoteLogEnabled: refs.remoteLogEnabled,
    remoteLog: refs.remoteLog,
  };
}

export interface GameStateUpdateDeps {
  state: GameStateRef;
  /** Read at call time — the legacy shell's `practice` const lives further
   *  down the file so a thunk avoids the TDZ. */
  getPractice: () => GameStatePracticeRef;
  /** Is MIDI the input that drives scoring (prefs.inputSource × a port being
   *  attached — ShellMidi.isMidiActive)? Gates the mic push into the quality
   *  histories. */
  isMidiActive: () => boolean;
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
  // R2-3: 時刻付きエントリで積む。リング上限（PITCH_MEDIAN_FRAMES）は
  // 従来どおり維持し、時間失効（直近150ms）は読む側の medianRecentPitch
  // が担当する。`t` は同 tick の timeMs（rAF 時刻 = performance.now() 起点）。
  if (!s.recentPitches) s.recentPitches = [];
  if (pitch > t.pitchMinHz && conf > 0.5) {
    s.recentPitches.push({ hz: pitch, t: timeMs });
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
  // I2: オンセット検出の AGC voice-reject ゲートは s.debugLastRms を読むので、
  // updateMultiFeatureOnset の「前」に現フレームの rms を書く（以前は後で書いて
  // いたため常に 1 フレーム古い RMS で判定していた。core onset.ts は frame.rms を
  // 同フレームで使う正しい実装で、web だけが乖離していた）。
  s.debugLastRms = rms;
  const onsetState = deps.updateMultiFeatureOnset(timeMs, pitch);

  const pitchMinHz = deps.getPractice().enabled ? t.pitchMinHzPractice : t.pitchMinHz;
  const pitchOk =
    pitch > pitchMinHz &&
    pitch < t.pitchMaxHz &&
    conf > t.confidenceThreshold &&
    rms > adaptiveGoodNoteRms;
  const isOnsetNote = pitchOk && onsetState.isOnset;
  const isActivePlay = pitchOk && onsetState.gateOpen;

  s.debugLastConf = conf;
  s.debugLastPitch = pitch;
  s.debugIsGoodNote = isOnsetNote;
  s.debugIsActivePlay = isActivePlay;

  // 4. Session confidence.
  deps.updateSessionConfidence(timeMs, isActivePlay);

  // v13: When MIDI is the ACTIVE input, MIDI events drive the quality
  // histories (rhythm/dynamics/stability). Skip the mic push to avoid
  // double-counting and keep silent (headphone) practice fully evaluable.
  //
  // `isMidiActive()` and not "a port is attached": a player who pinned the mic
  // is scored on the mic, so the mic has to feed the histories too or their
  // quality read-out stays frozen while they play.
  //
  // Not the old "MIDI active within 2 s" window either — that let mic data sneak
  // back in during silent gaps, which is the opposite of what we want: silent
  // gaps in MIDI play must NOT be backfilled by ambient mic noise.
  const midiDrivingHistories = deps.isMidiActive();

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
