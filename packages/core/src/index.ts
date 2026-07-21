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

// === Adapter contracts ===
export type {
  OsmdAdapter,
  OsmdNote,
  OsmdMeasureTiming,
  OsmdExtractResult,
  OsmdExtractOptions,
  OsmdCursorGeometry,
} from './adapters/osmd-adapter';

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
export {
  KB_WHITE,
  KB_BLACK,
  KB_BLACK_LEFT_WHITE_IDX,
  drawMidiKeyboard,
  keyboardKeyCenterX,
} from './render/keyboard';
export type { KeyboardMidiView, KeyboardDrawOptions, KeyboardHintNote } from './render/keyboard';

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

// === Render: MIDI sustained-note beams (vertical light columns) ===
export { drawMidiBeams } from './render/midi-beams';
export type { MidiBeamsActiveNote, MidiBeamsView, MidiBeamsDrawOptions } from './render/midi-beams';

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

// === State: quest tracker (one-completion-per-tick + post-completion delay) ===
export {
  initQuestTrackerState,
  resetQuestTrackerState,
  applyQuestTick,
} from './state/quest-tracker';
export type {
  Quest,
  QuestPredicate,
  QuestTrackerState,
  QuestTrackerOptions,
  QuestTickResult,
} from './state/quest-tracker';

// === State: quality history (per-onset ring buffers feeding quality.ts) ===
export {
  initQualityHistoryState,
  resetQualityHistoryState,
  applyOnsetToHistory,
} from './state/quality-history';
export type {
  QualityHistoryState,
  QualityHistoryOptions,
  OnsetPushResult,
} from './state/quality-history';

// === State: pitch stability (semitone-deviation tracker, mic + MIDI unified) ===
export {
  initPitchStabilityState,
  resetPitchStabilityState,
  applyOnsetPitch,
  applyActivePlay,
  decayStability,
  pitchHzToSemitones,
} from './state/pitch-stability';
export type { PitchStabilityState, PitchStabilityOptions } from './state/pitch-stability';

// === State: wake-up flash (low-flow note-confirm white overlay) ===
export {
  initWakeUpFlashState,
  resetWakeUpFlashState,
  triggerWakeUpFlash,
  decayWakeUpFlash,
} from './state/wake-up-flash';
export type { WakeUpFlashState, WakeUpFlashOptions } from './state/wake-up-flash';

// === State: daily-streak day list + count ===
export {
  initStreakState,
  resetStreakState,
  recordPracticeDay,
  computeStreakCount,
  formatDateKey,
} from './state/streak';
export type { StreakState, StreakOptions } from './state/streak';

// === State: persisted practice progress (per-song stars / unlocks / history) ===
export {
  defaultPracticeProgress,
  defaultSongProgress,
  migrateAndDefaultProgress,
  getSongProgress,
  recordPracticeMinutes,
  lifetimePracticeMinutes,
  MAX_MINUTES_PER_ATTEMPT,
} from './state/practice-progress';
export type {
  PracticeProgress,
  SongProgress,
  SectionProgress,
  AttemptRecord,
} from './state/practice-progress';

// === State: mastery aggregation (song + library rollups, near-completion) ===
export {
  computeSongMastery,
  computeLibraryMastery,
  resolveSongSeal,
  endowedProgressFraction,
  pickNearCompletion,
  weeklyLibraryGrowth,
  computeFullSongChallenge,
  computeLibraryCompletion,
  FULL_SONG_SECTION_ID,
} from './state/mastery';
export type {
  MasterySongDef,
  MasterySectionView,
  SongMastery,
  LibraryMastery,
  SongSeal,
  NearCompletionEntry,
  WeeklyGrowth,
  WeeklyGrowthAttempt,
  FullSongChallengeView,
  FullSongProgressSections,
  LibraryCompletion,
  LibraryMilestone,
} from './state/mastery';

// === State: stamp collection (varied "collectibles" awarded on section complete) ===
export {
  DEFAULT_STAMPS,
  applyStampEvaluation,
  groupStampsByCategory,
  stampHelpers,
} from './state/stamps';
export type {
  StampDef,
  StampCategory,
  StampRarity,
  StampContext,
  StampEvaluationResult,
} from './state/stamps';

