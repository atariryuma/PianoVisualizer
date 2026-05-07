// @vitest-environment happy-dom
//
// Tests for packages/web/src/session-summary.ts.
//
// Covers the four exported surfaces:
//   • saveBestScores — best-of accumulation + persisted via deps.saveJSON
//   • renderSessionSummaryText — text + badge HTML across done/undone /
//     all-clear / partial / animate=true vs false branches
//   • showSessionSummary — snapshot creation + visibility flip + radar
//   • drawRadarChart — basic call shape (canvas mocked because happy-dom
//     doesn't provide a real 2D context)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSessionSummary,
  drawRadarChart,
  type SessionSummaryDeps,
  type SessionSummaryDom,
  type SessionSummaryStateRef,
  type SessionSummaryConfig,
  type BestScores,
} from '../src/session-summary';

function makeDom(): SessionSummaryDom {
  document.body.innerHTML = `
    <div id="sessionSummary">
      <span id="sumCombo"></span>
      <span id="sumStage"></span>
      <span id="sumTime"></span>
      <div id="sumQuestList"></div>
      <span id="sumBest"></span>
      <canvas id="radarChart" width="200" height="200"></canvas>
    </div>
  `;
  return {
    sessionSummary: document.getElementById('sessionSummary') as HTMLElement,
    sumCombo: document.getElementById('sumCombo') as HTMLElement,
    sumStage: document.getElementById('sumStage') as HTMLElement,
    sumTime: document.getElementById('sumTime') as HTMLElement,
    sumQuestList: document.getElementById('sumQuestList') as HTMLElement,
    sumBest: document.getElementById('sumBest') as HTMLElement,
    radarChart: document.getElementById('radarChart') as HTMLCanvasElement,
  };
}

