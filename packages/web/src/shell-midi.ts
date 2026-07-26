// MIDI shell — Phase 0d batch 101.
//
// Bundles the entire MIDI input-side cluster (state + dispatch + indicator +
// ports + rescan + init + intro-diag + BLE-MIDI + the connection lifecycle
// hook) into a single `createShellMidi(deps)` factory call. Replaces ~150
// lines of legacy-app.js wireup + 10+ shell forwarders with one entry.
//
// Invariant: this module is the typed boundary. Callbacks the shell defines
// (`onMidiNoteOn` / `onMidiNoteOff` / `onMidiCC` / `matchNoteOnset` —
// closures over shell state) flow IN through deps; nothing flows out except
// the public methods listed in `ShellMidi`.

import type { InitialPracticeState } from './practice-state-init';
import type { InitialGameState } from './game-state-init';
import type { T } from '@piano/core';
import * as PianoCore from '@piano/core';
import type { MidiPortRef, BlePortMarker } from './midi-ports';
import * as MidiDispatch from './midi-dispatch';
import * as MidiIndicator from './midi-indicator';
import * as MidiPorts from './midi-ports';
import * as MidiRescan from './midi-rescan';
import * as MidiInit from './midi-init';
import * as IntroDiag from './intro-diag';
import * as BleMidiParser from './ble-midi-parser';
import * as BleMidiConnect from './ble-midi-connect';
import * as AudioInit from './audio-init';
import * as PracticeVisibility from './practice-visibility';
import { hasNativeBleMidiPairing, isNativeMidiPolyfillInstalled } from './native-midi-polyfill';
import { diag } from './diag-sink';

/** Mutable per-session MIDI connection state. Shared across the MIDI
 *  cluster (ports / dispatch / rescan / init / indicator) and read by
 *  every shell that needs to know whether a piano is currently
 *  connected. Each consumer (midi-ports, midi-dispatch, midi-indicator)
 *  declares its own narrow view; this is the union that satisfies all
 *  of them. */
export interface MidiInputRef {
  /**
   * True once a MIDIInput port has been attached (port-side `onmidimessage`
   * is wired). A HARDWARE FACT — "a keyboard is connected", nothing more.
   *
   * It is NOT "MIDI is the input we score". That question is answered by
   * `ShellMidi.isMidiActive()`, which folds in the player's `inputSource`
   * setting. The two used to be the same flag, which is exactly why there was
   * no way to keep playing acoustically with a keyboard plugged in — see
   * @piano/core `state/input-source.ts`. Read this one only for hardware
   * concerns (rescan policy, indicator text, BLE takeover); read
   * `isMidiActive()` for routing.
   */
  enabled: boolean;
  /** The attached MIDI port. A real MIDIInput on the Web MIDI path
   *  (typed loosely via MidiPortRef); a name-only BlePortMarker on
   *  the BLE-MIDI path; or null when idle. */
  port: MidiPortRef | BlePortMarker | null;
  /** Set when initWebMIDI has already kicked off a `requestMIDIAccess`
   *  call this session — guards against re-prompting the user. */
  _accessRequested: boolean;
  /** True on iOS Safari / WKWebView: Web MIDI is not implemented in
   *  WebKit (Bug 107250) so the rescan poller short-circuits and a
   *  friendlier hint is shown. */
  platformBlocked: boolean;
  /** Timestamp of the most recent MIDI byte we processed (ms since
   *  Tone start). Set by midi-dispatch's onMessage, read by mic-pipeline
   *  to decide whether MIDI is actively driving right now. */
  lastEventTime: number;
}

