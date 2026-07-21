// Per-song + library mastery summaries derived from PracticeProgress.
// Pure: caller hands progress + song defs in, gets flat view out.

import type { PracticeProgress, SongProgress, SectionProgress } from './practice-progress';
import { TEMPO_TIERS } from './practice-state';

/** A single section's summary as the UI needs to draw it. */
export interface MasterySectionView {
  /** Section ID — e.g. 'A1', 'B', 'A2', or auto-section IDs. */
  id: string;
  /** Best star count (0–3). */
  stars: number;
  /** Best accuracy percentage (0–100). */
  bestPct: number;
  /** True if this section has been unlocked by the player. */
  unlocked: boolean;
}

/** Seal tier on a song's "book cover" in the repertoire library. */
export type SongSeal =
  | 'none' // No section cleared (>=1 star) yet.
  | 'bronze' // Any section cleared.
  | 'silver' // All sections cleared at >=2 stars.
  | 'gold' // All sections cleared at 3 stars.
  | 'platinum'; // All sections cleared at 3 stars AND 100% tempo unlocked.

/** Summary of a single song's progress for the Collection UI. */
export interface SongMastery {
  songId: string;
  /** Per-section star + unlock view, in section playback order. */
  sections: MasterySectionView[];
  /** Sum of stars earned across all sections (0..sections.length*3). */
  starsEarned: number;
  /** Total stars achievable across all sections (sections.length*3). */
  starsPossible: number;
  /** 0–100 completion percent, with endowed-progress floor applied. */
  percent: number;
  /** Seal tier — drives the visual seal on the book cover. */
  seal: SongSeal;
  /** Number of tempo tiers unlocked (60/75/90/100 → up to 4). */
  tempoTiersUnlocked: number;
  /** Highest tempo tier unlocked (60/75/90/100). */
  highestTempoUnlocked: number;
  /** True when at least one attempt has landed for this song. */
  touched: boolean;
}

/** Overall library aggregate. */
export interface LibraryMastery {
  /** Total stars earned across every registered song. */
  starsEarned: number;
  /** Total stars possible if every song was three-starred. */
  starsPossible: number;
  /** 0–100 library completion percent. */
  percent: number;
  /** Number of songs that have any stars at all. */
  songsTouched: number;
  /** Number of songs gold-sealed (every section three-starred). */
  songsGold: number;
  /** Number of songs platinum-sealed (gold + 100% tempo). */
  songsPlatinum: number;
}

/** Minimal song shape mastery.ts needs — fed by the shell from SONGS. */
export interface MasterySongDef {
  id: string;
  /** Section IDs in playback order — used so we render sections in the
   *  same order the player encounters them, not the arbitrary key order
   *  of progress.sections. */
  sectionIds: readonly string[];
}

function isTempoUnlocked(unlocked: Record<string, boolean> | undefined, tier: number): boolean {
  // F3: 破損/移行後の per-song バケットが unlockedTempos を欠く（{} 等）と、
  // computeSongMastery が raw バケットを getSongProgress を通さず渡すため
  // undefined['60'] で TypeError → renderLibraryStrip 経由で boot 恒久クラッシュ。
  // leaf でガードして全呼び出し元（highest/count）を一括で安全化する。
  return unlocked?.[String(tier)] === true;
}

function highestUnlockedTempo(unlocked: Record<string, boolean>): number {
  let highest = TEMPO_TIERS[0];
  for (const t of TEMPO_TIERS) {
    if (isTempoUnlocked(unlocked, t)) highest = t;
  }
  return highest;
}

function countUnlockedTempos(unlocked: Record<string, boolean>): number {
  let n = 0;
  for (const t of TEMPO_TIERS) {
    if (isTempoUnlocked(unlocked, t)) n++;
  }
  return n;
}

/** Compute the seal tier from the per-section star map + tempo unlocks. */
export function resolveSongSeal(sectionStars: readonly number[], highestTempo: number): SongSeal {
  if (sectionStars.length === 0) return 'none';
  let anyCleared = false;
  let allTwo = true;
  let allThree = true;
  for (const s of sectionStars) {
    if (s >= 1) anyCleared = true;
    if (s < 2) allTwo = false;
    if (s < 3) allThree = false;
  }
  if (!anyCleared) return 'none';
  if (allThree && highestTempo >= 100) return 'platinum';
  if (allThree) return 'gold';
  if (allTwo) return 'silver';
  return 'bronze';
}

/** Cold-song floor for the mastery ring — keeps untouched songs visibly
 *  "in progress" rather than reading 0%. Capped at 5% so real progress
 *  always dominates. */
export function endowedProgressFraction(starsPossible: number): number {
  if (starsPossible <= 0) return 0;
  return Math.min(1 / starsPossible, 0.05);
}

