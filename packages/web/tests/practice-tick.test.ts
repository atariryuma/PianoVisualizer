// Tests for packages/web/src/practice-tick.ts.
//
// The hot-path practice tick has 6 ordered concerns; we cover each:
//   • Diagnostic log (rate-limited)
//   • Auto-mark missed notes (rhythm) / auto-advance (listen)
//   • Mic-onset matching gated by midiInput.enabled
//   • Skip-past-resolved cursor advance
//   • Progress HUD rate-limit
//   • Section-complete detection + 600ms grace timer + race guard
//
// No DOM env needed — we only read deps.dom.ptbProgress.textContent
// and stub it as a plain object.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPracticeTick,
  type PracticeTickDeps,
  type PracticeTickPracticeRef,
  type PracticeTickNote,
} from '../src/practice-tick';

function makeNote(over: Partial<PracticeTickNote> = {}): PracticeTickNote {
  return {
    midi: 60,
    timeMs: 1000,
    durMs: 500,
    measureIdx: 0,
    inBarQuarters: 0,
    ...over,
  };
}

function makeDeps(over: Partial<PracticeTickDeps> = {}): PracticeTickDeps {
  const practice: PracticeTickPracticeRef = {
    enabled: true,
    mode: 'rhythm',
    sectionNotes: [],
    currentNoteIdx: 0,
    hits: 0,
    misses: 0,
    sectionCombo: 0,
    _completing: false,
    _completionTimer: null,
    _lastProgUpdate: 0,
  };
  return {
    dom: { ptbProgress: { textContent: '' } as unknown as HTMLElement },
    practice,
    midiInput: { enabled: false },
    getOsmd: () => null,
    practiceElapsedMs: vi.fn(() => 0),
    hitWindowMs: 200,
    medianRecentPitch: vi.fn(() => null),
    matchNoteOnset: vi.fn(),
    showHitChip: vi.fn(),
    t: vi.fn((k) => k),
    completePracticeSection: vi.fn(),
    remoteLogEnabled: false,
    remoteLog: vi.fn(),
    noteStateLabel: vi.fn(() => ''),
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── enabled gate ────────────────────────────────────────────────────

describe('createPracticeTick — enabled gate', () => {
  it('does nothing when practice.enabled is false', () => {
    const deps = makeDeps();
    deps.practice.enabled = false;
    deps.practice.sectionNotes = [makeNote({ timeMs: 0 })];
    const tick = createPracticeTick(deps);
    tick(0, false, null);
    expect(deps.matchNoteOnset).not.toHaveBeenCalled();
    expect(deps.completePracticeSection).not.toHaveBeenCalled();
  });

  it('does nothing while paused — no auto-miss behind a modal (P1-6)', () => {
    // The AudioContext clock keeps ticking while the settings panel is
    // open; if the tick ran, elapsed would be way past every note and the
    // whole rhythm section would auto-miss. The paused gate prevents that.
    const note = makeNote({ timeMs: 100 });
    const deps = makeDeps({
      practiceElapsedMs: () => 999999, // clock ran far ahead during pause
      practice: {
        enabled: true,
        paused: true,
        mode: 'rhythm',
        sectionNotes: [note],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      } as unknown as PracticeTickDeps['practice'],
    });
    const tick = createPracticeTick(deps);
    tick(0, false, null);
    expect(note.missed).toBeUndefined();
    expect(deps.practice.misses).toBe(0);
    expect(deps.completePracticeSection).not.toHaveBeenCalled();
  });
});

// ─── auto-mark (rhythm mode) ─────────────────────────────────────────

describe('createPracticeTick — rhythm auto-miss', () => {
  it('marks a note missed when elapsed is past timeMs + hitWindow', () => {
    const note = makeNote({ timeMs: 100 });
    const deps = makeDeps({
      practiceElapsedMs: () => 400, // 400 > 100 + 200
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [note],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 5,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    const tick = createPracticeTick(deps);
    tick(500, false, null);
    expect(note.missed).toBe(true);
    expect(deps.practice.misses).toBe(1);
    expect(deps.practice.sectionCombo).toBe(0);
    expect(deps.showHitChip).toHaveBeenCalledWith('miss', 'missChip');
  });

  it('does NOT mark a note missed when elapsed is within window', () => {
    const note = makeNote({ timeMs: 100 });
    const deps = makeDeps({
      practiceElapsedMs: () => 200,
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [note],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    createPracticeTick(deps)(0, false, null);
    expect(note.missed).toBeFalsy();
  });

  it('breaks the loop once we hit a future-windowed note', () => {
    const n1 = makeNote({ timeMs: 0 });
    const n2 = makeNote({ timeMs: 9999 }); // far in future
    const deps = makeDeps({
      practiceElapsedMs: () => 500,
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [n1, n2],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    createPracticeTick(deps)(0, false, null);
    expect(n1.missed).toBe(true);
    expect(n2.missed).toBeFalsy();
  });
});

// ─── auto-advance (listen mode) ──────────────────────────────────────

describe('createPracticeTick — listen auto-advance', () => {
  it('marks notes hit (not missed) once elapsed reaches their timeMs', () => {
    const n1 = makeNote({ timeMs: 100 });
    const n2 = makeNote({ timeMs: 300 });
    const deps = makeDeps({
      practiceElapsedMs: () => 200,
      practice: {
        enabled: true,
        mode: 'listen',
        sectionNotes: [n1, n2],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    createPracticeTick(deps)(0, false, null);
    expect(n1.hit).toBe(true);
    expect(n1.missed).toBeFalsy();
    expect(n2.hit).toBeFalsy();
  });

  it('does NOT call showHitChip in listen mode', () => {
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'listen',
        sectionNotes: [makeNote({ timeMs: 0 })],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
      practiceElapsedMs: () => 100,
    });
    createPracticeTick(deps)(0, false, null);
    expect(deps.showHitChip).not.toHaveBeenCalled();
  });
});

// ─── mic-onset gate ──────────────────────────────────────────────────

describe('createPracticeTick — mic onset matching', () => {
  it('matches the mic onset when MIDI is disabled', () => {
    const deps = makeDeps({
      midiInput: { enabled: false },
      medianRecentPitch: () => 440, // A4 → MIDI 69
    });
    createPracticeTick(deps)(0, true, 442);
    expect(deps.matchNoteOnset).toHaveBeenCalledWith(69, false);
  });

  it('skips matching when MIDI is enabled (mic suppressed for scoring)', () => {
    const deps = makeDeps({
      midiInput: { enabled: true },
      medianRecentPitch: () => 440,
    });
    createPracticeTick(deps)(0, true, 442);
    expect(deps.matchNoteOnset).not.toHaveBeenCalled();
  });

  it('skips matching when isOnsetNote is false', () => {
    const deps = makeDeps();
    createPracticeTick(deps)(0, false, 440);
    expect(deps.matchNoteOnset).not.toHaveBeenCalled();
  });

  it('skips matching when pitchHz is null', () => {
    const deps = makeDeps();
    createPracticeTick(deps)(0, true, null);
    expect(deps.matchNoteOnset).not.toHaveBeenCalled();
  });

  it('falls back to pitchHz when medianRecentPitch returns null', () => {
    const deps = makeDeps({ medianRecentPitch: () => null });
    createPracticeTick(deps)(0, true, 440);
    expect(deps.matchNoteOnset).toHaveBeenCalledWith(69, false);
  });
});

// ─── cursor skip ─────────────────────────────────────────────────────

describe('createPracticeTick — cursor skip', () => {
  it('advances currentNoteIdx past resolved notes', () => {
    const notes = [makeNote({ hit: true }), makeNote({ missed: true }), makeNote({ timeMs: 9999 })];
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: notes,
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    createPracticeTick(deps)(0, false, null);
    expect(deps.practice.currentNoteIdx).toBe(2);
  });
});

// ─── progress HUD ────────────────────────────────────────────────────

describe('createPracticeTick — progress HUD', () => {
  it('updates ptbProgress text', () => {
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [makeNote(), makeNote()],
        currentNoteIdx: 0,
        hits: 5,
        misses: 2,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
        _sectionTargetCount: 47,
      },
    });
    createPracticeTick(deps)(200, false, null);
    expect(deps.dom.ptbProgress.textContent).toBe('7 / 47');
  });

  it('rate-limits HUD updates (does not update within 100ms)', () => {
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [makeNote(), makeNote()],
        currentNoteIdx: 0,
        hits: 5,
        misses: 2,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 1000,
        _sectionTargetCount: 47,
      },
    });
    deps.dom.ptbProgress.textContent = 'INITIAL';
    createPracticeTick(deps)(1050, false, null);
    expect(deps.dom.ptbProgress.textContent).toBe('INITIAL');
  });
});

// ─── section complete ────────────────────────────────────────────────

describe('createPracticeTick — section completion', () => {
  it('schedules completePracticeSection when all notes resolved', () => {
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [makeNote({ hit: true })],
        currentNoteIdx: 1, // already past
        hits: 1,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    createPracticeTick(deps)(0, false, null);
    expect(deps.practice._completing).toBe(true);
    expect(deps.practice._completionTimer).not.toBeNull();
    vi.advanceTimersByTime(600);
    expect(deps.completePracticeSection).toHaveBeenCalledOnce();
  });

  it('does NOT fire completePracticeSection if practice gets disabled mid-grace', () => {
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [makeNote({ hit: true })],
        currentNoteIdx: 1,
        hits: 1,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    createPracticeTick(deps)(0, false, null);
    expect(deps.practice._completing).toBe(true);
    deps.practice.enabled = false; // user quit during grace
    vi.advanceTimersByTime(600);
    expect(deps.completePracticeSection).not.toHaveBeenCalled();
  });

  it('listen-mode tail-pad: detects completion after the last note + hit window + 400ms', () => {
    const last = makeNote({ timeMs: 0, durMs: 500 });
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'listen',
        sectionNotes: [last],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
      // elapsed > 0 + 500 + 200 + 400 = 1100ms
      practiceElapsedMs: () => 1200,
    });
    createPracticeTick(deps)(0, false, null);
    expect(deps.practice._completing).toBe(true);
  });

  it('guided mode does NOT use the tail-pad path (kid waits indefinitely)', () => {
    const last = makeNote({ timeMs: 0, durMs: 500 });
    const deps = makeDeps({
      practice: {
        enabled: true,
        mode: 'guided',
        sectionNotes: [last],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
      practiceElapsedMs: () => 99999,
    });
    createPracticeTick(deps)(0, false, null);
    expect(deps.practice._completing).toBe(false);
  });
});

// ─── loop practice (P2-12) ───────────────────────────────────────────

describe('createPracticeTick — loop practice (P2-12)', () => {
  function loopDeps(mode: string, loopOn: boolean) {
    return makeDeps({
      practice: {
        enabled: true,
        loopOn,
        mode,
        sectionNotes: [makeNote({ hit: true })],
        currentNoteIdx: 1,
        hits: 1,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      } as unknown as PracticeTickDeps['practice'],
      restartSectionForLoop: vi.fn(),
      practiceElapsedMs: () => 5000,
    });
  }

  it('loopOn + rhythm: restarts the section instead of completing', () => {
    const deps = loopDeps('rhythm', true);
    createPracticeTick(deps)(0, false, null);
    vi.advanceTimersByTime(600);
    expect(deps.restartSectionForLoop).toHaveBeenCalledOnce();
    expect(deps.completePracticeSection).not.toHaveBeenCalled();
    // _completing はリスタート前に倒す — 次セクションの完了検出を塞がない
    expect(deps.practice._completing).toBe(false);
  });

  it('loopOn + listen: completes normally (listen は一回性の視聴)', () => {
    const deps = loopDeps('listen', true);
    createPracticeTick(deps)(0, false, null);
    vi.advanceTimersByTime(600);
    expect(deps.completePracticeSection).toHaveBeenCalledOnce();
    expect(deps.restartSectionForLoop).not.toHaveBeenCalled();
  });

  it('loopOff: completes normally', () => {
    const deps = loopDeps('rhythm', false);
    createPracticeTick(deps)(0, false, null);
    vi.advanceTimersByTime(600);
    expect(deps.completePracticeSection).toHaveBeenCalledOnce();
    expect(deps.restartSectionForLoop).not.toHaveBeenCalled();
  });

  it('restartSectionForLoop 未配線なら completePracticeSection へフォールバック', () => {
    const deps = loopDeps('rhythm', true);
    delete (deps as Record<string, unknown>).restartSectionForLoop;
    createPracticeTick(deps)(0, false, null);
    vi.advanceTimersByTime(600);
    expect(deps.completePracticeSection).toHaveBeenCalledOnce();
  });

  it('quit during grace: loop restart does not fire either', () => {
    const deps = loopDeps('rhythm', true);
    createPracticeTick(deps)(0, false, null);
    deps.practice.enabled = false;
    vi.advanceTimersByTime(600);
    expect(deps.restartSectionForLoop).not.toHaveBeenCalled();
    expect(deps.completePracticeSection).not.toHaveBeenCalled();
  });
});

// ─── guided stuck hint (P2-14) ───────────────────────────────────────

describe('createPracticeTick — guided stuck hint (P2-14)', () => {
  function guidedDeps(over: Partial<PracticeTickDeps> = {}) {
    return makeDeps({
      practice: {
        enabled: true,
        mode: 'guided',
        sectionNotes: [makeNote({ timeMs: 0, midi: 64 })],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
      practiceElapsedMs: () => 1000,
      playGuidedHint: vi.fn(),
      ...over,
    });
  }

  /** 実 rAF 相当の密な tick（100ms 刻み ≤ 400ms なのでギャップ判定に
   *  かからない）。疎な tick はポーズ由来のギャップと区別できないため、
   *  スタック検出のテストは必ずこれで時間を進める。 */
  function runTicks(
    tick: (t: number, o: boolean, p: number | null) => void,
    fromMs: number,
    toMs: number
  ): void {
    for (let t = fromMs; t <= toMs; t += 100) tick(t, false, null);
  }

  it('plays the expected note after 7s stuck on the same note', () => {
    const deps = guidedDeps();
    const tick = createPracticeTick(deps);
    runTicks(tick, 0, 6900);
    expect(deps.playGuidedHint).not.toHaveBeenCalled();
    runTicks(tick, 7000, 7100);
    expect(deps.playGuidedHint).toHaveBeenCalledWith(64);
  });

  it('re-arms: fires again 7s later while still stuck', () => {
    const deps = guidedDeps();
    const tick = createPracticeTick(deps);
    runTicks(tick, 0, 13900);
    expect(deps.playGuidedHint).toHaveBeenCalledTimes(1);
    runTicks(tick, 14000, 14100);
    expect(deps.playGuidedHint).toHaveBeenCalledTimes(2);
  });

  it('resets the timer when the cursor advances', () => {
    const deps = guidedDeps();
    const tick = createPracticeTick(deps);
    deps.practice.sectionNotes = [
      makeNote({ timeMs: 0, midi: 64 }),
      makeNote({ timeMs: 100, midi: 66 }),
    ];
    runTicks(tick, 0, 5000);
    // ノート解決 → idx 前進 → ヒントタイマーはリセットされる
    (deps.practice.sectionNotes[0] as PracticeTickNote).hit = true;
    runTicks(tick, 5100, 12000); // idx=1 では 6.9s — まだ鳴らない
    expect(deps.playGuidedHint).not.toHaveBeenCalled();
    runTicks(tick, 12100, 12200); // idx=1 で 7.1s
    expect(deps.playGuidedHint).toHaveBeenCalledWith(66);
  });

  it('does not count a rAF gap (pause / tab hidden) toward the 7s', () => {
    const deps = guidedDeps();
    const tick = createPracticeTick(deps);
    runTicks(tick, 0, 3000);
    // 60s のギャップ（ポーズ）— hintSince がスライドし即発火しない
    tick(63000, false, null);
    expect(deps.playGuidedHint).not.toHaveBeenCalled();
    runTicks(tick, 63100, 66900); // ギャップ除外で合計 6.9s — まだ
    expect(deps.playGuidedHint).not.toHaveBeenCalled();
    runTicks(tick, 67000, 67100); // 合計 7.0s
    expect(deps.playGuidedHint).toHaveBeenCalledWith(64);
  });

  it('non-guided modes never hint', () => {
    const deps = guidedDeps();
    deps.practice.mode = 'rhythm';
    const tick = createPracticeTick(deps);
    tick(0, false, null);
    tick(8000, false, null);
    expect(deps.playGuidedHint).not.toHaveBeenCalled();
  });

  it('does not hint before the count-in ends (elapsed <= 0)', () => {
    const deps = guidedDeps({ practiceElapsedMs: () => -500 });
    const tick = createPracticeTick(deps);
    tick(0, false, null);
    tick(8000, false, null);
    expect(deps.playGuidedHint).not.toHaveBeenCalled();
  });
});

// ─── diagnostic log ──────────────────────────────────────────────────

describe('createPracticeTick — diagnostic log', () => {
  it('does NOT log when remoteLogEnabled is false', () => {
    const deps = makeDeps({
      remoteLogEnabled: false,
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [makeNote()],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    createPracticeTick(deps)(0, false, null);
    expect(deps.remoteLog).not.toHaveBeenCalled();
  });

  it('logs once per second when enabled', () => {
    const deps = makeDeps({
      remoteLogEnabled: true,
      practice: {
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [makeNote()],
        currentNoteIdx: 0,
        hits: 0,
        misses: 0,
        sectionCombo: 0,
        _completing: false,
        _completionTimer: null,
        _lastProgUpdate: 0,
      },
    });
    const tick = createPracticeTick(deps);
    tick(0, false, null);
    expect(deps.remoteLog).toHaveBeenCalledTimes(1);
    tick(500, false, null); // within 1s, should not log again
    expect(deps.remoteLog).toHaveBeenCalledTimes(1);
    tick(1100, false, null); // past 1s
    expect(deps.remoteLog).toHaveBeenCalledTimes(2);
  });
});
