// MIDI port attach/detach + enumeration + visibility-resume health
// check — Phase 0d batch 25.
//
// Three coupled concerns that all run against the Web MIDI API's
// `MIDIAccess.inputs` map:
//
//   1. gatherMidiInputs(access) — defensive iteration of `access.inputs`
//      that handles Map (per spec), Set/forEach (older Chromium), and
//      plain-object polyfill shapes (Web MIDI Browser quirks). Pure.
//
//   2. attachMidiPort / detachMidiPort — the side-effecting pair that
//      flips the app between mic-driven and MIDI-driven input. attach
//      filters out virtual/system ports (IAC Driver, Midi Through),
//      flips midiInput.enabled, suspends the mic, and binds the
//      dispatcher to port.onmidimessage. detach is the symmetric
//      teardown plus a "resume mic + restart rescan poller" path
//      so a hot-replug recovers without the user noticing.
//
//      M2 (2026-07-23): MULTI-PORT binding — the industry-standard Web
//      MIDI pattern is to listen on ALL inputs (Chrome samples do the
//      same), not to pick one. Dual-port keyboards (Roland/Yamaha
//      "DAW"/"MIDI" pairs) and multi-device setups previously lost the
//      real keyboard to enumeration order. attach() now adds each
//      eligible port to a bound set; `midiInput.port` stays the FIRST
//      bound port (display name / indicator). detach() removes one
//      port and only tears the whole MIDI mode down when the set
//      empties. Duplicate events from mirrored ports are absorbed by
//      the dispatcher's 30 ms note-on dedupe (midi-dispatch.ts).
//
//   3. verifyMidiAlive() — visibility-resume probe. iOS Web MIDI
//      Browser silently kills the onmidimessage handler when the page
//      goes background; the port object stays valid but events stop
//      flowing. We re-bind unconditionally on resume; if the port
//      vanished from the inputs list, we detach so the rescan poller
//      can find a new one. BLE-MIDI uses a synthetic port marker
//      that's NOT in the inputs map — we early-return when bleMidi
//      is connected so the visibility check doesn't drop the live
//      BLE session as collateral.
//
// All side-effects are passed in via the deps bag — zero shell-global
// reads. The factory closes over nothing of its own (the dedupe state
// for the dispatcher lives in midi-dispatch.ts).

import type { MidiIndicatorMidiInput } from './midi-indicator';

/** Subset of Web MIDI's `MIDIInput` we touch — narrow to keep tests
 *  small and avoid pulling lib.dom's full MIDI shape into deps. */
export interface MidiPortRef {
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  connection?: string;
  type?: string;
  /** Set to bind / unbind the message handler. Per spec, assigning
   *  also auto-opens the port.
   *  P1-11: `timeStamp` は MIDIMessageEvent.timeStamp（performance.now()
   *  起点）— dispatch 側で per-event 遅延補正に使う。 */
  onmidimessage?:
    | ((e: { data: ArrayLike<number> | null | undefined; timeStamp?: number }) => void)
    | null;
  /** Web MIDI's `port.open()` returns a Promise. We call it
   *  unconditionally to work around Web MIDI Browser quirks where
   *  pre-paired BLE-MIDI keyboards arrive un-opened despite the
   *  spec's "assigning onmidimessage opens the port" rule. */
  open?: () => Promise<unknown>;
}

/** The {name}-only marker that BLE-MIDI installs in `midiInput.port`.
 *  It is NOT a member of `MIDIAccess.inputs` — distinguished from a
 *  real MIDIInput by the absence of `onmidimessage`. */
export interface BlePortMarker {
  name: string;
}

/** Subset of `MIDIAccess` we read. */
export interface MidiAccessRef {
  inputs?: unknown;
}

/** Shell `midiInput` ref the attacher mutates. Composes the
 *  indicator-side type so the same ref drives the badge / topbar
 *  pill via `setInputIndicator`. */
export interface MidiPortsInputRef extends MidiIndicatorMidiInput {
  port?: MidiPortRef | BlePortMarker | null;
  lastEventTime: number;
  /** Set to true once `requestMIDIAccess` has been called. The
   *  shell uses this to dedupe the lazy initWebMIDI call across
   *  callsites. We don't touch it here — declared for type clarity. */
  _accessRequested?: boolean;
}

