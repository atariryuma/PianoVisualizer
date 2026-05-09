// @piano/core options bags — Phase 0d batch 73.
//
// Six small data/config literals that were free-standing inline in
// legacy-app.js. They feed into per-onset and per-frame reducers
// inside @piano/core (quality history, pitch stability, chord
// window, wake-up flash). Pulling them into one module removes
// scattered "magic constant" comments + makes them swappable from
// tests.
//
// All literals close over CONFIG-derived values + a couple of
// PianoCore function refs (detectChord). The shell builds them
// once at boot via createCoreOpts(), passes the bag through to
// every consumer (mic-pipeline, midi-handlers, etc.).

/** Subset of CONFIG the option bags read. Intentionally narrow so
 *  this module doesn't import the full PianoConfig type. */
export interface CoreOptsConfig {
  IOI_HISTORY_SIZE: number;
  AMPLITUDE_HISTORY_SIZE: number;
  STABILITY_SEMITONE_THRESHOLD: number;
  STABILITY_GROWTH: number;
  STABILITY_DECAY_GOOD: number;
}

/** Quality-history reducer options — common to mic + MIDI paths. */
export interface QualityHistoryOpts {
  debounceMs: number;
  minIoiMs: number;
  maxIoiMs: number;
  ioiHistorySize: number;
  amplitudeHistorySize: number;
}

/** Pitch-stability reducer options. */
export interface PitchStabilityOpts {
  semitoneThreshold: number;
  growth: number;
  decayOnJump: number;
  idleHalfLifeSec: number;
  activePlayRate: number;
  activePlayFloor: number;
}

/** Chord-window options — `detectChord` is the @piano/core
 *  classifier function. */
export interface ChordWindowOpts {
  windowMs: number;
  minNotes: number;
  repeatCooldownMs: number;
  detectChord: (...args: unknown[]) => unknown;
}

/** Wake-up flash decay opts. Half-life ≈0.071s matches the legacy
 *  60Hz `*= 0.85`-per-frame feel (log(0.5)/log(0.85) ≈ 4.27 frames
 *  @ 60fps), but the new decay is time-based so 144Hz screens don't
 *  fade twice as fast as 60Hz ones. */
export interface WakeUpFlashOpts {
  triggerLevel: number;
  halfLifeSec: number;
}

export interface CoreOpts {
  /** Quality-history opts for mic-driven onsets (longer debounce). */
  qhOptsMic: QualityHistoryOpts;
  /** Quality-history opts for MIDI-driven onsets (shorter debounce
   *  because the MIDI path doesn't need to gate against acoustic
   *  bleed). */
  qhOptsMidi: QualityHistoryOpts;
  psOpts: PitchStabilityOpts;
  cwOpts: ChordWindowOpts;
  wufOpts: WakeUpFlashOpts;
}

/** Build the options bags. Returns a fresh object each call so a
 *  re-init path can rebuild without poisoning prior consumers. */
export function createCoreOpts(deps: {
  config: CoreOptsConfig;
  detectChord: (...args: unknown[]) => unknown;
}): CoreOpts {
  const qhOptsMic: QualityHistoryOpts = {
    debounceMs: 80,
    minIoiMs: 100,
    maxIoiMs: 5000,
    ioiHistorySize: deps.config.IOI_HISTORY_SIZE,
    amplitudeHistorySize: deps.config.AMPLITUDE_HISTORY_SIZE,
  };
  return {
    qhOptsMic,
    qhOptsMidi: { ...qhOptsMic, debounceMs: 30 },
    psOpts: {
      semitoneThreshold: deps.config.STABILITY_SEMITONE_THRESHOLD,
      growth: deps.config.STABILITY_GROWTH,
      decayOnJump: deps.config.STABILITY_DECAY_GOOD,
      idleHalfLifeSec: 5.0,
      activePlayRate: 0.005,
      activePlayFloor: 0.2,
    },
    cwOpts: {
      windowMs: 80,
      minNotes: 3,
      repeatCooldownMs: 600,
      detectChord: deps.detectChord,
    },
    wufOpts: { triggerLevel: 0.2, halfLifeSec: 0.071 },
  };
}

// ─── Static constants (no deps) ──────────────────────────────────

/** Default audio-offset (ms) used when prefs.audioOffsetMs is null
 *  (auto-detect). The shell starts at 40ms — practically every
 *  Linux/Windows desktop measures somewhere between 20-80ms; iOS
 *  WKWebView's outputLatency is non-trivially higher (180-400ms)
 *  but iOS users typically save an explicit override post-onboard. */
export const DEFAULT_AUDIO_OFFSET_MS = 40;

/** Onset hysteresis — drop short staccato notes in practice. */
export const ONSET_HYSTERESIS_FRAMES = 1;

/** Ring buffer length for octave-error correction. */
export const PITCH_MEDIAN_FRAMES = 5;

/** Japanese note names (do/re/mi system) used when prefs.lang = 'jp'. */
export const NOTE_NAMES_JP: ReadonlyArray<string> = [
  'ド',
  'ド#',
  'レ',
  'レ#',
  'ミ',
  'ファ',
  'ファ#',
  'ソ',
  'ソ#',
  'ラ',
  'ラ#',
  'シ',
];
