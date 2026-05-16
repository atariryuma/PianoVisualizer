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
    // 90 acc + 70 timing = should still get 3 stars even with null dur.
    expect(computeStars(90, 70, null)).toBe(3);
  });

  it('null durPct still requires acc + timing thresholds', () => {
    expect(computeStars(85, 65, null)).toBe(2); // misses 3-star timing 70
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
  it('4 × beatMs by default, with lookahead = countIn', () => {
    const out = computePracticeTimings(500); // 120 BPM beat
    expect(out.countInMs).toBe(2400); // 4 × 500 = 2000 → clamped up to 2400 floor
    expect(out.laneLookaheadMs).toBe(out.countInMs);
  });

  it('clamps count-in below the floor (very fast tempo)', () => {
    expect(computePracticeTimings(100).countInMs).toBe(2400); // 4×100=400 → floor
  });

  it('clamps count-in above the ceiling (very slow tempo)', () => {
    expect(computePracticeTimings(2500).countInMs).toBe(7000); // 4×2500=10000 → cap
  });

  it('honors custom beat count', () => {
    const out = computePracticeTimings(500, { countInBeats: 2 });
    expect(out.countInMs).toBe(2400); // 2×500=1000 → still floored
  });

  it('honors custom min / max', () => {
    const out = computePracticeTimings(500, {
      minCountInMs: 1000,
      maxCountInMs: 10000,
    });
    expect(out.countInMs).toBe(2000); // 4×500 within [1000, 10000]
  });

  it('rounds to integer ms', () => {
    const out = computePracticeTimings(333.333);
    // 4×333.333 = 1333.33; below floor 2400 → clamped to 2400
    expect(Number.isInteger(out.countInMs)).toBe(true);
  });
});
