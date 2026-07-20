// Persisted practice progress — the JSON blob the legacy shell saves
// under localStorage key `pianoViz_practice_v1`. Holds:
//
//   * Daily-streak day list + cached count (consumed by state/streak.ts).
//   * Per-song progress: per-section star + bestPct, unlock state for
//     tempo tiers and section IDs, and a per-section attempt history.
//
// This module owns:
//
//   * `defaultPracticeProgress` / `defaultSongProgress`  — fresh-state
//     factories. Schema migrations from older formats land here.
//   * `migrateAndDefaultProgress(raw)`  — turns whatever localStorage
//     handed back (null, partial v0, full v1, etc.) into a guaranteed
//     well-formed `PracticeProgress`. Pure: no localStorage reads.
//   * `getSongProgress(progress, songId)`  — lazily creates the per-
//     song bucket on first access, mass-defaults missing keys (so a
//     payload from a build that pre-dates a new section ID still
//     works), and returns the per-song record for read/write.
//
// Pure: caller hands raw JSON in, hands the typed shape out. The shell
// keeps the localStorage read / write at the call boundary.

import type { StreakState } from './streak';

/** Per-section best-attempt summary. `bestPct` is 0–100. `stars` is
 *  0–3 — capped by RESULT_TIERS in resolveResultTier. */
export interface SectionProgress {
  stars: number;
  bestPct: number;
}

/** A single attempt's record, keyed inside `SongProgress.history`
 *  (legacy uses ms-since-epoch for the key). The shell prunes old
 *  history entries; we don't shape that here. */
export interface AttemptRecord {
  /** Star count for this attempt. */
  stars?: number;
  /** Hit percentage (0–100) for this attempt. */
  pct?: number;
  /** Tempo% used (60–100). */
  tempoPct?: number;
  /** Section ID. */
  sec?: string;
  /** Free-form scratch field — older builds stored mode hints here. */
  [key: string]: unknown;
}

/** Per-song progress bucket. */
export interface SongProgress {
  /** Section-id → best-attempt summary. The default keys are A1 / B / A2; new
   *  song schemas can add more by setting `defaultSectionIds`. */
  sections: Record<string, SectionProgress>;
  /** Tempo tier → unlocked. Lower-tempo tiers default unlocked; higher
   *  unlock as the player meets the star threshold. */
  unlockedTempos: Record<string, boolean>;
  /** Section ID → unlocked. A1 starts unlocked; B / A2 unlock by play. */
  unlockedSections: Record<string, boolean>;
  /** Attempt history. Two shape variants in the wild:
   *  - Modern (legacy shell): `Record<sectionId, Array<{d,a,t,s}>>` — per-section
   *    rolling buffer of the last 8 attempts; drives the result-screen growth chart.
   *  - Older / placeholder: `Record<msEpoch, AttemptRecord>` — flat per-attempt log.
   *  The shell migrator (`migrateAndDefaultProgress`) keeps both in scope so a
   *  future schema bump can pick one canonical shape. Until then this typedef
   *  accepts either. */
  history: Record<
    string,
    AttemptRecord | Array<{ d: number; a: number; t: number; s: number; tempoPct?: number }>
  >;
  /** Last practice settings for this song — restored on re-select so the
   *  kid doesn't have to re-pick tempo / hand / mode every session.
   *  Optional (absent on older saves + first play). */
  lastSettings?: { mode?: string; tempoPct?: number; handFilter?: 'L' | 'R' | null };
}

/** Schema version bumped on breaking semantic changes. Payloads with a
 *  lower number are rewritten on load — see `migrateAndDefaultProgress`. */
export const CURRENT_SCHEMA_VERSION = 2;

/** Top-level shape persisted under `pianoViz_practice_v1`. The streak
 *  fields satisfy `StreakState` so streak.ts's reducer can mutate this
 *  directly without a separate state object. */
export interface PracticeProgress extends StreakState {
  schemaVersion: number;
  songs: Record<string, SongProgress>;
  /** Stamp ID → epoch-ms timestamp earned. Populated by stamps.ts's
   *  evaluator at section-complete time. Missing on payloads written
   *  before 0.14; `migrateAndDefaultProgress` fills an empty object so
   *  callers can write into it without a presence check. */
  earnedStamps: Record<string, number>;
  /** dateKey (YYYY-MM-DD) → practice minutes that day (float). Cumulative,
   *  monotonically non-decreasing — no daily goals, no decay, never shown
   *  as a shortfall (banned-list). Missing on older payloads; the migrator
   *  fills an empty object. */
  minutesByDay: Record<string, number>;
}

/** Build a fresh per-song progress bucket — empty sections at 0 stars,
 *  60-bpm tier unlocked, A1 section unlocked. */
export function defaultSongProgress(): SongProgress {
  return {
    sections: {
      A1: { stars: 0, bestPct: 0 },
      B: { stars: 0, bestPct: 0 },
      A2: { stars: 0, bestPct: 0 },
    },
    // 50 + 60 unlocked from the start — slowing down is SUPPORT, never a
    // reward to earn (banned-list). 75/90/100 are the earned speed-up
    // ladder. getSongProgress merges this default so existing saves
    // auto-gain the 50% step.
    unlockedTempos: { 50: true, 60: true, 75: false, 90: false, 100: false },
    unlockedSections: { A1: true, B: false, A2: false },
    history: {},
  };
}