export interface ShellMidiDeps {
  state: InitialGameState;
  practice: InitialPracticeState;
  getAudioCtx: () => any;
  dom: {
    midiBadge: HTMLElement;
    ptbInput: HTMLElement;
    introHint: HTMLElement;
    micMeter: HTMLElement;
  };
  t: T;
  navigator: Navigator;
  suspendMic: () => void;
  resumeMic: () => Promise<unknown>;
  /** The player's input-source setting (prefs.inputSource). Read at call time,
   *  never captured — it is changed from the settings panel mid-session. */
  getInputSourcePref: () => PianoCore.InputSourcePref;
  refreshIntroHint: () => void;
  showHitChip: (kind: string, msg: string) => void;
  /** I1: MIDI 切断（detach / BLE drop）時に押下中の鍵の視覚状態
   *  （midiState.activeNotes / sustainedNotes / sustainOn）をクリアする。
   *  切断で note-off が二度と来ない鍵が幽霊点灯で残るのを防ぐ。 */
  clearHeldMidiNotes?: () => void;
  /** Per-note callbacks defined in the shell (close over midiState etc).
   *  Passed as thunks so the shell can build ShellMidi before the handlers
   *  cluster — the actual fns are read lazily at dispatch time. */
  getOnMidiNoteOn: () => (m: number, v: number) => void;
  getOnMidiNoteOff: () => (m: number) => void;
  getOnMidiCC: () => (cc: number, v: number) => void;
  /** P1-11: 第3引数 inputLagMs（MIDI event.timeStamp 由来の per-event
   *  遅延、省略時 0）まで貫通させる。 */
  getMatchNoteOnset: () => (m: number, exact: boolean, inputLagMs?: number) => any;
  /** レイテンシ較正へノートオンを渡すフック。較正が走っていれば true を返し、
   *  その押下は採点に回さない。遅延バインドなので getter 経由。 */
  getOnCalibrationTap?: () => (() => boolean) | undefined;
  /** AudioInit lifecycle deps. */
  recover: () => Promise<unknown>;
  isRunning: () => boolean;
  requestWakeLock: () => Promise<unknown>;
  getTone: () => PracticeVisibility.PracticeVisibilityToneRef | undefined | null;
  /** 再開リワインド量（ms）— practice-visibility の resume runway。
   *  省略時 0（従来どおり即時再開）。 */
  getResumeRewindMs?: () => number;
}

export interface ShellMidi {
  midiInput: MidiInputRef;
  /**
   * Is MIDI the input that drives scoring, judgement windows and visuals?
   *
   * THE routing predicate. `midiInput.enabled` says a keyboard is connected;
   * this says we are listening to it. Every consumer that cares "which device
   * is the player playing" reads this, so the answer is one decision made in
   * one place instead of ten sites re-deriving it from a hardware flag.
   */
  isMidiActive(): boolean;
  /** Full classification for UI (which source is live, is it waiting, is a
   *  connected keyboard deliberately idle). */
  getInputStatus(): PianoCore.InputSourceStatus;
  /** Apply a new input-source choice: resolves the active source and brings the
   *  mic up or down to match, then repaints the input read-outs. Caller persists
   *  the pref. AWAIT it before re-rendering a panel — acquiring a mic is a
   *  permission prompt plus a device open, and painting first shows the state
   *  the player just changed away from. */
  applyInputSourcePref(): Promise<void>;
  bleMidi: any;
  initWebMIDI(): Promise<any>;
  /** @param silent if true, suppress the user-visible "scanning" hint. */
  rescanMidi(silent?: any): any;
  startMidiAutoRescan(): void;
  stopMidiAutoRescan(): void;
  isAppleMobile(): boolean;
  setInputIndicator(): void;
  attachMidiPort(port: any): boolean;
  /** Live BLE-MIDI connect — settings panel button. */
  connectBleMidi(): Promise<void>;
  /** M3: 既知（許可済み）BLE デバイスへの起動時サイレント再接続。
   *  getDevices 非対応・デバイス無しは即 false。Never throws. */
  reconnectKnownBle(): Promise<boolean>;
  /** Drain the dispatch redelivery dedupe — called from session-reset. */
  resetMidiDispatch(): void;
  /** Freeze the practice clock + pause Transport (settings panel / ⏸). */
  pausePractice(): void;
  /** Rebase the clock + resume Transport. */
  resumePractice(): void;
  /** True while an explicit pause holds the session. Exposed for the
   *  future ⏸ toolbar button (P2-13) to reflect toggle state — not yet
   *  wired to a caller. */
  isPracticePaused(): boolean;
}

