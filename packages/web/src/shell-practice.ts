// Practice shell — Phase 0d batch 107.
//
// Bundles the practice-mode core: timings + scoring + progress +
// Tone.js audio + section-build helpers + the per-frame practice tick.
// Returns the public surface that the rest of the shell calls
// (startPracticeSection / stopPracticeAudio / updatePractice / song-progress
// hooks / audio-offset rescue, etc.).
//
// The interconnect is tight: PracticeScoring needs the same
// COUNT_IN_MS that PracticeTimings owns; StartPracticeSection needs
// scoring + tone-audio + recomputeTimings; PracticeTick needs the
// scoring's medianRecentPitch + matchNoteOnset.

import type { InitialGameState } from './game-state-init';
import type { InitialPrefs, InitialPracticeState } from './practice-state-init';
import type { PianoConfig } from './piano-config';
import * as PianoCore from '@piano/core';
import * as PracticeTimings from './practice-timings';
import * as PracticeScoring from './practice-scoring';
import * as PracticeProgress from './practice-progress';
import * as PracticeToneAudio from './practice-tone-audio';
import * as SectionNotes from './section-notes';
import * as StartPracticeSection from './start-practice-section';
import * as PracticeTick from './practice-tick';
import * as ShellHelpers from './shell-helpers';
import * as DomBag from './dom-bag';
import * as CoreOpts from './core-opts';
import * as PracticeStateInit from './practice-state-init';
import * as NativeMidiPolyfill from './native-midi-polyfill';

export interface ShellPracticeDeps {
  state: InitialGameState;
  prefs: InitialPrefs;
  config: PianoConfig;
  ctx: CanvasRenderingContext2D;
  /** Mutable in the shell — getter so renames mid-session pick up. */
  getCurrentSong: () => any;
  dom: DomBag.DomBag;
  defaultAudioOffsetMs: number;
  remoteLogEnabled: boolean;
  remoteLog: (msg: string | object) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Shared shell helpers — wake-lock, layout, etc. */
  hideIntroHint: () => void;
  syncLayout: () => void;
  setInputIndicator: () => void;
  requestWakeLock: () => Promise<unknown>;
  /** Audio + OSMD shells. */
  audioScheduler: any;
  Tone: any;
  loadCurrentScore: () => Promise<void>;
  osmdAdapter: any;
  /** Render-tick deps — practiceTick uses getOsmd.
   *  Getter so the practice cluster can be built before ShellMidi (which
   *  has back-references the other way). */
  getOsmd: () => any;
  /** Is MIDI the input that drives scoring + visuals? (prefs.inputSource ×
   *  a port being attached — ShellMidi.isMidiActive.) Never captured: the
   *  setting and the hardware both change mid-section, and both move the
   *  judgement windows. */
  isMidiActive: () => boolean;
  /** Live midiState — cleared at section start so a prior session's
   *  keyboard residue (held keys, sustain, recent chord) doesn't bleed
   *  into the new section. Getter thunk so the practice cluster can
   *  be built before ShellMidiHandlers (which owns midiState). */
  getMidiState: () => any;
  /** Hit-feedback + visual spawners. */
  showHitChip: (kind: string, text: string, xPx?: number, yPx?: number) => void;
  spawnBurst: any;
  /** Expanding-ring pulse at a note's key (clean-hit pop + length-OK cue). */
  spawnRipple?: (x: number, y: number, color: string, radius: number) => void;
  /** Rising light stream on clean hits — free-play visual parity. */
  spawnStream?: (x: number, y: number, energy: number, color?: string) => void;
  /** MIDI → note colour (synesthesia/theme — same palette as free play). */
  noteColor?: (midi: number) => string;
  getScreen: () => { W: number; H: number };
  /** Prefs persistence — practiceProgress writes through this. */
  prefsStore: any;
  /** Section-complete trigger — assigned after createResultCard. */
  getCompletePracticeSection: () => () => void;
  /** 練習時間の記録（P2-19 の bootstrap 実装）。ループ周回の完了でも
   *  呼べるように optional で受ける。 */
  recordPracticeMinutes?: () => void;
  /** 明示ポーズラッチの解除（shell-midi の resumePractice）。セクション
   *  開始時に必ず呼び、猶予中ポーズで残ったラッチを回収する。 */
  clearPracticePause?: () => void;
}

