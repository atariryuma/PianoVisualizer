// BLE-MIDI Web Bluetooth connect/disconnect — Phase 0d batch 27.
//
// Why this exists separately from Web MIDI: Android Chrome's Web
// MIDI exposes USB devices only — Bluetooth keyboards never appear
// there. Web Bluetooth IS available on Android Chrome though, so we
// connect over BLE-MIDI directly using the standard service UUID
// (https://www.midi.org/specifications/midi-transports-specifications/
// bluetooth-le-midi-1-0). Same path also helps desktop Chrome users
// whose BLE-MIDI device isn't surfaced via Web MIDI.
//
// One factory:
//   - createBleMidiConnect(deps).connect() — the user-triggered
//     connect path. Pops the requestDevice() picker, walks GATT
//     server → service → characteristic → startNotifications, wires
//     the byte stream to the BLE packet parser, flips midiInput +
//     suspends mic, and registers a one-shot gattserverdisconnected
//     handler for clean teardown.
//
// State (`bleMidi.{device, characteristic, connected, _disconnectHandler}`)
// is held by the shell — passed in via deps so the visibility-resume
// path in midi-ports.ts (verifyAlive) can read `bleMidi.connected`
// without going through this module.
//
// All side-effects (alert, suspendMic/resumeMic, setInputIndicator,
// showHitChip, refreshIntroHint, hiding the mic meter) flow through
// the deps bag — zero shell-global reads inside the module.

import type { MidiPortsInputRef } from './midi-ports';

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHAR = '7772e5db-3868-4112-a1a9-f2669d106bf3';

/** GATT characteristic surface we touch — narrow to keep the deps
 *  bag testable without lib.dom's full Web Bluetooth shape. */
export interface BleCharacteristic {
  startNotifications(): Promise<unknown>;
  addEventListener(type: 'characteristicvaluechanged', listener: (e: Event) => void): void;
}

export interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>;
}

export interface BleGattServer {
  connected: boolean;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BleService>;
}

export interface BleDevice {
  name: string | null;
  gatt?: BleGattServer & { connect(): Promise<BleGattServer> };
  addEventListener(event: 'gattserverdisconnected', handler: () => void): void;
  removeEventListener(event: 'gattserverdisconnected', handler: () => void): void;
}

/** Mutable BLE state shared with verifyMidiAlive (midi-ports.ts).
 *  Lives in the shell; the connect factory mutates the fields here
 *  rather than holding its own reference. */
export interface BleMidiState {
  device: BleDevice | null;
  characteristic: BleCharacteristic | null;
  connected: boolean;
  _disconnectHandler?: (() => void) | null;
}

/** Subset of `navigator.bluetooth` we touch. */
export interface BleMidiNavigator {
  bluetooth?: {
    requestDevice(opts: {
      filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
      optionalServices?: string[];
    }): Promise<BleDevice>;
  };
}

export interface BleMidiConnectDeps {
  bleMidi: BleMidiState;
  midiInput: MidiPortsInputRef;

  /** Audio context guards — same shape as midi-ports.ts.
   *  `state.micSuspended` is read-only here; the production audio
   *  shell flips it via suspendMic / resumeMic, not via this
   *  module's deps. */
  hasAudioCtx: () => boolean;
  state: { readonly micSuspended: boolean };
  suspendMic: () => void;
  resumeMic: () => void;

  /** "Connect" hooks — same surface as midi-ports.ts attach uses, so
   *  the BLE connect path looks indistinguishable to the rest of
   *  the app. */
  setInputIndicator: () => void;
  refreshIntroHint?: () => void;
  showHitChip?: (kind: string, msg: string) => void;
  micMeter?: HTMLElement | null;

  /** BLE packet decoder — pass `parseBleMidiPacket(buf, dispatch)`
   *  bound to your shell's dispatch entry. The connect factory
   *  hands each characteristic-value-changed Event's
   *  `.value.buffer` straight to this. */
  parsePacket: (buf: ArrayBuffer) => void;

  /** Web MIDI auto-rescan poller — kicked on GATT disconnect so a
   *  USB MIDI keyboard plugged in after the BLE drop auto-attaches.
   *  Stops itself once anything re-attaches. */
  startMidiAutoRescan: () => void;

  /** Bilingual translator. Reads three keys: alertWebBluetoothUnsupported,
   *  alertBleConnectFailedFmt, midiConnectedFmt. */
  t: (key: string, vars?: Record<string, string>) => string;

  /** Native confirm/error popup. Defaults to `alert` in the shell;
   *  tests inject a spy. */
  alert: (msg: string) => void;