export function computeSongMastery(
  song: MasterySongDef,
  progress: SongProgress | undefined
): SongMastery {
  const sectionIds = song.sectionIds;
  const sections: MasterySectionView[] = [];
  let starsEarned = 0;
  for (const id of sectionIds) {
    const sec: SectionProgress = progress?.sections?.[id] ?? { stars: 0, bestPct: 0 };
    const unlocked = progress?.unlockedSections?.[id] === true || id === sectionIds[0];
    sections.push({ id, stars: sec.stars, bestPct: sec.bestPct, unlocked });
    starsEarned += sec.stars;
  }
  const starsPossible = sectionIds.length * 3;
  const highestTempo = progress ? highestUnlockedTempo(progress.unlockedTempos) : 60;
  const tempoTiersUnlocked = progress ? countUnlockedTempos(progress.unlockedTempos) : 1;
  const seal = resolveSongSeal(
    sections.map((s) => s.stars),
    highestTempo
  );

  const touched = starsEarned > 0;
  const realFraction = starsPossible > 0 ? starsEarned / starsPossible : 0;
  const floor = endowedProgressFraction(starsPossible);
  const fraction = Math.max(realFraction, touched ? realFraction : floor);
  const percent = Math.round(fraction * 100);

  return {
    songId: song.id,
    sections,
    starsEarned,
    starsPossible,
    percent,
    seal,
    tempoTiersUnlocked,
    highestTempoUnlocked: highestTempo,
    touched,
  };
}

/** Aggregate every song's summary into a library-wide rollup. */
export function computeLibraryMastery(
  songs: readonly MasterySongDef[],
  progress: PracticeProgress
): LibraryMastery {
  let starsEarned = 0;
  let starsPossible = 0;
  let songsTouched = 0;
  let songsGold = 0;
  let songsPlatinum = 0;

  for (const song of songs) {
    const sp = progress.songs?.[song.id];
    const sm = computeSongMastery(song, sp);
    starsEarned += sm.starsEarned;
    starsPossible += sm.starsPossible;
    if (sm.touched) songsTouched++;
    if (sm.seal === 'gold' || sm.seal === 'platinum') songsGold++;
    if (sm.seal === 'platinum') songsPlatinum++;
  }

  const percent = starsPossible > 0 ? Math.round((starsEarned / starsPossible) * 100) : 0;
  return {
    starsEarned,
    starsPossible,
    percent,
    songsTouched,
    songsGold,
    songsPlatinum,
  };
}

/** Songs ranked by how few stars remain to reach the next seal. */
export interface NearCompletionEntry {
  songId: string;
  /** Current seal. */
  currentSeal: SongSeal;
  /** Next seal the song would hit with a small push. */
  nextSeal: SongSeal;
  /** How many extra stars would unlock the next seal. */
  starsToNext: number;
  /** Section IDs that still need a star bump. */
  weakSectionIds: string[];
}

export function pickNearCompletion(
  songs: readonly MasterySongDef[],
  progress: PracticeProgress,
  limit = 3
): NearCompletionEntry[] {
  const candidates: NearCompletionEntry[] = [];
  for (const song of songs) {
    const sp = progress.songs?.[song.id];
    const sm = computeSongMastery(song, sp);
    if (!sm.touched || sm.seal === 'platinum') continue;

    let needed = 0;
    let target: SongSeal;
    if (sm.seal === 'gold') {
      target = 'platinum';
      needed = sm.highestTempoUnlocked < 100 ? 1 : 0;
    } else if (sm.seal === 'silver') {
      target = 'gold';
      for (const sec of sm.sections) needed += Math.max(0, 3 - sec.stars);
    } else if (sm.seal === 'bronze') {
      target = 'silver';
      for (const sec of sm.sections) needed += Math.max(0, 2 - sec.stars);
    } else {
      target = 'bronze';
      needed = 1;
    }
    if (needed <= 0) continue;

    const weakSectionIds: string[] = [];
    if (target === 'gold' || target === 'silver') {
      const threshold = target === 'gold' ? 3 : 2;
      for (const sec of sm.sections) {
        if (sec.stars < threshold) weakSectionIds.push(sec.id);
      }
    } else if (target === 'bronze') {
      // First unlocked section the player hasn't cleared yet.
      const firstUnstarred = sm.sections.find((s) => s.unlocked && s.stars === 0);
      if (firstUnstarred) weakSectionIds.push(firstUnstarred.id);
    }

    candidates.push({
      songId: song.id,
      currentSeal: sm.seal,
      nextSeal: target,
      starsToNext: needed,
      weakSectionIds,
    });
  }
  candidates.sort((a, b) => a.starsToNext - b.starsToNext);
  return candidates.slice(0, limit);
}

// =====================================================================
// Full-song challenge（1曲チャレンジ — the "play the whole song" finale）
// =====================================================================

