// Stage tier table + lookup helpers.
//
// Visual tiers a player progresses through as flow rises:
//   Awakening (0) → Blooming (15) → Aurora (35) → Cosmos (55) →
//   Radiance (75) → Legend (90) → Mythic (98).
//
// Pure: STAGES is a frozen tuple, lookups are scans, label resolution takes
// an injected `t()` callback. No DOM, no globals. The legacy shell still
// owns the DOM update + the celebration burst that fires on transition;
// this module just gives it the math + the table.

export interface Stage {
  /** i18n key for the stage display name. `null` for tier 0 (no banner shown). */
  nameKey: string | null;
  /** Decorative prefix (✦ characters) shown before the localized name. */
  prefix: string;
  /** Lower flow bound (inclusive) for this tier. */
  minFlow: number;
}

/**
 * Default 7-stage progression. Order matters — higher index = higher tier.
 * `nameKey: null` on tier 0 hides the banner during the calm "Awakening" state.
 */
export const STAGES: readonly Stage[] = Object.freeze([
  { nameKey: null, prefix: '', minFlow: 0 },
  { nameKey: 'stage1', prefix: '✦ ', minFlow: 15 },
  { nameKey: 'stage2', prefix: '✦✦ ', minFlow: 35 },
  { nameKey: 'stage3', prefix: '✦✦✦ ', minFlow: 55 },
  { nameKey: 'stage4', prefix: '✦✦✦✦ ', minFlow: 75 },
  { nameKey: 'stage5', prefix: '✦✦✦✦✦ ', minFlow: 90 },
  { nameKey: 'stage6', prefix: '✦✦✦✦✦✦ ', minFlow: 98 },
]);

/**
 * Find the highest-index stage whose `minFlow` ≤ `flow`. Always returns a
 * valid index (0 if no tier matches, but tier 0 is always at minFlow 0 in
 * the default table so it's a safe fallback).
 */
export function stageForFlow(flow: number, stages: readonly Stage[] = STAGES): number {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (flow >= stages[i].minFlow) return i;
  }
  return 0;
}

/**
 * Build the display label for a stage (`prefix + t(nameKey)`). Returns the
 * empty string for tier 0 / nameless stages so callers can `.textContent =`
 * unconditionally without an extra null check.
 */
export function stageLabel(stage: Stage | undefined | null, t: (key: string) => string): string {
  if (!stage || !stage.nameKey) return '';
  return stage.prefix + t(stage.nameKey);
}

export type StageTransition = 'up' | 'down' | 'none';

/**
 * Classify the change between two stage indices. Used by the shell to gate
 * the celebration burst (only fires on `'up'` to a non-zero tier).
 */
export function classifyStageTransition(prev: number, next: number): StageTransition {
  if (next > prev) return 'up';
  if (next < prev) return 'down';
  return 'none';
}
