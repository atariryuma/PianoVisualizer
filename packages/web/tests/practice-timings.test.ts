// @vitest-environment happy-dom
// Tests for packages/web/src/practice-timings.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPracticeTimings,
  type PracticeTimingsPracticeRef,
  type PracticeTimingsSong,
} from '../src/practice-timings';

function makeFixture(
  over: {
    mode?: string;
    fullSongMode?: boolean;
    tempoPct?: number;
    songBpm?: number | undefined;
    noBanner?: boolean;
  } = {}
) {
  const practice: PracticeTimingsPracticeRef = {
    mode: over.mode ?? 'guided',
    fullSongMode: over.fullSongMode ?? false,
    tempoPct: over.tempoPct ?? 75,
  };
  const song: PracticeTimingsSong | null =
    over.songBpm === undefined ? null : { bpm: over.songBpm };

  // PianoCore math fns — fakes that record their inputs so the
  // assertions can verify correct argument plumbing without
  // re-implementing the math.
  const practiceBeatMsFn = vi.fn((bpm: number, tempoPct: number) => {
    // beat ms = 60_000 / (bpm * tempoPct/100). Mirror the legacy
    // shape so test expectations stay simple.
    return 60000 / (bpm * (tempoPct / 100));
  });
  const computePracticeTimingsFn = vi.fn((beatMs: number) => ({
    countInMs: beatMs * 4, // 4-beat count-in
    laneLookaheadMs: beatMs * 8,
  }));

  let countIn = -1;
  let laneLookahead = -1;
  const setCountInMs = vi.fn((v: number) => {
    countIn = v;
  });
  const setLaneLookaheadMs = vi.fn((v: number) => {
    laneLookahead = v;
  });

  const laneSetTimings = vi.fn();
  const practiceLane = { setTimings: laneSetTimings };

  const sectionBannerEl = over.noBanner
    ? null
    : (() => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        return el;
      })();

  const t = vi.fn((k: string) => 'T:' + k);

  const pt = createPracticeTimings({
    getPractice: () => practice,
    getCurrentSong: () => song,
    fns: {
      practiceBeatMs: practiceBeatMsFn,
      computePracticeTimings: computePracticeTimingsFn,
    },
    setCountInMs,
    setLaneLookaheadMs,
    getPracticeLane: () => practiceLane,
    sectionBannerEl,
    t,
  });

  return {
    pt,
    practice,
    practiceBeatMsFn,
    computePracticeTimingsFn,
    setCountInMs,
    setLaneLookaheadMs,
    laneSetTimings,
    sectionBannerEl,
    t,
    getCountIn: () => countIn,
    getLaneLookahead: () => laneLookahead,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createPracticeTimings — effectiveTempoPct', () => {
  it('returns 100 when listen + fullSong', () => {
    const fx = makeFixture({ mode: 'listen', fullSongMode: true, tempoPct: 60 });
    expect(fx.pt.effectiveTempoPct()).toBe(100);
  });

  it('returns tempoPct when listen but NOT fullSong', () => {
    const fx = makeFixture({ mode: 'listen', fullSongMode: false, tempoPct: 60 });
    expect(fx.pt.effectiveTempoPct()).toBe(60);
  });

  it('returns tempoPct when guided', () => {
    const fx = makeFixture({ mode: 'guided', fullSongMode: false, tempoPct: 75 });
    expect(fx.pt.effectiveTempoPct()).toBe(75);
  });

  it('returns 100 when tempoPct is 0 / falsy', () => {
    const fx = makeFixture({ mode: 'guided', tempoPct: 0 });
    expect(fx.pt.effectiveTempoPct()).toBe(100);
  });

  it('reads through the thunk on every call (mode change picks up immediately)', () => {
    const fx = makeFixture({ mode: 'guided', tempoPct: 60 });
    expect(fx.pt.effectiveTempoPct()).toBe(60);
    fx.practice.mode = 'listen';
    fx.practice.fullSongMode = true;
    expect(fx.pt.effectiveTempoPct()).toBe(100);
  });
});