/** Reserved pseudo-section ID for the scored full-song run. Its best
 *  stars / bestPct / history live in `SongProgress.sections['__full']`
 *  alongside the real sections, but it is NEVER part of a song's
 *  `sectionIds`, so seals, mastery percent, and whole-song stamp
 *  predicates (which walk real section IDs) are unaffected. */
export const FULL_SONG_SECTION_ID = '__full';

export interface FullSongChallengeView {
  /** Unlocked once EVERY real section has ≥1 star — a deterministic,
   *  visible goal the kid can chase (banned-list: no RNG gates). */
  unlocked: boolean;
  /** Sections already at ≥1 star (the "n of m" progress copy). */
  clearedSections: number;
  totalSections: number;
  /** Best star count earned on the full-song run itself (0–3). */
  stars: number;
  /** Best accuracy % on the full-song run. */
  bestPct: number;
  /** True once the full-song run has been cleared at ≥1 star. */
  cleared: boolean;
}

/** Minimal per-section progress slice the challenge computation reads —
 *  structural so both core `SongProgress.sections` and the web shell's
 *  looser render slices satisfy it. */
export type FullSongProgressSections = Readonly<
  Record<string, { stars?: number; bestPct?: number } | undefined>
>;

/**
 * Pure: derive the full-song-challenge state for one song. The unlock
 * predicate mirrors the bronze "all sections cleared" moment: every real
 * section at ≥1 star. A song with no sections yet (still loading) reads
 * as locked with 0/0.
 */
export function computeFullSongChallenge(
  sectionIds: readonly string[],
  sections: FullSongProgressSections | undefined
): FullSongChallengeView {
  let cleared = 0;
  for (const id of sectionIds) {
    if ((sections?.[id]?.stars ?? 0) >= 1) cleared++;
  }
  const total = sectionIds.length;
  const full = sections?.[FULL_SONG_SECTION_ID];
  const stars = full?.stars ?? 0;
  return {
    unlocked: total > 0 && cleared === total,
    clearedSections: cleared,
    totalSections: total,
    stars,
    bestPct: full?.bestPct ?? 0,
    cleared: stars >= 1,
  };
}

// =====================================================================
// Weekly growth rollup (library-wide, self-referenced, positive-only)
// =====================================================================

/** A single scored attempt as the weekly-growth aggregate needs it. */
export interface WeeklyGrowthAttempt {
  /** Timestamp (ms). */
  d: number;
  /** Accuracy percent 0–100. */
  a: number;
  /** Timing percent 0–100. */
  t: number;
}

export interface WeeklyGrowth {
  /** Which axis improved most this week, or null when nothing improved. */
  axis: 'accuracy' | 'timing' | null;
  /** Rounded average gain in points (≥ 1 when `axis` is set; 0 otherwise). */
  gainPct: number;
  /** Number of sections that had ≥ 2 attempts this week (the sample size). */
  sectionsCounted: number;
}

/**
 * Library-wide "how much did you grow this week" summary. For each section
 * with ≥ 2 attempts since `weekStartMs`, take the per-axis gain (latest minus
 * first this week), average those gains across sections, and report the larger
 * positive axis. **Positive-only by design** — a flat or down week returns
 * `axis: null` so the UI shows nothing rather than a loss-frame (banned-list:
 * no shame copy; SDT competence). Self-referenced to the kid's own past week,
 * never a target or a peer.
 *
 * Pure: `weekStartMs` is passed in (the caller computes the local ISO-week
 * Monday) so this stays deterministic and testable.
 */
export function weeklyLibraryGrowth(
  sections: ReadonlyArray<ReadonlyArray<WeeklyGrowthAttempt>>,
  weekStartMs: number
): WeeklyGrowth {
  let accSum = 0;
  let timeSum = 0;
  let counted = 0;
  for (const attempts of sections) {
    const wk = attempts.filter((x) => x.d >= weekStartMs).sort((p, q) => p.d - q.d);
    if (wk.length < 2) continue;
    accSum += wk[wk.length - 1].a - wk[0].a;
    timeSum += wk[wk.length - 1].t - wk[0].t;
    counted++;
  }
  if (counted === 0) return { axis: null, gainPct: 0, sectionsCounted: 0 };
  const accAvg = accSum / counted;
  const timeAvg = timeSum / counted;
  // Prefer the bigger gain; accuracy wins ties (the more fundamental axis).
  if (accAvg >= timeAvg && accAvg >= 1) {
    return { axis: 'accuracy', gainPct: Math.round(accAvg), sectionsCounted: counted };
  }
  if (timeAvg >= 1) {
    return { axis: 'timing', gainPct: Math.round(timeAvg), sectionsCounted: counted };
  }
  return { axis: null, gainPct: 0, sectionsCounted: counted };
}
