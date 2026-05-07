// Tests for packages/web/src/audio-init.ts.
//
// We stub AudioContext + its node ctors per-test rather than spinning a
// real WebAudio engine — the module's surface is "build these objects in
// the right order with the right wiring", so a recording stub is faster
// and lets us assert call sequences (especially the close → recreate
// → rebuild order in the recovery seam).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAudioContext,
  buildAudioGraph,
  createAudioRecovery,
  MIC_CONSTRAINTS,
  AUDIO_SAMPLE_RATE,
  type AudioGraphConfig,
  type AudioStateSnapshot,
} from '../src/audio-init';

// ─── Fake AudioContext ───────────────────────────────────────────────
// Records every call so tests can assert sequencing + wiring.

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}
interface FakeGain extends FakeNode {
  gain: { setValueAtTime: ReturnType<typeof vi.fn> };
}
interface FakeAnalyser extends FakeNode {
  fftSize: number;
  smoothingTimeConstant: number;
  frequencyBinCount: number;
}
interface FakeMediaSrc extends FakeNode {}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  sampleRate = AUDIO_SAMPLE_RATE;
  currentTime = 0;
  options: AudioContextOptions | undefined;
  closed = false;
  _gainNodes: FakeGain[] = [];
  _analyserNodes: FakeAnalyser[] = [];
  _mediaSrcNodes: FakeMediaSrc[] = [];

  constructor(opts?: AudioContextOptions) {
    this.options = opts;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
  createGain(): FakeGain {
    const node: FakeGain = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { setValueAtTime: vi.fn() },
    };
    this._gainNodes.push(node);
    return node;
  }
  createAnalyser(): FakeAnalyser {
    const node: FakeAnalyser = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      // frequencyBinCount tracks fftSize/2 like the real spec.
      get frequencyBinCount() {
        return this.fftSize / 2;
      },
    };
    this._analyserNodes.push(node);
    return node;
  }
  createMediaStreamSource(_stream: MediaStream): FakeMediaSrc {
    const node: FakeMediaSrc = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this._mediaSrcNodes.push(node);
    return node;
  }
}

function makeStubWindow(): void {
  // happy-dom + node both lack AudioContext; pin our fake.
  (globalThis as unknown as { window: { AudioContext: typeof FakeAudioContext } }).window = {
    AudioContext: FakeAudioContext,
  };
}

function makeFakeStream(active = true): MediaStream {
  return { active } as unknown as MediaStream;
}

const cfg: AudioGraphConfig = {
  fftSize: 4096,
  smoothing: 0.82,
  onsetFftSize: 2048,
  onsetSmoothing: 0.15,
};

beforeEach(() => {
  makeStubWindow();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── createAudioContext ──────────────────────────────────────────────

describe('createAudioContext', () => {
  it('passes sampleRate + latencyHint when the ctor accepts options', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    expect(ctx.options?.sampleRate).toBe(AUDIO_SAMPLE_RATE);
    expect(ctx.options?.latencyHint).toBe('interactive');
  });

  it('falls back to the no-arg ctor when the options bag is rejected', () => {
    // Older Safari ctors throw on the options bag.
    class StrictAC extends FakeAudioContext {
      constructor(opts?: AudioContextOptions) {
        if (opts) throw new Error('options not supported');
        super();
      }
    }
    (globalThis as unknown as { window: { AudioContext: typeof StrictAC } }).window = {
      AudioContext: StrictAC,
    };
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    expect(ctx.options).toBeUndefined();
    expect(ctx).toBeInstanceOf(StrictAC);
  });

  it('uses webkitAudioContext when AudioContext is missing', () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      webkitAudioContext: FakeAudioContext,
    };
    const ctx = createAudioContext();
    expect(ctx).toBeInstanceOf(FakeAudioContext);
  });

  it('throws when neither prefix is available', () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    expect(() => createAudioContext()).toThrow(/not supported/i);
  });
});

// ─── MIC_CONSTRAINTS ─────────────────────────────────────────────────

