// PracticeState — the practice-mode session: which song, which section,
// section-relative note schedule, hit/miss ledger, and score accumulators.
//
// What lives here (pure / testable):
//   - PracticeState shape + init/reset
//   - buildSectionNotes / computeHandRanges (precompute helpers)
//   - matchNoteOnset (the core hit-window decision)
//   - finalizeNoteHold (release-time duration scoring)
//   - computeStars (final tier from accuracy / timing / duration)
//   - practiceElapsedMs (clock helper)
//
// What stays in the shell (not in core):
//   - Tone.js transport scheduling for ghost playback / metronome / count-in
//   - OSMD cursor manipulation (the shell implements a CursorAdapter; core just
//     emits events the shell turns into cursor.next() calls)
//   - DOM updates (hit chips, progress label)
//   - state.flow / state.combo nudges (game-state's responsibility)
//   - localStorage persistence (per-song progress, streak, unlocks)

import { meterBeatInfo } from '../library/measure-grid';

// =====================================================================
// Timing judgement
// =====================================================================
// Modelled on how the genre actually does it (beatmania IIDX, CHUNITHM,
// maimai, ONGEKI, DDR, osu!). Four properties are deliberate:
//
//   1. TIERS CARRY QUALITY ONLY — PERFECT / GREAT / GOOD, then MISS.
//      Direction (was the press early or late?) is NOT a tier. Encoding it as
//      the outermost tier, as this app used to, is both non-standard and
//      structurally fragile: the directional tier lives in the gap between
//      the GREAT edge and the window edge, so a band change can squeeze it to
//      zero width. That had actually happened — the GREAT band was
//      `perfectMs * 2` = 180 ms against a 120 ms early window, so the app
//      could report LATE but never EARLY, and the grade tally showed a
//      structural zero for early no matter how the player leaned.
//      Direction is now carried by the error DISTRIBUTION instead (the live
//      hit-error bar in render/lane.ts and the result chart), which is osu!'s
//      approach and cannot be squeezed out by a tier boundary.
//
//   2. WINDOWS ARE SYMMETRIC. Every published tap-note window in the genre
//      is mirrored around the note time (IIDX ±16.67/±33.33/±116.67/±250;
//      CHUNITHM ±16.66/±33.33/±66.67/±83.33; maimai ±16.67/±50/±100/±150;
//      osu!mania 16 / 64−3·OD / 97−3·OD / …). Asymmetry appears only on HOLD
//      ticks, a different mechanic. The old −120/+350 tap window (1 : 2.9)
//      let a learner run most of a beat behind at full credit.
//
//   3. BOUNDARIES ARE WHOLE 60 fps FRAMES. Also a genre convention — the
//      published windows above are all multiples of 16.67 ms — and here it is
//      more than convention: the rAF loop, the lane, and the mic onset
//      detector are all frame-quantized, so sub-frame boundaries claim a
//      resolution the pipeline does not have.
//
//   4. CREDIT IS A FUNCTION OF THE TIER, NOT OF THE RAW OFFSET.
//      `TIER_SCORE` below. The genre computes accuracy as a weighted sum of
//      tier counts (osu!: 300 = 100 %, 100 = 1/3, 50 = 1/6; IIDX EX score:
//      PGREAT 2, GREAT 1). Deriving credit separately from the tier is what
//      let the two disagree: the tier came from an absolute threshold while
//      credit came from `1 − |dt| / window` over asymmetric windows, so a
//      press 90 ms EARLY was shown as PERFECT and credited 25 % while 90 ms
//      LATE was shown as PERFECT and credited 74 %. With credit defined by
//      the tier, that class of bug cannot exist.

/** One 60 fps frame. Every judgement boundary is a whole multiple of this. */
export const JUDGE_FRAME_MS = 1000 / 60;

/** The three tier boundaries for one input path, in ms, each symmetric around
 *  the note time. `goodMs` is also the hit window: beyond it, the press is not
 *  a hit at all. */
export interface JudgeProfile {
  /** |dt| ≤ this → PERFECT. */
  perfectMs: number;
  /** |dt| ≤ this → GREAT. */
  greatMs: number;
  /** |dt| ≤ this → GOOD. Past it → MISS. Doubles as the hit window. */
  goodMs: number;
}

/** Build a profile from whole-frame boundaries, so the frame alignment is
 *  visible at the definition site instead of hidden in a magic number. */
function framesProfile(perfect: number, great: number, good: number): JudgeProfile {
  return Object.freeze({
    perfectMs: perfect * JUDGE_FRAME_MS,
    greatMs: great * JUDGE_FRAME_MS,
    goodMs: good * JUDGE_FRAME_MS,
  });
}

/**
 * Exact input (Web MIDI / native MIDI / BLE-MIDI): 4 / 8 / 12 frames
 * ≈ 67 / 133 / 200 ms.
 *
 * No published game varies its windows by input device — the genre treats
 * windows as a property of the chart or difficulty and handles device variance
 * with calibration. We split anyway, because the two paths here differ by an
 * order of magnitude in measurable precision and judging a ±40 ms-jittery
 * input on a ±50 ms window would be measuring our own noise. The split is the
 * automatic FLOOR; the player-facing difficulty knob is `JudgeStrictness`.
 */
export const JUDGE_PROFILE_MIDI: JudgeProfile = framesProfile(4, 8, 12);

/**
 * Mic input: 6 / 10 / 15 frames = 100 / 167 / 250 ms.
 *
 * The mic path cannot be judged tighter than its own detection jitter: the
 * onset AnalyserNode's FFT is 2048/48 kHz ≈ 43 ms, frame quantization adds
 * ~17 ms, and MIC_INPUT_LATENCY_MS compensates a VARIABLE lag with a constant
 * — roughly ±30-40 ms of irreducible error. A tier needs to be a couple of
 * times wider than that to mean anything, which is why the top tier here is
 * looser than any arcade top tier. `strict` brings it to ~70 ms (≈ osu! OD1)
 * for players who want the genre-standard challenge.
 */
export const JUDGE_PROFILE_MIC: JudgeProfile = framesProfile(6, 10, 15);

/**
 * Credit per tier, feeding the timing percentage. Ratios follow the genre
 * (osu! 300 / 100 / 50 = 1 : 1/3 : 1/6, IIDX EX 2 : 1 : 0), landing a little
 * more generous because this is a practice app: a GOOD is still a note the
 * learner played in time to count.
 */
export const TIER_SCORE: Readonly<Record<TimingGrade, number>> = Object.freeze({
  perfect: 1,
  great: 0.7,
  good: 0.3,
});

/** Player-facing judgement difficulty — the standard way strictness is
 *  expressed (osu!'s Overall Difficulty, StepMania's TimingWindowScale, IIDX's
 *  per-chart windows). Multiplies every boundary of the active profile.
 *  `normal` is tuned for a beginner on the default input; `strict` reaches
 *  roughly osu! OD1-5 depending on the path. */
export type JudgeStrictness = 'easy' | 'normal' | 'strict';

export const JUDGE_STRICTNESS_SCALE: Readonly<Record<JudgeStrictness, number>> = Object.freeze({
  easy: 1.3,
  normal: 1,
  strict: 0.7,
});

/** Scale every boundary of a profile. Returns the input unchanged at 1× so the
 *  frozen module-level profiles stay identity-comparable in the common case. */
export function scaleJudgeProfile(p: JudgeProfile, scale: number): JudgeProfile {
  if (scale === 1) return p;
  return {
    perfectMs: p.perfectMs * scale,
    greatMs: p.greatMs * scale,
    goodMs: p.goodMs * scale,
  };
}

/** Resolve the profile for one input event. `isExactInput` is the flag
 *  `matchNoteOnset` already receives (true = MIDI, false = mic onset). */
