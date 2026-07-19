// Bootstrap shell — Phase 0e (legacy-app.js retirement).
//
// Wires the foundational state (RemoteLog / CONFIG / DOM / ctx / state /
// sessionRing / prefs / modalFocus), the forward-decl placeholders
// + ESC modal router, the 17 shell-* factory call sites in the
// correct dependency order, and the post-create init (initial
// practice progress + ▶ Start button).

import * as Tone from 'tone';
import * as PianoCore from '@piano/core';
import * as RemoteLog from './remote-log';
import * as PianoConfig from './piano-config';
import * as DomBag from './dom-bag';
import * as GameStateInit from './game-state-init';
import * as PrefsStorage from './prefs-storage';
import * as PracticeStateInit from './practice-state-init';
import * as ModalFocus from './modal-focus';
import * as PianoWakeLock from './wakelock';
import * as CoreOpts from './core-opts';
import * as AudioScheduler from './audio-scheduler';
import * as BuiltInSongs from './built-in-songs';
import * as RenderFrame from './render-frame';
import * as AudioInit from './audio-init';
import * as ShellHelpers from './shell-helpers';
import * as ShellAudio from './shell-audio';
import * as ShellViewport from './shell-viewport';
import * as ShellI18n from './shell-i18n';
import * as ShellEffects from './shell-effects';
import * as ShellGameUpdate from './shell-game-update';
import * as ShellRenderLoop from './shell-render-loop';
import * as ShellSessionState from './shell-session-state';
import * as ShellUserLibrary from './shell-user-library';
import * as ShellOsmd from './shell-osmd';
import * as ShellPractice from './shell-practice';
import * as ShellMidi from './shell-midi';
import * as ShellSettings from './shell-settings';
import * as ShellMidiHandlers from './shell-midi-handlers';
import * as ShellPracticeLane from './shell-practice-lane';
import * as ShellAddSong from './shell-add-song';
import * as ShellUi from './shell-ui';
import * as ShellDevMode from './shell-dev-mode';

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

