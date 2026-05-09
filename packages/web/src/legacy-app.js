    // @ts-check
    'use strict';

    // Phase 0c boundary JSDoc typedefs deleted — types now live in
    // each per-module .ts file. Cast sites use /** @type {any} */.

    // SW registration is handled by vite-plugin-pwa's auto-injected
    // ./registerSW.js (see vite.config.ts). The legacy
    // `navigator.serviceWorker.register('./sw.js')` here was redundant
    // and removed in batch 91.

    const _remoteLog = RemoteLog.createRemoteLog();
    const REMOTE_LOG_ENABLED = _remoteLog.enabled;
    /** @param {string|object} msg */
    const remoteLog = (msg) => _remoteLog.send(msg);
    RemoteLog.installConsoleForwarding(_remoteLog);

    console.log("App Started: Piano Visualizer");

    const CONFIG = /** @type {any} */ (PianoConfig.createPianoConfig()
    );

    /** @type {Record<string, HTMLElement>} */
    const DOM = /** @type {any} */ (DomBag.createDomBag(document).bag);
    const ctx = /** @type {CanvasRenderingContext2D} */ (
      /** @type {HTMLCanvasElement} */ (DOM.canvas).getContext('2d')
    );

    const state = /** @type {any} */ (GameStateInit.createInitialGameState()
    );

    // ── Session Confidence Ring Buffer (pre-allocated, zero-alloc at runtime) ──
    const SESSION_RING_CAP = 100;
    const sessionRing = new Array(SESSION_RING_CAP);
    for (let i = 0; i < SESSION_RING_CAP; i++) sessionRing[i] = { timeMs: 0, isPiano: false };

    // ── Audio shell — moved to packages/web/src/shell-audio.ts (batch 104).
    const _audio = ShellAudio.createShellAudio(/** @type {any} */ ({
      state, getPractice: () => practice,
      config: { FFT_SIZE: CONFIG.FFT_SIZE, SMOOTHING: CONFIG.SMOOTHING, ONSET_FFT_SIZE: CONFIG.ONSET_FFT_SIZE, ONSET_SMOOTHING: CONFIG.ONSET_SMOOTHING },
      micMeterEl: DOM.micMeter,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      getMidiInputEnabled: () => midiInput?.enabled ?? false,
      initWebMIDI: () => initWebMIDI(),
      isAppleMobile: () => isAppleMobile(),
      refreshIntroHint: () => refreshIntroHint(),
      stopPracticeAudio: () => stopPracticeAudio(),
    }));

    // ── Viewport — moved to packages/web/src/shell-viewport.ts (batch 114).
    const _vp = ShellViewport.createShellViewport(/** @type {any} */ ({
      canvas: DOM.canvas, ctx, state,
      practiceTopBarEl: DOM.practiceTopBar,
      osmdContainerEl: DOM.osmdContainer,
      dom: DomBag.pickDom(DOM, 'practiceTopBar', 'themeBar', 'osmdContainer'),
      pianoCore: PianoCore,
    }));

    // ── Theme switching + persisted user preferences ──
    const prefs = /** @type {any} */ (PracticeStateInit.createInitialPrefs());
    const _prefsStore = PrefsStorage.createJSONStore();
    const { loadJSON, saveJSON } = _prefsStore;
    Object.assign(prefs, PrefsStorage.sanitizePrefs(loadJSON('pianoViz_prefs', {})));
    function savePrefs() { saveJSON('pianoViz_prefs', prefs); }

    // ── Settings panel modal-focus ──
    const modalFocus = ModalFocus.createModalFocus({
      document,
      requestAnimationFrame: (cb) => requestAnimationFrame(cb),
    });

    // Forward-decl placeholders — reassigned by createXxx wire-ups
    // further down. Avoids TDZ in ESC handler / langchange listener /
    // settings-panel deps that close over the short names.
    const _stub = /** @type {any} */ (() => {});
    let openSettings = _stub, closeSettings = _stub, refreshSettingsPanel = _stub,
      openSectionEditor = _stub, closeSectionEditor = _stub,
      openAddSongModal = _stub, closeAddSongModal = _stub,
      completePracticeSection = _stub, renderResultCard = _stub,
      showSessionSummary = _stub, renderSessionSummaryText = _stub;
    // ESC modal router. Higher priority = topmost-z modal (section-edit can
    // spawn from add-song, so it sits above settings). The `isOpen` thunks
    // only fire on user keydown (post-init), so DOM_SECEDIT / DOM_ADDSONG
    // are always declared by then — no TDZ guards needed.
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
      renderSongPanel: () => renderSongPanel(),
      renderResultCard: () => renderResultCard(),
      renderSessionSummaryText: (/** @type {any} */ animate) => renderSessionSummaryText(animate),
    }));
    const { t, stageLabel, applyTheme, setLang } = _i18n;

    // ── Effects + bg-draw — moved to packages/web/src/shell-effects.ts (batch 110).
    const _fx = ShellEffects.createShellEffects(/** @type {any} */ ({
      pianoCore: PianoCore, ctx, state, config: CONFIG,
      getPractice: () => practice,
      perfTier: _vp.perfTier,
      getScreen: _vp.getScreen,
      getBgStars: _vp.getBgStars,
    }));
    const {
      particles, ripples, Particle, Ripple, getNoteColor, spawnBurst, spawnStream,
      effectGlowPulse, effectStarShower, effectFlowerBurst, effectGoldenBurst, triggerEffect,
      drawBgStars, drawAurora, drawGroundFlowers,
    } = _fx;

    // ── Per-frame reducers — moved to packages/web/src/shell-game-update.ts (batch 105).
    // Encouragement / quest reducer state + onset/pitch hysteresis frames
    // are owned by ShellGameUpdate (batch 116). The 4 option bags + the
    // audio-offset default are still pulled here because shell-midi-handlers
    // / shell-render-loop / shell-practice / settings-panel consume them.
    // PianoCore feature primitives (detectPitchYIN / freqToNote / spectral-*
    // / coefficientOfVariation / computeHarmonicity) are read inside the
    // shells from globalThis.PianoCore directly (batch 120).
    const clamp01 = PianoCore.clamp01;
    const _coreOpts = CoreOpts.createCoreOpts({
      config: CONFIG,
      detectChord: /** @type {any} */ (PianoCore.detectChord),
    });
    const QH_OPTS_MIDI = _coreOpts.qhOptsMidi;
    const PS_OPTS = _coreOpts.psOpts;
    const CW_OPTS = _coreOpts.cwOpts;
    const WUF_OPTS = _coreOpts.wufOpts;
    const DEFAULT_AUDIO_OFFSET_MS = CoreOpts.DEFAULT_AUDIO_OFFSET_MS;

    const _gameUpdate = ShellGameUpdate.createShellGameUpdate(/** @type {any} */ ({
      state,
      getPractice: () => practice,
      getMidiInput: () => midiInput,
      config: CONFIG,
      sessionRing, sessionRingCap: SESSION_RING_CAP,
      audio: _audio,
      coreOpts: _coreOpts,
      dom: DOM, t,
      spawnBurst, effectGoldenBurst, effectStarShower, triggerEffect,
      getScreen: _vp.getScreen,
      stageLabel, remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
    }));
    // updateMultiFeatureOnset / updateSessionConfidence / updateQualityScores
    // / updateHUD are consumed only inside ShellGameUpdate now — dropped.
    const { updateQuestState, updateAGC, updateGameState, updateDebugOverlay, getEnergy } =
      _gameUpdate;

    // ── Main loop — moved to packages/web/src/shell-render-loop.ts (batch 112).
    const _rl = ShellRenderLoop.createShellRenderLoop(/** @type {any} */ ({
      ctx, state, config: CONFIG, dom: DOM,
      getPractice: () => practice,
      getMidiInput: () => midiInput,
      getUpdatePractice: () => updatePractice,
      getScreen: _vp.getScreen,
      audio: _audio,
      particles, ripples, Particle, Ripple,
      drawBgStars, drawAurora, drawGroundFlowers,
      updateAGC, updateGameState, updateQuestState, updatePlayTime, updateDebugOverlay, getEnergy,
      getDrawMidiBeams: () => drawMidiBeams, getDrawMidiChordDisplay: () => drawMidiChordDisplay,
      getDrawMidiKeyboard: () => drawMidiKeyboard, getDrawPracticeLane: () => drawPracticeLane,
      getShowNoteDisplay: () => showNoteDisplay,
      getNoteColor, spawnBurst, spawnStream,
      hideIntroHint: () => hideIntroHint(),
      isFreeplayActive,
      wufOpts: WUF_OPTS, remoteLogEnabled: REMOTE_LOG_ENABLED,
      getTone: () => (typeof Tone !== 'undefined' ? Tone : null),
      pianoCore: PianoCore,
    }));
    const loop = _rl.loop;

    // True only when the canvas / HUD is the front-most surface (the user is
    // actually free-playing, not picking a song or reviewing a result).
    function isFreeplayActive() {
      return state.running && !practice.enabled
        && DOM.startScreen.style.display === 'none'
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
      state, config: CONFIG, dom: DOM, t,
      loadJSON, saveJSON, stageLabel, formatTime, setupHiDPICanvas: ShellHelpers.setupHiDPICanvas,
      sessionRing, sessionRingCap: SESSION_RING_CAP,
      questState: _gameUpdate.questState, encState: _gameUpdate.encState,
      getMidiState: () => midiState,
      particles, ripples,
      invalidateFlowCache: () => _gameUpdate.invalidateFlowCache(),
      resetMidiDispatch: () => _midi.resetMidiDispatch(),
      remoteLog,
    }));
    ({ renderSessionSummaryText, showSessionSummary } = _sess);
    function resetSession() { _sess.resetSession(); }

    // ── v12: Practice Mode — built-in songs (catalog moved to built-in-songs.ts).
    //   `sectionDefs` = per-song quest layout (startMeasure → next def's
    //   startMeasure). User-imported scores merge into SONGS by id.
    /** @type {any} */
    const SONGS = BuiltInSongs.createBuiltInSongs();
    let currentSong = SONGS.fur_elise;

    // ── User library — moved to packages/web/src/shell-user-library.ts (batch 109).
    const _lib = ShellUserLibrary.createShellUserLibrary(/** @type {any} */ ({
      songs: SONGS,
      getPractice: () => practice,
      savePracticeProgress: () => savePracticeProgress(),
    }));
    // loadUserSongs dropped — consumed only inside ShellUserLibrary now.
    const {
      USER_DB_STORE, openUserDb, userDbAll, userDbPut, unzipMxlToXmlText,
      userSongStore: _userSongStore, removeUserSong, fetchLibrary, buildSectionsFromDefs,
    } = _lib;

    // ── OSMD shell — moved to packages/web/src/shell-osmd.ts (batch 103).
    const _osmd = ShellOsmd.createShellOsmd(/** @type {any} */ ({
      getCurrentSong: () => currentSong,
      osmdContainer: DOM.osmdContainer,
      opensheetmusicdisplay: typeof opensheetmusicdisplay !== 'undefined' ? opensheetmusicdisplay : undefined,
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      buildSectionsFromDefs,
    }));
    // initOsmd / extractNotesFromOsmd / loadCurrentScore: consumed only
    // inside ShellOsmd / ShellPractice / ShellUi (via _osmd.* directly) now.
    const { osmdAdapter, getOsmd } = _osmd;

    const requestWakeLock = PianoWakeLock.requestWakeLock;
    const releaseWakeLock = PianoWakeLock.releaseWakeLock;

    // ── Practice cluster — moved to packages/web/src/shell-practice.ts (batch 107).
    // Hit-window / chord-mate / duration-tolerance constants live in PianoCore;
    // shell-practice / shell-practice-lane / shell-midi-handlers each pull
    // them module-locally (batch 119), so legacy-app.js only ferries the
    // tunable defaultAudioOffsetMs.
    const _practice = ShellPractice.createShellPractice(/** @type {any} */ ({
      state, prefs, config: CONFIG, ctx, dom: DOM, t, spawnBurst,
      defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      audioScheduler: AudioScheduler,
      Tone: typeof Tone !== 'undefined' ? Tone : undefined,
      getCurrentSong: () => currentSong,
      hideIntroHint: () => hideIntroHint(),
      syncLayout: _vp.syncLayout, setInputIndicator: () => _midi.setInputIndicator(),
      requestWakeLock,
      loadCurrentScore: () => _osmd.loadCurrentScore(),
      osmdAdapter: _osmd.osmdAdapter,
      getOsmd, getMidiInput: () => midiInput,
      showHitChip: (/** @type {any} */ kind, /** @type {any} */ text) => showHitChip(kind, text),
      getScreen: _vp.getScreen,
      prefsStore: _prefsStore,
      getCompletePracticeSection: () => completePracticeSection,
    }));
    const {
      practice, finalizeNoteHold, practiceElapsedMs, practiceRealElapsedMs,
      loadPracticeProgress, savePracticeProgress, songProg, recordPracticeDay,
      startPracticeSection, stopPracticeAudio, updatePractice, midiToPitchName,
    } = _practice;

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
    // setInputIndicator: only consumer is ShellPractice (created above
    // _midi), so the deps thunk reads _midi.setInputIndicator() lazily.
    const {
      midiInput, isAppleMobile, initWebMIDI,
      rescanMidi, startMidiAutoRescan, stopMidiAutoRescan,
    } = _midi;

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
    const detectChord = PianoCore.detectChord;
    const _midiH = ShellMidiHandlers.createShellMidiHandlers(/** @type {any} */ ({
      state, getPractice: () => practice,
      ctx, config: CONFIG,
      noteDisplayEl: DOM.noteDisplay,
      spawnBurst, spawnStream, ripples, Ripple,
      hideIntroHint: () => hideIntroHint(),
      effectGlowPulse,
      finalizeNoteHold: (/** @type {any} */ midi) => finalizeNoteHold(midi),
      qhOptsMidi: QH_OPTS_MIDI, psOpts: PS_OPTS, cwOpts: CW_OPTS, wufOpts: WUF_OPTS,
      shadowBlurEnabled: CONFIG.SHADOW_BLUR_ENABLED,
      t,
      getScreen: _vp.getScreen,
      getKbHeight: _vp.getKbHeight, getKbSafeBottom: _vp.getKbSafeBottom,
    }));
    // Render-loop-wireup earlier in the file captures these via getter
    // thunks (() => onMidiNoteOn etc.), so the destructured consts only
    // need to be defined by the time those thunks fire post-init.
    const {
      midiState, noteThemeColor, showNoteDisplay,
      onMidiNoteOn, onMidiNoteOff, onMidiCC,
      drawMidiKeyboard, drawMidiBeams, drawMidiChordDisplay,
    } = _midiH;
    window.addEventListener('langchange', () => _midiH.refreshLabels());
    const dateKey = PianoCore.formatDateKey;

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
      document, songs: SONGS,
      state, practice, midiInput, midiState, prefs, config: CONFIG,
      getCurrentSong: () => currentSong,
      setCurrentSong: (/** @type {any} */ s) => { currentSong = s; },
      dom: DOM, t, dateKey,
      getOsmd, setOsmd: (/** @type {any} */ o) => _osmd.setOsmd(o),
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

    DevModeWireup.installDevMode(/** @type {any} */ ({
      triggerEl: document.querySelector('.tagline'),
      versionLabel:
        (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '(unknown)') + ' ' +
        (typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''),
      dom: DomBag.pickDom(DOM, 'settingsPanel', 'sectionResult'),
      domAddSong: { modal: DOM_ADDSONG.modal },
      state, practice, prefs, midiInput, midiState, ctx, particles, ripples,
      getScreen: _vp.getScreen, getAudioCtx: _audio.getAudioCtx,
      getCurrentSong: () => currentSong,
      openUserDb, userDbAll, userDbPut, removeUserSong, isAppleMobile,
      t, setLang, applyTheme,
      openSettings, closeSettings, openAddSongModal, closeAddSongModal,
      completePracticeSection: () => completePracticeSection(),
      onMidiNoteOn, onMidiNoteOff, themes: CONFIG.THEMES,
      drawBgStars, drawAurora, drawGroundFlowers,
      decayWakeUpFlash: PianoCore.decayWakeUpFlash, drawCenterGlow: PianoCore.drawCenterGlow,
      wufOpts: WUF_OPTS, getEnergy,
      renderFrame: RenderFrame, audioInit: AudioInit,
    }));

    // Initialize progress on load (so panel works without audio start).
    practice.progress = loadPracticeProgress();
    // Install ▶ Start button — moved into shell-ui.ts (batch 108).
    _ui.installStartButtons();

// Phase 0c kickoff (2026-05-06): real ES module so main.ts can import it
// without a `.d.ts` shim. Enables `allowJs: true` in packages/web/tsconfig.json
// to bring this into the typecheck graph (checkJs stays off — next ratchet).
export {};