export function resolveJudgeProfile(
  isExactInput: boolean,
  strictness: JudgeStrictness = 'normal'
): JudgeProfile {
  const base = isExactInput ? JUDGE_PROFILE_MIDI : JUDGE_PROFILE_MIC;
  return scaleJudgeProfile(base, JUDGE_STRICTNESS_SCALE[strictness] ?? 1);
}

/** A press's timing tier. Quality only — see note 1 at the top of this
 *  section for why direction is deliberately not in here. */
export type TimingGrade = 'perfect' | 'great' | 'good';

/** Tier + credit + admissibility for one press, decided together. */
export interface TimingJudgement {
  /** The tier the player is shown. */
  grade: TimingGrade;
  /** Credit toward the timing percentage, 0..1 — `TIER_SCORE[grade]`. */
  score: number;
  /** False when |dt| exceeds the window; the press is a MISS, and `grade` /
   *  `score` describe the nearest tier rather than an awarded result. */
  inWindow: boolean;
}

/**
 * THE timing decision. One call produces the tier and the credit, so they
 * cannot drift apart (see note 4 above).
 */
export function judgeTiming(dtSignedMs: number, p: JudgeProfile): TimingJudgement {
  const dt = Math.abs(dtSignedMs);
  const grade: TimingGrade = dt <= p.perfectMs ? 'perfect' : dt <= p.greatMs ? 'great' : 'good';
  return { grade, score: TIER_SCORE[grade], inWindow: dt <= p.goodMs };
}

/**
 * Is a press close enough to count as a hit at all, under this mode's rule?
 *
 * Guided has NO late ceiling — the note waits for the learner — but it keeps
 * rhythm's EARLY window so a tap during the count-in, before the note has
 * descended to the hit zone, cannot pre-credit the note.
 *
 * Separate from `judgeForMode` because the gate is asked about the note the
 * cursor is ON, while the tier is decided for the note actually MATCHED (a
 * chord-mate may be a few ms away) — two different offsets, one rule.
 */
export function isTimingInWindow(mode: PracticeMode, dtSignedMs: number, p: JudgeProfile): boolean {
  if (mode === 'guided') return dtSignedMs >= -p.goodMs;
  return Math.abs(dtSignedMs) <= p.goodMs;
}

/**
 * The tier + credit for a matched press, with the mode's rule applied.
 *
 * Guided grades every hit `perfect` at full credit: its clock stops and waits,
 * so a signed offset there measures the learner's reading speed, not their
 * timing, and reporting it as a tier would be meaningless.
 *
 * This lives in core rather than at the two call sites (core's `matchNoteOnset`
 * and the web shell's `practice-scoring`) because a mode-dependent judgement
 * rule maintained in two places is a rule that will eventually differ.
 */
export function judgeForMode(
  mode: PracticeMode,
  dtSignedMs: number,
  p: JudgeProfile
): TimingJudgement {
  if (mode === 'guided') return { grade: 'perfect', score: 1, inWindow: dtSignedMs >= -p.goodMs };
  return judgeTiming(dtSignedMs, p);
}

/** Label + colour for one verdict the player can see. */
export interface JudgeTierStyle {
  /** Untranslated caps — see i18n/strings.ts "Per-note judgement vocabulary"
   *  for why the judgement vocabulary is not localized. */
  label: string;
  /** Hex, so every canvas surface and the CSS custom properties agree. */
  color: string;
}

/**
 * THE judgement vocabulary. The live chip, the lane's running panel, and the
 * result breakdown must show the same verdict in the same word and the same
 * colour — the whole point of the per-note feedback is that the player learns
 * one language. That invariant was previously asserted in three comments over
 * three hand-copied literals (one of them in `rgba()` notation, so a change
 * meant translating between colour syntaxes). It is now a single table.
 *
 * `app.css` mirrors these hexes once via `--judge-*` custom properties.
 */
export const TIMING_TIER_STYLE: Readonly<Record<TimingGrade | 'miss', JudgeTierStyle>> =
  Object.freeze({
    perfect: { label: 'PERFECT', color: '#ffe26b' },
    great: { label: 'GREAT', color: '#b6f5b3' },
    good: { label: 'GOOD', color: '#a9d4ff' },
    miss: { label: 'MISS', color: '#ff8a9a' },
  });

/** Display order, best → worst. Every surface lists the tiers in this order. */
export const TIMING_TIER_ORDER = Object.freeze([
  'perfect',
  'great',
  'good',
  'miss',
] as const satisfies readonly (TimingGrade | 'miss')[]);

/** Length verdicts get their own colour channel so a release cue never reads
 *  as a timing verdict: cyan = held it right, amber = adjust. */
export const LENGTH_TIER_STYLE: Readonly<Record<LengthGrade, JudgeTierStyle>> = Object.freeze({
  good: { label: 'GOOD', color: '#7fe9e0' },
  short: { label: 'SHORT', color: '#ffd08a' },
  long: { label: 'LONG', color: '#ffd08a' },
});

/** Chord-mate window: another note is considered the same chord if within ±this. */
export const CHORD_MATE_TOLERANCE_MS = 30;
/** Note-length floor: shortest acceptable absolute hold tolerance. */
export const DURATION_MIN_TOL_MS = 120;
/** Note-length proportional tolerance (fraction of the written duration). */
export const DURATION_TOL_FRACTION = 0.4;
/** Inherent detection lag on the mic path: the onset is reported a frame
 *  or two AFTER the physical attack (Onset AnalyserNode FFT 2048 @ 48 kHz
 *  ≈ 43 ms window + YIN's every-3rd-frame throttle). Subtracted from the
 *  elapsed clock for mic onsets so an on-the-beat press isn't judged
 *  systematically "late". MIDI presses are exact and get 0. */
export const MIC_INPUT_LATENCY_MS = 45;

// =====================================================================
// Types
// =====================================================================

export type PracticeMode = 'guided' | 'rhythm' | 'listen';
export type Hand = 'L' | 'R';
export type HandFilter = Hand | null;

/** True when the mode plays at the song's native tempo regardless of
 *  the user-selected `tempoPct` — guided is pure practice (no tempo
 *  ladder) and full-song listen plays the score end-to-end. */
export function isFixedTempoMode(mode: PracticeMode, fullSongMode: boolean): boolean {
  return mode === 'guided' || (mode === 'listen' && fullSongMode);
}

/** A single note in the section schedule. timeMs is section-relative + count-in offset. */
export interface PracticeNote {
  hand: Hand;
  midi: number;
  timeMs: number;
  durMs: number;
  measureIdx: number;
  /** When set, the next playback step is non-sequential (repeat back-jump). */
  cursorJump: number | null;
  /** Updated by matchNoteOnset when this note has been matched. */
  hit: boolean;
  /** Updated by tickPracticeMisses (rhythm mode) when the late window expires. */
  missed: boolean;
  /** One-hand mode: notes from the other hand are pre-flagged hit so the cursor advances over them. */
  _filtered: boolean;
  /** Set by matchNoteOnset on hit; finalizeNoteHold reads it for duration scoring. */
  holdStartMs?: number;
}

export interface PracticeSectionDef {
  id: string;
  startSec: number;
  endSec: number;
}

export interface PracticeSourceNote {
  hand: Hand;
  midi: number;
  timeSec: number;
  durSec: number;
  measureIdx: number;
  cursorJump: number | null;
}

export interface BuildSectionNotesOptions {
  /** 60 / 75 / 90 / 100 — applies a speed factor of 100/tempoPct. */
  tempoPct: number;
  /** Hand filter — notes from the other hand are pre-flagged hit. */
  handFilter: HandFilter;
  /** Pre-roll added to every note's timeMs so beat 1 lands at the hit line on count-in end. */
  countInMs: number;
}

export interface HandRanges {
  lhMin: number;
  lhMax: number;
  rhMin: number;
  rhMax: number;
}

