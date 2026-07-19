import { describe, it, expect, beforeEach } from 'vitest';
import {
  initPracticeState,
  resetPracticeState,
  buildSectionNotes,
  computeHandRanges,
  matchNoteOnset,
  finalizeNoteHold,
  computeStars,
  resolveResultTier,
  pickSectionFocus,
  SECTION_FOCUS_STRENGTH_FLOOR,
  needsPreflightScaffold,
  planSectionScaffold,
  computeUnlocks,
  practiceBeatMs,
  computePracticeTimings,
  type UnlockComputeInput,
  practiceElapsedMs,
  STAR_TIERS,
  HIT_WINDOW_MS,
  PERFECT_MS,
  type PracticeState,
  type PracticeSourceNote,
  type PracticeNote,
  type MatchOutcome,
} from '../src/state/practice-state';

// =====================================================================
// initPracticeState / resetPracticeState
// =====================================================================

describe('initPracticeState', () => {
  it('starts in guided mode with empty schedule', () => {
    const s = initPracticeState();
    expect(s.mode).toBe('guided');
    expect(s.sectionNotes).toEqual([]);
    expect(s.currentNoteIdx).toBe(0);
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
    expect(s.pendingHolds.size).toBe(0);
    expect(s.sectionCombo).toBe(0);
  });

  it('respects mode argument', () => {
    expect(initPracticeState('rhythm').mode).toBe('rhythm');
    expect(initPracticeState('listen').mode).toBe('listen');
  });
});

describe('resetPracticeState', () => {
  it('clears counters but keeps Map allocation + mode', () => {
    const s = initPracticeState('rhythm');
    const holdsRef = s.pendingHolds;
    s.hits = 10;
    s.sectionCombo = 5;
    s.pendingHolds.set(60, {} as PracticeNote);
    resetPracticeState(s);
    expect(s.pendingHolds).toBe(holdsRef);
    expect(s.pendingHolds.size).toBe(0);
    expect(s.hits).toBe(0);
    expect(s.sectionCombo).toBe(0);
    expect(s.mode).toBe('rhythm'); // mode preserved
  });
});

// =====================================================================
// buildSectionNotes
// =====================================================================

describe('buildSectionNotes', () => {
  const songNotes: PracticeSourceNote[] = [
    { hand: 'R', midi: 60, timeSec: 0.0, durSec: 0.5, measureIdx: 0, cursorJump: null },
    { hand: 'L', midi: 48, timeSec: 0.5, durSec: 0.5, measureIdx: 0, cursorJump: null },
    { hand: 'R', midi: 64, timeSec: 1.0, durSec: 0.5, measureIdx: 1, cursorJump: null },
    { hand: 'R', midi: 67, timeSec: 5.0, durSec: 0.5, measureIdx: 5, cursorJump: null }, // outside section
  ];
  const section = { id: 'A1', startSec: 0, endSec: 2 };

  it('filters to the section window', () => {
    const out = buildSectionNotes(songNotes, section, {
      tempoPct: 100,
      handFilter: null,
      countInMs: 0,
    });
    expect(out).toHaveLength(3);
    // The 5s note should be excluded.
    expect(out.every((n) => n.midi !== 67)).toBe(true);
  });

  it('adds count-in offset to every note', () => {
    const out = buildSectionNotes(songNotes, section, {
      tempoPct: 100,
      handFilter: null,
      countInMs: 4000,
    });
    expect(out[0].timeMs).toBe(4000); // first note at section-relative t=0
    expect(out[1].timeMs).toBe(4500);
    expect(out[2].timeMs).toBe(5000);
  });

  it('applies tempoPct as a speed factor (60% → 1.667× wallclock)', () => {
    const out = buildSectionNotes(songNotes, section, {
      tempoPct: 60,
      handFilter: null,
      countInMs: 0,
    });
    // 0.5s at 60% → 0.5 * 1000 * (100/60) ≈ 833ms
    expect(out[1].timeMs).toBeCloseTo(833.33, 1);
  });

  it('one-hand filter pre-flags the other-hand notes as hit + _filtered', () => {
    const out = buildSectionNotes(songNotes, section, {
      tempoPct: 100,
      handFilter: 'R',
      countInMs: 0,
    });
    const lhNote = out.find((n) => n.hand === 'L')!;
    expect(lhNote.hit).toBe(true);
    expect(lhNote._filtered).toBe(true);
    const rhNote = out.find((n) => n.hand === 'R')!;
    expect(rhNote.hit).toBe(false);
    expect(rhNote._filtered).toBe(false);
  });

  it('output is sorted by timeMs ascending', () => {
    const unordered: PracticeSourceNote[] = [
      { hand: 'R', midi: 60, timeSec: 0.5, durSec: 0.5, measureIdx: 0, cursorJump: null },
      { hand: 'R', midi: 62, timeSec: 0.0, durSec: 0.5, measureIdx: 0, cursorJump: null },
      { hand: 'R', midi: 64, timeSec: 0.25, durSec: 0.5, measureIdx: 0, cursorJump: null },
    ];
    const out = buildSectionNotes(
      unordered,
      { id: 'X', startSec: 0, endSec: 1 },
      {
        tempoPct: 100,
        handFilter: null,
        countInMs: 0,
      }
    );
    expect(out.map((n) => n.midi)).toEqual([62, 64, 60]);
  });
});

