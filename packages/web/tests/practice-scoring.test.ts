// Tests for packages/web/src/practice-scoring.ts.
//
// Covers:
//   • medianRecentPitch: empty → 0, sorted-median picked.
//   • practiceRealElapsedMs: Tone path uses ctx.currentTime - startAudioTime,
//     fallback uses performance.now, audioOffsetMs subtracted.
//   • practiceElapsedMs: guided pre-count-in → real time, guided post-
//     count-in → cur.timeMs (frozen), rhythm → real time always.
//   • matchNoteOnset: practice-disabled / listen-mode short-circuits;
//     guided mode "always in window" + always perfect; rhythm window edges;
//     wrong-note → miss + chip in guided only; chord-mate match within
//     tolerance; eager skip-past resolved notes; mutates hits / combo /
//     flow / pendingHolds + best-combo tracking.
//   • finalizeNoteHold: pendingHolds-cleanup, rhythm-only scoring,
//     duration tol math, too-short / too-long chip, score < 0.4 chip.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPracticeScoring,
  type PracticeScoringDeps,
  type PracticeScoringRef,
  type PracticeScoringStateRef,
  type PracticeScoringTuning,
  type PracticeNote,
} from '../src/practice-scoring';

// ─── fixtures ───────────────────────────────────────────────────────

function note(over: Partial<PracticeNote> = {}): PracticeNote {
  return {
    midi: 60,
    timeMs: 0,
    durMs: 500,
    hit: false,
    missed: false,
    ...over,
  };
}

const TUNING: PracticeScoringTuning = {
  hitWindowEarlyMs: 100,
  hitWindowMs: 200,
  perfectMs: 50,
  chordMateToleranceMs: 30,
  durationMinTolMs: 100,
  durationTolFraction: 0.3,
  countInMs: 4000,
};

interface Mocks {
  showHitChip: ReturnType<typeof vi.fn>;
  spawnBurst: ReturnType<typeof vi.fn>;
  remoteLog: ReturnType<typeof vi.fn>;
}

