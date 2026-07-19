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
  /** Render-tick deps — practiceTick uses getOsmd + the live midiInput.
   *  Getter so the practice cluster can be built before ShellMidi (which
   *  has back-references the other way). */
  getOsmd: () => any;
  getMidiInput: () => any;
  /** Live midiState — cleared at section start so a prior session's
   *  keyboard residue (held keys, sustain, recent chord) doesn't bleed
   *  into the new section. Getter thunk so the practice cluster can
   *  be built before ShellMidiHandlers (which owns midiState). */
  getMidiState: () => any;
  /** Hit-feedback + visual spawners. */
  showHitChip: (kind: string, text: string) => void;
  spawnBurst: any;
  getScreen: () => { W: number; H: number };
  /** Prefs persistence — practiceProgress writes through this. */
  prefsStore: any;
  /** Section-complete trigger — assigned after createResultCard. */
  getCompletePracticeSection: () => () => void;
}

export interface ShellPractice {
  /** Practice state object — mutable; passed into many other deps. */
  practice: InitialPracticeState;
  /** COUNT_IN_MS / LANE_LOOKAHEAD_MS — read by PracticeLane + render-loop builders. */
  getCountInMs: () => number;
  getLaneLookaheadMs: () => number;
  /** practice-timings forwarders. */
  practiceBeatMs: () => number;
  recomputePracticeTimings: () => void;
  showSectionBanner: (sec: any) => void;
  /** practice-scoring forwarders. */
  matchNoteOnset: (midi: number, isExact: boolean) => any;
  finalizeNoteHold: (midi: number) => void;
  practiceElapsedMs: () => number;
  practiceRealElapsedMs: () => number;
  /** practice-progress forwarders. */
  loadPracticeProgress: () => any;
  savePracticeProgress: () => void;
  songProg: () => any;
  recordPracticeDay: () => void;
  /** Tone.js audio + start/stop. */
  startPracticeSection: (sectionIdx: number) => Promise<void>;
  stopPracticeAudio: () => void;
  /** Per-frame practice tick — invoked from the render-loop builder. */
  updatePractice: (...args: any[]) => any;
  /** Hot-path bilingual note-name helpers. */
  midiToPitchName: (midi: number) => string;
  midiToName: (midi: number) => string;
  /** langchange refresh — re-reads activeNoteNames + lane labels. */
  refreshLangCaches: () => void;
  /** Setter so SelectSong can register a new "lane" reference. */
  setPracticeLane: (lane: any) => void;
  /** Late-bound deps the practice-tick needs (resolves at fire time). */
  practiceLaneRef: { current: any };
}