export function createShellMidi(deps: ShellMidiDeps): ShellMidi {
  const { state, practice, dom, t, navigator: nav } = deps;

  // platformBlocked: true on platforms that never expose Web MIDI (iOS Safari
  // / any iPadOS browser) — drives a friendlier hint in IntroHintUi.
  const midiInput: MidiInputRef = {
    enabled: false,
    port: null,
    _accessRequested: false,
    platformBlocked: false,
    lastEventTime: 0,
  };

  /**
   * Resolve the ACTIVE input source from the player's setting plus the hardware.
   *
   * Read at call time by every routing consumer — a keyboard can be plugged in
   * and the setting changed mid-section, and both have to take effect at once
   * (they change the judgement windows).
   */
  function isMidiActive(): boolean {
    return PianoCore.resolveInputSource(deps.getInputSourcePref(), midiInput.enabled) === 'midi';
  }

  function getInputStatus(): PianoCore.InputSourceStatus {
    // `micUsable` folds in `micSuspended` as well as the two failure flags, so
    // `waiting` means exactly "the active source cannot produce input right
    // now". That makes ONE predicate answer the mic meter, the pill's ⏳ state
    // and the intro hint; they previously used three different conjunctions of
    // the same raw flags and disagreed.
    return PianoCore.describeInputSource(
      deps.getInputSourcePref(),
      midiInput.enabled,
      !state.micSuspended && !state.micPermissionFailed && !state.micIntentionallySkipped
    );
  }

  /**
   * Bring the microphone into line with the active source.
   *
   * The mic is a hardware resource with a privacy LED and real CPU cost (YIN +
   * AGC + onset per frame), so it follows the ACTIVE source, not the attach
   * event. `attach()` suspending the mic unconditionally is what made
   * "keyboard connected" and "mic off" the same thing; now attaching a keyboard
   * while the player has pinned the mic leaves the mic running, and pinning the
   * mic with a keyboard already attached brings it back without a replug.
   */
  async function applyInputSourcePref(): Promise<void> {
    const micWanted = !isMidiActive();
    if (!deps.getAudioCtx()) {
      // No audio graph yet (title screen before Start) — nothing to suspend or
      // resume; the first mic acquire will read the pref itself.
      paintInputState();
      return;
    }
    if (micWanted && state.micSuspended) {
      // AWAITED, not fire-and-forget. Acquiring a mic is a permission prompt +
      // a device open, so it takes hundreds of ms; painting before it settles
      // showed the PRE-switch state ("🎙️ 待機中", no meter) with nothing to ever
      // correct it, which reads as "the switch did nothing".
      //
      // Whether a pinned 🎙️ outranks the platform's "don't even ask" heuristic
      // is decided inside resume() — it owns that flag and reads the same pref.
      await deps.resumeMic();
    } else if (!micWanted && !state.micSuspended) {
      deps.suspendMic();
    }
    paintInputState();
  }

  /** Last emitted `[INPUT]` line — so the diagnostic reports CHANGES only. */
  let lastInputDiag = '';

  /** Repaint the input INDICATOR (pill + badge) and log the change. Every path
   *  that mutates input state routes its `setInputIndicator` dep here, so the
   *  diagnostic can never be dropped by a call site that forgets it — it was
   *  five identical inline closures. */
  function paintIndicator(st?: PianoCore.InputSourceStatus): void {
    _indicator.setInputIndicator();
    logInputState(st);
  }

  /** Repaint everything that reflects WHICH input is live. One place, because
   *  the mic meter, the indicator and the intro hint disagreeing is what makes a
   *  working switch look broken. */
  function paintInputState(): void {
    // Mic-meter visibility is `status.active === 'mic' && !waiting` — the same
    // question `describeInputSource` already answers — rather than a hand-rolled
    // conjunction of four raw flags. Four sites used to decide this and gave
    // three different answers.
    const st = getInputStatus();
    dom.micMeter?.classList.toggle('visible', st.active === 'mic' && !st.waiting);
    paintIndicator(st);
    deps.refreshIntroHint();
  }

  /**
   * One-line resolved-input diagnostic, emitted on CHANGE only.
   *
   * Input state is the one thing that kept being wrong on device in a way no log
   * could confirm: "the pill says MIDI but the settings panel says mic" is a DOM
   * fact, and the device log only ever showed `[AUDIO] Mic acquired`, which says
   * nothing about what the player is being SHOWN. Three debugging rounds went by
   * asking the user to describe the screen. This makes the resolved state
   * answerable from the log alone.
   *
   * console.log, not remoteLog: the native build hard-disables remote logging for
   * App Store compliance, but Capacitor forwards console to the device log —
   * which is exactly where the answer is needed.
   */
  function logInputState(st: PianoCore.InputSourceStatus = getInputStatus()): void {
    // Spread the status rather than re-listing its fields: a field added to
    // `InputSourceStatus` — the interface that exists so every surface stays in
    // step — would otherwise be silently missing from the one line that says
    // what the app decided. `JSON.stringify` matches the repo's other
    // diagnostics (practice-visibility, osmd-cursor, render-loop-wireup).
    const line = JSON.stringify({
      ...st,
      port: midiInput.port?.name ?? null,
      micSuspended: !!state.micSuspended,
      micSkipped: !!state.micIntentionallySkipped,
      micFailed: !!state.micPermissionFailed,
    });
    if (line === lastInputDiag) return;
    lastInputDiag = line;
    diag('INPUT', line);
  }

  // ── Dispatch + indicator ──
  const _indicator = MidiIndicator.createMidiIndicator({
    midiInput,
    dom: { midiBadge: dom.midiBadge, ptbInput: dom.ptbInput },
    getInputStatus,
    t,
    isRescanRunning: () => _rescan.isRescanRunning(),
    hasRequestMIDIAccess: () => typeof nav.requestMIDIAccess === 'function',
    // [Bug fix 2026-05-09] Suppress the 🎹⏳ "waiting for MIDI" pill
    // during practice — once the user has committed to a mic session
    // the hint is just visual noise (user-reported screenshot). The
    // poller stays alive so a mid-practice USB plug still auto-attaches.
    isPracticeActive: () => !!practice.enabled,
  });

  const _dispatch = MidiDispatch.createMidiDispatch({
    midiInput,
    isMidiActive,
    practice,
    // False while an explicit pause holds the session (settings panel / ⏸)
    // so a MIDI press behind the modal can't phantom-advance the cursor or
    // score — matching the documented "settings-panel = paused" invariant.
    isSessionRunning: () => !!state.running && !practice.paused,
    pulseMidiBadge: () => _indicator.pulseBadge(),
    onMidiNoteOn: (m: number, v: number) => deps.getOnMidiNoteOn()(m, v),
    onMidiNoteOff: (m: number) => deps.getOnMidiNoteOff()(m),
    onMidiCC: (cc: number, v: number) => deps.getOnMidiCC()(cc, v),
    // P1-11: dispatch が算出した per-event 遅延（inputLagMs）を判定へ貫通。
    matchNoteOnset: (m: number, exact: boolean, lagMs?: number) =>
      deps.getMatchNoteOnset()(m, exact, lagMs),
    // 較正中はキー押下がタップそのもの（弾く楽器で較正する — Rocksmith 準拠）。
    onCalibrationTap: () => deps.getOnCalibrationTap?.()?.() ?? false,
  });

  // Tap the input badge in the practice topbar to trigger a manual rescan.
  dom.ptbInput?.addEventListener('click', () => {
    if (midiInput.enabled || midiInput.platformBlocked) return;
    console.log('[MIDI] manual rescan triggered by topbar badge tap');
    void _rescan.rescan(false);
  });

  // ── Ports + rescan + intro-diag ──
  const _ports = MidiPorts.createMidiPorts({
    midiInput,
    state,
    // bleMidi declared below — factory built first.
    getBleMidi: () => bleMidi,
    hasAudioCtx: () => !!deps.getAudioCtx(),
    suspendMic: deps.suspendMic,
    resumeMic: deps.resumeMic,
    isMidiActive,
    onMidiMessageHandler: (e: any) => _dispatch.onMessage(e),
    setInputIndicator: paintIndicator,
    isVirtualMidiPort: (port: any) => _indicator.isVirtualMidiPort(port),
    refreshIntroHint: deps.refreshIntroHint,
    showHitChip: deps.showHitChip,
    micMeter: dom.micMeter,
    startMidiAutoRescan: () => _rescan.startAutoRescan(),
    stopMidiAutoRescan: () => _rescan.stopAutoRescan(),
    clearHeldNotes: deps.clearHeldMidiNotes,
    t,
  });

  // BLE connect / GATT-disconnect handler only ever READS
  // state.micSuspended. Exposing a getter (rather than the previous
  // bidirectional get/set wrapper) makes that contract obvious; the
  // production state ref is updated by suspendMic/resumeMic in
  // shell-audio.ts, not by ble-midi-connect.

  /** @returns {boolean} */
  function attachMidiPort(port: any): boolean {
    return _ports.attach(port);
  }

  const _rescan = MidiRescan.createMidiRescan({
    midiInput,
    getInputSourcePref: deps.getInputSourcePref,
    isOwnWebMidiPolyfill: isNativeMidiPolyfillInstalled,
    attachMidiPort: (port: any) => attachMidiPort(port),
    detachMidiPort: (port: any) => _ports.detach(port),
    isAppleMobile: () => _indicator.isAppleMobile(),
    // ネイティブ iOS: no-port 診断の2行目を「⚙ → 🔵 でつなぐ」へ。
    hasNativePairing: hasNativeBleMidiPairing,
    showDiagnostic: (makeLines: any) => {
      _diag.showDiag(() => {
        const { line1, line2 } = makeLines();
        _diag.setDiagnostic(line1, line2);
      });
    },
    t,
    setInputIndicator: paintIndicator,
    navigator: nav,
    // [Bug fix 2026-05-09] Pause auto-rescan during practice playback.
    isPaused: () => !!practice.enabled,
  });

  const _diag = IntroDiag.createIntroDiag({
    state,
    introHintEl: dom.introHint,
    isAppleMobile: () => _indicator.isAppleMobile(),
    hasRequestMIDIAccess: () => !!nav.requestMIDIAccess,
    // ネイティブ iOS: 待機ヒントの2行目を実手順（⚙ → 🔵）へ。
    hasNativePairing: hasNativeBleMidiPairing,
    isOwnWebMidiPolyfill: isNativeMidiPolyfillInstalled,
    getInputSourcePref: deps.getInputSourcePref,
    t,
  });

  const _init = MidiInit.createMidiInit({
    midiInput,
    navigator: nav,
    isAppleMobile: () => _indicator.isAppleMobile(),
    setInputIndicator: paintIndicator,
    // MIDIAccess のキャッシュは midi-rescan が唯一の保有者。以前は shell 側
    // ミラー _midiAccess に分裂しており、verifyAlive が rescan 経由の attach を
    // 常に「死んだ」と誤判定 / clearMidiAccessCache が実キャッシュを消せない
    // という visibility 復帰系の実バグになっていた。
    ensureMidiAccess: (force?: any) => _rescan.ensureAccess(force),
    gatherMidiInputs: (access: any) => MidiPorts.gatherMidiInputs(access),
    attachMidiPort: (port: any) => attachMidiPort(port),
    showMidiWaitingHint: () => _diag.showMidiWaitingHint(),
    startMidiAutoRescan: () => _rescan.startAutoRescan(),
  });

  const _practiceVisibility = PracticeVisibility.createPracticeVisibilityController({
    practice,
    getTone: deps.getTone,
    getResumeRewindMs: deps.getResumeRewindMs,
  });

  // Audio-lifecycle hook (visibilitychange + devicechange) — the same MIDI
  // module owns the access cache because recovery routes back through the
  // rescan poller. Lives here so the cache mutation is local.
  AudioInit.createAudioLifecycle({
    getAudioCtx: () => deps.getAudioCtx(),
    recover: async () => {
      await deps.recover();
    },
    isRunning: deps.isRunning,
    requestWakeLock: async () => {
      await deps.requestWakeLock();
    },
    navigator: nav as any,
    midiInput,
    verifyMidiAlive: () => _ports.verifyAlive(_rescan.getAccess()),
    // devicechange の force-fresh: rescan の実キャッシュを onstatechange
    // ごと安全に破棄（次の enumerate が死んだ参照を読まないように）。
    clearMidiAccessCache: () => _rescan.dropAccessCache(),
    rescanMidi: (silent: any) => _rescan.rescan(silent),
    startMidiAutoRescan: () => _rescan.startAutoRescan(),
    onHidden: () => _practiceVisibility.onHidden(),
    onVisible: () => _practiceVisibility.onVisible(),
  }).install();

  // ── BLE-MIDI ──
  const bleMidi: any = { device: null, characteristic: null, connected: false };

  const _bleConnect = BleMidiConnect.createBleMidiConnect({
    bleMidi,
    midiInput,
    hasAudioCtx: () => !!deps.getAudioCtx(),
    state: {
      get micSuspended() {
        return state.micSuspended;
      },
      // M4: BLE 切断時の micMeter 復帰判定に使う（マイクが実際に使える
      // ときだけメーターを再表示）。
      get micPermissionFailed() {
        return state.micPermissionFailed;
      },
      get micIntentionallySkipped() {
        return state.micIntentionallySkipped;
      },
    },
    suspendMic: deps.suspendMic,
    resumeMic: deps.resumeMic,
    setInputIndicator: paintIndicator,
    refreshIntroHint: deps.refreshIntroHint,
    showHitChip: deps.showHitChip,
    micMeter: dom.micMeter,
    // BLE-MIDI 1.0 packet: header byte (high bit + top 6 bits of timestamp)
    // then groups of (timestamp, status?, data...). Timestamps ignored.
    parsePacket: (buf: any) =>
      BleMidiParser.parseBleMidiPacket(buf, (s, a, b) => _dispatch.dispatch(s, a, b)),
    startMidiAutoRescan: () => _rescan.startAutoRescan(),
    // M2: BLE 接続時に Web MIDI の全バインドを外す（複数ポート束対応）。
    unbindWebPorts: () => _ports.unbindAll(),
    clearHeldNotes: deps.clearHeldMidiNotes,
    t,
    alert: (msg: any) => alert(msg),
    navigator: nav,
  });

  // Boot-time snapshot, so the log always states which input the session STARTED
  // on — the state that "it was in MIDI-waiting from the start" was about.
  logInputState();

  return {
    midiInput,
    isMidiActive,
    getInputStatus,
    applyInputSourcePref,
    bleMidi,
    initWebMIDI: () => _init.initWebMIDI(),
    rescanMidi: (silent?: any) => _rescan.rescan(silent),
    startMidiAutoRescan: () => _rescan.startAutoRescan(),
    stopMidiAutoRescan: () => _rescan.stopAutoRescan(),
    isAppleMobile: () => _indicator.isAppleMobile(),
    setInputIndicator: paintIndicator,
    attachMidiPort,
    connectBleMidi: async () => {
      await _bleConnect.connect();
    },
    reconnectKnownBle: async () => _bleConnect.reconnectKnown(),
    resetMidiDispatch: () => _dispatch.reset(),
    // Explicit practice pause/resume (settings panel, ⏸ button) — shares
    // the freeze/resume machinery with tab-visibility so the two can't
    // fight (a tab refocus mid-pause won't un-pause).
    pausePractice: () => _practiceVisibility.pause(),
    resumePractice: () => _practiceVisibility.resume(),
    isPracticePaused: () => _practiceVisibility.isPaused(),
  };
}
