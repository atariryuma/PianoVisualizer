    // @ts-check
    'use strict';

    // SW registration: vite-plugin-pwa auto-injects ./registerSW.js.
    // Cast sites use /** @type {any} */ (per-module types live in *.ts).

    const _remoteLog = RemoteLog.createRemoteLog();
    const REMOTE_LOG_ENABLED = _remoteLog.enabled;
    /** @param {string|object} msg */
    const remoteLog = (msg) => _remoteLog.send(msg);
    RemoteLog.installConsoleForwarding(_remoteLog);

    console.log("App Started: Piano Visualizer");

    const CONFIG = /** @type {any} */ (PianoConfig.createPianoConfig());
    /** @type {Record<string, HTMLElement>} */
    const DOM = /** @type {any} */ (DomBag.createDomBag(document).bag);
    const ctx = /** @type {CanvasRenderingContext2D} */ (
      /** @type {HTMLCanvasElement} */ (DOM.canvas).getContext('2d'));
    const state = /** @type {any} */ (GameStateInit.createInitialGameState());

    // Session-confidence ring buffer — pre-allocated, zero-alloc at runtime.
    const SESSION_RING_CAP = 100;
    const sessionRing = Array.from({ length: SESSION_RING_CAP }, () => ({ timeMs: 0, isPiano: false }));

    // ── Audio shell — moved to packages/web/src/shell-audio.ts (batch 104).
    const _audio = ShellAudio.createShellAudio(/** @type {any} */ ({
      state, config: CONFIG, micMeterEl: DOM.micMeter, remoteLogEnabled: REMOTE_LOG_ENABLED,
      getPractice: () => practice, getMidiInputEnabled: () => midiInput?.enabled ?? false,
      initWebMIDI: () => initWebMIDI(), isAppleMobile: () => isAppleMobile(),
      refreshIntroHint: () => refreshIntroHint(), stopPracticeAudio: () => stopPracticeAudio(),
    }));

    // ── Viewport — moved to packages/web/src/shell-viewport.ts (batch 114).
    const _vp = ShellViewport.createShellViewport(/** @type {any} */ ({
      canvas: DOM.canvas, ctx, state, pianoCore: PianoCore,
      practiceTopBarEl: DOM.practiceTopBar, osmdContainerEl: DOM.osmdContainer,
      dom: DomBag.pickDom(DOM, 'practiceTopBar', 'themeBar', 'osmdContainer'),
    }));

    // ── Theme switching + persisted user preferences ──
    const prefs = /** @type {any} */ (PracticeStateInit.createInitialPrefs());
    const _prefsStore = PrefsStorage.createJSONStore();
    const { loadJSON, saveJSON } = _prefsStore;
    Object.assign(prefs, PrefsStorage.sanitizePrefs(loadJSON('pianoViz_prefs', {})));
    function savePrefs() { saveJSON('pianoViz_prefs', prefs); }

    const modalFocus = ModalFocus.createModalFocus({ document, requestAnimationFrame: (cb) => requestAnimationFrame(cb) });

    // Forward-decl placeholders — reassigned by createXxx wire-ups further
    // down. Avoids TDZ in ESC handler / langchange / settings-panel deps.
    const _stub = /** @type {any} */ (() => {});
    let openSettings = _stub, closeSettings = _stub, refreshSettingsPanel = _stub,
      openSectionEditor = _stub, closeSectionEditor = _stub,
      openAddSongModal = _stub, closeAddSongModal = _stub,
      completePracticeSection = _stub, renderResultCard = _stub,
      showSessionSummary = _stub, renderSessionSummaryText = _stub;
    // ESC modal router — higher priority = topmost-z modal.
    const _isOpen = (/** @type {any} */ x) => !!(x?.modal?.classList.contains('visible'));
    const _isVisible = (/** @type {HTMLElement} */ el) => !!el?.classList.contains('visible');
    ModalFocus.createEscRouter({
      document,
      routes: [
        { priority: 50, isOpen: () => _isOpen(DOM_SECEDIT), close: () => closeSectionEditor() },
        { priority: 40, isOpen: () => _isVisible(DOM.settingsPanel), close: () => closeSettings() },
        { priority: 30, isOpen: () => _isOpen(DOM_ADDSONG), close: () => closeAddSongModal() },
        { priority: 20, isOpen: () => _isVisible(DOM.sessionSummary), close: () => DOM.sessionSummary?.classList.remove('visible') },
        { priority: 10, isOpen: () => _isVisible(DOM.sectionResult), close: () => DOM.sectionResult?.classList.remove('visible') },
      ],
    }).install();

    // ── i18n + theme shell — moved to packages/web/src/shell-i18n.ts (batch 115).
    const _i18n = ShellI18n.createShellI18n(/** @type {any} */ ({
      document, prefs, state, config: CONFIG, dom: DOM, savePrefs,
      getSongs: () => SONGS, getCurrentSong: () => currentSong, getPractice: () => practice,
      refreshSettingsPanel: () => refreshSettingsPanel(),
      refreshLangCaches: () => _practice.refreshLangCaches(),
      renderSongPanel: () => renderSongPanel(), renderResultCard: () => renderResultCard(),
      renderSessionSummaryText: (/** @type {any} */ a) => renderSessionSummaryText(a),
    }));
    const { t, stageLabel, applyTheme, setLang } = _i18n;

    // ── Effects + bg-draw — moved to packages/web/src/shell-effects.ts (batch 110).
    const _fx = ShellEffects.createShellEffects(/** @type {any} */ ({
      pianoCore: PianoCore, ctx, state, config: CONFIG,
      perfTier: _vp.perfTier, getScreen: _vp.getScreen, getBgStars: _vp.getBgStars,
      getPractice: () => practice,
    }));
    const {
      particles, ripples, Particle, Ripple, getNoteColor, spawnBurst, spawnStream,
      effectGlowPulse, effectStarShower, effectFlowerBurst, effectGoldenBurst, triggerEffect,
      drawBgStars, drawAurora, drawGroundFlowers,
    } = _fx;

    // ── Per-frame reducers — moved to packages/web/src/shell-game-update.ts (batch 105).
    const clamp01 = PianoCore.clamp01;
    const _coreOpts = CoreOpts.createCoreOpts({ config: CONFIG, detectChord: /** @type {any} */ (PianoCore.detectChord) });
    const { qhOptsMidi: QH_OPTS_MIDI, psOpts: PS_OPTS, cwOpts: CW_OPTS, wufOpts: WUF_OPTS } = _coreOpts;
    const DEFAULT_AUDIO_OFFSET_MS = CoreOpts.DEFAULT_AUDIO_OFFSET_MS;

    const _gameUpdate = ShellGameUpdate.createShellGameUpdate(/** @type {any} */ ({
      state, config: CONFIG, dom: DOM, t, audio: _audio, coreOpts: _coreOpts,
      sessionRing, sessionRingCap: SESSION_RING_CAP,
      spawnBurst, effectGoldenBurst, effectStarShower, triggerEffect,
      stageLabel, remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      getScreen: _vp.getScreen,
      getPractice: () => practice, getMidiInput: () => midiInput,
    }));
    const { updateQuestState, updateAGC, updateGameState, updateDebugOverlay, getEnergy } = _gameUpdate;

    // ── Main loop — moved to packages/web/src/shell-render-loop.ts (batch 112).
    const _rl = ShellRenderLoop.createShellRenderLoop(/** @type {any} */ ({
      ctx, state, config: CONFIG, dom: DOM, audio: _audio, pianoCore: PianoCore,
      particles, ripples, Particle, Ripple,
      drawBgStars, drawAurora, drawGroundFlowers,
      getNoteColor, spawnBurst, spawnStream, isFreeplayActive,
      updateAGC, updateGameState, updateQuestState, updatePlayTime, updateDebugOverlay, getEnergy,
      wufOpts: WUF_OPTS, remoteLogEnabled: REMOTE_LOG_ENABLED,
      getPractice: () => practice, getMidiInput: () => midiInput,
      getUpdatePractice: () => updatePractice, getScreen: _vp.getScreen,
      getDrawMidiBeams: () => drawMidiBeams, getDrawMidiChordDisplay: () => drawMidiChordDisplay,
      getDrawMidiKeyboard: () => drawMidiKeyboard, getDrawPracticeLane: () => drawPracticeLane,
      getShowNoteDisplay: () => showNoteDisplay,
      hideIntroHint: () => hideIntroHint(),
      getTone: () => (typeof Tone !== 'undefined' ? Tone : null),
    }));
    const loop = _rl.loop;

    // True only when the canvas / HUD is the front-most surface.
    function isFreeplayActive() {
      return state.running && !practice.enabled && DOM.startScreen.style.display === 'none'
        && !DOM.songPanel.classList.contains('visible')
        && !DOM.sessionSummary.classList.contains('visible')
        && !DOM.sectionResult.classList.contains('visible');
    }

    const formatTime = PianoCore.formatTime;
    /** @param {number} timeMs */
    function updatePlayTime(timeMs) {
      if (DOM.playTime) DOM.playTime.textContent = formatTime(timeMs - state.sessionStartTimeMs);
    }
    // ── Session summary + reset — moved to packages/web/src/shell-session-state.ts (batch 111).
    const _sess = ShellSessionState.createShellSessionState(/** @type {any} */ ({
      state, config: CONFIG, dom: DOM, t, remoteLog, particles, ripples,
      loadJSON, saveJSON, stageLabel, formatTime,
      setupHiDPICanvas: ShellHelpers.setupHiDPICanvas,
      sessionRing, sessionRingCap: SESSION_RING_CAP,
      questState: _gameUpdate.questState, encState: _gameUpdate.encState,
      getMidiState: () => midiState,
      invalidateFlowCache: () => _gameUpdate.invalidateFlowCache(),
      resetMidiDispatch: () => _midi.resetMidiDispatch(),
    }));
    ({ renderSessionSummaryText, showSessionSummary } = _sess);
    function resetSession() { _sess.resetSession(); }

    // ── Practice mode catalog — built-in-songs.ts. User-imported scores merge in by id.
    /** @type {any} */
    const SONGS = BuiltInSongs.createBuiltInSongs();
    let currentSong = SONGS.fur_elise;

    // ── User library — moved to packages/web/src/shell-user-library.ts (batch 109).
    const _lib = ShellUserLibrary.createShellUserLibrary(/** @type {any} */ ({
      songs: SONGS,
      getPractice: () => practice,
      savePracticeProgress: () => savePracticeProgress(),
    }));
    const { USER_DB_STORE, openUserDb, userDbAll, userDbPut, unzipMxlToXmlText,
      userSongStore: _userSongStore, removeUserSong, fetchLibrary, buildSectionsFromDefs } = _lib;

    // ── OSMD shell — moved to packages/web/src/shell-osmd.ts (batch 103).
    const _osmd = ShellOsmd.createShellOsmd(/** @type {any} */ ({
      osmdContainer: DOM.osmdContainer, remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      buildSectionsFromDefs, getCurrentSong: () => currentSong,
      opensheetmusicdisplay: typeof opensheetmusicdisplay !== 'undefined' ? opensheetmusicdisplay : undefined,
    }));
    const { osmdAdapter, getOsmd } = _osmd;

    const requestWakeLock = PianoWakeLock.requestWakeLock;
    const releaseWakeLock = PianoWakeLock.releaseWakeLock;

    // ── Practice cluster — moved to packages/web/src/shell-practice.ts (batch 107).
    const _practice = ShellPractice.createShellPractice(/** @type {any} */ ({
      state, prefs, config: CONFIG, ctx, dom: DOM, t, spawnBurst, requestWakeLock,
      audioScheduler: AudioScheduler, prefsStore: _prefsStore,
      defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      Tone: typeof Tone !== 'undefined' ? Tone : undefined,
      osmdAdapter: _osmd.osmdAdapter, getOsmd, syncLayout: _vp.syncLayout,
      getScreen: _vp.getScreen, getMidiInput: () => midiInput,
      getCurrentSong: () => currentSong, hideIntroHint: () => hideIntroHint(),
      setInputIndicator: () => _midi.setInputIndicator(),
      loadCurrentScore: () => _osmd.loadCurrentScore(),
      showHitChip: (/** @type {any} */ kind, /** @type {any} */ text) => showHitChip(kind, text),
      getCompletePracticeSection: () => completePracticeSection,
    }));
    const { practice, finalizeNoteHold, practiceElapsedMs, practiceRealElapsedMs,
      loadPracticeProgress, savePracticeProgress, songProg, recordPracticeDay,
      startPracticeSection, stopPracticeAudio, updatePractice, midiToPitchName } = _practice;

    // ── MIDI shell — moved to packages/web/src/shell-midi.ts (batch 101).
    const _midi = ShellMidi.createShellMidi(/** @type {any} */ ({
      state, practice, t, navigator,
      getAudioCtx: _audio.getAudioCtx,
      dom: DomBag.pickDom(DOM, 'midiBadge', 'ptbInput', 'introHint', 'micMeter'),
      suspendMic: _audio.suspendMic, resumeMic: _audio.resumeMic, recover: _audio.recover,
      refreshIntroHint: () => refreshIntroHint(),
      showHitChip: (/** @type {any} */ kind, /** @type {any} */ msg) => showHitChip(kind, msg),
      getOnMidiNoteOn: () => onMidiNoteOn, getOnMidiNoteOff: () => onMidiNoteOff,
      getOnMidiCC: () => onMidiCC,
      getMatchNoteOnset: () => _practice.matchNoteOnset,
      isRunning: () => !!state.running, requestWakeLock,
    }));
    const { midiInput, isAppleMobile, initWebMIDI, rescanMidi, startMidiAutoRescan, stopMidiAutoRescan } = _midi;

    // ── Settings panel — moved to packages/web/src/shell-settings.ts (batch 118).
    const _settings = ShellSettings.createShellSettings(/** @type {any} */ ({
      dom: DOM, prefs, practice, state, midiInput,
      defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
      savePrefs, t, modalFocus,
      rescanMidi: () => { void rescanMidi(); },
      connectBleMidi: () => _midi.connectBleMidi(),
      showSessionSummary: () => showSessionSummary(),
    }));
    ({ open: openSettings, close: closeSettings, refresh: refreshSettingsPanel } = _settings);

    // ── MIDI handlers + render — moved to packages/web/src/shell-midi-handlers.ts (batch 106).
    const _midiH = ShellMidiHandlers.createShellMidiHandlers(/** @type {any} */ ({
      state, ctx, config: CONFIG, t, effectGlowPulse,
      spawnBurst, spawnStream, ripples, Ripple,
      noteDisplayEl: DOM.noteDisplay,
      qhOptsMidi: QH_OPTS_MIDI, psOpts: PS_OPTS, cwOpts: CW_OPTS, wufOpts: WUF_OPTS,
      shadowBlurEnabled: CONFIG.SHADOW_BLUR_ENABLED,
      getPractice: () => practice,
      hideIntroHint: () => hideIntroHint(),
      finalizeNoteHold: (/** @type {any} */ midi) => finalizeNoteHold(midi),
      getScreen: _vp.getScreen,
      getKbHeight: _vp.getKbHeight, getKbSafeBottom: _vp.getKbSafeBottom,
    }));
    const { midiState, noteThemeColor, showNoteDisplay,
      onMidiNoteOn, onMidiNoteOff, onMidiCC,
      drawMidiKeyboard, drawMidiBeams, drawMidiChordDisplay } = _midiH;
    window.addEventListener('langchange', () => _midiH.refreshLabels());

    // ── Practice lane — moved to packages/web/src/shell-practice-lane.ts (batch 117).
    const _practiceLane = ShellPracticeLane.createShellPracticeLane(/** @type {any} */ ({
      ctx, practice, state, midiInput, config: CONFIG, t, osmdAdapter,
      practiceElapsedMs, practiceRealElapsedMs, noteThemeColor, midiToPitchName,
      getScreen: _vp.getScreen, getKbHeight: _vp.getKbHeight,
      getKbSafeBottom: _vp.getKbSafeBottom, getSafeRight: _vp.getSafeRight,
      getCurrentLayoutMode: () => _vp.layout.getCurrentLayoutMode(),
      cachedOsmdRect: _vp.cachedOsmdRect, osmdContainerEl: DOM.osmdContainer,
      getCurrentSong: () => currentSong,
      laneLookaheadMs: _practice.getLaneLookaheadMs(), countInMs: _practice.getCountInMs(),
      drawPracticeLane: PianoCore.drawPracticeLane,
    }));
    _practice.setPracticeLane(_practiceLane.instance);
    /** @param {number} timeMs */ function drawPracticeLane(timeMs) { _practiceLane.draw(timeMs); }

    // ── Add-song modal + Section editor — moved to packages/web/src/shell-add-song.ts (batch 102).
    const _addSong = ShellAddSong.createShellAddSong(/** @type {any} */ ({
      document, songs: SONGS, t, modalFocus, fetchLibrary,
      openUserDb, userDbAll, userDbPut, unzipMxlToXmlText,
      userDbStoreName: USER_DB_STORE, userSongStore: _userSongStore,
      autoSectionDefs: PianoCore.autoSectionDefs,
      getLang: () => prefs.lang,
      getLibrary: () => _lib.getOnlineLibrary(),
      setLibrary: (/** @type {any} */ entries) => _lib.setOnlineLibrary(entries),
      getCurrentSong: () => currentSong,
      selectSong: (/** @type {any} */ id) => _ui.selectSong(id),
      songPanelHeaderDom: DomBag.pickDom(DOM, 'songTitle', 'songComposer'),
    }));
    const { byId, domAddSong: DOM_ADDSONG, domSecEdit: DOM_SECEDIT } = _addSong;
    ({ openSectionEditor, closeSectionEditor, openAddSongModal, closeAddSongModal } = _addSong);

    // ── UI cluster — moved to packages/web/src/shell-ui.ts (batch 108).
    const _ui = ShellUi.createShellUi(/** @type {any} */ ({
      document, songs: SONGS, dom: DOM, t, getOsmd,
      state, practice, midiInput, midiState, prefs, config: CONFIG,
      dateKey: PianoCore.formatDateKey,
      getCurrentSong: () => currentSong,
      setCurrentSong: (/** @type {any} */ s) => { currentSong = s; },
      setOsmd: (/** @type {any} */ o) => _osmd.setOsmd(o),
      clearHighlights: () => _osmd.cursor.clearHighlights(),
      loadCurrentScore: () => _osmd.loadCurrentScore(),
      songProg, loadPracticeProgress, savePracticeProgress, recordPracticeDay,
      startPracticeSection, stopPracticeAudio,
      initAudio: _audio.initAudio, initBgStars: _vp.initBgStars, loop,
      alertAudioInitError: (/** @type {any} */ e) => _ui.alertAudioInitError(e),
      initWebMIDI, startMidiAutoRescan, stopMidiAutoRescan, rescanMidi,
      releaseWakeLock, requestWakeLock, resetSession,
      hideIntroHint: () => _ui.hideIntroHint(),
      effectGoldenBurst, effectStarShower, effectFlowerBurst,
      setupHiDPICanvas: ShellHelpers.setupHiDPICanvas, clamp01,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      getHeight: () => _vp.getScreen().H, byId,
    }));
    const { showHitChip, refreshIntroHint, hideIntroHint, renderSongPanel } = _ui;
    renderResultCard = _ui.renderResultCard;
    completePracticeSection = _ui.completePracticeSection;
    _ui.installPracticeSongButtons();

    // ── Dev-mode shell — moved to packages/web/src/shell-dev-mode.ts (batch 154).
    ShellDevMode.createShellDevMode(/** @type {any} */ ({
      document, dom: DOM, ctx, state, practice, prefs, midiInput, midiState,
      particles, ripples, themes: CONFIG.THEMES, t, setLang, applyTheme,
      onMidiNoteOn, onMidiNoteOff, getEnergy, wufOpts: WUF_OPTS,
      drawBgStars, drawAurora, drawGroundFlowers,
      openUserDb, userDbAll, userDbPut, removeUserSong, isAppleMobile,
      openSettings, closeSettings, openAddSongModal, closeAddSongModal,
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
      buildDate: typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : undefined,
      domAddSong: { modal: DOM_ADDSONG.modal },
      getScreen: _vp.getScreen, getAudioCtx: _audio.getAudioCtx,
      getCurrentSong: () => currentSong,
      completePracticeSection: () => completePracticeSection(),
      decayWakeUpFlash: PianoCore.decayWakeUpFlash, drawCenterGlow: PianoCore.drawCenterGlow,
      renderFrame: RenderFrame, audioInit: AudioInit,
    }));

    // Initialize progress on load (so the panel works without audio start) +
    // install ▶ Start button.
    practice.progress = loadPracticeProgress();
    _ui.installStartButtons();

// Real ES module so main.ts can import it. Enables `allowJs: true` in tsconfig.
export {};
