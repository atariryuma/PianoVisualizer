import { describe, it, expect } from 'vitest';
import {
  computeSongMastery,
  computeLibraryMastery,
  resolveSongSeal,
  endowedProgressFraction,
  pickNearCompletion,
  weeklyLibraryGrowth,
  type MasterySongDef,
} from '../src/state/mastery';
import {
  defaultPracticeProgress,
  defaultSongProgress,
  type PracticeProgress,
  type SongProgress,
} from '../src/state/practice-progress';

const FUR_ELISE: MasterySongDef = { id: 'fur_elise', sectionIds: ['A1', 'B', 'A2'] };
const ALLA_TURCA: MasterySongDef = { id: 'alla_turca', sectionIds: ['A', 'B', 'C'] };

function spWith(opts: {
  stars?: Partial<Record<string, number>>;
  tempos?: Partial<Record<string, boolean>>;
  unlockedSections?: Partial<Record<string, boolean>>;
}): SongProgress {
  const sp = defaultSongProgress();
  if (opts.stars) {
    for (const [id, n] of Object.entries(opts.stars)) {
      sp.sections[id] = { stars: n ?? 0, bestPct: (n ?? 0) * 30 };
    }
  }
  if (opts.tempos) {
    sp.unlockedTempos = { ...sp.unlockedTempos, ...opts.tempos };
  }
  if (opts.unlockedSections) {
    sp.unlockedSections = { ...sp.unlockedSections, ...opts.unlockedSections };
  }
  return sp;
}

describe('resolveSongSeal', () => {
  it('returns none for empty input', () => {
    expect(resolveSongSeal([], 60)).toBe('none');
  });
  it('returns none when no section is cleared', () => {
    expect(resolveSongSeal([0, 0, 0], 100)).toBe('none');
  });
  it('returns bronze when at least one section has any star', () => {
    expect(resolveSongSeal([1, 0, 0], 60)).toBe('bronze');
    expect(resolveSongSeal([3, 0, 0], 60)).toBe('bronze');
  });
  it('returns silver when every section has >=2 stars but not all 3', () => {
    expect(resolveSongSeal([2, 2, 2], 60)).toBe('silver');
    expect(resolveSongSeal([3, 2, 3], 100)).toBe('silver');
  });
  it('returns gold when every section has 3 stars but tempo < 100', () => {
    expect(resolveSongSeal([3, 3, 3], 75)).toBe('gold');
    expect(resolveSongSeal([3, 3, 3], 90)).toBe('gold');
  });
  it('returns platinum when every section has 3 stars AND tempo 100', () => {
    expect(resolveSongSeal([3, 3, 3], 100)).toBe('platinum');
  });
});

describe('endowedProgressFraction', () => {
  it('is 0 when nothing to earn', () => {
    expect(endowedProgressFraction(0)).toBe(0);
  });
  it('caps the floor at 5% for tiny libraries (visible but modest)', () => {
    // 1/9 ≈ 11% would be too bold for a kid who has not touched the
    // song — Min'd with 0.05 → 5%, which reads as "just barely started".
    expect(endowedProgressFraction(9)).toBe(0.05);
  });
  it('uses 1/N for very large libraries (floor falls below the 5% cap)', () => {
    expect(endowedProgressFraction(100)).toBe(0.01);
  });
});

