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
  createAudioLifecycle,
  wireAudioCtxDiag,
  MIC_CONSTRAINTS,
  AUDIO_SAMPLE_RATE,
  type AudioGraphConfig,
  type AudioStateSnapshot,
  type AudioLifecycleDeps,
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

// ─── createAudioLifecycle (Phase 0d batch 60) ─────────────────────

interface LifecycleFx {
  install: () => void;
  uninstall: () => void;
  fireDeviceChange: () => void;
  fireVisibility: (state: 'visible' | 'hidden') => Promise<void>;
  recover: ReturnType<typeof vi.fn>;
  requestWakeLock: ReturnType<typeof vi.fn>;
  verifyMidiAlive: ReturnType<typeof vi.fn>;
  rescanMidi: ReturnType<typeof vi.fn>;
  startMidiAutoRescan: ReturnType<typeof vi.fn>;
  clearMidiAccessCache: ReturnType<typeof vi.fn>;
  setRunning: (b: boolean) => void;
  setAudioCtx: (
    ctx: { state: 'suspended' | 'running'; resume: () => Promise<void> } | null
  ) => void;
  setMidiEnabled: (b: boolean) => void;
  setHasRequestMIDIAccess: (b: boolean) => void;
  warn: ReturnType<typeof vi.fn>;
  /** Drive the fake setTimeout queue manually. */
  flushTimers: (ms: number) => void;
}

function makeLifecycleFixture(over: Partial<AudioLifecycleDeps> = {}): LifecycleFx {
  let running = true;
  let ctx: { state: 'suspended' | 'running'; resume: () => Promise<void> } | null = null;
  let midiEnabled = false;
  let hasRequestMIDIAccess = true;

  const recover = vi.fn(async () => {});
  const requestWakeLock = vi.fn();
  const verifyMidiAlive = vi.fn(async () => true);
  const rescanMidi = vi.fn(async () => true);
  const startMidiAutoRescan = vi.fn();
  const clearMidiAccessCache = vi.fn();
  const warn = vi.fn();

  // Manual event-target stubs so we can fire events deterministically.
  type DeviceListener = (this: unknown, ev: Event) => void;
  let deviceListener: DeviceListener | null = null;
  const mediaDevices = {
    addEventListener: vi.fn((_t: string, h: DeviceListener) => {
      deviceListener = h;
    }),
    removeEventListener: vi.fn(() => {
      deviceListener = null;
    }),
  };

  // Use the real `document` (happy-dom). We force visibilityState
  // via getter override.
  let visState: 'visible' | 'hidden' = 'hidden';
  const docStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    get visibilityState() {
      return visState;
    },
  } as unknown as Document;

  let visListener: (() => void) | null = null;
  (docStub.addEventListener as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_t: string, h: () => void) => {
      visListener = h;
    }
  );

  // Manual fake timers so we can flush devicechange debounce
  // synchronously inside tests.
  const queue: Array<{ id: number; cb: () => void; fireAt: number }> = [];
  let nowMs = 0;
  let nextId = 1;
  const setT = vi.fn((cb: () => void, ms: number) => {
    const id = nextId++;
    queue.push({ id, cb, fireAt: nowMs + ms });
    return id;
  });
  const clearT = vi.fn((handle: unknown) => {
    const idx = queue.findIndex((q) => q.id === handle);
    if (idx >= 0) queue.splice(idx, 1);
  });

  const lifecycle = createAudioLifecycle({
    getAudioCtx: () => ctx as unknown as AudioContext,
    recover,
    isRunning: () => running,
    requestWakeLock,
    navigator: {
      get requestMIDIAccess() {
        return hasRequestMIDIAccess ? () => Promise.resolve({}) : undefined;
      },
      mediaDevices,
    },
    midiInput: {
      get enabled() {
        return midiEnabled;
      },
      set enabled(b: boolean) {
        midiEnabled = b;
      },
    },
    verifyMidiAlive,
    clearMidiAccessCache,
    rescanMidi,
    startMidiAutoRescan,
    document: docStub,
    setTimeout: setT as unknown as AudioLifecycleDeps['setTimeout'],
    clearTimeout: clearT as unknown as AudioLifecycleDeps['clearTimeout'],
    warn,
    ...over,
  });

  return {
    install: lifecycle.install,
    uninstall: lifecycle.uninstall,
    fireDeviceChange: () => {
      if (deviceListener) deviceListener.call(null, new Event('devicechange'));
    },
    fireVisibility: async (state) => {
      visState = state;
      if (visListener) visListener();
      // Drain microtasks so the async handler completes.
      await new Promise((r) => setImmediate(r));
    },
    recover,
    requestWakeLock,
    verifyMidiAlive,
    rescanMidi,
    startMidiAutoRescan,
    clearMidiAccessCache,
    setRunning: (b) => {
      running = b;
    },
    setAudioCtx: (newCtx) => {
      ctx = newCtx;
    },
    setMidiEnabled: (b) => {
      midiEnabled = b;
    },
    setHasRequestMIDIAccess: (b) => {
      hasRequestMIDIAccess = b;
    },
    warn,
    flushTimers: (ms) => {
      nowMs += ms;
      const ready = queue.filter((q) => q.fireAt <= nowMs);
      ready.forEach((q) => q.cb());
      queue.splice(0, queue.length, ...queue.filter((q) => q.fireAt > nowMs));
    },
  };
}