export function createShellPractice(deps: ShellPracticeDeps): ShellPractice {
  const { state, prefs, config, t, dom } = deps;

  let COUNT_IN_MS = 4000; // pre-roll before the first note (4 beats)
  let COUNT_IN_BEATS = 4; // number of count-in clicks (tempo-derived)
  let LANE_LOOKAHEAD_MS = 4000; // how far ahead notes appear in the lane
  /** Practice-lane back-reference — set by SelectSong / passed back here so
   *  practice-timings.recomputePracticeTimings can refresh per-frame opts. */
  const practiceLaneRef: { current: any } = { current: null };

  const practice = PracticeStateInit.createInitialPractice(
    prefs.audioOffsetMs != null ? prefs.audioOffsetMs : deps.defaultAudioOffsetMs
  );

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
    setLaneLookaheadMs: (ms: number) => {
      LANE_LOOKAHEAD_MS = ms;
    },
    getPracticeLane: () => practiceLaneRef.current,
    sectionBannerEl: dom.sectionBanner,
    t,
  } as any);

  const _practiceScoring = PracticeScoring.createPracticeScoring({
    state,
    practice,
    tuning: {
      hitWindowEarlyMs: PianoCore.HIT_WINDOW_EARLY_MS,
      hitWindowMs: PianoCore.HIT_WINDOW_MS,
      perfectMs: PianoCore.PERFECT_MS,
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
  } as any);

  // Hot-path bilingual cache — refreshed on langchange so per-frame lane draw
  // doesn't re-evaluate the prefs.lang ternary 25× per frame.
  const NOTE_NAMES_JP = CoreOpts.NOTE_NAMES_JP;
  let activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : config.NOTE_NAMES;
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
      // Mic mode = no MIDI keyboard attached. Chords relax to their top
      // note so the single-pitch detector can't rack up structural misses.
      micMode: !deps.getMidiInput().enabled,
    }) as any;
  const buildSectionNotes = (sectionIdx: number) =>
    SectionNotes.buildSectionNotes(sectionIdx, _sectionNotesArgs());
  const buildFullSongNotes = () => SectionNotes.buildFullSongNotes(_sectionNotesArgs());
  const buildBackingNotes = (sectionIdx: number | null) =>
    SectionNotes.buildBackingNotes(sectionIdx, _sectionNotesArgs());
  const computeHandRanges = (sectionNotes: any[]) => SectionNotes.computeHandRanges(sectionNotes);

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
    dom: DomBag.pickDom(
      dom,
      'ptbSection',
      'ptbTempo',
      'ptbProgress',
      'practiceHud',
      'osmdContainer'
    ) as any,
    loadCurrentScore: deps.loadCurrentScore,
    recomputePracticeTimings: () => _practiceTimings.recomputePracticeTimings(),
    buildSectionNotes,
    buildFullSongNotes,
    buildBackingNotes,
    computeHandRanges: computeHandRanges as any,
    osmdAdapter: deps.osmdAdapter,
    Tone: deps.Tone,
    ensureToneInstruments: () => _practiceToneAudio.ensureInstruments(),
    scheduleCountInBeeps: (t: number) => _practiceToneAudio.scheduleCountIn(t),
    audioScheduler: deps.audioScheduler,
    getInstruments: () => _practiceToneAudio.getInstruments(),
    practiceBeatMs: () => _practiceTimings.practiceBeatMs(),
    pickAudioOffsetMs: PianoCore.pickAudioOffsetMs,
  } as any);

  const startPracticeSection = async (sectionIdx: number) => {
    await _startPracticeSection(sectionIdx);
    // Remember this song's settings so re-selecting it restores tempo /
    // hand / mode instead of resetting to guided (P2-20). Best-effort.
    try {
      const song = deps.getCurrentSong();
      if (song?.id) {
        const sp = _practiceProgress.songProg(song.id);
        sp.lastSettings = {
          mode: practice.mode,
          tempoPct: practice.tempoPct,
          handFilter: practice.handFilter,
        };
        _practiceProgress.save();
      }
    } catch {
      /* persistence is non-critical — never block the section start */
    }
  };
  const stopPracticeAudio = () => _practiceToneAudio.stopPracticeAudio();

  const updatePractice = PracticeTick.createPracticeTick({
    dom: { ptbProgress: dom.ptbProgress },
    practice,
    // Live wrapper — practice-tick reads `midiInput.enabled` at tick time.
    midiInput: {
      get enabled() {
        return deps.getMidiInput().enabled;
      },
    } as any,
    getOsmd: deps.getOsmd,
    practiceElapsedMs: () => _practiceScoring.practiceElapsedMs(),
    hitWindowMs: PianoCore.HIT_WINDOW_MS,
    medianRecentPitch: () => _practiceScoring.medianRecentPitch(),
    matchNoteOnset: (m: number, exact: boolean) => _practiceScoring.matchNoteOnset(m, exact),
    showHitChip: deps.showHitChip,
    t,
    completePracticeSection: () => deps.getCompletePracticeSection()(),
    remoteLogEnabled: deps.remoteLogEnabled,
    remoteLog: deps.remoteLog,
    noteStateLabel: n_state,
  } as any);

  return {
    practice,
    getCountInMs: () => COUNT_IN_MS,
    getLaneLookaheadMs: () => LANE_LOOKAHEAD_MS,
    practiceBeatMs: () => _practiceTimings.practiceBeatMs(),
    recomputePracticeTimings: () => _practiceTimings.recomputePracticeTimings(),
    showSectionBanner: (sec: any) => _practiceTimings.showSectionBanner(sec),
    matchNoteOnset: (m: number, isExact: boolean) => _practiceScoring.matchNoteOnset(m, isExact),
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
    midiToPitchName,
    midiToName,
    refreshLangCaches: () => {
      activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : config.NOTE_NAMES;
    },
    setPracticeLane: (lane: any) => {
      practiceLaneRef.current = lane;
    },
    practiceLaneRef,
  };
}
