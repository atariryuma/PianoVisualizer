import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAudioContext,
  buildAudioGraph,
  pickAudioOffsetMs,
  recoverAudioContext,
  AUDIO_SAMPLE_RATE,
} from '../src/audio/audio-context';
import {
  StubAudioContext,
  StubGainNode,
  StubAnalyserNode,
  fakeMediaStream,
  clearRecordedConnections,
  getRecordedConnections,
} from './_fixtures/audio-context-stub';

beforeEach(() => clearRecordedConnections());

describe('createAudioContext', () => {
  it('uses provided Ctor and passes 48 kHz options', () => {
    const ctx = createAudioContext(StubAudioContext);
    expect(ctx.sampleRate).toBe(AUDIO_SAMPLE_RATE);
  });

  it('falls back to bare ctor when options are rejected', () => {
    class StrictCtor extends StubAudioContext {
      constructor(opts?: any) {
        if (opts) throw new TypeError('options not supported');
        super(undefined);
        this.sampleRate = 44100;
      }
    }
    const ctx = createAudioContext(StrictCtor as any);
    expect(ctx.sampleRate).toBe(44100); // fallback path
  });

  it('throws if no Ctor available', () => {
    // Save + clear globals.
    const saveAC = (globalThis as any).AudioContext;
    const saveWk = (globalThis as any).webkitAudioContext;
    delete (globalThis as any).AudioContext;
    delete (globalThis as any).webkitAudioContext;
    try {
      expect(() => createAudioContext()).toThrow(/AudioContext.*not available/);
    } finally {
      if (saveAC) (globalThis as any).AudioContext = saveAC;
      if (saveWk) (globalThis as any).webkitAudioContext = saveWk;
    }
  });
});

describe('buildAudioGraph', () => {
  it('wires gain → both analysers', () => {
    const ctx = new StubAudioContext({ sampleRate: 48000 });
    const g = buildAudioGraph(ctx, {
      fftSize: 4096,
      smoothing: 0.82,
      onsetFftSize: 2048,
      onsetSmoothing: 0.15,
    });
    expect(g.gain).toBeInstanceOf(StubGainNode);
    expect(g.mainAnalyser).toBeInstanceOf(StubAnalyserNode);
    expect(g.onsetAnalyser).toBeInstanceOf(StubAnalyserNode);
    expect(g.mainAnalyser.fftSize).toBe(4096);
    expect(g.mainAnalyser.smoothingTimeConstant).toBe(0.82);
    expect(g.onsetAnalyser.fftSize).toBe(2048);
    expect(g.onsetAnalyser.smoothingTimeConstant).toBe(0.15);

    const conns = getRecordedConnections();
    // gain → main, gain → onset
    expect(conns).toHaveLength(2);
    expect(conns[0].from).toBe(g.gain);
    expect(conns[0].to).toBe(g.mainAnalyser);
    expect(conns[1].to).toBe(g.onsetAnalyser);
  });

  it('allocates Uint8/Float32 arrays sized to the analysers', () => {
    const ctx = new StubAudioContext();
    const g = buildAudioGraph(ctx, {
      fftSize: 2048,
      smoothing: 0.8,
      onsetFftSize: 1024,
      onsetSmoothing: 0.2,
    });
    expect(g.dataArray.length).toBe(1024); // frequencyBinCount = fftSize/2
    expect(g.freqArray.length).toBe(2048);
    expect(g.onsetDataArray.length).toBe(512);
  });

  it('wires mic source → gain when stream is active', () => {
    const ctx = new StubAudioContext();
    const g = buildAudioGraph(ctx, {
      fftSize: 2048,
      smoothing: 0.8,
      onsetFftSize: 1024,
      onsetSmoothing: 0.2,
      micStream: fakeMediaStream(true),
    });
    expect(g.micSource).not.toBeNull();
    const conns = getRecordedConnections();
    // gain→main, gain→onset, micSource→gain
    expect(conns.length).toBe(3);
    const micWiring = conns.find((c) => c.to === g.gain);
    expect(micWiring).toBeDefined();
  });

  it('skips mic wiring when stream is inactive', () => {
    const ctx = new StubAudioContext();
    const g = buildAudioGraph(ctx, {
      fftSize: 2048,
      smoothing: 0.8,
      onsetFftSize: 1024,
      onsetSmoothing: 0.2,
      micStream: fakeMediaStream(false),
    });
    expect(g.micSource).toBeNull();
  });

  it('sets initial gain via setValueAtTime', () => {
    const ctx = new StubAudioContext();
    const g = buildAudioGraph(ctx, {
      fftSize: 2048,
      smoothing: 0.8,
      onsetFftSize: 1024,
      onsetSmoothing: 0.2,
      initialGain: 0, // mic suspended
    });
    expect(g.gain.gain.value).toBe(0);
  });
});

