import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_STAMPS,
  applyStampEvaluation,
  groupStampsByCategory,
  stampHelpers,
  type StampContext,
  type StampDef,
} from '../src/state/stamps';
import {
  defaultPracticeProgress,
  defaultSongProgress,
  type PracticeProgress,
} from '../src/state/practice-progress';

function freshProgress(): PracticeProgress {
  return defaultPracticeProgress();
}

function attempt(over: Partial<StampContext['attempt']> = {}): StampContext['attempt'] {
  return {
    songId: 'fur_elise',
    sectionId: 'A1',
    stars: 0,
    accPct: 0,
    tempoPct: 60,
    sectionBestCombo: 0,
    isListenMode: false,
    priorBestPct: 0,
    priorStars: 0,
    ...over,
  };
}

function ctx(progress: PracticeProgress, over: Partial<StampContext> = {}): StampContext {
  return {
    progress,
    attempt: attempt(),
    knownSongIds: ['fur_elise'],
    // Default = the standard 3-section song, so existing whole-song stamp
    // tests keep their A1/B/A2 semantics. Single-section cases pass their own.
    sectionIds: ['A1', 'B', 'A2'],
    ...over,
  };
}

describe('applyStampEvaluation — basics', () => {
  it('returns empty when nothing qualifies', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p));
    expect(r.newlyEarned).toEqual([]);
  });

  it('awards a stamp the moment its predicate fires', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 2, accPct: 75 }) }));
    expect(r.newlyEarned).toContain('first_section');
    expect(p.earnedStamps['first_section']).toBeGreaterThan(0);
  });

  it('does not re-award an already-earned stamp', () => {
    const p = freshProgress();
    p.earnedStamps['first_section'] = 1234567890;
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 3, accPct: 90 }) }));
    expect(r.newlyEarned).not.toContain('first_section');
    expect(p.earnedStamps['first_section']).toBe(1234567890);
  });

  it('listen-mode attempts skip predicates gated on real play', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(
      ctx(p, { attempt: attempt({ stars: 0, accPct: 0, isListenMode: true }) })
    );
    expect(r.newlyEarned).not.toContain('first_section');
    expect(r.newlyEarned).not.toContain('perfect_accuracy');
  });
});

describe('completion stamps', () => {
  it('awards first_three_star at 3 stars', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 3, accPct: 100 }) }));
    expect(r.newlyEarned).toContain('first_three_star');
  });

  it('awards song_all_sections_cleared when every section has >=1 star', () => {
    const p = freshProgress();
    const sp = defaultSongProgress();
    sp.sections.A1 = { stars: 1, bestPct: 50 };
    sp.sections.B = { stars: 1, bestPct: 50 };
    sp.sections.A2 = { stars: 2, bestPct: 70 };
    p.songs.fur_elise = sp;
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ sectionId: 'A2', stars: 2 }) }));
    expect(r.newlyEarned).toContain('song_all_sections_cleared');
  });

  it('awards song_gold when every section has >=3 stars', () => {
    const p = freshProgress();
    const sp = defaultSongProgress();
    sp.sections.A1 = { stars: 3, bestPct: 100 };
    sp.sections.B = { stars: 3, bestPct: 100 };
    sp.sections.A2 = { stars: 3, bestPct: 100 };
    p.songs.fur_elise = sp;
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ sectionId: 'A2', stars: 3 }) }));
    expect(r.newlyEarned).toContain('song_gold');
    expect(r.newlyEarned).toContain('song_silver');
  });

  it('awards tempo_100_unlocked when the song now has 100% tempo unlocked', () => {
    const p = freshProgress();
    const sp = defaultSongProgress();
    sp.unlockedTempos['100'] = true;
    p.songs.fur_elise = sp;
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 1 }) }));
    expect(r.newlyEarned).toContain('tempo_100_unlocked');
  });

  // Phantom-section regression: a 1-section song (real sections = ['A1'])
  // must earn the whole-song stamps on clearing its ONLY section — the
  // injected phantom B/A2 (which the song doesn't have) must not block them.
  it('awards song_gold/silver/all-sections for a single-section song (real sections only)', () => {
    const p = freshProgress();
    const sp = defaultSongProgress(); // still injects phantom A1/B/A2 entries
    sp.sections.A1 = { stars: 3, bestPct: 100 };
    // B / A2 stay at the injected 0★ — but the song has only A1.
    p.songs.short_one = sp;
    const r = applyStampEvaluation(
      ctx(p, {
        attempt: attempt({ songId: 'short_one', sectionId: 'A1', stars: 3 }),
        sectionIds: ['A1'], // the song's REAL sections
      })
    );
    expect(r.newlyEarned).toContain('song_gold');
    expect(r.newlyEarned).toContain('song_silver');
    expect(r.newlyEarned).toContain('song_all_sections_cleared');
  });

  it('does NOT award song_gold when a real section is still below 3★', () => {
    const p = freshProgress();
    const sp = defaultSongProgress();
    sp.sections.A1 = { stars: 3, bestPct: 100 };
    sp.sections.B = { stars: 1, bestPct: 40 }; // real, not yet mastered
    p.songs.two_sec = sp;
    const r = applyStampEvaluation(
      ctx(p, {
        attempt: attempt({ songId: 'two_sec', sectionId: 'A1', stars: 3 }),
        sectionIds: ['A1', 'B'],
      })
    );
    expect(r.newlyEarned).not.toContain('song_gold');
  });
});

