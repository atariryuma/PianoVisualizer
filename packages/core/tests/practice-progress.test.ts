import { describe, it, expect } from 'vitest';
import {
  defaultPracticeProgress,
  defaultSongProgress,
  getSongProgress,
  migrateAndDefaultProgress,
  type PracticeProgress,
} from '../src/state/practice-progress';

describe('defaultPracticeProgress', () => {
  it('starts with no streak, no songs, and no stamps', () => {
    expect(defaultPracticeProgress()).toEqual({
      streakDays: [],
      streakCount: 0,
      songs: {},
      earnedStamps: {},
    });
  });
});

describe('defaultSongProgress', () => {
  it('seeds A1/B/A2 sections at 0 stars', () => {
    const s = defaultSongProgress();
    expect(s.sections.A1).toEqual({ stars: 0, bestPct: 0 });
    expect(s.sections.B).toEqual({ stars: 0, bestPct: 0 });
    expect(s.sections.A2).toEqual({ stars: 0, bestPct: 0 });
  });

  it('unlocks the 60-bpm tier and the A1 section by default', () => {
    const s = defaultSongProgress();
    expect(s.unlockedTempos[60]).toBe(true);
    expect(s.unlockedTempos[75]).toBe(false);
    expect(s.unlockedSections.A1).toBe(true);
    expect(s.unlockedSections.B).toBe(false);
  });

  it('starts with empty history', () => {
    expect(defaultSongProgress().history).toEqual({});
  });
});

describe('migrateAndDefaultProgress', () => {
  it('returns the default shape for null', () => {
    expect(migrateAndDefaultProgress(null)).toEqual(defaultPracticeProgress());
  });

  it('returns the default shape for undefined', () => {
    expect(migrateAndDefaultProgress(undefined)).toEqual(defaultPracticeProgress());
  });

  it('returns the default shape for a non-object value', () => {
    expect(migrateAndDefaultProgress(42)).toEqual(defaultPracticeProgress());
    expect(migrateAndDefaultProgress('foo')).toEqual(defaultPracticeProgress());
  });

  it('passes through a well-formed v1 payload', () => {
    const raw: PracticeProgress = {
      streakDays: ['2026-05-01'],
      streakCount: 1,
      songs: {
        fur_elise: defaultSongProgress(),
      },
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.streakDays).toEqual(['2026-05-01']);
    expect(r.songs.fur_elise).toBeDefined();
  });

  it('migrates v0 (top-level sections) into songs.fur_elise', () => {
    const raw = {
      streakDays: ['2026-04-15'],
      streakCount: 1,
      sections: {
        A1: { stars: 3, bestPct: 95 },
        B: { stars: 1, bestPct: 60 },
        A2: { stars: 0, bestPct: 0 },
      },
      unlockedTempos: { 60: true, 75: true, 90: false, 100: false },
      unlockedSections: { A1: true, B: true, A2: false },
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.songs.fur_elise).toBeDefined();
    expect(r.songs.fur_elise.sections.A1).toEqual({ stars: 3, bestPct: 95 });
    expect(r.songs.fur_elise.unlockedTempos[75]).toBe(true);
    expect(r.songs.fur_elise.unlockedSections.B).toBe(true);
    // Legacy keys removed.
    expect((r as unknown as Record<string, unknown>).sections).toBeUndefined();
    expect((r as unknown as Record<string, unknown>).unlockedTempos).toBeUndefined();
    expect((r as unknown as Record<string, unknown>).unlockedSections).toBeUndefined();
    // Streak data preserved.
    expect(r.streakCount).toBe(1);
  });

  it('falls back to default tempo / section unlocks when v0 lacks them', () => {
    const raw = {
      sections: {
        A1: { stars: 0, bestPct: 0 },
        B: { stars: 0, bestPct: 0 },
        A2: { stars: 0, bestPct: 0 },
      },
      // No unlockedTempos / unlockedSections.
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.songs.fur_elise.unlockedTempos).toEqual({
      60: true,
      75: false,
      90: false,
      100: false,
    });
    expect(r.songs.fur_elise.unlockedSections).toEqual({ A1: true, B: false, A2: false });
  });

  it('does NOT touch a v1 payload that already has songs', () => {
    const raw = {
      sections: { A1: { stars: 1, bestPct: 50 } }, // stale legacy field
      songs: {
        alla_turca: defaultSongProgress(),
      },
    };
    const r = migrateAndDefaultProgress(raw);
    // sections key should still exist (v1 path doesn't migrate)
    // — but Object.assign(def, raw) carries it through. That's an
    // accepted oddity of the legacy migration: stale v0 keys persist
    // until the next save() round-trips through the v1 schema.
    // The point of THIS assertion: the songs map wasn't clobbered.
    expect(r.songs.alla_turca).toBeDefined();
    expect(r.songs.fur_elise).toBeUndefined();
  });
});

