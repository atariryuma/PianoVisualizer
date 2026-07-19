// Initial game state — Phase 0d batch 67.
//
// The 130-line state object literal moved out of legacy-app.js
// verbatim, with a couple of QoL fixes:
//
//   • Pre-declared dynamic fields stay declared (the shell's comment
//     is preserved — keeps V8's hidden class stable across the
//     per-frame hot path that mutates these on each onset).
//   • The factory returns a fresh object so a future "reset" path
//     can rebuild instead of resetting per-field. The legacy
//     `resetSession()` reducer in @piano/core covers the partial
//     reset; a full reseed (e.g. after `recoverAudioContext` blanks
//     the audio engine) calls this.
//
// Pure data — zero side effects, no DOM / window reads. Tests pin
// the field set against the legacy shape so a typo / missing field
// stops a release from shipping with V8 hidden-class drift in the
// hot path.

import type { RecentPitchEntry } from './core-opts';

/** Mirror of the legacy GameStateShape declared in legacy-app.js's
 *  JSDoc typedef. Kept loose (`Record<string, unknown>`-shaped) so
 *  this module stays portable across the @piano/core type evolution
 *  during Phase 0d → 0e. The shell still casts the result to its
 *  GameStateShape view via the existing JSDoc cast, so type safety
 *  in callers is unchanged. */
export interface InitialGameState {
  running: boolean;
  starting: boolean;
  flow: number;
  combo: number;
  bestCombo: number;
  currentStage: number;
  lastGoodNoteTimeMs: number;
  lastSilenceStartMs: number;
  lastNoisePenaltyMs: number;
  /** Continuous-MIDI semitones of the most recent onset (mic or MIDI).
   *  Replaces legacy lastPitch (Hz) + lastMidiNoteForStability (int). */
  lastPitchSemitones: number | null;

  // v10: Synesthesia Mode
  useSynesthesiaMode: boolean;

  // v10: Magic Quests
  completedQuests: string[];
  lastQuestCheckMs: number;
  activeQuestId: string | null;

  pitchStability: number;
  lastNoteTimeMs: number;
  smoothEnergy: number;
  lastDetectedNote: string;
  noteShowTimeMs: number;
  currentTheme: number;
  lastFrameTimeMs: number;
  prevSpectrum: Float32Array | null;
  spectralFluxHistory: number[];
  lastOnsetTimeMs: number;

  // v13: Mic source state
  micSuspended: boolean;

  // Software AGC (v8)
  agcGain: number;
  agcSmoothedRms: number;
  agcLastUpdateMs: number;

  // v9: AGC voice suppression
  agcVoiceRejectCount: number;
  agcVoiceSuppressUntilMs: number;

  // Session Confidence (ring buffer)
  sessionState: 'waiting' | 'warmup' | 'performing';
  sessionStartMs: number;
  sessionConfidence: number;
  sessionPerformingStartMs: number;
  lastSessionSampleMs: number;
  sessionRingHead: number;
  sessionRingTail: number;
  sessionRingSize: number;
  sessionPianoCount: number;
  goalWindowStartMs: number;
  goalCelebrateUntilMs: number;
  goalCompletedCount: number;

  // Quality Scoring
  noteOnsetTimes: number[];
  ioiHistory: number[];
  amplitudeHistory: number[];
  centroidHistory: number[];
  rhythmScore: number;
  dynamicsScore: number;
  stabilityScore: number;
  qualityScore: number;
  displayedQualityScore: number;
  growthScore: number;
  qualityHistory: number[];
  feedbackGood: string;
  feedbackNext: string;
  lastScoreUpdateMs: number;

  // v9: Encouragement system
  currentEncouragementTier: number;
  lastEncouragementTimeMs: number;
  encouragementHideTimeMs: number;

  // v9: Special effects state
  glowPulseIntensity: number;
  shimmerPhase: number;
  shimmerStartMs: number;
  inputFlash: number;

  // Debug
  debugMode: boolean;
  debugLastFlux: number;
  debugLastSpread: number;
  debugLastThreshold: number;
  debugGateOpen: boolean;
  debugLastRms: number;
  debugLastConf: number;
  debugLastPitch: number;
  debugIsGoodNote: boolean;
  debugIsActivePlay: boolean;
  debugLastFlatness: number;
  debugLastCrest: number;
  debugOnsetReason: string;
  debugLastCentroid: number;
  debugCentroidCV: number;
  debugSessionConf: number;
  debugSessionState: string;
  debugAgcGain: number;
  debugHarmonicity: number;

  // YIN throttle
  yinSkipCounter: number;
  cachedPitchResult: { pitch: number; conf: number; rms: number };

