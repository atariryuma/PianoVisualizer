import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENCOURAGEMENT_TIERS,
  initEncouragementState,
  resetEncouragementState,
  pickTier,
  applyEncouragementEvent,
  type EncouragementState,
  type EncouragementOptions,
  type EncouragementTier,
} from '../src/state/encouragement';

const OPTS: EncouragementOptions = {
  displayMs: 2500,
};

describe('DEFAULT_ENCOURAGEMENT_TIERS', () => {
  it('has 8 tiers (matches legacy v9 ladder)', () => {
    expect(DEFAULT_ENCOURAGEMENT_TIERS).toHaveLength(8);
  });

  it('thresholds are strictly ascending', () => {
    for (let i = 1; i < DEFAULT_ENCOURAGEMENT_TIERS.length; i++) {
      expect(DEFAULT_ENCOURAGEMENT_TIERS[i].minCombo).toBeGreaterThan(
        DEFAULT_ENCOURAGEMENT_TIERS[i - 1].minCombo
      );
    }
  });

  it('every tier has a non-empty messageKey + effect', () => {
    for (const t of DEFAULT_ENCOURAGEMENT_TIERS) {
      expect(t.messageKey).toBeTruthy();
      expect(t.effect).toBeTruthy();
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_ENCOURAGEMENT_TIERS)).toBe(true);
  });
});

