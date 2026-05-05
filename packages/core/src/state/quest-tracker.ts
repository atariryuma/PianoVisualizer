// Quest tracker — accumulates completed quest IDs as a player meets each
// condition. Throttles checks (the legacy ran every 300ms) and limits to
// one completion per tick so the celebration toast/CLEARED animation can
// finish before the next quest fires.
//
// Generic over the observation shape `S`: each Quest carries a pure
// `condition(state: S) => boolean`. The shell defines what `S` means
// (typically a slice of the live game state) and feeds the same shape on
// every tick.
//
// Pure: no globals, no DOM, no toast emission. The shell handles UI based
// on the QuestTickResult.

export type QuestPredicate<S> = (state: S) => boolean;

export interface Quest<S = unknown> {
  /** Stable ID stored in completedIds + emitted in events. */
  id: string;
  /** i18n key for the display name. */
  nameKey: string;
  /** i18n key for the goal description. */
  descKey: string;
  /** Pure predicate evaluated on each tick against the observation `S`. */
  condition: QuestPredicate<S>;
  /** Reward string shown in the completion toast (legacy English label). */
  reward: string;
}

export interface QuestTrackerState {
  /** IDs of quests that have completed, in completion order. */
  completedIds: string[];
  /** Wall-clock ms of the last condition check (for throttling). */
  lastCheckMs: number;
}

export interface QuestTrackerOptions {
  /** Min ms between checks. Legacy default: 300. */
  throttleMs: number;
  /** After a completion, the next check is delayed by this much so the
   *  toast/CLEARED animation has time to play. Legacy default: 2500. */
  postCompletionDelayMs: number;
}

export interface QuestTickResult {
  /** ID of the quest that just completed this tick, or null. */
  completedThisTick: string | null;
  /** ID of the next quest the player should be chasing, or null when all done. */
  firstUndone: string | null;
  /** True when every quest in the table is now in `completedIds`. */
  allDone: boolean;
}

/** Build a fresh tracker state — nothing completed; the first tick is never
 *  throttled out (lastCheckMs = -Infinity until the first check fires). */
export function initQuestTrackerState(): QuestTrackerState {
  return {
    completedIds: [],
    lastCheckMs: -Infinity,
  };
}

/** Reset all fields in place. */
export function resetQuestTrackerState(state: QuestTrackerState): void {
  state.completedIds.length = 0;
  state.lastCheckMs = -Infinity;
}

/**
 * Run one quest-check tick. Returns `null` when throttled (the caller can
 * use that to skip its own UI updates entirely). On a check, evaluates
 * uncompleted quests in table order and completes the first one whose
 * condition returns true; subsequent quests wait until the next tick.
 *
 * `firstUndone` is reported even on a non-completion tick so the caller
 * can keep the "current quest" label fresh.
 */
export function applyQuestTick<S>(
  state: QuestTrackerState,
  observation: S,
  timeMs: number,
  quests: readonly Quest<S>[],
  opts: QuestTrackerOptions
): QuestTickResult | null {
  if (timeMs - state.lastCheckMs < opts.throttleMs) return null;
  state.lastCheckMs = timeMs;

  const completedSet = new Set(state.completedIds);
  let completedThisTick: string | null = null;

  for (const q of quests) {
    if (completedSet.has(q.id)) continue;
    if (q.condition(observation)) {
      state.completedIds.push(q.id);
      completedSet.add(q.id);
      completedThisTick = q.id;
      // After a completion, push the next check further out so the toast
      // can play before another quest possibly completes.
      state.lastCheckMs = timeMs + opts.postCompletionDelayMs;
      break;
    }
  }

  let firstUndone: string | null = null;
  for (const q of quests) {
    if (!completedSet.has(q.id)) {
      firstUndone = q.id;
      break;
    }
  }
  const allDone = firstUndone === null && quests.length > 0;

  return { completedThisTick, firstUndone, allDone };
}
