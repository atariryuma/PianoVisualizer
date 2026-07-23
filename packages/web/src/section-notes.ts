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
//
//   4. buildMetronomeEvents(sectionIdx|null, deps) — 小節グリッド
//      （song.measureGrid、展開後時計）から継続メトロノームのクリック列
//      を合成する。小節頭アクセント + 小節内は拍単位クリック（複合拍子は
//      付点四分）。テンポ scale と countInMs アンカーはノート写像
//      （relSec × speedFactor + countInMs）と同一式なので、弱起・
//      複合拍子・途中の拍子変更でもアクセントが小節線から構造的に
//      ずれない。グリッドが無い曲は null を返し、呼び出し側
//      （audio-scheduler）が従来の一様ループへフォールバックする。

import { countInPickupSec, meterBeatInfo } from '@piano/core';
import type { MeasureGridEntry } from '@piano/core';

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

/** Notes whose scaled timeMs are within this window count as one chord
 *  for the mic-mode relaxation. Chord notes share an identical source
 *  onset (so an identical scaled timeMs), so any small tolerance works;
 *  30 ms absorbs float rounding without merging distinct fast notes. */
export const CHORD_CLUSTER_WINDOW_MS = 30;

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
  /** 小節グリッド（展開後時計）。無い曲（ユーザー曲 JSON・XML 解析失敗）
   *  は undefined — buildMetronomeEvents が null を返し、従来の一様
   *  メトロノームへフォールバックする。 */
  measureGrid?: MeasureGridEntry[];
}