// =====================================================================
// computeHandRanges
// =====================================================================

describe('computeHandRanges', () => {
  it('finds min/max per hand', () => {
    const notes: PracticeNote[] = [
      mkNote({ hand: 'R', midi: 60 }),
      mkNote({ hand: 'R', midi: 72 }),
      mkNote({ hand: 'R', midi: 67 }),
      mkNote({ hand: 'L', midi: 36 }),
      mkNote({ hand: 'L', midi: 48 }),
    ];
    const r = computeHandRanges(notes);
    expect(r).toEqual({ lhMin: 36, lhMax: 48, rhMin: 60, rhMax: 72 });
  });

  it('uses sane defaults when a hand has no notes', () => {
    const r = computeHandRanges([mkNote({ hand: 'R', midi: 60 })]);
    expect(r.lhMin).toBe(48);
    expect(r.lhMax).toBe(60);
  });

  it('ensures range is non-degenerate (min < max)', () => {
    const r = computeHandRanges([mkNote({ hand: 'R', midi: 60 }), mkNote({ hand: 'L', midi: 48 })]);
    expect(r.rhMin).toBeLessThan(r.rhMax);
    expect(r.lhMin).toBeLessThan(r.lhMax);
  });
});

// =====================================================================
// matchNoteOnset
// =====================================================================

