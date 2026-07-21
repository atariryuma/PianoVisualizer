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
  buildBackingNotes,
  buildMetronomeEvents,
  fullSongAnchorSec,
  computeHandRanges,
  clusterAdjacentNotes,
  relaxChordsForMic,
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

  it('listen (and legacy mode-less callers) hardcode 100% tempo', () => {
    const deps = makeDeps({
      song: { notes: [note({ timeSec: 1 }), note({ timeSec: 2 })] },
      practice: { tempoPct: 50, handFilter: null, mode: 'listen' }, // tempo ignored
      countInMs: 0,
    });
    expect(buildFullSongNotes(deps)[1].timeMs).toBe(1000); // not 2000 — 100% speed
    const legacy = makeDeps({
      song: { notes: [note({ timeSec: 1 }), note({ timeSec: 2 })] },
      practice: { tempoPct: 50, handFilter: null }, // no mode — old callers
      countInMs: 0,
    });
    expect(buildFullSongNotes(legacy)[1].timeMs).toBe(1000);
  });

  it('rhythm（1曲チャレンジ）scales by the practice tempo like a section', () => {
    const deps = makeDeps({
      song: { notes: [note({ timeSec: 1 }), note({ timeSec: 2 })] },
      practice: { tempoPct: 50, handFilter: null, mode: 'rhythm' },
      countInMs: 0,
    });
    const out = buildFullSongNotes(deps);
    // (2-1)s × (100/50) = 2000ms
    expect(out[1].timeMs).toBe(2000);
    expect(out[1].durMs).toBe(1000); // 0.5s × 2
  });

  it('rhythm + micMode relaxes chords to the top note (same as sections)', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ midi: 60, timeSec: 1 }), note({ midi: 64, timeSec: 1 })],
      },
      practice: { tempoPct: 100, handFilter: null, mode: 'rhythm' },
      micMode: true,
    });
    const out = buildFullSongNotes(deps);
    const low = out.find((n) => n.midi === 60)!;
    const top = out.find((n) => n.midi === 64)!;
    expect(low._filtered).toBe(true);
    expect(low.hit).toBe(true);
    expect(top._filtered).toBeFalsy();
  });

  it('listen + micMode does NOT relax chords (no scoring)', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ midi: 60, timeSec: 1 }), note({ midi: 64, timeSec: 1 })],
      },
      practice: { tempoPct: 100, handFilter: null, mode: 'listen' },
      micMode: true,
    });
    const out = buildFullSongNotes(deps);
    expect(out.every((n) => !n._filtered)).toBe(true);
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

// ─── clusterAdjacentNotes (trill / tremolo collapse) ───────────────

