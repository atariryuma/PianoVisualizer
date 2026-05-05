// AudioContext lifecycle helpers.
//
// Why this is its own module:
//   - WebKit Bug 154538 (open as of 2025): AirPods cause sample-rate flips
//     between 24 kHz (input active) and 48 kHz (output only). Fixing at 48 kHz
//     forces the browser to do SRC instead of recreating the context behind
//     our back.
//   - WebKit Bugs 237878 / 261554: AudioContext silently dies on iOS background
//     restore. `suspend()` + `resume()` doesn't recover; only `close()` +
//     constructing a fresh context works.
//   - Apple Forum 770232: same flip happens on `devicechange`.
//
// The shape of the audio graph (gain → analyser × 2) is encoded here so that
// `recoverAudioContext` can rebuild it identically without the engine layer
// knowing how it's wired.

export const AUDIO_SAMPLE_RATE = 48000;

export interface AudioContextLike {
  state: 'suspended' | 'running' | 'closed';
  sampleRate: number;
  currentTime: number;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createAnalyser(): AnalyserNodeLike;
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNodeLike;
}

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, atTime: number): AudioParamLike;
  cancelScheduledValues(atTime: number): AudioParamLike;
}

export interface GainNodeLike {
  gain: AudioParamLike;
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect(): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect(): void;
}

export interface AnalyserNodeLike extends AudioNodeLike {
  fftSize: number;
  smoothingTimeConstant: number;
  frequencyBinCount: number;
  getByteFrequencyData(array: Uint8Array): void;
  getFloatTimeDomainData(array: Float32Array): void;
}

export interface MediaStreamAudioSourceNodeLike extends AudioNodeLike {
  // No extra members needed for our wiring.
}

/**
 * Construct an AudioContext fixed at 48 kHz with interactive latency.
 * Older Safaris reject the options bag — fall back to default ctor.
 *
 * Inject `Ctor` for testability; defaults to the browser global.
 */
export function createAudioContext(Ctor?: {
  new (options?: AudioContextOptions): AudioContextLike;
}): AudioContextLike {
  const Constructor =
    Ctor ?? (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
  if (!Constructor) {
    throw new Error('AudioContext is not available in this environment');
  }
  try {
    return new Constructor({
      sampleRate: AUDIO_SAMPLE_RATE,
      latencyHint: 'interactive',
    });
  } catch (_e) {
    return new Constructor();
  }
}

export interface AudioGraph {
  ctx: AudioContextLike;
  gain: GainNodeLike;
  mainAnalyser: AnalyserNodeLike;
  onsetAnalyser: AnalyserNodeLike;
  dataArray: Uint8Array;
  freqArray: Float32Array;
  onsetDataArray: Uint8Array;
  micSource: MediaStreamAudioSourceNodeLike | null;
}

export interface AudioGraphOptions {
  fftSize: number;
  smoothing: number;
  onsetFftSize: number;
  onsetSmoothing: number;
  /** If provided, mic source is wired in. Pass null when MIDI is the active source. */
  micStream?: MediaStream | null;
  /** Gain at startup. 0 = mic suspended; 1 = active. */
  initialGain?: number;
}

/**
 * Build the audio graph used by the engine: gain → both analysers, and an
 * optional mic source feeding gain. Pure construction — no DOM, no globals.
 */
export function buildAudioGraph(ctx: AudioContextLike, opts: AudioGraphOptions): AudioGraph {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.initialGain ?? 1.0, ctx.currentTime);

  const mainAnalyser = ctx.createAnalyser();
  mainAnalyser.fftSize = opts.fftSize;
  mainAnalyser.smoothingTimeConstant = opts.smoothing;
  gain.connect(mainAnalyser);

  const onsetAnalyser = ctx.createAnalyser();
  onsetAnalyser.fftSize = opts.onsetFftSize;
  onsetAnalyser.smoothingTimeConstant = opts.onsetSmoothing;
  gain.connect(onsetAnalyser);

  const dataArray = new Uint8Array(mainAnalyser.frequencyBinCount);
  const freqArray = new Float32Array(mainAnalyser.fftSize);
  const onsetDataArray = new Uint8Array(onsetAnalyser.frequencyBinCount);

  let micSource: MediaStreamAudioSourceNodeLike | null = null;
  if (opts.micStream && opts.micStream.active) {
    try {
      micSource = ctx.createMediaStreamSource(opts.micStream);
      micSource.connect(gain);
    } catch (_e) {
      micSource = null;
    }
  }

  return {
    ctx,
    gain,
    mainAnalyser,
    onsetAnalyser,
    dataArray,
    freqArray,
    onsetDataArray,
    micSource,
  };
}

/**
 * Close the existing context and create a fresh one with the same graph.
 * Use on `visibilitychange` recovery and `devicechange` (AirPods etc.).
 *
 * Returns the new graph. Caller must replace any cached references.
 */
export async function recoverAudioContext(
  prev: AudioGraph,
  opts: AudioGraphOptions,
  Ctor?: { new (options?: AudioContextOptions): AudioContextLike }
): Promise<AudioGraph> {
  try {
    await prev.ctx.close();
  } catch (_e) {
    // close() can throw if already closed; safe to ignore.
  }
  const ctx = createAudioContext(Ctor);
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (_e) {
      // The browser may refuse without a user gesture; the next gesture will resume.
    }
  }
  return buildAudioGraph(ctx, opts);
}