describe('matchNoteOnset', () => {
  let s: PracticeState;
  beforeEach(() => {
    s = initPracticeState('rhythm');
    s.sectionNotes = [
      mkNote({ midi: 60, timeMs: 1000 }),
      mkNote({ midi: 64, timeMs: 2000 }),
      mkNote({ midi: 67, timeMs: 3000 }),
    ];
  });

  it('returns no-op in listen mode', () => {
    s.mode = 'listen';
    const r = matchNoteOnset(s, 60, { elapsed: 1000 }, 0);
    expect(r.type).toBe('no-op');
  });

  it('hits cur note within window', () => {
    const r = matchNoteOnset(s, 60, { elapsed: 1000 }, 100) as Extract<
      MatchOutcome,
      { type: 'hit' }
    >;
    expect(r.type).toBe('hit');
    expect(r.note.midi).toBe(60);
    expect(r.isPerfect).toBe(true);
    expect(r.timingScore).toBe(1.0);
    expect(s.sectionNotes[0].hit).toBe(true);
    expect(s.hits).toBe(1);
    expect(s.sectionCombo).toBe(1);
  });

  it('rejects wrong note in rhythm mode', () => {
    const r = matchNoteOnset(s, 64, { elapsed: 1000 }, 100); // expected 60, played 64
    expect(r.type).toBe('wrong-note');
    expect(s.sectionNotes[0].hit).toBe(false);
    expect(s.hits).toBe(0);
  });

  it('marks perfect when |dt| < PERFECT_MS', () => {
    const r = matchNoteOnset(s, 60, { elapsed: 1000 + 50 }, 0) as Extract<
      MatchOutcome,
      { type: 'hit' }
    >;
    expect(r.isPerfect).toBe(true);
  });

  it('marks "good" (not perfect) when |dt| > PERFECT_MS but in window', () => {
    const r = matchNoteOnset(s, 60, { elapsed: 1000 + PERFECT_MS + 50 }, 0) as Extract<
      MatchOutcome,
      { type: 'hit' }
    >;
    expect(r.isPerfect).toBe(false);
    expect(r.timingScore).toBeGreaterThan(0);
    expect(r.timingScore).toBeLessThan(1);
  });

  it('asymmetric: early press judged against smaller early window (steeper penalty)', () => {
    // Press 100ms early — within early window (120ms), but barely.
    const early = matchNoteOnset(s, 60, { elapsed: 1000 - 100 }, 0) as Extract<
      MatchOutcome,
      { type: 'hit' }
    >;
    expect(early.type).toBe('hit');
    // Reset for fair comparison
    s.sectionNotes[0].hit = false;
    s.hits = 0;
    s.timingScoreSum = 0;
    s.sectionCombo = 0;
    // Press 100ms late — within late window (350ms), much more lenient.
    const late = matchNoteOnset(s, 60, { elapsed: 1000 + 100 }, 0) as Extract<
      MatchOutcome,
      { type: 'hit' }
    >;
    expect(late.type).toBe('hit');
    // Late timing should score HIGHER than early (since late window is wider).
    expect(late.timingScore).toBeGreaterThan(early.timingScore);
  });

  it('rejects out-of-window press in rhythm mode', () => {
    const r = matchNoteOnset(s, 60, { elapsed: 1000 + HIT_WINDOW_MS + 100 }, 0);
    expect(r.type).toBe('wrong-note');
  });

  it('guided mode: late press counts as a hit (note waits, no late ceiling)', () => {
    s.mode = 'guided';
    const r = matchNoteOnset(s, 60, { elapsed: 99999 }, 0) as Extract<
      MatchOutcome,
      { type: 'hit' }
    >;
    expect(r.type).toBe('hit');
    expect(r.isPerfect).toBe(true);
    expect(r.timingScore).toBe(1.0);
  });

  it('guided mode: very-early press (count-in phase) is rejected', () => {
    s.mode = 'guided';
    // cur.timeMs = 1000 (mkNote default). elapsed = 500 → dtSigned = -500ms,
    // well past the HIT_WINDOW_EARLY_MS = 120 budget.
    const r = matchNoteOnset(s, 60, { elapsed: 500 }, 0);
    expect(r.type).toBe('wrong-note');
  });

  it('chord-mate: matches a sibling note within ±CHORD_MATE_TOLERANCE_MS', () => {
    // Build a 3-note chord at t=1000, ±20ms apart.
    s.sectionNotes = [
      mkNote({ midi: 60, timeMs: 1000 }),
      mkNote({ midi: 64, timeMs: 1010 }),
      mkNote({ midi: 67, timeMs: 1020 }),
    ];
    // Press 67 first — should match the chord-mate at idx 2.
    const r = matchNoteOnset(s, 67, { elapsed: 1010 }, 0) as Extract<MatchOutcome, { type: 'hit' }>;
    expect(r.type).toBe('hit');
    expect(r.isChordMate).toBe(true);
    expect(r.note.midi).toBe(67);
    expect(s.sectionNotes[2].hit).toBe(true);
    expect(s.sectionNotes[0].hit).toBe(false); // cur (60) untouched
  });

  it('skips already-resolved notes via currentNoteIdx eager-advance', () => {
    s.sectionNotes[0].hit = true; // pretend cur was resolved
    s.sectionNotes[1].missed = true;
    // Press the next un-resolved note (67).
    const r = matchNoteOnset(s, 67, { elapsed: 3000 }, 0) as Extract<MatchOutcome, { type: 'hit' }>;
    expect(r.type).toBe('hit');
    expect(r.note.midi).toBe(67);
    expect(s.currentNoteIdx).toBe(2); // advanced past resolved
  });

  it('returns no-op when all notes are resolved', () => {
    s.sectionNotes.forEach((n) => (n.hit = true));
    const r = matchNoteOnset(s, 60, { elapsed: 5000 }, 0);
    expect(r.type).toBe('no-op');
  });

  it('updates sectionBestCombo as combo grows', () => {
    matchNoteOnset(s, 60, { elapsed: 1000 }, 0);
    matchNoteOnset(s, 64, { elapsed: 2000 }, 0);
    matchNoteOnset(s, 67, { elapsed: 3000 }, 0);
    expect(s.sectionCombo).toBe(3);
    expect(s.sectionBestCombo).toBe(3);
  });
});

// =====================================================================
// finalizeNoteHold
// =====================================================================

