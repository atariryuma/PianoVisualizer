// @vitest-environment happy-dom
//
// Tests for packages/web/src/result-card.ts.
//
// Three covered surfaces:
//   • renderResultCard — every branch (listen / full-song listen / rhythm
//     / guided + tier titleKey + unlocked-msg permutations + missing
//     section)
//   • completePracticeSection — listen-no-scoring early return,
//     rhythm scoring → unlocks → history → renderResultCard +
//     star celebration thresholds
//   • drawHistoryChart — early-return on <2 entries, basic call shape
//
// All deps are stubbed; we never go through @piano/core in these tests
// (the unlock / star math is tested separately in core).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createResultCard,
  drawHistoryChart,
  type ResultCardDeps,
  type ResultCardDom,
  type ResultCardPracticeRef,
  type ResultCardSong,
  type ResultCardSongProgress,
} from '../src/result-card';

function makeDom(): ResultCardDom {
  document.body.innerHTML = `
    <div id="sectionResult">
      <h2 id="resTitle"></h2>
      <h3 id="resSectionName"></h3>
      <div id="resStars"></div>
      <div class="result-stat" id="resAccRow">
        <span id="resAcc"></span>
      </div>
      <div class="result-stat" id="resTimingRow">
        <span id="resTiming"></span>
      </div>
      <div class="result-stat" id="resDurationRow">
        <span id="resDuration"></span>
      </div>
      <div class="result-stat" id="resComboRow">
        <span id="resCombo"></span>
      </div>
      <div id="resMsg"></div>
      <div id="resFocus"></div>
      <div id="resUnlock"></div>
      <div id="resSelfAssess" style="display: none">
        <button id="resFeelTricky"></button>
        <button id="resFeelOk"></button>
        <button id="resFeelGreat"></button>
        <div id="resFeelResult" style="display: none"></div>
      </div>
      <div id="resHistoryWrap">
        <canvas id="resHistoryChart" width="280" height="80"></canvas>
      </div>
      <button id="resNext"></button>
      <button id="resTryPlay"></button>
    </div>
  `;
  return {
    sectionResult: document.getElementById('sectionResult') as HTMLElement,
    resTitle: document.getElementById('resTitle') as HTMLElement,
    resSectionName: document.getElementById('resSectionName') as HTMLElement,
    resStars: document.getElementById('resStars') as HTMLElement,
    resAcc: document.getElementById('resAcc') as HTMLElement,
    resTiming: document.getElementById('resTiming') as HTMLElement,
    resDuration: document.getElementById('resDuration') as HTMLElement,
    resDurationRow: document.getElementById('resDurationRow'),
    resCombo: document.getElementById('resCombo') as HTMLElement,
    resMsg: document.getElementById('resMsg') as HTMLElement,
    resFocus: document.getElementById('resFocus') as HTMLElement,
    resUnlock: document.getElementById('resUnlock') as HTMLElement,
    resSelfAssess: document.getElementById('resSelfAssess') as HTMLElement,
    resFeelTricky: document.getElementById('resFeelTricky') as HTMLElement,
    resFeelOk: document.getElementById('resFeelOk') as HTMLElement,
    resFeelGreat: document.getElementById('resFeelGreat') as HTMLElement,
    resFeelResult: document.getElementById('resFeelResult') as HTMLElement,
    resHistoryWrap: document.getElementById('resHistoryWrap'),
    resHistoryChart: document.getElementById('resHistoryChart') as HTMLCanvasElement,
    resNext: document.getElementById('resNext') as HTMLElement,
    resTryPlay: document.getElementById('resTryPlay'),
  };
}

function makeSong(): ResultCardSong {
  return {
    id: 'fur_elise',
    titleKey: 'furElise',
    sections: [
      { id: 'a1', nameKey: 'feA1' },
      { id: 'b', nameKey: 'feB' },
      { id: 'a2', nameKey: 'feA2', isBoss: true },
    ],
  };
}

/** happy-dom doesn't provide a real canvas 2D context — stub the
 *  CanvasRenderingContext2D shape with the methods + props the chart
 *  uses. Each method is a vi.fn() so spy-friendly. */
