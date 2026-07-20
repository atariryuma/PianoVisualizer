// Lifetime stamp collectibles, awarded at section-complete time.
// Predicates are deterministic and gate on attempts / improvement /
// milestones — never on perfection. Pure reducer: shell owns
// persistence + toast emission.

import type { PracticeProgress } from './practice-progress';
import { formatDateKey } from './streak';

/** Categorization for the Collection-screen filter. */
export type StampCategory = 'completion' | 'performance' | 'practice' | 'milestone';

/** Visual rarity tier — drives the badge tint in the UI. NOT a gating
 *  mechanic (no RNG), just a "this one felt big" signifier. */
export type StampRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Snapshot the shell passes to every stamp's predicate at the moment
 *  a section completes. All fields reflect post-attempt state: progress
 *  has already been mutated by the result-card flow, and the new attempt
 *  is described by `attempt`. */
export interface StampContext {
  /** Already updated for this attempt (sections/unlocks/history written). */
  progress: PracticeProgress;
  /** What just happened. */
  attempt: {
    songId: string;
    sectionId: string;
    stars: number;
    accPct: number;
    tempoPct: number;
    /** Best mid-section combo run. From practice.sectionBestCombo. */
    sectionBestCombo: number;
    /** True for listen-mode attempts (no scoring, no progress write). */
    isListenMode: boolean;
    /** What the section's bestPct was BEFORE this attempt landed. Used
     *  for "improvement" predicates so we can tell a fresh 80% from a
     *  re-clear of an already-80% section. */
    priorBestPct: number;
    /** What stars the section had BEFORE this attempt (same idea). */
    priorStars: number;
  };
  /** Per-session peak flow value — written by the shell from the main
   *  game state. Optional for tests; predicates that need it gracefully
   *  return false when absent. */
  sessionPeakFlow?: number;
  /** All songs registered in the app. Powers "library_explorer"-style
   *  predicates that count distinct songs touched. */
  knownSongIds: readonly string[];
  /** The current song's REAL section IDs (from the song definition). The
   *  "whole song" stamps evaluate against these — NOT `Object.values(
   *  sp.sections)`, which includes the phantom A1/B/A2 that `getSongProgress`
   *  injects into every song. Without this, a 1-section song would need a
   *  never-existent B/A2 at ≥N stars, making song_gold/silver/all-sections
   *  unreachable for short imports (and disagreeing with mastery, which
   *  already uses real IDs). Empty ⇒ the whole-song predicates return false. */
  sectionIds: readonly string[];
}

/** A stamp definition is pure data — same shape as Quest. */
export interface StampDef {
  /** Stable ID stored in progress.earnedStamps. Persisted forever. */
  id: string;
  /** i18n key for the stamp's display name. */
  nameKey: string;
  /** i18n key for the goal description. */
  descKey: string;
  /** i18n key for an "earn moment" celebratory line shown in the toast. */
  earnedKey: string;
  /** i18n key for a one-line *Knowledge of Performance* coaching tip
   *  shown on earn (Salmoni 1984 guidance hypothesis: intermittent KP
   *  beats per-attempt KP; once-per-stamp event is the right cadence). */
  tipKey?: string;
  /** Emoji glyph rendered as the stamp icon. */
  icon: string;
  category: StampCategory;
  rarity: StampRarity;
  /** Pure predicate evaluated on every section-complete tick. Should
   *  return true when the player has *just* met the criterion — caller
   *  filters out already-earned IDs before evaluating. */
  evaluate: (ctx: StampContext) => boolean;
}

/** Result of a single evaluation pass — IDs the caller should record
 *  + show toasts for. */
export interface StampEvaluationResult {
  /** Stamp IDs newly earned this tick. May be empty. */
  newlyEarned: string[];
}

/** Count songs the player has touched (any section with >=1 star). */
function countSongsTouched(progress: PracticeProgress): number {
  let n = 0;
  for (const sp of Object.values(progress.songs ?? {})) {
    for (const sec of Object.values(sp.sections)) {
      if (sec && sec.stars >= 1) {
        n++;
        break;
      }
    }
  }
  return n;
}

