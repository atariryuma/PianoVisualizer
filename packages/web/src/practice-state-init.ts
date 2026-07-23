// Initial practice + prefs state — Phase 0d batch 72.
//
// Two pure-data literals moved verbatim out of legacy-app.js:
//
//   1. createInitialPrefs() — persisted user preferences
//      (`pianoViz_prefs` localStorage key). Theme + synesthesia +
//      audioOffset auto-detect sentinel + debug overlay flag + UI
//      language.
//
//   2. createInitialPractice(audioOffsetMs) — practice-mode session
//      state. The full literal — including the shell-specific UI
//      fields (enabled / tempoPct / ghostOn / metronomeOn /
//      fullSongMode / handFilter / progress / _completing) that the
//      slimmer @piano/core/state/practice-state.PracticeState
//      doesn't carry. The shell uses this superset because the
//      legacy callsites read those fields directly; folding to the
//      core shape would require a rewrite of every read.

/** Persisted user preferences. Keys mirror legacy-app.js's PrefsShape
 *  JSDoc typedef. */
export interface InitialPrefs {
  theme: number;
  synesthesia: boolean;
  /** null = auto-detect from AudioContext.outputLatency at session
   *  start. A user-saved override is a number in ms. */
  audioOffsetMs: number | null;
  debug: boolean;
  /** UI language. Drives the practice-flow text everywhere. */
  lang: 'en' | 'jp' | 'de';
  /** Note-name notation: 'abc' = C-D-E, 'solfege' = ドレミ, 'auto' =
   *  follow `lang` (pre-0.15 behavior — the zero-regression default). */
  noteNaming: 'auto' | 'abc' | 'solfege';
  /** Practice-audio volume balance, percent 0-100 (100 = tuned default). */
  volGhost: number;
  volBacking: number;
  volMetronome: number;
  /** Show the OSMD sheet-music panel during practice. Default false → the
   *  falling-notes lane is full-height (game-like); 📜 toggles + persists. */
  showScore: boolean;
  /** First-run welcome dismissed (persisted). Optional — absent on cold boot. */
  welcomeDismissed?: boolean;
  /** ノーツ落下速度（先読み倍率）: slow 1.45 / normal 1 / fast 0.7。
   *  判定窓・音は不変 — 視覚の降下速度だけ（音ゲーのハイスピード設定）。 */
  noteSpeed: 'slow' | 'normal' | 'fast';
}

/** Build the cold-start prefs object (before merging the persisted
 *  copy from localStorage). Returns a fresh object each call. */
export function createInitialPrefs(): InitialPrefs {
  return {
    theme: 0,
    synesthesia: false,
    audioOffsetMs: null,
    debug: false,
    lang: 'en',
    noteNaming: 'auto',
    volGhost: 100,
    volBacking: 100,
    volMetronome: 100,
    showScore: false,
    noteSpeed: 'normal',
  };
}

/** Hand filter — null = both, 'L' / 'R' = single hand. Filtered notes
 *  are pre-flagged hit at section start so the cursor auto-skips them. */
export type PracticeHandFilter = 'L' | 'R' | null;

/** Practice-mode session state. Superset of @piano/core's
 *  PracticeState (which is a slim subset for the pure scoring
 *  reducers); the shell adds the UI fields below. */
