// Public TypeScript surface of the capacitor-piano-midi plugin.
//
// This mirrors the W3C Web MIDI API where useful (so a polyfill can swap them
// 1:1) but exposes only what the engine needs — no SysEx, no MIDIOutput.

import type { PluginListenerHandle } from '@capacitor/core';

export interface MidiPort {
  /** Stable identifier; survives reconnect within a session. */
  id: string;
  /** Human-readable port name (e.g. "Roland GO:PIANO88"). */
  name: string;
  manufacturer?: string;
  state: 'connected' | 'disconnected';
  connection: 'open' | 'closed' | 'pending';
}

export interface MidiMessageEvent {
  /** Source port id. */
  portId: string;
  /** Raw MIDI bytes (1–3). For most use it's status + 2 data bytes. */
  data: number[];
  /** High-resolution timestamp from the native source, in milliseconds. */
  timestamp: number;
}

export interface PortChangeEvent extends MidiPort {}

export interface PianoMidiPlugin {
  /** Begin enumerating MIDI ports + listening for connect/disconnect events.
   *  Resolves once initial enumeration has completed. */
  start(): Promise<void>;

  /** Stop and release native resources. */
  stop(): Promise<void>;

  /** Snapshot of currently-connected MIDI input ports. */
  listInputs(): Promise<MidiPort[]>;

  /** Open a specific port. Idempotent. iOS opens ports lazily on first use,
   *  Android requires explicit open. The plugin auto-opens all ports on start();
   *  call this only if you closed one earlier. */
  openPort(options: { id: string }): Promise<void>;

  /** Close a port; you'll stop receiving its messages. */
  closePort(options: { id: string }): Promise<void>;

  /** Start a BLE-MIDI scan. iOS uses CoreBluetooth; Android uses BluetoothAdapter.
   *  Resolves to a list of discovered peripherals; the user picks one in the UI
   *  and calls connectBle(). Pure-USB setups don't need to call this. */
  scanBle(options?: {
    timeoutMs?: number;
  }): Promise<{ devices: Array<{ id: string; name: string }> }>;

  /** Pair + open a BLE-MIDI peripheral discovered via scanBle(). */
  connectBle(options: { id: string }): Promise<MidiPort>;

  /** Subscribe to MIDI message events from any open input. */
  addListener(
    eventName: 'midiMessage',
    listener: (event: MidiMessageEvent) => void
  ): Promise<PluginListenerHandle>;

  /** Subscribe to port plug/unplug events. */
  addListener(
    eventName: 'portChange',
    listener: (event: PortChangeEvent) => void
  ): Promise<PluginListenerHandle>;

  /** Drop all event subscriptions. */
  removeAllListeners(): Promise<void>;
}
