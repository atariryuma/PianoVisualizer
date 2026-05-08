// Practice progress persistence — Phase 0d batch 37.
//
// Thin facade around @piano/core/state/practice-progress (pure
// schema/migration logic) + @piano/core/state/streak (daily-streak
// math). Wraps both with the shell's localStorage I/O so callers
// don't have to thread loadJSON/saveJSON + the singleton storage
// key through every callsite.
//
// Five concerns:
//
//   1. load() — read + migrate the persisted blob via
//      PianoCore.migrateAndDefaultProgress. Returns a populated
//      PracticeProgress (never null — empty payload yields the
//      defaults).
//
//   2. save() — write practice.progress back. Idempotent. The
//      JSON storage layer handles QuotaExceededError silently
//      (one-shot warning).
//
//   3. songProg(songId) — lazy per-song state lookup. The
//      practice flow's UI reads this once per render to surface
//      best-stars / unlock state for the current song.
//
//   4. recordPracticeDay() — daily-streak reducer + persist.
//      Uses today's local-date key (`formatDateKey(new Date())`).
//      No-op when practice.progress hasn't been loaded yet (boot
//      race guard).
//
// The factory closes over the storage adapter + the practice ref
// so the legacy shell's 4 short names (loadPracticeProgress,
// savePracticeProgress, songProg, recordPracticeDay) become 1-line
// forwarders.

/** @piano/core PracticeProgress / StreakOptions surface — declared
 *  here as `unknown`-ish opaques so the module compiles without
 *  pulling the full PianoCore type graph. The shell's wire-up casts
 *  through `any` to bridge to PianoCore's typed values. */
export type PracticeProgressData = Record<string, unknown>;
export type SongProgressData = Record<string, unknown>;

export interface StreakOptions {
  maxDays: number;
}

/** PianoCore-side helpers we delegate to. Pulled in via deps so the
 *  module isn't directly coupled to @piano/core's import surface. */
export interface PracticeProgressCoreRef {
  migrateAndDefaultProgress: (raw: unknown) => PracticeProgressData;
  getSongProgress: (progress: PracticeProgressData, songId: string) => SongProgressData;
  /** Daily-streak reducer — mutates progress in place. */
  recordPracticeDay: (
    progress: PracticeProgressData,
    todayKey: string,
    opts: StreakOptions
  ) => void;
  /** Format a Date as the canonical 'YYYY-MM-DD' streak-key. */
  formatDateKey: (d: Date) => string;
}

/** Storage adapter — same shape as `prefs-storage.createJSONStore`. */
export interface PracticeProgressStorage {
  loadJSON<T>(key: string, fallback: T): T;
  saveJSON(key: string, val: unknown): void;
}

/** Practice ref — only `.progress` is read/written. */
export interface PracticeProgressRef {
  progress: PracticeProgressData | null;
}

export interface PracticeProgressDeps {
  storage: PracticeProgressStorage;
  core: PracticeProgressCoreRef;
  practice: PracticeProgressRef;
  /** Override the storage key (default 'pianoViz_practice_v1'). */
  storageKey?: string;
  /** Override the streak options (default `{ maxDays: 60 }`). */
  streakOptions?: StreakOptions;
  /** Time source — defaults to `new Date()`. Tests inject a fixed
   *  date to drive the streak math deterministically. */
  now?: () => Date;
}

export interface PracticeProgress {
  /** Read + migrate. Returns the populated PracticeProgress. */
  load(): PracticeProgressData;
  /** Write practice.progress back. */
  save(): void;
  /** Get the per-song slice. Caller must have loaded first. */
  songProg(songId: string): SongProgressData;
  /** Run the daily-streak reducer + persist. No-op when progress
   *  hasn't been loaded. */
  recordPracticeDay(): void;
}

const DEFAULT_STORAGE_KEY = 'pianoViz_practice_v1';
const DEFAULT_STREAK_OPTIONS: StreakOptions = { maxDays: 60 };

export function createPracticeProgress(deps: PracticeProgressDeps): PracticeProgress {
  const key = deps.storageKey ?? DEFAULT_STORAGE_KEY;
  const streakOpts = deps.streakOptions ?? DEFAULT_STREAK_OPTIONS;
  const now = deps.now ?? (() => new Date());

  function load(): PracticeProgressData {
    return deps.core.migrateAndDefaultProgress(deps.storage.loadJSON(key, null));
  }

  function save(): void {
    deps.storage.saveJSON(key, deps.practice.progress);
  }

  function songProg(songId: string): SongProgressData {
    // Caller invariant: load() has run + progress is non-null.
    // We don't fall back here because returning a fresh object
    // would silently lose mutations (the practice tick writes
    // through this).
    return deps.core.getSongProgress(deps.practice.progress as PracticeProgressData, songId);
  }

  function recordPracticeDay(): void {
    if (!deps.practice.progress) return;
    deps.core.recordPracticeDay(deps.practice.progress, deps.core.formatDateKey(now()), streakOpts);
    save();
  }

  return { load, save, songProg, recordPracticeDay };
}
