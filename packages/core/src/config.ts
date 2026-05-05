// CONFIG — central tunable parameters for the engine.
//
// Convention: numeric thresholds and durations are in their natural units
// (Hz, ms, ratio, count). Arrays for STAGES / ENCOURAGEMENT_TIERS / THEMES /
// QUESTS are typed as `as const` so consumers can index by literal type.
//
// Values mirror what's in legacy app.js. The QUESTS conditions reference a
// `QuestStateView` shape — the engine state needs to expose those fields by
// name for the QUESTS to evaluate. See the QuestStateView type below.

// =====================================================================
// Tunable parameters (numbers, arrays, objects).
// =====================================================================

export const CONFIG = {
  // Audio — main analyser (for pitch + visualisation)
  FFT_SIZE: 4096,
  SMOOTHING: 0.82,
  PIANO_FREQ_MIN: 27,
  PIANO_FREQ_MAX: 4200,

  // Onset analyser — dedicated low-smoothing node for transient detection
  ONSET_FFT_SIZE: 2048,
  ONSET_SMOOTHING: 0.15,

  // Software AGC via GainNode
  AGC_TARGET_RMS: 0.06,
  AGC_ATTACK_COEFF: 0.02,
  AGC_RELEASE_COEFF: 0.08,
  AGC_MIN_GAIN: 1.0,
  AGC_MAX_GAIN: 40.0,
  AGC_UPDATE_INTERVAL_MS: 100,
  AGC_SILENCE_FLOOR: 0.0003,
  // AGC voice suppression
  AGC_VOICE_REJECT_COUNT: 5,
  AGC_VOICE_SUPPRESS_MAX: 8.0,
  AGC_VOICE_SUPPRESS_MS: 500,
  AGC_VOICE_RMS_MIN: 0.02,

  // Synesthesia colors (educational mode)
  NOTE_COLORS: {
    C: '#ff0000',
    'C#': '#ff4000',
    D: '#ff8000',
    'D#': '#ffbf00',
    E: '#ffff00',
    F: '#80ff00',
    'F#': '#00ff00',
    G: '#00ffff',
    'G#': '#0080ff',
    A: '#0000ff',
    'A#': '#8000ff',
    B: '#ff00ff',
  },

  // YIN pitch detection
  YIN_THRESHOLD: 0.2,
  YIN_PROBABILITY_THRESHOLD: 0.1,
  RMS_SILENCE_THRESHOLD: 0.008,
  PITCH_MIN_HZ: 25,
  // Practice-mode floor — YIN frequently locks onto a sub-harmonic 1-2 octaves
  // below the actual note. Für Elise's lowest written pitch is ~A2 (~110Hz),
  // so anything below E2 (~82Hz) is almost always an octave-down error.
  PITCH_MIN_HZ_PRACTICE: 80,
  PITCH_MAX_HZ: 5000,
  GOOD_NOTE_RMS: 0.008,
  CONFIDENCE_THRESHOLD: 0.6,

  // Multi-feature onset classification
  SPECTRAL_FLUX_THRESHOLD: 4.0,
  SPECTRAL_FLUX_ADAPTIVE_K: 1.3,
  SPECTRAL_FLUX_HISTORY_SIZE: 20,
  ONSET_SPREAD_THRESHOLD: 0.05,
  ONSET_SPREAD_MAX: 0.7,
  ONSET_SPREAD_MIN_CHANGE: 1.5,
  // Spectral flatness lower bound. Piano single notes are very tonal (low
  // flatness), so this threshold must be small or the gate rejects clean
  // playing. The harmonicity gate already filters non-pitched sounds.
  FLATNESS_PIANO_MIN: 0.03,
  CREST_VOICE_MAX: 8.0,
  ONSET_GATE_DURATION_MS: 1500,
  ONSET_COOLDOWN_MS: 60,
  FLUX_FREQ_MIN_HZ: 20,
  FLUX_FREQ_MAX_HZ: 4200,

  // Harmonicity gate
  HARMONICITY_MIN: 0.0, // free-play: lenient so chords aren't rejected
  HARMONICITY_MIN_PRACTICE: 0.12, // practice: light filter for voice/key clatter
  HARMONICITY_PARTIALS: 6,
  HARMONICITY_BIN_TOLERANCE: 2,

  // Session confidence
  SESSION_WINDOW_MS: 4000,
  SESSION_CONFIRM_THRESHOLD: 0.35,
  SESSION_LOSE_THRESHOLD: 0.1,
  SESSION_WARMUP_MS: 2000,
  SESSION_SAMPLE_INTERVAL_MS: 50,

  // Spectral centroid tracking (debug)
  CENTROID_HISTORY_SIZE: 20,

  // Quality scoring
  SCORE_RHYTHM_WEIGHT: 0.4,
  SCORE_DYNAMICS_WEIGHT: 0.35,
  SCORE_STABILITY_WEIGHT: 0.25,
  IOI_HISTORY_SIZE: 16,
  IOI_IDEAL_CV: 0.3,
  IOI_MAX_CV: 1.5,
  AMPLITUDE_HISTORY_SIZE: 30,
  DYNAMICS_IDEAL_CV_MIN: 0.03,
  DYNAMICS_IDEAL_CV_MAX: 0.6,
  SCORE_UPDATE_INTERVAL_MS: 500,
  SCORE_SMOOTHING: 0.08,
  GROWTH_WINDOW_MS: 30000,
  MOTIVATION_GOAL_MS: 30000,

  // Game timing
  COMBO_WINDOW_MS: 3000,
  SILENCE_DECAY_START_MS: 8000,
  SILENCE_HARD_DECAY_MS: 12000,
  NOISE_PENALTY_COOLDOWN_MS: 300,
  NOTE_DISPLAY_DURATION_MS: 1200,
  MIN_NOTE_INTERVAL_MS: 70,

  // Game balance
  FLOW_GAIN_BASE: 8,
  FLOW_GAIN_COMBO_MAX: 10,
  FLOW_GAIN_STABILITY_MAX: 20,
  FLOW_GAIN_QUALITY_MAX: 25,
  FLOW_DECAY_SOFT: 0.5,
  FLOW_DECAY_HARD: 2.0,
  NOISE_RMS_THRESHOLD: 0.05,
  FLOW_NOISE_PENALTY: 3,
  COMBO_DECAY_RATE: 0.5,
  COMBO_NOISE_PENALTY: 1,

  // Pitch stability
  STABILITY_SEMITONE_THRESHOLD: 3,
  STABILITY_GROWTH: 0.05,
  STABILITY_DECAY_GOOD: 0.9,
  STABILITY_DECAY_IDLE: 0.995,

  // Rendering — these are defaults; PERF_PROFILE overrides them at runtime.
  MAX_PARTICLES: 800,
  SHADOW_BLUR_ENABLED: true,
  AMBIENT_PARTICLE_CHANCE: 0.03,
  BAR_COUNT: 64,

  // Stages — `nameKey` is resolved via t() so labels follow prefs.lang.
  STAGES: [
    { nameKey: null, prefix: '', minFlow: 0 },
    { nameKey: 'stage1', prefix: '✦ ', minFlow: 15 },
    { nameKey: 'stage2', prefix: '✦✦ ', minFlow: 35 },
    { nameKey: 'stage3', prefix: '✦✦✦ ', minFlow: 55 },
    { nameKey: 'stage4', prefix: '✦✦✦✦ ', minFlow: 75 },
    { nameKey: 'stage5', prefix: '✦✦✦✦✦ ', minFlow: 90 },
    { nameKey: 'stage6', prefix: '✦✦✦✦✦✦ ', minFlow: 98 },
  ],

  // Encouragement tiers — replaces combo number display
  ENCOURAGEMENT_TIERS: [
    { minCombo: 3, messageKey: 'enc1', effect: 'glowPulse' },
    { minCombo: 8, messageKey: 'enc2', effect: 'glowParticles' },
    { minCombo: 15, messageKey: 'enc3', effect: 'colorWave' },
    { minCombo: 25, messageKey: 'enc4', effect: 'starShower' },
    { minCombo: 40, messageKey: 'enc5', effect: 'flowerBurst' },
    { minCombo: 60, messageKey: 'enc6', effect: 'shimmer' },
    { minCombo: 80, messageKey: 'enc7', effect: 'radiance' },
    { minCombo: 100, messageKey: 'enc8', effect: 'goldenBurst' },
  ],
  ENCOURAGEMENT_COOLDOWN_MS: 8000,
  ENCOURAGEMENT_DISPLAY_MS: 2500,

  // Note mapping — kept here for legacy convenience; @piano/core/i18n
  // exposes NOTE_NAMES_EN/JP separately for localized rendering.
  NOTE_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  PIANO_KEY_MIN: 21,
  PIANO_KEY_COUNT: 88,

  // Themes
  THEMES: [
    {
      bg: [10, 10, 20] as readonly [number, number, number],
      colors: ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6366f1', '#818cf8'],
      glow: 'rgba(139,92,246,',
    },
    {
      bg: [8, 18, 20] as readonly [number, number, number],
      colors: ['#06b6d4', '#22d3ee', '#34d399', '#10b981', '#14b8a6', '#67e8f9'],
      glow: 'rgba(6,182,212,',
    },
    {
      bg: [20, 12, 8] as readonly [number, number, number],
      colors: ['#f97316', '#fb923c', '#ef4444', '#f43f5e', '#eab308', '#fbbf24'],
      glow: 'rgba(249,115,22,',
    },
    {
      bg: [12, 12, 18] as readonly [number, number, number],
      colors: ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#ddd6fe', '#f0f0ff', '#ffffff'],
      glow: 'rgba(200,200,255,',
    },
  ],
} as const;

