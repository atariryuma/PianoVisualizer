import { describe, it, expect, beforeEach } from 'vitest';
import {
  initMidiState,
  resetMidiState,
  applyMidiNoteOn,
  applyMidiNoteOff,
  applyMidiCC,
  dispatchMidiBytes,
  type MidiState,
  type MidiEvent,
} from '../src/state/midi-state';

let s: MidiState;
beforeEach(() => {
  s = initMidiState();
});

describe('initMidiState', () => {
  it('starts with empty collections', () => {
    expect(s.activeNotes.size).toBe(0);
    expect(s.sustainedNotes.size).toBe(0);
    expect(s.recentOnsets).toEqual([]);
    expect(s.sustainOn).toBe(false);
    expect(s.lastChordName).toBe('');
  });
});

describe('applyMidiNoteOn', () => {
  it('adds note to activeNotes and emits noteOn', () => {
    const events = applyMidiNoteOn(s, 60, 100, 1000);
    expect(s.activeNotes.has(60)).toBe(true);
    expect(s.activeNotes.get(60)?.velocity).toBe(100);
    expect(s.activeNotes.get(60)?.onTimeMs).toBe(1000);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('noteOn');
  });

  it('clears the note from sustainedNotes (re-attack while pedal-held)', () => {
    s.sustainedNotes.add(60);
    applyMidiNoteOn(s, 60, 80, 100);
    expect(s.sustainedNotes.has(60)).toBe(false);
    expect(s.activeNotes.has(60)).toBe(true);
  });

  it('uses synColorFor when provided', () => {
    const events = applyMidiNoteOn(s, 60, 100, 1000, {
      synColorFor: (m) => (m === 60 ? '#ff0000' : null),
    });
    expect((events[0] as Extract<MidiEvent, { type: 'noteOn' }>).note.synColor).toBe('#ff0000');
  });

  it('uses null synColor when no resolver', () => {
    const events = applyMidiNoteOn(s, 60, 100, 1000);
    expect((events[0] as Extract<MidiEvent, { type: 'noteOn' }>).note.synColor).toBeNull();
  });

  it('prunes recentOnsets older than chordWindowMs', () => {
    applyMidiNoteOn(s, 60, 100, 0);
    applyMidiNoteOn(s, 64, 100, 50);
    // Now jump 200ms ahead — older entries (>80ms) should be pruned.
    applyMidiNoteOn(s, 67, 100, 200);
    expect(s.recentOnsets.length).toBe(1);
    expect(s.recentOnsets[0].midi).toBe(67);
  });

  it('emits chordDetected when 3+ notes within chord window form a triad', () => {
    const e1 = applyMidiNoteOn(s, 60, 100, 0);
    const e2 = applyMidiNoteOn(s, 64, 100, 20);
    const e3 = applyMidiNoteOn(s, 67, 100, 40);
    expect(e1.find((e) => e.type === 'chordDetected')).toBeUndefined();
    expect(e2.find((e) => e.type === 'chordDetected')).toBeUndefined();
    const chord = e3.find((e) => e.type === 'chordDetected') as
      | Extract<MidiEvent, { type: 'chordDetected' }>
      | undefined;
    expect(chord).toBeDefined();
    expect(chord!.name).toBe('C');
    expect(s.lastChordName).toBe('C');
  });

  it('does not re-emit the same chord within chordCooldownMs', () => {
    applyMidiNoteOn(s, 60, 100, 0);
    applyMidiNoteOn(s, 64, 100, 20);
    applyMidiNoteOn(s, 67, 100, 40); // C detected
    // Same chord again within 600ms — no new chord event.
    const events = applyMidiNoteOn(s, 67, 100, 60);
    expect(events.find((e) => e.type === 'chordDetected')).toBeUndefined();
  });

  it('re-emits the same chord after cooldown expires', () => {
    applyMidiNoteOn(s, 60, 100, 0);
    applyMidiNoteOn(s, 64, 100, 20);
    applyMidiNoteOn(s, 67, 100, 40);
    // 700ms later, replay the chord — should re-emit.
    applyMidiNoteOn(s, 60, 100, 740);
    applyMidiNoteOn(s, 64, 100, 760);
    const events = applyMidiNoteOn(s, 67, 100, 780);
    expect(events.find((e) => e.type === 'chordDetected')).toBeDefined();
  });
});