/** Build a fresh top-level progress blob — no streak, no songs. */
export function defaultPracticeProgress(): PracticeProgress {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    streakDays: [],
    streakCount: 0,
    bestStreak: 0,
    songs: {},
    earnedStamps: {},
    minutesByDay: {},
  };
}

/** Return a well-formed PracticeProgress from raw localStorage JSON.
 *  Payloads below CURRENT_SCHEMA_VERSION are wiped (songs + earnedStamps)
 *  because mode wasn't recorded per-attempt — guided credit can't be
 *  separated from rhythm. streakDays survives. */
export function migrateAndDefaultProgress(raw: unknown): PracticeProgress {
  const def = defaultPracticeProgress();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Record<string, unknown>;
  const rawVersion = typeof r.schemaVersion === 'number' ? r.schemaVersion : 1;

  if (rawVersion < CURRENT_SCHEMA_VERSION) {
    const sc = typeof r.streakCount === 'number' ? r.streakCount : 0;
    return {
      ...def,
      streakDays: Array.isArray(r.streakDays) ? (r.streakDays as string[]) : [],
      streakCount: sc,
      // 旧セーブに bestStreak は無いので、現ストリークで seed（非減少の起点）。
      bestStreak:
        typeof r.bestStreak === 'number' && r.bestStreak >= 0 ? Math.max(r.bestStreak, sc) : sc,
    };
  }

  const merged = Object.assign(def, r) as PracticeProgress;
  // v2 マージは Object.assign で raw をそのまま素通しするため、各フィールドの
  // 型を検証する。prefs はロード時に sanitizePrefs で必ず浄化されるのに progress
  // 側にはこの浄化が無く、破損/改竄/未来版バックアップの取り込みで例えば
  // streakDays が非配列だと song-panel の `streakDays.includes()` が投げ、毎
  // リロード恒久 UI クラッシュになる（未来版 schemaVersion>CURRENT もここに来る）。
  const plainObj = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!plainObj(merged.songs)) merged.songs = {};
  merged.streakDays = Array.isArray(merged.streakDays)
    ? merged.streakDays.filter((x): x is string => typeof x === 'string')
    : [];
  merged.streakCount =
    typeof merged.streakCount === 'number' && merged.streakCount >= 0 ? merged.streakCount : 0;
  // bestStreak は非減少。無効/未保存なら現ストリークで seed。既存 best と現
  // ストリークの大きい方を採る（過去の best を下回らせない）。
  merged.bestStreak = Math.max(
    typeof merged.bestStreak === 'number' && merged.bestStreak >= 0 ? merged.bestStreak : 0,
    merged.streakCount
  );
  if (!plainObj(merged.earnedStamps)) merged.earnedStamps = {};
  if (!plainObj(merged.minutesByDay)) merged.minutesByDay = {};
  return merged;
}

// =====================================================================
// Practice minutes (lifetime-accumulating; banned-list-safe by design)
// =====================================================================

/** Per-section clamp: a single completion can't add more than this many
 *  minutes (guards clock weirdness — tab sleep, Tone context resets). */
export const MAX_MINUTES_PER_ATTEMPT = 30;

/** Accumulate practice minutes onto today's bucket. Pure mutation helper —
 *  the caller persists. Rejects non-finite / non-positive input, clamps a
 *  single attempt to MAX_MINUTES_PER_ATTEMPT. Never decrements. */
export function recordPracticeMinutes(
  progress: PracticeProgress,
  dateKey: string,
  minutes: number
): void {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const add = Math.min(minutes, MAX_MINUTES_PER_ATTEMPT);
  if (!progress.minutesByDay || typeof progress.minutesByDay !== 'object') {
    progress.minutesByDay = {};
  }
  progress.minutesByDay[dateKey] = (progress.minutesByDay[dateKey] ?? 0) + add;
}

/** Lifetime total practice minutes (float — callers round for display). */
export function lifetimePracticeMinutes(progress: PracticeProgress): number {
  const byDay = progress.minutesByDay;
  if (!byDay || typeof byDay !== 'object') return 0;
  let total = 0;
  for (const k of Object.keys(byDay)) {
    const v = byDay[k];
    if (Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

/**
 * Get (or lazily create) the per-song bucket for `songId`, mass-
 * defaulting any missing keys against `defaultSongProgress` so a
 * payload from an older build still works after we add new sections /
 * tempo tiers.
 *
 * Mutates `progress` in place — both the lazy creation and the
 * defaulting fill missing fields rather than returning a new copy
 * (matches the legacy shell's expectation that `practice.progress` is
 * a long-lived state object).
 */
export function getSongProgress(progress: PracticeProgress, songId: string): SongProgress {
  if (!progress.songs) progress.songs = {};
  if (!progress.songs[songId]) {
    progress.songs[songId] = defaultSongProgress();
  }
  const s = progress.songs[songId];
  const def = defaultSongProgress();
  s.sections = Object.assign({}, def.sections, s.sections);
  s.unlockedTempos = Object.assign({}, def.unlockedTempos, s.unlockedTempos);
  s.unlockedSections = Object.assign({}, def.unlockedSections, s.unlockedSections);
  if (!s.history) s.history = {};
  return s;
}
