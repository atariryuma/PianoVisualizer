// Audio shell — Phase 0d batch 104.
//
// Bundles the AudioContext singletons + initAudio + mic lifecycle +
// audio-graph helpers + visibility-recovery into one factory. The
// audio nodes are private to the module; consumers reach for them
// via the get*-thunk surface (matches the rest of the deps-bag pattern).
//
// Contract: \`initAudio()\` is idempotent (Phase 0d Issue 1 layer 3:
// re-entry from title screen reuses the existing AudioContext so
// Tone.js's Transport binding stays intact). The recovery path
// (\`recover()\`) closes + recreates the context wholesale per
// WebKit Bugs 237878 / 261554 because suspend/resume alone is
// unreliable on iOS WKWebView post-background.

import * as AudioInit from './audio-init';
import * as MicLifecycle from './mic-lifecycle';

 
export interface ShellAudioDeps {
  state: any;
  /** practice is forward-declared in the shell — getter so the after-recovery
   *  hook reads the live binding, not the placeholder. */
  getPractice: () => any;
  config: {
    FFT_SIZE: number;
    SMOOTHING: number;
    ONSET_FFT_SIZE: number;
    ONSET_SMOOTHING: number;
  };
  micMeterEl: HTMLElement;
  remoteLogEnabled: boolean;
  /** Live MIDI input wrapper used by mic-lifecycle. The shell's
   *  ShellMidi is not yet built when this factory runs, so the MIDI
   *  ref flows in by getter. */
  getMidiInputEnabled: () => boolean;
  /** Re-entry path probes MIDI before returning. */
  initWebMIDI: () => Promise<any>;
  isAppleMobile: () => boolean;
  refreshIntroHint: () => void;
  /** stopPracticeAudio invoked in the after-recovery hook (post-background
   *  the Tone.js Transport is unreliable, so practice mode is forcibly off). */
  stopPracticeAudio: () => void;
}

export interface ShellAudio {
  /** Async init — idempotent. Sets up audioCtx + audio graph + decides initial input mode. */
  initAudio: () => Promise<void>;
  /** Live audio-context accessor. Null pre-init. */
  getAudioCtx: () => any;
  getAnalyser: () => any;
  getOnsetAnalyser: () => any;
  getGainNode: () => any;
  getDataArray: () => any;
  getFreqArray: () => any;
  getOnsetDataArray: () => any;
  getMicStream: () => MediaStream | null;
  /** rebuildAudioGraph(prevMicStream) — used by mic-suspend-resume cycles. */
  rebuildAudioGraph: (prevMicStream: MediaStream | null) => void;
  /** AudioContext recovery (visibility / devicechange) — close + recreate. */
  recover: () => Promise<void>;
  /** Mic suspend / resume. */
  suspendMic: () => void;
  resumeMic: () => Promise<unknown>;
}

