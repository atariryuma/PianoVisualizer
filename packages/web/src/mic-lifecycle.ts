// Mic acquire / suspend / resume — Phase 0d batch 56.
//
// The three mic-lifecycle helpers, factored into a single module so
// the concurrency lock + the privacy-LED hygiene live in one place
// instead of split across 70 lines of shell code.
//
//   - acquire(): one-shot getUserMedia + audio-graph wire-in. Guarded
//     by an in-flight promise lock so a `resume()` racing the safety-
//     net timeout from `initAudio` can't double-connect the mic; the
//     loser of the race stops its redundant tracks (otherwise the
//     privacy LED stays on with a leaked live track).
//
//   - suspend(): silence the graph, disconnect + stop all tracks,
//     clear mic-derived state (adaptiveSilenceRms / recentPitches)
//     so the radar + quality reducers reset cleanly when MIDI takes
//     over mid-session.
//
//   - resume(): short-circuit when audio isn't alive yet or the mic
//     is already running, otherwise re-call acquire(). The error
//     branch logs but doesn't throw — the caller is a MIDI-detach
//     handler that shouldn't crash on user-denied mic permission.
//
// All four mutable audio-graph nodes (audioCtx / gainNode /
// micStream / micSourceNode) flow through getter / setter thunks so
// the legacy shell's `let`s remain the source of truth and other
// shell code that reads them directly keeps working.

export interface MicLifecycleStateRef {
  micSuspended: boolean;
  micPermissionFailed: boolean;
  adaptiveSilenceRms: number | null;
  recentPitches: number[] | null;
}

/** Subset of AudioContext we touch. */
export interface MicLifecycleAudioCtx {
  currentTime: number;
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
}

/** Subset of GainNode we touch. */
export interface MicLifecycleGainNode {
  gain: {
    cancelScheduledValues(when: number): void;
    setValueAtTime(value: number, when: number): void;
  };
}

export interface MicLifecycleDeps {
  state: MicLifecycleStateRef;

  /** getUserMedia constraints. Held by deps so the test stubs them. */
  micConstraints: MediaStreamConstraints;

  /** Production: `navigator.mediaDevices.getUserMedia`. */
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;

  /** Audio-graph node accessors — getters for read-only, getter +
   *  setter pairs for the two we write to (micStream + micSourceNode). */
  getAudioCtx: () => MicLifecycleAudioCtx | null;
  getGainNode: () => MicLifecycleGainNode | null;
  getMicStream: () => MediaStream | null;
  setMicStream: (stream: MediaStream | null) => void;
  getMicSourceNode: () => MediaStreamAudioSourceNode | null;
  setMicSourceNode: (node: MediaStreamAudioSourceNode | null) => void;

  /** mic-meter visualization element. Optional null mirrors the
   *  legacy `if (typeof DOM !== 'undefined' && DOM.micMeter)` guard. */
  micMeterEl: HTMLElement | null;

  /** Forward-declared shell helper — passed as a thunk because the
   *  factory builds before refreshIntroHint is declared. The legacy
   *  shell guarded with `typeof refreshIntroHint === 'function'`; we
   *  fold that into deps.refreshIntroHint?. */
  refreshIntroHint?: () => void;
}

export interface MicLifecycle {
  acquire(): Promise<unknown>;
  suspend(): void;
  resume(): Promise<void>;
}

export function createMicLifecycle(deps: MicLifecycleDeps): MicLifecycle {
  // Concurrency lock — see header comment. Lives in the factory
  // closure so two callers share the same in-flight promise.
  let acquiring: Promise<unknown> | null = null;

  async function acquire(): Promise<unknown> {
    if (deps.getMicStream()) return;
    if (acquiring) return acquiring;
    acquiring = (async () => {
      try {
        const stream = await deps.getUserMedia(deps.micConstraints);
        if (deps.getMicStream()) {
          // A concurrent caller won the race; stop our redundant
          // tracks so the privacy LED doesn't stay on with a leaked
          // live track.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const audioCtx = deps.getAudioCtx();
        const gainNode = deps.getGainNode();
        if (!audioCtx || !gainNode) {
          // Shouldn't happen — initAudio populates both before
          // anything calls acquire(). Defensive: stop tracks rather
          // than leak.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        deps.setMicStream(stream);
        const sourceNode = audioCtx.createMediaStreamSource(stream);
        sourceNode.connect(gainNode as unknown as AudioNode);
        deps.setMicSourceNode(sourceNode);
        gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
        deps.state.micSuspended = false;
        // Clear any stale failure flag from a prior race-timeout —
        // if the user eventually clicked Allow after the safety-net
        // timeout fired, we still get here and need to update the UI
        // gates that read this flag.
        if (deps.state.micPermissionFailed) {
          deps.state.micPermissionFailed = false;
          deps.refreshIntroHint?.();
          if (deps.micMeterEl) deps.micMeterEl.classList.add('visible');
        }
         
        console.log('[AUDIO] Mic acquired');
      } finally {
        acquiring = null;
      }
    })();
    return acquiring;
  }

  function suspend(): void {
    if (deps.state.micSuspended) return;
    deps.state.micSuspended = true;
    const audioCtx = deps.getAudioCtx();
    const gainNode = deps.getGainNode();
    if (audioCtx && gainNode) {
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    }
    const sourceNode = deps.getMicSourceNode();
    if (sourceNode) {
      // disconnect can throw InvalidAccessError if already
      // disconnected — best-effort.
      try {
        sourceNode.disconnect();
      } catch {
        /* InvalidAccessError */
      }
      deps.setMicSourceNode(null);
    }
    const stream = deps.getMicStream();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      deps.setMicStream(null);
    }
    // Clear stale mic-derived state so the radar / quality reset
    // cleanly.
    deps.state.adaptiveSilenceRms = null;
    deps.state.recentPitches = [];
     
    console.log('[AUDIO] Mic suspended (MIDI active)');
  }

  async function resume(): Promise<void> {
    if (!deps.getAudioCtx() || !deps.state.micSuspended) return;
    try {
      await acquire();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
       
      console.warn('[AUDIO] Failed to resume mic:', msg || e);
    }
  }

  return { acquire, suspend, resume };
}
