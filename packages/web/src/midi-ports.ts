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
   *  also auto-opens the port. */
  onmidimessage?: ((e: { data: ArrayLike<number> | null | undefined }) => void) | null;
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
   *  the auto-rescan poller. */
  micPermissionFailed?: boolean;
  micIntentionallySkipped?: boolean;
}

export interface MidiPortsBleRef {
  connected: boolean;
}

export interface MidiPortsDeps {
  midiInput: MidiPortsInputRef;
  state: MidiPortsStateRef;
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
   *  in the shell. */
  onMidiMessageHandler: (e: { data: ArrayLike<number> | null | undefined }) => void;

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
  /** Open + attach a single port. Returns true on success, false on
   *  skip (virtual port). The caller iterates its candidate list and
   *  stops on the first true. */
  attach(port: MidiPortRef | null): boolean;
  /** Symmetric detach — runs only if the same port is still bound
   *  (idempotent under double-detach). */
  detach(port: MidiPortRef | BlePortMarker | null): void;
  /** Visibility-resume health probe. Re-binds the handler on a still-
   *  alive port; detaches when the port has vanished from the inputs
   *  map. Returns false when there's no port to verify (no-op). */
  verifyAlive(access: MidiAccessRef | null): Promise<boolean>;
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
  function attach(port: MidiPortRef | null): boolean {
    if (!port || deps.midiInput.port === port) return true;
    if (deps.isVirtualMidiPort(port)) {
      console.log('[MIDI] skip virtual/system port: ' + port.name);
      return false;
    }
    const wasMidiOn = deps.midiInput.enabled;
    const prev = deps.midiInput.port;
    if (prev && 'onmidimessage' in prev) {
      (prev as MidiPortRef).onmidimessage = null;
    }
    deps.midiInput.port = port;
    deps.midiInput.enabled = true;
    deps.midiInput.lastEventTime = 0;

    // v13: MIDI is the new authoritative source — drop the mic so the
    // privacy LED goes off and YIN/AGC/onset stop chewing CPU.
    if (!wasMidiOn && deps.hasAudioCtx() && !deps.state.micSuspended) {
      deps.suspendMic();
    }

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

    port.onmidimessage = deps.onMidiMessageHandler;
    deps.setInputIndicator();
    deps.refreshIntroHint?.();
    deps.micMeter?.classList.remove('visible');
    deps.stopMidiAutoRescan();
    deps.showHitChip?.('good', deps.t('midiConnectedFmt', { v: port.name || 'MIDI' }));
    console.log(
      '[MIDI] connected: ' +
        port.name +
        ' (state=' +
        port.state +
        ' connection=' +
        port.connection +
        ')'
    );
    return true;
  }

  function detach(port: MidiPortRef | BlePortMarker | null): void {
    if (!port || deps.midiInput.port !== port) return;
    if ('onmidimessage' in port) {
      (port as MidiPortRef).onmidimessage = null;
    }
    deps.midiInput.port = null;
    deps.midiInput.enabled = false;
    deps.setInputIndicator();
    console.log('[MIDI] disconnected');

    // v13: Bring the mic back on a deliberate detach so the user can
    // keep playing acoustically without restarting the app.
    if (deps.hasAudioCtx() && deps.state.micSuspended) {
      deps.resumeMic();
    }
    // Restart silent polling so a hot-replug picks up automatically.
    // Handles "browser sees keyboard but app dropped it" — the user
    // doesn't need to know what happened, the next 2.5 s tick
    // reconnects.
    if (deps.state.micPermissionFailed || deps.state.micIntentionallySkipped) {
      deps.startMidiAutoRescan();
    }
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
    const currentPort = deps.midiInput.port;
    const stillThere = ports.find((p) => p === currentPort && p.state === 'connected');
    if (!stillThere) {
      try {
        detach(currentPort);
      } catch {
        /* idempotent — ignore double-detach errors */
      }
      return false;
    }
    // Re-bind unconditionally. Cheap; idempotent on a healthy port;
    // required on a suspended one.
    (currentPort as MidiPortRef).onmidimessage = deps.onMidiMessageHandler;
    return true;
  }

  return { attach, detach, verifyAlive };
}
