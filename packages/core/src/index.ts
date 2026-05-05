// Public surface of @piano/core. Imported by web and mobile shells.
//
// Migration status (2026-05-05): Phase 0b extraction in progress.
// - Audio: chord, YIN, spectral features, harmonicity, audio-context — DONE
// - Library: musicxml-meta, auto-section — DONE
// - Render perf-tier — DONE
// - Input contracts — DONE
// - State / render / i18n / config — pending (still in legacy app.js)

// === Input contracts ===
export type {
  MidiInputAdapter,
  MidiMessage,
  MidiPort,
  MidiPortListener,
  MidiMessageListener,
} from './input/types';

// === Render: device perf tier ===
export { detectPerfTier, PERF_PROFILES } from './render/perf-tier';
export type { PerfTier, PerfProfile } from './render/perf-tier';

// === Render: particle system (3D-projected canvas particles) ===
export {
  FOCAL_LENGTH,
  NEAR_CLIPPING,
  Particle,
  project3D,
  drawStar,
  drawFlower,
  getNoteColor,
  spawnBurst,
  spawnStream,
} from './render/particles';
export type {
  ParticleType,
  ProjectedPoint,
  Project3DOptions,
  ParticleDrawOptions,
  SpawnOptions,
} from './render/particles';

// === Render: ripples ===
export { Ripple } from './render/ripples';
export type { RippleUpdateOptions, RippleDrawOptions } from './render/ripples';

// === Render: encouragement effects + dispatcher ===
export {
  effectGlowPulse,
  effectGlowParticles,
  effectColorWave,
  effectStarShower,
  effectFlowerBurst,
  effectShimmer,
  effectRadiance,
  effectGoldenBurst,
  triggerEffect,
} from './render/effects';
export type { EffectDeps, EffectGameState, EffectName } from './render/effects';

// === Render: virtual MIDI keyboard (88-key) ===
export { KB_WHITE, KB_BLACK, KB_BLACK_LEFT_WHITE_IDX, drawMidiKeyboard } from './render/keyboard';
export type { KeyboardMidiView, KeyboardDrawOptions } from './render/keyboard';

// === Render: practice lane (falling notes + hit window + count-in) ===
export { drawPracticeLane } from './render/lane';
export type { LaneNoteView, LaneViewState, LaneTimings, LaneDrawOptions } from './render/lane';

// === Render: background composites (stars + aurora + ground flowers) ===
export { initBackground, drawBgStars, drawAurora, drawGroundFlowers } from './render/background';
export type {
  BgStar,
  BgState,
  InitBackgroundOptions,
  DrawBgStarsOptions,
  DrawAuroraOptions,
  DrawGroundFlowersOptions,
} from './render/background';

// === Render: theme tables + per-note color resolvers ===
export { THEMES, noteThemeColor, synColorFor, drawBackgroundFade } from './render/theme';
export type { Theme, SynColorOptions, DrawBackgroundFadeOptions } from './render/theme';

// === Render: frequency spectrum bars ===
export { drawSpectrumBars } from './render/spectrum';
export type { SpectrumDrawOptions } from './render/spectrum';

// === Render: center radial-gradient glow ===
export { drawCenterGlow } from './render/center-glow';
export type { CenterGlowOptions } from './render/center-glow';

// === Render: stage tier table + lookup ===
export { STAGES, stageForFlow, stageLabel, classifyStageTransition } from './render/stage';
export type { Stage, StageTransition } from './render/stage';

// === State: flow + combo meter (silence decay, noise penalty, MIDI gain) ===
export { initFlowState, resetFlowState, applyFlowEvent } from './state/flow-meter';
export type { FlowState, FlowMeterOptions, FlowEvent } from './state/flow-meter';

// === State: encouragement tier escalator ===
export {
  DEFAULT_ENCOURAGEMENT_TIERS,
  initEncouragementState,
  resetEncouragementState,
  pickTier,
  applyEncouragementEvent,
} from './state/encouragement';
export type {
  EncouragementTier,
  EncouragementState,
  EncouragementOptions,
  EncouragementEvent,
  EncouragementOutput,
} from './state/encouragement';

// === Audio: chord recognition ===
export { detectChord } from './audio/chord';

// === Audio: YIN pitch detection ===
export { detectPitchYIN, freqToNote } from './audio/yin';
export type { YinOptions, YinResult } from './audio/yin';

// === Audio: spectral features ===
export {
  computeSpectralFlatness,
  computeSpectralCrest,
  computeSpectralCentroid,
  coefficientOfVariation,
} from './audio/spectral';

// === Audio: harmonicity ===
export { computeHarmonicity } from './audio/harmonicity';
export type { HarmonicityOptions } from './audio/harmonicity';