describe('createAudioLifecycle — install / uninstall', () => {
  it('install() registers both listeners; second install is a no-op', () => {
    const fx = makeLifecycleFixture();
    fx.setAudioCtx({ state: 'running', resume: async () => {} });
    fx.install();
    fx.install();
    // Second install must not double-register.
    // (Implementation detail: our stubs record once.)
    fx.fireDeviceChange();
    fx.flushTimers(300);
    expect(fx.recover).toHaveBeenCalledTimes(1);
  });

  it('uninstall() detaches the device handler (no recover after fire)', () => {
    const fx = makeLifecycleFixture();
    fx.install();
    fx.uninstall();
    fx.fireDeviceChange();
    fx.flushTimers(300);
    expect(fx.recover).not.toHaveBeenCalled();
  });
});

describe('createAudioLifecycle — devicechange', () => {
  it('debounces with 250ms default; calls recover() exactly once for a burst', () => {
    const fx = makeLifecycleFixture();
    fx.setAudioCtx({ state: 'running', resume: async () => {} });
    fx.install();
    fx.fireDeviceChange();
    fx.fireDeviceChange();
    fx.fireDeviceChange();
    fx.flushTimers(249);
    expect(fx.recover).not.toHaveBeenCalled();
    fx.flushTimers(2);
    expect(fx.recover).toHaveBeenCalledTimes(1);
  });

  it('honors custom deviceChangeDebounceMs', () => {
    const fx = makeLifecycleFixture({ deviceChangeDebounceMs: 50 });
    fx.setAudioCtx({ state: 'running', resume: async () => {} });
    fx.install();
    fx.fireDeviceChange();
    fx.flushTimers(60);
    expect(fx.recover).toHaveBeenCalledTimes(1);
  });

  it('does nothing when isRunning=false', () => {
    const fx = makeLifecycleFixture();
    fx.setRunning(false);
    fx.setAudioCtx({ state: 'running', resume: async () => {} });
    fx.install();
    fx.fireDeviceChange();
    fx.flushTimers(300);
    expect(fx.recover).not.toHaveBeenCalled();
  });

  it('does nothing when audioCtx is null (boot path)', () => {
    const fx = makeLifecycleFixture();
    fx.setAudioCtx(null);
    fx.install();
    fx.fireDeviceChange();
    fx.flushTimers(300);
    expect(fx.recover).not.toHaveBeenCalled();
  });

  it('warn-logs when recover() rejects (must not propagate)', async () => {
    const fx = makeLifecycleFixture({
      recover: vi.fn().mockRejectedValue(new Error('node closed')),
    });
    fx.setAudioCtx({ state: 'running', resume: async () => {} });
    fx.install();
    fx.fireDeviceChange();
    fx.flushTimers(300);
    // Allow the rejection to flow through.
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.warn).toHaveBeenCalledOnce();
    expect(fx.warn.mock.calls[0][0]).toContain('node closed');
  });
});

