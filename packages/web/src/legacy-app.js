    // @ts-check
    'use strict';

    // ============================================================
    // Phase 0c boundary types (JSDoc).
    //
    // These typedefs document the long-lived shapes that get passed
    // around between most functions in this file. They're not enforced
    // (checkJs is off; this file is too large to flip on without a
    // major refactor pass), but:
    //
    //   * Editors respect them — IntelliSense gets meaningfully better.
    //   * As Phase 0c extracts focused modules into TS, those modules
    //     can reference these via `import('./legacy-app.js').StateShape`
    //     so the boundary stays typed even before the legacy file
    //     itself is converted.
    //   * Future agents reading the file get a structured map of the
    //     "what IS state.X, practice.X, midiState.X" question that
    //     used to require grepping 7000+ lines.
    //
    // Add fields here as they become relevant to extraction. Don't
    // try to mirror every field — these are BOUNDARY types, intended
    // for cross-module communication.
    //
    // Style note: typedefs use the markerless form `@typedef Name`
    // (NOT `@typedef {object} Name`). Under `checkJs: true` + strict,
    // TS narrows `{object}`-marked typedefs to the bare lowercase
    // `object` type — every property access on the typedef then errors
    // as "does not exist on type 'object'". The markerless form lets
    // the `@property` lines build the interface cleanly.
    // ============================================================

    /**
     * The per-note record used by the practice lane, OSMD cursor walker,
     * and scoring. Wider than @piano/core's `OsmdNote` — carries
     * lane-render fields and per-section copies.
     *
     * @typedef OsmdLikeNote
     * @property {number} midi               MIDI note (0–127).
     * @property {'L'|'R'} hand              Hand assignment.
     * @property {number} timeSec            Onset (s) at authored tempo. Always set on song.notes (ExpandedNote stage).
     * @property {number} durSec             Duration (s) at authored tempo.
     * @property {number} timeMs             Onset at the kid's chosen tempoPct. Set on practice.sectionNotes; song.notes carries this too as a redundant copy after `buildSectionNotes`.
     * @property {number} durMs              Duration at the kid's chosen tempoPct.
     * @property {number} measureIdx         0-based MusicXML measure index.
     * @property {number} inBarQuarters      Position in the bar (quarter-note units).
     * @property {boolean=} tieStart
     * @property {boolean=} tieEnd
     * @property {boolean=} hit              Set by the practice tick when matched.
     * @property {boolean=} missed           Set when the hit window closes unmatched.
     * @property {boolean=} _filtered        One-hand mode: pre-flagged hit so the cursor auto-skips.
     * @property {number|null=} cursorJump   OSMD cursor target measure (rare; for repeat-jump notes). null on sequential notes.
     * @property {number=}  holdStartMs      Set by onMidiNoteOn when this note becomes a pending hold.
     * @property {number=}  expectedDurMs    Cached for finalizeNoteHold's duration scoring.
     * @property {number=}  expectedEndMs    Cached for finalizeNoteHold's duration scoring.
     * @property {number=}  onTimeMs         Cached for finalizeNoteHold's duration scoring.
     */

    /**
     * @typedef PracticeStateShape
     *   The cross-section practice transport state. Lives at module
     *   scope as `practice`. Mode-specific fields (e.g. `ghostOn`)
     *   are read by both the audio scheduler and the lane renderer.
     * @property {boolean} enabled
     * @property {number} sectionIdx
     * @property {number} tempoPct                    60 / 75 / 90 / 100.
     * @property {'guided'|'rhythm'|'listen'} mode
     * @property {boolean} ghostOn
     * @property {boolean} metronomeOn
     * @property {boolean} fullSongMode               Listen-only: play every section back-to-back.
     * @property {number} startAudioTime              Tone.now() at section start.
     * @property {OsmdLikeNote[]} sectionNotes        Active section's note list.
     * @property {number} currentNoteIdx              Next-to-resolve idx in sectionNotes.
     * @property {number} hits
     * @property {number} misses
     * @property {number} timingScoreSum
     * @property {number} durationScoreSum
     * @property {number} durationScoredCount
     * @property {Map<number, OsmdLikeNote>} pendingHolds  Note → OsmdLikeNote being held; finalizeNoteHold reads `holdStartMs` + `durMs` (set on hit + section build).
     * @property {number} sectionCombo
     * @property {number} sectionBestCombo
     * @property {'L'|'R'|null} handFilter
     * @property {number} audioOffsetMs
     * @property {import('@piano/core').PracticeProgress|null} progress
     * @property {boolean} _completing
     * @property {ReturnType<typeof setTimeout>|null} [_completionTimer]
     * @property {number} _lastProgUpdate
     * @property {number} [_cursorScanIdx]            Per-frame note-scan position.
     * @property {number} [_lastCursorNoteIdx]        Last cursor-walked target.
     * @property {number} [_dbgNextLog]               Next ms timestamp at which to emit a debug log.
     * @property {number} [_sectionTargetCount]       Total scoreable notes in active section.
     * @property {{mode:string, secId:string, stars:number, unlockedTempo:number|null, unlockedSecKey:string|null, streakDays:number|null, fullSong?:boolean}|null} [_lastResult]
     * @property {number} [laneDrawFromIdx]           Amortized cursor for lane-render culling.
     * @property {{lhMin:number, lhMax:number, rhMin:number, rhMax:number}} [handRanges]
     */

    /**
     * @typedef MidiStateShape
     *   Live MIDI runtime state. Held under `midiState`.
     * @property {Map<number, {velocity:number, onTimeMs:number, synColor?:string}>} activeNotes
     * @property {boolean} sustainOn
     * @property {Set<number>} sustainedNotes
     * @property {{midi:number, timeMs:number}[]} recentOnsets   Chord-window deque.
     * @property {string} lastChordName
     * @property {number} lastChordTimeMs
     */

    /**
     * @typedef MidiInputShape
     *   Held under `midiInput`. Tracks the active Web MIDI / BLE-MIDI port +
     *   coarse health flags consumed by the mic-vs-MIDI arbitration loop.
     * @property {boolean} enabled
     * @property {MIDIInput|{name:string}|null} port
     * @property {boolean} _accessRequested
     * @property {boolean} platformBlocked
     * @property {number} [lastEventTime]
     */

    /**
     * @typedef BestScoresShape
     *   Persisted in localStorage as `pianoViz_best`. Returned from
     *   `saveBestScores` and embedded in `state._lastSummary.bestStat`.
     * @property {number} bestCombo
     * @property {number} peakFlow
     * @property {number} totalSessions
     */

    /**
     * @typedef LastSummaryShape
     *   Cached so `renderSessionSummaryText` can replay the same numbers when
     *   the user toggles language without restarting the session.
     * @property {number} bestCombo
     * @property {number} stageIdx
     * @property {number} elapsed
     * @property {string[]} completedQuests
     * @property {BestScoresShape} bestStat
     */

    /**
     * @typedef GameStateShape
     *   Module-scoped `state`. Optional (`?`) fields are added lazily
     *   by hot-path code; making them optional means the cast site
     *   doesn't need to seed them, but reads still see `T | undefined`.
     * @property {boolean} running
     * @property {boolean} starting
     * @property {number} flow
     * @property {number} combo
     * @property {number} bestCombo
     * @property {number} currentStage
     * @property {number} lastGoodNoteTimeMs
     * @property {number} lastSilenceStartMs
     * @property {number} lastNoisePenaltyMs
     * @property {number|null} lastPitchSemitones
     * @property {boolean} useSynesthesiaMode
     * @property {string[]} completedQuests
     * @property {number} lastQuestCheckMs
     * @property {string|null} activeQuestId
     * @property {number} pitchStability
     * @property {number} lastNoteTimeMs
     * @property {number} smoothEnergy
     * @property {string} lastDetectedNote
     * @property {number} noteShowTimeMs
     * @property {number} currentTheme
     * @property {number} lastFrameTimeMs
     * @property {Float32Array|null} prevSpectrum
     * @property {number[]} spectralFluxHistory
     * @property {number} lastOnsetTimeMs
     * @property {boolean} micSuspended
     * @property {number} agcGain
     * @property {number} agcSmoothedRms
     * @property {number} agcLastUpdateMs
     * @property {number} agcVoiceRejectCount
     * @property {number} agcVoiceSuppressUntilMs
     * @property {'waiting'|'warmup'|'performing'} sessionState
     * @property {number} sessionStartMs
     * @property {number} sessionConfidence
     * @property {number} sessionPerformingStartMs
     * @property {number} lastSessionSampleMs
     * @property {number} sessionRingHead
     * @property {number} sessionRingTail
     * @property {number} sessionRingSize
     * @property {number} sessionPianoCount
     * @property {number} goalWindowStartMs
     * @property {number} goalCelebrateUntilMs
     * @property {number} goalCompletedCount
     * @property {number[]} noteOnsetTimes
     * @property {number[]} ioiHistory
     * @property {number[]} amplitudeHistory
     * @property {number[]} centroidHistory
     * @property {number} rhythmScore
     * @property {number} dynamicsScore
     * @property {number} stabilityScore
     * @property {number} qualityScore
     * @property {number} displayedQualityScore
     * @property {number} growthScore
     * @property {{timeMs:number, score:number}[]} qualityHistory
     * @property {string} feedbackGood
     * @property {string} feedbackNext
     * @property {number} lastScoreUpdateMs
     * @property {number} currentEncouragementTier
     * @property {number} lastEncouragementTimeMs
     * @property {number} encouragementHideTimeMs
     * @property {number} glowPulseIntensity
     * @property {number} shimmerPhase
     * @property {number} shimmerStartMs
     * @property {number} inputFlash
     * @property {boolean} debugMode
     * @property {number} debugLastFlux
     * @property {number} debugLastSpread
     * @property {number} debugLastThreshold
     * @property {boolean} debugGateOpen
     * @property {number} debugLastRms
     * @property {number} debugLastConf
     * @property {number} debugLastPitch
     * @property {boolean} debugIsGoodNote
     * @property {boolean} debugIsActivePlay
     * @property {number} debugLastFlatness
     * @property {number} debugLastCrest
     * @property {string} debugOnsetReason
     * @property {number} debugLastCentroid
     * @property {number} debugCentroidCV
     * @property {number} debugSessionConf
     * @property {string} debugSessionState
     * @property {number} debugAgcGain
     * @property {number} debugHarmonicity
     * @property {number} yinSkipCounter
     * @property {{pitch:number, conf:number, rms:number}} cachedPitchResult
     * @property {number} sessionStartTimeMs
     * @property {number} peakFlow
     * @property {number|null} adaptiveSilenceRms
     * @property {number[]|null} recentPitches
     * @property {number} consecutiveOnsetFrames
     * @property {number} lastDebugLogMs
     * @property {number} debugMaxRms
     * @property {number} debugMaxConf
     * @property {number} debugMaxHarm
     * @property {number} debugOnsetCount
     * @property {number|null} lastMidiNoteForStability
     * @property {boolean} micPermissionFailed
     * @property {boolean} micIntentionallySkipped
     * @property {(()=>void)|null} lastIntroDiag
     * @property {LastSummaryShape|null} _lastSummary
     * @property {number} [comboDecayAccum]
     * @property {boolean} [_midiWaitingShown] One-shot guard so the "Waiting for MIDI" hint doesn't re-show on every rescan tick.
     */

    /**
     * @typedef ConfigShape
     *   Tunable runtime constants. Read-only after init; `MAX_PARTICLES`,
     *   `SHADOW_BLUR_ENABLED`, `AMBIENT_PARTICLE_CHANCE` and the bg-star
     *   count are mutated post-init from `PERF_PROFILE`. Treat all other
     *   fields as immutable.
     * @property {number} FFT_SIZE
     * @property {number} SMOOTHING
     * @property {number} PIANO_FREQ_MIN
     * @property {number} PIANO_FREQ_MAX
     * @property {number} ONSET_FFT_SIZE
     * @property {number} ONSET_SMOOTHING
     * @property {number} AGC_TARGET_RMS
     * @property {number} AGC_ATTACK_COEFF
     * @property {number} AGC_RELEASE_COEFF
     * @property {number} AGC_MIN_GAIN
     * @property {number} AGC_MAX_GAIN
     * @property {number} AGC_UPDATE_INTERVAL_MS
     * @property {number} AGC_SILENCE_FLOOR
     * @property {number} AGC_VOICE_REJECT_COUNT
     * @property {number} AGC_VOICE_SUPPRESS_MAX
     * @property {number} AGC_VOICE_SUPPRESS_MS
     * @property {number} AGC_VOICE_RMS_MIN
     * @property {Record<string,string>} NOTE_COLORS
     * @property {number} YIN_THRESHOLD
     * @property {number} YIN_PROBABILITY_THRESHOLD
     * @property {number} RMS_SILENCE_THRESHOLD
     * @property {number} PITCH_MIN_HZ
     * @property {number} PITCH_MIN_HZ_PRACTICE
     * @property {number} PITCH_MAX_HZ
     * @property {number} GOOD_NOTE_RMS
     * @property {number} CONFIDENCE_THRESHOLD
     * @property {number} SPECTRAL_FLUX_THRESHOLD
     * @property {number} SPECTRAL_FLUX_ADAPTIVE_K
     * @property {number} SPECTRAL_FLUX_HISTORY_SIZE
     * @property {number} ONSET_SPREAD_THRESHOLD
     * @property {number} ONSET_SPREAD_MAX
     * @property {number} ONSET_SPREAD_MIN_CHANGE
     * @property {number} FLATNESS_PIANO_MIN
     * @property {number} CREST_VOICE_MAX
     * @property {number} ONSET_GATE_DURATION_MS
     * @property {number} ONSET_COOLDOWN_MS
     * @property {number} FLUX_FREQ_MIN_HZ
     * @property {number} FLUX_FREQ_MAX_HZ
     * @property {number} HARMONICITY_MIN
     * @property {number} HARMONICITY_MIN_PRACTICE
     * @property {number} SESSION_WINDOW_MS
     * @property {number} SESSION_CONFIRM_THRESHOLD
     * @property {number} SESSION_LOSE_THRESHOLD
     * @property {number} SESSION_WARMUP_MS
     * @property {number} SESSION_SAMPLE_INTERVAL_MS
     * @property {number} CENTROID_HISTORY_SIZE
     * @property {number} SCORE_RHYTHM_WEIGHT
     * @property {number} SCORE_DYNAMICS_WEIGHT
     * @property {number} SCORE_STABILITY_WEIGHT
     * @property {number} IOI_HISTORY_SIZE
     * @property {number} IOI_IDEAL_CV
     * @property {number} IOI_MAX_CV
     * @property {number} AMPLITUDE_HISTORY_SIZE
     * @property {number} DYNAMICS_IDEAL_CV_MIN
     * @property {number} DYNAMICS_IDEAL_CV_MAX
     * @property {number} SCORE_UPDATE_INTERVAL_MS
     * @property {number} SCORE_SMOOTHING
     * @property {number} GROWTH_WINDOW_MS
     * @property {number} MOTIVATION_GOAL_MS
     * @property {number} COMBO_WINDOW_MS
     * @property {number} SILENCE_DECAY_START_MS
     * @property {number} SILENCE_HARD_DECAY_MS
     * @property {number} NOISE_PENALTY_COOLDOWN_MS
     * @property {number} NOTE_DISPLAY_DURATION_MS
     * @property {number} MIN_NOTE_INTERVAL_MS
     * @property {number} FLOW_GAIN_BASE
     * @property {number} FLOW_GAIN_COMBO_MAX
     * @property {number} FLOW_GAIN_STABILITY_MAX
     * @property {number} FLOW_GAIN_QUALITY_MAX
     * @property {number} FLOW_DECAY_SOFT
     * @property {number} FLOW_DECAY_HARD
     * @property {number} NOISE_RMS_THRESHOLD
     * @property {number} FLOW_NOISE_PENALTY
     * @property {number} COMBO_DECAY_RATE
     * @property {number} COMBO_NOISE_PENALTY
     * @property {number} STABILITY_SEMITONE_THRESHOLD
     * @property {number} STABILITY_GROWTH
     * @property {number} STABILITY_DECAY_GOOD
     * @property {number} STABILITY_DECAY_IDLE
     * @property {number} MAX_PARTICLES
     * @property {boolean} SHADOW_BLUR_ENABLED
     * @property {number} AMBIENT_PARTICLE_CHANCE
     * @property {number} BAR_COUNT
     * @property {{nameKey:string|null, prefix:string, minFlow:number}[]} STAGES
     * @property {{minCombo:number, messageKey:string, effect:string}[]} ENCOURAGEMENT_TIERS
     * @property {number} ENCOURAGEMENT_COOLDOWN_MS
     * @property {number} ENCOURAGEMENT_DISPLAY_MS
     * @property {readonly string[]} NOTE_NAMES
     * @property {number} PIANO_KEY_MIN
     * @property {number} PIANO_KEY_COUNT
     * @property {ReadonlyArray<{bg:readonly [number,number,number], colors:readonly string[], glow:string}>} THEMES
     * @property {{id:string, nameKey:string, descKey:string, condition:(s:GameStateShape)=>boolean, reward:string}[]} QUESTS
     */

    /**
     * @typedef SectionDef
     *   Per-section quest layout in a song's sectionDefs array. Matches
     *   `@piano/core`'s `BuildSectionsInputDef`: descKey + startMeasure
     *   are required so the section assembler can deterministically
     *   resolve the section's start window and i18n key.
     * @property {string} id
     * @property {string} nameKey
     * @property {string} descKey
     * @property {number} startMeasure
     * @property {boolean=} isBoss
     */

    /**
     * @typedef SongRec
     *   Library song record — both built-in (fur_elise, alla_turca) and
     *   user-added entries share this shape. Fields prefixed `_` are
     *   load-time scratch / late-bound (XML cache, OSMD-derived BPM).
     * @property {string} id
     * @property {string} titleKey
     * @property {string} composerKey
     * @property {string=} icon
     * @property {string} mxlUrl   Empty for user songs (use _isUser check instead).
     * @property {string} xmlUrl
     * @property {SectionDef[]=} sectionDefs
     * @property {OsmdLikeNote[]|null} notes
     * @property {number} totalSec
     * @property {Array<{id:string, nameKey:string, descKey?:string, startMeasure?:number, startSec:number, endSec:number, isBoss?:boolean}>} sections
     * @property {Array<{measure:number, repeat?:number}>} playbackOrder
     * @property {boolean} _loaded
     * @property {Promise<unknown>|null} _loadingPromise
     * @property {string=} _xmlText
     * @property {boolean=} _bpmRescaled
     * @property {number=} bpm
     * @property {string=} _userTitle
     * @property {string=} _userComposer
     * @property {boolean=} _isUser
     * @property {string=} titleJp
     * @property {string=} composerJp
     * @property {Error|string=} _loadError
     * @property {{accuracy:number, timing:number, stars:number}=} _lastResult
     */

    /**
     * @typedef PrefsShape
     *   Persisted user preferences (localStorage `pianoViz_prefs`).
     * @property {number} theme               0..3
     * @property {boolean} synesthesia
     * @property {number|null} audioOffsetMs  null = auto-detect.
     * @property {boolean} debug
     * @property {'en'|'jp'} lang
     */

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
      /** @type {Promise<unknown>} */
      let chain = Promise.resolve();
      let pending = 0;
      /** @param {string|object} msg */
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

    const CONFIG = /** @type {ConfigShape} */ (/** @type {any} */ ({
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
      // Predicates accept the live state. Using `Object.assign` to attach the
      // typed array means each `s => ...` lambda gets contextual typing from
      // QUESTS_DEFS rather than relying on the post-cast ConfigShape, which
      // doesn't propagate back into the literal element types.
      QUESTS: /** @type {ConfigShape['QUESTS']} */ ([])
    }));

    /** @type {ConfigShape['QUESTS']} */
    const QUESTS_DEFS = [
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
    ];
    CONFIG.QUESTS = QUESTS_DEFS;

    // ========================================
    // DOM references
    // ========================================
    // Type assertion: every ID below exists in index.html. The shell
    // crashes immediately on first DOM access if any are missing, so
    // typing as non-null HTMLElement is correct in practice.
    /** @type {Record<string, HTMLElement>} */
    const DOM = /** @type {any} */ ({
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
      fullSongToggle: document.getElementById('fullSongToggle'),
      fullSongRow: document.getElementById('fullSongRow'),
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
      settingsDebugToggle: document.getElementById('settingsDebugToggle'),
    });
    const ctx = /** @type {CanvasRenderingContext2D} */ (
      /** @type {HTMLCanvasElement} */ (DOM.canvas).getContext('2d')
    );

    // ========================================
    // Game State
    // ========================================
    const state = /** @type {GameStateShape} */ (/** @type {any} */ ({
      running: false,
      starting: false,
      flow: 0,
      combo: 0,
      bestCombo: 0,
      currentStage: 0,
      lastGoodNoteTimeMs: 0,
      lastSilenceStartMs: -1,
      lastNoisePenaltyMs: 0,
      // Continuous-MIDI semitones of the most recent onset (mic or MIDI).
      // Replaces legacy lastPitch (Hz) + lastMidiNoteForStability (int).
      lastPitchSemitones: null,

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
    }));

    // ========================================
    // Session Confidence Ring Buffer (pre-allocated, zero-alloc at runtime)
    // ========================================
    const SESSION_RING_CAP = 100;
    const sessionRing = new Array(SESSION_RING_CAP);
    for (let i = 0; i < SESSION_RING_CAP; i++) sessionRing[i] = { timeMs: 0, isPiano: false };

    // ========================================
    // Audio — dual analyser + software AGC
    // ========================================
    // Audio-graph singletons. Typed as non-null because every call-site
    // reads them only after `initAudio()` has populated them; the IIFE
    // bootstraps from `startBtn.click → initAudio → loop()`, so any
    // code path that touches these post-init is guaranteed a live value.
    // The casts pin TS to the post-init view; the runtime values are
    // null until init, but no reader fires before that.
    /** @type {AudioContext} */
    let audioCtx = /** @type {AudioContext} */ (/** @type {unknown} */ (null));
    /** @type {AnalyserNode} */
    let analyser = /** @type {AnalyserNode} */ (/** @type {unknown} */ (null));
    /** @type {AnalyserNode} */
    let onsetAnalyser = /** @type {AnalyserNode} */ (/** @type {unknown} */ (null));
    /** @type {GainNode} */
    let gainNode = /** @type {GainNode} */ (/** @type {unknown} */ (null));
    /** @type {Uint8Array<ArrayBuffer>} */
    let dataArray = /** @type {Uint8Array<ArrayBuffer>} */ (/** @type {unknown} */ (null));
    /** @type {Float32Array<ArrayBuffer>} */
    let freqArray = /** @type {Float32Array<ArrayBuffer>} */ (/** @type {unknown} */ (null));
    /** @type {Uint8Array<ArrayBuffer>} */
    let onsetDataArray = /** @type {Uint8Array<ArrayBuffer>} */ (/** @type {unknown} */ (null));
    /** @type {MediaStream | null} v13: keep ref so we can stop tracks when MIDI takes over */
    let micStream = null;
    /** @type {MediaStreamAudioSourceNode | null} v13: rewireable source between gainNode and the live mic */
    let micSourceNode = null;

    // Phase 0d batch 5: audio context + graph builder live in
    // packages/web/src/audio-init.ts. Aliases keep the short identifiers
    // working at all the legacy callsites unchanged.
    const MIC_CONSTRAINTS = AudioInit.MIC_CONSTRAINTS;
    const AUDIO_SAMPLE_RATE = AudioInit.AUDIO_SAMPLE_RATE;
    const createAudioContext = AudioInit.createAudioContext;

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
      } else if (isAppleMobile() && typeof navigator.requestMIDIAccess === 'function') {
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

    /** @type {Promise<unknown>|null} */
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
    /** @type {number} canvas width in CSS pixels */
    let W = 0;
    /** @type {number} canvas height in CSS pixels */
    let H = 0;
    /** @type {number} bottom inset (safe-area + small pad), CSS px */
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
      const canvas = /** @type {HTMLCanvasElement} */ (DOM.canvas);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Cached so the per-frame draw can skip getComputedStyle / Math.min/max.
      const cs = getComputedStyle(document.documentElement);
      /** @param {string} name */
      const readPx = (name) => parseFloat(cs.getPropertyValue(name)) || 0;
      kbSafeBottom = readPx('--safe-bottom') + 4;
      safeLeft = readPx('--safe-left');
      safeRight = readPx('--safe-right');
      kbHeight = Math.min(56, Math.max(38, H * 0.065));
      if (state.running) maybeReinitBgStars(prevW, prevH);
      _bgStarsPrevW = W;
      _bgStarsPrevH = H;
    }
    // Phase 0d batch 28: pure bg-stars decision moved to
    // packages/web/src/viewport-layout.ts. Shell still owns
    // initBgStars + the per-star position mutation.
    /** @param {number} prevW @param {number} prevH */
    function maybeReinitBgStars(prevW, prevH) {
      const decision = ViewportLayout.decideBgStarsAction(prevW, prevH, W, H, !!_bg);
      if (decision.action === 'reinit') {
        initBgStars();
        return;
      }
      const { sx, sy } = decision;
      // _bg is non-null when we're in the 'scale' branch (the
      // !_bg case routes to 'reinit' inside decideBgStarsAction).
      if (!_bg) return;
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
    // Phase 0d batch 28: syncLayout + refreshOsmdRect + onResizeBurst
    // + cached OSMD rect + currentLayoutMode + per-write skip caches
    // moved to packages/web/src/viewport-layout.ts. The shell holds
    // the cachedOsmdRect ref so drawPracticeLane reads it every
    // frame without going through the factory.
    const cachedOsmdRect = ViewportLayout.makeCachedOsmdRect();
    const _viewportLayout = ViewportLayout.createViewportLayout({
      dom: {
        practiceTopBar: DOM.practiceTopBar,
        themeBar: DOM.themeBar,
        osmdContainer: DOM.osmdContainer,
      },
      getKbHeight: () => kbHeight,
      cachedOsmdRect,
    });
    /** @returns {string} */
    function detectLayout() { return _viewportLayout.getCurrentLayoutMode(); }
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

    // ========================================
    // Theme switching + persisted user preferences
    // ========================================
    /** @type {PrefsShape} */
    const prefs = /** @type {any} */ ({
      theme: 0,
      synesthesia: false,
      audioOffsetMs: null,   // null = auto-detect from AudioContext.outputLatency
      debug: false,
      lang: 'en'             // 'en' | 'jp' — practice-flow UI language
    });
    /** @template T @param {string} key @param {T} fallback @returns {T} */
    // Phase 0d batch 23: prefs storage (loadJSON / saveJSON +
    // sanitizePrefs accept-list) moved to packages/web/src/prefs-storage.ts.
    // The shell rebinds to the legacy short names so the rest of the
    // file (10 callsites + dev-mode self-test) keeps working.
    const _prefsStore = PrefsStorage.createJSONStore();
    /** @template T @param {string} key @param {T} fallback @returns {T} */
    function loadJSON(key, fallback) { return _prefsStore.loadJSON(key, fallback); }
    /** @param {string} key @param {unknown} val */
    function saveJSON(key, val) { _prefsStore.saveJSON(key, val); }
    Object.assign(prefs, PrefsStorage.sanitizePrefs(loadJSON('pianoViz_prefs', {})));
    function savePrefs() { saveJSON('pianoViz_prefs', prefs); }

    // ========================================
    // i18n — practice-flow strings + t() (Phase 0d batch 4)
    // ========================================
    // Translation table + t() helper now live in @piano/core. The shell
    // wires `prefs.lang` (reactive — read fresh on every call so language
    // switches don't need a closure rebuild) and a `userResolver` for the
    // synthetic `__userTitle:<id>` / `__userComposer:<id>` keys that
    // pull from the in-memory SONGS map (built from IndexedDB at boot).
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

    function applyI18n() {
      document.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]').forEach(rawEl => {
        const el = /** @type {HTMLInputElement} */ (rawEl); // widest of the targets — has title + placeholder + textContent
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

    // setLang moved to theme-controls.ts (Phase 0d batch 7a) — exposed
    // as `_themeControls.setLang` after createThemeControls() runs below.

    // Stage label — Phase 0b.3: delegated to @piano/core.
    /** @param {ConfigShape['STAGES'][number]} stage */
    const stageLabel = (stage) => PianoCore.stageLabel(stage, t);

    // Phase 0d batch 7a: theme bar + synesthesia toggle + lang toggle
    // moved to packages/web/src/theme-controls.ts. The shell still owns
    // `applyI18n()` and `refreshSettingsPanel()`; the controls module
    // calls back into them via the deps object.
    // refreshSettingsPanel + applyI18n are forward-declared below /
    // already declared above; we wire them through a thunk so a future
    // re-order can't capture stale placeholder refs.
    const _themeControls = ThemeControls.createThemeControls({
      prefs: /** @type {import('./theme-controls').ThemeControlsPrefs} */ (
        /** @type {any} */ (prefs)
      ),
      state: /** @type {import('./theme-controls').ThemeControlsStateRef} */ (
        /** @type {any} */ (state)
      ),
      savePrefs,
      applyI18n: () => applyI18n(),
      refreshSettingsPanel: () => refreshSettingsPanel(),
    });
    const applyTheme = _themeControls.applyTheme;
    const applySynesthesia = _themeControls.applySynesthesia;
    const setLang = _themeControls.setLang;
    // Seed the UI from persisted prefs (the click handlers attached
    // inside createThemeControls take care of subsequent updates).
    applyTheme(prefs.theme);
    applySynesthesia(prefs.synesthesia);

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
      /** @type {Array<{el:HTMLElement, prev:Element|null, onKey:(e:KeyboardEvent)=>void}>} */
      const stack = [];
      /** @param {HTMLElement} modalEl */
      function trapHandler(modalEl) {
        /** @param {KeyboardEvent} e */
        return (e) => {
          if (e.key !== 'Tab') return;
          const items = modalEl.querySelectorAll(FOCUSABLE);
          if (items.length === 0) return;
          const first = /** @type {HTMLElement} */ (items[0]);
          const last = /** @type {HTMLElement} */ (items[items.length - 1]);
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
        /** @param {HTMLElement|null} modalEl */
        open(modalEl) {
          if (!modalEl) return;
          const prev = document.activeElement;
          const onKey = trapHandler(modalEl);
          modalEl.addEventListener('keydown', /** @type {EventListener} */ (onKey));
          stack.push({ el: modalEl, prev, onKey });
          // Defer focus until the modal is laid out (display flips happen
          // synchronously but querySelector inside a hidden tree is fine).
          requestAnimationFrame(() => {
            const first = /** @type {HTMLElement|null} */ (modalEl.querySelector(FOCUSABLE));
            if (first) first.focus();
          });
        },
        /** @param {HTMLElement|null} modalEl */
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
              const prev = /** @type {HTMLElement|null} */ (entry.prev);
              if (prev && typeof prev.focus === 'function') {
                try { prev.focus(); } catch (_) {}
              }
              return;
            }
          }
        },
      };
    })();

    // Settings panel — Phase 0d batch 3: extracted to
    // packages/web/src/settings-panel.ts. The shell wires the DOM bag +
    // shared state refs (prefs, practice, state, midiInput) and forwards
    // the few cross-module callbacks (rescanMidi, connectBleMidi,
    // showSessionSummary). We forward-declare openSettings /
    // closeSettings / refreshSettingsPanel because the ESC handler
    // (line ~1865) and other call sites reference them by short name;
    // the createSettingsPanel call site lower in the file rebinds them
    // (search "settings-panel wire-up").
    /** @type {() => void} */
    let openSettings = () => {};
    /** @type {() => void} */
    let closeSettings = () => {};
    /** @type {() => void} */
    let refreshSettingsPanel = () => {};
    // Section-editor + user-songs UI placeholders (Phase 0d batches 2 + 6).
    // Both modals' lifecycle lives in their respective .ts modules; the
    // placeholders here let the ESC handler + cross-cutting callsites
    // reference the short names without TDZ surprises. Reassigned at the
    // bottom-anchored wire-up site (search for "user-songs wire-up").
    /** @type {(songId: string) => Promise<void>} */
    let openSectionEditor = async () => {};
    /** @type {() => void} */
    let closeSectionEditor = () => {};
    /** @type {() => void} */
    let openAddSongModal = () => {};
    /** @type {() => void} */
    let closeAddSongModal = () => {};
    /** @type {() => void} */
    let renderUserSongButtons = () => {};
    // Practice-flow placeholder — Phase 0d batch 7b. Reassigned after
    // createPracticeFlow() runs lower in the file. The songBack click
    // handler closes over this binding to drive returnToTitle without
    // creating a circular dep on practice-flow.ts before the wire-up.
    /** @type {() => void} */
    let returnToTitle = () => {};
    // Result-card placeholder — Phase 0d batch 10. Reassigned after
    // createResultCard() runs near the bottom of the file. The
    // practice-tick wire-up captures `completePracticeSection` via a
    // thunk so the live binding is looked up at section-complete time,
    // not at IIFE-eval time (which would hit TDZ).
    /** @type {() => void} */
    let completePracticeSection = () => {};
    /** @type {() => void} */
    let renderResultCard = () => {};
    // Session-summary placeholders — Phase 0d batch 11. Reassigned at
    // createSessionSummary() wire-up below. Settings-panel deps already
    // pass `() => showSessionSummary()` (a thunk) so the late binding
    // works through that path; langchange listener also late-binds.
    /** @type {() => void} */
    let showSessionSummary = () => {};
    /** @type {(animate: boolean) => void} */
    let renderSessionSummaryText = (_animate) => {};
    /** @type {(combo: number, flow: number) => import('./session-summary').BestScores} */
    let saveBestScores = (_c, _f) => /** @type {import('./session-summary').BestScores} */ ({ bestCombo: 0, peakFlow: 0, totalSessions: 0 });
    // Single, ordered ESC handler for every modal. Highest-z first so the
    // topmost layer pops first; if the user is currently typing inside an
    // <input> / <textarea> we let the browser's native ESC handling run
    // (clears the field) instead of nuking the modal mid-edit.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Don't shadow the t() translator; ESC inside an input clears the
      // browser's native field — let it run instead of nuking the modal.
      const tgt = /** @type {HTMLInputElement|null} */ (e.target);
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

    // settings-panel wire-up moved below — see "settings-panel wire-up".
    // Reason: createSettingsPanel needs `practice`, `midiInput`, and
    // `DEFAULT_AUDIO_OFFSET_MS` which are declared further down the file.
    // The forward-declared placeholders above are reassigned at the
    // bottom-anchored call site (search for the matching marker comment).

    // updateDebugOverlay() reads state.debugMode each frame, so applyDebug
    // must keep prefs.debug and state.debugMode in lockstep.
    /** @param {boolean} on */
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

    // Language toggle wiring (en ↔ jp) lives in theme-controls.ts now.
    // The shell still seeds the document language from persisted prefs on
    // boot — applyI18n is the cross-cutting DOM walker, kept in shell.
    document.documentElement.lang = prefs.lang === 'jp' ? 'ja' : 'en';
    applyI18n();
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
    /** @param {number} x @param {number} y @param {number} z @param {number} size */
    const project3D = (x, y, z, size) => PianoCore.project3D(x, y, z, size, { screenW: W, screenH: H });

    // Particle system (3D) \u2014 Phase 0b.3: delegated to @piano/core.
    // Monkey-patch core's Particle.prototype.draw so the legacy positional
    // draw(c) signature continues to work everywhere \u2014 closures provide
    // the deps that the new API takes via opts.
    /** @type {InstanceType<typeof PianoCore.Particle>[]} */
    let particles = [];
    const _coreParticleDraw = PianoCore.Particle.prototype.draw;
    PianoCore.Particle.prototype.draw = function (/** @type {CanvasRenderingContext2D} */ c) {
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
    /** @param {string} noteName */
    const getNoteColor = (noteName) => PianoCore.getNoteColor(noteName, CONFIG.NOTE_COLORS);

    // spawnBurst / spawnStream — Phase 0b.3: adapter passes legacy closure
    // state (W/H/themeColors/flow/MAX_PARTICLES_3D) via opts so call sites
    // stay positional.
    /** @param {string=} overrideColor */
    const _spawnOpts = (overrideColor) => ({
      screenW: W,
      screenH: H,
      themeColors: CONFIG.THEMES[state.currentTheme].colors,
      flow: state.flow,
      maxParticles: MAX_PARTICLES_3D,
      overrideColor,
    });
    /** @param {number} screenX @param {number} screenY @param {number} count @param {number} energy @param {string=} overrideColor */
    const spawnBurst = (screenX, screenY, count, energy, overrideColor) =>
      PianoCore.spawnBurst(particles, screenX, screenY, count, energy, _spawnOpts(overrideColor));
    /** @param {number} screenX @param {number} screenY @param {number} energy @param {string=} overrideColor */
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
    /** @param {number=} count */
    const effectStarShower = (count) => PianoCore.effectStarShower(_effectDeps(), count);
    const effectFlowerBurst = () => PianoCore.effectFlowerBurst(_effectDeps());
    const effectShimmer = () => PianoCore.effectShimmer(_effectDeps());
    const effectRadiance = () => PianoCore.effectRadiance(_effectDeps());
    const effectGoldenBurst = () => PianoCore.effectGoldenBurst(_effectDeps());
    /** @param {string} name */
    const triggerEffect = (name) => PianoCore.triggerEffect(name, _effectDeps());

    // Encouragement tier escalator — Phase 0b.3: state machine in @piano/core.
    // Legacy state.currentEncouragementTier / lastEncouragementTimeMs /
    // encouragementHideTimeMs are mirrored from the core state each tick so
    // existing reads (resetSession, quest predicates, debug overlay) keep
    // working unchanged.
    const _encState = PianoCore.initEncouragementState();
    const _encOpts = { tiers: CONFIG.ENCOURAGEMENT_TIERS, displayMs: CONFIG.ENCOURAGEMENT_DISPLAY_MS };
    /** @param {import('@piano/core').EncouragementOutput} out */
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
    /** @type {InstanceType<typeof PianoCore.Ripple>[]} */
    let ripples = [];
    const _coreRippleUpdate = PianoCore.Ripple.prototype.update;
    PianoCore.Ripple.prototype.update = function () {
      return _coreRippleUpdate.call(this, { flow: state.flow });
    };
    const _coreRippleDraw = PianoCore.Ripple.prototype.draw;
    PianoCore.Ripple.prototype.draw = function (/** @type {CanvasRenderingContext2D} */ c) {
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
    /** @type {ReturnType<typeof PianoCore.initBackground>|null} */
    let _bg = null;
    function initBgStars() {
      _bg = PianoCore.initBackground({
        screenW: W,
        screenH: H,
        starCount: PERF_PROFILE.bgStarCount,
      });
    }
    const _themeColors = () => CONFIG.THEMES[state.currentTheme].colors;
    /** @param {number} _time */
    const drawBgStars = (_time) => {
      if (!_bg) return;
      PianoCore.drawBgStars(ctx, _bg, { flow: state.flow, themeColors: _themeColors() });
    };
    /** @param {number} time */
    const drawAurora = (time) =>
      PianoCore.drawAurora(ctx, {
        screenW: W,
        screenH: H,
        flow: state.flow,
        themeColors: _themeColors(),
        timeMs: time,
      });
    /** @param {number} time */
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
    /** @param {number} timeMs @param {number} currentPitchHz */
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
    /** @param {number} timeMs @param {boolean} isPianoDetected */
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

    /** @param {number} timeMs */
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
        if (!quest) return; // unknown quest id \u2014 defensive, shouldn't happen
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

    // Per-onset ring-buffer maintenance — Phase 0b.3: delegated to
    // @piano/core/state/quality-history. Mic onset detector and MIDI note-on
    // both feed the same three buffers (noteOnsetTimes / ioiHistory /
    // amplitudeHistory); centralizing here keeps debounce + IOI window
    // identical aside from each path's own debounceMs preference.
    const QH_OPTS_MIC = {
      debounceMs: 80,
      minIoiMs: 100,
      maxIoiMs: 5000,
      ioiHistorySize: CONFIG.IOI_HISTORY_SIZE,
      amplitudeHistorySize: CONFIG.AMPLITUDE_HISTORY_SIZE,
    };
    const QH_OPTS_MIDI = { ...QH_OPTS_MIC, debounceMs: 30 };

    // Pitch stability — Phase 0b.3: delegated to @piano/core/state/pitch-stability.
    // Mic onsets feed pitchHzToSemitones(pitchHz); MIDI feeds midiNum directly.
    // Both produce continuous-MIDI semitones, so source-switching mid-session
    // keeps the prior-pitch comparison meaningful (legacy used two parallel
    // trackers — `state.lastPitch` in Hz and `state.lastMidiNoteForStability`
    // in MIDI int — and kept them weakly synchronized).
    const PS_OPTS = {
      semitoneThreshold: CONFIG.STABILITY_SEMITONE_THRESHOLD,
      growth: CONFIG.STABILITY_GROWTH,
      decayOnJump: CONFIG.STABILITY_DECAY_GOOD,
      idleHalfLifeSec: 5.0,
      activePlayRate: 0.005,
      activePlayFloor: 0.2,
    };

    // Chord aggregation window — Phase 0b.3: delegated to
    // @piano/core/audio/chord-window. Reducer mutates midiState's recentOnsets
    // / lastChordName / lastChordTimeMs in place; downstream renderers read
    // those fields off the same object so wiring is one call per onset.
    // Note: pull detectChord straight off PianoCore (the local `const
    // detectChord = PianoCore.detectChord` alias lives ~3000 lines below
    // this point, which would put us in its TDZ at module-init time).
    const CW_OPTS = {
      windowMs: 80,
      minNotes: 3,
      repeatCooldownMs: 600,
      detectChord: PianoCore.detectChord,
    };

    // Wake-up flash — Phase 0b.3: delegated to @piano/core/state/wake-up-flash.
    // Half-life ≈0.071s matches the legacy 60Hz `*= 0.85`-per-frame feel
    // (log(0.5)/log(0.85) ≈ 4.27 frames @ 60fps), but the new decay is time-
    // based so 144Hz screens don't fade twice as fast as 60Hz ones.
    const WUF_OPTS = { triggerLevel: 0.2, halfLifeSec: 0.071 };

    /** @param {number} timeMs */
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

    /** @param {number} timeMs */
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
    /** @param {number} timeMs @param {number} postGainRms */
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
    /** @param {number} timeMs @param {number} dt @param {{pitch:number, conf:number, rms:number}} pitchResult */
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
        PianoCore.applyOnsetToHistory(state, timeMs, rms, QH_OPTS_MIC);
      }

      updateQualityScores(timeMs);

      const dtSec = dt / 1000;
      const isPerforming = state.sessionState === 'performing';
      const isWarmup = state.sessionState === 'warmup';

      if (isOnsetNote && !midiDrivingHistories) {
        PianoCore.applyOnsetPitch(state, PianoCore.pitchHzToSemitones(pitch), PS_OPTS);
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
        PianoCore.applyActivePlay(state, PS_OPTS);
      } else {
        // Idle exponential decay (frame-rate independent via dtSec).
        PianoCore.decayStability(state, dtSec, PS_OPTS);

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
    /** @param {number} timeMs */
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
    /** @param {number} timeMs */
    function loop(timeMs) {
      if (!state.running) return;
      requestAnimationFrame(loop);

      // Phase 0d batch 9a: frame setup + atmospheric layers + wake-up
      // flash + glow pulse + center glow + shimmer overlay live in
      // packages/web/src/render-frame.ts. Returns the dt + theme + glow
      // value the rest of the loop needs.
      const { dt, theme } = RenderFrame.runRenderFramePrelude(timeMs, {
        ctx,
        state: /** @type {import('./render-frame').RenderFrameStateRef} */ (
          /** @type {any} */ (state)
        ),
        getScreen: () => ({ W, H }),
        themes: /** @type {ReadonlyArray<import('./render-frame').RenderFrameTheme>} */ (
          /** @type {any} */ (CONFIG.THEMES)
        ),
        drawBgStars,
        drawAurora,
        drawGroundFlowers,
        decayWakeUpFlash: PianoCore.decayWakeUpFlash,
        drawCenterGlow: PianoCore.drawCenterGlow,
        wufOpts: WUF_OPTS,
        getEnergy,
      });

      // Phase 0d batch 18: mic frame pipeline (YIN throttle + AGC +
      // mic meter + game-state + practice tick + mic-driven note
      // spawn) lives in packages/web/src/mic-pipeline.ts. Returns
      // `{ isGoodNote }` so the caller can route follow-up work.
      const { isGoodNote } = MicPipeline.tickMicPipeline(timeMs, dt, {
        analyser,
        audioCtx,
        freqArray,
        detectPitchYIN,
        updateAGC,
        updateGameState,
        state: /** @type {import('./mic-pipeline').MicPipelineState} */ (
          /** @type {any} */ (state)
        ),
        practice: /** @type {import('./mic-pipeline').MicPipelinePracticeRef} */ (
          /** @type {any} */ (practice)
        ),
        midiInput: /** @type {import('./mic-pipeline').MicPipelineMidiRef} */ (
          /** @type {any} */ (midiInput)
        ),
        micMeter: DOM.micMeter,
        micMeterFill: DOM.micMeterFill,
        introHint: DOM.introHint,
        hideIntroHint,
        updatePractice,
        freqToNote: /** @type {(freq: number) => import('./mic-pipeline').NoteDescriptor | null} */ (
          /** @type {any} */ (freqToNote)
        ),
        getNoteColor,
        spawnBurst,
        spawnStream,
        ripples: /** @type {import('./mic-pipeline').RipplesArray} */ (
          /** @type {any} */ (ripples)
        ),
        Ripple: /** @type {import('./mic-pipeline').RippleCtor} */ (
          /** @type {any} */ (Ripple)
        ),
        showNoteDisplay,
        triggerWakeUpFlash: PianoCore.triggerWakeUpFlash,
        wufOpts: WUF_OPTS,
        theme,
        screen: { W, H },
        config: {
          MIN_NOTE_INTERVAL_MS: CONFIG.MIN_NOTE_INTERVAL_MS,
          PITCH_MIN_HZ: CONFIG.PITCH_MIN_HZ,
          PIANO_KEY_MIN: CONFIG.PIANO_KEY_MIN,
          PIANO_KEY_COUNT: CONFIG.PIANO_KEY_COUNT,
        },
      });
      void isGoodNote; // currently unused after extraction; reserved for future hooks

      // Phase 0d batch 9b: note-display fade + ambient particle spawn
      // + spectrum bars moved to packages/web/src/render-mid.ts. The
      // silence gate (`smoothEnergy > 0.03`) still lives in the caller
      // so silent frames skip the spectrum work entirely.
      RenderMid.tickNoteDisplayFade(timeMs, {
        noteDisplayEl: DOM.noteDisplay,
        state: /** @type {import('./render-mid').RenderMidStateRef} */ (
          /** @type {any} */ (state)
        ),
        noteDisplayDurationMs: CONFIG.NOTE_DISPLAY_DURATION_MS,
      });

      RenderMid.spawnAmbientParticle({
        state: /** @type {import('./render-mid').RenderMidStateRef} */ (
          /** @type {any} */ (state)
        ),
        theme,
        screen: { W, H },
        particles: /** @type {import('./render-mid').ParticlesArray} */ (
          /** @type {any} */ (particles)
        ),
        maxParticles: CONFIG.MAX_PARTICLES,
        ambientChance: CONFIG.AMBIENT_PARTICLE_CHANCE,
        Particle: /** @type {import('./render-mid').ParticleCtor} */ (
          /** @type {any} */ (Particle)
        ),
      });

      if (analyser && state.smoothEnergy > 0.03) {
        RenderMid.runSpectrumBars({
          ctx,
          dataArray,
          sampleRate: audioCtx.sampleRate,
          fftSize: analyser.fftSize,
          pianoFreqMin: CONFIG.PIANO_FREQ_MIN,
          pianoFreqMax: CONFIG.PIANO_FREQ_MAX,
          barCount: CONFIG.BAR_COUNT,
          themeColors: theme.colors,
          flow: state.flow,
          screen: { W, H },
          drawSpectrumBars: PianoCore.drawSpectrumBars,
        });
      }

      // Phase 0d batch 9c: late-frame draw + tail (MIDI beams,
      // ripples + particles update/draw/cull, chord display, virtual
      // keyboard, practice lane, quest + playtime + debug HUD) live
      // in packages/web/src/render-late.ts.
      RenderLate.runRenderLate(timeMs, {
        ctx,
        ripples: /** @type {import('./render-late').RippleArray} */ (
          /** @type {any} */ (ripples)
        ),
        particles: /** @type {import('./render-late').ParticleArray} */ (
          /** @type {any} */ (particles)
        ),
        midiInput: /** @type {import('./render-late').RenderLateMidiRef} */ (
          /** @type {any} */ (midiInput)
        ),
        practice: /** @type {import('./render-late').RenderLatePracticeRef} */ (
          /** @type {any} */ (practice)
        ),
        isFreeplayActive,
        maxParticles: CONFIG.MAX_PARTICLES,
        drawMidiBeams,
        drawMidiChordDisplay,
        drawMidiKeyboard,
        drawPracticeLane,
        updateQuestState,
        updatePlayTime,
        updateDebugOverlay,
      });
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
    // Shared helpers (kept in shell — used by both the session-summary
    // module + the per-frame loop / other render call sites).
    // ========================================
    // formatTime — Phase 0b: delegated to @piano/core/util/format.
    const formatTime = PianoCore.formatTime;
    /** @param {number} timeMs */
    function updatePlayTime(timeMs) {
      if (DOM.playTime) {
        DOM.playTime.textContent = formatTime(timeMs - state.sessionStartTimeMs);
      }
    }
    // Sizes a canvas to the given CSS pixels with backing store scaled
    // by devicePixelRatio, then returns the 2D context with the DPR
    // transform pre-applied. Shared by result-card.drawHistoryChart and
    // session-summary.drawRadarChart via deps.setupHiDPICanvas.
    /** @param {HTMLCanvasElement} canvas @param {number} w @param {number} h */
    function setupHiDPICanvas(canvas, w, h) {
      const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return c;
    }

    // ========================================
    // Session summary modal — Phase 0d batch 11 wire-up
    // ========================================
    // saveBestScores + renderSessionSummaryText + showSessionSummary
    // + drawRadarChart now live in packages/web/src/session-summary.ts.
    // The shell wraps the factory result in the legacy short names so
    // settings-panel deps + the langchange listener stay unchanged.
    {
      const _sessionSummary = SessionSummary.createSessionSummary({
        dom: /** @type {import('./session-summary').SessionSummaryDom} */ ({
          sessionSummary: DOM.sessionSummary,
          sumCombo: DOM.sumCombo,
          sumStage: DOM.sumStage,
          sumTime: DOM.sumTime,
          sumQuestList: DOM.sumQuestList,
          sumBest: DOM.sumBest,
          radarChart: /** @type {HTMLCanvasElement} */ (DOM.radarChart),
        }),
        state: /** @type {import('./session-summary').SessionSummaryStateRef} */ (
          /** @type {any} */ (state)
        ),
        config: /** @type {import('./session-summary').SessionSummaryConfig} */ (
          /** @type {any} */ (CONFIG)
        ),
        loadJSON,
        saveJSON,
        stageLabel,
        formatTime,
        t,
        setupHiDPICanvas,
      });
      saveBestScores = _sessionSummary.saveBestScores;
      renderSessionSummaryText = _sessionSummary.renderSessionSummaryText;
      showSessionSummary = _sessionSummary.showSessionSummary;
    }

    function resetSession() {
      state.flow = 0;
      state.combo = 0;
      state.bestCombo = 0;
      state.currentStage = 0;
      state.pitchStability = 0;
      // Phase 0b.3: in-place buffer reset preserves array identity, so any
      // ArrayLike consumers caching the ref (quality.ts) keep working.
      PianoCore.resetQualityHistoryState(state);
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
      state.lastPitchSemitones = null;
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
      PianoCore.resetWakeUpFlashState(state);
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
      midiState.sustainOn = false;
      // Chord-window fields cleared via the dedicated reducer reset.
      PianoCore.resetChordWindowState(midiState);
      // Drop the BLE-redelivery dedupe cache too; otherwise a long mic-only
      // session that included a stray MIDI note can theoretically swallow
      // the first MIDI note after a reconnect (same `(midi<<8)|velocity`
      // happening to fall inside the 30 ms window). Cache lives inside
      // packages/web/src/midi-dispatch.ts since batch 22.
      _midiDispatch.reset();
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
    /** @param {string} id @param {string} titleKey @param {string} composerKey @param {string} icon @param {SectionDef[]} sectionDefs @returns {SongRec} */
    function makeSong(id, titleKey, composerKey, icon, sectionDefs) {
      return /** @type {SongRec} */ (/** @type {any} */ ({
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
      }));
    }
    /** @type {Record<string, SongRec>} */
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
    /** @type {Promise<IDBDatabase>|null} */
    let _userDbPromise = null;
    function openUserDb() {
      if (_userDbPromise) return _userDbPromise;
      _userDbPromise = PianoCore.openUserDb();
      return _userDbPromise;
    }
    async function userDbAll() {
      return PianoCore.userDbAll(await openUserDb());
    }
    /** @param {import('@piano/core').UserSongRecord} record */
    async function userDbPut(record) {
      return PianoCore.userDbPut(await openUserDb(), record);
    }
    /** @param {string} id */
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
    /** @param {Blob} blob */
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
      const scoreFile = zip.file(scorePath);
      if (!scoreFile) throw new Error('Score file vanished from zip mid-parse: ' + scorePath);
      return scoreFile.async('text');
    }

    // Promote a stored-or-just-fetched record into the SONGS registry. Returns
    // the song so the caller can selectSong(...) it immediately.
    //
    // For .mxl records we always feed OSMD a plain-XML blob URL (built from
    // the cached `record.xmlText` if present, else lazily unzipped here and
    // written back to IndexedDB so subsequent loads are instant). This sidesteps
    // OSMD's blob-MIME-detection issue on Android Chrome.
    /** @param {import('@piano/core').UserSongRecord} record */
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
      /** @type {SongRec} */
      const song = /** @type {any} */ ({
        id: record.id,
        titleKey: '__userTitle:' + record.id,   // resolved by t() override below
        composerKey: '__userComposer:' + record.id,
        icon: '🎵',
        // After unzip, the song carries an xml URL whether the source was .mxl or .xml.
        // The few branches that key off "is this a user .mxl?" use _isUser instead now.
        mxlUrl: '',  // user songs have no .mxl URL — checked via _isUser
        xmlUrl: url,
        // Propagate the unzipped xmlText so loadCurrentScore's parseScore
        // pass + fetchPlaybackOrder both reuse it instead of re-fetching the
        // blob: URL — Android Chrome was occasionally hanging on the second
        // blob fetch of a just-imported user song.
        _xmlText: xmlText || undefined,
        sectionDefs: record.sectionDefs,
        notes: null, totalSec: 0, sections: [], playbackOrder: [],
        _loaded: false, _loadingPromise: null,
        _isUser: true,
        _userTitle: record.title || record.id,
        _userComposer: record.composer || ''
      });
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
    /** @param {Blob} blob @param {{filename?:string, source?:string, allowAcceptSession?:boolean, titleOverride?:string, composerOverride?:string}} [opts] */
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
      /** @type {import('@piano/core').UserSongRecord} */
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
    /** @param {string} url @param {{filename?:string, source?:string, allowAcceptSession?:boolean, titleOverride?:string, composerOverride?:string}} [opts] */
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
    /** @param {string} id @param {string} newTitle @param {string} newComposer */
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

    /** @param {string} id */
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
    /** @param {Parameters<typeof PianoCore.libraryEntryFromGhFile>[0]} f */
    function libraryEntryFromGhFile(f) {
      return PianoCore.libraryEntryFromGhFile(f, {
        pinnedSha: LIBRARY_PINNED_SHA,
        jpOverrides: LIBRARY_JP,
      });
    }

    /** @param {boolean} [force] */
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
        .filter((/** @type {{type:string,name:string}} */ f) => f.type === 'file' && /\.mxl$/i.test(f.name))
        .map(libraryEntryFromGhFile)
        .sort((/** @type {{label:string}} */ a, /** @type {{label:string}} */ b) => a.label.localeCompare(b.label));
      try {
        localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), entries }));
      } catch (e) {}
      return entries;
    }

    // Tiny seed used while the API request is in flight, and as fallback if the
    // network is unreachable. Never replaces the live catalog once loaded.
    /** @type {Array<Partial<import('@piano/core').LibraryEntry> & {url:string, label:string, icon:string}>} */
    const LIBRARY_SEED = [
      { url: 'https://cdn.jsdelivr.net/gh/musetrainer/library@9128876f6164d96997c877a2be843349a32bdabb/scores/Pachelbel_Canon_in_D.mxl',  label: 'Pachelbel — Canon in D',  icon: '🎻' },
      { url: 'https://cdn.jsdelivr.net/gh/musetrainer/library@9128876f6164d96997c877a2be843349a32bdabb/scores/Satie_Gymnopedie_No._1.mxl', label: 'Satie — Gymnopédie No. 1', icon: '🌿' }
    ];
    /** @type {Array<Partial<import('@piano/core').LibraryEntry> & {url:string, label:string, icon:string}>} */
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
    /** @type {any} OSMD instance (typed `any` because OSMD's surface is wide and version-fragile;
     *  consumers go through osmdAdapter for the typed boundary). */
    let osmd = null;
    /** @type {Promise<any> | null} */
    let _osmdInitPromise = null;

    // Phase 0d batch 29: OSMD ctor + load + render + repetition
    // activation + cursor show/reset moved to packages/web/src/osmd-init.ts.
    // The shell still owns the `osmd` ref because many other callsites
    // (extractNotesFromOsmd, osmdScrollToCursor, setOsmdCursorToNote,
    // clearNoteHighlights, highlightCurrentNotes, drawPracticeLane)
    // read it directly.
    const _osmdInit = OsmdInit.createOsmdInit({
      opensheetmusicdisplay:
        typeof opensheetmusicdisplay !== 'undefined' ? opensheetmusicdisplay : undefined,
      getCurrentSong: () => /** @type {any} */ (currentSong),
    });
    async function initOsmd() {
      const inst = await _osmdInit.initOsmd();
      osmd = /** @type {any} */ (inst);
      return osmd;
    }

    // Tied-note coalescer — Phase 0c: delegated to
    // @piano/core/library/merge-tied-notes. The legacy shim toggles
    // sample collection off when REMOTE_LOG_ENABLED is false so the
    // production hot path doesn't pay for the per-merge toFixed + push.
    /** @param {Parameters<typeof PianoCore.mergeTiedNotes>[0]} notes */
    function mergeTiedNotes(notes) {
      return PianoCore.mergeTiedNotes(notes, {
        collectSamples: REMOTE_LOG_ENABLED,
      });
    }

    // OSMD note extractor — Phase 0c: delegated to
    // packages/web/src/note-extractor.ts (typed shell module). Pure
    // timing primitives live in @piano/core/library/score-timing
    // (computeLeadingMeasureBpms / timeAtInBarQuarters); the OSMD
    // walker stays at the shell because it touches OSMD's iterator
    // surface directly.
    /** @param {import('@piano/core').MeasureTimingResult|null|undefined} xmlMeasureTiming
     *  @param {import('@piano/core').ScoreTiming|null|undefined} scoreTiming */
    function extractNotesFromOsmd(xmlMeasureTiming, scoreTiming) {
      return NoteExtractor.extractNotesFromOsmd(osmd, {
        xmlMeasureTiming,
        scoreTiming,
        collectDiag: REMOTE_LOG_ENABLED,
      });
    }

    // Parse the raw MusicXML for everything that affects playback timing —
    // Phase 0c: delegated to @piano/core/library/score-timing. The legacy
    // shim preserves the original signature; downstream call sites keep
    // working unchanged.
    const parseScoreTimingFromXml = PianoCore.parseScoreTimingFromXml;

    // Per-measure (start, dur) seconds — Phase 0c: delegated to
    // @piano/core/library/measure-timing. Handles mid-bar tempo events
    // and partial-measure exporters (la Campanella m=5 case).
    const buildMeasureTimingFromXml = PianoCore.buildMeasureTimingFromXml;

    // Playback-order + note re-timer — Phase 0c: delegated to
    // @piano/core/library/playback-order. The legacy shell keeps the
    // fetch + xmlText caching dance (handles blob: URLs from just-
    // imported user songs and races against a rapid selectSong).
    //
    // `forSong` is captured by `loadCurrentScore` (the song record at the
    // time loading started). Reading the global `currentSong` here would
    // race against a rapid `selectSong()` that changes `currentSong`
    // mid-load — the IIFE would then fetch the wrong song's XML and feed
    // a foreign repeat structure into the in-flight song's note timeline.
    /** @param {SongRec} [forSong] */
    async function fetchPlaybackOrder(forSong) {
      const targetSong = forSong || currentSong;
      let text = targetSong._xmlText;
      if (!text) {
        const res = await fetch(targetSong.xmlUrl);
        if (!res.ok) throw new Error('XML fetch failed: ' + res.status);
        text = await res.text();
      }
      return PianoCore.parsePlaybackOrderFromXml(text);
    }

    // Re-time per-measure notes following the playback order. The core
    // module wants explicit measureStartSec + measureDurSec arrays —
    // compute durSec from the cumulative startSec diff (with an OSMD-
    // shaped fallback for the last bar when the caller didn't pre-build
    // a full timing table).
    /** @param {Parameters<typeof PianoCore.expandNotesByPlaybackOrder>[0]} baseNotes
     *  @param {Parameters<typeof PianoCore.expandNotesByPlaybackOrder>[1]} order
     *  @param {ReadonlyArray<{TempoInBPM?:number, Duration?:{realValue:number}}>} measures
     *  @param {number[]=} sourceMeasureStartSec */
    function expandNotesByPlaybackOrder(baseNotes, order, measures, sourceMeasureStartSec) {
      let measureStartSec;
      let measureDurSec;
      if (sourceMeasureStartSec && sourceMeasureStartSec.length === measures.length) {
        measureStartSec = sourceMeasureStartSec;
        measureDurSec = new Array(measures.length).fill(0);
        for (let i = 0; i < measures.length; i++) {
          const m = measures[i];
          if (i + 1 < measures.length) {
            measureDurSec[i] = measureStartSec[i + 1] - measureStartSec[i];
          } else {
            const bpm = m?.TempoInBPM || 72;
            measureDurSec[i] = (m?.Duration?.realValue || 0.25) * 4 * 60 / bpm;
          }
        }
      } else {
        // Fallback path: cumulative sum of per-bar durations from OSMD
        // shapes. Used by legacy callers that don't pre-build a full
        // XML timing table.
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
      return PianoCore.expandNotesByPlaybackOrder(baseNotes, order, {
        startSec: measureStartSec,
        durSec: measureDurSec,
      });
    }

    // Load-time DIAG dump — Phase 0c: delegated to
    // @piano/core/library/diag-load. The shim threads the legacy
    // remoteLog as the injected logger.
    /** @param {Parameters<typeof PianoCore.dumpLoadDiagnostics>[0]} p */
    function dumpLoadDiagnostics(p) {
      PianoCore.dumpLoadDiagnostics(p, remoteLog);
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
          if (!order.length) order = measures.map((/** @type {unknown} */ _, /** @type {number} */ i) => i);
        } catch (e) {
          console.warn('Playback order parse failed, falling back to linear', e);
          order = measures.map((/** @type {unknown} */ _, /** @type {number} */ i) => i);
        }
        const expanded = expandNotesByPlaybackOrder(baseNotes, order, measures, srcMeasureStartSec);

        let totalSec = 0;
        for (const n of expanded) {
          const end = n.timeSec + n.durSec;
          if (end > totalSec) totalSec = end;
        }

        // ExpandedNote shape is OsmdLikeNote-compatible — same midi/hand/
        // timeSec/durSec/measureIdx/inBarQuarters fields. timeMs/durMs are
        // computed downstream by buildSectionNotes per-section before the
        // practice tick reads them; song.notes is only iterated by timeSec
        // (see buildSectionNotes at line ~5837), so the missing-at-this-stage
        // ms fields don't matter here.
        song.notes = /** @type {OsmdLikeNote[]} */ (/** @type {unknown} */ (expanded));
        song.totalSec = totalSec;
        song.playbackOrder = order;
        // Pass the per-source-measure start times so sections begin at the
        // measure boundary (preserving any leading rest visually) instead of
        // cropping to the first note's onset.
        song.sections = buildSectionsFromDefs(
          expanded, totalSec, song.sectionDefs ?? [], srcMeasureStartSec
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
          // xmlMeasureTiming intentionally NOT passed — the diag dumper
          // re-derives per-measure timing from scoreTiming, and the legacy
          // shell's xmlMeasureTiming is a different shape than the dumper
          // expects. Kept in scope here only for the shell's own use.
          dumpLoadDiagnostics({
            song,
            scoreTiming,
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
        song._xmlText = undefined;
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
      clearNoteHighlights();
      osmd.cursor.reset();
      DOM.osmdContainer.scrollTop = 0;
    }

    // === Currently-playing notehead highlight ===
    // The thin OSMD cursor (type 1) shows *where in time* we are; this lights
    // up the actual note(s) sounding right now so the kid can spot "which
    // ledger-line dot is it" without scanning the column. Called after every
    // setOsmdCursorToNote() advance (post-walk, the iterator's
    // NotesUnderCursor/GNotesUnderCursor returns the freshly-current notes).
    //
    // Approach: cache each touched <path>'s pre-highlight inline fill on a
    // dataset attr so clear() can restore it exactly — OSMD doesn't always
    // rely on inline style for noteheads (some are SVG `fill` attrs, some
    // pick up the parent <g>'s color), and blanket-clearing style.fill would
    // wipe any user-applied per-note colors that happened to live inline.
    const HIGHLIGHT_FILL = '#ff3b6b';   // pink — contrasts with gold cursor + black notes
    /** @type {SVGPathElement[]} */
    let _highlightedPaths = [];
    function clearNoteHighlights() {
      for (const p of _highlightedPaths) {
        try {
          if (p.dataset && '_origFill' in p.dataset) {
            p.style.fill = p.dataset._origFill ?? '';
            delete p.dataset._origFill;
          } else {
            p.style.fill = '';
          }
        } catch (_) { /* element may have been detached on song swap */ }
      }
      _highlightedPaths.length = 0;
    }
    function highlightCurrentNotes() {
      clearNoteHighlights();
      if (!osmd || !osmd.cursor) return;
      // GNotesUnderCursor (graphical notes, has getSVGGElement) was added
      // mid-1.x. Fall back to NotesUnderCursor + a property probe so older
      // OSMD builds still work.
      let list = [];
      try {
        if (typeof osmd.cursor.GNotesUnderCursor === 'function') {
          list = osmd.cursor.GNotesUnderCursor() || [];
        } else if (typeof osmd.cursor.NotesUnderCursor === 'function') {
          list = osmd.cursor.NotesUnderCursor() || [];
        }
      } catch (_) { return; }
      for (const n of list) {
        if (!n || typeof n.getSVGGElement !== 'function') continue;
        let g;
        try { g = n.getSVGGElement(); } catch (_) { continue; }
        if (!g) continue;
        // Color every <path> inside the note's <g> (head + stem + accidental
        // + ledger line if grouped). Coloring just the notehead would lose
        // the stem, and a "pink notehead with black stem" reads less clearly
        // than a fully-pink note for an upper-elementary kid.
        const paths = g.querySelectorAll('path');
        for (const p of paths) {
          if (p.dataset && !('_origFill' in p.dataset)) {
            p.dataset._origFill = p.style.fill || '';
          }
          p.style.fill = HIGHLIGHT_FILL;
          _highlightedPaths.push(p);
        }
      }
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
    /** @param {{measureIdx:number, inBarQuarters:number}} note */
    function setOsmdCursorToNote(note) {
      if (!osmd || !osmd.cursor || !note) return;
      const it = osmd.cursor.iterator;
      const sm = osmd.Sheet?.SourceMeasures;
      if (!sm) return;
      const targetM = note.measureIdx | 0;
      const targetQ = +note.inBarQuarters || 0;
      const eps = 1e-6;

      /** @param {number} m */
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
      // Light up the freshly-current notehead(s). highlightCurrentNotes is
      // internally try/catched at every OSMD-touching call site, so no outer
      // wrap here — letting unrelated bugs (e.g. push() on a frozen array)
      // bubble is more useful than silently swallowing them.
      highlightCurrentNotes();
    }

    // OSMD adapter — implements @piano/core/adapters/osmd-adapter's
    // OsmdAdapter interface. Phase 0c modules will consume the adapter
    // (typed against the interface) instead of touching the OSMD object
    // graph directly. The adapter is a thin wrapper around the existing
    // legacy functions; the heavy lifting (initOsmd / extractNotesFromOsmd
    // / setOsmdCursorToNote / etc.) stays put until the TS migration.
    //
    // Note: extractNotes here is a thin shim — the real extraction is
    // driven from `loadCurrentSong()` because it depends on additional
    // shell state (xmlMeasureTiming, scoreTiming) that the adapter
    // shouldn't have to know about. Kept on the adapter so Phase 0c
    // can find the call site via the interface.
    /** @type {import('@piano/core').OsmdAdapter} */
    const osmdAdapter = {
      async load(url) {
        if (currentSong) currentSong.mxlUrl = url;
        await initOsmd();
      },
      isLoaded() {
        return !!osmd;
      },
      extractNotes(opts) {
        // Shell extractNotesFromOsmd returns `{notes, measureStartSec, measureBpm, _diag}`
        // — adapt to OsmdExtractResult's `{notes, measureTiming}` shape. The
        // current consumer (loadCurrentScore) reads via the shell function
        // directly, so the adapter form is here for Phase 0d/future modules.
        const ret = extractNotesFromOsmd(
          /** @type {any} */ (opts?.xmlMeasureTiming),
          null
        );
        return {
          notes: ret.notes,
          measureTiming: ret.measureStartSec.map((startSec, i) => ({
            startSec,
            bpm: ret.measureBpm[i] ?? 72,
          })),
        };
      },
      cursorTo(measureIdx, inBarQuarters) {
        setOsmdCursorToNote({ measureIdx, inBarQuarters });
      },
      resetCursor() {
        osmdResetToStart();
      },
      showCursor() {
        try { if (osmd && osmd.cursor) osmd.cursor.show(); } catch (_) {}
      },
      hideCursor() {
        try { if (osmd && osmd.cursor) osmd.cursor.hide(); } catch (_) {}
      },
      getCursorGeometry() {
        if (!osmd || !osmd.cursor || !osmd.cursor.cursorElement) return null;
        return {
          offsetTop: osmd.cursor.cursorElement.offsetTop,
          offsetHeight: osmd.cursor.cursorElement.offsetHeight || 30,
        };
      },
      highlightCurrentNotes() {
        // Legacy implementation hard-codes HIGHLIGHT_FILL; the color
        // parameter on the interface is ignored for now (Phase 0c will
        // thread it through).
        highlightCurrentNotes();
      },
      clearHighlights() {
        clearNoteHighlights();
      },
    };
    // Promote to globalThis so Phase 0c-extracted modules can resolve it
    // from typed code without an import (matches the Tone / OSMD / JSZip
    // / PianoCore globals seeded by main.ts).
    globalThis.osmdAdapter = osmdAdapter;

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
    // Full-song listen forces 100% (see buildFullSongNotes) so the count-in
    // beats and lane lookahead match the actual playback speed instead of the
    // user's section-listen tempoPct selection.
    function effectiveTempoPct() {
      if (practice.mode === 'listen' && practice.fullSongMode) return 100;
      return practice.tempoPct || 100;
    }
    function practiceBeatMs() {
      return PianoCore.practiceBeatMs(
        (currentSong && currentSong.bpm) || 72,
        effectiveTempoPct()
      );
    }
    function recomputePracticeTimings() {
      const timings = PianoCore.computePracticeTimings(practiceBeatMs());
      COUNT_IN_MS = timings.countInMs;
      LANE_LOOKAHEAD_MS = timings.laneLookaheadMs;
      // Practice-lane scaffolding is a hot-path singleton inside
      // practice-lane.ts — refresh in lockstep so the first frame's
      // countdown + descent rate match the new section's tempo.
      _practiceLane.setTimings({
        laneLookaheadMs: LANE_LOOKAHEAD_MS,
        countInMs: COUNT_IN_MS,
      });
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

    const practice = /** @type {PracticeStateShape} */ (/** @type {any} */ ({
      enabled: false,
      sectionIdx: 0,
      tempoPct: 60,                    // 60 / 75 / 90 / 100  (slower → bigger speedFactor)
      // 'guided' = score waits for the kid to play each note. No timeouts, no
      //            auto-playback. Wrong notes get a gentle nudge, never penalty.
      // 'rhythm' = traditional rhythm-game mode that follows tempo strictly.
      mode: 'guided',
      ghostOn: false,
      metronomeOn: false,
      // Listen-only: when true, startPracticeSection builds a timeline that
      // concatenates every section so the song plays straight through. Hidden
      // (and ignored) for guided / rhythm — those modes still drive a single
      // section at a time so scoring + unlocks remain section-scoped.
      fullSongMode: false,
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
    }));

    // ========================================
    // Section banner
    // ========================================
    /** @param {{nameKey:string, isBoss?:boolean}} sec */
    function showSectionBanner(sec) {
      if (!DOM.sectionBanner) return;
      DOM.sectionBanner.textContent = (sec.isBoss ? '👑 ' : '') + t(sec.nameKey);
      DOM.sectionBanner.classList.remove('show');
      void DOM.sectionBanner.offsetWidth;   // restart animation
      DOM.sectionBanner.classList.add('show');
    }

    // Screen Wake Lock — Phase 0d: extracted to packages/web/src/wakelock.ts.
    // The shell calls requestWakeLock() at start-of-session / page-resume and
    // releaseWakeLock() at end-of-session / page-hide. Module is pinned as
    // PianoWakeLock (not "WakeLock" — that's the lib.dom WakeLock interface).
    const requestWakeLock = PianoWakeLock.requestWakeLock;
    const releaseWakeLock = PianoWakeLock.releaseWakeLock;

    // Single source of truth for the port-message handler. attachMidiPort and
    // verifyMidiAlive both use this so re-binding after a suspend produces
    // exactly the same routing.
    /** @param {MIDIMessageEvent} e */
    // Phase 0d batch 22: byte → handler dispatch (incl. BLE-redelivery
    // dedupe) moved to packages/web/src/midi-dispatch.ts. The factory
    // is created later in the file (after onMidiNoteOn / matchNoteOnset
    // are in scope) and assigned to `_midiDispatch`. Forward-declared
    // wrappers re-bind the legacy short names so this handler — which
    // is wired onto port.onmidimessage at MIDI-attach time, before the
    // factory is built — can call through.
    /** @param {{data: ArrayLike<number>|null|undefined}} e */
    function onMidiMessageHandler(e) { _midiDispatch.onMessage(e); }

    // Phase 0d batch 25: attach / detach / verifyAlive moved to
    // packages/web/src/midi-ports.ts. The factory is built later (after
    // suspendMic / resumeMic / setInputIndicator / startMidiAutoRescan
    // are all in scope) and re-bound here as `_midiPorts`. verifyMidiAlive
    // forwards to it so the visibility-resume callsite stays unchanged.
    /** @returns {Promise<boolean>} */
    function verifyMidiAlive() { return _midiPorts.verifyAlive(_midiAccess); }

    // Phase 0d batch 5: graph builder + recovery seam live in
    // packages/web/src/audio-init.ts. The shell exposes mutators so the
    // module can replace the audio nodes atomically while the rest of
    // the legacy code keeps reading the short identifiers.
    /** @param {MediaStream|null} prevMicStream */
    function rebuildAudioGraph(prevMicStream) {
      const graph = AudioInit.buildAudioGraph(audioCtx, prevMicStream, {
        fftSize: CONFIG.FFT_SIZE,
        smoothing: CONFIG.SMOOTHING,
        onsetFftSize: CONFIG.ONSET_FFT_SIZE,
        onsetSmoothing: CONFIG.ONSET_SMOOTHING,
      }, !!state.micSuspended);
      gainNode = graph.gainNode;
      analyser = graph.analyser;
      onsetAnalyser = graph.onsetAnalyser;
      dataArray = graph.dataArray;
      freqArray = graph.freqArray;
      onsetDataArray = graph.onsetDataArray;
      micSourceNode = graph.micSourceNode;
      // Reset per-frame onset state — old prevSpectrum was sized to the old context.
      state.prevSpectrum = null;
      state.spectralFluxHistory = [];
    }

    // WebKit Bugs 237878 / 261554 (open as of 2025): suspend/resume alone
    // does NOT recover audio after iOS backgrounds the page — the only
    // reliable fix is closing the context and creating a fresh one. The
    // recovery closure (re-entrancy guard + node-disconnect → close →
    // rebuild) lives in audio-init.ts. The shell hands it readers/writers
    // for the audio nodes + the after-recovery hooks (Tone.js note: do
    // NOT call `Tone.setContext` here — see audio-init.ts comment).
    const _audioRecovery = AudioInit.createAudioRecovery({
      getSnapshot: () => ({
        audioCtx, gainNode, analyser, onsetAnalyser, micSourceNode, micStream
      }),
      applyContext: (newCtx, graph) => {
        audioCtx = newCtx;
        gainNode = graph.gainNode;
        analyser = graph.analyser;
        onsetAnalyser = graph.onsetAnalyser;
        dataArray = graph.dataArray;
        freqArray = graph.freqArray;
        onsetDataArray = graph.onsetDataArray;
        micSourceNode = graph.micSourceNode;
      },
      isMicSuspended: () => !!state.micSuspended,
      config: {
        fftSize: CONFIG.FFT_SIZE,
        smoothing: CONFIG.SMOOTHING,
        onsetFftSize: CONFIG.ONSET_FFT_SIZE,
        onsetSmoothing: CONFIG.ONSET_SMOOTHING,
      },
      resetOnsetState: () => {
        state.prevSpectrum = null;
        state.spectralFluxHistory = [];
      },
      onAfterRecovery: () => {
        // iOS WKWebView contract: post-background the audio engine is
        // dead until the page reloads. Stop the active section so the
        // lane stops scrolling against a stale Tone.js clock; the kid
        // still sees the visual pipeline (mic + canvas) come back to life.
        if (practice.enabled) {
          practice.enabled = false;
          try { stopPracticeAudio(); } catch (_) {}
        }
      },
    });
    /** @returns {Promise<void>} */
    function recoverAudioContext() { return _audioRecovery.recover(); }

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
      if (!navigator.requestMIDIAccess) return;
      if (midiInput.enabled) {
        // We *think* MIDI is connected — verify the port still responds.
        const ok = await verifyMidiAlive();
        if (ok) return;
        // The port is a corpse (WMB / WKWebView background suspension). Force
        // a fresh MIDIAccess so the next rescan re-enumerates instead of
        // re-checking the dead reference.
        _midiAccess = null;
      }
      // No MIDI / dead port → silent rescan. Force-fresh on resume so a
      // stale enumeration from before the background trip can't linger;
      // the auto-rescan poller will keep trying if this single attempt
      // doesn't catch the device immediately.
      _midiAccess = null;
      rescanMidi(true)
        .then((ok) => {
          if (!ok) startMidiAutoRescan();
        })
        .catch(() => startMidiAutoRescan());
    });

    // ========================================
    // Input layer — Web MIDI (preferred) + microphone fallback.
    // Both sources funnel into matchNoteOnset(midi, isExact). When a MIDI keyboard is
    // connected, mic input is suppressed automatically (single source of truth).
    // ========================================
    const midiInput = /** @type {MidiInputShape} */ (/** @type {any} */ ({
      enabled: false,           // true while a MIDI input port is connected
      port: null,
      _accessRequested: false,
      // Set when the platform is known to never expose Web MIDI (iOS Safari /
      // any iPadOS browser). Drives a friendlier hint in the UI.
      platformBlocked: false
    }));

    // Single point of MIDI message dispatch — called from Web MIDI port handler
    // (above) and from the BLE-MIDI parser. Updates lastEventTime so the loop's
    // mic-vs-MIDI arbitration knows MIDI is live.
    //
    // Android BLE stack occasionally redelivers the same packet, causing the
    // same note-on to arrive twice within a few ms. That makes the practice
    // cursor advance twice for one keypress and the score get out of sync.
    // Drop identical note-ons within 30ms — well below human-playable speed.
    // Phase 0d batch 22: MIDI byte router lives in
    // packages/web/src/midi-dispatch.ts. The factory closes over the
    // BLE-redelivery dedupe state; `_midiDispatch.reset()` is called
    // from session reset to clear the dedupe cache.
    const _midiDispatch = MidiDispatch.createMidiDispatch({
      midiInput: /** @type {import('./midi-dispatch').MidiDispatchInputRef} */ (
        /** @type {any} */ (midiInput)
      ),
      practice: /** @type {import('./midi-dispatch').MidiDispatchPracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      pulseMidiBadge,
      onMidiNoteOn,
      onMidiNoteOff,
      onMidiCC,
      matchNoteOnset,
    });
    /** @param {number} status @param {number} a @param {number} b */
    function dispatchMidiMessage(status, a, b) { _midiDispatch.dispatch(status, a, b); }

    // Phase 0d batch 20: MIDI badge + topbar input pill + UA cache
    // + virtual-port filter moved to packages/web/src/midi-indicator.ts.
    // The factory closes over the badge-pulse timer + cached UA result;
    // shell rebinds to the existing short function names so the rest
    // of the file (event wiring, MIDI port attach/detach) keeps reading
    // them as plain function refs.
    const _midiIndicator = MidiIndicator.createMidiIndicator({
      midiInput: /** @type {import('./midi-indicator').MidiIndicatorMidiInput} */ (
        /** @type {any} */ (midiInput)
      ),
      dom: { midiBadge: DOM.midiBadge, ptbInput: DOM.ptbInput },
      t,
      // Thunked: _midiRescan's `const` lives further down the file
      // (TDZ — same dance as bleMidi in midi-ports). The indicator
      // pill reads this once per setInputIndicator() call, never at
      // factory-build time, so the access is safe.
      isRescanRunning: () => _midiRescan.isRescanRunning(),
      hasRequestMIDIAccess: () => typeof navigator.requestMIDIAccess === 'function',
    });
    function pulseMidiBadge() { _midiIndicator.pulseBadge(); }
    function refreshMidiBadge() { _midiIndicator.refreshBadge(); }
    function isAppleMobile() { return _midiIndicator.isAppleMobile(); }

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║ Web MIDI Browser (WMB) workarounds — TEMPORARY, scheduled for      ║
    // ║ removal after Phase 1 (Capacitor native build).                    ║
    // ║                                                                    ║
    // ║ WMB is a third-party iOS app that polyfills the Web MIDI API in    ║
    // ║ WebKit (which Apple has refused to implement — Bug 107250). Its    ║
    // ║ polyfill has known quirks the spec doesn't cover; we work around   ║
    // ║ them so Pages-deployed iPad users have a functional MIDI path.    ║
    // ║                                                                    ║
    // ║ Once `packages/plugins/capacitor-piano-midi/` ships in Phase 1     ║
    // ║ (CoreMIDI on iOS, android.media.midi on Android), iPad users use  ║
    // ║ the native app instead and these hacks become dead code.          ║
    // ║                                                                    ║
    // ║ Cleanup recipe (one-line grep + audit):                           ║
    // ║   $ grep -nE "@WMB-WORKAROUND" packages/web/src/legacy-app.js     ║
    // ║   then delete each tagged block. Each block carries enough        ║
    // ║   context that removing it shouldn't require reading the rest of  ║
    // ║   the file. The universal patterns it sits next to                ║
    // ║   (auto-rescan poller, visibility-resume re-enumeration, badge    ║
    // ║   waiting state, manual rescan-on-tap) STAY — those help every    ║
    // ║   platform, not just WMB.                                          ║
    // ║                                                                    ║
    // ║ Marker count to remove (at this commit): 5 blocks                 ║
    // ║   1. attachMidiPort()      — explicit port.open() call            ║
    // ║   2. initWebMIDI()         — second-pass attach ignoring state    ║
    // ║   3. rescanMidi()          — second-pass attach ignoring state    ║
    // ║   4. _scheduleNextRescan() — every-2-tick force-fresh in fast win ║
    // ║   5. (this header — leave or remove together)                     ║
    // ╚════════════════════════════════════════════════════════════════════╝

    function setInputIndicator() { _midiIndicator.setInputIndicator(); }

    // Tapping the input badge in the practice topbar triggers a manual rescan
    // (verbose, surfaces diagnostic in introHint on failure). Cheap escape hatch
    // for "iPad / Web MIDI Browser doesn't auto-detect after re-pairing" — beats
    // diving into Settings → Rescan.
    DOM.ptbInput?.addEventListener('click', () => {
      if (midiInput.enabled || midiInput.platformBlocked) return;
      console.log('[MIDI] manual rescan triggered by topbar badge tap');
      void rescanMidi(false);
    });

    // Virtual-port filter moved to packages/web/src/midi-indicator.ts —
    // re-bind to the short name so the existing enumeration callsites
    // keep working unchanged.
    /** @param {{name?:string|null, manufacturer?:string|null}|null} port */
    function isVirtualMidiPort(port) { return _midiIndicator.isVirtualMidiPort(port); }

    // Phase 0d batch 25: attach / detach lives in
    // packages/web/src/midi-ports.ts. The factory is built right
    // below this declaration (after suspendMic / resumeMic /
    // setInputIndicator / start+stopMidiAutoRescan are in scope —
    // forward-declared above) so the legacy short names can re-bind
    // straight away.
    const _midiPorts = MidiPorts.createMidiPorts({
      midiInput: /** @type {import('./midi-ports').MidiPortsInputRef} */ (
        /** @type {any} */ (midiInput)
      ),
      state: /** @type {import('./midi-ports').MidiPortsStateRef} */ (
        /** @type {any} */ (state)
      ),
      // Thunked: bleMidi's `const` lives further down the file (TDZ
      // dance — the factory is built before the BLE state object).
      getBleMidi: () => /** @type {import('./midi-ports').MidiPortsBleRef} */ (
        /** @type {any} */ (bleMidi)
      ),
      hasAudioCtx: () => !!audioCtx,
      suspendMic,
      resumeMic,
      onMidiMessageHandler,
      setInputIndicator,
      isVirtualMidiPort,
      refreshIntroHint: () =>
        typeof refreshIntroHint === 'function' && refreshIntroHint(),
      showHitChip: (kind, msg) => showHitChip(kind, msg),
      micMeter: DOM.micMeter,
      startMidiAutoRescan,
      stopMidiAutoRescan,
      t,
    });
    /** @param {MIDIInput|null} port @returns {boolean} */
    function attachMidiPort(port) {
      return _midiPorts.attach(/** @type {import('./midi-ports').MidiPortRef|null} */ (
        /** @type {any} */ (port)
      ));
    }
    /** @param {MIDIInput|{name:string}|null} port */
    function detachMidiPort(port) {
      _midiPorts.detach(/** @type {any} */ (port));
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
        // Strict pass — by-the-spec, attach only `state === 'connected'`.
        // This is the "normal" path that fires on desktop Chrome, Steam Deck,
        // Android Chrome, and the future Capacitor native build.
        let attached = false;
        for (const port of allPorts) {
          if (port.state === 'connected' && attachMidiPort(port)) {
            attached = true;
            break;
          }
        }
        // @WMB-WORKAROUND (Phase 0d): second-pass attach ignoring state.
        // Web MIDI Browser sometimes reports a pre-paired BLE-MIDI keyboard
        // with state='unknown' or 'pending' until the page actively opens
        // it. attachMidiPort still rejects virtual/system ports, so this
        // doesn't loosen the safety filter.
        if (!attached) {
          for (const port of allPorts) {
            if (attachMidiPort(port)) {
              console.log('[MIDI] attached non-connected port (WMB quirk): ' + port.name);
              attached = true;
              break;
            }
          }
        }
        // /@WMB-WORKAROUND
        // Bug-fix (2026-05-07): when the user opens the page BEFORE
        // connecting their keyboard in Web MIDI Browser, allPorts is []
        // and the legacy code did nothing — the user had to manually
        // tap 🔄 Rescan to reconnect. statechange events from WMB are
        // unreliable (polyfill quirks), so the only robust safety net
        // is to start the rescan poller immediately when no port
        // attached on first try. Stops itself once anything connects.
        if (!attached) {
          console.log('[MIDI] no port attached yet — starting auto-rescan poller');
          showMidiWaitingHint();
          startMidiAutoRescan();
        }
      } catch (e) {
        console.warn('[MIDI] requestMIDIAccess failed:', e instanceof Error ? e.message : String(e));
        // Even on access failure, keep polling — Web MIDI Browser sometimes
        // rejects the very first call (permission UI) but accepts a retry.
        showMidiWaitingHint();
        startMidiAutoRescan();
      }
    }

    // Surface a quiet "waiting for MIDI" hint so users on iPad / WMB know
    // the app is actively listening for their keyboard, not silently broken.
    // Cleared by attachMidiPort's existing refreshIntroHint() call.
    function showMidiWaitingHint() {
      if (!isAppleMobile() || !navigator.requestMIDIAccess) return;
      // Only show once per session — re-shows would noise up the lifecycle.
      if (state._midiWaitingShown) return;
      state._midiWaitingShown = true;
      showIntroDiag(() =>
        setIntroHintDiagnostic(t('diagMidiWaiting') || 'Waiting for MIDI…',
          t('diagWmbHint') || 'Pair your keyboard in Web MIDI Browser, then return here.'));
    }

    // MIDI rescan — two-stage connection attempt:
    // (1) connect via the normal filter; (2) if that fails, force-connect ignoring the virtual filter.
    // silent=true skips UI updates on failure (used by auto-retry).
    // Cached MIDIAccess. Per spec the inputs collection updates live with
    // onstatechange events, so we only need to request once and re-iterate
    // for rescans. Re-requesting bypasses cached permission on some polyfills
    // and may also fail outside the original user gesture.
    /** @type {MIDIAccess|null} */
    // Phase 0d batch 26: ensureMidiAccess + rescanMidi + auto-rescan
    // poller moved to packages/web/src/midi-rescan.ts. The factory
    // is built right after attachMidiPort / detachMidiPort are
    // declared so all the callbacks resolve. _midiAccess is only
    // exposed via the factory (verifyMidiAlive reads it through the
    // closure here, not the legacy outer scope). Forward-declared
    // for the verify path that still needs the raw access ref.
    /** @type {MIDIAccess|null} */
    let _midiAccess = null;
    const _midiRescan = MidiRescan.createMidiRescan({
      midiInput: /** @type {import('./midi-ports').MidiPortsInputRef} */ (
        /** @type {any} */ (midiInput)
      ),
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
    });
    /** @param {boolean} [force] @returns {Promise<MIDIAccess>} */
    async function ensureMidiAccess(force) {
      const access = await _midiRescan.ensureAccess(force);
      _midiAccess = /** @type {MIDIAccess} */ (/** @type {any} */ (access));
      return _midiAccess;
    }

    // Phase 0d batch 25: defensive iteration of access.inputs moved
    // to packages/web/src/midi-ports.ts (pure helper).
    /** @param {MIDIAccess} access */
    function gatherMidiInputs(access) {
      return /** @type {MIDIInput[]} */ (
        /** @type {any} */ (MidiPorts.gatherMidiInputs(access))
      );
    }

    // Phase 0d batch 26: rescan body lives in midi-rescan.ts. The
    // forwarder keeps the legacy short name + JSDoc for any
    // remaining callsites (manual rescan tap on the badge, settings
    // panel rescan button, etc.).
    /** @param {boolean} [silent] @returns {Promise<boolean>} */
    function rescanMidi(silent) { return _midiRescan.rescan(silent); }

    // Show diagnostic info on introHint (sticky). Cleared by MIDI connect or refreshIntroHint.
    // ユーザがあとでボタンで一度消した場合は、新しいセッション(returnToTitle)
    // か再スキャンの明示的な操作までは再表示しない。
    /** @param {string} line1 @param {string} [line2] */
    function setIntroHintDiagnostic(line1, line2) {
      if (!DOM.introHint) return;
      const sub = line2 ? '<br><span style="font-size:.78rem;color:rgba(255,255,255,.55);letter-spacing:.04em">' + line2 + '</span>' : '';
      DOM.introHint.innerHTML = line1 + sub;
      DOM.introHint.classList.add('visible');
    }
    // Each callsite that produces a diagnostic with localized strings should
    // wrap its call in showIntroDiag(() => setIntroHintDiagnostic(t(...), ...))
    // so a language toggle can re-run the same closure with fresh translations.
    /** @param {() => void} thunk */
    function showIntroDiag(thunk) {
      state.lastIntroDiag = thunk;
      thunk();
    }
    function clearIntroDiagCache() { state.lastIntroDiag = null; }

    // Phase 0d batch 26: auto-rescan poller (ramped cadence + WMB
    // force-fresh quirks) lives in midi-rescan.ts. Forwarders keep
    // the legacy short names so existing callsites unchanged. The
    // indicator's hourglass state reads `_midiRescan.isRescanRunning()`
    // through the thunk wired in batch 20.
    function startMidiAutoRescan() { _midiRescan.startAutoRescan(); }
    function stopMidiAutoRescan() { _midiRescan.stopAutoRescan(); }

    // ========================================
    // BLE-MIDI via Web Bluetooth
    //   Android Chrome's Web MIDI exposes USB devices only — Bluetooth keyboards
    //   never appear there. Web Bluetooth IS available on Android Chrome though,
    //   so we connect over BLE-MIDI directly using the standard service UUID.
    //   Same path also helps desktop Chrome users whose BLE-MIDI device isn't
    //   surfaced via Web MIDI.
    // ========================================
    // BLE-MIDI service / characteristic UUIDs are re-exported from
    // packages/web/src/ble-midi-connect.ts (single source of truth).
    const BLE_MIDI_SERVICE = BleMidiConnect.BLE_MIDI_SERVICE;
    const BLE_MIDI_CHAR    = BleMidiConnect.BLE_MIDI_CHAR;

    /** @type {{device: any, characteristic: any, connected: boolean, _disconnectHandler?: (()=>void)|null}} */
    const bleMidi = /** @type {any} */ ({
      device: null,
      characteristic: null,
      connected: false
    });

    // Parse BLE-MIDI 1.0 packet. The packet starts with a header byte (high bit set,
    // top 6 bits of timestamp), then groups of (timestamp, status?, data...). For our
    // use we ignore timestamps and extract MIDI messages of types we care about.
    /** @param {ArrayBuffer} buf */
    // Phase 0d batch 21: BLE-MIDI 1.0 packet decoding moved to
    // packages/web/src/ble-midi-parser.ts. The shell wraps it in a
    // 1-line forwarder so the BLE characteristic listener keeps the
    // unchanged callsite (`parseBleMidiPacket(buf)`).
    /** @param {ArrayBuffer} buf */
    function parseBleMidiPacket(buf) {
      BleMidiParser.parseBleMidiPacket(buf, dispatchMidiMessage);
    }

    // Phase 0d batch 27: Web Bluetooth GATT connect path moved to
    // packages/web/src/ble-midi-connect.ts. The forwarder keeps the
    // legacy short name so the settings-panel BLE button + any other
    // callsite stays unchanged.
    const _bleConnect = BleMidiConnect.createBleMidiConnect({
      bleMidi: /** @type {import('./ble-midi-connect').BleMidiState} */ (
        /** @type {any} */ (bleMidi)
      ),
      midiInput: /** @type {import('./midi-ports').MidiPortsInputRef} */ (
        /** @type {any} */ (midiInput)
      ),
      hasAudioCtx: () => !!audioCtx,
      state: { get micSuspended() { return state.micSuspended; }, set micSuspended(v) { state.micSuspended = v; } },
      suspendMic,
      resumeMic,
      setInputIndicator,
      refreshIntroHint: () =>
        typeof refreshIntroHint === 'function' && refreshIntroHint(),
      showHitChip: (kind, msg) => showHitChip(kind, msg),
      micMeter: DOM.micMeter,
      parsePacket: (buf) => parseBleMidiPacket(buf),
      t,
      alert: (msg) => alert(msg),
      navigator,
    });
    async function connectBleMidi() { await _bleConnect.connect(); }

    // ─── settings-panel wire-up ──────────────────────────────────────
    // Settings-panel modal lifecycle + audio-offset slider + rescan/BLE/
    // reset buttons — Phase 0d batch 3: extracted to
    // packages/web/src/settings-panel.ts. Wired here (after practice,
    // midiInput, rescanMidi, connectBleMidi are all in scope) and
    // re-binds the forward-declared `openSettings` / `closeSettings` /
    // `refreshSettingsPanel` placeholders earlier in the file so call
    // sites (ESC handler, refreshSettingsPanel from showSessionSummary)
    // keep working.
    {
      const _settings = SettingsPanel.createSettingsPanel({
        dom: /** @type {import('./settings-panel').SettingsPanelDom} */ ({
          panel: DOM.settingsPanel,
          openBtn: DOM.settingsBtn,
          closeBtn: DOM.settingsCloseBtn,
          audioOffsetSlider: DOM.audioOffsetSlider,
          audioOffsetVal: DOM.audioOffsetVal,
          audioOffsetAuto: DOM.audioOffsetAuto,
          audioOffsetReset: DOM.audioOffsetReset,
          rescanBtn: DOM.settingsRescanBtn,
          bleBtn: DOM.settingsBleBtn,
          resetBtn: DOM.settingsResetBtn,
          inputStatus: DOM.settingsInputStatus,
        }),
        prefs,
        practice,
        state,
        midiInput,
        defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
        savePrefs,
        t,
        modalFocus,
        rescanMidi: () => { void rescanMidi(); },
        connectBleMidi: () => connectBleMidi(),
        showSessionSummary: () => showSessionSummary(),
      });
      openSettings = _settings.open;
      closeSettings = _settings.close;
      refreshSettingsPanel = _settings.refresh;
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
    const midiState = /** @type {MidiStateShape} */ (/** @type {any} */ ({
      activeNotes: new Map(),     // midiNum -> { velocity, onTimeMs, synColor }
      sustainOn: false,
      sustainedNotes: new Set(),  // released keys held by pedal
      recentOnsets: [],           // {midi, timeMs} within 80ms — chord candidate
      lastChordName: '',
      lastChordTimeMs: 0,
    }));

    // Chord detection — Phase 0b.3: delegated to @piano/core's drop-in
    // implementation (same algorithm, same NOTE_NAMES table, same CHORD_DICT).
    // PianoCore is loaded via <script> in index.html before app.js, so it's
    // safe to alias at parse time.
    const detectChord = PianoCore.detectChord;

    /** @param {number} midiNum */
    function midiToScreenX(midiNum) {
      return ((midiNum - CONFIG.PIANO_KEY_MIN) / CONFIG.PIANO_KEY_COUNT) * W;
    }

    // Per-note color helpers — Phase 0b.3: delegated to @piano/core.
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

    // Phase 0d batch 19: MIDI note-on / note-off / CC handlers +
    // spawnMidiNoteVisuals moved to packages/web/src/midi-handlers.ts.
    // The shell still owns the deps bag (closure refs) so legacy
    // callsites of `onMidiNoteOn` / `onMidiNoteOff` / `onMidiCC` keep
    // their existing function-name surface.
    /** @returns {import('./midi-handlers').MidiHandlersDeps} */
    function _midiHandlerDeps() {
      return /** @type {import('./midi-handlers').MidiHandlersDeps} */ ({
        state: /** @type {import('./midi-handlers').MidiHandlersState} */ (
          /** @type {any} */ (state)
        ),
        midiState: /** @type {import('./midi-handlers').MidiHandlersMidiState} */ (
          /** @type {any} */ (midiState)
        ),
        practice: /** @type {import('./midi-handlers').MidiHandlersPracticeRef} */ (
          /** @type {any} */ (practice)
        ),
        midiToScreenX,
        noteThemeColor,
        synColorFor,
        spawnBurst,
        spawnStream,
        ripples: /** @type {import('./midi-handlers').RipplesArray} */ (
          /** @type {any} */ (ripples)
        ),
        Ripple: /** @type {import('./midi-handlers').RippleCtor} */ (
          /** @type {any} */ (Ripple)
        ),
        hideIntroHint,
        showNoteDisplay,
        effectGlowPulse,
        finalizeNoteHold,
        applyOnsetToHistory: PianoCore.applyOnsetToHistory,
        applyOnsetPitch: PianoCore.applyOnsetPitch,
        applyOnsetToWindow: PianoCore.applyOnsetToWindow,
        triggerWakeUpFlash: PianoCore.triggerWakeUpFlash,
        qhOptsMidi: QH_OPTS_MIDI,
        psOpts: PS_OPTS,
        cwOpts: CW_OPTS,
        wufOpts: WUF_OPTS,
        config: {
          NOTE_NAMES: CONFIG.NOTE_NAMES,
          COMBO_WINDOW_MS: CONFIG.COMBO_WINDOW_MS,
        },
        getHeight: () => H,
      });
    }

    /** @param {number} midiNum @param {number} velocity @param {string=} synColor */
    function spawnMidiNoteVisuals(midiNum, velocity, synColor) {
      MidiHandlers.spawnMidiNoteVisuals(midiNum, velocity, synColor, _midiHandlerDeps());
    }

    /** @param {number} midiNum @param {number} velocity */
    function onMidiNoteOn(midiNum, velocity) {
      MidiHandlers.onMidiNoteOn(midiNum, velocity, _midiHandlerDeps());
    }

    /** @param {number} midiNum */
    function onMidiNoteOff(midiNum) {
      MidiHandlers.onMidiNoteOff(midiNum, _midiHandlerDeps());
    }

    /** @param {number} cc @param {number} value */
    function onMidiCC(cc, value) {
      MidiHandlers.onMidiCC(cc, value, _midiHandlerDeps());
    }

    // Virtual keyboard tables + drawer — Phase 0b.3: delegated to @piano/core.
    const KB_WHITE = PianoCore.KB_WHITE;
    const KB_BLACK = PianoCore.KB_BLACK;
    const KB_BLACK_LEFT_WHITE_IDX = PianoCore.KB_BLACK_LEFT_WHITE_IDX;

    // Phase 0d batch 16: drawMidiKeyboard / drawMidiBeams /
    // drawMidiChordDisplay / buildKeyboardHintNotes moved to
    // packages/web/src/midi-render.ts. The shell wraps the factory
    // result in the legacy short names so the loop wire-up stays
    // unchanged.
    const _midiRender = MidiRender.createMidiRender({
      ctx,
      midiState: /** @type {import('./midi-render').MidiRenderMidiState} */ (
        /** @type {any} */ (midiState)
      ),
      practice: /** @type {import('./midi-render').MidiRenderPracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      getLayout: () => ({ W, H, kbHeight, kbSafeBottom }),
      drawMidiKeyboard: PianoCore.drawMidiKeyboard,
      drawMidiBeams: PianoCore.drawMidiBeams,
      midiToScreenX,
      noteThemeColor,
      chordMateToleranceMs: CHORD_MATE_TOLERANCE_MS,
      shadowBlurEnabled: CONFIG.SHADOW_BLUR_ENABLED,
      sustainLabel: t('sustainLabel'),
    });
    /** @returns {void} */
    function drawMidiKeyboard() { _midiRender.drawKeyboard(); }
    /** @param {number} timeMs */
    function drawMidiBeams(timeMs) { _midiRender.drawBeams(timeMs); }
    /** @param {number} timeMs */
    function drawMidiChordDisplay(timeMs) { _midiRender.drawChordDisplay(timeMs); }
    // Refresh the sustainLabel on language change.
    window.addEventListener('langchange', () =>
      _midiRender.setLabels({ sustainLabel: t('sustainLabel') })
    );

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
    /** @param {number} detectedMidi @param {boolean} isExact */
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
    /** @param {number} detectedMidi */
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

    // Persisted practice progress — Phase 0c: pure schema/migration
    // logic delegated to @piano/core/state/practice-progress. The two
    // localStorage I/O wrappers stay here (loadJSON / saveJSON are
    // legacy shell helpers).
    const defaultSongProgress = PianoCore.defaultSongProgress;
    function loadPracticeProgress() {
      return PianoCore.migrateAndDefaultProgress(loadJSON('pianoViz_practice_v1', null));
    }
    function savePracticeProgress() { saveJSON('pianoViz_practice_v1', practice.progress); }
    // Always returns the per-song state, lazily creating it on first access.
    // Practice progress is loaded synchronously at startup so `practice.progress`
    // is non-null whenever this is called; the bang-cast captures that invariant.
    function songProg() {
      return PianoCore.getSongProgress(
        /** @type {import('@piano/core').PracticeProgress} */ (practice.progress),
        currentSong.id
      );
    }
    // Daily-streak math — Phase 0b.3: delegated to @piano/core/state/streak.
    // The reducer mutates practice.progress in place (it has the same shape
    // as StreakState — `streakDays` + `streakCount`), so the persistence
    // layer keeps writing the same JSON blob.
    const dateKey = PianoCore.formatDateKey;
    const todayKey = () => PianoCore.formatDateKey(new Date());
    const STREAK_OPTS = { maxDays: 60 };
    function recordPracticeDay() {
      if (!practice.progress) return;
      PianoCore.recordPracticeDay(practice.progress, todayKey(), STREAK_OPTS);
      savePracticeProgress();
    }

    // ========================================
    // Tone.js helpers
    // ========================================
    /** @type {import('tone').PolySynth|null} */
    let tonePiano = null;
    /** @type {import('tone').Synth|null} */
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
    // Count-in beeps — Phase 0c: delegated to packages/web/src/audio-scheduler.
    // The scheduler module owns the Tone.Transport calls; this shim
    // assembles the deps + options bag from the legacy globals.
    /** @param {number} startAudioTime */
    function scheduleCountInBeeps(startAudioTime) {
      if (typeof Tone === 'undefined') return;
      AudioScheduler.scheduleCountInBeeps(
        { metronome: toneMetronome, piano: tonePiano },
        startAudioTime,
        { countInMs: COUNT_IN_MS, beats: 4 }
      );
    }

    /** @param {number} midi */
    function notePitchClass(midi) { return ((midi % 12) + 12) % 12; }
    /** @param {number} midi */
    function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
    // DIAG helper — short note state suffix for tick logs.
    /** @param {OsmdLikeNote} n */
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
    /** @param {number} midi */
    function midiToPitchName(midi) { return activeNoteNames[notePitchClass(midi)]; }
    /** @param {number} midi */
    function midiToName(midi) { return midiToPitchName(midi) + (Math.floor(midi / 12) - 1); }

    // ========================================
    // Section build + start
    // ========================================
    /** @param {number} sectionIdx @returns {OsmdLikeNote[]} */
    function buildSectionNotes(sectionIdx) {
      const sec = currentSong.sections[sectionIdx];
      const speedFactor = 100 / practice.tempoPct;
      /** @type {OsmdLikeNote[]} */
      const out = [];
      const handFilter = practice.handFilter;   // 'R' / 'L' / null
      for (const n of currentSong.notes ?? []) {
        if (n.timeSec >= sec.startSec && n.timeSec < sec.endSec) {
          const relSec = n.timeSec - sec.startSec;
          // One-hand mode: notes from the other hand are marked _filtered=true and pre-hit so
          // the currentNoteIdx skip-past loop advances over them (the cursor moves too).
          // Lane drawing and stats exclude _filtered notes.
          const filtered = !!handFilter && n.hand !== handFilter;
          out.push({
            hand: n.hand,
            midi: n.midi,
            timeSec: n.timeSec,
            durSec: n.durSec,
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

    // Listen-mode "全曲再生" timeline. Same shape as buildSectionNotes but the
    // start anchor is the song's first note (t0) instead of a section boundary,
    // so every section flows back-to-back without resync gaps. Section-only
    // scoring/unlocks intentionally don't apply here — listen mode is read-only.
    //
    // Tempo is locked to 100%: full-song listen is the "performance" experience,
    // and a slowed-down whole song feels off (4 minutes of half-speed Für Elise).
    // Kids who want to study slowly should pick a single section in section
    // listen — that path keeps practice.tempoPct so 60% / 75% / 90% all work
    // there. Tempo unlocks also don't gate listening: the full song is always
    // the "real thing", so they can hear the goal from day 1.
    /** @returns {OsmdLikeNote[]} */
    function buildFullSongNotes() {
      const speedFactor = 1;   // hardcoded — see comment above
      const handFilter = practice.handFilter;
      /** @type {OsmdLikeNote[]} */
      const out = [];
      const songNotes = currentSong.notes ?? [];
      if (!songNotes.length) return out;
      // Anchor on the first note so the count-in lands right before it. Using
      // sections[0].startSec instead would leave silence before the first
      // attack on songs whose first section header sits a beat or two early.
      let t0 = Infinity;
      for (const n of songNotes) if (n.timeSec < t0) t0 = n.timeSec;
      if (!isFinite(t0)) t0 = 0;
      for (const n of songNotes) {
        const filtered = !!handFilter && n.hand !== handFilter;
        out.push({
          hand: n.hand,
          midi: n.midi,
          timeSec: n.timeSec,
          durSec: n.durSec,
          timeMs: (n.timeSec - t0) * 1000 * speedFactor + COUNT_IN_MS,
          durMs: n.durSec * 1000 * speedFactor,
          measureIdx: n.measureIdx,
          inBarQuarters: n.inBarQuarters,
          cursorJump: n.cursorJump,
          hit: filtered,
          missed: false,
          _filtered: filtered
        });
      }
      out.sort((a, b) => a.timeMs - b.timeMs);
      return out;
    }

    // Per-hand MIDI range used by the lane drawer to map pitch → x-position.
    // Computed once per section so the hot path doesn't re-scan every frame.
    /** @param {OsmdLikeNote[]} sectionNotes */
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

    /** @param {number} sectionIdx */
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
      // Full-song listen takes over the timeline shape but keeps sectionIdx
      // pointing at the first section so OSMD's cursor + the result-card
      // banner have a sensible starting anchor.
      const isFullSong = practice.mode === 'listen' && practice.fullSongMode;

      // Reset all per-section state
      practice.enabled = true;
      practice.sectionIdx = isFullSong ? 0 : sectionIdx;
      practice.sectionNotes = isFullSong ? buildFullSongNotes() : buildSectionNotes(sectionIdx);
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
        const fmtPsn = (/** @type {OsmdLikeNote} */ n, /** @type {number} */ i) => 'i=' + i +
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

      // HUD — show the song title in full-song listen so the kid sees what
      // they're listening to instead of the (now-irrelevant) first-section name.
      DOM.ptbSection.textContent = isFullSong
        ? t(currentSong.titleKey)
        : t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
      // Full-song listen plays at the score's written tempo regardless of the
      // user's tempoPct selection (see buildFullSongNotes). Reflect that in the
      // HUD so the kid doesn't see "🥁 60%" while hearing the song at 100%.
      DOM.ptbTempo.textContent = '🥁 ' + (isFullSong ? 100 : practice.tempoPct) + '%';
      // Exclude _filtered notes from the progress count (they are auto-skipped).
      practice._sectionTargetCount = practice.sectionNotes.reduce((c, n) => c + (n._filtered ? 0 : 1), 0);
      DOM.ptbProgress.textContent = '0 / ' + practice._sectionTargetCount;
      DOM.practiceHud.classList.add('visible');
      DOM.osmdContainer.classList.add('visible');
      syncLayout();
      setInputIndicator();
      requestWakeLock();

      // Section banner — flies in to celebrate the start. Full-song listen
      // gets a single banner with the song's title rather than the first
      // section's name (the kid is hearing the whole song, not just Intro).
      if (isFullSong) {
        showSectionBanner({ nameKey: currentSong.titleKey });
      } else {
        showSectionBanner(sec);
      }

      // Position OSMD's cursor at the section's first note. cursorTo
      // handles the backward-seek case internally (resets first if the
      // target is behind the current iterator position).
      const firstNote = practice.sectionNotes[0];
      if (firstNote) osmdAdapter.cursorTo(firstNote.measureIdx, firstNote.inBarQuarters);
      _lastOsmdScrollMs = 0;
      osmdScrollToCursor();
      osmdAdapter.showCursor();
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
          osmdAdapter.showCursor();
          practice.startAudioTime = Tone.now();
          scheduleCountInBeeps(practice.startAudioTime);
        } else {
          // Rhythm / Listen — full timeline scheduling delegated to the typed
          // audio-scheduler module. Listen forces ghost on so the kid hears the
          // song; rhythm respects the user's ghost toggle.
          const ghostActive = practice.mode === 'listen' || practice.ghostOn;
          AudioScheduler.scheduleSectionPlayback(
            { metronome: toneMetronome, piano: ghostActive ? tonePiano : null },
            {
              notes: practice.sectionNotes,
              metronomeOn: practice.metronomeOn,
              beatMs: practiceBeatMs(),
              countInMs: COUNT_IN_MS,
            }
          );
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
          osmdAdapter.showCursor();
        }
        // Diagnostic: log device audio output latency. AudioContext.outputLatency
        // is the speaker-side buffer delay; baseLatency is the processing block.
        // The total is roughly how late audio reaches the kid's ears vs Tone.now().
        try {
          const ctx = /** @type {AudioContext} */ (/** @type {unknown} */ (Tone.context.rawContext || Tone.context));
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
      osmdAdapter.hideCursor();
      // Drop the active notehead pink so a paused/ended section doesn't
      // leave a stale highlighted note glowing in the score.
      osmdAdapter.clearHighlights();
    }

    // ========================================
    // Per-frame practice tick — Phase 0d batch 8 wire-up
    // ========================================
    // updatePractice implementation lives in
    // packages/web/src/practice-tick.ts. The shell wraps the factory
    // result in the legacy short name and the render-loop calls it
    // each frame while practice is active.
    const updatePractice = PracticeTick.createPracticeTick({
      dom: { ptbProgress: DOM.ptbProgress },
      practice: /** @type {import('./practice-tick').PracticeTickPracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      midiInput: /** @type {import('./practice-tick').PracticeTickMidiInput} */ (
        /** @type {any} */ (midiInput)
      ),
      getOsmd: () => /** @type {any} */ (typeof osmd !== 'undefined' ? osmd : null),
      practiceElapsedMs,
      hitWindowMs: HIT_WINDOW_MS,
      medianRecentPitch,
      matchNoteOnset,
      showHitChip,
      t,
      // Thunk so the live binding (reassigned after createResultCard
      // runs further down) is read at section-complete time, not at
      // wire-up time (which would hit TDZ on the placeholder above).
      completePracticeSection: () => completePracticeSection(),
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      remoteLog,
      noteStateLabel: n_state,
    });

    // ========================================
    // Draw falling notes lane
    //   Lane is split into LH (left half) and RH (right half). Notes fall from the top
    //   toward the hit line. Time-to-pixel scale = (laneHeight - 40) / LANE_LOOKAHEAD_MS.
    // ========================================
    // Practice lane wire-up (Phase 0d batch 15)
    // ========================================
    // drawPracticeLane + lane view/opts/timing scaffolding moved to
    // packages/web/src/practice-lane.ts. The shell wraps the factory
    // result so the legacy short name stays callable from the loop +
    // render-late deps without churn.
    const _practiceLane = PracticeLane.createPracticeLane({
      ctx,
      practice: /** @type {import('./practice-lane').PracticeLanePracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      state: /** @type {import('./practice-lane').PracticeLaneStateRef} */ (
        /** @type {any} */ (state)
      ),
      midiInput,
      getLayout: () => ({
        W,
        H,
        kbHeight,
        kbSafeBottom,
        safeRight,
        currentLayoutMode: _viewportLayout.getCurrentLayoutMode(),
        cachedOsmdRect: /** @type {import('./practice-lane').PracticeLaneOsmdRect} */ (
          cachedOsmdRect
        ),
        osmdContainerVisible:
          !!(DOM.osmdContainer && DOM.osmdContainer.classList.contains('visible')),
      }),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      osmdAdapter,
      osmdScrollToCursor,
      practiceElapsedMs,
      practiceRealElapsedMs,
      noteThemeColor,
      midiToPitchName,
      noteColors: CONFIG.NOTE_COLORS,
      noteNames: CONFIG.NOTE_NAMES,
      laneLookaheadMs: LANE_LOOKAHEAD_MS,
      countInMs: COUNT_IN_MS,
      hitWindowEarlyMs: HIT_WINDOW_EARLY_MS,
      hitWindowMs: HIT_WINDOW_MS,
      perfectMs: PERFECT_MS,
      drawPracticeLane: PianoCore.drawPracticeLane,
      laneLabelL: t('laneLeft'),
      laneLabelR: t('laneRight'),
      countInGoLabel: t('countInGo'),
    });
    /** @param {number} timeMs */
    function drawPracticeLane(timeMs) {
      _practiceLane.draw(timeMs);
    }
    function refreshLaneOptsI18n() {
      _practiceLane.setLabels({
        laneLabelL: t('laneLeft'),
        laneLabelR: t('laneRight'),
        countInGoLabel: t('countInGo'),
      });
    }
    window.addEventListener('langchange', refreshLaneOptsI18n);

    /** @param {CanvasRenderingContext2D} c @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
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
    /** @param {string} kind @param {string} text */
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

    // ─── result-card wire-up (Phase 0d batch 10) ───────────────────
    // renderResultCard + completePracticeSection + drawHistoryChart
    // moved to packages/web/src/result-card.ts. The shell wraps the
    // factory result so the legacy short names keep working at every
    // callsite (langchange listener, practice-tick deps).
    const _resultCard = ResultCard.createResultCard({
      dom: /** @type {import('./result-card').ResultCardDom} */ ({
        sectionResult: DOM.sectionResult,
        resTitle: DOM.resTitle,
        resSectionName: DOM.resSectionName,
        resStars: DOM.resStars,
        resAcc: DOM.resAcc,
        resTiming: DOM.resTiming,
        resDuration: DOM.resDuration,
        resDurationRow: DOM.resDurationRow,
        resCombo: DOM.resCombo,
        resMsg: DOM.resMsg,
        resUnlock: DOM.resUnlock,
        resHistoryWrap: DOM.resHistoryWrap,
        resHistoryChart: /** @type {HTMLCanvasElement} */ (DOM.resHistoryChart),
        resNext: DOM.resNext,
        resTryPlay: DOM.resTryPlay,
      }),
      practice: /** @type {import('./result-card').ResultCardPracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      songProg: () => /** @type {any} */ (songProg()),
      sectionIds: SECTION_IDS,
      stopPracticeAudio,
      releaseWakeLock,
      recordPracticeDay,
      savePracticeProgress,
      computeStars,
      resolveResultTier,
      computeUnlocks,
      effectGoldenBurst,
      effectStarShower,
      effectFlowerBurst,
      setupHiDPICanvas,
      clamp01,
      t,
    });
    renderResultCard = _resultCard.renderResultCard;
    completePracticeSection = _resultCard.completePracticeSection;

    // ========================================
    // Song panel UI building — Phase 0d batch 7d wire-up
    // ========================================
    // The renderSongPanel implementation now lives in
    // packages/web/src/song-panel-render.ts. createSongPanelRender
    // returns a closure the shell calls under the legacy short name
    // and hands into other modules via their deps bags (practice-flow,
    // song-panel-controls, user-songs-ui all call renderSongPanel after
    // their state mutations).
    const _songPanelRender = SongPanelRender.createSongPanelRender({
      dom: /** @type {import('./song-panel-render').SongPanelRenderDom} */ ({
        songTitle: DOM.songTitle,
        songComposer: DOM.songComposer,
        streakCount: DOM.streakCount,
        streakCal: DOM.streakCal,
        songBpmHint: DOM.songBpmHint,
        tempoRow: DOM.tempoRow,
        sectionList: DOM.sectionList,
        ghostToggle: DOM.ghostToggle,
        metronomeToggle: DOM.metronomeToggle,
        ghostRow: DOM.ghostRow,
        metronomeRow: DOM.metronomeRow,
        fullSongRow: DOM.fullSongRow,
        fullSongToggle: DOM.fullSongToggle,
        songStart: DOM.songStart,
      }),
      practice: /** @type {import('./song-panel-render').SongPanelPracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      songProg: () => /** @type {any} */ (songProg()),
      t,
      dateKey,
    });
    const renderSongPanel = _songPanelRender.render;

    // Phase 0d batch 7c: hand picker + mode picker + practice toggles
    // (ghost / metronome / full-song) + songBack moved to
    // packages/web/src/song-panel-controls.ts. Wired below in one
    // createSongPanelControls() call (search "song-panel wire-up").

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

    /** @param {unknown} e */
    function alertAudioInitError(e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(t('audioInitFailedFmt', { v: msg }));
    }

    // ─── song-panel wire-up ─────────────────────────────────────────
    // Ties together the song-panel buttons that were extracted into
    // packages/web/src/song-panel-controls.ts (hand row, mode row,
    // ghost / metronome / full-song toggles, songBack).
    SongPanelControls.createSongPanelControls({
      dom: {
        ghostToggle: DOM.ghostToggle,
        metronomeToggle: DOM.metronomeToggle,
        fullSongToggle: DOM.fullSongToggle,
        songBack: DOM.songBack,
      },
      practice: /** @type {import('./song-panel-controls').SongPanelPracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      renderSongPanel,
      // Thunk so the placeholder-then-reassigned `returnToTitle` reads
      // its live binding at click time (after createPracticeFlow runs).
      returnToTitle: () => returnToTitle(),
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

    /** @param {string} songId */
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
        // Drop notehead-highlight refs before innerHTML='' detaches them —
        // otherwise _highlightedPaths holds dangling elements that the next
        // clearNoteHighlights() would still try to touch.
        _highlightedPaths.length = 0;
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
      song._loadError = undefined;
      renderSongPanel();
      initWebMIDI();
      // Capture `song` in the closures so a rapid second selectSong() can't
      // pollute the new song's _loadError with the previous song's failure.
      loadCurrentScore().then(() => {
        song._loadError = undefined;
        if (currentSong === song && DOM.songPanel.classList.contains('visible')) renderSongPanel();
      }).catch((e) => {
        console.error('preload', e);
        song._loadError = (e && (e.message || String(e))) || 'Score load failed';
        if (currentSong === song && DOM.songPanel.classList.contains('visible')) renderSongPanel();
      });
    }

    document.querySelectorAll('.practice-song-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-song');
        if (id) selectSong(id);
      });
    });

    // ========================================
    // Add-song modal + Section editor — Phase 0d batches 2, 6 wire-up
    // ========================================
    // Both modals' DOM bags stay in the shell because the global ESC
    // handler reads them via `typeof DOM_X !== 'undefined'`. The modal
    // logic + event handlers + export/import all live in
    // packages/web/src/user-songs-ui.ts and section-editor.ts respectively.
    /** @type {Record<string, HTMLElement> & {tabs: NodeListOf<Element>, bodies: NodeListOf<Element>}} */
    const DOM_ADDSONG = /** @type {any} */ ({
      modal: document.getElementById('addSongModal'),
      btn: document.getElementById('addSongBtn'),
      closeBtn: document.getElementById('addSongCloseBtn'),
      tabs: document.querySelectorAll('.add-song-tab'),
      bodies: document.querySelectorAll('.add-song-tab-body'),
      libraryList: document.getElementById('addSongLibraryList'),
      libraryStatus: document.getElementById('addSongLibraryStatus'),
      librarySearch: document.getElementById('addSongLibrarySearch'),
      fileInput: document.getElementById('addSongFileInput'),
      pdCheckbox: document.getElementById('addSongPdCheckbox'),
      urlInput: document.getElementById('addSongUrlInput'),
      fetchBtn: document.getElementById('addSongFetchBtn'),
      status: document.getElementById('addSongStatus'),
      myList: document.getElementById('addSongMyList'),
      userSongList: document.getElementById('userSongList'),
      exportBtn: document.getElementById('addSongExportBtn'),
      importBtn: document.getElementById('addSongImportBtn'),
      importInput: document.getElementById('addSongImportInput'),
    });

    // Section-editor DOM bag — kept in the shell for the same reason.
    /** @type {Record<string, HTMLElement>} */
    const DOM_SECEDIT = /** @type {any} */ ({
      modal: document.getElementById('sectionEditModal'),
      help: document.getElementById('sectionEditHelp'),
      rows: document.getElementById('sectionEditRows'),
      error: document.getElementById('sectionEditError'),
      cancelBtn: document.getElementById('sectionEditCancelBtn'),
      saveBtn: document.getElementById('sectionEditSaveBtn'),
      closeBtn: document.getElementById('sectionEditCloseBtn'),
    });

    // ─── section-editor wire-up ─────────────────────────────────────
    {
      const _sectionEditor = SectionEditor.createSectionEditor({
        dom: /** @type {import('./section-editor').SectionEditorDom} */ ({
          modal: DOM_SECEDIT.modal,
          help: DOM_SECEDIT.help,
          rows: DOM_SECEDIT.rows,
          error: DOM_SECEDIT.error,
          cancelBtn: DOM_SECEDIT.cancelBtn,
          saveBtn: DOM_SECEDIT.saveBtn,
          closeBtn: DOM_SECEDIT.closeBtn,
        }),
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
        dom: /** @type {import('./user-songs-ui').UserSongsUiDom} */ ({
          modal: DOM_ADDSONG.modal,
          btn: DOM_ADDSONG.btn,
          closeBtn: DOM_ADDSONG.closeBtn,
          tabs: DOM_ADDSONG.tabs,
          bodies: DOM_ADDSONG.bodies,
          libraryList: DOM_ADDSONG.libraryList,
          libraryStatus: DOM_ADDSONG.libraryStatus,
          librarySearch: DOM_ADDSONG.librarySearch,
          fileInput: DOM_ADDSONG.fileInput,
          pdCheckbox: DOM_ADDSONG.pdCheckbox,
          urlInput: DOM_ADDSONG.urlInput,
          fetchBtn: DOM_ADDSONG.fetchBtn,
          status: DOM_ADDSONG.status,
          myList: DOM_ADDSONG.myList,
          userSongList: DOM_ADDSONG.userSongList,
          exportBtn: DOM_ADDSONG.exportBtn,
          importBtn: DOM_ADDSONG.importBtn,
          importInput: DOM_ADDSONG.importInput,
        }),
        songs: SONGS,
        getLang: () => /** @type {"en"|"jp"} */ (prefs.lang),
        getLibrary: () => ONLINE_LIBRARY,
        setLibrary: (entries) => { ONLINE_LIBRARY = entries; },
        fetchLibrary,
        addUserSongFromBlob,
        addUserSongFromUrl,
        renameUserSong,
        removeUserSong,
        registerUserSong,
        userDbAll,
        userDbPut,
        unzipMxlToXmlText,
        autoSectionDefs: PianoCore.autoSectionDefs,
        // Thunk so a future reorder of the section-editor wire-up can't
        // capture a stale placeholder reference.
        openSectionEditor: (id) => openSectionEditor(id),
        selectSong,
        getCurrentSong: () => currentSong,
        refreshSongPanelHeader: () => {
          if (!currentSong) return;
          DOM.songTitle.textContent = t(currentSong.titleKey);
          DOM.songComposer.textContent = t(currentSong.composerKey);
        },
        t,
        modalFocus,
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

    // Request persistent storage so iOS Safari ITP / Chrome eviction policies
    // are less likely to wipe IndexedDB during a long pause between practice
    // sessions. Safari currently returns false, but it doesn't hurt to ask;
    // Chrome / Edge / Android Chrome honor it for "installed" PWAs.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) console.log('[Storage] persistent storage granted');
      }).catch(() => {});
    }

    // ─── Dev mode (Phase 0d batch 12) ───────────────────────────────
    // Activated by `?dev=1` URL param (persisted via localStorage), or
    // by 5 quick taps on the start-screen tagline. Hidden in production.
    DevMode.createDevMode({
      triggerEl: /** @type {HTMLElement|null} */ (document.querySelector('.tagline')),
      // Vite-injected at build time (see packages/web/vite.config.ts
      // `define`). Picks up the short git SHA + build date so the
      // 📋 Copy report can identify which commit produced it.
      versionLabel:
        (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '(unknown)') +
        ' ' +
        (typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''),
      tests: /** @type {import('./dev-mode').SelfTest[]} */ ([
        {
          name: 'localStorage round-trip',
          run: () => {
            const k = '__pianoViz_dev_test__';
            try {
              localStorage.setItem(k, 'x');
              const v = localStorage.getItem(k);
              localStorage.removeItem(k);
              return { ok: v === 'x' };
            } catch (e) {
              return { ok: false, detail: /** @type {Error} */ (e).message };
            }
          },
        },
        {
          name: 'IndexedDB user-songs DB opens',
          run: async () => {
            try {
              const db = await openUserDb();
              db.close();
              return { ok: true };
            } catch (e) {
              return { ok: false, detail: /** @type {Error} */ (e).message };
            }
          },
        },
        {
          name: 'Module wire-up — every extracted module is on globalThis',
          run: () => {
            const expected = [
              'PianoCore', 'AudioScheduler', 'NoteExtractor', 'PianoWakeLock',
              'SectionEditor', 'SettingsPanel', 'AudioInit', 'UserSongsUi',
              'ThemeControls', 'PracticeFlow', 'SongPanelControls',
              'SongPanelRender', 'PracticeTick', 'ResultCard', 'SessionSummary',
              'RenderFrame', 'DevMode',
            ];
            /** @type {string[]} */
            const missing = [];
            for (const k of expected) {
              if (typeof (/** @type {any} */ (globalThis))[k] === 'undefined') missing.push(k);
            }
            return { ok: missing.length === 0, detail: missing.length ? 'missing: ' + missing.join(', ') : undefined };
          },
        },
        {
          name: 'DOM bag — critical elements all queryable',
          run: () => {
            const ids = [
              'canvas', 'startScreen', 'startBtn', 'hud', 'songPanel',
              'sectionResult', 'sessionSummary', 'addSongModal', 'sectionEditModal',
              'settingsPanel', 'practiceHud', 'osmdContainer',
            ];
            /** @type {string[]} */
            const missing = ids.filter(id => !document.getElementById(id));
            return { ok: missing.length === 0, detail: missing.length ? 'missing: ' + missing.join(', ') : undefined };
          },
        },
        {
          name: 'i18n — t() returns localized non-empty strings',
          run: () => {
            const samples = ['startPractice', 'settings', 'micInput', 'tier1Title', 'addSongBtn'];
            /** @type {string[]} */
            const failed = samples.filter(k => {
              const v = t(k);
              return !v || v === k;
            });
            return { ok: failed.length === 0, detail: failed.length ? 'failed keys: ' + failed.join(', ') : undefined };
          },
        },
        {
          name: 'AudioContext — create, resume, close (no leak)',
          run: async () => {
            try {
              const c = AudioInit.createAudioContext();
              if (c.state === 'suspended') {
                try { await c.resume(); } catch (_) { /* user-gesture-required outside this path is fine */ }
              }
              const sr = c.sampleRate;
              await c.close();
              return { ok: sr > 0, detail: 'sampleRate=' + sr + 'Hz' };
            } catch (e) {
              return { ok: false, detail: /** @type {Error} */ (e).message };
            }
          },
        },
        {
          name: 'Web MIDI — API present (or iPad WMB)',
          run: () => {
            const hasMidi = typeof navigator.requestMIDIAccess === 'function';
            const isApple = isAppleMobile();
            const ok = hasMidi || !isApple; // OK if MIDI is present, OR not iPad (mic mode is fine)
            const detail = hasMidi
              ? 'navigator.requestMIDIAccess present'
              : isApple
                ? 'iPad without WMB — mic mode'
                : 'NO Web MIDI';
            return { ok, detail };
          },
        },
        {
          name: 'Service Worker — registered',
          run: async () => {
            if (!('serviceWorker' in navigator)) {
              return { ok: false, detail: 'SW API not available' };
            }
            const reg = await navigator.serviceWorker.getRegistration();
            return { ok: !!reg, detail: reg ? 'scope=' + reg.scope : 'no registration' };
          },
        },
        {
          name: 'Wake Lock API present',
          run: () => {
            const hasWL = !!(navigator.wakeLock && navigator.wakeLock.request);
            return { ok: hasWL, detail: hasWL ? 'OK' : 'not supported (Safari iOS < 16.4 / older Android)' };
          },
        },
        {
          name: 'Prefs — round-trip via savePrefs/loadJSON',
          run: () => {
            const saved = JSON.parse(localStorage.getItem('pianoViz_prefs') || '{}');
            const ok = typeof saved === 'object' && saved !== null;
            return { ok, detail: 'theme=' + saved.theme + ' lang=' + saved.lang };
          },
        },
      ]),
      benchmarks: /** @type {import('./dev-mode').SelfTest[]} */ ([
        {
          name: 'Frame timing — 60 frames, expect avg dt < 18ms',
          run: async () => {
            // Synthetic frame-rate probe. Capture 60 raf ticks and
            // compute the arithmetic mean. Doesn't depend on
            // state.running — raf fires independently.
            const samples = /** @type {number[]} */ ([]);
            await new Promise((resolve) => {
              let prev = performance.now();
              let count = 0;
              const tick = (/** @type {number} */ now) => {
                samples.push(now - prev);
                prev = now;
                count++;
                if (count >= 60) resolve(undefined);
                else requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            });
            // Drop the first sample (warmup / hidden-tab carry-over).
            const dts = samples.slice(1);
            const avg = dts.reduce((s, d) => s + d, 0) / dts.length;
            const max = Math.max(...dts);
            const ok = avg < 18; // 60fps + a tiny margin
            return { ok, detail: 'avg=' + avg.toFixed(1) + 'ms max=' + max.toFixed(1) + 'ms' };
          },
        },
        {
          name: 'Modal lifecycle — settings open + close + ESC',
          run: () => {
            const before = DOM.settingsPanel.classList.contains('visible');
            openSettings();
            const opened = DOM.settingsPanel.classList.contains('visible');
            closeSettings();
            const closed = DOM.settingsPanel.classList.contains('visible');
            const ok = !before && opened && !closed;
            return { ok, detail: 'before=' + before + ' opened=' + opened + ' closed=' + closed };
          },
        },
        {
          name: 'Modal lifecycle — add-song open + close',
          run: () => {
            openAddSongModal();
            const opened = DOM_ADDSONG.modal.classList.contains('visible');
            closeAddSongModal();
            const closed = DOM_ADDSONG.modal.classList.contains('visible');
            return { ok: opened && !closed, detail: 'opened=' + opened + ' closed=' + closed };
          },
        },
        {
          name: 'Theme cycle — flip 0 → 1 → 2 → 3 → 0',
          run: () => {
            const original = prefs.theme;
            /** @type {string[]} */
            const seen = [];
            for (const idx of [0, 1, 2, 3, 0]) {
              applyTheme(idx);
              seen.push(idx + ':' + state.currentTheme + ':' + prefs.theme);
            }
            applyTheme(original); // restore
            const ok = seen.every((s, i) => {
              const want = [0, 1, 2, 3, 0][i];
              return s === want + ':' + want + ':' + want;
            });
            return { ok, detail: ok ? 'all 5 cycles ok' : 'mismatch: ' + seen.join(', ') };
          },
        },
        {
          name: 'Lang cycle — JP ↔ EN flip persists + DOM updates',
          run: () => {
            const original = prefs.lang;
            setLang('jp');
            const jpHtml = document.documentElement.lang;
            const jpStartText = t('startPractice');
            setLang('en');
            const enHtml = document.documentElement.lang;
            const enStartText = t('startPractice');
            setLang(/** @type {'en'|'jp'} */ (original)); // restore
            const ok =
              jpHtml === 'ja' &&
              enHtml === 'en' &&
              jpStartText !== enStartText &&
              jpStartText.length > 0 &&
              enStartText.length > 0;
            return {
              ok,
              detail:
                'jpHtml=' +
                jpHtml +
                ' enHtml=' +
                enHtml +
                ' jpText="' +
                jpStartText +
                '" enText="' +
                enStartText +
                '"',
            };
          },
        },
        {
          name: 'Render-loop dispatch — runRenderFramePrelude returns valid dt',
          run: async () => {
            // Don't actually start a session; instead call the prelude
            // directly with the same deps the loop uses. This proves
            // the wire-up + module call path works end-to-end without
            // needing audio.
            const before = state.lastFrameTimeMs;
            const result = RenderFrame.runRenderFramePrelude(performance.now(), {
              ctx,
              state,
              getScreen: () => ({ W, H }),
              themes: CONFIG.THEMES,
              drawBgStars,
              drawAurora,
              drawGroundFlowers,
              decayWakeUpFlash: PianoCore.decayWakeUpFlash,
              drawCenterGlow: PianoCore.drawCenterGlow,
              wufOpts: WUF_OPTS,
              getEnergy,
            });
            const ok =
              typeof result.dt === 'number' &&
              result.dt > 0 &&
              result.dt <= 50 &&
              !!result.theme &&
              !!result.theme.colors;
            // Restore lastFrameTimeMs so we don't pollute the real loop.
            state.lastFrameTimeMs = before;
            return { ok, detail: 'dt=' + result.dt.toFixed(1) + 'ms theme=' + (result.theme?.colors?.length || 0) + 'colors' };
          },
        },
        {
          name: 'Behavior — MIDI note injection updates midiState',
          run: async () => {
            // onMidiNoteOn early-returns when state.running is false
            // (no point processing MIDI before audio is alive). The
            // bench therefore flips state.running true → calls onMidiNoteOn
            // → asserts midiState.activeNotes was updated → calls
            // onMidiNoteOff → restores. We deliberately don't assert
            // particles/ripples spawn because spawnMidiNoteVisuals
            // depends on the loop running, which we don't kick off
            // here (raf would race with the bench teardown).
            const wasRunning = state.running;
            const wasMidiEnabled = midiInput.enabled;
            const wasLastEvent = midiInput.lastEventTime;
            state.running = true;
            midiInput.enabled = true;
            midiInput.lastEventTime = performance.now();
            try {
              onMidiNoteOn(60, 100);
              const inActive = midiState.activeNotes.has(60);
              onMidiNoteOff(60);
              const cleared = !midiState.activeNotes.has(60);
              return {
                ok: inActive && cleared,
                detail: 'inActive=' + inActive + ' cleared=' + cleared,
              };
            } finally {
              state.running = wasRunning;
              midiInput.enabled = wasMidiEnabled;
              midiInput.lastEventTime = wasLastEvent;
              try { onMidiNoteOff(60); } catch (_) { /* already off */ }
              // Defensive: if note is still in activeNotes due to
              // sustainOn race, force-clear so the snapshot is clean.
              midiState.activeNotes.delete(60);
              midiState.sustainedNotes.delete(60);
            }
          },
        },
        {
          name: 'Behavior — Listen-mode completePracticeSection renders result card',
          run: async () => {
            // The bench injects a fake section into currentSong.sections
            // because the result-card calls `currentSong.sections[idx].id`.
            // At title screen the song is selected but its score isn't
            // loaded yet → sections is []. Real production sites only
            // call completePracticeSection after a real section has been
            // populated by buildSectionsFromDefs.
            //
            // We also exposed a defensive guard in result-card.ts so
            // an undefined sec returns early without throwing — but
            // here we want to assert the SUCCESS path renders the card.
            const saved = {
              enabled: practice.enabled,
              mode: practice.mode,
              sectionNotes: practice.sectionNotes,
              currentNoteIdx: practice.currentNoteIdx,
              hits: practice.hits,
              misses: practice.misses,
              _sectionTargetCount: practice._sectionTargetCount,
              _lastResult: practice._lastResult,
              _completing: practice._completing,
              fullSongMode: practice.fullSongMode,
              sectionIdx: practice.sectionIdx,
            };
            const wasVisible = DOM.sectionResult.classList.contains('visible');
            const savedSections = currentSong ? currentSong.sections : null;
            try {
              if (currentSong) {
                currentSong.sections = /** @type {any} */ ([
                  { id: '__bench', nameKey: 'feA1', isBoss: false },
                ]);
              }
              practice.enabled = true;
              practice.mode = 'listen';
              practice.fullSongMode = false;
              practice.sectionIdx = 0;
              practice.sectionNotes = [];
              practice.currentNoteIdx = 0;
              practice.hits = 0;
              practice.misses = 0;
              practice._sectionTargetCount = 0;
              practice._completing = false;
              completePracticeSection();
              const r = practice._lastResult;
              const ok =
                r != null &&
                r.mode === 'listen' &&
                r.secId === '__bench' &&
                DOM.sectionResult.classList.contains('visible');
              return {
                ok,
                detail:
                  'mode=' +
                  (r?.mode || 'null') +
                  ' secId=' +
                  (r?.secId || 'null') +
                  ' visible=' +
                  DOM.sectionResult.classList.contains('visible'),
              };
            } finally {
              // Restore — order matters: practice fields first, then
              // section list, then DOM visibility.
              Object.assign(practice, saved);
              if (currentSong && savedSections) currentSong.sections = savedSections;
              DOM.sectionResult.classList.toggle('visible', wasVisible);
            }
          },
        },
        {
          name: 'Behavior — Canvas pixel sampling shows paint after a frame',
          run: async () => {
            // Run the frame prelude directly so we know the canvas was touched.
            RenderFrame.runRenderFramePrelude(performance.now(), {
              ctx,
              state,
              getScreen: () => ({ W, H }),
              themes: CONFIG.THEMES,
              drawBgStars,
              drawAurora,
              drawGroundFlowers,
              decayWakeUpFlash: PianoCore.decayWakeUpFlash,
              drawCenterGlow: PianoCore.drawCenterGlow,
              wufOpts: WUF_OPTS,
              getEnergy,
            });
            // Sample center pixel
            try {
              const px = ctx.getImageData(Math.floor(W / 2), Math.floor(H / 2), 1, 1);
              const [r, g, b, a] = px.data;
              // Expect *some* alpha — the bg-fade always paints the full
              // screen with theme.bg at flow-derived alpha (≥ 0.08).
              const ok = a > 0;
              return { ok, detail: 'rgba=(' + r + ',' + g + ',' + b + ',' + a + ')' };
            } catch (e) {
              return { ok: false, detail: /** @type {Error} */ (e).message };
            }
          },
        },
        {
          name: 'Behavior — i18n DOM walk (every [data-i18n] is translated)',
          run: () => {
            const els = document.querySelectorAll('[data-i18n]');
            /** @type {string[]} */
            const broken = [];
            els.forEach((el) => {
              const key = el.getAttribute('data-i18n');
              if (!key) return;
              const text = el.textContent || '';
              // Translation should NOT equal the raw key, AND should be non-empty.
              if (!text || text === key) broken.push(key);
            });
            const ok = els.length > 5 && broken.length === 0;
            return {
              ok,
              detail:
                'els=' + els.length + ' broken=' + broken.length +
                (broken.length ? ' (' + broken.slice(0, 3).join(', ') + ')' : ''),
            };
          },
        },
        {
          name: 'Storage stress — 50 IndexedDB put/get/delete cycles',
          run: async () => {
            const ts = Date.now();
            try {
              for (let i = 0; i < 50; i++) {
                const id = '__bench_' + ts + '_' + i;
                const rec = /** @type {any} */ ({
                  id,
                  title: 'bench',
                  composer: '',
                  mxlBlob: new Blob(['x'], { type: 'text/plain' }),
                  mimeType: 'application/vnd.recordare.musicxml+zip',
                  sectionDefs: { type: 'measure-thirds', count: 3 },
                  addedAt: Date.now(),
                  source: 'bench',
                });
                await userDbPut(rec);
              }
              // Drain via userDbAll (no per-key get in shell — read whole list)
              const all = await userDbAll();
              const found = all.filter((r) => r.id.startsWith('__bench_' + ts)).length;
              // Cleanup
              for (let i = 0; i < 50; i++) {
                const id = '__bench_' + ts + '_' + i;
                try { await removeUserSong(id); } catch (_) { /* may already be cleaned */ }
              }
              return { ok: found === 50, detail: found + '/50 round-tripped' };
            } catch (e) {
              return { ok: false, detail: /** @type {Error} */ (e).message };
            }
          },
        },
      ]),
      getDiagSnapshot: () => ({
        'audioCtx.state': audioCtx ? audioCtx.state : '(none)',
        'audioCtx.sampleRate': audioCtx ? audioCtx.sampleRate + 'Hz' : '(none)',
        'audioCtx.currentTime': audioCtx ? audioCtx.currentTime.toFixed(2) + 's' : '(none)',
        'midiInput.enabled': String(midiInput.enabled),
        'midiInput.port': midiInput.port?.name || '(none)',
        'state.running': String(state.running),
        'state.flow': state.flow.toFixed(1),
        'state.combo': String(state.combo),
        'state.currentStage': String(state.currentStage),
        'state.qualityScore': (state.qualityScore || 0).toFixed(2),
        'state.smoothEnergy': state.smoothEnergy.toFixed(3),
        'state.useSynesthesiaMode': String(state.useSynesthesiaMode),
        'practice.enabled': String(practice.enabled),
        'practice.mode': practice.mode,
        'practice.sectionIdx': String(practice.sectionIdx),
        'practice.tempoPct': String(practice.tempoPct),
        'practice.fullSongMode': String(practice.fullSongMode),
        'practice.hits/misses': practice.hits + '/' + practice.misses,
        'currentSong': currentSong?.id || '(none)',
        'prefs.theme': String(prefs.theme),
        'prefs.lang': prefs.lang,
        'prefs.synesthesia': String(prefs.synesthesia),
        'prefs.audioOffsetMs': String(prefs.audioOffsetMs),
        'particles.length': String(particles?.length ?? 0),
        'ripples.length': String(ripples?.length ?? 0),
      }),
    });

    // The legacy floating BLE button is gone — Bluetooth pairing now lives
    // exclusively in the ⚙ settings panel (settingsBleBtn).

    // Phase 0d batch 7b: practice-flow controls (ptbQuit, ptbToggleOsmd,
    // result-card buttons, sumClose, 🏠 Title buttons, returnToTitle)
    // moved to packages/web/src/practice-flow.ts. The wire-up below
    // attaches every listener and exposes returnToTitle + transitionToSection
    // for the song-panel "Back" button + future module callsites.
    const _practiceFlow = PracticeFlow.createPracticeFlow({
      dom: /** @type {import('./practice-flow').PracticeFlowDom} */ ({
        ptbQuit: DOM.ptbQuit,
        ptbToggleOsmd: DOM.ptbToggleOsmd,
        resQuit: DOM.resQuit,
        resRetry: DOM.resRetry,
        resTryPlay: document.getElementById('resTryPlay'),
        resNext: DOM.resNext,
        sumClose: DOM.sumClose,
        homeBtn: DOM.homeBtn,
        sumHome: DOM.sumHome,
        resHome: DOM.resHome,
        practiceHud: DOM.practiceHud,
        osmdContainer: DOM.osmdContainer,
        songPanel: DOM.songPanel,
        sectionResult: DOM.sectionResult,
        sessionSummary: DOM.sessionSummary,
        hud: DOM.hud,
        questDisplay: DOM.questDisplay,
        micMeter: DOM.micMeter,
        startScreen: DOM.startScreen,
      }),
      practice: /** @type {import('./practice-flow').PracticeFlowPracticeRef} */ (
        /** @type {any} */ (practice)
      ),
      state: /** @type {import('./practice-flow').PracticeFlowStateRef} */ (
        /** @type {any} */ (state)
      ),
      midiState: /** @type {import('./practice-flow').PracticeFlowMidiRef} */ (
        /** @type {any} */ (midiState)
      ),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      songProg: () => /** @type {any} */ (songProg()),
      startPracticeSection,
      renderSongPanel,
      stopPracticeAudio,
      releaseWakeLock,
      hideIntroHint,
      stopMidiAutoRescan,
      resetSession,
    });
    returnToTitle = _practiceFlow.returnToTitle;
    const transitionToSection = _practiceFlow.transitionToSection;

    // Initialize progress on load (so panel works without audio start)
    practice.progress = loadPracticeProgress();

    // ========================================
    // Start
    // ========================================
    // Toggle the loading state on a start-screen mode button. The button's
    // i18n markup stays intact so language re-renders keep working and a return
    // to the title screen always finds the button in its resting state.
    /** @param {HTMLButtonElement} btn @param {boolean} loading */
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
      setStartButtonLoading(/** @type {HTMLButtonElement} */ (DOM.startBtn), true);
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
        setStartButtonLoading(/** @type {HTMLButtonElement} */ (DOM.startBtn), false);
        state.starting = false;
      }
    });

    // sumClose / homeBtn / sumHome / resHome listeners + the
    // returnToTitle implementation moved to practice-flow.ts (Phase 0d
    // batch 7b). The createPracticeFlow() call above wires them.

// Phase 0c kickoff (2026-05-06): make this file a real ES module so
// main.ts can import it without a `.d.ts` shim. Enables `allowJs: true`
// in packages/web/tsconfig.json to bring it into the typecheck graph
// (checkJs stays off — that's the next ratchet, file by file).
export {};
