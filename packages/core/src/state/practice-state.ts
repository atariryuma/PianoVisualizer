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
  // Guided allows unbounded late (note waits) but enforces the same
  // early window as rhythm — so presses during count-in (before the
  // note has descended to the hit zone) don't credit a hit.
  const inWindow =
    s.mode === 'guided'
      ? dtSigned >= -HIT_WINDOW_EARLY_MS
      : dtSigned >= -HIT_WINDOW_EARLY_MS && dtSigned <= HIT_WINDOW_MS;

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

// Kid-9-12-tuned thresholds (research-aligned: Dweck process-praise +
// SDT competence + Csikszentmihalyi flow). ★3 is reachable with 5-10
// focused attempts (not a perfectionist grind). ★2 introduces a gentle
// timing requirement so rhythm is taught before ★3 demands it, instead
// of springing 70% timing on the kid out of nowhere. ★1 stays at 50%
// accuracy so the section-unlock gate still implies real playing.
export const STAR_TIERS: readonly StarTier[] = Object.freeze([
  Object.freeze({ stars: 3, acc: 85, timing: 60, dur: 55 }),
  Object.freeze({ stars: 2, acc: 70, timing: 30, dur: 45 }),
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

/** Tempo speeds the practice flow gates: a section cleared at one tempo
 *  unlocks the next one (gated on stars >= 2). */
export const TEMPO_TIERS: readonly number[] = Object.freeze([60, 75, 90, 100]);

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
   *  don't have a 30-second pre-roll and very fast ones aren't rushed. */
  countInMs: number;
  /** How far ahead in time the lane shows. We mirror count-in so falling
   *  notes traverse the lane during the count-in animation. */
  laneLookaheadMs: number;
}

export interface PracticeTimingOptions {
  /** Lower clamp on count-in. Default 2400 ms (~4 beats at 100 BPM). */
  minCountInMs?: number;
  /** Upper clamp on count-in. Default 7000 ms. */
  maxCountInMs?: number;
  /** Beats counted in. Default 4 (standard musical count-in). */
  countInBeats?: number;
}

/** Derive count-in + lane-lookahead from a beat length. Used by
 *  recomputePracticeTimings() in the legacy app whenever tempoPct or
 *  the song's BPM changes. */
export function computePracticeTimings(
  beatMs: number,
  opts: PracticeTimingOptions = {}
): PracticeTimings {
  const beats = opts.countInBeats ?? 4;
  const lo = opts.minCountInMs ?? 2400;
  const hi = opts.maxCountInMs ?? 7000;
  const countInMs = Math.round(Math.max(lo, Math.min(hi, beats * beatMs)));
  return { countInMs, laneLookaheadMs: countInMs };
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