export interface ShellPractice {
  /** Practice state object — mutable; passed into many other deps. */
  practice: InitialPracticeState;
  /** COUNT_IN_MS / LANE_LOOKAHEAD_MS — read by PracticeLane + render-loop builders. */
  getCountInMs: () => number;
  getLaneLookaheadMs: () => number;
  /** practice-timings forwarders. */
  practiceBeatMs: () => number;
  recomputePracticeTimings: (sectionIdx?: number) => void;
  showSectionBanner: (sec: any) => void;
  /** practice-scoring forwarders.
   *  P1-11: inputLagMs は MIDI event.timeStamp 由来の per-event 遅延。 */
  matchNoteOnset: (midi: number, isExact: boolean, inputLagMs?: number) => any;
  finalizeNoteHold: (midi: number) => void;
  practiceElapsedMs: () => number;
  practiceRealElapsedMs: () => number;
  /** practice-progress forwarders. */
  loadPracticeProgress: () => any;
  savePracticeProgress: () => void;
  songProg: () => any;
  recordPracticeDay: () => void;
  /** Tone.js audio + start/stop. opts.lapLead = ループ周回の短縮リードイン。 */
  startPracticeSection: (sectionIdx: number, opts?: { lapLead?: boolean }) => Promise<void>;
  stopPracticeAudio: () => void;
  /** Per-frame practice tick — invoked from the render-loop builder. */
  updatePractice: (...args: any[]) => any;
  /** Hot-path bilingual note-name helpers. */
  midiToPitchName: (midi: number) => string;
  midiToName: (midi: number) => string;
  /** langchange refresh — re-reads activeNoteNames + lane labels. */
  refreshLangCaches: () => void;
  /** Live note-name table (notation prefs + lang resolved). */
  getActiveNoteNames: () => readonly string[];
  /** Re-apply the prefs volume balance to live practice synths. */
  applyToneVolumes: () => void;
  /** 音量スライダー調整時のプレビュー発音（該当層を1発鳴らす）。 */
  previewToneVolume: (layer: 'ghost' | 'backing' | 'metronome') => void;
  /** SE（最小版）: スタンプ獲得時の控えめな祝福音（結果画面）。 */
  playStampCelebration: () => void;
  /** 1曲チャレンジ・クリアの節目ファンファーレ（結果画面）。 */
  playSongClear: () => void;
  /** レイテンシ較正 (P2-22) 用の楽器アクセサ。 */
  ensureToneInstruments: () => void;
  getToneInstruments: () => { piano: any; metronome: any; melody: any };
  /** Judgement windows currently in force (active input path × strictness).
   *  The lane reads this every frame so the drawn bands always match what the
   *  scoring will actually apply. */
  getJudgeProfile: () => PianoCore.JudgeProfile;
  /** Setter so SelectSong can register a new "lane" reference. */
  setPracticeLane: (lane: any) => void;
  /** Late-bound deps the practice-tick needs (resolves at fire time). */
  practiceLaneRef: { current: any };
}

