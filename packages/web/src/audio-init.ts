// Audio context lifecycle + recovery seam.
// Phase 0d batches 5 + 60 extracted from legacy-app.js.
//
// Scope (deliberately narrow): everything that creates / rebuilds /
// recreates the AudioContext + gain → analyser graph + the
// visibility / devicechange handlers that drive the recovery seam.
// The boot-flow helpers (`initAudio`, `acquireMic`, `suspendMic`,
// `resumeMic`) stay in the shell because they're tied to the
// state-machine + DOM + MIDI + i18n wire-up; carving those would
// force every audio-node read across the rest of the shell to
// indirect through this module.
//
// Out of scope:
//   • `initAudio` (boot — MIDI probe → mic acquisition → state.micSuspended)
//   • `acquireMic` / `suspendMic` / `resumeMic` (mic lifecycle)
//
// In scope:
//   • `MIC_CONSTRAINTS` + `AUDIO_SAMPLE_RATE` constants
//   • `createAudioContext()` factory (sampleRate-pinned, latencyHint, fallback)
//   • `buildAudioGraph()` — pure node-construction (gain + 2 analysers + buffers)
//   • `createAudioRecovery()` — close-context-and-rebuild seam, with
//     re-entrancy guard, that the shell calls from devicechange + visibility
//     resume listeners
//   • `createAudioLifecycle()` — installs `visibilitychange` +
//     `devicechange` listeners that drive recovery + cross-cut MIDI
//     re-enumeration + wake-lock refresh on resume (Phase 0d batch 60)
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

/** Below this hidden duration the context's own `running` is believed. A brief
 *  app-switch does not freeze it, and the probe below sits in front of the
 *  player returning to the app. */
const CTX_LIVENESS_MIN_HIDDEN_MS = 30_000;

/** How long to watch `currentTime` before calling the clock frozen. Two 60 fps
 *  render quanta — long enough that a live context has certainly advanced,
 *  short enough to be invisible on resume. */
const CTX_LIVENESS_PROBE_MS = 40;

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

// ─── Audio context diag wire (Phase 0d batch 63 helper) ───────────

/** Optional onstatechange diagnostic — when `enabled` is true,
 *  attaches a logger that prints the new state + sampleRate +
 *  currentTime every time the AudioContext transitions. Used to
 *  catch the unexplained 'suspended' / 'interrupted' flips that
 *  correlated with the 2026-05-09 listen-mode silent-restart bug.
 *  No-ops if `onstatechange` is read-only on the polyfill. */
export function wireAudioCtxDiag(
  ctx: AudioContext,
  enabled: boolean,
  log?: (msg: string) => void,
  suffix?: string
): void {
  if (!enabled) return;
  const out = log ?? ((m: string) => console.log(m));
  const tag = suffix ? ' ' + suffix : '';
  try {
    ctx.onstatechange = () => {
      out(
        '[DIAG-AUDIOCTX] state=' +
          ctx.state +
          ' sampleRate=' +
          ctx.sampleRate +
          ' currentTime=' +
          (ctx.currentTime || 0).toFixed(3) +
          tag
      );
    };
  } catch {
    /* onstatechange may be readonly on some polyfills */
  }
}

// ─── Audio lifecycle handlers (Phase 0d batch 60) ─────────────────

/** Subset of `navigator` we touch. */
export interface AudioLifecycleNavigator {
  requestMIDIAccess?: (...args: unknown[]) => Promise<unknown>;
  mediaDevices?: {
    addEventListener?: (
      type: 'devicechange',
      listener: (this: unknown, ev: Event) => unknown
    ) => void;
  };
}

/** Subset of `midiInput` ref the visibility handler reads. */
export interface AudioLifecycleMidiRef {
  enabled: boolean;
}

export interface AudioLifecycleDeps {
  // ── audio side ─────────────────────────────────────────────────
  /** Read fresh on every event — the shell may have just-recreated
   *  the context inside an earlier visibility/device cycle. */
  getAudioCtx: () => AudioContext | null;
  /** Recovery seam — usually the same `recover()` returned by
   *  createAudioRecovery in this module. */
  recover: () => Promise<void>;
  /** Predicate read on entry to both handlers; devicechange + the
   *  wake-lock branch of visibilitychange are gated by it. */
  isRunning: () => boolean;

  // ── wake lock ─────────────────────────────────────────────────
  /** Re-acquire the screen wake lock on tab visibility resume.
   *  Browsers drop the lock on hide; iOS additionally suspends the
   *  AudioContext + (in WMB) silently breaks MIDI handlers. */
  requestWakeLock: () => void;

  // ── MIDI cross-cut on visibility resume ────────────────────────
  navigator: AudioLifecycleNavigator;
  midiInput: AudioLifecycleMidiRef;
  /** Round-trip the cached MIDIInput port to confirm it's still
   *  alive. WMB / WKWebView bg suspension turns the port into a
   *  corpse; verifyAlive false → null + rescan. */
  verifyMidiAlive: () => Promise<boolean>;
  /** Force-fresh MIDIAccess so the next rescan re-enumerates
   *  instead of reading a dead reference. The shell's
   *  `_midiAccess = null` write happens here. */
  clearMidiAccessCache: () => void;
  /** Silent rescan (no diagnostic on failure). */
  rescanMidi: (silent: boolean) => Promise<boolean>;
  startMidiAutoRescan: () => void;

