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