describe('finalizeNoteHold', () => {
  let s: PracticeState;
  beforeEach(() => {
    s = initPracticeState('rhythm');
    s.sectionNotes = [mkNote({ midi: 60, timeMs: 1000, durMs: 500 })];
  });

  it('returns no-op when nothing pending', () => {
    const r = finalizeNoteHold(s, 60, 100);
    expect(r.type).toBe('no-op');
  });

  it('returns no-op in non-rhythm mode (no duration scoring)', () => {
    s.mode = 'guided';
    matchNoteOnset(s, 60, { elapsed: 1000 }, 0);
    const r = finalizeNoteHold(s, 60, 500);
    expect(r.type).toBe('no-op');
  });

  it('scores 1.0 for an exact hold', () => {
    matchNoteOnset(s, 60, { elapsed: 1000 }, 0); // holdStartMs = 0
    const r = finalizeNoteHold(s, 60, 500) as Extract<
      ReturnType<typeof finalizeNoteHold>,
      { type: 'scored' }
    >;
    expect(r.type).toBe('scored');
    expect(r.score).toBeCloseTo(1, 5);
    expect(s.durationScoreSum).toBeCloseTo(1, 5);
    expect(s.durationScoredCount).toBe(1);
  });

  it('scores < 1 for a too-short hold and reports tooShort=true', () => {
    matchNoteOnset(s, 60, { elapsed: 1000 }, 0);
    // expected=500, hold=350 → |diff|=150 < tol=max(120, 500*0.4)=200 → partial score.
    const r = finalizeNoteHold(s, 60, 350) as Extract<
      ReturnType<typeof finalizeNoteHold>,
      { type: 'scored' }
    >;
    expect(r.score).toBeLessThan(1);
    expect(r.score).toBeGreaterThan(0);
    expect(r.tooShort).toBe(true);
  });

  it('scores 0 when off by more than tol', () => {
    matchNoteOnset(s, 60, { elapsed: 1000 }, 0);
    // expected 500, hold 9999 → way over tolerance → score 0.
    const r = finalizeNoteHold(s, 60, 9999) as Extract<
      ReturnType<typeof finalizeNoteHold>,
      { type: 'scored' }
    >;
    expect(r.score).toBe(0);
    expect(r.tooShort).toBe(false);
  });

  it('clears the pending entry after scoring (single-shot)', () => {
    matchNoteOnset(s, 60, { elapsed: 1000 }, 0);
    finalizeNoteHold(s, 60, 500);
    const r2 = finalizeNoteHold(s, 60, 500);
    expect(r2.type).toBe('no-op');
  });
});

// =====================================================================
// computeStars
// =====================================================================

describe('computeStars', () => {
  it('returns 3 stars when all thresholds clear', () => {
    expect(computeStars(95, 80, 80)).toBe(3);
  });

  it('returns 2 stars when timing/dur are mid-tier', () => {
    expect(computeStars(80, 50, 60)).toBe(2);
  });

  it('returns 1 star when only accuracy clears', () => {
    expect(computeStars(60, 0, 0)).toBe(1);
  });

  it('returns 0 stars below all thresholds', () => {
    expect(computeStars(40, 0, 0)).toBe(0);
  });

  it('treats null durPct as "ignore" (guided mode)', () => {
    expect(computeStars(90, 70, null)).toBe(3);
  });

  it('null durPct still requires acc + timing thresholds', () => {
    expect(computeStars(85, 55, null)).toBe(2); // misses 3-star timing 60
  });

  it('STAR_TIERS is ordered descending by stars', () => {
    for (let i = 1; i < STAR_TIERS.length; i++) {
      expect(STAR_TIERS[i].stars).toBeLessThan(STAR_TIERS[i - 1].stars);
    }
  });
});

// =====================================================================
// resolveResultTier
// =====================================================================

describe('resolveResultTier', () => {
  it('maps each star count 0..3 to its tierN keys', () => {
    expect(resolveResultTier(0)).toEqual({ titleKey: 'tier0Title', msgKey: 'tier0Msg' });
    expect(resolveResultTier(1)).toEqual({ titleKey: 'tier1Title', msgKey: 'tier1Msg' });
    expect(resolveResultTier(2)).toEqual({ titleKey: 'tier2Title', msgKey: 'tier2Msg' });
    expect(resolveResultTier(3)).toEqual({ titleKey: 'tier3Title', msgKey: 'tier3Msg' });
  });

  it('clamps stars below zero to tier 0', () => {
    expect(resolveResultTier(-5)).toEqual({ titleKey: 'tier0Title', msgKey: 'tier0Msg' });
  });

  it('clamps stars above 3 to tier 3', () => {
    expect(resolveResultTier(99)).toEqual({ titleKey: 'tier3Title', msgKey: 'tier3Msg' });
  });

  it('coerces fractional stars by truncation', () => {
    expect(resolveResultTier(2.9)).toEqual({ titleKey: 'tier2Title', msgKey: 'tier2Msg' });
  });
});

// =====================================================================
// pickSectionFocus (Knowledge-of-Performance coaching)
// =====================================================================

