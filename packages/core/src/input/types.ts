// Single contract every MIDI source must satisfy. The web shell wires in a
// Web MIDI API + Web Bluetooth implementation; the mobile shell wires in a
// Capacitor plugin (CoreMIDI on iOS, android.media.midi on Android).
//
// Keeping this interface small + stable is the whole point of the core/web/mobile
// split — a future MIDI input source (e.g. RTPMIDI over WebSocket) plugs in
// without touching game logic.

export interface MidiPort {
  /** Stable identifier; survives reconnect. */
  readonly id: string;
  /** Human-readable name shown in UI. */
  readonly name: string;
  readonly manufacturer?: string;
  readonly state: 'connected' | 'disconnected';
  readonly connection: 'open' | 'closed' | 'pending';
}

/** Raw 3-byte MIDI 1.0 message. SysEx is intentionally out of scope (rare in
 *  pedagogy, large surface). Status byte includes channel for note-on/off/CC. */
export interface MidiMessage {
  status: number; // 0x80..0xEF (channel-prefixed) or 0xF0..0xFF (system)
  data1: number; // 0..127
  data2: number; // 0..127
  /** Optional millisecond timestamp from the input source (Web MIDI provides this).
   *  Adapters that don't have timestamps should leave undefined; consumers fall back to performance.now(). */
  timestamp?: number;
}

export type MidiPortListener = (port: MidiPort) => void;
export type MidiMessageListener = (port: MidiPort, msg: MidiMessage) => void;

/** Implemented by web shell (Web MIDI API + Web Bluetooth) and mobile shell
 *  (CoreMIDI / android.media.midi via Capacitor plugin). The shell wires this
 *  to the game state at startup; everything downstream is platform-agnostic. */
export interface MidiInputAdapter {
  /** Returns true if the platform supports MIDI input at all (false on iOS
   *  Safari without polyfill). */
  isSupported(): boolean;
  /** Begin requesting access. Promise resolves once the user has granted
   *  permission and at least one port enumeration has completed. Reject on
   *  permission denial or platform missing. */
  start(): Promise<void>;
  /** Snapshot of currently-known input ports. */
  listPorts(): MidiPort[];
  /** Subscribe to port plug/unplug events. Returns an unsubscribe fn. */
  onPortChange(listener: MidiPortListener): () => void;
  /** Subscribe to incoming MIDI messages from any open input port. */
  onMessage(listener: MidiMessageListener): () => void;
  /** Stop the adapter and release resources. */
  stop(): Promise<void>;
}
