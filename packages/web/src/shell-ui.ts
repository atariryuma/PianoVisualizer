// UI shell — Phase 0d batch 108.
//
// Bundles the user-flow UI cluster: intro-hint + result-card +
// song-panel render+controls + select-song + practice-flow +
// the two boot-session start buttons. These all participate in the
// "title screen → song picker → practice → result → back to title"
// state machine.
//
// Many cross-references between the children (result-card writes
// into `completePracticeSection` / `renderResultCard`; song-panel
// reads `songProg`; practice-flow exposes `returnToTitle` etc.).
// Bundling lets us hide that orchestration behind the public surface.

import * as IntroHintUi from './intro-hint-ui';
import * as ResultCard from './result-card';
import * as SongPanelRender from './song-panel-render';
import * as SongPanelControls from './song-panel-controls';
import * as SelectSong from './select-song';
import * as PracticeFlow from './practice-flow';
import * as BootSession from './boot-session';
import * as DomBag from './dom-bag';

 
export interface ShellUiDeps {
  document: Document;
  songs: any;
  state: any;
  practice: any;
  midiInput: any;
  midiState: any;
  prefs: any;
  config: any;
  /** Mutable currentSong — getter/setter. */
  getCurrentSong: () => any;
  setCurrentSong: (s: any) => void;
  dom: any;
  t: any;
  dateKey: any;
  /** OSMD shell. */
  getOsmd: () => any;
  setOsmd: (o: any) => void;
  clearHighlights: () => void;
  loadCurrentScore: () => Promise<void>;
  /** Practice cluster forwarders. */
  songProg: () => any;
  loadPracticeProgress: () => any;
  savePracticeProgress: () => void;
  recordPracticeDay: () => void;
  startPracticeSection: (sectionIdx: number) => Promise<void>;
  stopPracticeAudio: () => void;
  /** Audio + boot. */
  initAudio: () => Promise<void>;
  initBgStars: () => void;
  loop: (timeMs: number) => void;
  alertAudioInitError: (e: any) => void;
  /** MIDI input forwarders. */
  initWebMIDI: () => Promise<any>;
  startMidiAutoRescan: () => void;
  stopMidiAutoRescan: () => void;
  rescanMidi: (silent?: any) => any;
  /** Misc shell forwarders. */
  releaseWakeLock: () => Promise<unknown>;
  requestWakeLock: () => Promise<unknown>;
  hideIntroHint: () => void;
  resetSession: () => void;
  /** Effects + visual primitives. */
  effectGoldenBurst: any;
  effectStarShower: any;
  effectFlowerBurst: any;
  /** Score helpers. */
  setupHiDPICanvas: (canvas: HTMLCanvasElement, w: number, h: number) => CanvasRenderingContext2D;
  clamp01: (n: number) => number;
  remoteLogEnabled: boolean;
  getHeight: () => number;
  /** byId shorthand — for the `resTryPlay` element pickup. */
  byId: (id: string) => HTMLElement;
}

export interface ShellUi {
  /** showHitChip — invoked from MIDI handlers + score-loader after-load. */
  showHitChip: (kind: any, text: any) => void;
  /** intro-hint-ui forwarders. */
  refreshIntroHint: () => void;
  showRunningUI: () => void;
  hideIntroHint: () => void;
  alertAudioInitError: (e: any) => void;
  /** Result-card forwarders — assigned by the shell into placeholders. */
  renderResultCard: () => void;
  completePracticeSection: () => void;
  /** Song-panel render thunk. */
  renderSongPanel: () => void;
  /** SelectSong + practice-song-btn listener installed via hook. */
  selectSong: (songId: any) => void;
  installPracticeSongButtons: () => void;
  /** PracticeFlow.returnToTitle — assigned to the shell placeholder. */
  returnToTitle: () => void;
  /** Boot start button installers — `installStartButtons(opts)` registers
   *  click handlers on both start buttons. */
  installStartButtons: () => void;
}