function makeStubCtx(): CanvasRenderingContext2D {
  const stub: Record<string, unknown> = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  return stub as unknown as CanvasRenderingContext2D;
}

function makeProg(): ResultCardSongProgress {
  return {
    unlockedTempos: { 60: true, 75: true },
    unlockedSections: { a1: true, b: true },
    sections: { a1: { stars: 1, bestPct: 50 } },
    history: {},
  };
}

function makeDeps(over: Partial<ResultCardDeps> = {}): ResultCardDeps {
  const practice: ResultCardPracticeRef = {
    enabled: true,
    mode: 'rhythm',
    sectionIdx: 0,
    fullSongMode: false,
    tempoPct: 75,
    hits: 0,
    misses: 0,
    sectionCombo: 0,
    sectionBestCombo: 0,
    timingScoreSum: 0,
    durationScoreSum: 0,
    durationScoredCount: 0,
    _completing: false,
    _sectionTargetCount: 10,
    pendingHolds: { clear: vi.fn() },
    progress: { streakCount: 3 },
    _lastResult: null,
  };
  return {
    dom: makeDom(),
    practice,
    getCurrentSong: () => makeSong(),
    songProg: () => makeProg(),
    sectionIds: ['a1', 'b', 'a2'],
    stopPracticeAudio: vi.fn(),
    releaseWakeLock: vi.fn(),
    recordPracticeDay: vi.fn(),
    savePracticeProgress: vi.fn(),
    computeStars: vi.fn(() => 2),
    resolveResultTier: vi.fn(() => ({ titleKey: 'tier2Title', msgKey: 'tier2Msg' })),
    pickSectionFocus: vi.fn(() => null),
    computeUnlocks: vi.fn(() => ({
      unlockedTempo: 90,
      unlockedSecKey: 'feA2',
      streakDays: 3,
    })),
    effectGoldenBurst: vi.fn(),
    effectStarShower: vi.fn(),
    effectFlowerBurst: vi.fn(),
    setupHiDPICanvas: vi.fn((canvas: HTMLCanvasElement) => canvas.getContext('2d')!),
    clamp01: vi.fn((v: number) => Math.max(0, Math.min(1, v))),
    t: vi.fn((key, vars) => (vars ? `${key}{${JSON.stringify(vars)}}` : key)),
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── renderResultCard ────────────────────────────────────────────────

describe('createResultCard — renderResultCard', () => {
  it('no-ops when practice._lastResult is null', () => {
    const deps = makeDeps();
    const rc = createResultCard(deps);
    rc.renderResultCard();
    expect(deps.dom.resTitle.textContent).toBe('');
  });

  it('listen mode renders listenedTitle + section name + hides stars', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'listen',
      secId: 'b',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resTitle.textContent).toBe('listenedTitle');
    expect(deps.dom.resSectionName.textContent).toBe('feB');
    expect(deps.dom.resStars.style.display).toBe('none');
    expect(deps.dom.resMsg.textContent).toBe('listenedMsg');
    expect(deps.dom.resNext.style.display).toBe('none');
    expect(deps.dom.resTryPlay!.style.display).toBe('');
  });

  it('full-song listen renders the song title as the subtitle', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'listen',
      secId: 'a1',
      fullSong: true,
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resTitle.textContent).toBe('listenedFullTitle');
    expect(deps.dom.resSectionName.textContent).toBe('furElise');
    expect(deps.dom.resMsg.textContent).toBe('listenedFullMsg');
  });

  it('listen-mode missing-section bails (e.g. song deleted between save + render)', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'listen',
      secId: 'NOPE',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resTitle.textContent).toBe('');
  });

  it('rhythm result paints tier title + section name (with crown for boss)', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'rhythm',
      secId: 'a2',
      stars: 3,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resTitle.textContent).toBe('tier2Title');
    expect(deps.dom.resSectionName.textContent).toBe('feA2 👑');
    expect(deps.dom.resMsg.textContent).toBe('tier2Msg');
  });

  it('builds the unlocked-msg from tempo + section + streak entries', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'rhythm',
      secId: 'a1',
      stars: 3,
      unlockedTempo: 90,
      unlockedSecKey: 'feA2',
      streakDays: 7,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resUnlock.textContent).toContain('tempoUnlockedFmt');
    expect(deps.dom.resUnlock.textContent).toContain('sectionUnlockedFmt');
    expect(deps.dom.resUnlock.textContent).toContain('streakDaysFmt');
  });

  it('hides resTryPlay in rhythm results', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'rhythm',
      secId: 'a1',
      stars: 1,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resTryPlay!.style.display).toBe('none');
  });

  it('renders guided completion as non-scoring (no stars, guidedComplete copy)', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'guided',
      secId: 'a1',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resTitle.textContent).toBe('guidedCompleteTitle');
    expect(deps.dom.resMsg.textContent).toBe('guidedCompleteMsg');
    expect(deps.dom.resStars.style.display).toBe('none');
    expect(deps.dom.resUnlock.textContent).toBe('');
    expect(deps.dom.resTryPlay!.style.display).toBe('none');
  });

  it('paints the KP coaching line and tints the focused stat row', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'rhythm',
      secId: 'a1',
      stars: 1,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
      focus: { strengthKey: 'sfNotesStrong', focusKey: 'fTiming', focusDim: 'timing' },
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resFocus!.textContent).toContain('sectionFocusFmt');
    expect(deps.dom.resFocus!.style.display).toBe('');
    // Only the timing row is emphasised.
    expect(deps.dom.resTiming.closest('.result-stat')!.classList.contains('focus-row')).toBe(true);
    expect(deps.dom.resAcc.closest('.result-stat')!.classList.contains('focus-row')).toBe(false);
    expect(deps.dom.resDuration.closest('.result-stat')!.classList.contains('focus-row')).toBe(
      false
    );
  });

  it('hides the coaching line and clears emphasis on a clean (focus=null) run', () => {
    const deps = makeDeps();
    // Pre-dirty the timing row to prove the render clears stale emphasis.
    deps.dom.resTiming.closest('.result-stat')!.classList.add('focus-row');
    deps.practice._lastResult = {
      mode: 'rhythm',
      secId: 'a1',
      stars: 3,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
      focus: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resFocus!.textContent).toBe('');
    expect(deps.dom.resFocus!.style.display).toBe('none');
    expect(deps.dom.resTiming.closest('.result-stat')!.classList.contains('focus-row')).toBe(false);
  });

  it('clears any coaching emphasis when switching to a listen result', () => {
    const deps = makeDeps();
    deps.dom.resAcc.closest('.result-stat')!.classList.add('focus-row');
    deps.practice._lastResult = {
      mode: 'listen',
      secId: 'b',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resFocus!.textContent).toBe('');
    expect(deps.dom.resAcc.closest('.result-stat')!.classList.contains('focus-row')).toBe(false);
  });
});

