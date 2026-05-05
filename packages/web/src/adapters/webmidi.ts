// Web MIDI API adapter. Implements the @piano/core MidiInputAdapter contract
// using the browser's navigator.requestMIDIAccess.
//
// iOS Safari does NOT implement Web MIDI (WebKit Bug 107250, no roadmap).
// On iOS, the mobile shell substitutes a Capacitor plugin (CoreMIDI bridge);
// the web shell falls back to mic-only.
//
// Phase 0b placeholder.

import type {
  MidiInputAdapter,
  MidiPort,
  MidiPortListener,
  MidiMessageListener,
  MidiMessage,
} from '@piano/core';

export class WebMidiAdapter implements MidiInputAdapter {
  private access: MIDIAccess | null = null;
  private portListeners: MidiPortListener[] = [];
  private msgListeners: MidiMessageListener[] = [];

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async start(): Promise<void> {
    if (!this.isSupported()) throw new Error('Web MIDI not available');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = (e: any) => {
      if (e.port.type !== 'input') return;
      const port = this.normalize(e.port);
      this.portListeners.forEach((l) => l(port));
    };
    // Wire onmidimessage on every existing input.
    this.access.inputs.forEach((p: any) => this.attach(p));
  }

  private attach(input: any): void {
    input.onmidimessage = (e: any) => {
      const port = this.normalize(input);
      const msg: MidiMessage = {
        status: e.data[0],
        data1: e.data.length > 1 ? e.data[1] : 0,
        data2: e.data.length > 2 ? e.data[2] : 0,
        timestamp: e.timeStamp,
      };
      this.msgListeners.forEach((l) => l(port, msg));
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

  listPorts(): MidiPort[] {
    if (!this.access) return [];
    const out: MidiPort[] = [];
    this.access.inputs.forEach((p: any) => out.push(this.normalize(p)));
    return out;
  }

  onPortChange(listener: MidiPortListener): () => void {
    this.portListeners.push(listener);
    return () => {
      this.portListeners = this.portListeners.filter((l) => l !== listener);
    };
  }

  onMessage(listener: MidiMessageListener): () => void {
    this.msgListeners.push(listener);
    return () => {
      this.msgListeners = this.msgListeners.filter((l) => l !== listener);
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
}

export async function startWebMidiAdapter(): Promise<WebMidiAdapter | null> {
  const a = new WebMidiAdapter();
  if (!a.isSupported()) return null;
  await a.start();
  return a;
}