describe('performance stamps', () => {
  it('awards combo_25 at >=25 combo', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ sectionBestCombo: 25 }) }));
    expect(r.newlyEarned).toContain('combo_25');
  });

  it('awards combo_100 at >=100 combo (and its predecessors)', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ sectionBestCombo: 120 }) }));
    expect(r.newlyEarned).toContain('combo_25');
    expect(r.newlyEarned).toContain('combo_50');
    expect(r.newlyEarned).toContain('combo_100');
  });

  it('awards perfect_accuracy at 100%', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ accPct: 100, stars: 3 }) }));
    expect(r.newlyEarned).toContain('perfect_accuracy');
  });

  it('awards flow_peak_max only at >=98', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const at98 = applyStampEvaluation(
      ctx(p, { attempt: attempt({ stars: 1 }), sessionPeakFlow: 98 })
    );
    expect(at98.newlyEarned).toContain('flow_peak_max');

    const p2 = freshProgress();
    p2.songs.fur_elise = defaultSongProgress();
    const at90 = applyStampEvaluation(
      ctx(p2, { attempt: attempt({ stars: 1 }), sessionPeakFlow: 90 })
    );
    expect(at90.newlyEarned).not.toContain('flow_peak_max');
    expect(at90.newlyEarned).toContain('flow_peak_80');
  });

  it('omits flow stamps when sessionPeakFlow is missing', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 1 }) }));
    expect(r.newlyEarned).not.toContain('flow_peak_80');
    expect(r.newlyEarned).not.toContain('flow_peak_max');
  });
});

describe('practice stamps', () => {
  it('awards same_section_5x when history reaches 5 attempts', () => {
    const p = freshProgress();
    const sp = defaultSongProgress();
    sp.history['A1'] = [
      { d: 1, a: 50, t: 50, s: 1 },
      { d: 2, a: 55, t: 55, s: 1 },
      { d: 3, a: 60, t: 60, s: 2 },
      { d: 4, a: 65, t: 65, s: 2 },
      { d: 5, a: 70, t: 70, s: 2 },
    ];
    p.songs.fur_elise = sp;
    const r = applyStampEvaluation(
      ctx(p, { attempt: attempt({ sectionId: 'A1', stars: 2, accPct: 70, priorBestPct: 65 }) })
    );
    expect(r.newlyEarned).toContain('same_section_5x');
  });

  it('awards comeback_kid when accPct beats priorBestPct by >=20', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(
      ctx(p, { attempt: attempt({ stars: 2, accPct: 80, priorBestPct: 50 }) })
    );
    expect(r.newlyEarned).toContain('comeback_kid');
  });

  it('awards star_up when stars went up to >=2', () => {
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 2, priorStars: 1 }) }));
    expect(r.newlyEarned).toContain('star_up');
  });

  it('awards slow_tempo_5 when 5 sections in history at tempo 60 with >=50% accuracy', () => {
    const p = freshProgress();
    for (let i = 0; i < 5; i++) {
      const sp = defaultSongProgress();
      sp.history['A1'] = [
        // attempt records — note the shell's modern shape is {d,a,t,s} but our
        // helper looks at tempoPct in the older AttemptRecord shape, so we
        // include it explicitly here.
        { d: i, a: 70, t: 60, s: 1, tempoPct: 60 } as unknown as {
          d: number;
          a: number;
          t: number;
          s: number;
        },
      ];
      p.songs[`song_${i}`] = sp;
    }
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ songId: 'song_0', stars: 1 }) }));
    expect(r.newlyEarned).toContain('slow_tempo_5');
  });
});