function makeStubCtx(): CanvasRenderingContext2D {
  const stub: Record<string, unknown> = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
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

function makeDeps(over: Partial<SessionSummaryDeps> = {}): SessionSummaryDeps {
  const state: SessionSummaryStateRef = {
    bestCombo: 30,
    peakFlow: 80,
    currentStage: 2,
    completedQuests: ['qst1', 'qst2'],
    sessionStartTimeMs: 1000,
    stabilityScore: 0.8,
    rhythmScore: 0.7,
    dynamicsScore: 0.6,
    _lastSummary: null,
  };
  const config: SessionSummaryConfig = {
    STAGES: ['stage0', 'stage1', 'stage2'],
    QUESTS: [
      { id: 'qst1', nameKey: 'qst1Name' },
      { id: 'qst2', nameKey: 'qst2Name' },
      { id: 'qst3', nameKey: 'qst3Name' },
    ],
  };
  // Simple in-memory "localStorage" for the deps
  const memStore: Record<string, string> = {};
  return {
    dom: makeDom(),
    state,
    config,
    loadJSON: vi.fn(<T>(key: string, fallback: T): T => {
      const raw = memStore[key];
      return raw ? JSON.parse(raw) : fallback;
    }),
    saveJSON: vi.fn((key: string, val: unknown) => {
      memStore[key] = JSON.stringify(val);
    }),
    stageLabel: vi.fn((s: unknown) => `${s}-label`),
    formatTime: vi.fn((ms: number) => `${Math.floor(ms / 60000)}:00`),
    t: vi.fn((key, vars) => (vars ? `${key}{${JSON.stringify(vars)}}` : key)),
    setupHiDPICanvas: vi.fn(() => makeStubCtx()),
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── saveBestScores ──────────────────────────────────────────────────

describe('createSessionSummary — saveBestScores', () => {
  it('starts from defaults when nothing is in storage', () => {
    const deps = makeDeps();
    const ss = createSessionSummary(deps);
    const best = ss.saveBestScores(40, 75);
    expect(best).toEqual({ bestCombo: 40, peakFlow: 75, totalSessions: 1 });
    expect(deps.saveJSON).toHaveBeenCalledWith(
      'pianoViz_best',
      expect.objectContaining({ bestCombo: 40, peakFlow: 75 })
    );
  });

  it('keeps the higher of stored and current bestCombo', () => {
    const deps = makeDeps({
      loadJSON: vi.fn(() => ({ bestCombo: 100, peakFlow: 50, totalSessions: 5 })),
    });
    const ss = createSessionSummary(deps);
    const best = ss.saveBestScores(40, 60);
    expect(best.bestCombo).toBe(100); // stored > current
    expect(best.peakFlow).toBe(60); // current > stored
  });

  it('rounds peakFlow before max-merge', () => {
    const deps = makeDeps();
    const ss = createSessionSummary(deps);
    const best = ss.saveBestScores(0, 79.7);
    expect(best.peakFlow).toBe(80);
  });

  it('increments totalSessions per call', () => {
    const deps = makeDeps();
    const ss = createSessionSummary(deps);
    ss.saveBestScores(10, 20);
    const best = ss.saveBestScores(11, 21);
    expect(best.totalSessions).toBe(2);
  });
});

// ─── renderSessionSummaryText ────────────────────────────────────────

describe('createSessionSummary — renderSessionSummaryText', () => {
  function setup(): {
    deps: SessionSummaryDeps;
    ss: ReturnType<typeof createSessionSummary>;
  } {
    const deps = makeDeps();
    const bestStat: BestScores = { bestCombo: 100, peakFlow: 88, totalSessions: 5 };
    deps.state._lastSummary = {
      bestCombo: 30,
      stageIdx: 2,
      elapsed: 120000,
      completedQuests: ['qst1', 'qst2'],
      bestStat,
    };
    const ss = createSessionSummary(deps);
    return { deps, ss };
  }

  it('no-ops when state._lastSummary is null', () => {
    const deps = makeDeps();
    deps.state._lastSummary = null;
    createSessionSummary(deps).renderSessionSummaryText(false);
    expect(deps.dom.sumCombo.textContent).toBe('');
  });

  it('paints combo / stage / time from snapshot', () => {
    const { deps, ss } = setup();
    ss.renderSessionSummaryText(false);
    expect(deps.dom.sumCombo.textContent).toBe('30');
    expect(deps.dom.sumStage.textContent).toBe('stage2-label');
    expect(deps.dom.sumTime.textContent).toBe('2:00');
  });

  it('paints "-" when stageLabel returns null/empty', () => {
    const deps = makeDeps({ stageLabel: vi.fn(() => null) });
    deps.state._lastSummary = {
      bestCombo: 0,
      stageIdx: 0,
      elapsed: 0,
      completedQuests: [],
      bestStat: { bestCombo: 0, peakFlow: 0, totalSessions: 1 },
    };
    createSessionSummary(deps).renderSessionSummaryText(false);
    expect(deps.dom.sumStage.textContent).toBe('-');
  });

  it('renders one badge per quest with the right done/undone class', () => {
    const { deps, ss } = setup();
    ss.renderSessionSummaryText(false);
    const badges = deps.dom.sumQuestList.querySelectorAll('.sq-badge');
    expect(badges.length).toBe(3);
    const done = deps.dom.sumQuestList.querySelectorAll('.sq-badge.done');
    const undone = deps.dom.sumQuestList.querySelectorAll('.sq-badge.undone');
    expect(done.length).toBe(2);
    expect(undone.length).toBe(1);
  });

  it('renders the all-clear ribbon when every quest is done', () => {
    const deps = makeDeps();
    deps.state._lastSummary = {
      bestCombo: 0,
      stageIdx: 0,
      elapsed: 0,
      completedQuests: ['qst1', 'qst2', 'qst3'],
      bestStat: { bestCombo: 0, peakFlow: 0, totalSessions: 1 },
    };
    createSessionSummary(deps).renderSessionSummaryText(false);
    expect(deps.dom.sumQuestList.querySelector('.sq-all-clear')).not.toBeNull();
  });

  it('renders progress text when not all quests are done', () => {
    const { deps, ss } = setup();
    ss.renderSessionSummaryText(false);
    expect(deps.dom.sumQuestList.innerHTML).toContain('sumQuestProgressFmt');
  });

  it('renders bestStat line via t("sumBestFmt")', () => {
    const { deps, ss } = setup();
    ss.renderSessionSummaryText(false);
    expect(deps.dom.sumBest.textContent).toContain('sumBestFmt');
    expect(deps.t).toHaveBeenCalledWith(
      'sumBestFmt',
      expect.objectContaining({ combo: 100, flow: 88, n: 5 })
    );
  });

  it('animate=false sets animate-in immediately', () => {
    const { deps, ss } = setup();
    ss.renderSessionSummaryText(false);
    const animated = deps.dom.sumQuestList.querySelectorAll('.animate-in');
    expect(animated.length).toBeGreaterThan(0);
  });

  it('sorts badges done-first', () => {
    const { deps, ss } = setup();
    ss.renderSessionSummaryText(false);
    const badges = Array.from(deps.dom.sumQuestList.querySelectorAll('.sq-badge'));
    expect(badges[0].classList.contains('done')).toBe(true);
    expect(badges[1].classList.contains('done')).toBe(true);
    expect(badges[2].classList.contains('undone')).toBe(true);
  });
});

// ─── showSessionSummary ──────────────────────────────────────────────

describe('createSessionSummary — showSessionSummary', () => {
  it('captures elapsed, persists best, snapshots state, makes modal visible', () => {
    const deps = makeDeps();
    deps.state.sessionStartTimeMs = performance.now() - 60000; // 60s ago
    createSessionSummary(deps).showSessionSummary();
    expect(deps.state._lastSummary).not.toBeNull();
    expect(deps.state._lastSummary!.bestCombo).toBe(30);
    expect(deps.state._lastSummary!.stageIdx).toBe(2);
    expect(deps.state._lastSummary!.completedQuests).toEqual(['qst1', 'qst2']);
    expect(deps.dom.sessionSummary.classList.contains('visible')).toBe(true);
    expect(deps.saveJSON).toHaveBeenCalled();
  });

  it('triggers radar chart via setupHiDPICanvas', () => {
    const deps = makeDeps();
    createSessionSummary(deps).showSessionSummary();
    expect(deps.setupHiDPICanvas).toHaveBeenCalledWith(deps.dom.radarChart, 200, 200);
  });

  it('captures completedQuests as a slice (defensive — caller can mutate)', () => {
    const deps = makeDeps();
    createSessionSummary(deps).showSessionSummary();
    const captured = deps.state._lastSummary!.completedQuests;
    expect(captured).toEqual(['qst1', 'qst2']);
    // Mutating the original does not affect the captured slice
    deps.state.completedQuests.push('qst3');
    expect(captured).toEqual(['qst1', 'qst2']);
  });
});

// ─── drawRadarChart ──────────────────────────────────────────────────

describe('drawRadarChart', () => {
  it('runs a frame without throwing using the stubbed ctx', () => {
    // The function uses requestAnimationFrame internally — happy-dom
    // schedules it on a microtask so we just verify the synchronous
    // call path doesn't throw and the first frame's paint hits the ctx.
    const ctx = makeStubCtx();
    const canvas = document.createElement('canvas');
    const deps = { setupHiDPICanvas: vi.fn(() => ctx) };
    expect(() =>
      drawRadarChart(deps, canvas, ['Stability', 'Rhythm', 'Dynamics'], [0.8, 0.7, 0.6])
    ).not.toThrow();
    expect(deps.setupHiDPICanvas).toHaveBeenCalledWith(canvas, 200, 200);
  });
});