describe('pickSectionFocus', () => {
  it('returns null on a clean 3-star run (celebrate, do not coach)', () => {
    expect(pickSectionFocus(95, 80, 80, 3)).toBeNull();
  });

  it('routes a low hit-rate to the notes tip regardless of which axis is lowest', () => {
    // Accuracy below the ★2 gate (70): fundamentals first even though
    // duration is the numerically weakest dimension.
    const f = pickSectionFocus(55, 90, 40, 1);
    expect(f).not.toBeNull();
    expect(f!.focusDim).toBe('accuracy');
    expect(f!.focusKey).toBe('fNotes');
  });

  it('focuses the weakest axis once notes are mostly landing', () => {
    // Accuracy healthy (>=70) so the fundamentals override does not fire;
    // timing is the weakest, so the next step is the timing strategy.
    const f = pickSectionFocus(75, 45, 88, 2);
    expect(f!.focusDim).toBe('timing');
    expect(f!.focusKey).toBe('fTiming');
    // ...and the strength names the strongest *other* axis (duration, 88).
    expect(f!.strengthKey).toBe('sfHoldStrong');
  });

  it('focuses note length when hold-time is the weak axis', () => {
    const f = pickSectionFocus(90, 80, 40, 2);
    expect(f!.focusDim).toBe('duration');
    expect(f!.focusKey).toBe('fHold');
  });

  it('leads with effort (not a named axis) when nothing clears the honesty floor', () => {
    // Everything mediocre: the would-be strength axis is below the floor,
    // so the praise stays truthful instead of inventing a strength.
    const f = pickSectionFocus(68, 40, 50, 1);
    expect(f!.strengthKey).toBe('sfEffort');
    // Below the floor by construction.
    expect(50).toBeLessThan(SECTION_FOCUS_STRENGTH_FLOOR);
  });

  it('names a real strength when one axis clears the floor', () => {
    const f = pickSectionFocus(82, 40, 80, 2);
    // accuracy (82) and duration (80) both clear the floor; the strength is
    // the strongest non-focus axis, and the focus is timing.
    expect(f!.focusDim).toBe('timing');
    expect(['sfNotesStrong', 'sfHoldStrong']).toContain(f!.strengthKey);
  });

  it('handles guided-style null duration (only accuracy + timing measured)', () => {
    const f = pickSectionFocus(90, 40, null, 2);
    expect(f!.focusDim).toBe('timing');
    expect(f!.strengthKey).toBe('sfNotesStrong');
  });

  it('strength axis is never the same as the focus axis', () => {
    for (const [a, t, d, s] of [
      [50, 90, 88, 1],
      [88, 50, 90, 2],
      [90, 88, 50, 2],
      [40, 40, 40, 0],
    ] as const) {
      const f = pickSectionFocus(a, t, d, s);
      if (f && f.strengthKey !== 'sfEffort') {
        const named: Record<string, string> = {
          sfNotesStrong: 'accuracy',
          sfTimingStrong: 'timing',
          sfHoldStrong: 'duration',
        };
        expect(named[f.strengthKey]).not.toBe(f.focusDim);
      }
    }
  });
});

// =====================================================================
// needsPreflightScaffold (feed-forward)
// =====================================================================

describe('needsPreflightScaffold', () => {
  it('is false with no history', () => {
    expect(needsPreflightScaffold([])).toBe(false);
  });

  it('is false after a single miss (one try is not a struggle)', () => {
    expect(needsPreflightScaffold([0])).toBe(false);
  });

  it('is true after two trailing misses', () => {
    expect(needsPreflightScaffold([0, 0])).toBe(true);
    expect(needsPreflightScaffold([2, 1, 0, 0])).toBe(true);
  });

  it('clears the moment a star is earned (trailing run resets)', () => {
    expect(needsPreflightScaffold([0, 0, 1])).toBe(false);
    expect(needsPreflightScaffold([0, 0, 0, 2])).toBe(false);
  });

  it('only counts the *trailing* run, not misses earlier in the buffer', () => {
    expect(needsPreflightScaffold([0, 0, 3, 1])).toBe(false);
  });

  it('respects a custom minStreak', () => {
    expect(needsPreflightScaffold([0, 0], 3)).toBe(false);
    expect(needsPreflightScaffold([0, 0, 0], 3)).toBe(true);
  });
});

// =====================================================================
// planSectionScaffold (adaptive feed-forward escalation)
// =====================================================================

