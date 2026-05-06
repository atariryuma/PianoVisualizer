// MidiState — tracks held notes, sustain pedal, and the chord-detection
// window. The legacy `midiState` global has its mutations split into pure
// applyMidi*() reducers; visual side effects (particle bursts, ripple
// rendering, flow updates) move OUT and are signaled through events the
// caller dispatches.

import { detectChord } from '../audio/chord';

export interface ActiveNote {
  midi: number;
  velocity: number;
  onTimeMs: number;
  /** Optional synesthesia color the renderer should paint instead of the theme color. */
  synColor: string | null;
}

export interface MidiState {
  /** midiNum → currently-held active note (key down OR pedal-sustained). */
  activeNotes: Map<number, ActiveNote>;
  /** Sustain pedal (CC 64) state. */
  sustainOn: boolean;
  /** Notes whose physical keys are RELEASED but the pedal holds them. */
  sustainedNotes: Set<number>;
  /** Recent note-on events used for chord detection. Pruned to a small window. */
  recentOnsets: Array<{ midi: number; timeMs: number }>;
  /** Last detected chord name (e.g. 'Cmaj7'). Empty string = none yet. */
  lastChordName: string;
  /** Time of the last chord-detection emit (for cooldown). */
  lastChordTimeMs: number;
}

export interface MidiStateOptions {
  /** Window (ms) within which note-ons are grouped as a possible chord. */
  chordWindowMs?: number;
  /** Don't re-emit the same chord more than once per this interval. */
  chordCooldownMs?: number;
  /** Optional synesthesia-color resolver for note-on. Receives the MIDI number,
   *  returns a CSS color string or null (theme color). */
  synColorFor?: (midi: number) => string | null;
}

const DEFAULT_OPTS: Required<Omit<MidiStateOptions, 'synColorFor'>> = {
  chordWindowMs: 80,
  chordCooldownMs: 600,
};

export type MidiEvent =
  | { type: 'noteOn'; note: ActiveNote }
  | { type: 'noteOff'; midi: number; sustainedNow: boolean }
  | { type: 'chordDetected'; name: string; timeMs: number }
  | { type: 'sustainPedal'; on: boolean }
  /** Pedal released — these midis were sustained-only and now drop. */
  | { type: 'sustainReleased'; droppedMidis: number[] };

export function initMidiState(): MidiState {
  return {
    activeNotes: new Map(),
    sustainOn: false,
    sustainedNotes: new Set(),
    recentOnsets: [],
    lastChordName: '',
    lastChordTimeMs: 0,
  };
}

/** Clear all held notes / pedal state, keep the same allocations. */
export function resetMidiState(s: MidiState): MidiState {
  s.activeNotes.clear();
  s.sustainedNotes.clear();
  s.recentOnsets.length = 0;
  s.sustainOn = false;
  s.lastChordName = '';
  s.lastChordTimeMs = 0;
  return s;
}

/**
 * Apply a MIDI note-on. Mutates the state in place and returns the events
 * emitted (always includes a `noteOn`; may also include `chordDetected`).
 */
export function applyMidiNoteOn(
  s: MidiState,
  midi: number,
  velocity: number,
  timeMs: number,
  opts: MidiStateOptions = {}
): MidiEvent[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  const events: MidiEvent[] = [];

  const synColor = opts.synColorFor ? opts.synColorFor(midi) : null;
  const note: ActiveNote = { midi, velocity, onTimeMs: timeMs, synColor };
  s.activeNotes.set(midi, note);
  // If this key was sustained-only (released, pedal-held), it's now actively played again.
  s.sustainedNotes.delete(midi);
  events.push({ type: 'noteOn', note });

  // In-place chord-window prune + push.
  const recents = s.recentOnsets;
  while (recents.length && timeMs - recents[0].timeMs >= o.chordWindowMs) {
    recents.shift();
  }
  recents.push({ midi, timeMs });

  if (recents.length >= 3) {
    const chord = detectChord(recents.map((r) => r.midi));
    if (chord && (chord !== s.lastChordName || timeMs - s.lastChordTimeMs > o.chordCooldownMs)) {
      s.lastChordName = chord;
      s.lastChordTimeMs = timeMs;
      events.push({ type: 'chordDetected', name: chord, timeMs });
    }
  }

  return events;
}

/**
 * Apply a MIDI note-off. If the sustain pedal is held, the note transfers from
 * `activeNotes` to `sustainedNotes` instead of being removed. Always emits a
 * `noteOff` event with `sustainedNow` indicating which path was taken.
 */
export function applyMidiNoteOff(s: MidiState, midi: number): MidiEvent[] {
  const events: MidiEvent[] = [];
  if (s.sustainOn) {
    s.sustainedNotes.add(midi);
    events.push({ type: 'noteOff', midi, sustainedNow: true });
  } else {
    s.activeNotes.delete(midi);
    events.push({ type: 'noteOff', midi, sustainedNow: false });
  }
  return events;
}

/**
 * Apply a MIDI control-change. Currently handles only CC 64 (sustain pedal).
 *
 * Pedal release: notes that were in `sustainedNotes` (released physically but
 * pedal-held) get dropped from `activeNotes` and the renderer can fade them.
 * Returns those midis in a `sustainReleased` event.
 */
export function applyMidiCC(s: MidiState, cc: number, value: number): MidiEvent[] {
  if (cc !== 64) return []; // CC 64 = sustain pedal; future CCs go here.
  const wasOn = s.sustainOn;
  const nowOn = value >= 64;
  // Controllers commonly send the same CC value every frame while the pedal
  // is held — without a transition guard, sustainedListeners would receive a
  // 60Hz event spam saying "still on, still on, still on". Only emit the
  // `sustainPedal` event when the boolean actually flips.
  if (wasOn === nowOn) return [];
  s.sustainOn = nowOn;
  const events: MidiEvent[] = [{ type: 'sustainPedal', on: nowOn }];
  if (wasOn && !nowOn) {
    const droppedMidis: number[] = [];
    s.sustainedNotes.forEach((midi) => {
      droppedMidis.push(midi);
      s.activeNotes.delete(midi);
    });
    s.sustainedNotes.clear();
    if (droppedMidis.length > 0) events.push({ type: 'sustainReleased', droppedMidis });
  }
  return events;
}

/**
 * Convenience: parse a raw 3-byte MIDI message and dispatch to the right
 * applyMidi* function. Returns the events emitted.
 *
 * Returns [] for unhandled status bytes (program change, sysex, etc.).
 */
export function dispatchMidiBytes(
  s: MidiState,
  status: number,
  data1: number,
  data2: number,
  timeMs: number,
  opts: MidiStateOptions = {}
): MidiEvent[] {
  const cmd = status & 0xf0;
  if (cmd === 0x90 && data2 > 0) {
    return applyMidiNoteOn(s, data1, data2, timeMs, opts);
  }
  if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) {
    return applyMidiNoteOff(s, data1);
  }
  if (cmd === 0xb0) {
    return applyMidiCC(s, data1, data2);
  }
  return [];
}