describe('clusterAdjacentNotes', () => {
  it('passes through a single note with replayCount=1', () => {
    // Single notes always get replayCount=1 even though no merging
    // happened — the renderer reads it to decide whether to paint a
    // badge.
    const n = note({ midi: 60, timeMs: 100, durMs: 200, hand: 'R' });
    const out = clusterAdjacentNotes([n]);
    expect(out).toHaveLength(1);
    expect(out[0].replayCount).toBe(1);
  });

  it('merges 4 same-pitch + same-hand attacks within 30 ms each', () => {
    // Liszt La Campanella trill case: dense RH same-pitch attacks at
    // ~10 ms intervals. All four collapse into one tile with ×4.
    const burst = [0, 10, 20, 30].map((t) => note({ midi: 75, timeMs: t, durMs: 8, hand: 'R' }));
    const out = clusterAdjacentNotes(burst);
    expect(out).toHaveLength(1);
    expect(out[0].replayCount).toBe(4);
    expect(out[0].timeMs).toBe(0); // earliest attack survives
  });

  it('extends durMs to cover the last attack in the cluster', () => {
    const burst = [
      note({ midi: 75, timeMs: 0, durMs: 50, hand: 'R' }),
      note({ midi: 75, timeMs: 20, durMs: 50, hand: 'R' }),
    ];
    const out = clusterAdjacentNotes(burst);
    expect(out).toHaveLength(1);
    // durMs must reach at least (20 + 50) - 0 = 70 so the visual tile
    // covers the full burst region.
    expect(out[0].durMs).toBeGreaterThanOrEqual(70);
  });

  it('does NOT merge across hand boundaries', () => {
    const seq = [
      note({ midi: 60, timeMs: 0, hand: 'R' }),
      note({ midi: 60, timeMs: 10, hand: 'L' }),
    ];
    const out = clusterAdjacentNotes(seq);
    expect(out).toHaveLength(2);
    expect(out[0].hand).toBe('R');
    expect(out[1].hand).toBe('L');
  });

  it('does NOT merge different pitches', () => {
    const seq = [
      note({ midi: 60, timeMs: 0, hand: 'R' }),
      note({ midi: 62, timeMs: 10, hand: 'R' }),
    ];
    const out = clusterAdjacentNotes(seq);
    expect(out).toHaveLength(2);
  });

  it('does NOT merge when gap exceeds CLUSTER_WINDOW_MS (30)', () => {
    // 100 ms gap = a legitimate fast 16th at slow tempo; must stay
    // individual.
    const seq = [
      note({ midi: 60, timeMs: 0, hand: 'R' }),
      note({ midi: 60, timeMs: 100, hand: 'R' }),
    ];
    const out = clusterAdjacentNotes(seq);
    expect(out).toHaveLength(2);
    expect(out[0].replayCount).toBe(1);
    expect(out[1].replayCount).toBe(1);
  });

  it('does NOT merge filtered (off-hand) notes (keeps them visible to the cursor)', () => {
    // Both have _filtered:true (one-hand practice, off hand). Merging
    // would change cursor advance semantics; keep them separate.
    const seq = [
      note({ midi: 60, timeMs: 0, hand: 'R', _filtered: true }),
      note({ midi: 60, timeMs: 10, hand: 'R', _filtered: true }),
    ];
    const out = clusterAdjacentNotes(seq);
    expect(out).toHaveLength(2);
  });

  it('handles mixed clusters + isolated notes in one pass', () => {
    const seq = [
      // Cluster A: midi=60 ×3 at 0/10/20
      note({ midi: 60, timeMs: 0, hand: 'R' }),
      note({ midi: 60, timeMs: 10, hand: 'R' }),
      note({ midi: 60, timeMs: 20, hand: 'R' }),
      // Singleton between
      note({ midi: 64, timeMs: 100, hand: 'R' }),
      // Cluster B: midi=67 ×2 at 200/220
      note({ midi: 67, timeMs: 200, hand: 'R' }),
      note({ midi: 67, timeMs: 220, hand: 'R' }),
    ];
    const out = clusterAdjacentNotes(seq);
    expect(out).toHaveLength(3);
    expect(out[0].replayCount).toBe(3);
    expect(out[1].replayCount).toBe(1);
    expect(out[2].replayCount).toBe(2);
  });

  it('buildSectionNotes integration: trill burst collapses in produced section', () => {
    // 8 same-pitch attacks within 60ms span (every 10 ms) → 1 tile ×8
    const notes: OsmdLikeNote[] = [];
    for (let i = 0; i < 8; i++) {
      notes.push(note({ midi: 75, timeSec: 0.5 + i * 0.01, hand: 'R' }));
    }
    const deps = makeDeps({
      song: { notes, sections: [sec(0, 1)] },
      practice: { tempoPct: 100, handFilter: null },
    });
    const out = buildSectionNotes(0, deps);
    expect(out).toHaveLength(1);
    expect(out[0].replayCount).toBe(8);
  });
});

// ─── buildBackingNotes / fullSongAnchorSec ─────────────────────────

