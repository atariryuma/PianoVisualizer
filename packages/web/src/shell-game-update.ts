// Game-update shell — Phase 0d batch 105.
//
// Bundles every per-frame reducer the render loop needs:
//   • Multi-feature onset detection
//   • Session-confidence ring + state machine
//   • Quest-tracker tick
//   • Quality scoring (rhythm / dynamics / pitch-stability composite)
//   • Software AGC
//   • Game state (combo / flow / encouragement / stage transitions)
//   • HUD update (encouragement banner + flow gauge)
//   • Debug overlay
//   • Per-frame energy (FFT slice over the piano frequency range)
//
// All ten reducers used to live as separate factory wireups + thunks
// in legacy-app.js. They share enough context (state, midiInput,
// CONFIG, the audio bag, the @piano/core reducers) that bundling them
// here saves ~150 lines of shell glue. Returns the public update*
// thunks the render loop calls each tick.

import type { InitialGameState } from './game-state-init';
import type { PianoConfig } from './piano-config';
import * as PianoCore from '@piano/core';
import type { T, Stage } from '@piano/core';
import * as OnsetDetect from './onset-detect';
import * as SessionConfidenceUi from './session-confidence-ui';
import * as QuestStateUpdate from './quest-state-update';
import * as QualityUpdate from './quality-update';
import * as AgcController from './agc-controller';
import * as GameStateUpdate from './game-state-update';
import * as HudUpdate from './hud-update';
import * as DomBag from './dom-bag';
import * as CoreOpts from './core-opts';

export interface ShellGameUpdateDeps {
  state: InitialGameState;
  /** practice / midiInput forward-declared in the shell — getter access. */
  getPractice: () => any;
  getMidiInput: () => any;
  config: PianoConfig;
  /** session-confidence ring buffer + cap. */
  sessionRing: Array<{ timeMs: number; isPiano: boolean }>;
  sessionRingCap: number;
  /** Audio shell — the reducers reach for analyser / dataArray etc.
   *  via the shared get*-thunk surface. */
  audio: {
    getOnsetAnalyser: () => any;
    getOnsetDataArray: () => any;
    getAudioCtx: () => any;
    getGainNode: () => any;
    getAnalyser: () => any;
    getDataArray: () => any;
  };
  /** _coreOpts wrapper — the four option bags the reducers consume. */
  coreOpts: { qhOptsMic: any; qhOptsMidi: any; psOpts: any; cwOpts: any; wufOpts: any };
  /** DOM bag — every @-i18n-driven element the reducers touch. */
  dom: DomBag.DomBag;
  t: T;
  /** Effects + spawners. */
  spawnBurst: any;
  effectGoldenBurst: any;
  effectStarShower: any;
  triggerEffect: any;
  /** Geometry + i18n thunks. */
  getScreen: () => { W: number; H: number };
  stageLabel: (stage: Stage | undefined | null) => string;
  remoteLogEnabled: boolean;
  remoteLog: (msg: string | object) => void;
}

export interface ShellGameUpdate {
  /** Per-frame onset classifier — multi-feature gate. */
  updateMultiFeatureOnset: (timeMs: number, currentPitchHz: number) => any;
  /** Session-confidence state machine tick. */
  updateSessionConfidence: (timeMs: number, isPianoDetected: boolean) => void;
  /** Magic Quest tick (throttled). */
  updateQuestState: (timeMs: number) => void;
  /** Rhythm / dynamics / stability scoring. */
  updateQualityScores: (timeMs: number) => void;
  /** Software AGC tick. */
  updateAGC: (timeMs: number, postGainRms: number) => void;
  /** Combined per-frame reducer (combo + flow + encouragement + stage). */
  updateGameState: (timeMs: number, dt: number, pitchResult: any) => any;
  /** Encouragement banner + flow gauge. */
  updateHUD: (timeMs: number) => void;
  /** Debug overlay (1Hz throttled). */
  updateDebugOverlay: () => void;
  /** Per-frame energy — FFT slice over the piano frequency range. */
  getEnergy: () => number;
  /** Internal HUD update — the shell exposes this so session-reset can drain
   *  the flow-cache + the hudUpdate factory result. */
  invalidateFlowCache: () => void;
  /** Reducer state owned by this shell — exposed so ShellSessionState
   *  (which only resets, never advances) can drain them on reset. */
  encState: any;
  questState: any;
}

