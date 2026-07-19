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
  /** Number of consecutive same-pitch, same-hand attacks merged into
   *  this note by the lane-cluster step. Default 1 (no merge). The
   *  lane renderer paints a `×N` badge + chevron when this is > 1
   *  so a trill / tremolo / grace-burst that would otherwise stack
   *  multiple tiles on top of each other reads as one event. */
  replayCount?: number;
  /** Internal — wall-clock ms of the most recent attack folded into
   *  this cluster. Used by clusterAdjacentNotes to extend the cluster
   *  with a rolling window (each new attack is compared to the
   *  PREVIOUS attack, not to the cluster's first attack). Without
   *  this, a long even trill (e.g. 10 ms × 8 attacks) splits into
   *  multiple clusters because the cumulative time from the head
   *  exceeds CLUSTER_WINDOW_MS while each adjacent pair is well
   *  inside it. */
  _lastClusterAttackMs?: number;
}

/** Same-pitch + same-hand attacks within this window collapse into a
 *  single visual note. 30 ms is wider than the human ear can
 *  distinguish as separate attacks (≈ 50 ms is the gestalt fusion
 *  threshold) but narrow enough that legitimate fast-but-distinct
 *  16th notes at 120 bpm (125 ms each) stay individual. Liszt
 *  La Campanella's super-high-speed trills generate same-pitch
 *  attacks at < 20 ms intervals — those collapse cleanly into one
 *  tile with a `×N` badge. */
export const CLUSTER_WINDOW_MS = 30;

/** Section bounds (startSec, endSec) the slice walks. */
export interface SongSection {
  startSec: number;
  endSec: number;
}

/** おともパート（Voice 等・再生専用）のノート。score-loader が
 *  song.backingNotes に格納した形の、builder が読む最小サブセット。 */
export interface BackingNoteLike {
  midi: number;
  timeSec: number;
  durSec: number;
}

/** Tone.Transport にスケジュールするだけの再生専用ノート。 */
export interface BackingSchedulerNote {
  midi: number;
  timeMs: number;
  durMs: number;
}

/** Subset of the song record the builders read. */
export interface SectionNotesSong {
  notes?: OsmdLikeNote[];
  backingNotes?: BackingNoteLike[];
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

/** Collapse consecutive same-pitch + same-hand notes whose attack
 *  times are within CLUSTER_WINDOW_MS. The merged note's `durMs`
 *  extends to cover the last attack's tail; `replayCount` carries
 *  the number of folded attacks so the lane renderer can show a
 *  `×N` badge. Stable: the input ordering is preserved.
 *
 *  This handles the OSMD-expanded trill / tremolo / grace-burst
 *  case where a single sheet-music ornament generates dozens of
 *  same-pitch attacks within a few ms each. Without this, the lane
 *  renders dozens of tiles stacked on the same (x, y) coordinates
 *  — La Campanella's RH 9th-trill turned the lane into an
 *  unreadable column of overlapping "L#" badges (server screenshot
 *  2026-05-12).
 *
 *  Notes whose `_filtered` flag is set are skipped (the off-hand
 *  pass), so cluster boundaries are also restricted to a single
 *  hand by construction. */
export function clusterAdjacentNotes(notes: OsmdLikeNote[]): OsmdLikeNote[] {
  if (notes.length < 2) {
    return notes.map((n) => ({ ...n, replayCount: 1 }));
  }
  const out: OsmdLikeNote[] = [];
  for (const n of notes) {
    const last = out.length > 0 ? out[out.length - 1] : null;
    const tNow = n.timeMs ?? 0;
    // Compare to the PREVIOUS attack in the cluster, not to the
    // cluster's head — a long even trill (10 ms × 8 attacks) must
    // collapse into one tile even though tail-to-head is 70 ms.
    const tPrev = last ? (last._lastClusterAttackMs ?? last.timeMs ?? 0) : -Infinity;
    if (
      last &&
      last.midi === n.midi &&
      last.hand === n.hand &&
      !last._filtered &&
      !n._filtered &&
      tNow - tPrev <= CLUSTER_WINDOW_MS
    ) {
      // Merge: extend the existing tile's duration so it covers the
      // full burst, bump replayCount, record the new last-attack time.
      const lastDur = last.durMs ?? 0;
      const nDur = n.durMs ?? 0;
      const tHead = last.timeMs ?? 0;
      last.durMs = Math.max(lastDur, tNow + nDur - tHead);
      last.replayCount = (last.replayCount ?? 1) + 1;
      last._lastClusterAttackMs = tNow;
    } else {
      out.push({ ...n, replayCount: 1, _lastClusterAttackMs: tNow });
    }
  }
  // Strip the internal `_lastClusterAttackMs` field — the lane
  // renderer + practice scoring never read it; keeping it on the
  // public note shape would leak an implementation detail.
  return out.map((n) => {
    const { _lastClusterAttackMs: _unused, ...clean } = n;
    void _unused;
    return clean as OsmdLikeNote;
  });
}

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
  // Collapse same-pitch + same-hand bursts (trill / tremolo / OSMD
  // grace expansion) so the lane shows a single tile with a ×N badge
  // instead of dozens overlapping at identical (x, y) coordinates.
  return clusterAdjacentNotes(out);
}

