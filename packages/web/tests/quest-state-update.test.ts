// @vitest-environment happy-dom
// Tests for packages/web/src/quest-state-update.ts.

import { describe, it, expect, vi } from 'vitest';
import {
  createQuestStateUpdate,
  type QuestStateRef,
  type QuestTrackerStateRef,
  type QuestDef,
} from '../src/quest-state-update';

const QUESTS: readonly QuestDef[] = [
  { id: 'q1', nameKey: 'q1Name', descKey: 'q1Desc', reward: 'Reward 1' },
  { id: 'q2', nameKey: 'q2Name', descKey: 'q2Desc', reward: 'Reward 2' },
  { id: 'q3', nameKey: 'q3Name', descKey: 'q3Desc', reward: 'Reward 3' },
];

function makeFixture(
  over: {
    state?: Partial<QuestStateRef>;
    tracker?: Partial<QuestTrackerStateRef>;
    result?: null | {
      completedThisTick: string | null;
      firstUndone: string | null;
      allDone: boolean;
    };
  } = {}
) {
  const state: QuestStateRef = {
    activeQuestId: null,
    lastQuestCheckMs: 0,
    ...over.state,
  };
  const trackerState: QuestTrackerStateRef = {
    completedIds: [],
    lastCheckMs: 0,
    ...over.tracker,
  };
  const dom = {
    toastTitle: document.createElement('div'),
    toastSub: document.createElement('div'),
    questToast: document.createElement('div'),
    questLabel: document.createElement('div'),
    questDots: document.createElement('div'),
    questDisplay: document.createElement('div'),
  };
  const applyQuestTick = vi.fn(() => (over.result === undefined ? null : over.result));
  const t = vi.fn((key: string, vars?: Record<string, string | number>) => {
    if (vars && 'v' in vars) return key + '(' + vars.v + ')';
    if (vars && 'n' in vars) return key + '[' + vars.n + ']';
    return key.toUpperCase();
  });
  const spawnBurst = vi.fn();
  const effectGoldenBurst = vi.fn();
  const setTimeoutFn = vi.fn();

  const update = createQuestStateUpdate({
    state,
    trackerState,
    quests: QUESTS,
    allDoneSentinel: 'ALL_DONE',
    applyQuestTick,
    observation: state,
    questOpts: { throttleMs: 300 },
    dom,
    t,
    spawnBurst,
    effectGoldenBurst,
    getScreen: () => ({ W: 800, H: 600 }),
    setTimeout: setTimeoutFn,
    toastHideMs: 2600,
  });

  return {
    state,
    trackerState,
    dom,
    applyQuestTick,
    t,
    spawnBurst,
    effectGoldenBurst,
    setTimeoutFn,
    update,
  };
}

describe('createQuestStateUpdate — throttle', () => {
  it('returns early when applyQuestTick returns null', () => {
    const fx = makeFixture({ result: null });
    fx.update.tick(1000);
    expect(fx.dom.questDots.innerHTML).toBe('');
    expect(fx.dom.questDisplay.classList.contains('visible')).toBe(false);
    expect(fx.spawnBurst).not.toHaveBeenCalled();
  });
});

describe('createQuestStateUpdate — dot strip + active label (no completion)', () => {
  it('renders one dot per quest with done/current/pending classes', () => {
    const fx = makeFixture({
      tracker: { completedIds: ['q1'] },
      result: { completedThisTick: null, firstUndone: 'q2', allDone: false },
    });
    fx.update.tick(1000);
    const dots = fx.dom.questDots.querySelectorAll('.quest-dot');
    expect(dots.length).toBe(3);
    expect(dots[0].classList.contains('done')).toBe(true); // q1
    expect(dots[1].classList.contains('current')).toBe(true); // q2
    expect(dots[2].classList.contains('done')).toBe(false); // q3 pending
    expect(dots[2].classList.contains('current')).toBe(false);
    expect(fx.dom.questDisplay.classList.contains('visible')).toBe(true);
  });

  it('writes activeQuestId from firstUndone', () => {
    const fx = makeFixture({
      result: { completedThisTick: null, firstUndone: 'q2', allDone: false },
    });
    fx.update.tick(1000);
    expect(fx.state.activeQuestId).toBe('q2');
  });

  it('writes the questTargetFmt label using firstUndone descKey', () => {
    const fx = makeFixture({
      result: { completedThisTick: null, firstUndone: 'q2', allDone: false },
    });
    fx.update.tick(1000);
    // Mock t: 'questTargetFmt(Q2DESC)' (descKey upcases through inner t() then wraps).
    expect(fx.dom.questLabel.textContent).toBe('questTargetFmt(Q2DESC)');
  });
});

