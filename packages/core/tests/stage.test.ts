import { describe, it, expect } from 'vitest';
import {
  STAGES,
  stageForFlow,
  stageLabel,
  classifyStageTransition,
  type Stage,
} from '../src/render/stage';

describe('STAGES table', () => {
  it('has 7 tiers (0..6)', () => {
    expect(STAGES).toHaveLength(7);
  });

  it('is monotonically non-decreasing in minFlow', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].minFlow).toBeGreaterThanOrEqual(STAGES[i - 1].minFlow);
    }
  });

  it('starts at minFlow 0 (so stageForFlow always finds a match)', () => {
    expect(STAGES[0].minFlow).toBe(0);
  });

  it('tier 0 has a null nameKey (hides the banner during calm state)', () => {
    expect(STAGES[0].nameKey).toBeNull();
  });

  it('all non-zero tiers have a non-empty nameKey + ✦-prefix', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].nameKey).toBeTruthy();
      expect(STAGES[i].prefix).toMatch(/^✦+ $/);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(STAGES)).toBe(true);
  });
});

describe('stageForFlow', () => {
  it('returns 0 at flow=0', () => {
    expect(stageForFlow(0)).toBe(0);
  });

  it('returns 0 just below the first threshold (< 15)', () => {
    expect(stageForFlow(14.9)).toBe(0);
  });

  it('returns 1 at the first threshold (=15)', () => {
    expect(stageForFlow(15)).toBe(1);
  });

  it('returns 6 at peak flow (98+)', () => {
    expect(stageForFlow(98)).toBe(6);
    expect(stageForFlow(100)).toBe(6);
  });

  it('returns the correct intermediate tier for each band', () => {
    expect(stageForFlow(20)).toBe(1);
    expect(stageForFlow(35)).toBe(2);
    expect(stageForFlow(54.99)).toBe(2);
    expect(stageForFlow(55)).toBe(3);
    expect(stageForFlow(75)).toBe(4);
    expect(stageForFlow(90)).toBe(5);
    expect(stageForFlow(97.99)).toBe(5);
  });

  it('honors a custom stage table', () => {
    const custom: Stage[] = [
      { nameKey: null, prefix: '', minFlow: 0 },
      { nameKey: 'low', prefix: '', minFlow: 50 },
    ];
    expect(stageForFlow(40, custom)).toBe(0);
    expect(stageForFlow(50, custom)).toBe(1);
  });

  it('returns 0 if flow is negative', () => {
    expect(stageForFlow(-1)).toBe(0);
  });
});

describe('stageLabel', () => {
  const t = (k: string) => 'TR(' + k + ')';

  it('returns empty string for null/undefined stage', () => {
    expect(stageLabel(null, t)).toBe('');
    expect(stageLabel(undefined, t)).toBe('');
  });

  it('returns empty string for stages with null nameKey (tier 0)', () => {
    expect(stageLabel(STAGES[0], t)).toBe('');
  });

  it('concatenates prefix + translated nameKey for non-zero tiers', () => {
    expect(stageLabel(STAGES[1], t)).toBe('✦ TR(stage1)');
    expect(stageLabel(STAGES[6], t)).toBe('✦✦✦✦✦✦ TR(stage6)');
  });
});

describe('classifyStageTransition', () => {
  it('reports "none" when the index does not change', () => {
    expect(classifyStageTransition(2, 2)).toBe('none');
  });

  it('reports "up" when next > prev', () => {
    expect(classifyStageTransition(1, 3)).toBe('up');
  });

  it('reports "down" when next < prev', () => {
    expect(classifyStageTransition(3, 1)).toBe('down');
  });
});
