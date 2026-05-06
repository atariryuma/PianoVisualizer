    'use strict';

    // PWA registration — failure is non-fatal (HTTPS required, self-signed certs may reject).
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
          console.warn('[SW] register failed:', err && err.message);
        });
      });
    }

    // ========================================
    // Remote Logging (v10)
    // Only active when served from the bundled PowerShell HTTPS server (LAN/dev).
    // Production / static-host deploys (file://, github.io, etc.) get a no-op so we
    // don't waste bandwidth POSTing to a non-existent /log endpoint, and so OSMD/Tone
    // console output isn't unexpectedly forwarded off-device.
    // Toggle at runtime: set localStorage.pianoViz_remoteLog = '1' / '0'.
    // ========================================
    const REMOTE_LOG_ENABLED = (() => {
      try {
        const override = localStorage.getItem('pianoViz_remoteLog');
        if (override === '1') return true;
        if (override === '0') return false;
      } catch (e) {}
      const h = location.hostname;
      return location.protocol === 'https:' &&
        (h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h) || /^10\./.test(h));
    })();

    // Sequential POST queue — without it, concurrent fetch()es arrive at the
    // server in whatever order they happen to complete, scrambling diagnostic
    // dumps that depend on insertion order (e.g. per-measure walks).
    // Backpressure: drop messages once the in-flight queue passes ~50 so a
    // sleeping/lossy LAN doesn't grow microtasks unboundedly during a single
    // song's DIAG dump (200+ lines per load).
    const remoteLog = (() => {
      if (!REMOTE_LOG_ENABLED) return () => {};
      let chain = Promise.resolve();
      let pending = 0;
      return (msg) => {
        if (pending > 50) return;
        pending++;
        const body = (typeof msg === 'string') ? msg : JSON.stringify(msg);
        // Each fetch swallows its own rejection (`.catch(() => {})`) so the
        // chain itself never enters a rejected state — `pending--` only ever
        // runs from the single `.finally`, no double-decrement risk.
        chain = chain.then(() => fetch('/log', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body,
        }).catch(() => {}).finally(() => { pending--; }));
      };
    })();

    if (REMOTE_LOG_ENABLED) {
      const _log = console.log;
      console.log = (...args) => { _log(...args); remoteLog(args.join(' ')); };
      const _err = console.error;
      console.error = (...args) => { _err(...args); remoteLog('[ERROR] ' + args.join(' ')); };
      window.onerror = (msg, url, line) => { remoteLog(`[FATAL] ${msg} (${line})`); };
    }

    console.log("App Started: Piano Visualizer");

    const CONFIG = {
      // Audio — main analyser (for pitch + visualisation)
      FFT_SIZE: 4096,
      SMOOTHING: 0.82,
      PIANO_FREQ_MIN: 27,
      PIANO_FREQ_MAX: 4200,

      // Onset analyser — dedicated low-smoothing node for transient detection
      ONSET_FFT_SIZE: 2048,
      ONSET_SMOOTHING: 0.15,

      // =============================================
      // Software AGC via GainNode (v8)
      // =============================================
      AGC_TARGET_RMS: 0.06,
      AGC_ATTACK_COEFF: 0.02,
      AGC_RELEASE_COEFF: 0.08,
      AGC_MIN_GAIN: 1.0,
      AGC_MAX_GAIN: 40.0,
      AGC_UPDATE_INTERVAL_MS: 100,
      AGC_SILENCE_FLOOR: 0.0003,

      // v9: AGC voice suppression
      AGC_VOICE_REJECT_COUNT: 5,      // consecutive high-RMS rejections to trigger suppression
      AGC_VOICE_SUPPRESS_MAX: 8.0,    // temporary max gain during voice suppression
      AGC_VOICE_SUPPRESS_MS: 500,     // how long to suppress after voice detected
      AGC_VOICE_RMS_MIN: 0.02,        // minimum RMS to count as "high-RMS rejection"

      // v10: Synesthesia Colors (Educational Mode)
      NOTE_COLORS: {
        'C': '#ff0000', // Red
        'C#': '#ff4000', // Red-Orange
        'D': '#ff8000', // Orange
        'D#': '#ffbf00', // Yellow-Orange
        'E': '#ffff00', // Yellow
        'F': '#80ff00', // Light Green
        'F#': '#00ff00', // Green
        'G': '#00ffff', // Cyan
        'G#': '#0080ff', // Blue
        'A': '#0000ff', // Dark Blue
        'A#': '#8000ff', // Purple
        'B': '#ff00ff'  // Magenta
      },

      // =============================================
      // YIN Pitch Detection (v6+)
      // =============================================
      YIN_THRESHOLD: 0.20,
      YIN_PROBABILITY_THRESHOLD: 0.10,
      RMS_SILENCE_THRESHOLD: 0.008,   // v10: Slightly raised (0.005 -> 0.008) to reduce noise
      PITCH_MIN_HZ: 25,
      // Practice-mode floor — YIN frequently locks onto a sub-harmonic 1-2 octaves
      // below the actual note. Für Elise's lowest written pitch is around A2 (~110Hz),
      // so anything below E2 (~82Hz) is almost always an octave-down error.
      PITCH_MIN_HZ_PRACTICE: 80,
      PITCH_MAX_HZ: 5000,
      GOOD_NOTE_RMS: 0.008,           // v10: Raised (0.005 -> 0.008) - reject key clatter
      CONFIDENCE_THRESHOLD: 0.60,     // v10: Final (0.65 -> 0.60) - Sweet spot for sensitivity/noise

      // =============================================
      // Multi-Feature Onset Classification (v10 — tuned for sensitivity)
      // =============================================
      SPECTRAL_FLUX_THRESHOLD: 4.0,       // v10: Slight increase (3.0 -> 4.0)
      SPECTRAL_FLUX_ADAPTIVE_K: 1.3,
      SPECTRAL_FLUX_HISTORY_SIZE: 20,
      ONSET_SPREAD_THRESHOLD: 0.05,       // v10: Low Min (0.15->0.05) to pass pure notes
      ONSET_SPREAD_MAX: 0.70,             // v10: Relaxed Max (0.60 -> 0.70) for big chords
      ONSET_SPREAD_MIN_CHANGE: 1.5,
      // Spectral flatness lower bound. Piano single notes are very tonal (low flatness),
      // so this threshold must be small or the gate rejects clean playing. The
      // harmonicity gate above already filters non-pitched sounds, so we keep this
      // low and use it only as a last-resort sanity check.
      FLATNESS_PIANO_MIN: 0.03,
      CREST_VOICE_MAX: 8.0,
      ONSET_GATE_DURATION_MS: 1500,
      ONSET_COOLDOWN_MS: 60,
      FLUX_FREQ_MIN_HZ: 20,
      FLUX_FREQ_MAX_HZ: 4200,

      // =============================================
      // Harmonicity Gate (v9 — new)
      // =============================================
      HARMONICITY_MIN: 0.0,               // free-play: lenient so chords don't get rejected
      HARMONICITY_MIN_PRACTICE: 0.12,     // practice: light filter for voice/key clatter.
      //   iPad mic on acoustic piano typically yields 0.10–0.30 harmonicity, so 0.12
      //   keeps real notes through while still catching pure-noise events.
      // Partial-count + bin tolerance live in @piano/core/audio/harmonicity.ts
      // DEFAULTS — they were never read by the call site below, so removing
      // them here removes a tuning landmine.

      // =============================================
      // Session Confidence Layer (v7+)
      // =============================================
      SESSION_WINDOW_MS: 4000,
      SESSION_CONFIRM_THRESHOLD: 0.35,
      SESSION_LOSE_THRESHOLD: 0.10,
      SESSION_WARMUP_MS: 2000,
      SESSION_SAMPLE_INTERVAL_MS: 50,

      // =============================================
      // Spectral Centroid Tracking (debug only)
      // =============================================
      CENTROID_HISTORY_SIZE: 20,

      // =============================================
      // Quality Scoring — simplified for kids (v8+)
      // =============================================
      SCORE_RHYTHM_WEIGHT: 0.4,
      SCORE_DYNAMICS_WEIGHT: 0.35,
      SCORE_STABILITY_WEIGHT: 0.25,
      IOI_HISTORY_SIZE: 16,
      IOI_IDEAL_CV: 0.30,
      IOI_MAX_CV: 1.5,
      AMPLITUDE_HISTORY_SIZE: 30,
      DYNAMICS_IDEAL_CV_MIN: 0.03,
      DYNAMICS_IDEAL_CV_MAX: 0.60,
      SCORE_UPDATE_INTERVAL_MS: 500,
      SCORE_SMOOTHING: 0.08,
      GROWTH_WINDOW_MS: 30000,
      MOTIVATION_GOAL_MS: 30000,

      // Game timing
      COMBO_WINDOW_MS: 3000,
      SILENCE_DECAY_START_MS: 8000,       // v10: Increased to 8s (was 4s) for longer pauses
      SILENCE_HARD_DECAY_MS: 12000,       // v10: Increased Hard Decay start
      NOISE_PENALTY_COOLDOWN_MS: 300,
      NOTE_DISPLAY_DURATION_MS: 1200,
      MIN_NOTE_INTERVAL_MS: 70,

      // Game balance
      FLOW_GAIN_BASE: 8,                  // v10: Final Tune (10 -> 8) - Gentle climb
      FLOW_GAIN_COMBO_MAX: 10,            // v10: Reduced (16 -> 10)
      FLOW_GAIN_STABILITY_MAX: 20,
      FLOW_GAIN_QUALITY_MAX: 25,
      FLOW_DECAY_SOFT: 0.5,               // v10: Very gentle decay (was 2.0)
      FLOW_DECAY_HARD: 2.0,               // v10: Slower hard decay (was 8.0)
      NOISE_RMS_THRESHOLD: 0.05,
      FLOW_NOISE_PENALTY: 3,
      COMBO_DECAY_RATE: 0.5,
      COMBO_NOISE_PENALTY: 1,

      // Pitch stability
      STABILITY_SEMITONE_THRESHOLD: 3,
      STABILITY_GROWTH: 0.05,
      STABILITY_DECAY_GOOD: 0.90,         // v10: Slower decay active
      STABILITY_DECAY_IDLE: 0.995,        // v10: Much slower decay idle (was 0.98)

      // Rendering
      MAX_PARTICLES: 800,
      SHADOW_BLUR_ENABLED: true,
      AMBIENT_PARTICLE_CHANCE: 0.03,
      BAR_COUNT: 64,

      // Stages — `nameKey` is resolved via t() so labels follow prefs.lang.
      STAGES: [
        { nameKey: null,     prefix: '',             minFlow: 0 },
        { nameKey: 'stage1', prefix: '\u2726 ',       minFlow: 15 },
        { nameKey: 'stage2', prefix: '\u2726\u2726 ', minFlow: 35 },
        { nameKey: 'stage3', prefix: '\u2726\u2726\u2726 ', minFlow: 55 },
        { nameKey: 'stage4', prefix: '\u2726\u2726\u2726\u2726 ', minFlow: 75 },
        { nameKey: 'stage5', prefix: '\u2726\u2726\u2726\u2726\u2726 ', minFlow: 90 },
        { nameKey: 'stage6', prefix: '\u2726\u2726\u2726\u2726\u2726\u2726 ', minFlow: 98 }
      ],

      // =============================================
      // Encouragement Tiers (v9 — replaces combo numbers)
      // =============================================
      ENCOURAGEMENT_TIERS: [
        { minCombo: 3,   messageKey: 'enc1', effect: 'glowPulse' },
        { minCombo: 8,   messageKey: 'enc2', effect: 'glowParticles' },
        { minCombo: 15,  messageKey: 'enc3', effect: 'colorWave' },
        { minCombo: 25,  messageKey: 'enc4', effect: 'starShower' },
        { minCombo: 40,  messageKey: 'enc5', effect: 'flowerBurst' },
        { minCombo: 60,  messageKey: 'enc6', effect: 'shimmer' },
        { minCombo: 80,  messageKey: 'enc7', effect: 'radiance' },
        { minCombo: 100, messageKey: 'enc8', effect: 'goldenBurst' }
      ],
      ENCOURAGEMENT_COOLDOWN_MS: 8000,   // don't repeat same tier within this window
      ENCOURAGEMENT_DISPLAY_MS: 2500,    // how long message stays visible

      // Note mapping
      NOTE_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
      PIANO_KEY_MIN: 21,
      PIANO_KEY_COUNT: 88,

      // Themes
      THEMES: [
        { bg: [10, 10, 20], colors: ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6366f1', '#818cf8'], glow: 'rgba(139,92,246,' },
        { bg: [8, 18, 20], colors: ['#06b6d4', '#22d3ee', '#34d399', '#10b981', '#14b8a6', '#67e8f9'], glow: 'rgba(6,182,212,' },
        { bg: [20, 12, 8], colors: ['#f97316', '#fb923c', '#ef4444', '#f43f5e', '#eab308', '#fbbf24'], glow: 'rgba(249,115,22,' },
        { bg: [12, 12, 18], colors: ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#ddd6fe', '#f0f0ff', '#ffffff'], glow: 'rgba(200,200,255,' }
      ],

      // v10: Magic Quests — name/desc are i18n keys, resolved via t() at use.
      QUESTS: [
        { id: 'q1',  nameKey: 'qst1Name',  descKey: 'qst1Desc',  condition: s => s.noteOnsetTimes.length >= 3, reward: 'Nice Start!' },
        { id: 'q2',  nameKey: 'qst2Name',  descKey: 'qst2Desc',  condition: s => s.flow >= 50, reward: 'Good Flow!' },
        { id: 'q3',  nameKey: 'qst3Name',  descKey: 'qst3Desc',  condition: s => s.combo >= 30, reward: 'Combo Master!' },
        { id: 'q4',  nameKey: 'qst4Name',  descKey: 'qst4Desc',  condition: s => s.stabilityScore >= 0.8, reward: 'Stable Tone!' },
        { id: 'q5',  nameKey: 'qst5Name',  descKey: 'qst5Desc',  condition: s => s.sessionState === 'performing' && s.sessionConfidence > 0.8, reward: 'Virtuoso!' },
        { id: 'q6',  nameKey: 'qst6Name',  descKey: 'qst6Desc',  condition: s => s.rhythmScore >= 0.85, reward: 'Rhythm Master!' },
        { id: 'q7',  nameKey: 'qst7Name',  descKey: 'qst7Desc',  condition: s => s.flow >= 95, reward: 'Peak Flow!' },
        { id: 'q8',  nameKey: 'qst8Name',  descKey: 'qst8Desc',  condition: s => s.combo >= 100, reward: 'Century Combo!' },
        { id: 'q9',  nameKey: 'qst9Name',  descKey: 'qst9Desc',  condition: s => s.dynamicsScore >= 0.8, reward: 'Dynamic Range!' },
        { id: 'q10', nameKey: 'qst10Name', descKey: 'qst10Desc', condition: s => s.qualityScore >= 0.85, reward: 'Full Focus!' },
        { id: 'q11', nameKey: 'qst11Name', descKey: 'qst11Desc', condition: s => s.bestCombo >= 200 && s.flow >= 90, reward: 'LEGENDARY!' }
      ]
    };

    // ========================================
    // DOM references
    // ========================================
    const DOM = {
      canvas: document.getElementById('canvas'),
      startScreen: document.getElementById('startScreen'),
      startBtn: document.getElementById('startBtn'),
      themeBar: document.getElementById('themeBar'),
      hud: document.getElementById('hud'),
      encouragement: document.getElementById('encouragement'),
      flowFill: document.getElementById('flowFill'),
      stageLabel: document.getElementById('stageLabel'),
      noteDisplay: document.getElementById('noteDisplay'),
      sessionStatus: document.getElementById('sessionStatus'),
      qualityScore: document.getElementById('qualityScore'),
      debugOverlay: document.getElementById('debugOverlay'),
      // v10: Quest UI
      questDisplay: document.getElementById('questDisplay'),
      questDots: document.getElementById('questDots'),
      questLabel: document.getElementById('questLabel'),
      questToast: document.getElementById('questToast'),
      toastTitle: document.getElementById('toastTitle'),
      toastSub: document.getElementById('toastSub'),
      homeBtn: document.getElementById('homeBtn'),
      sessionSummary: document.getElementById('sessionSummary'),
      sumCombo: document.getElementById('sumCombo'),
      sumQuestList: document.getElementById('sumQuestList'),
      sumStage: document.getElementById('sumStage'),
      sumTime: document.getElementById('sumTime'),
      radarChart: document.getElementById('radarChart'),
      sumBest: document.getElementById('sumBest'),
      sumClose: document.getElementById('sumClose'),
      sumHome: document.getElementById('sumHome'),
      playTime: document.getElementById('playTime'),
      // v12: Practice Mode (Für Elise)
      songTitle: document.getElementById('songTitle'),
      songComposer: document.getElementById('songComposer'),
      songPanel: document.getElementById('songPanel'),
      streakCount: document.getElementById('streakCount'),
      streakCal: document.getElementById('streakCal'),
      tempoRow: document.getElementById('tempoRow'),
      songBpmHint: document.getElementById('songBpmHint'),
      sectionList: document.getElementById('sectionList'),
      ghostToggle: document.getElementById('ghostToggle'),
      ghostRow: document.getElementById('ghostRow'),
      metronomeToggle: document.getElementById('metronomeToggle'),
      metronomeRow: document.getElementById('metronomeRow'),
      songBack: document.getElementById('songBack'),
      songStart: document.getElementById('songStart'),
      practiceHud: document.getElementById('practiceHud'),
      practiceTopBar: document.getElementById('practiceTopBar'),
      ptbSection: document.getElementById('ptbSection'),
      ptbTempo: document.getElementById('ptbTempo'),
      ptbProgress: document.getElementById('ptbProgress'),
      ptbToggleOsmd: document.getElementById('ptbToggleOsmd'),
      ptbQuit: document.getElementById('ptbQuit'),
      ptbInput: document.getElementById('ptbInput'),
      osmdContainer: document.getElementById('osmdContainer'),
      sectionBanner: document.getElementById('sectionBanner'),
      sectionResult: document.getElementById('sectionResult'),
      resTitle: document.getElementById('resTitle'),
      resSectionName: document.getElementById('resSectionName'),
      resStars: document.getElementById('resStars'),
      resAcc: document.getElementById('resAcc'),
      resTiming: document.getElementById('resTiming'),
      resDuration: document.getElementById('resDuration'),
      resDurationRow: document.getElementById('resDurationRow'),
      resCombo: document.getElementById('resCombo'),
      resMsg: document.getElementById('resMsg'),
      resUnlock: document.getElementById('resUnlock'),
      resQuit: document.getElementById('resQuit'),
      resRetry: document.getElementById('resRetry'),
      resNext: document.getElementById('resNext'),
      resTryPlay: document.getElementById('resTryPlay'),
      resHome: document.getElementById('resHome'),
      resHistoryWrap: document.getElementById('resHistoryWrap'),
      resHistoryChart: document.getElementById('resHistoryChart'),
      introHint: document.getElementById('introHint'),
      micMeter: document.getElementById('micMeter'),
      micMeterFill: document.getElementById('micMeterFill'),
      midiBadge: document.getElementById('midiBadge'),
      // Settings panel
      settingsBtn: document.getElementById('settingsBtn'),
      settingsPanel: document.getElementById('settingsPanel'),
      settingsCloseBtn: document.getElementById('settingsCloseBtn'),
      audioOffsetSlider: document.getElementById('audioOffsetSlider'),
      audioOffsetVal: document.getElementById('audioOffsetVal'),
      audioOffsetAuto: document.getElementById('audioOffsetAuto'),
      audioOffsetReset: document.getElementById('audioOffsetReset'),
      settingsRescanBtn: document.getElementById('settingsRescanBtn'),
      settingsBleBtn: document.getElementById('settingsBleBtn'),
      settingsResetBtn: document.getElementById('settingsResetBtn'),
      settingsInputStatus: document.getElementById('settingsInputStatus'),
      settingsDebugToggle: document.getElementById('settingsDebugToggle')
    };
    const ctx = DOM.canvas.getContext('2d');

    // ========================================
    // Game State
    // ========================================
    const state = {
      running: false,
      starting: false,
      flow: 0,
      combo: 0,
      bestCombo: 0,
      currentStage: 0,
      lastGoodNoteTimeMs: 0,
      lastSilenceStartMs: -1,
      lastNoisePenaltyMs: 0,
      lastPitch: -1,

      // v10: Synesthesia Mode
      useSynesthesiaMode: false,

      // v10: Magic Quests
      completedQuests: [],
      lastQuestCheckMs: 0,
      activeQuestId: null,

      pitchStability: 0,
      lastNoteTimeMs: 0,
      smoothEnergy: 0,
      lastDetectedNote: '',
      noteShowTimeMs: 0,
      currentTheme: 0,
      lastFrameTimeMs: 0,
      prevSpectrum: null,
      spectralFluxHistory: [],
      lastOnsetTimeMs: -9999,

      // v13: Mic source state. True when getUserMedia hasn't been called or
      // the mic has been torn down because MIDI took over.
      micSuspended: false,

      // Software AGC (v8)
      agcGain: 1.0,
      agcSmoothedRms: 0,
      agcLastUpdateMs: 0,

      // v9: AGC voice suppression
      agcVoiceRejectCount: 0,
      agcVoiceSuppressUntilMs: 0,

      // Session Confidence (ring buffer)
      sessionState: 'waiting',
      sessionStartMs: 0,
      sessionConfidence: 0,
      sessionPerformingStartMs: 0,
      lastSessionSampleMs: 0,
      sessionRingHead: 0,
      sessionRingTail: 0,
      sessionRingSize: 0,
      sessionPianoCount: 0,
      goalWindowStartMs: 0,
      goalCelebrateUntilMs: 0,
      goalCompletedCount: 0,

      // Quality Scoring
      noteOnsetTimes: [],
      ioiHistory: [],
      amplitudeHistory: [],
      centroidHistory: [],
      rhythmScore: 0,
      dynamicsScore: 0,
      stabilityScore: 0,
      qualityScore: 0,
      displayedQualityScore: 0,
      growthScore: 0,
      qualityHistory: [],
      feedbackGood: '',
      feedbackNext: '',
      lastScoreUpdateMs: 0,

      // v9: Encouragement system
      currentEncouragementTier: -1,
      lastEncouragementTimeMs: 0,
      encouragementHideTimeMs: 0,

      // v9: Special effects state
      glowPulseIntensity: 0,
      shimmerPhase: -1,
      shimmerStartMs: 0,
      inputFlash: 0,

      // Debug
      debugMode: false,
      debugLastFlux: 0,
      debugLastSpread: 0,
      debugLastThreshold: 0,
      debugGateOpen: false,
      debugLastRms: 0,
      debugLastConf: 0,
      debugLastPitch: 0,
      debugIsGoodNote: false,
      debugIsActivePlay: false,
      debugLastFlatness: 0,
      debugLastCrest: 0,
      debugOnsetReason: '',
      debugLastCentroid: 0,
      debugCentroidCV: 0,
      debugSessionConf: 0,
      debugSessionState: 'waiting',
      debugAgcGain: 1.0,
      debugHarmonicity: 0,

      // YIN throttle
      yinSkipCounter: 0,
      cachedPitchResult: { pitch: -1, conf: 0, rms: 0 },

      // v11: Session tracking
      sessionStartTimeMs: 0,
      peakFlow: 0,

      // Pre-declared dynamic fields — initializing here keeps V8's hidden class
      // stable across the per-frame hot path (used to be lazy `state.x ||= 0`
      // initializers scattered through updateGameState / matchNoteOnset).
      adaptiveSilenceRms: null,
      recentPitches: null,
      consecutiveOnsetFrames: 0,
      lastDebugLogMs: 0,
      debugMaxRms: 0,
      debugMaxConf: 0,
      debugMaxHarm: 0,
      debugOnsetCount: 0,
      lastMidiNoteForStability: null,
      micPermissionFailed: false,
      micIntentionallySkipped: false,
      lastIntroDiag: null,
      _lastSummary: null
    };

    // ========================================
    // Session Confidence Ring Buffer (pre-allocated, zero-alloc at runtime)
    // ========================================
    const SESSION_RING_CAP = 100;
    const sessionRing = new Array(SESSION_RING_CAP);
    for (let i = 0; i < SESSION_RING_CAP; i++) sessionRing[i] = { timeMs: 0, isPiano: false };

    // ========================================
    // Audio — dual analyser + software AGC
    // ========================================
    let audioCtx;
    let analyser;
    let onsetAnalyser;
    let gainNode;
    let dataArray, freqArray;
    let onsetDataArray;
    let micStream;       // v13: keep ref so we can stop tracks when MIDI takes over
    let micSourceNode;   // v13: rewireable source between gainNode and the live mic

    const MIC_CONSTRAINTS = {
      audio: {
        autoGainControl: false,
        noiseSuppression: false,
        echoCancellation: false,
        sampleRate: { ideal: 48000 }
      }
    };

    // Pinned to 48000 Hz so AirPods (which flip between 24kHz input and 48kHz
    // output) don't cause stutter when the mic activates. Browsers do automatic
    // resampling — we eat the SRC cost in exchange for stability.
    // WebKit Bug 154538 (open as of 2025) confirms the underlying flip persists.
    const AUDIO_SAMPLE_RATE = 48000;

    function createAudioContext() {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      try {
        return new Ctor({ sampleRate: AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
      } catch (e) {
        // Some older Safaris reject the options bag — fall back to default ctor.
        return new Ctor();
      }
    }

    async function initAudio() {
      console.log("Initializing Audio...");
      audioCtx = createAudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        console.log("AudioContext resumed @" + audioCtx.sampleRate + "Hz");
      }

      // Audio graph (sourceless): gain → analyser, gain → onsetAnalyser.
      // The mic source is wired in separately so we can drop / re-acquire it
      // when MIDI attaches / detaches without rebuilding everything.
      gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = CONFIG.FFT_SIZE;
      analyser.smoothingTimeConstant = CONFIG.SMOOTHING;
      gainNode.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      freqArray = new Float32Array(analyser.fftSize);

      onsetAnalyser = audioCtx.createAnalyser();
      onsetAnalyser.fftSize = CONFIG.ONSET_FFT_SIZE;
      onsetAnalyser.smoothingTimeConstant = CONFIG.ONSET_SMOOTHING;
      gainNode.connect(onsetAnalyser);
      onsetDataArray = new Uint8Array(onsetAnalyser.frequencyBinCount);

      // Probe MIDI BEFORE asking for the mic. If a MIDI keyboard is already
      // plugged in, we skip getUserMedia entirely — no permission prompt,
      // no privacy LED, no idle CPU on YIN/FFT. The user gesture from the
      // start-button click is still alive, so getUserMedia later (on MIDI
      // detach) works without re-prompting.
      try { await initWebMIDI(); } catch (e) { /* fall back to mic */ }

      if (midiInput.enabled) {
        console.log('[AUDIO] MIDI detected — skipping microphone acquisition');
        state.micSuspended = true;
      } else if (isAppleMobile() && navigator.requestMIDIAccess) {
        // Web MIDI Browser (or any iOS WKWebView wrapper that polyfills Web MIDI):
        // mic permission is consistently broken on iOS WKWebView wrappers, so we
        // skip it on purpose. Note we set `micIntentionallySkipped` (not
        // `micPermissionFailed`) so downstream code doesn't pop a "MIDI required"
        // diagnostic on every screen entry — the kid is fine to wait for a
        // keyboard or just listen passively.
        state.micSuspended = true;
        state.micIntentionallySkipped = true;
        console.log('[AUDIO] iOS WKWebView with Web MIDI polyfill — running MIDI-only (mic skipped)');
      } else {
        // Try to acquire the mic. The earlier hang case (iOS WKWebView wrappers
        // freezing on getUserMedia) is already handled by the
        // micIntentionallySkipped branch above, so the regular browser path
        // doesn't need the aggressive 5s timeout — that was firing while the
        // kid was still reading the permission dialog and falsely flipping the
        // app into "mic failed" mode. Use a generous 20s safety net only.
        try {
          await Promise.race([
            acquireMic(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('mic permission timeout')), 20000))
          ]);
        } catch (e) {
          state.micSuspended = true;
          state.micPermissionFailed = true;
          console.warn('[AUDIO] mic unavailable — running in MIDI-only mode:', e && e.message);
        }
      }
    }

    let _micAcquiring = null;
    async function acquireMic() {
      if (micStream) return;
      // Concurrency guard: two concurrent callers (resumeMic racing the
      // safety-net timeout from initAudio) would each await a separate
      // getUserMedia call; one stream survives, the other leaks (track
      // stays live → privacy LED stuck on). Share the in-flight promise.
      if (_micAcquiring) return _micAcquiring;
      _micAcquiring = (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
          if (micStream) {
            // A concurrent caller won the race; stop our redundant tracks.
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          micStream = stream;
          micSourceNode = audioCtx.createMediaStreamSource(stream);
          micSourceNode.connect(gainNode);
          gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
          gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
          state.micSuspended = false;
          // Clear any stale failure flag from a prior race-timeout — if the
          // user eventually clicked Allow after the safety-net timeout fired,
          // we still get here and need to update the UI gates that read this
          // flag.
          if (state.micPermissionFailed) {
            state.micPermissionFailed = false;
            if (typeof refreshIntroHint === 'function') refreshIntroHint();
            if (typeof DOM !== 'undefined' && DOM.micMeter) DOM.micMeter.classList.add('visible');
          }
          console.log('[AUDIO] Mic acquired');
        } finally {
          _micAcquiring = null;
        }
      })();
      return _micAcquiring;
    }

    // Tear down the mic when MIDI takes over: silence the graph, disconnect
    // the source, and stop all tracks (the privacy LED follows track state).
    function suspendMic() {
      if (state.micSuspended) return;
      state.micSuspended = true;
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      if (micSourceNode) {
        // disconnect can throw InvalidAccessError if already disconnected.
        try { micSourceNode.disconnect(); } catch (e) {}
        micSourceNode = null;
      }
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
      }
      // Clear stale mic-derived state so the radar / quality reset cleanly.
      state.adaptiveSilenceRms = null;
      state.recentPitches = [];
      console.log('[AUDIO] Mic suspended (MIDI active)');
    }

    // Re-acquire mic when MIDI detaches mid-session.
    async function resumeMic() {
      if (!audioCtx || !state.micSuspended) return;
      try {
        await acquireMic();
      } catch (e) {
        console.warn('[AUDIO] Failed to resume mic:', e.message || e);
      }
    }

    // ========================================
    // Canvas
    // ========================================
    let W, H;
    let kbSafeBottom = 4;
    let kbHeight = 50;
    let safeLeft = 0;
    let safeRight = 0;
    let _bgStarsPrevW = 0, _bgStarsPrevH = 0;
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const prevW = _bgStarsPrevW;
      const prevH = _bgStarsPrevH;
      W = window.innerWidth;
      H = window.innerHeight;
      DOM.canvas.width = W * dpr;
      DOM.canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Cached so the per-frame draw can skip getComputedStyle / Math.min/max.
      const cs = getComputedStyle(document.documentElement);
      const readPx = (name) => parseFloat(cs.getPropertyValue(name)) || 0;
      kbSafeBottom = readPx('--safe-bottom') + 4;
      safeLeft = readPx('--safe-left');
      safeRight = readPx('--safe-right');
      kbHeight = Math.min(56, Math.max(38, H * 0.065));
      if (state.running) maybeReinitBgStars(prevW, prevH);
      _bgStarsPrevW = W;
      _bgStarsPrevH = H;
    }
    function maybeReinitBgStars(prevW, prevH) {
      // Only re-randomize when the viewport changes by more than ~25 % on
      // either axis. Smaller deltas (iOS URL-bar collapse, soft-keyboard
      // show / hide, minor browser-window drag) just scale the existing
      // star positions in place — re-init flickers visibly because every
      // star jumps to a fresh random spot. First call (prev = 0) always
      // re-inits to seed the field.
      if (!_bg || !prevW || !prevH) {
        initBgStars();
        return;
      }
      const dx = Math.abs(W - prevW) / Math.max(1, prevW);
      const dy = Math.abs(H - prevH) / Math.max(1, prevH);
      if (dx > 0.25 || dy > 0.25) {
        initBgStars();
        return;
      }
      const sx = W / prevW;
      const sy = H / prevH;
      for (const s of _bg.stars) {
        s.x *= sx;
        s.y *= sy;
      }
    }
    resize();
    window.addEventListener('resize', resize);

    // Single source of truth for "where things live on the screen": JS
    // decides the layout mode and measures the top UI cluster's bottom;
    // CSS computes the regions from --top-cluster-bottom / --kb-height
    // and the body[data-layout="..."] selectors. drawPracticeLane reads
    // currentLayoutMode (cached below) to switch between stacked and
    // split-h rendering.
    let currentLayoutMode = 'phone-portrait';
    let lastTopClusterPx = -1;
    let lastKbHeightPx = -1;
    // Cached OSMD container rect — refreshed on resize / orientationchange and
    // when the OSMD strip itself resizes. drawPracticeLane reads this every
    // frame; calling getBoundingClientRect() per-frame instead would force a
    // synchronous layout flush at 60fps.
    const cachedOsmdRect = { top: 0, right: 0, bottom: 0, height: 0, width: 0 };
    function detectLayout() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const longest = Math.max(w, h);
      // Desktop: explicitly wide. Catches landscape iPad Pro 12.9 (1366×1024).
      if (w >= 1200) return 'desktop';
      // Tablet: longest edge ≥ 900 covers iPad Air/mini/Pro in either
      // orientation (768×1024, 820×1180, 834×1194, 1024×1366) without
      // demoting them to phone in portrait.
      if (longest >= 900 && Math.min(w, h) >= 600) return 'tablet';
      // Phone landscape: short height + landscape AND not desktop-class width.
      // The w<1024 cap stops 1199×500 desktop windows from being misclassified.
      if (w > h && h <= 520 && w < 1024) return 'phone-landscape';
      return 'phone-portrait';
    }
    function measureBottom(el) {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.height > 0 ? r.bottom : 0;
    }
    function refreshOsmdRect() {
      const el = DOM.osmdContainer;
      if (!el) return;
      const r = el.getBoundingClientRect();
      cachedOsmdRect.top = r.top;
      cachedOsmdRect.right = r.right;
      cachedOsmdRect.bottom = r.bottom;
      cachedOsmdRect.height = r.height;
      cachedOsmdRect.width = r.width;
    }
    function syncLayout() {
      const layout = detectLayout();
      if (currentLayoutMode !== layout) {
        currentLayoutMode = layout;
        document.body.dataset.layout = layout;
      }
      const topClusterBottom = Math.round(
        Math.max(measureBottom(DOM.practiceTopBar), measureBottom(DOM.themeBar))
      );
      const kbPx = Math.round(kbHeight);
      const root = document.documentElement.style;
      // Skip same-value writes — ResizeObserver fires on every topBar text
      // mutation (section name, tempo, progress); unconditional setProperty
      // would trigger a :root style recalc on each.
      if (topClusterBottom !== lastTopClusterPx) {
        lastTopClusterPx = topClusterBottom;
        if (topClusterBottom > 0) {
          root.setProperty('--top-cluster-bottom', topClusterBottom + 'px');
        } else {
          root.removeProperty('--top-cluster-bottom');
        }
      }
      if (kbPx !== lastKbHeightPx) {
        lastKbHeightPx = kbPx;
        root.setProperty('--kb-height', kbPx + 'px');
      }
      refreshOsmdRect();
    }
    syncLayout();
    // Coalesce resize bursts (iPad URL-bar collapse, iOS keyboard show/hide
    // each fire many resize events in rapid succession) onto a single rAF.
    let _resizePending = false;
    function onResizeBurst() {
      if (_resizePending) return;
      _resizePending = true;
      requestAnimationFrame(() => {
        _resizePending = false;
        syncLayout();
      });
    }
    window.addEventListener('resize', onResizeBurst);
    window.addEventListener('orientationchange', onResizeBurst);
    if (typeof ResizeObserver !== 'undefined') {
      if (DOM.practiceTopBar) new ResizeObserver(syncLayout).observe(DOM.practiceTopBar);
      // Watch OSMD too — its height changes on score load, OSMD re-render,
      // and any layout-mode flip. Without this, drawPracticeLane would read
      // stale rect after osmd renders fresh notation.
      if (DOM.osmdContainer) new ResizeObserver(refreshOsmdRect).observe(DOM.osmdContainer);
    }

    // ========================================
    // Theme switching + persisted user preferences
    // ========================================
    const prefs = {
      theme: 0,
      synesthesia: false,
      audioOffsetMs: null,   // null = auto-detect from AudioContext.outputLatency
      debug: false,
      lang: 'en'             // 'en' | 'jp' — practice-flow UI language
    };
    function loadJSON(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch (e) { return fallback; }
    }
    let _localStorageQuotaWarned = false;
    function saveJSON(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); }
      catch (e) {
        // Safari Private Mode + storage-full both throw QuotaExceededError.
        // Without this, settings appear to apply but vanish on reload.
        if (!_localStorageQuotaWarned) {
          _localStorageQuotaWarned = true;
          console.warn('[PREFS] localStorage write failed (' + (e?.name || 'Err') + '). Settings will not persist.');
        }
      }
    }
    // Sanitize loaded prefs: an out-of-range theme/lang from a tampered
    // localStorage payload would otherwise silently break the UI (no active
    // theme dot, mis-rendered text). Drop unknown keys; clamp known ones.
    function sanitizePrefs(raw) {
      if (!raw || typeof raw !== 'object') return {};
      const out = {};
      if (typeof raw.theme === 'number' && raw.theme >= 0 && raw.theme < 4) out.theme = raw.theme | 0;
      if (typeof raw.synesthesia === 'boolean') out.synesthesia = raw.synesthesia;
      if (raw.audioOffsetMs === null || (typeof raw.audioOffsetMs === 'number' && isFinite(raw.audioOffsetMs))) {
        out.audioOffsetMs = raw.audioOffsetMs;
      }
      if (typeof raw.debug === 'boolean') out.debug = raw.debug;
      if (raw.lang === 'en' || raw.lang === 'jp') out.lang = raw.lang;
      return out;
    }
    Object.assign(prefs, sanitizePrefs(loadJSON('pianoViz_prefs', {})));
    function savePrefs() { saveJSON('pianoViz_prefs', prefs); }

    // ========================================
    // i18n — practice-flow strings only (free-play / quest / dev strings stay English)
    // ========================================
    // Entries without a `jp` field are reserved for true loanwords that read
    // identically in JP context (Perfect, Nice, GO!, SUSTAIN, URL). `t()`
    // falls back to `en` for those. Everything else has a real translation.
    const T_STRINGS = {
      // Settings panel
      settings:           { en: 'Settings',                  jp: '設定' },
      close:              { en: 'Close',                     jp: '閉じる' },
      backToTitle:        { en: 'Back to title',             jp: 'タイトルにもどる' },
      display:            { en: 'Display',                   jp: '表示' },
      synesthesia:        { en: 'Synesthesia mode (each note has its own color)',
                            jp: '音階色モード（音ごとに色が変わる）' },
      synesthesiaTitle:   { en: 'Synesthesia mode',         jp: '音階色モード' },
      timingCalibration:  { en: 'Timing Calibration',       jp: 'タイミング調整' },
      audioOffset:        { en: 'Audio offset',              jp: '音と画面のずれ補正' },
      audioOffsetHelp:    { en: 'If you play on the beat but it\'s judged "late", raise the number. If your press is rejected as "early", lower it.',
                            jp: '拍に合わせて弾いてるのに「遅い」判定になる時は数値を上げる。「早い」判定になる時は下げる。' },
      autoDetectedFmt:    { en: 'Auto-detected value in use (currently {v} ms)',
                            jp: '自動検出値を使用中（現在: {v} ms）' },
      resetToAuto:        { en: 'Use auto-detected value',   jp: '自動検出に戻す' },
      input:              { en: 'Input',                    jp: '入力' },
      micInput:           { en: 'Mic input',                 jp: 'マイク入力' },
      micStandby:         { en: 'Standby',                   jp: '待機中' },
      scanMidi:           { en: 'Scan for MIDI keyboard',    jp: 'MIDIキーボードを探す' },
      connectBluetooth:   { en: 'Connect Bluetooth',         jp: 'Bluetooth接続' },
      other:              { en: 'Other',                     jp: 'その他' },
      resetSession:       { en: 'Reset session',             jp: 'セッションをリセット' },
      debugOverlay:       { en: 'Debug overlay',             jp: 'デバッグ表示' },
      language:           { en: 'Language',                  jp: '言語' },
      // Intro hint / MIDI diagnostics
      introNeedMidi:      { en: '🎹 Please connect a MIDI keyboard<br>(microphone unavailable)',
                            jp: '🎹 MIDIキーボードを接続してください<br>（マイクが使えません）' },
      diagWebMidiUnsupported: { en: '🎹 This browser does not support Web MIDI',
                                jp: '🎹 このブラウザは Web MIDI 非対応' },
      diagNoMidiPort:     { en: '🎹 No MIDI port found',
                            jp: '🎹 MIDIポートが見つかりません' },
      diagWmbHint:        { en: 'In WMB, disconnect → reconnect the keyboard, then tap 🔄 again',
                            jp: 'WMBの設定でキーボードを一度切断→再接続してから🔄を再度タップ' },
      diagConnectHint:    { en: 'Connect the keyboard via USB/Bluetooth, then tap 🔄',
                            jp: 'キーボードをUSB/Bluetoothで接続してから🔄をタップ' },
      diagDetectedFmt:    { en: '🎹 Detected: {v}',
                            jp: '🎹 認識中: {v}' },
      diagCouldNotConnect:{ en: 'Could not connect',          jp: '接続できませんでした' },
      diagMidiError:      { en: '🎹 MIDI error',              jp: '🎹 MIDIエラー' },
      midiConnectedFmt:   { en: '🎹 Connected: {v}',          jp: '🎹 接続: {v}' },
      // Alerts
      alertWebBluetoothUnsupported: { en: 'This browser does not support Web Bluetooth.\n\nAndroid Chrome / Mac Chrome / Linux Chrome are supported.\niPad Safari is not — use the "Web MIDI Browser" app instead.',
                                      jp: 'このブラウザは Web Bluetooth に対応していません。\n\nAndroid Chrome / Mac Chrome / Linux Chrome は対応。\niPad Safari は非対応 → 「Web MIDI Browser」アプリを使ってください。' },
      alertBleConnectFailedFmt: { en: 'Could not connect to Bluetooth keyboard:\n{v}',
                                  jp: 'Bluetoothキーボードに接続できませんでした:\n{v}' },
      alertScoreLoadFailedFmt: { en: 'Failed to load score\n{v}',
                                 jp: '楽譜の読み込みに失敗しました\n{v}' },
      // Session summary
      sumBestFmt:         { en: '✨ All-time best: {combo} combo / Flow {flow}% (session #{n})',
                            jp: '✨ 歴代ベスト: {combo}コンボ / フロー{flow}% (第{n}回セッション)' },
      sumAllClear:        { en: '🎉 ALL CLEAR! 🎉',             jp: '🎉 全クリア！ 🎉' },
      sumQuestProgressFmt:{ en: '{n}/{total} cleared',          jp: '{n}/{total} クリア' },
      // Input indicator tooltips
      tipMidiKeyboardFmt: { en: 'MIDI keyboard: {v}',         jp: 'MIDIキーボード: {v}' },
      tipMicMode:         { en: 'Mic input mode',             jp: 'マイク入力モード' },
      tipIosMidiBlocked:  { en: 'iPad/iPhone Safari does not support Web MIDI. Use mic input. (For BLE-MIDI keyboards, install the "Web MIDI Browser" iOS app)',
                            jp: 'iPad/iPhone のSafariはWeb MIDI非対応。マイク入力で演奏してください。（BLE-MIDIキーボードを使うには「Web MIDI Browser」アプリが必要）' },
      // Console-only iOS MIDI guidance
      consoleIosMidi:     { en: 'iOS/iPadOS detected — Web MIDI is unavailable on Safari/WebKit. Use a desktop browser, Steam Deck, or the "Web MIDI Browser" iOS app for BLE-MIDI.',
                            jp: 'iOS/iPadOS検出 — Safari/WebKitではWeb MIDI非対応。デスクトップブラウザ・Steam Deck・iOS「Web MIDI Browser」アプリのいずれかを利用。' },
      // Start screen
      tagline:            { en: 'Play the piano and watch the screen come alive',
                            jp: 'ピアノを弾くと画面がきれいに光るよ' },
      freePlay:           { en: 'Free Play',                 jp: 'フリープレイ' },
      // Song panel
      // Leading space lives in the EN value so JP renders "1日れんしゅう中"
      // without a half-width gap between the digit and 日.
      dayStreak:          { en: ' day streak',               jp: '日れんしゅう中' },
      tempo:              { en: 'Tempo',                    jp: 'テンポ' },
      startFrom:          { en: 'Start from',                jp: 'どこからはじめる？' },
      whichHand:          { en: 'Which hand?',               jp: 'どの手で弾く？' },
      leftOnly:           { en: '👈 Left only',              jp: '👈 左手だけ' },
      bothHands:          { en: '🤝 Both',                    jp: '🤝 両手' },
      rightOnly:          { en: 'Right only 👉',             jp: '右手だけ 👉' },
      modeLabel:          { en: 'Mode',                     jp: 'モード' },
      modeListen:         { en: '🎧 Listen',                 jp: '🎧 きく' },
      modeGuided:         { en: '✨ Guided',                  jp: '✨ ガイド' },
      modeRhythm:         { en: '🎵 Rhythm',                 jp: '🎵 リズム' },
      ghostPlayback:      { en: '👻 Ghost playback (demo)',  jp: '👻 おてほん再生（ゴースト）' },
      metronome:          { en: '🥁 Metronome',              jp: '🥁 メトロノーム' },
      back:               { en: 'Back',                      jp: 'もどる' },
      startPractice:      { en: '▶ Start practice',          jp: '▶ れんしゅうスタート' },
      startListening:     { en: '🎧 Start listening',         jp: '🎧 きいてみる' },
      // Listen-mode result
      listenedTitle:      { en: '🎧 Nicely listened!',        jp: '🎧 さいごまで聴けたね！' },
      listenedMsg:        { en: 'Now try playing along.',     jp: 'つぎは弾いてみよう。' },
      tryPlayingNow:      { en: '▶ Try playing',              jp: '▶ 弾いてみる' },
      // Practice HUD
      score:              { en: 'Score',                     jp: '楽譜' },
      quit:               { en: 'Quit',                      jp: 'やめる' },
      inputSource:        { en: 'Input source',             jp: '入力ソース' },
      // Result screen
      pitchAccuracy:      { en: 'Pitch accuracy',            jp: '音程の正確さ' },
      timing:             { en: 'Timing',                   jp: 'タイミング' },
      noteLength:         { en: 'Note length',               jp: '音の長さ' },
      bestComboLabel:     { en: 'Best combo',                jp: '連続成功（最高）' },
      songSelect:         { en: 'Song select',               jp: 'きょく選択' },
      tryAgainBtn:        { en: 'Try again',                 jp: 'もう一度' },
      nextBtn:            { en: 'Next →',                    jp: 'つぎへ →' },
      // Hit chips / dynamic
      perfect:            { en: 'Perfect!' },
      nice:               { en: 'Nice!' },
      missChip:           { en: 'Miss',                     jp: 'ミス' },
      youPlayedFmt:       { en: 'You played: {v}',           jp: '弾いた音: {v}' },
      tooShort:           { en: '⏱ Too short',               jp: '⏱ 短い' },
      tooLong:            { en: '⏱ Too long',                jp: '⏱ 長い' },
      // Lane labels
      laneLeft:           { en: 'LEFT',                      jp: '左手' },
      laneRight:          { en: 'RIGHT',                     jp: '右手' },
      countInGo:          { en: 'GO!' },
      // Stages
      stage1:             { en: 'Awakening',                 jp: 'めざめ' },
      stage2:             { en: 'Blooming',                  jp: 'はなひらく' },
      stage3:             { en: 'Aurora',                    jp: 'オーロラ' },
      stage4:             { en: 'Cosmos',                    jp: 'コスモス' },
      stage5:             { en: 'Radiance',                  jp: 'かがやき' },
      stage6:             { en: 'Legend',                    jp: 'でんせつ' },
      // Encouragement tiers
      enc1:               { en: 'Nice!',                     jp: 'いいよ！' },
      enc2:               { en: 'Great!',                    jp: 'すごい！' },
      enc3:               { en: 'On a roll!',                jp: 'のってきた！' },
      enc4:               { en: 'Sparkle!',                  jp: 'きらきら！' },
      enc5:               { en: 'Beautiful!',                jp: 'すてきなおと！' },
      enc6:               { en: 'Like magic!',               jp: 'まほうみたい！' },
      enc7:               { en: 'Shining!',                  jp: 'かがやいてる！' },
      enc8:               { en: 'Awesome!',                  jp: 'さいこう！' },
      // Result tiers
      tier0Title:         { en: 'Try again!',                jp: 'もういちど！' },
      tier0Msg:           { en: 'Start with a slow tempo. Give it another try!',
                            jp: 'まずはゆっくりテンポでも大丈夫。リトライしてみよう！' },
      tier1Title:         { en: 'Clear!',                    jp: 'クリア！' },
      tier1Msg:           { en: 'Clear! Keep practicing to get even better.',
                            jp: 'クリアおめでとう！くりかえしで上達するよ。' },
      tier2Title:         { en: '🎉 Part Clear!',            jp: '🎉 章クリア！' },
      tier2Msg:           { en: 'Great job! Almost perfect!',
                            jp: 'よくがんばったね！もう少しでパーフェクト！' },
      tier3Title:         { en: '🌟 Perfect!',               jp: '🌟 パーフェクト！' },
      tier3Msg:           { en: 'Brilliant! Try the next difficulty!',
                            jp: 'すばらしい！次の難しさにチャレンジ！' },
      // Songs (Für Elise)
      furElise:           { en: 'Für Elise',                 jp: 'エリーゼのために' },
      feA1:               { en: 'Part 1: Theme',             jp: '第1章 主題' },
      feA1desc:           { en: 'The famous melody. Start gently.',
                            jp: '有名なあのメロディ。やさしく始めよう。' },
      feB:                { en: 'Part 2: Gentle Middle',     jp: '第2章 おだやかな中間' },
      feBdesc:            { en: 'A bright C-major section, then back to the theme.',
                            jp: 'C長調のあかるい部分→主題に戻ります。' },
      feA2:               { en: 'Part 3: Storm & Finale',    jp: '第3章 嵐とフィナーレ' },
      feA2desc:           { en: 'A D-minor storm, then back to the theme — the climax!',
                            jp: 'D短調の嵐→主題に戻りラスト！ここがクライマックス。' },
      // Songs (Turkish March)
      turkishMarch:       { en: 'Turkish March',             jp: 'トルコ行進曲' },
      taA1:               { en: 'Part 1: Light Theme',       jp: '第1章 軽やかな主題' },
      taA1desc:           { en: 'The famous theme plus an A-major contrasting section. Right-hand scales feel great.',
                            jp: '有名な主題＋A長調の対比部。右手のスケールが気持ちいい。' },
      taB:                { en: 'Part 2: Theme Variations',  jp: '第2章 主題のへんそう' },
      taBdesc:            { en: 'The theme returns transformed — chord practice.',
                            jp: '主題が形を変えてかえってくる。和音の練習。' },
      taA2:               { en: 'Part 3: March Festival',    jp: '第3章 マルチアの祭り' },
      taA2desc:           { en: "The coda's powerful octaves! Race to the finale.",
                            jp: 'コーダの力強いオクターブ！フィナーレに駆けあがろう。' },
      // Misc
      loadingScore:       { en: 'Loading score…',            jp: '楽譜を読み込み中…' },
      starting:           { en: 'Starting...',               jp: '起動中...' },
      audioInitFailedFmt: { en: 'Audio init failed: {v}\n\nReload the browser and try again.',
                            jp: 'オーディオ初期化に失敗しました: {v}\n\nブラウザを更新してリトライしてみてください。' },
      // Composers — last-name katakana for JP (common in JP music ed)
      composerBeethoven:  { en: 'L. v. Beethoven',             jp: 'ベートーヴェン' },
      composerMozart:     { en: 'W. A. Mozart',                jp: 'モーツァルト' },
      // Result-screen unlock messages
      tempoUnlockedFmt:   { en: '🚀 Tempo {v}% unlocked!  ',   jp: '🚀 テンポ {v}% 解放！  ' },
      sectionUnlockedFmt: { en: '🔓 {v} unlocked!',            jp: '🔓 {v} 解放！' },
      streakDaysFmt:      { en: ' ✨ {v}-day streak!',          jp: ' ✨ ストリーク {v}日！' },
      // Result-screen growth chart
      growthChartFmt:     { en: 'Growth ({v} attempts)',        jp: '成長グラフ ({v}回)' },
      trendSimilar:       { en: '→ similar',                    jp: '→ おなじくらい' },
      sustainLabel:       { en: 'SUSTAIN' },
      // Free-play HUD (session status while playing without a song)
      listeningFmt:       { en: '{p}Listening{p}',              jp: '{p}きいてるよ{p}' },
      goalCelebrate:      { en: '✨ Goal reached! Keep it up! ✨',
                            jp: '✨ 目標達成！この調子！ ✨' },
      goalCountdownFmt:   { en: 'Goal: stable play for {v}s',   jp: '目標: 安定演奏 {v}秒' },
      // Free-play quality coaching (shown in the qualityScore HUD)
      strengthFmt:        { en: 'Strength: {v}',                jp: 'できた点: {v}' },
      nextStepFmt:        { en: 'Next: {v}',                    jp: '次の1手: {v}' },
      // Quality coaching strengths
      strNotesClear:      { en: 'playing each note clearly',    jp: '音をしっかり鳴らせている' },
      strGrowing:         { en: 'improving steadily over the last 30s',
                            jp: '直近30秒で着実に伸びている' },
      strRhythmSteady:    { en: 'rhythm is steady',             jp: 'リズムが安定している' },
      strDynamicsGood:    { en: 'good dynamic control',         jp: '強弱のコントロールが良い' },
      strPitchStable:     { en: 'pitch is stable',              jp: '音程の安定感が高い' },
      // Quality coaching next steps
      nxtBreathe:         { en: 'breathe and hold tempo for 20s',
                            jp: '深呼吸して同じテンポを20秒キープ' },
      nxtOneHand:         { en: 'one hand slowly, hold tempo for 20s',
                            jp: '片手でゆっくり、一定テンポを20秒キープ' },
      nxtSoftLoud:        { en: 'build soft to loud across one phrase',
                            jp: '1フレーズの中で弱→強を2段階つける' },
      nxtHoldNotes:       { en: 'hold each note fully before moving on',
                            jp: '1音ずつ最後まで伸ばしてから次の音へ' },
      // Quest names + descriptions (free-play). Reward strings are short enough
      // to leave English (they're brief celebratory tokens).
      qst1Name:           { en: 'First Notes',                  jp: 'はじまりの音' },
      qst1Desc:           { en: 'Play 3 notes',                 jp: '音を3回鳴らしてみよう' },
      qst2Name:           { en: 'Catch the Flow',               jp: '流れに乗って' },
      qst2Desc:           { en: 'Fill the flow gauge halfway',  jp: 'フローゲージを半分までためよう' },
      qst3Name:           { en: 'Combo Master',                 jp: 'コンボマスター' },
      qst3Desc:           { en: 'Reach 30 combo!',              jp: '30コンボ達成！' },
      qst4Name:           { en: 'Clean Tone',                   jp: 'きれいな音' },
      qst4Desc:           { en: 'Keep stability at 80%+',       jp: '安定性80%以上をキープ' },
      qst5Name:           { en: 'Pianist',                      jp: 'ピアニスト' },
      qst5Desc:           { en: 'Play with confidence',         jp: '自信を持って演奏しよう' },
      qst6Name:           { en: 'Rhythm Master',                jp: 'リズムの達人' },
      qst6Desc:           { en: 'Rhythm score 85%+',            jp: 'リズムスコア85%以上！' },
      qst7Name:           { en: 'Peak Flow',                    jp: 'フローの極み' },
      qst7Desc:           { en: 'Reach 95% flow',               jp: 'フローゲージを95%以上にしよう' },
      qst8Name:           { en: '100 Combo',                    jp: '100コンボ' },
      qst8Desc:           { en: 'Reach 100 combo!',             jp: '100コンボ達成！' },
      qst9Name:           { en: 'Dynamics',                     jp: 'ダイナミクス' },
      qst9Desc:           { en: 'Dynamics 80%+',                jp: 'ダイナミクス80%以上！' },
      qst10Name:          { en: 'Full Focus',                   jp: '全集中' },
      qst10Desc:          { en: 'Overall score 85%+',           jp: '総合スコア85%以上！' },
      qst11Name:          { en: 'Legendary Pianist',            jp: '伝説のピアニスト' },
      qst11Desc:          { en: '200 combo & 90% flow',         jp: '200コンボ&フロー90%以上' },
      // Quest display chrome
      questAllClearFmt:   { en: '🎉 {n}/{n} All Clear!',         jp: '🎉 {n}/{n} 全クリア！' },
      questTargetFmt:     { en: '🎯 {v}',                        jp: '🎯 {v}' },
      questClearedFmt:    { en: '✅ {v} CLEARED!',               jp: '✅ {v} クリア！' },
      // Session summary (post free-play)
      sumTitle:           { en: '🎹 Session Results',           jp: '🎹 セッション結果' },
      sumBestCombo:       { en: '🎵 Best Combo',                jp: '🎵 ベストコンボ' },
      sumStageReached:    { en: '🏔 Stage Reached',             jp: '🏔 到達ステージ' },
      sumPlayTime:        { en: '⏱ Play Time',                  jp: '⏱ 演奏時間' },
      sumQuests:          { en: '⭐ Quests',                     jp: '⭐ クエスト' },
      sumTitleBtn:        { en: '🏠 Title',                     jp: '🏠 タイトル' },
      sumContinue:        { en: 'Continue →',                   jp: 'つづける →' },
      // User-song UI
      addSongBtn:         { en: '➕ Add a song',                  jp: '➕ 曲を追加' },
      addSongTitle:       { en: 'Add a song',                    jp: '曲を追加' },
      addSongTabLibrary:  { en: '📚 Library',                   jp: '📚 ライブラリ' },
      addSongTabFile:     { en: '📁 File',                      jp: '📁 ファイル' },
      addSongTabUrl:      { en: '🔗 URL' },
      addSongLibraryHelp: { en: 'Free public-domain pieces from MuseTrainer (jsDelivr CDN). Tap to download.',
                            jp: 'MuseTrainer のパブリックドメイン曲（jsDelivr経由）。タップでダウンロード。' },
      addSongFilePick:    { en: 'Choose .mxl / .musicxml / .xml file',
                            jp: '.mxl / .musicxml / .xml ファイルを選択' },
      addSongFileHelp:    { en: 'Drop a MusicXML file. I confirm it is public domain or my own work.',
                            jp: 'MusicXML ファイルをドロップ。パブリックドメインまたは自作の曲であることを確認します。' },
      addSongPdAttest:    { en: 'I confirm this score is public domain or my own work',
                            jp: 'パブリックドメインまたは自作の曲です' },
      addSongUrlPlaceholder: { en: 'https://cdn.jsdelivr.net/.../score.mxl' },
      addSongUrlHelp:     { en: 'Paste a direct .mxl / .musicxml URL (must be CORS-enabled, e.g. jsDelivr).',
                            jp: '.mxl / .musicxml の直リンク（CORS対応URL、例: jsDelivr）。' },
      addSongFetch:       { en: '⬇ Download',                   jp: '⬇ ダウンロード' },
      addSongAdded:       { en: 'Added!',                        jp: '追加しました！' },
      addSongFailed:      { en: 'Failed: {v}',                   jp: '失敗: {v}' },
      myLibrary:          { en: 'My library',                    jp: 'マイライブラリ' },
      addSongRemove:      { en: 'Delete',                        jp: '削除' },
      addSongConfirmRemove: { en: 'Delete "{v}"? This cannot be undone.',
                              jp: '「{v}」を削除しますか？元に戻せません。' },
      addSongSearch:      { en: 'Search composer / title…',     jp: '作曲家・曲名で検索…' },
      addSongLibraryLoading: { en: 'Loading catalog…',          jp: 'カタログ取得中…' },
      addSongLibraryCount:{ en: '{n} pieces',                   jp: '{n} 曲' },
      addSongLibraryOffline: { en: 'Catalog offline — showing seed list',
                               jp: 'カタログ取得失敗 — 既定リストを表示' },
      addSongExport:      { en: '⬇ Export library',             jp: '⬇ エクスポート' },
      addSongImport:      { en: '⬆ Import',                     jp: '⬆ インポート' },
      addSongImportDone:  { en: 'Imported {n} song(s)',         jp: '{n} 曲をインポートしました' },
      addSongEditSections:{ en: '✎ Edit sections',              jp: '✎ 章を編集' },
      addSongRename:      { en: '✎ Rename',                     jp: '✎ 名前を変更' },
      addSongRenamePromptTitle:    { en: 'New title:',           jp: '新しい曲名：' },
      addSongRenamePromptComposer: { en: 'New composer:',        jp: '新しい作曲家：' },
      sectionEditTitle:   { en: 'Edit sections',                jp: '章の編集' },
      sectionEditHelp:    { en: 'Set start measure (1-based) for each part. Total: {v} measures.',
                            jp: '各章の開始小節を入力（1始まり）。全{v}小節。' },
      sectionEditSave:    { en: 'Save',                         jp: '保存' },
      sectionEditCancel:  { en: 'Cancel',                       jp: 'キャンセル' },
      sectionEditError:   { en: 'Boundaries must be increasing and within range.',
                            jp: '小節番号は昇順かつ範囲内で入力してください。' },
      // Auto-section names for user-added songs (no human-curated descriptions)
      userSecA1:          { en: 'Part 1',                        jp: '第1章' },
      userSecA1desc:      { en: 'Opening section',               jp: '冒頭の部分' },
      userSecB:           { en: 'Part 2',                        jp: '第2章' },
      userSecBdesc:       { en: 'Middle section',                jp: 'まんなかの部分' },
      userSecA2:          { en: 'Part 3 (climax)',               jp: '第3章（クライマックス）' },
      userSecA2desc:      { en: 'Final section',                 jp: 'おわりの部分' }
    };

    function t(key, vars) {
      // User-added songs use synthetic key prefixes to avoid polluting T_STRINGS:
      //   __userTitle:<id>     → song title from IndexedDB record
      //   __userComposer:<id>  → composer string
      // Falls through to the normal lookup for everything else.
      if (typeof key === 'string' && key.startsWith('__user')) {
        const colon = key.indexOf(':');
        const which = key.slice(2, colon);
        const id = key.slice(colon + 1);
        const song = (typeof SONGS !== 'undefined') ? SONGS[id] : null;
        if (song) {
          if (which === 'userTitle') return song._userTitle || id;
          if (which === 'userComposer') return song._userComposer || '';
        }
        return '';
      }
      const entry = T_STRINGS[key];
      if (!entry) return key;
      let s = entry[prefs.lang] || entry.en || key;
      if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
      return s;
    }

    function applyI18n() {
      document.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        const tk = el.getAttribute('data-i18n-title');
        const pk = el.getAttribute('data-i18n-placeholder');
        const ak = el.getAttribute('data-i18n-aria-label');
        if (k) el.textContent = t(k);
        if (tk) el.title = t(tk);
        if (pk) el.placeholder = t(pk);
        if (ak) el.setAttribute('aria-label', t(ak));
      });
      // Notify code paths that re-render their own text (song panel, result screen, etc.).
      window.dispatchEvent(new CustomEvent('langchange'));
    }

    function setLang(lang) {
      prefs.lang = lang === 'jp' ? 'jp' : 'en';
      savePrefs();
      // Keep <html lang> in sync so screen readers announce the right voice.
      // The HTML default is 'ja'; without this the en-flipped UI would still
      // be read by a Japanese voice on iOS VoiceOver / NVDA.
      document.documentElement.lang = prefs.lang === 'jp' ? 'ja' : 'en';
      applyI18n();
    }

    // Stage label — Phase 0b.3: delegated to @piano/core.
    const stageLabel = (stage) => PianoCore.stageLabel(stage, t);

    function applyTheme(idx) {
      prefs.theme = idx;
      state.currentTheme = idx;
      document.querySelectorAll('.theme-dot').forEach(d => {
        const isActive = parseInt(d.dataset.theme) === idx;
        d.classList.toggle('active', isActive);
        d.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
    }
    applyTheme(prefs.theme);
    // Theme dots are role="radio" — accept Enter/Space too so a keyboard /
    // assistive-tech user can pick a theme without a pointer.
    const onThemeDotActivate = (d) => {
      applyTheme(parseInt(d.dataset.theme));
      savePrefs();
    };
    document.querySelectorAll('.theme-dot').forEach(d => {
      d.addEventListener('click', () => onThemeDotActivate(d));
      d.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onThemeDotActivate(d);
        }
      });
    });

    const synToggle = document.getElementById('synesthesiaToggle');
    function applySynesthesia(on) {
      prefs.synesthesia = on;
      state.useSynesthesiaMode = on;
      synToggle.classList.toggle('active', on);
      synToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    applySynesthesia(prefs.synesthesia);
    const onSynToggle = () => {
      applySynesthesia(!state.useSynesthesiaMode);
      savePrefs();
    };
    synToggle.addEventListener('click', onSynToggle);
    synToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSynToggle();
      }
    });

    // ========================================
    // Settings panel
    // ========================================
    // Modal focus management helpers. modalFocus.open captures the element
    // that had focus before the modal opened, moves focus to the first
    // interactive descendant, and installs a Tab-cycling guard. Close
    // restores focus and removes the guard. Called from every open/close
    // pair so a keyboard / assistive-tech user can dismiss without a mouse
    // and never tab into the (visually obscured) page beneath.
    const modalFocus = (() => {
      const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const stack = [];  // { el, prev, onKey }
      function trapHandler(modalEl) {
        return (e) => {
          if (e.key !== 'Tab') return;
          const items = modalEl.querySelectorAll(FOCUSABLE);
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        };
      }
      return {
        open(modalEl) {
          if (!modalEl) return;
          const prev = document.activeElement;
          const onKey = trapHandler(modalEl);
          modalEl.addEventListener('keydown', onKey);
          stack.push({ el: modalEl, prev, onKey });
          // Defer focus until the modal is laid out (display flips happen
          // synchronously but querySelector inside a hidden tree is fine).
          requestAnimationFrame(() => {
            const first = modalEl.querySelector(FOCUSABLE);
            if (first) first.focus();
          });
        },
        close(modalEl) {
          // Pop the topmost matching entry — modals don't always close in
          // strict LIFO (e.g. a section-edit modal can spawn from add-song)
          // but the prev focus we want to restore is always the one we
          // pushed for this specific modalEl.
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].el === modalEl) {
              const entry = stack[i];
              stack.splice(i, 1);
              entry.el.removeEventListener('keydown', entry.onKey);
              if (entry.prev && typeof entry.prev.focus === 'function') {
                try { entry.prev.focus(); } catch (_) {}
              }
              return;
            }
          }
        },
      };
    })();

    function openSettings() {
      DOM.settingsPanel.classList.add('visible');
      refreshSettingsPanel();
      modalFocus.open(DOM.settingsPanel);
    }
    function closeSettings() {
      DOM.settingsPanel.classList.remove('visible');
      modalFocus.close(DOM.settingsPanel);
    }

    function refreshAudioOffsetUI() {
      const isAuto = prefs.audioOffsetMs == null;
      // `(true && 0) || DEFAULT` collapses 0 to DEFAULT — use ?? so a
      // legitimate 0ms override (Linux desktop with negligible buffering)
      // displays correctly instead of jumping to the 40ms fallback.
      const autoValue = (typeof practice !== 'undefined' ? practice.audioOffsetMs : null)
                        ?? DEFAULT_AUDIO_OFFSET_MS;
      const value = Math.round(isAuto ? autoValue : prefs.audioOffsetMs);
      DOM.audioOffsetSlider.value = value;
      DOM.audioOffsetVal.textContent = value;
      DOM.audioOffsetAuto.textContent = isAuto ? t('autoDetectedFmt', { v: value }) : '';
    }

    function refreshSettingsPanel() {
      refreshAudioOffsetUI();
      // Input source status
      if (typeof midiInput !== 'undefined' && midiInput.enabled && midiInput.port?.name) {
        DOM.settingsInputStatus.textContent = '🎹 ' + midiInput.port.name;
      } else if (typeof state !== 'undefined' && state.micSuspended) {
        DOM.settingsInputStatus.textContent = '🎙️ ' + t('micStandby');
      } else {
        DOM.settingsInputStatus.textContent = '🎙️ ' + t('micInput');
      }
      // BLE button only when Web Bluetooth is supported (Chrome/Edge desktop, Android Chrome)
      const bleSupported = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
      DOM.settingsBleBtn.style.display = bleSupported ? '' : 'none';
      // Reset session is only meaningful when audio is alive — disable on title.
      const running = !!(state && state.running);
      DOM.settingsResetBtn.disabled = !running;
      DOM.settingsResetBtn.style.opacity = running ? '' : '.45';
      DOM.settingsResetBtn.style.cursor = running ? 'pointer' : 'not-allowed';
    }

    DOM.settingsBtn.addEventListener('click', openSettings);
    DOM.settingsCloseBtn.addEventListener('click', closeSettings);
    DOM.settingsPanel.addEventListener('click', (e) => {
      if (e.target === DOM.settingsPanel) closeSettings();
    });
    // Single, ordered ESC handler for every modal. Highest-z first so the
    // topmost layer pops first; if the user is currently typing inside an
    // <input> / <textarea> we let the browser's native ESC handling run
    // (clears the field) instead of nuking the modal mid-edit.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Don't shadow the t() translator; ESC inside an input clears the
      // browser's native field — let it run instead of nuking the modal.
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) {
        if (tgt.value && tgt.value.length > 0) return;
      }
      // sectionEditModal sits above addSongModal in z; settingsPanel above
      // both; sectionResult / sessionSummary / songPanel close to title.
      const SECEDIT = typeof DOM_SECEDIT !== 'undefined' ? DOM_SECEDIT : null;
      const ADDSONG = typeof DOM_ADDSONG !== 'undefined' ? DOM_ADDSONG : null;
      if (SECEDIT && SECEDIT.modal && SECEDIT.modal.classList.contains('visible')) {
        closeSectionEditor();
        return;
      }
      if (DOM.settingsPanel.classList.contains('visible')) {
        closeSettings();
        return;
      }
      if (ADDSONG && ADDSONG.modal && ADDSONG.modal.classList.contains('visible')) {
        closeAddSongModal();
        return;
      }
      if (DOM.sessionSummary && DOM.sessionSummary.classList.contains('visible')) {
        DOM.sessionSummary.classList.remove('visible');
        return;
      }
      if (DOM.sectionResult && DOM.sectionResult.classList.contains('visible')) {
        DOM.sectionResult.classList.remove('visible');
      }
    });

    // Debounce localStorage writes — slider drag fires `input` per pixel
    // (~50 events end-to-end) and each was hitting JSON.stringify + setItem.
    let _audioOffsetSaveTimer = null;
    DOM.audioOffsetSlider.addEventListener('input', () => {
      const v = parseInt(DOM.audioOffsetSlider.value, 10);
      // Bail on NaN — `practiceRealElapsedMs` would propagate NaN through
      // every `elapsed - audioOffsetMs` subtraction for the rest of the
      // session, breaking lane + cursor + scoring.
      if (!Number.isFinite(v)) return;
      prefs.audioOffsetMs = v;
      if (typeof practice !== 'undefined') practice.audioOffsetMs = v;
      DOM.audioOffsetVal.textContent = v;
      DOM.audioOffsetAuto.textContent = '';
      clearTimeout(_audioOffsetSaveTimer);
      _audioOffsetSaveTimer = setTimeout(savePrefs, 250);
    });
    DOM.audioOffsetReset.addEventListener('click', () => {
      prefs.audioOffsetMs = null;
      savePrefs();
      // Re-trigger auto-detect on next session start; meanwhile use the default.
      if (typeof practice !== 'undefined') practice.audioOffsetMs = DEFAULT_AUDIO_OFFSET_MS;
      refreshAudioOffsetUI();
    });

    DOM.settingsRescanBtn.addEventListener('click', () => {
      // 明示的な再スキャン = dismiss 状態を解除して再エンゲージ
      if (typeof rescanMidi === 'function') rescanMidi();
      closeSettings();
    });
    DOM.settingsBleBtn.addEventListener('click', () => {
      if (typeof connectBleMidi === 'function') {
        connectBleMidi().finally(() => {
          refreshSettingsPanel();
        });
      }
      closeSettings();
    });
    DOM.settingsResetBtn.addEventListener('click', () => {
      closeSettings();
      if (state.running && typeof showSessionSummary === 'function') showSessionSummary();
    });

    // updateDebugOverlay() reads state.debugMode each frame, so applyDebug
    // must keep prefs.debug and state.debugMode in lockstep.
    function applyDebug(on) {
      prefs.debug = on;
      state.debugMode = on;
      DOM.settingsDebugToggle.classList.toggle('on', on);
      if (DOM.debugOverlay) {
        DOM.debugOverlay.classList.toggle('visible', on);
        DOM.debugOverlay.style.display = on ? 'block' : 'none';
      }
    }
    applyDebug(prefs.debug);
    DOM.settingsDebugToggle.addEventListener('click', () => {
      applyDebug(!prefs.debug);
      savePrefs();
    });

    // Language toggle (en ↔ jp). Highlight current; click flips.
    function refreshLangToggle() {
      const btn = document.getElementById('langToggleBtn');
      if (!btn) return;
      btn.textContent = prefs.lang === 'jp' ? '🇯🇵 日本語' : '🇬🇧 EN';
    }
    document.getElementById('langToggleBtn')?.addEventListener('click', () => {
      setLang(prefs.lang === 'jp' ? 'en' : 'jp');
      refreshLangToggle();
      refreshSettingsPanel();   // input status / audio offset use t()
    });
    // Apply persisted language at startup. The langchange event lets song
    // panel / result screen re-render their dynamic text if they're visible.
    document.documentElement.lang = prefs.lang === 'jp' ? 'ja' : 'en';
    applyI18n();
    refreshLangToggle();
    // Page loads on the title screen — body class drives the home-button hide
    // (no point in 🏠 when home is right here) and any future title-only styling.
    document.body.classList.add('title-screen');
    window.addEventListener('langchange', () => {
      // Refresh hot-path caches read from the per-frame lane draw.
      if (typeof activeNoteNames !== 'undefined') {
        activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : CONFIG.NOTE_NAMES;
      }
      laneLabelL = t('laneLeft');
      laneLabelR = t('laneRight');

      // Re-render every screen with imperatively-set localized text. applyI18n
      // walks [data-i18n], but these elements don't carry that — they're set
      // from JS at event time, so we have to refresh them ourselves.
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
      // Re-run the cached intro diagnostic in the new language (if one's showing).
      if (state.lastIntroDiag) state.lastIntroDiag();
    });
    // Lane labels — recomputed on lang change, used in the per-frame draw.
    let laneLabelL = t('laneLeft');
    let laneLabelR = t('laneRight');

    // 3D projection — Phase 0b.3: delegated to @piano/core.
    // Adapter passes the closure W/H so call sites stay positional.
    const FOCAL_LENGTH = PianoCore.FOCAL_LENGTH;
    const NEAR_CLIPPING = PianoCore.NEAR_CLIPPING;
    const project3D = (x, y, z, size) => PianoCore.project3D(x, y, z, size, { screenW: W, screenH: H });

    // Particle system (3D) \u2014 Phase 0b.3: delegated to @piano/core.
    // Monkey-patch core's Particle.prototype.draw so the legacy positional
    // draw(c) signature continues to work everywhere \u2014 closures provide
    // the deps that the new API takes via opts.
    let particles = [];
    const _coreParticleDraw = PianoCore.Particle.prototype.draw;
    PianoCore.Particle.prototype.draw = function (c) {
      return _coreParticleDraw.call(this, c, {
        screenW: W,
        screenH: H,
        useShadow: CONFIG.SHADOW_BLUR_ENABLED && particles.length < 300,
      });
    };
    const Particle = PianoCore.Particle;

    // drawStar / drawFlower — Phase 0b.3: drop-in from @piano/core.
    const drawStar = PianoCore.drawStar;
    const drawFlower = PianoCore.drawFlower;

    // Device performance tier — Phase 0b.3: delegated to @piano/core.
    // detectPerfTier() applies the same Apple-Silicon/iPad/cores/mem heuristic
    // and respects localStorage.pianoViz_perfTier override.
    const PERF_TIER = PianoCore.detectPerfTier();
    const PERF_PROFILE = PianoCore.PERF_PROFILES[PERF_TIER];
    console.log('[PERF] tier=' + PERF_TIER + ' particles=' + PERF_PROFILE.maxParticles3D
      + ' shadowBlur=' + PERF_PROFILE.shadowBlur);

    // Override the static CONFIG flags so existing reads pick up the tier.
    CONFIG.SHADOW_BLUR_ENABLED = PERF_PROFILE.shadowBlur;
    CONFIG.MAX_PARTICLES = PERF_PROFILE.maxParticles3D + 200;   // 2D + 3D combined cap
    CONFIG.AMBIENT_PARTICLE_CHANCE = PERF_PROFILE.ambientChance;

    const MAX_PARTICLES_3D = PERF_PROFILE.maxParticles3D;
    // Sentinel for state.activeQuestId when every quest in CONFIG.QUESTS is cleared.
    const QUEST_ALL_DONE = 'ALL_DONE';

    // getNoteColor — Phase 0b.3: adapter passes legacy CONFIG.NOTE_COLORS.
    const getNoteColor = (noteName) => PianoCore.getNoteColor(noteName, CONFIG.NOTE_COLORS);

    // spawnBurst / spawnStream — Phase 0b.3: adapter passes legacy closure
    // state (W/H/themeColors/flow/MAX_PARTICLES_3D) via opts so call sites
    // stay positional.
    const _spawnOpts = (overrideColor) => ({
      screenW: W,
      screenH: H,
      themeColors: CONFIG.THEMES[state.currentTheme].colors,
      flow: state.flow,
      maxParticles: MAX_PARTICLES_3D,
      overrideColor,
    });
    const spawnBurst = (screenX, screenY, count, energy, overrideColor) =>
      PianoCore.spawnBurst(particles, screenX, screenY, count, energy, _spawnOpts(overrideColor));
    const spawnStream = (screenX, screenY, energy, overrideColor) =>
      PianoCore.spawnStream(particles, screenX, screenY, energy, _spawnOpts(overrideColor));

    // Encouragement effects — Phase 0b.3: 8 effects + triggerEffect dispatcher
    // delegated to @piano/core via a single deps-bag adapter.
    const _effectDeps = () => ({
      particles,
      ripples,
      themeColors: CONFIG.THEMES[state.currentTheme].colors,
      screenW: W,
      screenH: H,
      maxParticles: MAX_PARTICLES_3D,
      state, // EffectGameState slice — effects mutate glowPulseIntensity, shimmerPhase, shimmerStartMs
    });
    const effectGlowPulse = () => PianoCore.effectGlowPulse(_effectDeps());
    const effectGlowParticles = () => PianoCore.effectGlowParticles(_effectDeps());
    const effectColorWave = () => PianoCore.effectColorWave(_effectDeps());
    const effectStarShower = (count) => PianoCore.effectStarShower(_effectDeps(), count);
    const effectFlowerBurst = () => PianoCore.effectFlowerBurst(_effectDeps());
    const effectShimmer = () => PianoCore.effectShimmer(_effectDeps());
    const effectRadiance = () => PianoCore.effectRadiance(_effectDeps());
    const effectGoldenBurst = () => PianoCore.effectGoldenBurst(_effectDeps());
    const triggerEffect = (name) => PianoCore.triggerEffect(name, _effectDeps());

    // Encouragement tier escalator — Phase 0b.3: state machine in @piano/core.
    // Legacy state.currentEncouragementTier / lastEncouragementTimeMs /
    // encouragementHideTimeMs are mirrored from the core state each tick so
    // existing reads (resetSession, quest predicates, debug overlay) keep
    // working unchanged.
    const _encState = PianoCore.initEncouragementState();
    const _encOpts = { tiers: CONFIG.ENCOURAGEMENT_TIERS, displayMs: CONFIG.ENCOURAGEMENT_DISPLAY_MS };
    function _showEncouragementUI(out) {
      if (out.kind !== 'show') return;
      DOM.encouragement.textContent = t(out.messageKey);
      DOM.encouragement.classList.remove('visible');
      DOM.encouragement.classList.add('entering');
      void DOM.encouragement.offsetWidth; // force reflow to restart animation
      DOM.encouragement.classList.remove('entering');
      DOM.encouragement.classList.add('visible');
      triggerEffect(out.effect);
    }
    function _mirrorEncStateToLegacy() {
      state.currentEncouragementTier = _encState.currentTier;
      state.lastEncouragementTimeMs = _encState.lastShownTimeMs;
      state.encouragementHideTimeMs = _encState.hideTimeMs > 0 ? _encState.hideTimeMs : 0;
    }

    // Ripples — Phase 0b.3: delegated to @piano/core.
    // Same monkey-patch pattern as Particle: keep legacy positional
    // r.update() / r.draw(c) call sites by injecting closures into the
    // shared prototype.
    let ripples = [];
    const _coreRippleUpdate = PianoCore.Ripple.prototype.update;
    PianoCore.Ripple.prototype.update = function () {
      return _coreRippleUpdate.call(this, { flow: state.flow });
    };
    const _coreRippleDraw = PianoCore.Ripple.prototype.draw;
    PianoCore.Ripple.prototype.draw = function (c) {
      return _coreRippleDraw.call(this, c, {
        flow: state.flow,
        useShadow: CONFIG.SHADOW_BLUR_ENABLED && ripples.length < 15,
      });
    };
    const Ripple = PianoCore.Ripple;

    // ========================================
    // Background composites — Phase 0b.3: delegated to @piano/core.
    // Star field stored as { stars: [...] } via initBackground; drawBgStars
    // mutates the twinkle phase in-place. Aurora + flowers are pure draws.
    let _bg = null;
    function initBgStars() {
      _bg = PianoCore.initBackground({
        screenW: W,
        screenH: H,
        starCount: PERF_PROFILE.bgStarCount,
      });
    }
    const _themeColors = () => CONFIG.THEMES[state.currentTheme].colors;
    const drawBgStars = (_time) => {
      if (!_bg) return;
      PianoCore.drawBgStars(ctx, _bg, { flow: state.flow, themeColors: _themeColors() });
    };
    const drawAurora = (time) =>
      PianoCore.drawAurora(ctx, {
        screenW: W,
        screenH: H,
        flow: state.flow,
        themeColors: _themeColors(),
        timeMs: time,
      });
    const drawGroundFlowers = (time) =>
      PianoCore.drawGroundFlowers(ctx, {
        screenW: W,
        screenH: H,
        flow: state.flow,
        themeColors: _themeColors(),
        timeMs: time,
      });

    // ========================================
    // Audio analysis — Phase 0b.3: delegated to @piano/core.
    // ========================================
    // YIN pitch detection, freq-to-note, 4 spectral features, and the v9
    // harmonicity gate are all drop-in replaced by the bundle. Same
    // algorithms, same defaults (CONFIG values match core's DEFAULTS).
    // The scratch buffers (_diffBuf / _cmndfBuf) live inside core's module.
    const detectPitchYIN = PianoCore.detectPitchYIN;
    const freqToNote = PianoCore.freqToNote;
    const computeSpectralFlatness = PianoCore.computeSpectralFlatness;
    const computeSpectralCrest = PianoCore.computeSpectralCrest;
    const computeSpectralCentroid = PianoCore.computeSpectralCentroid;
    const coefficientOfVariation = PianoCore.coefficientOfVariation;
    const computeHarmonicity = PianoCore.computeHarmonicity;

    // ========================================
    // Multi-Feature Onset Detection (v9 — with harmonicity)
    // ========================================
    function updateMultiFeatureOnset(timeMs, currentPitchHz) {
      if (!onsetAnalyser || !onsetDataArray) {
        state.debugGateOpen = false;
        return { isOnset: false, gateOpen: false };
      }

      onsetAnalyser.getByteFrequencyData(onsetDataArray);

      const binHz = audioCtx.sampleRate / onsetAnalyser.fftSize;
      const startBin = Math.max(1, Math.floor(CONFIG.FLUX_FREQ_MIN_HZ / binHz));
      const endBin = Math.min(onsetDataArray.length, Math.floor(CONFIG.FLUX_FREQ_MAX_HZ / binHz));
      const numBins = endBin - startBin;

      if (numBins < 10) {
        const gateOpen = (timeMs - state.lastOnsetTimeMs) < CONFIG.ONSET_GATE_DURATION_MS;
        state.debugGateOpen = gateOpen;
        return { isOnset: false, gateOpen };
      }

      if (!state.prevSpectrum) {
        state.prevSpectrum = new Float32Array(onsetDataArray.length);
        state.prevSpectrum.set(onsetDataArray);
        state.debugGateOpen = false;
        return { isOnset: false, gateOpen: false };
      }

      // Feature 1: Spectral Flux
      let flux = 0;
      let spreadCount = 0;
      for (let i = startBin; i < endBin; i++) {
        const diff = onsetDataArray[i] - state.prevSpectrum[i];
        if (diff > 0) {
          flux += diff;
          if (diff > CONFIG.ONSET_SPREAD_MIN_CHANGE) {
            spreadCount++;
          }
        }
      }
      const spread = spreadCount / numBins;

      // Feature 2: Spectral Flatness
      const flatness = computeSpectralFlatness(onsetDataArray, startBin, endBin);

      // Feature 3: Spectral Crest
      const crest = computeSpectralCrest(onsetDataArray, startBin, endBin);

      // Feature 4: Spectral Centroid (debug tracking)
      const centroid = computeSpectralCentroid(onsetDataArray, startBin, endBin, binHz);
      state.centroidHistory.push(centroid);
      if (state.centroidHistory.length > CONFIG.CENTROID_HISTORY_SIZE) {
        state.centroidHistory.shift();
      }
      const centroidCV = coefficientOfVariation(state.centroidHistory);

      // v9: Feature 5 — Harmonicity check.
      // Practice mode tightens the threshold so non-pitched sounds (voice, key noise,
      // chair creaks, claps) can't masquerade as notes.
      let harmonicity = 0;
      let harmonicityOk = true;
      if (currentPitchHz > CONFIG.PITCH_MIN_HZ) {
        const fundamentalBin = Math.round(currentPitchHz / binHz);
        harmonicity = computeHarmonicity(onsetDataArray, fundamentalBin, startBin, endBin);
        const harmMin = practice.enabled
          ? CONFIG.HARMONICITY_MIN_PRACTICE
          : CONFIG.HARMONICITY_MIN;
        harmonicityOk = harmonicity >= harmMin;
      }
      state.debugHarmonicity = harmonicity;

      // Save current spectrum for next frame
      state.prevSpectrum.set(onsetDataArray);

      // Update flux history for adaptive threshold
      const fHist = state.spectralFluxHistory;
      fHist.push(flux);
      if (fHist.length > CONFIG.SPECTRAL_FLUX_HISTORY_SIZE) fHist.shift();

      // Combined onset decision
      let isOnset = false;
      let onsetReason = '';
      if (fHist.length >= 5) {
        let mean = 0;
        for (let i = 0; i < fHist.length; i++) mean += fHist[i];
        mean /= fHist.length;

        let variance = 0;
        for (let i = 0; i < fHist.length; i++) {
          const d = fHist[i] - mean;
          variance += d * d;
        }
        variance /= fHist.length;
        const stddev = Math.sqrt(variance);

        const adaptiveThreshold = mean + CONFIG.SPECTRAL_FLUX_ADAPTIVE_K * stddev;
        const threshold = Math.max(CONFIG.SPECTRAL_FLUX_THRESHOLD, adaptiveThreshold);

        state.debugLastThreshold = threshold;

        const fluxOk = flux > threshold;
        // v10: Bandpass Spread - Reject too low (glitch) AND too high (noise/typing)
        const spreadOk = spread > CONFIG.ONSET_SPREAD_THRESHOLD && spread < CONFIG.ONSET_SPREAD_MAX;

        const flatnessOk = flatness > CONFIG.FLATNESS_PIANO_MIN;
        const crestOk = crest < CONFIG.CREST_VOICE_MAX;

        // v9: 5-condition gate (added harmonicity)
        const allConditionsMet = fluxOk && spreadOk && flatnessOk && crestOk && harmonicityOk;
        // N-frame hysteresis (practice mode): require ONSET_HYSTERESIS_FRAMES consecutive
        // frames of all-conditions-met before firing. Filters one-frame spectral spikes
        // from key clatter, environmental clicks, etc.
        if (allConditionsMet) {
          state.consecutiveOnsetFrames = (state.consecutiveOnsetFrames || 0) + 1;
        } else {
          state.consecutiveOnsetFrames = 0;
        }
        const hysteresisRequirement = practice.enabled ? ONSET_HYSTERESIS_FRAMES : 1;
        if (allConditionsMet && state.consecutiveOnsetFrames >= hysteresisRequirement) {
          if (timeMs - state.lastOnsetTimeMs > CONFIG.ONSET_COOLDOWN_MS) {
            state.lastOnsetTimeMs = timeMs;
            isOnset = true;
            onsetReason = 'PIANO';
            state.consecutiveOnsetFrames = 0;       // reset after firing
            state.agcVoiceRejectCount = 0;
          }
        } else if (fluxOk && spreadOk) {
          // v9: track rejections for AGC voice suppression
          if (state.debugLastRms > CONFIG.AGC_VOICE_RMS_MIN) {
            state.agcVoiceRejectCount++;
            if (state.agcVoiceRejectCount >= CONFIG.AGC_VOICE_REJECT_COUNT) {
              state.agcVoiceSuppressUntilMs = timeMs + CONFIG.AGC_VOICE_SUPPRESS_MS;
            }
          }
          if (!harmonicityOk) onsetReason = 'REJ:harm';
          else if (!flatnessOk) onsetReason = 'REJ:flat';
          else if (!crestOk) onsetReason = 'REJ:crest';
        }
      }

      // Store debug info
      state.debugLastFlux = flux;
      state.debugLastSpread = spread;
      state.debugLastFlatness = flatness;
      state.debugLastCrest = crest;
      state.debugOnsetReason = onsetReason;
      state.debugLastCentroid = centroid;
      state.debugCentroidCV = centroidCV;

      const gateOpen = (timeMs - state.lastOnsetTimeMs) < CONFIG.ONSET_GATE_DURATION_MS;
      state.debugGateOpen = gateOpen;

      return { isOnset, gateOpen };
    }

    // ========================================
    // Session Confidence Layer
    // ========================================
    function updateSessionConfidence(timeMs, isPianoDetected) {
      if (timeMs - state.lastSessionSampleMs < CONFIG.SESSION_SAMPLE_INTERVAL_MS) return;
      state.lastSessionSampleMs = timeMs;

      // Push to ring buffer (reuse pre-allocated slot, zero allocation)
      // When full, the slot at head is the oldest sample and must be removed first.
      const entry = sessionRing[state.sessionRingHead];
      if (state.sessionRingSize === SESSION_RING_CAP && entry.isPiano) {
        state.sessionPianoCount--;
      }
      entry.timeMs = timeMs;
      entry.isPiano = isPianoDetected;
      if (isPianoDetected) state.sessionPianoCount++;
      if (state.sessionRingSize < SESSION_RING_CAP) {
        state.sessionRingSize++;
      } else {
        state.sessionRingTail = (state.sessionRingTail + 1) % SESSION_RING_CAP;
      }
      state.sessionRingHead = (state.sessionRingHead + 1) % SESSION_RING_CAP;

      // Expire samples outside time window (O(1) amortized)
      const windowStart = timeMs - CONFIG.SESSION_WINDOW_MS;
      while (state.sessionRingSize > 0 && sessionRing[state.sessionRingTail].timeMs < windowStart) {
        if (sessionRing[state.sessionRingTail].isPiano) state.sessionPianoCount--;
        state.sessionRingTail = (state.sessionRingTail + 1) % SESSION_RING_CAP;
        state.sessionRingSize--;
      }

      if (state.sessionRingSize < 3) {
        state.sessionConfidence = 0;
        return;
      }

      // O(1) confidence — no iteration needed
      state.sessionConfidence = state.sessionPianoCount / state.sessionRingSize;

      state.debugSessionConf = state.sessionConfidence;

      const prevState = state.sessionState;

      switch (state.sessionState) {
        case 'waiting':
          if (state.sessionConfidence >= CONFIG.SESSION_CONFIRM_THRESHOLD) {
            state.sessionState = 'warmup';
            state.sessionStartMs = timeMs;
          }
          break;

        case 'warmup':
          if (state.sessionConfidence < CONFIG.SESSION_LOSE_THRESHOLD) {
            state.sessionState = 'waiting';
          } else if (timeMs - state.sessionStartMs >= CONFIG.SESSION_WARMUP_MS
            && state.sessionConfidence >= CONFIG.SESSION_CONFIRM_THRESHOLD) {
            state.sessionState = 'performing';
            state.sessionPerformingStartMs = timeMs;
            state.goalWindowStartMs = timeMs;
          }
          break;

        case 'performing':
          if (state.sessionConfidence < CONFIG.SESSION_LOSE_THRESHOLD) {
            state.sessionState = 'warmup';
            state.sessionStartMs = timeMs;
          }
          break;
      }

      if (prevState !== 'performing' && state.sessionState === 'performing') {
        state.goalWindowStartMs = timeMs;
      }

      state.debugSessionState = state.sessionState;

      // Update visual indicator
      if (state.sessionState === 'warmup') {
        const warmupProgress = Math.min(1, (timeMs - state.sessionStartMs) / CONFIG.SESSION_WARMUP_MS);
        const dots = Math.floor(warmupProgress * 3) + 1;
        DOM.sessionStatus.textContent = t('listeningFmt', { p: '\u266B '.repeat(dots) });
        DOM.sessionStatus.classList.add('visible');
      } else if (state.sessionState === 'performing') {
        if (state.goalWindowStartMs <= 0) state.goalWindowStartMs = timeMs;
        const elapsedGoal = timeMs - state.goalWindowStartMs;
        if (elapsedGoal >= CONFIG.MOTIVATION_GOAL_MS) {
          state.goalCompletedCount++;
          state.goalWindowStartMs = timeMs;
          state.goalCelebrateUntilMs = timeMs + 2200;
          triggerEffect('radiance');
        }

        if (timeMs < state.goalCelebrateUntilMs) {
          DOM.sessionStatus.textContent = t('goalCelebrate');
        } else {
          const remainSec = Math.max(0, Math.ceil((CONFIG.MOTIVATION_GOAL_MS - (timeMs - state.goalWindowStartMs)) / 1000));
          DOM.sessionStatus.textContent = t('goalCountdownFmt', { v: remainSec });
        }
        DOM.sessionStatus.classList.add('visible');
      } else {
        DOM.sessionStatus.classList.remove('visible');
      }
    }

    // v10: Magic Quest System \u2014 Phase 0b.3: state machine in @piano/core.
    // _questState owns completedIds + lastCheckMs internally (mirrored back
    // to legacy state.completedQuests / state.lastQuestCheckMs for any
    // outside reader: summary cards, save/load, debug overlay).
    const _questState = PianoCore.initQuestTrackerState();
    // Share the underlying array so state.completedQuests stays in sync
    // automatically (no per-tick copy needed).
    _questState.completedIds = state.completedQuests;
    const _questOpts = { throttleMs: 300, postCompletionDelayMs: 2500 };

    function updateQuestState(timeMs) {
      const result = PianoCore.applyQuestTick(
        _questState,
        state, // observation slice; quest.condition reads state.combo, state.flow, etc.
        timeMs,
        CONFIG.QUESTS,
        _questOpts
      );
      if (!result) return; // throttled

      // A quest just completed \u2014 fire the celebration UI
      if (result.completedThisTick) {
        const quest = CONFIG.QUESTS.find((q) => q.id === result.completedThisTick);
        console.log('Quest Completed: ' + t(quest.nameKey));
        DOM.toastTitle.textContent = '\u2728 ' + t(quest.nameKey) + ' \u2728';
        DOM.toastSub.textContent =
          quest.reward + ' (' + _questState.completedIds.length + '/' + CONFIG.QUESTS.length + ')';
        DOM.questToast.classList.remove('show');
        void DOM.questToast.offsetWidth; // force reflow to restart animation
        DOM.questToast.classList.add('show');
        DOM.questLabel.textContent = t('questClearedFmt', { v: t(quest.nameKey) });
        effectGoldenBurst();
        spawnBurst(W / 2, H / 2, 20, 1.5, '#ffd700');
        state.activeQuestId = null;
        setTimeout(() => DOM.questToast.classList.remove('show'), 2600);
      }

      // Mirror tracker state back to legacy fields for outside readers.
      state.lastQuestCheckMs =
        _questState.lastCheckMs === -Infinity ? 0 : _questState.lastCheckMs;

      // Build dot progress display + active label
      let dotsHtml = '';
      for (let i = 0; i < CONFIG.QUESTS.length; i++) {
        const q = CONFIG.QUESTS[i];
        const done = _questState.completedIds.includes(q.id);
        const cls = done
          ? 'quest-dot done'
          : q.id === result.firstUndone && !result.completedThisTick
          ? 'quest-dot current'
          : 'quest-dot';
        dotsHtml += '<div class="' + cls + '" title="' + t(q.nameKey) + '"></div>';
      }
      DOM.questDots.innerHTML = dotsHtml;
      DOM.questDisplay.classList.add('visible');

      if (result.allDone) {
        DOM.questLabel.textContent = t('questAllClearFmt', { n: CONFIG.QUESTS.length });
        state.activeQuestId = QUEST_ALL_DONE;
        return;
      }
      if (!result.completedThisTick) {
        const firstQ = CONFIG.QUESTS.find((q) => q.id === result.firstUndone);
        if (firstQ) DOM.questLabel.textContent = t('questTargetFmt', { v: t(firstQ.descKey) });
      }
      state.activeQuestId = result.firstUndone;
    }

    // ========================================
    // Quality Scoring — simplified for kids
    // ========================================

    // Quality scoring + coaching — Phase 0b.3: delegated to @piano/core.
    // Adapters bind legacy state.* / CONFIG.* to core's pure scoring API.
    const clamp01 = PianoCore.clamp01;
    const _qualityOpts = () => ({
      ioiIdealCV: CONFIG.IOI_IDEAL_CV,
      ioiMaxCV: CONFIG.IOI_MAX_CV,
      dynamicsIdealCVMin: CONFIG.DYNAMICS_IDEAL_CV_MIN,
      dynamicsIdealCVMax: CONFIG.DYNAMICS_IDEAL_CV_MAX,
      weights: {
        rhythm: CONFIG.SCORE_RHYTHM_WEIGHT,
        dynamics: CONFIG.SCORE_DYNAMICS_WEIGHT,
        stability: CONFIG.SCORE_STABILITY_WEIGHT,
      },
      smoothing: CONFIG.SCORE_SMOOTHING,
      growthWindowMs: CONFIG.GROWTH_WINDOW_MS,
    });
    const computeRhythmScore = () => PianoCore.computeRhythmScore(state.ioiHistory, _qualityOpts());
    const computeDynamicsScore = () =>
      PianoCore.computeDynamicsScore(state.amplitudeHistory, _qualityOpts());
    const computeStabilityScore = () =>
      PianoCore.computeStabilityScore(state.pitchStability, state.sessionConfidence);

    function updateGrowthTrend(timeMs) {
      const result = PianoCore.updateGrowthTrend(
        state.qualityHistory,
        timeMs,
        state.displayedQualityScore,
        _qualityOpts()
      );
      state.qualityHistory = result.history;
      state.growthScore = result.growthScore;
    }

    function buildCoachingFeedback() {
      const fb = PianoCore.buildCoachingFeedback({
        rhythm: state.rhythmScore,
        dynamics: state.dynamicsScore,
        stability: state.stabilityScore,
        growthScore: state.growthScore,
      });
      state.feedbackGood = t('strengthFmt', { v: t(fb.strengthKey) });
      state.feedbackNext = t('nextStepFmt', { v: t(fb.nextKey) });
    }

    function updateQualityScores(timeMs) {
      if (timeMs - state.lastScoreUpdateMs < CONFIG.SCORE_UPDATE_INTERVAL_MS) return;
      state.lastScoreUpdateMs = timeMs;

      state.rhythmScore = computeRhythmScore();
      state.dynamicsScore = computeDynamicsScore();
      state.stabilityScore = computeStabilityScore();

      state.qualityScore =
        state.rhythmScore * CONFIG.SCORE_RHYTHM_WEIGHT +
        state.dynamicsScore * CONFIG.SCORE_DYNAMICS_WEIGHT +
        state.stabilityScore * CONFIG.SCORE_STABILITY_WEIGHT;

      state.displayedQualityScore += (state.qualityScore - state.displayedQualityScore) * CONFIG.SCORE_SMOOTHING;
      updateGrowthTrend(timeMs);
      buildCoachingFeedback();

      if ((state.sessionState === 'performing' || state.sessionState === 'warmup') && state.displayedQualityScore > 0.25) {
        const rhythmPct = Math.round(state.rhythmScore * 100);
        const dynamicsPct = Math.round(state.dynamicsScore * 100);
        const stabilityPct = Math.round(state.stabilityScore * 100);
        const growthPts = Math.round(state.growthScore * 100);
        const growthText = growthPts >= 0 ? '+' + growthPts : '' + growthPts;
        DOM.qualityScore.textContent =
          'Rhythm ' + rhythmPct + '% | Dynamics ' + dynamicsPct + '% | Stability ' + stabilityPct + '%\n' +
          'Last 30s growth: ' + growthText + 'pt\n' +
          state.feedbackGood + ' -> ' + state.feedbackNext;
        DOM.qualityScore.classList.add('visible');
      } else {
        DOM.qualityScore.classList.remove('visible');
      }
    }

    // ========================================
    // Software AGC — with v9 voice suppression
    // ========================================
    function updateAGC(timeMs, postGainRms) {
      if (timeMs - state.agcLastUpdateMs < CONFIG.AGC_UPDATE_INTERVAL_MS) return;
      state.agcLastUpdateMs = timeMs;

      state.agcSmoothedRms += (postGainRms - state.agcSmoothedRms) * 0.15;

      const preGainRms = state.agcSmoothedRms / state.agcGain;
      if (preGainRms < CONFIG.AGC_SILENCE_FLOOR) return;

      // v9: Determine effective max gain — suppress during voice detection
      const effectiveMaxGain = (timeMs < state.agcVoiceSuppressUntilMs)
        ? CONFIG.AGC_VOICE_SUPPRESS_MAX
        : CONFIG.AGC_MAX_GAIN;

      const ratio = CONFIG.AGC_TARGET_RMS / (state.agcSmoothedRms + 1e-10);
      const targetGain = Math.max(CONFIG.AGC_MIN_GAIN, Math.min(effectiveMaxGain, state.agcGain * ratio));

      const alpha = targetGain > state.agcGain ? CONFIG.AGC_ATTACK_COEFF : CONFIG.AGC_RELEASE_COEFF;
      state.agcGain += (targetGain - state.agcGain) * alpha;
      state.agcGain = Math.max(CONFIG.AGC_MIN_GAIN, Math.min(effectiveMaxGain, state.agcGain));

      gainNode.gain.setValueAtTime(state.agcGain, audioCtx.currentTime);
      state.debugAgcGain = state.agcGain;
    }

    // ========================================
    // Game Logic — 4-layer architecture (v9)
    // ========================================
    function updateGameState(timeMs, dt, pitchResult) {
      const { pitch, conf, rms } = pitchResult;

      // Pitch median ring buffer — only collect high-confidence pitches. When mic
      // matching needs a stable pitch (onset moment), we use the median of recent
      // entries instead of the raw single-frame reading. Kills 1-octave YIN errors.
      if (!state.recentPitches) state.recentPitches = [];
      if (pitch > CONFIG.PITCH_MIN_HZ && conf > 0.5) {
        state.recentPitches.push(pitch);
        if (state.recentPitches.length > PITCH_MEDIAN_FRAMES) state.recentPitches.shift();
      }

      // Adaptive RMS floor — exponential moving average of background noise during
      // confirmed quiet (RMS very low AND no recent onset). The "good note" threshold
      // floats above this floor with a hard upper cap so a noisy room can't push the
      // threshold past where real piano notes live.
      if (state.adaptiveSilenceRms == null) state.adaptiveSilenceRms = 0.001;
      const inQuietWindow = rms < 0.01
        && (timeMs - state.lastOnsetTimeMs) > CONFIG.ONSET_GATE_DURATION_MS;
      if (inQuietWindow) {
        state.adaptiveSilenceRms = state.adaptiveSilenceRms * 0.97 + rms * 0.03;
      }
      const adaptiveGoodNoteRms = Math.max(
        CONFIG.GOOD_NOTE_RMS,
        Math.min(0.020, state.adaptiveSilenceRms * 2.0)
      );

      const onsetState = updateMultiFeatureOnset(timeMs, pitch);

      const pitchMinHz = practice.enabled
        ? CONFIG.PITCH_MIN_HZ_PRACTICE
        : CONFIG.PITCH_MIN_HZ;
      const pitchOk = pitch > pitchMinHz && pitch < CONFIG.PITCH_MAX_HZ
        && conf > CONFIG.CONFIDENCE_THRESHOLD && rms > adaptiveGoodNoteRms;
      const isOnsetNote = pitchOk && onsetState.isOnset;
      const isActivePlay = pitchOk && onsetState.gateOpen;

      state.debugLastRms = rms;
      state.debugLastConf = conf;
      state.debugLastPitch = pitch;
      state.debugIsGoodNote = isOnsetNote;
      state.debugIsActivePlay = isActivePlay;

      updateSessionConfidence(timeMs, isActivePlay);

      // v13: When MIDI is the active source, MIDI events drive the quality histories
      // (rhythm/dynamics/stability) so the radar reflects what was actually played
      // rather than what the mic happened to pick up. Skip the mic push to avoid
      // double-counting and to keep silent (headphone) practice fully evaluable.
      const midiDrivingHistories = midiInput.enabled
        && (timeMs - (midiInput.lastEventTime || 0)) < 2000;

      if (isOnsetNote && !midiDrivingHistories) {
        const lastOnset = state.noteOnsetTimes.length > 0
          ? state.noteOnsetTimes[state.noteOnsetTimes.length - 1] : 0;
        if (timeMs - lastOnset > 80) {
          state.noteOnsetTimes.push(timeMs);
          if (state.noteOnsetTimes.length > CONFIG.IOI_HISTORY_SIZE + 1) {
            state.noteOnsetTimes.shift();
          }
          if (state.noteOnsetTimes.length >= 2) {
            const ioi = timeMs - state.noteOnsetTimes[state.noteOnsetTimes.length - 2];
            if (ioi > 100 && ioi < 5000) {
              state.ioiHistory.push(ioi);
              if (state.ioiHistory.length > CONFIG.IOI_HISTORY_SIZE) {
                state.ioiHistory.shift();
              }
            }
          }
        }

        state.amplitudeHistory.push(rms);
        if (state.amplitudeHistory.length > CONFIG.AMPLITUDE_HISTORY_SIZE) {
          state.amplitudeHistory.shift();
        }
      }

      updateQualityScores(timeMs);

      const dtSec = dt / 1000;
      const isPerforming = state.sessionState === 'performing';
      const isWarmup = state.sessionState === 'warmup';

      if (isOnsetNote && !midiDrivingHistories) {
        if (state.lastPitch > 0) {
          const semitones = Math.abs(12 * Math.log2(pitch / state.lastPitch));
          if (semitones < CONFIG.STABILITY_SEMITONE_THRESHOLD) {
            state.pitchStability = Math.min(1, state.pitchStability + CONFIG.STABILITY_GROWTH);
          } else {
            state.pitchStability *= CONFIG.STABILITY_DECAY_GOOD;
          }
        }
        state.lastPitch = pitch;
        state.lastSilenceStartMs = -1;

        if (isPerforming || isWarmup) {
          if (state.lastGoodNoteTimeMs > 0 && (timeMs - state.lastGoodNoteTimeMs) < CONFIG.COMBO_WINDOW_MS) {
            state.combo++;
            if (state.combo > state.bestCombo) {
              state.bestCombo = state.combo;
            }
          } else {
            state.combo = Math.max(1, Math.floor(state.combo * 0.6));
          }
        }
        state.lastGoodNoteTimeMs = timeMs;
      } else if (isActivePlay) {
        state.lastSilenceStartMs = -1;
        state.pitchStability = Math.max(0, Math.min(1, state.pitchStability * 0.995 + 0.001));
      } else {
        // v10: Time-based decay for consistency
        // Was: state.pitchStability *= CONFIG.STABILITY_DECAY_IDLE;
        // Now: decay based on dtSec
        // Formula: New = Old * (Base ^ dt)
        // If Base is 0.5 per 5 seconds -> (0.5)^(1/5) ~= 0.87 per sec
        const decayFactor = Math.pow(0.5, dtSec / 5.0); // ~50% per 5 seconds
        state.pitchStability = Math.max(0, state.pitchStability * decayFactor);

        if (state.lastSilenceStartMs < 0) {
          state.lastSilenceStartMs = timeMs;
        }
        const silenceDuration = timeMs - state.lastSilenceStartMs;

        if (silenceDuration > CONFIG.SILENCE_DECAY_START_MS) {
          // Slow decay start
          state.flow = Math.max(0, state.flow - CONFIG.FLOW_DECAY_SOFT * dtSec);
          if (silenceDuration > CONFIG.SILENCE_HARD_DECAY_MS) {
            // Hard decay later. Combo is integer, so accumulate fractional
            // decay across frames — otherwise Math.ceil rounds up every
            // frame and combo drops at framerate (144/sec on 144Hz vs
            // 60/sec on 60Hz). The accumulator keeps drops/sec constant.
            state.flow = Math.max(0, state.flow - CONFIG.FLOW_DECAY_HARD * dtSec);
            state.comboDecayAccum = (state.comboDecayAccum || 0) + CONFIG.COMBO_DECAY_RATE * 60 * dtSec;
            if (state.comboDecayAccum >= 1) {
              const drops = Math.floor(state.comboDecayAccum);
              state.combo = Math.max(0, state.combo - drops);
              state.comboDecayAccum -= drops;
            }
          }
        }

        if (rms > CONFIG.NOISE_RMS_THRESHOLD && !isActivePlay) {
          if (timeMs - state.lastNoisePenaltyMs > CONFIG.NOISE_PENALTY_COOLDOWN_MS) {
            state.flow = Math.max(0, state.flow - CONFIG.FLOW_NOISE_PENALTY * dtSec);
            state.combo = Math.max(0, state.combo - CONFIG.COMBO_NOISE_PENALTY);
            state.lastNoisePenaltyMs = timeMs;
          }
        }
      }

      if (isActivePlay) {
        // v10: Instant Gratification — Gain flow even in 'waiting' state
        // v10: Always allow flow gain regardless of session state
        {
          const comboFactor = Math.min(state.combo / 50, 1);
          const qualityFactor = state.qualityScore;
          let flowGain = (CONFIG.FLOW_GAIN_BASE
            + comboFactor * CONFIG.FLOW_GAIN_COMBO_MAX
            + state.pitchStability * CONFIG.FLOW_GAIN_STABILITY_MAX
            + qualityFactor * CONFIG.FLOW_GAIN_QUALITY_MAX) * dtSec;

          // Boost gain in warmup/waiting to get started faster
          if (state.sessionState !== 'performing') flowGain *= 1.5;

          state.flow = Math.min(100, state.flow + flowGain);
          if (state.flow > state.peakFlow) state.peakFlow = state.flow;
        }
      }



      // Stage transitions — Phase 0b.3: delegated to @piano/core.
      const prevStage = state.currentStage;
      const newStage = PianoCore.stageForFlow(state.flow, CONFIG.STAGES);
      if (newStage !== prevStage) {
        state.currentStage = newStage;
        DOM.stageLabel.textContent = stageLabel(CONFIG.STAGES[newStage]);
        DOM.stageLabel.classList.toggle('visible', newStage > 0);
        if (PianoCore.classifyStageTransition(prevStage, newStage) === 'up' && newStage > 0) {
          for (let i = 0; i < 40; i++) {
            spawnBurst(Math.random() * W, Math.random() * H, 3, 0.9);
          }
          effectStarShower(6);
        }
      }

      // Periodic per-frame stats — only collected/forwarded when remote logging
      // is on. Skipping the min/max scans entirely on prod hot path.
      if (REMOTE_LOG_ENABLED) {
        if (rms > state.debugMaxRms) state.debugMaxRms = rms;
        if (conf > state.debugMaxConf) state.debugMaxConf = conf;
        if (state.debugHarmonicity > state.debugMaxHarm) state.debugMaxHarm = state.debugHarmonicity;
        if (isOnsetNote) state.debugOnsetCount++;
        if (timeMs - state.lastDebugLogMs > 2000) {
          state.lastDebugLogMs = timeMs;
          remoteLog(`[Stats] Flow=${state.flow.toFixed(1)} | MaxRMS=${state.debugMaxRms.toFixed(4)}`
            + ` | MaxConf=${state.debugMaxConf.toFixed(2)} | MaxHarm=${state.debugMaxHarm.toFixed(2)}`
            + ` | onsets=${state.debugOnsetCount} | reason=${state.debugOnsetReason || '-'}`
            + ` | Stab=${state.pitchStability.toFixed(2)} | Combo=${state.combo} | Stg=${state.currentStage}`);
          state.debugMaxRms = 0; state.debugMaxConf = 0; state.debugMaxHarm = 0;
          state.debugOnsetCount = 0;
        }
      }

      updateHUD(timeMs);
      return isOnsetNote;
    }

    // ========================================
    // v9: updateHUD — encouragement instead of numbers
    // ========================================
    function updateHUD(timeMs) {
      // v9: Check encouragement tiers (find highest matching tier)
      // Tier-change check (climb fires show, drop silently lowers currentTier)
      const _comboOut = PianoCore.applyEncouragementEvent(
        _encState,
        { type: 'comboChanged', combo: state.combo, timeMs },
        _encOpts
      );
      _showEncouragementUI(_comboOut);
      // Hide-tick: fires once when display window elapses
      const _hideOut = PianoCore.applyEncouragementEvent(_encState, { type: 'hideTick', timeMs }, _encOpts);
      if (_hideOut.kind === 'hide') DOM.encouragement.classList.remove('visible');
      _mirrorEncStateToLegacy();

      // Flow gauge — quantize style writes to whole-percent buckets so the
      // browser doesn't reparse a fresh gradient string 60×/sec on iPad.
      const flowPct = Math.round(state.flow);
      if (flowPct !== _lastFlowPctWritten) {
        _lastFlowPctWritten = flowPct;
        DOM.flowFill.style.height = flowPct + '%';
        const hue = flowPct * 1.2 + 200;
        DOM.flowFill.style.background = 'linear-gradient(to top,hsl(' + hue + ',70%,40%),hsl(' + (hue + 40) + ',80%,60%))';
        DOM.flowFill.style.boxShadow = '0 0 ' + (flowPct * 0.3) + 'px hsl(' + hue + ',70%,60%)';
        // Mirror the visual fill into the wrapper's aria-valuenow so screen
        // readers report the meter's actual value (was stuck at 0/100).
        const gauge = DOM.flowFill.parentElement;
        if (gauge) gauge.setAttribute('aria-valuenow', String(flowPct));
      }
    }
    let _lastFlowPctWritten = -1;

    // ========================================
    // Debug overlay (v9)
    // ========================================
    function updateDebugOverlay() {
      if (!state.debugMode) return;
      const gateMs = Math.max(0, CONFIG.ONSET_GATE_DURATION_MS - (performance.now() - state.lastOnsetTimeMs));
      const voiceSupp = state.agcVoiceSuppressUntilMs > performance.now() ? 'SUPP' : 'ok';
      DOM.debugOverlay.textContent =
        'v9 YIN+Harm+SoftAGC | FLUX: ' + state.debugLastFlux.toFixed(1) +
        '  THR: ' + state.debugLastThreshold.toFixed(1) +
        '  SPR: ' + (state.debugLastSpread * 100).toFixed(0) + '%' +
        '\nFLAT: ' + state.debugLastFlatness.toFixed(3) +
        '  CREST: ' + state.debugLastCrest.toFixed(1) +
        '  HARM: ' + state.debugHarmonicity.toFixed(3) +
        '  ' + state.debugOnsetReason +
        '\nGATE: ' + (state.debugGateOpen ? 'OPEN ' + (gateMs / 1000).toFixed(1) + 's' : 'CLOSED') +
        '  RMS: ' + state.debugLastRms.toFixed(4) +
        '  AGC: x' + state.debugAgcGain.toFixed(1) + ' ' + voiceSupp +
        '\nPITCH: ' + (state.debugLastPitch > 0 ? state.debugLastPitch.toFixed(1) + 'Hz' : '---') +
        '  CONF: ' + state.debugLastConf.toFixed(2) +
        '  NOTE: ' + (state.debugIsGoodNote ? 'YES' : 'no') +
        '  PLAY: ' + (state.debugIsActivePlay ? 'ON' : 'off') +
        '\nSESSION: ' + state.debugSessionState.toUpperCase() +
        '  S.CONF: ' + (state.debugSessionConf * 100).toFixed(0) + '%' +
        '\nQUALITY: ' + (state.qualityScore * 100).toFixed(0) + '%' +
        '  R:' + (state.rhythmScore * 100).toFixed(0) +
        ' D:' + (state.dynamicsScore * 100).toFixed(0) +
        ' S:' + (state.stabilityScore * 100).toFixed(0) +
        '\nFLOW: ' + state.flow.toFixed(1) +
        '  COMBO: ' + state.combo +
        '  STAGE: ' + state.currentStage;
    }

    // ========================================
    // Energy calculation
    // ========================================
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

    // ========================================
    // Main Loop
    // ========================================
    function loop(timeMs) {
      if (!state.running) return;
      requestAnimationFrame(loop);

      const dt = state.lastFrameTimeMs > 0 ? Math.min(timeMs - state.lastFrameTimeMs, 50) : 16;
      state.lastFrameTimeMs = timeMs;

      const theme = CONFIG.THEMES[state.currentTheme];
      const energy = getEnergy();
      state.smoothEnergy += (energy - state.smoothEnergy) * 0.15;

      const [br, bg2, bb] = theme.bg;
      const fadeRate = 0.08 + 0.06 * (1 - state.flow / 100);
      ctx.fillStyle = 'rgba(' + br + ',' + bg2 + ',' + bb + ',' + fadeRate + ')';
      ctx.fillRect(0, 0, W, H);

      drawBgStars(timeMs);
      drawAurora(timeMs);
      drawGroundFlowers(timeMs);

      // v10: "Wake Up" Flash rendering
      if (state.inputFlash > 0.01) {
        ctx.fillStyle = `rgba(255, 255, 255, ${state.inputFlash})`;
        ctx.fillRect(0, 0, W, H);
        state.inputFlash *= 0.85; // Fast decay
      }

      // v9: Glow pulse effect (from encouragement)
      const glowExtra = state.glowPulseIntensity;
      if (glowExtra > 0.01) {
        state.glowPulseIntensity *= 0.96; // decay
      }

      // Center radial halo — Phase 0b.3: delegated to @piano/core.
      PianoCore.drawCenterGlow(ctx, {
        screenW: W,
        screenH: H,
        smoothEnergy: state.smoothEnergy,
        flow: state.flow,
        glowExtra,
        glowPrefix: theme.glow,
      });

      // v9: Shimmer effect
      if (state.shimmerPhase >= 0) {
        const shimmerAge = timeMs - state.shimmerStartMs;
        if (shimmerAge < 1500) {
          const shimmerAlpha = 0.08 * Math.sin(shimmerAge * 0.02) * (1 - shimmerAge / 1500);
          if (shimmerAlpha > 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + shimmerAlpha + ')';
            ctx.fillRect(0, 0, W, H);
          }
        } else {
          state.shimmerPhase = -1;
        }
      }

      let isGoodNote = false;
      // v13: Skip the entire mic processing pipeline when the mic is suspended
      // (MIDI is the active input). YIN, FFT consumption, AGC, onset detection
      // and game-state updates are all mic-derived; running them on a torn-down
      // stream wastes CPU and would also fight the MIDI-driven state.
      if (analyser && !state.micSuspended) {
        analyser.getFloatTimeDomainData(freqArray);

        // YIN throttle: full autocorrelation every 3rd frame, RMS-only on others
        let pitchResult;
        if (++state.yinSkipCounter % 3 === 0) {
          pitchResult = detectPitchYIN(freqArray, audioCtx.sampleRate);
          state.cachedPitchResult = pitchResult;
        } else {
          let rms = 0;
          const len = freqArray.length;
          for (let i = 0; i < len; i++) rms += freqArray[i] * freqArray[i];
          rms = Math.sqrt(rms / len);
          pitchResult = { pitch: state.cachedPitchResult.pitch, conf: state.cachedPitchResult.conf, rms };
        }

        updateAGC(timeMs, pitchResult.rms);

        // mic level meter (visible feedback that audio is being captured)
        if (DOM.micMeter && DOM.micMeter.classList.contains('visible')) {
          const lvl = Math.min(1, pitchResult.rms * 25);
          DOM.micMeterFill.style.width = (lvl * 100).toFixed(1) + '%';
        }

        isGoodNote = updateGameState(timeMs, dt, pitchResult);
        if (isGoodNote && DOM.introHint.classList.contains('visible')) {
          hideIntroHint();
        }

        // v12: Practice mode tick (must run before particle work so flow boost applies)
        if (practice.enabled) {
          updatePractice(timeMs, isGoodNote, pitchResult.pitch);
        }

        // v13: When a MIDI keyboard is actively playing, MIDI events drive visuals
        // (polyphonic, velocity-aware). Skip the mic-derived single-pitch path so we
        // don't double-spawn or fight YIN's octave guesses.
        const midiActiveRecently = midiInput.enabled
          && (performance.now() - (midiInput.lastEventTime || 0)) < 2000;

        if (!midiActiveRecently && isGoodNote && pitchResult.pitch > CONFIG.PITCH_MIN_HZ) {
          const note = freqToNote(pitchResult.pitch);
          if (note) {
            // v10: Synesthesia Mode Color
            let noteColor = null;
            if (state.useSynesthesiaMode) {
              noteColor = getNoteColor(note.name);
            }

            const noteX = ((note.noteNum - CONFIG.PIANO_KEY_MIN) / CONFIG.PIANO_KEY_COUNT) * W;
            const noteY = H * 0.45 + (Math.random() - 0.5) * H * 0.25;

            if (timeMs - state.lastNoteTimeMs > CONFIG.MIN_NOTE_INTERVAL_MS) {
              // v10: Bass notes (< 100Hz) get extra burst weight
              const isBass = note.freq < 100;
              const bassBoost = isBass ? 1.5 : 1.0;

              let burstSize = Math.floor((10 + state.smoothEnergy * 25 + state.flow * 0.2) * bassBoost);

              // Pass noteColor to spawnBurst
              spawnBurst(noteX, noteY, burstSize, state.smoothEnergy * (1 + state.flow * 0.02), noteColor);

              // v10: Ensure minimum ripple size + Bass Boost
              const rippleSize = Math.max(200, 150 + state.flow * 3 + state.combo * 0.5) * bassBoost;

              // Use noteColor if active, else theme color
              const rippleColor = noteColor || theme.colors[note.noteNum % theme.colors.length];
              ripples.push(new Ripple(noteX, noteY, rippleColor, rippleSize));

              state.lastNoteTimeMs = timeMs;

              // v10: "Wake Up" Flash — clear confirmation at low flow
              if (state.flow < 10) {
                if (!state.inputFlash) state.inputFlash = 0;
                state.inputFlash = 0.2; // 20% white flash
              }
            }
            // Pass noteColor to spawnStream
            spawnStream(noteX, H * 0.65, state.smoothEnergy, noteColor);

            showNoteDisplay(note.name, note.name + note.octave, noteColor, timeMs);
          }
        }
      } else if (practice.enabled) {
        // v13: MIDI-only practice — the mic isn't running, but the falling-notes
        // timeline (miss detection, section completion) must still tick. Pass
        // zero-valued mic inputs; MIDI matches happen out-of-band in onMidiNoteOn.
        updatePractice(timeMs, false, 0);
      }

      if (timeMs - state.noteShowTimeMs > CONFIG.NOTE_DISPLAY_DURATION_MS) {
        DOM.noteDisplay.classList.remove('visible');
      }

      if (state.smoothEnergy < 0.04 && Math.random() > (1 - CONFIG.AMBIENT_PARTICLE_CHANCE - state.flow * 0.003)) {
        const cols = theme.colors;
        if (particles.length < CONFIG.MAX_PARTICLES) {
          // 3D environment particles
          // Random X (-W..2W), Random Y (below screen?), Random Z (deep)
          const px = (Math.random() - 0.2) * W * 1.4 - (W * 0.2);
          const py = H + 20;
          const pz = (Math.random() - 0.5) * 600; // deep field

          particles.push(new Particle(
            px, py, pz,
            cols[Math.floor(Math.random() * cols.length)],
            1 + Math.random() * (1 + state.flow * 0.03),
            (Math.random() - 0.5) * 0.3, -0.3 - Math.random() * 0.5 - state.flow * 0.005, (Math.random() - 0.5) * 0.5,
            200 + Math.random() * 100, 'circle'
          ));
        }
      }

      // Frequency spectrum bars — Phase 0b.3: delegated to @piano/core.
      // Caller still owns the analyser + the silence gate (smoothEnergy > 0.03)
      // so silent frames skip the work entirely.
      if (analyser && state.smoothEnergy > 0.03) {
        const binHz = audioCtx.sampleRate / analyser.fftSize;
        PianoCore.drawSpectrumBars(ctx, dataArray, {
          screenW: W,
          screenH: H,
          startBin: Math.floor(CONFIG.PIANO_FREQ_MIN / binHz),
          endBin: Math.floor(CONFIG.PIANO_FREQ_MAX / binHz),
          barCount: CONFIG.BAR_COUNT,
          themeColors: theme.colors,
          flow: state.flow,
        });
      }

      // v13: MIDI sustained beams sit between background and particles.
      if (midiInput.enabled && !practice.enabled) {
        drawMidiBeams(timeMs);
      }

      let alive = 0;
      for (let i = 0; i < ripples.length; i++) {
        ripples[i].update(); ripples[i].draw(ctx);
        if (ripples[i].life > 0) ripples[alive++] = ripples[i];
      }
      ripples.length = alive;

      alive = 0;
      for (let i = 0; i < particles.length; i++) {
        particles[i].update(); particles[i].draw(ctx);
        if (particles[i].life > 0 && alive < CONFIG.MAX_PARTICLES) particles[alive++] = particles[i];
      }
      particles.length = alive;

      // Chord-name display — the function picks a layout per mode (big-centered for free play, small-above-keyboard for practice).
      if (midiInput.enabled) {
        drawMidiChordDisplay(timeMs);
      }

      // Virtual keyboard at the bottom — visible whenever MIDI is in use.
      // In practice mode it provides a key-finding reference for kids; the lane
      // sizing reserves the bottom strip for it.
      if (midiInput.enabled) {
        drawMidiKeyboard();
      }

      // v12: Practice mode lane (drawn on top of background, under HUD)
      if (practice.enabled) {
        drawPracticeLane(timeMs);
      }

      // Quests only tick during ACTIVE free-play. Without this gate the
      // tracker would keep evaluating predicates while the user browses
      // menus (start screen, song panel, session summary) — making
      // questDisplay flicker on top of the wrong screen and progress
      // accumulating in the background.
      if (isFreeplayActive()) updateQuestState(timeMs);
      updatePlayTime(timeMs);
      updateDebugOverlay();
    }

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
    // v11: localStorage Best Scores
    // ========================================
    const BEST_DEFAULT = { bestCombo: 0, peakFlow: 0, totalSessions: 0 };
    function loadBestScores() { return loadJSON('pianoViz_best', { ...BEST_DEFAULT }); }
    function saveBestScores(combo, flow) {
      const best = loadBestScores();
      best.bestCombo = Math.max(best.bestCombo, combo);
      best.peakFlow = Math.max(best.peakFlow, Math.round(flow));
      best.totalSessions++;
      saveJSON('pianoViz_best', best);
      return best;
    }

    // ========================================
    // v11: Format Time (mm:ss)
    // ========================================
    // formatTime — Phase 0b: delegated to @piano/core/util/format.
    const formatTime = PianoCore.formatTime;

    // ========================================
    // v11: Update Play Time Display
    // ========================================
    function updatePlayTime(timeMs) {
      if (state.sessionStartTimeMs > 0) {
        DOM.playTime.textContent = formatTime(timeMs - state.sessionStartTimeMs);
      }
    }

    // ========================================
    // v11: Session Reset
    // ========================================
    // Re-render only the localized parts of the session summary. Pure: reads
    // from `state._lastSummary` cache + current i18n. Used by both the initial
    // show (with animation) and language toggle (without \u2014 we don't want a
    // stagger replay).
    function renderSessionSummaryText(animate) {
      const s = state._lastSummary;
      if (!s) return;
      DOM.sumCombo.textContent = s.bestCombo;
      DOM.sumStage.textContent = stageLabel(CONFIG.STAGES[s.stageIdx]) || '-';
      DOM.sumTime.textContent = formatTime(s.elapsed);

      const total = CONFIG.QUESTS.length;
      const sortedQuests = CONFIG.QUESTS.slice().sort((a, b) => {
        const aDone = s.completedQuests.includes(a.id) ? 0 : 1;
        const bDone = s.completedQuests.includes(b.id) ? 0 : 1;
        return aDone - bDone;
      });
      let badgeHtml = '';
      for (let i = 0; i < sortedQuests.length; i++) {
        const q = sortedQuests[i];
        const done = s.completedQuests.includes(q.id);
        const cls = done ? 'sq-badge done' : 'sq-badge undone';
        const icon = done ? '\u2B50' : '\u2B1C';
        badgeHtml += '<div class="' + cls + '" style="animation-delay:' + (i * 0.25) + 's">' +
          '<span class="badge-icon">' + icon + '</span>' +
          '<span>' + t(q.nameKey) + '</span></div>';
      }
      if (s.completedQuests.length === total) {
        badgeHtml += '<div class="sq-all-clear" style="animation-delay:' + (total * 0.25) + 's">' +
          t('sumAllClear') + '</div>';
      } else {
        badgeHtml += '<div style="margin-top:6px;font-size:.75rem;color:rgba(255,255,255,.4);animation-delay:' +
          (total * 0.25) + 's">' + t('sumQuestProgressFmt', { n: s.completedQuests.length, total }) + '</div>';
      }
      DOM.sumQuestList.innerHTML = badgeHtml;

      if (animate) {
        requestAnimationFrame(() => {
          const badges = DOM.sumQuestList.querySelectorAll('.sq-badge, .sq-all-clear');
          badges.forEach((b, i) => setTimeout(() => b.classList.add('animate-in'), i * 250));
        });
      } else {
        // On lang re-render, surface badges immediately without re-staggering.
        DOM.sumQuestList.querySelectorAll('.sq-badge, .sq-all-clear').forEach(b => b.classList.add('animate-in'));
      }

      DOM.sumBest.textContent = t('sumBestFmt', {
        combo: s.bestStat.bestCombo,
        flow: s.bestStat.peakFlow,
        n: s.bestStat.totalSessions
      });
    }

    function showSessionSummary() {
      const elapsed = performance.now() - state.sessionStartTimeMs;
      const best = saveBestScores(state.bestCombo, state.peakFlow);
      state._lastSummary = {
        bestCombo: state.bestCombo,
        stageIdx: state.currentStage,
        elapsed,
        completedQuests: state.completedQuests.slice(),
        bestStat: best
      };
      renderSessionSummaryText(true);

      DOM.sessionSummary.classList.add('visible');

      // Draw radar chart with animated grow-in
      drawRadarChart(
        DOM.radarChart,
        ['Stability', 'Rhythm', 'Dynamics'],
        [state.stabilityScore, state.rhythmScore, state.dynamicsScore]
      );
    }

    // Sizes a canvas to the given CSS pixels with backing store scaled by devicePixelRatio,
    // then returns the 2D context with the DPR transform pre-applied.
    function setupHiDPICanvas(canvas, w, h) {
      const c = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return c;
    }

    function drawRadarChart(canvas, labels, values) {
      const size = 200;
      const c = setupHiDPICanvas(canvas, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const R = 70;   // max radius
      const axes = labels.length;
      const angleStep = (Math.PI * 2) / axes;
      const startAngle = -Math.PI / 2; // top

      function getPoint(axisIndex, value) {
        const angle = startAngle + axisIndex * angleStep;
        return {
          x: cx + Math.cos(angle) * R * value,
          y: cy + Math.sin(angle) * R * value
        };
      }

      let progress = 0;
      const duration = 800; // ms
      const startTime = performance.now();

      function frame(now) {
        progress = Math.min(1, (now - startTime) / duration);
        const ease = 1 - Math.pow(1 - progress, 3); // ease out cubic
        c.clearRect(0, 0, size, size);

        // Draw grid rings (3 levels: 33%, 66%, 100%)
        c.strokeStyle = 'rgba(255,255,255,0.08)';
        c.lineWidth = 1;
        for (let level = 1; level <= 3; level++) {
          const r = R * (level / 3);
          c.beginPath();
          for (let i = 0; i <= axes; i++) {
            const p = getPoint(i % axes, level / 3);
            if (i === 0) c.moveTo(p.x, p.y);
            else c.lineTo(p.x, p.y);
          }
          c.closePath();
          c.stroke();
        }

        // Draw axis lines
        c.strokeStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < axes; i++) {
          const p = getPoint(i, 1);
          c.beginPath();
          c.moveTo(cx, cy);
          c.lineTo(p.x, p.y);
          c.stroke();
        }

        // Draw data polygon (animated)
        c.beginPath();
        for (let i = 0; i <= axes; i++) {
          const v = values[i % axes] * ease;
          const p = getPoint(i % axes, v);
          if (i === 0) c.moveTo(p.x, p.y);
          else c.lineTo(p.x, p.y);
        }
        c.closePath();
        c.fillStyle = 'rgba(255, 215, 0, 0.15)';
        c.fill();
        c.strokeStyle = 'rgba(255, 215, 0, 0.7)';
        c.lineWidth = 2;
        c.stroke();

        // Draw data points
        for (let i = 0; i < axes; i++) {
          const v = values[i] * ease;
          const p = getPoint(i, v);
          c.beginPath();
          c.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
          c.fillStyle = '#ffd700';
          c.fill();
        }

        // Draw labels with percentage
        c.font = '11px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (let i = 0; i < axes; i++) {
          const angle = startAngle + i * angleStep;
          const labelR = R + 22;
          const lx = cx + Math.cos(angle) * labelR;
          const ly = cy + Math.sin(angle) * labelR;
          const pct = Math.round(values[i] * 100 * ease);
          c.fillStyle = 'rgba(255,255,255,0.7)';
          c.fillText(labels[i], lx, ly - 7);
          c.fillStyle = '#ffd700';
          c.font = 'bold 12px sans-serif';
          c.fillText(pct + '%', lx, ly + 7);
          c.font = '11px sans-serif';
        }

        if (progress < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function resetSession() {
      state.flow = 0;
      state.combo = 0;
      state.bestCombo = 0;
      state.currentStage = 0;
      state.pitchStability = 0;
      state.noteOnsetTimes = [];
      state.ioiHistory = [];
      state.amplitudeHistory = [];
      state.centroidHistory = [];
      state.rhythmScore = 0;
      state.dynamicsScore = 0;
      state.stabilityScore = 0;
      state.qualityScore = 0;
      state.displayedQualityScore = 0;
      state.growthScore = 0;
      state.qualityHistory = [];
      // Reset quest tracker — keep the SAME completedQuests array reference
      // (since _questState.completedIds shares it) by clearing in-place.
      state.completedQuests.length = 0;
      PianoCore.resetQuestTrackerState(_questState);
      _questState.completedIds = state.completedQuests; // re-share after reset
      state.activeQuestId = null;
      state.lastQuestCheckMs = 0;
      PianoCore.resetEncouragementState(_encState);
      _mirrorEncStateToLegacy();
      state.lastGoodNoteTimeMs = 0;
      state.lastSilenceStartMs = -1;
      state.lastPitch = -1;
      state.peakFlow = 0;
      state.sessionStartTimeMs = performance.now();
      state.lastNoteTimeMs = 0;
      state.lastDetectedNote = '';
      state.sessionState = 'waiting';
      state.sessionConfidence = 0;
      state.sessionPianoCount = 0;
      state.sessionRingHead = 0;
      state.sessionRingTail = 0;
      state.sessionRingSize = 0;
      for (let i = 0; i < SESSION_RING_CAP; i++) sessionRing[i].isPiano = false;
      state.feedbackGood = '';
      state.feedbackNext = '';
      state.goalWindowStartMs = 0;
      state.goalCelebrateUntilMs = 0;
      state.goalCompletedCount = 0;
      state.spectralFluxHistory = [];
      state.prevSpectrum = null;
      state.lastOnsetTimeMs = -9999;
      state.smoothEnergy = 0;
      state.inputFlash = 0;
      state.glowPulseIntensity = 0;
      state.shimmerPhase = -1;
      ripples.length = 0;
      particles.length = 0;
      DOM.stageLabel.textContent = '';
      DOM.stageLabel.classList.remove('visible');
      DOM.encouragement.classList.remove('visible');
      DOM.qualityScore.classList.remove('visible');
      DOM.noteDisplay.classList.remove('visible');
      DOM.questDisplay.classList.remove('visible');
      DOM.questDots.innerHTML = '';
      DOM.questLabel.textContent = '';
      DOM.questToast.classList.remove('show');
      DOM.flowFill.style.height = '0%';
      _lastFlowPctWritten = -1;   // invalidate updateHUD cache so next tick re-paints
      DOM.sessionStatus.classList.remove('visible');
      DOM.sessionStatus.textContent = '';
      DOM.playTime.textContent = '0:00';
      // Drop any held MIDI keys / sustain so the next session starts clean.
      midiState.activeNotes.clear();
      midiState.sustainedNotes.clear();
      midiState.recentOnsets.length = 0;
      midiState.sustainOn = false;
      midiState.lastChordName = '';
      midiState.lastChordTimeMs = 0;
      state.lastMidiNoteForStability = null;
      // Drop the BLE-redelivery dedupe cache too; otherwise a long mic-only
      // session that included a stray MIDI note can theoretically swallow
      // the first MIDI note after a reconnect (same `(midi<<8)|velocity`
      // happening to fall inside the 30 ms window).
      _lastMidiNoteOnKey = -1;
      _lastMidiNoteOnTime = 0;
      remoteLog('[RESET] Session reset by user');
    }

    // ========================================
    // v12: Practice Mode — Für Elise
    // ========================================

    // Note encoding: [startBeat16th, midi, dur16ths]
    // 3/8 time, 6 sixteenths per measure. Right-hand melody only (kid-friendly).
    // Coverage: opening A theme + B section + return.
    // Songs are loaded lazily from public-domain MusicXML. Each song carries its own
    // OSMD-extracted notes / sections / cursor map. currentSong points at the song
    // the kid picked from the start screen. selectSong(id) switches and resets OSMD.
    //
    // sectionDefs: per-song quest layout. Each def starts at startMeasure (0-indexed
    // source-score measure number); the section runs until the next def's
    // startMeasure (or end-of-song). Boundaries are chosen at musical landmarks
    // (theme returns, key changes, climaxes) so a kid never gets cut off mid-phrase.
    function makeSong(id, titleKey, composerKey, icon, sectionDefs) {
      return {
        id,
        titleKey,
        composerKey,
        icon,
        mxlUrl: 'assets/' + id + '.mxl',
        xmlUrl: 'assets/' + id + '.xml',
        sectionDefs: sectionDefs,
        // Populated on first load:
        notes: null,
        totalSec: 0,
        sections: [],
        playbackOrder: [],
        _loaded: false,
        _loadingPromise: null
      };
    }
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

    // ========================================
    // User-added songs — IndexedDB persistence
    //   Schema: db `pianoViz_v1`, store `userSongs` keyed by id.
    //   Record: { id, title, composer, mxlBlob, sectionDefs, addedAt, source }
    //
    //   Songs added by the user (drop a file, paste a jsDelivr URL, or pick from
    //   the curated library) are persisted as Blobs in IndexedDB. On load they're
    //   merged into SONGS, get a synthetic mxlUrl via URL.createObjectURL so the
    //   existing OSMD load path doesn't need to know they came from local cache,
    //   and surface alongside the hardcoded songs in the picker.
    // ========================================
    // Library — Phase 0b.3: delegated to @piano/core.
    // - User song IndexedDB ops (open / all / put / delete) wired through
    //   PianoCore's stateless versions but with the legacy connection-cache
    //   pattern preserved (call sites pass no db arg).
    // - parseMusicXmlMetadata + auto-section heuristic — pure DOM-only,
    //   drop-in. Core uses globalThis.DOMParser so the browser path is
    //   identical to the deleted legacy implementation.
    const USER_DB_NAME = PianoCore.USER_DB_NAME;
    const USER_DB_STORE = PianoCore.USER_DB_STORE;
    let _userDbPromise = null;
    function openUserDb() {
      if (_userDbPromise) return _userDbPromise;
      _userDbPromise = PianoCore.openUserDb();
      return _userDbPromise;
    }
    async function userDbAll() {
      return PianoCore.userDbAll(await openUserDb());
    }
    async function userDbPut(record) {
      return PianoCore.userDbPut(await openUserDb(), record);
    }
    async function userDbDelete(id) {
      return PianoCore.userDbDelete(await openUserDb(), id);
    }
    const parseMusicXmlMetadata = PianoCore.parseMusicXmlMetadata;
    const collectSectionCandidates = PianoCore.collectSectionCandidates;
    const autoSectionDefs = PianoCore.autoSectionDefs;

    // Unzip an .mxl blob and return the inner MusicXML text. Used both at
    // add-time (to extract metadata) and at register-time (to feed OSMD a
    // plain XML blob — blob: URLs strip filename/MIME hints, so OSMD can't
    // reliably auto-detect a zip via the URL alone, especially on Android
    // Chrome where it parses the bytes as XML and fails).
    async function unzipMxlToXmlText(blob) {
      const JSZipLib = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
      if (!JSZipLib) throw new Error('JSZip not available — cannot read .mxl');
      const zip = await JSZipLib.loadAsync(await blob.arrayBuffer());
      let scorePath = null;
      const containerFile = zip.file('META-INF/container.xml');
      if (containerFile) {
        const containerXml = await containerFile.async('text');
        const m = containerXml.match(/full-path="([^"]+)"/);
        if (m) scorePath = m[1];
      }
      if (!scorePath) {
        for (const name of Object.keys(zip.files)) {
          if (name.endsWith('.xml') && !name.startsWith('META-INF')) { scorePath = name; break; }
        }
      }
      if (!scorePath) throw new Error('No score file inside .mxl archive');
      return zip.file(scorePath).async('text');
    }

    // Promote a stored-or-just-fetched record into the SONGS registry. Returns
    // the song so the caller can selectSong(...) it immediately.
    //
    // For .mxl records we always feed OSMD a plain-XML blob URL (built from
    // the cached `record.xmlText` if present, else lazily unzipped here and
    // written back to IndexedDB so subsequent loads are instant). This sidesteps
    // OSMD's blob-MIME-detection issue on Android Chrome.
    async function registerUserSong(record) {
      const isMxl = (record.mimeType !== 'application/vnd.recordare.musicxml+xml');
      let xmlText = record.xmlText;
      if (isMxl && !xmlText) {
        // Lazy migration: existing records (added before this fix) didn't
        // cache xmlText. Unzip on the fly now and persist for next time.
        try {
          xmlText = await unzipMxlToXmlText(record.mxlBlob);
          record.xmlText = xmlText;
          try { await userDbPut(record); } catch (e) { /* DB save best-effort */ }
        } catch (e) {
          console.warn('[UserSongs] mxl unzip failed for ' + record.id + ': ' + e.message);
        }
      } else if (!isMxl && !xmlText) {
        // Plain .musicxml/.xml record — unwrap to text so the load path is uniform.
        try { xmlText = await record.mxlBlob.text(); } catch (e) { /* fallthrough */ }
      }
      // Always present OSMD with a plain-XML blob URL when we could read xmlText;
      // fall back to the raw blob URL only if unzip failed.
      let url;
      if (xmlText) {
        url = URL.createObjectURL(new Blob([xmlText], { type: 'application/vnd.recordare.musicxml+xml' }));
      } else {
        url = URL.createObjectURL(record.mxlBlob);
      }
      const song = {
        id: record.id,
        titleKey: '__userTitle:' + record.id,   // resolved by t() override below
        composerKey: '__userComposer:' + record.id,
        icon: '🎵',
        // After unzip, the song carries an xml URL whether the source was .mxl or .xml.
        // The few branches that key off "is this a user .mxl?" use _isUser instead now.
        mxlUrl: null,
        xmlUrl: url,
        // Propagate the unzipped xmlText so loadCurrentScore's parseScore
        // pass + fetchPlaybackOrder both reuse it instead of re-fetching the
        // blob: URL — Android Chrome was occasionally hanging on the second
        // blob fetch of a just-imported user song.
        _xmlText: xmlText || null,
        sectionDefs: record.sectionDefs,
        notes: null, totalSec: 0, sections: [], playbackOrder: [],
        _loaded: false, _loadingPromise: null,
        _isUser: true,
        _userTitle: record.title || record.id,
        _userComposer: record.composer || ''
      };
      SONGS[record.id] = song;
      return song;
    }

    async function loadUserSongs() {
      try {
        const all = await userDbAll();
        for (const rec of all) await registerUserSong(rec);
        return all.length;
      } catch (e) {
        console.warn('[UserSongs] load failed:', e.message);
        return 0;
      }
    }

    // Add a song from a Blob (file upload or fetched URL). The MIME hint helps
    // distinguish .mxl (zip) from .musicxml/.xml (plain text). On success the
    // song is registered AND persisted; the returned song id can be selectSong'd.
    async function addUserSongFromBlob(blob, opts) {
      opts = opts || {};
      const isMxl = blob.type === 'application/vnd.recordare.musicxml+zip'
                  || (opts.filename || '').toLowerCase().endsWith('.mxl')
                  || blob.size > 0 && (await blob.slice(0, 2).text()) === 'PK';
      const xmlText = isMxl ? await unzipMxlToXmlText(blob) : await blob.text();
      const meta = parseMusicXmlMetadata(xmlText);
      if (meta.measureCount < 1) throw new Error('Score has no measures');
      const id = 'usr_' + Date.now().toString(36) + '_'
        + Math.random().toString(36).slice(2, 7);
      const sectionDefs = autoSectionDefs(xmlText, meta.measureCount);
      const record = {
        id,
        title: opts.titleOverride || meta.title || (opts.filename || 'Untitled').replace(/\.[^.]+$/, ''),
        composer: opts.composerOverride || meta.composer || '',
        mxlBlob: blob,
        // Cached so registerUserSong + section-editor reload don't have to
        // re-unzip on every app start. Same xml the score is rendered from.
        xmlText,
        mimeType: isMxl ? 'application/vnd.recordare.musicxml+zip'
                        : 'application/vnd.recordare.musicxml+xml',
        sectionDefs,
        addedAt: Date.now(),
        source: opts.source || 'upload'
      };
      await userDbPut(record);
      await registerUserSong(record);
      return record;
    }

    const USER_SONG_URL_TIMEOUT_MS = 30000;
    const USER_SONG_MAX_BYTES = 20 * 1024 * 1024;  // 20 MB
    async function addUserSongFromUrl(url, opts) {
      opts = opts || {};
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), USER_SONG_URL_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(url, { mode: 'cors', signal: ctrl.signal });
      } catch (e) {
        if (e && e.name === 'AbortError') {
          throw new Error('Download timed out (30s) — check connection and try again');
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
      const declared = parseInt(res.headers.get('content-length') || '0', 10);
      if (declared && declared > USER_SONG_MAX_BYTES) {
        throw new Error('File too large (' + Math.round(declared / 1024 / 1024) + ' MB; max 20 MB)');
      }
      const blob = await res.blob();
      if (blob.size > USER_SONG_MAX_BYTES) {
        throw new Error('File too large (' + Math.round(blob.size / 1024 / 1024) + ' MB; max 20 MB)');
      }
      // Robust filename derivation (URL constructor handles bare hostnames,
      // query strings, and fragments uniformly; the previous split() chain
      // returned an empty string for `https://host` and broke meta lookup).
      let filename = opts.filename;
      if (!filename) {
        try {
          const path = new URL(url).pathname;
          filename = path.substring(path.lastIndexOf('/') + 1) || 'untitled.mxl';
        } catch (_) {
          filename = 'untitled.mxl';
        }
      }
      return addUserSongFromBlob(blob, { ...opts, filename, source: opts.source || 'url' });
    }

    // Update an existing user-song's display title + composer. Persists to
    // IndexedDB and patches the in-memory SONGS entry so the next render
    // (My library / start-screen tile / song panel header) picks it up
    // without needing a reload. Caller passes already-validated strings.
    async function renameUserSong(id, newTitle, newComposer) {
      const db = await openUserDb();
      const rec = await new Promise((res, rej) => {
        const tx = db.transaction(USER_DB_STORE, 'readonly');
        const r = tx.objectStore(USER_DB_STORE).get(id);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      if (!rec) throw new Error('Song not found: ' + id);
      rec.title = newTitle;
      rec.composer = newComposer;
      await userDbPut(rec);
      const song = SONGS[id];
      if (song) {
        song._userTitle = newTitle;
        song._userComposer = newComposer;
      }
    }

    async function removeUserSong(id) {
      await userDbDelete(id);
      const song = SONGS[id];
      if (song) {
        if (song.mxlUrl?.startsWith('blob:')) URL.revokeObjectURL(song.mxlUrl);
        if (song.xmlUrl?.startsWith('blob:')) URL.revokeObjectURL(song.xmlUrl);
        delete SONGS[id];
      }
      // Also drop any per-song progress (otherwise the localStorage row leaks forever).
      if (practice.progress?.songs?.[id]) {
        delete practice.progress.songs[id];
        savePracticeProgress();
      }
    }

    // ========================================
    // Online library — MuseTrainer full catalog via GitHub API
    //   Enumerates https://github.com/musetrainer/library/scores (all 90+ .mxl).
    //   GitHub raw-list endpoint, cached in localStorage for 1 hour to respect
    //   the 60 req/hr unauthenticated rate limit.
    // ========================================
    // Pinned to a specific commit SHA so an upstream library update can't push
    // un-reviewed content into a kids app (App Store 4.7, effective 2025-11-13).
    // Bump this SHA + LIBRARY_PINNED_SHA together when intentionally refreshing.
    const LIBRARY_PINNED_SHA = '9128876f6164d96997c877a2be843349a32bdabb';
    const LIBRARY_API_URL = 'https://api.github.com/repos/musetrainer/library/contents/scores?ref=' + LIBRARY_PINNED_SHA + '&per_page=200';
    // v2: bumped after adding `filename` + JP translations to the cached entry
    // shape. Forces a one-time cache miss so existing v1 caches don't deny
    // the user the new Japanese labels.
    const LIBRARY_CACHE_KEY = 'pianoViz_libraryCache_v2';
    const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000;   // 1 hour

    // Curated Japanese labels for every score in the pinned MuseTrainer catalog
    // (69 .mxl files at SHA 9128876…). Keyed by exact filename so a future
    // pin bump only needs additions (no rebuilds). Falls back to the
    // ASCII-derived label when a filename isn't in the table.
    const LIBRARY_JP = {
      '12_Variations_of_Twinkle_Twinkle_Little_Star.mxl':                 { titleJp: 'キラキラ星変奏曲',                composerJp: 'モーツァルト' },
      'Arabesque_L._66_No._1_in_E_Major.mxl':                             { titleJp: 'アラベスク 第1番',                composerJp: 'ドビュッシー' },
      'Ave_Maria_D839_-_Schubert_-_Solo_Piano_Arrg..mxl':                 { titleJp: 'アヴェ・マリア D.839',           composerJp: 'シューベルト' },
      'Bach_Minuet_in_G_Major_BWV_Anh._114.mxl':                          { titleJp: 'メヌエット ト長調 BWV Anh.114',   composerJp: 'バッハ' },
      'Bach_Toccata_and_Fugue_in_D_Minor_Piano_solo.mxl':                 { titleJp: 'トッカータとフーガ ニ短調',       composerJp: 'バッハ' },
      'Beethoven_Symphony_No._5_1st_movement_Piano_solo.mxl':             { titleJp: '交響曲第5番「運命」第1楽章',      composerJp: 'ベートーヴェン' },
      'Bella_Ciao.mxl':                                                   { titleJp: 'ベラ・チャオ',                    composerJp: 'イタリア民謡' },
      'Bella_Ciao_-_La_Casa_de_Papel.mxl':                                { titleJp: 'ベラ・チャオ (ペーパー・ハウス版)', composerJp: 'イタリア民謡' },
      'Canon_in_D.mxl':                                                   { titleJp: 'カノン ニ長調',                   composerJp: 'パッヘルベル' },
      'Canon_in_D_3.mxl':                                                 { titleJp: 'カノン ニ長調 (アレンジ)',         composerJp: 'パッヘルベル' },
      'Canon_in_D_easy.mxl':                                              { titleJp: 'カノン ニ長調 (やさしい)',         composerJp: 'パッヘルベル' },
      'Carol_of_the_Bells.mxl':                                           { titleJp: 'キャロル・オブ・ザ・ベルズ',       composerJp: 'レオントーヴィチ' },
      'Carol_of_the_Bells_easy_piano.mxl':                                { titleJp: 'キャロル・オブ・ザ・ベルズ (やさしい)', composerJp: 'レオントーヴィチ' },
      'Chopin_-_Ballade_no._1_in_G_minor_Op._23.mxl':                     { titleJp: 'バラード第1番 ト短調 Op.23',     composerJp: 'ショパン' },
      'Chopin_-_Nocturne_Op._9_No._1.mxl':                                { titleJp: 'ノクターン Op.9-1',              composerJp: 'ショパン' },
      'Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mxl':                     { titleJp: 'ノクターン Op.9-2 変ホ長調',     composerJp: 'ショパン' },
      'Chopin_-_Spring_Waltz.mxl':                                        { titleJp: '春のワルツ',                       composerJp: 'ショパン' },
      'Clair_de_Lune__Debussy.mxl':                                       { titleJp: '月の光',                          composerJp: 'ドビュッシー' },
      'Clair_de_lune_-_Claude_Debussy.mxl':                               { titleJp: '月の光 (別編)',                   composerJp: 'ドビュッシー' },
      'DANSE_VILLAGEOISE_Beethoven.mxl':                                  { titleJp: '田舎の踊り',                      composerJp: 'ベートーヴェン' },
      'Dance_of_the_sugar_plum_fairy.mxl':                                { titleJp: '金平糖の踊り',                    composerJp: 'チャイコフスキー' },
      'Erik_Satie_-_Gymnopedie_No.1.mxl':                                 { titleJp: 'ジムノペディ 第1番',              composerJp: 'サティ' },
      'Flight_of_the_Bumblebee.mxl':                                      { titleJp: '熊蜂の飛行',                      composerJp: 'リムスキー=コルサコフ' },
      'Fur_Elise.mxl':                                                    { titleJp: 'エリーゼのために',                composerJp: 'ベートーヴェン' },
      'Fur_Elise_-_Beethoven_-_for_beginner_piano.mxl':                   { titleJp: 'エリーゼのために (初心者用)',     composerJp: 'ベートーヴェン' },
      'Fur_Elise_Easy_Piano.mxl':                                         { titleJp: 'エリーゼのために (やさしい)',     composerJp: 'ベートーヴェン' },
      'Fur_Elise_fingered.mxl':                                           { titleJp: 'エリーゼのために (運指付き)',     composerJp: 'ベートーヴェン' },
      'G_Minor_Bach.mxl':                                                 { titleJp: 'メヌエット ト短調 BWV Anh.115',   composerJp: 'ペツォールト' },
      'G_Minor_Bach_Original.mxl':                                        { titleJp: 'メヌエット ト短調 (原曲)',         composerJp: 'ペツォールト' },
      'Gnossienne_No._1.mxl':                                             { titleJp: 'グノシエンヌ 第1番',              composerJp: 'サティ' },
      'Greensleeves_for_Piano_easy_and_beautiful.mxl':                    { titleJp: 'グリーンスリーブス',              composerJp: 'イングランド民謡' },
      'Gymnopdie_No._1__Satie.mxl':                                       { titleJp: 'ジムノペディ 第1番 (別編)',       composerJp: 'サティ' },
      'Happy_Birthday_To_You_C_Major.mxl':                                { titleJp: 'ハッピーバースデー (ハ長調)',      composerJp: 'ヒル姉妹' },
      'Happy_Birthday_To_You_Piano.mxl':                                  { titleJp: 'ハッピーバースデー',              composerJp: 'ヒル姉妹' },
      'Hungarian_Dance_No_5_in_G_Minor.mxl':                              { titleJp: 'ハンガリー舞曲 第5番',            composerJp: 'ブラームス' },
      'Hungarian_Sonata.mxl':                                             { titleJp: 'ハンガリー狂詩曲',                composerJp: 'リスト' },
      'J._S._Bach_-_Air_on_the_G_String_Piano_arrangement.mxl':           { titleJp: 'G線上のアリア',                   composerJp: 'バッハ' },
      'La_Campanella_-_Grandes_Etudes_de_Paganini_No._3_-_Franz_Liszt.mxl': { titleJp: 'ラ・カンパネラ',                composerJp: 'リスト' },
      'Lacrimosa_-_Requiem.mxl':                                          { titleJp: 'レクイエム より「ラクリモーサ」',   composerJp: 'モーツァルト' },
      'Liebestraum_No._3_in_A_Major.mxl':                                 { titleJp: '愛の夢 第3番',                    composerJp: 'リスト' },
      'Maple_Leaf_Rag_Scott_Joplin.mxl':                                  { titleJp: 'メイプル・リーフ・ラグ',          composerJp: 'ジョプリン' },
      'Mariage_dAmour.mxl':                                               { titleJp: '愛の喜び (Mariage d\'Amour)',     composerJp: 'P. ド・センヌヴィル' },
      'Minuet_in_G_Major_Bach.mxl':                                       { titleJp: 'メヌエット ト長調',                composerJp: 'バッハ' },
      'Mozart_-_Piano_Sonata_No._16_-_Allegro.mxl':                       { titleJp: 'ピアノソナタ第16番 第1楽章',     composerJp: 'モーツァルト' },
      'Nocturne_No._20_in_C_Minor.mxl':                                   { titleJp: 'ノクターン第20番 嬰ハ短調 (遺作)', composerJp: 'ショパン' },
      'Nocturne_in_C_sharp_Minor.mxl':                                    { titleJp: 'ノクターン 嬰ハ短調 (遺作)',       composerJp: 'ショパン' },
      'Nocturne_in_E-flat_Major_Op._9_No._2_Easy.mxl':                    { titleJp: 'ノクターン Op.9-2 (やさしい)',     composerJp: 'ショパン' },
      'Ode_to_Joy_Easy_variation.mxl':                                    { titleJp: '歓喜の歌 (やさしい)',              composerJp: 'ベートーヴェン' },
      'Passacaglia.mxl':                                                  { titleJp: 'パッサカリア',                     composerJp: 'ヘンデル / ハルヴォルセン' },
      'Passacaglia2.mxl':                                                 { titleJp: 'パッサカリア (アレンジ2)',         composerJp: 'ヘンデル / ハルヴォルセン' },
      'Piano_Sonata_No._11_K._331_3rd_Movement_Rondo_alla_Turca.mxl':     { titleJp: 'トルコ行進曲 (ピアノソナタ第11番第3楽章)', composerJp: 'モーツァルト' },
      'Prelude_I_in_C_major_BWV_846_-_Well_Tempered_Clavier_First_Book.mxl': { titleJp: '前奏曲 第1番 ハ長調 BWV 846', composerJp: 'バッハ' },
      'Prelude_No._2_BWV_847_in_C_Minor.mxl':                             { titleJp: '前奏曲 第2番 ハ短調 BWV 847',    composerJp: 'バッハ' },
      'Prlude_No._4_in_E_Minor_Op._28_-_Frdric_Chopin.mxl':               { titleJp: '前奏曲 第4番 ホ短調 Op.28',      composerJp: 'ショパン' },
      'Prlude_Opus_28_No._4_in_E_Minor__Chopin.mxl':                      { titleJp: '前奏曲 Op.28-4 ホ短調',          composerJp: 'ショパン' },
      'Schubert_Serenade_-_Standchen_-_By_Lizst.mxl':                     { titleJp: 'セレナーデ (リスト編)',            composerJp: 'シューベルト' },
      'Sonata_No._16_1st_Movement_K._545.mxl':                            { titleJp: 'ピアノソナタ第16番 K.545 第1楽章',composerJp: 'モーツァルト' },
      'Sonate_No._14_Moonlight_1st_Movement.mxl':                         { titleJp: '月光ソナタ 第1楽章',              composerJp: 'ベートーヴェン' },
      'Sonate_No._14_Moonlight_3rd_Movement.mxl':                         { titleJp: '月光ソナタ 第3楽章',              composerJp: 'ベートーヴェン' },
      'Sonate_No._8_Pathetique_2nd_Movement.mxl':                         { titleJp: '悲愴ソナタ 第2楽章',              composerJp: 'ベートーヴェン' },
      'Spring_Waltz_Mariage_dAmour_-_Chopin.mxl':                         { titleJp: '春のワルツ (Mariage d\'Amour)',   composerJp: 'P. ド・センヌヴィル' },
      'Swan_Lake.mxl':                                                    { titleJp: '白鳥の湖',                        composerJp: 'チャイコフスキー' },
      'The_Entertainer_-_Scott_Joplin.mxl':                               { titleJp: 'ジ・エンターテイナー',             composerJp: 'ジョプリン' },
      'The_Entertainer_-_Scott_Joplin_-_1902.mxl':                        { titleJp: 'ジ・エンターテイナー (1902)',     composerJp: 'ジョプリン' },
      'WA_Mozart_Marche_Turque_Turkish_March_fingered.mxl':               { titleJp: 'トルコ行進曲 (運指付き)',          composerJp: 'モーツァルト' },
      'Waltz_Opus_64_No._2_in_C_Minor.mxl':                               { titleJp: 'ワルツ Op.64-2 嬰ハ短調',         composerJp: 'ショパン' },
      'Waltz_in_A_MinorChopin.mxl':                                       { titleJp: 'ワルツ イ短調 (遺作)',             composerJp: 'ショパン' },
      'Waltz_of_the_Flowers.mxl':                                         { titleJp: '花のワルツ',                      composerJp: 'チャイコフスキー' },
      'moonlight_sonata_3rd_movement.mxl':                                { titleJp: '月光ソナタ 第3楽章',              composerJp: 'ベートーヴェン' }
    };

    // libraryEntryFromGhFile — Phase 0b: delegated to @piano/core. The
    // pinned SHA + JP overrides flow in from the legacy module-scope
    // constants; the core stays catalog-source-agnostic.
    function libraryEntryFromGhFile(f) {
      return PianoCore.libraryEntryFromGhFile(f, {
        pinnedSha: LIBRARY_PINNED_SHA,
        jpOverrides: LIBRARY_JP,
      });
    }

    async function fetchLibrary(force) {
      if (!force) {
        try {
          const raw = localStorage.getItem(LIBRARY_CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw);
            if (cached.fetchedAt && (Date.now() - cached.fetchedAt) < LIBRARY_CACHE_TTL_MS) {
              return cached.entries;
            }
          }
        } catch (e) {}
      }
      const res = await fetch(LIBRARY_API_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('GitHub API ' + res.status);
      const json = await res.json();
      const entries = json
        .filter(f => f.type === 'file' && /\.mxl$/i.test(f.name))
        .map(libraryEntryFromGhFile)
        .sort((a, b) => a.label.localeCompare(b.label));
      try {
        localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), entries }));
      } catch (e) {}
      return entries;
    }

    // Tiny seed used while the API request is in flight, and as fallback if the
    // network is unreachable. Never replaces the live catalog once loaded.
    const LIBRARY_SEED = [
      { url: 'https://cdn.jsdelivr.net/gh/musetrainer/library@9128876f6164d96997c877a2be843349a32bdabb/scores/Pachelbel_Canon_in_D.mxl',  label: 'Pachelbel — Canon in D',  icon: '🎻' },
      { url: 'https://cdn.jsdelivr.net/gh/musetrainer/library@9128876f6164d96997c877a2be843349a32bdabb/scores/Satie_Gymnopedie_No._1.mxl', label: 'Satie — Gymnopédie No. 1', icon: '🌿' }
    ];
    let ONLINE_LIBRARY = LIBRARY_SEED.slice();

    // Convert per-song measure-based sectionDefs into time-anchored sections by
    // finding the first occurrence of each boundary measure in the unfolded note
    // timeline. This keeps sections contiguous in playback time even when the
    // source score has repeats that revisit early measures later.
    // buildSectionsFromDefs — Phase 0b: delegated to @piano/core/library/auto-section.
    const buildSectionsFromDefs = PianoCore.buildSectionsFromDefs;

    // ========================================
    // OSMD — single source of truth.
    //   * Renders the MusicXML score (visual).
    //   * Walked at load to extract every played note (timing + pitch + hand).
    //   * Cursor advances one step per onset event during practice (perfect sync).
    // ========================================
    let osmd = null;
    let _osmdInitPromise = null;

    async function initOsmd() {
      if (osmd) return osmd;
      if (_osmdInitPromise) return _osmdInitPromise;
      if (typeof opensheetmusicdisplay === 'undefined') {
        throw new Error('OSMD library not loaded');
      }
      _osmdInitPromise = (async () => {
        const inst = new opensheetmusicdisplay.OpenSheetMusicDisplay('osmdContainer', {
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawCredits: false,
          drawPartNames: false,
          // OSMD throws "Can't call GetWidth on an unformatted note" for some
          // print-object="no" notes in dense scores (still reproduces in 1.9.9).
          // Skipping hidden notes at the renderer level avoids the layout-cache miss.
          drawHiddenNotes: false,
          // autoResize:true wires a window-resize handler that re-runs
          // render() OUTSIDE our retry try/catch. La Campanella throws
          // UnformattedNote inside calculatePedals on every resize → Uncaught
          // pollution + occasional broken layout. Disable; our #osmdContainer
          // has fixed positioning so CSS handles viewport changes for kid use.
          autoResize: false,
          backend: 'svg',
          // OSMD's built-in cursor — wide yellow highlight block (Standard
          // type, alpha 0.4). Positioned per frame by setOsmdCursorToNote
          // (in drawPracticeLane) using the active note's measureIdx +
          // inBarQuarters.
          cursorsOptions: [{ type: 0, color: '#FFD700', alpha: 0.4, follow: false }]
        });
        // Disable pedal rendering — OSMD's calculatePedals path used to throw
        // UnformattedNote on Liszt / Chopin scores that mark every chord with
        // sustain. We don't visually need pedals for the practice flow.
        try { inst.EngravingRules.RenderPedals = false; }
        catch (e) { console.warn('[OSMD] could not disable pedal render: ' + e.message); }
        // OSMD 1.9.6+ made cursor.next() follow repetitions (e.g. play through
        // |: ... :| twice via the iterator). Our own fetchPlaybackOrder() +
        // expandNotesByPlaybackOrder() pipeline already unfolds repeats by
        // re-parsing the raw XML, so we ASK OSMD to keep the legacy 1.8.x
        // behavior (one linear walk through the score). Without this, the
        // iterator would visit the same measure twice and notes' inBarQuarters
        // values would alias across passes, breaking cursor positioning.
        try { inst.EngravingRules.CursorIgnoreRepetitions = true; }
        catch (_) { /* older OSMD: option doesn't exist, behavior is the same */ }
        // OSMD's load() accepts both .mxl URLs (zipped) and plain MusicXML URLs.
        // User-added songs may carry either; fall back to whichever is present.
        await inst.load(currentSong.mxlUrl || currentSong.xmlUrl);

        // Activate all Repetition objects so the iterator actually performs back-jumps.
        // OSMD attaches each Repetition to the measures' FirstRepetitionInstructions /
        // LastRepetitionInstructions, not necessarily to Sheet.Repetitions. Walk every
        // measure and collect unique parentRepetition references.
        const repSet = new Set();
        const measures = inst.Sheet?.SourceMeasures || [];
        for (const m of measures) {
          for (const list of [m.FirstRepetitionInstructions, m.LastRepetitionInstructions]) {
            if (!list) continue;
            for (const ri of list) {
              if (ri && ri.parentRepetition) repSet.add(ri.parentRepetition);
            }
          }
        }
        for (const r of repSet) {
          if (typeof r.UserNumberOfRepetitions === 'number' && r.UserNumberOfRepetitions < 2) {
            r.UserNumberOfRepetitions = Math.max(2, r.NumberOfRepetitions || 2);
          }
        }
        console.log('[OSMD] measures=' + measures.length
          + ' repetitions=' + repSet.size
          + ' Sheet.Repetitions=' + (inst.Sheet?.Repetitions?.length || 0));

        // render() can throw GetWidth on first pass for complex scores. A
        // second attempt usually succeeds because the first pass populated
        // VexFlow's internal layout caches. Both throws → continue with the
        // partial SVG (extractNotesFromOsmd has its own per-step try/catch).
        let renderOk = false;
        for (let attempt = 0; attempt < 2 && !renderOk; attempt++) {
          try {
            inst.render();
            renderOk = true;
          } catch (e) {
            console.warn('[OSMD] render attempt ' + (attempt + 1) + ' failed: ' + e.message);
          }
        }
        if (!renderOk) {
          console.warn('[OSMD] both render attempts failed — continuing with partial state');
        }
        // Cursor show/reset are graphical operations that re-query unformatted
        // notes; wrap individually so a cursor failure doesn't kill the load.
        if (inst.cursor) {
          try { inst.cursor.show(); }
          catch (e) { console.warn('[OSMD] cursor.show failed: ' + e.message); }
          try { inst.cursor.reset(); }
          catch (e) { console.warn('[OSMD] cursor.reset failed: ' + e.message); }
        }
        osmd = inst;
        return osmd;
      })();
      try { return await _osmdInitPromise; }
      finally { _osmdInitPromise = null; }
    }

    // Coalesce tied note sequences into a single sustained event so the kid
    // doesn't have to re-strike a tied pitch. Modifies `notes` in place.
    // Algorithm: for each note flagged tieStart, find the chain of subsequent
    // notes (same midi, same hand) flagged tieEnd that immediately follow in
    // time. Extend the first note's durSec to cover the whole chain and remove
    // the continuation entries.
    function mergeTiedNotes(notes) {
      if (!notes || notes.length < 2) return { merged: 0, samples: [] };
      // We expect the array to be sorted by timeSec already.
      const removeMask = new Array(notes.length).fill(false);
      // Per-merge sample objects are only consumed by the load-time DIAG
      // dump, so skip the toFixed coercions + push when telemetry is off.
      const samples = REMOTE_LOG_ENABLED ? [] : null;
      let mergedCount = 0;
      for (let i = 0; i < notes.length; i++) {
        const a = notes[i];
        if (!a.tieStart || removeMask[i]) continue;
        // Walk forward looking for the matching tieEnd of the same midi/hand.
        // Allow some chord-internal jitter — match within a small window.
        let endIdx = -1;
        for (let j = i + 1; j < notes.length; j++) {
          if (removeMask[j]) continue;
          const b = notes[j];
          // Stop the search if we've gone way past the expected end of the tie
          // (no tied note should start more than 30s after its predecessor).
          if (b.timeSec - a.timeSec > 30) break;
          if (b.tieEnd && b.midi === a.midi && b.hand === a.hand) {
            endIdx = j;
            // If b is also a tieStart (mid-chain), keep going.
            if (!b.tieStart) break;
          }
        }
        if (endIdx > i) {
          const tail = notes[endIdx];
          const oldDur = a.durSec;
          a.durSec = Math.max(a.durSec, (tail.timeSec + tail.durSec) - a.timeSec);
          // Mark all intermediate same-pitch tieEnd notes for removal.
          let chainLen = 1;
          for (let j = i + 1; j <= endIdx; j++) {
            const b = notes[j];
            if (b.tieEnd && b.midi === a.midi && b.hand === a.hand) {
              removeMask[j] = true;
              chainLen++;
            }
          }
          mergedCount += (chainLen - 1);
          if (samples && samples.length < 5) {
            samples.push({
              midi: a.midi, hand: a.hand,
              t0: +a.timeSec.toFixed(3),
              chain: chainLen,
              durBefore: +oldDur.toFixed(3),
              durAfter: +a.durSec.toFixed(3),
              m: a.measureIdx,
            });
          }
        }
      }
      if (removeMask.some(Boolean)) {
        let w = 0;
        for (let r = 0; r < notes.length; r++) {
          if (!removeMask[r]) notes[w++] = notes[r];
        }
        notes.length = w;
      }
      return { merged: mergedCount, samples: samples || [] };
    }

    // Walk the OSMD iterator once, extracting one event per voice-entry note AND
    // recording (cursor step → measure index) so we can later jump the cursor to a
    // specific measure on repeat passes. Each note carries its source measureIdx.
    //
    // === Timing model ===
    // We use the XML-derived measure timing (xmlMeasureTiming) as the source of
    // truth when available — that's the only way to handle <metronome beat-unit>
    // correctly and to honor mid-measure tempo changes. OSMD is only consulted
    // for the iterator state (cursor step → measure mapping, in-bar offset).
    //
    // The OSMD `length.realValue` for each note is in WHOLE-NOTE units; that's a
    // pure score-relative quantity (how many quarter notes the note occupies),
    // independent of tempo. We multiply by the local quarter-BPM (from the XML
    // tempo segment that contains this note) to get duration in seconds.
    //
    // When XML parsing fails entirely we fall back to OSMD's TempoInBPM.
    function extractNotesFromOsmd(xmlMeasureTiming, scoreTiming) {
      if (!osmd || !osmd.cursor) return { notes: [], measureStartSec: [], measureBpm: [] };
      const notes = [];

      const sourceMeasures = osmd.Sheet?.SourceMeasures || [];
      const measureCount = sourceMeasures.length;
      const measureStartSec = new Array(measureCount).fill(0);
      const measureBpm = new Array(measureCount).fill(72);
      const haveXml = xmlMeasureTiming
        && xmlMeasureTiming.startSec.length === measureCount
        && scoreTiming
        && scoreTiming.measures.length === measureCount;

      // Compute measureBpm[i] = leading quarter-BPM at start of measure i.
      // From XML: walk tempo events of each measure; the tempo carried into
      // measure i is the last segBpm from measure i-1 (or leadingQuarterBpm).
      if (haveXml) {
        let curQBpm = scoreTiming.leadingQuarterBpm;
        for (let i = 0; i < measureCount; i++) {
          measureBpm[i] = curQBpm;
          measureStartSec[i] = xmlMeasureTiming.startSec[i];
          // Advance curQBpm by walking this measure's tempo events.
          for (const ev of scoreTiming.measures[i].tempoEvents) curQBpm = ev.qBpm;
        }
      } else {
        for (let i = 0; i < measureCount; i++) {
          const m = sourceMeasures[i];
          const bpm = m?.TempoInBPM || measureBpm[i - 1] || 72;
          measureBpm[i] = bpm;
          if (i > 0) {
            const prev = sourceMeasures[i - 1];
            const prevDurWhole = prev?.Duration?.realValue || 0.25;
            const prevDurSec = prevDurWhole * 4 * 60 / measureBpm[i - 1];
            measureStartSec[i] = measureStartSec[i - 1] + prevDurSec;
          }
        }
      }

      // Helper: given a measureIdx and an in-bar QUARTER-NOTE offset, find the
      // tempo segment that's in effect there and return both seconds-from-bar-
      // start and the local qBpm (so the caller can compute durSec correctly).
      // Returns { offsetSec, localQBpm }.
      function timeAtInBar(measureIdx, inBarQuarters) {
        if (!haveXml) {
          const bpm = measureBpm[measureIdx];
          return { offsetSec: inBarQuarters * 60 / bpm, localQBpm: bpm };
        }
        const sm = scoreTiming.measures[measureIdx];
        const inBarDiv = inBarQuarters * sm.divisions;
        // Walk segments in order
        let segBpm = (measureIdx === 0)
          ? scoreTiming.leadingQuarterBpm
          : measureBpm[measureIdx];
        // For measure 0, measureBpm[0] is the leading qBpm too — same value.
        let prevDiv = 0;
        let acc = 0;
        for (const ev of sm.tempoEvents) {
          if (ev.inBarDiv > inBarDiv) break;
          const segDiv = Math.max(0, ev.inBarDiv - prevDiv);
          if (segDiv > 0) acc += (segDiv / sm.divisions) * 60 / segBpm;
          segBpm = ev.qBpm;
          prevDiv = ev.inBarDiv;
        }
        const tailDiv = Math.max(0, inBarDiv - prevDiv);
        if (tailDiv > 0) acc += (tailDiv / sm.divisions) * 60 / segBpm;
        return { offsetSec: acc, localQBpm: segBpm };
      }

      osmd.cursor.reset();
      const it = osmd.cursor.iterator;
      let cursorStep = 0;
      let skippedNotes = 0;
      while (!it.endReached && cursorStep < 20000) {
        try {
          const measureIdx = it.CurrentMeasureIndex;
          const measure = sourceMeasures[measureIdx];
          const tsFrac = it.currentTimeStamp;
          const measureStartTs = measure?.AbsoluteTimestamp?.realValue || 0;
          // OSMD timestamps are in WHOLE-NOTE units. Convert to quarter notes.
          const inBarQuarters = Math.max(0, tsFrac.realValue - measureStartTs) * 4;
          const { offsetSec, localQBpm } = timeAtInBar(measureIdx, inBarQuarters);
          const timeSec = measureStartSec[measureIdx] + offsetSec;
          const voiceEntries = it.CurrentVoiceEntries;
          if (voiceEntries) {
            for (const ve of voiceEntries) {
              let hand;
              try {
                const idx = ve.parentSourceStaffEntry?.parentStaff?.idInMusicSheet;
                if (typeof idx === 'number') hand = idx === 0 ? 'R' : 'L';
              } catch (_) { /* pitch fallback below */ }
              const noteList = ve.Notes || ve.notes || [];
              for (const note of noteList) {
                try {
                  if (!note) continue;
                  if (note.isRest && note.isRest()) continue;
                  if (note.halfTone == null) continue;
                  const midi = note.halfTone + 12;
                  if (!hand) hand = midi >= 60 ? 'R' : 'L';
                  // length.realValue = whole notes; ×4 → quarter notes.
                  const lengthQuarters = (note.length?.realValue ?? 0.25) * 4;
                  // Duration uses the LOCAL bpm at the note's onset. For very
                  // long notes that span a tempo change this is approximate but
                  // notes rarely cross mid-bar tempo events in practice.
                  const durSec = Math.max(0.05, lengthQuarters * 60 / localQBpm);
                  // tieStart/tieEnd: detected via OSMD's note.NoteTie or the
                  // `Tie` getter (varies by OSMD version) so we can later merge
                  // tied notes into a single sustained event.
                  let tieStart = false, tieEnd = false;
                  try {
                    const tie = note.NoteTie || note.Tie || note.notetie;
                    if (tie) {
                      const isStartNote = tie.StartNote === note || tie.startNote === note;
                      const isEndNote = tie.EndNote === note || tie.endNote === note;
                      // Mid-chain ties (3+ links) flag both — mergeTiedNotes
                      // would otherwise misclassify the middle as end-only
                      // and break the chain walk.
                      if (isStartNote && !isEndNote) tieStart = true;
                      else if (isEndNote && !isStartNote) tieEnd = true;
                      else { tieStart = true; tieEnd = true; }
                    }
                  } catch (_) { /* OSMD version differences */ }
                  notes.push({
                    hand, midi,
                    timeSec, durSec, measureIdx,
                    // inBarQuarters = position within the bar in quarter-note
                    // units. Drives cursor positioning via OSMD's iterator
                    // currentTimeStamp — robust against partial measures
                    // (la Campanella m=5 actualDur < nominalDur).
                    inBarQuarters,
                    tieStart, tieEnd,
                  });
                } catch (_) {
                  skippedNotes++;
                }
              }
            }
          }
        } catch (_) {
          skippedNotes++;
        }
        // moveToNext is enough — we don't need the visual cursor update
        // during extraction since the visible cursor is OSMD's own,
        // re-driven from the timeline at playback time.
        try { it.moveToNext(); }
        catch (_) { break; }
        cursorStep++;
      }
      try { osmd.cursor.reset(); } catch (_) { /* ignore */ }
      notes.sort((a, b) => a.timeSec - b.timeSec || a.midi - b.midi);
      if (skippedNotes > 0) {
        console.warn('[OSMD] skipped ' + skippedNotes + ' unformattable note(s)');
      }
      // Tie merging: when two notes of the same midi+hand are tied, the second
      // is a continuation rather than a re-attack. The kid shouldn't have to
      // re-strike a tied note. Coalesce by extending the first note's durSec
      // and removing the continuation entries.
      const tieReport = mergeTiedNotes(notes);
      // Surface the tie report only when telemetry is on so production
      // builds don't allocate the wrapper object every load.
      const _diag = REMOTE_LOG_ENABLED ? {
        totalSteps: cursorStep,
        skippedNotes,
        tieReport,
      } : null;
      return {
        notes, measureStartSec, measureBpm, _diag,
      };
    }

    // Parse the raw MusicXML for everything that affects playback timing:
    // per-measure tempo (correctly normalized via beat-unit), time signature,
    // divisions, anacrusis, and mid-measure tempo events.
    //
    // OSMD's TempoInBPM does NOT normalize <metronome beat-unit>: confirmed by
    // reading ExpressionReader.ts — it computes
    //   currentMeasure.TempoInBPM = this.soundTempo * (dotted?1.5:1)
    // and ignores the beat-unit type. So <metronome beat-unit="eighth" per-minute="120"/>
    // is stored as 120 by OSMD when it should be 60. We re-parse the XML
    // ourselves so we have the canonical quarter BPM per measure (and per
    // intra-measure event for pieces with mid-bar tempo changes).
    //
    // Also catches: time signature changes, divisions changes, anacrusis,
    // and the bare-words case (e.g. <words>D.C. al Fine</words> with no <sound>).
    //
    // Returns:
    //   {
    //     measures: [{ tempoEvents, timeSig, divisions, implicit, durationDiv,
    //                  actualDiv }, ...],
    //     leadingQuarterBpm: number,
    //     leadingSource: string | null,
    //   }
    //   tempoEvents = [{ inBarDiv, qBpm, src }, ...]  // first one applies from start of measure
    //   inBarDiv is in DIVISIONS units (0 = bar start)
    //   actualDiv = max forward-extent reached by any voice in the measure
    //               (used to compute the bar's true played duration when an
    //               exporter writes a partial measure — la Campanella's m=5).
    function parseScoreTimingFromXml(xmlText) {
      try {
        const dom = new DOMParser().parseFromString(xmlText, 'text/xml');
        const partEls = dom.querySelectorAll('part');
        if (!partEls.length) return null;
        const measureEls = partEls[0].querySelectorAll('measure');
        // beat-unit name → fraction-of-quarter-note
        // (eighth = 0.5 quarters → eighth=120 means quarter=60)
        const beatUnitQ = {
          'long': 16, 'breve': 8, 'whole': 4, 'half': 2, 'quarter': 1,
          'eighth': 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
          '128th': 0.03125, '256th': 0.015625,
        };
        function dotMul(d) { return d === 1 ? 1.5 : d === 2 ? 1.75 : d === 3 ? 1.875 : 1; }
        function metronomeToQBpm(met) {
          const buEl = met.querySelector('beat-unit');
          const bu = (buEl?.textContent || 'quarter').trim();
          const pmEl = met.querySelector('per-minute');
          const pm = parseFloat(pmEl?.textContent || '');
          if (!isFinite(pm) || pm <= 0) return null;
          const dotted = met.querySelectorAll('beat-unit-dot').length;
          const factor = (beatUnitQ[bu] != null ? beatUnitQ[bu] : 1) * dotMul(dotted);
          return {
            qBpm: pm * factor,
            src: 'metronome ' + bu + (dotted ? '·'.repeat(dotted) : '') + '=' + pm,
          };
        }
        // Walk measures and record events in document order.
        const out = [];
        let curDivisions = 1;        // divisions per quarter (inherits across measures)
        let curBeats = 4, curBeatType = 4;  // time signature (inherits)
        let leadingQuarterBpm = null;
        let leadingSource = null;
        measureEls.forEach((m, i) => {
          const implicit = m.getAttribute('implicit') === 'yes';
          const tempoEvents = [];
          // Track division offset within the measure as we walk children in order.
          let inBarDiv = 0;
          // Maximum forward extent reached by any voice in this measure. With
          // multi-voice + <backup>, `inBarDiv` is the last voice's endpoint,
          // not the measure's content length — e.g. voice 1 fills 720 ticks
          // then backup 720, voice 2 fills 480: final inBarDiv=480 but the
          // measure actually has 720 ticks of content. We track the max so
          // `actualDiv` reflects how much time the measure consumes.
          let maxExtent = 0;
          // measure children appear in score order; we need that order so a
          // <direction> placed mid-measure can be positioned correctly.
          for (const ch of Array.from(m.children)) {
            const name = ch.tagName.toLowerCase();
            if (name === 'attributes') {
              const div = ch.querySelector(':scope > divisions');
              if (div) {
                const v = parseInt(div.textContent, 10);
                if (Number.isFinite(v) && v > 0) curDivisions = v;
              }
              const tm = ch.querySelector(':scope > time');
              if (tm) {
                const b = parseInt(tm.querySelector(':scope > beats')?.textContent || '', 10);
                const bt = parseInt(tm.querySelector(':scope > beat-type')?.textContent || '', 10);
                if (Number.isFinite(b) && b > 0) curBeats = b;
                if (Number.isFinite(bt) && bt > 0) curBeatType = bt;
              }
            } else if (name === 'direction') {
              // <metronome> takes precedence (explicit beat-unit). Fall through
              // to <sound tempo> when no metronome is present in this direction.
              const met = ch.querySelector('direction-type metronome');
              if (met) {
                const r = metronomeToQBpm(met);
                if (r) {
                  tempoEvents.push({ inBarDiv, qBpm: r.qBpm, src: r.src });
                  if (leadingQuarterBpm == null) {
                    leadingQuarterBpm = r.qBpm;
                    leadingSource = r.src;
                  }
                }
              } else {
                const sn = ch.querySelector(':scope > sound[tempo]');
                if (sn) {
                  const tempoVal = parseFloat(sn.getAttribute('tempo') || '');
                  if (isFinite(tempoVal) && tempoVal > 0) {
                    tempoEvents.push({ inBarDiv, qBpm: tempoVal, src: 'sound tempo=' + tempoVal });
                    if (leadingQuarterBpm == null) {
                      leadingQuarterBpm = tempoVal;
                      leadingSource = 'sound tempo=' + tempoVal;
                    }
                  }
                }
              }
            } else if (name === 'sound') {
              // Score-level <sound> outside <direction>
              const tempoVal = parseFloat(ch.getAttribute('tempo') || '');
              if (isFinite(tempoVal) && tempoVal > 0) {
                tempoEvents.push({ inBarDiv, qBpm: tempoVal, src: 'sound tempo=' + tempoVal });
                if (leadingQuarterBpm == null) {
                  leadingQuarterBpm = tempoVal;
                  leadingSource = 'sound tempo=' + tempoVal;
                }
              }
            } else if (name === 'note') {
              // Advance inBarDiv for non-grace, non-chord notes.
              const isGrace = ch.querySelector(':scope > grace') != null;
              const isChord = ch.querySelector(':scope > chord') != null;
              if (!isGrace && !isChord) {
                const dEl = ch.querySelector(':scope > duration');
                if (dEl) {
                  const dv = parseInt(dEl.textContent, 10);
                  if (Number.isFinite(dv) && dv > 0) {
                    inBarDiv += dv;
                    if (inBarDiv > maxExtent) maxExtent = inBarDiv;
                  }
                }
              }
            } else if (name === 'backup') {
              const dEl = ch.querySelector(':scope > duration');
              if (dEl) {
                const dv = parseInt(dEl.textContent, 10);
                if (Number.isFinite(dv) && dv > 0) inBarDiv -= dv;
              }
            } else if (name === 'forward') {
              const dEl = ch.querySelector(':scope > duration');
              if (dEl) {
                const dv = parseInt(dEl.textContent, 10);
                if (Number.isFinite(dv) && dv > 0) {
                  inBarDiv += dv;
                  if (inBarDiv > maxExtent) maxExtent = inBarDiv;
                }
              }
            }
          }
          // The total nominal bar duration is beats × (4 / beat-type) quarters,
          // converted to divisions: durationDiv = beats × divisions × 4 / beat-type.
          // For anacrusis / partial measures the actual played duration is
          // shorter — we'll let the note timeline drive that.
          const durationDiv = Math.round(curBeats * curDivisions * 4 / curBeatType);
          out.push({
            tempoEvents,
            timeSig: { beats: curBeats, beatType: curBeatType },
            divisions: curDivisions,
            implicit,
            durationDiv,
            // Actual measured content length, in DIVISIONS — the maximum
            // forward extent reached by any voice in document order. With
            // multi-voice scores like la Campanella's m=5 (8 sixteenths in
            // voice 1 + 4 eighths in voice 2 + half-rest in voice 5, all
            // separated by <backup>), this captures the bar's true content
            // length. Falls back to durationDiv when measure is fully empty.
            actualDiv: maxExtent,
          });
        });
        // Default leading tempo if score has no markings at all.
        if (leadingQuarterBpm == null) {
          leadingQuarterBpm = 72;
          leadingSource = 'default (no marking)';
        }

        // === Tempo-direction snap to measure boundary ===
        // MusicXML exporters often place tempo <direction> elements in
        // document order, which lands them AFTER one or more notes of the
        // measure they're meant to govern. Reader's intent: "this whole
        // measure plays at the new tempo." Strict-position playback: "the
        // first N notes still use the previous measure's tempo, then it
        // changes mid-bar." la Campanella m=5 is the canonical case — the
        // ♪=194 metronome lives at inBarDiv=120 (after the 3rd 16th), so
        // the first two pickup sixteenths play at the carried-in bpm (94,
        // from m=4) and notes 3+ snap to 97. The kid sees the cursor
        // "lurch ahead" at note 3 because the inter-note spacing visibly
        // shrinks.
        // Heuristic: a measure's FIRST tempo event that sits in the early
        // half (< durationDiv/2) and differs from the carried-in bpm is
        // promoted to inBarDiv=0 — i.e. takes effect from the bar's start.
        // Mid-bar rallentandos (further events) keep their actual position.
        let carriedQBpm = leadingQuarterBpm;
        for (const meas of out) {
          const ev0 = meas.tempoEvents[0];
          if (
            ev0 && ev0.inBarDiv > 0 && ev0.inBarDiv < meas.durationDiv / 2 &&
            Math.abs(ev0.qBpm - carriedQBpm) > 0.01
          ) {
            ev0.inBarDiv = 0;
            ev0.src = (ev0.src || '') + ' [snapped to bar start]';
          }
          for (const ev of meas.tempoEvents) carriedQBpm = ev.qBpm;
        }
        return { measures: out, leadingQuarterBpm, leadingSource };
      } catch (e) {
        console.warn('[parseScoreTimingFromXml] failed:', e);
        return null;
      }
    }

    // Compute per-measure (start time, duration) seconds from XML timing data.
    // Handles tempo changes mid-measure correctly: each measure's elapsed time
    // is the sum over its tempo segments of (segmentDuration / segmentBpm).
    function buildMeasureTimingFromXml(scoreTiming) {
      if (!scoreTiming) return null;
      const measures = scoreTiming.measures;
      const startSec = new Array(measures.length).fill(0);
      const durSec = new Array(measures.length).fill(0);
      // The tempo at the very start: leadingQuarterBpm. Each subsequent measure
      // inherits the last tempo from the previous measure.
      let curQBpm = scoreTiming.leadingQuarterBpm;
      for (let i = 0; i < measures.length; i++) {
        const m = measures[i];
        // Effective bar duration in DIVISIONS = the SUM of explicit content
        // (notes + rests) when present. Match OSMD's `SourceMeasure.Duration`
        // semantics — OSMD's getter literally says "can be 1/1 in a 4/4
        // measure", i.e. it tracks actual content, not the nominal time
        // signature. Without this, exporters that emit a partial measure
        // (e.g. MuseScore's la Campanella m=5 has 8/12 sixteenths followed
        // by no trailing rest, so actualDiv=480 but durationDiv=720) pin
        // the next measure 240 ticks later in our XML clock than OSMD
        // visits it, manifesting as a phantom rest gap in the lane right
        // before the next bar's first note.
        // We still honour durationDiv as a floor: if the measure has no
        // notes at all (empty actualDiv), fall back to the nominal length
        // so silent bars don't collapse to zero-time.
        const usedDiv = m.actualDiv > 0 ? m.actualDiv : m.durationDiv;
        // Walk tempo events within the measure, accumulating seconds.
        // Events are pre-sorted by inBarDiv (document order = score order).
        // The "current tempo at measure start" is curQBpm; an event at inBarDiv=0
        // overrides it for this measure (and subsequent measures).
        let acc = 0;            // seconds accumulated in this measure
        let prevDiv = 0;        // div offset of the last segment boundary
        let segBpm = curQBpm;   // bpm in effect for the segment starting at prevDiv
        for (const ev of m.tempoEvents) {
          const segDiv = Math.max(0, ev.inBarDiv - prevDiv);
          if (segDiv > 0) {
            const segQuarters = segDiv / m.divisions;
            acc += segQuarters * 60 / segBpm;
          }
          segBpm = ev.qBpm;
          prevDiv = ev.inBarDiv;
        }
        // Final segment from last event to the end of the bar
        const tailDiv = Math.max(0, usedDiv - prevDiv);
        if (tailDiv > 0) {
          const tailQuarters = tailDiv / m.divisions;
          acc += tailQuarters * 60 / segBpm;
        }
        durSec[i] = acc;
        if (i + 1 < measures.length) startSec[i + 1] = startSec[i] + acc;
        // Tempo carried forward to the next measure
        curQBpm = segBpm;
      }
      return { startSec, durSec };
    }

    // Parse the raw MusicXML to derive the actual playback order.
    // OSMD doesn't surface <repeat>/<ending> markers via its public API
    // (still true in 1.9.9), so we read them ourselves and build a sequence of
    // measure indices in the order they should sound.
    //
    // `forSong` is captured by `loadCurrentScore` (the song record at the
    // time loading started). Reading the global `currentSong` here would
    // race against a rapid `selectSong()` that changes `currentSong`
    // mid-load — the IIFE would then fetch the wrong song's XML and feed
    // a foreign repeat structure into the in-flight song's note timeline.
    async function fetchPlaybackOrder(forSong) {
      const targetSong = forSong || currentSong;
      // Prefer the pre-decoded xmlText cached on the song record (set by
      // addUserSongFromBlob). Avoids a second fetch which on Android Chrome
      // can hang against blob: URLs of just-imported songs.
      let text = targetSong._xmlText;
      if (!text) {
        const res = await fetch(targetSong.xmlUrl);
        if (!res.ok) throw new Error('XML fetch failed: ' + res.status);
        text = await res.text();
      }
      const dom = new DOMParser().parseFromString(text, 'text/xml');
      // Use first part only; both staves of a piano grand staff usually share repeats.
      const partEls = dom.querySelectorAll('part');
      if (!partEls.length) return [];
      const measureEls = partEls[0].querySelectorAll('measure');

      const info = [];
      measureEls.forEach((m) => {
        const startsEnding = {};
        const stopsEnding = {};
        for (const e of m.querySelectorAll('ending')) {
          const num = e.getAttribute('number');
          const type = e.getAttribute('type');
          if (type === 'start') startsEnding[num] = true;
          if (type === 'stop' || type === 'discontinue') stopsEnding[num] = true;
        }
        let fwdRepeat = false, bwdRepeat = false;
        for (const r of m.querySelectorAll('barline repeat')) {
          const dir = r.getAttribute('direction');
          if (dir === 'forward') fwdRepeat = true;
          if (dir === 'backward') bwdRepeat = true;
        }
        // D.C. / D.S. / Coda / Fine markers. MusicXML places these on
        // <direction><sound dacapo|dalsegno|tocoda|coda|segno|fine="..."/>;
        // some engravers omit the <sound> and use <words> only, so check
        // both. The current jump model handles the most common case
        // (D.C. al Fine, simple D.C., D.S. al Coda); jumps fire at most
        // once each so safety can't loop.
        let dacapo = false, fine = false, tocoda = false;
        let coda = false, segno = false, dalsegno = false;
        for (const s of m.querySelectorAll('direction sound')) {
          if (s.getAttribute('dacapo') === 'yes') dacapo = true;
          if (s.getAttribute('fine') === 'yes') fine = true;
          if (s.getAttribute('tocoda')) tocoda = true;
          if (s.getAttribute('coda')) coda = true;
          if (s.getAttribute('segno')) segno = true;
          if (s.getAttribute('dalsegno')) dalsegno = true;
        }
        for (const w of m.querySelectorAll('direction words')) {
          const text = (w.textContent || '').trim();
          if (/^D\.?C\./i.test(text) || /Da\s*Capo/i.test(text)) dacapo = true;
          if (/^Fine\b/i.test(text)) fine = true;
          if (/^To\s*Coda/i.test(text)) tocoda = true;
          if (/^D\.?S\./i.test(text) || /Dal\s*Segno/i.test(text)) dalsegno = true;
        }
        info.push({
          startsEnding, stopsEnding, fwdRepeat, bwdRepeat,
          dacapo, fine, tocoda, coda, segno, dalsegno
        });
      });

      // Pre-scan for segno / coda landing positions (used by D.S. and
      // To Coda jumps). First occurrence wins — multi-segno scores are
      // rare and we'd need name matching for those.
      let segnoIdx = -1, codaIdx = -1;
      for (let k = 0; k < info.length; k++) {
        if (info[k].segno && segnoIdx < 0) segnoIdx = k;
        if (info[k].coda && codaIdx < 0) codaIdx = k;
      }

      const order = [];
      const repeatTaken = new Set();   // forward-repeat positions already done
      let i = 0;
      let repeatStartIdx = 0;
      let dcFired = false;             // D.C. already taken
      let dsFired = false;             // D.S. already taken
      let safety = 0;
      while (i < info.length && safety < info.length * 8) {
        safety++;
        const m = info[i];
        // Skip 1st-ending volta on the second pass (jump forward to 2nd ending or out)
        if (m.startsEnding['1'] && repeatTaken.has(repeatStartIdx)) {
          let j = i + 1;
          while (j < info.length
            && !info[j].startsEnding['2']
            && !info[j].startsEnding['3']) j++;
          i = j;
          continue;
        }
        if (m.fwdRepeat) repeatStartIdx = i;
        order.push(i);
        // Fine — only stops the piece on the post-D.C./D.S. pass.
        if ((dcFired || dsFired) && m.fine) break;
        // To Coda — only on the post-D.C./D.S. pass; jump to the coda marker.
        if ((dcFired || dsFired) && m.tocoda && codaIdx >= 0) {
          i = codaIdx;
          continue;
        }
        if (m.bwdRepeat && !repeatTaken.has(repeatStartIdx)) {
          repeatTaken.add(repeatStartIdx);
          i = repeatStartIdx;
          continue;
        }
        // D.C. — back to the very beginning. Reset volta state so the
        // second pass plays the 1st-ending volta as written (the kid
        // hears the original phrasing again before we hit Fine / Coda).
        if (m.dacapo && !dcFired) {
          dcFired = true;
          repeatTaken.clear();
          repeatStartIdx = 0;
          i = 0;
          continue;
        }
        // D.S. — back to segno marker. Same volta-state reset.
        if (m.dalsegno && !dsFired && segnoIdx >= 0) {
          dsFired = true;
          repeatTaken.clear();
          repeatStartIdx = segnoIdx;
          i = segnoIdx;
          continue;
        }
        i++;
      }
      return order;
    }

    // Re-time the per-measure notes following the playback order, returning a flat
    // monotonic sequence ready for the lane / Tone.js / cursor sync.
    // Each playback note is tagged with cursorJump = measureIdx whenever the playback
    // moves non-sequentially in the written score (back-jump or forward-skip).
    function expandNotesByPlaybackOrder(baseNotes, order, measures, sourceMeasureStartSec) {
      const byMeasure = new Map();
      for (const n of baseNotes) {
        let arr = byMeasure.get(n.measureIdx);
        if (!arr) { arr = []; byMeasure.set(n.measureIdx, arr); }
        arr.push(n);
      }
      // Reuse the cumulative-sum measureStartSec from extract step if provided
      // (handles tempo changes correctly). Fall back to inline compute when
      // called from a context that can't supply it (legacy / tests).
      let measureStartSec, measureDurSec;
      if (sourceMeasureStartSec && sourceMeasureStartSec.length === measures.length) {
        measureStartSec = sourceMeasureStartSec;
        measureDurSec = new Array(measures.length).fill(0);
        for (let i = 0; i < measures.length; i++) {
          const m = measures[i];
          // Use cumulative diff for dur — only the last bar needs its own bpm.
          if (i + 1 < measures.length) {
            measureDurSec[i] = measureStartSec[i + 1] - measureStartSec[i];
          } else {
            const bpm = m?.TempoInBPM || 72;
            measureDurSec[i] = (m?.Duration?.realValue || 0.25) * 4 * 60 / bpm;
          }
        }
      } else {
        // Fallback path: cumulative sum of per-bar durations (each bar uses
        // its own bpm). Same algorithm as extractNotesFromOsmd above; kept
        // local so legacy callers still get tempo-correct timing.
        measureStartSec = new Array(measures.length).fill(0);
        measureDurSec = new Array(measures.length).fill(0);
        let prevBpm = 72;
        for (let i = 0; i < measures.length; i++) {
          const m = measures[i];
          const bpm = m?.TempoInBPM || prevBpm;
          measureDurSec[i] = (m?.Duration?.realValue || 0.25) * 4 * 60 / bpm;
          if (i > 0) measureStartSec[i] = measureStartSec[i - 1] + measureDurSec[i - 1];
          prevBpm = bpm;
        }
      }
      const expanded = [];
      let cumTime = 0;
      let prevMIdx = -1;
      for (const mIdx of order) {
        const measureNotes = byMeasure.get(mIdx) || [];
        const mStart = measureStartSec[mIdx] || 0;
        const isJump = prevMIdx >= 0 && mIdx !== prevMIdx + 1;
        for (let j = 0; j < measureNotes.length; j++) {
          const n = measureNotes[j];
          expanded.push({
            hand: n.hand,
            midi: n.midi,
            timeSec: cumTime + (n.timeSec - mStart),
            durSec: n.durSec,
            measureIdx: mIdx,
            inBarQuarters: n.inBarQuarters,
            cursorJump: (j === 0 && isJump) ? mIdx : null
          });
        }
        cumTime += measureDurSec[mIdx] || 0.5;
        prevMIdx = mIdx;
      }
      expanded.sort((a, b) => a.timeSec - b.timeSec || a.midi - b.midi);
      return expanded;
    }

    // ============================================================
    // Comprehensive load-time DIAG dump.
    //
    // Pipeline visibility at every layer of the file → notes chain:
    //
    //   MusicXML
    //     → parseScoreTimingFromXml() — raw XML model
    //     → buildMeasureTimingFromXml() — per-measure (start, dur) sec
    //     → extractNotesFromOsmd() — OSMD-iterator-driven note extract
    //     → mergeTiedNotes() — tie coalesce
    //     → fetchPlaybackOrder() — repeat / D.C. / volta unfold
    //     → expandNotesByPlaybackOrder() — final note timeline
    //     → buildSectionsFromDefs() — section windows
    //
    // Each transformation gets its own DIAG line so we can pinpoint
    // exactly where a note is dropped, mis-timed, or hand-mis-assigned.
    // ============================================================
    function dumpLoadDiagnostics(p) {
      const log = remoteLog;
      const song = p.song;
      const ext = p.extractRet?._diag || {};
      const scoreTiming = p.scoreTiming;
      const measures = p.measures;
      const expanded = p.expanded;
      const baseNotes = p.baseNotes;
      const measureStartSec = p.measureStartSec;
      const measureBpm = p.measureBpm;
      // Wrap each section so a throw in one block doesn't suppress the
      // ones that follow — we want the per-note + per-section dumps to
      // appear even when an upstream block throws.
      const safeSection = (label, fn) => {
        try { fn(); }
        catch (e) { log('[DIAG/' + label + '] EXCEPTION: ' + (e && e.message || e)); }
      };

      // ---------- 1. song-level summary ----------
      const tieReport = ext.tieReport || { merged: 0, samples: [] };
      safeSection('song', () => {
        const handCounts = expanded.reduce((c, n) => {
          c[n.hand] = (c[n.hand] || 0) + 1; return c;
        }, {});
        const midiRange = expanded.reduce((r, n) => {
          if (n.midi < r.lo) r.lo = n.midi;
          if (n.midi > r.hi) r.hi = n.midi;
          return r;
        }, { lo: 200, hi: 0 });
        const repeatDelta = p.order.length - measures.length;
        log('[DIAG/song] id=' + song.id +
          ' src=' + (song._isUser ? 'user' : 'bundled') +
          ' measures=' + measures.length +
          ' osmdSteps=' + ext.totalSteps +
          ' baseNotes=' + baseNotes.length +
          ' expanded=' + expanded.length +
          ' R=' + (handCounts.R || 0) +
          ' L=' + (handCounts.L || 0) +
          ' midi=' + midiRange.lo + '..' + midiRange.hi +
          ' totalSec=' + p.totalSec.toFixed(2) +
          ' bpm=' + (song.bpm || 0).toFixed(2) +
          ' bpmSrc=' + (scoreTiming?.leadingSource || 'osmd') +
          ' bpmRescaled=' + (song._bpmRescaled === true) +
          ' repeats=' + (repeatDelta > 0 ? '+' + repeatDelta : repeatDelta) +
          ' tied=' + tieReport.merged +
          ' skipped=' + (ext.skippedNotes || 0));
      });

      // ---------- 2. per-measure layout ----------
      // First 8 measures + every measure with a tempo change + last measure.
      safeSection('measure', () => {
        const tempoChanges = new Set();
        if (scoreTiming) {
          let prevQ = scoreTiming.leadingQuarterBpm;
          for (let i = 0; i < scoreTiming.measures.length; i++) {
            const evs = scoreTiming.measures[i].tempoEvents || [];
            for (const ev of evs) {
              if (Math.abs(ev.qBpm - prevQ) > 0.01) tempoChanges.add(i);
              prevQ = ev.qBpm;
            }
          }
        }
        const measureSamples = new Set();
        for (let i = 0; i < Math.min(8, measures.length); i++) measureSamples.add(i);
        tempoChanges.forEach((i) => measureSamples.add(i));
        if (measures.length > 0) measureSamples.add(measures.length - 1);
        const sortedMeasures = Array.from(measureSamples).sort((a, b) => a - b);
        // Pre-tally note counts per measure once: previous code did
        // `expanded.filter(n => n.measureIdx === i).length` inside the loop,
        // which is O(measures × notes) — for la Campanella that's
        // 168 × 3000 = 500k iterations on every song-load.
        const notesByMeasure = new Map();
        for (const n of expanded) {
          notesByMeasure.set(n.measureIdx, (notesByMeasure.get(n.measureIdx) || 0) + 1);
        }
        for (const i of sortedMeasures) {
          const sm = scoreTiming?.measures?.[i];
          const evs = sm?.tempoEvents?.length
            ? ' tempo=[' + sm.tempoEvents.map((e) => Number(e.qBpm).toFixed(1)).join(',') + ']'
            : '';
          const notesInM = notesByMeasure.get(i) || 0;
          log('[DIAG/measure] m=' + i +
            ' start=' + (measureStartSec[i] || 0).toFixed(3) + 's' +
            ' bpm=' + (measureBpm[i] || 0).toFixed(1) +
            (sm ? ' div=' + sm.divisions +
                  ' time=' + sm.timeSig.beats + '/' + sm.timeSig.beatType +
                  (sm.implicit ? ' impl' : '') +
                  ' nominalDiv=' + sm.durationDiv +
                  ' actualDiv=' + sm.actualDiv : '') +
            ' notes=' + notesInM +
            evs);
        }
      });

      // ---------- 3. note timeline (first 12 + last 4) ----------
      safeSection('note', () => {
        const fmtNote = (n, i) => 'idx=' + i +
          ' t=' + n.timeSec.toFixed(3) +
          ' dur=' + n.durSec.toFixed(3) +
          ' midi=' + n.midi +
          ' ' + n.hand +
          ' m=' + n.measureIdx +
          ' q=' + (n.inBarQuarters ?? 0).toFixed(2) +
          (n.cursorJump != null ? ' jump→m=' + n.cursorJump : '');
        const head = Math.min(12, expanded.length);
        for (let i = 0; i < head; i++) {
          log('[DIAG/note] ' + fmtNote(expanded[i], i));
        }
        if (expanded.length > head + 4) {
          log('[DIAG/note] ... (' + (expanded.length - head - 4) + ' notes elided) ...');
        }
        for (let i = Math.max(head, expanded.length - 4); i < expanded.length; i++) {
          log('[DIAG/note] ' + fmtNote(expanded[i], i));
        }
      });

      // ---------- 4. tie merge report ----------
      safeSection('tie', () => {
        if (!tieReport.samples || !tieReport.samples.length) return;
        for (const s of tieReport.samples) {
          log('[DIAG/tie] midi=' + s.midi + ' ' + s.hand +
            ' m=' + s.m +
            ' t=' + s.t0 +
            ' chain=' + s.chain +
            ' dur=' + s.durBefore + '->' + s.durAfter + 's');
        }
        if (tieReport.merged > tieReport.samples.length) {
          log('[DIAG/tie] ... (' + (tieReport.merged - tieReport.samples.length) +
            ' more ties merged, not shown)');
        }
      });

      // ---------- 5. sections ----------
      // expanded is already sorted by timeSec, so a single linear sweep with
      // a section cursor classifies every note in O(N + S) total — vs the
      // earlier per-section filter() (O(S × N)) and even the per-note
      // section scan (O(N × S)). Sections are also sorted by startSec by
      // construction in buildSectionsFromDefs.
      safeSection('section', () => {
      const sectionBuckets = song.sections.map(() => ({ count: 0, first: null, last: null }));
      let secIdx = 0;
      for (const n of expanded) {
        // Advance the section cursor past any sections this note has overshot
        // (sparse sections / boss tail can skip empty buckets in one step).
        while (secIdx < song.sections.length && n.timeSec >= song.sections[secIdx].endSec) {
          secIdx++;
        }
        if (secIdx >= song.sections.length) break;
        const sec = song.sections[secIdx];
        if (n.timeSec < sec.startSec) continue; // gap between sections
        const b = sectionBuckets[secIdx];
        b.count++;
        if (!b.first) b.first = n;
        b.last = n;
      }
      for (let i = 0; i < song.sections.length; i++) {
        const sec = song.sections[i];
        const b = sectionBuckets[i];
        log('[DIAG/section] i=' + i +
          ' id=' + sec.id +
          ' start=' + sec.startSec.toFixed(3) +
          ' end=' + sec.endSec.toFixed(3) +
          ' span=' + (sec.endSec - sec.startSec).toFixed(2) + 's' +
          ' notes=' + b.count +
          (b.first ? ' first{m=' + b.first.measureIdx +
            ' t=' + b.first.timeSec.toFixed(3) +
            ' midi=' + b.first.midi + '}' : ' (empty)') +
          (b.last && b.last !== b.first ? ' last{m=' + b.last.measureIdx +
            ' t=' + b.last.timeSec.toFixed(3) +
            ' midi=' + b.last.midi + '}' : '') +
          (sec.isBoss ? ' BOSS' : ''));
      }
      });  // safeSection('section')
    }

    async function loadCurrentScore() {
      // Data is loaded but the OSMD instance was nulled (right after a song switch).
      // Re-run initOsmd only to redraw the score; note/section extraction is unnecessary.
      if (currentSong._loaded) {
        if (!osmd) await initOsmd();
        return;
      }
      if (currentSong._loadingPromise) return currentSong._loadingPromise;
      // Capture `currentSong` so a rapid second `selectSong()` mid-load can't
      // make the IIFE write its results into the wrong song's record (would
      // null another in-flight song's _loadingPromise, allowing concurrent
      // duplicate loads).
      const song = currentSong;
      // Bail-out helper: a rapid `selectSong()` swap mid-load means the
      // global OSMD instance + measure data now belong to a different song.
      // Reading it past that point produces cross-song data corruption
      // (foreign repeat structure into our note timeline, foreign measures
      // into our cursor map). Returning false abandons the load gracefully.
      const stillCurrent = () => currentSong === song;
      song._loadingPromise = (async () => {
        await initOsmd();
        if (!stillCurrent()) return;

        // Parse the raw XML for the authoritative timing model: per-measure
        // tempo events (correctly normalized via beat-unit), time signatures,
        // divisions, and anacrusis. We use this for ALL timing decisions —
        // OSMD is consulted only for pitch/staff/cursor.
        let scoreTiming = null;
        try {
          let text = song._xmlText;
          if (!text && song.xmlUrl) {
            const res = await fetch(song.xmlUrl);
            if (!stillCurrent()) return;
            if (res.ok) text = await res.text();
          }
          if (text) {
            // Cache so fetchPlaybackOrder() reuses it instead of re-downloading
            // (Android Chrome was occasionally hanging on the second blob: fetch).
            song._xmlText = text;
            scoreTiming = parseScoreTimingFromXml(text);
          }
        } catch (_) { /* non-fatal — extractNotesFromOsmd will fall back */ }
        if (!stillCurrent()) return;
        const xmlMeasureTiming = buildMeasureTimingFromXml(scoreTiming);

        const extractRet = extractNotesFromOsmd(xmlMeasureTiming, scoreTiming);
        const baseNotes = extractRet.notes;
        const srcMeasureStartSec = extractRet.measureStartSec;
        const osmdMeasureBpm = extractRet.measureBpm;
        if (baseNotes.length === 0) throw new Error('No notes extracted from MusicXML');

        // BPM divergence flag — true when OSMD's reading of <metronome
        // beat-unit="eighth"> disagrees with the XML-canonical quarter BPM
        // (OSMD's known limitation). Used by renderSongPanel to show the
        // "✓" marker on the BPM hint, signaling that we corrected the score.
        song._bpmRescaled = false;
        if (scoreTiming && xmlMeasureTiming) {
          const osmdBpm0 = osmdMeasureBpm[0] || 72;
          const xmlBpm0 = scoreTiming.leadingQuarterBpm;
          song._bpmRescaled = Math.abs(osmdBpm0 / xmlBpm0 - 1) > 0.05;
        }

        const measures = osmd.Sheet?.SourceMeasures || [];

        // Parse the raw XML to discover the actual playback order. Reads the
        // pre-decoded xmlText cached on the song record (avoids a re-fetch
        // that could hang on blob: URLs of just-imported user songs).
        let order;
        try {
          order = await fetchPlaybackOrder(song);
          if (!stillCurrent()) return;
          if (!order.length) order = measures.map((_, i) => i);
        } catch (e) {
          console.warn('Playback order parse failed, falling back to linear', e);
          order = measures.map((_, i) => i);
        }
        const expanded = expandNotesByPlaybackOrder(baseNotes, order, measures, srcMeasureStartSec);

        let totalSec = 0;
        for (const n of expanded) {
          const end = n.timeSec + n.durSec;
          if (end > totalSec) totalSec = end;
        }

        song.notes = expanded;
        song.totalSec = totalSec;
        song.playbackOrder = order;
        // Pass the per-source-measure start times so sections begin at the
        // measure boundary (preserving any leading rest visually) instead of
        // cropping to the first note's onset.
        song.sections = buildSectionsFromDefs(
          expanded, totalSec, song.sectionDefs, srcMeasureStartSec
        );
        // Capture the leading tempo so the count-in clicks match the song.
        // Prefer the XML-parsed quarter BPM (authoritative — handles
        // <metronome beat-unit="eighth"> correctly). Fall back to OSMD's
        // per-measure TempoInBPM when XML parsing didn't yield a value.
        let songBpm = 0;
        if (scoreTiming && scoreTiming.leadingQuarterBpm) {
          songBpm = scoreTiming.leadingQuarterBpm;
        }
        if (!songBpm) {
          for (const m of measures) {
            const v = m && m.TempoInBPM;
            if (v && v > 0) { songBpm = v; break; }
          }
        }
        song.bpm = songBpm || 72;
        song._loaded = true;
        console.log('[' + song.id + '] base=' + baseNotes.length
          + ' expanded=' + expanded.length
          + ' measures=' + measures.length
          + ' playbackOrder=' + order.length
          + ' total=' + totalSec.toFixed(1) + 's');

        // ============================================================
        // === Comprehensive load-time DIAG dump ======================
        // ============================================================
        // Verbose by design — only fires once per song-load. Use to
        // verify file → notes pipeline at every stage. Levels:
        //   [DIAG/song]    one-line song-level summary
        //   [DIAG/measure] per-measure layout (first 8 + tempo changes)
        //   [DIAG/cursor]  per-OSMD-step trace (first 20 + measure boundaries)
        //   [DIAG/note]    first 12 + last 4 notes with full detail
        //   [DIAG/tie]     tie-merge events (if any)
        //   [DIAG/section] section construction details
        if (REMOTE_LOG_ENABLED) {
          dumpLoadDiagnostics({
            song,
            scoreTiming, xmlMeasureTiming,
            extractRet,
            baseNotes, expanded,
            measures, order, totalSec,
            measureStartSec: srcMeasureStartSec,
            measureBpm: osmdMeasureBpm,
          });
        }
        // Drop the cached xmlText now that notes/sections/cursor tables are
        // built. For user songs the canonical text still lives on the
        // IndexedDB record (record.xmlText) and the blob URL resolves;
        // dropping the per-song JS-heap copy avoids piling up >5MB strings
        // when several large user songs sit in SONGS at once.
        song._xmlText = null;
      })();
      try { await song._loadingPromise; }
      finally { song._loadingPromise = null; }
    }

    // Manual scroll to keep the OSMD cursor visible inside its container.
    // Throttled to once per 100ms — for rapid passages (e.g. Turkish March 16th-note
    // runs) doing scroll math + reflow per onset bogs down the main thread.
    let _lastOsmdScrollMs = 0;

    function osmdScrollToCursor() {
      const c = DOM.osmdContainer;
      if (!c || !osmd || !osmd.cursor || !osmd.cursor.cursorElement) return;
      const now = performance.now();
      if (now - _lastOsmdScrollMs < 100) return;
      _lastOsmdScrollMs = now;
      const cTop = osmd.cursor.cursorElement.offsetTop;
      const cH = osmd.cursor.cursorElement.offsetHeight || 30;
      const viewH = c.clientHeight;
      if (cTop < c.scrollTop || cTop + cH > c.scrollTop + viewH) {
        c.scrollTop = Math.max(0, cTop - viewH / 3);
      }
    }

    function osmdResetToStart() {
      if (!osmd || !osmd.cursor) return;
      osmd.cursor.reset();
      DOM.osmdContainer.scrollTop = 0;
    }


    // === Cursor positioning by OSMD iterator's native state ===
    // Each note carries (measureIdx, inBarQuarters); OSMD's iterator
    // exposes the same coordinates via CurrentMeasureIndex +
    // currentTimeStamp. We walk the iterator until they match — no
    // parallel step counter, no drift on partial measures or grace-note
    // throws.
    //
    // Backward seeks always reset() and walk forward; cursor.previous()
    // in OSMD 1.9.x leaves the visual cursor at the previous position
    // while iterator state moves backward (ghost cursor).
    function setOsmdCursorToNote(note) {
      if (!osmd || !osmd.cursor || !note) return;
      const it = osmd.cursor.iterator;
      const sm = osmd.Sheet?.SourceMeasures;
      if (!sm) return;
      const targetM = note.measureIdx | 0;
      const targetQ = +note.inBarQuarters || 0;
      const eps = 1e-6;

      const measureStartWhole = (m) => sm[m]?.AbsoluteTimestamp?.realValue || 0;
      const inBarQ = () => Math.max(0,
        (it.currentTimeStamp.realValue - measureStartWhole(it.CurrentMeasureIndex)) * 4);

      // Already at target? Skip.
      const startM = it.CurrentMeasureIndex;
      if (!it.endReached && startM === targetM && Math.abs(inBarQ() - targetQ) < eps) return;

      // Past target → reset; otherwise we'd walk forever forward.
      if (it.endReached
        || startM > targetM
        || (startM === targetM && inBarQ() > targetQ + eps)) {
        try { osmd.cursor.reset(); } catch (_) {}
      }

      // Walk forward until iterator's (measureIdx, inBarQuarters) reaches the
      // target. Bounded loop in case cursor.next() throws repeatedly without
      // advancing — without the cap we'd hang.
      let safety = 20000;
      while (!it.endReached && safety-- > 0) {
        const m = it.CurrentMeasureIndex;
        if (m > targetM) break;
        if (m === targetM && inBarQ() >= targetQ - eps) break;
        try { osmd.cursor.next(); } catch (_) { /* grace-note throws — iterator still advances */ }
      }
    }

    // ========================================
    // Practice state + tunable constants
    // ========================================
    // Count-in is aligned with the lane lookahead so the first note literally
    // enters from the top of the lane on beat 1 and reaches the hit line on "GO!".
    // Both are recomputed per section in recomputePracticeTimings() so the count-in
    // beats follow the actual song tempo (a 72 BPM piece counts in 833 ms/beat,
    // not a generic 1 s/beat). Initial values cover the case where a section is
    // started before any score has loaded — they get overwritten immediately.
    let COUNT_IN_MS = 4000;            // pre-roll before the first note (4 beats)
    let LANE_LOOKAHEAD_MS = 4000;      // how far ahead notes appear in the lane

    // Song's quarter-note duration at the kid's chosen tempo. Falls back to a
    // gentle 72 BPM @ 60% if the score hasn't yielded a tempo yet.
    // practiceBeatMs / count-in derivation — Phase 0b: delegated to @piano/core.
    function practiceBeatMs() {
      return PianoCore.practiceBeatMs(
        (currentSong && currentSong.bpm) || 72,
        practice.tempoPct || 100
      );
    }
    function recomputePracticeTimings() {
      const timings = PianoCore.computePracticeTimings(practiceBeatMs());
      COUNT_IN_MS = timings.countInMs;
      LANE_LOOKAHEAD_MS = timings.laneLookaheadMs;
      // _laneOpts is a hot-path singleton — refresh in lockstep so the first
      // frame's countdown + descent rate match the new section's tempo.
      _laneOpts.laneLookaheadMs = LANE_LOOKAHEAD_MS;
      _laneOpts.countInMs = COUNT_IN_MS;
    }
    // Asymmetric hit windows: early presses are punished much harder than late
    // ones. Pedagogical reason — kids should learn to *wait for the beat*, not
    // anticipate it; reaction-lag is also natural and partly compensates for
    // audio output latency. Symmetric windows let kids develop a "rush ahead"
    // habit that's hard to unlearn.
    // Hit-window + duration-tolerance constants — Phase 0b.3: re-exported
    // from @piano/core (same values, single source of truth).
    const HIT_WINDOW_EARLY_MS = PianoCore.HIT_WINDOW_EARLY_MS;
    const HIT_WINDOW_MS = PianoCore.HIT_WINDOW_MS;
    const PERFECT_MS = PianoCore.PERFECT_MS;
    const CHORD_MATE_TOLERANCE_MS = PianoCore.CHORD_MATE_TOLERANCE_MS;
    const DURATION_MIN_TOL_MS = PianoCore.DURATION_MIN_TOL_MS;
    const DURATION_TOL_FRACTION = PianoCore.DURATION_TOL_FRACTION;
    // Audio output latency compensation. Speaker buffer delay means the kid hears
    // the metronome ~30-100ms after Tone schedules it, so a press timed to the
    // audible beat registers as "late" without compensation. We try to read
    // AudioContext.outputLatency at session start; this default covers the case
    // where the browser returns 0 (Firefox / older Safari) or unreliable values.
    const DEFAULT_AUDIO_OFFSET_MS = 40;
    // Mic-only safety nets — empirically tuned for iPad acoustic-piano practice.
    // ONSET_HYSTERESIS_FRAMES = 1 effectively disables the hysteresis (single-frame
    // onsets allowed). Bumping to 2 helps reject one-frame spectral spikes but also
    // drops short staccato notes in practice.
    const ONSET_HYSTERESIS_FRAMES = 1;
    const PITCH_MEDIAN_FRAMES = 5;      // ring buffer length for octave-error correction

    const practice = {
      enabled: false,
      sectionIdx: 0,
      tempoPct: 60,                    // 60 / 75 / 90 / 100  (slower → bigger speedFactor)
      // 'guided' = score waits for the kid to play each note. No timeouts, no
      //            auto-playback. Wrong notes get a gentle nudge, never penalty.
      // 'rhythm' = traditional rhythm-game mode that follows tempo strictly.
      mode: 'guided',
      ghostOn: false,
      metronomeOn: false,
      // Single audio-clock reference — locks visuals to Tone.js scheduled events.
      // elapsed_ms = (Tone.now() - startAudioTime) * 1000
      startAudioTime: 0,
      sectionNotes: [],                // [{hand, midi, timeMs, durMs, hit, missed}]
      currentNoteIdx: 0,
      hits: 0,
      misses: 0,
      timingScoreSum: 0,
      // Note-length scoring: only filled in rhythm mode. In guided mode the cursor
      // freezes on the current note so there's no audio clock to compare against.
      durationScoreSum: 0,
      durationScoredCount: 0,
      pendingHolds: new Map(),
      sectionCombo: 0,
      sectionBestCombo: 0,
      // Hand filter. 'R' = right only, 'L' = left only, null = both hands.
      // Filtered notes are pre-flagged hit at section start so the cursor auto-skips them.
      handFilter: null,
      // Subtracted from practiceRealElapsedMs so a press timed to the audible
      // beat scores PERFECT. Set in startPracticeSection from
      // AudioContext.outputLatency, or from the user's saved override
      // (prefs.audioOffsetMs) if they've adjusted the slider.
      audioOffsetMs: prefs.audioOffsetMs != null ? prefs.audioOffsetMs : DEFAULT_AUDIO_OFFSET_MS,
      progress: null,
      _completing: false,
      _lastProgUpdate: 0
    };

    // ========================================
    // Section banner
    // ========================================
    function showSectionBanner(sec) {
      if (!DOM.sectionBanner) return;
      DOM.sectionBanner.textContent = (sec.isBoss ? '👑 ' : '') + t(sec.nameKey);
      DOM.sectionBanner.classList.remove('show');
      void DOM.sectionBanner.offsetWidth;   // restart animation
      DOM.sectionBanner.classList.add('show');
    }

    // ========================================
    // Screen Wake Lock — keep the device awake during practice. Browsers may release
    // the lock when the page is hidden or backgrounded, so we re-acquire on visibility
    // change. Steam Deck / iPad Safari 16.4+ / Chrome / Edge all support this.
    // (Note: this only prevents *screen* sleep. Full system suspend still depends on
    //  the OS's power-management settings.)
    // ========================================
    let wakeLockSentinel = null;

    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) return;
      if (wakeLockSentinel) return;
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
        console.log('[WakeLock] acquired');
      } catch (e) {
        console.warn('[WakeLock] request failed:', e.message);
      }
    }

    function releaseWakeLock() {
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
        console.log('[WakeLock] released');
      }
    }

    // Single source of truth for the port-message handler. attachMidiPort and
    // verifyMidiAlive both use this so re-binding after a suspend produces
    // exactly the same routing.
    function onMidiMessageHandler(e) {
      if (e.data && e.data.length >= 2) {
        dispatchMidiMessage(e.data[0], e.data[1], e.data.length > 2 ? e.data[2] : 0);
      }
    }

    // Verify the previously-attached MIDI port is still alive after the page
    // came back from background. iOS WMB silently kills the onmidimessage
    // handler when the page is suspended; the port object stays around but
    // events no longer flow. Returns true if the port is still connected and
    // the handler has been re-bound; false if it's gone (caller should rescan).
    async function verifyMidiAlive() {
      if (!midiInput.enabled || !midiInput.port || !_midiAccess) return false;
      // BLE-MIDI installs a synthetic `midiInput.port` (just a `{ name }`
      // marker) that is NOT a member of `_midiAccess.inputs`. Looking it up
      // in the WebMIDI port list would always miss → detach the live BLE
      // session as collateral on every visibility-resume. Health for BLE is
      // tracked by the GATT `gattserverdisconnected` listener in connectBleMidi.
      if (bleMidi && bleMidi.connected) return true;
      const ports = gatherMidiInputs(_midiAccess);
      const stillThere = ports.find(p => p === midiInput.port && p.state === 'connected');
      if (!stillThere) {
        try { detachMidiPort(midiInput.port); } catch (e) {}
        return false;
      }
      // Re-bind unconditionally. Cheap; idempotent on a healthy port; required on a suspended one.
      midiInput.port.onmidimessage = onMidiMessageHandler;
      return true;
    }

    // Reconnect the audio graph after a fresh AudioContext: rebuild gain +
    // both analysers, re-wire the mic source if it's still alive. Used by
    // visibilitychange recovery and devicechange (AirPods plug/unplug).
    function rebuildAudioGraph(prevMicStream) {
      gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(state.micSuspended ? 0 : 1.0, audioCtx.currentTime);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = CONFIG.FFT_SIZE;
      analyser.smoothingTimeConstant = CONFIG.SMOOTHING;
      gainNode.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      freqArray = new Float32Array(analyser.fftSize);
      onsetAnalyser = audioCtx.createAnalyser();
      onsetAnalyser.fftSize = CONFIG.ONSET_FFT_SIZE;
      onsetAnalyser.smoothingTimeConstant = CONFIG.ONSET_SMOOTHING;
      gainNode.connect(onsetAnalyser);
      onsetDataArray = new Uint8Array(onsetAnalyser.frequencyBinCount);
      if (prevMicStream && prevMicStream.active) {
        try {
          micSourceNode = audioCtx.createMediaStreamSource(prevMicStream);
          micSourceNode.connect(gainNode);
        } catch (e) { /* stream may have died; user can re-permit */ }
      }
      // Reset per-frame onset state — old prevSpectrum was sized to the old context.
      state.prevSpectrum = null;
      state.spectralFluxHistory = [];
    }

    // WebKit Bugs 237878 / 261554 (open as of 2025): suspend/resume alone does
    // NOT recover audio after iOS backgrounds the page — the only reliable fix
    // is closing the context and creating a fresh one. We keep the same mic
    // MediaStream (it survives backgrounding) and re-wire it.
    let _audioRecovering = null;
    async function recoverAudioContext() {
      if (!audioCtx) return;
      // Re-entrancy guard: a devicechange + visibilitychange firing in the
      // same tick would otherwise both close the context and rebuild the
      // graph in parallel, causing the second invocation to close the new
      // context the first one just installed.
      if (_audioRecovering) return _audioRecovering;
      _audioRecovering = (async () => {
        try {
          const prevStream = micStream;
          // Disconnect old graph nodes before close — on iOS WKWebView,
          // native MediaStreamSource refs can survive a closed context if
          // not explicitly disconnected.
          try { gainNode?.disconnect(); } catch (_) {}
          try { micSourceNode?.disconnect(); } catch (_) {}
          try { analyser?.disconnect(); } catch (_) {}
          try { onsetAnalyser?.disconnect(); } catch (_) {}
          try { await audioCtx.close(); } catch (_) {}
          audioCtx = createAudioContext();
          if (audioCtx.state === 'suspended') {
            try { await audioCtx.resume(); } catch (_) {}
          }
          rebuildAudioGraph(prevStream);
          // We deliberately do NOT touch Tone.js here. A previous attempt
          // to call `Tone.setContext(audioCtx)` and null tonePiano /
          // toneMetronome looked clean, but in Tone 14.8.x the swap leaves
          // `Tone.context.currentTime` reading the *page-lifetime* clock
          // rather than the new AudioContext's freshly-created clock.
          // Once the user starts a new practice section after recovery,
          // `practice.startAudioTime = Tone.now()` resolves to a small
          // lead, but every subsequent `Tone.context.currentTime` read in
          // `practiceRealElapsedMs` returns 30–60 s — elapsed jumps that
          // far ahead and listen mode auto-fires hundreds of notes at
          // section start.
          // iOS WKWebView contract: post-background the audio engine is
          // dead until the page reloads. Stop the active section so the
          // lane stops scrolling against a stale clock; the kid still
          // sees the visual pipeline (mic + canvas) come back to life.
          if (practice.enabled) {
            practice.enabled = false;
            try { stopPracticeAudio(); } catch (_) {}
          }
          console.log('[AUDIO] context recreated @' + audioCtx.sampleRate + 'Hz');
        } finally {
          _audioRecovering = null;
        }
      })();
      return _audioRecovering;
    }

    // AirPods / headphone unplug switches sample rate (24/48 flip). The cleanest
    // recovery is to recreate the context — same as visibility recovery.
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        if (!state.running || !audioCtx) return;
        // Debounce: devicechange fires multiple times for one event.
        clearTimeout(window._audioDeviceChangeTimer);
        window._audioDeviceChangeTimer = setTimeout(() => {
          recoverAudioContext().catch(e => console.warn('[AUDIO] devicechange recovery:', e.message));
        }, 250);
      });
    }

    // Browsers drop the wake lock when the tab is hidden, suspend AudioContext,
    // and (on iOS WMB) silently disable MIDI port handlers. On every resume we
    // refresh all three so the kid can pick up exactly where they left off
    // without seeing a phantom "connection error".
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return;
      if (state.running) requestWakeLock();
      if (audioCtx) {
        // iOS suspend ≠ resumable. If state stayed 'running' through the bg
        // round-trip we can keep going; otherwise full recreate.
        if (audioCtx.state === 'suspended') {
          try { await audioCtx.resume(); } catch (e) {}
          // If still suspended after resume(), the context is dead — recreate.
          if (audioCtx.state === 'suspended') {
            await recoverAudioContext();
          }
        }
      }
      if (!state.running || !navigator.requestMIDIAccess) return;
      if (midiInput.enabled) {
        // We *think* MIDI is connected — verify the port still responds.
        const ok = await verifyMidiAlive();
        if (ok) return;
      }
      // No MIDI / dead port → rescan silently. Auto-rescan poller keeps trying
      // if this attempt fails. The user sees nothing unless they explicitly tap 🔄.
      rescanMidi(true).catch(() => {});
    });

    // ========================================
    // Input layer — Web MIDI (preferred) + microphone fallback.
    // Both sources funnel into matchNoteOnset(midi, isExact). When a MIDI keyboard is
    // connected, mic input is suppressed automatically (single source of truth).
    // ========================================
    const midiInput = {
      enabled: false,           // true while a MIDI input port is connected
      port: null,
      _accessRequested: false,
      // Set when the platform is known to never expose Web MIDI (iOS Safari /
      // any iPadOS browser). Drives a friendlier hint in the UI.
      platformBlocked: false
    };

    // Single point of MIDI message dispatch — called from Web MIDI port handler
    // (above) and from the BLE-MIDI parser. Updates lastEventTime so the loop's
    // mic-vs-MIDI arbitration knows MIDI is live.
    //
    // Android BLE stack occasionally redelivers the same packet, causing the
    // same note-on to arrive twice within a few ms. That makes the practice
    // cursor advance twice for one keypress and the score get out of sync.
    // Drop identical note-ons within 30ms — well below human-playable speed.
    let _lastMidiNoteOnKey = -1;
    let _lastMidiNoteOnTime = 0;
    function dispatchMidiMessage(status, a, b) {
      const cmd = status & 0xF0;
      const now = performance.now();
      if (cmd === 0x90 && b > 0) {
        const key = (a << 8) | b;
        if (key === _lastMidiNoteOnKey && now - _lastMidiNoteOnTime < 30) return;
        _lastMidiNoteOnKey = key;
        _lastMidiNoteOnTime = now;
      }
      midiInput.lastEventTime = now;
      if (cmd === 0x90 && b > 0) {
        pulseMidiBadge();
        onMidiNoteOn(a, b);
        if (practice.enabled) matchNoteOnset(a, true);
      } else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) {
        onMidiNoteOff(a);
      } else if (cmd === 0xB0) {
        onMidiCC(a, b);
      }
    }

    let _midiBadgePulseTimer = 0;
    function pulseMidiBadge() {
      if (!DOM.midiBadge || !DOM.midiBadge.classList.contains('visible')) return;
      DOM.midiBadge.classList.add('pulse');
      clearTimeout(_midiBadgePulseTimer);
      _midiBadgePulseTimer = setTimeout(() => DOM.midiBadge.classList.remove('pulse'), 140);
    }

    function refreshMidiBadge() {
      if (!DOM.midiBadge) return;
      if (midiInput.enabled && midiInput.port?.name) {
        DOM.midiBadge.textContent = '🎹 ' + midiInput.port.name;
        DOM.midiBadge.classList.add('visible');
      } else {
        DOM.midiBadge.classList.remove('visible');
        DOM.midiBadge.classList.remove('pulse');
      }
    }

    // iOS Safari (and every other browser on iPadOS / iOS — they all use WebKit)
    // does not implement the Web MIDI API at all. WebKit Bug 107250 is unresolved
    // and Apple has stated it is not on the roadmap. Detect this so we can show
    // a useful hint rather than silently falling back to mic.
    // Cached — UA never changes within a session, no need to re-regex per call.
    const _isAppleMobile = (() => {
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
      return isIOS || isIPadOS;
    })();
    function isAppleMobile() { return _isAppleMobile; }

    function setInputIndicator() {
      // v13: Toggle a body class so CSS can reserve bottom space for the
      // virtual keyboard (lifts #stageLabel, #noteDisplay, #debugOverlay).
      document.body.classList.toggle('midi-on', !!midiInput.enabled);
      if (typeof refreshMidiBadge === 'function') refreshMidiBadge();
      if (!DOM.ptbInput) return;
      // Pill is emoji-only on every layout — saves topbar width in the
      // narrow phone case + frees horizontal room for the centered section
      // name on iPad. Mode + device name stay accessible via title (long-press
      // / hover) and aria-label (screen readers).
      if (midiInput.enabled) {
        DOM.ptbInput.textContent = '🎹';
        DOM.ptbInput.classList.add('midi');
        DOM.ptbInput.title = t('tipMidiKeyboardFmt', { v: midiInput.port?.name || 'unknown' });
        DOM.ptbInput.setAttribute('aria-label', DOM.ptbInput.title);
      } else {
        DOM.ptbInput.textContent = '🎙️';
        DOM.ptbInput.classList.remove('midi');
        DOM.ptbInput.title = midiInput.platformBlocked ? t('tipIosMidiBlocked') : t('tipMicMode');
        DOM.ptbInput.setAttribute('aria-label', DOM.ptbInput.title);
      }
    }

    // Linux distros (Steam Deck included) expose a "Midi Through Port-0" by default
    // that has no physical keyboard attached. macOS has "IAC Driver" and "rtpmidi"
    // can show up too. Auto-connecting to these makes the UI claim MIDI is active
    // while no events ever fire — so we filter them out.
    function isVirtualMidiPort(port) {
      const name = (port.name || '').toLowerCase();
      return !name
        || name.includes('through')
        || name.includes('loop')
        || name.includes('iac driver')
        || name.includes('rtpmidi');
    }

    // Returns true if the port was successfully attached, false if it was skipped
    // (virtual/system port). Callers can use the return to decide whether to keep
    // searching the port list.
    function attachMidiPort(port) {
      if (midiInput.port === port) return true;
      if (isVirtualMidiPort(port)) {
        console.log('[MIDI] skip virtual/system port: ' + port.name);
        return false;
      }
      const wasMidiOn = midiInput.enabled;
      if (midiInput.port) midiInput.port.onmidimessage = null;
      midiInput.port = port;
      midiInput.enabled = true;
      midiInput.lastEventTime = 0;
      // v13: MIDI is the new authoritative source — drop the mic so the
      // privacy LED goes off and YIN/AGC/onset stop chewing CPU.
      if (!wasMidiOn && audioCtx && !state.micSuspended) {
        suspendMic();
      }
      port.onmidimessage = onMidiMessageHandler;
      setInputIndicator();
      if (typeof refreshIntroHint === 'function') refreshIntroHint();
      DOM.micMeter?.classList.remove('visible');
      stopMidiAutoRescan();
      showHitChip('good', t('midiConnectedFmt', { v: port.name || 'MIDI' }));
      console.log('[MIDI] connected: ' + port.name);
      return true;
    }

    function detachMidiPort(port) {
      if (midiInput.port !== port) return;
      port.onmidimessage = null;
      midiInput.port = null;
      midiInput.enabled = false;
      setInputIndicator();
      console.log('[MIDI] disconnected');
      // v13: Bring the mic back on a deliberate detach so the user can
      // keep playing acoustically without restarting the app.
      if (audioCtx && state.micSuspended) {
        resumeMic();
      }
      // Restart silent polling so a hot-replug picks up automatically. This
      // handles "browser sees keyboard but app dropped it" — the user doesn't
      // need to know what happened, the next 2.5 s tick reconnects.
      if (state.micPermissionFailed || state.micIntentionallySkipped) {
        startMidiAutoRescan();
      }
    }

    async function initWebMIDI() {
      if (midiInput._accessRequested) return;
      midiInput._accessRequested = true;
      if (!navigator.requestMIDIAccess) {
        if (isAppleMobile()) {
          midiInput.platformBlocked = true;
          console.log('[MIDI] iOS/iPadOS detected — Web MIDI is unavailable on Safari/WebKit. '
            + 'Use a desktop browser, Steam Deck, or the "Web MIDI Browser" iOS app for BLE-MIDI.');
        } else {
          console.log('[MIDI] Web MIDI API not available in this browser');
        }
        setInputIndicator();
        return;
      }
      try {
        const access = await ensureMidiAccess();
        const allPorts = gatherMidiInputs(access);
        console.log('[MIDI] available input ports: ' + allPorts.length);
        for (const p of allPorts) {
          console.log('[MIDI]   - "' + p.name + '" mfg="' + (p.manufacturer || '') + '"'
            + ' state=' + p.state + ' connection=' + p.connection);
        }
        for (const port of allPorts) {
          if (port.state === 'connected' && attachMidiPort(port)) break;
        }
      } catch (e) {
        console.warn('[MIDI] requestMIDIAccess failed:', e.message);
      }
    }

    // MIDI rescan — two-stage connection attempt:
    // (1) connect via the normal filter; (2) if that fails, force-connect ignoring the virtual filter.
    // silent=true skips UI updates on failure (used by auto-retry).
    // Cached MIDIAccess. Per spec the inputs collection updates live with
    // onstatechange events, so we only need to request once and re-iterate
    // for rescans. Re-requesting bypasses cached permission on some polyfills
    // and may also fail outside the original user gesture.
    let _midiAccess = null;

    // Force=true drops the cache and re-requests. Used by the explicit user
    // rescan path so a stale MIDIAccess (Web MIDI Browser / sleeping iPad) can
    // recover without requiring an app restart.
    async function ensureMidiAccess(force) {
      if (force && _midiAccess) {
        // Drop the stale MIDIAccess's listener BEFORE losing the reference,
        // so the old object can't keep firing into our handler after a
        // forced rescan (Web MIDI Browser keeps the dead access alive).
        try { _midiAccess.onstatechange = null; } catch (_) {}
        _midiAccess = null;
      }
      if (_midiAccess) return _midiAccess;
      // Try sysex:true first (Web MIDI Browser exposes BLE-MIDI only with
      // sysex granted). Fall back to sysex:false on rejection. Surface both
      // failure reasons so debugging is possible.
      let sysexErr = null;
      try { _midiAccess = await navigator.requestMIDIAccess({ sysex: true }); }
      catch (e) {
        sysexErr = e;
        try { _midiAccess = await navigator.requestMIDIAccess({ sysex: false }); }
        catch (e2) {
          const reason = '[sysex:true] ' + (sysexErr.name || 'Err') + ': ' + sysexErr.message
            + ' / [sysex:false] ' + (e2.name || 'Err') + ': ' + e2.message;
          throw new Error(reason);
        }
      }
      _midiAccess.onstatechange = (e) => {
        if (e.port.type !== 'input') return;
        console.log('[MIDI] state change: "' + e.port.name + '" → ' + e.port.state);
        if (e.port.state === 'connected' && !midiInput.enabled) attachMidiPort(e.port);
        else if (e.port.state === 'disconnected') detachMidiPort(e.port);
      };
      return _midiAccess;
    }

    // Defensive iteration of access.inputs: handles both Map (per spec) and
    // plain-object polyfill shapes.
    function gatherMidiInputs(access) {
      const out = [];
      const inputs = access && access.inputs;
      if (!inputs) return out;
      if (typeof inputs.values === 'function') {
        for (const p of inputs.values()) out.push(p);
      } else if (typeof inputs.forEach === 'function') {
        inputs.forEach((p) => out.push(p));
      } else if (typeof inputs === 'object') {
        for (const k in inputs) {
          const p = inputs[k];
          if (p && (p.type === 'input' || p.type == null)) out.push(p);
        }
      }
      return out;
    }

    async function rescanMidi(silent) {
      if (!navigator.requestMIDIAccess) {
        if (!silent) showIntroDiag(() => setIntroHintDiagnostic(t('diagWebMidiUnsupported')));
        return false;
      }
      // A user-initiated rescan (silent=false) drops the cached MIDIAccess so
      // a stale enumeration (e.g. WMB or post-sleep) can be refreshed.
      if (!silent) _midiAccess = null;
      try {
        const access = await ensureMidiAccess();
        const ports = gatherMidiInputs(access);
        const portInfo = ports.map(p => (p.name || 'unnamed') + '/' + p.state).join(', ');
        console.log('[MIDI] rescan ports: [' + portInfo + ']');

        if (ports.length === 0) {
          if (!silent) {
            // Web MIDI Browser quirk: devices already paired at startup are often
            // invisible — re-pairing usually surfaces them.
            showIntroDiag(() => {
              const hint = t(isAppleMobile() ? 'diagWmbHint' : 'diagConnectHint');
              setIntroHintDiagnostic(t('diagNoMidiPort'), hint);
            });
          }
          return false;
        }
        for (const port of ports) {
          if (port.state === 'connected' && !midiInput.enabled && attachMidiPort(port)) return true;
        }
        if (!silent) {
          showIntroDiag(() => setIntroHintDiagnostic(t('diagDetectedFmt', { v: portInfo }), t('diagCouldNotConnect')));
        }
        return false;
      } catch (e) {
        console.warn('[MIDI] rescan failed:', e.message);
        if (!silent) showIntroDiag(() => setIntroHintDiagnostic(t('diagMidiError'), e.message));
        return false;
      }
    }

    // Show diagnostic info on introHint (sticky). Cleared by MIDI connect or refreshIntroHint.
    // ユーザがあとでボタンで一度消した場合は、新しいセッション(returnToTitle)
    // か再スキャンの明示的な操作までは再表示しない。
    function setIntroHintDiagnostic(line1, line2) {
      if (!DOM.introHint) return;
      const sub = line2 ? '<br><span style="font-size:.78rem;color:rgba(255,255,255,.55);letter-spacing:.04em">' + line2 + '</span>' : '';
      DOM.introHint.innerHTML = line1 + sub;
      DOM.introHint.classList.add('visible');
    }
    // Each callsite that produces a diagnostic with localized strings should
    // wrap its call in showIntroDiag(() => setIntroHintDiagnostic(t(...), ...))
    // so a language toggle can re-run the same closure with fresh translations.
    function showIntroDiag(thunk) {
      state.lastIntroDiag = thunk;
      thunk();
    }
    function clearIntroDiagCache() { state.lastIntroDiag = null; }

    // Polling: when MIDI is required but not connected, detect when the user
    // has paired in the WMB UI in the background and returns to the page.
    let _midiRescanInterval = 0;
    function startMidiAutoRescan() {
      if (_midiRescanInterval) return;
      _midiRescanInterval = setInterval(() => {
        if (midiInput.enabled || !navigator.requestMIDIAccess) {
          stopMidiAutoRescan();
          return;
        }
        rescanMidi(true).then((ok) => { if (ok) stopMidiAutoRescan(); });
      }, 2500);
    }
    function stopMidiAutoRescan() {
      if (_midiRescanInterval) { clearInterval(_midiRescanInterval); _midiRescanInterval = 0; }
    }

    // ========================================
    // BLE-MIDI via Web Bluetooth
    //   Android Chrome's Web MIDI exposes USB devices only — Bluetooth keyboards
    //   never appear there. Web Bluetooth IS available on Android Chrome though,
    //   so we connect over BLE-MIDI directly using the standard service UUID.
    //   Same path also helps desktop Chrome users whose BLE-MIDI device isn't
    //   surfaced via Web MIDI.
    // ========================================
    const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
    const BLE_MIDI_CHAR    = '7772e5db-3868-4112-a1a9-f2669d106bf3';

    const bleMidi = {
      device: null,
      characteristic: null,
      connected: false
    };

    // Parse BLE-MIDI 1.0 packet. The packet starts with a header byte (high bit set,
    // top 6 bits of timestamp), then groups of (timestamp, status?, data...). For our
    // use we ignore timestamps and extract MIDI messages of types we care about.
    function parseBleMidiPacket(buf) {
      const data = new Uint8Array(buf);
      if (data.length < 3) return;
      let runningStatus = 0;
      // Skip header byte at index 0; first timestamp at index 1.
      for (let i = 1; i < data.length; ) {
        // Each MIDI event in a BLE-MIDI packet is preceded by a timestamp byte
        // (high bit set). Running-status events may follow without a new timestamp.
        if (data[i] & 0x80) {
          // Could be timestamp or status. Per spec, in a multi-event packet a
          // timestamp byte (followed by status) precedes each event. Skip it.
          i++;
          if (i >= data.length) break;
          // Now data[i] should be a status or running data
          if (data[i] & 0x80) {
            runningStatus = data[i];
            i++;
          }
        }
        if (runningStatus === 0) { i++; continue; }
        const cmd = runningStatus & 0xF0;
        // 2-data-byte messages
        if (cmd === 0x80 || cmd === 0x90 || cmd === 0xB0 || cmd === 0xA0 || cmd === 0xE0) {
          if (i + 1 >= data.length) break;
          const a = data[i] & 0x7F;
          const b = data[i + 1] & 0x7F;
          dispatchMidiMessage(runningStatus, a, b);
          i += 2;
        } else if (cmd === 0xC0 || cmd === 0xD0) {
          if (i >= data.length) break;
          i++;
        } else if (runningStatus === 0xF0) {
          while (i < data.length && data[i] !== 0xF7) i++;
          if (i < data.length) i++;
          runningStatus = 0;
        } else {
          i++;
        }
      }
    }

    async function connectBleMidi() {
      if (!navigator.bluetooth) {
        alert(t('alertWebBluetoothUnsupported'));
        return;
      }
      if (bleMidi.connected) return;
      let device = null;
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [BLE_MIDI_SERVICE] }],
          optionalServices: [BLE_MIDI_SERVICE]
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
        const ch = await service.getCharacteristic(BLE_MIDI_CHAR);
        await ch.startNotifications();
        ch.addEventListener('characteristicvaluechanged', (e) => parseBleMidiPacket(e.target.value.buffer));

        bleMidi.device = device;
        bleMidi.characteristic = ch;
        bleMidi.connected = true;

        midiInput.enabled = true;
        midiInput.port = { name: device.name || 'BLE-MIDI' };
        midiInput.lastEventTime = performance.now();
        if (audioCtx && !state.micSuspended) suspendMic();
        setInputIndicator();
        if (typeof refreshIntroHint === 'function') refreshIntroHint();
        DOM.micMeter?.classList.remove('visible');
        showHitChip('good', t('midiConnectedFmt', { v: device.name || 'BLE-MIDI' }));
        console.log('[BLE-MIDI] connected: ' + (device.name || 'unknown'));

        // Track the disconnect handler so reconnect attempts don't stack
        // multiple listeners on the same device instance.
        const onGattDisconnect = () => {
          bleMidi.connected = false;
          bleMidi.characteristic = null;
          midiInput.enabled = false;
          midiInput.port = null;
          setInputIndicator();
          if (audioCtx && state.micSuspended) resumeMic();
          if (bleMidi._disconnectHandler && bleMidi.device) {
            try { bleMidi.device.removeEventListener('gattserverdisconnected', bleMidi._disconnectHandler); }
            catch (_) {}
          }
          bleMidi._disconnectHandler = null;
          console.log('[BLE-MIDI] disconnected');
        };
        bleMidi._disconnectHandler = onGattDisconnect;
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
      } catch (e) {
        // Cleanup on partial-failure path: if gatt.connect() succeeded but
        // a later step (getPrimaryService, getCharacteristic, startNotifications)
        // threw, the GATT connection is held open forever otherwise.
        if (device && device.gatt && device.gatt.connected) {
          try { device.gatt.disconnect(); } catch (_) {}
        }
        console.warn('[BLE-MIDI] connect failed:', e.message);
        if (e.name !== 'NotFoundError') {
          alert(t('alertBleConnectFailedFmt', { v: e.message }));
        }
      }
    }

    // ========================================
    // v13: MIDI Free-Play
    //   - per-note polyphonic visuals (mic could only do monophonic)
    //   - velocity → particle/ripple energy
    //   - sustain pedal (CC 64) keeps notes lit until released
    //   - simple chord recognition for triads/sevenths
    //   - virtual on-screen 88-key keyboard with live key highlights
    //   - sustained vertical light beams while keys are held
    //   - left/right hand zones split at C4 (midi 60)
    // ========================================
    const midiState = {
      activeNotes: new Map(),     // midiNum -> { velocity, onTimeMs, synColor }
      sustainOn: false,
      sustainedNotes: new Set(),  // released keys held by pedal
      recentOnsets: [],           // {midi, timeMs} within 80ms — chord candidate
      lastChordName: '',
      lastChordTimeMs: 0,
    };

    // Chord detection — Phase 0b.3: delegated to @piano/core's drop-in
    // implementation (same algorithm, same NOTE_NAMES table, same CHORD_DICT).
    // PianoCore is loaded via <script> in index.html before app.js, so it's
    // safe to alias at parse time.
    const detectChord = PianoCore.detectChord;

    function midiToScreenX(midiNum) {
      return ((midiNum - CONFIG.PIANO_KEY_MIN) / CONFIG.PIANO_KEY_COUNT) * W;
    }

    // Per-note color helpers — Phase 0b.3: delegated to @piano/core.
    const noteThemeColor = (midiNum) =>
      PianoCore.noteThemeColor(midiNum, CONFIG.THEMES[state.currentTheme]);
    const synColorFor = (midiNum) =>
      PianoCore.synColorFor(midiNum, {
        enabled: state.useSynesthesiaMode,
        noteNames: CONFIG.NOTE_NAMES,
        colorMap: CONFIG.NOTE_COLORS,
      });

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

    function spawnMidiNoteVisuals(midiNum, velocity, synColor) {
      hideIntroHint();
      const v = Math.max(0.15, velocity / 127);
      const color = synColor || noteThemeColor(midiNum);

      const isLow = midiNum < 60;
      const noteX = midiToScreenX(midiNum);
      const baseY = isLow ? H * 0.65 : H * 0.35;
      const noteY = baseY + (Math.random() - 0.5) * H * 0.08;

      const burstCount = Math.floor(8 + v * 32 + state.flow * 0.15);
      spawnBurst(noteX, noteY, burstCount, v * (1.1 + state.flow * 0.012), color);
      ripples.push(new Ripple(noteX, noteY, color, 100 + v * 280 + state.flow * 1.2));
      spawnStream(noteX, isLow ? H * 0.78 : H * 0.22, v, color);

      // Drive flow/combo from MIDI directly so silent (headphone) practice still scores.
      state.flow = Math.min(100, state.flow + 1.0 + v * 1.8);
      // Reset combo on idle gap, mirroring the mic path at line ~2224. Without
      // this, a kid who plays one note then walks away for 5 minutes returns
      // to find the combo still climbing on the next press.
      const now = performance.now();
      if (state.lastGoodNoteTimeMs > 0 && (now - state.lastGoodNoteTimeMs) >= CONFIG.COMBO_WINDOW_MS) {
        state.combo = 1;
      } else {
        state.combo += 1;
      }
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.lastGoodNoteTimeMs = now;
      state.lastNoteTimeMs = now;

      const noteName = CONFIG.NOTE_NAMES[midiNum % 12];
      showNoteDisplay(noteName, noteName + (Math.floor(midiNum / 12) - 1), synColor, now);
      if (state.flow < 10) state.inputFlash = 0.2;
    }

    function onMidiNoteOn(midiNum, velocity) {
      if (!state.running) return;
      const now = performance.now();
      const synColor = synColorFor(midiNum);
      midiState.activeNotes.set(midiNum, { velocity, onTimeMs: now, synColor });
      midiState.sustainedNotes.delete(midiNum);

      if (!practice.enabled) {
        if (state.micSuspended) {
          state.sessionState = 'performing';
          state.sessionConfidence = Math.min(1, state.sessionConfidence + 0.15);
        }
        spawnMidiNoteVisuals(midiNum, velocity, synColor);

        // Feed MIDI into quality histories so radar/quest reflect the real
        // performance — mic may be silent (headphones) or noisy.
        const onsets = state.noteOnsetTimes;
        const lastOnset = onsets.length > 0 ? onsets[onsets.length - 1] : 0;
        if (now - lastOnset > 30) {
          onsets.push(now);
          if (onsets.length > CONFIG.IOI_HISTORY_SIZE + 1) onsets.shift();
          if (onsets.length >= 2) {
            const ioi = now - onsets[onsets.length - 2];
            if (ioi > 100 && ioi < 5000) {
              state.ioiHistory.push(ioi);
              if (state.ioiHistory.length > CONFIG.IOI_HISTORY_SIZE) state.ioiHistory.shift();
            }
          }
        }
        // CV is scale-invariant, so velocity (0..127) works directly here.
        state.amplitudeHistory.push(velocity / 127);
        if (state.amplitudeHistory.length > CONFIG.AMPLITUDE_HISTORY_SIZE) state.amplitudeHistory.shift();

        if (state.lastMidiNoteForStability != null) {
          const semis = Math.abs(midiNum - state.lastMidiNoteForStability);
          if (semis < CONFIG.STABILITY_SEMITONE_THRESHOLD) {
            state.pitchStability = Math.min(1, state.pitchStability + CONFIG.STABILITY_GROWTH);
          } else {
            state.pitchStability *= CONFIG.STABILITY_DECAY_GOOD;
          }
        }
        state.lastMidiNoteForStability = midiNum;
        // Seed lastPitch so legacy mic logic stays self-consistent when the user
        // later switches sources mid-session.
        state.lastPitch = midiToFreq(midiNum);
        state.lastSilenceStartMs = -1;
      }

      // In-place trim of the chord-window deque to avoid per-event allocation.
      const recents = midiState.recentOnsets;
      while (recents.length && now - recents[0].timeMs >= 80) recents.shift();
      recents.push({ midi: midiNum, timeMs: now });
      if (recents.length >= 3) {
        const chord = detectChord(recents.map(o => o.midi));
        if (chord && (chord !== midiState.lastChordName || now - midiState.lastChordTimeMs > 600)) {
          midiState.lastChordName = chord;
          midiState.lastChordTimeMs = now;
          // Free-play also runs the glow effect; practice just shows the name quietly.
          if (!practice.enabled) effectGlowPulse();
        }
      }
    }

    function onMidiNoteOff(midiNum) {
      if (midiState.sustainOn) {
        midiState.sustainedNotes.add(midiNum);
      } else {
        midiState.activeNotes.delete(midiNum);
      }
      // Duration scoring is anchored to physical key release (independent of
      // the sustain pedal), so the kid can't mask short presses with sustain.
      if (practice.enabled) finalizeNoteHold(midiNum);
    }

    function onMidiCC(cc, value) {
      if (cc !== 64) return;
      const wasOn = midiState.sustainOn;
      midiState.sustainOn = value >= 64;
      if (wasOn && !midiState.sustainOn) {
        // Pedal released: drop sustained keys with a soft fade ripple.
        midiState.sustainedNotes.forEach(midiNum => {
          const x = midiToScreenX(midiNum);
          const y = midiNum < 60 ? H * 0.7 : H * 0.3;
          ripples.push(new Ripple(x, y, noteThemeColor(midiNum), 60));
          midiState.activeNotes.delete(midiNum);
        });
        midiState.sustainedNotes.clear();
      }
    }

    // Virtual keyboard tables + drawer — Phase 0b.3: delegated to @piano/core.
    const KB_WHITE = PianoCore.KB_WHITE;
    const KB_BLACK = PianoCore.KB_BLACK;
    const KB_BLACK_LEFT_WHITE_IDX = PianoCore.KB_BLACK_LEFT_WHITE_IDX;

    function drawMidiKeyboard() {
      PianoCore.drawMidiKeyboard(ctx, midiState, {
        screenW: W,
        screenH: H,
        kbHeight,
        kbSafeBottom,
        noteThemeColor,
        sustainLabel: t('sustainLabel'),
        // Practice cue: highlight the next-up key(s) so the kid sees which key
        // to press without taking their eyes off the keyboard. Disabled in
        // listen mode (the song plays itself) and in free play (no schedule).
        hintNotes: buildKeyboardHintNotes(),
        nowMs: performance.now(),
      });
    }

    // Build the next-up keyboard hint set from the practice schedule. The
    // "primary" hint is the very next note (gets the down-arrow); chord-mates
    // within ±CHORD_MATE_TOLERANCE_MS share the highlight at lower intensity
    // so they stay visually subordinate. Returns null when there's nothing to
    // highlight (avoids pointless map churn from the keyboard renderer).
    function buildKeyboardHintNotes() {
      if (!practice.enabled || practice.mode === 'listen') return null;
      const notes = practice.sectionNotes;
      let idx = practice.currentNoteIdx;
      while (idx < notes.length && (notes[idx].hit || notes[idx].missed)) idx++;
      if (idx >= notes.length) return null;
      const cur = notes[idx];
      const out = new Map();
      out.set(cur.midi, { hand: cur.hand, primary: true });
      for (let i = idx + 1; i < notes.length; i++) {
        const m = notes[i];
        if (m.timeMs - cur.timeMs > CHORD_MATE_TOLERANCE_MS) break;
        if (m.hit || m.missed || m._filtered) continue;
        if (!out.has(m.midi)) out.set(m.midi, { hand: m.hand, primary: false });
      }
      return out;
    }

    function drawMidiBeams(timeMs) {
      if (midiState.activeNotes.size === 0 && midiState.sustainedNotes.size === 0) return;
      const kbTop = H - kbHeight - kbSafeBottom;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const paintBeam = (x, color, beamW, alpha, midStop) => {
        const grad = ctx.createLinearGradient(x, kbTop, x, 0);
        grad.addColorStop(0, color);
        if (midStop != null) grad.addColorStop(midStop, color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x - beamW / 2, 0, beamW, kbTop);
      };

      midiState.activeNotes.forEach((note, midiNum) => {
        const v = note.velocity / 127;
        const pulse = 0.5 + 0.5 * Math.sin((timeMs - note.onTimeMs) * 0.005);
        const beamW = (4 + v * 14) * (0.85 + pulse * 0.3);
        const color = note.synColor || noteThemeColor(midiNum);
        paintBeam(midiToScreenX(midiNum), color, beamW, 0.18 + v * 0.32, 0.35);
      });
      midiState.sustainedNotes.forEach(midiNum => {
        if (midiState.activeNotes.has(midiNum)) return;
        paintBeam(midiToScreenX(midiNum), noteThemeColor(midiNum), 8, 0.12, null);
      });
      ctx.restore();
    }

    // Chord-name display. Free play celebrates with a big centered label;
    // practice puts it small and quiet just above the keyboard so it doesn't fight the lane/score.
    function drawMidiChordDisplay(timeMs) {
      if (!midiState.lastChordName) return;
      const age = timeMs - midiState.lastChordTimeMs;
      if (age > 1800) return;
      const t = age / 1800;
      const alpha = (t < 0.12) ? (t / 0.12) : Math.max(0, 1 - (t - 0.12) / 0.88);
      ctx.save();
      // shadowBlur on text forces software rasterization on iOS Safari /
      // low-tier devices. Gate by PERF_PROFILE so the chord-name display
      // doesn't drag low-tier framerates while it fades in/out for 1.8 s.
      const useShadow = CONFIG.SHADOW_BLUR_ENABLED;
      if (practice.enabled) {
        // Quiet variant: just above the keyboard, small, fade-only.
        const yPos = H - kbHeight - kbSafeBottom - 22;
        ctx.translate(W / 2, yPos);
        ctx.fillStyle = 'rgba(255, 220, 140, ' + (alpha * 0.75).toFixed(3) + ')';
        ctx.font = '500 ' + Math.round(Math.min(28, W * 0.022)) + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (useShadow) {
          ctx.shadowColor = 'rgba(255, 200, 80, 0.5)';
          ctx.shadowBlur = 10;
        }
        ctx.fillText(midiState.lastChordName, 0, 0);
        ctx.restore();
        return;
      }
      const scale = 0.9 + 0.18 * Math.sin(Math.min(t, 1) * Math.PI);
      ctx.translate(W / 2, H * 0.42);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(255, 230, 150, ' + alpha + ')';
      ctx.font = 'bold ' + Math.round(Math.min(72, W * 0.06)) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (useShadow) {
        ctx.shadowColor = 'rgba(255, 200, 80, 0.8)';
        ctx.shadowBlur = 24;
      }
      ctx.fillText(midiState.lastChordName, 0, 0);
      ctx.restore();
    }

    // Median of the recent high-confidence pitches. Used to neutralize YIN's
    // single-frame octave errors at the moment of onset.
    function medianRecentPitch() {
      const arr = state.recentPitches;
      if (!arr || arr.length === 0) return 0;
      const sorted = arr.slice().sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    }

    // ========================================
    // Shared match logic — funnel point for both mic and MIDI events.
    // STRICT: only the currentNoteIdx (the very next expected note) is considered.
    // We never skip ahead in the score, so playing a wrong note → MISS rather than
    // accidentally crediting a same-pitch-class note further along the timeline.
    // ========================================
    function matchNoteOnset(detectedMidi, isExact) {
      if (!practice.enabled) return false;
      // Listen mode: the song plays itself, the kid is just watching/listening.
      // Don't judge, score, or chip on input — let any incidental key-presses
      // create free-play visuals (handled outside this function) but ignore here.
      if (practice.mode === 'listen') return false;
      const elapsed = practiceElapsedMs();
      const notes = practice.sectionNotes;
      // Eagerly skip past any already-resolved notes. The per-frame skip-past
      // loop normally advances currentNoteIdx, but a chord played within a
      // single frame would otherwise leave subsequent presses pointing at the
      // already-hit cur and drop them silently.
      let idx = practice.currentNoteIdx;
      while (idx < notes.length && (notes[idx].hit || notes[idx].missed)) idx++;
      practice.currentNoteIdx = idx;
      if (idx >= notes.length) return false;
      const cur = notes[idx];
      if (!cur) return false;

      const dtSigned = elapsed - cur.timeMs;   // +late, -early
      const inWindow = practice.mode === 'guided'
        ? true
        : (dtSigned >= -HIT_WINDOW_EARLY_MS && dtSigned <= HIT_WINDOW_MS);
      const dtCur = Math.abs(dtSigned);

      // Find the played note inside the current chord cluster (cur and any
      // simultaneous notes within ±CHORD_MATE_TOLERANCE_MS). Order within a chord
      // is free — but each note must be physically pressed (no auto-credit).
      let matched = null;
      if (inWindow) {
        if (cur.midi === detectedMidi) {
          matched = cur;
        } else {
          for (let i = idx + 1; i < notes.length; i++) {
            const m = notes[i];
            const diff = m.timeMs - cur.timeMs;
            if (diff > CHORD_MATE_TOLERANCE_MS) break;
            if (m.hit || m.missed) continue;
            if (m.midi === detectedMidi) { matched = m; break; }
          }
        }
      }

      remoteLog('[Match] in=' + detectedMidi
        + (isExact ? ' (midi)' : ' (mic)')
        + ' expected=' + cur.midi + '@' + Math.round(cur.timeMs - elapsed) + 'ms'
        + ' mode=' + practice.mode
        + ' result=' + (matched ? (matched === cur ? 'HIT' : 'HIT(chord-mate)') : 'wrong-note'));

      if (!matched) {
        if (practice.mode === 'guided') {
          showHitChip('miss', t('youPlayedFmt', { v: midiToName(detectedMidi) }));
        }
        return false;
      }

      const dtSignedMatched = elapsed - matched.timeMs;
      const dt = Math.abs(dtSignedMatched);
      matched.hit = true;
      matched.holdStartMs = performance.now();
      practice.pendingHolds.set(detectedMidi, matched);
      practice.hits++;
      practice.sectionCombo++;
      if (practice.sectionCombo > practice.sectionBestCombo) {
        practice.sectionBestCombo = practice.sectionCombo;
      }
      // Guided mode: every onset is "perfect" (timing not graded). Rhythm mode:
      // score linearly, but use the asymmetric window so an early press is judged
      // against the smaller early window (steeper penalty).
      const window = dtSignedMatched < 0 ? HIT_WINDOW_EARLY_MS : HIT_WINDOW_MS;
      const ts = practice.mode === 'guided' ? 1 : Math.max(0, 1 - dt / window);
      practice.timingScoreSum += ts;
      const isPerfect = practice.mode === 'guided' || dt < PERFECT_MS;
      showHitChip(isPerfect ? 'perfect' : 'good', isPerfect ? t('perfect') : t('nice'));
      state.flow = Math.min(100, state.flow + 6 + ts * 4);
      state.combo++;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      spawnBurst(W * 0.5, H * 0.55, 8, 0.7 + ts * 0.5);
      // OSMD cursor advancement is driven by the per-frame "skip past resolved
      // notes" loop in updatePracticeFrame.
      return true;
    }

    // Note-length scoring (rhythm mode only): compare physical hold time to the
    // written length. score = 1 at exact, 0 at full tolerance off.
    function finalizeNoteHold(detectedMidi) {
      const matched = practice.pendingHolds.get(detectedMidi);
      if (!matched) return;
      practice.pendingHolds.delete(detectedMidi);
      if (practice.mode !== 'rhythm') return;
      if (!matched.holdStartMs || !matched.durMs) return;
      const heldMs = performance.now() - matched.holdStartMs;
      const expected = matched.durMs;
      const tol = Math.max(DURATION_MIN_TOL_MS, expected * DURATION_TOL_FRACTION);
      const score = Math.max(0, 1 - Math.abs(heldMs - expected) / tol);
      practice.durationScoreSum += score;
      practice.durationScoredCount++;
      if (score < 0.4) {
        showHitChip('miss', heldMs < expected ? t('tooShort') : t('tooLong'));
      }
    }

    // Single source of truth for "how far into the practice are we".
    // In rhythm mode this is Tone's audio clock so it stays sample-accurate with
    // scheduled events. In guided mode we freeze elapsed at the current note's time
    // so the falling lane shows the next-up note parked at the hit line, with the
    // upcoming queue displayed above it. The lane only moves when the kid plays
    // correctly and currentNoteIdx advances.
    function practiceRealElapsedMs() {
      // Use the RAW AudioContext clock (currentTime) — NOT Tone.now(), which
      // returns currentTime + lookAhead (~100 ms scheduler safety margin) and
      // would shift the visual countdown ahead of the audible beeps by exactly
      // that lookAhead. The 100 ms drift was the root cause of the
      // count-in-vs-woodblock desync. startAudioTime itself is set via
      // Tone.now() (the audio time at which beep 0 is scheduled to play), so
      // currentTime - startAudioTime gives "audio seconds until/since the
      // first beep" without lookAhead bias — negative during the pre-roll,
      // zero exactly when beep 0 begins to be sample-emitted, and the kid
      // hears it `outputLatency` later.
      const raw = (typeof Tone !== 'undefined' && Tone.context)
        ? (Tone.context.currentTime - practice.startAudioTime) * 1000
        : performance.now() - (practice.startAudioTime * 1000);
      // audioOffsetMs ≈ outputLatency: shifts the visual clock back so it
      // matches what the kid actually hears (which is delayed by speaker
      // buffering). Applied to both judging (so an on-the-beat press scores
      // PERFECT) and lane visuals.
      return raw - (practice.audioOffsetMs || 0);
    }
    function practiceElapsedMs() {
      const realElapsed = practiceRealElapsedMs();
      if (practice.mode === 'guided') {
        // Real time during count-in so the 4-3-2-1 actually animates and notes
        // descend visibly from the top of the lane to the hit line. After
        // count-in we freeze at the current note's time so it parks at the hit
        // line waiting for the kid to play.
        if (realElapsed < COUNT_IN_MS) return realElapsed;
        const cur = practice.sectionNotes[practice.currentNoteIdx];
        return cur ? cur.timeMs : COUNT_IN_MS;
      }
      return realElapsed;
    }

    // ========================================
    // Persistence: streak + best stars + tempo unlock
    // ========================================
    function defaultSongProgress() {
      return {
        sections: { A1: { stars: 0, bestPct: 0 }, B: { stars: 0, bestPct: 0 }, A2: { stars: 0, bestPct: 0 } },
        unlockedTempos: { 60: true, 75: false, 90: false, 100: false },
        unlockedSections: { A1: true, B: false, A2: false },
        history: {}
      };
    }
    function loadPracticeProgress() {
      const def = { streakDays: [], streakCount: 0, songs: {} };
      const p = loadJSON('pianoViz_practice_v1', null);
      if (!p) return def;
      // Migrate legacy schema (top-level sections/unlocked*) into songs.fur_elise.
      if (p.sections && !p.songs) {
        p.songs = {
          fur_elise: {
            sections: p.sections,
            unlockedTempos: p.unlockedTempos || { 60: true, 75: false, 90: false, 100: false },
            unlockedSections: p.unlockedSections || { A1: true, B: false, A2: false }
          }
        };
        delete p.sections;
        delete p.unlockedTempos;
        delete p.unlockedSections;
      }
      return Object.assign(def, p);
    }
    function savePracticeProgress() { saveJSON('pianoViz_practice_v1', practice.progress); }
    // Always returns the per-song state, lazily creating it on first access.
    function songProg() {
      if (!practice.progress.songs) practice.progress.songs = {};
      const id = currentSong.id;
      if (!practice.progress.songs[id]) {
        practice.progress.songs[id] = defaultSongProgress();
      }
      const s = practice.progress.songs[id];
      // Migrate any missing keys (defensive)
      const def = defaultSongProgress();
      s.sections = Object.assign({}, def.sections, s.sections);
      s.unlockedTempos = Object.assign({}, def.unlockedTempos, s.unlockedTempos);
      s.unlockedSections = Object.assign({}, def.unlockedSections, s.unlockedSections);
      if (!s.history) s.history = {};   // Migration from older save format.
      return s;
    }
    function dateKey(d) {
      return d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
    }
    function todayKey() { return dateKey(new Date()); }
    function recordPracticeDay() {
      const key = todayKey();
      const days = practice.progress.streakDays;
      if (days[days.length - 1] === key) return;
      days.push(key);
      let streak = 1;
      for (let i = days.length - 2; i >= 0; i--) {
        const cur = new Date(days[i + 1] + 'T00:00:00');
        const prev = new Date(days[i] + 'T00:00:00');
        const diff = Math.round((cur - prev) / 86400000);
        if (diff === 1) streak++; else break;
      }
      practice.progress.streakCount = streak;
      if (days.length > 60) days.splice(0, days.length - 60);
      savePracticeProgress();
    }

    // ========================================
    // Tone.js helpers
    // ========================================
    let tonePiano = null;
    let toneMetronome = null;
    function ensureToneInstruments() {
      if (tonePiano || typeof Tone === 'undefined') return;
      tonePiano = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.18, sustain: 0.25, release: 0.6 }
      }).toDestination();
      tonePiano.volume.value = -14;
      toneMetronome = new Tone.MembraneSynth({
        pitchDecay: 0.008, octaves: 4,
        envelope: { attack: 0.001, decay: 0.1, sustain: 0 }
      }).toDestination();
      toneMetronome.volume.value = -10;
    }

    // Audible count-in: one tick per displayed number ("4, 3, 2, 1") then a
    // brighter "GO!" downbeat exactly when the first note lands at the hit line.
    // Beat spacing follows the song's quarter-note duration so the count-in
    // *feels* like the piece — a 60 BPM lullaby gets slow ticks, a brisk étude
    // gets quick ones, and the kid arrives on tempo.
    function scheduleCountInBeeps(startAudioTime) {
      if (typeof Tone === 'undefined' || !toneMetronome) return;
      const beats = 4;
      const beatSec = (COUNT_IN_MS / beats) / 1000;
      try {
        for (let i = 0; i < beats; i++) {
          toneMetronome.triggerAttackRelease(660, 0.05, startAudioTime + i * beatSec);
        }
        toneMetronome.triggerAttackRelease(990, 0.08, startAudioTime + COUNT_IN_MS / 1000);
      } catch (e) {}
    }

    function notePitchClass(midi) { return ((midi % 12) + 12) % 12; }
    function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
    // DIAG helper — short note state suffix for tick logs.
    function n_state(n) {
      if (n.hit) return ' HIT';
      if (n.missed) return ' MISS';
      return '';
    }
    // Japanese-mode note names. Kids in JP music ed read ド/レ/ミ on the staff,
    // so when prefs.lang === 'jp' we surface those instead of C/D/E. Octave
    // numbers stay as digits — a Japanese kid's textbook also uses C4-style
    // octave numerals when needed.
    const NOTE_NAMES_JP = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
    // Hot-path cache — refreshed on langchange so the per-frame lane draw
    // doesn't re-evaluate the prefs.lang ternary 25× per frame.
    let activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : CONFIG.NOTE_NAMES;
    function midiToPitchName(midi) { return activeNoteNames[notePitchClass(midi)]; }
    function midiToName(midi) { return midiToPitchName(midi) + (Math.floor(midi / 12) - 1); }

    // ========================================
    // Section build + start
    // ========================================
    function buildSectionNotes(sectionIdx) {
      const sec = currentSong.sections[sectionIdx];
      const speedFactor = 100 / practice.tempoPct;
      const out = [];
      const handFilter = practice.handFilter;   // 'R' / 'L' / null
      for (const n of currentSong.notes) {
        if (n.timeSec >= sec.startSec && n.timeSec < sec.endSec) {
          const relSec = n.timeSec - sec.startSec;
          // One-hand mode: notes from the other hand are marked _filtered=true and pre-hit so
          // the currentNoteIdx skip-past loop advances over them (the cursor moves too).
          // Lane drawing and stats exclude _filtered notes.
          const filtered = !!handFilter && n.hand !== handFilter;
          out.push({
            hand: n.hand,
            midi: n.midi,
            timeMs: relSec * 1000 * speedFactor + COUNT_IN_MS,
            durMs: n.durSec * 1000 * speedFactor,
            measureIdx: n.measureIdx,
            inBarQuarters: n.inBarQuarters,
            cursorJump: n.cursorJump,
            hit: filtered,
            missed: false,
            _filtered: filtered
          });
        }
      }
      out.sort((a, b) => a.timeMs - b.timeMs);
      return out;
    }

    // Per-hand MIDI range used by the lane drawer to map pitch → x-position.
    // Computed once per section so the hot path doesn't re-scan every frame.
    function computeHandRanges(sectionNotes) {
      let lhMin = 200, lhMax = 0, rhMin = 200, rhMax = 0;
      let lhCount = 0, rhCount = 0;
      for (const n of sectionNotes) {
        if (n.hand === 'L') {
          if (n.midi < lhMin) lhMin = n.midi;
          if (n.midi > lhMax) lhMax = n.midi;
          lhCount++;
        } else {
          if (n.midi < rhMin) rhMin = n.midi;
          if (n.midi > rhMax) rhMax = n.midi;
          rhCount++;
        }
      }
      if (rhCount === 0) { rhMin = 60; rhMax = 72; }
      if (lhCount === 0) { lhMin = 48; lhMax = 60; }
      if (rhMax <= rhMin) rhMax = rhMin + 1;
      if (lhMax <= lhMin) lhMax = lhMin + 1;
      return { lhMin, lhMax, rhMin, rhMax };
    }

    async function startPracticeSection(sectionIdx) {
      hideIntroHint();
      if (!currentSong._loaded) {
        try { await loadCurrentScore(); }
        catch (e) { alert(t('alertScoreLoadFailedFmt', { v: e.message })); return; }
      }

      // Lock in the count-in / lookahead lengths for this section before notes
      // are built — buildSectionNotes() bakes COUNT_IN_MS into each note's timeMs.
      recomputePracticeTimings();

      const sec = currentSong.sections[sectionIdx];

      // Reset all per-section state
      practice.enabled = true;
      practice.sectionIdx = sectionIdx;
      practice.sectionNotes = buildSectionNotes(sectionIdx);
      // ---------- DIAG: section playback notes ----------
      // Verifies that the per-section playback timeline (timeMs values that
      // drive the lane + the cursor sync) was built from the song notes
      // correctly. Shows count, span, count-in offset, hand split, and the
      // first 8 + last 4 entries.
      if (REMOTE_LOG_ENABLED && practice.sectionNotes.length) {
        const psn = practice.sectionNotes;
        // Single pass: hand counts AND filtered count. Previous code did a
        // reduce + a separate filter, walking the array twice.
        let rCnt = 0, lCnt = 0, filteredCnt = 0;
        for (const n of psn) {
          if (n._filtered) filteredCnt++;
          else if (n.hand === 'R') rCnt++;
          else if (n.hand === 'L') lCnt++;
        }
        remoteLog('[DIAG/play.section] sec=' + sec.id +
          ' src=[' + sec.startSec.toFixed(3) + '..' + sec.endSec.toFixed(3) + ']s' +
          ' tempoPct=' + practice.tempoPct + '%' +
          ' speedFactor=' + (100 / practice.tempoPct).toFixed(3) +
          ' countIn=' + COUNT_IN_MS + 'ms' +
          ' notes=' + psn.length +
          ' R=' + rCnt +
          ' L=' + lCnt +
          ' filtered=' + filteredCnt +
          ' span=' + (psn[psn.length - 1].timeMs - psn[0].timeMs).toFixed(0) + 'ms' +
          ' first.t=' + psn[0].timeMs.toFixed(0) +
          ' last.t=' + psn[psn.length - 1].timeMs.toFixed(0));
        const fmtPsn = (n, i) => 'i=' + i +
          ' t=' + n.timeMs.toFixed(0) +
          ' dur=' + n.durMs.toFixed(0) +
          ' midi=' + n.midi +
          ' ' + n.hand +
          ' m=' + n.measureIdx +
          ' q=' + (n.inBarQuarters ?? 0).toFixed(2) +
          (n._filtered ? ' (filtered)' : '');
        const head = Math.min(8, psn.length);
        for (let i = 0; i < head; i++) {
          remoteLog('[DIAG/play.note] ' + fmtPsn(psn[i], i));
        }
        if (psn.length > head + 4) {
          remoteLog('[DIAG/play.note] ... ' + (psn.length - head - 4) + ' notes elided ...');
        }
        for (let i = Math.max(head, psn.length - 4); i < psn.length; i++) {
          remoteLog('[DIAG/play.note] ' + fmtPsn(psn[i], i));
        }
      }
      practice.handRanges = computeHandRanges(practice.sectionNotes);
      practice.laneDrawFromIdx = 0;        // amortized cursor for lane culling
      practice.currentNoteIdx = 0;
      practice.hits = practice.misses = practice.timingScoreSum = 0;
      practice.durationScoreSum = 0;
      practice.durationScoredCount = 0;
      practice.pendingHolds = new Map();
      practice.sectionCombo = practice.sectionBestCombo = 0;
      practice._completing = false;
      practice._lastProgUpdate = 0;

      state.flow = 30;
      state.combo = 0;
      state.bestCombo = 0;

      // HUD
      DOM.ptbSection.textContent = t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
      DOM.ptbTempo.textContent = '🥁 ' + practice.tempoPct + '%';
      // Exclude _filtered notes from the progress count (they are auto-skipped).
      practice._sectionTargetCount = practice.sectionNotes.reduce((c, n) => c + (n._filtered ? 0 : 1), 0);
      DOM.ptbProgress.textContent = '0 / ' + practice._sectionTargetCount;
      DOM.practiceHud.classList.add('visible');
      DOM.osmdContainer.classList.add('visible');
      syncLayout();
      setInputIndicator();
      requestWakeLock();

      // Section banner — flies in to celebrate the start
      showSectionBanner(sec);

      // Position OSMD's cursor at the section's first note.
      try { osmd.cursor.reset(); } catch (_) {}
      const firstNote = practice.sectionNotes[0];
      if (firstNote) setOsmdCursorToNote(firstNote);
      _lastOsmdScrollMs = 0;
      osmdScrollToCursor();
      try { osmd.cursor.show(); } catch (_) {}
      // Reset the per-frame scan cursor so the lane drawer's elapsed →
      // step lookup starts from index 0 for the new section.
      practice._cursorScanIdx = 0;
      practice._lastCursorNoteIdx = -1;

      // Audio setup — guided mode skips ALL transport scheduling because the score
      // doesn't auto-advance. Ghost / metronome / cursor-sync events are only used in
      // rhythm mode where the timeline plays itself.
      const audioStartLead = 0.05;
      try {
        if (typeof Tone === 'undefined') throw new Error('Tone.js not loaded');
        await Tone.start();
        ensureToneInstruments();
        Tone.Transport.cancel();
        Tone.Transport.stop();
        Tone.Transport.position = 0;

        if (practice.mode === 'guided') {
          // Guided: cursor visible immediately, lane shows current note at hit line.
          if (osmd && osmd.cursor) osmd.cursor.show();
          practice.startAudioTime = Tone.now();
          scheduleCountInBeeps(practice.startAudioTime);
        } else {
          // Rhythm / Listen — full timeline scheduling. Listen forces ghost on
          // so the kid hears the song; rhythm respects the user's ghost toggle.
          const ghostActive = practice.mode === 'listen' || practice.ghostOn;
          if (ghostActive && tonePiano) {
            for (const n of practice.sectionNotes) {
              const dur = Math.max(0.1, n.durMs / 1000 * 0.85);
              Tone.Transport.schedule((time) => {
                tonePiano.triggerAttackRelease(midiToFreq(n.midi), dur, time);
              }, n.timeMs / 1000);
            }
          }
          if (practice.metronomeOn && toneMetronome && practice.sectionNotes.length > 0) {
            const last = practice.sectionNotes[practice.sectionNotes.length - 1];
            const totalMs = last.timeMs + last.durMs + 1000;
            const beatMs = practiceBeatMs();
            for (let t = COUNT_IN_MS, beat = 0; t < totalMs; t += beatMs, beat++) {
              const freq = (beat % 3 === 0) ? 880 : 660;
              Tone.Transport.schedule((time) => {
                toneMetronome.triggerAttackRelease(freq, 0.04, time);
              }, t / 1000);
            }
          }
          // Cursor sync runs per-frame from drawPracticeLane, NOT from
          // Tone.Draw.schedule (Tone.Draw inherits Transport's ~100 ms
          // lookAhead — audio plays on time but cursor crawls behind).
          practice.startAudioTime = Tone.now() + audioStartLead;
          scheduleCountInBeeps(practice.startAudioTime);
          // CRITICAL: pass startAudioTime as an ABSOLUTE audio time so
          // Transport.position = 0 lines up exactly with beep 0. Using a
          // relative '+0.05' string anchors the Transport at currentTime+0.05
          // while startAudioTime is currentTime+lookAhead+0.05 — the
          // resulting `lookAhead` (≈100 ms) gap is what made the GO! beep
          // land after the first note in rhythm mode.
          Tone.Transport.start(practice.startAudioTime);
          // Cursor visible during count-in too — kid can see "this is where
          // we'll start" instead of an empty score with notes about to fall.
          if (osmd && osmd.cursor) osmd.cursor.show();
        }
        // Diagnostic: log device audio output latency. AudioContext.outputLatency
        // is the speaker-side buffer delay; baseLatency is the processing block.
        // The total is roughly how late audio reaches the kid's ears vs Tone.now().
        try {
          const ctx = Tone.context.rawContext || Tone.context;
          const out = (ctx.outputLatency || 0) * 1000;
          const base = (ctx.baseLatency || 0) * 1000;
          // pickAudioOffsetMs in @piano/core encapsulates the user-override-
          // wins / clamp-AirPods-tail / fall-back-to-default decision so it's
          // testable without standing up an AudioContext.
          practice.audioOffsetMs = PianoCore.pickAudioOffsetMs({
            userOverrideMs: prefs.audioOffsetMs,
            reportedOutMs: out,
            reportedBaseMs: base,
            defaultMs: DEFAULT_AUDIO_OFFSET_MS,
          });
          remoteLog('[Practice] mode=' + practice.mode
            + ' tempoPct=' + practice.tempoPct
            + ' audioOutputLatency=' + out.toFixed(1) + 'ms'
            + ' audioBaseLatency=' + base.toFixed(1) + 'ms'
            + ' lookAhead=' + (Tone.context.lookAhead * 1000).toFixed(1) + 'ms'
            + ' compensation=' + practice.audioOffsetMs.toFixed(1) + 'ms'
            + (prefs.audioOffsetMs != null ? ' (user)' : ' (auto)'));
        } catch (e) {
          practice.audioOffsetMs = prefs.audioOffsetMs != null
            ? prefs.audioOffsetMs : DEFAULT_AUDIO_OFFSET_MS;
        }
      } catch (e) {
        console.error('Tone start failed', e);
        practice.startAudioTime = (performance.now() / 1000) + audioStartLead;
        // Tone failure short-circuits the audio-latency probe above, leaving
        // practice.audioOffsetMs at whatever the previous section set. Reset
        // it so the lane uses a sane compensation rather than stale state.
        practice.audioOffsetMs = prefs.audioOffsetMs != null
          ? prefs.audioOffsetMs : DEFAULT_AUDIO_OFFSET_MS;
      }
    }

    function stopPracticeAudio() {
      try {
        if (typeof Tone !== 'undefined') {
          Tone.Transport.stop();
          Tone.Transport.cancel();
        }
      } catch (e) {}
      try { if (osmd && osmd.cursor) osmd.cursor.hide(); } catch (_) {}
    }

    // ========================================
    // Per-frame practice tick
    // ========================================
    function updatePractice(timeMs, isOnsetNote, pitchHz) {
      if (!practice.enabled) return;
      const elapsed = practiceElapsedMs();
      const notes = practice.sectionNotes;
      const len = notes.length;

      // ---------- DIAG: live playback tick (1 / sec) ----------
      // Compact snapshot — just enough to verify cursor/note alignment in
      // real time. Heavy load-time DIAGs are in dumpLoadDiagnostics().
      if (REMOTE_LOG_ENABLED && len > 0) {
        if (!practice._dbgNextLog || timeMs >= practice._dbgNextLog) {
          practice._dbgNextLog = timeMs + 1000;
          let expIdx = -1;
          for (let i = 0; i < len; i++) {
            if (notes[i].timeMs > elapsed) break;
            expIdx = i;
          }
          const exp = expIdx >= 0 ? notes[expIdx] : null;
          const next = expIdx + 1 < len ? notes[expIdx + 1] : null;
          let hit = 0, miss = 0, pend = 0;
          for (const n of notes) {
            if (n._filtered) continue;
            if (n.hit) hit++; else if (n.missed) miss++; else pend++;
          }
          // Read current cursor measure straight from OSMD's iterator —
          // the iterator is the source of truth now, no shadow counter.
          const curM = osmd?.cursor?.iterator?.CurrentMeasureIndex ?? -1;
          remoteLog('[DIAG/play.tick] t=' + elapsed.toFixed(0) + 'ms' +
            ' mode=' + practice.mode +
            ' | progress hit=' + hit + ' miss=' + miss + ' pend=' + pend + '/' + len +
            ' curIdx=' + practice.currentNoteIdx +
            ' | exp=' + (exp
              ? '{i=' + expIdx + ' t=' + exp.timeMs.toFixed(0) +
                ' m=' + exp.measureIdx + ' q=' + (exp.inBarQuarters ?? 0).toFixed(2) +
                ' midi=' + exp.midi + n_state(exp) + ' dt=' + (elapsed - exp.timeMs).toFixed(0) + '}'
              : 'none') +
            ' next=' + (next
              ? '{i=' + (expIdx + 1) + ' t=' + next.timeMs.toFixed(0) +
                ' m=' + next.measureIdx + ' q=' + (next.inBarQuarters ?? 0).toFixed(2) +
                ' midi=' + next.midi + ' in=' + (next.timeMs - elapsed).toFixed(0) + '}'
              : 'none') +
            ' | cursor m=' + curM);
        }
      }

      // 1. Mark missed notes (hit window expired) — RHYTHM MODE ONLY.
      //    Guided waits for the kid; Listen plays itself, so neither auto-misses.
      if (practice.mode === 'rhythm') {
        for (let i = practice.currentNoteIdx; i < len; i++) {
          const n = notes[i];
          if (n.hit || n.missed) continue;
          if (elapsed > n.timeMs + HIT_WINDOW_MS) {
            n.missed = true;
            practice.misses++;
            practice.sectionCombo = 0;
            showHitChip('miss', t('missChip'));
          }
          if (n.timeMs - elapsed > HIT_WINDOW_MS) break;
        }
      } else if (practice.mode === 'listen') {
        // Listen mode auto-advances the cursor as the song plays so the lane
        // and OSMD stay in sync with the audio. We mark notes as `hit` (not
        // missed) so the per-frame skip-past loop walks the cursor forward
        // without the rhythm-mode penalty path.
        for (let i = practice.currentNoteIdx; i < len; i++) {
          const n = notes[i];
          if (n.hit || n.missed) continue;
          if (elapsed >= n.timeMs) n.hit = true;
          else break;
        }
      }

      // 2. Match an incoming mic onset. While a MIDI keyboard is connected, mic is
      //    fully suppressed for *scoring* — sustained piano sound, ambient noise,
      //    or the kid's voice between MIDI presses can otherwise credit a wrong
      //    note (especially under the chord-forgiveness forward-search).
      //    Visualizer effects keep their own recency window (see drawMidiBeams path).
      if (!midiInput.enabled && isOnsetNote && pitchHz > 0) {
        const stablePitch = medianRecentPitch() || pitchHz;
        const detectedMidi = Math.round(12 * Math.log2(stablePitch / 440) + 69);
        matchNoteOnset(detectedMidi, false);
      }

      // 3. Skip past resolved notes. The OSMD cursor follows currentNoteIdx
      //    via the per-frame sync in drawPracticeLane — no need to nudge it
      //    here (chord notes share an iterator step, so successive
      //    setOsmdCursorToNote calls within a chord are no-ops anyway).
      while (practice.currentNoteIdx < len &&
        (notes[practice.currentNoteIdx].hit || notes[practice.currentNoteIdx].missed)) {
        practice.currentNoteIdx++;
      }

      // 5. Progress UI (rate-limited) — exclude the other hand in one-hand mode
      if (timeMs - practice._lastProgUpdate > 100) {
        practice._lastProgUpdate = timeMs;
        const target = practice._sectionTargetCount || len;
        DOM.ptbProgress.textContent = (practice.hits + practice.misses) + ' / ' + target;
      }

      // 6. Section complete?
      let isComplete = practice.currentNoteIdx >= len;
      if (!isComplete && practice.mode !== 'guided') {
        const last = notes[len - 1];
        isComplete = !!(last && elapsed > last.timeMs + last.durMs + HIT_WINDOW_MS + 400);
      }
      if (!practice._completing && isComplete) {
        practice._completing = true;
        // Race guard: if the user taps "quit" / Home during this 600 ms, we
        // disabled practice but the timer would still fire and credit the
        // section. Re-check practice.enabled at fire time.
        practice._completionTimer = setTimeout(() => {
          practice._completionTimer = null;
          if (practice.enabled && practice._completing) completePracticeSection();
        }, 600);
      }
    }

    // ========================================
    // Draw falling notes lane
    //   Lane is split into LH (left half) and RH (right half). Notes fall from the top
    //   toward the hit line. Time-to-pixel scale = (laneHeight - 40) / LANE_LOOKAHEAD_MS.
    // ========================================
    // Practice lane drawer — Phase 0b.3: delegated to @piano/core.
    // The view + timing + opts triple is rebuilt per frame from legacy
    // closures so call sites pass nothing changed. core mutates the
    // view.laneDrawFromIdx cursor in-place each frame.
    function drawPracticeLane(timeMs) {
      if (!practice.enabled) return;
      const osmdVisible = !!(DOM.osmdContainer && DOM.osmdContainer.classList.contains('visible'));
      const kbReserve = midiInput.enabled ? (kbHeight + kbSafeBottom + 16) : 60;

      // === Per-frame cursor sync ===
      // Sits OSMD's cursor on the note we're currently working on, using
      // (measureIdx, inBarQuarters) → setOsmdCursorToNote walks OSMD's
      // iterator natively. No shadow step counter, no parallel timeline.
      //
      // Which note is "current":
      // - rhythm/listen: the latest note whose timeMs <= real elapsed.
      // - guided: practice.currentNoteIdx (kept in sync by updatePractice
      //   as the kid resolves notes).
      //
      // Between two consecutive notes the cursor stays on the earlier
      // one — we don't synthesise rest-step movement (intermediate steps
      // aren't uniformly spaced in time on multi-voice scores, so any
      // synthesised pacing would visibly drift).
      if (osmdVisible && practice.sectionNotes.length > 0) {
        const notes = practice.sectionNotes;
        let targetIdx;
        if (practice.mode === 'guided') {
          targetIdx = Math.min(practice.currentNoteIdx | 0, notes.length - 1);
        } else {
          const elapsed = practiceRealElapsedMs();
          let pIdx = practice._cursorScanIdx | 0;
          if (pIdx >= notes.length || notes[pIdx].timeMs > elapsed) pIdx = 0;
          while (pIdx + 1 < notes.length && notes[pIdx + 1].timeMs <= elapsed) pIdx++;
          practice._cursorScanIdx = pIdx;
          targetIdx = pIdx;
        }
        if (targetIdx !== practice._lastCursorNoteIdx) {
          const note = notes[targetIdx];
          if (note) {
            setOsmdCursorToNote(note);
            osmdScrollToCursor();
          }
          practice._lastCursorNoteIdx = targetIdx;
        }
      }

      // Lane region. cachedOsmdRect is refreshed by syncLayout +
      // ResizeObserver, so this loop avoids a per-frame
      // getBoundingClientRect() (which would force synchronous layout).
      let laneLeft = 0;
      let laneWidth = W;
      let laneTopOverride;
      if (osmdVisible && cachedOsmdRect.height > 0) {
        if (currentLayoutMode === 'phone-landscape') {
          laneLeft = Math.round(cachedOsmdRect.right + 8);
          // Subtract safeRight so notes near the right edge don't fall into
          // the home-indicator / notch zone on iPhones held landscape.
          laneWidth = Math.max(160, W - laneLeft - 4 - safeRight);
          laneTopOverride = Math.round(cachedOsmdRect.top);
        } else {
          laneTopOverride = Math.round(cachedOsmdRect.bottom + 12);
        }
      }
      // View aliases practice slice in place — laneDrawFromIdx mutation by
      // lane.ts flows back through the persistent reference. Hoisted instead
      // of re-allocated per frame.
      _laneView.sectionNotes = practice.sectionNotes;
      _laneView.handRanges = practice.handRanges;
      _laneView.laneDrawFromIdx = practice.laneDrawFromIdx;
      _laneView.currentNoteIdx = practice.currentNoteIdx;
      _laneView.isBoss = !!currentSong.sections[practice.sectionIdx].isBoss;
      _laneTiming.elapsedMs = practiceElapsedMs();
      _laneTiming.realElapsedMs = practiceRealElapsedMs();
      _laneTiming.nowMs = timeMs;
      _laneOpts.screenW = laneWidth;
      _laneOpts.screenH = H;
      _laneOpts.osmdVisible = osmdVisible;
      _laneOpts.laneTopOverride = laneTopOverride;
      _laneOpts.kbReserve = kbReserve;
      const translated = laneLeft !== 0;
      if (translated) {
        ctx.save();
        ctx.translate(laneLeft, 0);
      }
      PianoCore.drawPracticeLane(ctx, _laneView, _laneTiming, _laneOpts);
      if (translated) ctx.restore();
      // Thread the amortized cursor back so subsequent frames don't re-scan.
      practice.laneDrawFromIdx = _laneView.laneDrawFromIdx;
    }
    // Hoisted lane-draw scaffolding (see drawPracticeLane). Persistent objects
    // avoid 60 fps allocations + give the JIT stable hidden classes.
    // Honour the synesthesia toggle: when off, fall back to the active theme's
    // cyclic palette so the lane tiles match the keyboard's resting colors
    // (rainbow lane while synesthesia is OFF was a leak from before).
    const _laneNoteRestingColor = (m) => {
      if (state.useSynesthesiaMode) {
        return CONFIG.NOTE_COLORS[CONFIG.NOTE_NAMES[m % 12]] || '#fff';
      }
      return noteThemeColor(m);
    };
    const _laneView = {
      enabled: true,
      sectionNotes: null,
      handRanges: null,
      laneDrawFromIdx: 0,
      currentNoteIdx: 0,
      isBoss: false,
    };
    const _laneTiming = { elapsedMs: 0, realElapsedMs: 0, nowMs: 0 };
    // Localized strings are refreshed on `langchange` (see refreshLaneOptsI18n)
    // so the per-frame draw doesn't pay for t() lookups.
    const _laneOpts = {
      screenW: 0,
      screenH: 0,
      osmdVisible: false,
      laneTopOverride: undefined,
      kbReserve: 0,
      laneLookaheadMs: LANE_LOOKAHEAD_MS,
      countInMs: COUNT_IN_MS,
      hitWindowEarlyMs: HIT_WINDOW_EARLY_MS,
      hitWindowMs: HIT_WINDOW_MS,
      perfectMs: PERFECT_MS,
      laneLabelL: '',
      laneLabelR: '',
      countInGoLabel: '',
      midiToPitchName,
      noteRestingColor: _laneNoteRestingColor,
    };
    function refreshLaneOptsI18n() {
      _laneOpts.laneLabelL = t('laneLeft');
      _laneOpts.laneLabelR = t('laneRight');
      _laneOpts.countInGoLabel = t('countInGo');
    }
    refreshLaneOptsI18n();
    window.addEventListener('langchange', refreshLaneOptsI18n);

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    // ========================================
    // Hit feedback chip (DOM)
    // ========================================
    // Throttled to ~100ms minimum spacing — prevents DOM/animation thrashing during
    // rapid passages (12+ notes/sec). Hits keep registering; only the visual chip is
    // skipped when the previous one is still settling in.
    let _lastChipMs = 0;
    function showHitChip(kind, text) {
      const now = performance.now();
      if (now - _lastChipMs < 100) return;
      _lastChipMs = now;
      const chip = document.createElement('div');
      chip.className = 'hit-chip ' + kind;
      chip.textContent = text;
      chip.style.left = '50%';
      chip.style.top = (H * 0.55 - 30) + 'px';
      document.body.appendChild(chip);
      setTimeout(() => chip.remove(), 1100);
    }

    // ========================================
    // Section complete → result screen
    // ========================================
    const SECTION_IDS = ['A1', 'B', 'A2'];

    // Result-screen tier + unlock gating delegated to @piano/core
    // (resolveResultTier / computeUnlocks). RESULT_TIERS / TEMPO_TIERS / streak
    // milestone constants now live in practice-state.ts.
    // durPct is null in guided mode (no audio clock to score length against), in
    // which case the dur threshold is skipped.
    const STAR_TIERS = PianoCore.STAR_TIERS;
    const computeStars = PianoCore.computeStars;
    const resolveResultTier = PianoCore.resolveResultTier;
    const computeUnlocks = PianoCore.computeUnlocks;

    // Apply localized text + visibility based on a cached result context. Called
    // from completePracticeSection AND from the langchange listener so the card
    // can re-render in the new language without re-computing scores/unlocks.
    function renderResultCard() {
      const r = practice._lastResult;
      if (!r) return;
      const sec = currentSong?.sections?.find(s => s.id === r.secId);
      if (!sec) return;

      if (r.mode === 'listen') {
        DOM.resTitle.textContent = t('listenedTitle');
        DOM.resSectionName.textContent = t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
        DOM.resStars.style.display = 'none';
        document.querySelectorAll('#sectionResult .result-stat').forEach(el => { el.style.display = 'none'; });
        DOM.resMsg.textContent = t('listenedMsg');
        DOM.resUnlock.textContent = '';
        if (DOM.resHistoryWrap) DOM.resHistoryWrap.classList.add('hidden');
        DOM.resNext.style.display = 'none';
        if (DOM.resTryPlay) DOM.resTryPlay.style.display = '';
        return;
      }

      // Rhythm/guided result.
      DOM.resStars.style.display = '';
      document.querySelectorAll('#sectionResult .result-stat').forEach(el => { el.style.display = ''; });
      if (DOM.resTryPlay) DOM.resTryPlay.style.display = 'none';
      const tier = resolveResultTier(r.stars);
      DOM.resTitle.textContent = t(tier.titleKey);
      DOM.resSectionName.textContent = t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
      DOM.resMsg.textContent = t(tier.msgKey);
      let unlockedMsg = '';
      if (r.unlockedTempo)   unlockedMsg += t('tempoUnlockedFmt', { v: r.unlockedTempo });
      if (r.unlockedSecKey)  unlockedMsg += t('sectionUnlockedFmt', { v: t(r.unlockedSecKey) });
      if (r.streakDays)      unlockedMsg += t('streakDaysFmt', { v: r.streakDays });
      DOM.resUnlock.textContent = unlockedMsg.trim();
    }

    function completePracticeSection() {
      practice.enabled = false;
      stopPracticeAudio();
      releaseWakeLock();
      practice.pendingHolds.clear();

      const sec = currentSong.sections[practice.sectionIdx];

      // Listen mode: no scoring, no progress mutation, no unlocks. Hide all
      // score rows/stars and offer a "Try playing" button that switches the
      // kid into Guided on the same section — natural pedagogical flow.
      if (practice.mode === 'listen') {
        practice._lastResult = { mode: 'listen', secId: sec.id };
        renderResultCard();
        DOM.sectionResult.classList.add('visible');
        practice._completing = false;
        return;
      }
      const total = practice._sectionTargetCount || 0;
      const accPct = total > 0 ? Math.round((practice.hits / total) * 100) : 0;
      const timingPct = practice.hits > 0 ? Math.round((practice.timingScoreSum / practice.hits) * 100) : 0;
      const durPct = practice.durationScoredCount > 0
        ? Math.round((practice.durationScoreSum / practice.durationScoredCount) * 100)
        : null;
      const stars = computeStars(accPct, timingPct, durPct);

      // Save to progress (per-song)
      const sp = songProg();
      const prog = sp.sections[sec.id] || { stars: 0, bestPct: 0 };
      if (stars > prog.stars) prog.stars = stars;
      if (accPct > prog.bestPct) prog.bestPct = accPct;
      sp.sections[sec.id] = prog;

      recordPracticeDay();

      // Decide which unlocks fire (pure, in @piano/core), then persist them.
      // The result is the *facts* (which tempo / which section / streak count)
      // so renderResultCard can re-build the localized message on language
      // change without re-running the gating logic.
      const sectionNameKeys = {};
      for (const s of currentSong.sections) sectionNameKeys[s.id] = s.nameKey;
      const unlocks = computeUnlocks({
        stars,
        tempoPct: practice.tempoPct,
        sectionId: sec.id,
        sectionIds: SECTION_IDS,
        sectionNameKeys,
        unlockedTempos: sp.unlockedTempos,
        unlockedSections: sp.unlockedSections,
        streakCount: practice.progress.streakCount,
      });
      const { unlockedTempo, unlockedSecKey, streakDays } = unlocks;
      if (unlockedTempo != null) sp.unlockedTempos[unlockedTempo] = true;
      if (unlockedSecKey != null) {
        const nextSec = SECTION_IDS[SECTION_IDS.indexOf(sec.id) + 1];
        sp.unlockedSections[nextSec] = true;
      }

      if (!sp.history[sec.id]) sp.history[sec.id] = [];
      sp.history[sec.id].push({ d: Date.now(), a: accPct, t: timingPct, s: stars });
      if (sp.history[sec.id].length > 8) sp.history[sec.id].shift();
      const sectionHistory = sp.history[sec.id];

      savePracticeProgress();

      // Snapshot context for renderResultCard (handles localized strings) +
      // re-render on language change. Numeric / visibility state below isn't
      // language-dependent so it stays imperative.
      practice._lastResult = {
        mode: practice.mode, secId: sec.id, stars,
        unlockedTempo, unlockedSecKey, streakDays
      };
      renderResultCard();
      DOM.resStars.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const span = document.createElement('span');
        span.textContent = '★';
        if (i >= stars) span.className = 'empty';
        DOM.resStars.appendChild(span);
      }
      DOM.resAcc.textContent = accPct + '%';
      DOM.resTiming.textContent = timingPct + '%';
      if (durPct == null) {
        if (DOM.resDurationRow) DOM.resDurationRow.style.display = 'none';
      } else {
        if (DOM.resDurationRow) DOM.resDurationRow.style.display = '';
        DOM.resDuration.textContent = durPct + '%';
      }
      DOM.resCombo.textContent = practice.sectionBestCombo;

      const nextIdx = SECTION_IDS.indexOf(sec.id) + 1;
      const hasNext = nextIdx > 0 && nextIdx < SECTION_IDS.length
        && songProg().unlockedSections[SECTION_IDS[nextIdx]];
      DOM.resNext.style.display = hasNext ? '' : 'none';

      // Big celebration
      if (stars >= 3) {
        effectGoldenBurst();
        effectStarShower(8);
      } else if (stars >= 2) {
        effectFlowerBurst();
        effectStarShower(5);
      } else if (stars >= 1) {
        effectStarShower(3);
      }

      if (sectionHistory.length >= 2) {
        DOM.resHistoryWrap.classList.remove('hidden');
        drawHistoryChart(DOM.resHistoryChart, sectionHistory);
      } else {
        DOM.resHistoryWrap.classList.add('hidden');
      }

      DOM.sectionResult.classList.add('visible');
      practice._completing = false;
    }

    // Growth chart — line graph of accuracy over the last 8 attempts.
    function drawHistoryChart(canvas, history) {
      const w = 280, h = 80;
      const c = setupHiDPICanvas(canvas, w, h);
      c.clearRect(0, 0, w, h);
      if (!history || history.length < 2) return;

      const padX = 22, padTop = 12, padBottom = 18;
      const innerW = w - padX * 2;
      const innerH = h - padTop - padBottom;
      const n = history.length;

      // Grid (0/50/100%)
      c.strokeStyle = 'rgba(255,255,255,0.08)';
      c.lineWidth = 1;
      for (let lvl = 0; lvl <= 2; lvl++) {
        const y = padTop + (lvl / 2) * innerH;
        c.beginPath(); c.moveTo(padX, y); c.lineTo(padX + innerW, y); c.stroke();
      }

      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.font = '9px sans-serif';
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillText('100%', padX - 4, padTop);
      c.fillText('50',   padX - 4, padTop + innerH / 2);
      c.fillText('0',    padX - 4, padTop + innerH);

      const xAt = (i) => n === 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW;
      const yAt = (v) => padTop + innerH * (1 - clamp01(v / 100));

      c.strokeStyle = 'rgba(255, 215, 0, 0.85)';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = xAt(i), y = yAt(history[i].a);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();

      for (let i = 0; i < n; i++) {
        const x = xAt(i), y = yAt(history[i].a);
        c.beginPath();
        c.arc(x, y, 3.2, 0, Math.PI * 2);
        c.fillStyle = '#ffd700';
        c.fill();
        if (history[i].s >= 3) {
          c.strokeStyle = 'rgba(255, 220, 80, 0.9)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.arc(x, y, 6, 0, Math.PI * 2);
          c.stroke();
        }
      }

      const last = history[n - 1];
      const prev = history[n - 2];
      const lastX = xAt(n - 1), lastY = yAt(last.a);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = 'bold 11px sans-serif';
      c.textAlign = 'right';
      c.textBaseline = 'alphabetic';
      const labelOffsetY = (lastY < padTop + 16) ? 14 : -6;
      c.fillText(last.a + '%', lastX - 5, lastY + labelOffsetY);

      const delta = last.a - prev.a;
      let txt, col;
      if (delta >= 3)       { txt = '↑ +' + delta + '%';            col = '#7eff8a'; }
      else if (delta <= -3) { txt = '↓ ' + delta + '%';             col = '#ff8a9a'; }
      else                  { txt = t('trendSimilar');         col = 'rgba(255,255,255,0.55)'; }
      c.textAlign = 'left';
      c.fillStyle = col;
      c.font = 'bold 11px sans-serif';
      c.fillText(txt, padX, h - 4);

      c.textAlign = 'right';
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.font = '10px sans-serif';
      c.fillText(t('growthChartFmt', { v: n }), padX + innerW, h - 4);
    }

    // ========================================
    // Song panel UI building
    // ========================================
    function renderSongPanel() {
      const top = practice.progress;            // shared (streak)
      const sp  = songProg();                   // per-song (sections, tempos, unlocks)
      // Refresh title/composer too — selectSong sets them once but a langchange
      // while the song panel is visible would otherwise leave the heading in
      // the previous language until reselect.
      if (currentSong) {
        DOM.songTitle.textContent = t(currentSong.titleKey);
        DOM.songComposer.textContent = t(currentSong.composerKey);
      }
      DOM.streakCount.textContent = top.streakCount || 0;
      DOM.streakCal.innerHTML = '';
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(dateKey(d));
      }
      for (const k of days) {
        const cell = document.createElement('div');
        cell.className = 'streak-day' + (top.streakDays.includes(k) ? ' done' : '');
        cell.title = k;
        DOM.streakCal.appendChild(cell);
      }

      // Show the score's source BPM so the user knows why two versions of the
      // same piece can feel different at the same tempo% (e.g. one Für Elise
      // encoded at ♩=72, another at ♩=120 → "60%" means very different speeds).
      if (DOM.songBpmHint) {
        if (currentSong._loaded && currentSong.bpm) {
          const bpm = Math.round(currentSong.bpm);
          const effective = Math.round(bpm * (practice.tempoPct || 100) / 100);
          DOM.songBpmHint.textContent = '♩ = ' + bpm + ' → ' + effective;
          DOM.songBpmHint.classList.toggle('rescaled', !!currentSong._bpmRescaled);
        } else {
          DOM.songBpmHint.textContent = '';
        }
      }

      DOM.tempoRow.innerHTML = '';
      const tempos = [60, 75, 90, 100];
      for (const t of tempos) {
        const btn = document.createElement('button');
        btn.className = 'tempo-btn' + (t === practice.tempoPct ? ' active' : '') + (sp.unlockedTempos[t] ? '' : ' locked');
        // Lock indicator now lives in CSS (.tempo-btn.locked::after) so the
        // disabled state reads as a designed UI, not a "60% 🔒" emoji
        // pasted after the percent.
        btn.textContent = t + '%';
        btn.disabled = !sp.unlockedTempos[t];
        if (!sp.unlockedTempos[t]) btn.setAttribute('aria-label', t + '% locked');
        btn.onclick = () => {
          if (!sp.unlockedTempos[t]) return;
          practice.tempoPct = t;
          renderSongPanel();
        };
        DOM.tempoRow.appendChild(btn);
      }

      DOM.sectionList.innerHTML = '';
      if (!currentSong._loaded || currentSong.sections.length === 0) {
        const row = document.createElement('div');
        row.className = 'section-row';
        if (currentSong._loadError) {
          row.style.opacity = '0.85';
          const safe = String(currentSong._loadError).replace(/[<>&]/g, (c) =>
            c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;');
          row.innerHTML = '<div class="section-icon">❌</div>' +
            '<div style="font-size:.78rem;color:rgba(255,180,180,.95);line-height:1.35;">' + safe + '</div>' +
            '<div></div>';
        } else {
          row.style.opacity = '0.6';
          row.innerHTML = '<div class="section-icon">⏳</div><div>' + t('loadingScore') + '</div><div></div>';
        }
        DOM.sectionList.appendChild(row);
        return;
      }
      currentSong.sections.forEach((sec, i) => {
        const unlocked = sp.unlockedSections[sec.id];
        const row = document.createElement('div');
        row.className = 'section-row' + (sec.isBoss ? ' boss' : '') + (unlocked ? '' : ' locked');
        const stars = sp.sections[sec.id]?.stars || 0;
        row.innerHTML = `
          <div class="section-icon">${sec.isBoss ? '👑' : (unlocked ? '🎵' : '🔒')}</div>
          <div>
            <div style="font-weight:500;">${t(sec.nameKey)}</div>
            <div style="font-size:.75rem; color:rgba(255,255,255,.45);">${t(sec.descKey)}</div>
          </div>
          <div class="section-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        `;
        if (unlocked) {
          row.style.cursor = 'pointer';
          row.onclick = () => {
            practice.sectionIdx = i;
            // visually highlight selected
            Array.from(DOM.sectionList.children).forEach(c => c.style.outline = '');
            row.style.outline = '2px solid rgba(255,200,230,.6)';
          };
        }
        DOM.sectionList.appendChild(row);
        if (i === practice.sectionIdx && unlocked) row.style.outline = '2px solid rgba(255,200,230,.6)';
      });

      // Highlight current mode in the 3-way picker (Listen / Guided / Rhythm).
      // Ghost / metronome only make sense in rhythm mode — Listen plays the song
      // through automatically and Guided waits for input note-by-note.
      document.querySelectorAll('#modeRow .hand-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === practice.mode);
      });
      // Hand picker — also re-paints active state since renderSongPanel rebuilds.
      document.querySelectorAll('#handRow .hand-btn').forEach(b => {
        const h = b.getAttribute('data-hand');
        const active = (h === 'L' || h === 'R') ? practice.handFilter === h : !practice.handFilter;
        b.classList.toggle('active', active);
      });
      DOM.ghostToggle.classList.toggle('on', practice.ghostOn);
      DOM.metronomeToggle.classList.toggle('on', practice.metronomeOn);
      const showRhythmOpts = practice.mode === 'rhythm';
      if (DOM.ghostRow) DOM.ghostRow.style.display = showRhythmOpts ? '' : 'none';
      if (DOM.metronomeRow) DOM.metronomeRow.style.display = showRhythmOpts ? '' : 'none';
      // Start button copy: Listen mode reads as "Start listening" instead of "Start practice".
      const startBtn = DOM.songStart;
      if (startBtn) startBtn.textContent = t(practice.mode === 'listen' ? 'startListening' : 'startPractice');
    }

    document.querySelectorAll('#handRow .hand-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const h = btn.getAttribute('data-hand');
        practice.handFilter = (h === 'L' || h === 'R') ? h : null;
        document.querySelectorAll('#handRow .hand-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    document.querySelectorAll('#modeRow .hand-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        if (m === 'listen' || m === 'guided' || m === 'rhythm') practice.mode = m;
        renderSongPanel();
      });
    });

    DOM.ghostToggle?.addEventListener('click', () => { practice.ghostOn = !practice.ghostOn; renderSongPanel(); });
    DOM.metronomeToggle?.addEventListener('click', () => { practice.metronomeOn = !practice.metronomeOn; renderSongPanel(); });

    // v13: Central invariant — whenever audio is alive and we are NOT on the title
    // screen, the global UI (theme bar with the home button + flow gauge HUD) must
    // be visible. Without this helper, paths like (returnToTitle → song panel →
    // back) leave the user on a bare canvas with no controls. Call this anywhere
    // we transition from title or a panel back into an in-session view.
    // True when we have no input alive AND don't expect to recover one without
    // user help. iOS-WMB intentionally skips the mic but is still happy to wait
    // for a MIDI keyboard — that is NOT the "no input" state we want to nag about.
    function noInputAvailable() {
      return state.micPermissionFailed && !midiInput.enabled;
    }

    // The intro hint only appears when there's a real input problem the kid
    // needs to act on. When mic + MIDI are healthy (or about to be — auto-poll
    // will pick up a hot-plugged keyboard), nothing is shown — the canvas
    // lights up the moment they play, which is the only feedback they need.
    function refreshIntroHint() {
      if (!DOM.introHint) return;
      const show = noInputAvailable();
      DOM.introHint.classList.toggle('visible', show);
      if (show) DOM.introHint.innerHTML = t('introNeedMidi');
    }

    function showRunningUI() {
      DOM.startScreen.style.display = 'none';
      document.body.classList.remove('title-screen');
      DOM.hud.style.display = 'block';
      // Hold the screen awake whenever audio is alive — was practice-only
      // before, but iOS will suspend the page (and silently break the MIDI
      // port handler in WMB) the moment the screen sleeps. Free Play sessions
      // should stay live for the same reason.
      requestWakeLock();
      if (!practice.enabled) refreshIntroHint();
      if (!midiInput.enabled && !state.micSuspended) DOM.micMeter.classList.add('visible');
      else DOM.micMeter.classList.remove('visible');
      // Background-rescan only for actual mic failures — iOS-WMB sessions
      // (`micIntentionallySkipped`) start the silent poller too so a later MIDI
      // hot-plug picks up. NEVER fire a non-silent rescan here: it surfaces a
      // "🎹 No MIDI port found" diagnostic the kid did not ask for.
      const wantBgRescan = !midiInput.enabled
        && (state.micPermissionFailed || state.micIntentionallySkipped);
      if (wantBgRescan) {
        startMidiAutoRescan();
        rescanMidi(true).catch(() => {});   // SILENT — no diagnostic on entry
      }
    }

    function hideIntroHint() {
      if (DOM.introHint) DOM.introHint.classList.remove('visible');
      clearIntroDiagCache();
    }

    function alertAudioInitError(e) {
      alert(t('audioInitFailedFmt', { v: (e && e.message) || e }));
    }

    DOM.songBack.addEventListener('click', () => {
      // selectSong is only ever wired from the title screen (the practice-song
      // buttons + user-song list + auto-select after Add-Song import all sit
      // under startScreen), so Back must return to the title — even when
      // state.running is true. The earlier "if running, just hide the panel"
      // path landed users on the bare Free Play canvas after
      // Title → Song → Back, contradicting the Back intent.
      returnToTitle();
    });

    DOM.songStart.addEventListener('click', async () => {
      if (state.starting) return;
      // Defer hiding the song panel until initAudio resolves — otherwise an
      // initAudio failure leaves the user on a bare canvas (the previous
      // selectSong has already hidden the title screen).
      try {
        if (!state.running) {
          state.starting = true;
          await initAudio();
          DOM.songPanel.classList.remove('visible');
          showRunningUI();
          initBgStars();
          state.running = true;
          state.lastFrameTimeMs = 0;
          state.sessionStartTimeMs = performance.now();
          requestAnimationFrame(loop);
        } else {
          DOM.songPanel.classList.remove('visible');
          // Re-entry while audio is already alive — make sure HUD/theme bar are
          // shown again in case we got here via returnToTitle.
          showRunningUI();
        }
        await startPracticeSection(practice.sectionIdx);
      } catch (e) {
        alertAudioInitError(e);
        // Restore the song panel so the user has a path back; without this
        // a partial-failure path strands them on a blank canvas.
        DOM.songPanel.classList.add('visible');
      } finally {
        state.starting = false;
      }
    });

    function selectSong(songId) {
      const song = SONGS[songId];
      if (!song) return;
      // Switching songs: drop the OSMD instance + manually clear the container.
      // osmd.clear() didn't remove the previous song's SVG in our setup, so the
      // new render was hidden underneath the stale children.
      if (currentSong !== song) {
        currentSong = song;
        if (osmd) {
          try { osmd.clear(); } catch (e) {}
          osmd = null;
        }
        DOM.osmdContainer.innerHTML = '';
      }
      DOM.songTitle.textContent = t(song.titleKey);
      DOM.songComposer.textContent = t(song.composerKey);
      practice.progress = practice.progress || loadPracticeProgress();
      practice.mode = 'guided';
      DOM.startScreen.style.display = 'none';
      DOM.songPanel.classList.add('visible');
      DOM.questDisplay.classList.remove('visible'); // free-play quest dots shouldn't peek through
      // Keep the invariant: if audio is already alive, the theme bar should be
      // restored beneath the song panel so a subsequent "Back" lands the user
      // on a visualizer with full controls (not a bare canvas).
      if (state.running) showRunningUI();
      // Clear any prior load error so the spinner shows on fresh attempts
      // (e.g. user backed out then re-tapped the same song).
      song._loadError = null;
      renderSongPanel();
      initWebMIDI();
      // Capture `song` in the closures so a rapid second selectSong() can't
      // pollute the new song's _loadError with the previous song's failure.
      loadCurrentScore().then(() => {
        song._loadError = null;
        if (currentSong === song && DOM.songPanel.classList.contains('visible')) renderSongPanel();
      }).catch((e) => {
        console.error('preload', e);
        song._loadError = (e && (e.message || String(e))) || 'Score load failed';
        if (currentSong === song && DOM.songPanel.classList.contains('visible')) renderSongPanel();
      });
    }

    document.querySelectorAll('.practice-song-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectSong(btn.getAttribute('data-song')));
    });

    // ========================================
    // Add-song modal — file / URL / curated library
    // ========================================
    const DOM_ADDSONG = {
      modal: document.getElementById('addSongModal'),
      btn: document.getElementById('addSongBtn'),
      closeBtn: document.getElementById('addSongCloseBtn'),
      tabs: document.querySelectorAll('.add-song-tab'),
      bodies: document.querySelectorAll('.add-song-tab-body'),
      libraryList: document.getElementById('addSongLibraryList'),
      fileInput: document.getElementById('addSongFileInput'),
      pdCheckbox: document.getElementById('addSongPdCheckbox'),
      urlInput: document.getElementById('addSongUrlInput'),
      fetchBtn: document.getElementById('addSongFetchBtn'),
      status: document.getElementById('addSongStatus'),
      myList: document.getElementById('addSongMyList'),
      userSongList: document.getElementById('userSongList')
    };

    function setAddSongStatus(msg, isError) {
      DOM_ADDSONG.status.textContent = msg || '';
      DOM_ADDSONG.status.classList.toggle('error', !!isError);
    }
    function openAddSongModal() {
      DOM_ADDSONG.modal.classList.add('visible');
      renderAddSongLibrary();
      renderAddSongMyList();
      setAddSongStatus('');
      // Kick off a (possibly cached) API fetch in the background so the full
      // catalog replaces the seed list once available.
      ensureLibraryLoaded();
      modalFocus.open(DOM_ADDSONG.modal);
    }
    function closeAddSongModal() {
      DOM_ADDSONG.modal.classList.remove('visible');
      modalFocus.close(DOM_ADDSONG.modal);
    }

    let _libraryLoadPromise = null;
    function ensureLibraryLoaded(force) {
      if (_libraryLoadPromise && !force) return _libraryLoadPromise;
      const statusEl = document.getElementById('addSongLibraryStatus');
      if (statusEl) statusEl.textContent = t('addSongLibraryLoading');
      _libraryLoadPromise = fetchLibrary(force)
        .then(entries => {
          if (entries.length > 0) {
            ONLINE_LIBRARY = entries;
            renderAddSongLibrary();
            if (statusEl) statusEl.textContent = t('addSongLibraryCount', { n: entries.length });
          }
          return entries;
        })
        .catch(err => {
          console.warn('[Library] fetch failed:', err.message);
          if (statusEl) statusEl.textContent = t('addSongLibraryOffline');
          return [];
        })
        .finally(() => { _libraryLoadPromise = null; });
      return _libraryLoadPromise;
    }

    // Pick the best display label for a library entry given current language.
    // JP labels exist for the 69 pinned scores; falls back to ASCII label
    // for anything not in the table (e.g. future additions before the JP
    // map is updated).
    function libraryDisplayLabel(item) {
      if (prefs.lang === 'jp' && item.labelJp) return item.labelJp;
      return item.label;
    }

    function renderAddSongLibrary() {
      DOM_ADDSONG.libraryList.innerHTML = '';
      const search = (document.getElementById('addSongLibrarySearch')?.value || '').toLowerCase();
      // Search matches both EN and JP labels so kids can type in either script.
      const filtered = search
        ? ONLINE_LIBRARY.filter(it =>
            (it.label || '').toLowerCase().includes(search) ||
            (it.labelJp || '').toLowerCase().includes(search))
        : ONLINE_LIBRARY;
      for (const item of filtered) {
        const row = document.createElement('div');
        row.className = 'lib-row';
        // Build icon + label spans with textContent — `item.icon` originates
        // from the library catalog JSON; if a future entry (or a tampered
        // imported library) carries HTML in `icon`, innerHTML interpolation
        // would execute it.
        const iconSpan = document.createElement('span');
        iconSpan.className = 'lib-icon';
        iconSpan.textContent = item.icon || '🎼';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'lib-label';
        labelSpan.textContent = libraryDisplayLabel(item);
        row.appendChild(iconSpan);
        row.appendChild(labelSpan);
        row.addEventListener('click', async () => {
          if (row.classList.contains('busy')) return;
          row.classList.add('busy');
          setAddSongStatus(t('addSongFetch') + '…');
          try {
            // Pass JP fields when available so the saved record carries the
            // localized title/composer separately from the auto-derived ASCII one.
            const rec = await addUserSongFromUrl(item.url, {
              source: 'library',
              titleOverride: prefs.lang === 'jp' && item.titleJp ? item.titleJp : item.label,
              composerOverride: prefs.lang === 'jp' && item.composerJp ? item.composerJp : undefined
            });
            setAddSongStatus(t('addSongAdded'));
            renderAddSongMyList();
            renderUserSongButtons();
            setTimeout(() => { closeAddSongModal(); selectSong(rec.id); }, 450);
          } catch (e) {
            setAddSongStatus(t('addSongFailed', { v: e.message }), true);
          } finally {
            row.classList.remove('busy');
          }
        });
        DOM_ADDSONG.libraryList.appendChild(row);
      }
      if (filtered.length === 0) {
        DOM_ADDSONG.libraryList.innerHTML = '<div style="font-size:.78rem;color:rgba(255,255,255,.4);padding:8px">—</div>';
      }
    }

    function renderAddSongMyList() {
      DOM_ADDSONG.myList.innerHTML = '';
      const userSongs = Object.values(SONGS).filter(s => s._isUser);
      if (userSongs.length === 0) {
        DOM_ADDSONG.myList.innerHTML = '<div style="font-size:.78rem;color:rgba(255,255,255,.4);padding:6px 0">—</div>';
        return;
      }
      for (const song of userSongs) {
        const row = document.createElement('div');
        row.className = 'my-row';
        const subParts = [];
        if (song._userComposer) subParts.push(song._userComposer);
        const sub = subParts.join(' · ');
        // 3 compact icon-only action buttons (✎ rename / ✂ edit-sections /
        // ✕ delete). The text labels were "✎ 名前を変更" / "✎ 章を編集" /
        // "削除" — three full-width pills that crowded the row. Now each
        // is a 32px icon with a localized title for hover / aria-label
        // for assistive tech. createElement + textContent (not innerHTML)
        // so a tampered import file with HTML in `song.icon` can't execute.
        const iconEl = document.createElement('span');
        iconEl.className = 'my-icon';
        iconEl.textContent = song.icon || '🎵';
        const labelEl = document.createElement('span');
        labelEl.className = 'my-label';
        labelEl.textContent = song._userTitle || song.id;
        const renameBtnEl = document.createElement('button');
        renameBtnEl.className = 'my-action-btn my-rename';
        renameBtnEl.type = 'button';
        renameBtnEl.textContent = '✎';
        const editBtnEl = document.createElement('button');
        editBtnEl.className = 'my-action-btn my-edit';
        editBtnEl.type = 'button';
        editBtnEl.textContent = '✂';
        const removeBtnEl = document.createElement('button');
        removeBtnEl.className = 'my-action-btn my-delete';
        removeBtnEl.type = 'button';
        removeBtnEl.textContent = '✕';
        row.appendChild(iconEl);
        row.appendChild(labelEl);
        row.appendChild(renameBtnEl);
        row.appendChild(editBtnEl);
        row.appendChild(removeBtnEl);
        if (sub) {
          const sb = document.createElement('span');
          sb.className = 'my-sub';
          sb.textContent = sub;
          labelEl.appendChild(sb);
        }
        const renameBtn = renameBtnEl;
        const editBtn = editBtnEl;
        const removeBtn = removeBtnEl;
        renameBtn.title = t('addSongRename');
        renameBtn.setAttribute('aria-label', t('addSongRename'));
        editBtn.title = t('addSongEditSections');
        editBtn.setAttribute('aria-label', t('addSongEditSections'));
        removeBtn.title = t('addSongRemove');
        removeBtn.setAttribute('aria-label', t('addSongRemove'));
        renameBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const newTitle = prompt(t('addSongRenamePromptTitle'), song._userTitle || '');
          if (newTitle == null) return; // cancel
          const trimmedTitle = newTitle.trim();
          if (!trimmedTitle) return;
          const newComposer = prompt(t('addSongRenamePromptComposer'), song._userComposer || '');
          if (newComposer == null) return; // cancel
          try {
            await renameUserSong(song.id, trimmedTitle, newComposer.trim());
          } catch (err) {
            console.error('renameUserSong failed', err);
            setAddSongStatus(t('addSongFailed', { v: (err && err.message) || 'rename' }), true);
            return;
          }
          renderAddSongMyList();
          renderUserSongButtons();
          // If the renamed song is currently displayed in the song panel header,
          // refresh its title/composer text too.
          if (currentSong && currentSong.id === song.id) {
            DOM.songTitle.textContent = t(currentSong.titleKey);
            DOM.songComposer.textContent = t(currentSong.composerKey);
          }
        });
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openSectionEditor(song.id);
        });
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(t('addSongConfirmRemove', { v: song._userTitle || song.id }))) return;
          try {
            await removeUserSong(song.id);
          } catch (err) {
            console.error('removeUserSong failed', err);
            setAddSongStatus(t('addSongFailed', { v: (err && err.message) || 'delete' }), true);
            return;
          }
          renderAddSongMyList();
          renderUserSongButtons();
        });
        DOM_ADDSONG.myList.appendChild(row);
      }
    }

    // ========================================
    // Section editor — manual override of auto-detected boundaries
    //   Loads the song record from IndexedDB, presents 3 editable startMeasure
    //   inputs (1-based), validates monotonic & in-range, persists back.
    //   Section names are auto (Part 1/2/3) — naming UI is YAGNI for now.
    // ========================================
    let _sectionEditingId = null;
    async function openSectionEditor(songId) {
      const db = await openUserDb();
      const rec = await new Promise((res, rej) => {
        const tx = db.transaction(USER_DB_STORE, 'readonly');
        const r = tx.objectStore(USER_DB_STORE).get(songId);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      if (!rec) return;
      _sectionEditingId = songId;
      // Re-use cached xmlText from add-time if present; otherwise unzip on demand.
      let xmlText = rec.xmlText;
      if (!xmlText) {
        const isMxl = rec.mimeType !== 'application/vnd.recordare.musicxml+xml';
        try {
          xmlText = isMxl ? await unzipMxlToXmlText(rec.mxlBlob) : await rec.mxlBlob.text();
        } catch (e) {
          alert('Failed to read score: ' + e.message);
          return;
        }
      }
      const meta = parseMusicXmlMetadata(xmlText);
      const total = meta.measureCount;
      DOM_SECEDIT.help.textContent = t('sectionEditHelp', { v: total });
      DOM_SECEDIT.rows.innerHTML = '';
      const labels = ['userSecA1', 'userSecB', 'userSecA2'];
      for (let i = 0; i < 3; i++) {
        const def = rec.sectionDefs[i] || { startMeasure: Math.floor(i * total / 3) };
        const row = document.createElement('div');
        row.className = 'sec-edit-row';
        row.innerHTML = `<label></label><input type="number" min="1" step="1">`;
        row.querySelector('label').textContent = t(labels[i]);
        const input = row.querySelector('input');
        input.value = (def.startMeasure || 0) + 1;   // 1-based for users
        input.max = total;
        if (i === 0) { input.disabled = true; input.value = 1; }   // first section always starts at measure 1
        DOM_SECEDIT.rows.appendChild(row);
      }
      DOM_SECEDIT.error.textContent = '';
      DOM_SECEDIT._totalMeasures = total;
      DOM_SECEDIT._record = rec;
      DOM_SECEDIT.modal.classList.add('visible');
      modalFocus.open(DOM_SECEDIT.modal);
    }
    function closeSectionEditor() {
      DOM_SECEDIT.modal.classList.remove('visible');
      modalFocus.close(DOM_SECEDIT.modal);
      _sectionEditingId = null;
    }

    async function saveSectionEditor() {
      const inputs = DOM_SECEDIT.rows.querySelectorAll('input[type=number]');
      const total = DOM_SECEDIT._totalMeasures;
      const vals = Array.from(inputs).map(i => parseInt(i.value, 10) - 1);   // back to 0-based
      if (vals.some(v => Number.isNaN(v) || v < 0 || v >= total)
          || vals[0] !== 0
          || vals[1] <= vals[0] || vals[2] <= vals[1]) {
        DOM_SECEDIT.error.textContent = t('sectionEditError');
        return;
      }
      const rec = DOM_SECEDIT._record;
      rec.sectionDefs = [
        { id: 'A1', nameKey: 'userSecA1', descKey: 'userSecA1desc', startMeasure: vals[0], isBoss: false },
        { id: 'B',  nameKey: 'userSecB',  descKey: 'userSecBdesc',  startMeasure: vals[1], isBoss: false },
        { id: 'A2', nameKey: 'userSecA2', descKey: 'userSecA2desc', startMeasure: vals[2], isBoss: true  }
      ];
      await userDbPut(rec);
      // Update in-memory song so an immediately-following selectSong picks up the
      // new boundaries without a page reload. Force a re-extract on next load.
      const song = SONGS[rec.id];
      if (song) {
        song.sectionDefs = rec.sectionDefs;
        song._loaded = false;
        song.sections = [];
      }
      closeSectionEditor();
    }

    // Inject user-song buttons into the start screen, between the hardcoded songs
    // and the "+ Add" button. Re-rendered after every add/remove.
    // Each tile carries an in-place ✕ delete button (CSS in app.css under
    // `#userSongList .mode-btn .my-remove`) so users can prune broken / wrong
    // songs without diving into the add-song modal — important escape hatch
    // when a song fails to load and the user just wants it gone.
    function renderUserSongButtons() {
      DOM_ADDSONG.userSongList.innerHTML = '';
      const userSongs = Object.values(SONGS).filter(s => s._isUser);
      for (const song of userSongs) {
        const btn = document.createElement('button');
        btn.className = 'mode-btn primary practice-song-btn';
        btn.setAttribute('data-song', song.id);
        btn.style.position = 'relative';
        const labelText = (song.icon || '🎵') + ' ' + (song._userTitle || song.id);
        btn.innerHTML = `<span class="mode-btn-label"></span>
          <span class="mode-btn-loading" data-i18n="starting">Starting...</span>
          <button class="my-remove" type="button" aria-label="delete">✕</button>`;
        btn.querySelector('.mode-btn-label').textContent = labelText;
        btn.addEventListener('click', () => selectSong(song.id));
        const removeBtn = btn.querySelector('.my-remove');
        removeBtn.title = t('addSongRemove');
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(t('addSongConfirmRemove', { v: song._userTitle || song.id }))) return;
          try {
            await removeUserSong(song.id);
          } catch (err) {
            console.error('removeUserSong failed', err);
            alert((err && err.message) || 'Delete failed');
            return;
          }
          renderUserSongButtons();
          if (DOM_ADDSONG.modal.classList.contains('visible')) renderAddSongMyList();
        });
        DOM_ADDSONG.userSongList.appendChild(btn);
      }
    }

    DOM_ADDSONG.btn?.addEventListener('click', openAddSongModal);
    DOM_ADDSONG.closeBtn?.addEventListener('click', closeAddSongModal);
    DOM_ADDSONG.modal?.addEventListener('click', (e) => {
      if (e.target === DOM_ADDSONG.modal) closeAddSongModal();
    });

    DOM_ADDSONG.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const which = tab.getAttribute('data-tab');
        DOM_ADDSONG.tabs.forEach(t => t.classList.toggle('active', t === tab));
        DOM_ADDSONG.bodies.forEach(b => {
          b.hidden = b.getAttribute('data-tab-body') !== which;
        });
        setAddSongStatus('');
      });
    });

    // Library search — debounce-free is fine, list is in-memory and small (~91 items).
    document.getElementById('addSongLibrarySearch')?.addEventListener('input', () => {
      renderAddSongLibrary();
    });

    DOM_ADDSONG.fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!DOM_ADDSONG.pdCheckbox.checked) {
        setAddSongStatus(t('addSongPdAttest'), true);
        return;
      }
      setAddSongStatus(t('addSongFetch') + '…');
      try {
        const rec = await addUserSongFromBlob(file, { filename: file.name, source: 'upload' });
        setAddSongStatus(t('addSongAdded'));
        renderAddSongMyList();
        renderUserSongButtons();
        setTimeout(() => { closeAddSongModal(); selectSong(rec.id); }, 450);
      } catch (err) {
        setAddSongStatus(t('addSongFailed', { v: err.message }), true);
      } finally {
        DOM_ADDSONG.fileInput.value = '';   // allow re-picking same filename
      }
    });

    DOM_ADDSONG.fetchBtn?.addEventListener('click', async () => {
      const url = (DOM_ADDSONG.urlInput.value || '').trim();
      if (!url) return;
      setAddSongStatus(t('addSongFetch') + '…');
      DOM_ADDSONG.fetchBtn.disabled = true;
      try {
        const rec = await addUserSongFromUrl(url, { source: 'url' });
        setAddSongStatus(t('addSongAdded'));
        DOM_ADDSONG.urlInput.value = '';
        renderAddSongMyList();
        renderUserSongButtons();
        setTimeout(() => { closeAddSongModal(); selectSong(rec.id); }, 450);
      } catch (err) {
        setAddSongStatus(t('addSongFailed', { v: err.message }), true);
      } finally {
        DOM_ADDSONG.fetchBtn.disabled = false;
      }
    });

    // ESC handling is consolidated into a single document-level listener
    // earlier in the file (search "Single, ordered ESC handler"). No
    // duplicate listener here.

    // Section-editor modal wiring
    const DOM_SECEDIT = {
      modal: document.getElementById('sectionEditModal'),
      help: document.getElementById('sectionEditHelp'),
      rows: document.getElementById('sectionEditRows'),
      error: document.getElementById('sectionEditError'),
      cancelBtn: document.getElementById('sectionEditCancelBtn'),
      saveBtn: document.getElementById('sectionEditSaveBtn'),
      closeBtn: document.getElementById('sectionEditCloseBtn'),
      _totalMeasures: 0,
      _record: null
    };
    DOM_SECEDIT.cancelBtn?.addEventListener('click', closeSectionEditor);
    DOM_SECEDIT.closeBtn?.addEventListener('click', closeSectionEditor);
    DOM_SECEDIT.saveBtn?.addEventListener('click', saveSectionEditor);
    DOM_SECEDIT.modal?.addEventListener('click', (e) => {
      if (e.target === DOM_SECEDIT.modal) closeSectionEditor();
    });

    // ========================================
    // Export / import — back up entire user library to one JSON file
    //   Blobs are base64-encoded (FileReader.readAsDataURL → strip prefix).
    //   Designed for "rebuild on a new iPad after a reset" — file size ≈
    //   sum of .mxl sizes × 1.33 (base64 overhead). 50 songs ≈ ~3 MB.
    // ========================================
    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
    }
    async function dataUrlToBlob(dataUrl) {
      const res = await fetch(dataUrl);
      return res.blob();
    }

    async function exportUserLibrary() {
      const all = await userDbAll();
      if (all.length === 0) {
        setAddSongStatus(t('myLibrary') + ' — 0', true);
        return;
      }
      const out = { version: 1, exportedAt: new Date().toISOString(), songs: [] };
      for (const rec of all) {
        out.songs.push({
          id: rec.id,
          title: rec.title,
          composer: rec.composer,
          mimeType: rec.mimeType,
          sectionDefs: rec.sectionDefs,
          addedAt: rec.addedAt,
          source: rec.source,
          mxlDataUrl: await blobToDataUrl(rec.mxlBlob)
        });
      }
      const json = JSON.stringify(out);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'piano-visualizer-library-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    async function importUserLibrary(file) {
      const text = await file.text();
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { throw new Error('Invalid JSON: ' + e.message); }
      if (!parsed.songs || !Array.isArray(parsed.songs)) throw new Error('Missing songs[]');
      // Reject unknown major schema versions — silently dropping fields from a
      // future v2 file is worse than failing loudly.
      if (parsed.version != null && parsed.version > 1) {
        throw new Error('Library version ' + parsed.version + ' not supported (this build expects v1)');
      }
      // Track new IDs so a mid-import quota-exceeded / IO failure can roll
      // back, leaving IndexedDB and the in-memory SONGS map consistent.
      const addedIds = [];
      try {
        for (const s of parsed.songs) {
          if (!s.mxlDataUrl) continue;
          // Don't clobber if id already exists — assign a fresh id so
          // re-importing is idempotent and never destroys a song the user
          // might have edited.
          let id = s.id;
          if (SONGS[id]) {
            id = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
          }
          const blob = await dataUrlToBlob(s.mxlDataUrl);
          const rec = {
            id,
            title: s.title || 'Imported',
            composer: s.composer || '',
            mxlBlob: blob,
            mimeType: s.mimeType || 'application/vnd.recordare.musicxml+zip',
            sectionDefs: s.sectionDefs || autoSectionDefs(await blob.text(), 1),
            addedAt: s.addedAt || Date.now(),
            source: 'import'
          };
          await userDbPut(rec);
          await registerUserSong(rec);
          addedIds.push(id);
        }
        return addedIds.length;
      } catch (err) {
        // Rollback partial import so the user isn't left with half a library
        // they can't easily clean up. Best-effort — failures here are logged
        // but don't mask the original cause.
        for (const id of addedIds) {
          try { await removeUserSong(id); } catch (e) {
            console.warn('[import-rollback] removeUserSong failed:', id, e && e.message);
          }
        }
        throw err;
      }
    }

    document.getElementById('addSongExportBtn')?.addEventListener('click', () => {
      exportUserLibrary().catch(e => setAddSongStatus(t('addSongFailed', { v: e.message }), true));
    });
    document.getElementById('addSongImportBtn')?.addEventListener('click', () => {
      document.getElementById('addSongImportInput').click();
    });
    document.getElementById('addSongImportInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const n = await importUserLibrary(file);
        setAddSongStatus(t('addSongImportDone', { n }));
        renderAddSongMyList();
        renderUserSongButtons();
      } catch (err) {
        setAddSongStatus(t('addSongFailed', { v: err.message }), true);
      } finally {
        e.target.value = '';
      }
    });

    // Hydrate user-added songs at startup so they appear in the picker without
    // requiring the kid to open the add-song modal first.
    loadUserSongs().then((n) => {
      if (n > 0) {
        renderUserSongButtons();
        console.log('[UserSongs] loaded ' + n + ' from IndexedDB');
      }
    });

    // Request persistent storage so iOS Safari ITP / Chrome eviction policies
    // are less likely to wipe IndexedDB during a long pause between practice
    // sessions. Safari currently returns false, but it doesn't hurt to ask;
    // Chrome / Edge / Android Chrome honor it for "installed" PWAs.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) console.log('[Storage] persistent storage granted');
      }).catch(() => {});
    }

    // The legacy floating BLE button is gone — Bluetooth pairing now lives
    // exclusively in the ⚙ settings panel (settingsBleBtn).

    DOM.ptbQuit.addEventListener('click', () => {
      if (!practice.enabled && !practice._completing) return;
      practice.enabled = false;
      // Cancel the in-flight section-complete timer so a quit during the
      // 600 ms grace doesn't credit progress for an abandoned section.
      if (practice._completionTimer) {
        clearTimeout(practice._completionTimer);
        practice._completionTimer = null;
        practice._completing = false;
      }
      stopPracticeAudio();
      releaseWakeLock();
      // Clear any keys still held when bailing out of practice mode.
      midiState.activeNotes.clear();
      midiState.sustainedNotes.clear();
      practice.pendingHolds.clear();
      DOM.practiceHud.classList.remove('visible');
      DOM.osmdContainer.classList.remove('visible');
      DOM.songPanel.classList.add('visible');
      renderSongPanel();
    });

    DOM.ptbToggleOsmd.addEventListener('click', () => {
      DOM.osmdContainer.classList.toggle('visible');
    });

    DOM.resQuit.addEventListener('click', () => {
      DOM.sectionResult.classList.remove('visible');
      DOM.practiceHud.classList.remove('visible');
      DOM.osmdContainer.classList.remove('visible');
      DOM.songPanel.classList.add('visible');
      renderSongPanel();
    });
    // `_practiceTransitioning` debounces double-tap on the result-card
    // buttons. Without it, mashing Retry on a slow iPad enters
    // `startPracticeSection` twice; the second call runs after the first's
    // `await Tone.start()` resolves and re-enters the Tone.Transport
    // cancel/stop/schedule block on top of incomplete cleanup.
    let _practiceTransitioning = false;
    async function transitionToSection(idx) {
      if (_practiceTransitioning) return;
      _practiceTransitioning = true;
      try { await startPracticeSection(idx); }
      finally { _practiceTransitioning = false; }
    }
    DOM.resRetry.addEventListener('click', () => {
      DOM.sectionResult.classList.remove('visible');
      transitionToSection(practice.sectionIdx);
    });
    // Listen-mode → "Try playing" shortcut: same section, but switch to Guided.
    document.getElementById('resTryPlay')?.addEventListener('click', () => {
      DOM.sectionResult.classList.remove('visible');
      practice.mode = 'guided';
      transitionToSection(practice.sectionIdx);
    });
    DOM.resNext.addEventListener('click', () => {
      const nextIdx = Math.min(practice.sectionIdx + 1, currentSong.sections.length - 1);
      const nextId = currentSong.sections[nextIdx].id;
      if (!songProg().unlockedSections[nextId]) return;
      practice.sectionIdx = nextIdx;
      DOM.sectionResult.classList.remove('visible');
      transitionToSection(nextIdx);
    });

    // Initialize progress on load (so panel works without audio start)
    practice.progress = loadPracticeProgress();

    // ========================================
    // Start
    // ========================================
    // Toggle the loading state on a start-screen mode button. The button's
    // i18n markup stays intact so language re-renders keep working and a return
    // to the title screen always finds the button in its resting state.
    function setStartButtonLoading(btn, loading) {
      if (!btn) return;
      btn.classList.toggle('is-loading', !!loading);
      btn.disabled = !!loading;
    }

    DOM.startBtn.addEventListener('click', async () => {
      // Re-entry from title screen while audio is still alive — just resume.
      if (state.running) {
        showRunningUI();
        state.sessionStartTimeMs = performance.now();
        return;
      }
      if (state.starting) return;
      state.starting = true;
      setStartButtonLoading(DOM.startBtn, true);
      try {
        await initAudio();
        showRunningUI();
        initBgStars();
        state.running = true;
        state.lastFrameTimeMs = 0;
        state.sessionStartTimeMs = performance.now();
        requestAnimationFrame(loop);
      } catch (e) {
        alertAudioInitError(e);
      } finally {
        // Unconditional reset — even on success, so a later returnToTitle
        // shows the button in its resting state instead of a frozen "Starting...".
        setStartButtonLoading(DOM.startBtn, false);
        state.starting = false;
      }
    });

    // Summary close button listener
    DOM.sumClose.addEventListener('click', () => {
      DOM.sessionSummary.classList.remove('visible');
      resetSession();
    });

    // v13: Back-to-title flow.
    // Audio stays alive (re-init is slow on Safari). Pressing "Free Play" again
    // from the title just unhides the visualizer.
    function returnToTitle() {
      if (practice.enabled || practice._completing) {
        practice.enabled = false;
        practice._completing = false;
        if (practice._completionTimer) {
          clearTimeout(practice._completionTimer);
          practice._completionTimer = null;
        }
        try { stopPracticeAudio(); } catch (e) {}
        try { releaseWakeLock(); } catch (e) {}
      }
      DOM.songPanel.classList.remove('visible');
      DOM.sessionSummary.classList.remove('visible');
      DOM.sectionResult.classList.remove('visible');
      DOM.practiceHud.classList.remove('visible');
      DOM.osmdContainer.classList.remove('visible');
      DOM.hud.style.display = 'none';
      DOM.questDisplay.classList.remove('visible'); // wipe stale free-play quest UI
      hideIntroHint();
      DOM.micMeter.classList.remove('visible');
      stopMidiAutoRescan();
      // タイトルに戻ったら dismiss 状態もリセット (次回起動で再度ガイド表示)
      if (state.running) resetSession();
      DOM.startScreen.style.display = 'flex';
      document.body.classList.add('title-screen');
    }

    DOM.homeBtn.addEventListener('click', returnToTitle);
    DOM.sumHome.addEventListener('click', returnToTitle);
    DOM.resHome.addEventListener('click', returnToTitle);