export function createShellAudio(deps: ShellAudioDeps): ShellAudio {
  // Audio singletons — populated by initAudio() / rebuildAudioGraph(). Cast
  // to `any` because every reader is gated by `state.running` which is set
  // after init; pre-init reads never happen at runtime.
  let audioCtx: any = null;
  let analyser: any = null;
  let onsetAnalyser: any = null;
  let gainNode: any = null;
  let dataArray: any = null;
  let freqArray: any = null;
  let onsetDataArray: any = null;
  let micStream: MediaStream | null = null;
  let micSourceNode: MediaStreamAudioSourceNode | null = null;

  const _audioGraphCfg = {
    fftSize: deps.config.FFT_SIZE,
    smoothing: deps.config.SMOOTHING,
    onsetFftSize: deps.config.ONSET_FFT_SIZE,
    onsetSmoothing: deps.config.ONSET_SMOOTHING,
  };

  /** Spread a freshly-built graph onto the local node refs. Shared by
   *  rebuildAudioGraph() (initAudio) + _audioRecovery.applyContext (visibility
   *  recovery) so the two stay in lock-step. */
  function _applyAudioGraph(g: any): void {
    gainNode = g.gainNode;
    analyser = g.analyser;
    onsetAnalyser = g.onsetAnalyser;
    dataArray = g.dataArray;
    freqArray = g.freqArray;
    onsetDataArray = g.onsetDataArray;
    micSourceNode = g.micSourceNode;
  }
  function _resetOnsetState(): void {
    deps.state.prevSpectrum = null;
    deps.state.spectralFluxHistory = [];
  }
  function rebuildAudioGraph(prevMicStream: MediaStream | null): void {
    _applyAudioGraph(
      AudioInit.buildAudioGraph(audioCtx, prevMicStream, _audioGraphCfg, !!deps.state.micSuspended)
    );
    _resetOnsetState();
  }

  const _micLifecycle = MicLifecycle.createMicLifecycle({
    state: deps.state,
    micConstraints: AudioInit.MIC_CONSTRAINTS,
    getUserMedia: (c: any) => navigator.mediaDevices.getUserMedia(c),
    getAudioCtx: () => audioCtx,
    getGainNode: () => gainNode,
    getMicStream: () => micStream,
    setMicStream: (s: any) => {
      micStream = s;
    },
    getMicSourceNode: () => micSourceNode,
    setMicSourceNode: (n: any) => {
      micSourceNode = n;
    },
    micMeterEl: deps.micMeterEl,
    refreshIntroHint: deps.refreshIntroHint,
    midiInput: {
      get enabled() {
        return deps.getMidiInputEnabled();
      },
    } as any,
    initWebMIDI: deps.initWebMIDI,
    isAppleMobile: deps.isAppleMobile,
    hasRequestMIDIAccess: () => typeof navigator.requestMIDIAccess === 'function',
  });

  async function initAudio(): Promise<void> {
    // [Bug fix 2026-05-09] Idempotent re-entry: re-using the existing
    // AudioContext keeps Tone.js's Transport binding intact so a
    // title-round-trip doesn't silently break listen mode.
    if (audioCtx && audioCtx.state !== 'closed') {
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (_e) {
          /* best-effort */
        }
      }
      console.log(
        '[AUDIO] re-entry — reusing existing AudioContext (state=' + audioCtx.state + ')'
      );
      // Probe MIDI again so an externally-attached keyboard since the
      // last init shows up. Mic state was already set last time; don't disturb.
      try {
        await deps.initWebMIDI();
      } catch (_e) {
        /* fall back to mic */
      }
      return;
    }

    console.log('Initializing Audio...');
    audioCtx = AudioInit.createAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
      console.log('AudioContext resumed @' + audioCtx.sampleRate + 'Hz');
    }
    // [DIAG-AUDIOCTX] Watch for unexpected state transitions.
    AudioInit.wireAudioCtxDiag(audioCtx, deps.remoteLogEnabled);

    // Audio graph (sourceless): gain → analyser, gain → onsetAnalyser.
    rebuildAudioGraph(null);

    await _micLifecycle.decideInitialInputMode();
  }

  // WebKit Bugs 237878 / 261554 (open as of 2025): suspend/resume alone is
  // unreliable on iOS WKWebView — close + recreate the AudioContext on
  // visibility / devicechange.
  const _audioRecovery = AudioInit.createAudioRecovery({
    getSnapshot: () => ({ audioCtx, gainNode, analyser, onsetAnalyser, micSourceNode, micStream }),
    applyContext: (newCtx: any, graph: any) => {
      audioCtx = newCtx;
      _applyAudioGraph(graph);
      // [DIAG-AUDIOCTX] Re-bind the state listener — the old one went away
      // with the old context.
      AudioInit.wireAudioCtxDiag(audioCtx, deps.remoteLogEnabled, undefined, '(post-recovery)');
    },
    isMicSuspended: () => !!deps.state.micSuspended,
    config: _audioGraphCfg,
    resetOnsetState: _resetOnsetState,
    onAfterRecovery: () => {
      // iOS WKWebView contract: post-background the Tone.js Transport is
      // unreliable, so practice mode is forcibly off and the audio engine
      // re-arms on the next user-driven start.
      const practice = deps.getPractice();
      if (practice.enabled) {
        practice.enabled = false;
        try {
          deps.stopPracticeAudio();
        } catch (_) {
          /* best-effort */
        }
      }
    },
  });

  return {
    initAudio,
    getAudioCtx: () => audioCtx,
    getAnalyser: () => analyser,
    getOnsetAnalyser: () => onsetAnalyser,
    getGainNode: () => gainNode,
    getDataArray: () => dataArray,
    getFreqArray: () => freqArray,
    getOnsetDataArray: () => onsetDataArray,
    getMicStream: () => micStream,
    rebuildAudioGraph,
    recover: () => _audioRecovery.recover(),
    suspendMic: () => _micLifecycle.suspend(),
    resumeMic: () => _micLifecycle.resume(),
  };
}
