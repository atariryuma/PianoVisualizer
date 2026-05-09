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
    const initAudio = _audio.initAudio;
    const suspendMic = _audio.suspendMic;
    const resumeMic = _audio.resumeMic;

    // ── Viewport — moved to packages/web/src/shell-viewport.ts (batch 114).
    const _vp = ShellViewport.createShellViewport(/** @type {any} */ ({
      canvas: DOM.canvas, ctx, state,
      practiceTopBarEl: DOM.practiceTopBar,
      osmdContainerEl: DOM.osmdContainer,
      dom: DomBag.pickDom(DOM, 'practiceTopBar', 'themeBar', 'osmdContainer'),
      pianoCore: PianoCore,
    }));
    const PERF_TIER_RESOLVED = _vp.perfTier;
    const PERF_PROFILE = _vp.perfProfile;
    const cachedOsmdRect = _vp.cachedOsmdRect;
    const _viewportLayout = _vp.layout;
    const initBgStars = _vp.initBgStars;
    const syncLayout = _vp.syncLayout;

    // ── Theme switching + persisted user preferences ──
    const prefs = /** @type {any} */ (PracticeStateInit.createInitialPrefs());
    const _prefsStore = PrefsStorage.createJSONStore();
    /** @param {any} key @param {any} fallback */ function loadJSON(key, fallback) { return _prefsStore.loadJSON(key, fallback); }
    /** @param {any} key @param {any} val */ function saveJSON(key, val) { _prefsStore.saveJSON(key, val); }
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
    /** @type {() => void} */ let openSettings = () => {};
    /** @type {() => void} */ let closeSettings = () => {};
    /** @type {() => void} */ let refreshSettingsPanel = () => {};
    /** @type {(songId: string) => Promise<void>} */ let openSectionEditor = async () => {};
    /** @type {() => void} */ let closeSectionEditor = () => {};
    /** @type {() => void} */ let openAddSongModal = () => {};
    /** @type {() => void} */ let closeAddSongModal = () => {};
    /** @type {() => void} */ let renderUserSongButtons = () => {};
    /** @type {() => void} */ let returnToTitle = () => {};
    /** @type {() => void} */ let completePracticeSection = () => {};
    /** @type {() => void} */ let renderResultCard = () => {};
    /** @type {() => void} */ let showSessionSummary = () => {};
    /** @type {(animate: boolean) => void} */ let renderSessionSummaryText = (_animate) => {};
    /** @type {(combo: number, flow: number) => import('./session-summary').BestScores} */
    let saveBestScores = (_c, _f) => /** @type {any} */ ({ bestCombo: 0, peakFlow: 0, totalSessions: 0 });
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
    // Bundles t() + stageLabel + applyI18n + theme controls + boot-time
    // <html lang>/applyI18n/title-screen seed + the langchange re-renderer.
    const _i18n = ShellI18n.createShellI18n(/** @type {any} */ ({
      document, prefs, state, config: CONFIG,
      getSongs: () => SONGS,
      savePrefs,
      refreshSettingsPanel: () => refreshSettingsPanel(),
      dom: DOM,
      getCurrentSong: () => currentSong,
      getPractice: () => practice,
      refreshLangCaches: () => _practice.refreshLangCaches(),
      renderSongPanel: () => renderSongPanel(),
      renderResultCard: () => renderResultCard(),
      renderSessionSummaryText: (/** @type {any} */ animate) => renderSessionSummaryText(animate),
    }));
    const t = _i18n.t;
    const stageLabel = _i18n.stageLabel;
    const applyI18n = _i18n.applyI18n;
    const applyTheme = _i18n.applyTheme;
    const applySynesthesia = _i18n.applySynesthesia;
    const setLang = _i18n.setLang;

    // ── Effects + bg-draw — moved to packages/web/src/shell-effects.ts (batch 110).
    const _fx = ShellEffects.createShellEffects(/** @type {any} */ ({
      pianoCore: PianoCore, ctx, state, config: CONFIG,
      getPractice: () => practice,
      perfTier: PERF_TIER_RESOLVED,
      getScreen: _vp.getScreen,
      getBgStars: _vp.getBgStars,
    }));
    const particles = _fx.particles, ripples = _fx.ripples;
    const Particle = _fx.Particle, Ripple = _fx.Ripple;
    const getNoteColor = _fx.getNoteColor;
    const spawnBurst = _fx.spawnBurst, spawnStream = _fx.spawnStream;
    const effectGlowPulse = _fx.effectGlowPulse;
    const effectStarShower = _fx.effectStarShower, effectFlowerBurst = _fx.effectFlowerBurst;
    const effectGoldenBurst = _fx.effectGoldenBurst, triggerEffect = _fx.triggerEffect;
    const drawBgStars = _fx.drawBgStars, drawAurora = _fx.drawAurora, drawGroundFlowers = _fx.drawGroundFlowers;

    const detectPitchYIN = PianoCore.detectPitchYIN;
    const freqToNote = PianoCore.freqToNote;
    const computeSpectralFlatness = PianoCore.computeSpectralFlatness;
    const computeSpectralCrest = PianoCore.computeSpectralCrest;
    const computeSpectralCentroid = PianoCore.computeSpectralCentroid;
    const coefficientOfVariation = PianoCore.coefficientOfVariation;
    const computeHarmonicity = PianoCore.computeHarmonicity;

    // ── Per-frame reducers — moved to packages/web/src/shell-game-update.ts (batch 105).
    const clamp01 = PianoCore.clamp01;
    const _coreOpts = CoreOpts.createCoreOpts({
      config: CONFIG,
      detectChord: /** @type {any} */ (PianoCore.detectChord),
    });
    const QH_OPTS_MIC = _coreOpts.qhOptsMic;
    const QH_OPTS_MIDI = _coreOpts.qhOptsMidi;
    const PS_OPTS = _coreOpts.psOpts;
    const CW_OPTS = _coreOpts.cwOpts;
    const WUF_OPTS = _coreOpts.wufOpts;
    const DEFAULT_AUDIO_OFFSET_MS = CoreOpts.DEFAULT_AUDIO_OFFSET_MS;
    const ONSET_HYSTERESIS_FRAMES = CoreOpts.ONSET_HYSTERESIS_FRAMES;
    const PITCH_MEDIAN_FRAMES = CoreOpts.PITCH_MEDIAN_FRAMES;
    const _encState = PianoCore.initEncouragementState();
    const _encOpts = { tiers: CONFIG.ENCOURAGEMENT_TIERS, displayMs: CONFIG.ENCOURAGEMENT_DISPLAY_MS };
    const _questState = PianoCore.initQuestTrackerState();
    // Share the underlying array so state.completedQuests stays in sync
    // automatically (no per-tick copy needed).
    _questState.completedIds = state.completedQuests;
    const _questOpts = { throttleMs: 300, postCompletionDelayMs: 2500 };
    const QUEST_ALL_DONE = 'ALL_DONE';

    const _gameUpdate = ShellGameUpdate.createShellGameUpdate(/** @type {any} */ ({
      state,
      getPractice: () => practice,
      getMidiInput: () => midiInput,
      config: CONFIG,
      sessionRing, sessionRingCap: SESSION_RING_CAP,
      onsetHysteresisFrames: ONSET_HYSTERESIS_FRAMES,
      pitchMedianFrames: PITCH_MEDIAN_FRAMES,
      features: { computeSpectralFlatness, computeSpectralCrest, computeSpectralCentroid, computeHarmonicity, coefficientOfVariation },
      audio: _audio,
      coreOpts: _coreOpts,
      encState: _encState, encOpts: _encOpts,
      questState: _questState, questOpts: _questOpts, questAllDoneSentinel: QUEST_ALL_DONE,
      dom: DOM, t,
      spawnBurst, effectGoldenBurst, effectStarShower, triggerEffect,
      getScreen: _vp.getScreen,
      stageLabel, remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
    }));
    const updateMultiFeatureOnset = _gameUpdate.updateMultiFeatureOnset;
    const updateSessionConfidence = _gameUpdate.updateSessionConfidence;
    const updateQuestState = _gameUpdate.updateQuestState;
    const updateQualityScores = _gameUpdate.updateQualityScores;
    const updateAGC = _gameUpdate.updateAGC;
    const updateGameState = _gameUpdate.updateGameState;
    const updateHUD = _gameUpdate.updateHUD;
    const updateDebugOverlay = _gameUpdate.updateDebugOverlay;
    const getEnergy = _gameUpdate.getEnergy;

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
      detectPitchYIN, freqToNote,
      updateAGC, updateGameState, updateQuestState, updatePlayTime, updateDebugOverlay, getEnergy,
      getDrawMidiBeams: () => drawMidiBeams,
      getDrawMidiChordDisplay: () => drawMidiChordDisplay,
      getDrawMidiKeyboard: () => drawMidiKeyboard,
      getDrawPracticeLane: () => drawPracticeLane,
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
    /** @param {HTMLCanvasElement} canvas @param {number} w @param {number} h */
    function setupHiDPICanvas(canvas, w, h) {
      return /** @type {CanvasRenderingContext2D} */ (ShellHelpers.setupHiDPICanvas(canvas, w, h));
    }

    // ── Session summary + reset — moved to packages/web/src/shell-session-state.ts (batch 111).
    const _sess = ShellSessionState.createShellSessionState(/** @type {any} */ ({
      state, config: CONFIG, dom: DOM, t,
      loadJSON, saveJSON, stageLabel, formatTime, setupHiDPICanvas,
      sessionRing, sessionRingCap: SESSION_RING_CAP,
      questState: _questState, encState: _encState,
      getMidiState: () => midiState,
      particles, ripples,
      invalidateFlowCache: () => _gameUpdate.invalidateFlowCache(),
      resetMidiDispatch: () => _midi.resetMidiDispatch(),
      remoteLog,
    }));
    saveBestScores = _sess.saveBestScores;
    renderSessionSummaryText = _sess.renderSessionSummaryText;
    showSessionSummary = _sess.showSessionSummary;
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
    const USER_DB_STORE = _lib.USER_DB_STORE;
    const openUserDb = _lib.openUserDb;
    const userDbAll = _lib.userDbAll;
    const userDbPut = _lib.userDbPut;
    const unzipMxlToXmlText = _lib.unzipMxlToXmlText;
    const _userSongStore = _lib.userSongStore;
    const loadUserSongs = _lib.loadUserSongs;
    const removeUserSong = _lib.removeUserSong;
    const fetchLibrary = _lib.fetchLibrary;
    const buildSectionsFromDefs = _lib.buildSectionsFromDefs;

    // ── OSMD shell — moved to packages/web/src/shell-osmd.ts (batch 103).
    const _osmd = ShellOsmd.createShellOsmd(/** @type {any} */ ({
      getCurrentSong: () => currentSong,
      osmdContainer: DOM.osmdContainer,
      opensheetmusicdisplay: typeof opensheetmusicdisplay !== 'undefined' ? opensheetmusicdisplay : undefined,
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      buildSectionsFromDefs,
    }));
    const osmdAdapter = _osmd.osmdAdapter;
    const initOsmd = _osmd.initOsmd;
    const extractNotesFromOsmd = _osmd.extractNotesFromOsmd;
    const loadCurrentScore = _osmd.loadCurrentScore;
    const osmdScrollToCursor = _osmd.osmdScrollToCursor;
    /** Backward-compat alias — the few remaining shell readers expect a getter. */
    function getOsmd() { return _osmd.getOsmd(); }

    // ── Practice cluster — moved to packages/web/src/shell-practice.ts (batch 107).
    // Hit windows — early presses punished harder than late. Pulled here
    // because the shell still needs HIT_WINDOW_MS / PERFECT_MS / etc. for
    // practice-lane wireup.
    const HIT_WINDOW_EARLY_MS = PianoCore.HIT_WINDOW_EARLY_MS;
    const HIT_WINDOW_MS = PianoCore.HIT_WINDOW_MS;
    const PERFECT_MS = PianoCore.PERFECT_MS;
    const CHORD_MATE_TOLERANCE_MS = PianoCore.CHORD_MATE_TOLERANCE_MS;
    const DURATION_MIN_TOL_MS = PianoCore.DURATION_MIN_TOL_MS;
    const DURATION_TOL_FRACTION = PianoCore.DURATION_TOL_FRACTION;

    const requestWakeLock = PianoWakeLock.requestWakeLock;
    const releaseWakeLock = PianoWakeLock.releaseWakeLock;

    // ── Practice cluster — moved to packages/web/src/shell-practice.ts (batch 107).
    const _practice = ShellPractice.createShellPractice(/** @type {any} */ ({
      state, prefs, config: CONFIG, ctx,
      getCurrentSong: () => currentSong,
      dom: DOM,
      hitWindows: { HIT_WINDOW_EARLY_MS, HIT_WINDOW_MS, PERFECT_MS, CHORD_MATE_TOLERANCE_MS, DURATION_MIN_TOL_MS, DURATION_TOL_FRACTION },
      defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      t,
      hideIntroHint: () => hideIntroHint(),
      syncLayout, setInputIndicator, requestWakeLock,
      audioScheduler: AudioScheduler,
      Tone: typeof Tone !== 'undefined' ? Tone : undefined,
      loadCurrentScore: () => _osmd.loadCurrentScore(),
      osmdAdapter: _osmd.osmdAdapter,
      resetScrollThrottle: () => _osmd.resetScrollThrottle(),
      osmdScrollToCursor: () => _osmd.osmdScrollToCursor(),
      getOsmd, getMidiInput: () => midiInput,
      showHitChip: (/** @type {any} */ kind, /** @type {any} */ text) => showHitChip(kind, text),
      spawnBurst,
      getScreen: _vp.getScreen,
      prefsStore: _prefsStore,
      getCompletePracticeSection: () => completePracticeSection,
    }));
    const practice = _practice.practice;
    // Dead forwarders (practiceBeatMs / recomputePracticeTimings /
    // showSectionBanner / matchNoteOnset / midiToScreenX / synColorFor /
    // midiToName / midiToPitchName) removed — only used inside shells now.
    function finalizeNoteHold(/** @type {any} */ m) { _practice.finalizeNoteHold(m); }
    function practiceElapsedMs() { return _practice.practiceElapsedMs(); }
    function practiceRealElapsedMs() { return _practice.practiceRealElapsedMs(); }
    function loadPracticeProgress() { return _practice.loadPracticeProgress(); }
    function savePracticeProgress() { _practice.savePracticeProgress(); }
    function songProg() { return _practice.songProg(); }
    function recordPracticeDay() { _practice.recordPracticeDay(); }
    function startPracticeSection(/** @type {any} */ idx) { return _practice.startPracticeSection(idx); }
    function stopPracticeAudio() { _practice.stopPracticeAudio(); }
    const updatePractice = _practice.updatePractice;
    function midiToPitchName(/** @type {any} */ m) { return _practice.midiToPitchName(m); }

    // ── MIDI shell — the entire MIDI cluster (state + dispatch + indicator
    //   + ports + rescan + init + intro-diag + BLE-MIDI + audio-lifecycle
    //   hook) lives in packages/web/src/shell-midi.ts (Phase 0d batch 101).
    const _midi = ShellMidi.createShellMidi(/** @type {any} */ ({
      state, practice,
      getAudioCtx: _audio.getAudioCtx,
      dom: { midiBadge: DOM.midiBadge, ptbInput: DOM.ptbInput, introHint: DOM.introHint, micMeter: DOM.micMeter },
      t, navigator,
      suspendMic, resumeMic,
      refreshIntroHint: () => refreshIntroHint(),
      showHitChip: (/** @type {any} */ kind, /** @type {any} */ msg) => showHitChip(kind, msg),
      getOnMidiNoteOn: () => onMidiNoteOn,
      getOnMidiNoteOff: () => onMidiNoteOff,
      getOnMidiCC: () => onMidiCC,
      getMatchNoteOnset: () => _practice.matchNoteOnset,
      recover: _audio.recover,
      isRunning: () => !!state.running,
      requestWakeLock: () => requestWakeLock(),
    }));
    const midiInput = _midi.midiInput;
    const bleMidi = _midi.bleMidi;
    function isAppleMobile() { return _midi.isAppleMobile(); }
    function setInputIndicator() { _midi.setInputIndicator(); }
    async function initWebMIDI() { return _midi.initWebMIDI(); }
    /** @param {any} [silent] */ function rescanMidi(silent) { return _midi.rescanMidi(silent); }
    function startMidiAutoRescan() { _midi.startMidiAutoRescan(); }
    function stopMidiAutoRescan() { _midi.stopMidiAutoRescan(); }

    // ─── settings-panel wire-up ──────────────────────────────────────
    // Settings-panel uses different prop names than DOM.*, so the remap is
    // explicit (no pickDom shortcut). applyDebug seed runs immediately so
    // the persisted-prefs debug overlay state is honored across reloads.
    {
      const _settings = SettingsPanel.createSettingsPanel(/** @type {any} */ ({
        dom: {
          panel: DOM.settingsPanel, openBtn: DOM.settingsBtn, closeBtn: DOM.settingsCloseBtn,
          audioOffsetSlider: DOM.audioOffsetSlider, audioOffsetVal: DOM.audioOffsetVal,
          audioOffsetAuto: DOM.audioOffsetAuto, audioOffsetReset: DOM.audioOffsetReset,
          rescanBtn: DOM.settingsRescanBtn, bleBtn: DOM.settingsBleBtn,
          resetBtn: DOM.settingsResetBtn, inputStatus: DOM.settingsInputStatus,
          debugToggle: DOM.settingsDebugToggle, debugOverlay: DOM.debugOverlay,
        },
        prefs, practice, state, midiInput,
        defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
        savePrefs, t, modalFocus,
        rescanMidi: () => { void rescanMidi(); },
        connectBleMidi: () => _midi.connectBleMidi(),
        showSessionSummary: () => showSessionSummary(),
      }));
      openSettings = _settings.open;
      closeSettings = _settings.close;
      refreshSettingsPanel = _settings.refresh;
      _settings.applyDebug(prefs.debug);
    }

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
      chordMateToleranceMs: CHORD_MATE_TOLERANCE_MS,
      shadowBlurEnabled: CONFIG.SHADOW_BLUR_ENABLED,
      t,
      getScreen: _vp.getScreen,
      getKbHeight: _vp.getKbHeight, getKbSafeBottom: _vp.getKbSafeBottom,
    }));
    // Forwarders (function declarations — hoisted, so render-loop-wireup
    // earlier in the file captures the live binding).
    const midiState = _midiH.midiState;
    function noteThemeColor(/** @type {any} */ m) { return _midiH.noteThemeColor(m); }
    function showNoteDisplay(/** @type {any} */ a, /** @type {any} */ b, /** @type {any} */ c, /** @type {any} */ d) { _midiH.showNoteDisplay(a, b, c, d); }
    function onMidiNoteOn(/** @type {any} */ m, /** @type {any} */ v) { _midiH.onMidiNoteOn(m, v); }
    function onMidiNoteOff(/** @type {any} */ m) { _midiH.onMidiNoteOff(m); }
    function onMidiCC(/** @type {any} */ cc, /** @type {any} */ v) { _midiH.onMidiCC(cc, v); }
    function drawMidiKeyboard() { _midiH.drawMidiKeyboard(); }
    function drawMidiBeams(/** @type {any} */ t) { _midiH.drawMidiBeams(t); }
    function drawMidiChordDisplay(/** @type {any} */ t) { _midiH.drawMidiChordDisplay(t); }
    window.addEventListener('langchange', () => _midiH.refreshLabels());
    const dateKey = PianoCore.formatDateKey;

    // ── Practice lane ──
    const _practiceLane = PracticeLane.createPracticeLane(/** @type {any} */ ({
      ctx, practice, state, midiInput,
      getLayout: () => {
        const { W, H } = _vp.getScreen();
        return {
          W, H, kbHeight: _vp.getKbHeight(), kbSafeBottom: _vp.getKbSafeBottom(), safeRight: _vp.getSafeRight(),
          currentLayoutMode: _viewportLayout.getCurrentLayoutMode(),
          cachedOsmdRect,
          osmdContainerVisible: !!(DOM.osmdContainer && DOM.osmdContainer.classList.contains('visible')),
        };
      },
      getCurrentSong: () => currentSong,
      osmdAdapter, osmdScrollToCursor: () => _osmd.osmdScrollToCursor(),
      practiceElapsedMs, practiceRealElapsedMs,
      noteThemeColor, midiToPitchName,
      noteColors: CONFIG.NOTE_COLORS, noteNames: CONFIG.NOTE_NAMES,
      laneLookaheadMs: _practice.getLaneLookaheadMs(), countInMs: _practice.getCountInMs(),
      hitWindowEarlyMs: HIT_WINDOW_EARLY_MS, hitWindowMs: HIT_WINDOW_MS, perfectMs: PERFECT_MS,
      drawPracticeLane: PianoCore.drawPracticeLane,
      laneLabelL: t('laneLeft'), laneLabelR: t('laneRight'), countInGoLabel: t('countInGo'),
    }));
    _practice.setPracticeLane(_practiceLane);
    /** @param {number} timeMs */ function drawPracticeLane(timeMs) { _practiceLane.draw(timeMs); }
    window.addEventListener('langchange', () =>
      _practiceLane.setLabels({ laneLabelL: t('laneLeft'), laneLabelR: t('laneRight'), countInGoLabel: t('countInGo') }),
    );

    // ── Add-song modal + Section editor — moved to packages/web/src/shell-add-song.ts (batch 102).
    const _addSong = ShellAddSong.createShellAddSong(/** @type {any} */ ({
      document, songs: SONGS,
      getLang: () => prefs.lang,
      getLibrary: () => _lib.getOnlineLibrary(),
      setLibrary: (/** @type {any} */ entries) => _lib.setOnlineLibrary(entries),
      userSongStore: _userSongStore,
      fetchLibrary,
      openUserDb, userDbStoreName: USER_DB_STORE, unzipMxlToXmlText,
      userDbAll, userDbPut,
      autoSectionDefs: PianoCore.autoSectionDefs,
      getCurrentSong: () => currentSong,
      selectSong: (/** @type {any} */ id) => _ui.selectSong(id),
      songPanelHeaderDom: { songTitle: DOM.songTitle, songComposer: DOM.songComposer },
      t, modalFocus,
    }));
    const byId = _addSong.byId;
    const DOM_ADDSONG = _addSong.domAddSong;
    const DOM_SECEDIT = _addSong.domSecEdit;
    openSectionEditor = _addSong.openSectionEditor;
    closeSectionEditor = _addSong.closeSectionEditor;
    openAddSongModal = _addSong.openAddSongModal;
    closeAddSongModal = _addSong.closeAddSongModal;
    renderUserSongButtons = _addSong.renderUserSongButtons;

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
      songProg: () => songProg(),
      loadPracticeProgress, savePracticeProgress, recordPracticeDay,
      startPracticeSection, stopPracticeAudio,
      initAudio, initBgStars, loop, alertAudioInitError: (/** @type {any} */ e) => _ui.alertAudioInitError(e),
      initWebMIDI, startMidiAutoRescan, stopMidiAutoRescan, rescanMidi,
      releaseWakeLock, requestWakeLock,
      hideIntroHint: () => _ui.hideIntroHint(),
      resetSession,
      effectGoldenBurst, effectStarShower, effectFlowerBurst,
      setupHiDPICanvas, clamp01,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      getHeight: () => _vp.getScreen().H,
      byId,
    }));
    function showHitChip(/** @type {any} */ kind, /** @type {any} */ text) { _ui.showHitChip(kind, text); }
    function refreshIntroHint() { _ui.refreshIntroHint(); }
    function showRunningUI() { _ui.showRunningUI(); }
    function hideIntroHint() { _ui.hideIntroHint(); }
    /** @param {any} e */ function alertAudioInitError(e) { _ui.alertAudioInitError(e); }
    renderResultCard = _ui.renderResultCard;
    completePracticeSection = _ui.completePracticeSection;
    const renderSongPanel = _ui.renderSongPanel;
    function selectSong(/** @type {any} */ id) { _ui.selectSong(id); }
    returnToTitle = _ui.returnToTitle;
    _ui.installPracticeSongButtons();

    DevModeWireup.installDevMode({
      triggerEl: /** @type {HTMLElement|null} */ (document.querySelector('.tagline')),
      versionLabel:
        (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '(unknown)') + ' ' +
        (typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''),
      dom: DomBag.pickDom(DOM, 'settingsPanel', 'sectionResult'),
      domAddSong: { modal: DOM_ADDSONG.modal },
      state, practice, prefs, midiInput, midiState, ctx, particles, ripples,
      getScreen: _vp.getScreen,
      getAudioCtx: _audio.getAudioCtx, getCurrentSong: () => currentSong,
      openUserDb: () => openUserDb(), userDbAll: () => userDbAll(),
      userDbPut: (rec) => userDbPut(/** @type {any} */ (rec)),
      removeUserSong: (id) => removeUserSong(id),
      isAppleMobile: () => isAppleMobile(),
      t, setLang, applyTheme,
      openSettings: () => openSettings(), closeSettings: () => closeSettings(),
      openAddSongModal: () => openAddSongModal(), closeAddSongModal: () => closeAddSongModal(),
      completePracticeSection: () => completePracticeSection(),
      onMidiNoteOn, onMidiNoteOff,
      themes: CONFIG.THEMES,
      drawBgStars, drawAurora, drawGroundFlowers,
      decayWakeUpFlash: PianoCore.decayWakeUpFlash,
      drawCenterGlow: PianoCore.drawCenterGlow,
      wufOpts: WUF_OPTS, getEnergy,
      renderFrame: RenderFrame, audioInit: AudioInit,
    });

    // Initialize progress on load (so panel works without audio start).
    practice.progress = loadPracticeProgress();
    // Install ▶ Start button — moved into shell-ui.ts (batch 108).
    _ui.installStartButtons();

// Phase 0c kickoff (2026-05-06): real ES module so main.ts can import it
// without a `.d.ts` shim. Enables `allowJs: true` in packages/web/tsconfig.json
// to bring this into the typecheck graph (checkJs stays off — next ratchet).
export {};
