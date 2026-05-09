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

    // ── Audio — dual analyser + software AGC ──
    // Singletons populated by initAudio() / rebuildAudioGraph(). Cast
    // to `any` because every reader is gated by `state.running` which
    // is set after init; pre-init reads never happen at runtime.
    /** @type {any} */ let audioCtx = null;
    /** @type {any} */ let analyser = null;
    /** @type {any} */ let onsetAnalyser = null;
    /** @type {any} */ let gainNode = null;
    /** @type {any} */ let dataArray = null;
    /** @type {any} */ let freqArray = null;
    /** @type {any} */ let onsetDataArray = null;
    /** @type {MediaStream | null} */ let micStream = null;
    /** @type {MediaStreamAudioSourceNode | null} */ let micSourceNode = null;

    async function initAudio() {
      // [Bug fix 2026-05-09] Idempotent re-entry: re-using the existing
      // AudioContext keeps Tone.js's Transport binding intact so a
      // title-round-trip doesn't silently break listen mode.
      if (audioCtx && audioCtx.state !== 'closed') {
        if (audioCtx.state === 'suspended') {
          try { await audioCtx.resume(); } catch (_e) { /* best-effort */ }
        }
        console.log('[AUDIO] re-entry — reusing existing AudioContext (state=' + audioCtx.state + ')');
        // Probe MIDI again so an externally-attached keyboard since
        // the last init shows up. Mic state was already set last
        // time we ran the init flow; don't disturb it.
        try { await initWebMIDI(); } catch (e) { /* fall back to mic */ }
        return;
      }

      console.log("Initializing Audio...");
      audioCtx = AudioInit.createAudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        console.log("AudioContext resumed @" + audioCtx.sampleRate + "Hz");
      }
      // [DIAG-AUDIOCTX] Watch for unexpected state transitions
      AudioInit.wireAudioCtxDiag(audioCtx, REMOTE_LOG_ENABLED);

      // Audio graph (sourceless): gain → analyser, gain → onsetAnalyser.
      rebuildAudioGraph(null);

      await _micLifecycle.decideInitialInputMode();
    }

    const _micLifecycle = MicLifecycle.createMicLifecycle(
      /** @type {import('./mic-lifecycle').MicLifecycleDeps} */ ({
        state: /** @type {any} */ (state),
        micConstraints: AudioInit.MIC_CONSTRAINTS,
        getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
        getAudioCtx: () => /** @type {any} */ (audioCtx),
        getGainNode: () => /** @type {any} */ (gainNode),
        getMicStream: () => micStream,
        setMicStream: (s) => { micStream = /** @type {any} */ (s); },
        getMicSourceNode: () => micSourceNode,
        setMicSourceNode: (n) => { micSourceNode = /** @type {any} */ (n); },
        micMeterEl: DOM.micMeter,
        refreshIntroHint: () => refreshIntroHint(),
        midiInput: /** @type {any} */ ({
          get enabled() { return midiInput?.enabled ?? false; },
        }),
        initWebMIDI: () => initWebMIDI(),
        isAppleMobile: () => isAppleMobile(),
        hasRequestMIDIAccess: () => typeof navigator.requestMIDIAccess === 'function',
      })
    );
    function suspendMic() { _micLifecycle.suspend(); }
    async function resumeMic() { return _micLifecycle.resume(); }

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
      activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : CONFIG.NOTE_NAMES;
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

    // Sentinel for state.activeQuestId when every quest in
    // CONFIG.QUESTS is cleared.
    const QUEST_ALL_DONE = 'ALL_DONE';

    const _encState = PianoCore.initEncouragementState();
    const _encOpts = { tiers: CONFIG.ENCOURAGEMENT_TIERS, displayMs: CONFIG.ENCOURAGEMENT_DISPLAY_MS };

    // ========================================
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

    // ── Multi-Feature Onset Detection (v9 — with harmonicity) ──
    const _onsetDetectDeps = OnsetDetect.buildOnsetDetectDeps({
      state: /** @type {any} */ (state),
      getPractice: () => /** @type {any} */ (practice),
      config: CONFIG,
      getOnsetHysteresisFrames: () => ONSET_HYSTERESIS_FRAMES,
      features: { computeSpectralFlatness, computeSpectralCrest, computeSpectralCentroid, computeHarmonicity, coefficientOfVariation },
      getOnsetAnalyser: () => onsetAnalyser, getOnsetDataArray: () => onsetDataArray, getAudioCtx: () => audioCtx,
    });
    /** @param {number} timeMs @param {number} currentPitchHz */
    function updateMultiFeatureOnset(timeMs, currentPitchHz) {
      return OnsetDetect.updateMultiFeatureOnset(timeMs, currentPitchHz, _onsetDetectDeps);
    }

    // ── Session Confidence Layer ──
    const _sessionConfidenceDeps = /** @type {import('./session-confidence-ui').SessionConfidenceDeps} */ ({
      state: /** @type {any} */ (state),
      sessionRing,
      tuning: {
        sampleIntervalMs: CONFIG.SESSION_SAMPLE_INTERVAL_MS, windowMs: CONFIG.SESSION_WINDOW_MS,
        confirmThreshold: CONFIG.SESSION_CONFIRM_THRESHOLD, loseThreshold: CONFIG.SESSION_LOSE_THRESHOLD,
        warmupMs: CONFIG.SESSION_WARMUP_MS, motivationGoalMs: CONFIG.MOTIVATION_GOAL_MS,
        ringCap: SESSION_RING_CAP,
      },
      dom: { sessionStatus: DOM.sessionStatus }, t, triggerEffect,
    });
    /** @param {number} timeMs @param {boolean} isPianoDetected */
    function updateSessionConfidence(timeMs, isPianoDetected) {
      SessionConfidenceUi.updateSessionConfidence(timeMs, isPianoDetected, _sessionConfidenceDeps);
    }

    const _questState = PianoCore.initQuestTrackerState();
    // Share the underlying array so state.completedQuests stays in sync
    // automatically (no per-tick copy needed).
    _questState.completedIds = state.completedQuests;
    const _questOpts = { throttleMs: 300, postCompletionDelayMs: 2500 };

    const _questStateUpdate = QuestStateUpdate.createQuestStateUpdate(/** @type {any} */ ({
      state, trackerState: _questState,
      quests: CONFIG.QUESTS, allDoneSentinel: QUEST_ALL_DONE,
      applyQuestTick: PianoCore.applyQuestTick,
      observation: state, // quest.condition reads state.combo, state.flow, etc.
      questOpts: _questOpts,
      dom: DomBag.pickDom(DOM, 'toastTitle', 'toastSub', 'questToast', 'questLabel', 'questDots', 'questDisplay'),
      t, spawnBurst, effectGoldenBurst,
      getScreen: () => ({ W, H }),
      setTimeout: (/** @type {any} */ fn, /** @type {any} */ ms) => setTimeout(fn, ms),
      toastHideMs: 2600,
    }));
    /** @param {any} timeMs */ function updateQuestState(timeMs) { _questStateUpdate.tick(timeMs); }

    // ── Quality Scoring — simplified for kids ──

    const clamp01 = PianoCore.clamp01;

    // moved to packages/web/src/core-opts.ts.
    const _coreOpts = CoreOpts.createCoreOpts({
      config: CONFIG,
      detectChord: /** @type {any} */ (PianoCore.detectChord),
    });
    const QH_OPTS_MIC = _coreOpts.qhOptsMic;
    const QH_OPTS_MIDI = _coreOpts.qhOptsMidi;
    const PS_OPTS = _coreOpts.psOpts;
    const CW_OPTS = _coreOpts.cwOpts;
    const WUF_OPTS = _coreOpts.wufOpts;

    // packages/web/src/quality-update.ts.
    const _qualityUpdate = QualityUpdate.createQualityUpdate(
      /** @type {import('./quality-update').QualityUpdateDeps} */ ({
        state: /** @type {any} */ (state),
        tuning: { updateIntervalMs: CONFIG.SCORE_UPDATE_INTERVAL_MS, rhythmWeight: CONFIG.SCORE_RHYTHM_WEIGHT, dynamicsWeight: CONFIG.SCORE_DYNAMICS_WEIGHT, stabilityWeight: CONFIG.SCORE_STABILITY_WEIGHT, smoothing: CONFIG.SCORE_SMOOTHING, displayedScoreFloor: 0.25, },
        scoringOpts: { ioiIdealCV: CONFIG.IOI_IDEAL_CV, ioiMaxCV: CONFIG.IOI_MAX_CV, dynamicsIdealCVMin: CONFIG.DYNAMICS_IDEAL_CV_MIN, dynamicsIdealCVMax: CONFIG.DYNAMICS_IDEAL_CV_MAX, growthWindowMs: CONFIG.GROWTH_WINDOW_MS, },
        fns: { computeRhythmScore: PianoCore.computeRhythmScore, computeDynamicsScore: PianoCore.computeDynamicsScore, computeStabilityScore: PianoCore.computeStabilityScore, updateGrowthTrend: PianoCore.updateGrowthTrend, buildCoachingFeedback: PianoCore.buildCoachingFeedback, },
        qualityScoreEl: DOM.qualityScore,
        t,
      })
    );
    /** @param {any} timeMs */ function updateQualityScores(timeMs) { _qualityUpdate.tick(timeMs); }

    // ── Software AGC — with v9 voice suppression ──
    // packages/web/src/agc-controller.ts.
    const _agcDeps = /** @type {import('./agc-controller').AgcControllerDeps} */ ({
      state: /** @type {any} */ (state),
      tuning: {
        updateIntervalMs: CONFIG.AGC_UPDATE_INTERVAL_MS,
        silenceFloor: CONFIG.AGC_SILENCE_FLOOR, voiceSuppressMax: CONFIG.AGC_VOICE_SUPPRESS_MAX,
        maxGain: CONFIG.AGC_MAX_GAIN, minGain: CONFIG.AGC_MIN_GAIN, targetRms: CONFIG.AGC_TARGET_RMS,
        attackCoeff: CONFIG.AGC_ATTACK_COEFF, releaseCoeff: CONFIG.AGC_RELEASE_COEFF,
      },
      getGainNode: () => gainNode, getAudioCtx: () => audioCtx,
    });
    /** @param {number} timeMs @param {number} postGainRms */
    function updateAGC(timeMs, postGainRms) {
      AgcController.updateAGC(timeMs, postGainRms, _agcDeps);
    }

    // ── Game Logic — 4-layer architecture (v9) ──
    const _gameStateDeps = GameStateUpdate.buildGameStateUpdateDeps({
      state: /** @type {any} */ (state),
      getPractice: () => /** @type {any} */ (practice),
      getMidiInput: () => /** @type {any} */ (midiInput),
      getPitchMedianFrames: () => PITCH_MEDIAN_FRAMES,
      config: CONFIG, qhOptsMic: QH_OPTS_MIC, psOpts: PS_OPTS,
      // PianoCore signatures are slightly wider than the consumed shape — cast to any.
      core: /** @type {any} */ ({
        applyOnsetToHistory: PianoCore.applyOnsetToHistory,
        applyOnsetPitch: PianoCore.applyOnsetPitch,
        applyActivePlay: PianoCore.applyActivePlay,
        decayStability: PianoCore.decayStability,
        stageForFlow: PianoCore.stageForFlow,
        classifyStageTransition: PianoCore.classifyStageTransition,
        pitchHzToSemitones: PianoCore.pitchHzToSemitones,
      }),
      updateMultiFeatureOnset, updateSessionConfidence, updateQualityScores, updateHUD,
      spawnBurst, effectStarShower,
      getScreen: () => ({ W, H }),
      stageLabelEl: DOM.stageLabel, stageLabelText: stageLabel,
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
    });
    /** @param {number} timeMs @param {number} dt @param {{pitch:number, conf:number, rms:number}} pitchResult */
    function updateGameState(timeMs, dt, pitchResult) {
      return GameStateUpdate.updateGameState(timeMs, dt, pitchResult, _gameStateDeps);
    }
    // ── v9: updateHUD — encouragement instead of numbers ──
    /** @param {number} timeMs */
    // moved to packages/web/src/hud-update.ts.
    const _hudUpdate = HudUpdate.createHudUpdate(/** @type {any} */ ({
      state, encState: _encState, encOpts: _encOpts,
      applyEncouragementEvent: PianoCore.applyEncouragementEvent,
      encouragementEl: DOM.encouragement, flowFillEl: DOM.flowFill,
      t, triggerEffect,
    }));
    /** @param {any} timeMs */ function updateHUD(timeMs) { _hudUpdate.tick(timeMs); }

    // ── Debug overlay (v9) — Phase 0d batch 44. ──
    const _debugOverlay = HudUpdate.createDebugOverlay(/** @type {any} */ ({
      state, overlayEl: DOM.debugOverlay,
      tuning: { onsetGateDurationMs: CONFIG.ONSET_GATE_DURATION_MS },
      now: () => performance.now(),
    }));
    function updateDebugOverlay() { _debugOverlay.tick(); }

    // ── Energy calculation ──
    function getEnergy() {
      if (!analyser || state.micSuspended) return 0;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      const binHz = audioCtx.sampleRate / analyser.fftSize;
      const s = Math.floor(CONFIG.PIANO_FREQ_MIN / binHz);
      const e = Math.min(Math.floor(CONFIG.PIANO_FREQ_MAX / binHz), dataArray.length);
      for (let i = s; i < e; i++) sum += dataArray[i];
      return sum / ((e - s) * 255);
    }

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
      getAudioCtx: () => audioCtx, getAnalyser: () => analyser,
      getDataArray: () => dataArray, getFreqArray: () => /** @type {any} */ (freqArray),
      particles, ripples, Particle, Ripple,
      dom: /** @type {any} */ (DomBag.pickDom(DOM,
        'micMeter', 'micMeterFill', 'introHint', 'noteDisplay',
        'startScreen', 'songPanel', 'sessionSummary', 'sectionResult',
      )),
      drawBgStars, drawAurora, drawGroundFlowers,
      detectPitchYIN, updateAGC, updateGameState, hideIntroHint,
      getUpdatePractice: () => updatePractice,
      freqToNote: /** @type {any} */ (freqToNote),
      getNoteColor, spawnBurst, spawnStream, showNoteDisplay, isFreeplayActive,
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
      invalidateFlowCache: () => _hudUpdate.invalidateFlowCache(),
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

    // ========================================
    /** @type {any} OSMD instance (typed `any` because OSMD's surface is wide and version-fragile;
     *  consumers go through osmdAdapter for the typed boundary). */
    let osmd = null;

    const _osmdInit = OsmdInit.createOsmdInit({
      opensheetmusicdisplay: typeof opensheetmusicdisplay !== 'undefined' ? opensheetmusicdisplay : undefined,
      getCurrentSong: () => /** @type {any} */ (currentSong),
    });
    async function initOsmd() { osmd = /** @type {any} */ (await _osmdInit.initOsmd()); return osmd; }

    /** @param {import('@piano/core').MeasureTimingResult|null|undefined} xmlMeasureTiming
     *  @param {import('@piano/core').ScoreTiming|null|undefined} scoreTiming */
    function extractNotesFromOsmd(xmlMeasureTiming, scoreTiming) {
      return NoteExtractor.extractNotesFromOsmd(osmd, { xmlMeasureTiming, scoreTiming, collectDiag: REMOTE_LOG_ENABLED });
    }

    // @piano/core/library/{score-timing, measure-timing} — handles mid-bar
    // tempo events + partial-measure exporters (la Campanella m=5 case).
    const parseScoreTimingFromXml = PianoCore.parseScoreTimingFromXml;
    const buildMeasureTimingFromXml = PianoCore.buildMeasureTimingFromXml;

    const _playbackOrder = PlaybackOrder.createPlaybackOrder({
      fns: {
        parsePlaybackOrderFromXml: PianoCore.parsePlaybackOrderFromXml,
        expandNotesByPlaybackOrder: /** @type {any} */ (PianoCore.expandNotesByPlaybackOrder),
      },
      fetch: (...args) => fetch(...args),
    });
    /** @param {any} [forSong] */
    async function fetchPlaybackOrder(forSong) {
      return _playbackOrder.fetchPlaybackOrder(/** @type {any} */ (forSong || currentSong));
    }
    /** @param {Parameters<typeof PianoCore.expandNotesByPlaybackOrder>[0]} baseNotes
     *  @param {Parameters<typeof PianoCore.expandNotesByPlaybackOrder>[1]} order
     *  @param {ReadonlyArray<{TempoInBPM?:number, Duration?:{realValue:number}}>} measures
     *  @param {number[]=} sourceMeasureStartSec */
    function expandNotesByPlaybackOrder(baseNotes, order, measures, sourceMeasureStartSec) {
      return _playbackOrder.expandNotesByPlaybackOrder(
        /** @type {any} */ (baseNotes), /** @type {any} */ (order),
        /** @type {any} */ (measures), sourceMeasureStartSec,
      );
    }

    // @piano/core/library/diag-load. The shim threads the legacy remoteLog as the logger.
    /** @param {Parameters<typeof PianoCore.dumpLoadDiagnostics>[0]} p */
    function dumpLoadDiagnostics(p) { PianoCore.dumpLoadDiagnostics(p, remoteLog); }

    const _scoreLoader = ScoreLoader.createScoreLoader(/** @type {any} */ ({
      getCurrentSong: () => currentSong,
      initOsmd, getOsmd: () => osmd,
      parseScoreTimingFromXml, buildMeasureTimingFromXml,
      extractNotesFromOsmd, fetchPlaybackOrder,
      expandNotesByPlaybackOrder, buildSectionsFromDefs,
      dumpLoadDiagnostics,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
    }));
    async function loadCurrentScore() { await _scoreLoader.loadCurrentScore(); }

    const _osmdCursor = OsmdCursor.createOsmdCursor({
      getOsmd: () => /** @type {any} */ (osmd),
      getContainer: () => DOM.osmdContainer,
    });
    function osmdScrollToCursor() { _osmdCursor.scrollToCursor(); }

    // OSMD adapter — moved to packages/web/src/osmd-adapter.ts (batch 99).
    const osmdAdapter = OsmdAdapterMod.createOsmdAdapter({
      getOsmd: () => osmd, getCurrentSong: () => currentSong,
      initOsmd, extractNotesFromOsmd, cursor: _osmdCursor,
    });
    // Promote to globalThis so Phase 0c-extracted modules can resolve it
    // bare (matches the Tone / OSMD / JSZip / PianoCore main.ts globals).
    globalThis.osmdAdapter = osmdAdapter;

    // ── Practice state + tunable constants ──
    let COUNT_IN_MS = 4000;            // pre-roll before the first note (4 beats)
    let LANE_LOOKAHEAD_MS = 4000;      // how far ahead notes appear in the lane

    // Song's quarter-note duration at the kid's chosen tempo. Falls back to a
    const _practiceTimings = PracticeTimings.createPracticeTimings(/** @type {any} */ ({
      getPractice: () => practice, getCurrentSong: () => currentSong,
      fns: { practiceBeatMs: PianoCore.practiceBeatMs, computePracticeTimings: PianoCore.computePracticeTimings },
      setCountInMs: (/** @type {any} */ ms) => { COUNT_IN_MS = ms; },
      setLaneLookaheadMs: (/** @type {any} */ ms) => { LANE_LOOKAHEAD_MS = ms; },
      getPracticeLane: () => _practiceLane,
      sectionBannerEl: DOM.sectionBanner, t,
    }));
    function practiceBeatMs() { return _practiceTimings.practiceBeatMs(); }
    function recomputePracticeTimings() { _practiceTimings.recomputePracticeTimings(); }

    // Hit windows + audio-offset constants — early presses punished harder than late.
    const HIT_WINDOW_EARLY_MS = PianoCore.HIT_WINDOW_EARLY_MS;
    const HIT_WINDOW_MS = PianoCore.HIT_WINDOW_MS;
    const PERFECT_MS = PianoCore.PERFECT_MS;
    const CHORD_MATE_TOLERANCE_MS = PianoCore.CHORD_MATE_TOLERANCE_MS;
    const DURATION_MIN_TOL_MS = PianoCore.DURATION_MIN_TOL_MS;
    const DURATION_TOL_FRACTION = PianoCore.DURATION_TOL_FRACTION;
    const DEFAULT_AUDIO_OFFSET_MS = CoreOpts.DEFAULT_AUDIO_OFFSET_MS;
    const ONSET_HYSTERESIS_FRAMES = CoreOpts.ONSET_HYSTERESIS_FRAMES;
    const PITCH_MEDIAN_FRAMES = CoreOpts.PITCH_MEDIAN_FRAMES;

    const practice = /** @type {any} */ (PracticeStateInit.createInitialPractice(
      prefs.audioOffsetMs != null ? prefs.audioOffsetMs : DEFAULT_AUDIO_OFFSET_MS,
    ));

    // ── Section banner + Wake Lock + audio-graph helpers ──
    /** @param {any} sec */ function showSectionBanner(sec) { _practiceTimings.showSectionBanner(sec); }
    const requestWakeLock = PianoWakeLock.requestWakeLock;
    const releaseWakeLock = PianoWakeLock.releaseWakeLock;

    const _audioGraphCfg = {
      fftSize: CONFIG.FFT_SIZE, smoothing: CONFIG.SMOOTHING,
      onsetFftSize: CONFIG.ONSET_FFT_SIZE, onsetSmoothing: CONFIG.ONSET_SMOOTHING,
    };
    /** Spread a freshly-built graph onto the shell-local node refs. Shared by
     *  rebuildAudioGraph() (initAudio) + _audioRecovery.applyContext (visibility
     *  recovery) so the two stay in lock-step. */
    function _applyAudioGraph(/** @type {any} */ g) {
      gainNode = g.gainNode; analyser = g.analyser; onsetAnalyser = g.onsetAnalyser;
      dataArray = g.dataArray; freqArray = g.freqArray; onsetDataArray = g.onsetDataArray;
      micSourceNode = g.micSourceNode;
    }
    function _resetOnsetState() { state.prevSpectrum = null; state.spectralFluxHistory = []; }
    /** @param {MediaStream|null} prevMicStream */
    function rebuildAudioGraph(prevMicStream) {
      _applyAudioGraph(AudioInit.buildAudioGraph(audioCtx, prevMicStream, _audioGraphCfg, !!state.micSuspended));
      _resetOnsetState();
    }

    // WebKit Bugs 237878 / 261554 (open as of 2025): suspend/resume alone is
    // unreliable on iOS WKWebView — close + recreate the AudioContext on
    // visibility / devicechange.
    const _audioRecovery = AudioInit.createAudioRecovery({
      getSnapshot: () => ({ audioCtx, gainNode, analyser, onsetAnalyser, micSourceNode, micStream }),
      applyContext: (newCtx, graph) => {
        audioCtx = newCtx;
        _applyAudioGraph(graph);
        // [DIAG-AUDIOCTX] Re-bind the state listener — the old one went away with the old context.
        AudioInit.wireAudioCtxDiag(audioCtx, REMOTE_LOG_ENABLED, undefined, '(post-recovery)');
      },
      isMicSuspended: () => !!state.micSuspended,
      config: _audioGraphCfg,
      resetOnsetState: _resetOnsetState,
      onAfterRecovery: () => {
        // iOS WKWebView contract: post-background the audio engine is
        if (practice.enabled) {
          practice.enabled = false;
          try { stopPracticeAudio(); } catch (_) {}
        }
      },
    });

    // ── MIDI shell — the entire MIDI cluster (state + dispatch + indicator
    //   + ports + rescan + init + intro-diag + BLE-MIDI + audio-lifecycle
    //   hook) lives in packages/web/src/shell-midi.ts (Phase 0d batch 101).
    const _midi = ShellMidi.createShellMidi(/** @type {any} */ ({
      state, practice,
      getAudioCtx: () => audioCtx,
      dom: { midiBadge: DOM.midiBadge, ptbInput: DOM.ptbInput, introHint: DOM.introHint, micMeter: DOM.micMeter },
      t, navigator,
      suspendMic, resumeMic,
      refreshIntroHint: () => refreshIntroHint(),
      showHitChip: (/** @type {any} */ kind, /** @type {any} */ msg) => showHitChip(kind, msg),
      onMidiNoteOn, onMidiNoteOff, onMidiCC, matchNoteOnset,
      recover: () => _audioRecovery.recover(),
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

    // ── MIDI state + per-note color/screen helpers ──
    const midiState = /** @type {any} */ ({
      activeNotes: new Map(),     // midiNum -> { velocity, onTimeMs, synColor }
      sustainOn: false,
      sustainedNotes: new Set(),  // released keys held by pedal
      recentOnsets: [],           // {midi, timeMs} within 80ms — chord candidate
      lastChordName: '', lastChordTimeMs: 0,
    });

    const detectChord = PianoCore.detectChord;

    /** @param {number} midiNum */
    function midiToScreenX(midiNum) { return ((midiNum - CONFIG.PIANO_KEY_MIN) / CONFIG.PIANO_KEY_COUNT) * W; }
    /** @param {number} midiNum */
    const noteThemeColor = (midiNum) => PianoCore.noteThemeColor(midiNum, CONFIG.THEMES[state.currentTheme]);
    /** @param {number} midiNum */
    const synColorFor = (midiNum) =>
      PianoCore.synColorFor(midiNum, {
        enabled: state.useSynesthesiaMode,
        noteNames: CONFIG.NOTE_NAMES,
        colorMap: CONFIG.NOTE_COLORS,
      });

    /** @param {string} displayText @param {string} changeKey @param {string|null|undefined} color @param {number} timeMs */
    function showNoteDisplay(displayText, changeKey, color, timeMs) {
      // In practice mode the falling lane already shows the just-played note,
      // so showing noteDisplay where it overlaps the score is visual noise.
      if (practice.enabled) return;
      state.noteShowTimeMs = timeMs;
      if (state.lastDetectedNote === changeKey) return;
      state.lastDetectedNote = changeKey;
      DOM.noteDisplay.textContent = displayText;
      DOM.noteDisplay.style.color = color || '';
      DOM.noteDisplay.style.textShadow = color ? ('0 0 20px ' + color) : '';
      DOM.noteDisplay.classList.add('visible');
    }

    const _midiHandlerDeps = /** @type {any} */ ({
      state, midiState, practice,
      midiToScreenX, noteThemeColor, synColorFor, spawnBurst, spawnStream,
      ripples, Ripple,
      hideIntroHint, showNoteDisplay, effectGlowPulse, finalizeNoteHold,
      applyOnsetToHistory: PianoCore.applyOnsetToHistory,
      applyOnsetPitch: PianoCore.applyOnsetPitch,
      applyOnsetToWindow: PianoCore.applyOnsetToWindow,
      triggerWakeUpFlash: PianoCore.triggerWakeUpFlash,
      qhOptsMidi: QH_OPTS_MIDI, psOpts: PS_OPTS, cwOpts: CW_OPTS, wufOpts: WUF_OPTS,
      config: { NOTE_NAMES: CONFIG.NOTE_NAMES, COMBO_WINDOW_MS: CONFIG.COMBO_WINDOW_MS },
      getHeight: () => H,
    });

    /** @param {number} midiNum @param {number} velocity */
    function onMidiNoteOn(midiNum, velocity) { MidiHandlers.onMidiNoteOn(midiNum, velocity, _midiHandlerDeps); }
    /** @param {number} midiNum */
    function onMidiNoteOff(midiNum) { MidiHandlers.onMidiNoteOff(midiNum, _midiHandlerDeps); }
    /** @param {number} cc @param {number} value */
    function onMidiCC(cc, value) { MidiHandlers.onMidiCC(cc, value, _midiHandlerDeps); }

    const _midiRender = MidiRender.createMidiRender({
      ctx,
      midiState: /** @type {any} */ (midiState),
      practice: /** @type {any} */ (practice),
      getLayout: () => ({ W, H, kbHeight, kbSafeBottom }),
      drawMidiKeyboard: PianoCore.drawMidiKeyboard, drawMidiBeams: PianoCore.drawMidiBeams,
      midiToScreenX, noteThemeColor,
      chordMateToleranceMs: CHORD_MATE_TOLERANCE_MS,
      shadowBlurEnabled: CONFIG.SHADOW_BLUR_ENABLED,
      sustainLabel: t('sustainLabel'),
    });
    function drawMidiKeyboard() { _midiRender.drawKeyboard(); }
    /** @param {any} timeMs */ function drawMidiBeams(timeMs) { _midiRender.drawBeams(timeMs); }
    /** @param {any} timeMs */ function drawMidiChordDisplay(timeMs) { _midiRender.drawChordDisplay(timeMs); }
    // Refresh the sustainLabel on language change.
    window.addEventListener('langchange', () =>
      _midiRender.setLabels({ sustainLabel: t('sustainLabel') })
    );

    const _practiceScoring = PracticeScoring.createPracticeScoring(/** @type {any} */ ({
      state, practice,
      tuning: {
        hitWindowEarlyMs: HIT_WINDOW_EARLY_MS, hitWindowMs: HIT_WINDOW_MS, perfectMs: PERFECT_MS,
        chordMateToleranceMs: CHORD_MATE_TOLERANCE_MS,
        durationMinTolMs: DURATION_MIN_TOL_MS, durationTolFraction: DURATION_TOL_FRACTION,
        countInMs: COUNT_IN_MS,
      },
      Tone: typeof Tone !== 'undefined' ? Tone : undefined,
      showHitChip, spawnBurst, getScreen: () => ({ W, H }), t, midiToName, remoteLog,
    }));
    function medianRecentPitch() { return _practiceScoring.medianRecentPitch(); }
    /** @param {number} detectedMidi @param {boolean} isExact */
    function matchNoteOnset(detectedMidi, isExact) { return _practiceScoring.matchNoteOnset(detectedMidi, isExact); }
    /** @param {number} detectedMidi */
    function finalizeNoteHold(detectedMidi) { _practiceScoring.finalizeNoteHold(detectedMidi); }
    function practiceRealElapsedMs() { return _practiceScoring.practiceRealElapsedMs(); }
    function practiceElapsedMs() { return _practiceScoring.practiceElapsedMs(); }

    const dateKey = PianoCore.formatDateKey;
    const _practiceProgress = PracticeProgress.createPracticeProgress(/** @type {any} */ ({
      storage: _prefsStore,
      core: {
        migrateAndDefaultProgress: PianoCore.migrateAndDefaultProgress,
        getSongProgress: PianoCore.getSongProgress,
        recordPracticeDay: PianoCore.recordPracticeDay,
        formatDateKey: PianoCore.formatDateKey,
      },
      practice,
    }));
    /** @returns {import('@piano/core').PracticeProgress} */
    function loadPracticeProgress() { return /** @type {any} */ (_practiceProgress.load()); }
    function savePracticeProgress() { _practiceProgress.save(); }
    function songProg() { return /** @type {any} */ (_practiceProgress.songProg(currentSong.id)); }
    function recordPracticeDay() { _practiceProgress.recordPracticeDay(); }

    // ── Tone.js helpers ──
    const _practiceToneAudio = PracticeToneAudio.createPracticeToneAudio(/** @type {any} */ ({
      Tone: typeof Tone !== 'undefined' ? Tone : undefined,
      audioScheduler: AudioScheduler, cursor: osmdAdapter,
      getCountInMs: () => COUNT_IN_MS,
    }));

    /** @param {any} n */ function n_state(n) { return ShellHelpers.noteStateLabel(n); }
    const NOTE_NAMES_JP = CoreOpts.NOTE_NAMES_JP;
    // Hot-path cache — refreshed on langchange so the per-frame lane draw
    // doesn't re-evaluate the prefs.lang ternary 25× per frame.
    let activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : CONFIG.NOTE_NAMES;
    /** @param {number} midi */ function midiToPitchName(midi) { return ShellHelpers.midiToPitchName(midi, activeNoteNames); }
    /** @param {number} midi */ function midiToName(midi) { return ShellHelpers.midiToFullName(midi, activeNoteNames); }

    // ── Section build + start ──
    const _sectionNotesArgs = () => /** @type {any} */ ({ song: currentSong, practice, countInMs: COUNT_IN_MS });
    /** @param {number} sectionIdx */
    function buildSectionNotes(sectionIdx) { return SectionNotes.buildSectionNotes(sectionIdx, _sectionNotesArgs()); }
    function buildFullSongNotes() { return SectionNotes.buildFullSongNotes(_sectionNotesArgs()); }
    /** @param {any[]} sectionNotes */
    function computeHandRanges(sectionNotes) { return SectionNotes.computeHandRanges(sectionNotes); }

    const _startPracticeSection = StartPracticeSection.createStartPracticeSection(/** @type {any} */ ({
      state, practice, prefs,
      getCurrentSong: () => currentSong,
      countInMs: () => COUNT_IN_MS,
      defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      alert: (/** @type {any} */ msg) => alert(msg),
      remoteLog, t, hideIntroHint, syncLayout, setInputIndicator, requestWakeLock, showSectionBanner,
      dom: DomBag.pickDom(DOM, 'ptbSection', 'ptbTempo', 'ptbProgress', 'practiceHud', 'osmdContainer'),
      loadCurrentScore: () => loadCurrentScore(),
      recomputePracticeTimings, buildSectionNotes, buildFullSongNotes, computeHandRanges,
      osmdAdapter,
      resetScrollThrottle: () => _osmdCursor.resetScrollThrottle(),
      osmdScrollToCursor,
      Tone: typeof Tone !== 'undefined' ? Tone : undefined,
      ensureToneInstruments: () => _practiceToneAudio.ensureInstruments(),
      scheduleCountInBeeps: (/** @type {any} */ t) => _practiceToneAudio.scheduleCountIn(t),
      audioScheduler: AudioScheduler,
      getInstruments: () => _practiceToneAudio.getInstruments(),
      practiceBeatMs, pickAudioOffsetMs: PianoCore.pickAudioOffsetMs,
    }));
    /** @param {number} sectionIdx */
    async function startPracticeSection(sectionIdx) { await _startPracticeSection(sectionIdx); }
    function stopPracticeAudio() { _practiceToneAudio.stopPracticeAudio(); }

    // ── Per-frame practice tick — Phase 0d batch 8 wire-up ──
    const updatePractice = PracticeTick.createPracticeTick(/** @type {any} */ ({
      dom: { ptbProgress: DOM.ptbProgress },
      practice, midiInput,
      getOsmd: () => osmd,
      practiceElapsedMs, hitWindowMs: HIT_WINDOW_MS,
      medianRecentPitch, matchNoteOnset, showHitChip, t,
      // Thunk so the live binding (reassigned after createResultCard) is read
      // at section-complete time, not at wire-up time (placeholder TDZ).
      completePracticeSection: () => completePracticeSection(),
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      noteStateLabel: n_state,
    }));

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
      osmdAdapter, osmdScrollToCursor,
      practiceElapsedMs, practiceRealElapsedMs,
      noteThemeColor, midiToPitchName,
      noteColors: CONFIG.NOTE_COLORS, noteNames: CONFIG.NOTE_NAMES,
      laneLookaheadMs: LANE_LOOKAHEAD_MS, countInMs: COUNT_IN_MS,
      hitWindowEarlyMs: HIT_WINDOW_EARLY_MS, hitWindowMs: HIT_WINDOW_MS, perfectMs: PERFECT_MS,
      drawPracticeLane: PianoCore.drawPracticeLane,
      laneLabelL: t('laneLeft'), laneLabelR: t('laneRight'), countInGoLabel: t('countInGo'),
    }));
    /** @param {number} timeMs */ function drawPracticeLane(timeMs) { _practiceLane.draw(timeMs); }
    function refreshLaneOptsI18n() {
      _practiceLane.setLabels({ laneLabelL: t('laneLeft'), laneLabelR: t('laneRight'), countInGoLabel: t('countInGo') });
    }
    window.addEventListener('langchange', refreshLaneOptsI18n);

    // ── Intro-hint UI + hit feedback chip ──
    const _introHintUi = IntroHintUi.createIntroHintUi(/** @type {any} */ ({
      dom: DomBag.pickDom(DOM, 'introHint', 'startScreen', 'hud', 'micMeter'),
      state, midiInput, practice, t,
      getHeight: () => H,
      requestWakeLock: () => requestWakeLock(),
      startMidiAutoRescan: () => startMidiAutoRescan(),
      rescanMidi: (/** @type {any} */ silent) => rescanMidi(silent),
    }));
    /** @param {any} kind @param {any} text */ function showHitChip(kind, text) { _introHintUi.showHitChip(kind, text); }

    // ── Section complete → result screen ──
    const SECTION_IDS = ['A1', 'B', 'A2'];

    // Result-screen tier + unlock gating delegated to @piano/core
    const computeStars = PianoCore.computeStars;
    const resolveResultTier = PianoCore.resolveResultTier;
    const computeUnlocks = PianoCore.computeUnlocks;

    // ─── result-card wire-up (Phase 0d batch 10) ───────────────────
    const _resultCard = ResultCard.createResultCard({
      dom: /** @type {any} */ (DomBag.pickDom(DOM,
        'sectionResult', 'resTitle', 'resSectionName', 'resStars', 'resAcc',
        'resTiming', 'resDuration', 'resDurationRow', 'resCombo', 'resMsg',
        'resUnlock', 'resHistoryWrap', 'resHistoryChart', 'resNext', 'resTryPlay',
      )),
      practice: /** @type {any} */ (practice),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      songProg: () => /** @type {any} */ (songProg()),
      sectionIds: SECTION_IDS,
      stopPracticeAudio, releaseWakeLock, recordPracticeDay, savePracticeProgress,
      computeStars, resolveResultTier, computeUnlocks,
      effectGoldenBurst, effectStarShower, effectFlowerBurst,
      setupHiDPICanvas, clamp01, t,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
    });
    renderResultCard = _resultCard.renderResultCard;
    completePracticeSection = _resultCard.completePracticeSection;

    // ── Song panel UI building — Phase 0d batch 7d wire-up ──
    const _songPanelRender = SongPanelRender.createSongPanelRender(/** @type {any} */ ({
      dom: DomBag.pickDom(DOM,
        'songTitle', 'songComposer', 'streakCount', 'streakCal', 'songBpmHint',
        'tempoRow', 'sectionList', 'ghostToggle', 'metronomeToggle', 'ghostRow',
        'metronomeRow', 'fullSongRow', 'fullSongToggle', 'songStart',
      ),
      practice, getCurrentSong: () => currentSong, songProg: () => songProg(),
      t, dateKey,
    }));
    const renderSongPanel = _songPanelRender.render;

    // intro-hint-ui forwarders (batch 35).
    function refreshIntroHint() { _introHintUi.refreshIntroHint(); }
    function showRunningUI() { _introHintUi.showRunningUI(); }
    function hideIntroHint() { _introHintUi.hideIntroHint(); }
    /** @param {any} e */ function alertAudioInitError(e) { _introHintUi.alertAudioInitError(e); }

    // ─── song-panel wire-up ─────────────────────────────────────────
    SongPanelControls.createSongPanelControls({
      dom: /** @type {any} */ (DomBag.pickDom(DOM, 'ghostToggle', 'metronomeToggle', 'fullSongToggle', 'songBack')),
      practice: /** @type {any} */ (practice),
      renderSongPanel,
      // Thunk so the placeholder-then-reassigned `returnToTitle` reads
      // its live binding at click time (after createPracticeFlow runs).
      returnToTitle: () => returnToTitle(),
    });

    // packages/web/src/boot-session.ts as installSongStartButton.
    BootSession.installSongStartButton(DOM.songStart, /** @type {any} */ ({
      state, practice,
      initAudio, showRunningUI, initBgStars, loop, alertAudioInitError,
      startPracticeSection: (/** @type {any} */ idx) => startPracticeSection(idx),
      songPanel: DOM.songPanel,
    }));

    const _selectSong = SelectSong.createSelectSong(/** @type {any} */ ({
      songs: SONGS, state, practice,
      dom: DomBag.pickDom(DOM, 'osmdContainer', 'songTitle', 'songComposer', 'startScreen', 'songPanel', 'questDisplay'),
      getCurrentSong: () => currentSong,
      setCurrentSong: (/** @type {any} */ s) => { currentSong = s; },
      getOsmd: () => osmd,
      setOsmd: (/** @type {any} */ o) => { osmd = o; },
      clearHighlights: () => _osmdCursor.clearHighlights(),
      t,
      loadPracticeProgress: () => loadPracticeProgress(),
      showRunningUI: () => showRunningUI(),
      renderSongPanel: () => renderSongPanel(),
      initWebMIDI: () => { void initWebMIDI(); },
      loadCurrentScore: () => loadCurrentScore(),
      remoteLogEnabled: REMOTE_LOG_ENABLED,
    }));
    /** @param {any} songId */ function selectSong(songId) { _selectSong.selectSong(songId); }

    document.querySelectorAll('.practice-song-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-song');
        if (id) selectSong(id);
      });
    });

    // ── Add-song modal + Section editor — Phase 0d batches 2, 6 wire-up ──
    // `byId` does NO null-check; missing-id surfaces as a runtime
    // TypeError downstream, which is what we want for shell wiring.
    const byId = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
    /** @type {Record<string, HTMLElement> & {tabs: NodeListOf<Element>, bodies: NodeListOf<Element>}} */
    const DOM_ADDSONG = /** @type {any} */ ({
      modal: byId('addSongModal'), btn: byId('addSongBtn'), closeBtn: byId('addSongCloseBtn'),
      tabs: document.querySelectorAll('.add-song-tab'),
      bodies: document.querySelectorAll('.add-song-tab-body'),
      libraryList: byId('addSongLibraryList'), libraryStatus: byId('addSongLibraryStatus'),
      librarySearch: byId('addSongLibrarySearch'), fileInput: byId('addSongFileInput'),
      pdCheckbox: byId('addSongPdCheckbox'), urlInput: byId('addSongUrlInput'),
      fetchBtn: byId('addSongFetchBtn'), status: byId('addSongStatus'),
      myList: byId('addSongMyList'), userSongList: byId('userSongList'),
      exportBtn: byId('addSongExportBtn'), importBtn: byId('addSongImportBtn'),
      importInput: byId('addSongImportInput'),
    });

    /** Section-editor DOM bag — kept in the shell for the same reason.
     *  @type {Record<string, HTMLElement>} */
    const DOM_SECEDIT = /** @type {any} */ ({
      modal: byId('sectionEditModal'), help: byId('sectionEditHelp'),
      rows: byId('sectionEditRows'), error: byId('sectionEditError'),
      cancelBtn: byId('sectionEditCancelBtn'), saveBtn: byId('sectionEditSaveBtn'),
      closeBtn: byId('sectionEditCloseBtn'),
    });

    // ─── section-editor wire-up ─────────────────────────────────────
    {
      const _sectionEditor = SectionEditor.createSectionEditor(/** @type {any} */ ({
        dom: DomBag.pickDom(DOM_SECEDIT, 'modal', 'help', 'rows', 'error', 'cancelBtn', 'saveBtn', 'closeBtn'),
        openUserDb, userDbStoreName: USER_DB_STORE,
        unzipMxlToXmlText, userDbPut, t, modalFocus,
        // Update in-memory SONGS so a selectSong() right after save picks
        // up the new boundaries without a page reload.
        onSaved: (/** @type {any} */ rec) => {
          const song = SONGS[rec.id];
          if (song) { song.sectionDefs = rec.sectionDefs; song._loaded = false; song.sections = []; }
        },
      }));
      openSectionEditor = _sectionEditor.open;
      closeSectionEditor = _sectionEditor.close;
    }

    // ─── user-songs wire-up ─────────────────────────────────────────
    {
      const _userSongs = UserSongsUi.createUserSongsUi(/** @type {any} */ ({
        dom: DomBag.pickDom(DOM_ADDSONG,
          'modal', 'btn', 'closeBtn', 'tabs', 'bodies',
          'libraryList', 'libraryStatus', 'librarySearch',
          'fileInput', 'pdCheckbox', 'urlInput', 'fetchBtn', 'status',
          'myList', 'userSongList', 'exportBtn', 'importBtn', 'importInput',
        ),
        songs: SONGS,
        getLang: () => prefs.lang,
        getLibrary: () => ONLINE_LIBRARY,
        setLibrary: (/** @type {any} */ entries) => { ONLINE_LIBRARY = entries; },
        fetchLibrary,
        addUserSongFromBlob: _userSongStore.addFromBlob,
        addUserSongFromUrl: _userSongStore.addFromUrl,
        renameUserSong: _userSongStore.rename,
        removeUserSong: _userSongStore.remove,
        registerUserSong: _userSongStore.register,
        userDbAll, userDbPut, unzipMxlToXmlText,
        autoSectionDefs: PianoCore.autoSectionDefs,
        // Thunked so a future section-editor reorder can't capture a stale placeholder.
        openSectionEditor: (/** @type {any} */ id) => openSectionEditor(id),
        selectSong, getCurrentSong: () => currentSong,
        refreshSongPanelHeader: () => {
          if (!currentSong) return;
          DOM.songTitle.textContent = t(currentSong.titleKey);
          DOM.songComposer.textContent = t(currentSong.composerKey);
        },
        t, modalFocus,
      }));
      openAddSongModal = _userSongs.open;
      closeAddSongModal = _userSongs.close;
      renderUserSongButtons = _userSongs.renderUserSongButtons;
    }

    // Hydrate user-added songs at startup so they appear in the picker without
    // requiring the kid to open the add-song modal first.
    loadUserSongs().then((n) => {
      if (n > 0) {
        renderUserSongButtons();
        console.log('[UserSongs] loaded ' + n + ' from IndexedDB');
      }
    });

    // Request persistent storage so iOS Safari ITP / Chrome eviction
    // policies don't drop user-imported songs.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(g => { if (g) console.log('[Storage] persistent storage granted'); }).catch(() => {});
    }

    DevModeWireup.installDevMode({
      triggerEl: /** @type {HTMLElement|null} */ (document.querySelector('.tagline')),
      versionLabel:
        (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '(unknown)') + ' ' +
        (typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''),
      dom: DomBag.pickDom(DOM, 'settingsPanel', 'sectionResult'),
      domAddSong: { modal: DOM_ADDSONG.modal },
      state, practice, prefs, midiInput, midiState, ctx, particles, ripples,
      getScreen: () => ({ W, H }),
      getAudioCtx: () => audioCtx, getCurrentSong: () => currentSong,
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

    const _practiceFlow = PracticeFlow.createPracticeFlow(/** @type {any} */ ({
      dom: {
        ...DomBag.pickDom(DOM,
          'ptbQuit', 'ptbToggleOsmd', 'resQuit', 'resRetry', 'resNext',
          'sumClose', 'homeBtn', 'sumHome', 'resHome', 'practiceHud',
          'osmdContainer', 'songPanel', 'sectionResult', 'sessionSummary',
          'hud', 'questDisplay', 'micMeter', 'startScreen',
        ),
        resTryPlay: byId('resTryPlay'),
      },
      practice, state, midiState,
      getCurrentSong: () => currentSong,
      songProg: () => songProg(),
      startPracticeSection, renderSongPanel, stopPracticeAudio, releaseWakeLock,
      hideIntroHint, stopMidiAutoRescan, resetSession,
    }));
    returnToTitle = _practiceFlow.returnToTitle;

    // Initialize progress on load (so panel works without audio start)
    practice.progress = loadPracticeProgress();

    // ── Start ── (boot-session.installStartButton)
    BootSession.installStartButton(DOM.startBtn, /** @type {any} */ ({
      state, practice,
      initAudio, showRunningUI, initBgStars, loop, alertAudioInitError,
    }));

// Phase 0c kickoff (2026-05-06): real ES module so main.ts can import it
// without a `.d.ts` shim. Enables `allowJs: true` in packages/web/tsconfig.json
// to bring this into the typecheck graph (checkJs stays off — next ratchet).
export {};