export function boot(): void {
  const _remoteLog = RemoteLog.createRemoteLog();
  const REMOTE_LOG_ENABLED = _remoteLog.enabled;
  const remoteLog = (msg: string | object): void => _remoteLog.send(msg);
  RemoteLog.installConsoleForwarding(_remoteLog);

  console.log('App Started: Piano Visualizer');

  const CONFIG = PianoConfig.createPianoConfig();
  const DOM = DomBag.createDomBag(document).bag;
  const ctx = (DOM.canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
  const state = GameStateInit.createInitialGameState();

  // Session-confidence ring buffer — pre-allocated, zero-alloc at runtime.
  const SESSION_RING_CAP = 100;
  const sessionRing = Array.from({ length: SESSION_RING_CAP }, () => ({
    timeMs: 0,
    isPiano: false,
  }));

  // ── Audio shell — moved to packages/web/src/shell-audio.ts (batch 104).
  const _audio = ShellAudio.createShellAudio({
    state,
    config: CONFIG,
    micMeterEl: DOM.micMeter,
    remoteLogEnabled: REMOTE_LOG_ENABLED,
    getPractice: () => practice,
    getMidiInputEnabled: () => midiInput?.enabled ?? false,
    initWebMIDI: () => initWebMIDI(),
    isAppleMobile: () => isAppleMobile(),
    refreshIntroHint: () => refreshIntroHint(),
    stopPracticeAudio: () => stopPracticeAudio(),
  });

  // ── Viewport — moved to packages/web/src/shell-viewport.ts (batch 114).
  const _vp = ShellViewport.createShellViewport({
    canvas: DOM.canvas as HTMLCanvasElement,
    ctx,
    state,
    pianoCore: PianoCore,
    practiceTopBarEl: DOM.practiceTopBar,
    osmdContainerEl: DOM.osmdContainer,
    dom: DomBag.pickDom(DOM, 'practiceTopBar', 'themeBar', 'osmdContainer'),
  });

  // ── Theme switching + persisted user preferences ──
  const prefs = PracticeStateInit.createInitialPrefs();
  const _prefsStore = PrefsStorage.createJSONStore();
  const { loadJSON, saveJSON } = _prefsStore;
  Object.assign(prefs, PrefsStorage.sanitizePrefs(loadJSON('pianoViz_prefs', {})));
  const savePrefs = (): void => saveJSON('pianoViz_prefs', prefs);

  const modalFocus = ModalFocus.createModalFocus({
    document,
    requestAnimationFrame: (cb) => requestAnimationFrame(cb),
  });

  // Forward-decl placeholders — reassigned by createXxx wire-ups further
  // down. Avoids TDZ in ESC handler / langchange / settings-panel deps.
  // openSectionEditor: assigned from _addSong but never read; the user
  // path triggers via the section-editor modal's own button, not from
  // legacy/bootstrap code. Skipped here.
  const _voidStub = (): void => {};
  const _summaryStub = (_animate: boolean): void => {};
  let openSettings: () => void = _voidStub;
  let closeSettings: () => void = _voidStub;
  let refreshSettingsPanel: () => void = _voidStub;
  let closeSectionEditor: () => void = _voidStub;
  let openAddSongModal: () => void = _voidStub;
  let closeAddSongModal: () => void = _voidStub;
  let closeJournalModal: () => void = _voidStub;
  let closePianistEditor: () => void = _voidStub;
  let isPianistEditorOpen: () => boolean = () => false;
  let completePracticeSection: () => void = _voidStub;
  let renderResultCard: () => void = _voidStub;
  let showSessionSummary: () => void = _voidStub;
  let renderSessionSummaryText: (animate: boolean) => void = _summaryStub;
  // ESC modal router — higher priority = topmost-z modal.
  const _isOpen = (x: { modal?: { classList: DOMTokenList } } | null | undefined): boolean =>
    !!x?.modal?.classList.contains('visible');
  const _isVisible = (el: HTMLElement) => !!el?.classList.contains('visible');
  ModalFocus.createEscRouter({
    document,
    routes: [
      { priority: 50, isOpen: () => _isOpen(DOM_SECEDIT), close: () => closeSectionEditor() },
      { priority: 40, isOpen: () => _isVisible(DOM.settingsPanel), close: () => closeSettings() },
      { priority: 30, isOpen: () => _isOpen(DOM_ADDSONG), close: () => closeAddSongModal() },
      {
        priority: 28,
        isOpen: () => isPianistEditorOpen(),
        close: () => closePianistEditor(),
      },
      {
        priority: 25,
        isOpen: () => _isVisible(DOM.journalModal),
        close: () => closeJournalModal(),
      },
      {
        priority: 20,
        isOpen: () => _isVisible(DOM.sessionSummary),
        close: () => DOM.sessionSummary?.classList.remove('visible'),
      },
      {
        priority: 10,
        isOpen: () => _isVisible(DOM.sectionResult),
        close: () => DOM.sectionResult?.classList.remove('visible'),
      },
    ],
  }).install();

  // ── i18n + theme shell — moved to packages/web/src/shell-i18n.ts (batch 115).
  const _i18n = ShellI18n.createShellI18n({
    document,
    prefs,
    state,
    config: CONFIG,
    dom: DOM,
    savePrefs,
    getSongs: () => SONGS,
    getCurrentSong: () => currentSong,
    getPractice: () => practice,
    refreshSettingsPanel: () => refreshSettingsPanel(),
    refreshLangCaches: () => _practice.refreshLangCaches(),
    renderSongPanel: () => renderSongPanel(),
    renderResultCard: () => renderResultCard(),
    renderSessionSummaryText: (a) => renderSessionSummaryText(a),
  });
  const { t, stageLabel, applyTheme, setLang } = _i18n;

  // ── Effects + bg-draw — moved to packages/web/src/shell-effects.ts (batch 110).
  const _fx = ShellEffects.createShellEffects({
    pianoCore: PianoCore,
    ctx,
    state,
    config: CONFIG,
    perfTier: _vp.perfTier,
    getScreen: _vp.getScreen,
    getBgStars: _vp.getBgStars,
    getPractice: () => practice,
  });
  const {
    particles,
    ripples,
    Particle,
    Ripple,
    getNoteColor,
    spawnBurst,
    spawnStream,
    effectGlowPulse,
    effectStarShower,
    effectFlowerBurst,
    effectGoldenBurst,
    triggerEffect,
    drawBgStars,
    drawAurora,
    drawGroundFlowers,
  } = _fx;

  // ── Per-frame reducers — moved to packages/web/src/shell-game-update.ts (batch 105).
  const clamp01 = PianoCore.clamp01;
  const _coreOpts = CoreOpts.createCoreOpts({
    config: CONFIG,
    detectChord: PianoCore.detectChord,
  });
  const {
    qhOptsMidi: QH_OPTS_MIDI,
    psOpts: PS_OPTS,
    cwOpts: CW_OPTS,
    wufOpts: WUF_OPTS,
  } = _coreOpts;
  const DEFAULT_AUDIO_OFFSET_MS = CoreOpts.DEFAULT_AUDIO_OFFSET_MS;

  const _gameUpdate = ShellGameUpdate.createShellGameUpdate({
    state,
    config: CONFIG,
    dom: DOM,
    t,
    audio: _audio,
    coreOpts: _coreOpts,
    sessionRing,
    sessionRingCap: SESSION_RING_CAP,
    spawnBurst,
    effectGoldenBurst,
    effectStarShower,
    triggerEffect,
    stageLabel,
    remoteLogEnabled: REMOTE_LOG_ENABLED,
    remoteLog,
    getScreen: _vp.getScreen,
    getPractice: () => practice,
    getMidiInput: () => midiInput,
  });
  const { updateQuestState, updateAGC, updateGameState, updateDebugOverlay, getEnergy } =
    _gameUpdate;

  // ── Main loop — moved to packages/web/src/shell-render-loop.ts (batch 112).
  const _rl = ShellRenderLoop.createShellRenderLoop({
    ctx,
    state,
    config: CONFIG,
    dom: DOM,
    audio: _audio,
    pianoCore: PianoCore,
    particles,
    ripples,
    Particle,
    Ripple,
    drawBgStars,
    drawAurora,
    drawGroundFlowers,
    getNoteColor,
    spawnBurst,
    spawnStream,
    isFreeplayActive,
    updateAGC,
    updateGameState,
    updateQuestState,
    updatePlayTime,
    updateDebugOverlay,
    getEnergy,
    wufOpts: WUF_OPTS,
    remoteLogEnabled: REMOTE_LOG_ENABLED,
    getPractice: () => practice,
    getMidiInput: () => midiInput,
    getMidiState: () => midiState,
    cwOpts: CW_OPTS,
    getUpdatePractice: () => updatePractice,
    getScreen: _vp.getScreen,
    getDrawMidiBeams: () => drawMidiBeams,
    getDrawMidiChordDisplay: () => drawMidiChordDisplay,
    getDrawMidiKeyboard: () => drawMidiKeyboard,
    getDrawPracticeLane: () => drawPracticeLane,
    getShowNoteDisplay: () => showNoteDisplay,
    hideIntroHint: () => hideIntroHint(),
    getTone: () => Tone,
  });
  const loop = _rl.loop;

  // True only when the canvas / HUD is the front-most surface.
  function isFreeplayActive(): boolean {
    return (
      state.running &&
      !practice.enabled &&
      DOM.startScreen.style.display === 'none' &&
      !DOM.songPanel.classList.contains('visible') &&
      !DOM.sessionSummary.classList.contains('visible') &&
      !DOM.sectionResult.classList.contains('visible')
    );
  }

  const formatTime = PianoCore.formatTime;
  // 秒が変わったときだけ DOM を書く（値は1回/秒しか変わらないのに毎フレーム
  // textContent 置換すると WebKit がレイアウト無効化する — iPad の無駄コスト）。
  let lastPlayTimeSec = -1;
  function updatePlayTime(timeMs: number): void {
    if (!DOM.playTime) return;
    const sec = Math.floor((timeMs - state.sessionStartTimeMs) / 1000);
    if (sec === lastPlayTimeSec) return;
    lastPlayTimeSec = sec;
    DOM.playTime.textContent = formatTime(timeMs - state.sessionStartTimeMs);
  }
  // ── Session summary + reset — moved to packages/web/src/shell-session-state.ts (batch 111).
  const _sess = ShellSessionState.createShellSessionState({
    state,
    config: CONFIG,
    dom: DOM,
    t,
    remoteLog,
    particles,
    ripples,
    loadJSON,
    saveJSON,
    stageLabel,
    formatTime,
    setupHiDPICanvas: ShellHelpers.setupHiDPICanvas,
    sessionRing,
    sessionRingCap: SESSION_RING_CAP,
    questState: _gameUpdate.questState,
    encState: _gameUpdate.encState,
    getMidiState: () => midiState,
    invalidateFlowCache: () => _gameUpdate.invalidateFlowCache(),
    resetMidiDispatch: () => _midi.resetMidiDispatch(),
  });
  ({ renderSessionSummaryText, showSessionSummary } = _sess);
  const resetSession = (): void => _sess.resetSession();

  // ── Practice mode catalog — built-in-songs.ts. User-imported scores merge in by id.
  // SONGS is the lazy-load song registry; per-record fields are populated
  // by _scoreLoader.loadCurrentScore() on demand, so the value type stays
  // loose (Record<string, any>) — see built-in-songs.ts for the shape.
  const SONGS = BuiltInSongs.createBuiltInSongs();
  let currentSong = SONGS.fur_elise;

  // ── User library — moved to packages/web/src/shell-user-library.ts (batch 109).
  const _lib = ShellUserLibrary.createShellUserLibrary({
    songs: SONGS,
    getPractice: () => practice,
    savePracticeProgress: () => savePracticeProgress(),
  });
  const {
    USER_DB_STORE,
    openUserDb,
    userDbAll,
    userDbPut,
    unzipMxlToXmlText,
    userSongStore: _userSongStore,
    removeUserSong,
    fetchLibrary,
    buildSectionsFromDefs,
  } = _lib;

  // ── OSMD shell — moved to packages/web/src/shell-osmd.ts (batch 103).
  const _osmd = ShellOsmd.createShellOsmd({
    osmdContainer: DOM.osmdContainer,
    remoteLogEnabled: REMOTE_LOG_ENABLED,
    remoteLog,
    buildSectionsFromDefs,
    getCurrentSong: () => currentSong,
  });
  const { osmdAdapter, getOsmd } = _osmd;

  const requestWakeLock = PianoWakeLock.requestWakeLock;
  const releaseWakeLock = PianoWakeLock.releaseWakeLock;

  // ── Practice cluster — moved to packages/web/src/shell-practice.ts (batch 107).
  const _practice = ShellPractice.createShellPractice({
    state,
    prefs,
    config: CONFIG,
    ctx,
    dom: DOM,
    t,
    spawnBurst,
    requestWakeLock,
    audioScheduler: AudioScheduler,
    prefsStore: _prefsStore,
    defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
    remoteLogEnabled: REMOTE_LOG_ENABLED,
    remoteLog,
    Tone,
    osmdAdapter: _osmd.osmdAdapter,
    getOsmd,
    syncLayout: _vp.syncLayout,
    getScreen: _vp.getScreen,
    getMidiInput: () => midiInput,
    getMidiState: () => midiState,
    getCurrentSong: () => currentSong,
    hideIntroHint: () => hideIntroHint(),
    setInputIndicator: () => _midi.setInputIndicator(),
    loadCurrentScore: () => _osmd.loadCurrentScore(),
    showHitChip: (kind, text) => showHitChip(kind, text),
    getCompletePracticeSection: () => completePracticeSection,
  });
  const {
    practice,
    finalizeNoteHold,
    practiceElapsedMs,
    practiceRealElapsedMs,
    loadPracticeProgress,
    savePracticeProgress,
    songProg,
    recordPracticeDay,
    startPracticeSection,
    stopPracticeAudio,
    updatePractice,
    midiToPitchName,
  } = _practice;

  // ── MIDI shell — moved to packages/web/src/shell-midi.ts (batch 101).
  const _midi = ShellMidi.createShellMidi({
    state,
    practice,
    t,
    navigator,
    getAudioCtx: _audio.getAudioCtx,
    dom: DomBag.pickDom(DOM, 'midiBadge', 'ptbInput', 'introHint', 'micMeter'),
    suspendMic: _audio.suspendMic,
    resumeMic: _audio.resumeMic,
    recover: _audio.recover,
    refreshIntroHint: () => refreshIntroHint(),
    showHitChip: (kind, msg) => showHitChip(kind, msg),
    getOnMidiNoteOn: () => onMidiNoteOn,
    getOnMidiNoteOff: () => onMidiNoteOff,
    getOnMidiCC: () => onMidiCC,
    getMatchNoteOnset: () => _practice.matchNoteOnset,
    isRunning: () => !!state.running,
    requestWakeLock,
    getTone: () => Tone,
  });
  const {
    midiInput,
    isAppleMobile,
    initWebMIDI,
    rescanMidi,
    startMidiAutoRescan,
    stopMidiAutoRescan,
  } = _midi;

  // ── Settings panel — moved to packages/web/src/shell-settings.ts (batch 118).
  const _settings = ShellSettings.createShellSettings({
    dom: DOM,
    prefs,
    practice,
    state,
    midiInput,
    defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
    savePrefs,
    t,
    modalFocus,
    rescanMidi: () => {
      void rescanMidi();
    },
    connectBleMidi: () => _midi.connectBleMidi(),
    showSessionSummary: () => showSessionSummary(),
    pausePractice: () => _midi.pausePractice(),
    resumePractice: () => _midi.resumePractice(),
  });
  ({ open: openSettings, close: closeSettings, refresh: refreshSettingsPanel } = _settings);

  // ── MIDI handlers + render — moved to packages/web/src/shell-midi-handlers.ts (batch 106).
  const _midiH = ShellMidiHandlers.createShellMidiHandlers({
    state,
    ctx,
    config: CONFIG,
    t,
    effectGlowPulse,
    spawnBurst,
    spawnStream,
    ripples,
    Ripple,
    noteDisplayEl: DOM.noteDisplay,
    qhOptsMidi: QH_OPTS_MIDI,
    psOpts: PS_OPTS,
    cwOpts: CW_OPTS,
    wufOpts: WUF_OPTS,
    shadowBlurEnabled: CONFIG.SHADOW_BLUR_ENABLED,
    getPractice: () => practice,
    hideIntroHint: () => hideIntroHint(),
    finalizeNoteHold: (midi) => finalizeNoteHold(midi),
    getScreen: _vp.getScreen,
    getKbHeight: _vp.getKbHeight,
    getKbSafeBottom: _vp.getKbSafeBottom,
  });
  const {
    midiState,
    noteThemeColor,
    showNoteDisplay,
    onMidiNoteOn,
    onMidiNoteOff,
    onMidiCC,
    drawMidiKeyboard,
    drawMidiBeams,
    drawMidiChordDisplay,
  } = _midiH;
  window.addEventListener('langchange', () => _midiH.refreshLabels());

  // ── Practice lane — moved to packages/web/src/shell-practice-lane.ts (batch 117).
  const _practiceLane = ShellPracticeLane.createShellPracticeLane({
    ctx,
    practice,
    state,
    midiInput,
    config: CONFIG,
    t,
    osmdAdapter,
    practiceElapsedMs,
    practiceRealElapsedMs,
    noteThemeColor,
    midiToPitchName,
    drawPracticeLane: PianoCore.drawPracticeLane,
    cachedOsmdRect: _vp.cachedOsmdRect,
    osmdContainerEl: DOM.osmdContainer,
    getScreen: _vp.getScreen,
    getKbHeight: _vp.getKbHeight,
    getKbSafeBottom: _vp.getKbSafeBottom,
    getSafeRight: _vp.getSafeRight,
    getCurrentLayoutMode: () => _vp.layout.getCurrentLayoutMode(),
    getCurrentSong: () => currentSong,
    laneLookaheadMs: _practice.getLaneLookaheadMs(),
    countInMs: _practice.getCountInMs(),
  });
  _practice.setPracticeLane(_practiceLane.instance);
  function drawPracticeLane(timeMs: number): void {
    _practiceLane.draw(timeMs);
  }

  // ── Add-song modal + Section editor — moved to packages/web/src/shell-add-song.ts (batch 102).
  const _addSong = ShellAddSong.createShellAddSong({
    document,
    songs: SONGS,
    t,
    modalFocus,
    fetchLibrary,
    openUserDb,
    userDbAll,
    userDbPut,
    unzipMxlToXmlText,
    userDbStoreName: USER_DB_STORE,
    userSongStore: _userSongStore,
    autoSectionDefs: PianoCore.autoSectionDefs,
    getLang: () => prefs.lang,
    getLibrary: () => _lib.getOnlineLibrary(),
    setLibrary: (entries) => _lib.setOnlineLibrary(entries),
    getCurrentSong: () => currentSong,
    selectSong: (id) => _ui.selectSong(id),
    songPanelHeaderDom: DomBag.pickDom(DOM, 'songTitle', 'songComposer'),
  });
  const { byId, domAddSong: DOM_ADDSONG, domSecEdit: DOM_SECEDIT } = _addSong;
  ({ closeSectionEditor, openAddSongModal, closeAddSongModal } = _addSong);

  // ── UI cluster — moved to packages/web/src/shell-ui.ts (batch 108).
  const _ui = ShellUi.createShellUi({
    document,
    songs: SONGS,
    dom: DOM,
    t,
    getOsmd,
    state,
    practice,
    midiInput,
    midiState,
    prefs,
    savePrefs,
    config: CONFIG,
    dateKey: PianoCore.formatDateKey,
    getCurrentSong: () => currentSong,
    setCurrentSong: (s) => {
      currentSong = s;
    },
    setOsmd: (o) => _osmd.setOsmd(o),
    clearHighlights: () => _osmd.cursor.clearHighlights(),
    loadCurrentScore: () => _osmd.loadCurrentScore(),
    songProg,
    loadPracticeProgress,
    savePracticeProgress,
    recordPracticeDay,
    // 練習時間（分）の累積 (P2-19)。所要 = practiceRealElapsedMs（ポーズ・
    // タブ非表示中は clock rebase で除外済み）。累積のみ・目標/未達表示なし。
    recordPracticeMinutes: () => {
      try {
        const prog = (practice.progress ?? loadPracticeProgress()) as PianoCore.PracticeProgress;
        practice.progress = prog as never;
        PianoCore.recordPracticeMinutes(
          prog,
          PianoCore.formatDateKey(new Date()),
          practiceRealElapsedMs() / 60000
        );
        savePracticeProgress();
      } catch {
        /* 時間記録は非クリティカル — 完了フローを止めない */
      }
    },
    startPracticeSection,
    stopPracticeAudio,
    initAudio: _audio.initAudio,
    initBgStars: _vp.initBgStars,
    loop,
    alertAudioInitError: (e) => _ui.alertAudioInitError(e),
    initWebMIDI,
    startMidiAutoRescan,
    stopMidiAutoRescan,
    rescanMidi,
    releaseWakeLock,
    requestWakeLock,
    resetSession,
    hideIntroHint: () => _ui.hideIntroHint(),
    effectGoldenBurst,
    effectStarShower,
    effectFlowerBurst,
    setupHiDPICanvas: ShellHelpers.setupHiDPICanvas,
    clamp01,
    remoteLogEnabled: REMOTE_LOG_ENABLED,
    getHeight: () => _vp.getScreen().H,
    byId,
  });
  const { showHitChip, refreshIntroHint, hideIntroHint, renderSongPanel } = _ui;
  ({ renderResultCard, completePracticeSection } = _ui);
  closeJournalModal = () => _ui.closeJournal();
  closePianistEditor = () => _ui.closePianistEditor();
  isPianistEditorOpen = () => _ui.isPianistEditorOpen();
  _ui.installPracticeSongButtons();

  // ── Dev-mode shell — moved to packages/web/src/shell-dev-mode.ts (batch 154).
  ShellDevMode.createShellDevMode({
    document,
    dom: DOM,
    ctx,
    state,
    practice,
    prefs,
    midiInput,
    midiState,
    particles,
    ripples,
    themes: CONFIG.THEMES,
    t,
    setLang,
    applyTheme,
    onMidiNoteOn,
    onMidiNoteOff,
    getEnergy,
    wufOpts: WUF_OPTS,
    drawBgStars,
    drawAurora,
    drawGroundFlowers,
    openUserDb,
    userDbAll,
    userDbPut,
    removeUserSong,
    isAppleMobile,
    openSettings,
    closeSettings,
    openAddSongModal,
    closeAddSongModal,
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
    buildDate: typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : undefined,
    domAddSong: { modal: DOM_ADDSONG.modal },
    getScreen: _vp.getScreen,
    getAudioCtx: _audio.getAudioCtx,
    getCurrentSong: () => currentSong,
    completePracticeSection: () => completePracticeSection(),
    decayWakeUpFlash: PianoCore.decayWakeUpFlash,
    drawCenterGlow: PianoCore.drawCenterGlow,
    renderFrame: RenderFrame,
    audioInit: AudioInit,
  });

  // Initialize progress on load (so the panel works without audio start) +
  // install ▶ Start button.
  practice.progress = loadPracticeProgress();
  _ui.refreshJournal();
  _ui.installStartButtons();
}
