// Section-notes builder — Phase 0d batch 34.
//
// Three pure(ish) builders the practice flow uses to materialize a
// section-scoped timeline from the song's expanded note list:
//
//   1. buildSectionNotes(sectionIdx, deps) — slices currentSong.notes
//      by section [startSec, endSec) bounds, applies the hand filter
//      ('R' / 'L' / null), scales note time + duration by the user's
//      tempo % (slower → bigger speedFactor → slower descent in the
//      lane), anchors note timing to the count-in's end. Notes from
//      the off-hand are marked `_filtered: true` + pre-flagged as
//      already-hit so currentNoteIdx skips past them silently while
//      the cursor still moves.
//
//   2. buildFullSongNotes(deps) — listen-mode "全曲再生" timeline.
//      Same shape but t0 anchors on the song's first note (not the
//      first section header) so every section flows back-to-back
//      without resync gaps. Tempo is hardcoded 100% — full-song
//      listen is the "performance" experience and a slowed-down
//      whole song feels off (4 minutes of half-speed Für Elise).
//
//   3. computeHandRanges(notes) — pure: per-hand MIDI min/max for
//      the lane drawer's pitch → x-position mapping. Computed once
//      per section so the per-frame draw doesn't re-scan. Falls
//      back to sane defaults (RH C4–C5, LH C3–C4) when one hand has
//      no notes.

/** Generic OSMD-derived note shape. Same fields as
 *  ScoreLoader.OsmdLikeNote with the timeMs/durMs additions used
 *  by the lane + practice tick (filled in by the builders here). */
export interface OsmdLikeNote {
  hand: string;
  midi: number;
  timeSec: number;
  durSec: number;
  timeMs?: number;
  durMs?: number;
  measureIdx: number;
  inBarQuarters: number;
  cursorJump?: boolean;
  hit?: boolean;
  missed?: boolean;
  _filtered?: boolean;
}

/** Section bounds (startSec, endSec) the slice walks. */
export interface SongSection {
  startSec: number;
  endSec: number;
}

/** Subset of the song record the builders read. */
export interface SectionNotesSong {
  notes?: OsmdLikeNote[];
  sections?: SongSection[];
}

/** Subset of the practice record we read. */
export interface SectionNotesPracticeRef {
  /** 100 = full speed, 60 = 60 % of song tempo, etc. */
  tempoPct: number;
  /** 'R' / 'L' for one-hand mode, null for both. */
  handFilter: 'R' | 'L' | null;
}

/** Per-hand MIDI range bag returned by computeHandRanges. */
export interface HandRanges {
  lhMin: number;
  lhMax: number;
  rhMin: number;
  rhMax: number;
}

// ─── pure helpers (also exported for tests) ────────────────────────

/** Pure: pick the bigger MIDI from two notes, treating "no note" as
 *  the sentinel. Used by computeHandRanges. */
function expandRange(midi: number, state: { min: number; max: number; count: number }): void {
  if (midi < state.min) state.min = midi;
  if (midi > state.max) state.max = midi;
  state.count++;
}

/** Pure: per-hand MIDI min/max with sane fallbacks for empty hands. */
export function computeHandRanges(sectionNotes: OsmdLikeNote[]): HandRanges {
  const lh = { min: 200, max: 0, count: 0 };
  const rh = { min: 200, max: 0, count: 0 };
  for (const n of sectionNotes) {
    if (n.hand === 'L') expandRange(n.midi, lh);
    else expandRange(n.midi, rh);
  }
  // Fallbacks: lane drawer needs a non-empty range to scale even if
  // one hand has no notes (e.g. RH-only piece, listen of left-hand
  // section). Pick the standard centered C-octave per hand.
  if (rh.count === 0) {
    rh.min = 60;
    rh.max = 72;
  }
  if (lh.count === 0) {
    lh.min = 48;
    lh.max = 60;
  }
  // Single-note hand → expand by a semitone so width > 0.
  if (rh.max <= rh.min) rh.max = rh.min + 1;
  if (lh.max <= lh.min) lh.max = lh.min + 1;
  return { lhMin: lh.min, lhMax: lh.max, rhMin: rh.min, rhMax: rh.max };
}

// ─── deps for the section / full-song builders ────────────────────

export interface SectionNotesDeps {
  /** Song record to slice. */
  song: SectionNotesSong;
  /** Practice record (read-only on this path). */
  practice: SectionNotesPracticeRef;
  /** Count-in offset in ms — every note's timeMs is anchored to
   *  count-in end so the kid arrives on tempo. */
  countInMs: number;
}

/** Build the per-section timeline for guided / rhythm modes. */
export function buildSectionNotes(sectionIdx: number, deps: SectionNotesDeps): OsmdLikeNote[] {
  const sec = deps.song.sections?.[sectionIdx];
  if (!sec) return [];
  const speedFactor = 100 / deps.practice.tempoPct;
  const out: OsmdLikeNote[] = [];
  const handFilter = deps.practice.handFilter;
  for (const n of deps.song.notes ?? []) {
    if (n.timeSec >= sec.startSec && n.timeSec < sec.endSec) {
      const relSec = n.timeSec - sec.startSec;
      const filtered = !!handFilter && n.hand !== handFilter;
      out.push({
        hand: n.hand,
        midi: n.midi,
        timeSec: n.timeSec,
        durSec: n.durSec,
        timeMs: relSec * 1000 * speedFactor + deps.countInMs,
        durMs: n.durSec * 1000 * speedFactor,
        measureIdx: n.measureIdx,
        inBarQuarters: n.inBarQuarters,
        cursorJump: n.cursorJump,
        hit: filtered,
        missed: false,
        _filtered: filtered,
      });
    }
  }
  out.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
  return out;
}

/** Build the full-song "全曲再生" timeline for listen mode. Tempo
 *  is hardcoded 100% (see header note). */
export function buildFullSongNotes(deps: SectionNotesDeps): OsmdLikeNote[] {
  const speedFactor = 1;
  const handFilter = deps.practice.handFilter;
  const out: OsmdLikeNote[] = [];
  const songNotes = deps.song.notes ?? [];
  if (!songNotes.length) return out;
  // Anchor on the first note so the count-in lands right before it.
  // Using sections[0].startSec instead would leave silence before
  // the first attack on songs whose first section header sits a
  // beat or two early.
  let t0 = Infinity;
  for (const n of songNotes) if (n.timeSec < t0) t0 = n.timeSec;
  if (!isFinite(t0)) t0 = 0;
  for (const n of songNotes) {
    const filtered = !!handFilter && n.hand !== handFilter;
    out.push({
      hand: n.hand,
      midi: n.midi,
      timeSec: n.timeSec,
      durSec: n.durSec,
      timeMs: (n.timeSec - t0) * 1000 * speedFactor + deps.countInMs,
      durMs: n.durSec * 1000 * speedFactor,
      measureIdx: n.measureIdx,
      inBarQuarters: n.inBarQuarters,
      cursorJump: n.cursorJump,
      hit: filtered,
      missed: false,
      _filtered: filtered,
    });
  }
  out.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
  return out;
}
