// Native MIDI adapter — wraps the capacitor-piano-midi plugin into the
// MidiInputAdapter contract so the engine doesn't know whether MIDI is
// arriving via Web MIDI (browser) or CoreMIDI/android.media.midi (native).
//
// The plugin exposes a 1:1 mapping over MIDIAccess / MIDIInput / MIDIMessageEvent
// using the same JS shape as the W3C Web MIDI spec, so the bulk of the bridging
// is just installing the polyfill and then using the same WebMidiAdapter.

import type {
  MidiInputAdapter,
  MidiPort,
  MidiPortListener,
  MidiMessageListener,
  MidiMessage,
} from '@piano/core';
import { PianoMidi } from 'capacitor-piano-midi';

export class NativeMidiAdapter implements MidiInputAdapter {
  private started = false;
  private portListeners: MidiPortListener[] = [];
  private msgListeners: MidiMessageListener[] = [];
  private removeMsgListener: (() => void) | null = null;
  private removePortListener: (() => void) | null = null;
  private knownPorts: Map<string, MidiPort> = new Map();

  isSupported(): boolean {
    return true; // Plugin is bundled; if the device doesn't have MIDI hardware, listPorts() just returns [].
  }

  async start(): Promise<void> {
    if (this.started) return;
    await PianoMidi.start();
    this.started = true;
    // Refresh port list and announce.
    const ports = await PianoMidi.listInputs();
    for (const p of ports) {
      this.knownPorts.set(p.id, p);
      this.portListeners.forEach((l) => l(p));
    }
    // Subscribe to live updates.
    const portSub = await PianoMidi.addListener('portChange', (p: MidiPort) => {
      this.knownPorts.set(p.id, p);
      this.portListeners.forEach((l) => l(p));
    });
    this.removePortListener = () => portSub.remove();
    const msgSub = await PianoMidi.addListener(
      'midiMessage',
      (e: { portId: string; data: number[]; timestamp: number }) => {
        const port = this.knownPorts.get(e.portId);
        if (!port) return;
        const msg: MidiMessage = {
          status: e.data[0],
          data1: e.data.length > 1 ? e.data[1] : 0,
          data2: e.data.length > 2 ? e.data[2] : 0,
          timestamp: e.timestamp,
        };
        this.msgListeners.forEach((l) => l(port, msg));
      }
    );
    this.removeMsgListener = () => msgSub.remove();
  }

  listPorts(): MidiPort[] {
    return Array.from(this.knownPorts.values());
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
    this.removePortListener?.();
    this.removeMsgListener?.();
    if (this.started) await PianoMidi.stop();
    this.started = false;
  }
}

export async function startNativeMidiAdapter(): Promise<NativeMidiAdapter | null> {
  const a = new NativeMidiAdapter();
  await a.start();
  return a;
}
