// Tests for packages/web/src/practice-progress.ts.
//
// Covers:
//   • load: passes loaded JSON through migrateAndDefaultProgress.
//   • save: writes practice.progress under the configured storage key.
//   • songProg: forwards to core.getSongProgress with the practice
//     progress + given songId.
//   • recordPracticeDay: invokes core.recordPracticeDay with today's
//     formatted key + saves; no-op when progress not loaded;
//     custom now() drives a custom date.
//   • Storage key + streak options overrides honored.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPracticeProgress,
  type PracticeProgressDeps,
  type PracticeProgressCoreRef,
  type PracticeProgressStorage,
} from '../src/practice-progress';

interface Mocks {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  migrate: ReturnType<typeof vi.fn>;
  getSongProgress: ReturnType<typeof vi.fn>;
  recordPracticeDay: ReturnType<typeof vi.fn>;
  formatDateKey: ReturnType<typeof vi.fn>;
}

function makeFixture(over: Partial<PracticeProgressDeps> = {}) {
  const mocks: Mocks = {
    load: vi.fn().mockReturnValue(null),
    save: vi.fn(),
    migrate: vi
      .fn()
      .mockImplementation((raw) => raw ?? { songs: {}, streakDays: [], streakCount: 0 }),
    getSongProgress: vi.fn().mockReturnValue({ tier: 'silver' }),
    recordPracticeDay: vi.fn(),
    formatDateKey: vi.fn().mockImplementation((d: Date) => d.toISOString().slice(0, 10)),
  };
  const storage: PracticeProgressStorage = {
    loadJSON: mocks.load,
    saveJSON: mocks.save,
  };
  const core: PracticeProgressCoreRef = {
    migrateAndDefaultProgress: mocks.migrate,
    getSongProgress: mocks.getSongProgress,
    recordPracticeDay: mocks.recordPracticeDay,
    formatDateKey: mocks.formatDateKey,
  };
  const practice = { progress: null as Record<string, unknown> | null };
  const deps: PracticeProgressDeps = {
    storage,
    core,
    practice,
    ...over,
  };
  return { pp: createPracticeProgress(deps), mocks, practice, deps };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ─── load ──────────────────────────────────────────────────────────

describe('load', () => {
  it('reads from storage with default key + passes through migrate', () => {
    const fx = makeFixture();
    fx.mocks.load.mockReturnValue({ stale: 'shape' });
    fx.mocks.migrate.mockReturnValue({ migrated: true });
    const out = fx.pp.load();
    expect(fx.mocks.load).toHaveBeenCalledWith('pianoViz_practice_v1', null);
    expect(fx.mocks.migrate).toHaveBeenCalledWith({ stale: 'shape' });
    expect(out).toEqual({ migrated: true });
  });

  it('honors custom storageKey', () => {
    const fx = makeFixture({ storageKey: 'custom_key' });
    fx.pp.load();
    expect(fx.mocks.load).toHaveBeenCalledWith('custom_key', null);
  });

  it('returns the migrate output even when storage is empty (null)', () => {
    const fx = makeFixture();
    fx.mocks.load.mockReturnValue(null);
    fx.mocks.migrate.mockReturnValue({ defaults: true });
    expect(fx.pp.load()).toEqual({ defaults: true });
  });
});

// ─── save ──────────────────────────────────────────────────────────

describe('save', () => {
  it('writes practice.progress under the default storage key', () => {
    const fx = makeFixture();
    fx.practice.progress = { foo: 'bar' };
    fx.pp.save();
    expect(fx.mocks.save).toHaveBeenCalledWith('pianoViz_practice_v1', { foo: 'bar' });
  });

  it('writes null when practice.progress is null (no special-case)', () => {
    const fx = makeFixture();
    fx.pp.save();
    expect(fx.mocks.save).toHaveBeenCalledWith('pianoViz_practice_v1', null);
  });

  it('honors custom storageKey', () => {
    const fx = makeFixture({ storageKey: 'practice_v2' });
    fx.practice.progress = { x: 1 };
    fx.pp.save();
    expect(fx.mocks.save).toHaveBeenCalledWith('practice_v2', { x: 1 });
  });
});

// ─── songProg ──────────────────────────────────────────────────────

describe('songProg', () => {
  it('forwards to core.getSongProgress with practice.progress + songId', () => {
    const fx = makeFixture();
    fx.practice.progress = { songs: { fur_elise: {} } };
    fx.pp.songProg('fur_elise');
    expect(fx.mocks.getSongProgress).toHaveBeenCalledWith(
      { songs: { fur_elise: {} } },
      'fur_elise'
    );
  });

  it('returns the core.getSongProgress result', () => {
    const fx = makeFixture();
    fx.mocks.getSongProgress.mockReturnValue({ tier: 'gold', stars: 3 });
    expect(fx.pp.songProg('any')).toEqual({ tier: 'gold', stars: 3 });
  });
});

// ─── recordPracticeDay ─────────────────────────────────────────────

describe('recordPracticeDay', () => {
  it('no-op when practice.progress not loaded', () => {
    const fx = makeFixture();
    fx.pp.recordPracticeDay();
    expect(fx.mocks.recordPracticeDay).not.toHaveBeenCalled();
    expect(fx.mocks.save).not.toHaveBeenCalled();
  });

  it('runs core.recordPracticeDay with today_key + default streak options', () => {
    const fx = makeFixture({ now: () => new Date('2026-05-08T12:00:00Z') });
    fx.practice.progress = { songs: {} };
    fx.pp.recordPracticeDay();
    expect(fx.mocks.formatDateKey).toHaveBeenCalledWith(new Date('2026-05-08T12:00:00Z'));
    expect(fx.mocks.recordPracticeDay).toHaveBeenCalledWith({ songs: {} }, '2026-05-08', {
      maxDays: 60,
    });
  });

  it('persists after recording the day', () => {
    const fx = makeFixture();
    fx.practice.progress = { songs: {} };
    fx.pp.recordPracticeDay();
    expect(fx.mocks.save).toHaveBeenCalledWith('pianoViz_practice_v1', { songs: {} });
  });

  it('honors custom streakOptions', () => {
    const fx = makeFixture({ streakOptions: { maxDays: 7 } });
    fx.practice.progress = {};
    fx.pp.recordPracticeDay();
    expect(fx.mocks.recordPracticeDay).toHaveBeenCalledWith({}, expect.any(String), { maxDays: 7 });
  });

  it('honors custom now() for testable date keys', () => {
    const fx = makeFixture({ now: () => new Date('2026-12-31T00:00:00Z') });
    fx.practice.progress = {};
    fx.pp.recordPracticeDay();
    const dateArg = fx.mocks.formatDateKey.mock.calls[0][0] as Date;
    expect(dateArg.getUTCFullYear()).toBe(2026);
    expect(dateArg.getUTCMonth()).toBe(11);
  });

  it('reuses the same progress reference (mutation flows through)', () => {
    const fx = makeFixture();
    const ref = { songs: {}, streakDays: [], streakCount: 0 };
    fx.practice.progress = ref;
    fx.mocks.recordPracticeDay.mockImplementation((p) => {
      (p as Record<string, unknown>).streakCount = 5;
    });
    fx.pp.recordPracticeDay();
    expect(ref.streakCount).toBe(5);
    // Save was called with the SAME ref (not a copy).
    expect(fx.mocks.save.mock.calls[0][1]).toBe(ref);
  });
});
