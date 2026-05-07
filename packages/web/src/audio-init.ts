// Audio context lifecycle + recovery seam.
// Phase 0d batch 5 extraction from legacy-app.js.
//
// Scope (deliberately narrow): everything that creates / rebuilds /
// recreates the AudioContext + gain → analyser graph. The boot-flow
// helpers (`initAudio`, `acquireMic`, `suspendMic`, `resumeMic`) stay
// in the shell because they're tied to the state-machine + DOM + MIDI
// + i18n wire-up; carving those would force every audio-node read
// across the rest of the shell to indirect through this module.
//
// Out of scope:
//   • `initAudio` (boot — MIDI probe → mic acquisition → state.micSuspended)
//   • `acquireMic` / `suspendMic` / `resumeMic` (mic lifecycle)
//   • `devicechange` + `visibilitychange` listeners (cross-cutting — also
//     toggle wake-lock, MIDI re-enumeration, page-resume cleanup)
//
// In scope:
//   • `MIC_CONSTRAINTS` + `AUDIO_SAMPLE_RATE` constants
//   • `createAudioContext()` factory (sampleRate-pinned, latencyHint, fallback)
//   • `buildAudioGraph()` — pure node-construction (gain + 2 analysers + buffers)
//   • `createAudioRecovery()` — close-context-and-rebuild seam, with
//     re-entrancy guard, that the shell calls from devicechange + visibility
//     resume listeners
//
// WebKit Bug context (open as of 2025):
//   • Bug 154538 — AirPods sample-rate flip (24/48). Pinning sampleRate at
//     creation prevents stutter when mic activates.
//   • Bugs 237878 + 261554 — suspend/resume alone does NOT recover audio
//     after iOS backgrounds the page. Closing + recreating the context is
//     the only reliable fix.
//
// Tone.js note: do NOT call `Tone.setContext(audioCtx)` after recovery.
// In Tone 14.8.x the swap leaves `Tone.context.currentTime` reading the
// page-lifetime clock instead of the new AudioContext's clock — every
// `practiceRealElapsedMs` read would jump 30-60s ahead, listen mode
// would auto-fire hundreds of notes at section start. Per the legacy
// comment, iOS WKWebView contract: post-background the audio engine is
// dead until reload. The recovery seam stops the active practice section
// so the lane stops scrolling against a stale clock; visual pipeline
// (mic + canvas) comes back to life.

/** Mic constraints — all browser-level processing OFF (we run our own AGC,
 *  YIN pitch detection, multi-feature onset gate). Sample rate hint of 48k
 *  pairs with the same-rate AudioContext to dodge AirPods 24/48 flip. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    autoGainControl: false,
    noiseSuppression: false,
    echoCancellation: false,
    sampleRate: { ideal: 48000 },
  },
};

/** Pinned to 48000 Hz so AirPods (which flip between 24kHz input and 48kHz
 *  output) don't cause stutter when the mic activates. Browsers do automatic
 *  resampling — we eat the SRC cost in exchange for stability.
 *  WebKit Bug 154538 (open as of 2025) confirms the underlying flip persists. */
export const AUDIO_SAMPLE_RATE = 48000;

/** Vendor-prefixed AudioContext shape used by older Safari builds.
 *  Declared here so we don't have to widen `window` globally. */
interface WindowWithWebkitAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/** Construct the singleton AudioContext used by the whole pipeline.
 *  Tries the options bag first; some older Safaris reject the bag and fall
 *  back to the no-arg ctor (sample rate then defaults to the device's
 *  native rate, which is fine — the resampling happens transparently). */
