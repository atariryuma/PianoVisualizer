import { describe, it, expect } from 'vitest';
import {
  creditMinutesToDevice,
  mergeMinutesLedgers,
  mergeProgress,
  sumMinutesLedger,
  MERGE_MAX_SECTION_HISTORY,
  MERGE_MAX_STREAK_DAYS,
} from '../src/state/progress-merge';
import { defaultPracticeProgress, defaultSongProgress } from '../src/state/practice-progress';
import { longestStreakRun } from '../src/state/streak';

/** Small seeded PRNG: a failing property reproduces the same way every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomProgress(r: () => number) {
  const p = defaultPracticeProgress();
  const pick = (n: number): number => Math.floor(r() * n);
  for (const songId of ['fur_elise', 'k545', 'usr_a']) {
    if (r() < 0.3) continue;
    const song = defaultSongProgress();
    for (const id of ['A1', 'B', '__full']) {
      if (r() < 0.3) continue;
      song.sections[id] = {
        stars: pick(4),
        bestPct: pick(101),
        bestCombo: pick(50),
        unlockedTempos: { 50: true, 60: true, 75: r() < 0.5, 100: r() < 0.2 },
      };
      const rows = [];
      for (let i = pick(11); i > 0; i--) {
        rows.push({ d: 1000 + pick(40), a: pick(101), t: pick(101), s: pick(4) });
      }
      song.history[id] = rows;
    }
    p.songs[songId] = song;
  }
  for (let i = pick(8); i > 0; i--) {
    p.streakDays.push(`2026-03-${String(1 + pick(28)).padStart(2, '0')}`);
  }
  p.streakDays.sort();
  p.bestStreak = pick(5);
  for (const id of ['first_note', 'overnight_gain']) {
    if (r() < 0.5) p.earnedStamps[id] = 1000 + pick(100);
  }
  if (r() < 0.3) p.deletedSongs = { usr_a: 1000 + pick(60) };
  return p;
}

/** The deliberate exception: this device's own convenience state is local-first,
 *  so it is excluded from the order-independence properties. */
function joined(p: ReturnType<typeof mergeProgress>) {
  const { lastSongId: _a, ...rest } = JSON.parse(JSON.stringify(p));
  for (const s of Object.values(rest.songs) as Array<{ lastSettings?: unknown }>) {
    delete s.lastSettings;
  }
  return rest;
}

describe('mergeProgress: join laws', () => {
  it.each(Array.from({ length: 200 }, (_, i) => i))('holds for random saves (seed %i)', (seed) => {
    const r = rng(seed + 1);
    const a = randomProgress(r);
    const b = randomProgress(r);
    const c = randomProgress(r);

    // Commutative: which device merges first does not matter.
    expect(joined(mergeProgress(a, b))).toEqual(joined(mergeProgress(b, a)));
    // Associative: three devices converge whatever order they sync in.
    expect(joined(mergeProgress(mergeProgress(a, b), c))).toEqual(
      joined(mergeProgress(a, mergeProgress(b, c)))
    );
    // Idempotent: resyncing the same data changes nothing.
    const ab = mergeProgress(a, b);
    expect(joined(mergeProgress(ab, b))).toEqual(joined(ab));
    expect(joined(mergeProgress(ab, ab))).toEqual(joined(ab));
  });

  it.each(Array.from({ length: 100 }, (_, i) => i))('never loses progress (seed %i)', (seed) => {
    const r = rng(seed + 1000);
    const a = randomProgress(r);
    delete a.deletedSongs;
    const b = randomProgress(r);
    delete b.deletedSongs;
    const m = mergeProgress(a, b);
    for (const id of Object.keys(a.songs)) {
      for (const [sec, v] of Object.entries(a.songs[id].sections)) {
        expect(m.songs[id].sections[sec].stars).toBeGreaterThanOrEqual(v.stars);
        expect(m.songs[id].sections[sec].bestPct).toBeGreaterThanOrEqual(v.bestPct);
        expect(m.songs[id].sections[sec].bestCombo ?? 0).toBeGreaterThanOrEqual(v.bestCombo ?? 0);
        for (const [tier, on] of Object.entries(v.unlockedTempos ?? {})) {
          if (on) expect(m.songs[id].sections[sec].unlockedTempos?.[tier]).toBe(true);
        }
      }
    }
    expect(m.bestStreak ?? 0).toBeGreaterThanOrEqual(a.bestStreak ?? 0);
    expect(Object.keys(m.earnedStamps)).toEqual(
      expect.arrayContaining(Object.keys(a.earnedStamps))
    );
  });

  it('does not mutate its inputs', () => {
    const r = rng(7);
    const a = randomProgress(r);
    const b = randomProgress(r);
    const beforeA = JSON.stringify(a);
    const beforeB = JSON.stringify(b);
    mergeProgress(a, b);
    expect(JSON.stringify(a)).toBe(beforeA);
    expect(JSON.stringify(b)).toBe(beforeB);
  });
});