/** Count distinct sections cleared at >=1 star across the entire library. */
function countSectionsCleared(progress: PracticeProgress): number {
  let n = 0;
  for (const sp of Object.values(progress.songs ?? {})) {
    for (const sec of Object.values(sp.sections)) {
      if (sec && sec.stars >= 1) n++;
    }
  }
  return n;
}

/** Stars for each of the song's REAL sections (0 when a section is unplayed).
 *  Keyed by the song's actual section IDs so the phantom A1/B/A2 that
 *  `getSongProgress` injects can't sneak a never-existent section into a
 *  whole-song `.every()`. */
function realSectionStars(
  progress: PracticeProgress,
  songId: string,
  sectionIds: readonly string[]
): number[] {
  const sp = progress.songs?.[songId];
  if (!sp || sectionIds.length === 0) return [];
  return sectionIds.map((id) => sp.sections[id]?.stars ?? 0);
}

/** Has every REAL section of the given song reached >=3 stars? */
function isSongFullyThreeStar(
  progress: PracticeProgress,
  songId: string,
  sectionIds: readonly string[]
): boolean {
  const st = realSectionStars(progress, songId, sectionIds);
  return st.length > 0 && st.every((s) => s >= 3);
}

/** Look at this song's section history and tally how many attempts
 *  the just-completed section has now (after the result-card pushed
 *  the new attempt onto history). */
function attemptsForCurrentSection(ctx: StampContext): number {
  const hist = ctx.progress.songs?.[ctx.attempt.songId]?.history?.[ctx.attempt.sectionId];
  if (!Array.isArray(hist)) return 0;
  return hist.length;
}

/** How many distinct sections has the player touched (>=1 star) at the
 *  60% tempo tier specifically? Pulled from history's tempoPct field.
 *  Each section counts once; multiple slow runs of the same section
 *  don't pad the total. */
function slowTempoSectionsTouched(progress: PracticeProgress): number {
  let n = 0;
  for (const sp of Object.values(progress.songs ?? {})) {
    for (const hist of Object.values(sp.history ?? {})) {
      if (!Array.isArray(hist)) continue;
      const cleared = hist.some(
        (h) =>
          h != null &&
          typeof h === 'object' &&
          'tempoPct' in (h as Record<string, unknown>) &&
          // 低速帯（50/60%）を許容。50% は後付けの最遅 tier で、スタンプの趣旨
          // （ゆっくり練習）に最も合致するのに `=== 60` だと非計上だった。
          ((h as { tempoPct?: number }).tempoPct ?? 999) <= 60 &&
          'a' in (h as Record<string, unknown>) &&
          ((h as { a?: number }).a ?? 0) >= 50
      );
      if (cleared) n++;
    }
  }
  return n;
}

function distinctSectionsToday(progress: PracticeProgress, todayMs: number): number {
  const todayKey = formatDateKey(new Date(todayMs));
  const seen = new Set<string>();
  for (const [songId, sp] of Object.entries(progress.songs ?? {})) {
    for (const [secId, hist] of Object.entries(sp.history ?? {})) {
      if (!Array.isArray(hist)) continue;
      for (const h of hist) {
        const d = (h as { d?: number }).d;
        if (typeof d === 'number' && formatDateKey(new Date(d)) === todayKey) {
          seen.add(songId + '::' + secId);
          break;
        }
      }
    }
  }
  return seen.size;
}

