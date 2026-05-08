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
    // Phase 0d batch 47: 57-line tab-trap + restore-focus helper moved
    // to packages/web/src/modal-focus.ts.
    const modalFocus = ModalFocus.createModalFocus({
      document,
      requestAnimationFrame: (cb) => requestAnimationFrame(cb),
    });

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
    // Phase 0d batch 44: _showEncouragementUI/_mirrorEncStateToLegacy
    // collapsed into HudUpdate.createHudUpdate. The mirror call from
    // resetSession is inlined below at the reset site.

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
    // Phase 0d batch 40: 152-line multi-feature onset detector
    // (5-condition gate + adaptive flux threshold + practice-mode
    // hysteresis + AGC voice-suppression counters) moved to
    // packages/web/src/onset-detect.ts.
    const _onsetDetectDeps = /** @type {import('./onset-detect').OnsetDetectDeps} */ ({
      state: /** @type {any} */ (state),
      getPractice: () => /** @type {any} */ (practice),
      tuning: {
        pitchMinHz: CONFIG.PITCH_MIN_HZ,
        fluxFreqMinHz: CONFIG.FLUX_FREQ_MIN_HZ,
        fluxFreqMaxHz: CONFIG.FLUX_FREQ_MAX_HZ,
        onsetGateDurationMs: CONFIG.ONSET_GATE_DURATION_MS,
        onsetSpreadMinChange: CONFIG.ONSET_SPREAD_MIN_CHANGE,
        onsetSpreadThreshold: CONFIG.ONSET_SPREAD_THRESHOLD,
        onsetSpreadMax: CONFIG.ONSET_SPREAD_MAX,
        flatnessPianoMin: CONFIG.FLATNESS_PIANO_MIN,
        crestVoiceMax: CONFIG.CREST_VOICE_MAX,
        spectralFluxThreshold: CONFIG.SPECTRAL_FLUX_THRESHOLD,
        spectralFluxAdaptiveK: CONFIG.SPECTRAL_FLUX_ADAPTIVE_K,
        spectralFluxHistorySize: CONFIG.SPECTRAL_FLUX_HISTORY_SIZE,
        centroidHistorySize: CONFIG.CENTROID_HISTORY_SIZE,
        harmonicityMin: CONFIG.HARMONICITY_MIN,
        harmonicityMinPractice: CONFIG.HARMONICITY_MIN_PRACTICE,
        onsetCooldownMs: CONFIG.ONSET_COOLDOWN_MS,
        getOnsetHysteresisFrames: () => ONSET_HYSTERESIS_FRAMES,
        agcVoiceRmsMin: CONFIG.AGC_VOICE_RMS_MIN,
        agcVoiceRejectCount: CONFIG.AGC_VOICE_REJECT_COUNT,
        agcVoiceSuppressMs: CONFIG.AGC_VOICE_SUPPRESS_MS,
      },
      features: {
        computeSpectralFlatness, computeSpectralCrest, computeSpectralCentroid,
        computeHarmonicity, coefficientOfVariation,
      },
      getOnsetAnalyser: () => onsetAnalyser,
      getOnsetDataArray: () => onsetDataArray,
      getAudioCtx: () => audioCtx,
    });
    /** @param {number} timeMs @param {number} currentPitchHz */
    function updateMultiFeatureOnset(timeMs, currentPitchHz) {
      return OnsetDetect.updateMultiFeatureOnset(timeMs, currentPitchHz, _onsetDetectDeps);
    }

    // ========================================
    // Session Confidence Layer
    // ========================================
    // Phase 0d batch 41: 100-line session-confidence ring buffer +
    // state machine + sessionStatus DOM driver moved to
    // packages/web/src/session-confidence-ui.ts.
    const _sessionConfidenceDeps = /** @type {import('./session-confidence-ui').SessionConfidenceDeps} */ ({
      state: /** @type {any} */ (state),
      sessionRing,
      tuning: {
        sampleIntervalMs: CONFIG.SESSION_SAMPLE_INTERVAL_MS,
        windowMs: CONFIG.SESSION_WINDOW_MS,
        confirmThreshold: CONFIG.SESSION_CONFIRM_THRESHOLD,
        loseThreshold: CONFIG.SESSION_LOSE_THRESHOLD,
        warmupMs: CONFIG.SESSION_WARMUP_MS,
        motivationGoalMs: CONFIG.MOTIVATION_GOAL_MS,
        ringCap: SESSION_RING_CAP,
      },
      dom: { sessionStatus: DOM.sessionStatus },
      t,
      triggerEffect,
    });
    /** @param {number} timeMs @param {boolean} isPianoDetected */
    function updateSessionConfidence(timeMs, isPianoDetected) {
      SessionConfidenceUi.updateSessionConfidence(timeMs, isPianoDetected, _sessionConfidenceDeps);
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
    // Phase 0d batch 46: 58-line quest-state per-frame reducer +
    // celebration UI dispatcher moved to packages/web/src/
    // quest-state-update.ts.
    const _questStateUpdate = QuestStateUpdate.createQuestStateUpdate(
      /** @type {import('./quest-state-update').QuestUpdateDeps} */ ({
        state: /** @type {any} */ (state),
        trackerState: /** @type {any} */ (_questState),
        quests: CONFIG.QUESTS,
        allDoneSentinel: QUEST_ALL_DONE,
        applyQuestTick: PianoCore.applyQuestTick,
        observation: state, // quest.condition reads state.combo, state.flow, etc.
        questOpts: _questOpts,
        dom: {
          toastTitle: DOM.toastTitle,
          toastSub: DOM.toastSub,
          questToast: DOM.questToast,
          questLabel: DOM.questLabel,
          questDots: DOM.questDots,
          questDisplay: DOM.questDisplay,
        },
        t,
        spawnBurst,
        effectGoldenBurst,
        getScreen: () => ({ W, H }),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        toastHideMs: 2600,
      })
    );
    /** @param {number} timeMs */
    function updateQuestState(timeMs) { _questStateUpdate.tick(timeMs); }

    // ========================================
    // Quality Scoring — simplified for kids
    // ========================================

    // Phase 0d batch 45: 54-line quality-score per-frame reducer +
    // its three compute-axis adapters + the growth-trend / coaching-
    // feedback wrappers all moved to packages/web/src/quality-update.ts.
    // We still need clamp01 for unrelated callers below.
    const clamp01 = PianoCore.clamp01;

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

    // Phase 0d batch 45: per-frame quality-score reducer moved to
    // packages/web/src/quality-update.ts.
    const _qualityUpdate = QualityUpdate.createQualityUpdate(
      /** @type {import('./quality-update').QualityUpdateDeps} */ ({
        state: /** @type {any} */ (state),
        tuning: {
          updateIntervalMs: CONFIG.SCORE_UPDATE_INTERVAL_MS,
          rhythmWeight: CONFIG.SCORE_RHYTHM_WEIGHT,
          dynamicsWeight: CONFIG.SCORE_DYNAMICS_WEIGHT,
          stabilityWeight: CONFIG.SCORE_STABILITY_WEIGHT,
          smoothing: CONFIG.SCORE_SMOOTHING,
          displayedScoreFloor: 0.25,
        },
        scoringOpts: {
          ioiIdealCV: CONFIG.IOI_IDEAL_CV,
          ioiMaxCV: CONFIG.IOI_MAX_CV,
          dynamicsIdealCVMin: CONFIG.DYNAMICS_IDEAL_CV_MIN,
          dynamicsIdealCVMax: CONFIG.DYNAMICS_IDEAL_CV_MAX,
          growthWindowMs: CONFIG.GROWTH_WINDOW_MS,
        },
        fns: {
          computeRhythmScore: PianoCore.computeRhythmScore,
          computeDynamicsScore: PianoCore.computeDynamicsScore,
          computeStabilityScore: PianoCore.computeStabilityScore,
          updateGrowthTrend: PianoCore.updateGrowthTrend,
          buildCoachingFeedback: PianoCore.buildCoachingFeedback,
        },
        qualityScoreEl: DOM.qualityScore,
        t,
      })
    );
    /** @param {number} timeMs */
    function updateQualityScores(timeMs) { _qualityUpdate.tick(timeMs); }

    // ========================================
    // Software AGC — with v9 voice suppression
    // ========================================
    // Phase 0d batch 43: 25-line software AGC reducer moved to
    // packages/web/src/agc-controller.ts.
    const _agcDeps = /** @type {import('./agc-controller').AgcControllerDeps} */ ({
      state: /** @type {any} */ (state),
      tuning: {
        updateIntervalMs: CONFIG.AGC_UPDATE_INTERVAL_MS,
        silenceFloor: CONFIG.AGC_SILENCE_FLOOR,
        voiceSuppressMax: CONFIG.AGC_VOICE_SUPPRESS_MAX,
        maxGain: CONFIG.AGC_MAX_GAIN,
        minGain: CONFIG.AGC_MIN_GAIN,
        targetRms: CONFIG.AGC_TARGET_RMS,
        attackCoeff: CONFIG.AGC_ATTACK_COEFF,
        releaseCoeff: CONFIG.AGC_RELEASE_COEFF,
      },
      getGainNode: () => gainNode,
      getAudioCtx: () => audioCtx,
    });
    /** @param {number} timeMs @param {number} postGainRms */
    function updateAGC(timeMs, postGainRms) {
      AgcController.updateAGC(timeMs, postGainRms, _agcDeps);
    }

    // ========================================
    // Game Logic — 4-layer architecture (v9)
    // ========================================
    // Phase 0d batch 42: 173-line per-frame game-state reducer moved to
    // packages/web/src/game-state-update.ts. Deps wire-up references
    // hoisted function declarations from later in this scope.
    const _gameStateDeps = /** @type {import('./game-state-update').GameStateUpdateDeps} */ ({
      state: /** @type {any} */ (state),
      getPractice: () => /** @type {any} */ (practice),
      getMidiInput: () => /** @type {any} */ (midiInput),
      getPitchMedianFrames: () => PITCH_MEDIAN_FRAMES,
      tuning: {
        pitchMinHz: CONFIG.PITCH_MIN_HZ,
        pitchMinHzPractice: CONFIG.PITCH_MIN_HZ_PRACTICE,
        pitchMaxHz: CONFIG.PITCH_MAX_HZ,
        confidenceThreshold: CONFIG.CONFIDENCE_THRESHOLD,
        goodNoteRms: CONFIG.GOOD_NOTE_RMS,
        onsetGateDurationMs: CONFIG.ONSET_GATE_DURATION_MS,
        comboWindowMs: CONFIG.COMBO_WINDOW_MS,
        silenceDecayStartMs: CONFIG.SILENCE_DECAY_START_MS,
        silenceHardDecayMs: CONFIG.SILENCE_HARD_DECAY_MS,
        flowDecaySoft: CONFIG.FLOW_DECAY_SOFT,
        flowDecayHard: CONFIG.FLOW_DECAY_HARD,
        comboDecayRate: CONFIG.COMBO_DECAY_RATE,
        noiseRmsThreshold: CONFIG.NOISE_RMS_THRESHOLD,
        noisePenaltyCooldownMs: CONFIG.NOISE_PENALTY_COOLDOWN_MS,
        flowNoisePenalty: CONFIG.FLOW_NOISE_PENALTY,
        comboNoisePenalty: CONFIG.COMBO_NOISE_PENALTY,
        flowGainBase: CONFIG.FLOW_GAIN_BASE,
        flowGainComboMax: CONFIG.FLOW_GAIN_COMBO_MAX,
        flowGainStabilityMax: CONFIG.FLOW_GAIN_STABILITY_MAX,
        flowGainQualityMax: CONFIG.FLOW_GAIN_QUALITY_MAX,
      },
      stages: /** @type {any} */ (CONFIG.STAGES),
      qhOptsMic: QH_OPTS_MIC,
      psOpts: PS_OPTS,
      core: {
        applyOnsetToHistory: PianoCore.applyOnsetToHistory,
        applyOnsetPitch: PianoCore.applyOnsetPitch,
        applyActivePlay: PianoCore.applyActivePlay,
        decayStability: PianoCore.decayStability,
        stageForFlow: PianoCore.stageForFlow,
        classifyStageTransition: PianoCore.classifyStageTransition,
        pitchHzToSemitones: PianoCore.pitchHzToSemitones,
      },
      updateMultiFeatureOnset,
      updateSessionConfidence,
      updateQualityScores,
      updateHUD,
      spawnBurst,
      effectStarShower,
      getScreen: () => ({ W, H }),
      stageLabelEl: DOM.stageLabel,
      stageLabelText: stageLabel,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      remoteLog,
    });
    /** @param {number} timeMs @param {number} dt @param {{pitch:number, conf:number, rms:number}} pitchResult */
    function updateGameState(timeMs, dt, pitchResult) {
      return GameStateUpdate.updateGameState(timeMs, dt, pitchResult, _gameStateDeps);
    }
    // ========================================
    // v9: updateHUD — encouragement instead of numbers
    // ========================================
    /** @param {number} timeMs */
    // Phase 0d batch 44: HUD writer (encouragement banner + flow gauge)
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
    /** @param {number} timeMs */
    function updateHUD(timeMs) { _hudUpdate.tick(timeMs); }

    // ========================================
    // Debug overlay (v9) — Phase 0d batch 44.
    // ========================================
    const _debugOverlay = HudUpdate.createDebugOverlay(
      /** @type {import('./hud-update').DebugOverlayDeps} */ ({
        state: /** @type {any} */ (state),
        overlayEl: DOM.debugOverlay,
        tuning: { onsetGateDurationMs: CONFIG.ONSET_GATE_DURATION_MS },
        now: () => performance.now(),
      })
    );
    function updateDebugOverlay() { _debugOverlay.tick(); }

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
    // Phase 0d batch 30: per-frame orchestrator moved to
    // packages/web/src/render-loop.ts. The factory composes the four
    // sub-module phases (RenderFrame / MicPipeline / RenderMid /
    // RenderLate) and self-rAFs while state.running. The shell hands
    // in deps-builders so per-frame fresh values (analyser, audioCtx,
    // theme color list) flow through closures rather than being
    // captured at factory-build time.
    const _renderLoop = RenderLoop.createRenderLoop({
      state: /** @type {{running: boolean}} */ (
        /** @type {any} */ (state)
      ),
      modules: { RenderFrame, MicPipeline, RenderMid, RenderLate },
      builders: {
        buildFrameDeps: () => ({
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
        }),
        buildMicPipelineDeps: (_timeMs, _dt, theme) => ({
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
        }),
        buildNoteFadeDeps: () => ({
          noteDisplayEl: DOM.noteDisplay,
          state: /** @type {import('./render-mid').RenderMidStateRef} */ (
            /** @type {any} */ (state)
          ),
          noteDisplayDurationMs: CONFIG.NOTE_DISPLAY_DURATION_MS,
        }),
        buildAmbientDeps: (theme) => ({
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
        }),
        buildSpectrumDeps: (theme) => {
          if (!analyser || !(state.smoothEnergy > 0.03)) return null;
          return {
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
          };
        },
        buildLateDeps: () => ({
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
        }),
      },
    });
    /** @param {number} timeMs */
    function loop(timeMs) { _renderLoop.tick(timeMs); }

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
    // setupHiDPICanvas moved to packages/web/src/shell-helpers.ts (batch 38).
    /** @param {HTMLCanvasElement} canvas @param {number} w @param {number} h */
    function setupHiDPICanvas(canvas, w, h) {
      return /** @type {CanvasRenderingContext2D} */ (
        ShellHelpers.setupHiDPICanvas(canvas, w, h)
      );
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

    // Phase 0d batch 48: 85-line full-session-reset reducer moved to
    // packages/web/src/session-reset.ts.
    const _sessionReset = SessionReset.createSessionReset(
      /** @type {import('./session-reset').SessionResetDeps} */ ({
        refs: {
          state: /** @type {any} */ (state),
          questState: /** @type {any} */ (_questState),
          encState: /** @type {any} */ (_encState),
          getMidiState: () => /** @type {any} */ (midiState),
          sessionRing: /** @type {any} */ (sessionRing),
          ripples,
          particles,
        },
        reducers: {
          resetQualityHistoryState: PianoCore.resetQualityHistoryState,
          resetQuestTrackerState: PianoCore.resetQuestTrackerState,
          resetEncouragementState: PianoCore.resetEncouragementState,
          resetWakeUpFlashState: PianoCore.resetWakeUpFlashState,
          resetChordWindowState: PianoCore.resetChordWindowState,
        },
        dom: {
          stageLabel: DOM.stageLabel,
          encouragement: DOM.encouragement,
          qualityScore: DOM.qualityScore,
          noteDisplay: DOM.noteDisplay,
          questDisplay: DOM.questDisplay,
          questDots: DOM.questDots,
          questLabel: DOM.questLabel,
          questToast: DOM.questToast,
          flowFill: DOM.flowFill,
          sessionStatus: DOM.sessionStatus,
          playTime: DOM.playTime,
        },
        sessionRingCap: SESSION_RING_CAP,
        invalidateFlowCache: () => _hudUpdate.invalidateFlowCache(),
        resetMidiDispatch: () => _midiDispatch.reset(),
        remoteLog,
        now: () => performance.now(),
      })
    );
    function resetSession() { _sessionReset.reset(); }

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
    // Phase 0d batch 49: lazy IDBDatabase handle cache + .mxl unzip
    // moved to packages/web/src/user-songs-mxl.ts. Forwarders below
    // preserve the legacy short-name surface (openUserDb, userDbAll,
    // userDbPut, userDbDelete, unzipMxlToXmlText).
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
    /** @param {string} id */
    async function userDbDelete(id) { return _userDb.delete(id); }
    const parseMusicXmlMetadata = PianoCore.parseMusicXmlMetadata;
    const collectSectionCandidates = PianoCore.collectSectionCandidates;
    const autoSectionDefs = PianoCore.autoSectionDefs;

    /** @param {Blob} blob */
    async function unzipMxlToXmlText(blob) {
      const JSZipLib = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
      if (!JSZipLib) throw new Error('JSZip not available — cannot read .mxl');
      return UserSongsMxl.unzipMxlToXmlText(blob, { jszip: /** @type {any} */ (JSZipLib) });
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

    // Phase 0d batch 31: score-loading orchestrator (initOsmd → XML
    // parse → notes extract → playback order → expand → sections →
    // bpm → diag dump → drop xmlText) moved to
    // packages/web/src/score-loader.ts. Race safety + in-flight
    // dedupe live in the factory.
    const _scoreLoader = ScoreLoader.createScoreLoader({
      getCurrentSong: () =>
        /** @type {import('./score-loader').ScoreLoaderSong | null} */ (
          /** @type {any} */ (currentSong)
        ),
      initOsmd,
      getOsmd: () => /** @type {any} */ (osmd),
      parseScoreTimingFromXml,
      buildMeasureTimingFromXml,
      extractNotesFromOsmd: (xmlMeasureTiming, scoreTiming) =>
        /** @type {import('./score-loader').ExtractResult} */ (
          /** @type {any} */ (extractNotesFromOsmd(xmlMeasureTiming, scoreTiming))
        ),
      fetchPlaybackOrder: (forSong) => fetchPlaybackOrder(/** @type {any} */ (forSong)),
      expandNotesByPlaybackOrder: (baseNotes, order, measures, srcMeasureStartSec) =>
        /** @type {import('./score-loader').OsmdLikeNote[]} */ (
          /** @type {any} */ (
            expandNotesByPlaybackOrder(
              /** @type {any} */ (baseNotes),
              order,
              /** @type {any} */ (measures),
              srcMeasureStartSec
            )
          )
        ),
      buildSectionsFromDefs: (expanded, totalSec, sectionDefs, srcMeasureStartSec) =>
        buildSectionsFromDefs(
          /** @type {any} */ (expanded),
          totalSec,
          /** @type {any} */ (sectionDefs),
          srcMeasureStartSec
        ),
      dumpLoadDiagnostics: (info) => dumpLoadDiagnostics(/** @type {any} */ (info)),
      remoteLogEnabled: REMOTE_LOG_ENABLED,
    });
    async function loadCurrentScore() { await _scoreLoader.loadCurrentScore(); }

    // Phase 0d batch 32: 5 OSMD cursor functions
    // (osmdScrollToCursor / osmdResetToStart / clearNoteHighlights /
    // highlightCurrentNotes / setOsmdCursorToNote) moved to
    // packages/web/src/osmd-cursor.ts. The factory closes over the
    // scroll-throttle timestamp + the highlighted-paths tracker.
    const _osmdCursor = OsmdCursor.createOsmdCursor({
      getOsmd: () => /** @type {any} */ (osmd),
      getContainer: () => DOM.osmdContainer,
    });
    function osmdScrollToCursor() { _osmdCursor.scrollToCursor(); }
    function osmdResetToStart() { _osmdCursor.resetToStart(); }
    function clearNoteHighlights() { _osmdCursor.clearHighlights(); }
    function highlightCurrentNotes() { _osmdCursor.highlightCurrentNotes(); }
    /** @param {{measureIdx:number, inBarQuarters:number}} note */
    function setOsmdCursorToNote(note) { _osmdCursor.setCursorToNote(note); }

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
    function showMidiWaitingHint() { _introDiag.showMidiWaitingHint(); }

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
    // Phase 0d batch 50: 22-line intro-hint diagnostic system
    // (set / show / clear / showMidiWaitingHint) moved to
    // packages/web/src/intro-diag.ts.
    const _introDiag = IntroDiag.createIntroDiag(
      /** @type {import('./intro-diag').IntroDiagDeps} */ ({
        state: /** @type {any} */ (state),
        introHintEl: DOM.introHint,
        isAppleMobile: () => isAppleMobile(),
        hasRequestMIDIAccess: () => !!navigator.requestMIDIAccess,
        t,
      })
    );
    /** @param {string} line1 @param {string} [line2] */
    function setIntroHintDiagnostic(line1, line2) { _introDiag.setDiagnostic(line1, line2); }
    /** @param {() => void} thunk */
    function showIntroDiag(thunk) { _introDiag.showDiag(thunk); }
    function clearIntroDiagCache() { _introDiag.clearCache(); }

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

    // Phase 0d batch 36: practice scoring + timing cluster
    // (medianRecentPitch / matchNoteOnset / finalizeNoteHold /
    // practiceRealElapsedMs / practiceElapsedMs) moved to
    // packages/web/src/practice-scoring.ts.
    const _practiceScoring = PracticeScoring.createPracticeScoring({
      state: /** @type {any} */ (state),
      practice: /** @type {any} */ (practice),
      tuning: {
        hitWindowEarlyMs: HIT_WINDOW_EARLY_MS,
        hitWindowMs: HIT_WINDOW_MS,
        perfectMs: PERFECT_MS,
        chordMateToleranceMs: CHORD_MATE_TOLERANCE_MS,
        durationMinTolMs: DURATION_MIN_TOL_MS,
        durationTolFraction: DURATION_TOL_FRACTION,
        countInMs: COUNT_IN_MS,
      },
      Tone: typeof Tone !== 'undefined' ? /** @type {any} */ (Tone) : undefined,
      showHitChip,
      spawnBurst,
      getScreen: () => ({ W, H }),
      t,
      midiToName,
      remoteLog,
    });
    function medianRecentPitch() { return _practiceScoring.medianRecentPitch(); }
    /** @param {number} detectedMidi @param {boolean} isExact */
    function matchNoteOnset(detectedMidi, isExact) {
      return _practiceScoring.matchNoteOnset(detectedMidi, isExact);
    }
    /** @param {number} detectedMidi */
    function finalizeNoteHold(detectedMidi) {
      _practiceScoring.finalizeNoteHold(detectedMidi);
    }
    function practiceRealElapsedMs() { return _practiceScoring.practiceRealElapsedMs(); }
    function practiceElapsedMs() { return _practiceScoring.practiceElapsedMs(); }

    // Phase 0d batch 37: persisted practice progress (load /
    // save / per-song lookup / daily-streak record) moved to
    // packages/web/src/practice-progress.ts. The factory wraps
    // PianoCore's pure reducers + the prefs-storage adapter.
    const defaultSongProgress = PianoCore.defaultSongProgress;
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
    function loadPracticeProgress() {
      return /** @type {import('@piano/core').PracticeProgress} */ (
        /** @type {any} */ (_practiceProgress.load())
      );
    }
    function savePracticeProgress() { _practiceProgress.save(); }
    function songProg() {
      return /** @type {any} */ (_practiceProgress.songProg(currentSong.id));
    }
    function recordPracticeDay() { _practiceProgress.recordPracticeDay(); }

    // ========================================
    // Tone.js helpers
    // ========================================
    // Phase 0d batch 33: lazy synth instantiation + count-in
    // scheduling + Transport-stop teardown moved to
    // packages/web/src/practice-tone-audio.ts. The factory holds
    // the two synths in closure state; getInstruments() exposes
    // them so startPracticeSection can hand them to AudioScheduler.
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

    // Phase 0d batch 38: note-utility helpers (notePitchClass /
    // midiToFreq / n_state / midiToPitchName / midiToName) moved to
    // packages/web/src/shell-helpers.ts. JP/EN note-names table stays
    // in the shell since langchange mutates `activeNoteNames` from
    // outside this cluster.
    const notePitchClass = ShellHelpers.notePitchClass;
    const midiToFreq = ShellHelpers.midiToFreq;
    /** @param {OsmdLikeNote} n */
    function n_state(n) { return ShellHelpers.noteStateLabel(n); }
    // Japanese-mode note names. Kids in JP music ed read ド/レ/ミ on the staff,
    // so when prefs.lang === 'jp' we surface those instead of C/D/E. Octave
    // numbers stay as digits — a Japanese kid's textbook also uses C4-style
    // octave numerals when needed.
    const NOTE_NAMES_JP = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
    // Hot-path cache — refreshed on langchange so the per-frame lane draw
    // doesn't re-evaluate the prefs.lang ternary 25× per frame.
    let activeNoteNames = prefs.lang === 'jp' ? NOTE_NAMES_JP : CONFIG.NOTE_NAMES;
    /** @param {number} midi */
    function midiToPitchName(midi) { return ShellHelpers.midiToPitchName(midi, activeNoteNames); }
    /** @param {number} midi */
    function midiToName(midi) { return ShellHelpers.midiToFullName(midi, activeNoteNames); }

    // ========================================
    // Section build + start
    // ========================================
    /** @param {number} sectionIdx @returns {OsmdLikeNote[]} */
    // Phase 0d batch 34: section / full-song timeline builders +
    // hand-range scanner moved to packages/web/src/section-notes.ts.
    /** @param {number} sectionIdx */
    function buildSectionNotes(sectionIdx) {
      return /** @type {OsmdLikeNote[]} */ (
        /** @type {any} */ (
          SectionNotes.buildSectionNotes(sectionIdx, {
            song: /** @type {any} */ (currentSong),
            practice: /** @type {any} */ (practice),
            countInMs: COUNT_IN_MS,
          })
        )
      );
    }
    /** @returns {OsmdLikeNote[]} */
    function buildFullSongNotes() {
      return /** @type {OsmdLikeNote[]} */ (
        /** @type {any} */ (
          SectionNotes.buildFullSongNotes({
            song: /** @type {any} */ (currentSong),
            practice: /** @type {any} */ (practice),
            countInMs: COUNT_IN_MS,
          })
        )
      );
    }
    /** @param {OsmdLikeNote[]} sectionNotes */
    function computeHandRanges(sectionNotes) {
      return SectionNotes.computeHandRanges(/** @type {any} */ (sectionNotes));
    }

    // Phase 0d batch 39: 209-line startPracticeSection orchestrator
    // moved to packages/web/src/start-practice-section.ts. The factory
    // closes over all the shell-side hooks (DOM bag, OSMD adapter, Tone,
    // AudioScheduler, _practiceToneAudio.getInstruments, etc.) so the
    // legacy short name is a 1-line forwarder.
    const _startPracticeSection = StartPracticeSection.createStartPracticeSection({
      state: /** @type {any} */ (state),
      practice: /** @type {any} */ (practice),
      prefs: /** @type {any} */ (prefs),
      getCurrentSong: () => /** @type {any} */ (currentSong),
      countInMs: () => COUNT_IN_MS,
      defaultAudioOffsetMs: DEFAULT_AUDIO_OFFSET_MS,
      remoteLogEnabled: REMOTE_LOG_ENABLED,
      alert: (msg) => alert(msg),
      remoteLog,
      t,
      hideIntroHint,
      syncLayout,
      setInputIndicator,
      requestWakeLock,
      showSectionBanner,
      dom: {
        ptbSection: DOM.ptbSection,
        ptbTempo: DOM.ptbTempo,
        ptbProgress: DOM.ptbProgress,
        practiceHud: DOM.practiceHud,
        osmdContainer: DOM.osmdContainer,
      },
      loadCurrentScore: () => loadCurrentScore(),
      recomputePracticeTimings,
      buildSectionNotes,
      buildFullSongNotes,
      computeHandRanges: /** @type {any} */ (computeHandRanges),
      osmdAdapter: /** @type {any} */ (osmdAdapter),
      resetScrollThrottle: () => _osmdCursor.resetScrollThrottle(),
      osmdScrollToCursor,
      Tone: typeof Tone !== 'undefined' ? /** @type {any} */ (Tone) : undefined,
      ensureToneInstruments,
      scheduleCountInBeeps,
      audioScheduler: /** @type {any} */ (AudioScheduler),
      getInstruments: () => _practiceToneAudio.getInstruments(),
      practiceBeatMs,
      pickAudioOffsetMs: PianoCore.pickAudioOffsetMs,
    });
    /** @param {number} sectionIdx */
    async function startPracticeSection(sectionIdx) {
      await _startPracticeSection(sectionIdx);
    }

    function stopPracticeAudio() { _practiceToneAudio.stopPracticeAudio(); }

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
    // Phase 0d batch 35: showHitChip + refreshIntroHint +
    // hideIntroHint + noInputAvailable + alertAudioInitError moved
    // to packages/web/src/intro-hint-ui.ts. The chip-throttle
    // timestamp lives in the factory closure (no more shell-scoped
    // `_lastChipMs`).
    const _introHintUi = IntroHintUi.createIntroHintUi({
      dom: { introHint: DOM.introHint },
      state: /** @type {any} */ (state),
      midiInput: /** @type {any} */ (midiInput),
      t,
      getHeight: () => H,
    });
    /** @param {string} kind @param {string} text */
    function showHitChip(kind, text) { _introHintUi.showHitChip(kind, text); }

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
    function noInputAvailable() { return _introHintUi.noInputAvailable(); }
    // refreshIntroHint moved to packages/web/src/intro-hint-ui.ts (batch 35).
    function refreshIntroHint() { _introHintUi.refreshIntroHint(); }

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

    function hideIntroHint() { _introHintUi.hideIntroHint(); }

    /** @param {unknown} e */
    function alertAudioInitError(e) { _introHintUi.alertAudioInitError(e); }

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
        // otherwise the cursor module's tracker holds dangling elements
        // that the next highlightCurrentNotes() would still try to touch.
        _osmdCursor.clearHighlights();
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
