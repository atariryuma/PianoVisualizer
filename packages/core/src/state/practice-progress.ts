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
    songs: {},
    earnedStamps: {},
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
    return {
      ...def,
      streakDays: Array.isArray(r.streakDays) ? (r.streakDays as string[]) : [],
      streakCount: typeof r.streakCount === 'number' ? r.streakCount : 0,
    };
  }

  const merged = Object.assign(def, r) as PracticeProgress;
  if (!merged.earnedStamps || typeof merged.earnedStamps !== 'object') {
    merged.earnedStamps = {};
  }
  return merged;
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
