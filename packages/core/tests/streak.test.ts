import { describe, it, expect } from 'vitest';
import {
  computeStreakCount,
  formatDateKey,
  initStreakState,
  recordPracticeDay,
  resetStreakState,
  type StreakOptions,
  type StreakState,
} from '../src/state/streak';

const OPTS: StreakOptions = { maxDays: 60 };

describe('formatDateKey', () => {
  it('produces YYYY-MM-DD from a Date', () => {
    expect(formatDateKey(new Date(2026, 4, 6))).toBe('2026-05-06'); // May = month index 4
  });

  it('zero-pads single-digit month and day', () => {
    expect(formatDateKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('uses local time (not UTC)', () => {
    // A Date constructed with Y/M/D ints is local-time by spec.
    const d = new Date(2026, 11, 31, 23, 59);
    expect(formatDateKey(d)).toBe('2026-12-31');
  });
});

describe('initStreakState / resetStreakState', () => {
  it('initial state has no days and count 0', () => {
    expect(initStreakState()).toEqual({ streakDays: [], streakCount: 0, bestStreak: 0 });
  });

  it('reset empties a populated state in place', () => {
    const s: StreakState = {
      streakDays: ['2026-05-01', '2026-05-02'],
      streakCount: 2,
      bestStreak: 2,
    };
    resetStreakState(s);
    expect(s.streakDays).toEqual([]);
    expect(s.streakCount).toBe(0);
    expect(s.bestStreak).toBe(0);
  });

  it('reset preserves the streakDays array reference', () => {
    const s = initStreakState();
    const ref = s.streakDays;
    s.streakDays.push('2026-05-01');
    resetStreakState(s);
    expect(s.streakDays).toBe(ref);
  });
});

describe('bestStreak — non-decreasing (banned-list: no decrementing streak in UI)', () => {
  it('grows with the current streak then never drops when a day is missed', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2026-05-01', OPTS);
    recordPracticeDay(s, '2026-05-02', OPTS);
    recordPracticeDay(s, '2026-05-03', OPTS);
    expect(s.streakCount).toBe(3);
    expect(s.bestStreak).toBe(3);

    // 木・金を空けて土に練習 → 現在ストリークは 1 に落ちるが best は 3 のまま。
    recordPracticeDay(s, '2026-05-06', OPTS);
    expect(s.streakCount).toBe(1); // 減少する（UI には出さない）
    expect(s.bestStreak).toBe(3); // 非減少
  });
});

describe('recordPracticeDay — same day idempotent', () => {
  it('does not duplicate when called twice on the same day', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2026-05-06', OPTS);
    recordPracticeDay(s, '2026-05-06', OPTS);
    expect(s.streakDays).toEqual(['2026-05-06']);
    expect(s.streakCount).toBe(1);
  });
});

describe('recordPracticeDay — consecutive days grow streak', () => {
  it('two consecutive days → streak 2', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2026-05-05', OPTS);
    recordPracticeDay(s, '2026-05-06', OPTS);
    expect(s.streakCount).toBe(2);
  });

  it('seven consecutive days → streak 7', () => {
    const s = initStreakState();
    for (let i = 1; i <= 7; i++) {
      recordPracticeDay(s, `2026-05-${String(i).padStart(2, '0')}`, OPTS);
    }
    expect(s.streakCount).toBe(7);
  });

  it('streak survives a month boundary (April 30 → May 1)', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2026-04-29', OPTS);
    recordPracticeDay(s, '2026-04-30', OPTS);
    recordPracticeDay(s, '2026-05-01', OPTS);
    recordPracticeDay(s, '2026-05-02', OPTS);
    expect(s.streakCount).toBe(4);
  });

  it('streak survives a year boundary (Dec 31 → Jan 1)', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2025-12-30', OPTS);
    recordPracticeDay(s, '2025-12-31', OPTS);
    recordPracticeDay(s, '2026-01-01', OPTS);
    expect(s.streakCount).toBe(3);
  });
});

describe('recordPracticeDay — gap breaks streak', () => {
  it('one missed day resets streak to 1', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2026-05-01', OPTS);
    recordPracticeDay(s, '2026-05-02', OPTS);
    recordPracticeDay(s, '2026-05-03', OPTS);
    // skip the 4th
    recordPracticeDay(s, '2026-05-05', OPTS);
    expect(s.streakCount).toBe(1);
    expect(s.streakDays).toHaveLength(4);
  });

  it('a week-long gap also resets to 1', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2026-05-01', OPTS);
    recordPracticeDay(s, '2026-05-15', OPTS);
    expect(s.streakCount).toBe(1);
  });

  it('a backward clock-skew (today < last) appends but resets streak', () => {
    const s = initStreakState();
    recordPracticeDay(s, '2026-05-05', OPTS);
    recordPracticeDay(s, '2026-05-06', OPTS);
    expect(s.streakCount).toBe(2);
    // User's clock falls back to yesterday — diff is -1, neither 1
    recordPracticeDay(s, '2026-05-04', OPTS);
    expect(s.streakCount).toBe(1);
    expect(s.streakDays).toEqual(['2026-05-05', '2026-05-06', '2026-05-04']);
  });
});

describe('recordPracticeDay — maxDays trim', () => {
  it('trims oldest entries when array exceeds maxDays', () => {
    const s = initStreakState();
    const opts: StreakOptions = { maxDays: 5 };
    // Push 8 consecutive days; only the most recent 5 should survive.
    for (let i = 1; i <= 8; i++) {
      recordPracticeDay(s, `2026-05-${String(i).padStart(2, '0')}`, opts);
    }
    expect(s.streakDays).toEqual([
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
    ]);
  });

  it('count is computed BEFORE trim, so it caps at maxDays+1 once trimming kicks in', () => {
    const s = initStreakState();
    const opts: StreakOptions = { maxDays: 5 };
    // After day 5: count=5, no trim. After day 6: count=6 (walk on the
    // pre-trim 6-element array), then trim back to 5. Subsequent pushes
    // hit the same maxDays+1 ceiling because each push grows length to
    // maxDays+1, walks, then trims back to maxDays.
    for (let i = 1; i <= 8; i++) {
      recordPracticeDay(s, `2026-05-${String(i).padStart(2, '0')}`, opts);
    }
    expect(s.streakDays).toHaveLength(5);
    expect(s.streakCount).toBe(6); // maxDays(5) + 1
  });
});

describe('computeStreakCount — standalone', () => {
  it('returns 0 for an empty state', () => {
    expect(computeStreakCount(initStreakState())).toBe(0);
  });

  it('returns 1 for a single day', () => {
    const s: StreakState = { streakDays: ['2026-05-06'], streakCount: 0 };
    expect(computeStreakCount(s)).toBe(1);
  });

  it('walks backward only as far as the consecutive run goes', () => {
    const s: StreakState = {
      streakDays: ['2026-05-01', '2026-05-02', '2026-05-10', '2026-05-11', '2026-05-12'],
      streakCount: 0,
    };
    // Last three are consecutive; the gap before them stops the walk.
    expect(computeStreakCount(s)).toBe(3);
  });
});