  /** Web Bluetooth surface — pass `navigator` directly in production
   *  or a mock in tests. */
  navigator: BleMidiNavigator;
}

export interface BleMidiConnect {
  /** User-triggered connect. Resolves silently on success, on user-
   *  cancel (NotFoundError), or on alerted failure. Never throws. */
  connect(): Promise<void>;
}

export function createBleMidiConnect(deps: BleMidiConnectDeps): BleMidiConnect {
  async function connect(): Promise<void> {
    if (!deps.navigator.bluetooth) {
      deps.alert(deps.t('alertWebBluetoothUnsupported'));
      return;
    }
    if (deps.bleMidi.connected) return;

    let device: BleDevice | null = null;
    try {
      device = await deps.navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_MIDI_SERVICE] }],
        optionalServices: [BLE_MIDI_SERVICE],
      });
      if (!device.gatt) throw new Error('BLE device exposes no GATT server');

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
      const ch = await service.getCharacteristic(BLE_MIDI_CHAR);
      await ch.startNotifications();

      ch.addEventListener('characteristicvaluechanged', (e) => {
        // The double-cast through `unknown` is needed because TS
        // doesn't think EventTarget overlaps with the
        // BluetoothCharacteristic shape — they're nominally distinct
        // interfaces. DataView.buffer is `ArrayBufferLike` (covers
        // SharedArrayBuffer); BLE packets always come from a real
        // ArrayBuffer (the GATT stack doesn't ship shared memory).
        // Safe to narrow.
        const target = e.target as unknown as { value: DataView };
        deps.parsePacket(target.value.buffer as ArrayBuffer);
      });

      deps.bleMidi.device = device;
      deps.bleMidi.characteristic = ch;
      deps.bleMidi.connected = true;

      deps.midiInput.enabled = true;
      deps.midiInput.port = { name: device.name || 'BLE-MIDI' };
      // Sentinel 0 so it matches the Web MIDI attach path
      // (midi-ports.ts attach also writes 0). Nothing now reads
      // `lastEventTime` as a gating value — mic-pipeline and
      // game-state-update both moved to `enabled`-only checks —
      // but keeping it consistent simplifies future debug log
      // interpretation.
      deps.midiInput.lastEventTime = 0;
      if (deps.hasAudioCtx() && !deps.state.micSuspended) {
        deps.suspendMic();
      }
      deps.setInputIndicator();
      deps.refreshIntroHint?.();
      deps.micMeter?.classList.remove('visible');
      deps.showHitChip?.('good', deps.t('midiConnectedFmt', { v: device.name || 'BLE-MIDI' }));
      console.log('[BLE-MIDI] connected: ' + (device.name || 'unknown'));

      // Track the disconnect handler so reconnect attempts don't
      // stack multiple listeners on the same device instance.
      const onGattDisconnect = (): void => {
        deps.bleMidi.connected = false;
        deps.bleMidi.characteristic = null;
        deps.midiInput.enabled = false;
        deps.midiInput.port = null;
        deps.setInputIndicator();
        if (deps.hasAudioCtx() && deps.state.micSuspended) {
          deps.resumeMic();
        }
        if (deps.bleMidi._disconnectHandler && deps.bleMidi.device) {
          try {
            deps.bleMidi.device.removeEventListener(
              'gattserverdisconnected',
              deps.bleMidi._disconnectHandler
            );
          } catch {
            /* best-effort cleanup */
          }
        }
        deps.bleMidi._disconnectHandler = null;
        console.log('[BLE-MIDI] disconnected');
        // Restart Web MIDI auto-rescan so a fallback USB keyboard
        // (or a Web MIDI Browser BLE pair re-established outside this
        // page) auto-attaches without the user touching the settings.
        deps.startMidiAutoRescan();
      };
      deps.bleMidi._disconnectHandler = onGattDisconnect;
      device.addEventListener('gattserverdisconnected', onGattDisconnect);
    } catch (e) {
      const err = e as Error;
      // Cleanup on partial-failure path: if gatt.connect() succeeded
      // but a later step (getPrimaryService, getCharacteristic,
      // startNotifications) threw, the GATT connection is held open
      // forever otherwise.
      if (device && device.gatt && device.gatt.connected) {
        try {
          device.gatt.disconnect();
        } catch {
          /* ignore */
        }
      }
      console.warn('[BLE-MIDI] connect failed:', err.message);
      if (err.name !== 'NotFoundError') {
        deps.alert(deps.t('alertBleConnectFailedFmt', { v: err.message }));
      }
    }
  }

  return { connect };
}
