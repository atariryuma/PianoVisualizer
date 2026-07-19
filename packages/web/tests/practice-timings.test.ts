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
    /** 小節グリッド等を持つ song を丸ごと渡す（songBpm より優先）。 */
    song?: PracticeTimingsSong | null;
  } = {}
) {
  const practice: PracticeTimingsPracticeRef = {
    mode: over.mode ?? 'rhythm',
    fullSongMode: over.fullSongMode ?? false,
    tempoPct: over.tempoPct ?? 75,
  };
  const song: PracticeTimingsSong | null =
    over.song !== undefined ? over.song : over.songBpm === undefined ? null : { bpm: over.songBpm };

  // PianoCore math fns — fakes that record their inputs so the
  // assertions can verify correct argument plumbing without
  // re-implementing the math.
  const practiceBeatMsFn = vi.fn((bpm: number, tempoPct: number) => {
    // beat ms = 60_000 / (bpm * tempoPct/100). Mirror the legacy
    // shape so test expectations stay simple.
    return 60000 / (bpm * (tempoPct / 100));
  });
  const computePracticeTimingsFn = vi.fn(
    (beatMs: number, _opts?: { meter?: { beats: number; beatType: number } }) => ({
      countInMs: beatMs * 4, // 4-beat count-in
      laneLookaheadMs: beatMs * 8,
      beats: 4,
    })
  );

  let countIn = -1;
  let laneLookahead = -1;
  const setCountInMs = vi.fn((v: number) => {
    countIn = v;
  });
  const setLaneLookaheadMs = vi.fn((v: number) => {
    laneLookahead = v;
  });
  const setCountInClickMs = vi.fn();
  const setCountInGoMs = vi.fn();

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
    setCountInClickMs,
    setCountInGoMs,
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
    setCountInClickMs,
    setCountInGoMs,
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

  it('forces 100 in guided regardless of tempoPct setting', () => {
    const fx = makeFixture({ mode: 'guided', fullSongMode: false, tempoPct: 75 });
    expect(fx.pt.effectiveTempoPct()).toBe(100);
  });

  it('returns tempoPct in rhythm mode', () => {
    const fx = makeFixture({ mode: 'rhythm', fullSongMode: false, tempoPct: 75 });
    expect(fx.pt.effectiveTempoPct()).toBe(75);
  });

  it('returns 100 when tempoPct is 0 / falsy (rhythm)', () => {
    const fx = makeFixture({ mode: 'rhythm', tempoPct: 0 });
    expect(fx.pt.effectiveTempoPct()).toBe(100);
  });

  it('reads through the thunk on every call (mode change picks up immediately)', () => {
    const fx = makeFixture({ mode: 'rhythm', tempoPct: 60 });
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

  it('forwards timing fields + click-train info into practiceLane.setTimings', () => {
    // 仕様変更 (2026-07-19): setTimings はカウントダウン数字を可聴クリック
    // 列に一致させるための countInBeats / countInClickMs / countInGoMs も
    // 運ぶ。グリッド無しの曲では clickMs = countInMs/beats、goMs = countInMs
    // （旧挙動と同値）。
    const fx = makeFixture({ songBpm: 120, tempoPct: 100 });
    fx.pt.recomputePracticeTimings();
    expect(fx.laneSetTimings).toHaveBeenCalledWith({
      laneLookaheadMs: 4000,
      countInMs: 2000,
      countInBeats: 4,
      countInClickMs: 500,
      countInGoMs: 2000,
    });
  });

  it('reads practiceLane fresh per call (TDZ-safe thunk)', () => {
    const fx = makeFixture({ songBpm: 60, tempoPct: 100 });
    fx.pt.recomputePracticeTimings();
    fx.pt.recomputePracticeTimings();
    expect(fx.laneSetTimings).toHaveBeenCalledTimes(2);
  });

  it('grid の無い曲は meter なしで computePracticeTimings を呼ぶ（従来挙動）', () => {
    const fx = makeFixture({ songBpm: 120, tempoPct: 100 });
    fx.pt.recomputePracticeTimings();
    expect(fx.computePracticeTimingsFn).toHaveBeenCalledWith(500, undefined);
    expect(fx.setCountInGoMs).toHaveBeenCalledWith(2000); // = countInMs（弱起なし）
  });

  it('song.timeSig だけの曲（OSMD フォールバック）は meter として渡す', () => {
    const fx = makeFixture({
      song: { bpm: 120, timeSig: { beats: 3, beatType: 4 } },
      tempoPct: 100,
    });
    fx.pt.recomputePracticeTimings();
    expect(fx.computePracticeTimingsFn).toHaveBeenCalledWith(500, {
      meter: { beats: 3, beatType: 4 },
    });
  });
});

// ─── recomputePracticeTimings — 小節グリッド（拍子・弱起） ──────────

describe('createPracticeTimings — measureGrid 駆動の拍子・弱起アンカー', () => {
  // 1 拍ピックアップ (4/4) + 完全小節 2 個。120 BPM → 小節 2s、拍 0.5s。
  const pickupGrid = [
    { startSec: 0, durSec: 0.5, beats: 4, beatType: 4, implicit: true, barFrac: 0.25 },
    { startSec: 0.5, durSec: 2, beats: 4, beatType: 4 },
    { startSec: 2.5, durSec: 2, beats: 4, beatType: 4 },
  ];

  it('アンカー小節（弱起なら次の完全小節）の拍子を meter として渡す', () => {
    const fx = makeFixture({
      song: {
        bpm: 120,
        measureGrid: pickupGrid,
        sections: [{ startSec: 0 }],
        notes: [{ timeSec: 0 }],
      },
      tempoPct: 100,
    });
    fx.pt.recomputePracticeTimings(0);
    expect(fx.computePracticeTimingsFn).toHaveBeenCalledWith(500, {
      meter: { beats: 4, beatType: 4 },
    });
  });

  it('弱起: GO = countInMs + pickupSec×1000×(100/tempoPct)', () => {
    const fx = makeFixture({
      song: {
        bpm: 120,
        measureGrid: pickupGrid,
        sections: [{ startSec: 0 }],
        notes: [{ timeSec: 0 }],
      },
      tempoPct: 100,
    });
    fx.pt.recomputePracticeTimings(0);
    // countInMs = 500×4 = 2000（モック）。pickup = 0.5s → GO = 2500。
    expect(fx.setCountInGoMs).toHaveBeenCalledWith(2500);
    expect(fx.laneSetTimings).toHaveBeenCalledWith(expect.objectContaining({ countInGoMs: 2500 }));
  });

  it('弱起 + テンポ 75%: pickup はノート写像と同じ speedFactor でスケール', () => {
    const fx = makeFixture({
      song: {
        bpm: 120,
        measureGrid: pickupGrid,
        sections: [{ startSec: 0 }],
        notes: [{ timeSec: 0 }],
      },
      tempoPct: 75,
    });
    fx.pt.recomputePracticeTimings(0);
    // beatMs = 60000/(120×0.75) = 666.67 → countInMs = 2666.67。
    // pickupMs = 500 × (100/75) = 666.67 → GO = countInMs + 667。
    const countIn = fx.setCountInMs.mock.calls[0][0] as number;
    const go = fx.setCountInGoMs.mock.calls[0][0] as number;
    expect(go - countIn).toBe(Math.round((0.5 * 1000 * 100) / 75));
  });

  it('完全小節から始まるセクションは GO = countInMs（回帰なし）', () => {
    const fx = makeFixture({
      song: {
        bpm: 120,
        measureGrid: pickupGrid,
        sections: [{ startSec: 0 }, { startSec: 2.5 }],
        notes: [{ timeSec: 0 }],
      },
      tempoPct: 100,
    });
    fx.pt.recomputePracticeTimings(1);
    const countIn = fx.setCountInMs.mock.calls[0][0] as number;
    expect(fx.setCountInGoMs).toHaveBeenCalledWith(countIn);
  });

  it('明示 sectionIdx が無いときは practice.sectionIdx を使う', () => {
    const fx = makeFixture({
      song: {
        bpm: 120,
        measureGrid: pickupGrid,
        sections: [{ startSec: 0 }, { startSec: 2.5 }],
        notes: [{ timeSec: 0 }],
      },
      tempoPct: 100,
    });
    fx.practice.sectionIdx = 1; // 完全小節始まりのセクション
    fx.pt.recomputePracticeTimings();
    const countIn = fx.setCountInMs.mock.calls[0][0] as number;
    expect(fx.setCountInGoMs).toHaveBeenCalledWith(countIn);
  });

  it('全曲再生 (listen+fullSong): アンカーは最初の音・speedFactor は 1', () => {
    const fx = makeFixture({
      mode: 'listen',
      fullSongMode: true,
      tempoPct: 50, // 全曲では無視される
      song: {
        bpm: 120,
        measureGrid: pickupGrid,
        sections: [{ startSec: 0 }],
        // 最初の音がピックアップ小節の途中 (0.25s) から。
        notes: [{ timeSec: 0.25 }],
      },
    });
    fx.pt.recomputePracticeTimings(0);
    const countIn = fx.setCountInMs.mock.calls[0][0] as number;
    // pickup = 0.5 - 0.25 = 0.25s → GO = countInMs + 250（×1 — 100% 固定）。
    expect(fx.setCountInGoMs).toHaveBeenCalledWith(countIn + 250);
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