export interface PracticeState {
  mode: PracticeMode;
  sectionIdx: number;
  sectionNotes: PracticeNote[];
  /** Cursor over `sectionNotes` — the next not-yet-resolved note. */
  currentNoteIdx: number;
  hits: number;
  misses: number;
  timingScoreSum: number;
  durationScoreSum: number;
  durationScoredCount: number;
  /** detectedMidi → note that's awaiting key-release for duration scoring. */
  pendingHolds: Map<number, PracticeNote>;
  sectionCombo: number;
  sectionBestCombo: number;
}

export function initPracticeState(mode: PracticeMode = 'guided'): PracticeState {
  return {
    mode,
    sectionIdx: 0,
    sectionNotes: [],
    currentNoteIdx: 0,
    hits: 0,
    misses: 0,
    timingScoreSum: 0,
    durationScoreSum: 0,
    durationScoredCount: 0,
    pendingHolds: new Map(),
    sectionCombo: 0,
    sectionBestCombo: 0,
  };
}

export function resetPracticeState(s: PracticeState): PracticeState {
  s.sectionNotes = [];
  s.currentNoteIdx = 0;
  s.hits = 0;
  s.misses = 0;
  s.timingScoreSum = 0;
  s.durationScoreSum = 0;
  s.durationScoredCount = 0;
  s.pendingHolds.clear();
  s.sectionCombo = 0;
  s.sectionBestCombo = 0;
  return s;
}

// =====================================================================
// Section construction
// =====================================================================

/**
 * Build the per-section note schedule from the source song's note list.
 *
 * - Filters to notes within [startSec, endSec) of the section.
 * - Applies tempoPct → speedFactor (tempo 60% = 1.667× wallclock per beat).
 * - Adds count-in pre-roll so beat 1 lands at the hit line on `GO!`.
 * - One-hand mode: notes from the other hand are pre-flagged `hit` and `_filtered`
 *   so the per-frame skip-past loop walks the cursor through them.
 */