/** Subset of the practice record we read. */
export interface SectionNotesPracticeRef {
  /** 100 = full speed, 60 = 60 % of song tempo, etc. */
  tempoPct: number;
  /** 'R' / 'L' for one-hand mode, null for both. */
  handFilter: 'R' | 'L' | null;
  /** Gate for the mic-mode chord relaxation — skipped in listen mode. */
  mode?: string;
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

/** Pure: in mic mode the YIN detector resolves a single pitch per
 *  onset, so the non-top notes of a chord can NEVER be hit — they'd
 *  pile up as structural misses and hand the kid an unfair 0★. This
 *  relaxes each simultaneous cluster to its highest still-active note
 *  (the one YIN is most likely to lock onto), pre-flagging the rest
 *  `_filtered + hit` — the exact mechanism the off-hand filter already
 *  uses, so the cursor skips them and the progress count excludes them.
 *
 *  Only already-active notes (not off-hand-`_filtered`) are considered,
 *  so this composes cleanly with one-hand mode. Mutates in place and
 *  returns the same array. */
export function relaxChordsForMic(notes: OsmdLikeNote[]): OsmdLikeNote[] {
  let i = 0;
  while (i < notes.length) {
    const head = notes[i];
    const t0 = head.timeMs ?? 0;
    // Gather the cluster [i, j) of notes sharing this onset.
    let j = i + 1;
    while (j < notes.length && (notes[j].timeMs ?? 0) - t0 <= CHORD_CLUSTER_WINDOW_MS) j++;
    // Among the active (non-filtered) notes in the cluster, keep the
    // highest MIDI; filter the rest.
    let topIdx = -1;
    let topMidi = -Infinity;
    for (let k = i; k < j; k++) {
      if (notes[k]._filtered) continue;
      if (notes[k].midi > topMidi) {
        topMidi = notes[k].midi;
        topIdx = k;
      }
    }
    if (topIdx >= 0) {
      for (let k = i; k < j; k++) {
        if (k === topIdx || notes[k]._filtered) continue;
        notes[k]._filtered = true;
        notes[k].hit = true;
      }
    }
    i = j;
  }
  return notes;
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
  /** True when scoring off the mic (no MIDI keyboard). Relaxes chords to
   *  their top note so the single-pitch YIN detector can't rack up
   *  structural misses. Ignored in listen mode (no scoring). */
  micMode?: boolean;
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
  const clustered = clusterAdjacentNotes(out);
  // Mic mode (no MIDI): drop each chord to its top note so the
  // single-pitch YIN detector can't rack up structural misses. Skipped
  // in listen mode (no scoring — hiding notes would only confuse the lane).
  if (deps.micMode && deps.practice.mode !== 'listen') {
    return relaxChordsForMic(clustered);
  }
  return clustered;
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

/** 全曲タイムラインの speedFactor。listen は従来どおり 100% 固定
 *  （通し試聴は「本番の演奏」体験 — 半速の全曲は間延びする）。
 *  guided / rhythm の 1曲チャレンジはセクション練習と同じテンポ
 *  ラダー（buildSectionNotes と同一式）で、ゆっくり通しも支援する。 */
function fullSongSpeedFactor(practice: SectionNotesPracticeRef): number {
  // mode 未指定（旧呼び出し）は listen 相当 = 100% 固定に倒す。
  if (practice.mode === 'rhythm' || practice.mode === 'guided') {
    return 100 / (practice.tempoPct || 100);
  }
  return 1;
}

/** Build the full-song timeline. Listen mode keeps the fixed-100%
 *  "performance" playback; guided / rhythm (1曲チャレンジ) scale by the
 *  practice tempo and apply the same mic-mode chord relaxation as
 *  buildSectionNotes so a scored full-song run stays fair on mic. */
export function buildFullSongNotes(deps: SectionNotesDeps): OsmdLikeNote[] {
  const speedFactor = fullSongSpeedFactor(deps.practice);
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
  const clustered = clusterAdjacentNotes(out);
  if (deps.micMode && deps.practice.mode !== 'listen') {
    return relaxChordsForMic(clustered);
  }
  return clustered;
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
    const speedFactor = fullSongSpeedFactor(deps.practice);
    for (const n of backing) {
      out.push({
        midi: n.midi,
        timeMs: (n.timeSec - t0) * 1000 * speedFactor + deps.countInMs,
        durMs: n.durSec * 1000 * speedFactor,
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

/** 継続メトロノームの 1 クリック。accent=true は小節頭（880 Hz）。 */
export interface MetronomeSchedulerEvent {
  timeMs: number;
  accent: boolean;
}

/** 浮動小数の丸め誤差吸収（秒領域）。 */
const GRID_EPS_SEC = 1e-6;
/** GO（ダウンビート）と同時刻のクリックを除外する ms トレランス。 */
const GO_DEDUPE_MS = 1;

/** 小節グリッドから継続メトロノームのクリック列を合成する。
 *
 *  - `sectionIdx` 指定時: セクション [startSec, endSec) の各小節。
 *    テンポ scale + countInMs アンカーは buildSectionNotes と同一式。
 *  - `sectionIdx === null`: 全曲再生。テンポ 100% 固定・アンカーは
 *    fullSongAnchorSec（buildFullSongNotes / buildBackingNotes と共有）。
 *
 *  各小節は小節頭 (k=0) がアクセント、以降は拍単位クリック。拍の間隔は
 *  「公称小節長 / 1 小節の拍数」— 部分小節（弱起・volta 途中切れ）では
 *  barFrac で公称長へ換算するので、拍間隔は保たれつつ実長を超える拍は
 *  鳴らない。カウントイン区間（timeMs <= GO）はカウントインのクリック列
 *  と GO ビープが受け持つため除外する — GO 自体が最初の完全小節頭の
 *  アクセントになる。
 *
 *  グリッドが無い曲は null（呼び出し側が従来の一様ループへフォール
 *  バック — 回帰ゼロ）。 */
export function buildMetronomeEvents(
  sectionIdx: number | null,
  deps: SectionNotesDeps
): MetronomeSchedulerEvent[] | null {
  const grid = deps.song.measureGrid;
  if (!grid || !grid.length) return null;

  let anchorSec: number;
  let endSec: number;
  let speedFactor: number;
  if (sectionIdx === null) {
    anchorSec = fullSongAnchorSec(deps.song);
    const last = grid[grid.length - 1];
    endSec = last.startSec + last.durSec;
    // listen は 100% 固定、guided/rhythm の 1曲チャレンジはテンポ scale
    // （buildFullSongNotes / buildBackingNotes と同一関数で常に一致）。
    speedFactor = fullSongSpeedFactor(deps.practice);
  } else {
    const sec = deps.song.sections?.[sectionIdx];
    if (!sec) return [];
    anchorSec = sec.startSec;
    endSec = sec.endSec;
    speedFactor = 100 / deps.practice.tempoPct;
  }

  // GO（ダウンビート）= countInMs + ピックアップ長 × speedFactor。
  // practice-timings 側のクリック列アンカーと同じ純関数から導くので
  // カウントインと継続メトロノームの継ぎ目は定義上一致する。
  const goMs = deps.countInMs + countInPickupSec(grid, anchorSec) * 1000 * speedFactor;

  const out: MetronomeSchedulerEvent[] = [];
  for (const m of grid) {
    if (m.startSec + m.durSec <= anchorSec + GRID_EPS_SEC) continue;
    if (m.startSec >= endSec - GRID_EPS_SEC) break;
    const info = meterBeatInfo(m.beats, m.beatType);
    // 公称小節長（部分小節は barFrac で実長→公称長へ換算）から拍間隔を
    // 出す。完全小節では barFrac 無し → durSec そのまま均等割り。
    const fullBarSec = m.durSec / (m.barFrac && m.barFrac > 0 ? m.barFrac : 1);
    const beatSec = fullBarSec / info.clicksPerBar;
    if (!(beatSec > 0)) continue;
    for (let k = 0; k < info.clicksPerBar; k++) {
      const t = m.startSec + k * beatSec;
      if (t >= m.startSec + m.durSec - GRID_EPS_SEC) break; // 実長を超える拍
      if (t < anchorSec - GRID_EPS_SEC) continue; // セクション開始前
      if (t >= endSec - GRID_EPS_SEC) break; // セクション終了後
      const timeMs = (t - anchorSec) * 1000 * speedFactor + deps.countInMs;
      if (timeMs <= goMs + GO_DEDUPE_MS) continue; // カウントイン + GO が受け持つ
      out.push({ timeMs, accent: k === 0 });
    }
  }
  return out;
}

/** レーン描画用の拍グリッド（小節線 + 拍線）。buildMetronomeEvents と同じ
 *  小節グリッド走査・同じテンポ scale / countIn アンカーだが、
 *
 *   - GO 以前（カウントイン境界のダウンビート含む）も除外しない — 視覚の
 *     小節線は「音を出すか」ではなく「小節がどこか」なので GO 自体の線も要る。
 *   - セクション終端に閉じの小節線（accent）を 1 本足す。
 *
 *  リズムゲームの業界標準（Synthesia / Melodics / Rocksmith）どおり、レーンで
 *  「この音は何拍目か」を先読みできるようにするための純データ。グリッドの
 *  無い曲は null（呼び出し側が一様グリッドへフォールバック or 線なし）。 */
export function buildLaneBeatGrid(
  sectionIdx: number | null,
  deps: SectionNotesDeps
): MetronomeSchedulerEvent[] | null {
  const grid = deps.song.measureGrid;
  if (!grid || !grid.length) return null;

  let anchorSec: number;
  let endSec: number;
  let speedFactor: number;
  if (sectionIdx === null) {
    anchorSec = fullSongAnchorSec(deps.song);
    const last = grid[grid.length - 1];
    endSec = last.startSec + last.durSec;
    speedFactor = fullSongSpeedFactor(deps.practice);
  } else {
    const sec = deps.song.sections?.[sectionIdx];
    if (!sec) return [];
    anchorSec = sec.startSec;
    endSec = sec.endSec;
    speedFactor = 100 / deps.practice.tempoPct;
  }

  const out: MetronomeSchedulerEvent[] = [];
  for (const m of grid) {
    if (m.startSec + m.durSec <= anchorSec + GRID_EPS_SEC) continue;
    if (m.startSec >= endSec - GRID_EPS_SEC) break;
    const info = meterBeatInfo(m.beats, m.beatType);
    const fullBarSec = m.durSec / (m.barFrac && m.barFrac > 0 ? m.barFrac : 1);
    const beatSec = fullBarSec / info.clicksPerBar;
    if (!(beatSec > 0)) continue;
    for (let k = 0; k < info.clicksPerBar; k++) {
      const t = m.startSec + k * beatSec;
      if (t >= m.startSec + m.durSec - GRID_EPS_SEC) break;
      if (t < anchorSec - GRID_EPS_SEC) continue;
      if (t >= endSec - GRID_EPS_SEC) break;
      out.push({ timeMs: (t - anchorSec) * 1000 * speedFactor + deps.countInMs, accent: k === 0 });
    }
  }
  // 閉じの小節線 — 最後の音の先に「ここで終わる」が見える。
  out.push({ timeMs: (endSec - anchorSec) * 1000 * speedFactor + deps.countInMs, accent: true });
  return out;
}