describe('planSectionScaffold', () => {
  const h = (...rows: Array<[number, number]>) => rows.map(([a, s]) => ({ a, s }));

  it('does not show below the streak threshold', () => {
    expect(planSectionScaffold(h([40, 0]))).toEqual({ show: false, depth: 1, strategy: 'listen' });
  });

  it('shows the low-friction "listen" nudge at a shallow (2) struggle', () => {
    const plan = planSectionScaffold(h([60, 1], [40, 0], [45, 0]));
    expect(plan).toEqual({ show: true, depth: 2, strategy: 'listen' });
  });

  it('escalates to one-hand when notes are the bottleneck (deep + low accuracy)', () => {
    const plan = planSectionScaffold(h([50, 0], [55, 0], [58, 0]));
    expect(plan.show).toBe(true);
    expect(plan.depth).toBe(3);
    expect(plan.strategy).toBe('oneHand');
  });

  it('escalates to slower tempo when notes land but timing does not', () => {
    // Accuracy >= 70 on the latest attempt → timing is the bottleneck.
    const plan = planSectionScaffold(h([72, 0], [78, 0], [82, 0]));
    expect(plan.strategy).toBe('slowTempo');
  });

  it('clears the moment a star is earned (depth resets)', () => {
    expect(planSectionScaffold(h([20, 0], [30, 0], [60, 1])).show).toBe(false);
  });
});

// =====================================================================
// computeUnlocks
// =====================================================================

describe('computeUnlocks', () => {
  const baseInput: UnlockComputeInput = {
    stars: 3,
    tempoPct: 60,
    sectionId: 'A1',
    sectionIds: ['A1', 'B', 'A2'],
    sectionNameKeys: { A1: 'feA1', B: 'feB', A2: 'feA2' },
    unlockedTempos: { 60: true },
    unlockedSections: { A1: true },
    streakCount: 0,
  };

  it('unlocks the next tempo tier when stars >= 2', () => {
    const r = computeUnlocks(baseInput);
    expect(r.unlockedTempo).toBe(75);
  });

  it('does not unlock the next tempo when stars < 2', () => {
    const r = computeUnlocks({ ...baseInput, stars: 1 });
    expect(r.unlockedTempo).toBeNull();
  });

  it('does not re-unlock an already-unlocked tempo', () => {
    const r = computeUnlocks({
      ...baseInput,
      unlockedTempos: { 60: true, 75: true },
    });
    expect(r.unlockedTempo).toBeNull();
  });

  it('does not advance past the last tempo tier', () => {
    const r = computeUnlocks({ ...baseInput, tempoPct: 100 });
    expect(r.unlockedTempo).toBeNull();
  });

  it('unlocks the next section when stars >= 1', () => {
    const r = computeUnlocks({ ...baseInput, stars: 1 });
    expect(r.unlockedSecKey).toBe('feB');
  });

  it('does not unlock the next section when stars < 1', () => {
    const r = computeUnlocks({ ...baseInput, stars: 0 });
    expect(r.unlockedSecKey).toBeNull();
  });

  it('does not re-unlock an already-unlocked section', () => {
    const r = computeUnlocks({
      ...baseInput,
      unlockedSections: { A1: true, B: true },
    });
    expect(r.unlockedSecKey).toBeNull();
  });

  it('does not advance past the last section', () => {
    const r = computeUnlocks({ ...baseInput, sectionId: 'A2' });
    expect(r.unlockedSecKey).toBeNull();
  });

  it('reports the streak when streakCount hits the default 3-day milestone', () => {
    const r = computeUnlocks({ ...baseInput, streakCount: 3 });
    expect(r.streakDays).toBe(3);
  });

  it('reports the streak at the default 7-day milestone', () => {
    const r = computeUnlocks({ ...baseInput, streakCount: 7 });
    expect(r.streakDays).toBe(7);
  });

  it('returns null streak for non-milestone counts', () => {
    const r = computeUnlocks({ ...baseInput, streakCount: 5 });
    expect(r.streakDays).toBeNull();
  });

  it('honors custom streak milestones', () => {
    const r = computeUnlocks({
      ...baseInput,
      streakCount: 30,
      streakMilestones: [10, 30, 100],
    });
    expect(r.streakDays).toBe(30);
  });

  it('returns null section when sectionNameKeys lacks the next entry', () => {
    const r = computeUnlocks({
      ...baseInput,
      stars: 1,
      sectionNameKeys: { A1: 'feA1' }, // missing B + A2
    });
    expect(r.unlockedSecKey).toBeNull();
  });
});

// =====================================================================
// practiceElapsedMs
// =====================================================================

describe('practiceElapsedMs', () => {
  let s: PracticeState;
  beforeEach(() => {
    s = initPracticeState();
    s.sectionNotes = [mkNote({ midi: 60, timeMs: 5000 }), mkNote({ midi: 64, timeMs: 6000 })];
  });

  it('rhythm mode passes real time through', () => {
    s.mode = 'rhythm';
    expect(practiceElapsedMs(s, 1234, 4000)).toBe(1234);
  });

  it('listen mode passes real time through', () => {
    s.mode = 'listen';
    expect(practiceElapsedMs(s, 1234, 4000)).toBe(1234);
  });

  it('guided mode uses real time during count-in', () => {
    s.mode = 'guided';
    expect(practiceElapsedMs(s, 2000, 4000)).toBe(2000);
  });

  it('guided mode freezes at current note timeMs after count-in ends', () => {
    s.mode = 'guided';
    // Past count-in (4000), should freeze at sectionNotes[0].timeMs = 5000.
    expect(practiceElapsedMs(s, 5500, 4000)).toBe(5000);
  });

  it('guided mode falls back to countInMs when no notes remain', () => {
    s.mode = 'guided';
    s.sectionNotes = [];
    expect(practiceElapsedMs(s, 9999, 4000)).toBe(4000);
  });
});

