// Daily-streak counter — records ISO date keys of practice days and derives
// the consecutive-day count by walking backward from the most recent entry.
//
// The shell typically calls `recordPracticeDay(state, todayKey(), opts)` once
// per session start; same-day repeats are idempotent. The shell renders the
// last 7 days as a calendar (top-of-app strip) and the cached `streakCount`
// in the streak badge — both read directly off the state object after the
// reducer runs.
//
// All date math is timezone-agnostic by construction: keys are in local-time
// `YYYY-MM-DD` form so consecutive-day comparisons reduce to integer day
// diffs in UTC midnight (parsing the key as `T00:00:00` makes that explicit).
//
// Pure: state mutated in place. Caller injects "today" so tests are
// deterministic and clock-skew handling is observable.

export interface StreakState {
  /** Recorded practice day keys, ascending lex-order. */
  streakDays: string[];
  /** Most recent consecutive-day count. Derived from streakDays — written
   *  by `recordPracticeDay`, never set directly by the shell. NOTE: this
   *  DECREASES on a missed day and must NOT be surfaced in the UI (banned-
   *  list: decrementing streaks carry measured harm). Kept as the source
   *  for `bestStreak`; the UI shows `bestStreak` instead. */
  streakCount: number;
  /** Non-decreasing best-ever consecutive-day run. This is what the UI
   *  shows (banned-list-safe). Updated to max(bestStreak, streakCount) on
   *  every recorded day; never decreases. Optional in the type so older
   *  saves / test fixtures stay valid — init/default/migrate always set it,
   *  and every reader uses `?? 0`. */
  bestStreak?: number;
}

export interface StreakOptions {
  /** Trim `streakDays` so it never holds more than this many keys. The
   *  cap exists to keep the persisted progress payload bounded — only the
   *  most recent ones matter for the displayed calendar / streak. Legacy: 60. */
  maxDays: number;
}

/** Build a fresh state — no recorded days, count 0. */
export function initStreakState(): StreakState {
  return { streakDays: [], streakCount: 0, bestStreak: 0 };
}

/** Reset a populated state in place. Preserves the streakDays array
 *  reference so external readers caching it keep working. */
export function resetStreakState(state: StreakState): void {
  state.streakDays.length = 0;
  state.streakCount = 0;
  state.bestStreak = 0;
}

/** Format a Date as the canonical local-time day key. */
export function formatDateKey(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/**
 * Record a practice day. If the key already matches the most recent
 * recorded day, the call is a no-op (same-session re-entry, etc.).
 * Otherwise the key is appended, `streakCount` is recomputed by walking
 * backward, and the array is trimmed to `opts.maxDays`.
 *
 * Earlier-than-last keys (clock skewed backward) are appended too —
 * they'll fail the `diff === 1` check during the backward walk, which
 * resets the streak to 1. That matches legacy behavior.
 */
export function recordPracticeDay(state: StreakState, todayKey: string, opts: StreakOptions): void {
  const days = state.streakDays;
  if (days.length > 0 && days[days.length - 1] === todayKey) return;

  days.push(todayKey);
  state.streakCount = computeStreakCount(state);
  // 非減少のベストストリークを更新（UI はこちらを表示する）。
  state.bestStreak = Math.max(state.bestStreak ?? 0, state.streakCount);

  if (days.length > opts.maxDays) {
    days.splice(0, days.length - opts.maxDays);
  }
}

/** Walk backward from the most recent recorded day, counting consecutive
 *  days. Returns 0 when the array is empty, 1 when only one day, and the
 *  longest tail of consecutive integer day-diffs otherwise. */
export function computeStreakCount(state: StreakState): number {
  const days = state.streakDays;
  if (days.length === 0) return 0;
  let streak = 1;
  for (let i = days.length - 2; i >= 0; i--) {
    const cur = new Date(days[i + 1] + 'T00:00:00');
    const prev = new Date(days[i] + 'T00:00:00');
    const diff = Math.round((cur.valueOf() - prev.valueOf()) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}