describe('MIC_CONSTRAINTS', () => {
  it('disables every browser-level mic processing flag', () => {
    const audio = MIC_CONSTRAINTS.audio as MediaTrackConstraints;
    expect(audio.autoGainControl).toBe(false);
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.echoCancellation).toBe(false);
  });

  it('hints 48kHz sample rate to dodge the AirPods 24/48 flip', () => {
    const audio = MIC_CONSTRAINTS.audio as MediaTrackConstraints;
    const sr = audio.sampleRate as ConstrainULongRange;
    expect(sr.ideal).toBe(48000);
  });
});

// ─── buildAudioGraph ─────────────────────────────────────────────────

describe('buildAudioGraph', () => {
  it('wires gain → analyser + gain → onsetAnalyser', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const graph = buildAudioGraph(ctx as unknown as AudioContext, null, cfg, false);
    // gain.connect was called with each analyser
    expect((graph.gainNode as unknown as FakeGain).connect).toHaveBeenCalledTimes(2);
    expect((graph.gainNode as unknown as FakeGain).connect).toHaveBeenCalledWith(graph.analyser);
    expect((graph.gainNode as unknown as FakeGain).connect).toHaveBeenCalledWith(
      graph.onsetAnalyser
    );
  });

  it('opens gain at 1.0 when mic is not suspended', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const graph = buildAudioGraph(ctx as unknown as AudioContext, null, cfg, false);
    expect((graph.gainNode as unknown as FakeGain).gain.setValueAtTime).toHaveBeenCalledWith(
      1.0,
      0
    );
  });

  it('opens gain at 0 when mic is suspended (MIDI-only mode)', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const graph = buildAudioGraph(ctx as unknown as AudioContext, null, cfg, true);
    expect((graph.gainNode as unknown as FakeGain).gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it('applies fft + smoothing config to both analysers', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const graph = buildAudioGraph(ctx as unknown as AudioContext, null, cfg, false);
    const a = graph.analyser as unknown as FakeAnalyser;
    const o = graph.onsetAnalyser as unknown as FakeAnalyser;
    expect(a.fftSize).toBe(cfg.fftSize);
    expect(a.smoothingTimeConstant).toBe(cfg.smoothing);
    expect(o.fftSize).toBe(cfg.onsetFftSize);
    expect(o.smoothingTimeConstant).toBe(cfg.onsetSmoothing);
  });

  it('sizes per-frame buffers against analyser.frequencyBinCount + fftSize', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const graph = buildAudioGraph(ctx as unknown as AudioContext, null, cfg, false);
    expect(graph.dataArray.length).toBe(cfg.fftSize / 2);
    expect(graph.freqArray.length).toBe(cfg.fftSize);
    expect(graph.onsetDataArray.length).toBe(cfg.onsetFftSize / 2);
  });

  it('returns null micSourceNode when prevMicStream is null', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const graph = buildAudioGraph(ctx as unknown as AudioContext, null, cfg, false);
    expect(graph.micSourceNode).toBeNull();
  });

  it('returns null micSourceNode when prevMicStream is inactive', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const graph = buildAudioGraph(
      ctx as unknown as AudioContext,
      makeFakeStream(false),
      cfg,
      false
    );
    expect(graph.micSourceNode).toBeNull();
  });

  it('builds + wires a mic source node when a live stream is supplied', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const stream = makeFakeStream(true);
    const graph = buildAudioGraph(ctx as unknown as AudioContext, stream, cfg, false);
    expect(graph.micSourceNode).not.toBeNull();
    expect((graph.micSourceNode as unknown as FakeMediaSrc).connect).toHaveBeenCalledWith(
      graph.gainNode
    );
  });

  it('survives createMediaStreamSource throwing (dead stream)', () => {
    const ctx = createAudioContext() as unknown as FakeAudioContext;
    const orig = ctx.createMediaStreamSource.bind(ctx);
    ctx.createMediaStreamSource = () => {
      throw new Error('stream ended');
    };
    const graph = buildAudioGraph(ctx as unknown as AudioContext, makeFakeStream(true), cfg, false);
    expect(graph.micSourceNode).toBeNull();
    // Other nodes still built fine.
    expect(graph.gainNode).toBeDefined();
    expect(graph.analyser).toBeDefined();
    ctx.createMediaStreamSource = orig;
  });
});