describe('buildBackingNotes', () => {
  const backing = [
    { midi: 69, timeSec: 1.0, durSec: 0.5 },
    { midi: 71, timeSec: 5.0, durSec: 1.0 },
    { midi: 72, timeSec: 12.0, durSec: 0.5 },
  ];

  it('backingNotes が無い曲は空配列', () => {
    const deps = makeDeps({ song: { notes: [note()], sections: [sec(0, 10)] } });
    expect(buildBackingNotes(0, deps)).toEqual([]);
    expect(buildBackingNotes(null, deps)).toEqual([]);
  });

  it('セクション指定時は [startSec, endSec) でスライスし countIn にアンカーする', () => {
    const deps = makeDeps({
      song: { notes: [note()], backingNotes: backing, sections: [sec(0, 10), sec(10, 20)] },
    });
    const out = buildBackingNotes(0, deps);
    expect(out.map((n) => n.midi)).toEqual([69, 71]);
    expect(out[0].timeMs).toBe(1000 + 4000); // (1.0 - 0) * 1000 + countIn
    expect(out[1].timeMs).toBe(5000 + 4000);
  });

  it('テンポ % は練習ノーツと同じ speedFactor で伸長される', () => {
    const deps = makeDeps({
      song: { notes: [note()], backingNotes: backing, sections: [sec(0, 10)] },
      practice: { tempoPct: 50, handFilter: null },
    });
    const out = buildBackingNotes(0, deps);
    expect(out[0].timeMs).toBe(1000 * 2 + 4000);
    expect(out[0].durMs).toBe(500 * 2);
  });

  it('全曲 (null) はテンポ 100% 固定・共有アンカー基準（listen / 旧呼び出し）', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ timeSec: 2.0 })],
        backingNotes: backing,
        sections: [sec(0, 20)],
      },
      practice: { tempoPct: 50, handFilter: null },
    });
    const out = buildBackingNotes(null, deps);
    // アンカーは min(練習 2.0, backing 1.0) = 1.0
    expect(out[0].timeMs).toBe(0 + 4000);
    expect(out[1].timeMs).toBe(4000 * 1 + 4000); // (5.0-1.0)*1000 + countIn
    expect(out[0].durMs).toBe(500); // 100% 固定
  });

  it('全曲 (null) + rhythm（1曲チャレンジ）は練習ノーツと同じテンポ scale', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ timeSec: 2.0 })],
        backingNotes: backing,
        sections: [sec(0, 20)],
      },
      practice: { tempoPct: 50, handFilter: null, mode: 'rhythm' },
    });
    const out = buildBackingNotes(null, deps);
    // (5.0-1.0)s × (100/50) = 8000ms + countIn — 練習ノーツと同じ伸長。
    expect(out[1].timeMs).toBe(8000 + 4000);
    expect(out[0].durMs).toBe(1000); // 0.5s × 2
  });
});

describe('fullSongAnchorSec', () => {
  it('歌い出しがピアノより早い曲では backing 側が全曲アンカーになる', () => {
    const song = {
      notes: [note({ timeSec: 2.0 })],
      backingNotes: [{ midi: 69, timeSec: 0.5, durSec: 1 }],
    };
    expect(fullSongAnchorSec(song)).toBe(0.5);
    // buildFullSongNotes も同じアンカーを使う → ピアノ初音は countIn+1.5s
    const deps = makeDeps({ song: { ...song, sections: [sec(0, 10)] } });
    const full = buildFullSongNotes(deps);
    expect(full[0].timeMs).toBe(1500 + 4000);
  });

  it('backing の無い曲では従来どおり練習ノーツの最初のアタック', () => {
    expect(fullSongAnchorSec({ notes: [note({ timeSec: 1.25 })] })).toBe(1.25);
  });
});

// ─── relaxChordsForMic (P1-10) ─────────────────────────────────────

