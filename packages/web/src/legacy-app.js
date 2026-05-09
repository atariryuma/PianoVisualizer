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
        const song = (typeof SONGS !== 'undefined') ? SONGS[id] : null;
        if (!song) return null;
        if (which === 'userTitle') return song._userTitle || id;
        if (which === 'userComposer') return song._userComposer || '';
        return null;
      },
    });

    function applyI18n() { _themeControls.applyI18n(); }

    // setLang moved to theme-controls.ts (Phase 0d batch 7a) — exposed
    // as `_themeControls.setLang` after createThemeControls() runs below.

    /** @param {import('./piano-config').PianoConfig['STAGES'][number]} stage */
    const stageLabel = (stage) => PianoCore.stageLabel(stage, t);

    const _themeControls = ThemeControls.createThemeControls({
      prefs: /** @type {any} */ (prefs),
      state: /** @type {any} */ (state),
      savePrefs,
      t: (key) => t(key),
      refreshSettingsPanel: () => refreshSettingsPanel(),
    });
    const applyTheme = _themeControls.applyTheme;
    const applySynesthesia = _themeControls.applySynesthesia;
    const setLang = _themeControls.setLang;
    // Seed the UI from persisted prefs (the click handlers attached
    // inside createThemeControls take care of subsequent updates).
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
    // ESC modal router. Higher priority = topmost-z modal (section-edit
    // can spawn from add-song so it sits above settings).
    const _isOpen = (/** @type {any} */ x) => !!(x?.modal?.classList.contains('visible'));
    const _isVisible = (/** @type {HTMLElement} */ el) => !!el?.classList.contains('visible');
    ModalFocus.createEscRouter({
      document,
      routes: [
        { priority: 50, isOpen: () => _isOpen(typeof DOM_SECEDIT !== 'undefined' ? DOM_SECEDIT : null), close: () => closeSectionEditor() },
        { priority: 40, isOpen: () => _isVisible(DOM.settingsPanel), close: () => closeSettings() },
        { priority: 30, isOpen: () => _isOpen(typeof DOM_ADDSONG !== 'undefined' ? DOM_ADDSONG : null), close: () => closeAddSongModal() },
        { priority: 20, isOpen: () => _isVisible(DOM.sessionSummary), close: () => DOM.sessionSummary?.classList.remove('visible') },
        { priority: 10, isOpen: () => _isVisible(DOM.sectionResult), close: () => DOM.sectionResult?.classList.remove('visible') },
      ],
    }).install();

    // settings-panel wire-up runs below (after practice + midiInput +
    // DEFAULT_AUDIO_OFFSET_MS are declared); applyDebug seed lives there.

    // Boot-time i18n seed — set <html lang> + walk [data-i18n*] once.
    document.documentElement.lang = prefs.lang === 'jp' ? 'ja' : 'en';
    applyI18n();
    // Page loads on the title screen — body class drives the home-button hide
    // (no point in 🏠 when home is right here) and any future title-only styling.
    document.body.classList.add('title-screen');
    window.addEventListener('langchange', () => {
      // Refresh hot-path caches + re-render screens with imperative
      // (non-data-i18n) localized text — applyI18n only walks
      // [data-i18n*], so these set-from-JS labels need explicit redraw.
      if (typeof activeNoteNames !== 'undefined') {
        activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : CONFIG.NOTE_NAMES;
      }
      laneLabelL = t('laneLeft');
      laneLabelR = t('laneRight');
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
      features: { computeSpectralFlatness, computeSpectralCrest, computeSpectralCentroid, computeHarmonicity, coefficientOfVariation, },
      getOnsetAnalyser: () => onsetAnalyser,
      getOnsetDataArray: () => onsetDataArray,
      getAudioCtx: () => audioCtx,
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

    /** @param {number} timeMs */
    const _questStateUpdate = QuestStateUpdate.createQuestStateUpdate(
      /** @type {import('./quest-state-update').QuestUpdateDeps} */ ({
        state: /** @type {any} */ (state),
        trackerState: /** @type {any} */ (_questState),
        quests: CONFIG.QUESTS,
        allDoneSentinel: QUEST_ALL_DONE,
        applyQuestTick: PianoCore.applyQuestTick,
        observation: state, // quest.condition reads state.combo, state.flow, etc.
        questOpts: _questOpts,
        dom: /** @type {any} */ (DomBag.pickDom(DOM, 'toastTitle', 'toastSub', 'questToast', 'questLabel', 'questDots', 'questDisplay')),
        t,
        spawnBurst,
        effectGoldenBurst,
        getScreen: () => ({ W, H }),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        toastHideMs: 2600,
      })
    );
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
    const _hudUpdate = HudUpdate.createHudUpdate(
      /** @type {import('./hud-update').HudUpdateDeps} */ ({
        state: /** @type {any} */ (state),
        encState: _encState,
        encOpts: _encOpts,
        applyEncouragementEvent: PianoCore.applyEncouragementEvent,
        encouragementEl: DOM.encouragement,
        flowFillEl: DOM.flowFill,
        t,
        triggerEffect,
      })
    );
    /** @param {any} timeMs */ function updateHUD(timeMs) { _hudUpdate.tick(timeMs); }

    // ── Debug overlay (v9) — Phase 0d batch 44. ──
    const _debugOverlay = HudUpdate.createDebugOverlay(
      /** @type {import('./hud-update').DebugOverlayDeps} */ ({
        state: /** @type {any} */ (state),
        overlayEl: DOM.debugOverlay,
        tuning: { onsetGateDurationMs: CONFIG.ONSET_GATE_DURATION_MS },
        now: () => performance.now(),
      })
    );
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
      renderLoop: RenderLoop,
      renderFrame: RenderFrame,
      micPipeline: MicPipeline,
      renderMid: RenderMid,
      renderLate: RenderLate,
      pianoCore: PianoCore,
      ctx,
      state: /** @type {any} */ (state),
      // practice / midiInput / updatePractice are forward-declared
      // below; thunks defer the read until the builders fire
      // (post-IIFE) so we don't TDZ at wireup time.
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
      wufOpts: WUF_OPTS,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      getTone: () => (typeof Tone !== 'undefined' ? Tone : null),
    });
    /** @param {any} timeMs */ function loop(timeMs) { _renderLoop.tick(timeMs); }

    // True only when the canvas / HUD is the front-most surface (i.e. the
    // user is actually free-playing, not picking a song or reviewing a result).
    function isFreeplayActive() {
      return state.running
        && !practice.enabled
        && DOM.startScreen.style.display === 'none'
        && !DOM.songPanel.classList.contains('visible')
        && !DOM.sessionSummary.classList.contains('visible')
        && !DOM.sectionResult.classList.contains('visible');
    }

    // ========================================
    const formatTime = PianoCore.formatTime;
    /** @param {number} timeMs */
    function updatePlayTime(timeMs) {
      if (DOM.playTime) {
        DOM.playTime.textContent = formatTime(timeMs - state.sessionStartTimeMs);
      }
    }
    // setupHiDPICanvas moved to packages/web/src/shell-helpers.ts (batch 38).
    /** @param {HTMLCanvasElement} canvas @param {number} w @param {number} h */
    function setupHiDPICanvas(canvas, w, h) {
      return /** @type {CanvasRenderingContext2D} */ (ShellHelpers.setupHiDPICanvas(canvas, w, h));
    }

    // ── Session summary modal — Phase 0d batch 11 wire-up ──
    {
      const _sessionSummary = SessionSummary.createSessionSummary({
        dom: /** @type {any} */ (DomBag.pickDom(DOM,
          'sessionSummary', 'sumCombo', 'sumStage', 'sumTime',
          'sumQuestList', 'sumBest', 'radarChart',
        )),
        state: /** @type {any} */ (state),
        config: /** @type {any} */ (CONFIG),
        loadJSON, saveJSON, stageLabel, formatTime, t, setupHiDPICanvas,
      });
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
      resetMidiDispatch: () => _midiDispatch.reset(),
      remoteLog, now: () => performance.now(),
    }));
    function resetSession() { _sessionReset.reset(); }

    // ── v12: Practice Mode — songs lazily-loaded MusicXML, sectionDefs
    //   = per-song quest layout (startMeasure → next def's startMeasure). ──
    /** @param {string} id @param {string} titleKey @param {string} composerKey @param {string} icon @param {any[]} sectionDefs @returns {any} */
    function makeSong(id, titleKey, composerKey, icon, sectionDefs) {
      return /** @type {any} */ ({
        id, titleKey, composerKey, icon,
        mxlUrl: 'assets/' + id + '.mxl',
        xmlUrl: 'assets/' + id + '.xml',
        sectionDefs,
        // Populated on first load:
        notes: null, totalSec: 0, sections: [], playbackOrder: [],
        _loaded: false, _loadingPromise: null,
      });
    }
    /** @type {any} */
    const SONGS = {
      // Für Elise (Beethoven WoO 59) — 106-measure Mutopia edition.
      // Form: A(0-22) | B(23-37) | A(38-54) | C(55-77) | A+coda(78-105)
      fur_elise: makeSong('fur_elise', 'furElise', 'composerBeethoven', '🌸', [
        { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0,  isBoss: false },
        { id: 'B',  nameKey: 'feB',  descKey: 'feBdesc',  startMeasure: 23, isBoss: false },
        { id: 'A2', nameKey: 'feA2', descKey: 'feA2desc', startMeasure: 55, isBoss: true  }
      ]),
      // Mozart Sonata K.331/3 "Rondo alla Turca" — 137-measure musetrainer edition.
      // Form: A(0-8) | B(9-25) | A'(26-34) | C(35-43) | A''(44-60)
      //        | D(61-69) | E(70-78) | F(79-95) | G(96-104) | Coda(105-136)
      alla_turca: makeSong('alla_turca', 'turkishMarch', 'composerMozart', '🥁', [
        { id: 'A1', nameKey: 'taA1', descKey: 'taA1desc', startMeasure: 0,  isBoss: false },
        { id: 'B',  nameKey: 'taB',  descKey: 'taBdesc',  startMeasure: 26, isBoss: false },
        { id: 'A2', nameKey: 'taA2', descKey: 'taA2desc', startMeasure: 70, isBoss: true  }
      ])
    };
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

    // Promote a stored-or-just-fetched record into the SONGS registry.
    const USER_SONG_URL_TIMEOUT_MS = 30000;
    const USER_SONG_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
    const _userSongs = UserSongsStore.createUserSongsStore(
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
    /** @param {import('@piano/core').UserSongRecord} record */
    async function registerUserSong(record) { return _userSongs.register(/** @type {any} */ (record)); }
    async function loadUserSongs() { return _userSongs.loadAll(); }
    /** @param {Blob} blob @param {{filename?:string, source?:string, allowAcceptSession?:boolean, titleOverride?:string, composerOverride?:string}} [opts] */
    async function addUserSongFromBlob(blob, opts) { return /** @type {any} */ (_userSongs.addFromBlob(blob, opts)); }
    /** @param {string} url @param {{filename?:string, source?:string, allowAcceptSession?:boolean, titleOverride?:string, composerOverride?:string}} [opts] */
    async function addUserSongFromUrl(url, opts) { return /** @type {any} */ (_userSongs.addFromUrl(url, opts)); }
    /** @param {string} id @param {string} newTitle @param {string} newComposer */
    async function renameUserSong(id, newTitle, newComposer) { return _userSongs.rename(id, newTitle, newComposer); }
    /** @param {string} id */
    async function removeUserSong(id) { return _userSongs.remove(id); }

    // ========================================
    const _onlineLibrary = OnlineLibrary.createOnlineLibrary({
      libraryEntryFromGhFile: /** @type {any} */ (PianoCore.libraryEntryFromGhFile),
      fetch: (...args) => fetch(...args),
      localStorage,
      now: () => Date.now(),
    });
    /** @param {boolean} [force] */
    async function fetchLibrary(force) { return _onlineLibrary.fetchEntries(force); }
    /** @type {Array<Partial<import('@piano/core').LibraryEntry> & {url:string, label:string, icon:string}>} */
    let ONLINE_LIBRARY = OnlineLibrary.LIBRARY_SEED.slice();

    // Convert per-song measure-based sectionDefs into time-anchored sections by
    const buildSectionsFromDefs = PianoCore.buildSectionsFromDefs;

    // ========================================
    /** @type {any} OSMD instance (typed `any` because OSMD's surface is wide and version-fragile;
     *  consumers go through osmdAdapter for the typed boundary). */
    let osmd = null;

    const _osmdInit = OsmdInit.createOsmdInit({
      opensheetmusicdisplay:
        typeof opensheetmusicdisplay !== 'undefined' ? opensheetmusicdisplay : undefined,
      getCurrentSong: () => /** @type {any} */ (currentSong),
    });
    async function initOsmd() { osmd = /** @type {any} */ (await _osmdInit.initOsmd()); return osmd; }

    /** @param {import('@piano/core').MeasureTimingResult|null|undefined} xmlMeasureTiming
     *  @param {import('@piano/core').ScoreTiming|null|undefined} scoreTiming */
    function extractNotesFromOsmd(xmlMeasureTiming, scoreTiming) {
      return NoteExtractor.extractNotesFromOsmd(osmd, { xmlMeasureTiming, scoreTiming, collectDiag: REMOTE_LOG_ENABLED });
    }

    // Parse the raw MusicXML for everything that affects playback timing —
    const parseScoreTimingFromXml = PianoCore.parseScoreTimingFromXml;

    // @piano/core/library/measure-timing. Handles mid-bar tempo events
    // and partial-measure exporters (la Campanella m=5 case).
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

    // @piano/core/library/diag-load. The shim threads the legacy
    // remoteLog as the injected logger.
    /** @param {Parameters<typeof PianoCore.dumpLoadDiagnostics>[0]} p */
    function dumpLoadDiagnostics(p) {
      PianoCore.dumpLoadDiagnostics(p, remoteLog);
    }

    const _scoreLoader = ScoreLoader.createScoreLoader({
      getCurrentSong: () => /** @type {any} */ (currentSong),
      initOsmd,
      getOsmd: () => /** @type {any} */ (osmd),
      parseScoreTimingFromXml,
      buildMeasureTimingFromXml,
      extractNotesFromOsmd: (xmlMeasureTiming, scoreTiming) =>
        /** @type {any} */ (extractNotesFromOsmd(xmlMeasureTiming, scoreTiming)),
      fetchPlaybackOrder: (forSong) => fetchPlaybackOrder(/** @type {any} */ (forSong)),
      expandNotesByPlaybackOrder: (baseNotes, order, measures, srcMeasureStartSec) =>
        /** @type {any} */ (expandNotesByPlaybackOrder(
          /** @type {any} */ (baseNotes), order, /** @type {any} */ (measures), srcMeasureStartSec,
        )),
      buildSectionsFromDefs: (expanded, totalSec, sectionDefs, srcMeasureStartSec) =>
        buildSectionsFromDefs(
          /** @type {any} */ (expanded), totalSec,
          /** @type {any} */ (sectionDefs), srcMeasureStartSec,
        ),
      dumpLoadDiagnostics: (info) => dumpLoadDiagnostics(/** @type {any} */ (info)),
      remoteLogEnabled: REMOTE_LOG_ENABLED,
    });
    async function loadCurrentScore() { await _scoreLoader.loadCurrentScore(); }

    const _osmdCursor = OsmdCursor.createOsmdCursor({
      getOsmd: () => /** @type {any} */ (osmd),
      getContainer: () => DOM.osmdContainer,
    });
    function osmdScrollToCursor() { _osmdCursor.scrollToCursor(); }

    // OSMD adapter — implements @piano/core's OsmdAdapter interface.
    // extractNotes is a thin shim; real extraction happens in
    // loadCurrentSong (needs xmlMeasureTiming + scoreTiming).
    /** @type {import('@piano/core').OsmdAdapter} */
    const osmdAdapter = {
      async load(url) {
        if (currentSong) currentSong.mxlUrl = url;
        await initOsmd();
      },
      isLoaded() { return !!osmd; },
      extractNotes(opts) {
        // Shell extractNotesFromOsmd → `{notes, measureStartSec, measureBpm, _diag}`
        const ret = extractNotesFromOsmd(/** @type {any} */ (opts?.xmlMeasureTiming), null);
        return {
          notes: ret.notes,
          measureTiming: ret.measureStartSec.map((startSec, i) => ({ startSec, bpm: ret.measureBpm[i] ?? 72 })),
        };
      },
      cursorTo(measureIdx, inBarQuarters) { _osmdCursor.setCursorToNote({ measureIdx, inBarQuarters }); },
      resetCursor() { _osmdCursor.resetToStart(); },
      showCursor() { try { if (osmd && osmd.cursor) osmd.cursor.show(); } catch (_) {} },
      hideCursor() { try { if (osmd && osmd.cursor) osmd.cursor.hide(); } catch (_) {} },
      getCursorGeometry() {
        if (!osmd || !osmd.cursor || !osmd.cursor.cursorElement) return null;
        return { offsetTop: osmd.cursor.cursorElement.offsetTop, offsetHeight: osmd.cursor.cursorElement.offsetHeight || 30 };
      },
      // Color param on the interface is ignored — implementation hard-codes HIGHLIGHT_FILL.
      highlightCurrentNotes() { _osmdCursor.highlightCurrentNotes(); },
      clearHighlights() { _osmdCursor.clearHighlights(); },
    };
    // Promote to globalThis so Phase 0c-extracted modules can resolve it
    // from typed code without an import (matches the Tone / OSMD / JSZip
    // / PianoCore globals seeded by main.ts).
    globalThis.osmdAdapter = osmdAdapter;

    // ── Practice state + tunable constants ──
    let COUNT_IN_MS = 4000;            // pre-roll before the first note (4 beats)
    let LANE_LOOKAHEAD_MS = 4000;      // how far ahead notes appear in the lane

    // Song's quarter-note duration at the kid's chosen tempo. Falls back to a
    const _practiceTimings = PracticeTimings.createPracticeTimings(
      /** @type {import('./practice-timings').PracticeTimingsDeps} */ ({
        getPractice: () => /** @type {any} */ (practice),
        getCurrentSong: () => /** @type {any} */ (currentSong),
        fns: { practiceBeatMs: PianoCore.practiceBeatMs, computePracticeTimings: PianoCore.computePracticeTimings, },
        setCountInMs: (ms) => { COUNT_IN_MS = ms; },
        setLaneLookaheadMs: (ms) => { LANE_LOOKAHEAD_MS = ms; },
        getPracticeLane: () => /** @type {any} */ (_practiceLane),
        sectionBannerEl: DOM.sectionBanner,
        t,
      })
    );
    function practiceBeatMs() { return _practiceTimings.practiceBeatMs(); }
    function recomputePracticeTimings() { _practiceTimings.recomputePracticeTimings(); }
    // Asymmetric hit windows: early presses are punished much harder than late
    const HIT_WINDOW_EARLY_MS = PianoCore.HIT_WINDOW_EARLY_MS;
    const HIT_WINDOW_MS = PianoCore.HIT_WINDOW_MS;
    const PERFECT_MS = PianoCore.PERFECT_MS;
    const CHORD_MATE_TOLERANCE_MS = PianoCore.CHORD_MATE_TOLERANCE_MS;
    const DURATION_MIN_TOL_MS = PianoCore.DURATION_MIN_TOL_MS;
    const DURATION_TOL_FRACTION = PianoCore.DURATION_TOL_FRACTION;
    // packages/web/src/core-opts.ts (with full inline rationale).
    const DEFAULT_AUDIO_OFFSET_MS = CoreOpts.DEFAULT_AUDIO_OFFSET_MS;
    const ONSET_HYSTERESIS_FRAMES = CoreOpts.ONSET_HYSTERESIS_FRAMES;
    const PITCH_MEDIAN_FRAMES = CoreOpts.PITCH_MEDIAN_FRAMES;

    const practice = /** @type {any} */ (
        PracticeStateInit.createInitialPractice(
          prefs.audioOffsetMs != null ? prefs.audioOffsetMs : DEFAULT_AUDIO_OFFSET_MS,
        )
    );

    // ── Section banner ──
    /** @param {any} sec */ function showSectionBanner(sec) { _practiceTimings.showSectionBanner(sec); }

    // Screen Wake Lock — Phase 0d: extracted to packages/web/src/wakelock.ts.
    const requestWakeLock = PianoWakeLock.requestWakeLock;
    const releaseWakeLock = PianoWakeLock.releaseWakeLock;

    // Single source of truth for the port-message handler. attachMidiPort and
    // verifyMidiAlive both use this so re-binding after a suspend produces
    // exactly the same routing.
    /** @param {any} e */ function onMidiMessageHandler(e) { _midiDispatch.onMessage(e); }

    function verifyMidiAlive() { return _midiPorts.verifyAlive(_midiAccess); }

    const _audioGraphCfg = {
      fftSize: CONFIG.FFT_SIZE, smoothing: CONFIG.SMOOTHING,
      onsetFftSize: CONFIG.ONSET_FFT_SIZE, onsetSmoothing: CONFIG.ONSET_SMOOTHING,
    };
    /** Spread a freshly-built graph onto the shell-local node refs. Shared
     *  by rebuildAudioGraph() (initAudio path) + _audioRecovery.applyContext
     *  (visibility-recovery path) so the two stay in lock-step. */
    function _applyAudioGraph(/** @type {any} */ graph) {
      gainNode = graph.gainNode; analyser = graph.analyser; onsetAnalyser = graph.onsetAnalyser;
      dataArray = graph.dataArray; freqArray = graph.freqArray; onsetDataArray = graph.onsetDataArray;
      micSourceNode = graph.micSourceNode;
    }
    function _resetOnsetState() { state.prevSpectrum = null; state.spectralFluxHistory = []; }
    /** @param {MediaStream|null} prevMicStream */
    function rebuildAudioGraph(prevMicStream) {
      _applyAudioGraph(AudioInit.buildAudioGraph(audioCtx, prevMicStream, _audioGraphCfg, !!state.micSuspended));
      _resetOnsetState();
    }

    // WebKit Bugs 237878 / 261554 (open as of 2025): suspend/resume alone
    const _audioRecovery = AudioInit.createAudioRecovery({
      getSnapshot: () => ({ audioCtx, gainNode, analyser, onsetAnalyser, micSourceNode, micStream }),
      applyContext: (newCtx, graph) => {
        audioCtx = newCtx;
        _applyAudioGraph(graph);
        // [DIAG-AUDIOCTX] Re-bind the state listener onto the new
        // context — the old one's onstatechange went away with it.
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
    function recoverAudioContext() { return _audioRecovery.recover(); }

    // ========================================
    // platformBlocked: true on platforms that never expose Web MIDI
    // (iOS Safari / any iPadOS browser) — drives a friendlier hint.
    const midiInput = /** @type {any} */ ({
      enabled: false, port: null, _accessRequested: false, platformBlocked: false,
    });

    // Single point of MIDI message dispatch — called from Web MIDI port handler
    const _midiDispatch = MidiDispatch.createMidiDispatch({
      midiInput: /** @type {any} */ (midiInput),
      practice: /** @type {any} */ (practice),
      pulseMidiBadge, onMidiNoteOn, onMidiNoteOff, onMidiCC, matchNoteOnset,
    });
    /** @param {any} status @param {any} a @param {any} b */ function dispatchMidiMessage(status, a, b) { _midiDispatch.dispatch(status, a, b); }

    const _midiIndicator = MidiIndicator.createMidiIndicator({
      midiInput: /** @type {any} */ (midiInput),
      dom: { midiBadge: DOM.midiBadge, ptbInput: DOM.ptbInput },
      t,
      // Thunked: _midiRescan's `const` lives further down the file
      isRescanRunning: () => _midiRescan.isRescanRunning(),
      hasRequestMIDIAccess: () => typeof navigator.requestMIDIAccess === 'function',
    });
    function pulseMidiBadge() { _midiIndicator.pulseBadge(); }
    function isAppleMobile() { return _midiIndicator.isAppleMobile(); }
    function setInputIndicator() { _midiIndicator.setInputIndicator(); }

    // Tapping the input badge in the practice topbar triggers a manual rescan
    DOM.ptbInput?.addEventListener('click', () => {
      if (midiInput.enabled || midiInput.platformBlocked) return;
      console.log('[MIDI] manual rescan triggered by topbar badge tap');
      void rescanMidi(false);
    });

    // Virtual-port filter moved to packages/web/src/midi-indicator.ts —
    // re-bind to the short name so the existing enumeration callsites
    // keep working unchanged.
    /** @param {any} port */ function isVirtualMidiPort(port) { return _midiIndicator.isVirtualMidiPort(port); }

    const _midiPorts = MidiPorts.createMidiPorts({
      midiInput: /** @type {any} */ (midiInput),
      state: /** @type {any} */ (state),
      // Thunked: bleMidi's `const` lives further down the file (TDZ
      // dance — the factory is built before the BLE state object).
      getBleMidi: () => /** @type {any} */ (bleMidi),
      hasAudioCtx: () => !!audioCtx,
      suspendMic, resumeMic, onMidiMessageHandler, setInputIndicator, isVirtualMidiPort,
      refreshIntroHint: () => refreshIntroHint(),
      showHitChip: (kind, msg) => showHitChip(kind, msg),
      micMeter: DOM.micMeter,
      startMidiAutoRescan, stopMidiAutoRescan, t,
    });
    /** @param {MIDIInput|null} port @returns {boolean} */
    function attachMidiPort(port) { return _midiPorts.attach(/** @type {any} */ (port)); }
    /** @param {MIDIInput|{name:string}|null} port */
    function detachMidiPort(port) { _midiPorts.detach(/** @type {any} */ (port)); }

    async function initWebMIDI() { return _midiInit.initWebMIDI(); }

    // Surface a quiet "waiting for MIDI" hint so users on iPad / WMB know
    // the app is actively listening for their keyboard, not silently broken.
    // Cleared by attachMidiPort's existing refreshIntroHint() call.
    function showMidiWaitingHint() { _introDiag.showMidiWaitingHint(); }

    // MIDI rescan — two-stage connection attempt:
    /** @type {MIDIAccess|null} */
    let _midiAccess = null;
    const _midiRescan = MidiRescan.createMidiRescan({
      midiInput: /** @type {any} */ (midiInput),
      attachMidiPort: (port) => attachMidiPort(/** @type {any} */ (port)),
      detachMidiPort: (port) => detachMidiPort(/** @type {any} */ (port)),
      isAppleMobile: () => isAppleMobile(),
      showDiagnostic: (makeLines) => {
        showIntroDiag(() => {
          const { line1, line2 } = makeLines();
          setIntroHintDiagnostic(line1, line2);
        });
      },
      t,
      setInputIndicator,
      navigator,
      // [Bug fix 2026-05-09] Pause auto-rescan during active
      isPaused: () => !!practice.enabled,
    });
    /** @param {boolean} [force] @returns {Promise<MIDIAccess>} */
    async function ensureMidiAccess(force) {
      _midiAccess = /** @type {any} */ (await _midiRescan.ensureAccess(force));
      return /** @type {MIDIAccess} */ (_midiAccess);
    }

    // to packages/web/src/midi-ports.ts (pure helper).
    /** @param {MIDIAccess} access */
    function gatherMidiInputs(access) {
      return /** @type {any} */ (MidiPorts.gatherMidiInputs(access));
    }

    /** @param {any} [silent] */ function rescanMidi(silent) { return _midiRescan.rescan(silent); }

    // Show diagnostic info on introHint (sticky). Cleared by MIDI connect or refreshIntroHint.
    // ユーザがあとでボタンで一度消した場合は、新しいセッション(returnToTitle)
    // か再スキャンの明示的な操作までは再表示しない。
    /** @param {string} line1 @param {string} [line2] */
    const _introDiag = IntroDiag.createIntroDiag(
      /** @type {import('./intro-diag').IntroDiagDeps} */ ({
        state: /** @type {any} */ (state),
        introHintEl: DOM.introHint,
        isAppleMobile: () => isAppleMobile(),
        hasRequestMIDIAccess: () => !!navigator.requestMIDIAccess,
        t,
      })
    );
    /** @param {any} line1 @param {any} line2 */ function setIntroHintDiagnostic(line1, line2) { _introDiag.setDiagnostic(line1, line2); }
    /** @param {any} thunk */ function showIntroDiag(thunk) { _introDiag.showDiag(thunk); }

    function startMidiAutoRescan() { _midiRescan.startAutoRescan(); }
    function stopMidiAutoRescan() { _midiRescan.stopAutoRescan(); }

    const _midiInit = MidiInit.createMidiInit({
      midiInput: /** @type {any} */ (midiInput),
      navigator,
      isAppleMobile: () => isAppleMobile(),
      setInputIndicator,
      ensureMidiAccess: () => ensureMidiAccess(),
      gatherMidiInputs: (access) => /** @type {any} */ (gatherMidiInputs(/** @type {any} */ (access))),
      attachMidiPort: (port) => attachMidiPort(/** @type {any} */ (port)),
      showMidiWaitingHint: () => showMidiWaitingHint(),
      startMidiAutoRescan: () => startMidiAutoRescan(),
    });

    AudioInit.createAudioLifecycle({
      getAudioCtx: () => audioCtx,
      recover: () => recoverAudioContext(),
      isRunning: () => !!state.running,
      requestWakeLock: () => requestWakeLock(),
      navigator: /** @type {any} */ (navigator),
      midiInput: /** @type {any} */ (midiInput),
      verifyMidiAlive: () => verifyMidiAlive(),
      clearMidiAccessCache: () => { _midiAccess = null; },
      rescanMidi: (silent) => rescanMidi(silent),
      startMidiAutoRescan: () => startMidiAutoRescan(),
    }).install();

    // ========================================
    /** @type {{device: any, characteristic: any, connected: boolean, _disconnectHandler?: (()=>void)|null}} */
    const bleMidi = /** @type {any} */ ({ device: null, characteristic: null, connected: false });

    // Parse BLE-MIDI 1.0 packet. Header byte (high bit set, top 6 bits of
    // timestamp), then groups of (timestamp, status?, data...). We ignore
    // timestamps and extract only the MIDI messages we care about.
    /** @param {ArrayBuffer} buf */
    function parseBleMidiPacket(buf) { BleMidiParser.parseBleMidiPacket(buf, dispatchMidiMessage); }

    const _bleConnect = BleMidiConnect.createBleMidiConnect({
      bleMidi: /** @type {any} */ (bleMidi),
      midiInput: /** @type {any} */ (midiInput),
      hasAudioCtx: () => !!audioCtx,
      state: { get micSuspended() { return state.micSuspended; }, set micSuspended(v) { state.micSuspended = v; } },
      suspendMic, resumeMic, setInputIndicator,
      refreshIntroHint: () => refreshIntroHint(),
      showHitChip: (kind, msg) => showHitChip(kind, msg),
      micMeter: DOM.micMeter,
      parsePacket: (buf) => parseBleMidiPacket(buf),
      t, alert: (msg) => alert(msg), navigator,
    });
    async function connectBleMidi() { await _bleConnect.connect(); }

    // ─── settings-panel wire-up ──────────────────────────────────────
    {
      // Settings-panel DOM contract uses different prop names than DOM.*,
      // so spell out each remap explicitly (no pickDom shortcut here).
      const _settings = SettingsPanel.createSettingsPanel({
        dom: /** @type {import('./settings-panel').SettingsPanelDom} */ ({
          panel: DOM.settingsPanel, openBtn: DOM.settingsBtn, closeBtn: DOM.settingsCloseBtn,
          audioOffsetSlider: DOM.audioOffsetSlider, audioOffsetVal: DOM.audioOffsetVal,
          audioOffsetAuto: DOM.audioOffsetAuto, audioOffsetReset: DOM.audioOffsetReset,
          rescanBtn: DOM.settingsRescanBtn, bleBtn: DOM.settingsBleBtn,
          resetBtn: DOM.settingsResetBtn, inputStatus: DOM.settingsInputStatus,
          debugToggle: DOM.settingsDebugToggle, debugOverlay: DOM.debugOverlay,
        }),
        prefs, practice, state, midiInput,
        defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
        savePrefs, t, modalFocus,
        rescanMidi: () => { void rescanMidi(); },
        connectBleMidi: () => connectBleMidi(),
        showSessionSummary: () => showSessionSummary(),
      });
      openSettings = _settings.open;
      closeSettings = _settings.close;
      refreshSettingsPanel = _settings.refresh;
      // persisted prefs. The toggle's click handler is attached
      // inside createSettingsPanel and self-persists via savePrefs.
      _settings.applyDebug(prefs.debug);
    }

    // ========================================
    const midiState = /** @type {any} */ ({
      activeNotes: new Map(),     // midiNum -> { velocity, onTimeMs, synColor }
      sustainOn: false,
      sustainedNotes: new Set(),  // released keys held by pedal
      recentOnsets: [],           // {midi, timeMs} within 80ms — chord candidate
      lastChordName: '',
      lastChordTimeMs: 0,
    });

    const detectChord = PianoCore.detectChord;

    /** @param {number} midiNum */
    function midiToScreenX(midiNum) {
      return ((midiNum - CONFIG.PIANO_KEY_MIN) / CONFIG.PIANO_KEY_COUNT) * W;
    }

    /** @param {number} midiNum */
    const noteThemeColor = (midiNum) =>
      PianoCore.noteThemeColor(midiNum, CONFIG.THEMES[state.currentTheme]);
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

    const _midiHandlerDeps = /** @type {import('./midi-handlers').MidiHandlersDeps} */ ({
      state: /** @type {any} */ (state),
      midiState: /** @type {any} */ (midiState),
      practice: /** @type {any} */ (practice),
      midiToScreenX, noteThemeColor, synColorFor, spawnBurst, spawnStream,
      ripples: /** @type {any} */ (ripples), Ripple: /** @type {any} */ (Ripple),
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
      drawMidiKeyboard: PianoCore.drawMidiKeyboard,
      drawMidiBeams: PianoCore.drawMidiBeams,
      midiToScreenX,
      noteThemeColor,
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

    const _practiceScoring = PracticeScoring.createPracticeScoring({
      state: /** @type {any} */ (state),
      practice: /** @type {any} */ (practice),
      tuning: {
        hitWindowEarlyMs: HIT_WINDOW_EARLY_MS, hitWindowMs: HIT_WINDOW_MS, perfectMs: PERFECT_MS,
        chordMateToleranceMs: CHORD_MATE_TOLERANCE_MS,
        durationMinTolMs: DURATION_MIN_TOL_MS, durationTolFraction: DURATION_TOL_FRACTION,
        countInMs: COUNT_IN_MS,
      },
      Tone: typeof Tone !== 'undefined' ? /** @type {any} */ (Tone) : undefined,
      showHitChip, spawnBurst, getScreen: () => ({ W, H }), t, midiToName, remoteLog,
    });
    function medianRecentPitch() { return _practiceScoring.medianRecentPitch(); }
    /** @param {number} detectedMidi @param {boolean} isExact */
    function matchNoteOnset(detectedMidi, isExact) { return _practiceScoring.matchNoteOnset(detectedMidi, isExact); }
    /** @param {number} detectedMidi */
    function finalizeNoteHold(detectedMidi) { _practiceScoring.finalizeNoteHold(detectedMidi); }
    function practiceRealElapsedMs() { return _practiceScoring.practiceRealElapsedMs(); }
    function practiceElapsedMs() { return _practiceScoring.practiceElapsedMs(); }

    const dateKey = PianoCore.formatDateKey;
    const _practiceProgress = PracticeProgress.createPracticeProgress({
      storage: _prefsStore,
      core: /** @type {any} */ ({
        migrateAndDefaultProgress: PianoCore.migrateAndDefaultProgress,
        getSongProgress: PianoCore.getSongProgress,
        recordPracticeDay: PianoCore.recordPracticeDay,
        formatDateKey: PianoCore.formatDateKey,
      }),
      practice: /** @type {any} */ (practice),
    });
    /** @returns {import('@piano/core').PracticeProgress} */
    function loadPracticeProgress() { return /** @type {any} */ (_practiceProgress.load()); }
    function savePracticeProgress() { _practiceProgress.save(); }
    function songProg() { return /** @type {any} */ (_practiceProgress.songProg(currentSong.id)); }
    function recordPracticeDay() { _practiceProgress.recordPracticeDay(); }

    // ── Tone.js helpers ──
    const _practiceToneAudio = PracticeToneAudio.createPracticeToneAudio({
      Tone: typeof Tone !== 'undefined' ? /** @type {any} */ (Tone) : undefined,
      audioScheduler: /** @type {any} */ (AudioScheduler),
      cursor: osmdAdapter,
      getCountInMs: () => COUNT_IN_MS,
    });
    function ensureToneInstruments() { _practiceToneAudio.ensureInstruments(); }
    /** @param {number} startAudioTime */
    function scheduleCountInBeeps(startAudioTime) {
      _practiceToneAudio.scheduleCountIn(startAudioTime);
    }

    /** @param {any} n */ function n_state(n) { return ShellHelpers.noteStateLabel(n); }
    const NOTE_NAMES_JP = CoreOpts.NOTE_NAMES_JP;
    // Hot-path cache — refreshed on langchange so the per-frame lane draw
    // doesn't re-evaluate the prefs.lang ternary 25× per frame.
    let activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : CONFIG.NOTE_NAMES;
    /** @param {number} midi */ function midiToPitchName(midi) { return ShellHelpers.midiToPitchName(midi, activeNoteNames); }
    /** @param {number} midi */ function midiToName(midi) { return ShellHelpers.midiToFullName(midi, activeNoteNames); }

    // ── Section build + start ──
    /** @param {number} sectionIdx */
    function buildSectionNotes(sectionIdx) {
      return SectionNotes.buildSectionNotes(sectionIdx, { song: /** @type {any} */ (currentSong), practice: /** @type {any} */ (practice), countInMs: COUNT_IN_MS });
    }
    function buildFullSongNotes() {
      return SectionNotes.buildFullSongNotes({ song: /** @type {any} */ (currentSong), practice: /** @type {any} */ (practice), countInMs: COUNT_IN_MS });
    }
    /** @param {any[]} sectionNotes */
    function computeHandRanges(sectionNotes) { return SectionNotes.computeHandRanges(sectionNotes); }

    const _startPracticeSection = StartPracticeSection.createStartPracticeSection({
      state: /** @type {any} */ (state),
      practice: /** @type {any} */ (practice),
      prefs: /** @type {any} */ (prefs),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      countInMs: () => COUNT_IN_MS,
      defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      alert: (msg) => alert(msg),
      remoteLog, t, hideIntroHint, syncLayout, setInputIndicator, requestWakeLock, showSectionBanner,
      dom: /** @type {any} */ (DomBag.pickDom(DOM, 'ptbSection', 'ptbTempo', 'ptbProgress', 'practiceHud', 'osmdContainer')),
      loadCurrentScore: () => loadCurrentScore(),
      recomputePracticeTimings, buildSectionNotes, buildFullSongNotes,
      computeHandRanges: /** @type {any} */ (computeHandRanges),
      osmdAdapter: /** @type {any} */ (osmdAdapter),
      resetScrollThrottle: () => _osmdCursor.resetScrollThrottle(),
      osmdScrollToCursor,
      Tone: typeof Tone !== 'undefined' ? /** @type {any} */ (Tone) : undefined,
      ensureToneInstruments, scheduleCountInBeeps,
      audioScheduler: /** @type {any} */ (AudioScheduler),
      getInstruments: () => _practiceToneAudio.getInstruments(),
      practiceBeatMs, pickAudioOffsetMs: PianoCore.pickAudioOffsetMs,
    });
    /** @param {number} sectionIdx */
    async function startPracticeSection(sectionIdx) { await _startPracticeSection(sectionIdx); }

    function stopPracticeAudio() { _practiceToneAudio.stopPracticeAudio(); }

    // ── Per-frame practice tick — Phase 0d batch 8 wire-up ──
    const updatePractice = PracticeTick.createPracticeTick({
      dom: { ptbProgress: DOM.ptbProgress },
      practice: /** @type {any} */ (practice),
      midiInput: /** @type {any} */ (midiInput),
      getOsmd: () => /** @type {any} */ (osmd),
      practiceElapsedMs, hitWindowMs: HIT_WINDOW_MS,
      medianRecentPitch, matchNoteOnset, showHitChip, t,
      // Thunk so the live binding (reassigned after createResultCard
      // runs further down) is read at section-complete time, not at
      // wire-up time (which would hit TDZ on the placeholder above).
      completePracticeSection: () => completePracticeSection(),
      remoteLogEnabled: REMOTE_LOG_ENABLED, remoteLog,
      noteStateLabel: n_state,
    });

    // ========================================
    const _practiceLane = PracticeLane.createPracticeLane({
      ctx,
      practice: /** @type {any} */ (practice),
      state: /** @type {any} */ (state),
      midiInput,
      getLayout: () => ({
        W, H, kbHeight, kbSafeBottom, safeRight,
        currentLayoutMode: _viewportLayout.getCurrentLayoutMode(),
        cachedOsmdRect: /** @type {any} */ (cachedOsmdRect),
        osmdContainerVisible: !!(DOM.osmdContainer && DOM.osmdContainer.classList.contains('visible')),
      }),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      osmdAdapter, osmdScrollToCursor,
      practiceElapsedMs, practiceRealElapsedMs,
      noteThemeColor, midiToPitchName,
      noteColors: CONFIG.NOTE_COLORS, noteNames: CONFIG.NOTE_NAMES,
      laneLookaheadMs: LANE_LOOKAHEAD_MS, countInMs: COUNT_IN_MS,
      hitWindowEarlyMs: HIT_WINDOW_EARLY_MS, hitWindowMs: HIT_WINDOW_MS, perfectMs: PERFECT_MS,
      drawPracticeLane: PianoCore.drawPracticeLane,
      laneLabelL: t('laneLeft'), laneLabelR: t('laneRight'), countInGoLabel: t('countInGo'),
    });
    /** @param {number} timeMs */ function drawPracticeLane(timeMs) { _practiceLane.draw(timeMs); }
    function refreshLaneOptsI18n() {
      _practiceLane.setLabels({ laneLabelL: t('laneLeft'), laneLabelR: t('laneRight'), countInGoLabel: t('countInGo') });
    }
    window.addEventListener('langchange', refreshLaneOptsI18n);

    /** @param {CanvasRenderingContext2D} c @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
    function roundRect(c, x, y, w, h, r) {
      c.beginPath(); c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    // ========================================
    // Hit feedback chip (DOM)
    const _introHintUi = IntroHintUi.createIntroHintUi({
      dom: /** @type {any} */ (DomBag.pickDom(DOM, 'introHint', 'startScreen', 'hud', 'micMeter')),
      state: /** @type {any} */ (state),
      midiInput: /** @type {any} */ (midiInput),
      practice: /** @type {any} */ (practice),
      t,
      getHeight: () => H,
      requestWakeLock: () => requestWakeLock(),
      startMidiAutoRescan: () => startMidiAutoRescan(),
      rescanMidi: (silent) => rescanMidi(silent),
    });
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
      effectGoldenBurst,
      effectStarShower,
      effectFlowerBurst,
      setupHiDPICanvas,
      clamp01,
      t,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
    });
    renderResultCard = _resultCard.renderResultCard;
    completePracticeSection = _resultCard.completePracticeSection;

    // ── Song panel UI building — Phase 0d batch 7d wire-up ──
    const _songPanelRender = SongPanelRender.createSongPanelRender({
      dom: /** @type {any} */ (DomBag.pickDom(DOM,
        'songTitle', 'songComposer', 'streakCount', 'streakCal', 'songBpmHint',
        'tempoRow', 'sectionList', 'ghostToggle', 'metronomeToggle', 'ghostRow',
        'metronomeRow', 'fullSongRow', 'fullSongToggle', 'songStart',
      )),
      practice: /** @type {any} */ (practice),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      songProg: () => /** @type {any} */ (songProg()),
      t,
      dateKey,
    });
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
    BootSession.installSongStartButton(DOM.songStart, {
      state: /** @type {any} */ (state),
      practice: /** @type {any} */ (practice),
      initAudio, showRunningUI, initBgStars, loop, alertAudioInitError,
      startPracticeSection: (idx) => startPracticeSection(idx),
      songPanel: DOM.songPanel,
    });

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
      const _sectionEditor = SectionEditor.createSectionEditor({
        dom: /** @type {any} */ (DomBag.pickDom(DOM_SECEDIT,
          'modal', 'help', 'rows', 'error', 'cancelBtn', 'saveBtn', 'closeBtn',
        )),
        openUserDb,
        userDbStoreName: USER_DB_STORE,
        unzipMxlToXmlText,
        userDbPut,
        t,
        modalFocus,
        // Update in-memory SONGS so a selectSong() right after save picks
        // up the new boundaries without a page reload.
        onSaved: (rec) => {
          const song = SONGS[rec.id];
          if (song) {
            song.sectionDefs = rec.sectionDefs;
            song._loaded = false;
            song.sections = [];
          }
        },
      });
      openSectionEditor = _sectionEditor.open;
      closeSectionEditor = _sectionEditor.close;
    }

    // ─── user-songs wire-up ─────────────────────────────────────────
    {
      const _userSongs = UserSongsUi.createUserSongsUi({
        dom: /** @type {any} */ (DomBag.pickDom(DOM_ADDSONG,
          'modal', 'btn', 'closeBtn', 'tabs', 'bodies',
          'libraryList', 'libraryStatus', 'librarySearch',
          'fileInput', 'pdCheckbox', 'urlInput', 'fetchBtn', 'status',
          'myList', 'userSongList', 'exportBtn', 'importBtn', 'importInput',
        )),
        songs: SONGS,
        getLang: () => /** @type {"en"|"jp"} */ (prefs.lang),
        getLibrary: () => ONLINE_LIBRARY,
        setLibrary: (entries) => { ONLINE_LIBRARY = entries; },
        fetchLibrary, addUserSongFromBlob, addUserSongFromUrl,
        renameUserSong, removeUserSong, registerUserSong,
        userDbAll, userDbPut, unzipMxlToXmlText,
        autoSectionDefs: PianoCore.autoSectionDefs,
        // Thunk so a future reorder of the section-editor wire-up can't
        // capture a stale placeholder reference.
        openSectionEditor: (id) => openSectionEditor(id),
        selectSong, getCurrentSong: () => currentSong,
        refreshSongPanelHeader: () => {
          if (!currentSong) return;
          DOM.songTitle.textContent = t(currentSong.titleKey);
          DOM.songComposer.textContent = t(currentSong.composerKey);
        },
        t, modalFocus,
      });
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

    // The legacy floating BLE button is gone — Bluetooth pairing now lives
    // exclusively in the ⚙ settings panel (settingsBleBtn).

    const _practiceFlow = PracticeFlow.createPracticeFlow({
      dom: /** @type {any} */ ({
        ...DomBag.pickDom(DOM,
          'ptbQuit', 'ptbToggleOsmd', 'resQuit', 'resRetry', 'resNext',
          'sumClose', 'homeBtn', 'sumHome', 'resHome', 'practiceHud',
          'osmdContainer', 'songPanel', 'sectionResult', 'sessionSummary',
          'hud', 'questDisplay', 'micMeter', 'startScreen',
        ),
        resTryPlay: byId('resTryPlay'),
      }),
      practice: /** @type {any} */ (practice),
      state: /** @type {any} */ (state),
      midiState: /** @type {any} */ (midiState),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      songProg: () => /** @type {any} */ (songProg()),
      startPracticeSection, renderSongPanel, stopPracticeAudio, releaseWakeLock,
      hideIntroHint, stopMidiAutoRescan, resetSession,
    });
    returnToTitle = _practiceFlow.returnToTitle;

    // Initialize progress on load (so panel works without audio start)
    practice.progress = loadPracticeProgress();

    // ── Start ──
    // moved to packages/web/src/boot-session.ts.
    BootSession.installStartButton(DOM.startBtn, {
      state: /** @type {any} */ (state),
      practice: /** @type {any} */ (practice),
      initAudio, showRunningUI, initBgStars, loop, alertAudioInitError,
    });

    // sumClose / homeBtn / sumHome / resHome listeners + the
    // returnToTitle implementation moved to practice-flow.ts (Phase 0d
    // batch 7b). The createPracticeFlow() call above wires them.

// Phase 0c kickoff (2026-05-06): make this file a real ES module so
// main.ts can import it without a `.d.ts` shim. Enables `allowJs: true`
// in packages/web/tsconfig.json to bring it into the typecheck graph
// (checkJs stays off — that's the next ratchet, file by file).
export {};