export function buildSectionNotes(
  songNotes: readonly PracticeSourceNote[],
  section: PracticeSectionDef,
  opts: BuildSectionNotesOptions
): PracticeNote[] {
  const speedFactor = 100 / opts.tempoPct;
  const out: PracticeNote[] = [];
  for (const n of songNotes) {
    if (n.timeSec < section.startSec || n.timeSec >= section.endSec) continue;
    const relSec = n.timeSec - section.startSec;
    const filtered = !!opts.handFilter && n.hand !== opts.handFilter;
    out.push({
      hand: n.hand,
      midi: n.midi,
      timeMs: relSec * 1000 * speedFactor + opts.countInMs,
      durMs: n.durSec * 1000 * speedFactor,
      measureIdx: n.measureIdx,
      cursorJump: n.cursorJump,
      hit: filtered,
      missed: false,
      _filtered: filtered,
    });
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

/**
 * Per-hand MIDI range for the lane drawer. Computed once per section so the
 * hot-path doesn't re-scan every frame.
 *
 * Returns sane defaults (rh: middle-C octave, lh: octave below) if a hand has
 * no notes — one-hand mode shouldn't blow up the renderer.
 */
export function computeHandRanges(sectionNotes: readonly PracticeNote[]): HandRanges {
  let lhMin = 200,
    lhMax = 0,
    rhMin = 200,
    rhMax = 0;
  let lhCount = 0,
    rhCount = 0;
  for (const n of sectionNotes) {
    if (n.hand === 'L') {
      if (n.midi < lhMin) lhMin = n.midi;
      if (n.midi > lhMax) lhMax = n.midi;
      lhCount++;
    } else {
      if (n.midi < rhMin) rhMin = n.midi;
      if (n.midi > rhMax) rhMax = n.midi;
      rhCount++;
    }
  }
  if (rhCount === 0) {
    rhMin = 60;
    rhMax = 72;
  }
  if (lhCount === 0) {
    lhMin = 48;
    lhMax = 60;
  }
  if (rhMax <= rhMin) rhMax = rhMin + 1;
  if (lhMax <= lhMin) lhMax = lhMin + 1;
  return { lhMin, lhMax, rhMin, rhMax };
}

// =====================================================================
// Hit-window judging
// =====================================================================

export interface MatchOptions {
  /** Section-relative current time (ms), already accounting for audioOffsetMs. */
  elapsed: number;
  /** Judgement windows for the input path this press came from — pass
   *  `resolveJudgeProfile(isExactInput)`. Defaults to the mic profile (the
   *  more generous of the two) so an older caller can't accidentally judge a
   *  microphone against MIDI-grade tolerances. */
  profile?: JudgeProfile;
}

export type MatchOutcome =
  | { type: 'no-op'; reason: 'listen-mode' | 'no-section-notes' | 'all-resolved' }
  | { type: 'wrong-note'; mode: PracticeMode; detectedMidi: number; expectedMidi: number }
  | {
      type: 'hit';
      note: PracticeNote;
      matchedIdx: number;
      isChordMate: boolean;
      /** The tier shown to the player. Replaces the old `isPerfect` boolean:
       *  a single source for "how good was this press", so the tier and
       *  `timingScore` below can no longer disagree (see judgeTiming). */
      grade: TimingGrade;
      timingScore: number;
      dt: number;
      dtSigned: number;
    };

/**
 * Judge whether `detectedMidi` resolves the current expected note.
 *
 * Mutates state.sectionNotes[i].hit, state.currentNoteIdx, state.hits,
 * state.sectionCombo, state.sectionBestCombo, state.timingScoreSum, and
 * state.pendingHolds when there's a hit. No DOM, no flow nudges, no Tone.
 *
 * The caller fires UI feedback (hit chip / particle burst) and updates
 * game-state (flow, combo) based on the returned outcome.
 */
export function matchNoteOnset(
  s: PracticeState,
  detectedMidi: number,
  opts: MatchOptions,
  /** performance.now() at decision time, recorded as holdStartMs for duration scoring. */
  nowMs: number
): MatchOutcome {
  if (s.mode === 'listen') return { type: 'no-op', reason: 'listen-mode' };

  const notes = s.sectionNotes;
  if (notes.length === 0) return { type: 'no-op', reason: 'no-section-notes' };

  // Eagerly skip past already-resolved notes — a chord played within one frame
  // can otherwise leave subsequent presses pointing at an already-hit cur.
  let idx = s.currentNoteIdx;
  while (idx < notes.length && (notes[idx].hit || notes[idx].missed)) idx++;
  s.currentNoteIdx = idx;
  if (idx >= notes.length) return { type: 'no-op', reason: 'all-resolved' };

  const profile = opts.profile ?? JUDGE_PROFILE_MIC;
  const cur = notes[idx];
  const dtSigned = opts.elapsed - cur.timeMs;
  const inWindow = isTimingInWindow(s.mode, dtSigned, profile);

  // Find the matched note: first try cur, then any chord-mate within ±tolerance.
  let matched: PracticeNote | null = null;
  let matchedIdx = -1;
  let isChordMate = false;
  if (inWindow) {
    if (cur.midi === detectedMidi) {
      matched = cur;
      matchedIdx = idx;
    } else {
      for (let i = idx + 1; i < notes.length; i++) {
        const m = notes[i];
        const diff = m.timeMs - cur.timeMs;
        if (diff > CHORD_MATE_TOLERANCE_MS) break;
        if (m.hit || m.missed) continue;
        if (m.midi === detectedMidi) {
          matched = m;
          matchedIdx = i;
          isChordMate = true;
          break;
        }
      }
    }
  }

  if (!matched) {
    return {
      type: 'wrong-note',
      mode: s.mode,
      detectedMidi,
      expectedMidi: cur.midi,
    };
  }

  // Resolve the hit. Mutates state in place; emits decision details.
  const dtSignedMatched = opts.elapsed - matched.timeMs;
  const dt = Math.abs(dtSignedMatched);
  matched.hit = true;
  matched.holdStartMs = nowMs;
  s.pendingHolds.set(detectedMidi, matched);
  s.hits++;
  s.sectionCombo++;
  if (s.sectionCombo > s.sectionBestCombo) s.sectionBestCombo = s.sectionCombo;

  // One decision for tier + credit, with the mode's rule applied (judgeForMode).
  const { grade, score: timingScore } = judgeForMode(s.mode, dtSignedMatched, profile);
  s.timingScoreSum += timingScore;

  return {
    type: 'hit',
    note: matched,
    matchedIdx,
    isChordMate,
    grade,
    timingScore,
    dt,
    dtSigned: dtSignedMatched,
  };
}

// =====================================================================
// Note-length scoring (rhythm mode only)
// =====================================================================

export type FinalizeHoldResult =
  | { type: 'no-op'; reason: 'no-pending' | 'wrong-mode' | 'no-duration' }
  | { type: 'scored'; score: number; heldMs: number; expectedMs: number; tooShort: boolean };

/**
 * Called on key release. In rhythm mode, compares physical hold time to the
 * written length and returns a score in [0, 1] (1 = exact, 0 = full tolerance off).
 * Mutates state.durationScoreSum / durationScoredCount when scored.
 */
export function finalizeNoteHold(
  s: PracticeState,
  detectedMidi: number,
  nowMs: number
): FinalizeHoldResult {
  const matched = s.pendingHolds.get(detectedMidi);
  if (!matched) return { type: 'no-op', reason: 'no-pending' };
  s.pendingHolds.delete(detectedMidi);
  if (s.mode !== 'rhythm') return { type: 'no-op', reason: 'wrong-mode' };
  if (matched.holdStartMs == null || !matched.durMs) {
    return { type: 'no-op', reason: 'no-duration' };
  }

  const heldMs = nowMs - matched.holdStartMs;
  const expected = matched.durMs;
  const tol = Math.max(DURATION_MIN_TOL_MS, expected * DURATION_TOL_FRACTION);
  const score = Math.max(0, 1 - Math.abs(heldMs - expected) / tol);
  s.durationScoreSum += score;
  s.durationScoredCount++;
  return { type: 'scored', score, heldMs, expectedMs: expected, tooShort: heldMs < expected };
}

// =====================================================================
// Per-note release (note-length) verdict
// =====================================================================
// The timing half of the per-note feedback lives in the judgement section at
// the top of this file. This is its release-time sibling: the second graded
// dimension the result reports, turned into a live per-note verdict so the
// learner sees HOW they did on each note, not just "right / wrong".

/** A release's note-length verdict. `good` = held about the written length;
 *  `short` / `long` name the direction to adjust. Positive-inclusive — a good
 *  hold is celebrated, not just off-length ones flagged. */
export type LengthGrade = 'good' | 'short' | 'long';

/**
 * Grade how long a note was held vs its written length. `tolMs` is the same
 * tolerance the duration score uses; `goodFrac` (default 0.5) is how much of
 * that tolerance still counts as "good" so the positive band is meaningfully
 * reachable (a kid doesn't need frame-perfect holds to feel success).
 */
export function resolveLengthGrade(
  heldMs: number,
  expectedMs: number,
  tolMs: number,
  goodFrac: number = 0.5
): LengthGrade {
  const diff = heldMs - expectedMs;
  if (Math.abs(diff) <= Math.max(0, tolMs) * goodFrac) return 'good';
  return diff < 0 ? 'short' : 'long';
}

// =====================================================================
// Judgement tally — one source of truth for the live HUD and the result
// =====================================================================
// The grades above were previously used ONLY to pick a chip colour, then
// thrown away. The section result reported a different set of numbers
// (continuous score sums → accuracy / timing / note-length percentages), so
// what the player SAW note by note and what the result told them afterwards
// had no relationship: 30 chips of feedback collapsed into "Timing 78%" with
// no breakdown and no direction.
//
// The rhythm-game convention is the opposite: the live HUD shows a running
// judgement counter, and the result screen is that same counter plus a
// timing-deviation read-out (beatmania's FAST/SLOW counts, osu!'s mean
// error / unstable rate, DDR's per-tier tally). This tally is that counter.
// It is fed by the same resolve*Grade calls that drive the chips, so live and
// result can never disagree, and it is the only place either surface reads.

/** Running per-note judgement counts + timing-deviation accumulators for one
 *  section attempt. Counts mirror the grades the player was shown. */
export interface JudgeTally {
  perfect: number;
  great: number;
  good: number;
  /** Notes whose window expired unplayed (rhythm mode auto-miss). */
  miss: number;
  /** Σ signed offset (ms, + = pressed late) over graded presses. With the
   *  count below this gives the MEAN error — the direction signal that the
   *  tiers deliberately no longer carry. */
  dtSumMs: number;
  /** Σ |offset| (ms). Mean absolute error — how tight, direction-free. */
  dtAbsSumMs: number;
  /** Σ offset² (ms²). With the sum and count this gives the standard
   *  deviation, i.e. osu!'s unstable rate (UR = stdev × 10) — the genre's
   *  headline consistency number. Accumulating the square keeps the whole
   *  distribution summary O(1) in memory. */
  dtSqSumMs: number;
  /** Release (note-length) verdicts. */
  holdGood: number;
  holdShort: number;
  holdLong: number;
}

/** Fresh zeroed tally. */
export function createJudgeTally(): JudgeTally {
  return {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    dtSumMs: 0,
    dtAbsSumMs: 0,
    dtSqSumMs: 0,
    holdGood: 0,
    holdShort: 0,
    holdLong: 0,
  };
}

/** Zero a tally IN PLACE. Section restarts reuse the same object so the
 *  hot-path writes never trigger a V8 hidden-class transition mid-section. */
export function resetJudgeTally(t: JudgeTally): void {
  t.perfect = 0;
  t.great = 0;
  t.good = 0;
  t.miss = 0;
  t.dtSumMs = 0;
  t.dtAbsSumMs = 0;
  t.dtSqSumMs = 0;
  t.holdGood = 0;
  t.holdShort = 0;
  t.holdLong = 0;
}

/** Record one graded press. `dtSignedMs` is the same offset that produced
 *  `grade` (+ = late), so the deviation stats stay consistent with the tiers.
 *  Guided mode grades every press `perfect` with dt 0 — harmless, and it keeps
 *  the counter meaningful there too ("you played N notes"). */
export function recordTimingJudgement(t: JudgeTally, grade: TimingGrade, dtSignedMs: number): void {
  t[grade]++;
  t.dtSumMs += dtSignedMs;
  t.dtAbsSumMs += Math.abs(dtSignedMs);
  t.dtSqSumMs += dtSignedMs * dtSignedMs;
}

/** Graded presses in a tally — the divisor for every deviation statistic, and
 *  the numerator of the live accuracy read-out. Exported because the lane needs
 *  it every frame and `summarizeJudgements` allocates. */
export function judgeHits(t: JudgeTally): number {
  return t.perfect + t.great + t.good;
}

/** Record one release verdict. */
export function recordLengthJudgement(t: JudgeTally, grade: LengthGrade): void {
  if (grade === 'good') t.holdGood++;
  else if (grade === 'short') t.holdShort++;
  else t.holdLong++;
}

/** Record an auto-miss (window expired with the note unplayed). */
export function recordMissJudgement(t: JudgeTally): void {
  t.miss++;
}

/** Below this many graded presses no tendency is claimed — two notes can't
 *  establish that someone "leans late". */
export const JUDGE_TENDENCY_MIN_SAMPLES = 4;
/** Mean offsets smaller than this are human jitter, not a lean. Roughly the
 *  perceptual floor for rhythmic asynchrony, and comfortably inside the
 *  PERFECT window so a clean run never gets told to adjust. */
export const JUDGE_TENDENCY_MIN_MS = 25;
/** A lean this large is worth naming as a SETUP problem rather than a technique
 *  habit — it is most of the MIDI GREAT band. */
export const JUDGE_SETUP_SUSPECT_MS = 60;
/** …but only when the presses cluster tightly on one side. |mean| / meanAbs
 *  approaches 1 when every error points the same way (a constant offset) and
 *  falls toward 0 when they scatter (genuine unsteadiness). */
export const JUDGE_SETUP_CONSISTENCY = 0.8;

/** Derived read-out for both the live HUD and the result card.
 *
 *  Deliberately narrow: it reports only figures that a surface actually shows.
 *  It used to also carry `accPct` (= hits/judged), which collided with the
 *  result headline's accuracy (= hits/section target) — two different numbers
 *  under one name, in a change whose entire purpose was that the live panel and
 *  the result card cannot disagree. Accuracy is now defined once, by its
 *  consumer, from `hits` / `judged`. */
export interface JudgeSummary {
  /** Graded presses (perfect + great + good). */
  hits: number;
  /** Notes that got any verdict at all (hits + miss). */
  judged: number;
  /** Mean signed offset (ms, + = late), or null below the sample floor. This
   *  and `stdevMs` are where DIRECTION lives now that the tiers carry only
   *  quality — the aggregate distribution, not a per-note indicator. */
  meanDtMs: number | null;
  /** Standard deviation of the offsets (ms), or null below the sample floor.
   *  The genre's consistency measure — osu!'s unstable rate is this × 10. */
  stdevMs: number | null;
  /** Which way the presses leaned. 'even' when inside the jitter threshold
   *  or below the sample floor — never guessed. */
  tendency: 'early' | 'late' | 'even';
  /** Release verdicts recorded. */
  holds: number;
  /** Dominant hold error, or 'even' when neither side is established. */
  holdTendency: 'short' | 'long' | 'even';
  /**
   * The lean looks like a SETUP problem, not a technique habit: it is large
   * AND almost every press missed the same way.
   *
   * Two settings can produce exactly this signature. Output latency is
   * compensated by a single auto-detected `audioOffsetMs`, which is wrong by
   * tens of milliseconds on Bluetooth output; and note-fall speed shifts when
   * the player *reads* the note, which beatmania's own guide treats as the
   * FIRST thing to adjust when the early/late balance is skewed (scroll speed
   * before offset). Either way the whole error lands on the player as a
   * uniform lean, and coaching them to "press a little sooner" would be
   * teaching them to compensate for our configuration rather than to play in
   * time. When this is set, the result points at those two settings instead —
   * in that order.
   */
  looksLikeSetupIssue: boolean;
}

/**
 * Summarize a tally. Pure. `opts` exposes the thresholds so tests (and any
 * future tuning) can move them without touching call sites.
 */
export function summarizeJudgements(
  t: JudgeTally,
  opts: {
    tendencyMinMs?: number;
    minSamples?: number;
    setupSuspectMs?: number;
    setupConsistency?: number;
  } = {}
): JudgeSummary {
  const tendencyMinMs = opts.tendencyMinMs ?? JUDGE_TENDENCY_MIN_MS;
  const minSamples = opts.minSamples ?? JUDGE_TENDENCY_MIN_SAMPLES;

  const hits = judgeHits(t);
  const judged = hits + t.miss;

  // Every graded press writes all three accumulators, so `hits` IS the sample
  // count — a separate counter would just be a second thing to keep in step.
  const enoughSamples = hits >= minSamples;
  const meanDtMs = enoughSamples ? t.dtSumMs / hits : null;
  const meanAbsDtMs = enoughSamples ? t.dtAbsSumMs / hits : null;
  // Population stdev from the running sums: E[x²] − E[x]². Clamped at 0
  // because floating-point cancellation can push a near-zero variance
  // slightly negative when every press landed on the same offset.
  const stdevMs =
    enoughSamples && meanDtMs != null
      ? Math.sqrt(Math.max(0, t.dtSqSumMs / hits - meanDtMs * meanDtMs))
      : null;

  let tendency: JudgeSummary['tendency'] = 'even';
  if (meanDtMs != null && Math.abs(meanDtMs) >= tendencyMinMs) {
    tendency = meanDtMs > 0 ? 'late' : 'early';
  }

  // Setup signature: a big lean whose errors nearly all point the same way.
  // |mean| / meanAbs is the consistency ratio (1 = every press off by the same
  // amount in the same direction).
  const consistency =
    meanDtMs != null && meanAbsDtMs != null && meanAbsDtMs > 0
      ? Math.abs(meanDtMs) / meanAbsDtMs
      : 0;
  const looksLikeSetupIssue =
    tendency !== 'even' &&
    meanDtMs != null &&
    Math.abs(meanDtMs) >= (opts.setupSuspectMs ?? JUDGE_SETUP_SUSPECT_MS) &&
    consistency >= (opts.setupConsistency ?? JUDGE_SETUP_CONSISTENCY);

  const holds = t.holdGood + t.holdShort + t.holdLong;
  let holdTendency: JudgeSummary['holdTendency'] = 'even';
  if (t.holdShort >= 2 && t.holdShort > t.holdLong) holdTendency = 'short';
  else if (t.holdLong >= 2 && t.holdLong > t.holdShort) holdTendency = 'long';

  return {
    hits,
    judged,
    meanDtMs,
    stdevMs,
    tendency,
    holds,
    holdTendency,
    looksLikeSetupIssue,
  };
}

// =====================================================================
// Hit-error ring — the live direction feedback
// =====================================================================
// Recent signed offsets, for the hit-error bar the lane draws under the hit
// line: a centred scale with the tier bands marked and a fading tick per
// recent press.
//
// This is osu!'s hit-error bar, and it is DELIBERATELY not a discrete
// early/late indicator. Two reasons. First, a distribution teaches more than a
// label: a player sees at a glance whether their presses are centred, biased,
// or merely scattered, which a per-note "EARLY" cannot express. Second,
// Konami holds a patent on fast/slow indicators — DJMAX removed its own
// implementation over it — so a discrete early/late readout is a form worth
// staying away from in a shipping app.
//
// Fixed-size ring, written on the hot path, so no allocation per press.

/** Number of recent presses the error bar shows. ~2 bars of sixteenths. */
export const JUDGE_ERROR_RING_LEN = 32;

/** Recent signed offsets (ms, + = late). `len` counts how much of `buf` is
 *  populated; `idx` is the next write slot. Read newest-first by walking
 *  backwards from `idx`. */
export interface JudgeErrorRing {
  buf: Float32Array;
  idx: number;
  len: number;
}

export function createJudgeErrorRing(size: number = JUDGE_ERROR_RING_LEN): JudgeErrorRing {
  return { buf: new Float32Array(Math.max(1, size)), idx: 0, len: 0 };
}

/** Empty the ring IN PLACE (section restart). Keeps the same buffer. */
export function resetJudgeErrorRing(r: JudgeErrorRing): void {
  r.idx = 0;
  r.len = 0;
}

export function pushJudgeError(r: JudgeErrorRing, dtSignedMs: number): void {
  r.buf[r.idx] = dtSignedMs;
  r.idx = (r.idx + 1) % r.buf.length;
  if (r.len < r.buf.length) r.len++;
}

/** Walk the ring newest-first. `age` is 0 for the newest entry up to len-1 for
 *  the oldest, so callers can fade by recency without storing timestamps. */
export function forEachJudgeError(
  r: JudgeErrorRing,
  fn: (dtSignedMs: number, age: number) => void
): void {
  for (let age = 0; age < r.len; age++) {
    const i = (r.idx - 1 - age + r.buf.length * 2) % r.buf.length;
    fn(r.buf[i], age);
  }
}

// =====================================================================
// Star tier evaluation
// =====================================================================

export interface StarTier {
  stars: number;
  acc: number;
  timing: number;
  /** Threshold for note-length percentage; ignored if durPct is null. */
  dur: number;
}

// Kid-9-12-tuned thresholds (research-aligned: Dweck process-praise +
// SDT competence + Csikszentmihalyi flow). ★3 is reachable with 5-10
// focused attempts (not a perfectionist grind). ★2 introduces a gentle
// timing requirement so rhythm is taught before ★3 demands it, instead
// of springing 70% timing on the kid out of nowhere. ★1 stays at 50%
// accuracy so the section-unlock gate still implies real playing.
// Timing thresholds are anchored to the judgeTiming tier weights (2026-07-25).
// The old 60 / 30 were calibrated against `1 - |dt| / 350`, a curve so flat
// that a learner dragging ~120 ms scored 63 % and cleared the ★3 timing gate —
// so ★3 said nothing about timing at all, and accuracy was the only real
// constraint. Timing credit is now the tier weight (TIER_SCORE), which is how
// the genre computes accuracy.
// Simulated over normal-distributed players (mean lean × jitter), on BOTH
// input profiles at default strictness:
//   steady ±30 ms  → 99-100 %  |  dragging +120 ms → 66-73 %
//   average +40 ms → 87-94 %   |  unsteady σ140    → 73-78 %
// ★3 timing 85 admits the first two on either path and holds back the last
// two; ★2 timing 55 still admits everyone who actually played the section, so
// "cleared" stays reachable (banned-list: no punitive gating). Stored stars are
// non-decreasing, so no existing progress is lost by this change.
export const STAR_TIERS: readonly StarTier[] = Object.freeze([
  Object.freeze({ stars: 3, acc: 85, timing: 85, dur: 55 }),
  Object.freeze({ stars: 2, acc: 70, timing: 55, dur: 45 }),
  Object.freeze({ stars: 1, acc: 50, timing: 0, dur: 0 }),
]);

/**
 * Pick the highest tier where all percentages clear the threshold.
 * `durPct` is null in guided mode (no audio clock to score length against).
 */
export function computeStars(
  accPct: number,
  timingPct: number,
  durPct: number | null,
  tiers: readonly StarTier[] = STAR_TIERS
): number {
  const tier = tiers.find(
    (t) => accPct >= t.acc && timingPct >= t.timing && (durPct == null || durPct >= t.dur)
  );
  return tier ? tier.stars : 0;
}

// =====================================================================
// Result-screen tier + unlock gating
// =====================================================================

/** i18n key pairs for the result-screen banner — index = star count (0..3).
 *  Listen mode bypasses these entirely; the caller renders 'listenedTitle'
 *  / 'listenedMsg' instead. */
export const RESULT_TIER_KEYS: ReadonlyArray<{ titleKey: string; msgKey: string }> = Object.freeze([
  Object.freeze({ titleKey: 'tier0Title', msgKey: 'tier0Msg' }),
  Object.freeze({ titleKey: 'tier1Title', msgKey: 'tier1Msg' }),
  Object.freeze({ titleKey: 'tier2Title', msgKey: 'tier2Msg' }),
  Object.freeze({ titleKey: 'tier3Title', msgKey: 'tier3Msg' }),
]);

/** Pick the title/msg keys for a given star count. Stars are clamped to
 *  0..3 (legacy callers used Math.max(0, Math.min(3, stars)) inline). */
export function resolveResultTier(stars: number): { titleKey: string; msgKey: string } {
  const idx = Math.max(0, Math.min(RESULT_TIER_KEYS.length - 1, stars | 0));
  return RESULT_TIER_KEYS[idx];
}

// =====================================================================
// Section-result coaching (Knowledge of Performance)
// =====================================================================

/** Which scored dimension the next-step tip is about. Maps 1:1 to a
 *  result-card stat row so the UI can emphasise the matching number. */
export type SectionFocusDim = 'accuracy' | 'timing' | 'duration';

export interface SectionFocus {
  /** i18n key naming a genuine strength to lead with (process-praise,
   *  competence-protecting). 'sfEffort' when nothing cleared the floor. */
  strengthKey: string;
  /** i18n key for the one specific, actionable next-step strategy. */
  focusKey: string;
  /** Which stat row the focus refers to — for the UI emphasis. */
  focusDim: SectionFocusDim;
}

/** A dimension is only NAMED as a strength above this score; below it the
 *  praise would outrun reality, so we fall back to effort. Sits between the
 *  ★1 (50%) and ★2 (70%) accuracy gates — "clearly more right than wrong". */
export const SECTION_FOCUS_STRENGTH_FLOOR = 55;

/** Below this accuracy too many notes are still being missed for a
 *  timing/length tip to be the right next step — notes come first. Matches
 *  the ★2 accuracy gate. */
const SECTION_FOCUS_NOTES_FIRST_BELOW = 70;

const SECTION_FOCUS_STRENGTH_KEYS: Readonly<Record<SectionFocusDim, string>> = Object.freeze({
  accuracy: 'sfNotesStrong',
  timing: 'sfTimingStrong',
  duration: 'sfHoldStrong',
});

const SECTION_FOCUS_NEXT_KEYS: Readonly<Record<SectionFocusDim, string>> = Object.freeze({
  accuracy: 'fNotes',
  timing: 'fTiming',
  duration: 'fHold',
});

/**
 * Knowledge-of-Performance coach for the section result card: pair one
 * genuine strength with one specific next-step, derived from the already-
 * computed accuracy / timing / note-length percentages. Returns i18n keys
 * (caller localises) plus which stat row to emphasise.
 *
 * Research basis:
 *  - KP > KR for multi-dimensional motor tasks (Soares-Frazão et al.,
 *    systematic review, Int Rev Sport & Exercise Psych 2021): telling the
 *    kid *what about the playing* to work on beats showing only the
 *    outcome stars. Piano is multi-dimensional (pitch + time + length).
 *  - Pair the growth area with a real strength (EEF 2019: "not yet" alone
 *    failed — the specific strategy carries the effect; Mueller & Dweck
 *    1998 process-praise; SDT competence need).
 *  - Faded feedback (guidance hypothesis — Salmoni 1984 / Schmidt 1991):
 *    a clean ★3 run returns null so augmented feedback can't breed
 *    dependence — the kid celebrates, not gets coached.
 *  - Calibrated honesty (self-assessment accuracy, Frontiers 2025): a
 *    dimension is praised by name only when it clears a floor; otherwise
 *    the strength is effort-based so the praise stays truthful.
 *
 * `durPct` is null in guided mode, but guided never renders the scored
 * card; rhythm-mode callers always pass a number.
 */
export function pickSectionFocus(
  accPct: number,
  timingPct: number,
  durPct: number | null,
  stars: number
): SectionFocus | null {
  if (stars >= 3) return null;

  // Measured dimensions, most-fundamental first (drives tie-breaks).
  const dims: Array<{ dim: SectionFocusDim; score: number }> = [
    { dim: 'accuracy', score: accPct },
    { dim: 'timing', score: timingPct },
  ];
  if (durPct != null) dims.push({ dim: 'duration', score: durPct });

  // Focus = weakest dimension; strict-less-than keeps the earlier (more
  // fundamental) axis on ties.
  let focus = dims[0];
  for (const d of dims) if (d.score < focus.score) focus = d;
  // Fundamentals override: you can't fix timing/length on notes you aren't
  // hitting yet, so a low hit rate always routes to the notes tip.
  if (accPct < SECTION_FOCUS_NOTES_FIRST_BELOW) focus = dims[0];

  // Strength = strongest dimension that ISN'T the focus, named only if it
  // clears the honesty floor; else lead with effort.
  let strengthDim: SectionFocusDim | null = null;
  let best = -1;
  for (const d of dims) {
    if (d.dim === focus.dim) continue;
    if (d.score > best) {
      best = d.score;
      strengthDim = d.dim;
    }
  }
  const strengthKey =
    strengthDim != null && best >= SECTION_FOCUS_STRENGTH_FLOOR
      ? SECTION_FOCUS_STRENGTH_KEYS[strengthDim]
      : 'sfEffort';

  return { strengthKey, focusKey: SECTION_FOCUS_NEXT_KEYS[focus.dim], focusDim: focus.dim };
}

/**
 * Pre-flight scaffold decision (feed-forward — Hattie & Timperley 2007's
 * "where to next?"). A section whose recent attempts ended in a run of misses
 * is offered the Listen-first nudge BEFORE the next try, not only after
 * failing again — scaffolding ahead of failure instead of reacting to it.
 *
 * Mirrors the result-card escalation threshold (a trailing 0-star run ≥ 2).
 * Clears itself the moment the kid earns a star (the trailing run resets), so
 * the nudge only shows while genuinely stuck. `historyStars` is the
 * per-section attempt star sequence, oldest → newest.
 */
export function needsPreflightScaffold(historyStars: readonly number[], minStreak = 2): boolean {
  let streak = 0;
  for (let i = historyStars.length - 1; i >= 0; i--) {
    if (historyStars[i] === 0) streak++;
    else break;
  }
  return streak >= minStreak;
}

/** Which strategy the pre-flight nudge suggests. `listen` is the low-friction
 *  first step; deeper struggle escalates to a strategy matched to the weakest
 *  axis of the most recent attempt. */
export type ScaffoldStrategy = 'listen' | 'oneHand' | 'slowTempo';

export interface ScaffoldPlan {
  /** Whether to show the nudge at all (trailing 0-star run ≥ minStreak). */
  show: boolean;
  /** Trailing 0-star run length — the struggle depth. */
  depth: number;
  /** Suggested strategy (only meaningful when `show`). */
  strategy: ScaffoldStrategy;
}

/** Struggle depth at or beyond which the nudge escalates from "just listen"
 *  to a concrete practice strategy. */
export const SCAFFOLD_ESCALATE_DEPTH = 3;
/** Accuracy below this on the latest attempt routes the escalation to
 *  one-hand practice (notes are the bottleneck); at/above it, to slower tempo
 *  (timing is the bottleneck). Matches the ★2 accuracy gate. */
export const SCAFFOLD_NOTES_BOTTLENECK_BELOW = 70;

/**
 * Adaptive pre-flight scaffold (feed-forward that escalates with need —
 * Wood/Bruner/Ross 1976 scaffolding: more support the more the learner
 * struggles, faded as they cope). A shallow struggle gets the low-friction
 * "just listen" nudge; a deeper run escalates to the strategy matched to the
 * latest attempt's weakest axis — one-hand when notes are still being missed
 * (more fundamental), slower tempo when notes land but timing doesn't.
 *
 * `history` is the per-section attempt list, oldest → newest, each carrying
 * accuracy `a` and stars `s` (timing/duration aren't stored per attempt).
 */
export function planSectionScaffold(
  history: ReadonlyArray<{ a: number; s: number }>,
  minStreak = 2
): ScaffoldPlan {
  const stars = history.map((h) => h.s);
  const show = needsPreflightScaffold(stars, minStreak);
  let depth = 0;
  for (let i = stars.length - 1; i >= 0; i--) {
    if (stars[i] === 0) depth++;
    else break;
  }
  let strategy: ScaffoldStrategy = 'listen';
  if (show && depth >= SCAFFOLD_ESCALATE_DEPTH) {
    const last = history[history.length - 1];
    strategy = (last?.a ?? 100) < SCAFFOLD_NOTES_BOTTLENECK_BELOW ? 'oneHand' : 'slowTempo';
  }
  return { show, depth, strategy };
}

/** Tempo speeds the practice flow gates: a section cleared at one tempo
 *  unlocks the next one (gated on stars >= 2). 50 + 60 are unlocked from
 *  the start (slowing down is support, not a reward); 75/90/100 are the
 *  earned speed-up ladder. */
export const TEMPO_TIERS: readonly number[] = Object.freeze([50, 60, 75, 90, 100]);

/**
 * Speed-trainer step: after a section is CLEARED, what tempo tier should the
 * "🚀 try the next speed" button on the result card offer?
 *
 * Pure. Returns the next tier up when the kid earned it (stars >= 2, same gate
 * as `computeUnlocks` uses to unlock a tempo) AND the current tempo is a known
 * tier below the top of the ladder. Returns null at 100% (top — celebrate,
 * don't push) or below ★2 (not earned yet). This drives the *guided* half of
 * the speed trainer: `computeUnlocks` already UNLOCKS the tier in the selector;
 * this hands the kid a one-tap way to climb the "slow → full speed" ladder
 * without walking back to the song panel. Achievement-gated, no time pressure
 * (banned-list safe).
 */
export function planTempoStepUp(
  currentTempoPct: number,
  stars: number,
  tiers: readonly number[] = TEMPO_TIERS
): number | null {
  if (stars < 2) return null;
  const idx = tiers.indexOf(currentTempoPct);
  if (idx < 0 || idx >= tiers.length - 1) return null;
  return tiers[idx + 1];
}

export interface UnlockComputeInput {
  stars: number;
  /** Tempo % at which this section was just played (e.g. 60, 75, 90, 100). */
  tempoPct: number;
  /** Section just completed (e.g. 'A1'). */
  sectionId: string;
  /** Section IDs in play order — caller passes the SECTION_IDS const. */
  sectionIds: readonly string[];
  /** id → nameKey map for the current song's sections. Used to surface the
   *  next-section's localizable label without coupling the core to the song
   *  schema. */
  sectionNameKeys: Readonly<Record<string, string>>;
  /** Tempos already unlocked for this song. Read-only here; caller mutates
   *  after applying the result. */
  unlockedTempos: Readonly<Record<number, boolean>>;
  /** Sections already unlocked. Read-only here; caller mutates. */
  unlockedSections: Readonly<Record<string, boolean>>;
  /** Practice-day streak count (e.g. progress.streakCount). */
  streakCount: number;
  /** Optional override for the streak milestones that fire a celebration.
   *  Defaults to 3 and 7 days (matching the legacy behavior). */
  streakMilestones?: readonly number[];
}

export interface UnlockComputeResult {
  /** New tempo unlocked, or null. */
  unlockedTempo: number | null;
  /** Next section's i18n nameKey, or null when no section unlocked. */
  unlockedSecKey: string | null;
  /** Streak milestone reached this session (e.g. 3 or 7), or null. */
  streakDays: number | null;
}

const DEFAULT_STREAK_MILESTONES: readonly number[] = Object.freeze([3, 7]);

/**
 * Pure: given the result of a section, determine which gates fire.
 *
 * Stars >= 2 unlocks the next tempo tier (if any).
 * Stars >= 1 unlocks the next section (if any).
 * Streak count hitting a milestone (default: 3 or 7) fires a celebration.
 *
 * Caller persists the unlocks by mutating the song-progress record.
 */
export function computeUnlocks(input: UnlockComputeInput): UnlockComputeResult {
  let unlockedTempo: number | null = null;
  let unlockedSecKey: string | null = null;
  let streakDays: number | null = null;

  if (input.stars >= 2) {
    const idx = TEMPO_TIERS.indexOf(input.tempoPct);
    if (idx >= 0 && idx < TEMPO_TIERS.length - 1) {
      const next = TEMPO_TIERS[idx + 1];
      if (!input.unlockedTempos[next]) unlockedTempo = next;
    }
  }

  if (input.stars >= 1) {
    const sIdx = input.sectionIds.indexOf(input.sectionId);
    if (sIdx >= 0 && sIdx < input.sectionIds.length - 1) {
      const next = input.sectionIds[sIdx + 1];
      if (!input.unlockedSections[next]) {
        const nameKey = input.sectionNameKeys[next];
        if (nameKey) unlockedSecKey = nameKey;
      }
    }
  }

  const milestones = input.streakMilestones ?? DEFAULT_STREAK_MILESTONES;
  if (milestones.indexOf(input.streakCount) !== -1) {
    streakDays = input.streakCount;
  }

  return { unlockedTempo, unlockedSecKey, streakDays };
}

// =====================================================================
// Tempo / count-in / lane-lookahead derivations
// =====================================================================

/** Milliseconds per beat at the given BPM and tempo percent.
 *  Caller resolves bpm (defaults to 72 in legacy app.js) and tempoPct
 *  (defaults to 100). Pure: just unit math. */
export function practiceBeatMs(bpm: number, tempoPct: number): number {
  const safeBpm = bpm > 0 ? bpm : 72;
  const safeTempo = tempoPct > 0 ? tempoPct : 100;
  return (60000 / safeBpm) * (100 / safeTempo);
}

export interface PracticeTimings {
  /** Count-in length in ms — clamped to a usable range so very slow songs
   *  don't have a 30-second pre-roll and very fast ones aren't rushed.
   *  Always an integer multiple of the click interval (= beats × clickMs)
   *  so the count-in clicks land exactly on the song's beat grid. */
  countInMs: number;
  /** How far ahead in time the lane shows. We mirror count-in so falling
   *  notes traverse the lane during the count-in animation. */
  laneLookaheadMs: number;
  /** Number of count-in clicks. Normally 4, but the clamp is absorbed
   *  here (not by squeezing 4 clicks into a fixed window) so each click
   *  stays one real beat apart — a fast song counts in more beats, a
   *  slow song fewer, but always at the true tempo. 拍子指定時は
   *  「1 小節あたりのクリック数 × 整数小節数」。 */
  beats: number;
  /** クリック 1 個分の間隔 ms（= countInMs / beats）。拍子指定時は
   *  拍単位（複合拍子は付点四分）。従来経路では四分音符 = beatMs。 */
  clickMs?: number;
  /** 拍子指定時のみ: 1 小節あたりのクリック数（アクセント周期）。 */
  clicksPerBar?: number;
}

/** カウントインを組み立てる拍子（楽譜の time signature）。 */
export interface PracticeTimingMeter {
  /** 拍子分子。 */
  beats: number;
  /** 拍子分母（beat-type）。 */
  beatType: number;
}

export interface PracticeTimingOptions {
  /** Lower clamp on count-in. Default 2400 ms (~4 beats at 100 BPM). */
  minCountInMs?: number;
  /** Upper clamp on count-in. Default 7000 ms. */
  maxCountInMs?: number;
  /** Target beats counted in. Default 4 (standard musical count-in).
   *  The actual beat count may grow/shrink to keep the total in the
   *  clamp window while preserving the real beat interval. */
  countInBeats?: number;
  /** 楽譜の拍子。指定時はカウントインを「拍子ちょうど整数小節」で組む
   *  （クリック間隔は拍単位 — 複合拍子は付点四分、3/8 は 1 拍/小節）。
   *  クランプ [min, max] は小節数で吸収する（1 小節が max を超える極端な
   *  遅さのときだけ 1 小節を優先して max を超える）。省略時は従来の
   *  四分音符 4 拍ターゲット（後方互換 — 既存テストの挙動そのまま）。 */
  meter?: PracticeTimingMeter;
}

/** Derive count-in + lane-lookahead from a beat length. Used by
 *  recomputePracticeTimings() in the legacy app whenever tempoPct or
 *  the song's BPM changes.
 *
 *  Clamp semantics: instead of squeezing a fixed 4 clicks into the
 *  [lo, hi] window (which desynced the click interval from the song's
 *  tempo whenever 4×beatMs fell outside the window), we keep the click
 *  interval equal to `beatMs` and pick the beat COUNT that lands the
 *  total inside [lo, hi] as close to the target (4) as possible. */
/** Hard cap on count-in clicks. Real music (bpm ≤ ~208, tempo ≥ 50%)
 *  needs ≤ ~9 beats to fill the clamp window; this only bites on a
 *  malformed import with an absurd `<sound tempo>` (e.g. 9999), which
 *  would otherwise schedule hundreds of near-continuous clicks. */
export const MAX_COUNT_IN_BEATS = 16;

export function computePracticeTimings(
  beatMs: number,
  opts: PracticeTimingOptions = {}
): PracticeTimings {
  const target = opts.countInBeats ?? 4;
  const lo = opts.minCountInMs ?? 2400;
  const hi = opts.maxCountInMs ?? 7000;
  const safeBeat = beatMs > 0 ? beatMs : 1;

  // 拍子指定時: カウントイン = 拍子ちょうど整数小節（業界標準 —
  // SmartMusic / Synthesia は完全小節ぶん数える）。クリック間隔は
  // 拍単位（複合拍子は付点四分）、クランプは小節数で吸収する。
  const meter = opts.meter;
  if (meter && meter.beats > 0 && meter.beatType > 0) {
    const info = meterBeatInfo(meter.beats, meter.beatType);
    // 病的な拍子（分子がクリック上限超え）は従来ロジックへフォールバック。
    if (info.clicksPerBar <= MAX_COUNT_IN_BEATS) {
      const clickMs = safeBeat * info.clickQuarters;
      const barMs = info.clicksPerBar * clickMs;
      // 下限を満たす最小の小節数（4/4 で 72BPM→1 小節、120BPM→2 小節、
      // 3/8 の短い小節→2 小節…）。上限クランプとクリック総数上限
      // （MAX_COUNT_IN_BEATS）は小節数を削って吸収し、最低 1 小節は保つ。
      const minBars = Math.max(1, Math.ceil(lo / barMs - 1e-9));
      const maxBarsByClamp = Math.max(1, Math.floor(hi / barMs + 1e-9));
      const maxBarsByCap = Math.max(1, Math.floor(MAX_COUNT_IN_BEATS / info.clicksPerBar));
      const bars = Math.max(1, Math.min(minBars, maxBarsByClamp, maxBarsByCap));
      const beats = info.clicksPerBar * bars;
      const countInMs = Math.round(beats * clickMs);
      return {
        countInMs,
        laneLookaheadMs: countInMs,
        beats,
        clickMs,
        clicksPerBar: info.clicksPerBar,
      };
    }
  }

  const minBeats = Math.max(1, Math.ceil(lo / safeBeat));
  const maxBeats = Math.max(1, Math.floor(hi / safeBeat));
  // When the window is narrower than a single beat (very slow tempo),
  // minBeats can exceed maxBeats — prefer staying under the upper clamp.
  const raw = minBeats > maxBeats ? maxBeats : Math.max(minBeats, Math.min(maxBeats, target));
  // Cap so a pathological (very fast) beatMs can't schedule hundreds of
  // clicks. The click interval stays == beatMs (countInMs = beats*beatMs),
  // just with fewer beats than the floor would nominally want.
  const beats = Math.max(1, Math.min(MAX_COUNT_IN_BEATS, raw));
  const countInMs = Math.round(beats * safeBeat);
  return { countInMs, laneLookaheadMs: countInMs, beats, clickMs: safeBeat };
}

// =====================================================================
// Clock
// =====================================================================

/**
 * Single source of truth for "how far into the practice are we".
 * - Rhythm/Listen: real elapsed (already audio-offset-compensated by the caller).
 * - Guided: real time during count-in so animation runs, then frozen at the
 *   current note's timeMs so the lane shows the next-up note parked at the hit
 *   line — moves only when the kid plays correctly and currentNoteIdx advances.
 */
export function practiceElapsedMs(
  s: PracticeState,
  realElapsed: number,
  countInMs: number
): number {
  if (s.mode === 'guided') {
    if (realElapsed < countInMs) return realElapsed;
    const cur = s.sectionNotes[s.currentNoteIdx];
    return cur ? cur.timeMs : countInMs;
  }
  return realElapsed;
}
