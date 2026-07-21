// Piano-app configuration — Phase 0d batch 68.
//
// The 200-line CONFIG literal moved verbatim out of legacy-app.js,
// plus the QUESTS_DEFS table that the shell used to attach to
// CONFIG.QUESTS post-construction. Pure data + pure quest
// predicates (state → boolean) — no DOM, no @piano/core, no
// closures over runtime state. Tests pin every numeric / string
// value so a typo while tuning a threshold has to update the test
// in the same commit.
//
// Tuning notes are kept in-line so the next agent reading the file
// understands WHY each value is what it is (the v8/v9/v10 lineage
// matters — these comments are the only record of what we tried
// and rejected during free-play balancing).

/** Minimal shape the quest predicates read. The full shape (160+
 *  fields) lives in legacy-app.js's GameStateShape JSDoc; we
 *  declare only the slice the predicates touch so this module
 *  doesn't depend on the rest of the shell type graph. */
export interface QuestEvalState {
  noteOnsetTimes: ReadonlyArray<number>;
  flow: number;
  combo: number;
  bestCombo: number;
  stabilityScore: number;
  rhythmScore: number;
  dynamicsScore: number;
  qualityScore: number;
  sessionState: 'waiting' | 'warmup' | 'performing';
  sessionConfidence: number;
}

export interface QuestDef {
  id: string;
  nameKey: string;
  descKey: string;
  condition: (s: QuestEvalState) => boolean;
  /** i18n key for the celebratory reward tagline (localized). */
  rewardKey: string;
  /** Legacy raw-English fallback (kept for older call sites/tests). */
  reward: string;
}

export interface StageDef {
  nameKey: string | null;
  prefix: string;
  minFlow: number;
}

export interface EncouragementTier {
  minCombo: number;
  messageKey: string;
  effect: string;
}

export interface ThemeDef {
  bg: [number, number, number];
  colors: string[];
  glow: string;
}

/** Mirror of legacy `ConfigShape` — kept loose so the shell's
 *  existing JSDoc `@type {ConfigShape}` cast still narrows. The
 *  shell mutates two fields at runtime (PERF_TIER overrides for
 *  MAX_PARTICLES + SHADOW_BLUR_ENABLED + AMBIENT_PARTICLE_CHANCE),
 *  so the type is `Record<string, unknown>`-shaped to allow the
 *  field-name-based mutation without losing type safety on reads. */
export interface PianoConfig {
  // Audio
  FFT_SIZE: number;
  SMOOTHING: number;
  PIANO_FREQ_MIN: number;
  PIANO_FREQ_MAX: number;
  ONSET_FFT_SIZE: number;
  ONSET_SMOOTHING: number;

  // Software AGC
  AGC_TARGET_RMS: number;
  AGC_ATTACK_COEFF: number;
  AGC_RELEASE_COEFF: number;
  AGC_MIN_GAIN: number;
  AGC_MAX_GAIN: number;
  AGC_UPDATE_INTERVAL_MS: number;
  AGC_SILENCE_FLOOR: number;

  // AGC voice suppression (v9)
  AGC_VOICE_REJECT_COUNT: number;
  AGC_VOICE_SUPPRESS_MAX: number;
  AGC_VOICE_SUPPRESS_MS: number;
  AGC_VOICE_RMS_MIN: number;

  // Synesthesia colors (v10)
  NOTE_COLORS: Record<string, string>;

  // YIN pitch detection
  YIN_THRESHOLD: number;
  YIN_PROBABILITY_THRESHOLD: number;
  RMS_SILENCE_THRESHOLD: number;
  PITCH_MIN_HZ: number;
  PITCH_MIN_HZ_PRACTICE: number;
  PITCH_MAX_HZ: number;
  GOOD_NOTE_RMS: number;
  CONFIDENCE_THRESHOLD: number;

  // Multi-feature onset
  SPECTRAL_FLUX_THRESHOLD: number;
  SPECTRAL_FLUX_ADAPTIVE_K: number;
  SPECTRAL_FLUX_HISTORY_SIZE: number;
  ONSET_SPREAD_THRESHOLD: number;
  ONSET_SPREAD_MAX: number;
  ONSET_SPREAD_MIN_CHANGE: number;
  FLATNESS_PIANO_MIN: number;
  CREST_VOICE_MAX: number;
  ONSET_GATE_DURATION_MS: number;
  ONSET_COOLDOWN_MS: number;
  FLUX_FREQ_MIN_HZ: number;
  FLUX_FREQ_MAX_HZ: number;

  // Harmonicity
  HARMONICITY_MIN: number;
  HARMONICITY_MIN_PRACTICE: number;

