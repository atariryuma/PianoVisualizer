import { describe, it, expect } from 'vitest';
import {
  initQuestTrackerState,
  resetQuestTrackerState,
  applyQuestTick,
  type Quest,
  type QuestTrackerOptions,
  type QuestTrackerState,
} from '../src/state/quest-tracker';

interface Obs {
  combo: number;
  flow: number;
}

const QUESTS: Quest<Obs>[] = [
  { id: 'q1', nameKey: 'n1', descKey: 'd1', condition: (s) => s.combo >= 5, reward: 'Nice' },
  { id: 'q2', nameKey: 'n2', descKey: 'd2', condition: (s) => s.flow >= 50, reward: 'Good' },
  { id: 'q3', nameKey: 'n3', descKey: 'd3', condition: (s) => s.combo >= 30, reward: 'Combo!' },
];

const OPTS: QuestTrackerOptions = {
  throttleMs: 300,
  postCompletionDelayMs: 2500,
};

const obs = (over: Partial<Obs> = {}): Obs => ({ combo: 0, flow: 0, ...over });

describe('initQuestTrackerState / resetQuestTrackerState', () => {
  it('initial state has no completions and the first tick is never throttled out', () => {
    const s = initQuestTrackerState();
    expect(s.completedIds).toEqual([]);
    expect(s.lastCheckMs).toBe(-Infinity);
  });

  it('reset returns a populated state to its initial values', () => {
    const s: QuestTrackerState = { completedIds: ['q1'], lastCheckMs: 1000 };
    resetQuestTrackerState(s);
    expect(s).toEqual(initQuestTrackerState());
  });
});

describe('applyQuestTick — throttling', () => {
  it('returns null when called before throttleMs has elapsed', () => {
    const s = initQuestTrackerState();
    s.lastCheckMs = 500;
    const out = applyQuestTick(s, obs(), 600, QUESTS, OPTS);
    expect(out).toBeNull();
    expect(s.completedIds).toEqual([]);
  });

  it('runs when called exactly throttleMs after last check', () => {
    const s = initQuestTrackerState();
    s.lastCheckMs = 500;
    const out = applyQuestTick(s, obs(), 800, QUESTS, OPTS);
    expect(out).not.toBeNull();
  });

  it('first call (lastCheckMs=0) always runs', () => {
    const s = initQuestTrackerState();
    const out = applyQuestTick(s, obs(), 100, QUESTS, OPTS);
    expect(out).not.toBeNull();
  });
});

describe('applyQuestTick — no completion', () => {
  it('reports the first uncompleted quest as firstUndone', () => {
    const s = initQuestTrackerState();
    const out = applyQuestTick(s, obs(), 1000, QUESTS, OPTS)!;
    expect(out.completedThisTick).toBeNull();
    expect(out.firstUndone).toBe('q1');
    expect(out.allDone).toBe(false);
  });

  it('skips already-completed quests when computing firstUndone', () => {
    const s = initQuestTrackerState();
    s.completedIds.push('q1');
    const out = applyQuestTick(s, obs(), 1000, QUESTS, OPTS)!;
    expect(out.firstUndone).toBe('q2');
  });
});

describe('applyQuestTick — completion', () => {
  it('completes a single quest when its condition fires', () => {
    const s = initQuestTrackerState();
    const out = applyQuestTick(s, obs({ combo: 10 }), 1000, QUESTS, OPTS)!;
    expect(out.completedThisTick).toBe('q1');
    expect(s.completedIds).toEqual(['q1']);
  });

  it('only completes ONE quest per tick even when multiple conditions fire', () => {
    const s = initQuestTrackerState();
    // combo 30 satisfies both q1 (combo>=5) and q3 (combo>=30); flow 50
    // also satisfies q2. Only the first in table order should fire.
    const out = applyQuestTick(s, obs({ combo: 30, flow: 50 }), 1000, QUESTS, OPTS)!;
    expect(out.completedThisTick).toBe('q1');
    expect(s.completedIds).toEqual(['q1']);
  });

  it('next tick can complete the next-in-line quest', () => {
    const s = initQuestTrackerState();
    applyQuestTick(s, obs({ combo: 30, flow: 50 }), 1000, QUESTS, OPTS); // → q1
    // Bypass the post-completion delay (timeMs >= 1000+2500)
    const out = applyQuestTick(s, obs({ combo: 30, flow: 50 }), 4000, QUESTS, OPTS)!;
    expect(out.completedThisTick).toBe('q2');
    expect(s.completedIds).toEqual(['q1', 'q2']);
  });

  it('extends the throttle by postCompletionDelayMs after a completion', () => {
    const s = initQuestTrackerState();
    applyQuestTick(s, obs({ combo: 10 }), 1000, QUESTS, OPTS); // → q1, lastCheckMs = 3500
    expect(s.lastCheckMs).toBe(3500);
    // A check at 3000 (well past throttle, but inside the post-completion delay)
    // should still throttle out.
    const out = applyQuestTick(s, obs({ combo: 30, flow: 50 }), 3000, QUESTS, OPTS);
    expect(out).toBeNull();
  });

  it('does NOT re-complete an already-completed quest', () => {
    const s = initQuestTrackerState();
    s.completedIds.push('q1');
    const out = applyQuestTick(s, obs({ combo: 100 }), 1000, QUESTS, OPTS)!;
    // q1 is skipped; nothing else fires (q2 needs flow>=50, q3 needs combo>=30 — wait that fires)
    expect(out.completedThisTick).toBe('q3');
    expect(s.completedIds).toEqual(['q1', 'q3']);
  });
});

describe('applyQuestTick — all-done sentinel', () => {
  it('reports allDone=true and firstUndone=null when every quest is cleared', () => {
    const s = initQuestTrackerState();
    s.completedIds.push('q1', 'q2', 'q3');
    const out = applyQuestTick(s, obs(), 1000, QUESTS, OPTS)!;
    expect(out.firstUndone).toBeNull();
    expect(out.allDone).toBe(true);
    expect(out.completedThisTick).toBeNull();
  });

  it('allDone is false for an empty quest table', () => {
    const s = initQuestTrackerState();
    const out = applyQuestTick(s, obs(), 1000, [], OPTS)!;
    expect(out.firstUndone).toBeNull();
    expect(out.allDone).toBe(false);
  });
});

describe('applyQuestTick — predicate isolation', () => {
  it('does not mutate the observation', () => {
    const s = initQuestTrackerState();
    const o = obs({ combo: 10 });
    const snapshot = { ...o };
    applyQuestTick(s, o, 1000, QUESTS, OPTS);
    expect(o).toEqual(snapshot);
  });

  it('quest predicates are invoked exactly once per applicable quest per tick', () => {
    const s = initQuestTrackerState();
    let q1Calls = 0;
    let q2Calls = 0;
    const counted: Quest<Obs>[] = [
      {
        id: 'q1',
        nameKey: '',
        descKey: '',
        reward: '',
        condition: (st) => {
          q1Calls++;
          return st.combo >= 5;
        },
      },
      {
        id: 'q2',
        nameKey: '',
        descKey: '',
        reward: '',
        condition: (st) => {
          q2Calls++;
          return st.flow >= 50;
        },
      },
    ];
    applyQuestTick(s, obs({ combo: 10 }), 1000, counted, OPTS);
    expect(q1Calls).toBe(1);
    // q2 is NOT evaluated because q1 just completed (one-per-tick rule)
    expect(q2Calls).toBe(0);
  });
});