  // v11: Session tracking
  sessionStartTimeMs: number;
  peakFlow: number;

  // Pre-declared dynamic fields — initializing here keeps V8's
  // hidden class stable across the per-frame hot path (used to be
  // lazy `state.x ||= 0` initializers scattered through
  // updateGameState / matchNoteOnset).
  adaptiveSilenceRms: number | null;
  /** R2-3: 時刻付きピッチリング（`{ hz, t }`）。median の時間失効用。 */
  recentPitches: RecentPitchEntry[] | null;
  consecutiveOnsetFrames: number;
  lastDebugLogMs: number;
  debugMaxRms: number;
  debugMaxConf: number;
  debugMaxHarm: number;
  debugOnsetCount: number;
  lastMidiNoteForStability: number | null;
  micPermissionFailed: boolean;
  micIntentionallySkipped: boolean;
  lastIntroDiag: (() => void) | null;
  _lastSummary: unknown;
}

/** Build the initial game state. Returns a fresh object every call —
 *  callers can compare references for equality but never mutate the
 *  return value before assignment. */
export function createInitialGameState(): InitialGameState {
  return {
    running: false,
    starting: false,
    flow: 0,
    combo: 0,
    bestCombo: 0,
    currentStage: 0,
    lastGoodNoteTimeMs: 0,
    lastSilenceStartMs: -1,
    lastNoisePenaltyMs: 0,
    lastPitchSemitones: null,

    useSynesthesiaMode: false,

    completedQuests: [],
    lastQuestCheckMs: 0,
    activeQuestId: null,

    pitchStability: 0,
    lastNoteTimeMs: 0,
    smoothEnergy: 0,
    lastDetectedNote: '',
    noteShowTimeMs: 0,
    currentTheme: 0,
    lastFrameTimeMs: 0,
    prevSpectrum: null,
    spectralFluxHistory: [],
    lastOnsetTimeMs: -9999,

    micSuspended: false,

    agcGain: 1.0,
    agcSmoothedRms: 0,
    agcLastUpdateMs: 0,

    agcVoiceRejectCount: 0,
    agcVoiceSuppressUntilMs: 0,

    sessionState: 'waiting',
    sessionStartMs: 0,
    sessionConfidence: 0,
    sessionPerformingStartMs: 0,
    lastSessionSampleMs: 0,
    sessionRingHead: 0,
    sessionRingTail: 0,
    sessionRingSize: 0,
    sessionPianoCount: 0,
    goalWindowStartMs: 0,
    goalCelebrateUntilMs: 0,
    goalCompletedCount: 0,

    noteOnsetTimes: [],
    ioiHistory: [],
    amplitudeHistory: [],
    centroidHistory: [],
    rhythmScore: 0,
    dynamicsScore: 0,
    stabilityScore: 0,
    qualityScore: 0,
    displayedQualityScore: 0,
    growthScore: 0,
    qualityHistory: [],
    feedbackGood: '',
    feedbackNext: '',
    lastScoreUpdateMs: 0,

    currentEncouragementTier: -1,
    lastEncouragementTimeMs: 0,
    encouragementHideTimeMs: 0,

    glowPulseIntensity: 0,
    shimmerPhase: -1,
    shimmerStartMs: 0,
    inputFlash: 0,

    debugMode: false,
    debugLastFlux: 0,
    debugLastSpread: 0,
    debugLastThreshold: 0,
    debugGateOpen: false,
    debugLastRms: 0,
    debugLastConf: 0,
    debugLastPitch: 0,
    debugIsGoodNote: false,
    debugIsActivePlay: false,
    debugLastFlatness: 0,
    debugLastCrest: 0,
    debugOnsetReason: '',
    debugLastCentroid: 0,
    debugCentroidCV: 0,
    debugSessionConf: 0,
    debugSessionState: 'waiting',
    debugAgcGain: 1.0,
    debugHarmonicity: 0,

    yinSkipCounter: 0,
    cachedPitchResult: { pitch: -1, conf: 0, rms: 0 },

    sessionStartTimeMs: 0,
    peakFlow: 0,

    adaptiveSilenceRms: null,
    recentPitches: null,
    consecutiveOnsetFrames: 0,
    lastDebugLogMs: 0,
    debugMaxRms: 0,
    debugMaxConf: 0,
    debugMaxHarm: 0,
    debugOnsetCount: 0,
    lastMidiNoteForStability: null,
    micPermissionFailed: false,
    micIntentionallySkipped: false,
    lastIntroDiag: null,
    _lastSummary: null,
  };
}
