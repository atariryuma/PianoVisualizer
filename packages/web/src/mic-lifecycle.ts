// Mic acquire / suspend / resume + initial input-mode decision —
// Phase 0d batches 56 + 64.
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
//   - decideInitialInputMode() (batch 64): called once at boot from
//     initAudio. Probes Web MIDI; if a keyboard's already plugged in
//     we skip getUserMedia entirely (no permission prompt, no
//     privacy LED, no idle YIN/FFT cost). On iOS WKWebView with the
//     Web MIDI polyfill we set `micIntentionallySkipped` instead of
//     `micPermissionFailed` — the kid is fine to listen passively
//     until they pair a keyboard. Otherwise call acquire() with a
//     20s safety-net timeout (older 5s timeout was firing during
//     real permission dialogs, falsely flipping mic-failed mode).
//
// All four mutable audio-graph nodes (audioCtx / gainNode /
// micStream / micSourceNode) flow through getter / setter thunks so
// the legacy shell's `let`s remain the source of truth and other
// shell code that reads them directly keeps working.

import type { RecentPitchEntry } from './core-opts';

export interface MicLifecycleStateRef {
  micSuspended: boolean;
  micPermissionFailed: boolean;
  /** Set when the platform is known-broken for getUserMedia (iOS
   *  WKWebView + Web MIDI polyfill). Distinguishes "we chose not to
   *  ask" from "we asked and failed" — drives a friendlier UI. */
  micIntentionallySkipped?: boolean;
  adaptiveSilenceRms: number | null;
  /** R2-3: 時刻付きピッチリング（`{ hz, t }`）。suspend 時に空へ戻す。 */
  recentPitches: RecentPitchEntry[] | null;
  /** AGC モデル値 — suspend 時にリセットして GainNode(1.0) との段差
   *  ジャンプを防ぐ。 */
  agcGain: number;
  agcSmoothedRms: number;
}

/** Subset of `midiInput` we read for the input-mode decision. */
export interface MicLifecycleMidiRef {
  enabled: boolean;
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

  // ── decideInitialInputMode deps (Phase 0d batch 64) ─────────────