describe('relaxChordsForMic', () => {
  const chordNote = (midi: number, timeMs: number, over: Partial<OsmdLikeNote> = {}) =>
    note({ midi, timeMs, timeSec: timeMs / 1000, ...over });

  it('keeps the top note of a chord, filters the rest', () => {
    const notes = [
      chordNote(60, 1000), // C4
      chordNote(64, 1000), // E4
      chordNote(67, 1000), // G4 (top)
    ];
    relaxChordsForMic(notes);
    const g = notes.find((n) => n.midi === 67)!;
    const c = notes.find((n) => n.midi === 60)!;
    const e = notes.find((n) => n.midi === 64)!;
    expect(g._filtered).toBeFalsy();
    expect(c._filtered).toBe(true);
    expect(c.hit).toBe(true);
    expect(e._filtered).toBe(true);
  });

  it('leaves a single-note onset untouched', () => {
    const notes = [chordNote(60, 1000)];
    relaxChordsForMic(notes);
    expect(notes[0]._filtered).toBeFalsy();
  });

  it('treats separate onsets as separate clusters', () => {
    const notes = [chordNote(60, 1000), chordNote(64, 1000), chordNote(62, 2000)];
    relaxChordsForMic(notes);
    // First cluster: top is 64; 60 filtered. Second cluster: lone 62 kept.
    expect(notes.find((n) => n.midi === 64)!._filtered).toBeFalsy();
    expect(notes.find((n) => n.midi === 60)!._filtered).toBe(true);
    expect(notes.find((n) => n.midi === 62)!._filtered).toBeFalsy();
  });

  it('composes with one-hand mode: only relaxes among still-active notes', () => {
    const notes = [
      chordNote(48, 1000, { hand: 'L', _filtered: true, hit: true }), // off-hand, pre-filtered
      chordNote(60, 1000, { hand: 'R' }),
      chordNote(64, 1000, { hand: 'R' }), // top active
    ];
    relaxChordsForMic(notes);
    expect(notes.find((n) => n.midi === 64)!._filtered).toBeFalsy(); // kept
    expect(notes.find((n) => n.midi === 60)!._filtered).toBe(true); // relaxed
    expect(notes.find((n) => n.midi === 48)!._filtered).toBe(true); // still off-hand
  });
});

describe('buildSectionNotes — mic mode chord relaxation', () => {
  const song = {
    notes: [
      note({ midi: 60, timeSec: 0, hand: 'R' }),
      note({ midi: 64, timeSec: 0, hand: 'R' }),
      note({ midi: 67, timeSec: 0, hand: 'R' }),
    ],
    sections: [sec(0, 1)],
  };

  it('relaxes chords when micMode + rhythm', () => {
    const deps = makeDeps({
      song,
      practice: { tempoPct: 100, handFilter: null, mode: 'rhythm' },
      micMode: true,
    });
    const out = buildSectionNotes(0, deps);
    const active = out.filter((n) => !n._filtered);
    expect(active).toHaveLength(1);
    expect(active[0].midi).toBe(67); // top note
  });

  it('does NOT relax in listen mode (no scoring)', () => {
    const deps = makeDeps({
      song,
      practice: { tempoPct: 100, handFilter: null, mode: 'listen' },
      micMode: true,
    });
    const out = buildSectionNotes(0, deps);
    expect(out.filter((n) => !n._filtered)).toHaveLength(3);
  });

  it('does NOT relax when a MIDI keyboard is attached (micMode false)', () => {
    const deps = makeDeps({
      song,
      practice: { tempoPct: 100, handFilter: null, mode: 'rhythm' },
      micMode: false,
    });
    const out = buildSectionNotes(0, deps);
    expect(out.filter((n) => !n._filtered)).toHaveLength(3);
  });
});

// ─── buildMetronomeEvents（小節グリッド駆動メトロノーム） ────────────