export interface MidiPortsStateRef {
  micSuspended: boolean;
  /** Mic-permission state — drives whether detach should restart
   *  the auto-rescan poller + whether the mic meter re-shows. */
  micPermissionFailed?: boolean;
  micIntentionallySkipped?: boolean;
  /** intro-diag の「MIDI 待機中」ヒントの once-per-session ガード。
   *  attach で false に戻す — 後の切断でゼロポートに戻ったとき、
   *  ヒントが再表示できるように（M4）。 */
  _midiWaitingShown?: boolean;
}

export interface MidiPortsBleRef {
  connected: boolean;
}

export interface MidiPortsDeps {
  midiInput: MidiPortsInputRef;
  state: MidiPortsStateRef;
  /** I1: 切断（detach）時に押下中の鍵の視覚状態をクリアする。切断後は
   *  note-off が二度と来ないので、これが無いと幽霊点灯が次のセクション遷移
   *  まで残る。省略可（旧呼び出し互換）。 */
  clearHeldNotes?: () => void;
  /** Read at call time (not factory-build time) so the legacy shell
   *  can hand in a thunk that resolves `bleMidi` after its TDZ
   *  unblocks — the bleMidi const lives further down legacy-app.js
   *  than this factory's wire-up. */
  getBleMidi: () => MidiPortsBleRef;

  /** Audio context — read for the suspend/resume guards. Treated as
   *  unknown-ish so the deps don't pull in lib.dom's `AudioContext`
   *  full surface. The guards only check truthiness. */
  hasAudioCtx: () => boolean;
  suspendMic: () => void;
  resumeMic: () => void;

  /** The byte-router entry point — wired straight onto
   *  `port.onmidimessage`. Same signature as `onMidiMessageHandler`
   *  in the shell（P1-11: timeStamp 付きイベントをそのまま透過）。 */
  onMidiMessageHandler: (e: {
    data: ArrayLike<number> | null | undefined;
    timeStamp?: number;
  }) => void;

  /** Indicator + indicator-helper pair from midi-indicator.ts. */
  setInputIndicator: () => void;
  isVirtualMidiPort: (port: { name?: string | null } | null) => boolean;

  /** Optional shell helpers — declared optional because some flows
   *  (verifyMidiAlive in particular) shouldn't be coupled to UI
   *  niceties when called during a visibility-resume. */
  refreshIntroHint?: () => void;
  showHitChip?: (kind: string, msg: string) => void;
  micMeter?: HTMLElement | null;

  /** Auto-rescan poller controls — both detach + attach call them. */
  startMidiAutoRescan: () => void;
  stopMidiAutoRescan: () => void;

  /** Bilingual translator. Only the 'midiConnectedFmt' key is used. */
  t: (key: string, vars?: Record<string, string>) => string;
}

export interface MidiPorts {
  /** Open + bind ONE port into the bound set (M2: callers bind every
   *  eligible port, not just the first). Returns true on success or
   *  already-bound, false on skip (virtual port / BLE active). */
  attach(port: MidiPortRef | null): boolean;
  /** Remove one port from the bound set. Full MIDI-mode teardown
   *  (enabled=false, mic resume, poller restart) only when the set
   *  empties. Idempotent under double-detach. */
  detach(port: MidiPortRef | BlePortMarker | null): void;
  /** Visibility-resume health probe. Re-binds handlers on still-alive
   *  bound ports; drops vanished ones. Returns false when nothing
   *  bound survives (no-op → false). */
  verifyAlive(access: MidiAccessRef | null): Promise<boolean>;
  /** BLE 接続への移譲: 全 Web MIDI ポートのハンドラを外して束を空にする
   *  （mic/poller の副作用なし — 呼び出し側の BLE が入力の主導権を持つ）。 */
  unbindAll(): void;
}

// ─── pure helper (also exported for tests) ─────────────────────────

/** Defensive iteration of `access.inputs`. Handles three shapes:
 *    - Map / iterable with .values() — per-spec.
 *    - .forEach() — older Chromium.
 *    - Plain object — Web MIDI Browser polyfill.
 *  Returns the input ports in iteration order, no filtering. */
export function gatherMidiInputs(access: MidiAccessRef | null | undefined): MidiPortRef[] {
  const out: MidiPortRef[] = [];
  const inputs = access && (access.inputs as unknown);
  if (!inputs) return out;
  // Map / iterable shape
  const mapLike = inputs as { values?: () => Iterable<MidiPortRef> };
  if (typeof mapLike.values === 'function') {
    for (const p of mapLike.values()) out.push(p);
    return out;
  }
  // forEach-only shape (older Chromium)
  const forEachLike = inputs as { forEach?: (cb: (p: MidiPortRef) => void) => void };
  if (typeof forEachLike.forEach === 'function') {
    forEachLike.forEach((p) => out.push(p));
    return out;
  }
  // Plain-object polyfill (Web MIDI Browser shapes etc.)
  if (typeof inputs === 'object') {
    const obj = inputs as Record<string, MidiPortRef>;
    for (const k in obj) {
      const p = obj[k];
      if (p && (p.type === 'input' || p.type == null)) out.push(p);
    }
  }
  return out;
}