// =====================================================================
// helpers
// =====================================================================

function mkNote(overrides: Partial<PracticeNote>): PracticeNote {
  return {
    hand: 'R',
    midi: 60,
    timeMs: 0,
    durMs: 500,
    measureIdx: 0,
    cursorJump: null,
    hit: false,
    missed: false,
    _filtered: false,
    ...overrides,
  };
}

// =====================================================================
// practiceBeatMs / computePracticeTimings
// =====================================================================

describe('practiceBeatMs', () => {
  it('60000 / bpm at 100% tempo (1 beat = 1 second at 60 BPM)', () => {
    expect(practiceBeatMs(60, 100)).toBe(1000);
    expect(practiceBeatMs(120, 100)).toBe(500);
  });

  it('scales by tempoPct (50% tempo → twice as long per beat)', () => {
    expect(practiceBeatMs(120, 50)).toBe(1000);
    expect(practiceBeatMs(120, 200)).toBe(250);
  });

  it('falls back to 72 BPM for non-positive bpm', () => {
    expect(practiceBeatMs(0, 100)).toBe(60000 / 72);
    expect(practiceBeatMs(-30, 100)).toBe(60000 / 72);
  });

  it('falls back to 100% tempo for non-positive tempoPct', () => {
    expect(practiceBeatMs(120, 0)).toBe(500);
    expect(practiceBeatMs(120, -50)).toBe(500);
  });
});

describe('computePracticeTimings', () => {
  it('4 beats when 4 × beatMs sits inside the clamp window', () => {
    const out = computePracticeTimings(833.333); // 72 BPM beat → 4×833=3333
    expect(out.countInMs).toBe(3333);
    expect(out.beats).toBe(4);
    expect(out.laneLookaheadMs).toBe(out.countInMs);
  });

  it('adds beats (not a longer interval) below the floor — fast tempo', () => {
    // 120 BPM: 4×500=2000 < 2400 floor → bump to 5 beats, still 500 apart.
    const out = computePracticeTimings(500);
    expect(out.beats).toBe(5);
    expect(out.countInMs).toBe(2500);
    // The count-in interval MUST equal the real beat so clicks match tempo.
    expect(out.countInMs / out.beats).toBe(500);
  });

  it('caps the beat count on a pathological (absurdly fast) tempo', () => {
    // beatMs=100 would nominally want 24 beats; the MAX_COUNT_IN_BEATS
    // cap holds it at 16 so a malformed <sound tempo> can't schedule
    // hundreds of near-continuous clicks. Interval stays == beatMs.
    const out = computePracticeTimings(100);
    expect(out.beats).toBe(16);
    expect(out.countInMs).toBe(1600);
    expect(out.countInMs / out.beats).toBe(100);
  });

  it('caps even at an insane beatMs (defensive)', () => {
    const out = computePracticeTimings(6); // ~9999 bpm import
    expect(out.beats).toBe(16); // not ceil(2400/6)=400
    expect(out.countInMs).toBe(96);
  });

  it('drops beats below the ceiling — very slow tempo', () => {
    // 2500 ms beat: 3 beats = 7500 > 7000 cap → 2 beats = 5000, one beat apart.
    const out = computePracticeTimings(2500);
    expect(out.beats).toBe(2);
    expect(out.countInMs).toBe(5000);
    expect(out.countInMs / out.beats).toBe(2500);
  });

  it('honors a feasible custom beat count', () => {
    // 1500 ms beat: window [2400,7000] allows 2..4 beats; target 2 fits.
    const out = computePracticeTimings(1500, { countInBeats: 2 });
    expect(out.beats).toBe(2);
    expect(out.countInMs).toBe(3000);
  });

  it('honors custom min / max', () => {
    const out = computePracticeTimings(500, {
      minCountInMs: 1000,
      maxCountInMs: 10000,
    });
    expect(out.countInMs).toBe(2000); // 4×500 within [1000, 10000]
    expect(out.beats).toBe(4);
  });

  it('never returns fewer than one beat', () => {
    // Beat longer than the whole ceiling window.
    const out = computePracticeTimings(9000);
    expect(out.beats).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(out.countInMs)).toBe(true);
  });

  it('rounds to integer ms', () => {
    const out = computePracticeTimings(333.333);
    expect(Number.isInteger(out.countInMs)).toBe(true);
  });

  it('exposes clickMs == beatMs on the legacy (meter-less) path', () => {
    const out = computePracticeTimings(500);
    expect(out.clickMs).toBe(500);
    expect(out.clicksPerBar).toBeUndefined();
  });
});