export interface InitialPracticeState {
  enabled: boolean;
  /** True while an explicit pause (settings panel open / ⏸ button) holds
   *  the session. The practice-tick skips while set so the AudioContext
   *  clock can't drain the section behind a modal. */
  paused: boolean;
  sectionIdx: number;
  /** Tempo as a percentage of the score's notated BPM. 60 / 75 / 90 / 100 —
   *  slower percentages produce a bigger speedFactor in the practice clock. */
  tempoPct: number;
  /** 'guided' = score waits for the kid to play each note. No timeouts,
   *    no auto-playback. Wrong notes get a gentle nudge, never penalty.
   *  'rhythm' = traditional rhythm-game mode that follows tempo strictly.
   *  'listen' = passive playback (no input gating). */
  mode: 'guided' | 'rhythm' | 'listen';
  ghostOn: boolean;
  metronomeOn: boolean;
  /** ループ練習 — ON のあいだセクション完了時に結果カードを出さず同じ
   *  セクションを再スタートする（子ども発のトグル。banned-list: 強制
   *  反復にしない）。ループ中も練習時間は記録される。 */
  loopOn: boolean;
  /** Listen-only: when true, startPracticeSection builds a timeline that
   *  concatenates every section so the song plays straight through. */
  fullSongMode: boolean;
  /** Single audio-clock reference — locks visuals to Tone.js scheduled
   *  events. elapsed_ms = (Tone.now() - startAudioTime) * 1000. */
  startAudioTime: number;
  /** [{hand, midi, timeMs, durMs, hit, missed}, ...] */
  sectionNotes: unknown[];
  currentNoteIdx: number;
  hits: number;
  misses: number;
  /** 誤打カウント（rhythm × MIDI のみ、practice-scoring が加算）。減点なし —
   *  結果カードに事実として表示 + コンボが切れる（マッシュ耐性）。 */
  extraPresses: number;
  timingScoreSum: number;
  /** Note-length scoring: only filled in rhythm mode. In guided mode
   *  the cursor freezes on the current note so there's no audio clock
   *  to compare against. */
  durationScoreSum: number;
  durationScoredCount: number;
  pendingHolds: Map<number, unknown>;
  sectionCombo: number;
  sectionBestCombo: number;
  handFilter: PracticeHandFilter;
  /** Subtracted from practiceRealElapsedMs so a press timed to the
   *  audible beat scores PERFECT. Set in startPracticeSection from
   *  AudioContext.outputLatency, or from the user's saved override
   *  (prefs.audioOffsetMs) if they've adjusted the slider. */
  audioOffsetMs: number;
  progress: unknown;
  _completing: boolean;
  /** セクション完了の 600ms 猶予タイマー。practice-tick が arm、
   *  practice-flow（quit）と start-practice-section（再入）が回収する。
   *  hidden-class 安定化と型検査のため初期状態で宣言しておく。 */
  _completionTimer: ReturnType<typeof setTimeout> | null;
  _lastProgUpdate: number;
  /** Dynamically attached at section start by start-practice-section.ts
   *  — pre-declare here so a write doesn't trigger a V8 hidden-class
   *  transition mid-session, and so TypeScript doesn't complain when
   *  the read sites under JSDoc check this field. */
  _sectionTargetCount?: number;
  /** Last-result snapshot stashed by result-card. Same hidden-class /
   *  optional-read rationale as `_sectionTargetCount`. The shape mirrors
   *  result-card.ts internal layout but is left loose here because the
   *  shell reads multiple slices (mode, secId, stars, accuracy, ...)
   *  from different code paths. */
  _lastResult?: Record<string, unknown> | null;
}

/** Build the cold-start practice state. The `audioOffsetMs` arg lets
 *  the shell seed the saved-override value — pass
 *  `prefs.audioOffsetMs ?? DEFAULT_AUDIO_OFFSET_MS`. */
export function createInitialPractice(audioOffsetMs: number): InitialPracticeState {
  return {
    enabled: false,
    paused: false,
    sectionIdx: 0,
    tempoPct: 60,
    mode: 'guided',
    ghostOn: false,
    metronomeOn: false,
    loopOn: false,
    fullSongMode: false,
    startAudioTime: 0,
    sectionNotes: [],
    currentNoteIdx: 0,
    hits: 0,
    misses: 0,
    extraPresses: 0,
    timingScoreSum: 0,
    durationScoreSum: 0,
    durationScoredCount: 0,
    pendingHolds: new Map(),
    sectionCombo: 0,
    sectionBestCombo: 0,
    handFilter: null,
    audioOffsetMs,
    progress: null,
    _completing: false,
    _completionTimer: null,
    _lastProgUpdate: 0,
  };
}