/** Stable IDs persisted under `progress.earnedStamps` — never rename. */
export const DEFAULT_STAMPS: readonly StampDef[] = [
  // === Completion ===
  {
    id: 'first_section',
    nameKey: 'stampFirstSectionName',
    descKey: 'stampFirstSectionDesc',
    earnedKey: 'stampFirstSectionEarned',
    tipKey: 'stampFirstSectionTip',
    icon: '🌱',
    category: 'completion',
    rarity: 'common',
    evaluate: (c) => !c.attempt.isListenMode && c.attempt.stars >= 1,
  },
  {
    id: 'first_three_star',
    nameKey: 'stampFirstThreeStarName',
    descKey: 'stampFirstThreeStarDesc',
    earnedKey: 'stampFirstThreeStarEarned',
    tipKey: 'stampFirstThreeStarTip',
    icon: '✨',
    category: 'completion',
    rarity: 'common',
    evaluate: (c) => c.attempt.stars >= 3,
  },
  {
    id: 'song_all_sections_cleared',
    nameKey: 'stampSongAllSectionsName',
    descKey: 'stampSongAllSectionsDesc',
    earnedKey: 'stampSongAllSectionsEarned',
    tipKey: 'stampSongAllSectionsTip',
    icon: '📖',
    category: 'completion',
    rarity: 'rare',
    evaluate: (c) => {
      const st = realSectionStars(c.progress, c.attempt.songId, c.sectionIds);
      return st.length > 0 && st.every((s) => s >= 1);
    },
  },
  {
    id: 'song_silver',
    nameKey: 'stampSongSilverName',
    descKey: 'stampSongSilverDesc',
    earnedKey: 'stampSongSilverEarned',
    tipKey: 'stampSongSilverTip',
    icon: '🥈',
    category: 'completion',
    rarity: 'rare',
    evaluate: (c) => {
      const st = realSectionStars(c.progress, c.attempt.songId, c.sectionIds);
      return st.length > 0 && st.every((s) => s >= 2);
    },
  },
  {
    id: 'song_gold',
    nameKey: 'stampSongGoldName',
    descKey: 'stampSongGoldDesc',
    earnedKey: 'stampSongGoldEarned',
    tipKey: 'stampSongGoldTip',
    icon: '🥇',
    category: 'completion',
    rarity: 'epic',
    evaluate: (c) => isSongFullyThreeStar(c.progress, c.attempt.songId, c.sectionIds),
  },
  {
    id: 'tempo_100_unlocked',
    nameKey: 'stampTempo100Name',
    descKey: 'stampTempo100Desc',
    earnedKey: 'stampTempo100Earned',
    tipKey: 'stampTempo100Tip',
    icon: '🚀',
    category: 'completion',
    rarity: 'epic',
    evaluate: (c) => {
      const sp = c.progress.songs?.[c.attempt.songId];
      return !!sp && sp.unlockedTempos?.['100'] === true;
    },
  },

  // === Performance ===
  {
    id: 'combo_25',
    nameKey: 'stampCombo25Name',
    descKey: 'stampCombo25Desc',
    earnedKey: 'stampCombo25Earned',
    tipKey: 'stampCombo25Tip',
    icon: '🎯',
    category: 'performance',
    rarity: 'common',
    evaluate: (c) => c.attempt.sectionBestCombo >= 25,
  },
  {
    id: 'combo_50',
    nameKey: 'stampCombo50Name',
    descKey: 'stampCombo50Desc',
    earnedKey: 'stampCombo50Earned',
    tipKey: 'stampCombo50Tip',
    icon: '💫',
    category: 'performance',
    rarity: 'rare',
    evaluate: (c) => c.attempt.sectionBestCombo >= 50,
  },
  {
    id: 'combo_100',
    nameKey: 'stampCombo100Name',
    descKey: 'stampCombo100Desc',
    earnedKey: 'stampCombo100Earned',
    tipKey: 'stampCombo100Tip',
    icon: '⚡',
    category: 'performance',
    rarity: 'epic',
    evaluate: (c) => c.attempt.sectionBestCombo >= 100,
  },
  {
    id: 'perfect_accuracy',
    nameKey: 'stampPerfectAccName',
    descKey: 'stampPerfectAccDesc',
    earnedKey: 'stampPerfectAccEarned',
    tipKey: 'stampPerfectAccTip',
    icon: '🎯',
    category: 'performance',
    rarity: 'epic',
    evaluate: (c) => !c.attempt.isListenMode && c.attempt.accPct >= 100,
  },
  {
    id: 'flow_peak_80',
    nameKey: 'stampFlowPeak80Name',
    descKey: 'stampFlowPeak80Desc',
    earnedKey: 'stampFlowPeak80Earned',
    tipKey: 'stampFlowPeak80Tip',
    icon: '🌊',
    category: 'performance',
    rarity: 'rare',
    evaluate: (c) => (c.sessionPeakFlow ?? 0) >= 80,
  },
  {
    id: 'flow_peak_max',
    nameKey: 'stampFlowPeakMaxName',
    descKey: 'stampFlowPeakMaxDesc',
    earnedKey: 'stampFlowPeakMaxEarned',
    tipKey: 'stampFlowPeakMaxTip',
    icon: '☀️',
    category: 'performance',
    rarity: 'legendary',
    evaluate: (c) => (c.sessionPeakFlow ?? 0) >= 98,
  },

  // === Practice ===
  {
    id: 'same_section_5x',
    nameKey: 'stampSameSection5xName',
    descKey: 'stampSameSection5xDesc',
    earnedKey: 'stampSameSection5xEarned',
    tipKey: 'stampSameSection5xTip',
    icon: '🔁',
    category: 'practice',
    rarity: 'common',
    evaluate: (c) => attemptsForCurrentSection(c) >= 5,
  },
  {
    id: 'same_section_8x',
    nameKey: 'stampSameSection8xName',
    descKey: 'stampSameSection8xDesc',
    earnedKey: 'stampSameSection8xEarned',
    tipKey: 'stampSameSection8xTip',
    icon: '💎',
    category: 'practice',
    rarity: 'rare',
    evaluate: (c) => attemptsForCurrentSection(c) >= 8,
  },
  {
    id: 'slow_tempo_5',
    nameKey: 'stampSlowTempo5Name',
    descKey: 'stampSlowTempo5Desc',
    earnedKey: 'stampSlowTempo5Earned',
    tipKey: 'stampSlowTempo5Tip',
    icon: '🐢',
    category: 'practice',
    rarity: 'common',
    evaluate: (c) => slowTempoSectionsTouched(c.progress) >= 5,
  },
  {
    id: 'variety_today',
    nameKey: 'stampVarietyTodayName',
    descKey: 'stampVarietyTodayDesc',
    earnedKey: 'stampVarietyTodayEarned',
    tipKey: 'stampVarietyTodayTip',
    icon: '🌈',
    category: 'practice',
    rarity: 'rare',
    evaluate: (c) => distinctSectionsToday(c.progress, Date.now()) >= 3,
  },
  {
    id: 'comeback_kid',
    nameKey: 'stampComebackName',
    descKey: 'stampComebackDesc',
    earnedKey: 'stampComebackEarned',
    tipKey: 'stampComebackTip',
    icon: '📈',
    category: 'practice',
    rarity: 'rare',
    evaluate: (c) => !c.attempt.isListenMode && c.attempt.accPct - c.attempt.priorBestPct >= 20,
  },
  {
    id: 'star_up',
    nameKey: 'stampStarUpName',
    descKey: 'stampStarUpDesc',
    earnedKey: 'stampStarUpEarned',
    tipKey: 'stampStarUpTip',
    icon: '⭐',
    category: 'practice',
    rarity: 'common',
    evaluate: (c) =>
      !c.attempt.isListenMode && c.attempt.stars > c.attempt.priorStars && c.attempt.stars >= 2,
  },

  // === Milestone ===
  {
    id: 'two_songs_touched',
    nameKey: 'stampTwoSongsName',
    descKey: 'stampTwoSongsDesc',
    earnedKey: 'stampTwoSongsEarned',
    tipKey: 'stampTwoSongsTip',
    icon: '🎵',
    category: 'milestone',
    rarity: 'common',
    evaluate: (c) => countSongsTouched(c.progress) >= 2,
  },
  {
    id: 'five_songs_touched',
    nameKey: 'stampFiveSongsName',
    descKey: 'stampFiveSongsDesc',
    earnedKey: 'stampFiveSongsEarned',
    tipKey: 'stampFiveSongsTip',
    icon: '🎼',
    category: 'milestone',
    rarity: 'rare',
    evaluate: (c) => countSongsTouched(c.progress) >= 5,
  },
  {
    id: 'ten_sections_cleared',
    nameKey: 'stampTenSectionsName',
    descKey: 'stampTenSectionsDesc',
    earnedKey: 'stampTenSectionsEarned',
    tipKey: 'stampTenSectionsTip',
    icon: '🏵️',
    category: 'milestone',
    rarity: 'common',
    evaluate: (c) => countSectionsCleared(c.progress) >= 10,
  },
  {
    id: 'lifetime_3_days',
    nameKey: 'stampLifetime3DaysName',
    descKey: 'stampLifetime3DaysDesc',
    earnedKey: 'stampLifetime3DaysEarned',
    tipKey: 'stampLifetime3DaysTip',
    icon: '🗓️',
    category: 'milestone',
    rarity: 'common',
    evaluate: (c) => (c.progress.streakDays?.length ?? 0) >= 3,
  },
  {
    id: 'lifetime_7_days',
    nameKey: 'stampLifetime7DaysName',
    descKey: 'stampLifetime7DaysDesc',
    earnedKey: 'stampLifetime7DaysEarned',
    tipKey: 'stampLifetime7DaysTip',
    icon: '📅',
    category: 'milestone',
    rarity: 'rare',
    evaluate: (c) => (c.progress.streakDays?.length ?? 0) >= 7,
  },
  {
    id: 'lifetime_30_days',
    nameKey: 'stampLifetime30DaysName',
    descKey: 'stampLifetime30DaysDesc',
    earnedKey: 'stampLifetime30DaysEarned',
    tipKey: 'stampLifetime30DaysTip',
    icon: '🏆',
    category: 'milestone',
    rarity: 'epic',
    evaluate: (c) => (c.progress.streakDays?.length ?? 0) >= 30,
  },
];

