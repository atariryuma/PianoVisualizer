// Input source resolution — the split that made a MIDI↔mic switch possible.
//
// The behaviour under test is not "a helper returns a string": it is that
// "a keyboard is connected" and "we are listening to the keyboard" are now two
// separate facts. Every case below is one a player can actually get into, and
// several of them were UNREACHABLE before the split (there was no way to keep
// the mic while a keyboard was plugged in).

import { describe, it, expect } from 'vitest';
import {
  INPUT_SOURCE_PREFS,
  isInputSourcePref,
  resolveInputSource,
  describeInputSource,
} from '../src/state/input-source';

describe('resolveInputSource', () => {
  it('auto follows the hardware', () => {
    // The common case needs no configuration: connect a keyboard and it is
    // used, unplug it and the mic takes over.
    expect(resolveInputSource('auto', true)).toBe('midi');
    expect(resolveInputSource('auto', false)).toBe('mic');
  });

  it('an explicit choice overrides the hardware in BOTH directions', () => {
    // Pinning the mic with a keyboard attached is the case the app could not
    // express at all before — the whole point of the setting.
    expect(resolveInputSource('mic', true)).toBe('mic');
    expect(resolveInputSource('midi', false)).toBe('midi');
  });

  it('pinned midi does NOT silently fall back to the mic', () => {
    // A fallback here would flip the input mid-session while a keyboard boots,
    // re-pairs, or briefly drops — and because the judgement windows differ per
    // input path, that would silently change the difficulty and start scoring
    // room noise. "Listen to my keyboard" has to keep meaning that.
    expect(resolveInputSource('midi', false)).toBe('midi');
    expect(resolveInputSource('midi', false)).not.toBe('mic');
  });

  it('accepts exactly the three prefs it advertises', () => {
    for (const p of INPUT_SOURCE_PREFS) expect(isInputSourcePref(p)).toBe(true);
    for (const bad of ['keyboard', 'MIDI', '', null, undefined, 0, {}]) {
      expect(isInputSourcePref(bad)).toBe(false);
    }
  });
});

describe('describeInputSource', () => {
  it('keyboard live: nothing waiting, nothing idle', () => {
    const s = describeInputSource('auto', true, true);
    expect(s).toMatchObject({ active: 'midi', waiting: false, midiIdle: false });
  });

  it('mic live with no keyboard: nothing waiting, nothing idle', () => {
    const s = describeInputSource('auto', false, true);
    expect(s).toMatchObject({ active: 'mic', waiting: false, midiIdle: false });
  });

  it('flags a connected-but-ignored keyboard', () => {
    // This is the one state a player is guaranteed to read as a bug unless the
    // UI says it out loud: the keyboard is plugged in and the app is
    // deliberately not listening to it.
    const s = describeInputSource('mic', true, true);
    expect(s.active).toBe('mic');
    expect(s.midiIdle).toBe(true);
    expect(s.waiting).toBe(false);
  });

  it('flags waiting when pinned to a keyboard that is not there', () => {
    // Distinct from "no input available" — nothing is broken, so the UI must
    // say "waiting for a keyboard" rather than showing a mic hint or an error.
    const s = describeInputSource('midi', false, true);
    expect(s).toMatchObject({ active: 'midi', waiting: true, midiIdle: false });
  });

  it('flags waiting when the mic is the source but unusable', () => {
    // Permission denied / deliberately skipped: the active source cannot
    // produce input, which is the same class of state as a missing keyboard.
    const s = describeInputSource('mic', false, false);
    expect(s).toMatchObject({ active: 'mic', waiting: true });
  });

  it('a usable mic is not "waiting" just because no keyboard is attached', () => {
    expect(describeInputSource('mic', false, true).waiting).toBe(false);
  });

  it('echoes the pref back so a UI can render the selection', () => {
    expect(describeInputSource('mic', true, true).pref).toBe('mic');
    expect(describeInputSource('auto', true, true).pref).toBe('auto');
  });
});