function makeFixture(
  over: {
    state?: Partial<PracticeScoringStateRef>;
    practice?: Partial<PracticeScoringRef>;
    tuning?: Partial<PracticeScoringTuning>;
    Tone?: PracticeScoringDeps['Tone'];
    notes?: PracticeNote[];
  } = {}
) {
  const state: PracticeScoringStateRef = {
    recentPitches: [],
    flow: 0,
    combo: 0,
    bestCombo: 0,
    ...over.state,
  };
  const practice: PracticeScoringRef = {
    enabled: true,
    mode: 'guided',
    sectionNotes: over.notes ?? [],
    currentNoteIdx: 0,
    hits: 0,
    sectionCombo: 0,
    sectionBestCombo: 0,
    timingScoreSum: 0,
    durationScoreSum: 0,
    durationScoredCount: 0,
    pendingHolds: new Map(),
    startAudioTime: 0,
    audioOffsetMs: 0,
    ...over.practice,
  };
  const mocks: Mocks = {
    showHitChip: vi.fn(),
    spawnBurst: vi.fn(),
    remoteLog: vi.fn(),
  };
  const deps: PracticeScoringDeps = {
    state,
    practice,
    tuning: { ...TUNING, ...over.tuning },
    Tone: 'Tone' in over ? over.Tone : undefined,
    showHitChip: mocks.showHitChip,
    spawnBurst: mocks.spawnBurst,
    getScreen: () => ({ W: 800, H: 600 }),
    t: (key, vars) => (vars ? `T(${key},${vars.v})` : `T(${key})`),
    midiToName: (midi) => 'M' + midi,
    remoteLog: mocks.remoteLog,
  };
  return { scoring: createPracticeScoring(deps), state, practice, mocks };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ─── medianRecentPitch ─────────────────────────────────────────────

describe('medianRecentPitch', () => {
  it('empty array → 0', () => {
    const fx = makeFixture({ state: { recentPitches: [] } });
    expect(fx.scoring.medianRecentPitch()).toBe(0);
  });

  it('single value → that value', () => {
    const fx = makeFixture({ state: { recentPitches: [440] } });
    expect(fx.scoring.medianRecentPitch()).toBe(440);
  });

  it('odd count → middle', () => {
    const fx = makeFixture({ state: { recentPitches: [220, 440, 880] } });
    expect(fx.scoring.medianRecentPitch()).toBe(440);
  });

  it('even count → upper of two middles (Math.floor of len/2)', () => {
    const fx = makeFixture({ state: { recentPitches: [200, 400, 600, 800] } });
    expect(fx.scoring.medianRecentPitch()).toBe(600);
  });

  it('does not mutate the source array', () => {
    const arr = [880, 220, 440];
    const fx = makeFixture({ state: { recentPitches: arr } });
    fx.scoring.medianRecentPitch();
    expect(arr).toEqual([880, 220, 440]);
  });
});

// ─── practiceRealElapsedMs ─────────────────────────────────────────

describe('practiceRealElapsedMs', () => {
  it('Tone path uses (currentTime - startAudioTime) * 1000', () => {
    const fx = makeFixture({
      practice: { startAudioTime: 1.5 },
      Tone: { context: { currentTime: 3.0 } },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1500);
  });

  it('subtracts audioOffsetMs', () => {
    const fx = makeFixture({
      practice: { startAudioTime: 0, audioOffsetMs: 40 },
      Tone: { context: { currentTime: 1 } },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(960); // 1000 - 40
  });

  it('null audioOffsetMs treated as 0', () => {
    const fx = makeFixture({
      practice: { startAudioTime: 0, audioOffsetMs: null },
      Tone: { context: { currentTime: 1 } },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1000);
  });

  it('fallback when Tone undefined uses performance.now', () => {
    vi.spyOn(performance, 'now').mockReturnValue(2500);
    const fx = makeFixture({ practice: { startAudioTime: 1 } });
    // raw = 2500 - 1*1000 = 1500
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1500);
  });

  it('fallback when Tone present but ctx missing uses performance.now', () => {
    vi.spyOn(performance, 'now').mockReturnValue(3000);
    const fx = makeFixture({
      practice: { startAudioTime: 0 },
      Tone: { context: undefined },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(3000);
  });
});

// ─── practiceElapsedMs ─────────────────────────────────────────────

describe('practiceElapsedMs', () => {
  it('guided + pre-count-in → real time', () => {
    const fx = makeFixture({
      practice: { mode: 'guided', startAudioTime: 0 },
      Tone: { context: { currentTime: 2 } }, // 2000 ms
    });
    // realElapsed = 2000 < 4000 → real
    expect(fx.scoring.practiceElapsedMs()).toBe(2000);
  });

  it('guided + post-count-in → frozen at cur.timeMs', () => {
    const fx = makeFixture({
      practice: {
        mode: 'guided',
        startAudioTime: 0,
        currentNoteIdx: 0,
        sectionNotes: [note({ timeMs: 5000 })],
      },
      Tone: { context: { currentTime: 6 } }, // 6000 ms > 4000
    });
    expect(fx.scoring.practiceElapsedMs()).toBe(5000);
  });

  it('guided + post-count-in + no current note → countInMs', () => {
    const fx = makeFixture({
      practice: { mode: 'guided', currentNoteIdx: 0, sectionNotes: [] },
      Tone: { context: { currentTime: 10 } },
    });
    expect(fx.scoring.practiceElapsedMs()).toBe(4000);
  });

  it('rhythm mode → real time always', () => {
    const fx = makeFixture({
      practice: { mode: 'rhythm', startAudioTime: 0 },
      Tone: { context: { currentTime: 8 } },
    });
    expect(fx.scoring.practiceElapsedMs()).toBe(8000);
  });

  it('reads countInMs live through a getter (P0-1 shell-wiring regression)', () => {
    // The shell passes tuning.countInMs as a getter over its COUNT_IN_MS
    // let so a mid-session tempo change is picked up. Mirror that here:
    // the guided count-in boundary must follow the current value, not a
    // snapshot taken at scoring-construction time.
    let liveCountIn = 4000;
    const state: PracticeScoringStateRef = { recentPitches: [], flow: 0, combo: 0, bestCombo: 0 };
    const practice: PracticeScoringRef = {
      enabled: true,
      mode: 'guided',
      sectionNotes: [],
      currentNoteIdx: 0,
      hits: 0,
      sectionCombo: 0,
      sectionBestCombo: 0,
      timingScoreSum: 0,
      durationScoreSum: 0,
      durationScoredCount: 0,
      pendingHolds: new Map(),
      startAudioTime: 0,
      audioOffsetMs: 0,
    };
    const scoring = createPracticeScoring({
      state,
      practice,
      tuning: {
        ...TUNING,
        get countInMs() {
          return liveCountIn;
        },
      },
      Tone: { context: { currentTime: 3 } }, // 3000 ms elapsed
      showHitChip: vi.fn(),
      spawnBurst: vi.fn(),
      getScreen: () => ({ W: 800, H: 600 }),
      t: (k) => k,
      midiToName: (m) => 'M' + m,
    });
    // 3000 < 4000 → still counting in → real time.
    expect(scoring.practiceElapsedMs()).toBe(3000);
    // Tempo speeds up: count-in shrinks to 2500. Now 3000 > 2500 → past
    // count-in → frozen at countInMs (no current note). The boundary
    // MUST have moved with the getter.
    liveCountIn = 2500;
    expect(scoring.practiceElapsedMs()).toBe(2500);
  });
});

// ─── matchNoteOnset ────────────────────────────────────────────────

describe('matchNoteOnset — short-circuits', () => {
  it('returns false when practice.enabled=false', () => {
    const fx = makeFixture({ practice: { enabled: false } });
    expect(fx.scoring.matchNoteOnset(60, true)).toBe(false);
  });

  it('returns false in listen mode', () => {
    const fx = makeFixture({ practice: { mode: 'listen' } });
    expect(fx.scoring.matchNoteOnset(60, true)).toBe(false);
  });

  it('returns false when no notes left', () => {
    const fx = makeFixture({ notes: [], practice: { currentNoteIdx: 0 } });
    expect(fx.scoring.matchNoteOnset(60, true)).toBe(false);
  });

  it('skips past already-hit notes (chord cluster played in same frame)', () => {
    const notes = [note({ midi: 60, timeMs: 1000, hit: true }), note({ midi: 64, timeMs: 1000 })];
    const fx = makeFixture({
      notes,
      practice: { currentNoteIdx: 0, mode: 'guided' },
      Tone: { context: { currentTime: 5 } }, // post-count-in
    });
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(true);
    expect(fx.practice.currentNoteIdx).toBe(1);
  });
});

describe('matchNoteOnset — guided mode', () => {
  function setup(over: { notes?: PracticeNote[] } = {}) {
    return makeFixture({
      notes: over.notes ?? [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'guided' },
      Tone: { context: { currentTime: 5 } }, // post-count-in, frozen at 5000
    });
  }

  it('correct note → hit + perfect chip + flow/combo/burst', () => {
    const fx = setup();
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(true);
    expect(fx.practice.hits).toBe(1);
    expect(fx.practice.sectionCombo).toBe(1);
    expect(fx.practice.timingScoreSum).toBe(1); // guided always 1
    expect(fx.state.flow).toBeCloseTo(10); // 0 + 6 + 1*4
    expect(fx.state.combo).toBe(1);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith('perfect', 'T(perfect)');
    expect(fx.mocks.spawnBurst).toHaveBeenCalled();
  });

  it('wrong note → miss chip with played name, no hit', () => {
    const fx = setup();
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(false);
    expect(fx.practice.hits).toBe(0);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith('miss', 'T(youPlayedFmt,M64)');
  });

  it('chord-mate match: out-of-order note within tolerance hits', () => {
    const notes = [
      note({ midi: 60, timeMs: 5000 }),
      note({ midi: 64, timeMs: 5010 }), // within 30ms tolerance
    ];
    const fx = setup({ notes });
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(true);
    // chord-mate hit: first note untouched
    expect(notes[0].hit).toBe(false);
    expect(notes[1].hit).toBe(true);
  });

  it('chord-mate beyond tolerance does NOT match', () => {
    const notes = [
      note({ midi: 60, timeMs: 5000 }),
      note({ midi: 64, timeMs: 5040 }), // beyond 30ms
    ];
    const fx = setup({ notes });
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(false);
  });

  it('updates sectionBestCombo when sectionCombo grows', () => {
    const fx = setup();
    fx.practice.sectionBestCombo = 5;
    fx.practice.sectionCombo = 5;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.sectionCombo).toBe(6);
    expect(fx.practice.sectionBestCombo).toBe(6);
  });

  it('does NOT regress sectionBestCombo when sectionCombo is smaller', () => {
    const fx = setup();
    fx.practice.sectionBestCombo = 20;
    fx.practice.sectionCombo = 0;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.sectionBestCombo).toBe(20);
  });

  it('updates state.bestCombo on a new high', () => {
    const fx = setup();
    fx.state.bestCombo = 0;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.state.bestCombo).toBe(1);
  });

  it('flow caps at 100', () => {
    const fx = setup();
    fx.state.flow = 99;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.state.flow).toBe(100);
  });

  it('hit registers pendingHolds entry with holdStartMs', () => {
    const fx = setup();
    fx.scoring.matchNoteOnset(60, true);
    const entry = fx.practice.pendingHolds.get(60);
    expect(entry).toBeDefined();
    expect(entry!.holdStartMs).toBeGreaterThan(0);
  });
});

describe('matchNoteOnset — rhythm mode windowing', () => {
  function setup(currentTime: number, override: Partial<PracticeNote> = {}) {
    return makeFixture({
      notes: [note({ midi: 60, timeMs: 5000, ...override })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      Tone: { context: { currentTime } },
    });
  }

  it('inside hit window → perfect chip when within perfectMs', () => {
    // currentTime=5.04 → 5040 ms, dt=40 < 50 perfect
    const fx = setup(5.04);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith('perfect', 'T(perfect)');
  });

  it('inside hit window but past perfectMs → good chip', () => {
    // dt=120 > 50 perfect, but inside 200 hit
    const fx = setup(5.12);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith('good', 'T(nice)');
  });

  it('past late window → no match', () => {
    // dt = +250 ms (past hitWindowMs=200)
    const fx = setup(5.25);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(false);
  });

  it('before early window → no match (rhythm only — guided is unbounded)', () => {
    // dt = -150 ms (early > hitWindowEarlyMs=100)
    const fx = setup(4.85);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(false);
  });

  it('wrong note inside the window → throttled fact-based chip (P2-17)', () => {
    // In the window (dt≈40) but wrong pitch — rhythm now shows a chip.
    const fx = setup(5.04);
    const ok = fx.scoring.matchNoteOnset(62, true); // expected 60, played 62
    expect(ok).toBe(false);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith('miss', 'T(youPlayedFmt,M62)');
    // A second wrong note within the throttle window is suppressed.
    fx.mocks.showHitChip.mockClear();
    fx.scoring.matchNoteOnset(63, true);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
  });

  it('asymmetric: an early miss uses early window for ts', () => {
    // dt = -80 ms (within early window). ts = max(0, 1 - 80/100) = 0.2
    const fx = setup(4.92);
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.timingScoreSum).toBeCloseTo(0.2, 2);
  });

  it('asymmetric: a late press uses late window for ts', () => {
    // dt = +180. ts = max(0, 1 - 180/200) = 0.1
    const fx = setup(5.18);
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.timingScoreSum).toBeCloseTo(0.1, 2);
  });
});

// ─── finalizeNoteHold ──────────────────────────────────────────────

describe('finalizeNoteHold', () => {
  it('clears pendingHolds entry even outside rhythm mode', () => {
    const matched = note({ midi: 60, durMs: 500, holdStartMs: performance.now() - 100 });
    const fx = makeFixture({ practice: { mode: 'guided' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.pendingHolds.has(60)).toBe(false);
    // No score change in guided.
    expect(fx.practice.durationScoreSum).toBe(0);
  });

  it('no-op when key not in pendingHolds', () => {
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.scoring.finalizeNoteHold(99);
    expect(fx.practice.durationScoredCount).toBe(0);
  });

  it('rhythm mode: held duration close to expected → high score', () => {
    const start = performance.now() - 500; // held 500ms
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.durationScoreSum).toBeGreaterThan(0.9);
    expect(fx.practice.durationScoredCount).toBe(1);
  });

  it('rhythm mode: heldMs < expected by > tol → too-short chip', () => {
    // expected 500, tol = max(100, 500*0.3) = 150. held 300 → off by 200, score=0
    const start = performance.now() - 300;
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith('miss', 'T(tooShort)');
  });

  it('rhythm mode: heldMs > expected by > tol → too-long chip', () => {
    const start = performance.now() - 1000; // held 1000ms vs expected 500
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith('miss', 'T(tooLong)');
  });

  it('does not chip when score >= 0.4', () => {
    // held 450, expected 500, tol 150 → score = 1 - 50/150 = 0.667
    const start = performance.now() - 450;
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
  });

  it('skips scoring when matched has no holdStartMs / durMs', () => {
    const matched = note({ midi: 60, durMs: 0, holdStartMs: 0 });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.durationScoredCount).toBe(0);
  });

  it('honors durationMinTolMs floor for very short notes', () => {
    // expected 50, raw tol = 50*0.3 = 15. min 100 → tol = 100.
    // held 100, off by 50 → score = 1 - 50/100 = 0.5 (no chip).
    const start = performance.now() - 100;
    const matched = note({ midi: 60, durMs: 50, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.durationScoreSum).toBeCloseTo(0.5, 1);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
  });
});