describe('createPracticeTimings — practiceBeatMs', () => {
  it('passes song bpm and effective tempoPct to deps.fns.practiceBeatMs', () => {
    const fx = makeFixture({ songBpm: 120, tempoPct: 60 });
    fx.pt.practiceBeatMs();
    expect(fx.practiceBeatMsFn).toHaveBeenCalledWith(120, 60);
  });

  it('falls back to 72 BPM when current song has no bpm field', () => {
    const fx = makeFixture({ songBpm: undefined, tempoPct: 75 });
    fx.pt.practiceBeatMs();
    expect(fx.practiceBeatMsFn).toHaveBeenCalledWith(72, 75);
  });

  it('uses listen+fullSong tempo override (100) over practice.tempoPct', () => {
    const fx = makeFixture({
      mode: 'listen',
      fullSongMode: true,
      songBpm: 60,
      tempoPct: 50,
    });
    fx.pt.practiceBeatMs();
    expect(fx.practiceBeatMsFn).toHaveBeenCalledWith(60, 100);
  });

  it('returns the value from deps.fns.practiceBeatMs verbatim', () => {
    const fx = makeFixture({ songBpm: 120, tempoPct: 100 });
    // 60000 / (120 * 1.0) = 500 ms per beat
    expect(fx.pt.practiceBeatMs()).toBe(500);
  });
});

describe('createPracticeTimings — recomputePracticeTimings', () => {
  it('writes both setters from computePracticeTimings result', () => {
    const fx = makeFixture({ songBpm: 120, tempoPct: 100 });
    fx.pt.recomputePracticeTimings();
    // beatMs = 500 → countIn = 2000, laneLookahead = 4000
    expect(fx.setCountInMs).toHaveBeenCalledWith(2000);
    expect(fx.setLaneLookaheadMs).toHaveBeenCalledWith(4000);
    expect(fx.getCountIn()).toBe(2000);
    expect(fx.getLaneLookahead()).toBe(4000);
  });

  it('forwards both fields into practiceLane.setTimings', () => {
    const fx = makeFixture({ songBpm: 120, tempoPct: 100 });
    fx.pt.recomputePracticeTimings();
    expect(fx.laneSetTimings).toHaveBeenCalledWith({
      laneLookaheadMs: 4000,
      countInMs: 2000,
    });
  });

  it('reads practiceLane fresh per call (TDZ-safe thunk)', () => {
    const fx = makeFixture({ songBpm: 60, tempoPct: 100 });
    fx.pt.recomputePracticeTimings();
    fx.pt.recomputePracticeTimings();
    expect(fx.laneSetTimings).toHaveBeenCalledTimes(2);
  });
});

describe('createPracticeTimings — showSectionBanner', () => {
  it('writes the localized name without crown for non-boss sections', () => {
    const fx = makeFixture();
    fx.pt.showSectionBanner({ nameKey: 'feA1', isBoss: false });
    expect(fx.sectionBannerEl?.textContent).toBe('T:feA1');
  });

  it('prefixes 👑 for boss sections', () => {
    const fx = makeFixture();
    fx.pt.showSectionBanner({ nameKey: 'feA2', isBoss: true });
    expect(fx.sectionBannerEl?.textContent).toBe('👑 T:feA2');
  });

  it('omits the crown when isBoss is undefined', () => {
    const fx = makeFixture();
    fx.pt.showSectionBanner({ nameKey: 'feA1' });
    expect(fx.sectionBannerEl?.textContent).toBe('T:feA1');
  });

  it('toggles "show" class via remove → add (force-reflow restart)', () => {
    const fx = makeFixture();
    fx.sectionBannerEl?.classList.add('show');
    fx.pt.showSectionBanner({ nameKey: 'feA1' });
    expect(fx.sectionBannerEl?.classList.contains('show')).toBe(true);
  });

  it('no-ops when sectionBannerEl is null', () => {
    const fx = makeFixture({ noBanner: true });
    expect(() => fx.pt.showSectionBanner({ nameKey: 'feA1' })).not.toThrow();
  });
});