  /** Called immediately when the page is backgrounded. Used by the
   *  practice shell to freeze clocks before rAF is throttled. */
  onHidden?: () => void;
  /** Called before audio/MIDI resume work when the page becomes visible. */
  onVisible?: () => void;

  // ── targets / time hooks ──────────────────────────────────────
  /** Defaults to live `document`. */
  document?: Document;
  /** devicechange debounce window (ms). Default 250. The legacy
   *  shell stashed the timer handle on `window._audioDeviceChangeTimer`;
   *  we keep it in the factory closure now. */
  deviceChangeDebounceMs?: number;
  /** Timer hooks — tests inject vi.useFakeTimers() shims. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Wall clock. Only used to measure how long the page stayed hidden, which
   *  is what decides whether the AudioContext's self-reported state is
   *  believed. Injectable so that decision is testable. */
  now?: () => number;

  // ── logging ───────────────────────────────────────────────────
  /** Defaults to `console.warn`. */
  warn?: (msg: string) => void;
}

export interface AudioLifecycle {
  /** Wire `document.visibilitychange` + `navigator.mediaDevices.devicechange`
   *  listeners. Idempotent — second call is a no-op. */
  install(): void;
  /** Detach both listeners (mainly for tests). */
  uninstall(): void;
}

const DEFAULT_DEVICECHANGE_DEBOUNCE_MS = 250;