export function createAudioContext(): AudioContext {
  const w = window as unknown as WindowWithWebkitAudio;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) {
    throw new Error('AudioContext not supported');
  }
  try {
    return new Ctor({ sampleRate: AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
  } catch {
    return new Ctor();
  }
}

/** Sizing for the two analysers built by `buildAudioGraph`. Mirrors the
 *  legacy `CONFIG.FFT_SIZE` / `ONSET_FFT_SIZE` etc. — passed in rather than
 *  imported so this module stays @piano/core-free. */
export interface AudioGraphConfig {
  fftSize: number;
  smoothing: number;
  onsetFftSize: number;
  onsetSmoothing: number;
}

/** All the audio-graph nodes the shell wires up downstream. The mic-source
 *  node is null when no mic is active (MIDI-only mode, mic suspended, or
 *  pre-permission). Per-frame buffers come typed as the wide
 *  `Uint8Array<ArrayBuffer>` shape so legacy `dataArray` / `onsetDataArray`
 *  callsites accept them without extra casts. */
export interface AudioGraph {
  gainNode: GainNode;
  analyser: AnalyserNode;
  onsetAnalyser: AnalyserNode;
  dataArray: Uint8Array<ArrayBuffer>;
  freqArray: Float32Array<ArrayBuffer>;
  onsetDataArray: Uint8Array<ArrayBuffer>;
  micSourceNode: MediaStreamAudioSourceNode | null;
}

/** Build the gain → analyser → onsetAnalyser graph on an existing
 *  AudioContext. Pure: returns the new nodes; the caller assigns to its
 *  own state vars. Used by both first-time init and the visibility /
 *  devicechange recovery path. The `prevMicStream` arg is the live mic
 *  MediaStream (which survives backgrounding on iOS) — if present, a
 *  fresh MediaStreamAudioSourceNode is created on the new context and
 *  wired to the gainNode. */
export function buildAudioGraph(
  audioCtx: AudioContext,
  prevMicStream: MediaStream | null,
  config: AudioGraphConfig,
  micSuspended: boolean
): AudioGraph {
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(micSuspended ? 0 : 1.0, audioCtx.currentTime);

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = config.fftSize;
  analyser.smoothingTimeConstant = config.smoothing;
  gainNode.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  const freqArray = new Float32Array(analyser.fftSize);

  const onsetAnalyser = audioCtx.createAnalyser();
  onsetAnalyser.fftSize = config.onsetFftSize;
  onsetAnalyser.smoothingTimeConstant = config.onsetSmoothing;
  gainNode.connect(onsetAnalyser);
  const onsetDataArray = new Uint8Array(onsetAnalyser.frequencyBinCount);

  let micSourceNode: MediaStreamAudioSourceNode | null = null;
  if (prevMicStream && prevMicStream.active) {
    try {
      micSourceNode = audioCtx.createMediaStreamSource(prevMicStream);
      micSourceNode.connect(gainNode);
    } catch {
      // Stream may have died (track ended, permission revoked); the user
      // can re-permit via the next `acquireMic` call.
      micSourceNode = null;
    }
  }

  return {
    gainNode,
    analyser,
    onsetAnalyser,
    dataArray: dataArray as Uint8Array<ArrayBuffer>,
    freqArray: freqArray as Float32Array<ArrayBuffer>,
    onsetDataArray: onsetDataArray as Uint8Array<ArrayBuffer>,
    micSourceNode,
  };
}

/** Live snapshot of the shell's audio state — read at the start of a
 *  recovery cycle so the module can disconnect old nodes + preserve the
 *  mic stream across the context recreation. */
export interface AudioStateSnapshot {
  audioCtx: AudioContext | null;
  gainNode: GainNode | null;
  analyser: AnalyserNode | null;
  onsetAnalyser: AnalyserNode | null;
  micSourceNode: MediaStreamAudioSourceNode | null;
  micStream: MediaStream | null;
}

export interface AudioRecoveryDeps {
  /** Snapshot the shell's current audio handles. Called at the top of
   *  each recovery so concurrent state writes (mic acquired between
   *  events) don't get clobbered. */
  getSnapshot(): AudioStateSnapshot;
  /** Replace the AudioContext + graph atomically. Shell assigns its
   *  audioCtx + the seven graph fields from this. */
  applyContext(audioCtx: AudioContext, graph: AudioGraph): void;
  /** Whether the mic is currently silenced (MIDI took over). The newly
   *  built gainNode opens with gain=0 in that case so resuming MIDI play
   *  doesn't dump amplified mic noise into onset detection. */
  isMicSuspended(): boolean;
  /** Sizing for the rebuilt analysers. */
  config: AudioGraphConfig;
  /** Reset onset / spectral-flux state that was tied to the old context's
   *  bin count. Without this, the first frame post-recovery would mis-size
   *  prevSpectrum vs. the new analyser's frequencyBinCount and either
   *  throw or compute garbage flux for one frame. */
  resetOnsetState(): void;
  /** Called after the new context is up — shell uses this to disable any
   *  active practice section (the Tone.js clock is dead post-recovery on
   *  iOS WKWebView, so the kid sees the lane stop and can restart). */
  onAfterRecovery(): void;
}

export interface AudioRecovery {
  /** Close the existing AudioContext, build a fresh one + graph, apply
   *  via deps.applyContext. Re-entrant — concurrent calls share the same
   *  promise so devicechange + visibilitychange firing in the same tick
   *  don't double-recover. Returns immediately if no context yet. */
  recover(): Promise<void>;
}

/** Build the recovery closure. Holds the in-flight promise so concurrent
 *  callers (devicechange + visibilitychange firing in the same event loop
 *  tick) share one cycle instead of racing two parallel close→rebuild
 *  sequences. */
export function createAudioRecovery(deps: AudioRecoveryDeps): AudioRecovery {
  let inFlight: Promise<void> | null = null;

  async function recover(): Promise<void> {
    const snap = deps.getSnapshot();
    if (!snap.audioCtx) return;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const prevStream = snap.micStream;
        // Disconnect old graph nodes BEFORE close — on iOS WKWebView,
        // native MediaStreamSource refs can survive a closed context if
        // not explicitly disconnected, leaking native resources.
        try {
          snap.gainNode?.disconnect();
        } catch {
          /* already disconnected */
        }
        try {
          snap.micSourceNode?.disconnect();
        } catch {
          /* already disconnected */
        }
        try {
          snap.analyser?.disconnect();
        } catch {
          /* already disconnected */
        }
        try {
          snap.onsetAnalyser?.disconnect();
        } catch {
          /* already disconnected */
        }
        try {
          await snap.audioCtx?.close();
        } catch {
          /* already closed */
        }

        const newCtx = createAudioContext();
        if (newCtx.state === 'suspended') {
          try {
            await newCtx.resume();
          } catch {
            /* user-gesture-required */
          }
        }
        const graph = buildAudioGraph(newCtx, prevStream, deps.config, deps.isMicSuspended());
        deps.applyContext(newCtx, graph);
        deps.resetOnsetState();
        deps.onAfterRecovery();

        console.log('[AUDIO] context recreated @' + newCtx.sampleRate + 'Hz');
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  return { recover };
}
