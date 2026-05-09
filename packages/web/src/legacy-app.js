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

    // ── Canvas (CSS pixel dimensions; mirrors _canvasResize.getDimensions()) ──
    let W = 0;
    let H = 0;
    let kbSafeBottom = 4;
    let kbHeight = 50;
    let safeRight = 0;
    const PERF_TIER_RESOLVED = PianoCore.detectPerfTier();
    const PERF_PROFILE = PianoCore.PERF_PROFILES[PERF_TIER_RESOLVED];
    const _canvasResize = ViewportLayout.createCanvasResize({
      canvas: /** @type {HTMLCanvasElement} */ (DOM.canvas),
      ctx,
      isRunning: () => !!state.running,
      getStarCount: () => PERF_PROFILE.bgStarCount,
      initBackground: (opts) => /** @type {any} */ (PianoCore.initBackground(opts)),
    });
    function resize() {
      const d = _canvasResize.resize();
      W = d.W; H = d.H; kbHeight = d.kbHeight;
      kbSafeBottom = d.kbSafeBottom; safeRight = d.safeRight;
    }
    function initBgStars() { _canvasResize.initBgStars(); }
    resize();
    window.addEventListener('resize', resize);

    // Single source of truth for "where things live on the screen": JS
    const cachedOsmdRect = ViewportLayout.makeCachedOsmdRect();
    const _viewportLayout = ViewportLayout.createViewportLayout({
      dom: /** @type {any} */ (DomBag.pickDom(DOM, 'practiceTopBar', 'themeBar', 'osmdContainer')),
      getKbHeight: () => kbHeight,
      cachedOsmdRect,
    });
    function refreshOsmdRect() { _viewportLayout.refreshOsmdRect(); }
    function syncLayout() { _viewportLayout.syncLayout(); }
    function onResizeBurst() { _viewportLayout.onResizeBurst(); }
    syncLayout();
    window.addEventListener('resize', onResizeBurst);
    window.addEventListener('orientationchange', onResizeBurst);
    if (typeof ResizeObserver !== 'undefined') {
      if (DOM.practiceTopBar) new ResizeObserver(syncLayout).observe(DOM.practiceTopBar);
      // Watch OSMD too — its height changes on score load, OSMD re-render,
      // and any layout-mode flip. Without this, drawPracticeLane would read
      // stale rect after osmd renders fresh notation.
      if (DOM.osmdContainer) new ResizeObserver(refreshOsmdRect).observe(DOM.osmdContainer);
    }

    // ── Theme switching + persisted user preferences ──
    const prefs = /** @type {any} */ (PracticeStateInit.createInitialPrefs());
    const _prefsStore = PrefsStorage.createJSONStore();
    /** @param {any} key @param {any} fallback */ function loadJSON(key, fallback) { return _prefsStore.loadJSON(key, fallback); }
    /** @param {any} key @param {any} val */ function saveJSON(key, val) { _prefsStore.saveJSON(key, val); }
    Object.assign(prefs, PrefsStorage.sanitizePrefs(loadJSON('pianoViz_prefs', {})));
    function savePrefs() { saveJSON('pianoViz_prefs', prefs); }

    // ── i18n — practice-flow strings + t() (Phase 0d batch 4) ──
    /** @type {(key: string, vars?: Record<string, string|number>) => string} */
    const t = PianoCore.createT(PianoCore.T_STRINGS, {
      getLang: () => /** @type {"en"|"jp"} */ (prefs.lang),
      userResolver: (id, which) => {
        // SONGS is declared later — userResolver only fires post-init.
        const song = SONGS?.[id];
        if (!song) return null;
        if (which === 'userTitle') return song._userTitle || id;
        if (which === 'userComposer') return song._userComposer || '';
        return null;
      },
    });

    function applyI18n() { _themeControls.applyI18n(); }
    /** @param {import('./piano-config').PianoConfig['STAGES'][number]} stage */
    const stageLabel = (stage) => PianoCore.stageLabel(stage, t);

    // setLang exposed by _themeControls below (batch 7a).
    const _themeControls = ThemeControls.createThemeControls(/** @type {any} */ ({
      prefs, state, savePrefs,
      t: (/** @type {any} */ key) => t(key),
      refreshSettingsPanel: () => refreshSettingsPanel(),
    }));
    const applyTheme = _themeControls.applyTheme;
    const applySynesthesia = _themeControls.applySynesthesia;
    const setLang = _themeControls.setLang;
    // Seed UI from persisted prefs; createThemeControls' own click handlers
    // take it from there.
    applyTheme(prefs.theme);
    applySynesthesia(prefs.synesthesia);

    // ── Settings panel ──
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

    // Boot-time i18n seed — set <html lang> + walk [data-i18n*] once. Page
    // loads on the title screen — body class drives the home-button hide
    // (no 🏠 when home is right here) + any future title-only styling.
    document.documentElement.lang = prefs.lang === 'jp' ? 'ja' : 'en';
    applyI18n();
    document.body.classList.add('title-screen');
    // langchange handler — refresh hot-path caches + re-render screens
    // with imperative (set-from-JS) localized text. applyI18n only walks
    // [data-i18n*] attrs; these labels need explicit redraw.
    window.addEventListener('langchange', () => {
      _practice.refreshLangCaches();
      laneLabelL = t('laneLeft'); laneLabelR = t('laneRight');
      if (DOM.songPanel?.classList.contains('visible')) renderSongPanel();
      if (DOM.practiceHud?.classList.contains('visible') && currentSong) {
        const sec = currentSong.sections?.[practice.sectionIdx];
        if (sec) DOM.ptbSection.textContent = t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
      }
      if (DOM.sectionResult?.classList.contains('visible')) renderResultCard();
      if (DOM.sessionSummary?.classList.contains('visible')) renderSessionSummaryText(false);
      if (DOM.stageLabel && state.currentStage > 0) {
        DOM.stageLabel.textContent = stageLabel(CONFIG.STAGES[state.currentStage]);
      }
      if (state.lastIntroDiag) state.lastIntroDiag();
    });
    // Lane labels — recomputed on lang change, used in the per-frame draw.
    let laneLabelL = t('laneLeft');
    let laneLabelR = t('laneRight');

    /** @type {InstanceType<typeof PianoCore.Particle>[]} */
    let particles = [];
    /** @type {InstanceType<typeof PianoCore.Ripple>[]} */
    let ripples = [];
    const _particleEffects = ParticleEffects.createParticleEffects({
      pianoCore: /** @type {any} */ (PianoCore),
      getScreen: () => ({ W, H }),
      config: /** @type {any} */ (CONFIG),
      state: /** @type {any} */ (state),
      // `practice` is declared further down the file — use a getter
      // proxy so .enabled is read at call-time (post-init), not at
      // factory-build time (TDZ).
      practice: /** @type {any} */ ({
        get enabled() { return practice?.enabled ?? false; },
      }),
      particles: /** @type {any} */ (particles),
      ripples: /** @type {any} */ (ripples),
      perfTier: PERF_TIER_RESOLVED,
    });
    const Particle = _particleEffects.Particle;
    const Ripple = _particleEffects.Ripple;
    const getNoteColor = _particleEffects.getNoteColor;
    const spawnBurst = _particleEffects.spawnBurst;
    const spawnStream = _particleEffects.spawnStream;
    const effectGlowPulse = _particleEffects.effectGlowPulse;
    const effectStarShower = _particleEffects.effectStarShower;
    const effectFlowerBurst = _particleEffects.effectFlowerBurst;
    const effectGoldenBurst = _particleEffects.effectGoldenBurst;
    const triggerEffect = _particleEffects.triggerEffect;

    const _themeColors = () => CONFIG.THEMES[state.currentTheme].colors;
    /** @param {number} _time */
    const drawBgStars = (_time) => {
      const bg = _canvasResize.getBgStars();
      if (!bg) return;
      PianoCore.drawBgStars(ctx, /** @type {any} */ (bg), { flow: state.flow, themeColors: _themeColors() });
    };
    const _bgOpts = (/** @type {number} */ time) => ({
      screenW: W, screenH: H, flow: state.flow, themeColors: _themeColors(), timeMs: time,
    });
    /** @param {number} time */ const drawAurora = (time) => PianoCore.drawAurora(ctx, _bgOpts(time));
    /** @param {number} time */ const drawGroundFlowers = (time) => PianoCore.drawGroundFlowers(ctx, _bgOpts(time));

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
      getScreen: () => ({ W, H }),
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

    // ── Main Loop ──
    /** @param {number} timeMs */
    const _renderLoop = RenderLoopWireup.wireRenderLoop({
      renderLoop: RenderLoop, renderFrame: RenderFrame, micPipeline: MicPipeline,
      renderMid: RenderMid, renderLate: RenderLate, pianoCore: PianoCore,
      ctx,
      state: /** @type {any} */ (state),
      // practice / midiInput / updatePractice are forward-declared below; thunks
      // defer the read until the builders fire (post-IIFE) so we don't TDZ.
      getPractice: () => /** @type {any} */ (practice),
      getMidiInput: () => /** @type {any} */ (midiInput),
      config: /** @type {any} */ (CONFIG),
      getScreen: () => ({ W, H }),
      getAudioCtx: _audio.getAudioCtx, getAnalyser: _audio.getAnalyser,
      getDataArray: _audio.getDataArray, getFreqArray: /** @type {any} */ (_audio.getFreqArray),
      particles, ripples, Particle, Ripple,
      dom: /** @type {any} */ (DomBag.pickDom(DOM,
        'micMeter', 'micMeterFill', 'introHint', 'noteDisplay',
        'startScreen', 'songPanel', 'sessionSummary', 'sectionResult',
      )),
      drawBgStars, drawAurora, drawGroundFlowers,
      detectPitchYIN, updateAGC, updateGameState, hideIntroHint,
      getUpdatePractice: () => updatePractice,
      freqToNote: /** @type {any} */ (freqToNote),
      getNoteColor, spawnBurst, spawnStream,
      // [TDZ workaround 2026-05-09] Vite/esbuild minification converts
      // the bundled `function showNoteDisplay` declaration (~line 619)
      // to a `let`-style binding, so the shorthand reference here lands
      // inside its temporal dead zone (browser console:
      // "Cannot access 'bo' before initialization" — `bo` is the
      // minified name). Forwarding through a lambda defers the lookup
      // to call time when the binding is set.
      showNoteDisplay: (/** @type {any} */ a, /** @type {any} */ b, /** @type {any} */ c, /** @type {any} */ d) => showNoteDisplay(a, b, c, d),
      isFreeplayActive,
      drawMidiBeams, drawMidiChordDisplay, drawMidiKeyboard, drawPracticeLane,
      updateQuestState, updatePlayTime, updateDebugOverlay, getEnergy,
      wufOpts: WUF_OPTS, remoteLogEnabled: REMOTE_LOG_ENABLED,
      getTone: () => (typeof Tone !== 'undefined' ? Tone : null),
    });
    /** @param {any} timeMs */ function loop(timeMs) { _renderLoop.tick(timeMs); }

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

    // ── Session summary modal — Phase 0d batch 11 wire-up ──
    {
      const _sessionSummary = SessionSummary.createSessionSummary(/** @type {any} */ ({
        dom: DomBag.pickDom(DOM,
          'sessionSummary', 'sumCombo', 'sumStage', 'sumTime',
          'sumQuestList', 'sumBest', 'radarChart',
        ),
        state, config: CONFIG,
        loadJSON, saveJSON, stageLabel, formatTime, t, setupHiDPICanvas,
      }));
      saveBestScores = _sessionSummary.saveBestScores;
      renderSessionSummaryText = _sessionSummary.renderSessionSummaryText;
      showSessionSummary = _sessionSummary.showSessionSummary;
    }

    // packages/web/src/session-reset.ts.
    const _sessionReset = SessionReset.createSessionReset(/** @type {any} */ ({
      refs: {
        state, questState: _questState, encState: _encState,
        getMidiState: () => midiState, sessionRing, ripples, particles,
      },
      reducers: {
        resetQualityHistoryState: PianoCore.resetQualityHistoryState,
        resetQuestTrackerState: PianoCore.resetQuestTrackerState,
        resetEncouragementState: PianoCore.resetEncouragementState,
        resetWakeUpFlashState: PianoCore.resetWakeUpFlashState,
        resetChordWindowState: PianoCore.resetChordWindowState,
      },
      dom: DomBag.pickDom(DOM,
        'stageLabel', 'encouragement', 'qualityScore', 'noteDisplay',
        'questDisplay', 'questDots', 'questLabel', 'questToast',
        'flowFill', 'sessionStatus', 'playTime',
      ),
      sessionRingCap: SESSION_RING_CAP,
      invalidateFlowCache: () => _gameUpdate.invalidateFlowCache(),
      resetMidiDispatch: () => _midi.resetMidiDispatch(),
      remoteLog, now: () => performance.now(),
    }));
    function resetSession() { _sessionReset.reset(); }

    // ── v12: Practice Mode — built-in songs (catalog moved to built-in-songs.ts).
    //   `sectionDefs` = per-song quest layout (startMeasure → next def's
    //   startMeasure). User-imported scores merge into SONGS by id.
    /** @type {any} */
    const SONGS = BuiltInSongs.createBuiltInSongs();
    let currentSong = SONGS.fur_elise;

    // ── User-added songs (IndexedDB-backed; merged into SONGS at boot) ──
    // DB `pianoViz_v1`, store `userSongs`. PianoCore stateless ops live below;
    // parseMusicXmlMetadata + auto-section heuristic delegate to @piano/core.
    const USER_DB_STORE = PianoCore.USER_DB_STORE;
    const _userDb = UserSongsMxl.createUserDb({
      openUserDb: () => PianoCore.openUserDb(),
      userDbAll: PianoCore.userDbAll,
      userDbPut: PianoCore.userDbPut,
      userDbDelete: PianoCore.userDbDelete,
    });
    function openUserDb() { return _userDb.open(); }
    async function userDbAll() { return _userDb.all(); }
    /** @param {import('@piano/core').UserSongRecord} record */
    async function userDbPut(record) { return _userDb.put(/** @type {any} */ (record)); }
    const parseMusicXmlMetadata = PianoCore.parseMusicXmlMetadata;
    const autoSectionDefs = PianoCore.autoSectionDefs;

    /** @param {Blob} blob */
    async function unzipMxlToXmlText(blob) {
      const JSZipLib = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
      if (!JSZipLib) throw new Error('JSZip not available — cannot read .mxl');
      return UserSongsMxl.unzipMxlToXmlText(blob, { jszip: /** @type {any} */ (JSZipLib) });
    }

    // Promote stored-or-just-fetched records into the SONGS registry.
    // (Renamed _userSongs → _userSongStore to free the short name for the
    // UserSongsUi result later — UserSongsUi consumers reference these
    // methods via direct property access so no forwarder layer is needed.)
    const USER_SONG_URL_TIMEOUT_MS = 30000;
    const USER_SONG_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
    const _userSongStore = UserSongsStore.createUserSongsStore(
      /** @type {import('./user-songs-store').UserSongsStoreDeps} */ ({
        userDb: /** @type {any} */ (_userDb), userDbStoreName: USER_DB_STORE,
        unzipMxlToXmlText: /** @type {any} */ (unzipMxlToXmlText),
        fns: { parseMusicXmlMetadata: /** @type {any} */ (parseMusicXmlMetadata), autoSectionDefs: /** @type {any} */ (autoSectionDefs) },
        songs: /** @type {any} */ (SONGS), getPractice: () => /** @type {any} */ (practice),
        savePracticeProgress: () => savePracticeProgress(),
        urlTimeoutMs: USER_SONG_URL_TIMEOUT_MS, maxBytes: USER_SONG_MAX_BYTES,
        fetch: (...args) => fetch(...args),
        AbortController,
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(/** @type {any} */ (id)),
        url: URL, now: () => Date.now(), random: () => Math.random(),
      })
    );
    async function loadUserSongs() { return _userSongStore.loadAll(); }
    /** @param {string} id */
    async function removeUserSong(id) { return _userSongStore.remove(id); }

    // ========================================
    const _onlineLibrary = OnlineLibrary.createOnlineLibrary({
      libraryEntryFromGhFile: /** @type {any} */ (PianoCore.libraryEntryFromGhFile),
      fetch: (...args) => fetch(...args), localStorage, now: () => Date.now(),
    });
    /** @param {boolean} [force] */
    async function fetchLibrary(force) { return _onlineLibrary.fetchEntries(force); }
    /** @type {Array<Partial<import('@piano/core').LibraryEntry> & {url:string, label:string, icon:string}>} */
    let ONLINE_LIBRARY = OnlineLibrary.LIBRARY_SEED.slice();
    const buildSectionsFromDefs = PianoCore.buildSectionsFromDefs;

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
      getScreen: () => ({ W, H }),
      prefsStore: _prefsStore,
      getCompletePracticeSection: () => completePracticeSection,
    }));
    const practice = _practice.practice;
    function practiceBeatMs() { return _practice.practiceBeatMs(); }
    function recomputePracticeTimings() { _practice.recomputePracticeTimings(); }
    function showSectionBanner(/** @type {any} */ sec) { _practice.showSectionBanner(sec); }
    function matchNoteOnset(/** @type {any} */ m, /** @type {any} */ x) { return _practice.matchNoteOnset(m, x); }
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
    function midiToName(/** @type {any} */ m) { return _practice.midiToName(m); }

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
      getMatchNoteOnset: () => matchNoteOnset,
      recover: _audio.recover,
      isRunning: () => !!state.running,
      requestWakeLock: () => requestWakeLock(),
    }));
    const midiInput = _midi.midiInput;
    const bleMidi = _midi.bleMidi;
    function isAppleMobile() { return _midi.isAppleMobile(); }
    function setInputIndicator() { _midi.setInputIndicator(); }
    function attachMidiPort(/** @type {any} */ port) { return _midi.attachMidiPort(port); }
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
      getScreen: () => ({ W, H }),
      getKbHeight: () => kbHeight, getKbSafeBottom: () => kbSafeBottom,
    }));
    // Forwarders (function declarations — hoisted, so render-loop-wireup
    // earlier in the file captures the live binding).
    const midiState = _midiH.midiState;
    function midiToScreenX(/** @type {any} */ m) { return _midiH.midiToScreenX(m); }
    function noteThemeColor(/** @type {any} */ m) { return _midiH.noteThemeColor(m); }
    function synColorFor(/** @type {any} */ m) { return _midiH.synColorFor(m); }
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
      getLayout: () => ({
        W, H, kbHeight, kbSafeBottom, safeRight,
        currentLayoutMode: _viewportLayout.getCurrentLayoutMode(),
        cachedOsmdRect,
        osmdContainerVisible: !!(DOM.osmdContainer && DOM.osmdContainer.classList.contains('visible')),
      }),
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
      getLibrary: () => ONLINE_LIBRARY,
      setLibrary: (/** @type {any} */ entries) => { ONLINE_LIBRARY = entries; },
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
      getHeight: () => H,
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
      getScreen: () => ({ W, H }),
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
