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
  drawErrorDistribution,
  drawHistoryChart,
  type ResultCardDeps,
  type ResultCardDom,
  type ResultCardPracticeRef,
  type ResultCardSong,
  type ResultCardSongProgress,
} from '../src/result-card';
import {
  createJudgeTally,
  resetJudgeTally,
  summarizeJudgements,
  resolveJudgeProfile,
  JUDGE_PROFILE_MIDI,
  type JudgeTally,
} from '@piano/core';

function makeDom(): ResultCardDom {
  document.body.innerHTML = `
    <div id="sectionResult">
      <h2 id="resTitle"></h2>
      <h3 id="resSectionName"></h3>
      <div id="resStars" class="result-scored-only"></div>
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
      <div id="resBadges" class="result-scored-only"></div>
      <button id="resDetailsToggle" aria-expanded="false"></button>
      <div id="resJudge" class="result-scored-only" style="display: none">
        <div id="resJudgeTitle"></div>
        <div id="resJudgeBar"></div>
        <div id="resJudgeRows"></div>
        <canvas id="resJudgeErrorChart" width="280" height="46"></canvas>
        <div id="resJudgeSpread"></div>
        <div id="resJudgeTendency"></div>
        <div id="resJudgeHoldTitle"></div>
        <div id="resJudgeHoldRows"></div>
        <div id="resJudgeHold"></div>
        <div id="resJudgeCond"></div>
      </div>
      <div id="resDetails" class="result-scored-only" hidden></div>
      <div id="resMsg"></div>
      <div id="resNoScoreFacts"></div>
      <div id="resFocus" class="result-scored-only"></div>
      <div id="resUnlock"></div>
      <div id="resSelfAssess" style="display: none">
        <button id="resFeelTricky"></button>
        <button id="resFeelOk"></button>
        <button id="resFeelGreat"></button>
        <div id="resFeelResult" style="display: none"></div>
      </div>
      <div id="resHistoryWrap" class="result-scored-only">
        <canvas id="resHistoryChart" width="280" height="80"></canvas>
      </div>
      <button id="resNext"></button>
      <button id="resTryPlay"></button>
      <button id="resRetrySlow" style="display: none"></button>
      <button id="resTempoUp" style="display: none"></button>
      <button id="resStretch" data-i18n="stretchBtn" style="display: none"></button>
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
    resJudge: document.getElementById('resJudge'),
    resBadges: document.getElementById('resBadges'),
    resDetails: document.getElementById('resDetails'),
    resDetailsToggle: document.getElementById('resDetailsToggle'),
    resJudgeTitle: document.getElementById('resJudgeTitle'),
    resJudgeBar: document.getElementById('resJudgeBar'),
    resJudgeRows: document.getElementById('resJudgeRows'),
    resJudgeErrorChart: document.getElementById('resJudgeErrorChart') as HTMLCanvasElement,
    resJudgeSpread: document.getElementById('resJudgeSpread'),
    resJudgeTendency: document.getElementById('resJudgeTendency'),
    resJudgeHoldTitle: document.getElementById('resJudgeHoldTitle'),
    resJudgeHoldRows: document.getElementById('resJudgeHoldRows'),
    resJudgeHold: document.getElementById('resJudgeHold'),
    resJudgeCond: document.getElementById('resJudgeCond'),
    resMsg: document.getElementById('resMsg') as HTMLElement,
    resNoScoreFacts: document.getElementById('resNoScoreFacts') as HTMLElement,
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
    resRetrySlow: document.getElementById('resRetrySlow'),
    resTempoUp: document.getElementById('resTempoUp'),
    resStretch: document.getElementById('resStretch'),
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
    fillRect: vi.fn(),
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
    // Required deps (the breakdown is a shipped surface, so it is not optional).
    summarizeJudgements,
    getJudgeStrictness: () => 'normal' as const,
    isExactInput: () => false,
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

// ─── speed trainer: renderTempoUp ────────────────────────────────────

describe('createResultCard — speed-trainer step-up button', () => {
  const rhythmResult = (over: Record<string, unknown> = {}) => ({
    mode: 'rhythm' as const,
    secId: 'a1',
    stars: 2,
    unlockedTempo: null,
    unlockedSecKey: null,
    streakDays: null,
    tempoPct: 75,
    ...over,
  });

  it('shows 🚀 next-tempo button on a ★2+ clear below 100%', () => {
    const deps = makeDeps({ planTempoStepUp: (t: number) => (t === 75 ? 90 : null) });
    deps.practice._lastResult = rhythmResult();
    createResultCard(deps).renderResultCard();
    const btn = deps.dom.resTempoUp as HTMLElement & { dataset: DOMStringMap };
    expect(btn.style.display).not.toBe('none');
    expect(btn.dataset.tempo).toBe('90');
  });

  it('hides the button when planTempoStepUp returns null (top of ladder / < ★2)', () => {
    const deps = makeDeps({ planTempoStepUp: () => null });
    deps.practice._lastResult = rhythmResult({ tempoPct: 100 });
    createResultCard(deps).renderResultCard();
    expect((deps.dom.resTempoUp as HTMLElement).style.display).toBe('none');
  });

  it('never shows for listen mode', () => {
    const deps = makeDeps({ planTempoStepUp: () => 90 });
    deps.practice._lastResult = rhythmResult({ mode: 'listen', stars: 0 });
    createResultCard(deps).renderResultCard();
    expect((deps.dom.resTempoUp as HTMLElement).style.display).toBe('none');
  });
});

// ─── per-note judgement breakdown ────────────────────────────────────
// The whole point of this block is that the result reports the SAME verdicts
// the player was shown note by note. These tests pin that contract: real
// summarizeJudgements + real tally in, rendered counts out.

describe('createResultCard — per-note judgement breakdown', () => {
  const tally = (over: Partial<JudgeTally> = {}): JudgeTally => ({
    ...createJudgeTally(),
    ...over,
  });

  const judgeResult = (judge: JudgeTally | null, over: Record<string, unknown> = {}) => ({
    mode: 'rhythm' as const,
    secId: 'a1',
    stars: 2,
    unlockedTempo: null,
    unlockedSecKey: null,
    streakDays: null,
    judge,
    ...over,
  });

  function render(judge: JudgeTally | null, over: Record<string, unknown> = {}) {
    const deps = makeDeps();
    deps.practice._lastResult = judgeResult(judge, over);
    createResultCard(deps).renderResultCard();
    return deps;
  }

  it('renders one count per tier, using the same words as the live chips', () => {
    const deps = render(tally({ perfect: 7, great: 3, good: 4, miss: 2 }));
    const rows = deps.dom.resJudgeRows as HTMLElement;
    expect((deps.dom.resJudge as HTMLElement).style.display).not.toBe('none');
    expect(rows.textContent).toContain('PERFECT7');
    expect(rows.textContent).toContain('GREAT3');
    expect(rows.textContent).toContain('GOOD4');
    expect(rows.textContent).toContain('MISS2');
    // Quality tiers only — direction is reported as a distribution.
    expect(rows.textContent).not.toContain('EARLY');
    expect(rows.textContent).not.toContain('LATE');
  });

  it('dims zero tiers instead of dropping them (the scale stays readable)', () => {
    const deps = render(tally({ perfect: 5, great: 1, good: 0, miss: 0 }));
    const spans = (deps.dom.resJudgeRows as HTMLElement).querySelectorAll('span');
    expect(spans.length).toBe(4);
    expect(spans[2].className).toBe('is-zero'); // GOOD
    expect(spans[0].className).toBe(''); // PERFECT
  });

  it('bar segments are proportional to the counts and skip empty tiers', () => {
    const deps = render(tally({ perfect: 3, great: 1, miss: 0 }));
    const segs = (deps.dom.resJudgeBar as HTMLElement).querySelectorAll('span');
    expect(segs.length).toBe(2);
    expect(segs[0].style.width).toBe('75.00%');
    expect(segs[1].style.width).toBe('25.00%');
  });

  it('reports the lean direction + its mean offset as an adjustment', () => {
    // Mean +40 ms but the errors scatter (meanAbs 80) → a real habit, not a
    // constant offset, so the player gets the technique adjustment.
    const deps = render(tally({ great: 4, dtSumMs: 160, dtAbsSumMs: 320 }));
    expect((deps.dom.resJudgeTendency as HTMLElement).textContent).toContain(
      'judgeTendencyLateFmt'
    );
    expect((deps.dom.resJudgeTendency as HTMLElement).textContent).toContain('40');
    expect((deps.dom.resJudgeSpread as HTMLElement).textContent).toContain('judgeSpreadFmt');
  });

  it('states the bias ONCE — spread line carries no competing average', () => {
    // Regression guard: the spread line used to print the mean-ABSOLUTE
    // deviation while the tendency line printed the signed mean, so two
    // adjacent lines each claimed to be "the average deviation" with different
    // numbers (57 ms vs +39 ms) and read as a contradiction.
    const deps = render(
      tally({ great: 8, dtSumMs: 8 * 39, dtAbsSumMs: 8 * 57, dtSqSumMs: 8 * 64 * 64 })
    );
    const spread = (deps.dom.resJudgeSpread as HTMLElement).textContent ?? '';
    expect(spread).toContain('judgeSpreadFmt');
    // Only the standard deviation is interpolated — no mean of any kind.
    expect(spread).not.toContain('57');
    expect(spread).not.toContain('39');
    expect((deps.dom.resJudgeTendency as HTMLElement).textContent).toContain('39');
  });

  it('blames the SETTINGS, not the player, when every note is off the same way', () => {
    // Mean +95 ms with meanAbs 95 → consistency 1.0: that is note-fall speed or
    // the audio offset being wrong, and coaching "press sooner" would be asking
    // the child to compensate for our own configuration.
    const deps = render(tally({ great: 8, dtSumMs: 760, dtAbsSumMs: 760, dtSqSumMs: 8 * 95 * 95 }));
    const line = (deps.dom.resJudgeTendency as HTMLElement).textContent ?? '';
    expect(line).toContain('judgeSetupSuspectFmt');
    expect(line).not.toContain('judgeTendencyLateFmt');
  });

  it('celebrates an even run rather than inventing an adjustment', () => {
    const deps = render(tally({ perfect: 4, dtSumMs: 8, dtAbsSumMs: 24 }));
    expect((deps.dom.resJudgeTendency as HTMLElement).textContent).toBe('judgeTendencyEven');
  });

  it('says nothing about lean or spread below the sample floor', () => {
    const deps = render(tally({ late: 2, dtSumMs: 600, dtAbsSumMs: 600 }));
    expect((deps.dom.resJudgeTendency as HTMLElement).textContent).toBe('');
    expect((deps.dom.resJudgeSpread as HTMLElement).textContent).toBe('');
  });

  it('shows the hold breakdown only when releases were scored', () => {
    const withHolds = render(tally({ perfect: 4, holdGood: 3, holdShort: 2 }));
    expect((withHolds.dom.resJudgeHoldRows as HTMLElement).textContent).toContain('GOOD3');
    expect((withHolds.dom.resJudgeHold as HTMLElement).textContent).toBe('judgeHoldShort');

    const noHolds = render(tally({ perfect: 4 }));
    expect((noHolds.dom.resJudgeHoldRows as HTMLElement).textContent).toBe('');
    expect((noHolds.dom.resJudgeHoldTitle as HTMLElement).style.display).toBe('none');
    expect((noHolds.dom.resJudgeHold as HTMLElement).textContent).toBe('');
  });

  it('reports the conditions the run was judged under', () => {
    // Two attempts judged at different strictness, or one on mic and one on a
    // keyboard, are not comparable — so the card has to say which was which.
    const deps = makeDeps({
      getJudgeStrictness: () => 'strict' as const,
      isExactInput: () => true,
    });
    deps.practice.judge = tally({ perfect: 5 });
    createResultCard(deps).completePracticeSection();
    const cond = (deps.dom.resJudgeCond as HTMLElement).textContent ?? '';
    expect(cond).toContain('judgeCondFmt');
    expect(cond).toContain('judgeStrict');
    expect(cond).toContain('judgeInputMidi');
  });

  it('snapshots the CONDITIONS the run used, and the windows follow from them', () => {
    // The windows are a pure function of (input path × strictness), so the
    // snapshot stores those two and derives the profile — one fact, not two
    // that can disagree.
    const deps = makeDeps({
      getJudgeStrictness: () => 'normal' as const,
      isExactInput: () => true,
    });
    deps.practice.judge = tally({ perfect: 5, dtSumMs: 100, dtAbsSumMs: 100 });
    createResultCard(deps).completePracticeSection();
    const snap = deps.practice._lastResult;
    expect(snap?.judgeStrictness).toBe('normal');
    expect(snap?.judgeInputExact).toBe(true);
    expect(resolveJudgeProfile(snap?.judgeInputExact ?? false, snap?.judgeStrictness)).toEqual(
      JUDGE_PROFILE_MIDI
    );
  });

  it('draws the error distribution against the tier bands, with the mean marked', () => {
    // happy-dom has no real 2D context — inject the stub the chart tests use.
    const ctx = makeStubCtx() as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const sum = summarizeJudgements(
      tally({ great: 6, dtSumMs: 6 * 40, dtAbsSumMs: 6 * 60, dtSqSumMs: 6 * 3600 })
    );
    drawErrorDistribution(
      {
        setupHiDPICanvas: vi.fn(() => ctx as unknown as CanvasRenderingContext2D),
        t: vi.fn((k: string) => k),
      } as unknown as ResultCardDeps,
      { clientWidth: 300 } as HTMLCanvasElement,
      sum,
      // MIDI × normal → 12 frames = 200 ms window.
      resolveJudgeProfile(true, 'normal')
    );
    // Three tier bands + centre line + ±1σ span + mean marker.
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThanOrEqual(6);
    // The ms scale is labelled from the run's own window, not a constant.
    const labels = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(labels).toContain('+200ms');
    expect(labels).toContain('−200ms');
  });

  it('does NOT paint the chart while the disclosure is collapsed', () => {
    // A canvas inside a `hidden` container measures 0 wide, so painting there
    // both reallocates the backing store and lays out against a wrong fallback
    // width — then the toggle repaints it correctly anyway.
    const ctx = makeStubCtx() as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const setupHiDPICanvas = vi.fn(() => ctx as unknown as CanvasRenderingContext2D);
    const deps = makeDeps({ setupHiDPICanvas });
    deps.practice._lastResult = judgeResult(tally({ great: 6, dtSumMs: 240 }));
    createResultCard(deps).renderResultCard();
    expect(setupHiDPICanvas).not.toHaveBeenCalled();
    (deps.dom.resDetailsToggle as HTMLElement).click();
    expect(setupHiDPICanvas).toHaveBeenCalled();
  });

  it('paints the headline from the snapshot so a langchange re-render keeps it', () => {
    const deps = makeDeps();
    deps.practice._lastResult = judgeResult(tally({ perfect: 9 }), {
      accPct: 92,
      bestCombo: 24,
    });
    const card = createResultCard(deps);
    card.renderResultCard();
    expect(deps.dom.resAcc.textContent).toBe('92%');
    expect(deps.dom.resCombo.textContent).toBe('24');
    // Re-render (what the langchange listener does) must not blank them.
    card.renderResultCard();
    expect(deps.dom.resAcc.textContent).toBe('92%');
  });

  it('awards FULL COMBO with no miss, ALL PERFECT when every note was perfect', () => {
    const fc = render(tally({ perfect: 6, great: 3, good: 1, miss: 0 }));
    expect((fc.dom.resBadges as HTMLElement).textContent).toContain('FULL COMBO');
    expect((fc.dom.resBadges as HTMLElement).textContent).not.toContain('ALL PERFECT');

    const ap = render(tally({ perfect: 10 }));
    expect((ap.dom.resBadges as HTMLElement).textContent).toContain('ALL PERFECT');

    const broken = render(tally({ perfect: 6, miss: 1 }));
    expect((broken.dom.resBadges as HTMLElement).textContent).toBe('');
  });

  it("awards NEW RECORD only against the kid's OWN previous best", () => {
    const up = render(tally({ perfect: 5 }), { accPct: 80, priorBestPct: 60 });
    expect((up.dom.resBadges as HTMLElement).textContent).toContain('resNewRecord');

    const same = render(tally({ perfect: 5 }), { accPct: 60, priorBestPct: 60 });
    expect((same.dom.resBadges as HTMLElement).textContent).not.toContain('resNewRecord');
  });

  it('keeps the analysis collapsed until asked, and reports it via aria', () => {
    const deps = render(tally({ perfect: 5, great: 2 }));
    const toggle = deps.dom.resDetailsToggle as HTMLElement;
    const body = deps.dom.resDetails as HTMLElement;
    expect((body as HTMLElement & { hidden: boolean }).hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('resDetailsShow');

    toggle.click();
    expect((body as HTMLElement & { hidden: boolean }).hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('resDetailsHide');
  });

  it('offers no disclosure at all for listen / guided (nothing to analyse)', () => {
    for (const mode of ['listen', 'guided'] as const) {
      const deps = render(tally({ perfect: 9 }), { mode });
      expect((deps.dom.resDetailsToggle as HTMLElement).style.display).toBe('none');
      expect((deps.dom.resDetails as HTMLElement & { hidden: boolean }).hidden).toBe(true);
      expect((deps.dom.resBadges as HTMLElement).textContent).toBe('');
    }
  });

  it('hides the block when nothing was judged', () => {
    const deps = render(tally());
    expect((deps.dom.resJudge as HTMLElement).style.display).toBe('none');
  });

  it('hides the block for listen and guided (their timing is never graded)', () => {
    for (const mode of ['listen', 'guided'] as const) {
      const deps = render(tally({ perfect: 9 }), { mode });
      expect((deps.dom.resJudge as HTMLElement).style.display).toBe('none');
    }
  });

  it('hides the block when there is no tally to report', () => {
    expect((render(null).dom.resJudge as HTMLElement).style.display).toBe('none');
    // A tally with nothing judged in it is also nothing to report.
    expect((render(tally()).dom.resJudge as HTMLElement).style.display).toBe('none');
  });

  it('completePracticeSection snapshots a COPY, so the next section cannot blank it', () => {
    const deps = makeDeps();
    const live = tally({ perfect: 6, great: 2, miss: 1 });
    deps.practice.judge = live;
    deps.practice.hits = 8;
    createResultCard(deps).completePracticeSection();
    // Next section starts: the live tally is zeroed in place.
    resetJudgeTally(live);
    createResultCard(deps).renderResultCard(); // e.g. a langchange re-render
    expect((deps.dom.resJudgeRows as HTMLElement).textContent).toContain('PERFECT6');
    expect(deps.practice._lastResult?.judge).not.toBe(live);
  });
});

// ─── renderResultCard ────────────────────────────────────────────────

describe('createResultCard — renderResultCard', () => {
  it('no-ops when practice._lastResult is null', () => {
    const deps = makeDeps();
    const rc = createResultCard(deps);
    rc.renderResultCard();
    expect(deps.dom.resTitle.textContent).toBe('');
  });

  it('a listen run shows NO score — not even a 0 %', () => {
    // Listening is not a performance. The card used to hide the blocks it knew
    // about by name (stars, stat rows, history) and the headline was added
    // later, so a listen-through ended on "Pitch accuracy 0 %" — wrong, and the
    // exact kind of scold this app is built to avoid. Hiding is now by marker,
    // so a block added tomorrow is covered without touching this branch.
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'listen',
      secId: 'b',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
      accPct: 0,
    } as never;
    createResultCard(deps).renderResultCard();
    for (const el of document.querySelectorAll('#sectionResult .result-scored-only')) {
      expect((el as HTMLElement).style.display, (el as HTMLElement).id || 'headline').toBe('none');
    }
    // …and it still says what DID happen, with a way forward.
    expect(deps.dom.resTitle.textContent).toBe('listenedTitle');
  });

  it('a listen run reports the practice time it credited, not a score', () => {
    // Listening banks minutes like any other mode; that was stored and shown
    // nowhere, so the card had no true fact to report. Now it has exactly one.
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'listen',
      secId: 'b',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
      minutes: 1.5,
    } as never;
    createResultCard(deps).renderResultCard();
    const facts = deps.dom.resNoScoreFacts!;
    expect(facts.style.display).toBe('');
    expect(facts.textContent).toContain('listenTimeFmt');
    expect(facts.textContent).toContain('durMinSecFmt');
    // 1.5 min → 1m 30s. The stub `t()` nests its vars, hence the escaping.
    expect(facts.textContent).toContain('m\\":1');
    expect(facts.textContent).toContain('s\\":30');
  });

  it('says nothing rather than "0s" when the run was a blink', () => {
    const deps = makeDeps();
    deps.practice._lastResult = {
      mode: 'guided',
      secId: 'b',
      stars: 0,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
      minutes: 0.02,
    } as never;
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resNoScoreFacts!.style.display).toBe('none');
  });

  it('hides the no-score fact line on a scored run', () => {
    const deps = makeDeps();
    deps.dom.resNoScoreFacts!.style.display = '';
    deps.practice._lastResult = {
      mode: 'rhythm',
      secId: 'b',
      stars: 2,
      unlockedTempo: null,
      unlockedSecKey: null,
      streakDays: null,
      accPct: 80,
    } as never;
    createResultCard(deps).renderResultCard();
    expect(deps.dom.resNoScoreFacts!.style.display).toBe('none');
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

// ─── scored full-song run（1曲チャレンジ）──────────────────────────────

describe('createResultCard — full-song challenge completion', () => {
  function challengeDeps(over: Partial<ResultCardDeps> = {}) {
    const deps = makeDeps(over);
    deps.practice.mode = 'rhythm';
    deps.practice.fullSongMode = true;
    return deps;
  }

  it('persists stars/bestPct/history under __full, not the section id', () => {
    const prog = makeProg();
    const deps = challengeDeps({ songProg: () => prog, computeStars: vi.fn(() => 2) });
    deps.practice.hits = 8;
    deps.practice._sectionTargetCount = 10;
    createResultCard(deps).completePracticeSection();
    expect(prog.sections.__full?.stars).toBe(2);
    expect(prog.sections.__full?.bestPct).toBe(80);
    expect(Array.isArray(prog.history.__full)).toBe(true);
    expect(prog.history.__full.length).toBe(1);
    // The real section (a1 = sections[sectionIdx]) is untouched.
    expect(prog.sections.a1).toEqual({ stars: 1, bestPct: 50 });
  });

  it('passes __full to computeUnlocks (tempo ladder works, no section unlock)', () => {
    const deps = challengeDeps({
      computeUnlocks: vi.fn(() => ({ unlockedTempo: 90, unlockedSecKey: null, streakDays: null })),
    });
    createResultCard(deps).completePracticeSection();
    expect(deps.computeUnlocks).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: '__full' })
    );
  });

  it('★1+ shows the Song Clear title + song title subtitle and hides Next', () => {
    const deps = challengeDeps({ computeStars: vi.fn(() => 1) });
    createResultCard(deps).completePracticeSection();
    expect(deps.dom.resTitle.textContent).toBe('songClearTitle');
    expect(deps.dom.resMsg.textContent).toBe('songClearMsg');
    expect(deps.dom.resSectionName.textContent).toContain('furElise');
    expect((deps.dom.resNext as HTMLElement).style.display).toBe('none');
  });

  it('0★ keeps the gentle tier copy (no Song Clear, no shame)', () => {
    const deps = challengeDeps({
      computeStars: vi.fn(() => 0),
      resolveResultTier: vi.fn(() => ({ titleKey: 'tier0Title', msgKey: 'tier0Msg' })),
    });
    createResultCard(deps).completePracticeSection();
    expect(deps.dom.resTitle.textContent).toBe('tier0Title');
  });

  it('★1 clear fires the full celebration (golden + flower + 10 stars)', () => {
    const deps = challengeDeps({ computeStars: vi.fn(() => 1) });
    createResultCard(deps).completePracticeSection();
    expect(deps.effectGoldenBurst).toHaveBeenCalled();
    expect(deps.effectFlowerBurst).toHaveBeenCalled();
    expect(deps.effectStarShower).toHaveBeenCalledWith(10);
  });

  it('reports the attempt to onSectionAttemptDone with sectionId __full', () => {
    const onDone = vi.fn(() => [] as string[]);
    const deps = challengeDeps({ onSectionAttemptDone: onDone });
    createResultCard(deps).completePracticeSection();
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ sectionId: '__full' }));
  });

  it('snapshot carries fullSong:true + secId __full for langchange re-render', () => {
    const deps = challengeDeps();
    createResultCard(deps).completePracticeSection();
    expect(deps.practice._lastResult?.fullSong).toBe(true);
    expect(deps.practice._lastResult?.secId).toBe('__full');
    // fullSongMode is NOT cleared — Retry re-runs the challenge.
    expect(deps.practice.fullSongMode).toBe(true);
  });

  it('guided full-song run stamps fullSong + hides Next', () => {
    const deps = makeDeps();
    deps.practice.mode = 'guided';
    deps.practice.fullSongMode = true;
    createResultCard(deps).completePracticeSection();
    expect(deps.practice._lastResult?.fullSong).toBe(true);
    expect(deps.practice._lastResult?.secId).toBe('__full');
    expect((deps.dom.resNext as HTMLElement).style.display).toBe('none');
  });

  it('plays the song-clear fanfare on a ★1+ full-song clear', () => {
    const playSongClear = vi.fn();
    const deps = challengeDeps({ computeStars: vi.fn(() => 1), playSongClear });
    createResultCard(deps).completePracticeSection();
    expect(playSongClear).toHaveBeenCalled();
  });

  it('does NOT play the fanfare on a 0★ full-song run', () => {
    const playSongClear = vi.fn();
    const deps = challengeDeps({ computeStars: vi.fn(() => 0), playSongClear });
    createResultCard(deps).completePracticeSection();
    expect(playSongClear).not.toHaveBeenCalled();
  });

  it('does NOT play the fanfare on a normal (non-full-song) section clear', () => {
    const playSongClear = vi.fn();
    const deps = makeDeps({ computeStars: vi.fn(() => 3), playSongClear });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect(playSongClear).not.toHaveBeenCalled();
  });
});

// ─── endgame stretch → add-song routing ──────────────────────────────

describe('createResultCard — stretch button (add-song at endgame)', () => {
  it('shows a real stretch song with the stretch label', () => {
    const deps = makeDeps({ getStretchSongId: () => 'alla_turca', computeStars: vi.fn(() => 2) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    const btn = deps.dom.resStretch as HTMLElement;
    expect(btn.style.display).toBe('');
    expect(btn.dataset.songId).toBe('alla_turca');
    expect(btn.getAttribute('data-i18n')).toBe('stretchBtn');
  });

  it('routes to "add more songs" (sentinel) with the add-song label at endgame', () => {
    const deps = makeDeps({ getStretchSongId: () => '__addsong', computeStars: vi.fn(() => 2) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    const btn = deps.dom.resStretch as HTMLElement;
    expect(btn.style.display).toBe('');
    expect(btn.dataset.songId).toBe('__addsong');
    expect(btn.getAttribute('data-i18n')).toBe('stretchAddSong');
    expect(btn.textContent).toBe('stretchAddSong');
  });

  it('hides the button when there is nothing to stretch to', () => {
    const deps = makeDeps({ getStretchSongId: () => null, computeStars: vi.fn(() => 2) });
    deps.practice.mode = 'rhythm';
    createResultCard(deps).completePracticeSection();
    expect((deps.dom.resStretch as HTMLElement).style.display).toBe('none');
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

  function chartDeps() {
    const ctx = makeStubCtx();
    const tFn = vi.fn((k: string, vars?: Record<string, unknown>) =>
      vars ? `${k}${JSON.stringify(vars)}` : k
    );
    return {
      ctx,
      tFn,
      deps: {
        setupHiDPICanvas: vi.fn(() => ctx),
        clamp01: (v: number) => Math.max(0, Math.min(1, v)),
        t: tFn,
      },
    };
  }

  it('captions a new personal best as "best yet" (never a down-arrow)', () => {
    const { deps, tFn } = chartDeps();
    drawHistoryChart(deps, document.createElement('canvas'), [
      { d: 0, a: 50, t: 50, s: 1 },
      { d: 1, a: 72, t: 60, s: 2 }, // 72 > prior best (50) → best yet
    ]);
    expect(tFn).toHaveBeenCalledWith('trendBestYet');
    // No loss-frame string is ever emitted.
    const drawn = (tFn.mock.calls as Array<[string]>).map((c) => c[0]);
    expect(drawn).not.toContain('trendSimilar');
  });

  it('captions "+X% vs first" when up from the start but not a new best', () => {
    const { deps, tFn } = chartDeps();
    drawHistoryChart(deps, document.createElement('canvas'), [
      { d: 0, a: 60, t: 50, s: 1 },
      { d: 1, a: 90, t: 80, s: 3 }, // best is 90
      { d: 2, a: 80, t: 70, s: 2 }, // 80 < best(90) but > first(60) → +20
    ]);
    expect(tFn).toHaveBeenCalledWith('trendUpFmt', { v: 20 });
  });

  it('captions "keep going" when not up vs first (no shame copy)', () => {
    const { deps, tFn } = chartDeps();
    drawHistoryChart(deps, document.createElement('canvas'), [
      { d: 0, a: 70, t: 70, s: 2 },
      { d: 1, a: 60, t: 55, s: 1 }, // below first, not a best
    ]);
    expect(tFn).toHaveBeenCalledWith('trendKeepGoing');
  });

  it('draws both line legends (accuracy + timing)', () => {
    const { deps, tFn } = chartDeps();
    drawHistoryChart(deps, document.createElement('canvas'), [
      { d: 0, a: 50, t: 50, s: 1 },
      { d: 1, a: 75, t: 70, s: 2 },
    ]);
    expect(tFn).toHaveBeenCalledWith('legendAccuracy');
    expect(tFn).toHaveBeenCalledWith('legendTiming');
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

// ─── retry-with-support (P2-18) ──────────────────────────────────────

describe('createResultCard — retry-with-support button', () => {
  const scaffold = (strategy: 'listen' | 'oneHand' | 'slowTempo', depth = 1) =>
    vi.fn(() => ({ show: depth >= 2, depth, strategy }));

  function completeWithStars(
    stars: number,
    over: Partial<ResultCardDeps> = {}
  ): ReturnType<typeof makeDeps> {
    const deps = makeDeps({
      computeStars: vi.fn(() => stars),
      resolveResultTier: vi.fn(() => ({ titleKey: 'tier0Title', msgKey: 'tier0Msg' })),
      planSectionScaffold: scaffold('listen'),
      tempoTiers: [50, 60, 75, 90, 100],
      ...over,
    });
    const card = createResultCard(deps);
    card.completePracticeSection();
    return deps;
  }

  it('0★ → button visible with the listen strategy (shallow struggle)', () => {
    const deps = completeWithStars(0);
    const btn = deps.dom.resRetrySlow as HTMLElement;
    expect(btn.style.display).not.toBe('none');
    expect(btn.dataset.strategy).toBe('listen');
    expect(deps.practice._lastResult?.retryStrategy).toBe('listen');
  });

  it('slowTempo strategy resolves the slowest unlocked tempo below current', () => {
    const deps = completeWithStars(0, { planSectionScaffold: scaffold('slowTempo', 3) });
    const btn = deps.dom.resRetrySlow as HTMLElement;
    // makeProg unlocks 60/75; current tempo 75 → retry at 60.
    expect(btn.dataset.strategy).toBe('slowTempo');
    expect(btn.dataset.tempo).toBe('60');
    expect(deps.practice._lastResult?.retryTempo).toBe(60);
  });

  it('slowTempo at the slowest unlocked tempo falls back to one-hand', () => {
    const deps = makeDeps({
      computeStars: vi.fn(() => 0),
      resolveResultTier: vi.fn(() => ({ titleKey: 'tier0Title', msgKey: 'tier0Msg' })),
      planSectionScaffold: scaffold('slowTempo', 3),
      tempoTiers: [50, 60, 75, 90, 100],
    });
    deps.practice.tempoPct = 60; // == slowest unlocked in makeProg
    createResultCard(deps).completePracticeSection();
    expect((deps.dom.resRetrySlow as HTMLElement).dataset.strategy).toBe('oneHand');
  });

  it('oneHand while already one-handed falls back to listen', () => {
    const deps = makeDeps({
      computeStars: vi.fn(() => 0),
      resolveResultTier: vi.fn(() => ({ titleKey: 'tier0Title', msgKey: 'tier0Msg' })),
      planSectionScaffold: scaffold('oneHand', 3),
      tempoTiers: [50, 60, 75, 90, 100],
    });
    deps.practice.handFilter = 'R';
    createResultCard(deps).completePracticeSection();
    expect((deps.dom.resRetrySlow as HTMLElement).dataset.strategy).toBe('listen');
  });

  it('1★+ → button hidden, no strategy in snapshot', () => {
    const deps = completeWithStars(1);
    expect((deps.dom.resRetrySlow as HTMLElement).style.display).toBe('none');
    expect(deps.practice._lastResult?.retryStrategy ?? null).toBeNull();
  });

  it('langchange re-render keeps the button painted from the snapshot', () => {
    const deps = completeWithStars(0);
    const card = createResultCard(deps);
    // Simulate langchange: re-render from the retained snapshot.
    (deps.dom.resRetrySlow as HTMLElement).style.display = 'none';
    card.renderResultCard();
    expect((deps.dom.resRetrySlow as HTMLElement).style.display).not.toBe('none');
    expect((deps.dom.resRetrySlow as HTMLElement).dataset.strategy).toBe('listen');
  });
});

// ─── practice-minute hook (P2-19) ────────────────────────────────────

describe('createResultCard — recordPracticeMinutes hook', () => {
  it('fires once per completion in every mode', () => {
    for (const mode of ['rhythm', 'guided', 'listen'] as const) {
      const recordPracticeMinutes = vi.fn();
      const deps = makeDeps({ recordPracticeMinutes });
      deps.practice.mode = mode;
      createResultCard(deps).completePracticeSection();
      expect(recordPracticeMinutes).toHaveBeenCalledOnce();
    }
  });

  it('does not fire when the song/section guard bails', () => {
    const recordPracticeMinutes = vi.fn();
    const deps = makeDeps({ recordPracticeMinutes, getCurrentSong: () => null });
    createResultCard(deps).completePracticeSection();
    expect(recordPracticeMinutes).not.toHaveBeenCalled();
  });
});