describe('pickTier', () => {
  it('returns -1 when combo is below the first threshold', () => {
    expect(pickTier(0, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(-1);
    expect(pickTier(2, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(-1);
  });

  it('returns 0 at the first threshold (combo=3)', () => {
    expect(pickTier(3, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(0);
  });

  it('returns the highest matching tier', () => {
    expect(pickTier(7, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(0); // 3
    expect(pickTier(8, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(1); // 8
    expect(pickTier(99, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(6); // 80
    expect(pickTier(100, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(7); // 100
    expect(pickTier(9999, DEFAULT_ENCOURAGEMENT_TIERS)).toBe(7);
  });

  it('honors a custom tier table', () => {
    const custom: EncouragementTier[] = [
      { minCombo: 5, messageKey: 'low', effect: 'glowPulse' },
      { minCombo: 50, messageKey: 'high', effect: 'starShower' },
    ];
    expect(pickTier(4, custom)).toBe(-1);
    expect(pickTier(5, custom)).toBe(0);
    expect(pickTier(50, custom)).toBe(1);
  });
});

describe('initEncouragementState / resetEncouragementState', () => {
  it('initial state has no active tier and nothing showing', () => {
    expect(initEncouragementState()).toEqual({
      currentTier: -1,
      lastShownTimeMs: 0,
      hideTimeMs: -1,
    });
  });

  it('reset returns a populated state to the initial values', () => {
    const s: EncouragementState = {
      currentTier: 4,
      lastShownTimeMs: 12345,
      hideTimeMs: 14845,
    };
    resetEncouragementState(s);
    expect(s).toEqual(initEncouragementState());
  });
});

describe('applyEncouragementEvent — comboChanged climbing the ladder', () => {
  it('returns "show" when combo first crosses tier 0', () => {
    const s = initEncouragementState();
    const out = applyEncouragementEvent(s, { type: 'comboChanged', combo: 3, timeMs: 1000 }, OPTS);
    expect(out).toEqual({
      kind: 'show',
      tier: 0,
      messageKey: 'enc1',
      effect: 'glowPulse',
    });
    expect(s.currentTier).toBe(0);
    expect(s.lastShownTimeMs).toBe(1000);
    expect(s.hideTimeMs).toBe(3500);
  });

  it('does NOT re-fire while the player stays inside the same tier', () => {
    const s = initEncouragementState();
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 5, timeMs: 1000 }, OPTS);
    const out = applyEncouragementEvent(s, { type: 'comboChanged', combo: 7, timeMs: 1500 }, OPTS);
    expect(out).toEqual({ kind: 'none' });
    expect(s.currentTier).toBe(0);
  });

  it('fires the matching tier each time combo crosses a higher threshold', () => {
    const s = initEncouragementState();
    const sequence = [3, 8, 15, 25, 40, 60, 80, 100];
    for (let i = 0; i < sequence.length; i++) {
      const out = applyEncouragementEvent(
        s,
        { type: 'comboChanged', combo: sequence[i], timeMs: 1000 + i * 1000 },
        OPTS
      );
      expect(out.kind).toBe('show');
      if (out.kind === 'show') expect(out.tier).toBe(i);
    }
  });

  it('skips intermediate tiers on a big jump (combo 0 → 100 fires only tier 7)', () => {
    const s = initEncouragementState();
    const out = applyEncouragementEvent(
      s,
      { type: 'comboChanged', combo: 100, timeMs: 1000 },
      OPTS
    );
    expect(out.kind).toBe('show');
    if (out.kind === 'show') expect(out.tier).toBe(7);
  });
});

describe('applyEncouragementEvent — comboChanged dropping', () => {
  it('drops currentTier silently when combo falls below the active threshold', () => {
    const s = initEncouragementState();
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 25, timeMs: 1000 }, OPTS);
    expect(s.currentTier).toBe(3);
    const out = applyEncouragementEvent(s, { type: 'comboChanged', combo: 5, timeMs: 2000 }, OPTS);
    expect(out).toEqual({ kind: 'none' });
    expect(s.currentTier).toBe(0);
  });

  it('drops currentTier to -1 when combo falls below tier 0', () => {
    const s = initEncouragementState();
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 25, timeMs: 1000 }, OPTS);
    const out = applyEncouragementEvent(s, { type: 'comboChanged', combo: 0, timeMs: 2000 }, OPTS);
    expect(out).toEqual({ kind: 'none' });
    expect(s.currentTier).toBe(-1);
  });

  it('re-fires on rebound after a drop (the "fresh accomplishment" path)', () => {
    const s = initEncouragementState();
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 25, timeMs: 1000 }, OPTS);
    // drop
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 10, timeMs: 2000 }, OPTS);
    // back up
    const out = applyEncouragementEvent(s, { type: 'comboChanged', combo: 25, timeMs: 3000 }, OPTS);
    expect(out.kind).toBe('show');
    if (out.kind === 'show') expect(out.tier).toBe(3);
  });
});

describe('applyEncouragementEvent — hideTick', () => {
  it('fires "hide" when timeMs first crosses hideTimeMs', () => {
    const s = initEncouragementState();
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 3, timeMs: 1000 }, OPTS);
    // hideTimeMs = 1000 + 2500 = 3500
    const before = applyEncouragementEvent(s, { type: 'hideTick', timeMs: 3499 }, OPTS);
    expect(before).toEqual({ kind: 'none' });
    const at = applyEncouragementEvent(s, { type: 'hideTick', timeMs: 3500 }, OPTS);
    expect(at).toEqual({ kind: 'hide' });
  });

  it('only fires "hide" once — subsequent ticks are no-ops', () => {
    const s = initEncouragementState();
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 3, timeMs: 1000 }, OPTS);
    applyEncouragementEvent(s, { type: 'hideTick', timeMs: 3500 }, OPTS);
    const second = applyEncouragementEvent(s, { type: 'hideTick', timeMs: 4000 }, OPTS);
    expect(second).toEqual({ kind: 'none' });
  });

  it('hideTick before any show is a no-op (hideTimeMs is -1)', () => {
    const s = initEncouragementState();
    expect(applyEncouragementEvent(s, { type: 'hideTick', timeMs: 1000 }, OPTS)).toEqual({
      kind: 'none',
    });
  });

  it('a new show resets hideTimeMs so the message can hide again', () => {
    const s = initEncouragementState();
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 3, timeMs: 1000 }, OPTS);
    applyEncouragementEvent(s, { type: 'hideTick', timeMs: 3500 }, OPTS);
    applyEncouragementEvent(s, { type: 'comboChanged', combo: 8, timeMs: 4000 }, OPTS);
    const out = applyEncouragementEvent(s, { type: 'hideTick', timeMs: 6500 }, OPTS);
    expect(out).toEqual({ kind: 'hide' });
  });
});

describe('applyEncouragementEvent — custom tier table', () => {
  const custom: EncouragementTier[] = [
    { minCombo: 10, messageKey: 'k1', effect: 'glowPulse' },
    { minCombo: 100, messageKey: 'k2', effect: 'goldenBurst' },
  ];

  it('uses the custom table when provided', () => {
    const s = initEncouragementState();
    const out = applyEncouragementEvent(
      s,
      { type: 'comboChanged', combo: 100, timeMs: 1000 },
      { ...OPTS, tiers: custom }
    );
    expect(out).toEqual({
      kind: 'show',
      tier: 1,
      messageKey: 'k2',
      effect: 'goldenBurst',
    });
  });
});
