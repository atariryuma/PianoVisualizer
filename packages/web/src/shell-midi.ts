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

/** Mutable per-session MIDI connection state. Shared across the MIDI
 *  cluster (ports / dispatch / rescan / init / indicator) and read by
 *  every shell that needs to know whether a piano is currently
 *  connected. Each consumer (midi-ports, midi-dispatch, midi-indicator)
 *  declares its own narrow view; this is the union that satisfies all
 *  of them. */
export interface MidiInputRef {
  /** True once a MIDIInput port has been attached (port-side
   *  `onmidimessage` is wired) — implies we should ignore mic input. */
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

  // ── Dispatch + indicator ──
  const _indicator = MidiIndicator.createMidiIndicator({
    midiInput,
    dom: { midiBadge: dom.midiBadge, ptbInput: dom.ptbInput },
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
    onMidiMessageHandler: (e: any) => _dispatch.onMessage(e),
    setInputIndicator: () => _indicator.setInputIndicator(),
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
    attachMidiPort: (port: any) => attachMidiPort(port),
    detachMidiPort: (port: any) => _ports.detach(port),
    isAppleMobile: () => _indicator.isAppleMobile(),
    showDiagnostic: (makeLines: any) => {
      _diag.showDiag(() => {
        const { line1, line2 } = makeLines();
        _diag.setDiagnostic(line1, line2);
      });
    },
    t,
    setInputIndicator: () => _indicator.setInputIndicator(),
    navigator: nav,
    // [Bug fix 2026-05-09] Pause auto-rescan during practice playback.
    isPaused: () => !!practice.enabled,
  });

  const _diag = IntroDiag.createIntroDiag({
    state,
    introHintEl: dom.introHint,
    isAppleMobile: () => _indicator.isAppleMobile(),
    hasRequestMIDIAccess: () => !!nav.requestMIDIAccess,
    t,
  });

  const _init = MidiInit.createMidiInit({
    midiInput,
    navigator: nav,
    isAppleMobile: () => _indicator.isAppleMobile(),
    setInputIndicator: () => _indicator.setInputIndicator(),
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
    setInputIndicator: () => _indicator.setInputIndicator(),
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

  return {
    midiInput,
    bleMidi,
    initWebMIDI: () => _init.initWebMIDI(),
    rescanMidi: (silent?: any) => _rescan.rescan(silent),
    startMidiAutoRescan: () => _rescan.startAutoRescan(),
    stopMidiAutoRescan: () => _rescan.stopAutoRescan(),
    isAppleMobile: () => _indicator.isAppleMobile(),
    setInputIndicator: () => _indicator.setInputIndicator(),
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