describe('computeSongMastery', () => {
  it('returns cold-start summary for an untouched song', () => {
    const sm = computeSongMastery(FUR_ELISE, undefined);
    expect(sm.starsEarned).toBe(0);
    expect(sm.starsPossible).toBe(9); // 3 sections × 3 stars
    expect(sm.seal).toBe('none');
    expect(sm.touched).toBe(false);
    // First section unlocked by default even with no progress record.
    expect(sm.sections[0].unlocked).toBe(true);
    expect(sm.sections[1].unlocked).toBe(false);
  });

  it('F3: does NOT throw on a corrupt per-song bucket missing unlockedTempos', () => {
    // 破損/移行後の per-song バケットが unlockedTempos を欠くと、以前は
    // highestUnlockedTempo → undefined['60'] で TypeError → renderLibraryStrip
    // 経由で boot 恒久クラッシュしていた。leaf ガードで安全に既定へ落ちる。
    const corrupt = { sections: {}, unlockedSections: {} } as unknown as Parameters<
      typeof computeSongMastery
    >[1];
    expect(() => computeSongMastery(FUR_ELISE, corrupt)).not.toThrow();
    const sm = computeSongMastery(FUR_ELISE, corrupt);
    expect(sm.starsPossible).toBe(9);
    expect(sm.highestTempoUnlocked).toBe(50); // 既定（TEMPO_TIERS[0]=最遅）
    // computeLibraryMastery 経由でも throw しない（boot 経路の再現）。
    expect(() =>
      computeLibraryMastery([FUR_ELISE], { songs: { fur_elise: corrupt } } as never)
    ).not.toThrow();
  });

  it('applies the endowed-progress floor for untouched songs', () => {
    // Untouched but the cold-start ring still reads >0% so the kid
    // sees "in progress" not "0%". For 9 possible stars, 1/9 ≈ 11%.
    const sm = computeSongMastery(FUR_ELISE, undefined);
    expect(sm.percent).toBeGreaterThan(0);
    expect(sm.percent).toBeLessThanOrEqual(11);
  });

  it('uses real progress when touched', () => {
    const sp = spWith({ stars: { A1: 3, B: 2, A2: 1 } });
    const sm = computeSongMastery(FUR_ELISE, sp);
    expect(sm.starsEarned).toBe(6);
    expect(sm.starsPossible).toBe(9);
    expect(sm.percent).toBe(67); // 6/9 = 66.7 → 67
    expect(sm.touched).toBe(true);
  });

  it('reports correct seal at silver threshold', () => {
    const sp = spWith({ stars: { A1: 2, B: 2, A2: 2 } });
    expect(computeSongMastery(FUR_ELISE, sp).seal).toBe('silver');
  });

  it('reports platinum only when tempo 100 is also unlocked', () => {
    const golden = spWith({
      stars: { A1: 3, B: 3, A2: 3 },
      tempos: { 100: false },
    });
    expect(computeSongMastery(FUR_ELISE, golden).seal).toBe('gold');

    const platinum = spWith({
      stars: { A1: 3, B: 3, A2: 3 },
      tempos: { 60: true, 75: true, 90: true, 100: true },
    });
    expect(computeSongMastery(FUR_ELISE, platinum).seal).toBe('platinum');
  });

  it('exposes section list in the song-defined order, not progress key order', () => {
    const sp = spWith({ stars: { A2: 3, A1: 1, B: 2 } });
    const sm = computeSongMastery(FUR_ELISE, sp);
    expect(sm.sections.map((s) => s.id)).toEqual(['A1', 'B', 'A2']);
    expect(sm.sections.map((s) => s.stars)).toEqual([1, 2, 3]);
  });

  it('reports tempoTiersUnlocked', () => {
    // 50 is unlocked by default (support), so 50 + 60 + 75 = 3 tiers.
    const sp = spWith({ tempos: { 60: true, 75: true, 90: false, 100: false } });
    const sm = computeSongMastery(FUR_ELISE, sp);
    expect(sm.tempoTiersUnlocked).toBe(3);
    expect(sm.highestTempoUnlocked).toBe(75);
  });
});

describe('computeLibraryMastery', () => {
  it('returns zero rollup when nothing has been touched', () => {
    const lib = computeLibraryMastery([FUR_ELISE, ALLA_TURCA], defaultPracticeProgress());
    expect(lib.starsEarned).toBe(0);
    expect(lib.starsPossible).toBe(18); // 2 songs × 9 stars
    expect(lib.songsTouched).toBe(0);
    expect(lib.percent).toBe(0);
  });

  it('aggregates star counts across multiple songs', () => {
    const progress: PracticeProgress = {
      streakDays: [],
      streakCount: 0,
      songs: {
        fur_elise: spWith({ stars: { A1: 3, B: 3, A2: 3 }, tempos: { 100: true } }),
        alla_turca: spWith({ stars: { A: 1, B: 0, C: 0 } }),
      },
    };
    const lib = computeLibraryMastery([FUR_ELISE, ALLA_TURCA], progress);
    expect(lib.starsEarned).toBe(10);
    expect(lib.starsPossible).toBe(18);
    expect(lib.songsTouched).toBe(2);
    expect(lib.songsGold).toBe(1); // platinum counts toward gold
    expect(lib.songsPlatinum).toBe(1);
    expect(lib.percent).toBe(56);
  });
});

