import { describe, it, expect, vi } from 'vitest';
import {
  applyOnsetToWindow,
  initChordWindowState,
  resetChordWindowState,
  type ChordWindowOptions,
  type ChordWindowState,
} from '../src/audio/chord-window';

// Tiny stub detector: a triad pattern (any 3 notes a major-third + perfect-
// fifth apart) becomes 'Cmaj' for testing; everything else returns null.
// Real chord detection lives in audio/chord.ts and has its own tests.
const STUB_DETECT = (midis: readonly number[]): string | null => {
  if (midis.length < 3) return null;
  const sorted = [...midis].sort((a, b) => a - b);
  const intervals = [sorted[1] - sorted[0], sorted[2] - sorted[0]];
  if (intervals[0] === 4 && intervals[1] === 7) return 'Cmaj';
  if (intervals[0] === 3 && intervals[1] === 7) return 'Cmin';
  return null;
};

const OPTS = (over: Partial<ChordWindowOptions> = {}): ChordWindowOptions => ({
  windowMs: 80,
  minNotes: 3,
  repeatCooldownMs: 600,
  detectChord: STUB_DETECT,
  ...over,
});

describe('initChordWindowState / resetChordWindowState', () => {
  it('initial state has empty deque and no prior chord', () => {
    const s = initChordWindowState();
    expect(s.recentOnsets).toEqual([]);
    expect(s.lastChordName).toBe('');
    expect(s.lastChordTimeMs).toBe(0);
  });

  it('reset returns a populated state to initial', () => {
    const s: ChordWindowState = {
      recentOnsets: [{ midi: 60, timeMs: 100 }],
      lastChordName: 'Cmaj',
      lastChordTimeMs: 100,
    };
    resetChordWindowState(s);
    expect(s.recentOnsets).toEqual([]);
    expect(s.lastChordName).toBe('');
    expect(s.lastChordTimeMs).toBe(0);
  });

  it('reset preserves the recentOnsets array reference', () => {
    const s = initChordWindowState();
    const ref = s.recentOnsets;
    s.recentOnsets.push({ midi: 60, timeMs: 100 });
    resetChordWindowState(s);
    expect(s.recentOnsets).toBe(ref);
  });
});

describe('applyOnsetToWindow — below minNotes threshold', () => {
  it('emits nothing for a single onset', () => {
    const s = initChordWindowState();
    const r = applyOnsetToWindow(s, 60, 100, OPTS());
    expect(r.emitted).toBeNull();
    expect(s.recentOnsets).toHaveLength(1);
  });

  it('emits nothing for two simultaneous onsets', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS());
    const r = applyOnsetToWindow(s, 64, 110, OPTS());
    expect(r.emitted).toBeNull();
    expect(s.recentOnsets).toHaveLength(2);
  });
});

describe('applyOnsetToWindow — chord recognition', () => {
  it('emits the chord name when a triad fills the window', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS());
    applyOnsetToWindow(s, 64, 120, OPTS());
    const r = applyOnsetToWindow(s, 67, 140, OPTS());
    expect(r.emitted).toBe('Cmaj');
    expect(s.lastChordName).toBe('Cmaj');
    expect(s.lastChordTimeMs).toBe(140);
  });

  it('emits nothing when the simultaneity does not match a known chord', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS());
    applyOnsetToWindow(s, 61, 110, OPTS());
    const r = applyOnsetToWindow(s, 62, 120, OPTS()); // chromatic cluster — STUB returns null
    expect(r.emitted).toBeNull();
    expect(s.lastChordName).toBe('');
  });
});

describe('applyOnsetToWindow — window eviction', () => {
  it('drops onsets older than windowMs before detection', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS()); // ages out by t=180
    applyOnsetToWindow(s, 64, 130, OPTS());
    // At t=199: 60's age = 99 ≥ 80 → evict; 64's age = 69 < 80 → keep.
    const r = applyOnsetToWindow(s, 67, 199, OPTS());
    expect(r.emitted).toBeNull(); // only 64 + 67 left, < minNotes
    expect(s.recentOnsets.map((e) => e.midi)).toEqual([64, 67]);
  });

  it('keeps onsets exactly at the window boundary minus 1', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS());
    // 179 - 100 = 79 < 80 → still in window
    applyOnsetToWindow(s, 64, 179, OPTS());
    const r = applyOnsetToWindow(s, 67, 179, OPTS());
    expect(r.emitted).toBe('Cmaj');
  });

  it('honors a custom windowMs', () => {
    const s = initChordWindowState();
    const wide = OPTS({ windowMs: 500 });
    applyOnsetToWindow(s, 60, 100, wide);
    applyOnsetToWindow(s, 64, 300, wide);
    const r = applyOnsetToWindow(s, 67, 599, wide);
    expect(r.emitted).toBe('Cmaj');
  });
});