// ─── attach / detach / verify factory ─────────────────────────────

export function createMidiPorts(deps: MidiPortsDeps): MidiPorts {
  /** M2: every currently-bound Web MIDI input. `midiInput.port` is the
   *  FIRST bound port (primary — drives the indicator's display name);
   *  the dispatcher is bound to every member. */
  const boundPorts = new Set<MidiPortRef>();

  function attach(port: MidiPortRef | null): boolean {
    if (!port) return true;
    if (boundPorts.has(port)) {
      // Already bound — re-bind the handler (cheap, idempotent; WMB can
      // silently kill handlers) and report success.
      port.onmidimessage = deps.onMidiMessageHandler;
      return true;
    }
    if (deps.isVirtualMidiPort(port)) {
      console.log('[MIDI] skip virtual/system port: ' + port.name);
      return false;
    }
    // BLE-MIDI owns the midiInput slot when connected. A parallel
    // Web MIDI attach (e.g. a post-BLE-connect rescan that surfaced
    // a USB device, or onstatechange firing during the GATT handshake)
    // would otherwise overwrite midiInput.port with a Web MIDI port,
    // drop the BlePortMarker, and leave BLE message routing alive but
    // unreachable from the indicator / verifyAlive path.
    if (deps.getBleMidi().connected) {
      console.log('[MIDI] skip attach — BLE-MIDI already connected: ' + port.name);
      return false;
    }
    const wasMidiOn = deps.midiInput.enabled;

    // @WMB-WORKAROUND (Phase 0d): explicit port.open() before the
    // handler bind. The Web MIDI spec says assigning onmidimessage
    // implicitly opens, but Web MIDI Browser's polyfill doesn't always
    // honor that — pre-paired BLE-MIDI keyboards end up attached but
    // silent. open() on already-open ports is a spec-defined no-op so
    // it's safe to call unconditionally; rejection (rare) is logged
    // and we bind the handler anyway. Native iOS/Android (Capacitor)
    // doesn't need this — CoreMIDI / android.media.midi own the open.
    try {
      const openResult = port.open?.();
      if (openResult && typeof (openResult as Promise<unknown>).catch === 'function') {
        (openResult as Promise<unknown>).catch((e) =>
          console.warn('[MIDI] port.open() rejected:', e instanceof Error ? e.message : String(e))
        );
      }
    } catch (e) {
      console.warn('[MIDI] port.open() threw:', e instanceof Error ? e.message : String(e));
    }
    // /@WMB-WORKAROUND

    // Wire the dispatcher BEFORE flipping midiInput.enabled. Mic
    // pipeline mutes itself the instant `enabled` is true; without
    // this ordering, a note-on landing in the gap between
    // `enabled=true` and `onmidimessage=handler` would be silently
    // dropped (mic ignores it because MIDI is "on", and the MIDI
    // dispatcher isn't bound yet).
    port.onmidimessage = deps.onMidiMessageHandler;
    boundPorts.add(port);

    // Primary port = first bound (display name / indicator anchor).
    if (!deps.midiInput.port) deps.midiInput.port = port;
    deps.midiInput.enabled = true;
    deps.midiInput.lastEventTime = 0;

    // v13: MIDI is the new authoritative source — drop the mic so the
    // privacy LED goes off and YIN/AGC/onset stop chewing CPU.
    if (!wasMidiOn && deps.hasAudioCtx() && !deps.state.micSuspended) {
      deps.suspendMic();
    }

    deps.setInputIndicator();
    deps.refreshIntroHint?.();
    deps.micMeter?.classList.remove('visible');
    deps.stopMidiAutoRescan();
    // M4: allow the waiting hint to re-show if this session later drops
    // back to zero ports (the guard was once-per-session).
    deps.state._midiWaitingShown = false;
    // Connected chip only for the FIRST port — a dual-port keyboard
    // (DAW+MIDI) binding both ports shouldn't fire two celebrations.
    if (!wasMidiOn) {
      deps.showHitChip?.('good', deps.t('midiConnectedFmt', { v: port.name || 'MIDI' }));
    }
    console.log(
      '[MIDI] connected: ' +
        port.name +
        ' (state=' +
        port.state +
        ' connection=' +
        port.connection +
        ' bound=' +
        boundPorts.size +
        ')'
    );
    return true;
  }

  function detach(port: MidiPortRef | BlePortMarker | null): void {
    // Handles both real bound ports and the BLE marker / legacy single
    // primary (marker is never in boundPorts — matched via midiInput.port).
    if (!port) return;
    const isBound = boundPorts.has(port as MidiPortRef);
    if (!isBound && deps.midiInput.port !== port) return;
    if ('onmidimessage' in port) {
      (port as MidiPortRef).onmidimessage = null;
    }
    boundPorts.delete(port as MidiPortRef);

    // Promote the next bound port to primary when the primary left.
    if (deps.midiInput.port === port) {
      const next = boundPorts.values().next();
      deps.midiInput.port = next.done ? null : next.value;
    }
    if (boundPorts.size > 0) {
      // Still MIDI-driven through the remaining port(s) — no mode flip.
      deps.setInputIndicator();
      console.log('[MIDI] port detached — ' + boundPorts.size + ' port(s) still bound');
      return;
    }

    deps.midiInput.port = null;
    deps.midiInput.enabled = false;
    deps.setInputIndicator();
    // I1: 切断で note-off が来なくなるので、押下中の鍵の視覚状態をクリア
    // （幽霊点灯防止）。生成（attach 経路）に対する対称な消去。
    deps.clearHeldNotes?.();
    console.log('[MIDI] disconnected');

    // v13: Bring the mic back on a deliberate detach so the user can
    // keep playing acoustically without restarting the app.
    if (deps.hasAudioCtx() && deps.state.micSuspended) {
      deps.resumeMic();
      // M4: re-show the mic meter — the mic is live again but nothing
      // used to restore the meter until the next showRunningUI.
      if (!deps.state.micPermissionFailed && !deps.state.micIntentionallySkipped) {
        deps.micMeter?.classList.add('visible');
      }
    }
    // Always restart silent polling — the previous policy only kicked
    // it back on when the mic was unavailable, but that left the
    // happy-mic case dependent on the cached MIDIAccess's
    // onstatechange, which is unreliable on Web MIDI Browser /
    // WKWebView and occasionally on USB hub re-enumeration. The
    // poller stops itself the moment anything re-attaches (or when
    // navigator.requestMIDIAccess vanishes), so the cost is bounded.
    deps.startMidiAutoRescan();
  }

  async function verifyAlive(access: MidiAccessRef | null): Promise<boolean> {
    if (!deps.midiInput.enabled || !deps.midiInput.port || !access) return false;
    // BLE-MIDI installs a synthetic `midiInput.port` (just a `{ name }`
    // marker) that is NOT a member of `access.inputs`. Looking it up
    // would always miss → detach the live BLE session as collateral
    // on every visibility-resume. Health for BLE is tracked by the
    // GATT `gattserverdisconnected` listener in connectBleMidi.
    if (deps.getBleMidi().connected) return true;

    const ports = gatherMidiInputs(access);
    // Legacy / externally-seeded single-port state (midiInput.port set
    // without going through attach — some tests + defensive): fall back
    // to the original single-port membership check.
    if (boundPorts.size === 0) {
      const currentPort = deps.midiInput.port as MidiPortRef;
      const stillThere = ports.find((p) => p === currentPort && p.state === 'connected');
      if (!stillThere) {
        try {
          detach(currentPort);
        } catch {
          /* idempotent */
        }
        return false;
      }
      currentPort.onmidimessage = deps.onMidiMessageHandler;
      return true;
    }
    // M2: check every bound port; drop the dead, re-bind the survivors.
    // Iterate over a snapshot — detach() mutates the set.
    for (const bound of Array.from(boundPorts)) {
      const stillThere = ports.find((p) => p === bound && p.state === 'connected');
      if (!stillThere) {
        try {
          detach(bound);
        } catch {
          /* idempotent — ignore double-detach errors */
        }
      } else {
        // Re-bind unconditionally. Cheap; idempotent on a healthy port;
        // required on a suspended one (WMB kills handlers in background).
        bound.onmidimessage = deps.onMidiMessageHandler;
      }
    }
    return deps.midiInput.enabled;
  }

  function unbindAll(): void {
    for (const p of boundPorts) {
      try {
        p.onmidimessage = null;
      } catch {
        /* detached port — best effort */
      }
    }
    boundPorts.clear();
  }

  return { attach, detach, verifyAlive, unbindAll };
}