describe('mergeProgress: field rules', () => {
  it('takes the best of each section and ORs the tempo ladder', () => {
    const a = defaultPracticeProgress();
    a.songs.s = defaultSongProgress();
    a.songs.s.sections.A1 = {
      stars: 3,
      bestPct: 60,
      bestCombo: 5,
      unlockedTempos: { 75: true, 100: false },
    };
    const b = defaultPracticeProgress();
    b.songs.s = defaultSongProgress();
    b.songs.s.sections.A1 = {
      stars: 1,
      bestPct: 95,
      bestCombo: 40,
      unlockedTempos: { 75: false, 100: true },
    };
    const sec = mergeProgress(a, b).songs.s.sections.A1;
    expect(sec).toMatchObject({ stars: 3, bestPct: 95, bestCombo: 40 });
    expect(sec.unlockedTempos).toMatchObject({ 75: true, 100: true });
  });

  it('clamps out-of-range remote values instead of trusting them', () => {
    const b = defaultPracticeProgress();
    b.songs.s = defaultSongProgress();
    b.songs.s.sections.A1 = { stars: 999, bestPct: 5000 };
    const sec = mergeProgress(defaultPracticeProgress(), b).songs.s.sections.A1;
    expect(sec.stars).toBe(3);
    expect(sec.bestPct).toBe(100);
  });

  it('keeps the earliest stamp time', () => {
    const a = defaultPracticeProgress();
    a.earnedStamps.x = 500;
    const b = defaultPracticeProgress();
    b.earnedStamps.x = 100;
    b.earnedStamps.y = 900;
    expect(mergeProgress(a, b).earnedStamps).toEqual({ x: 100, y: 900 });
  });

  it('unions attempts by time, oldest first, capped to the rolling buffer', () => {
    const row = (d: number) => ({ d, a: 50, t: 50, s: 1 });
    const a = defaultPracticeProgress();
    a.songs.s = defaultSongProgress();
    a.songs.s.history.A1 = [row(1), row(3), row(5), row(7), row(9)];
    const b = defaultPracticeProgress();
    b.songs.s = defaultSongProgress();
    b.songs.s.history.A1 = [row(2), row(3), row(4), row(6), row(8), row(10)];
    const hist = mergeProgress(a, b).songs.s.history.A1 as Array<{ d: number }>;
    expect(hist).toHaveLength(MERGE_MAX_SECTION_HISTORY);
    expect(hist.map((h) => h.d)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('keeps the legacy flat history shape rather than dropping it', () => {
    const a = defaultPracticeProgress();
    a.songs.s = defaultSongProgress();
    a.songs.s.history['1700000000000'] = { stars: 2, pct: 80 };
    const m = mergeProgress(a, defaultPracticeProgress());
    expect(m.songs.s.history['1700000000000']).toEqual({ stars: 2, pct: 80 });
  });

  it('seeds the per-section ladder from an old song-level map before merging', () => {
    const a = {
      ...defaultPracticeProgress(),
      songs: {
        s: {
          sections: { A1: { stars: 3, bestPct: 90 } },
          unlockedTempos: { 100: true },
          history: {},
        },
      },
    };
    const m = mergeProgress(a, defaultPracticeProgress());
    expect(m.songs.s.sections.A1.unlockedTempos?.[100]).toBe(true);
    expect(m.songs.s.unlockedTempos).toBeUndefined();
  });

  it('builds the streak from both devices and never lowers the best', () => {
    const a = defaultPracticeProgress();
    a.streakDays = ['2026-03-01', '2026-03-03'];
    a.bestStreak = 1;
    const b = defaultPracticeProgress();
    b.streakDays = ['2026-03-02', '2026-03-10'];
    b.bestStreak = 1;
    const m = mergeProgress(a, b);
    expect(m.streakDays).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-10']);
    expect(m.streakCount).toBe(1);
    expect(m.bestStreak).toBe(3);
  });

  it('caps streak days at the same bound as the app and drops malformed keys', () => {
    const a = defaultPracticeProgress();
    for (let i = 0; i < 80; i++) {
      a.streakDays.push(new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
    }
    const b = defaultPracticeProgress();
    b.streakDays = ['not-a-day'];
    const m = mergeProgress(a, b);
    expect(m.streakDays).toHaveLength(MERGE_MAX_STREAK_DAYS);
    expect(m.streakDays).not.toContain('not-a-day');
    expect(m.streakDays[m.streakDays.length - 1]).toBe(a.streakDays[79]);
  });

  it('prefers this device for its own convenience state, filling gaps from remote', () => {
    const a = defaultPracticeProgress();
    a.lastSongId = 'mine';
    const b = defaultPracticeProgress();
    b.lastSongId = 'theirs';
    expect(mergeProgress(a, b).lastSongId).toBe('mine');
    expect(mergeProgress(defaultPracticeProgress(), b).lastSongId).toBe('theirs');
  });

  it('handles empty, null and garbage input', () => {
    expect(mergeProgress(null, null).songs).toEqual({});
    expect(mergeProgress(null, 'garbage').songs).toEqual({});
    const m = mergeProgress({ schemaVersion: 2, songs: { bad: 7 }, streakDays: 'x' }, null);
    expect(Object.keys(m.songs)).toEqual([]);
    expect(m.streakDays).toEqual([]);
  });

  it('cannot be used to pollute Object.prototype from remote JSON', () => {
    const remote = JSON.parse(
      '{"schemaVersion":2,"songs":{"__proto__":{"sections":{"__proto__":{"stars":3,"bestPct":1}},"history":{}}},' +
        '"earnedStamps":{"__proto__":5},"deletedSongs":{"__proto__":9},"streakDays":[]}'
    );
    mergeProgress(defaultPracticeProgress(), remote);
    const probe: Record<string, unknown> = {};
    expect(probe.stars).toBeUndefined();
    expect(probe.sections).toBeUndefined();
  });

  it('survives a JSON round trip (the merged maps are null-prototype)', () => {
    const r = rng(11);
    const m = mergeProgress(randomProgress(r), randomProgress(r));
    expect(JSON.parse(JSON.stringify(m))).toEqual(JSON.parse(JSON.stringify(m)));
    expect(joined(mergeProgress(JSON.parse(JSON.stringify(m)), null))).toEqual(joined(m));
  });
});

describe('mergeProgress: deleted songs', () => {
  function withSong(lastAttemptMs: number) {
    const p = defaultPracticeProgress();
    p.songs.usr = defaultSongProgress();
    p.songs.usr.sections.A1 = { stars: 3, bestPct: 90 };
    p.songs.usr.history.A1 = [{ d: lastAttemptMs, a: 90, t: 90, s: 3 }];
    return p;
  }

  it('does not bring a deleted song back from another device', () => {
    const deleter = defaultPracticeProgress();
    deleter.deletedSongs = { usr: 2000 };
    const m = mergeProgress(deleter, withSong(1000));
    expect(m.songs.usr).toBeUndefined();
    expect(m.deletedSongs).toEqual({ usr: 2000 });
  });

  it('stays deleted even with attempts newer than the deletion', () => {
    const deleter = defaultPracticeProgress();
    deleter.deletedSongs = { usr: 2000 };
    expect(mergeProgress(deleter, withSong(3000)).songs.usr).toBeUndefined();
  });

  it('uses the latest deletion when both devices deleted', () => {
    const a = defaultPracticeProgress();
    a.deletedSongs = { usr: 2000 };
    const b = defaultPracticeProgress();
    b.deletedSongs = { usr: 5000 };
    expect(mergeProgress(a, b).deletedSongs).toEqual({ usr: 5000 });
  });
});

describe('minutes ledger', () => {
  const DAY = '2026-03-01';

  it('adds up two devices practising on the same day', () => {
    const a = creditMinutesToDevice({}, 'ipad', { [DAY]: 10 }, {});
    const b = creditMinutesToDevice({}, 'phone', { [DAY]: 5 }, {});
    expect(sumMinutesLedger(mergeMinutesLedgers(a, b))[DAY]).toBe(15);
  });

  it('credits nothing on a resync (no double counting)', () => {
    let ledger = creditMinutesToDevice({}, 'ipad', { [DAY]: 10 }, {});
    for (let i = 0; i < 5; i++) {
      const total = sumMinutesLedger(ledger);
      ledger = mergeMinutesLedgers(
        ledger,
        creditMinutesToDevice(ledger, 'ipad', { ...total }, { ...total })
      );
    }
    expect(sumMinutesLedger(ledger)[DAY]).toBe(10);
  });

  it('credits only the increase since the baseline', () => {
    const ledger = creditMinutesToDevice(
      { ipad: { [DAY]: 10 } },
      'ipad',
      { [DAY]: 25 },
      {
        [DAY]: 20,
      }
    );
    expect(ledger.ipad[DAY]).toBe(15);
  });

  it('merges in any order, repeatedly', () => {
    const a = { ipad: { [DAY]: 10 } };
    const b = { ipad: { [DAY]: 4 }, phone: { [DAY]: 5 } };
    const ab = mergeMinutesLedgers(a, b);
    expect(ab).toEqual(mergeMinutesLedgers(b, a));
    expect(mergeMinutesLedgers(ab, b)).toEqual(ab);
    expect(sumMinutesLedger(ab)[DAY]).toBe(15);
  });

  it('ignores garbage cells and non-objects', () => {
    expect(mergeMinutesLedgers('x', null)).toEqual({});
    const m = mergeMinutesLedgers({ a: { d: 'nope', e: -3, f: 2 } }, { a: 7 });
    expect(m.a).toEqual({ f: 2 });
  });
});

describe('longestStreakRun', () => {
  it('finds a run in the middle, not only the tail', () => {
    expect(longestStreakRun([])).toBe(0);
    expect(longestStreakRun(['2026-03-01'])).toBe(1);
    expect(
      longestStreakRun(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-10', '2026-03-11'])
    ).toBe(3);
  });

  it('crosses a month boundary', () => {
    expect(longestStreakRun(['2026-02-28', '2026-03-01'])).toBe(2);
  });
});
