// Tests for packages/web/src/section-notes.ts.
//
// Covers:
//   • buildSectionNotes: slices notes by [startSec, endSec), applies
//     hand filter (off-hand → _filtered + hit pre-flagged), tempo
//     scaling, count-in offset, sort by timeMs.
//   • buildFullSongNotes: anchors on first note (not section[0].startSec),
//     hardcoded 100% tempo, count-in offset, hand filter.
//   • computeHandRanges: tracks min/max per hand, fallbacks for empty
//     hands (RH 60..72, LH 48..60), single-note hand expanded by 1
//     semitone.

import { describe, it, expect } from 'vitest';
import {
  buildSectionNotes,
  buildFullSongNotes,
  computeHandRanges,
  type OsmdLikeNote,
  type SectionNotesDeps,
  type SongSection,
} from '../src/section-notes';

// ─── helpers ────────────────────────────────────────────────────────

function note(over: Partial<OsmdLikeNote> = {}): OsmdLikeNote {
  return {
    hand: 'R',
    midi: 60,
    timeSec: 0,
    durSec: 0.5,
    measureIdx: 0,
    inBarQuarters: 0,
    ...over,
  };
}

function makeDeps(over: Partial<SectionNotesDeps> = {}): SectionNotesDeps {
  return {
    song: { notes: [], sections: [] },
    practice: { tempoPct: 100, handFilter: null },
    countInMs: 4000,
    ...over,
  };
}

const sec = (startSec: number, endSec: number): SongSection => ({ startSec, endSec });

// ─── buildSectionNotes ─────────────────────────────────────────────

describe('buildSectionNotes', () => {
  it('returns empty when section index out of range', () => {
    const deps = makeDeps({ song: { notes: [note()], sections: [] } });
    expect(buildSectionNotes(0, deps)).toEqual([]);
  });

  it('slices notes by [startSec, endSec)', () => {
    const deps = makeDeps({
      song: {
        notes: [
          note({ midi: 60, timeSec: 0 }),
          note({ midi: 64, timeSec: 2 }),
          note({ midi: 67, timeSec: 4 }), // outside
        ],
        sections: [sec(0, 4)],
      },
    });
    const out = buildSectionNotes(0, deps);
    expect(out.length).toBe(2);
    expect(out.map((n) => n.midi)).toEqual([60, 64]);
  });

  it('endSec is exclusive', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ timeSec: 0 }), note({ timeSec: 5, midi: 64 })],
        sections: [sec(0, 5)],
      },
    });
    const out = buildSectionNotes(0, deps);
    // The second note at exactly endSec=5 is excluded.
    expect(out.length).toBe(1);
  });

  it('startSec is inclusive', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ timeSec: 1, midi: 60 })],
        sections: [sec(1, 5)],
      },
    });
    expect(buildSectionNotes(0, deps).length).toBe(1);
  });

  it('timeMs = relSec * 1000 * speedFactor + countInMs', () => {
    const deps = makeDeps({
      song: { notes: [note({ timeSec: 2 })], sections: [sec(1, 5)] },
      practice: { tempoPct: 50, handFilter: null }, // speedFactor = 2
      countInMs: 4000,
    });
    const out = buildSectionNotes(0, deps);
    // relSec = 2 - 1 = 1, * 1000 * 2 + 4000 = 6000
    expect(out[0].timeMs).toBe(6000);
  });

  it('durMs = durSec * 1000 * speedFactor (no count-in offset)', () => {
    const deps = makeDeps({
      song: { notes: [note({ durSec: 0.5 })], sections: [sec(0, 1)] },
      practice: { tempoPct: 50, handFilter: null },
    });
    const out = buildSectionNotes(0, deps);
    expect(out[0].durMs).toBe(1000); // 0.5 * 1000 * 2
  });

  it('hand filter R → off-hand notes get _filtered + hit pre-flagged', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ hand: 'R', midi: 60 }), note({ hand: 'L', midi: 48 })],
        sections: [sec(0, 1)],
      },
      practice: { tempoPct: 100, handFilter: 'R' },
    });
    const out = buildSectionNotes(0, deps);
    expect(out.length).toBe(2);
    const r = out.find((n) => n.hand === 'R')!;
    const l = out.find((n) => n.hand === 'L')!;
    expect(r._filtered).toBe(false);
    expect(r.hit).toBe(false);
    expect(l._filtered).toBe(true);
    expect(l.hit).toBe(true);
  });

  it('hand filter null → no notes filtered', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ hand: 'R' }), note({ hand: 'L' })],
        sections: [sec(0, 1)],
      },
    });
    const out = buildSectionNotes(0, deps);
    expect(out.every((n) => !n._filtered)).toBe(true);
    expect(out.every((n) => !n.hit)).toBe(true);
  });

  it('output is sorted by timeMs ascending', () => {
    const deps = makeDeps({
      song: {
        notes: [
          note({ timeSec: 0.8, midi: 67 }),
          note({ timeSec: 0.1, midi: 60 }),
          note({ timeSec: 0.5, midi: 64 }),
        ],
        sections: [sec(0, 1)],
      },
    });
    const out = buildSectionNotes(0, deps);
    expect(out.map((n) => n.midi)).toEqual([60, 64, 67]);
  });

  it('preserves measureIdx + inBarQuarters + cursorJump', () => {
    const deps = makeDeps({
      song: {
        notes: [
          note({
            timeSec: 0,
            measureIdx: 7,
            inBarQuarters: 2.5,
            cursorJump: true,
          }),
        ],
        sections: [sec(0, 1)],
      },
    });
    const out = buildSectionNotes(0, deps);
    expect(out[0].measureIdx).toBe(7);
    expect(out[0].inBarQuarters).toBe(2.5);
    expect(out[0].cursorJump).toBe(true);
  });

  it('empty notes array → empty output', () => {
    const deps = makeDeps({ song: { notes: [], sections: [sec(0, 5)] } });
    expect(buildSectionNotes(0, deps)).toEqual([]);
  });
});