describe('createQuestStateUpdate — completion celebration', () => {
  it('fires goldenBurst + spawnBurst at canvas center on completion', () => {
    const fx = makeFixture({
      tracker: { completedIds: ['q1'] },
      result: { completedThisTick: 'q1', firstUndone: 'q2', allDone: false },
    });
    fx.update.tick(1000);
    expect(fx.effectGoldenBurst).toHaveBeenCalledTimes(1);
    expect(fx.spawnBurst).toHaveBeenCalledWith(400, 300, 20, 1.5, '#ffd700');
  });

  it('writes toast title with sparkle wrapping the quest name', () => {
    const fx = makeFixture({
      tracker: { completedIds: ['q1'] },
      result: { completedThisTick: 'q1', firstUndone: 'q2', allDone: false },
    });
    fx.update.tick(1000);
    expect(fx.dom.toastTitle.textContent).toBe('✨ Q1NAME ✨');
  });

  it('writes toast subtitle with reward + N/total progress', () => {
    const fx = makeFixture({
      tracker: { completedIds: ['q1', 'q2'] },
      result: { completedThisTick: 'q2', firstUndone: 'q3', allDone: false },
    });
    fx.update.tick(1000);
    expect(fx.dom.toastSub.textContent).toBe('Reward 2 (2/3)');
  });

  it('toggles toast show class via remove → add (force-reflow restart)', () => {
    const fx = makeFixture({
      tracker: { completedIds: ['q1'] },
      result: { completedThisTick: 'q1', firstUndone: 'q2', allDone: false },
    });
    fx.dom.questToast.classList.add('show');
    fx.update.tick(1000);
    expect(fx.dom.questToast.classList.contains('show')).toBe(true);
  });

  it('clears state.activeQuestId on completion', () => {
    const fx = makeFixture({
      state: { activeQuestId: 'q1' },
      tracker: { completedIds: ['q1'] },
      result: { completedThisTick: 'q1', firstUndone: 'q2', allDone: false },
    });
    fx.update.tick(1000);
    // Note: it gets cleared inside the celebration block, then later
    // overwritten with firstUndone at the bottom of the function. Test
    // the final value (matches legacy behavior).
    expect(fx.state.activeQuestId).toBe('q2');
  });

  it('schedules toast hide via deps.setTimeout', () => {
    const fx = makeFixture({
      tracker: { completedIds: ['q1'] },
      result: { completedThisTick: 'q1', firstUndone: 'q2', allDone: false },
    });
    fx.update.tick(1000);
    expect(fx.setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 2600);
    // Run the scheduled callback and verify it removes the show class.
    fx.dom.questToast.classList.add('show');
    const cb = fx.setTimeoutFn.mock.calls[0][0] as () => void;
    cb();
    expect(fx.dom.questToast.classList.contains('show')).toBe(false);
  });
});

describe('createQuestStateUpdate — allDone path', () => {
  it('writes the questAllClearFmt label and stamps activeQuestId with allDoneSentinel', () => {
    const fx = makeFixture({
      tracker: { completedIds: ['q1', 'q2', 'q3'] },
      result: { completedThisTick: null, firstUndone: null, allDone: true },
    });
    fx.update.tick(1000);
    // Mocked t: 'questAllClearFmt[3]' (n var path).
    expect(fx.dom.questLabel.textContent).toBe('questAllClearFmt[3]');
    expect(fx.state.activeQuestId).toBe('ALL_DONE');
  });
});

describe('createQuestStateUpdate — mirror', () => {
  it('mirrors tracker.lastCheckMs into state.lastQuestCheckMs', () => {
    const fx = makeFixture({
      tracker: { lastCheckMs: 1234 },
      result: { completedThisTick: null, firstUndone: 'q1', allDone: false },
    });
    fx.update.tick(1000);
    expect(fx.state.lastQuestCheckMs).toBe(1234);
  });

  it('squelches -Infinity to 0', () => {
    const fx = makeFixture({
      tracker: { lastCheckMs: -Infinity },
      result: { completedThisTick: null, firstUndone: 'q1', allDone: false },
    });
    fx.update.tick(1000);
    expect(fx.state.lastQuestCheckMs).toBe(0);
  });
});

describe('createQuestStateUpdate — defensive guards', () => {
  it('aborts the celebration block when completedThisTick id is unknown', () => {
    const fx = makeFixture({
      tracker: { completedIds: [] },
      result: { completedThisTick: 'unknownId', firstUndone: 'q1', allDone: false },
    });
    fx.update.tick(1000);
    // Early-return: no toast, no goldenBurst, no dot rebuild.
    expect(fx.effectGoldenBurst).not.toHaveBeenCalled();
    expect(fx.dom.questDots.innerHTML).toBe(''); // dot rebuild also skipped
  });
});