/** 全曲再生のアンカー時刻（この timeSec がカウントイン明けに鳴る）。
 *  練習ノーツとおともパートの両方の最初のアタックを見る — 歌い出しが
 *  ピアノより先に来る曲では、伴奏側が正しく「待って」から入るため。
 *  buildFullSongNotes と buildBackingNotes が同じ値を使うことで両
 *  タイムラインの整合が保たれる。 */
export function fullSongAnchorSec(song: SectionNotesSong): number {
  let t0 = Infinity;
  for (const n of song.notes ?? []) if (n.timeSec < t0) t0 = n.timeSec;
  for (const n of song.backingNotes ?? []) if (n.timeSec < t0) t0 = n.timeSec;
  return isFinite(t0) ? t0 : 0;
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
  const t0 = fullSongAnchorSec(deps.song);
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
  // Same cluster step as buildSectionNotes — collapses the dense
  // trill bursts that fullSong listen would otherwise stack.
  return clusterAdjacentNotes(out);
}

/** おともパート（Voice 等）の再生タイムラインを作る。
 *
 *  - `sectionIdx` 指定時: そのセクションの [startSec, endSec) を
 *    スライスし、練習ノーツと同じ speedFactor + countIn アンカーで
 *    整列（テンポを落とすと伴奏も一緒に遅くなる）。
 *  - `sectionIdx === null`: 全曲再生。テンポ 100% 固定・アンカーは
 *    fullSongAnchorSec（buildFullSongNotes と共有）。
 *
 *  手フィルタは適用しない（おともパートは常に全部鳴る）。レーン・
 *  採点・進捗には一切関与しない — Tone.Transport スケジュール専用。 */
export function buildBackingNotes(
  sectionIdx: number | null,
  deps: SectionNotesDeps
): BackingSchedulerNote[] {
  const backing = deps.song.backingNotes ?? [];
  if (!backing.length) return [];
  const out: BackingSchedulerNote[] = [];
  if (sectionIdx === null) {
    const t0 = fullSongAnchorSec(deps.song);
    for (const n of backing) {
      out.push({
        midi: n.midi,
        timeMs: (n.timeSec - t0) * 1000 + deps.countInMs,
        durMs: n.durSec * 1000,
      });
    }
  } else {
    const sec = deps.song.sections?.[sectionIdx];
    if (!sec) return [];
    const speedFactor = 100 / deps.practice.tempoPct;
    for (const n of backing) {
      if (n.timeSec >= sec.startSec && n.timeSec < sec.endSec) {
        out.push({
          midi: n.midi,
          timeMs: (n.timeSec - sec.startSec) * 1000 * speedFactor + deps.countInMs,
          durMs: n.durSec * 1000 * speedFactor,
        });
      }
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}