describe('createAudioLifecycle — visibilitychange', () => {
  it('hidden → no-op (early return)', async () => {
    const fx = makeLifecycleFixture();
    fx.install();
    await fx.fireVisibility('hidden');
    expect(fx.requestWakeLock).not.toHaveBeenCalled();
  });

  it('hidden calls the optional onHidden hook before returning', async () => {
    const onHidden = vi.fn();
    const fx = makeLifecycleFixture({ onHidden });
    fx.install();
    await fx.fireVisibility('hidden');
    expect(onHidden).toHaveBeenCalledOnce();
    expect(fx.requestWakeLock).not.toHaveBeenCalled();
  });

  it('visible calls the optional onVisible hook before resume work', async () => {
    const onVisible = vi.fn();
    const fx = makeLifecycleFixture({ onVisible });
    fx.install();
    await fx.fireVisibility('visible');
    expect(onVisible).toHaveBeenCalledOnce();
    expect(fx.requestWakeLock).toHaveBeenCalledOnce();
  });

  it('visible + running → re-acquires wake lock', async () => {
    const fx = makeLifecycleFixture();
    fx.install();
    await fx.fireVisibility('visible');
    expect(fx.requestWakeLock).toHaveBeenCalledOnce();
  });

  it('visible + suspended-but-resumable ctx → resume(), no recover()', async () => {
    const resumeSpy = vi.fn(async () => {});
    let st: 'suspended' | 'running' = 'suspended';
    const ctx = {
      get state() {
        return st;
      },
      resume: vi.fn(async () => {
        st = 'running';
        await resumeSpy();
      }),
    };
    const fx = makeLifecycleFixture();
    fx.setAudioCtx(ctx);
    fx.install();
    await fx.fireVisibility('visible');
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(fx.recover).not.toHaveBeenCalled();
  });

  it('visible + suspended-and-stays-suspended → recover()', async () => {
    const ctx = {
      state: 'suspended' as 'suspended' | 'running',
      resume: vi.fn(async () => {}),
    };
    const fx = makeLifecycleFixture();
    fx.setAudioCtx(ctx);
    fx.install();
    await fx.fireVisibility('visible');
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(fx.recover).toHaveBeenCalledOnce();
  });

  it('visible + MIDI alive (verifyAlive=true) → no rescan', async () => {
    const fx = makeLifecycleFixture();
    fx.setMidiEnabled(true);
    fx.verifyMidiAlive.mockResolvedValue(true);
    fx.install();
    await fx.fireVisibility('visible');
    expect(fx.verifyMidiAlive).toHaveBeenCalledOnce();
    expect(fx.clearMidiAccessCache).not.toHaveBeenCalled();
    expect(fx.rescanMidi).not.toHaveBeenCalled();
  });

  it('visible + MIDI corpse (verifyAlive=false) → clear + silent rescan', async () => {
    const fx = makeLifecycleFixture();
    fx.setMidiEnabled(true);
    fx.verifyMidiAlive.mockResolvedValue(false);
    fx.rescanMidi.mockResolvedValue(true);
    fx.install();
    await fx.fireVisibility('visible');
    expect(fx.clearMidiAccessCache).toHaveBeenCalled();
    expect(fx.rescanMidi).toHaveBeenCalledWith(true);
    // Drain rescan microtasks
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.startMidiAutoRescan).not.toHaveBeenCalled(); // rescan succeeded
  });

  it('visible + no MIDI + rescan fails → startMidiAutoRescan kicks', async () => {
    const fx = makeLifecycleFixture();
    fx.setMidiEnabled(false);
    fx.rescanMidi.mockResolvedValue(false);
    fx.install();
    await fx.fireVisibility('visible');
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('visible + rescan rejects → startMidiAutoRescan still runs', async () => {
    const fx = makeLifecycleFixture();
    fx.rescanMidi.mockRejectedValue(new Error('boom'));
    fx.install();
    await fx.fireVisibility('visible');
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('navigator.requestMIDIAccess missing → no MIDI work, audio still ran', async () => {
    const fx = makeLifecycleFixture();
    fx.setHasRequestMIDIAccess(false);
    fx.install();
    await fx.fireVisibility('visible');
    expect(fx.requestWakeLock).toHaveBeenCalledOnce();
    expect(fx.verifyMidiAlive).not.toHaveBeenCalled();
    expect(fx.rescanMidi).not.toHaveBeenCalled();
  });
});

// ─── wireAudioCtxDiag (Phase 0d batch 63 helper) ──────────────────

describe('wireAudioCtxDiag', () => {
  function makeFakeCtx(): {
    state: string;
    sampleRate: number;
    currentTime: number;
    onstatechange: (() => void) | null;
  } {
    return {
      state: 'running',
      sampleRate: 48000,
      currentTime: 1.234,
      onstatechange: null,
    };
  }

  it('does nothing when enabled is false', () => {
    const ctx = makeFakeCtx();
    wireAudioCtxDiag(ctx as unknown as AudioContext, false);
    expect(ctx.onstatechange).toBeNull();
  });

  it('installs onstatechange when enabled is true', () => {
    const ctx = makeFakeCtx();
    wireAudioCtxDiag(ctx as unknown as AudioContext, true);
    expect(typeof ctx.onstatechange).toBe('function');
  });

  it('logs state + sampleRate + currentTime when fired', () => {
    const ctx = makeFakeCtx();
    const log = vi.fn();
    wireAudioCtxDiag(ctx as unknown as AudioContext, true, log);
    ctx.onstatechange?.();
    expect(log).toHaveBeenCalledOnce();
    const msg = log.mock.calls[0][0];
    expect(msg).toContain('[DIAG-AUDIOCTX]');
    expect(msg).toContain('state=running');
    expect(msg).toContain('sampleRate=48000');
    expect(msg).toContain('currentTime=1.234');
  });

  it('appends optional suffix to the log line', () => {
    const ctx = makeFakeCtx();
    const log = vi.fn();
    wireAudioCtxDiag(ctx as unknown as AudioContext, true, log, '(post-recovery)');
    ctx.onstatechange?.();
    expect(log.mock.calls[0][0]).toContain('(post-recovery)');
  });

  it('reads ctx.state fresh per fire', () => {
    const ctx = makeFakeCtx();
    const log = vi.fn();
    wireAudioCtxDiag(ctx as unknown as AudioContext, true, log);
    ctx.onstatechange?.();
    ctx.state = 'suspended';
    ctx.onstatechange?.();
    expect(log.mock.calls[0][0]).toContain('state=running');
    expect(log.mock.calls[1][0]).toContain('state=suspended');
  });

  it('survives onstatechange being readonly (silently no-ops)', () => {
    const ctx = Object.defineProperty(makeFakeCtx(), 'onstatechange', {
      get() {
        return null;
      },
      set() {
        throw new Error('readonly');
      },
      configurable: true,
    });
    expect(() => wireAudioCtxDiag(ctx as unknown as AudioContext, true)).not.toThrow();
  });

  it('falls back to console.log when no logger override', () => {
    const ctx = makeFakeCtx();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    wireAudioCtxDiag(ctx as unknown as AudioContext, true);
    ctx.onstatechange?.();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
