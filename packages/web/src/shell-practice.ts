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
  state: any;
  prefs: any;
  config: any;
  ctx: CanvasRenderingContext2D;
  /** Mutable in the shell — getter so renames mid-session pick up. */
  getCurrentSong: () => any;
  dom: any;
  defaultAudioOffsetMs: number;
  remoteLogEnabled: boolean;
  remoteLog: (msg: any) => void;
  t: (key: string, vars?: any) => string;
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
  /** Hit-feedback + visual spawners. */
  showHitChip: (kind: any, text: any) => void;
  spawnBurst: any;
  getScreen: () => { W: number; H: number };
  /** Prefs persistence — practiceProgress writes through this. */
  prefsStore: any;
  /** Section-complete trigger — assigned after createResultCard. */
  getCompletePracticeSection: () => () => void;
}

export interface ShellPractice {
  /** Practice state object — mutable; passed into many other deps. */
  practice: any;
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
  const PianoCore: any = (globalThis as any).PianoCore;

  let COUNT_IN_MS = 4000; // pre-roll before the first note (4 beats)
  let LANE_LOOKAHEAD_MS = 4000; // how far ahead notes appear in the lane
  /** Practice-lane back-reference — set by SelectSong / passed back here so
   *  practice-timings.recomputePracticeTimings can refresh per-frame opts. */
  const practiceLaneRef: { current: any } = { current: null };

  const practice: any = PracticeStateInit.createInitialPractice(
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
      countInMs: COUNT_IN_MS,
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
    }) as any;
  const buildSectionNotes = (sectionIdx: number) =>
    SectionNotes.buildSectionNotes(sectionIdx, _sectionNotesArgs());
  const buildFullSongNotes = () => SectionNotes.buildFullSongNotes(_sectionNotesArgs());
  const computeHandRanges = (sectionNotes: any[]) => SectionNotes.computeHandRanges(sectionNotes);

  const _startPracticeSection = StartPracticeSection.createStartPracticeSection({
    state,
    practice,
    prefs,
    getCurrentSong: deps.getCurrentSong,
    countInMs: () => COUNT_IN_MS,
    defaultAudioOffsetMs: deps.defaultAudioOffsetMs,
    remoteLogEnabled: deps.remoteLogEnabled,
    alert: (msg: any) => alert(msg),
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