export function createShellUi(deps: ShellUiDeps): ShellUi {
  const { document: doc, dom, t } = deps;

  // ── Intro-hint UI + hit feedback chip ──
  const _introHintUi = IntroHintUi.createIntroHintUi({
    dom: DomBag.pickDom(dom, 'introHint', 'startScreen', 'hud', 'micMeter') as any,
    state: deps.state,
    midiInput: deps.midiInput,
    practice: deps.practice,
    t,
    getHeight: deps.getHeight,
    requestWakeLock: () => deps.requestWakeLock(),
    startMidiAutoRescan: deps.startMidiAutoRescan,
    rescanMidi: deps.rescanMidi,
  } as any);

  const showHitChip = (kind: any, text: any) => _introHintUi.showHitChip(kind, text);

  // ── Result-card ──
  const SECTION_IDS = ['A1', 'B', 'A2'];
  const PianoCore: any = (globalThis as any).PianoCore;
  const _resultCard = ResultCard.createResultCard({
    dom: DomBag.pickDom(
      dom,
      'sectionResult',
      'resTitle',
      'resSectionName',
      'resStars',
      'resAcc',
      'resTiming',
      'resDuration',
      'resDurationRow',
      'resCombo',
      'resMsg',
      'resUnlock',
      'resHistoryWrap',
      'resHistoryChart',
      'resNext',
      'resTryPlay'
    ) as any,
    practice: deps.practice,
    getCurrentSong: deps.getCurrentSong,
    songProg: deps.songProg,
    sectionIds: SECTION_IDS,
    stopPracticeAudio: deps.stopPracticeAudio,
    releaseWakeLock: deps.releaseWakeLock as any,
    recordPracticeDay: deps.recordPracticeDay,
    savePracticeProgress: deps.savePracticeProgress,
    computeStars: PianoCore.computeStars,
    resolveResultTier: PianoCore.resolveResultTier,
    computeUnlocks: PianoCore.computeUnlocks,
    effectGoldenBurst: deps.effectGoldenBurst,
    effectStarShower: deps.effectStarShower,
    effectFlowerBurst: deps.effectFlowerBurst,
    setupHiDPICanvas: deps.setupHiDPICanvas,
    clamp01: deps.clamp01,
    t,
    remoteLogEnabled: deps.remoteLogEnabled,
  } as any);

  // ── Song-panel render ──
  const _songPanelRender = SongPanelRender.createSongPanelRender({
    dom: DomBag.pickDom(
      dom,
      'songTitle',
      'songComposer',
      'streakCount',
      'streakCal',
      'songBpmHint',
      'tempoRow',
      'sectionList',
      'ghostToggle',
      'metronomeToggle',
      'ghostRow',
      'metronomeRow',
      'fullSongRow',
      'fullSongToggle',
      'songStart'
    ) as any,
    practice: deps.practice,
    getCurrentSong: deps.getCurrentSong,
    songProg: deps.songProg,
    t,
    dateKey: deps.dateKey,
  } as any);
  const renderSongPanel = _songPanelRender.render;

  // ── Song-panel controls (back button, ghost / metronome / full-song toggles) ──
  let _returnToTitle: () => void = () => {};
  SongPanelControls.createSongPanelControls({
    dom: DomBag.pickDom(dom, 'ghostToggle', 'metronomeToggle', 'fullSongToggle', 'songBack') as any,
    practice: deps.practice,
    renderSongPanel,
    // Thunked so the placeholder-then-reassigned `returnToTitle` reads its
    // live binding at click time (after createPracticeFlow runs below).
    returnToTitle: () => _returnToTitle(),
  } as any);

  // ── Boot — song-start button (▶ Practice) ──
  let _selectSong: any = null;
  BootSession.installSongStartButton(dom.songStart, {
    state: deps.state,
    practice: deps.practice,
    initAudio: deps.initAudio,
    showRunningUI: () => _introHintUi.showRunningUI(),
    initBgStars: deps.initBgStars,
    loop: deps.loop,
    alertAudioInitError: (e: any) => _introHintUi.alertAudioInitError(e),
    startPracticeSection: deps.startPracticeSection,
    songPanel: dom.songPanel,
  } as any);

  // ── SelectSong ──
  _selectSong = SelectSong.createSelectSong({
    songs: deps.songs,
    state: deps.state,
    practice: deps.practice,
    dom: DomBag.pickDom(
      dom,
      'osmdContainer',
      'songTitle',
      'songComposer',
      'startScreen',
      'songPanel',
      'questDisplay'
    ) as any,
    getCurrentSong: deps.getCurrentSong,
    setCurrentSong: deps.setCurrentSong,
    getOsmd: deps.getOsmd,
    setOsmd: deps.setOsmd,
    clearHighlights: deps.clearHighlights,
    t,
    loadPracticeProgress: deps.loadPracticeProgress,
    showRunningUI: () => _introHintUi.showRunningUI(),
    renderSongPanel: () => renderSongPanel(),
    initWebMIDI: () => {
      void deps.initWebMIDI();
    },
    loadCurrentScore: deps.loadCurrentScore,
    remoteLogEnabled: deps.remoteLogEnabled,
  } as any);
  const selectSong = (songId: any) => _selectSong.selectSong(songId);

  // ── PracticeFlow — installed at construction time. returnToTitle is wired
  //   back into the song-panel-controls thunk via _returnToTitle assignment. ──
  const _practiceFlow = PracticeFlow.createPracticeFlow({
    dom: {
      ...DomBag.pickDom(
        dom,
        'ptbQuit',
        'ptbToggleOsmd',
        'resQuit',
        'resRetry',
        'resNext',
        'sumClose',
        'homeBtn',
        'sumHome',
        'resHome',
        'practiceHud',
        'osmdContainer',
        'songPanel',
        'sectionResult',
        'sessionSummary',
        'hud',
        'questDisplay',
        'micMeter',
        'startScreen'
      ),
      resTryPlay: deps.byId('resTryPlay'),
    } as any,
    practice: deps.practice,
    state: deps.state,
    midiState: deps.midiState,
    getCurrentSong: deps.getCurrentSong,
    songProg: deps.songProg,
    startPracticeSection: deps.startPracticeSection,
    renderSongPanel,
    stopPracticeAudio: deps.stopPracticeAudio,
    releaseWakeLock: deps.releaseWakeLock as any,
    hideIntroHint: deps.hideIntroHint,
    stopMidiAutoRescan: deps.stopMidiAutoRescan,
    resetSession: deps.resetSession,
  } as any);
  _returnToTitle = _practiceFlow.returnToTitle;

  return {
    showHitChip,
    refreshIntroHint: () => _introHintUi.refreshIntroHint(),
    showRunningUI: () => _introHintUi.showRunningUI(),
    hideIntroHint: () => _introHintUi.hideIntroHint(),
    alertAudioInitError: (e: any) => _introHintUi.alertAudioInitError(e),
    renderResultCard: () => _resultCard.renderResultCard(),
    completePracticeSection: () => _resultCard.completePracticeSection(),
    renderSongPanel,
    selectSong,
    installPracticeSongButtons: () => {
      doc.querySelectorAll('.practice-song-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-song');
          if (id) selectSong(id);
        });
      });
    },
    returnToTitle: () => _returnToTitle(),
    installStartButtons: () => {
      BootSession.installStartButton(dom.startBtn, {
        state: deps.state,
        practice: deps.practice,
        initAudio: deps.initAudio,
        showRunningUI: () => _introHintUi.showRunningUI(),
        initBgStars: deps.initBgStars,
        loop: deps.loop,
        alertAudioInitError: (e: any) => _introHintUi.alertAudioInitError(e),
      } as any);
    },
  };
}