export type Config = typeof CONFIG;

// =====================================================================
// Quests — separated because their `condition` closures reference the
// engine state shape (defined here as QuestStateView).
// =====================================================================

/** The minimal slice of engine state that quest conditions can read. */
export interface QuestStateView {
  noteOnsetTimes: ArrayLike<unknown>;
  flow: number;
  combo: number;
  bestCombo: number;
  stabilityScore: number;
  rhythmScore: number;
  dynamicsScore: number;
  qualityScore: number;
  sessionState: 'waiting' | 'warmup' | 'performing' | string;
  sessionConfidence: number;
}

export interface QuestDef {
  id: string;
  nameKey: string;
  descKey: string;
  condition: (s: QuestStateView) => boolean;
  reward: string;
}

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'q1',
    nameKey: 'qst1Name',
    descKey: 'qst1Desc',
    condition: (s) => s.noteOnsetTimes.length >= 3,
    reward: 'Nice Start!',
  },
  {
    id: 'q2',
    nameKey: 'qst2Name',
    descKey: 'qst2Desc',
    condition: (s) => s.flow >= 50,
    reward: 'Good Flow!',
  },
  {
    id: 'q3',
    nameKey: 'qst3Name',
    descKey: 'qst3Desc',
    condition: (s) => s.combo >= 30,
    reward: 'Combo Master!',
  },
  {
    id: 'q4',
    nameKey: 'qst4Name',
    descKey: 'qst4Desc',
    condition: (s) => s.stabilityScore >= 0.8,
    reward: 'Stable Tone!',
  },
  {
    id: 'q5',
    nameKey: 'qst5Name',
    descKey: 'qst5Desc',
    condition: (s) => s.sessionState === 'performing' && s.sessionConfidence > 0.8,
    reward: 'Virtuoso!',
  },
  {
    id: 'q6',
    nameKey: 'qst6Name',
    descKey: 'qst6Desc',
    condition: (s) => s.rhythmScore >= 0.85,
    reward: 'Rhythm Master!',
  },
  {
    id: 'q7',
    nameKey: 'qst7Name',
    descKey: 'qst7Desc',
    condition: (s) => s.flow >= 95,
    reward: 'Peak Flow!',
  },
  {
    id: 'q8',
    nameKey: 'qst8Name',
    descKey: 'qst8Desc',
    condition: (s) => s.combo >= 100,
    reward: 'Century Combo!',
  },
  {
    id: 'q9',
    nameKey: 'qst9Name',
    descKey: 'qst9Desc',
    condition: (s) => s.dynamicsScore >= 0.8,
    reward: 'Dynamic Range!',
  },
  {
    id: 'q10',
    nameKey: 'qst10Name',
    descKey: 'qst10Desc',
    condition: (s) => s.qualityScore >= 0.85,
    reward: 'Full Focus!',
  },
  {
    id: 'q11',
    nameKey: 'qst11Name',
    descKey: 'qst11Desc',
    condition: (s) => s.bestCombo >= 200 && s.flow >= 90,
    reward: 'LEGENDARY!',
  },
];