describe('milestone stamps', () => {
  it('awards two_songs_touched after 2 songs have any star', () => {
    const p = freshProgress();
    p.songs.song_a = defaultSongProgress();
    p.songs.song_a.sections.A1.stars = 1;
    p.songs.song_b = defaultSongProgress();
    p.songs.song_b.sections.A1.stars = 1;
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ songId: 'song_b', stars: 1 }) }));
    expect(r.newlyEarned).toContain('two_songs_touched');
  });

  it('awards lifetime_3_days when streakDays length reaches 3', () => {
    const p = freshProgress();
    p.streakDays = ['2026-05-14', '2026-05-15', '2026-05-16'];
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 1 }) }));
    expect(r.newlyEarned).toContain('lifetime_3_days');
  });

  it('does not award lifetime_7_days at 6 days', () => {
    const p = freshProgress();
    p.streakDays = ['1', '2', '3', '4', '5', '6'];
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 1 }) }));
    expect(r.newlyEarned).not.toContain('lifetime_7_days');
    expect(r.newlyEarned).toContain('lifetime_3_days');
  });
});

describe('groupStampsByCategory', () => {
  it('emits non-empty bins for every category in DEFAULT_STAMPS', () => {
    const groups = groupStampsByCategory(DEFAULT_STAMPS);
    expect(groups.completion.length).toBeGreaterThan(0);
    expect(groups.performance.length).toBeGreaterThan(0);
    expect(groups.practice.length).toBeGreaterThan(0);
    expect(groups.milestone.length).toBeGreaterThan(0);
  });

  it('preserves the DEFAULT_STAMPS table order within each bin', () => {
    const groups = groupStampsByCategory(DEFAULT_STAMPS);
    const ids = groups.completion.map((d) => d.id);
    expect(ids[0]).toBe('first_section');
  });
});

describe('stampHelpers', () => {
  describe('distinctSectionsToday', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-16T06:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('counts only sections played today', () => {
      const p = freshProgress();
      const sp = defaultSongProgress();
      const todayMs = Date.now();
      const yesterdayMs = todayMs - 86400000;
      sp.history['A1'] = [{ d: todayMs - 1000, a: 50, t: 50, s: 1 }];
      sp.history['B'] = [{ d: todayMs - 2000, a: 50, t: 50, s: 1 }];
      sp.history['A2'] = [{ d: yesterdayMs, a: 50, t: 50, s: 1 }];
      p.songs.fur_elise = sp;
      expect(stampHelpers.distinctSectionsToday(p, todayMs)).toBe(2);
    });
  });

  it('isSongFullyThreeStar requires every section at 3 stars', () => {
    const p = freshProgress();
    const sp = defaultSongProgress();
    sp.sections.A1.stars = 3;
    sp.sections.B.stars = 3;
    sp.sections.A2.stars = 2;
    p.songs.fur_elise = sp;
    const ids = ['A1', 'B', 'A2'];
    expect(stampHelpers.isSongFullyThreeStar(p, 'fur_elise', ids)).toBe(false);

    sp.sections.A2.stars = 3;
    expect(stampHelpers.isSongFullyThreeStar(p, 'fur_elise', ids)).toBe(true);
  });
});

describe('custom defs', () => {
  it('lets callers swap the stamp table for tests', () => {
    const def: StampDef = {
      id: 'custom_x',
      nameKey: 'x',
      descKey: 'xd',
      earnedKey: 'xe',
      icon: '🧩',
      category: 'completion',
      rarity: 'common',
      evaluate: (c) => c.attempt.stars >= 1,
    };
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 1 }) }), [def]);
    expect(r.newlyEarned).toEqual(['custom_x']);
    expect(p.earnedStamps).toEqual({ custom_x: expect.any(Number) });
  });

  it('catches throws in evaluators (returns false instead of crashing)', () => {
    const buggy: StampDef = {
      id: 'throws',
      nameKey: 'x',
      descKey: 'xd',
      earnedKey: 'xe',
      icon: '💥',
      category: 'completion',
      rarity: 'common',
      evaluate: () => {
        throw new Error('boom');
      },
    };
    const p = freshProgress();
    p.songs.fur_elise = defaultSongProgress();
    const r = applyStampEvaluation(ctx(p, { attempt: attempt({ stars: 1 }) }), [buggy]);
    expect(r.newlyEarned).toEqual([]);
  });
});