export function createShellGameUpdate(deps: ShellGameUpdateDeps): ShellGameUpdate {
  const { state, dom, t } = deps;

  // ── Per-tick reducer state owned by this shell. encState/questState
  // are exposed on the result so ShellSessionState can drain them on
  // reset (it only resets, never advances). questState shares the
  // underlying completedIds array with state.completedQuests so the two
  // stay in sync without per-tick copies.
  const encState = PianoCore.initEncouragementState();
  const encOpts = {
    tiers: deps.config.ENCOURAGEMENT_TIERS,
    displayMs: deps.config.ENCOURAGEMENT_DISPLAY_MS,
  };
  const questState = PianoCore.initQuestTrackerState();
  questState.completedIds = state.completedQuests;
  const questOpts = { throttleMs: 300, postCompletionDelayMs: 2500 };
  const QUEST_ALL_DONE = 'ALL_DONE';

  // ── Multi-feature onset detection ──
  const _onsetDetectDeps = OnsetDetect.buildOnsetDetectDeps({
    state,
    getPractice: deps.getPractice,
    config: deps.config,
    getOnsetHysteresisFrames: () => CoreOpts.ONSET_HYSTERESIS_FRAMES,
    features: {
      computeSpectralFlatness: PianoCore.computeSpectralFlatness,
      computeSpectralCrest: PianoCore.computeSpectralCrest,
      computeSpectralCentroid: PianoCore.computeSpectralCentroid,
      computeHarmonicity: PianoCore.computeHarmonicity,
      coefficientOfVariation: PianoCore.coefficientOfVariation,
    },
    getOnsetAnalyser: deps.audio.getOnsetAnalyser,
    getOnsetDataArray: deps.audio.getOnsetDataArray,
    getAudioCtx: deps.audio.getAudioCtx,
  });
  const updateMultiFeatureOnset = (timeMs: number, currentPitchHz: number) =>
    OnsetDetect.updateMultiFeatureOnset(timeMs, currentPitchHz, _onsetDetectDeps);

  // ── Session-confidence ring ──
  const _sessionConfidenceDeps = {
    state,
    sessionRing: deps.sessionRing,
    tuning: {
      sampleIntervalMs: deps.config.SESSION_SAMPLE_INTERVAL_MS,
      windowMs: deps.config.SESSION_WINDOW_MS,
      confirmThreshold: deps.config.SESSION_CONFIRM_THRESHOLD,
      loseThreshold: deps.config.SESSION_LOSE_THRESHOLD,
      warmupMs: deps.config.SESSION_WARMUP_MS,
      motivationGoalMs: deps.config.MOTIVATION_GOAL_MS,
      ringCap: deps.sessionRingCap,
    },
    dom: { sessionStatus: dom.sessionStatus },
    t,
    triggerEffect: deps.triggerEffect,
  } as any;
  const updateSessionConfidence = (timeMs: number, isPianoDetected: boolean) =>
    SessionConfidenceUi.updateSessionConfidence(timeMs, isPianoDetected, _sessionConfidenceDeps);

  // ── Quest tick ──
  const _questStateUpdate = QuestStateUpdate.createQuestStateUpdate({
    state,
    trackerState: questState,
    quests: deps.config.QUESTS,
    allDoneSentinel: QUEST_ALL_DONE,
    applyQuestTick: PianoCore.applyQuestTick,
    observation: state, // quest.condition reads state.combo, state.flow, etc.
    questOpts,
    dom: DomBag.pickDom(
      dom,
      'toastTitle',
      'toastSub',
      'questToast',
      'questLabel',
      'questDots',
      'questDisplay'
    ) as any,
    t,
    spawnBurst: deps.spawnBurst,
    effectGoldenBurst: deps.effectGoldenBurst,
    getScreen: deps.getScreen,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    toastHideMs: 2600,
  } as any);
  const updateQuestState = (timeMs: number) => _questStateUpdate.tick(timeMs);

  // ── Quality scoring ──
  const _qualityUpdate = QualityUpdate.createQualityUpdate({
    state,
    tuning: {
      updateIntervalMs: deps.config.SCORE_UPDATE_INTERVAL_MS,
      rhythmWeight: deps.config.SCORE_RHYTHM_WEIGHT,
      dynamicsWeight: deps.config.SCORE_DYNAMICS_WEIGHT,
      stabilityWeight: deps.config.SCORE_STABILITY_WEIGHT,
      smoothing: deps.config.SCORE_SMOOTHING,
      displayedScoreFloor: 0.25,
    },
    scoringOpts: {
      ioiIdealCV: deps.config.IOI_IDEAL_CV,
      ioiMaxCV: deps.config.IOI_MAX_CV,
      dynamicsIdealCVMin: deps.config.DYNAMICS_IDEAL_CV_MIN,
      dynamicsIdealCVMax: deps.config.DYNAMICS_IDEAL_CV_MAX,
      growthWindowMs: deps.config.GROWTH_WINDOW_MS,
    },
    fns: {
      computeRhythmScore: PianoCore.computeRhythmScore,
      computeDynamicsScore: PianoCore.computeDynamicsScore,
      computeStabilityScore: PianoCore.computeStabilityScore,
      updateGrowthTrend: PianoCore.updateGrowthTrend,
      buildCoachingFeedback: PianoCore.buildCoachingFeedback,
    },
    qualityScoreEl: dom.qualityScore,
    t,
  } as any);
  const updateQualityScores = (timeMs: number) => _qualityUpdate.tick(timeMs);

  // ── Software AGC ──
  const _agcDeps = {
    state,
    tuning: {
      updateIntervalMs: deps.config.AGC_UPDATE_INTERVAL_MS,
      silenceFloor: deps.config.AGC_SILENCE_FLOOR,
      voiceSuppressMax: deps.config.AGC_VOICE_SUPPRESS_MAX,
      maxGain: deps.config.AGC_MAX_GAIN,
      minGain: deps.config.AGC_MIN_GAIN,
      targetRms: deps.config.AGC_TARGET_RMS,
      attackCoeff: deps.config.AGC_ATTACK_COEFF,
      releaseCoeff: deps.config.AGC_RELEASE_COEFF,
    },
    getGainNode: deps.audio.getGainNode,
    getAudioCtx: deps.audio.getAudioCtx,
  } as any;
  const updateAGC = (timeMs: number, postGainRms: number) =>
    AgcController.updateAGC(timeMs, postGainRms, _agcDeps);

  // ── HUD update + debug overlay ──
  const _hudUpdate = HudUpdate.createHudUpdate({
    state,
    encState,
    encOpts,
    applyEncouragementEvent: PianoCore.applyEncouragementEvent,
    encouragementEl: dom.encouragement,
    flowFillEl: dom.flowFill,
    t,
    triggerEffect: deps.triggerEffect,
  } as any);
  const updateHUD = (timeMs: number) => _hudUpdate.tick(timeMs);

  const _debugOverlay = HudUpdate.createDebugOverlay({
    state,
    overlayEl: dom.debugOverlay,
    tuning: { onsetGateDurationMs: deps.config.ONSET_GATE_DURATION_MS },
    now: () => performance.now(),
  } as any);
  const updateDebugOverlay = () => _debugOverlay.tick();

  // ── Game state — 4-layer architecture (v9) ──
  const _gameStateDeps = GameStateUpdate.buildGameStateUpdateDeps({
    state,
    getPractice: deps.getPractice,
    getMidiInput: deps.getMidiInput,
    getPitchMedianFrames: () => CoreOpts.PITCH_MEDIAN_FRAMES,
    config: deps.config,
    qhOptsMic: deps.coreOpts.qhOptsMic,
    psOpts: deps.coreOpts.psOpts,
    // PianoCore signatures are slightly wider than the consumed shape — cast.
    core: {
      applyOnsetToHistory: PianoCore.applyOnsetToHistory,
      applyOnsetPitch: PianoCore.applyOnsetPitch,
      applyActivePlay: PianoCore.applyActivePlay,
      decayStability: PianoCore.decayStability,
      stageForFlow: PianoCore.stageForFlow,
      classifyStageTransition: PianoCore.classifyStageTransition,
      pitchHzToSemitones: PianoCore.pitchHzToSemitones,
    } as any,
    updateMultiFeatureOnset,
    updateSessionConfidence,
    updateQualityScores,
    updateHUD,
    spawnBurst: deps.spawnBurst,
    effectStarShower: deps.effectStarShower,
    getScreen: deps.getScreen,
    stageLabelEl: dom.stageLabel,
    stageLabelText: deps.stageLabel,
    remoteLogEnabled: deps.remoteLogEnabled,
    remoteLog: deps.remoteLog,
  } as any);
  const updateGameState = (timeMs: number, dt: number, pitchResult: any) =>
    GameStateUpdate.updateGameState(timeMs, dt, pitchResult, _gameStateDeps);

  // ── Energy (FFT slice over piano frequency range) ──
  const getEnergy = (): number => {
    const a = deps.audio.getAnalyser();
    const data = deps.audio.getDataArray();
    const ctx = deps.audio.getAudioCtx();
    if (!a || state.micSuspended) return 0;
    a.getByteFrequencyData(data);
    let sum = 0;
    const binHz = ctx.sampleRate / a.fftSize;
    const s = Math.floor(deps.config.PIANO_FREQ_MIN / binHz);
    const e = Math.min(Math.floor(deps.config.PIANO_FREQ_MAX / binHz), data.length);
    for (let i = s; i < e; i++) sum += data[i];
    return sum / ((e - s) * 255);
  };

  return {
    updateMultiFeatureOnset,
    updateSessionConfidence,
    updateQuestState,
    updateQualityScores,
    updateAGC,
    updateGameState,
    updateHUD,
    updateDebugOverlay,
    getEnergy,
    invalidateFlowCache: () => _hudUpdate.invalidateFlowCache(),
    encState,
    questState,
  };
}
