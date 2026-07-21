// Quest-state per-frame reducer + UI dispatcher — Phase 0d batch 46.
//
// Drives v10 "Magic Quest" UI from a single per-frame call:
//
//   1. Throttled quest-tracker tick via `PianoCore.applyQuestTick`
//      (deps.applyQuestTick). Returns `null` when throttled, or
//      `{ completedThisTick, firstUndone, allDone }` once per tick.
//
//   2. On a quest completion: writes the celebration toast (title +
//      subtitle), force-reflows so the CSS-animation restarts cleanly,
//      writes the `questLabel` cleared text, fires the goldenBurst
//      effect + a particle burst at the canvas center, clears
//      `state.activeQuestId`, and schedules a hide-toast timeout
//      (deps.setTimeout — production: window.setTimeout, tests:
//      vi.useFakeTimers).
//
//   3. Mirrors `_questState.lastCheckMs` back into `state.lastQuestCheckMs`
//      (with the `-Infinity` → 0 squelch the legacy code did).
//
//   4. Re-renders the dot-progress strip — one HTML node per quest
//      tagged with done / current / pending classes — and toggles the
//      `questDisplay` visible class.
//
//   5. Updates the quest-label text (allDone / firstUndone) when no
//      celebration is firing this tick.
//
// All quest content + state machine logic lives in @piano/core; this
// reducer only owns the DOM dispatch.

export interface QuestStateRef {
  activeQuestId: string | null;
  lastQuestCheckMs: number;
}

export interface QuestTrackerStateRef {
  completedIds: string[];
  lastCheckMs: number;
}

export interface QuestDef {
  id: string;
  nameKey: string;
  descKey: string;
  /** i18n key for the reward tagline (preferred). */
  rewardKey?: string;
  /** Legacy raw-English fallback when rewardKey is absent. */
  reward: string;
  condition?: unknown; // shape owned by @piano/core
}

export interface QuestTickResult {
  completedThisTick: string | null;
  firstUndone: string | null;
  allDone: boolean;
}

export interface QuestUpdateDeps {
  state: QuestStateRef;
  trackerState: QuestTrackerStateRef;
  quests: readonly QuestDef[];
  /** Sentinel id stored on `state.activeQuestId` once everything is done. */
  allDoneSentinel: string;

  /** PianoCore.applyQuestTick — held by deps so tests can stub. */
  applyQuestTick(
    trackerState: QuestTrackerStateRef,
    observation: unknown,
    timeMs: number,
    quests: readonly QuestDef[],
    opts: unknown
  ): QuestTickResult | null;
  /** Observation slice passed to applyQuestTick (typically the legacy
   *  `state` bag — quest conditions read combo / flow / etc.). */
  observation: unknown;
  /** Throttle / cool-down opts forwarded to applyQuestTick. */
  questOpts: unknown;

  /** Toast + dot strip + label DOM. */
  dom: {
    toastTitle: HTMLElement;
    toastSub: HTMLElement;
    questToast: HTMLElement;
    questLabel: HTMLElement;
    questDots: HTMLElement;
    questDisplay: HTMLElement;
  };

  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Canvas-center fountain. Production: spawnBurst from particle module. */
  spawnBurst: (x: number, y: number, count: number, energy: number, color: string) => void;
  /** Goldenburst whole-screen effect. Fires on quest completion. */
  effectGoldenBurst: () => void;
  /** Canvas size, read once per tick. */
  getScreen: () => { W: number; H: number };
  /** Schedule the toast hide. Production: `window.setTimeout`; tests
   *  inject a fake-timer-friendly stub. */
  setTimeout: (fn: () => void, ms: number) => void;
  /** ms before the toast auto-hides. Default: 2600 (matches CSS
   *  toast animation). */
  toastHideMs: number;
}

export interface QuestStateUpdate {
  tick(timeMs: number): void;
}

export function createQuestStateUpdate(deps: QuestUpdateDeps): QuestStateUpdate {
  return {
    tick(timeMs) {
      const result = deps.applyQuestTick(
        deps.trackerState,
        deps.observation,
        timeMs,
        deps.quests,
        deps.questOpts
      );
      if (!result) return; // throttled

      // ── 1. Quest completion celebration ─────────────────────────
      if (result.completedThisTick) {
        const quest = deps.quests.find((q) => q.id === result.completedThisTick);
        if (!quest) return; // unknown id — defensive

        console.log('Quest Completed: ' + deps.t(quest.nameKey));
        deps.dom.toastTitle.textContent = '✨ ' + deps.t(quest.nameKey) + ' ✨';
        const rewardText = quest.rewardKey ? deps.t(quest.rewardKey) : quest.reward;
        deps.dom.toastSub.textContent =
          rewardText +
          ' (' +
          deps.trackerState.completedIds.length +
          '/' +
          deps.quests.length +
          ')';
        deps.dom.questToast.classList.remove('show');
        void deps.dom.questToast.offsetWidth; // force reflow to restart animation
        deps.dom.questToast.classList.add('show');
        deps.dom.questLabel.textContent = deps.t('questClearedFmt', { v: deps.t(quest.nameKey) });
        deps.effectGoldenBurst();
        const screen = deps.getScreen();
        deps.spawnBurst(screen.W / 2, screen.H / 2, 20, 1.5, '#ffd700');
        deps.state.activeQuestId = null;
        deps.setTimeout(() => deps.dom.questToast.classList.remove('show'), deps.toastHideMs);
      }

      // ── 2. Mirror tracker state back to legacy reader fields ────
      deps.state.lastQuestCheckMs =
        deps.trackerState.lastCheckMs === -Infinity ? 0 : deps.trackerState.lastCheckMs;

      // ── 3. Build dot progress strip + toggle visibility ─────────
      let dotsHtml = '';
      for (let i = 0; i < deps.quests.length; i++) {
        const q = deps.quests[i];
        const done = deps.trackerState.completedIds.includes(q.id);
        const cls = done
          ? 'quest-dot done'
          : q.id === result.firstUndone && !result.completedThisTick
            ? 'quest-dot current'
            : 'quest-dot';
        dotsHtml += '<div class="' + cls + '" title="' + deps.t(q.nameKey) + '"></div>';
      }
      deps.dom.questDots.innerHTML = dotsHtml;
      deps.dom.questDisplay.classList.add('visible');

      // ── 4. Idle label updates (when no celebration firing) ──────
      if (result.allDone) {
        deps.dom.questLabel.textContent = deps.t('questAllClearFmt', { n: deps.quests.length });
        deps.state.activeQuestId = deps.allDoneSentinel;
        return;
      }
      if (!result.completedThisTick) {
        const firstQ = deps.quests.find((q) => q.id === result.firstUndone);
        if (firstQ) {
          deps.dom.questLabel.textContent = deps.t('questTargetFmt', { v: deps.t(firstQ.descKey) });
        }
      }
      deps.state.activeQuestId = result.firstUndone;
    },
  };
}