// 拍子指定時: カウントイン = 拍子ちょうど整数小節（業界標準）。
// クリック間隔は拍単位（複合拍子は付点四分）、クランプは小節数で吸収。
describe('computePracticeTimings — meter (整数小節カウントイン)', () => {
  it('4/4 slow enough for one bar → 4 clicks, 1 bar', () => {
    // 72 BPM: barMs = 4×833.333 = 3333 ∈ [2400, 7000] → 1 小節
    const out = computePracticeTimings(833.333, { meter: { beats: 4, beatType: 4 } });
    expect(out.beats).toBe(4);
    expect(out.clicksPerBar).toBe(4);
    expect(out.countInMs).toBe(3333);
    expect(out.clickMs).toBeCloseTo(833.333, 3);
  });

  it('4/4 at 120 BPM → 2 whole bars (8 clicks), NOT "1 2 3 4 5"', () => {
    // 旧実装は 2400ms を埋める 5 拍（拍子と無関係な数）だった。
    const out = computePracticeTimings(500, { meter: { beats: 4, beatType: 4 } });
    expect(out.beats).toBe(8);
    expect(out.countInMs).toBe(4000);
    expect(out.clickMs).toBe(500);
    expect(out.clicksPerBar).toBe(4);
  });

  it('3/4 → whole bars of 3 clicks', () => {
    // 100 BPM: barMs = 3×600 = 1800 < 2400 → 2 小節 = 6 クリック
    const out = computePracticeTimings(600, { meter: { beats: 3, beatType: 4 } });
    expect(out.beats).toBe(6);
    expect(out.countInMs).toBe(3600);
    expect(out.clicksPerBar).toBe(3);
  });

  it('6/8 → dotted-quarter clicks (複合拍子は拍単位)', () => {
    // 四分 80 BPM (beatMs 750) → クリック = 付点四分 1125ms、小節 2250ms
    // → 2 小節 = 4 クリック 4500ms
    const out = computePracticeTimings(750, { meter: { beats: 6, beatType: 8 } });
    expect(out.clickMs).toBe(1125);
    expect(out.clicksPerBar).toBe(2);
    expect(out.beats).toBe(4);
    expect(out.countInMs).toBe(4500);
  });

  it('3/8 → 1 click per bar, whole bars fill the clamp (Für Elise 型)', () => {
    // 四分 72 BPM (beatMs 833.333) → クリック = 小節 = 1250ms → 2 小節
    const out = computePracticeTimings(833.333, { meter: { beats: 3, beatType: 8 } });
    expect(out.clicksPerBar).toBe(1);
    expect(out.beats).toBe(2);
    expect(out.countInMs).toBe(2500);
  });

  it('a single bar longer than the max clamp still counts one whole bar', () => {
    // 小節を割ってクランプに収めない（カウントインは常に整数小節）。
    const out = computePracticeTimings(2000, { meter: { beats: 4, beatType: 4 } });
    expect(out.beats).toBe(4);
    expect(out.countInMs).toBe(8000); // > 7000 を許容（1 小節が下限）
  });

  it('caps total clicks at MAX_COUNT_IN_BEATS by dropping bars', () => {
    // beatMs=100 (病的な速さ): 下限 2400ms は 6 小節を要求するが、
    // 16 クリック上限 → 4 小節 = 16 クリック。
    const out = computePracticeTimings(100, { meter: { beats: 4, beatType: 4 } });
    expect(out.beats).toBe(16);
    expect(out.countInMs).toBe(1600);
  });

  it('pathological meter (numerator > click cap) falls back to legacy path', () => {
    const out = computePracticeTimings(500, { meter: { beats: 32, beatType: 4 } });
    // 従来ロジック: 120 BPM → 5 拍（clicksPerBar なし）
    expect(out.beats).toBe(5);
    expect(out.clicksPerBar).toBeUndefined();
  });

  it('invalid meter (0/0) falls back to legacy path', () => {
    const out = computePracticeTimings(833.333, { meter: { beats: 0, beatType: 0 } });
    expect(out.beats).toBe(4);
    expect(out.clicksPerBar).toBeUndefined();
  });
});
