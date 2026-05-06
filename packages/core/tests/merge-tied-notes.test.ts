import { describe, it, expect } from 'vitest';
import { mergeTiedNotes, type TiedNote } from '../src/library/merge-tied-notes';

const note = (over: Partial<TiedNote> = {}): TiedNote => ({
  midi: 60,
  hand: 'L',
  timeSec: 0,
  durSec: 1,
  ...over,
});

describe('mergeTiedNotes — empty / no-op', () => {
  it('returns 0 merges + empty samples for an empty array', () => {
    const r = mergeTiedNotes([]);
    expect(r).toEqual({ merged: 0, samples: [] });
  });

  it('returns 0 merges for a single note', () => {
    const notes = [note({ tieStart: true })];
    const r = mergeTiedNotes(notes);
    expect(r.merged).toBe(0);
    expect(notes).toHaveLength(1);
  });

  it('returns 0 merges when no note has tieStart', () => {
    const notes = [note({ timeSec: 0 }), note({ timeSec: 1 }), note({ timeSec: 2 })];
    const r = mergeTiedNotes(notes);
    expect(r.merged).toBe(0);
    expect(notes).toHaveLength(3);
  });
});

describe('mergeTiedNotes — basic coalescing', () => {
  it('merges a 2-note tieStart→tieEnd chain', () => {
    const notes = [
      note({ timeSec: 0, durSec: 1, tieStart: true }),
      note({ timeSec: 1, durSec: 0.5, tieEnd: true }),
    ];
    const r = mergeTiedNotes(notes);
    expect(r.merged).toBe(1);
    expect(notes).toHaveLength(1);
    expect(notes[0].timeSec).toBe(0);
    expect(notes[0].durSec).toBe(1.5); // 1 + 0.5
  });

  it('merges a 3-note tieStart→tieStart-tieEnd→tieEnd chain', () => {
    const notes = [
      note({ timeSec: 0, durSec: 1, tieStart: true }),
      note({ timeSec: 1, durSec: 1, tieStart: true, tieEnd: true }),
      note({ timeSec: 2, durSec: 0.5, tieEnd: true }),
    ];
    const r = mergeTiedNotes(notes);
    expect(r.merged).toBe(2);
    expect(notes).toHaveLength(1);
    expect(notes[0].durSec).toBe(2.5);
  });

  it('does NOT merge when midi differs', () => {
    const notes = [
      note({ midi: 60, timeSec: 0, tieStart: true }),
      note({ midi: 62, timeSec: 1, tieEnd: true }),
    ];
    const r = mergeTiedNotes(notes);
    expect(r.merged).toBe(0);
    expect(notes).toHaveLength(2);
  });

  it('does NOT merge when hand differs', () => {
    const notes = [
      note({ hand: 'L', timeSec: 0, tieStart: true }),
      note({ hand: 'R', timeSec: 1, tieEnd: true }),
    ];
    const r = mergeTiedNotes(notes);
    expect(r.merged).toBe(0);
    expect(notes).toHaveLength(2);
  });
});

describe('mergeTiedNotes — chord-internal jitter', () => {
  it('matches the right tieEnd even when other (non-matching) notes interleave', () => {
    // C and E both tied start; both tied end, but interleaved.
    const notes = [
      note({ midi: 60, hand: 'L', timeSec: 0, durSec: 1, tieStart: true }), // C start
      note({ midi: 64, hand: 'L', timeSec: 0, durSec: 1, tieStart: true }), // E start
      note({ midi: 60, hand: 'L', timeSec: 1, durSec: 0.5, tieEnd: true }), // C end
      note({ midi: 64, hand: 'L', timeSec: 1, durSec: 0.5, tieEnd: true }), // E end
    ];
    const r = mergeTiedNotes(notes);
    expect(r.merged).toBe(2);
    expect(notes).toHaveLength(2);
    expect(notes.map((n) => n.midi).sort()).toEqual([60, 64]);
    expect(notes.every((n) => n.durSec === 1.5)).toBe(true);
  });
});

describe('mergeTiedNotes — runaway guard', () => {
  it('does NOT merge when the tieEnd is past maxChainGapSec', () => {
    const notes = [
      note({ timeSec: 0, durSec: 1, tieStart: true }),
      note({ timeSec: 100, durSec: 0.5, tieEnd: true }), // 100s away
    ];
    const r = mergeTiedNotes(notes, { maxChainGapSec: 30 });
    expect(r.merged).toBe(0);
    expect(notes).toHaveLength(2);
  });

  it('honors a custom maxChainGapSec', () => {
    const notes = [
      note({ timeSec: 0, durSec: 1, tieStart: true }),
      note({ timeSec: 5, durSec: 0.5, tieEnd: true }),
    ];
    const r = mergeTiedNotes(notes, { maxChainGapSec: 3 });
    expect(r.merged).toBe(0); // 5s > 3s — rejected
  });
});

describe('mergeTiedNotes — sample collection', () => {
  it('emits no samples when collectSamples is false (default)', () => {
    const notes = [
      note({ timeSec: 0, durSec: 1, tieStart: true }),
      note({ timeSec: 1, durSec: 0.5, tieEnd: true }),
    ];
    const r = mergeTiedNotes(notes);
    expect(r.samples).toEqual([]);
  });

  it('emits samples when collectSamples is true', () => {
    const notes = [
      note({ midi: 60, hand: 'L', timeSec: 0, durSec: 1, tieStart: true, measureIdx: 3 }),
      note({ midi: 60, hand: 'L', timeSec: 1, durSec: 0.5, tieEnd: true }),
    ];
    const r = mergeTiedNotes(notes, { collectSamples: true });
    expect(r.samples).toHaveLength(1);
    expect(r.samples[0]).toEqual({
      midi: 60,
      hand: 'L',
      t0: 0,
      chain: 2,
      durBefore: 1,
      durAfter: 1.5,
      m: 3,
    });
  });

  it('caps samples at 5 even with more merges', () => {
    const notes: TiedNote[] = [];
    for (let i = 0; i < 10; i++) {
      notes.push(note({ midi: 60 + i, timeSec: i * 2, durSec: 1, tieStart: true }));
      notes.push(note({ midi: 60 + i, timeSec: i * 2 + 1, durSec: 0.5, tieEnd: true }));
    }
    const r = mergeTiedNotes(notes, { collectSamples: true });
    expect(r.merged).toBe(10);
    expect(r.samples).toHaveLength(5);
  });
});

describe('mergeTiedNotes — in-place semantics', () => {
  it('mutates the input array (does not return a new array)', () => {
    const notes = [
      note({ timeSec: 0, durSec: 1, tieStart: true }),
      note({ timeSec: 1, durSec: 0.5, tieEnd: true }),
    ];
    const ref = notes;
    mergeTiedNotes(notes);
    expect(notes).toBe(ref);
    expect(notes).toHaveLength(1);
  });
});

describe('mergeTiedNotes — durSec extension semantics', () => {
  it('takes max(existing durSec, computed total span)', () => {
    // Head already has long durSec (e.g. legacy bug overlap); merging
    // shouldn't shrink it.
    const notes = [
      note({ timeSec: 0, durSec: 5, tieStart: true }),
      note({ timeSec: 1, durSec: 0.5, tieEnd: true }),
    ];
    mergeTiedNotes(notes);
    expect(notes[0].durSec).toBe(5); // max(5, 1.5)
  });
});
