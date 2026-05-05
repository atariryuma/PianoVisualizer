// getUserMedia adapter. Fixed at 48000 Hz to dodge the AirPods 24/48
// sample-rate flip (WebKit Bug 154538, open as of 2025).
//
// Phase 0b placeholder.

const AUDIO_SAMPLE_RATE = 48000;

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    autoGainControl: false,
    noiseSuppression: false,
    echoCancellation: false,
    sampleRate: { ideal: AUDIO_SAMPLE_RATE },
  },
};

export interface MicAdapter {
  stream: MediaStream;
  audioCtx: AudioContext;
  source: MediaStreamAudioSourceNode;
  stop(): Promise<void>;
}

export async function startWebAudioMicAdapter(): Promise<MicAdapter | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  let audioCtx: AudioContext;
  try {
    audioCtx = new Ctor({ sampleRate: AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
  } catch (_) {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const source = audioCtx.createMediaStreamSource(stream);
  return {
    stream,
    audioCtx,
    source,
    async stop() {
      stream.getTracks().forEach((t) => t.stop());
      try {
        source.disconnect();
      } catch (_) {}
      try {
        await audioCtx.close();
      } catch (_) {}
    },
  };
}
