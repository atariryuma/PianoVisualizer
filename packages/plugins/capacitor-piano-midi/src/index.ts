import { registerPlugin } from '@capacitor/core';
import type { PianoMidiPlugin } from './definitions';

const PianoMidi = registerPlugin<PianoMidiPlugin>('PianoMidi', {
  web: () => import('./web').then((m) => new m.PianoMidiWeb()),
});

export * from './definitions';
export { PianoMidi };