describe('getSongProgress', () => {
  it('lazily creates a per-song bucket on first access', () => {
    const p = defaultPracticeProgress();
    expect(p.songs.fur_elise).toBeUndefined();
    const sp = getSongProgress(p, 'fur_elise');
    expect(p.songs.fur_elise).toBe(sp);
  });

  it('returns the existing bucket on subsequent calls', () => {
    const p = defaultPracticeProgress();
    const sp1 = getSongProgress(p, 'fur_elise');
    sp1.sections.A1.stars = 3;
    const sp2 = getSongProgress(p, 'fur_elise');
    expect(sp2).toBe(sp1);
    expect(sp2.sections.A1.stars).toBe(3);
  });

  it('mass-defaults missing per-song keys (forward compat for older payloads)', () => {
    const p: PracticeProgress = {
      streakDays: [],
      streakCount: 0,
      songs: {
        old_song: {
          sections: { A1: { stars: 1, bestPct: 50 } } as Record<string, never>,
          unlockedTempos: {} as Record<string, never>,
          unlockedSections: {} as Record<string, never>,
          history: undefined as unknown as Record<string, never>,
        },
      },
    };
    const sp = getSongProgress(p, 'old_song');
    // A1's user data preserved
    expect(sp.sections.A1.stars).toBe(1);
    // B + A2 defaults filled in
    expect(sp.sections.B).toEqual({ stars: 0, bestPct: 0 });
    expect(sp.sections.A2).toEqual({ stars: 0, bestPct: 0 });
    // unlock defaults filled in
    expect(sp.unlockedTempos[60]).toBe(true);
    expect(sp.unlockedSections.A1).toBe(true);
    // history initialized
    expect(sp.history).toEqual({});
  });

  it('initializes the songs map if missing', () => {
    const p = { streakDays: [], streakCount: 0 } as unknown as PracticeProgress;
    const sp = getSongProgress(p, 'fur_elise');
    expect(p.songs).toBeDefined();
    expect(sp).toBe(p.songs.fur_elise);
  });
});

describe('earnedStamps migration', () => {
  it('fills earnedStamps={} on a pre-0.14 v1 payload', () => {
    const raw = {
      streakDays: ['2026-05-01'],
      streakCount: 1,
      songs: { fur_elise: defaultSongProgress() },
      // earnedStamps absent — older payload
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.earnedStamps).toEqual({});
  });

  it('preserves an existing earnedStamps map', () => {
    const raw = {
      streakDays: [],
      streakCount: 0,
      songs: {},
      earnedStamps: { first_section: 1700000000000 },
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.earnedStamps).toEqual({ first_section: 1700000000000 });
  });

  it('coerces a corrupt earnedStamps value to {}', () => {
    const raw = {
      streakDays: [],
      streakCount: 0,
      songs: {},
      earnedStamps: 'not-an-object',
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.earnedStamps).toEqual({});
  });
});
