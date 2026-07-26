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

import { isPinnedTo, type InputSourcePref } from '@piano/core';

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
  /** Is MIDI the ACTIVE input (prefs.inputSource × attached)? Decides whether
   *  boot acquires the mic at all. Optional — older shells fall back to
   *  `midiInput.enabled`, i.e. the pre-selector behaviour. */
  isMidiActive?: () => boolean;
  /** The player's input-source setting. Pinned to `mic` pre-empts the
   *  iOS-WKWebView "don't even ask" default and skips the startup MIDI probe —
   *  see resume() and decideInitialInputMode(). */
  getInputSourcePref?: () => InputSourcePref;
  /** Is `navigator.requestMIDIAccess` OUR OWN native polyfill (Capacitor build)
   *  rather than a third-party iOS wrapper's? Decides whether the
   *  "this wrapper's getUserMedia is broken" skip applies at all — our app's
   *  mic works and is declared in Info.plist. Optional; absent → treated as
   *  foreign, i.e. the previous behaviour. */
  isOwnWebMidiPolyfill?: () => boolean;
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
  /** Monotonic clock for the startup phase timings. Default performance.now. */
  now?: () => number;
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
  /** Bring the mic back up. Consults `getInputSourcePref` itself: a pinned 🎙️
   *  outranks the platform "don't even ask" heuristic. See the impl. */
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

/**
 * Longest the startup MIDI probe may delay the microphone.
 *
 * 1.2 s: the probe is normally already settled (boot fires it and midi-init
 * shares the promise), so this is a stall bound, not a budget. Long enough for a
 * cold CoreMIDI enumeration over the Capacitor bridge, short enough that a hung
 * bridge costs a beat of startup rather than the whole session's input.
 */
