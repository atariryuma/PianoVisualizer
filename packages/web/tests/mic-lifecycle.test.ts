// @vitest-environment happy-dom
// Tests for packages/web/src/mic-lifecycle.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMicLifecycle,
  type MicLifecycleStateRef,
  type MicLifecycleAudioCtx,
  type MicLifecycleGainNode,
} from '../src/mic-lifecycle';

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  __id: string;
}
interface FakeStream {
  getTracks(): FakeTrack[];
  __id: string;
}
interface FakeSourceNode {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  __id: string;
}

function makeStream(id: string): FakeStream {
  const track1: FakeTrack = { stop: vi.fn(), __id: id + '-t1' };
  return {
    __id: id,
    getTracks: () => [track1],
  };
}

function makeFixture(over: { hasAudioCtx?: boolean; gumReject?: Error } = {}) {
  const state: MicLifecycleStateRef = {
    micSuspended: true,
    micPermissionFailed: false,
    adaptiveSilenceRms: 0.1,
    recentPitches: [440],
  };
  const setValueAtTime = vi.fn();
  const cancelScheduledValues = vi.fn();
  const gainNode: MicLifecycleGainNode = {
    gain: { setValueAtTime, cancelScheduledValues },
  };
  let audioCtx: MicLifecycleAudioCtx | null =
    (over.hasAudioCtx ?? true)
      ? {
          currentTime: 1.5,
          createMediaStreamSource: vi.fn((stream: MediaStream) => {
            const source: FakeSourceNode = {
              connect: vi.fn(),
              disconnect: vi.fn(),
              __id: 'src-' + (stream as unknown as FakeStream).__id,
            };
            return source as unknown as MediaStreamAudioSourceNode;
          }),
        }
      : null;

  let micStream: MediaStream | null = null;
  let micSourceNode: MediaStreamAudioSourceNode | null = null;
  const setMicStreamSpy = vi.fn((s: MediaStream | null) => {
    micStream = s;
  });
  const setMicSourceNodeSpy = vi.fn((n: MediaStreamAudioSourceNode | null) => {
    micSourceNode = n;
  });

  const getUserMedia = vi.fn(async () => {
    if (over.gumReject) throw over.gumReject;
    return makeStream('gum1') as unknown as MediaStream;
  });

  const micMeterEl = document.createElement('div');
  document.body.appendChild(micMeterEl);

  const refreshIntroHint = vi.fn();

  const lc = createMicLifecycle({
    state,
    micConstraints: { audio: true },
    getUserMedia,
    getAudioCtx: () => audioCtx,
    getGainNode: () => gainNode,
    getMicStream: () => micStream,
    setMicStream: setMicStreamSpy,
    getMicSourceNode: () => micSourceNode,
    setMicSourceNode: setMicSourceNodeSpy,
    micMeterEl,
    refreshIntroHint,
  });

  return {
    lc,
    state,
    audioCtx,
    gainNode,
    setValueAtTime,
    cancelScheduledValues,
    getUserMedia,
    setMicStreamSpy,
    setMicSourceNodeSpy,
    micMeterEl,
    refreshIntroHint,
    getMicStream: () => micStream,
    getMicSourceNode: () => micSourceNode,
    setAudioCtxNull() {
      audioCtx = null;
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createMicLifecycle — acquire', () => {
  it('calls getUserMedia and writes both stream + sourceNode setters', async () => {
    const fx = makeFixture();
    await fx.lc.acquire();
    expect(fx.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(fx.setMicStreamSpy).toHaveBeenCalled();
    expect(fx.setMicSourceNodeSpy).toHaveBeenCalled();
    expect(fx.getMicStream()).not.toBeNull();
    expect(fx.getMicSourceNode()).not.toBeNull();
  });

  it('sets state.micSuspended = false on success', async () => {
    const fx = makeFixture();
    await fx.lc.acquire();
    expect(fx.state.micSuspended).toBe(false);
  });

  it('writes gainNode.gain to 1.0 at audioCtx.currentTime', async () => {
    const fx = makeFixture();
    await fx.lc.acquire();
    expect(fx.cancelScheduledValues).toHaveBeenCalledWith(1.5);
    expect(fx.setValueAtTime).toHaveBeenCalledWith(1.0, 1.5);
  });

  it('returns early when micStream already exists', async () => {
    const fx = makeFixture();
    await fx.lc.acquire(); // first acquire → fills micStream
    fx.getUserMedia.mockClear();
    await fx.lc.acquire();
    expect(fx.getUserMedia).not.toHaveBeenCalled();
  });

  it('shares the in-flight work across concurrent callers (concurrency lock)', async () => {
    // Two callers both await getUserMedia ONCE — the second await
    // chains to the first call's promise instead of issuing its own.
    const fx = makeFixture();
    const p1 = fx.lc.acquire();
    const p2 = fx.lc.acquire();
    await Promise.all([p1, p2]);
    expect(fx.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('clears micPermissionFailed + reveals mic meter when previously failed', async () => {
    const fx = makeFixture();
    fx.state.micPermissionFailed = true;
    await fx.lc.acquire();
    expect(fx.state.micPermissionFailed).toBe(false);
    expect(fx.refreshIntroHint).toHaveBeenCalled();
    expect(fx.micMeterEl.classList.contains('visible')).toBe(true);
  });

  it("doesn't fire refreshIntroHint when permission was already OK", async () => {
    const fx = makeFixture();
    fx.state.micPermissionFailed = false;
    await fx.lc.acquire();
    expect(fx.refreshIntroHint).not.toHaveBeenCalled();
  });

  it('stops redundant tracks when a concurrent caller already populated micStream', async () => {
    // Simulate a race: while getUserMedia is in flight, another caller
    // populates micStream. The settled promise must stop its tracks.
    const fx = makeFixture();
    let resolveGum!: (s: FakeStream) => void;
    fx.getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((res) => {
          resolveGum = (s) => res(s as unknown as MediaStream);
        })
    );
    const p = fx.lc.acquire();

    // Mid-flight: populate micStream behind the lock's back.
    fx.setMicStreamSpy(makeStream('preempt') as unknown as MediaStream);

    const racedStream = makeStream('lateGum');
    resolveGum(racedStream);
    await p;

    // The lateGum stream's tracks should have been stopped.
    expect(racedStream.getTracks()[0].stop).toHaveBeenCalled();
  });

  it('stops tracks defensively when audioCtx or gainNode is missing', async () => {
    const fx = makeFixture({ hasAudioCtx: true });
    fx.setAudioCtxNull();
    const stream = makeStream('safe');
    fx.getUserMedia.mockResolvedValueOnce(stream as unknown as MediaStream);
    await fx.lc.acquire();
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(fx.getMicStream()).toBeNull(); // never set
  });
});

describe('createMicLifecycle — suspend', () => {
  it('returns early when state.micSuspended is already true', () => {
    const fx = makeFixture();
    fx.state.micSuspended = true;
    fx.lc.suspend();
    expect(fx.cancelScheduledValues).not.toHaveBeenCalled();
  });

  it('zeros the gain envelope', () => {
    const fx = makeFixture();
    fx.state.micSuspended = false;
    fx.lc.suspend();
    expect(fx.cancelScheduledValues).toHaveBeenCalledWith(1.5);
    expect(fx.setValueAtTime).toHaveBeenCalledWith(0, 1.5);
  });

  it('disconnects + nullifies micSourceNode', async () => {
    const fx = makeFixture();
    await fx.lc.acquire();
    const sourceBefore = fx.getMicSourceNode() as unknown as FakeSourceNode;
    fx.lc.suspend();
    expect(sourceBefore.disconnect).toHaveBeenCalled();
    expect(fx.getMicSourceNode()).toBeNull();
  });

  it('survives a disconnect() throw (InvalidAccessError already-disconnected)', async () => {
    const fx = makeFixture();
    await fx.lc.acquire();
    const sourceBefore = fx.getMicSourceNode() as unknown as FakeSourceNode;
    sourceBefore.disconnect.mockImplementationOnce(() => {
      throw new Error('InvalidAccessError');
    });
    expect(() => fx.lc.suspend()).not.toThrow();
    expect(fx.getMicSourceNode()).toBeNull();
  });

  it('stops tracks + nullifies micStream', async () => {
    const fx = makeFixture();
    await fx.lc.acquire();
    const streamBefore = fx.getMicStream() as unknown as FakeStream;
    fx.lc.suspend();
    expect(streamBefore.getTracks()[0].stop).toHaveBeenCalled();
    expect(fx.getMicStream()).toBeNull();
  });

  it('clears mic-derived state (adaptiveSilenceRms + recentPitches)', () => {
    const fx = makeFixture();
    fx.state.micSuspended = false;
    fx.state.adaptiveSilenceRms = 0.42;
    fx.state.recentPitches = [440, 880];
    fx.lc.suspend();
    expect(fx.state.adaptiveSilenceRms).toBe(null);
    expect(fx.state.recentPitches).toEqual([]);
  });
});

describe('createMicLifecycle — resume', () => {
  it('returns early when audioCtx is null', async () => {
    const fx = makeFixture();
    fx.setAudioCtxNull();
    fx.state.micSuspended = true;
    await fx.lc.resume();
    expect(fx.getUserMedia).not.toHaveBeenCalled();
  });

  it('returns early when state.micSuspended is false (mic already live)', async () => {
    const fx = makeFixture();
    fx.state.micSuspended = false;
    await fx.lc.resume();
    expect(fx.getUserMedia).not.toHaveBeenCalled();
  });

  it('calls acquire when both gates pass', async () => {
    const fx = makeFixture();
    fx.state.micSuspended = true;
    await fx.lc.resume();
    expect(fx.getUserMedia).toHaveBeenCalled();
  });

  it("logs and swallows acquire() errors (doesn't throw)", async () => {
    const fx = makeFixture({ gumReject: new Error('NotAllowed') });
    fx.state.micSuspended = true;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fx.lc.resume()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
