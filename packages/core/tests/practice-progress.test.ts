import { describe, it, expect } from 'vitest';
import {
  defaultPracticeProgress,
  defaultSongProgress,
  getSongProgress,
  migrateAndDefaultProgress,
  recordPracticeMinutes,
  lifetimePracticeMinutes,
  MAX_MINUTES_PER_ATTEMPT,
  type PracticeProgress,
} from '../src/state/practice-progress';

describe('defaultPracticeProgress', () => {
  it('starts with no streak, no songs, no stamps, no minutes', () => {
    expect(defaultPracticeProgress()).toEqual({
      schemaVersion: 2,
      streakDays: [],
      streakCount: 0,
      songs: {},
      earnedStamps: {},
      minutesByDay: {},
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

  it('wipes songs + earnedStamps on a pre-v2 payload, preserving streak', () => {
    const raw = {
      streakDays: ['2026-04-15', '2026-04-16'],
      streakCount: 2,
      songs: {
        fur_elise: defaultSongProgress(),
      },
      earnedStamps: { first_section: 1700000000000 },
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.streakDays).toEqual(['2026-04-15', '2026-04-16']);
    expect(r.streakCount).toBe(2);
    expect(r.songs).toEqual({});
    expect(r.earnedStamps).toEqual({});
    expect(r.schemaVersion).toBe(2);
  });

  it('D1: sanitizes malformed v2 fields so a corrupt/tampered backup cannot crash the UI', () => {
    // streakDays が非配列だと song-panel の streakDays.includes() が投げて毎
    // リロード恒久クラッシュ。v2 マージでも型を検証して安全な既定へ落とす。
    const raw = {
      schemaVersion: 2,
      streakDays: 5, // ← 非配列（破損）
      streakCount: 'nope', // ← 非数値
      songs: [1, 2, 3], // ← 配列（不正）
      earnedStamps: 'x', // ← 非オブジェクト
      minutesByDay: null,
    };
    const r = migrateAndDefaultProgress(raw);
    expect(Array.isArray(r.streakDays)).toBe(true);
    expect(r.streakDays).toEqual([]);
    expect(r.streakCount).toBe(0);
    expect(r.songs).toEqual({});
    expect(r.earnedStamps).toEqual({});
    expect(r.minutesByDay).toEqual({});
  });

  it('D1: future schemaVersion (>CURRENT) is also sanitized, not passed through raw', () => {
    const raw = { schemaVersion: 99, streakDays: { bad: true }, songs: 'nope' };
    const r = migrateAndDefaultProgress(raw);
    expect(r.streakDays).toEqual([]);
    expect(r.songs).toEqual({});
  });

  it('D1: keeps valid v2 streakDays entries and drops non-string members', () => {
    const raw = { schemaVersion: 2, streakDays: ['2026-04-15', 42, null, '2026-04-16'] };
    const r = migrateAndDefaultProgress(raw);
    expect(r.streakDays).toEqual(['2026-04-15', '2026-04-16']);
  });

  it('wipes pre-v2 payloads even when schemaVersion is missing', () => {
    const raw = {
      streakDays: [],
      streakCount: 0,
      songs: {
        fur_elise: defaultSongProgress(),
      },
      // no schemaVersion → treated as v1
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.songs).toEqual({});
  });

  it('passes through a v2 payload untouched', () => {
    const raw: PracticeProgress = {
      schemaVersion: 2,
      streakDays: ['2026-05-01'],
      streakCount: 1,
      songs: {
        fur_elise: defaultSongProgress(),
      },
      earnedStamps: { combo_25: 1700000000000 },
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.streakDays).toEqual(['2026-05-01']);
    expect(r.songs.fur_elise).toBeDefined();
    expect(r.earnedStamps).toEqual({ combo_25: 1700000000000 });
  });

  it('preserves streak even when raw has no songs map', () => {
    const raw = { streakDays: ['2026-04-15'], streakCount: 1 };
    const r = migrateAndDefaultProgress(raw);
    expect(r.streakDays).toEqual(['2026-04-15']);
    expect(r.songs).toEqual({});
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

  it('preserves a saved lastSettings across the defaults merge (P2-20)', () => {
    const p = {
      streakDays: [],
      streakCount: 0,
      songs: {
        fur_elise: {
          sections: { A1: { stars: 2, bestPct: 60 } },
          lastSettings: { mode: 'rhythm', tempoPct: 90, handFilter: 'R' },
        },
      },
    } as unknown as PracticeProgress;
    const sp = getSongProgress(p, 'fur_elise');
    expect(sp.lastSettings).toEqual({ mode: 'rhythm', tempoPct: 90, handFilter: 'R' });
  });
});

describe('earnedStamps migration', () => {
  it('preserves an earnedStamps map on a v2 payload', () => {
    const raw = {
      schemaVersion: 2,
      streakDays: [],
      streakCount: 0,
      songs: {},
      earnedStamps: { first_section: 1700000000000 },
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.earnedStamps).toEqual({ first_section: 1700000000000 });
  });

  it('coerces a corrupt earnedStamps value to {} on a v2 payload', () => {
    const raw = {
      schemaVersion: 2,
      streakDays: [],
      streakCount: 0,
      songs: {},
      earnedStamps: 'not-an-object',
    };
    const r = migrateAndDefaultProgress(raw);
    expect(r.earnedStamps).toEqual({});
  });
});

// ─── practice minutes (P2-19) ────────────────────────────────────────

describe('recordPracticeMinutes / lifetimePracticeMinutes', () => {
  it('accumulates onto the day bucket and totals across days', () => {
    const p = defaultPracticeProgress();
    recordPracticeMinutes(p, '2026-07-19', 3.5);
    recordPracticeMinutes(p, '2026-07-19', 2.5);
    recordPracticeMinutes(p, '2026-07-20', 4);
    expect(p.minutesByDay['2026-07-19']).toBe(6);
    expect(lifetimePracticeMinutes(p)).toBe(10);
  });

  it('rejects non-finite / non-positive input', () => {
    const p = defaultPracticeProgress();
    recordPracticeMinutes(p, '2026-07-19', NaN);
    recordPracticeMinutes(p, '2026-07-19', -5);
    recordPracticeMinutes(p, '2026-07-19', 0);
    expect(p.minutesByDay['2026-07-19']).toBeUndefined();
    expect(lifetimePracticeMinutes(p)).toBe(0);
  });

  it('clamps a single attempt to MAX_MINUTES_PER_ATTEMPT (clock weirdness guard)', () => {
    const p = defaultPracticeProgress();
    recordPracticeMinutes(p, '2026-07-19', 9999);
    expect(p.minutesByDay['2026-07-19']).toBe(MAX_MINUTES_PER_ATTEMPT);
  });

  it('migrator fills minutesByDay on older payloads', () => {
    const raw = {
      schemaVersion: 2,
      streakDays: [],
      streakCount: 0,
      songs: {},
      earnedStamps: {},
      // no minutesByDay — pre-P2-19 payload
    };
    const p = migrateAndDefaultProgress(raw);
    expect(p.minutesByDay).toEqual({});
    // and it's writable immediately
    recordPracticeMinutes(p, '2026-07-19', 1);
    expect(lifetimePracticeMinutes(p)).toBe(1);
  });
});