// ─── completePracticeSection ─────────────────────────────────────────

describe('createResultCard — completePracticeSection', () => {
  it('disables practice + stops audio + releases wake-lock + clears holds', () => {
    const deps = makeDeps();
    createResultCard(deps).completePracticeSection();
    expect(deps.practice.enabled).toBe(false);
    expect(deps.stopPracticeAudio).toHaveBeenCalled();
    expect(deps.releaseWakeLock).toHaveBeenCalled();
    expect(deps.practice.pendingHolds.clear).toHaveBeenCalled();
  });

  it('bails when currentSong.sections[sectionIdx] is undefined (caught by dev-mode bench)', () => {
    const deps = makeDeps();
    deps.practice.sectionIdx = 99; // out of range → undefined
    deps.practice.mode = 'listen';
    createResultCard(deps).completePracticeSection();
    // Defensive guard means we DO clean up _completing but skip the
    // scoring + render path — don't throw, don't write _lastResult.
    expect(deps.practice._completing).toBe(false);
    expect(deps.practice._lastResult).toBeNull();
    expect(deps.dom.sectionResult.classList.contains('visible')).toBe(false);
  });

  it('listen mode skips scoring + just renders the result modal', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    createResultCard(deps).completePracticeSection();
    expect(deps.computeStars).not.toHaveBeenCalled();
    expect(deps.computeUnlocks).not.toHaveBeenCalled();
    expect(deps.recordPracticeDay).not.toHaveBeenCalled();
    expect(deps.dom.sectionResult.classList.contains('visible')).toBe(true);
    expect(deps.practice._lastResult?.mode).toBe('listen');
  });

  it('full-song listen stamps fullSong:true on the snapshot', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    deps.practice.fullSongMode = true;
    createResultCard(deps).completePracticeSection();
    expect(deps.practice._lastResult?.fullSong).toBe(true);
  });

  it('rhythm scoring computes stars from accPct/timingPct/durPct', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    deps.practice.hits = 8;
    deps.practice.misses = 2;
    deps.practice.timingScoreSum = 7.5;
    deps.practice.durationScoreSum = 6;
    deps.practice.durationScoredCount = 8;
    deps.practice._sectionTargetCount = 10;
    createResultCard(deps).completePracticeSection();
    expect(deps.computeStars).toHaveBeenCalledWith(80, 94, 75);
  });

  it('persists progress + records practice day in scoring path', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(deps.recordPracticeDay).toHaveBeenCalled();
    expect(deps.savePracticeProgress).toHaveBeenCalled();
  });

  it('star ≥ 3 fires golden burst + 8-star shower', () => {
    const deps = makeDeps({ computeStars: vi.fn(() => 3) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(deps.effectGoldenBurst).toHaveBeenCalled();
    expect(deps.effectStarShower).toHaveBeenCalledWith(8);
  });

  it('star == 2 fires flower burst + 5-star shower', () => {
    const deps = makeDeps({ computeStars: vi.fn(() => 2) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(deps.effectFlowerBurst).toHaveBeenCalled();
    expect(deps.effectStarShower).toHaveBeenCalledWith(5);
  });

  it('star == 1 fires only a 3-star shower', () => {
    const deps = makeDeps({ computeStars: vi.fn(() => 1) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(deps.effectGoldenBurst).not.toHaveBeenCalled();
    expect(deps.effectFlowerBurst).not.toHaveBeenCalled();
    expect(deps.effectStarShower).toHaveBeenCalledWith(3);
  });

  it('star == 0 fires no celebration effects', () => {
    const deps = makeDeps({ computeStars: vi.fn(() => 0) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(deps.effectStarShower).not.toHaveBeenCalled();
  });

  it('renders 3 star spans (filled vs empty by star count)', () => {
    const deps = makeDeps({ computeStars: vi.fn(() => 2) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    const spans = deps.dom.resStars.querySelectorAll('span');
    expect(spans.length).toBe(3);
    expect(spans[0].className).toBe('');
    expect(spans[1].className).toBe('');
    expect(spans[2].className).toBe('empty');
  });

  it('hides resDurationRow when durPct is null (guided mode)', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    deps.practice.durationScoredCount = 0;
    createResultCard(deps).completePracticeSection();
    expect(deps.dom.resDurationRow!.style.display).toBe('none');
  });

  it('shows resDurationRow when durPct is computed', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    deps.practice.durationScoredCount = 5;
    deps.practice.durationScoreSum = 4;
    createResultCard(deps).completePracticeSection();
    expect(deps.dom.resDurationRow!.style.display).toBe('');
  });

  it('shows resNext when next section is unlocked', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    deps.practice.sectionIdx = 0; // a1, next is b which is unlocked in fixture
    createResultCard(deps).completePracticeSection();
    expect(deps.dom.resNext.style.display).toBe('');
  });

  it('hides resNext when next section is locked', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    deps.practice.sectionIdx = 1; // b, next is a2 which is NOT unlocked in fixture
    createResultCard(deps).completePracticeSection();
    expect(deps.dom.resNext.style.display).toBe('none');
  });

  it('clamps history to 8 entries', () => {
    const sp = makeProg();
    sp.history.a1 = Array.from({ length: 8 }, (_, i) => ({
      d: i,
      a: 50,
      t: 50,
      s: 1,
    }));
    // Override the setupHiDPICanvas so happy-dom's null 2D context
    // doesn't crash drawHistoryChart in this test path.
    const deps = makeDeps({
      songProg: () => sp,
      setupHiDPICanvas: vi.fn(() => makeStubCtx()),
    });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(sp.history.a1.length).toBe(8); // pushed + shifted, still 8
  });

  it('caches snapshot on practice._lastResult for langchange re-render', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(deps.practice._lastResult).toMatchObject({
      mode: 'rhythm',
      secId: 'a1',
      stars: 2,
      unlockedTempo: 90,
    });
  });

  it('computes + caches the KP focus and paints it end-to-end', () => {
    const focus = {
      strengthKey: 'sfHoldStrong' as const,
      focusKey: 'fNotes' as const,
      focusDim: 'accuracy' as const,
    };
    const pickSectionFocus = vi.fn(() => focus);
    const deps = makeDeps({ pickSectionFocus });
    deps.practice.mode = 'rhythm';
    deps.practice.hits = 5;
    deps.practice.timingScoreSum = 4;
    createResultCard(deps).completePracticeSection();
    // pickSectionFocus is fed the scored percentages + star count.
    // hits 5 / target 10 = 50% acc; timingScoreSum 4 / hits 5 = 80% timing;
    // no durations scored → null; computeStars stub → 2 stars.
    expect(pickSectionFocus).toHaveBeenCalledWith(50, 80, null, 2);
    expect(deps.practice._lastResult?.focus).toEqual(focus);
    expect(deps.dom.resFocus!.textContent).toContain('sectionFocusFmt');
    expect(deps.dom.resAcc.closest('.result-stat')!.classList.contains('focus-row')).toBe(true);
  });

  it('persists unlock outcomes back into songProg', () => {
    const sp = makeProg();
    const deps = makeDeps({
      songProg: () => sp,
      computeUnlocks: vi.fn(() => ({
        unlockedTempo: 90,
        unlockedSecKey: 'feB',
        streakDays: null,
      })),
    });
    deps.practice.mode = 'rhythm';
    deps.practice.sectionIdx = 0; // a1; next is b
    createResultCard(deps).completePracticeSection();
    expect(sp.unlockedTempos[90]).toBe(true);
    expect(sp.unlockedSections.b).toBe(true);
  });
});

// ─── drawHistoryChart ────────────────────────────────────────────────

describe('drawHistoryChart', () => {
  it('clears the canvas + bails on <2 entries', () => {
    const canvas = document.createElement('canvas');
    const ctx = makeStubCtx();
    const deps = {
      setupHiDPICanvas: vi.fn(() => ctx),
      clamp01: (v: number) => Math.max(0, Math.min(1, v)),
      t: vi.fn((k) => k),
    };
    drawHistoryChart(deps, canvas, [{ d: 0, a: 50, t: 50, s: 1 }]);
    expect(ctx.clearRect).toHaveBeenCalled();
    // 0 axis-label fillText calls past the early-return path
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('draws a line + per-point dots when ≥2 entries are supplied', () => {
    const canvas = document.createElement('canvas');
    const ctx = makeStubCtx();
    const deps = {
      setupHiDPICanvas: vi.fn(() => ctx),
      clamp01: (v: number) => Math.max(0, Math.min(1, v)),
      t: vi.fn((k) => k),
    };
    const history = [
      { d: 0, a: 50, t: 50, s: 1 },
      { d: 1, a: 75, t: 70, s: 2 },
      { d: 2, a: 90, t: 85, s: 3 },
    ];
    drawHistoryChart(deps, canvas, history);
    // Multiple beginPath calls: 3 grid lines + 1 line graph + N dots.
    // The 3-star entry adds an extra halo path. Expect > 3 to be safe.
    expect((ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(3);
  });

  it('uses trendSimilar when delta is small', () => {
    const canvas = document.createElement('canvas');
    const ctx = makeStubCtx();
    const tFn = vi.fn((k: string) => k);
    const deps = {
      setupHiDPICanvas: vi.fn(() => ctx),
      clamp01: (v: number) => Math.max(0, Math.min(1, v)),
      t: tFn,
    };
    drawHistoryChart(deps, canvas, [
      { d: 0, a: 50, t: 50, s: 1 },
      { d: 1, a: 51, t: 51, s: 1 },
    ]);
    expect(tFn).toHaveBeenCalledWith('trendSimilar');
  });
});

// ─── self-assessment (SRL reflection) ────────────────────────────────

describe('createResultCard — self-assessment', () => {
  function showRhythm(stars: number) {
    const deps = makeDeps();
    const rc = createResultCard(deps);
    deps.practice._lastResult = {
      mode: 'rhythm',
      secId: 'a1',
      stars,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    rc.renderResultCard();
    return { deps, rc };
  }

  it('shows the prompt block with no reply until a button is tapped', () => {
    const { deps } = showRhythm(2);
    expect(deps.dom.resSelfAssess!.style.display).toBe('');
    expect(deps.dom.resFeelResult!.style.display).toBe('none');
    expect(deps.dom.resFeelResult!.textContent).toBe('');
    expect(deps.dom.resFeelGreat!.classList.contains('chosen')).toBe(false);
  });

  it('gives the earned-confidence reply when the kid felt great AND cleared (★2+)', () => {
    const { deps } = showRhythm(2);
    deps.dom.resFeelGreat!.click();
    expect(deps.dom.resFeelResult!.textContent).toBe('selfAssessReplyGreatWin');
    expect(deps.dom.resFeelResult!.style.display).toBe('');
    expect(deps.dom.resFeelGreat!.classList.contains('chosen')).toBe(true);
    expect(deps.dom.resFeelTricky!.classList.contains('chosen')).toBe(false);
  });

  it('praises the noticing when the kid felt it was tricky and is not there yet', () => {
    const { deps } = showRhythm(1);
    deps.dom.resFeelTricky!.click();
    expect(deps.dom.resFeelResult!.textContent).toBe('selfAssessReplyTricky');
  });

  it('never makes a score claim on a low scored run that felt great', () => {
    const { deps } = showRhythm(1);
    deps.dom.resFeelGreat!.click();
    // The non-"Win" reply — honors the joy, makes no claim about the score.
    expect(deps.dom.resFeelResult!.textContent).toBe('selfAssessReplyGreat');
  });

  it('uses score-free replies for guided completion (no stars to calibrate)', () => {
    const deps = makeDeps();
    const rc = createResultCard(deps);
    deps.practice._lastResult = {
      mode: 'guided',
      secId: 'a1',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
    };
    rc.renderResultCard();
    deps.dom.resFeelGreat!.click();
    expect(deps.dom.resFeelResult!.textContent).toBe('selfAssessReplyGreat');
  });

  it('keeps the chosen reply across a langchange re-render', () => {
    const { deps, rc } = showRhythm(2);
    deps.dom.resFeelOk!.click();
    expect(deps.dom.resFeelResult!.textContent).toBe('selfAssessReplyOk');
    rc.renderResultCard(); // simulate JP↔EN flip
    expect(deps.dom.resFeelResult!.textContent).toBe('selfAssessReplyOk');
    expect(deps.dom.resFeelOk!.classList.contains('chosen')).toBe(true);
  });

  it('resets the reflection on the next completed attempt', () => {
    const { deps, rc } = showRhythm(2);
    deps.dom.resFeelGreat!.click();
    expect(deps.dom.resFeelResult!.style.display).toBe('');
    deps.practice.mode = 'rhythm';
    rc.completePracticeSection();
    expect(deps.dom.resFeelResult!.style.display).toBe('none');
    expect(deps.dom.resFeelResult!.textContent).toBe('');
    expect(deps.dom.resFeelGreat!.classList.contains('chosen')).toBe(false);
  });

  it('ignores taps when there is no active result snapshot', () => {
    const deps = makeDeps();
    createResultCard(deps);
    deps.practice._lastResult = null;
    deps.dom.resFeelGreat!.click();
    expect(deps.dom.resFeelResult!.textContent).toBe('');
  });
});