// ─── buildFullSongNotes ─────────────────────────────────────────────

describe('buildFullSongNotes', () => {
  it('returns empty when no notes', () => {
    const deps = makeDeps();
    expect(buildFullSongNotes(deps)).toEqual([]);
  });

  it('anchors timeMs on the first note (not sections[0].startSec)', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ timeSec: 1.5, midi: 60 }), note({ timeSec: 2.5, midi: 64 })],
        sections: [sec(0, 10)], // section starts at 0 but first note is at 1.5
      },
      countInMs: 3000,
    });
    const out = buildFullSongNotes(deps);
    // First note → timeMs = (1.5-1.5)*1000 + 3000 = 3000
    expect(out[0].timeMs).toBe(3000);
    // Second note → timeMs = (2.5-1.5)*1000 + 3000 = 4000
    expect(out[1].timeMs).toBe(4000);
  });

  it('hardcodes 100% tempo regardless of practice.tempoPct', () => {
    const deps = makeDeps({
      song: { notes: [note({ timeSec: 1 }), note({ timeSec: 2 })] },
      practice: { tempoPct: 50, handFilter: null }, // ignored
      countInMs: 0,
    });
    const out = buildFullSongNotes(deps);
    expect(out[1].timeMs).toBe(1000); // not 2000 — 100% speed
  });

  it('honors hand filter (same shape as section)', () => {
    const deps = makeDeps({
      song: { notes: [note({ hand: 'R' }), note({ hand: 'L', timeSec: 1 })] },
      practice: { tempoPct: 100, handFilter: 'R' },
    });
    const out = buildFullSongNotes(deps);
    const l = out.find((n) => n.hand === 'L')!;
    expect(l._filtered).toBe(true);
    expect(l.hit).toBe(true);
  });

  it('handles all-equal-timeSec edge (t0 stays finite)', () => {
    const deps = makeDeps({
      song: { notes: [note({ timeSec: 0 }), note({ timeSec: 0, midi: 64 })] },
    });
    const out = buildFullSongNotes(deps);
    expect(out.every((n) => n.timeMs === 4000)).toBe(true);
  });
});

// ─── computeHandRanges ─────────────────────────────────────────────

describe('computeHandRanges', () => {
  it('tracks per-hand min/max', () => {
    expect(
      computeHandRanges([
        note({ hand: 'L', midi: 36 }),
        note({ hand: 'L', midi: 50 }),
        note({ hand: 'R', midi: 60 }),
        note({ hand: 'R', midi: 76 }),
      ])
    ).toEqual({ lhMin: 36, lhMax: 50, rhMin: 60, rhMax: 76 });
  });

  it('RH-only piece falls back to LH 48..60', () => {
    expect(
      computeHandRanges([note({ hand: 'R', midi: 60 }), note({ hand: 'R', midi: 72 })])
    ).toEqual({ lhMin: 48, lhMax: 60, rhMin: 60, rhMax: 72 });
  });

  it('LH-only piece falls back to RH 60..72', () => {
    expect(
      computeHandRanges([note({ hand: 'L', midi: 36 }), note({ hand: 'L', midi: 50 })])
    ).toEqual({ lhMin: 36, lhMax: 50, rhMin: 60, rhMax: 72 });
  });

  it('empty list → both fallbacks', () => {
    expect(computeHandRanges([])).toEqual({ lhMin: 48, lhMax: 60, rhMin: 60, rhMax: 72 });
  });

  it('single-note RH expanded by 1 semitone', () => {
    const r = computeHandRanges([note({ hand: 'R', midi: 60 })]);
    expect(r.rhMin).toBe(60);
    expect(r.rhMax).toBe(61);
  });

  it('single-note LH expanded by 1 semitone', () => {
    const r = computeHandRanges([note({ hand: 'L', midi: 50 })]);
    expect(r.lhMin).toBe(50);
    expect(r.lhMax).toBe(51);
  });

  it('non-L hand routes to RH (covers undefined hand)', () => {
    // The legacy implementation routes anything that isn't 'L' to RH.
    const r = computeHandRanges([note({ hand: '', midi: 65 })]);
    expect(r.rhMin).toBe(65);
    expect(r.lhMin).toBe(48); // fallback
  });
});