// ─── createAudioRecovery ─────────────────────────────────────────────

describe('createAudioRecovery', () => {
  function setupRecovery(initialCtx: FakeAudioContext) {
    const snapshot: AudioStateSnapshot = {
      audioCtx: initialCtx as unknown as AudioContext,
      gainNode: initialCtx.createGain() as unknown as GainNode,
      analyser: initialCtx.createAnalyser() as unknown as AnalyserNode,
      onsetAnalyser: initialCtx.createAnalyser() as unknown as AnalyserNode,
      micSourceNode: null,
      micStream: null,
    };
    let applied: { ctx: AudioContext; graph: ReturnType<typeof buildAudioGraph> } | null = null;
    let resetCalls = 0;
    let afterCalls = 0;
    const recovery = createAudioRecovery({
      getSnapshot: () => snapshot,
      applyContext: (newCtx, graph) => {
        applied = { ctx: newCtx, graph };
        snapshot.audioCtx = newCtx;
      },
      isMicSuspended: () => false,
      config: cfg,
      resetOnsetState: () => {
        resetCalls++;
      },
      onAfterRecovery: () => {
        afterCalls++;
      },
    });
    return {
      recovery,
      snapshot,
      get applied() {
        return applied;
      },
      get resetCalls() {
        return resetCalls;
      },
      get afterCalls() {
        return afterCalls;
      },
    };
  }

  it('no-ops when there is no current AudioContext', async () => {
    const harness = setupRecovery(new FakeAudioContext());
    harness.snapshot.audioCtx = null;
    await harness.recovery.recover();
    expect(harness.applied).toBeNull();
  });

  it('disconnects old nodes, closes, and applies a fresh context + graph', async () => {
    const oldCtx = new FakeAudioContext();
    const harness = setupRecovery(oldCtx);
    const oldGain = harness.snapshot.gainNode as unknown as FakeGain;
    const oldAnalyser = harness.snapshot.analyser as unknown as FakeAnalyser;
    const oldOnset = harness.snapshot.onsetAnalyser as unknown as FakeAnalyser;
    await harness.recovery.recover();
    expect(oldGain.disconnect).toHaveBeenCalled();
    expect(oldAnalyser.disconnect).toHaveBeenCalled();
    expect(oldOnset.disconnect).toHaveBeenCalled();
    expect(oldCtx.closed).toBe(true);
    expect(harness.applied).not.toBeNull();
    expect(harness.applied!.ctx).not.toBe(oldCtx);
  });

  it('resets onset state + fires onAfterRecovery exactly once per cycle', async () => {
    const harness = setupRecovery(new FakeAudioContext());
    await harness.recovery.recover();
    expect(harness.resetCalls).toBe(1);
    expect(harness.afterCalls).toBe(1);
  });

  it('shares one in-flight cycle across concurrent callers (re-entrancy guard)', async () => {
    const harness = setupRecovery(new FakeAudioContext());
    const p1 = harness.recovery.recover();
    const p2 = harness.recovery.recover();
    await Promise.all([p1, p2]);
    // Only one apply, one reset, one after.
    expect(harness.resetCalls).toBe(1);
    expect(harness.afterCalls).toBe(1);
  });

  it('survives gainNode.disconnect throwing (already disconnected)', async () => {
    const harness = setupRecovery(new FakeAudioContext());
    const oldGain = harness.snapshot.gainNode as unknown as FakeGain;
    oldGain.disconnect.mockImplementation(() => {
      throw new Error('already disconnected');
    });
    await expect(harness.recovery.recover()).resolves.toBeUndefined();
    expect(harness.applied).not.toBeNull();
  });

  it('preserves micStream across the recreate (stream survives backgrounding)', async () => {
    const oldCtx = new FakeAudioContext();
    const harness = setupRecovery(oldCtx);
    const stream = makeFakeStream(true);
    harness.snapshot.micStream = stream;
    await harness.recovery.recover();
    // The new graph should have a mic source node wired (the stream was alive).
    expect(harness.applied!.graph.micSourceNode).not.toBeNull();
  });
});