describe('buildMetronomeEvents', () => {
  // 4/4・各小節 2s（= 120 BPM）・3 小節のシンプルなグリッド。
  const fullBar44 = (startSec: number) => ({ startSec, durSec: 2, beats: 4, beatType: 4 });

  it('グリッドが無い曲は null（従来の一様ループへフォールバック）', () => {
    const deps = makeDeps({
      song: { notes: [note()], sections: [sec(0, 4)] },
    });
    expect(buildMetronomeEvents(0, deps)).toBeNull();
  });

  it('セクションが無い index は空配列', () => {
    const deps = makeDeps({
      song: { notes: [], sections: [], measureGrid: [fullBar44(0)] },
    });
    expect(buildMetronomeEvents(9, deps)).toEqual([]);
  });

  it('4/4 完全小節: 小節頭アクセント + 拍クリック、GO 相当（countInMs）は除外', () => {
    const deps = makeDeps({
      song: {
        notes: [],
        sections: [sec(0, 4)],
        measureGrid: [fullBar44(0), fullBar44(2)],
      },
      practice: { tempoPct: 100, handFilter: null },
      countInMs: 4000,
    });
    const out = buildMetronomeEvents(0, deps)!;
    // 小節0: 頭 (=GO) は除外 → 4500/5000/5500。小節1: 頭 6000 がアクセント。
    expect(out.map((e) => e.timeMs)).toEqual([4500, 5000, 5500, 6000, 6500, 7000, 7500]);
    expect(out.map((e) => e.accent)).toEqual([false, false, false, true, false, false, false]);
  });

  it('弱起 (1 拍ピックアップ 4/4): GO がダウンビートへずれ、以降の小節頭にアクセント', () => {
    // ピックアップ小節 0.5s (1 拍) + 完全小節 2s × 2。
    const deps = makeDeps({
      song: {
        notes: [],
        sections: [sec(0, 4.5)],
        measureGrid: [
          { startSec: 0, durSec: 0.5, beats: 4, beatType: 4, implicit: true, barFrac: 0.25 },
          fullBar44(0.5),
          fullBar44(2.5),
        ],
      },
      practice: { tempoPct: 100, handFilter: null },
      countInMs: 4000,
    });
    const out = buildMetronomeEvents(0, deps)!;
    // GO = 4000 + 0.5×1000 = 4500（最初の完全小節頭）→ その時刻は除外。
    // ピックアップ小節のクリック（カウントイン区間）も除外。
    // 完全小節1: 5000/5500/6000、完全小節2: 頭 6500 アクセント + 7000/7500/8000。
    expect(out.map((e) => e.timeMs)).toEqual([5000, 5500, 6000, 6500, 7000, 7500, 8000]);
    expect(out[3].accent).toBe(true); // 6500 = 小節線
    expect(out.filter((e) => e.accent).map((e) => e.timeMs)).toEqual([6500]);
  });

  it('3/8 (Für Elise 型): 1 小節 = 付点四分 1 クリックで小節線に整列', () => {
    // 3/8 各小節 1.25s、ピックアップ 1/3 小節 (0.4166s)。
    const bar = 1.25;
    const pickup = bar / 3;
    const deps = makeDeps({
      song: {
        notes: [],
        sections: [sec(0, pickup + bar * 3)],
        measureGrid: [
          {
            startSec: 0,
            durSec: pickup,
            beats: 3,
            beatType: 8,
            implicit: true,
            barFrac: 1 / 3,
          },
          { startSec: pickup, durSec: bar, beats: 3, beatType: 8 },
          { startSec: pickup + bar, durSec: bar, beats: 3, beatType: 8 },
          { startSec: pickup + bar * 2, durSec: bar, beats: 3, beatType: 8 },
        ],
      },
      practice: { tempoPct: 100, handFilter: null },
      countInMs: 2500,
    });
    const out = buildMetronomeEvents(0, deps)!;
    // GO = 2500 + pickup×1000。以降は小節頭のみ（1 クリック/小節）＝全部アクセント。
    const goMs = 2500 + pickup * 1000;
    expect(out.map((e) => Math.round(e.timeMs))).toEqual([
      Math.round(goMs + bar * 1000),
      Math.round(goMs + bar * 2000),
    ]);
    expect(out.every((e) => e.accent)).toBe(true);
  });

  it('途中の拍子変更 (4/4 → 3/4) にアクセントが追従', () => {
    const deps = makeDeps({
      song: {
        notes: [],
        sections: [sec(0, 3.5)],
        measureGrid: [fullBar44(0), { startSec: 2, durSec: 1.5, beats: 3, beatType: 4 }],
      },
      practice: { tempoPct: 100, handFilter: null },
      countInMs: 4000,
    });
    const out = buildMetronomeEvents(0, deps)!;
    // 小節0 (4/4): 4500/5000/5500。小節1 (3/4): 頭 6000 アクセント + 6500/7000。
    expect(out.map((e) => e.timeMs)).toEqual([4500, 5000, 5500, 6000, 6500, 7000]);
    expect(out.filter((e) => e.accent).map((e) => e.timeMs)).toEqual([6000]);
  });

  it('テンポ 75%: ノート写像と同じ speedFactor でスケール', () => {
    const deps = makeDeps({
      song: {
        notes: [],
        sections: [sec(0, 4)],
        measureGrid: [fullBar44(0), fullBar44(2)],
      },
      practice: { tempoPct: 75, handFilter: null }, // speedFactor = 4/3
      countInMs: 4000,
    });
    const out = buildMetronomeEvents(0, deps)!;
    const sf = 100 / 75;
    // 小節0 の 2 拍目 = 0.5s → 4000 + 500×sf。小節1 の頭 = 2s → 4000 + 2000×sf。
    expect(out[0].timeMs).toBeCloseTo(4000 + 500 * sf, 6);
    const accent = out.find((e) => e.accent)!;
    expect(accent.timeMs).toBeCloseTo(4000 + 2000 * sf, 6);
  });

  it('セクション途中開始: [startSec, endSec) 範囲外の小節・拍は含めない', () => {
    const deps = makeDeps({
      song: {
        notes: [],
        sections: [sec(0, 2), sec(2, 4)],
        measureGrid: [fullBar44(0), fullBar44(2)],
      },
      practice: { tempoPct: 100, handFilter: null },
      countInMs: 4000,
    });
    const out = buildMetronomeEvents(1, deps)!;
    // セクション1 = 小節1 のみ。頭 (=GO) 除外 → 4500/5000/5500。
    expect(out.map((e) => e.timeMs)).toEqual([4500, 5000, 5500]);
  });

  it('全曲再生 (sectionIdx=null): アンカーは最初の音・テンポ 100% 固定', () => {
    const deps = makeDeps({
      song: {
        notes: [note({ timeSec: 0.5 })], // 弱起でピックアップ音が 0.5s から
        sections: [sec(0, 4.5)],
        measureGrid: [
          { startSec: 0, durSec: 1, beats: 4, beatType: 4, implicit: true, barFrac: 0.5 },
          fullBar44(1),
        ],
      },
      practice: { tempoPct: 50, handFilter: null }, // 全曲では無視される
      countInMs: 4000,
    });
    const out = buildMetronomeEvents(null, deps)!;
    // アンカー = 0.5 (最初の音)。GO = 4000 + (1 - 0.5)×1000 = 4500。
    // 完全小節 (1s〜3s): 頭 4500 (=GO) 除外 → 5000/5500/6000。
    expect(out.map((e) => e.timeMs)).toEqual([5000, 5500, 6000]);
  });

  it('部分小節 (barFrac) は実長を超える拍を鳴らさない・拍間隔は公称小節基準', () => {
    // 中間に 4/4 の半分しかない部分小節（volta 切れ端など）。
    const deps = makeDeps({
      song: {
        notes: [],
        sections: [sec(0, 5)],
        measureGrid: [
          fullBar44(0),
          { startSec: 2, durSec: 1, beats: 4, beatType: 4, barFrac: 0.5 },
          fullBar44(3),
        ],
      },
      practice: { tempoPct: 100, handFilter: null },
      countInMs: 4000,
    });
    const out = buildMetronomeEvents(0, deps)!;
    // 小節1 (部分): 公称 2s → 拍 0.5s 間隔、実長 1s → 頭 6000 + 6500 の 2 拍のみ。
    // 小節2: 頭 7000 アクセント + 7500/8000/8500。
    expect(out.map((e) => e.timeMs)).toEqual([
      4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500,
    ]);
    expect(out.filter((e) => e.accent).map((e) => e.timeMs)).toEqual([6000, 7000]);
  });
});