// === Audio: chord recognition ===
export { detectChord } from './audio/chord';

// === Audio: chord aggregation window (debounced multi-note → chord name) ===
export {
  initChordWindowState,
  resetChordWindowState,
  applyOnsetToWindow,
} from './audio/chord-window';
export type {
  ChordWindowState,
  ChordWindowOptions,
  ChordWindowEvent,
  ChordWindowResult,
} from './audio/chord-window';

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
  pickAudioOffsetMs,
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
  PickAudioOffsetInput,
} from './audio/audio-context';

// === Library: MusicXML metadata + auto-sectioning ===
export { parseMusicXmlMetadata } from './library/musicxml-meta';
export type { MusicXmlMetadata, MetaParseOptions } from './library/musicxml-meta';

// === Library: MusicXML score-timing (per-measure tempo + divisions) ===
export {
  parseScoreTimingFromXml,
  computeLeadingMeasureBpms,
  timeAtInBarQuarters,
} from './library/score-timing';
export type {
  ScoreTiming,
  MeasureTiming,
  TempoEvent,
  ScoreTimingOptions,
} from './library/score-timing';

// === Library: per-measure (start, duration) seconds from ScoreTiming ===
export { buildMeasureTimingFromXml } from './library/measure-timing';
export type { MeasureTimingResult } from './library/measure-timing';

// === Library: 小節グリッド（展開後時計）— カウントイン/メトロノームの唯一の真実 ===
export {
  buildMeasureGrid,
  meterBeatInfo,
  gridIndexAtSec,
  isPartialMeasure,
  countInPickupSec,
  countInMeterAtAnchor,
} from './library/measure-grid';
export type {
  MeasureGridEntry,
  MeasureGridSourceMeasure,
  MeterBeatInfo,
} from './library/measure-grid';

// === Library: playback-order parser + note re-timer ===
export {
  parsePlaybackOrderFromXml,
  expandNotesByPlaybackOrder,
  expandedMeasureStartSec,
} from './library/playback-order';
export type {
  PlaybackOrderOptions,
  MeasureMarkers,
  PlaybackOrderNote,
  ExpandedNote,
  SourceMeasureTiming,
} from './library/playback-order';

// === Library: tied-note coalescer ===
export { mergeTiedNotes } from './library/merge-tied-notes';
export type {
  TiedNote,
  MergeTiedSample,
  MergeTiedOptions,
  MergeTiedResult,
} from './library/merge-tied-notes';

// === Library: load-time DIAG dump ===
export { dumpLoadDiagnostics } from './library/diag-load';
export type {
  DiagPayload,
  DiagSong,
  DiagSection,
  DiagNote,
  DiagExtractInfo,
  DiagLogger,
} from './library/diag-load';

export {
  autoSectionDefs,
  collectSectionCandidates,
  buildSectionsFromDefs,
} from './library/auto-section';
export type {
  SectionDef,
  SectionCandidates,
  AutoSectionOptions,
  BuildSectionsInputDef,
  BuiltSection,
  SectionBuildSourceNote,
} from './library/auto-section';

// === Util: tiny formatters + math used by both shells ===
export { formatTime, clamp } from './util/format';

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
  MIC_INPUT_LATENCY_MS,
  STAR_TIERS,
  RESULT_TIER_KEYS,
  TEMPO_TIERS,
  initPracticeState,
  resetPracticeState,
  buildSectionNotes,
  computeHandRanges,
  matchNoteOnset,
  finalizeNoteHold,
  computeStars,
  resolveResultTier,
  pickSectionFocus,
  SECTION_FOCUS_STRENGTH_FLOOR,
  needsPreflightScaffold,
  planSectionScaffold,
  SCAFFOLD_ESCALATE_DEPTH,
  SCAFFOLD_NOTES_BOTTLENECK_BELOW,
  computeUnlocks,
  planTempoStepUp,
  practiceBeatMs,
  computePracticeTimings,
  practiceElapsedMs,
  isFixedTempoMode,
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
  SectionFocus,
  SectionFocusDim,
  ScaffoldStrategy,
  ScaffoldPlan,
  UnlockComputeInput,
  UnlockComputeResult,
  PracticeTimings,
  PracticeTimingOptions,
  PracticeTimingMeter,
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