describe('applyOnsetToWindow — repeat cooldown', () => {
  it('suppresses re-emission of the same chord within repeatCooldownMs', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS());
    applyOnsetToWindow(s, 64, 120, OPTS());
    applyOnsetToWindow(s, 67, 140, OPTS()); // → emits 'Cmaj' at 140
    // Re-strike the same chord 500 ms later (within 600 ms cooldown)
    applyOnsetToWindow(s, 60, 600, OPTS());
    applyOnsetToWindow(s, 64, 620, OPTS());
    const r = applyOnsetToWindow(s, 67, 640, OPTS()); // 640 - 140 = 500 ≤ 600
    expect(r.emitted).toBeNull();
  });

  it('allows re-emission of the same chord after repeatCooldownMs has elapsed', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS());
    applyOnsetToWindow(s, 64, 120, OPTS());
    applyOnsetToWindow(s, 67, 140, OPTS()); // → 'Cmaj' at 140
    applyOnsetToWindow(s, 60, 800, OPTS());
    applyOnsetToWindow(s, 64, 820, OPTS());
    const r = applyOnsetToWindow(s, 67, 841, OPTS()); // 841 - 140 = 701 > 600
    expect(r.emitted).toBe('Cmaj');
  });

  it('emits a different chord immediately even inside the cooldown', () => {
    const s = initChordWindowState();
    applyOnsetToWindow(s, 60, 100, OPTS());
    applyOnsetToWindow(s, 64, 120, OPTS());
    applyOnsetToWindow(s, 67, 140, OPTS()); // → 'Cmaj'
    // Quickly switch to a minor triad — different chord, ignore cooldown
    applyOnsetToWindow(s, 60, 200, OPTS());
    applyOnsetToWindow(s, 63, 220, OPTS());
    const r = applyOnsetToWindow(s, 67, 240, OPTS());
    expect(r.emitted).toBe('Cmin');
  });
});

describe('applyOnsetToWindow — detector contract', () => {
  it('passes the deque midi-list (deduped or not) to the detector', () => {
    const s = initChordWindowState();
    const spy = vi.fn().mockReturnValue('Cmaj');
    applyOnsetToWindow(s, 60, 100, OPTS({ detectChord: spy }));
    applyOnsetToWindow(s, 64, 120, OPTS({ detectChord: spy }));
    applyOnsetToWindow(s, 67, 140, OPTS({ detectChord: spy }));
    // Detector should be called exactly once when minNotes is reached.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([60, 64, 67]);
  });

  it('treats null from the detector as "no chord"', () => {
    const s = initChordWindowState();
    const detector = vi.fn().mockReturnValue(null);
    applyOnsetToWindow(s, 60, 100, OPTS({ detectChord: detector }));
    applyOnsetToWindow(s, 64, 120, OPTS({ detectChord: detector }));
    const r = applyOnsetToWindow(s, 67, 140, OPTS({ detectChord: detector }));
    expect(r.emitted).toBeNull();
    expect(s.lastChordName).toBe('');
  });
});

describe('applyOnsetToWindow — minNotes', () => {
  it('honors a higher minNotes threshold (4-note chords only)', () => {
    const s = initChordWindowState();
    // Stub that ignores extras and matches a triad on the first three sorted
    // notes — lets us verify the threshold gate without rewriting the
    // detector contract.
    const triadFirstThree = (midis: readonly number[]): string | null => {
      if (midis.length < 3) return null;
      const sorted = [...midis].sort((a, b) => a - b).slice(0, 3);
      if (sorted[1] - sorted[0] === 4 && sorted[2] - sorted[0] === 7) return 'Cmaj';
      return null;
    };
    const opts = OPTS({ minNotes: 4, detectChord: triadFirstThree });
    applyOnsetToWindow(s, 60, 100, opts);
    applyOnsetToWindow(s, 64, 110, opts);
    const r3 = applyOnsetToWindow(s, 67, 120, opts);
    expect(r3.emitted).toBeNull(); // 3 notes — below the 4-note threshold
    const r4 = applyOnsetToWindow(s, 72, 130, opts); // 4th note (octave)
    expect(r4.emitted).toBe('Cmaj');
  });
});