describe('applyMidiNoteOff', () => {
  it('removes note from activeNotes when sustain is OFF', () => {
    applyMidiNoteOn(s, 60, 100, 0);
    const events = applyMidiNoteOff(s, 60);
    expect(s.activeNotes.has(60)).toBe(false);
    expect(s.sustainedNotes.has(60)).toBe(false);
    expect(events[0]).toEqual({ type: 'noteOff', midi: 60, sustainedNow: false });
  });

  it('moves note to sustainedNotes (kept active) when sustain is ON', () => {
    s.sustainOn = true;
    applyMidiNoteOn(s, 60, 100, 0);
    const events = applyMidiNoteOff(s, 60);
    expect(s.activeNotes.has(60)).toBe(true); // still rendered as held
    expect(s.sustainedNotes.has(60)).toBe(true);
    expect(events[0]).toEqual({ type: 'noteOff', midi: 60, sustainedNow: true });
  });
});

describe('applyMidiCC — sustain pedal (CC 64)', () => {
  it('sets sustainOn when value >= 64', () => {
    const events = applyMidiCC(s, 64, 80);
    expect(s.sustainOn).toBe(true);
    expect(events).toEqual([{ type: 'sustainPedal', on: true }]);
  });

  it('clears sustainOn when value < 64', () => {
    s.sustainOn = true;
    const events = applyMidiCC(s, 64, 30);
    expect(s.sustainOn).toBe(false);
    expect(events[0]).toEqual({ type: 'sustainPedal', on: false });
  });

  it('drops sustained notes from activeNotes on pedal release', () => {
    // 1) Press 60 + 64, pedal-down, release both keys.
    s.sustainOn = true;
    applyMidiNoteOn(s, 60, 100, 0);
    applyMidiNoteOn(s, 64, 100, 0);
    applyMidiNoteOff(s, 60);
    applyMidiNoteOff(s, 64);
    expect(s.activeNotes.size).toBe(2); // pedal still holding both
    expect(s.sustainedNotes.size).toBe(2);
    // 2) Pedal release.
    const events = applyMidiCC(s, 64, 0);
    expect(s.activeNotes.size).toBe(0);
    expect(s.sustainedNotes.size).toBe(0);
    const released = events.find((e) => e.type === 'sustainReleased') as Extract<
      MidiEvent,
      { type: 'sustainReleased' }
    >;
    expect(released.droppedMidis).toHaveLength(2);
    expect(released.droppedMidis.sort()).toEqual([60, 64]);
  });

  it('ignores non-sustain CCs', () => {
    const events = applyMidiCC(s, 7, 100); // CC 7 = volume
    expect(events).toEqual([]);
    expect(s.sustainOn).toBe(false);
  });
});

describe('resetMidiState', () => {
  it('clears all collections but keeps allocations', () => {
    applyMidiNoteOn(s, 60, 100, 0);
    s.sustainOn = true;
    s.sustainedNotes.add(60);
    const activeRef = s.activeNotes;
    const sustainedRef = s.sustainedNotes;
    const recentsRef = s.recentOnsets;
    resetMidiState(s);
    expect(s.activeNotes).toBe(activeRef);
    expect(s.sustainedNotes).toBe(sustainedRef);
    expect(s.recentOnsets).toBe(recentsRef);
    expect(s.activeNotes.size).toBe(0);
    expect(s.sustainedNotes.size).toBe(0);
    expect(s.recentOnsets).toHaveLength(0);
    expect(s.sustainOn).toBe(false);
    expect(s.lastChordName).toBe('');
  });
});

describe('dispatchMidiBytes', () => {
  it('routes 0x90 + velocity > 0 to noteOn', () => {
    const events = dispatchMidiBytes(s, 0x90, 60, 100, 1000);
    expect(events[0].type).toBe('noteOn');
    expect(s.activeNotes.has(60)).toBe(true);
  });

  it('routes 0x90 + velocity = 0 to noteOff (running-status convention)', () => {
    applyMidiNoteOn(s, 60, 100, 0);
    const events = dispatchMidiBytes(s, 0x90, 60, 0, 200);
    expect(events[0]).toEqual({ type: 'noteOff', midi: 60, sustainedNow: false });
  });

  it('routes 0x80 to noteOff', () => {
    applyMidiNoteOn(s, 60, 100, 0);
    const events = dispatchMidiBytes(s, 0x80, 60, 64, 200);
    expect(events[0]).toEqual({ type: 'noteOff', midi: 60, sustainedNow: false });
  });

  it('routes 0xB0 to CC', () => {
    const events = dispatchMidiBytes(s, 0xb0, 64, 80, 100);
    expect(events[0]).toEqual({ type: 'sustainPedal', on: true });
  });

  it('returns [] for unhandled status', () => {
    expect(dispatchMidiBytes(s, 0xc0, 0, 0, 0)).toEqual([]); // program change
    expect(dispatchMidiBytes(s, 0xf0, 0, 0, 0)).toEqual([]); // sysex
  });
});