/** Helpers exported for tests + the shell's near-completion surface. */
export const stampHelpers = {
  countSongsTouched,
  countSectionsCleared,
  isSongFullyThreeStar,
  attemptsForCurrentSection,
  slowTempoSectionsTouched,
  distinctSectionsToday,
};

/** Run a single evaluation pass. Mutates `earnedStamps` on the
 *  progress in place, appending newly-earned IDs in evaluation order.
 *  Returns the IDs awarded this tick so the shell can toast them.
 *
 *  The caller is responsible for persisting progress afterward. */
export function applyStampEvaluation(
  ctx: StampContext,
  defs: readonly StampDef[] = DEFAULT_STAMPS
): StampEvaluationResult {
  const earned = ctx.progress.earnedStamps ?? {};
  ctx.progress.earnedStamps = earned;
  const newlyEarned: string[] = [];
  const nowMs = Date.now();
  for (const def of defs) {
    if (earned[def.id]) continue;
    let pass = false;
    try {
      pass = def.evaluate(ctx);
    } catch {
      pass = false;
    }
    if (pass) {
      earned[def.id] = nowMs;
      newlyEarned.push(def.id);
    }
  }
  return { newlyEarned };
}

/** Group stamps by category in a stable order for UI rendering. */
export function groupStampsByCategory(
  defs: readonly StampDef[] = DEFAULT_STAMPS
): Record<StampCategory, StampDef[]> {
  const groups: Record<StampCategory, StampDef[]> = {
    completion: [],
    performance: [],
    practice: [],
    milestone: [],
  };
  for (const d of defs) groups[d.category].push(d);
  return groups;
}