export function createAudioLifecycle(deps: AudioLifecycleDeps): AudioLifecycle {
  const debounceMs = deps.deviceChangeDebounceMs ?? DEFAULT_DEVICECHANGE_DEBOUNCE_MS;
  const setT = deps.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
  const clearT = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const now = deps.now ?? (() => Date.now());
  const doc = deps.document ?? (typeof document !== 'undefined' ? document : null);

  let installed = false;
  let deviceTimer: unknown = null;
  let visibilityHandler: (() => void) | null = null;
  let deviceHandler: (() => void) | null = null;

  // devicechange fires for *any* media-device-list mutation:
  //   - AirPods / headphones plug/unplug (the original target of this
  //     handler — AirPods flip output between 24/48 kHz; our locked
  //     48 kHz AudioContext rides that out, but pre-lock builds saw
  //     stutter)
  //   - USB MIDI controllers' audio-class endpoint appearing/leaving
  //   - Bluetooth headset name changes
  //   - macOS/Win desktop default-output switches
  //
  // Previously we recovered (close + recreate AudioContext + re-acquire
  // mic) on every fire. That was wasteful — most events leave the
  // context healthy — and on iOS it also aborted practice via
  // onAfterRecovery. The smart path: debounce, then check ctx.state.
  // If 'running', the event was benign and we no-op. If 'suspended'
  // or 'closed' (rare), we try resume() first and only fall back to
  // full recover() when resume can't bring it back.
  //
  // The 250 ms debounce is unchanged — devicechange fires multiple
  // times for one user action (a single AirPods unplug usually emits
  // 2-3 events).
  function onDeviceChange(): void {
    if (deviceTimer !== null) clearT(deviceTimer);
    deviceTimer = setT(async () => {
      deviceTimer = null;

      // ── MIDI freshness (M4) ─────────────────────────────────────
      // A device-list mutation often accompanies a USB (re)plug. The
      // deps for this were documented + passed but never wired: drop
      // the cached MIDIAccess so the next enumeration is fresh, and
      // nudge one silent rescan when no MIDI is attached. Runs even
      // pre-session (title screen) — boot-time init means the access
      // cache exists from t=0.
      if (deps.navigator.requestMIDIAccess && !deps.midiInput.enabled) {
        deps.clearMidiAccessCache();
        deps.rescanMidi(true).catch(() => {});
      }

      // ── audio recovery (gated — original behavior) ──────────────
      if (!deps.isRunning()) return;
      const ctx = deps.getAudioCtx();
      if (!ctx) return;

      if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
        try {
          await ctx.resume();
        } catch {
          // Race with another resume / OS denial — fall through.
        }
      }
      if (ctx.state === 'running') return; // benign event, no work needed

      // Still not running (state stays 'suspended' after resume, or
      // 'closed'). Heavy recovery.
      deps.recover().catch((e: unknown) => {
        warn('[AUDIO] devicechange recovery: ' + (e instanceof Error ? e.message : String(e)));
      });
    }, debounceMs);
  }

  // Browsers drop the wake lock when the tab is hidden, suspend
  // AudioContext, and (on iOS WMB) silently disable MIDI port
  // handlers. On every resume we refresh all three so the kid can
  // pick up exactly where they left off without seeing a phantom
  // "connection error".
  /** When the page went hidden (epoch ms), or null while visible. Only a LONG
   *  background stay makes the liveness probe below worth its cost.
   *  `null` rather than 0 — 0 is a legitimate reading from an injected clock,
   *  and a sentinel that collides with a real value is a bug waiting for the
   *  one test that starts its clock at zero. */
  let hiddenAtMs: number | null = null;

  /**
   * Does this context's clock actually advance?
   *
   * `state === 'running'` is the context's own claim, and after a long
   * WKWebView background trip that claim can be false: the state survives, the
   * clock does not, and every note is scheduled onto a frozen timeline —
   * silence, with nothing anywhere reporting a fault. That is what WebKit Bugs
   * 237878 / 261554 are about, and it is why this file already recreates rather
   * than resumes elsewhere.
   *
   * The MIDI half of this same handler has always verified rather than trusted
   * (`verifyMidiAlive` — "we THINK MIDI is connected; check the port responds").
   * The audio half trusted a self-reported state. Same background trip, same
   * class of corpse, one of the two checked.
   *
   * `currentTime` is the honest test: it advances only while the context is
   * genuinely rendering.
   */
  async function clockIsAdvancing(ctx: { currentTime: number }): Promise<boolean> {
    const t0 = ctx.currentTime;
    await new Promise((r) => setT(() => r(undefined), CTX_LIVENESS_PROBE_MS));
    return ctx.currentTime > t0;
  }

  async function onVisibilityChange(): Promise<void> {
    if (!doc) return;
    if (doc.visibilityState !== 'visible') {
      hiddenAtMs = now();
      deps.onHidden?.();
      return;
    }
    const hiddenForMs = hiddenAtMs != null ? now() - hiddenAtMs : 0;
    hiddenAtMs = null;
    deps.onVisible?.();
    if (deps.isRunning()) deps.requestWakeLock();

    const ctx = deps.getAudioCtx();
    if (ctx) {
      // iOS suspend ≠ resumable. If state stayed 'running' through
      // the bg round-trip we can keep going; otherwise full recreate.
      // 'interrupted' is an iOS-only state (phone call / Siri / another
      // audio app) that the old code never branched on — it left the
      // context stuck. Treat it like 'suspended': try resume, recreate
      // if that doesn't take.
      const needsResume = ctx.state === 'suspended' || (ctx.state as string) === 'interrupted';
      if (needsResume) {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
        // If still not running after resume(), context is dead — recreate.
        if (ctx.state !== 'running') {
          await deps.recover();
        }
      } else if (hiddenForMs > CTX_LIVENESS_MIN_HIDDEN_MS) {
        // It says 'running'. After a long background stay, verify that.
        // Gated on the duration because a brief app-switch is the common case
        // and does not produce this failure — the probe costs a frame there for
        // nothing, and this runs in front of the player coming back.
        if (!(await clockIsAdvancing(ctx))) {
          warn('[AUDIO] context claimed running but its clock is frozen — recreating');
          await deps.recover();
        }
      }
    }

    if (!deps.navigator.requestMIDIAccess) return;
    if (deps.midiInput.enabled) {
      // We *think* MIDI is connected — verify the port still responds.
      const ok = await deps.verifyMidiAlive();
      if (ok) return;
      // The port is a corpse (WMB / WKWebView bg suspension). Force
      // a fresh MIDIAccess so the next rescan re-enumerates instead
      // of re-checking the dead reference.
      deps.clearMidiAccessCache();
    }
    // No MIDI / dead port → silent rescan. Force-fresh on resume so
    // a stale enumeration from before the background trip can't
    // linger; the auto-rescan poller keeps trying if this single
    // attempt doesn't catch the device immediately.
    deps.clearMidiAccessCache();
    deps
      .rescanMidi(true)
      .then((rescanOk) => {
        if (!rescanOk) deps.startMidiAutoRescan();
      })
      .catch(() => deps.startMidiAutoRescan());
  }

  function install(): void {
    if (installed) return;
    installed = true;
    if (deps.navigator.mediaDevices?.addEventListener) {
      deviceHandler = onDeviceChange;
      deps.navigator.mediaDevices.addEventListener('devicechange', deviceHandler);
    }
    if (doc) {
      // Wrap the async handler so addEventListener doesn't see a
      // dangling promise.
      visibilityHandler = () => {
        void onVisibilityChange();
      };
      doc.addEventListener('visibilitychange', visibilityHandler);
    }
  }

  function uninstall(): void {
    if (!installed) return;
    installed = false;
    if (deviceTimer !== null) {
      clearT(deviceTimer);
      deviceTimer = null;
    }
    if (
      deps.navigator.mediaDevices &&
      'removeEventListener' in deps.navigator.mediaDevices &&
      deviceHandler
    ) {
      (
        deps.navigator.mediaDevices as unknown as {
          removeEventListener: (t: string, h: () => void) => void;
        }
      ).removeEventListener('devicechange', deviceHandler);
    }
    if (doc && visibilityHandler) {
      doc.removeEventListener('visibilitychange', visibilityHandler);
    }
    deviceHandler = null;
    visibilityHandler = null;
  }

  return { install, uninstall };
}