  /** Mutable midi state ref — only `enabled` is read after
   *  initWebMIDI() probes for a connected keyboard. */
  midiInput?: MicLifecycleMidiRef;
  /** Probe Web MIDI. Production: `() => initWebMIDI()` from the
   *  shell. Errors are swallowed (handled inside initWebMIDI). */
  initWebMIDI?: () => Promise<void>;
  /** Apple-mobile platform predicate. Drives the iOS-WMB skip
   *  branch. */
  isAppleMobile?: () => boolean;
  /** True when `navigator.requestMIDIAccess` is defined. Pulled
   *  from a thunk so tests can flip it without juggling globals. */
  hasRequestMIDIAccess?: () => boolean;
  /** Mic-acquisition safety-net timeout in ms. Default 20000 —
   *  long enough to span the iOS permission dialog. */
  micAcquireTimeoutMs?: number;
  /** Setter for the `setTimeout` hook used by the timeout race —
   *  tests inject a fake timer driver. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** Optional logger overrides. Default: `console.log` /
   *  `console.warn`. */
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

/** Result of `decideInitialInputMode()` — purely informational
 *  (the side-effects on state.* are the actual deliverable). */
export type InitialInputMode =
  | { mode: 'midi-detected' }
  | { mode: 'ios-wmb-skipped' }
  | { mode: 'mic-acquired' }
  | { mode: 'mic-failed'; error: string };

export interface MicLifecycle {
  acquire(): Promise<unknown>;
  suspend(): void;
  resume(): Promise<void>;
  /** Boot-time input source decision. Must be called after the
   *  audio graph is built (acquire() wires the mic into gainNode).
   *  Side-effects: `state.micSuspended` / `state.micPermissionFailed`
   *  / `state.micIntentionallySkipped` flags + (when chosen) a live
   *  mic stream. Idempotent only in the sense that re-calling it
   *  re-runs the decision — the caller is expected to invoke once
   *  per audio session. */
  decideInitialInputMode(): Promise<InitialInputMode>;
}

export function createMicLifecycle(deps: MicLifecycleDeps): MicLifecycle {
  // Concurrency lock — see header comment. Lives in the factory
  // closure so two callers share the same in-flight promise.
  let acquiring: Promise<unknown> | null = null;

  async function acquire(): Promise<unknown> {
    // 死んだストリーム（許可剥奪・デバイス消失・iOS 復帰失敗）を「取得済み」
    // と誤認すると再取得経路が恒久封鎖される。active でなければ片付けて
    // 再取得に進む。
    const existing = deps.getMicStream();
    if (existing) {
      if (existing.active !== false) return;
      try {
        existing.getTracks().forEach((t) => t.stop());
      } catch {
        /* already dead */
      }
      deps.setMicStream(null);
      const deadSource = deps.getMicSourceNode();
      if (deadSource) {
        try {
          deadSource.disconnect();
        } catch {
          /* already disconnected */
        }
        deps.setMicSourceNode(null);
      }
      console.warn('[AUDIO] Stale inactive mic stream dropped — re-acquiring');
    }
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
        // トラック死活監視: 許可の途中剥奪やデバイス消失では 'ended' が
        // 飛ぶ（自前の track.stop() では発火しない）。放置すると
        // 「聞いているのに反応しない」まま復帰不能になるので、参照を
        // 片付けてフラグ + ヒントを出す。次の acquire()/回復パスが再取得
        // できる状態に戻すのが目的。
        for (const track of stream.getTracks()) {
          track.addEventListener('ended', () => {
            if (deps.getMicStream() !== stream) return; // 既に交換/解放済み
            deps.setMicStream(null);
            const src = deps.getMicSourceNode();
            if (src) {
              try {
                src.disconnect();
              } catch {
                /* already disconnected */
              }
              deps.setMicSourceNode(null);
            }
            deps.state.micPermissionFailed = true;
            deps.refreshIntroHint?.();
            if (deps.micMeterEl) deps.micMeterEl.classList.remove('visible');
            console.warn('[AUDIO] Mic track ended unexpectedly (revoked / device lost)');
          });
        }
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
    // AGC モデルもリセット — 保持したままだと mic 復帰時に GainNode 1.0 と
    // モデル値（最大40）の段差ジャンプが起き、直後の tick で誤オンセット/
    // メーター振り切りが出る（ヘッダの「clear mic-derived state」対象）。
    deps.state.agcGain = 1.0;
    deps.state.agcSmoothedRms = 0;

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

  async function decideInitialInputMode(): Promise<InitialInputMode> {
    const log = deps.log ?? ((m: string) => console.log(m));
    const warn = deps.warn ?? ((m: string) => console.warn(m));
    const setT = deps.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
    const clearT =
      deps.clearTimeout ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
    const timeoutMs = deps.micAcquireTimeoutMs ?? 20000;

    // Probe MIDI BEFORE asking for the mic. If a MIDI keyboard is
    // already plugged in, we skip getUserMedia entirely — no
    // permission prompt, no privacy LED, no idle CPU on YIN/FFT.
    // The user gesture from the start-button click is still alive,
    // so getUserMedia later (on MIDI detach) works without re-prompting.
    if (deps.initWebMIDI) {
      try {
        await deps.initWebMIDI();
      } catch {
        /* fall back to mic */
      }
    }

    if (deps.midiInput?.enabled) {
      log('[AUDIO] MIDI detected — skipping microphone acquisition');
      deps.state.micSuspended = true;
      return { mode: 'midi-detected' };
    }

    const isApple = deps.isAppleMobile?.() ?? false;
    const hasMidi = deps.hasRequestMIDIAccess?.() ?? false;
    if (isApple && hasMidi) {
      // Web MIDI Browser (or any iOS WKWebView wrapper that polyfills
      // Web MIDI): mic permission is consistently broken on iOS
      // WKWebView wrappers, so we skip it on purpose. Note we set
      // `micIntentionallySkipped` (not `micPermissionFailed`) so
      // downstream code doesn't pop a "MIDI required" diagnostic on
      // every screen entry — the kid is fine to wait for a keyboard
      // or just listen passively.
      deps.state.micSuspended = true;
      deps.state.micIntentionallySkipped = true;
      log('[AUDIO] iOS WKWebView with Web MIDI polyfill — running MIDI-only (mic skipped)');
      return { mode: 'ios-wmb-skipped' };
    }

    // Try to acquire the mic. The earlier hang case (iOS WKWebView
    // wrappers freezing on getUserMedia) is already handled by the
    // micIntentionallySkipped branch above, so the regular browser
    // path doesn't need the aggressive 5s timeout — that was firing
    // while the kid was still reading the permission dialog and
    // falsely flipping the app into "mic failed" mode. Use a
    // generous 20s safety net only.
    let timer: unknown = null;
    try {
      await Promise.race([
        acquire(),
        new Promise<never>((_resolve, reject) => {
          timer = setT(() => reject(new Error('mic permission timeout')), timeoutMs);
        }),
      ]);
      if (timer !== null) clearT(timer);
      return { mode: 'mic-acquired' };
    } catch (e) {
      if (timer !== null) clearT(timer);
      const msg = e instanceof Error ? e.message : String(e);
      deps.state.micSuspended = true;
      deps.state.micPermissionFailed = true;
      warn('[AUDIO] mic unavailable — running in MIDI-only mode: ' + msg);
      return { mode: 'mic-failed', error: msg };
    }
  }

  return { acquire, suspend, resume, decideInitialInputMode };
}
