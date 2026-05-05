// Minimal in-memory stub of the WebAudio surface used by audio-context.ts tests.
// Records connect() / setValueAtTime() calls so we can assert wiring.

import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  AnalyserNodeLike,
  GainNodeLike,
  MediaStreamAudioSourceNodeLike,
} from '../../src/audio/audio-context';

export class StubAudioParam implements AudioParamLike {
  value = 0;
  history: Array<{ value: number; atTime: number }> = [];
  setValueAtTime(value: number, atTime: number): AudioParamLike {
    this.value = value;
    this.history.push({ value, atTime });
    return this;
  }
  cancelScheduledValues(_atTime: number): AudioParamLike {
    this.history = [];
    return this;
  }
}

let _connectionCount = 0;
const _allConnections: Array<{ from: AudioNodeLike; to: AudioNodeLike }> = [];

export function getRecordedConnections() {
  return _allConnections.slice();
}
export function clearRecordedConnections() {
  _allConnections.length = 0;
  _connectionCount = 0;
}

class StubNode implements AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike {
    _allConnections.push({ from: this, to: destination });
    _connectionCount++;
    return destination;
  }
  disconnect(): void {
    /* no-op */
  }
}

export class StubGainNode extends StubNode implements GainNodeLike {
  gain = new StubAudioParam();
}

export class StubAnalyserNode extends StubNode implements AnalyserNodeLike {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  get frequencyBinCount(): number {
    return this.fftSize / 2;
  }
  getByteFrequencyData(_array: Uint8Array): void {
    /* no-op */
  }
  getFloatTimeDomainData(_array: Float32Array): void {
    /* no-op */
  }
}

export class StubMediaStreamSource extends StubNode implements MediaStreamAudioSourceNodeLike {}

export class StubAudioContext implements AudioContextLike {
  state: 'suspended' | 'running' | 'closed';
  sampleRate: number;
  currentTime = 0;
  closeCalls = 0;
  resumeCalls = 0;

  constructor(opts?: { sampleRate?: number; latencyHint?: string }) {
    this.sampleRate = opts?.sampleRate ?? 44100;
    this.state = 'suspended';
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }
  async suspend(): Promise<void> {
    this.state = 'suspended';
  }
  async close(): Promise<void> {
    this.closeCalls++;
    this.state = 'closed';
  }
  createGain(): GainNodeLike {
    return new StubGainNode();
  }
  createAnalyser(): AnalyserNodeLike {
    return new StubAnalyserNode();
  }
  createMediaStreamSource(_stream: MediaStream): MediaStreamAudioSourceNodeLike {
    return new StubMediaStreamSource();
  }
}

/** Stub MediaStream that always reports active=true. */
export function fakeMediaStream(active = true): MediaStream {
  return {
    active,
    getTracks: () => [],
  } as unknown as MediaStream;
}