export function createShellPractice(deps: ShellPracticeDeps): ShellPractice {
  const { state, prefs, config, t, dom } = deps;

  let COUNT_IN_MS = 4000; // pre-roll before the first note (4 beats)
  let COUNT_IN_BEATS = 4; // number of count-in clicks (tempo-derived)
  let COUNT_IN_CLICK_MS = 1000; // クリック間隔（複合拍子は付点四分）
  let COUNT_IN_GO_MS = 4000; // GO（ダウンビート）時刻 — 弱起で countIn より後ろ
  let LANE_LOOKAHEAD_MS = 4000; // how far ahead notes appear in the lane
  /** Practice-lane back-reference — set by SelectSong / passed back here so
   *  practice-timings.recomputePracticeTimings can refresh per-frame opts. */
  const practiceLaneRef: { current: any } = { current: null };

  const practice = PracticeStateInit.createInitialPractice(
    prefs.audioOffsetMs != null ? prefs.audioOffsetMs : deps.defaultAudioOffsetMs
  );

  /** Judgement windows currently in force: the active input path's profile
   *  scaled by the player's strictness setting. Never captured — a keyboard can
   *  be hot-plugged and the setting changed mid-section, and the auto-miss
   *  deadline plus the lane's drawn bands must both follow, or the game shows
   *  one contract and applies another.
   *
   *  Memoized on the strictness, because `resolveJudgeProfile` allocates a fresh
   *  object at any scale other than 1× and there are THREE per-frame readers
   *  (the tick's deadline, the lane's bands, the scoring's per-event profile) —
   *  that was ~180 short-lived objects a second on easy/strict for a value that
   *  only changes when the player touches the setting. */
  let _jpStrictness: PianoCore.JudgeStrictness | null = null;
  let _jpMidi: PianoCore.JudgeProfile | null = null;
  let _jpMic: PianoCore.JudgeProfile | null = null;
  function judgeProfileFor(isExactInput: boolean): PianoCore.JudgeProfile {
    const strictness = prefs.judgeStrictness;
    if (_jpStrictness !== strictness || !_jpMidi || !_jpMic) {
      _jpStrictness = strictness;
      _jpMidi = PianoCore.resolveJudgeProfile(true, strictness);
      _jpMic = PianoCore.resolveJudgeProfile(false, strictness);
    }
    return isExactInput ? _jpMidi : _jpMic;
  }
  const activeJudgeProfile = (): PianoCore.JudgeProfile => judgeProfileFor(deps.isMidiActive());

  const _practiceTimings = PracticeTimings.createPracticeTimings({
    getPractice: () => practice,
    getCurrentSong: deps.getCurrentSong,
    fns: {
      practiceBeatMs: PianoCore.practiceBeatMs,
      computePracticeTimings: PianoCore.computePracticeTimings,
    },
    setCountInMs: (ms: number) => {
      COUNT_IN_MS = ms;
    },
    setCountInBeats: (n: number) => {
      COUNT_IN_BEATS = n;
    },
    setCountInClickMs: (ms: number) => {
      COUNT_IN_CLICK_MS = ms;
    },
    setCountInGoMs: (ms: number) => {
      COUNT_IN_GO_MS = ms;
    },
    setLaneLookaheadMs: (ms: number) => {
      LANE_LOOKAHEAD_MS = ms;
    },
    getPracticeLane: () => practiceLaneRef.current,
    // A3: ノーツ速度（先読み時間）3段階 — 設定パネルの prefs.noteSpeed。
    // slow はゆっくり降りて読みやすく、fast はキビキビ落ちる。
    getNoteSpeedMult: () =>
      prefs.noteSpeed === 'slow' ? 1.45 : prefs.noteSpeed === 'fast' ? 0.7 : 1,
    sectionBannerEl: dom.sectionBanner,
    sectionBannerHintEl: dom.sectionBannerHint,
    t,
  } as any);

  // MIDI → key x, so per-note effects + verdict chips land under the pressed
  // key (shared by scoring hits and the practice-tick's auto-miss chip).
  const noteScreenX = (midi: number): number =>
    ((midi - config.PIANO_KEY_MIN) / config.PIANO_KEY_COUNT) * deps.getScreen().W;

  const _practiceScoring = PracticeScoring.createPracticeScoring({
    state,
    practice,
    tuning: {
      // 判定窓は入力パスごと（MIDI は sample 正確、マイクは ±30-40ms の
      // 検出ジッタ）× ユーザーが選ぶ厳しさ。matchNoteOnset が isExact で
      // 毎イベント選ぶので、getter で都度解決する（設定を即時反映 +
      // セクション途中のホットプラグにも追従）。
      get judgeMidi() {
        return judgeProfileFor(true);
      },
      get judgeMic() {
        return judgeProfileFor(false);
      },
      chordMateToleranceMs: PianoCore.CHORD_MATE_TOLERANCE_MS,
      durationMinTolMs: PianoCore.DURATION_MIN_TOL_MS,
      durationTolFraction: PianoCore.DURATION_TOL_FRACTION,
      micInputLatencyMs: PianoCore.MIC_INPUT_LATENCY_MS,
      // getter で渡す — recomputePracticeTimings がテンポ変更のたびに
      // COUNT_IN_MS を更新するので、値渡しだと初期値 4000ms に固定され
      // guided のクロック凍結境界・早押しゲートが実カウントインとズレる。
      get countInMs() {
        return COUNT_IN_MS;
      },
    },
    Tone: deps.Tone,
    showHitChip: deps.showHitChip,
    spawnBurst: deps.spawnBurst,
    spawnRipple: deps.spawnRipple,
    spawnStream: deps.spawnStream,
    noteColor: deps.noteColor,
    noteScreenX,
    getScreen: deps.getScreen,
    t,
    midiToName,
    remoteLog: deps.remoteLog,
  } as any);

  const _practiceProgress = PracticeProgress.createPracticeProgress({
    storage: deps.prefsStore,
    core: {
      migrateAndDefaultProgress: PianoCore.migrateAndDefaultProgress,
      getSongProgress: PianoCore.getSongProgress,
      recordPracticeDay: PianoCore.recordPracticeDay,
      formatDateKey: PianoCore.formatDateKey,
    },
    practice,
  } as any);

  const _practiceToneAudio = PracticeToneAudio.createPracticeToneAudio({
    Tone: deps.Tone,
    audioScheduler: deps.audioScheduler,
    cursor: deps.osmdAdapter,
    getCountInMs: () => COUNT_IN_MS,
    getCountInBeats: () => COUNT_IN_BEATS,
    // クリック列アンカー（拍子・弱起対応）— guided / rhythm / listen の
    // カウントインが全部同じ列で数えるための貫通口。
    getCountInClickMs: () => COUNT_IN_CLICK_MS,
    getCountInGoMs: () => COUNT_IN_GO_MS,
    // 設定パネルの音量バランス（%）。ensureInstruments / applyVolumes が
    // 都度読むので、スライダー変更が次の発音から（ライブ適用時は即時）効く。
    getVolumes: () => ({
      ghost: prefs.volGhost,
      backing: prefs.volBacking,
      metronome: prefs.volMetronome,
    }),
  } as any);

  // Hot-path notation cache — refreshed on langchange / noteNaming change so
  // the per-frame lane draw doesn't re-evaluate the prefs ternary 25× per frame.
  // prefs.noteNaming: 'abc' = C-D-E, 'solfege' = ドレミ, 'auto' = follow lang
  // (the pre-0.15 behavior, and the default).
  const NOTE_NAMES_JP = CoreOpts.NOTE_NAMES_JP;
  function resolveNoteNames(): readonly string[] {
    if (prefs.noteNaming === 'abc') return config.NOTE_NAMES;
    if (prefs.noteNaming === 'solfege') return NOTE_NAMES_JP;
    return prefs.lang === 'jp' ? NOTE_NAMES_JP : config.NOTE_NAMES;
  }
  let activeNoteNames = resolveNoteNames();
  function midiToPitchName(midi: number): string {
    return ShellHelpers.midiToPitchName(midi, activeNoteNames);
  }
  function midiToName(midi: number): string {
    return ShellHelpers.midiToFullName(midi, activeNoteNames);
  }
  const n_state = (n: any) => ShellHelpers.noteStateLabel(n);

  // ── Section build + start ──
  const _sectionNotesArgs = () =>
    ({
      song: deps.getCurrentSong(),
      practice,
      countInMs: COUNT_IN_MS,
      // Mic mode = the mic is the ACTIVE input (no keyboard, or the player
      // pinned the mic). Chords relax to their top note so the single-pitch
      // detector can't rack up structural misses.
      micMode: !deps.isMidiActive(),
    }) as any;
  const buildSectionNotes = (sectionIdx: number) =>
    SectionNotes.buildSectionNotes(sectionIdx, _sectionNotesArgs());
  const buildFullSongNotes = () => SectionNotes.buildFullSongNotes(_sectionNotesArgs());
  const buildBackingNotes = (sectionIdx: number | null) =>
    SectionNotes.buildBackingNotes(sectionIdx, _sectionNotesArgs());
  const computeHandRanges = (sectionNotes: any[]) => SectionNotes.computeHandRanges(sectionNotes);
  // S1: レーンの小節線/拍線グリッド。measureGrid のある曲は正確な小節構造
  // （弱起・複合拍子・拍子変更込み）、無い曲は一様グリッド（beatMs 間隔 +
  // beatsPerMeasure アクセント）で近似 — メトロノームの一様フォールバックと
  // 同じ考え方。テンポ・countIn はノートと同じアンカー。
  const buildLaneBeatGrid = (sectionIdx: number | null) => {
    const fromGrid = SectionNotes.buildLaneBeatGrid(sectionIdx, _sectionNotesArgs());
    if (fromGrid) return fromGrid;
    const song = deps.getCurrentSong();
    const notes = practice.sectionNotes as Array<{ timeMs?: number; durMs?: number }>;
    if (!song || !notes.length) return null;
    const beatMs = _practiceTimings.practiceBeatMs();
    if (!(beatMs > 0)) return null;
    const last = notes[notes.length - 1];
    const endMs = (last.timeMs ?? 0) + (last.durMs ?? 0) + beatMs;
    const beatsPerBar = song.beatsPerMeasure && song.beatsPerMeasure > 0 ? song.beatsPerMeasure : 4;
    const out: Array<{ timeMs: number; accent: boolean }> = [];
    for (let t = COUNT_IN_MS, beat = 0; t <= endMs; t += beatMs, beat++) {
      out.push({ timeMs: t, accent: beat % beatsPerBar === 0 });
    }
    return out;
  };

  const _startPracticeSection = StartPracticeSection.createStartPracticeSection({
    state,
    practice,
    prefs,
    getCurrentSong: deps.getCurrentSong,
    // Live midiState proxy — forward the four mutable refs +
    // recentOnsets so start-practice-section can clear them at
    // section-start parity with ptbQuit.
    midiState: {
      get activeNotes() {
        return deps.getMidiState().activeNotes;
      },
      get sustainedNotes() {
        return deps.getMidiState().sustainedNotes;
      },
      get recentOnsets() {
        return deps.getMidiState().recentOnsets;
      },
      get lastChordName() {
        return deps.getMidiState().lastChordName;
      },
      set lastChordName(v: string) {
        deps.getMidiState().lastChordName = v;
      },
      get lastChordTimeMs() {
        return deps.getMidiState().lastChordTimeMs;
      },
      set lastChordTimeMs(v: number) {
        deps.getMidiState().lastChordTimeMs = v;
      },
    } as any,
    countInMs: () => COUNT_IN_MS,
    // B2: ループ周回の短縮リードイン（残り2クリック）の計算用。
    countInClickMs: () => COUNT_IN_CLICK_MS,
    defaultAudioOffsetMs: deps.defaultAudioOffsetMs,
    remoteLogEnabled: deps.remoteLogEnabled,
    alert: (msg: string) => alert(msg),
    remoteLog: deps.remoteLog,
    t,
    hideIntroHint: deps.hideIntroHint,
    syncLayout: deps.syncLayout,
    setInputIndicator: deps.setInputIndicator,
    requestWakeLock: deps.requestWakeLock,
    showSectionBanner: (sec: any) => _practiceTimings.showSectionBanner(sec),
    dom: {
      ...DomBag.pickDom(
        dom,
        'ptbSection',
        'ptbTempo',
        'ptbProgress',
        'practiceHud',
        'osmdContainer'
      ),
      // 進捗バー（B1）— 旧 DOM には無いので optional 直参照。
      ptbProgressFill: dom.ptbProgressFill,
    } as any,
    loadCurrentScore: deps.loadCurrentScore,
    // sectionIdx を貫通させる — start 時は practice.sectionIdx がまだ
    // 旧セクションを指しているため、開始セクションの拍子/弱起アンカーを
    // 正しく解決するには明示引数が必要。
    recomputePracticeTimings: (sectionIdx?: number) =>
      _practiceTimings.recomputePracticeTimings(sectionIdx),
    buildSectionNotes,
    buildFullSongNotes,
    buildBackingNotes,
    // S1: 小節線/拍線グリッド — セクション開始時にレーンへ差し替え。
    buildLaneBeatGrid,
    setLaneBeatGrid: (events: Array<{ timeMs: number; accent: boolean }> | null) =>
      practiceLaneRef.current?.setBeatGrid?.(events),
    // 判定カウンタ + 誤差リングを in-place で 0 に（同一オブジェクトを使い回す）。
    // OS 実測の出力遅延（AVAudioSession）。ブリッジは非同期なので、直近の
    // 解決値をここから同期で返しつつ、同時に次回用の再読込を仕掛ける
    // （セッション中に AirPods が繋がると経路が変わるため）。
    // 経路（A2DP / 内蔵スピーカー / ヘッドフォン）が変わると値も変わるので
    // キャッシュせず毎回読む。以前はキャッシュ + 読み取り時に非同期更新という
    // 形で、返る値が常に「前回のセクションの経路」だった。
    getNativeAudioLatencyMs: async () => {
      const r = await NativeMidiPolyfill.readNativeAudioLatency();
      return r ? r.outMs : null;
    },
    resetJudgeTally: () => {
      PianoCore.resetJudgeTally(practice.judge);
      PianoCore.resetJudgeErrorRing(practice.judgeErrors);
    },
    computeHandRanges: computeHandRanges as any,
    osmdAdapter: deps.osmdAdapter,
    Tone: deps.Tone,
    ensureToneInstruments: () => _practiceToneAudio.ensureInstruments(),
    scheduleCountInBeeps: (t: number) => _practiceToneAudio.scheduleCountIn(t),
    // scheduleSectionPlayback をラップし、小節グリッド由来のメトロノーム
    // クリック列（buildMetronomeEvents）を注入する。呼び出し時点で
    // practice.sectionIdx / fullSongMode は start-practice-section が
    // 更新済み。グリッドの無い曲は null → scheduler 側が従来の一様
    // ループへフォールバック（回帰ゼロ）。
    audioScheduler: {
      scheduleSectionPlayback: (instruments: any, opts: any) => {
        // 全曲ターゲット（listen 通し + guided/rhythm の 1曲チャレンジ）は
        // メトロノーム列も全曲グリッドから合成する。
        const isFullSong = !!practice.fullSongMode;
        const metronomeEvents = SectionNotes.buildMetronomeEvents(
          isFullSong ? null : practice.sectionIdx,
          _sectionNotesArgs()
        );
        deps.audioScheduler.scheduleSectionPlayback(instruments, {
          ...opts,
          metronomeEvents,
        });
      },
    },
    getInstruments: () => _practiceToneAudio.getInstruments(),
    practiceBeatMs: () => _practiceTimings.practiceBeatMs(),
    clearPracticePause: deps.clearPracticePause,
    pickAudioOffsetMs: PianoCore.pickAudioOffsetMs,
    // C3: audio couldn't start — degraded (silent) but still playable. Tell
    // the kid with a gentle chip instead of failing silently.
    onAudioStartFailed: () => deps.showHitChip('miss', t('audioStartWarn')),
    // H1: no playable notes (usually a one-hand filter over a passage that
    // hand doesn't play). Explain why Start did nothing instead of stranding
    // them on the song panel with a dead button.
    onNoPlayableNotes: (handFilter: 'L' | 'R' | null) =>
      alert(t(handFilter ? 'noPlayableNotesHand' : 'noPlayableNotes')),
  } as any);

  const startPracticeSection = async (sectionIdx: number, opts?: { lapLead?: boolean }) => {
    await _startPracticeSection(sectionIdx, opts);
    // Remember this song's settings so re-selecting it restores tempo /
    // hand / mode instead of resetting to guided (P2-20). Best-effort.
    // Listen is a one-off "just hear it" action, not a practice setting —
    // don't persist it, or re-selecting the song would drop the kid into
    // listen mode instead of ready-to-play.
    try {
      const song = deps.getCurrentSong();
      if (song?.id && practice.mode !== 'listen') {
        const sp = _practiceProgress.songProg(song.id);
        sp.lastSettings = {
          mode: practice.mode,
          tempoPct: practice.tempoPct,
          handFilter: practice.handFilter,
          // A5: ゴースト/メトロノームも記憶 — 業界標準の「前回の設定を
          // 覚えている」を練習トグル全体に揃える（loop は周回挙動なので除外）。
          ghostOn: practice.ghostOn,
          metronomeOn: practice.metronomeOn,
        };
        // J6: 「▶ 続きから」用に最後に練習した曲を覚える（listen は除外 —
        // 「ちょっと聴いただけ」は続きの対象ではない）。
        const prog = practice.progress as { lastSongId?: string } | null;
        if (prog) prog.lastSongId = song.id;
        _practiceProgress.save();
      }
    } catch {
      /* persistence is non-critical — never block the section start */
    }
  };
  const stopPracticeAudio = () => _practiceToneAudio.stopPracticeAudio();

  const updatePractice = PracticeTick.createPracticeTick({
    dom: { ptbProgress: dom.ptbProgress, ptbProgressFill: dom.ptbProgressFill },
    practice,
    // 採点入力が MIDI かどうかは毎 tick 解決する（設定変更・ホットプラグに追従）。
    isMidiActive: deps.isMidiActive,
    getOsmd: deps.getOsmd,
    practiceElapsedMs: () => _practiceScoring.practiceElapsedMs(),
    // auto-miss の締切も現在の入力パス × 厳しさの窓に合わせる（サンクで毎
    // tick 評価 — セクション中のホットプラグや設定変更で窓が変わるため）。
    getJudgeProfile: activeJudgeProfile,
    medianRecentPitch: () => _practiceScoring.medianRecentPitch(),
    matchNoteOnset: (m: number, exact: boolean) => _practiceScoring.matchNoteOnset(m, exact),
    showHitChip: deps.showHitChip,
    noteScreenX,
    getScreen: deps.getScreen,
    t,
    completePracticeSection: () => deps.getCompletePracticeSection()(),
    // ループ周回: 結果カードは出さないが「1周分の練習時間」は記録してから
    // 同セクションを再スタート（startPracticeSection が startAudioTime を
    // リセットする前に elapsed を読む必要があるため、この順序が重要）。
    restartSectionForLoop: () => {
      deps.recordPracticeMinutes?.();
      // B2: 周回は短縮リードイン（カウントイン後半へスキップ）。
      void startPracticeSection(practice.sectionIdx, { lapLead: true });
    },
    // Guided ヒント音 (P2-14): おともパートと同じ柔らかい sine (-17dB) で
    // 期待音を短く鳴らす。罰・減点は一切なし（banned-list 準拠の支援）。
    playGuidedHint: (midi: number) => {
      try {
        const { melody } = _practiceToneAudio.getInstruments();
        melody?.triggerAttackRelease(440 * Math.pow(2, (midi - 69) / 12), 0.6);
      } catch {
        /* ヒント音はベストエフォート — 練習フローを止めない */
      }
    },
    remoteLogEnabled: deps.remoteLogEnabled,
    remoteLog: deps.remoteLog,
    noteStateLabel: n_state,
  } as any);

  return {
    practice,
    getCountInMs: () => COUNT_IN_MS,
    getLaneLookaheadMs: () => LANE_LOOKAHEAD_MS,
    practiceBeatMs: () => _practiceTimings.practiceBeatMs(),
    recomputePracticeTimings: (sectionIdx?: number) =>
      _practiceTimings.recomputePracticeTimings(sectionIdx),
    showSectionBanner: (sec: any) => _practiceTimings.showSectionBanner(sec),
    // P1-11: MIDI event.timeStamp 由来の per-event 遅延（第3引数）を
    // scoring まで落とさず貫通させる。
    matchNoteOnset: (m: number, isExact: boolean, inputLagMs?: number) =>
      _practiceScoring.matchNoteOnset(m, isExact, inputLagMs),
    finalizeNoteHold: (m: number) => _practiceScoring.finalizeNoteHold(m),
    practiceElapsedMs: () => _practiceScoring.practiceElapsedMs(),
    practiceRealElapsedMs: () => _practiceScoring.practiceRealElapsedMs(),
    loadPracticeProgress: () => _practiceProgress.load(),
    savePracticeProgress: () => _practiceProgress.save(),
    songProg: () => _practiceProgress.songProg(deps.getCurrentSong().id),
    recordPracticeDay: () => _practiceProgress.recordPracticeDay(),
    startPracticeSection,
    stopPracticeAudio,
    updatePractice,
    ensureToneInstruments: () => _practiceToneAudio.ensureInstruments(),
    getToneInstruments: () => _practiceToneAudio.getInstruments(),
    midiToPitchName,
    midiToName,
    refreshLangCaches: () => {
      activeNoteNames = resolveNoteNames();
    },
    /** Live note-name table (lane labels + noteDisplay share it). */
    getActiveNoteNames: () => activeNoteNames,
    /** Re-apply the prefs volume balance to live practice synths. */
    applyToneVolumes: () => _practiceToneAudio.applyVolumes(),
    previewToneVolume: (layer: 'ghost' | 'backing' | 'metronome') =>
      _practiceToneAudio.previewVolume(layer),
    playStampCelebration: () => _practiceToneAudio.playStampCelebration(),
    playSongClear: () => _practiceToneAudio.playSongClear(),
    getJudgeProfile: activeJudgeProfile,
    setPracticeLane: (lane: any) => {
      practiceLaneRef.current = lane;
    },
    practiceLaneRef,
  };
}