describe('pickNearCompletion', () => {
  it('ignores cold songs and platinum songs', () => {
    const progress: PracticeProgress = {
      streakDays: [],
      streakCount: 0,
      songs: {
        fur_elise: spWith({ stars: { A1: 3, B: 3, A2: 3 }, tempos: { 100: true } }),
        // alla_turca untouched
      },
    };
    const near = pickNearCompletion([FUR_ELISE, ALLA_TURCA], progress);
    expect(near).toEqual([]);
  });

  it('ranks lower starsToNext first', () => {
    const progress: PracticeProgress = {
      streakDays: [],
      streakCount: 0,
      songs: {
        // needs 1 star to go bronze → silver (2-3-3 has only A1 below 2)
        fur_elise: spWith({ stars: { A1: 1, B: 3, A2: 3 } }),
        // needs 5 stars to go silver → gold
        alla_turca: spWith({ stars: { A: 2, B: 2, C: 2 } }),
      },
    };
    const near = pickNearCompletion([FUR_ELISE, ALLA_TURCA], progress, 5);
    expect(near[0].songId).toBe('fur_elise');
    expect(near[0].starsToNext).toBe(1);
    expect(near[1].songId).toBe('alla_turca');
    expect(near[1].starsToNext).toBe(3);
  });

  it('reports which sections to focus on for the next seal', () => {
    const progress: PracticeProgress = {
      streakDays: [],
      streakCount: 0,
      songs: {
        fur_elise: spWith({ stars: { A1: 3, B: 1, A2: 2 } }),
      },
    };
    const near = pickNearCompletion([FUR_ELISE], progress);
    expect(near[0].weakSectionIds).toEqual(['B']);
  });

  it('respects the limit', () => {
    const songs: MasterySongDef[] = [
      { id: 's1', sectionIds: ['A'] },
      { id: 's2', sectionIds: ['A'] },
      { id: 's3', sectionIds: ['A'] },
      { id: 's4', sectionIds: ['A'] },
    ];
    const progress: PracticeProgress = {
      streakDays: [],
      streakCount: 0,
      songs: Object.fromEntries(
        songs.map((s) => [s.id, spWith({ stars: { A: 1 } })])
      ) as PracticeProgress['songs'],
    };
    expect(pickNearCompletion(songs, progress, 2).length).toBe(2);
  });
});

describe('weeklyLibraryGrowth', () => {
  const WK = 1_000_000; // arbitrary "Monday 00:00" ms for the week window

  it('returns no growth when there are no qualifying sections', () => {
    expect(weeklyLibraryGrowth([], WK)).toEqual({
      axis: null,
      gainPct: 0,
      sectionsCounted: 0,
    });
  });

  it('ignores sections with fewer than 2 attempts this week', () => {
    const g = weeklyLibraryGrowth([[{ d: WK + 1, a: 50, t: 50 }]], WK);
    expect(g.sectionsCounted).toBe(0);
    expect(g.axis).toBeNull();
  });

  it('excludes attempts from before the week start', () => {
    // First attempt is last week → only one in-week attempt remains → no pair.
    const g = weeklyLibraryGrowth(
      [
        [
          { d: WK - 5, a: 40, t: 40 },
          { d: WK + 5, a: 80, t: 80 },
        ],
      ],
      WK
    );
    expect(g.sectionsCounted).toBe(0);
  });

  it('reports the accuracy axis when accuracy improved most', () => {
    const g = weeklyLibraryGrowth(
      [
        [
          { d: WK + 1, a: 50, t: 60 },
          { d: WK + 2, a: 80, t: 65 },
        ],
      ],
      WK
    );
    expect(g.axis).toBe('accuracy');
    expect(g.gainPct).toBe(30);
    expect(g.sectionsCounted).toBe(1);
  });

  it('reports the timing axis when timing improved most', () => {
    const g = weeklyLibraryGrowth(
      [
        [
          { d: WK + 1, a: 70, t: 40 },
          { d: WK + 2, a: 72, t: 75 },
        ],
      ],
      WK
    );
    expect(g.axis).toBe('timing');
    expect(g.gainPct).toBe(35);
  });

  it('averages gains across sections', () => {
    const g = weeklyLibraryGrowth(
      [
        [
          { d: WK + 1, a: 40, t: 50 },
          { d: WK + 2, a: 60, t: 50 },
        ], // acc +20
        [
          { d: WK + 1, a: 50, t: 50 },
          { d: WK + 2, a: 90, t: 50 },
        ], // acc +40
      ],
      WK
    );
    expect(g.axis).toBe('accuracy');
    expect(g.gainPct).toBe(30); // (20 + 40) / 2
    expect(g.sectionsCounted).toBe(2);
  });

  it('is positive-only: a flat or down week shows nothing (no loss-frame)', () => {
    const g = weeklyLibraryGrowth(
      [
        [
          { d: WK + 1, a: 80, t: 80 },
          { d: WK + 2, a: 60, t: 70 },
        ],
      ],
      WK
    );
    expect(g.axis).toBeNull();
    expect(g.gainPct).toBe(0);
    // The section still counted toward the sample, it just didn't improve.
    expect(g.sectionsCounted).toBe(1);
  });
});
