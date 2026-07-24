// @vitest-environment happy-dom
//
// Focused harness for packages/web/src/journal-modal.ts. The modal has six
// sub-render passes; this builds the full DOM + minimal deps and drives the
// real render() (through real @piano/core), then asserts the weekly-growth
// rollup row — the one piece that was previously only build/typecheck-verified.
//
// getPianistIdentity is intentionally omitted so renderPianistCard early-returns
// (keeps the harness minimal); every other element the render path touches is
// present so render() runs end-to-end without throwing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createJournalModal,
  type JournalModalDeps,
  type JournalModalDom,
  type JournalSongRef,
} from '../src/journal-modal';

const JOURNAL_DOM_IDS = [
  'journalBtn',
  'journalModal',
  'journalCloseBtn',
  'journalPianistCard',
  'journalWeeklyMeter',
  'journalLibraryRollup',
  'journalRepertoireList',
  'journalStampsGrid',
  'journalCalendar',
  'journalActivityList',
  'libraryMasteryStrip',
  'resStampsEarned',
  'sectionBannerHint',
] as const;

function makeDom(): JournalModalDom {
  document.body.innerHTML = JOURNAL_DOM_IDS.map((id) => `<div id="${id}"></div>`).join('');
  const pick = (id: string) => document.getElementById(id) as HTMLElement;
  return Object.fromEntries(
    JOURNAL_DOM_IDS.map((id) => [id, pick(id)])
  ) as unknown as JournalModalDom;
}

function makeSong(): JournalSongRef {
  return {
    id: 's1',
    titleKey: 'furElise',
    sections: [{ id: 'a1', nameKey: 'feA1' }],
  };
}

/** A per-song progress slice with one section's attempt history. */
function songProgressWithHistory(history: Array<{ d: number; a: number; t: number; s: number }>) {
  return {
    sections: {},
    unlockedTempos: {},
    unlockedSections: {},
    history: { a1: history },
  };
}

function makeDeps(over: Partial<JournalModalDeps> = {}): JournalModalDeps {
  return {
    dom: makeDom(),
    getProgress: () => ({ streakDays: [], streakCount: 0, songs: {}, earnedStamps: {} }) as never,
    getSongs: () => [makeSong()],
    saveProgress: vi.fn(),
    // Echo the key (+ vars) back so assertions can match on the i18n key.
    t: vi.fn((key: string, vars?: Record<string, unknown>) =>
      vars ? key + JSON.stringify(vars) : key
    ),
    // Local-date key (matches production PianoCore.formatDateKey). toISOString
    // uses UTC and drifts `today` 00:00-local vs `now` across the day boundary
    // depending on timezone + time-of-day (was a flaky J5 day-match).
    formatDateKey: (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`,
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createJournalModal — render() smoke', () => {
  it('renders every tab without throwing on minimal data', () => {
    const deps = makeDeps();
    expect(() => createJournalModal(deps).render()).not.toThrow();
    // The rollup always paints its three base rows.
    expect(deps.dom.journalLibraryRollup.innerHTML).toContain('rollupStarsLabel');
  });
});

describe('createJournalModal — weekly growth rollup', () => {
  it('shows the accuracy-growth row when the kid improved most on accuracy this week', () => {
    const now = Date.now();
    const deps = makeDeps({
      getProgress: () =>
        ({
          streakDays: [],
          streakCount: 0,
          earnedStamps: {},
          songs: {
            s1: songProgressWithHistory([
              { d: now, a: 50, t: 50, s: 0 },
              { d: now + 1000, a: 80, t: 55, s: 1 }, // acc +30 > timing +5
            ]),
          },
        }) as never,
    });
    createJournalModal(deps).render();
    const html = deps.dom.journalLibraryRollup.innerHTML;
    expect(html).toContain('rollupGrowthLabel');
    expect(html).toContain('rollupGrowthAccFmt');
    expect(html).not.toContain('rollupGrowthTimeFmt');
  });

  it('shows the timing-growth row when timing improved most', () => {
    const now = Date.now();
    const deps = makeDeps({
      getProgress: () =>
        ({
          streakDays: [],
          streakCount: 0,
          earnedStamps: {},
          songs: {
            s1: songProgressWithHistory([
              { d: now, a: 70, t: 40, s: 0 },
              { d: now + 1000, a: 72, t: 75, s: 1 }, // timing +35 > acc +2
            ]),
          },
        }) as never,
    });
    createJournalModal(deps).render();
    expect(deps.dom.journalLibraryRollup.innerHTML).toContain('rollupGrowthTimeFmt');
  });

  it('shows no growth row on a flat/down week (positive-only, no loss-frame)', () => {
    const now = Date.now();
    const deps = makeDeps({
      getProgress: () =>
        ({
          streakDays: [],
          streakCount: 0,
          earnedStamps: {},
          songs: {
            s1: songProgressWithHistory([
              { d: now, a: 80, t: 80, s: 2 },
              { d: now + 1000, a: 60, t: 70, s: 1 }, // both down
            ]),
          },
        }) as never,
    });
    createJournalModal(deps).render();
    const html = deps.dom.journalLibraryRollup.innerHTML;
    expect(html).not.toContain('rollupGrowthLabel');
    expect(html).not.toContain('rollupGrowthAccFmt');
    expect(html).not.toContain('rollupGrowthTimeFmt');
  });

  it('shows no growth row when nothing was practiced this week', () => {
    const deps = makeDeps(); // empty songs
    createJournalModal(deps).render();
    expect(deps.dom.journalLibraryRollup.innerHTML).not.toContain('rollupGrowthLabel');
  });
});

describe('createJournalModal — J2+J3 per-song self-best line', () => {
  it('shows best accuracy % + best combo on a touched song', () => {
    const deps = makeDeps({
      getProgress: () =>
        ({
          streakDays: [],
          streakCount: 0,
          earnedStamps: {},
          songs: {
            s1: {
              sections: { a1: { stars: 2, bestPct: 88, bestCombo: 17 } },
              unlockedTempos: {},
              unlockedSections: { a1: true },
              history: {},
            },
          },
        }) as never,
    });
    createJournalModal(deps).render();
    const html = deps.dom.journalRepertoireList.innerHTML;
    expect(html).toContain('journalBestLabel');
    expect(html).toContain('88%');
    expect(html).toContain('×17');
  });

  it('hides the self-best line on an untouched song (no 0% / ×0 scold)', () => {
    const deps = makeDeps(); // empty progress → untouched
    createJournalModal(deps).render();
    expect(deps.dom.journalRepertoireList.innerHTML).not.toContain('journalBestLabel');
  });
});

describe('createJournalModal — J5 calendar day detail', () => {
  it('lists the songs/sections practiced on a day with history', () => {
    const now = Date.now();
    const deps = makeDeps({
      getProgress: () =>
        ({
          streakDays: [],
          streakCount: 0,
          earnedStamps: {},
          songs: {
            s1: songProgressWithHistory([{ d: now, a: 70, t: 60, s: 2 }]),
          },
        }) as never,
    });
    createJournalModal(deps).render();
    const html = deps.dom.journalActivityList.innerHTML;
    // Song title (furElise key) + section name (feA1 key) appear in the detail.
    expect(html).toContain('furElise');
    expect(html).toContain('feA1');
    expect(html).toContain('jr-cal-detail');
  });
});