// === Audio: software AGC ===
export { initAgcState, stepAgc, suppressVoice } from './audio/agc';
export type { AgcOptions, AgcState, AgcStepResult } from './audio/agc';

// === Audio: multi-feature onset gate ===
export { initOnsetState, stepOnset } from './audio/onset';
export type { OnsetOptions, OnsetState, OnsetFrameInput, OnsetResult } from './audio/onset';

// === Audio: AudioContext lifecycle ===
export {
  AUDIO_SAMPLE_RATE,
  createAudioContext,
  buildAudioGraph,
  recoverAudioContext,
} from './audio/audio-context';
export type {
  AudioContextLike,
  AudioGraph,
  AudioGraphOptions,
  AudioNodeLike,
  AnalyserNodeLike,
  GainNodeLike,
  MediaStreamAudioSourceNodeLike,
  AudioParamLike,
} from './audio/audio-context';

// === Library: MusicXML metadata + auto-sectioning ===
export { parseMusicXmlMetadata } from './library/musicxml-meta';
export type { MusicXmlMetadata, MetaParseOptions } from './library/musicxml-meta';

export { autoSectionDefs, collectSectionCandidates } from './library/auto-section';
export type { SectionDef, SectionCandidates, AutoSectionOptions } from './library/auto-section';

// === Library: user-song storage + parsing ===
export {
  USER_DB_NAME,
  USER_DB_STORE,
  openUserDb,
  userDbAll,
  userDbPut,
  userDbDelete,
  parseUserSongFromBlob,
  makeUserSong,
} from './library/user-songs';
export type {
  UserSongRecord,
  UserSong,
  OpenDbOptions,
  ParseBlobOptions,
  MakeSongOptions,
} from './library/user-songs';

// === State: session confidence (waiting → warmup → performing) ===
export {
  SESSION_RING_CAP,
  initSessionConfidenceState,
  resetSessionConfidence,
  stepSessionConfidence,
  deriveSessionUIHint,
} from './state/session-confidence';
export type {
  SessionPhase,
  SessionConfidenceState,
  SessionConfidenceOptions,
  SessionEvent,
  SessionStepResult,
  SessionUIHint,
  SessionUIStrings,
} from './state/session-confidence';

// === State: MIDI input tracking (active notes / sustain / chord window) ===
export {
  initMidiState,
  resetMidiState,
  applyMidiNoteOn,
  applyMidiNoteOff,
  applyMidiCC,
  dispatchMidiBytes,
} from './state/midi-state';
export type { MidiState, MidiStateOptions, ActiveNote, MidiEvent } from './state/midi-state';

// === State: practice mode (section schedule, hit-window judging, stars) ===
export {
  HIT_WINDOW_EARLY_MS,
  HIT_WINDOW_MS,
  PERFECT_MS,
  CHORD_MATE_TOLERANCE_MS,
  DURATION_MIN_TOL_MS,
  DURATION_TOL_FRACTION,
  STAR_TIERS,
  initPracticeState,
  resetPracticeState,
  buildSectionNotes,
  computeHandRanges,
  matchNoteOnset,
  finalizeNoteHold,
  computeStars,
  practiceElapsedMs,
} from './state/practice-state';
export type {
  PracticeMode,
  Hand,
  HandFilter,
  PracticeNote,
  PracticeSectionDef,
  PracticeSourceNote,
  BuildSectionNotesOptions,
  HandRanges,
  PracticeState,
  MatchOptions,
  MatchOutcome,
  FinalizeHoldResult,
  StarTier,
} from './state/practice-state';

// === State: quality scoring + coaching feedback ===
export {
  clamp01,
  computeRhythmScore,
  computeDynamicsScore,
  computeStabilityScore,
  composeQualityScore,
  smoothQualityScore,
  updateGrowthTrend,
  buildCoachingFeedback,
} from './state/quality';
export type {
  QualityWeights,
  QualityScoringOptions,
  QualityHistoryEntry,
  GrowthTrendResult,
  CoachingStrengthKey,
  CoachingNextKey,
  CoachingInput,
  CoachingFeedback,
} from './state/quality';

// === i18n: translation table + pure t() ===
export { T_STRINGS, translate, createT, NOTE_NAMES_EN, NOTE_NAMES_JP, noteNamesFor } from './i18n';
export type {
  Lang,
  TranslationEntry,
  TranslationTable,
  UserKeyResolver,
  TranslateOptions,
  CreateTOptions,
  T,
} from './i18n';

// === Config: tunable engine parameters + quest definitions ===
export { CONFIG, QUESTS } from './config';
export type { Config, QuestDef, QuestStateView } from './config';
