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

// =====================================================================
// Hit-window tuning constants (asymmetric: early presses punished harder).
// =====================================================================

/** Press tolerated before cur.timeMs (anticipation side). */
export const HIT_WINDOW_EARLY_MS = 120;
/** Press tolerated after cur.timeMs (reaction side). Wider than early on purpose. */
export const HIT_WINDOW_MS = 350;
/** |dt| ≤ this counts as PERFECT on both sides. */
export const PERFECT_MS = 90;
/** Chord-mate window: another note is considered the same chord if within ±this. */
export const CHORD_MATE_TOLERANCE_MS = 30;
/** Note-length floor: shortest acceptable absolute hold tolerance. */
export const DURATION_MIN_TOL_MS = 120;
/** Note-length proportional tolerance (fraction of the written duration). */
export const DURATION_TOL_FRACTION = 0.4;

// =====================================================================
// Types
// =====================================================================

export type PracticeMode = 'guided' | 'rhythm' | 'listen';
export type Hand = 'L' | 'R';
export type HandFilter = Hand | null;

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
}

export type MatchOutcome =
  | { type: 'no-op'; reason: 'listen-mode' | 'no-section-notes' | 'all-resolved' }
  | { type: 'wrong-note'; mode: PracticeMode; detectedMidi: number; expectedMidi: number }
  | {
      type: 'hit';
      note: PracticeNote;
      matchedIdx: number;
      isChordMate: boolean;
      isPerfect: boolean;
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

  const cur = notes[idx];
  const dtSigned = opts.elapsed - cur.timeMs;
  const inWindow =
    s.mode === 'guided' ? true : dtSigned >= -HIT_WINDOW_EARLY_MS && dtSigned <= HIT_WINDOW_MS;

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

  // Asymmetric window: early press judged against the smaller early window
  // (steeper penalty). Guided mode: every hit is "perfect" (timing not graded).
  const window = dtSignedMatched < 0 ? HIT_WINDOW_EARLY_MS : HIT_WINDOW_MS;
  const timingScore = s.mode === 'guided' ? 1 : Math.max(0, 1 - dt / window);
  s.timingScoreSum += timingScore;

  const isPerfect = s.mode === 'guided' || dt < PERFECT_MS;
  return {
    type: 'hit',
    note: matched,
    matchedIdx,
    isChordMate,
    isPerfect,
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
// Star tier evaluation
// =====================================================================

export interface StarTier {
  stars: number;
  acc: number;
  timing: number;
  /** Threshold for note-length percentage; ignored if durPct is null. */
  dur: number;
}

export const STAR_TIERS: readonly StarTier[] = [
  { stars: 3, acc: 90, timing: 70, dur: 70 },
  { stars: 2, acc: 75, timing: 0, dur: 50 },
  { stars: 1, acc: 50, timing: 0, dur: 0 },
];

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
