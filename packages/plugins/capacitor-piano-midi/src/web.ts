// Web fallback — when this plugin is included in a non-Capacitor build (or in
// the Capacitor web preview), defer to the standard Web MIDI API.
//
// On iOS Safari, Web MIDI doesn't exist → start() rejects, the engine falls
// back to mic input. On desktop / Android Chrome / Steam Deck this gives full
// USB MIDI without any native code.

import { WebPlugin } from '@capacitor/core';
import type { PianoMidiPlugin, MidiPort, MidiMessageEvent } from './definitions';

export class PianoMidiWeb extends WebPlugin implements PianoMidiPlugin {
  private access: MIDIAccess | null = null;

  async start(): Promise<void> {
    if (!('requestMIDIAccess' in navigator)) {
      throw this.unavailable('Web MIDI API not supported in this browser');
    }
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = (e: any) => {
      if (e.port.type !== 'input') return;
      const port = this.normalize(e.port);
      this.notifyListeners('portChange', port);
    };
    this.access.inputs.forEach((input: any) => this.attach(input));
  }

  private attach(input: any): void {
    input.onmidimessage = (e: any) => {
      const ev: MidiMessageEvent = {
        portId: input.id,
        data: Array.from(e.data),
        timestamp: e.timeStamp,
      };
      this.notifyListeners('midiMessage', ev);
    };
  }

  private normalize(p: any): MidiPort {
    return {
      id: p.id,
      name: p.name || 'unnamed',
      manufacturer: p.manufacturer,
      state: p.state,
      connection: p.connection,
    };
  }

  async stop(): Promise<void> {
    if (this.access) {
      this.access.onstatechange = null;
      this.access.inputs.forEach((p: any) => {
        p.onmidimessage = null;
      });
      this.access = null;
    }
  }

  async listInputs(): Promise<MidiPort[]> {
    if (!this.access) return [];
    const out: MidiPort[] = [];
    this.access.inputs.forEach((p: any) => out.push(this.normalize(p)));
    return out;
  }

  async openPort(_options: { id: string }): Promise<void> {
    /* Web MIDI auto-opens */
  }
  async closePort(_options: { id: string }): Promise<void> {
    /* no-op on web */
  }

  async scanBle(): Promise<{ devices: Array<{ id: string; name: string }> }> {
    // Web fallback uses Web Bluetooth instead — this is invoked by the mobile
    // shell, never by the web shell. Web shell uses its own bleMidi flow.
    throw this.unavailable('BLE MIDI scan via plugin is native-only; use Web Bluetooth on web.');
  }

  async connectBle(_options: { id: string }): Promise<MidiPort> {
    throw this.unavailable('BLE MIDI connect via plugin is native-only.');
  }
}