  // Session confidence
  SESSION_WINDOW_MS: number;
  SESSION_CONFIRM_THRESHOLD: number;
  SESSION_LOSE_THRESHOLD: number;
  SESSION_WARMUP_MS: number;
  SESSION_SAMPLE_INTERVAL_MS: number;

  // Spectral centroid
  CENTROID_HISTORY_SIZE: number;

  // Quality scoring
  SCORE_RHYTHM_WEIGHT: number;
  SCORE_DYNAMICS_WEIGHT: number;
  SCORE_STABILITY_WEIGHT: number;
  IOI_HISTORY_SIZE: number;
  IOI_IDEAL_CV: number;
  IOI_MAX_CV: number;
  AMPLITUDE_HISTORY_SIZE: number;
  DYNAMICS_IDEAL_CV_MIN: number;
  DYNAMICS_IDEAL_CV_MAX: number;
  SCORE_UPDATE_INTERVAL_MS: number;
  SCORE_SMOOTHING: number;
  GROWTH_WINDOW_MS: number;
  MOTIVATION_GOAL_MS: number;

  // Game timing
  COMBO_WINDOW_MS: number;
  SILENCE_DECAY_START_MS: number;
  SILENCE_HARD_DECAY_MS: number;
  NOISE_PENALTY_COOLDOWN_MS: number;
  NOTE_DISPLAY_DURATION_MS: number;
  MIN_NOTE_INTERVAL_MS: number;

  // Game balance
  FLOW_GAIN_BASE: number;
  FLOW_GAIN_COMBO_MAX: number;
  FLOW_GAIN_STABILITY_MAX: number;
  FLOW_GAIN_QUALITY_MAX: number;
  FLOW_DECAY_SOFT: number;
  FLOW_DECAY_HARD: number;
  NOISE_RMS_THRESHOLD: number;
  FLOW_NOISE_PENALTY: number;
  COMBO_DECAY_RATE: number;
  COMBO_NOISE_PENALTY: number;

  // Pitch stability
  STABILITY_SEMITONE_THRESHOLD: number;
  STABILITY_GROWTH: number;
  STABILITY_DECAY_GOOD: number;
  STABILITY_DECAY_IDLE: number;

  // Rendering
  MAX_PARTICLES: number;
  SHADOW_BLUR_ENABLED: boolean;
  AMBIENT_PARTICLE_CHANCE: number;
  BAR_COUNT: number;

  STAGES: StageDef[];

  ENCOURAGEMENT_TIERS: EncouragementTier[];
  ENCOURAGEMENT_COOLDOWN_MS: number;
  ENCOURAGEMENT_DISPLAY_MS: number;

  // Note mapping
  NOTE_NAMES: string[];
  PIANO_KEY_MIN: number;
  PIANO_KEY_COUNT: number;

  // Themes
  THEMES: ThemeDef[];

  QUESTS: QuestDef[];
}

/** Quest predicates (state → boolean). Each quest fires when its
 *  predicate first returns true; the `i18n` keys + reward strings
 *  drive the toast UI. Predicates take the QuestEvalState slice
 *  defined above so this module stays type-graph-light. */
export const QUESTS_DEFS: QuestDef[] = [
  {
    id: 'q1',
    nameKey: 'qst1Name',
    descKey: 'qst1Desc',
    condition: (s) => s.noteOnsetTimes.length >= 3,
    rewardKey: 'qstReward1',
    reward: 'Nice Start!',
  },
  {
    id: 'q2',
    nameKey: 'qst2Name',
    descKey: 'qst2Desc',
    condition: (s) => s.flow >= 50,
    rewardKey: 'qstReward2',
    reward: 'Good Flow!',
  },
  {
    id: 'q3',
    nameKey: 'qst3Name',
    descKey: 'qst3Desc',
    condition: (s) => s.combo >= 30,
    rewardKey: 'qstReward3',
    reward: 'Combo Master!',
  },
  {
    id: 'q4',
    nameKey: 'qst4Name',
    descKey: 'qst4Desc',
    condition: (s) => s.stabilityScore >= 0.8,
    rewardKey: 'qstReward4',
    reward: 'Stable Tone!',
  },
  {
    id: 'q5',
    nameKey: 'qst5Name',
    descKey: 'qst5Desc',
    condition: (s) => s.sessionState === 'performing' && s.sessionConfidence > 0.8,
    rewardKey: 'qstReward5',
    reward: 'Virtuoso!',
  },
  {
    id: 'q6',
    nameKey: 'qst6Name',
    descKey: 'qst6Desc',
    condition: (s) => s.rhythmScore >= 0.85,
    rewardKey: 'qstReward6',
    reward: 'Rhythm Master!',
  },
  {
    id: 'q7',
    nameKey: 'qst7Name',
    descKey: 'qst7Desc',
    condition: (s) => s.flow >= 95,
    rewardKey: 'qstReward7',
    reward: 'Peak Flow!',
  },
  {
    id: 'q8',
    nameKey: 'qst8Name',
    descKey: 'qst8Desc',
    condition: (s) => s.combo >= 100,
    rewardKey: 'qstReward8',
    reward: 'Century Combo!',
  },
  {
    id: 'q9',
    nameKey: 'qst9Name',
    descKey: 'qst9Desc',
    condition: (s) => s.dynamicsScore >= 0.8,
    rewardKey: 'qstReward9',
    reward: 'Dynamic Range!',
  },
  {
    id: 'q10',
    nameKey: 'qst10Name',
    descKey: 'qst10Desc',
    condition: (s) => s.qualityScore >= 0.85,
    rewardKey: 'qstReward10',
    reward: 'Full Focus!',
  },
  {
    id: 'q11',
    nameKey: 'qst11Name',
    descKey: 'qst11Desc',
    condition: (s) => s.bestCombo >= 200 && s.flow >= 90,
    rewardKey: 'qstReward11',
    reward: 'LEGENDARY!',
  },
];