describe('recoverAudioContext', () => {
  it('closes the prev context and returns a fresh graph', async () => {
    const prevCtx = new StubAudioContext({ sampleRate: 48000 });
    const prev = buildAudioGraph(prevCtx, {
      fftSize: 4096,
      smoothing: 0.82,
      onsetFftSize: 2048,
      onsetSmoothing: 0.15,
    });
    clearRecordedConnections();

    const next = await recoverAudioContext(
      prev,
      { fftSize: 4096, smoothing: 0.82, onsetFftSize: 2048, onsetSmoothing: 0.15 },
      StubAudioContext
    );

    // Old ctx should have been closed.
    expect(prevCtx.closeCalls).toBe(1);
    // New ctx is a fresh StubAudioContext.
    expect(next.ctx).not.toBe(prev.ctx);
    expect(next.ctx.state).toBe('running'); // resume() was awaited
    // Wiring re-established (gain → main, gain → onset).
    expect(getRecordedConnections().length).toBe(2);
  });

  it('survives prev.ctx.close() throwing', async () => {
    class ThrowingClose extends StubAudioContext {
      override async close(): Promise<void> {
        throw new Error('already closed');
      }
    }
    const prevCtx = new ThrowingClose();
    const prev = buildAudioGraph(prevCtx, {
      fftSize: 2048,
      smoothing: 0.8,
      onsetFftSize: 1024,
      onsetSmoothing: 0.2,
    });
    const next = await recoverAudioContext(
      prev,
      { fftSize: 2048, smoothing: 0.8, onsetFftSize: 1024, onsetSmoothing: 0.2 },
      StubAudioContext
    );
    expect(next.ctx).not.toBe(prevCtx);
  });
});

describe('pickAudioOffsetMs', () => {
  it('user override always wins, even when reported latency is large', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: 25,
        reportedOutMs: 100,
        reportedBaseMs: 50,
        defaultMs: 40,
      })
    ).toBe(25);
  });

  it('user override of 0 is honored (kid wants no compensation)', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: 0,
        reportedOutMs: 80,
        reportedBaseMs: 20,
        defaultMs: 40,
      })
    ).toBe(0);
  });

  it('falls back to default when neither out nor base populate', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 0,
        reportedBaseMs: 0,
        defaultMs: 40,
      })
    ).toBe(40);
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 2,
        reportedBaseMs: 1,
        defaultMs: 40,
      })
    ).toBe(40);
  });

  it('falls back to default when only baseLatency reports (Windows Chrome case)', () => {
    // The exact case from the field: Chrome on Windows reports
    // outputLatency=0 (speaker-side not exposed) but baseLatency=10 (block
    // size). The 10 ms is only the processing buffer, NOT the actual speaker
    // driver delay (~30-80 ms on Windows). Trusting that 10 ms makes the
    // cursor visually lead the audio.
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 0,
        reportedBaseMs: 10,
        defaultMs: 40,
      })
    ).toBe(40);
  });

  it('uses out + base when outputLatency is populated', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 80,
        reportedBaseMs: 20,
        defaultMs: 40,
      })
    ).toBe(100);
  });

  it('uses outputLatency alone when baseLatency is 0 (Chrome on Mac sometimes)', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 60,
        reportedBaseMs: 0,
        defaultMs: 40,
      })
    ).toBe(60);
  });

  it('accepts a real Bluetooth reading instead of clamping it away', () => {
    // Regression guard: the cap used to be 200 ms, which is BELOW what the
    // platform needing it most actually reports (iOS WKWebView 180-400 ms;
    // Bluetooth output alone 150-250 ms). A genuine 260 ms reading was clamped
    // to 200, leaving the player permanently judged ~60 ms late with no way to
    // correct it — the slider and the tap calibration capped at 200 as well.
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 240,
        reportedBaseMs: 20,
        defaultMs: 40,
      })
    ).toBe(260);
  });

  it('still bounds an implausible reading (default cap 400)', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 900,
        reportedBaseMs: 50,
        defaultMs: 40,
      })
    ).toBe(400);
  });

  it('honors custom maxClampMs', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 100,
        reportedBaseMs: 0,
        defaultMs: 40,
        maxClampMs: 75,
      })
    ).toBe(75);
  });

  it('honors custom minReportedOutMs', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: null,
        reportedOutMs: 8,
        reportedBaseMs: 0,
        defaultMs: 40,
        minReportedOutMs: 10,
      })
    ).toBe(40);
  });

  it('treats non-finite override as "not set" and falls back', () => {
    expect(
      pickAudioOffsetMs({
        userOverrideMs: NaN,
        reportedOutMs: 80,
        reportedBaseMs: 20,
        defaultMs: 40,
      })
    ).toBe(100);
  });
});
