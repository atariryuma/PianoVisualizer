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
//
// ── Two entry points, one game (2026-09-16) ──────────────────────────
//
// Everything from step 5 on is not about the microphone at all: it is the
// GAME — the gauge filling and draining, the stage, the quality read-out, the
// "keep going" countdown, the HUD. It used to live only inside the mic reducer,
// and the mic pipeline skips that reducer whenever the mic is suspended — which
// is EVERY MIDI session. Measured in the built bundle with a keyboard attached:
// 120 notes took the internal flow to 100 and the combo to 120 while the gauge
// on screen stayed at 0, no encouragement fired, the stage stayed at 0, quality
// read 0 % (so four quests could never complete), and after the player stopped
// nothing decayed at all. Practice had hit the same wall once and been patched
// locally in mic-pipeline; free play never was.
//
// So the game half is now shared: `updateGameState` (a mic frame) and
// `updateGameStateWithoutMic` (a frame with no mic — MIDI, or nothing yet) both
// end in the same flow / stage / HUD steps, and both drive the flow gauge
// through `@piano/core`'s `applyFlowEvent` rather than a hand-copied reducer.

import type { FlowEvent, FlowMeterOptions } from '@piano/core';
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
  comboDecayAccum: number;
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
  noiseRmsThreshold: number;
  /** The flow / combo rules — the SAME bag the MIDI handler uses, so the two
   *  inputs cannot drift apart again. */
  flow: FlowMeterOptions;
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
  /** The one flow / combo reducer (PianoCore.applyFlowEvent). */
  applyFlowEvent(state: unknown, event: FlowEvent, opts: FlowMeterOptions): void;
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
  FLOW_GAIN_NON_PERFORMING_MULTIPLIER: number;
  MIDI_FLOW_GAIN_BASE: number;
  MIDI_FLOW_GAIN_VELOCITY: number;
  STAGES: readonly GameStateStageDef[];
}

/**
 * The flow / combo rules, from CONFIG. The ONE place they are assembled —
 * the mic reducer and the MIDI note handler both take this object, so a
 * keyboard and a microphone can no longer mean different things by "combo".
 */
export function buildFlowMeterOptions(config: GameStateUpdateConfig): FlowMeterOptions {
  return {
    comboWindowMs: config.COMBO_WINDOW_MS,
    silenceDecayStartMs: config.SILENCE_DECAY_START_MS,
    silenceHardDecayMs: config.SILENCE_HARD_DECAY_MS,
    flowDecaySoft: config.FLOW_DECAY_SOFT,
    flowDecayHard: config.FLOW_DECAY_HARD,
    comboDecayRate: config.COMBO_DECAY_RATE,
    flowNoisePenalty: config.FLOW_NOISE_PENALTY,
    comboNoisePenalty: config.COMBO_NOISE_PENALTY,
    noisePenaltyCooldownMs: config.NOISE_PENALTY_COOLDOWN_MS,
    flowGainBase: config.FLOW_GAIN_BASE,
    flowGainComboMax: config.FLOW_GAIN_COMBO_MAX,
    flowGainStabilityMax: config.FLOW_GAIN_STABILITY_MAX,
    flowGainQualityMax: config.FLOW_GAIN_QUALITY_MAX,
    flowGainNonPerformingMultiplier: config.FLOW_GAIN_NON_PERFORMING_MULTIPLIER,
    midiBaseFlowGain: config.MIDI_FLOW_GAIN_BASE,
    midiVelocityFlowGain: config.MIDI_FLOW_GAIN_VELOCITY,
  };
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
      noiseRmsThreshold: refs.config.NOISE_RMS_THRESHOLD,
      flow: buildFlowMeterOptions(refs.config),
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

  // 6. Combo / flow bookkeeping — through the shared core reducer, so the
  //    rules here are exactly the rules the MIDI handler applies.
  const flowOpts = t.flow;
  if (isOnsetNote && !midiDrivingHistories) {
    deps.core.applyOnsetPitch(s, deps.core.pitchHzToSemitones(pitch), deps.psOpts);
    deps.core.applyFlowEvent(
      s,
      { type: 'goodOnset', timeMs, isPerformingOrWarmup: isPerforming || isWarmup },
      flowOpts
    );
  } else if (isActivePlay) {
    deps.core.applyActivePlay(s, deps.psOpts);
  } else {
    deps.core.decayStability(s, dtSec, deps.psOpts);
    deps.core.applyFlowEvent(s, { type: 'idleTick', timeMs, dtSec }, flowOpts);
    if (rms > t.noiseRmsThreshold) {
      deps.core.applyFlowEvent(s, { type: 'noiseTick', timeMs, dtSec }, flowOpts);
    }
  }

  if (isActivePlay) {
    // v10: Always allow flow gain regardless of session state (the core
    // reducer boosts it outside `performing` to get started faster).
    deps.core.applyFlowEvent(
      s,
      {
        type: 'activeTick',
        timeMs,
        dtSec,
        isPerforming,
        pitchStability: s.pitchStability,
        qualityScore: s.qualityScore,
      },
      flowOpts
    );
  }

  // 7-8. Periodic per-frame stats (mic-only numbers).
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

  // 9-10. Stage + HUD — the part every input shares.
  finishGameFrame(timeMs, deps);

  return isOnsetNote;
}

/** What a frame with no microphone knows about the player. */
export interface NoMicFrame {
  /** A key is down, or the sustain pedal is holding one. */
  keyHeld: boolean;
}

/**
 * The game frame when the microphone is NOT running — a MIDI session, or a
 * player with no working input yet.
 *
 * "Is the player making sound?" is answered the way the mic answers it: the
 * mic keeps its gate open for `onsetGateDurationMs` after an onset, so here a
 * struck note counts for the same span, and a held key or pedal counts for as
 * long as it is held. That one boolean feeds the session-confidence machine
 * (the warm-up → performing progression and the "keep going" countdown) and
 * decides between holding the silence clock and letting it run.
 *
 * No continuous flow gain here: a MIDI note pays its gain when it is struck
 * (`midiNote`), and paying it again every frame it is held would make holding
 * a key worth more than playing.
 */
export function updateGameStateWithoutMic(
  timeMs: number,
  dt: number,
  frame: NoMicFrame,
  deps: GameStateUpdateDeps
): void {
  const s = deps.state;
  const t = deps.tuning;
  const dtSec = dt / 1000;
  const recentlyStruck =
    s.lastGoodNoteTimeMs > 0 && timeMs - s.lastGoodNoteTimeMs < t.onsetGateDurationMs;
  const sounding = frame.keyHeld || recentlyStruck;

  deps.updateSessionConfidence(timeMs, sounding);
  deps.updateQualityScores(timeMs);

  if (sounding) {
    deps.core.applyFlowEvent(s, { type: 'sustainTick', timeMs }, t.flow);
  } else {
    deps.core.decayStability(s, dtSec, deps.psOpts);
    deps.core.applyFlowEvent(s, { type: 'idleTick', timeMs, dtSec }, t.flow);
  }

  finishGameFrame(timeMs, deps);
}

/** Stage transition + HUD — identical for every input. */
function finishGameFrame(timeMs: number, deps: GameStateUpdateDeps): void {
  const s = deps.state;
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

  deps.updateHUD(timeMs);
}