/** Build the CONFIG literal. Returns a fresh object each call so
 *  the runtime PERF_TIER override path (which mutates
 *  MAX_PARTICLES / SHADOW_BLUR_ENABLED / AMBIENT_PARTICLE_CHANCE
 *  at boot) doesn't poison subsequent constructions. The return
 *  value already has QUESTS attached. */
export function createPianoConfig(): PianoConfig {
  return {
    // Audio — main analyser (for pitch + visualisation)
    FFT_SIZE: 4096,
    SMOOTHING: 0.82,
    PIANO_FREQ_MIN: 27,
    PIANO_FREQ_MAX: 4200,

    // Onset analyser — dedicated low-smoothing node for transient detection
    ONSET_FFT_SIZE: 2048,
    ONSET_SMOOTHING: 0.15,

    // Software AGC via GainNode (v8)
    AGC_TARGET_RMS: 0.06,
    AGC_ATTACK_COEFF: 0.02,
    AGC_RELEASE_COEFF: 0.08,
    AGC_MIN_GAIN: 1.0,
    AGC_MAX_GAIN: 40.0,
    AGC_UPDATE_INTERVAL_MS: 100,
    AGC_SILENCE_FLOOR: 0.0003,

    // v9: AGC voice suppression
    AGC_VOICE_REJECT_COUNT: 5,
    AGC_VOICE_SUPPRESS_MAX: 8.0,
    AGC_VOICE_SUPPRESS_MS: 500,
    AGC_VOICE_RMS_MIN: 0.02,

    // v10: Synesthesia Colors (Educational Mode)
    NOTE_COLORS: {
      C: '#ff0000', // Red
      'C#': '#ff4000', // Red-Orange
      D: '#ff8000', // Orange
      'D#': '#ffbf00', // Yellow-Orange
      E: '#ffff00', // Yellow
      F: '#80ff00', // Light Green
      'F#': '#00ff00', // Green
      G: '#00ffff', // Cyan
      'G#': '#0080ff', // Blue
      A: '#0000ff', // Dark Blue
      'A#': '#8000ff', // Purple
      B: '#ff00ff', // Magenta
    },

    // YIN pitch detection (v6+)
    YIN_THRESHOLD: 0.2,
    YIN_PROBABILITY_THRESHOLD: 0.1,
    RMS_SILENCE_THRESHOLD: 0.008, // v10: raised (0.005 → 0.008) to reduce noise
    PITCH_MIN_HZ: 25,
    // Practice-mode floor — YIN often locks to a sub-harmonic 1-2 octaves
    // below the actual note. Für Elise's lowest written pitch is around
    // A2 (~110Hz); anything below E2 (~82Hz) is almost always an
    // octave-down error.
    PITCH_MIN_HZ_PRACTICE: 80,
    PITCH_MAX_HZ: 5000,
    GOOD_NOTE_RMS: 0.008, // v10: raised — reject key clatter
    CONFIDENCE_THRESHOLD: 0.6, // v10 sweet spot for sensitivity/noise

    // Multi-Feature Onset Classification (v10 — tuned for sensitivity)
    SPECTRAL_FLUX_THRESHOLD: 4.0,
    SPECTRAL_FLUX_ADAPTIVE_K: 1.3,
    SPECTRAL_FLUX_HISTORY_SIZE: 20,
    ONSET_SPREAD_THRESHOLD: 0.05, // v10: low Min (→0.05) to pass pure notes
    ONSET_SPREAD_MAX: 0.7, // v10: relaxed Max for big chords
    ONSET_SPREAD_MIN_CHANGE: 1.5,
    // Spectral flatness lower bound. Piano single notes are tonal (low
    // flatness); harmonicity gate already filters non-pitched sounds, so
    // we keep this low and use it as a last-resort sanity check.
    FLATNESS_PIANO_MIN: 0.03,
    CREST_VOICE_MAX: 8.0,
    ONSET_GATE_DURATION_MS: 1500,
    ONSET_COOLDOWN_MS: 60,
    FLUX_FREQ_MIN_HZ: 20,
    FLUX_FREQ_MAX_HZ: 4200,

    // Harmonicity gate (v9 — new)
    // free-play: 0.0 だと倍音ゲートが実質無効で、iPad の画面/筐体タップの
    // 「コツッ」という共鳴音（YIN がピッチを拾う）まで音として通り、演出が
    // 連発して重くなっていた（実機・マイク入力時）。近ゼロ倍音のタップ衝撃音
    // だけを弾く小さな床を入れる。実音・和音は練習の 0.12（実音を通す実績）
    // より十分低いこの値を余裕で超えるので巻き込まない。効き過ぎる場合は
    // デバッグ表示の harmonicity 値 + onsetReason(REJ:harm) を見て調整可。
    HARMONICITY_MIN: 0.1, // free-play: タップ/衝撃音を弾く（実音を通す練習 0.12 の直下 = 安全側）
    HARMONICITY_MIN_PRACTICE: 0.12, // practice: light filter for voice/key clatter

    // Session confidence layer (v7+)
    SESSION_WINDOW_MS: 4000,
    SESSION_CONFIRM_THRESHOLD: 0.35,
    SESSION_LOSE_THRESHOLD: 0.1,
    SESSION_WARMUP_MS: 2000,
    SESSION_SAMPLE_INTERVAL_MS: 50,

    // Spectral centroid (debug only)
    CENTROID_HISTORY_SIZE: 20,

    // Quality scoring (v8+)
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
    SILENCE_DECAY_START_MS: 8000, // v10: increased to 8s (was 4s) for longer pauses
    SILENCE_HARD_DECAY_MS: 12000, // v10: increased hard-decay start
    NOISE_PENALTY_COOLDOWN_MS: 300,
    NOTE_DISPLAY_DURATION_MS: 1200,
    MIN_NOTE_INTERVAL_MS: 70,

    // Game balance
    FLOW_GAIN_BASE: 8, // v10: gentle climb (was 10)
    FLOW_GAIN_COMBO_MAX: 10, // v10: reduced (was 16)
    FLOW_GAIN_STABILITY_MAX: 20,
    FLOW_GAIN_QUALITY_MAX: 25,
    FLOW_DECAY_SOFT: 0.5, // v10: very gentle decay (was 2.0)
    FLOW_DECAY_HARD: 2.0, // v10: slower hard decay (was 8.0)
    NOISE_RMS_THRESHOLD: 0.05,
    FLOW_NOISE_PENALTY: 3,
    COMBO_DECAY_RATE: 0.5,
    COMBO_NOISE_PENALTY: 1,

    // Pitch stability
    STABILITY_SEMITONE_THRESHOLD: 3,
    STABILITY_GROWTH: 0.05,
    STABILITY_DECAY_GOOD: 0.9, // v10: slower decay active
    STABILITY_DECAY_IDLE: 0.995, // v10: much slower decay idle (was 0.98)

    // Rendering
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

    // Encouragement tiers (v9 — replaces combo numbers)
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

    // Note mapping
    NOTE_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    PIANO_KEY_MIN: 21,
    PIANO_KEY_COUNT: 88,

    // Themes
    THEMES: [
      {
        bg: [10, 10, 20],
        colors: ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6366f1', '#818cf8'],
        glow: 'rgba(139,92,246,',
      },
      {
        bg: [8, 18, 20],
        colors: ['#06b6d4', '#22d3ee', '#34d399', '#10b981', '#14b8a6', '#67e8f9'],
        glow: 'rgba(6,182,212,',
      },
      {
        bg: [20, 12, 8],
        colors: ['#f97316', '#fb923c', '#ef4444', '#f43f5e', '#eab308', '#fbbf24'],
        glow: 'rgba(249,115,22,',
      },
      {
        bg: [12, 12, 18],
        colors: ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#ddd6fe', '#f0f0ff', '#ffffff'],
        glow: 'rgba(200,200,255,',
      },
    ],

    QUESTS: QUESTS_DEFS,
  };
}