export const MIDI_PROBE_TIMEOUT_MS = 1200;

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
        // Both "we couldn't get the mic" flags are stale the moment we DO get
        // it, and clearing either has the same UI consequence, so it is one
        // block rather than two identical ones:
        //   • micPermissionFailed — a prior race-timeout fired, then the user
        //     clicked Allow anyway and we landed here.
        //   • micIntentionallySkipped — "we chose not to even ASK on this
        //     platform". We just asked and it worked. Leaving it set would
        //     silently re-block the next resume(), keep the background MIDI
        //     poller running, and stop the meter appearing on a later detach.
        if (deps.state.micPermissionFailed || deps.state.micIntentionallySkipped) {
          deps.state.micPermissionFailed = false;
          deps.state.micIntentionallySkipped = false;
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
    // I3: iOS Web MIDI Browser 等で「意図的にマイク取得をスキップ」した端末
    // （micIntentionallySkipped）では、切断契機の resume でも壊れている
    // getUserMedia を呼びに行かない（縮退方針を守る）。
    //
    // ただしプレイヤーが 🎙️ を明示的に選んでいるなら試す — 推測より意思が強い。
    // その判定はここで行う: この関数が `micIntentionallySkipped` を所有していて、
    // pref も持っている。呼び出し側に `{explicit}` として聞くと、同じ述語が
    // 呼び出し地点で生の `=== 'mic'` に戻り、名前を1つに統一した意味が消える。
    //
    // ネイティブ iOS ビルドは起動ごとにこのフラグを立てる（MIDI ポリフィルが
    // `isApple && hasMidi` を真にする）ので、これが無いと 🎙️ は出荷先の
    // プラットフォームで「押しても何も起きないボタン」になる。試すのは安全:
    // 失敗は下の catch が micPermissionFailed を立てて理由を表示する。
    const micPinned = isPinnedTo(deps.getInputSourcePref?.() ?? 'auto', 'mic');
    if (deps.state.micIntentionallySkipped && !micPinned) return;
    try {
      await acquire();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[AUDIO] Failed to resume mic:', msg || e);
      // H5: previously this only logged — a MIDI-unplug whose mic re-acquire
      // failed left "listening" state with no working input and no UI signal.
      // Mirror the boot-path failure so the intro hint + meter reflect reality.
      deps.state.micPermissionFailed = true;
      deps.refreshIntroHint?.();
      if (deps.micMeterEl) deps.micMeterEl.classList.remove('visible');
    }
  }

  async function decideInitialInputMode(): Promise<InitialInputMode> {
    const log = deps.log ?? ((m: string) => console.log(m));
    const warn = deps.warn ?? ((m: string) => console.warn(m));
    const setT = deps.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
    const clearT =
      deps.clearTimeout ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
    const now = deps.now ?? (() => performance.now());
    const timeoutMs = deps.micAcquireTimeoutMs ?? 20000;

    const t0 = now();
    const micExplicitlyChosen = isPinnedTo(deps.getInputSourcePref?.() ?? 'auto', 'mic');

    // No stream exists yet, so say so for the whole decision. `initAudio()`
    // stopped awaiting this (the play screen must not wait on an OS device
    // open), which means the ~430 ms it takes is now a window the UI is awake
    // for — and with `micSuspended` still false from boot, `describeInputSource`
    // reported `active: 'mic', waiting: false` throughout it: the app claiming
    // to be listening before the microphone was open. Every branch below sets
    // the final value; this makes the in-flight state honest rather than
    // optimistic.
    deps.state.micSuspended = true;

    // ── Phase 1: settle the MIDI question, but only when its answer matters ──
    //
    // Probing before asking for the mic is what keeps a keyboard user free of a
    // permission prompt, a privacy LED, and idle YIN/FFT. But it is ON THE
    // CRITICAL PATH to the microphone, so it runs under two conditions:
    //
    //   • SKIPPED ENTIRELY when the player pinned the mic. No MIDI answer can
    //     change the decision, so waiting for one is pure startup latency on the
    //     exact path that user cares about.
    //   • BOUNDED otherwise. Boot already fired this probe and it now shares its
    //     promise (midi-init), so normally this resolves instantly — but a
    //     stalled CoreMIDI bridge would otherwise strand the session with no
    //     input at all and no explanation. Past the deadline we proceed to the
    //     mic; if a keyboard does turn up later, `attach()` takes over normally.
    let probeMs = 0;
    if (deps.initWebMIDI && !micExplicitlyChosen) {
      let probeTimer: unknown = null;
      try {
        await Promise.race([
          deps.initWebMIDI(),
          new Promise<void>((resolve) => {
            probeTimer = setT(resolve, MIDI_PROBE_TIMEOUT_MS);
          }),
        ]);
      } catch {
        /* fall back to mic */
      }
      if (probeTimer !== null) clearT(probeTimer);
      probeMs = now() - t0;
    }

    // MIDI is the ACTIVE input → no mic at all. Two ways to get here: a
    // keyboard is attached under 'auto', or the player pinned 'midi' (in which
    // case we skip getUserMedia even with nothing attached — they asked for
    // keyboard-only, and prompting for a microphone they said not to use would
    // be the app overriding an explicit choice).
    if (deps.isMidiActive?.() ?? deps.midiInput?.enabled) {
      log(
        '[AUDIO] MIDI is the active input — skipping microphone acquisition' +
          (deps.midiInput?.enabled ? '' : ' (pinned to keyboard, none attached yet)')
      );
      deps.state.micSuspended = true;
      return { mode: 'midi-detected' };
    }

    const isApple = deps.isAppleMobile?.() ?? false;
    const hasMidi = deps.hasRequestMIDIAccess?.() ?? false;
    // The skip below targets a FOREIGN iOS WKWebView wrapper — Web MIDI Browser
    // and friends — whose getUserMedia is consistently broken. Our OWN native
    // Capacitor app is not one of those: it ships
    // NSMicrophoneUsageDescription and the mic is hardware-verified on device.
    //
    // It was being caught by the same test anyway, because the test is "does
    // navigator.requestMIDIAccess exist" and on the native build that function
    // is OUR polyfill. One condition standing for two different environments:
    // the result was that a native iPad with no keyboard attached had NO INPUT
    // AT ALL — MIDI declared, zero ports, mic never asked for — and `auto`
    // could never recover from it.
    const ownPolyfill = deps.isOwnWebMidiPolyfill?.() ?? false;
    const foreignWebMidi = hasMidi && !ownPolyfill;
    // An explicit 🎙️ choice is stronger evidence than any platform guess, so it
    // pre-empts the skip even in a wrapper we distrust (failing honestly via the
    // catch in acquire() if the mic really is broken there) — resolved above,
    // since it also decides whether the MIDI probe runs at all.
    if (isApple && foreignWebMidi && !micExplicitlyChosen) {
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
      // Startup timing, because "the mic takes a while to come up" is a
      // stopwatch question and the device log had no way to answer it. The split
      // matters: a slow MIDI probe is ours to fix, a slow getUserMedia is the OS.
      const doneMs = now();
      log(
        '[AUDIO] mic ready in ' +
          Math.round(doneMs - t0) +
          'ms (midi-probe ' +
          Math.round(probeMs) +
          'ms, getUserMedia ' +
          Math.round(doneMs - t0 - probeMs) +
          'ms)'
      );
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
