// Score loader orchestrator — Phase 0d batch 31.
//
// Walks the music file → OSMD instance → typed note timeline pipeline:
//
//   1. Skip-load fast path — if `song._loaded`, just re-init OSMD
//      so the score is redrawn (post song-switch) and return.
//   2. In-flight dedupe — if another caller already started the
//      load, return its Promise.
//   3. initOsmd() — parse the MusicXML, render the SVG (handles
//      OSMD quirks via osmd-init.ts).
//   4. Cache the raw XML text on the song record + parse it into
//      a `ScoreTiming` (per-measure tempo events, time signatures,
//      divisions, anacrusis). Used for ALL timing decisions; OSMD
//      is consulted only for pitch/staff/cursor.
//   5. Build per-measure (start, dur) seconds via `buildMeasureTimingFromXml`.
//   6. Extract notes from OSMD via `extractNotesFromOsmd`.
//   7. Detect BPM divergence between OSMD's reading of
//      `<metronome beat-unit="eighth">` and the XML-canonical
//      quarter BPM (OSMD known limitation). Sets song._bpmRescaled.
//   8. Fetch playback order via `fetchPlaybackOrder` (handles
//      |: ... :|), fall back to linear measure order on parse fail.
//   9. Expand notes by playback order — unfolds repeats by re-
//      timing each note for every traversal.
//   10. Build sections from sectionDefs (auto or manual), preserving
//       leading rests + leading tempo.
//   11. Capture song.bpm — prefer XML-canonical, fall back to OSMD.
//   12. Optional: dump comprehensive load-time DIAG (gated by
//       REMOTE_LOG_ENABLED).
//   13. Drop the cached XML text from JS heap.
//
// Race safety: the orchestrator holds a `stillCurrent()` thunk so a
// rapid second `selectSong()` mid-load can't make the IIFE write its
// results into the wrong song's record. Every async boundary checks
// `stillCurrent()` before proceeding.
//
// Side-effects all flow through deps. The factory is stateless.

import { buildMeasureGrid } from '@piano/core';
import type { ScoreTiming, MeasureTimingResult, MeasureGridEntry } from '@piano/core';

/** Generic OSMD-like note shape we hand back to the song record.
 *  Same fields the legacy `OsmdLikeNote` JSDoc typedef declares. */
export interface OsmdLikeNote {
  midi: number;
  hand: string;
  timeSec: number;
  durSec: number;
  measureIdx: number;
  inBarQuarters: number;
}

/** Subset of the song record we read + write. The shell's actual
 *  song record carries more (id, title, sectionDefs, etc.); only
 *  the loader-visible fields are typed here. */
export interface ScoreLoaderSong {
  id?: string;
  mxlUrl?: string | null;
  xmlUrl?: string | null;
  sectionDefs?: unknown[];

  // Mutated during load.
  _loaded?: boolean;
  _loadingPromise?: Promise<void> | null;
  _xmlText?: string;
  _bpmRescaled?: boolean;
  notes?: OsmdLikeNote[];
  /** おともパート（Voice 等の練習対象外パート）の再生専用ノート。
   *  単一パート譜では空配列。レーン・採点には一切使われない。 */
  backingNotes?: OsmdLikeNote[];
  totalSec?: number;
  playbackOrder?: number[];
  sections?: unknown[];
  bpm?: number;
  /** Quarter-note beats per bar (from the leading time signature) for
   *  the metronome accent. 4/4 → 4, 3/4 → 3, 6/8 → 3. Default 4. */
  beatsPerMeasure?: number;
  /** 先頭拍子（XML 優先、無ければ OSMD Sheet フォールバック）。
   *  カウントインを「拍子ちょうど整数小節」で組むためのソース。
   *  どちらからも取れなければ undefined（従来の 4 拍ターゲット）。 */
  timeSig?: { beats: number; beatType: number };
  /** 展開後時計の per-measure テーブル — カウントイン / メトロノームの
   *  唯一の真実（弱起・複合拍子・途中の拍子変更を構造的に吸収）。
   *  XML 直解析（scoreTiming）が無い曲は undefined のまま → 呼び出し側は
   *  従来の一様グリッドへ完全フォールバック（回帰ゼロ）。 */
  measureGrid?: MeasureGridEntry[];
}

/** Result shape from `extractNotesFromOsmd`. The loader doesn't
 *  introspect the inner notes — opaque pass-through. */
export interface ExtractResult {
  notes: OsmdLikeNote[];
  /** 練習対象外パートのノート（旧シム互換のため optional）。 */
  backingNotes?: OsmdLikeNote[];
  measureStartSec: number[];
  measureBpm: number[];
}

/** OSMD measure shape we read TempoInBPM / ActiveTimeSignature from. */
export interface OsmdMeasure {
  TempoInBPM?: number;
  /** OSMD の Fraction（Numerator/Denominator）。XML 解析が失敗した曲の
   *  拍子の二次ソース（beatsPerMeasure=4 固定への転落を防ぐ）。 */
  ActiveTimeSignature?: { Numerator?: number; Denominator?: number };
}

export interface ScoreLoaderDeps {
  /** Returns the song that's currently being loaded. Read at every
   *  await boundary so a rapid selectSong can be detected via the
   *  `stillCurrent()` identity check. */
  getCurrentSong: () => ScoreLoaderSong | null;

  initOsmd: () => Promise<void> | Promise<unknown>;
  /** Read AFTER initOsmd resolves. Used to extract measures + cursor
   *  table. Typed loose because the shell's osmd object is the OSMD
   *  lib's instance + we don't introspect it deeply. */
  getOsmd: () => { Sheet?: { SourceMeasures?: OsmdMeasure[] } } | null;

  parseScoreTimingFromXml: (text: string, opts?: { partIndex?: number }) => ScoreTiming | null;
  buildMeasureTimingFromXml: (scoreTiming: ScoreTiming | null) => MeasureTimingResult | null;
  extractNotesFromOsmd: (
    xmlMeasureTiming: MeasureTimingResult | null,
    scoreTiming: ScoreTiming | null
  ) => ExtractResult;

  /** initOsmd 後に呼ばれ、練習パート（ピアノ）の XML パート index
   *  （part-list 順）を返す。未指定なら 0（先頭パート = 従来挙動）。
   *  歌+伴奏譜でテンポ/リピートがピアノパート側にだけ書かれていても
   *  取りこぼさないための貫通口（P2-21）。 */
  getPracticePartIndex?: () => number;

  fetchPlaybackOrder: (forSong: ScoreLoaderSong, partIndex?: number) => Promise<number[]>;
  expandNotesByPlaybackOrder: (
    baseNotes: OsmdLikeNote[],
    order: number[],
    measures: OsmdMeasure[],
    sourceMeasureStartSec: number[],
    sourceMeasureDurSec?: number[]
  ) => OsmdLikeNote[];
  /** Source-measure → expanded-timeline start (repeat-unfolded). Used
   *  so section boundaries land on the same clock as the notes. */
  expandedMeasureStartSec: (
    order: number[],
    measures: OsmdMeasure[],
    sourceMeasureStartSec: number[],
    sourceMeasureDurSec?: number[]
  ) => number[];

  buildSectionsFromDefs: (
    expanded: OsmdLikeNote[],
    totalSec: number,
    sectionDefs: unknown[],
    measureStartSec: number[]
  ) => unknown[];

  /** Verbose load-time diagnostic dumper. Only called when
   *  `remoteLogEnabled` is true at the time the load completes. */
  dumpLoadDiagnostics: (info: {
    song: ScoreLoaderSong;
    scoreTiming: ScoreTiming | null;
    extractRet: ExtractResult;
    baseNotes: OsmdLikeNote[];
    expanded: OsmdLikeNote[];
    measures: OsmdMeasure[];
    order: number[];
    totalSec: number;
    measureStartSec: number[];
    measureBpm: number[];
  }) => void;
  remoteLogEnabled: boolean;

  /** Override for `fetch` — defaults to global. Tests inject a mock. */
  fetch?: typeof fetch;
}

export interface ScoreLoader {
  /** Load the current song's score (idempotent + race-safe).
   *  Resolves after the song record is fully populated, or returns
   *  early on a mid-load song-swap. Re-runs initOsmd only when the
   *  data is already loaded but the OSMD instance was nulled. */
  loadCurrentScore(): Promise<void>;
}

export function createScoreLoader(deps: ScoreLoaderDeps): ScoreLoader {
  const fetchFn = deps.fetch ?? fetch;

  async function loadCurrentScore(): Promise<void> {
    const song = deps.getCurrentSong();
    if (!song) return;

    // Data is loaded but the OSMD instance was nulled (right after a
    // song switch). Re-run initOsmd only to redraw the score; note/
    // section extraction is unnecessary.
    if (song._loaded) {
      if (!deps.getOsmd()) await deps.initOsmd();
      return;
    }
    if (song._loadingPromise) {
      await song._loadingPromise;
      return;
    }

    // Capture `currentSong` so a rapid second selectSong() mid-load
    // can't make the IIFE write its results into the wrong song's
    // record (would null another in-flight song's _loadingPromise,
    // allowing concurrent duplicate loads).
    const stillCurrent = (): boolean => deps.getCurrentSong() === song;

    song._loadingPromise = (async () => {
      await deps.initOsmd();
      if (!stillCurrent()) return;

      // 練習パート（ピアノ）の XML パート index。initOsmd 後でないと
      // OSMD の Instruments が読めないため、ここで確定して timing /
      // playback-order の両パースに貫通させる（P2-21）。
      const partIndex = deps.getPracticePartIndex ? deps.getPracticePartIndex() : 0;

      // Parse the raw XML for the authoritative timing model.
      let scoreTiming: ScoreTiming | null = null;
      try {
        let text = song._xmlText;
        if (!text && song.xmlUrl) {
          const res = await fetchFn(song.xmlUrl);
          if (!stillCurrent()) return;
          if (res.ok) text = await res.text();
        }
        if (text) {
          // Cache so fetchPlaybackOrder() reuses it instead of re-
          // downloading (Android Chrome was occasionally hanging on
          // the second blob: fetch).
          song._xmlText = text;
          scoreTiming = deps.parseScoreTimingFromXml(text, { partIndex });
        }
      } catch {
        /* non-fatal — extractNotesFromOsmd will fall back */
      }
      if (!stillCurrent()) return;

      const xmlMeasureTiming = deps.buildMeasureTimingFromXml(scoreTiming);
      const extractRet = deps.extractNotesFromOsmd(xmlMeasureTiming, scoreTiming);
      const baseNotes = extractRet.notes;
      const srcMeasureStartSec = extractRet.measureStartSec;
      const osmdMeasureBpm = extractRet.measureBpm;
      if (baseNotes.length === 0) {
        // Diagnostic-friendly throw: includes the song id + which URL
        // OSMD loaded, so a future "No notes extracted" entry in
        // server.log immediately fingers the offending asset (instead
        // of forcing a re-investigation like alla_turca needed). The
        // 0-measure case usually means OSMD's MXL container reader
        // couldn't locate the inner XML — see osmd-init.ts header
        // note about non-standard inner file names.
        const url =
          (song as { xmlUrl?: string; mxlUrl?: string }).xmlUrl ||
          (song as { xmlUrl?: string; mxlUrl?: string }).mxlUrl ||
          '(no url)';
        throw new Error(
          'No notes extracted from MusicXML — songId=' +
            (song as { id?: string }).id +
            ' url=' +
            url
        );
      }

      // BPM divergence flag — true when OSMD's reading of
      // <metronome beat-unit="eighth"> disagrees with the XML-
      // canonical quarter BPM. Used by renderSongPanel to show the
      // "✓" marker on the BPM hint.
      song._bpmRescaled = false;
      if (scoreTiming && xmlMeasureTiming) {
        const osmdBpm0 = osmdMeasureBpm[0] || 72;
        const xmlBpm0 = scoreTiming.leadingQuarterBpm;
        song._bpmRescaled = Math.abs(osmdBpm0 / xmlBpm0 - 1) > 0.05;
      }

      const measures: OsmdMeasure[] = deps.getOsmd()?.Sheet?.SourceMeasures || [];

      // Parse the raw XML to discover the actual playback order.
      let order: number[];
      try {
        order = await deps.fetchPlaybackOrder(song, partIndex);
        if (!stillCurrent()) return;
        if (!order.length) order = measures.map((_, i) => i);
      } catch (e) {
        console.warn('Playback order parse failed, falling back to linear', e);
        order = measures.map((_, i) => i);
      }
      // XML-authoritative per-measure durations (parallel to
      // srcMeasureStartSec). Passing these fixes the last measure's
      // 72-BPM fallback that shifted D.C./D.S. second passes.
      const srcMeasureDurSec = xmlMeasureTiming?.durSec;
      const expanded = deps.expandNotesByPlaybackOrder(
        baseNotes,
        order,
        measures,
        srcMeasureStartSec,
        srcMeasureDurSec
      );

      // おともパート（Voice 等）も同じ再生順で展開。空なら空のまま。
      const baseBacking = extractRet.backingNotes ?? [];
      const expandedBacking = baseBacking.length
        ? deps.expandNotesByPlaybackOrder(
            baseBacking,
            order,
            measures,
            srcMeasureStartSec,
            srcMeasureDurSec
          )
        : [];

      let totalSec = 0;
      for (const n of expanded) {
        const end = n.timeSec + n.durSec;
        if (end > totalSec) totalSec = end;
      }
      // メロディが伴奏より長く伸びる曲では backing の終端が全体長になる。
      for (const n of expandedBacking) {
        const end = n.timeSec + n.durSec;
        if (end > totalSec) totalSec = end;
      }

      song.notes = expanded;
      song.backingNotes = expandedBacking;

      // Section boundaries are defined by SOURCE measure index but slice
      // notes that live on the EXPANDED (repeat-unfolded) timeline. Map
      // each boundary measure to its first-occurrence time on the
      // expanded clock so a section after a repeat gets its own window
      // (not the tail of the previous section's repeat).
      const expandedMeasureStart = deps.expandedMeasureStartSec(
        order,
        measures,
        srcMeasureStartSec,
        srcMeasureDurSec
      );
      song.totalSec = totalSec;
      song.playbackOrder = order;
      // Pass the EXPANDED-timeline measure starts so sections begin at
      // the measure boundary on the same clock as the notes (preserves
      // leading rest visually, and stays correct across repeats).
      song.sections = deps.buildSectionsFromDefs(
        expanded,
        totalSec,
        song.sectionDefs ?? [],
        expandedMeasureStart
      );

      // Capture leading tempo so count-in clicks match the song.
      // Prefer XML-canonical quarter BPM (authoritative — handles
      // <metronome beat-unit="eighth"> correctly).
      let songBpm = 0;
      if (scoreTiming && scoreTiming.leadingQuarterBpm) {
        songBpm = scoreTiming.leadingQuarterBpm;
      }
      if (!songBpm) {
        for (const m of measures) {
          const v = m && m.TempoInBPM;
          if (v && v > 0) {
            songBpm = v;
            break;
          }
        }
      }
      // Clamp to a musically sane range so a malformed import (e.g.
      // `<sound tempo="9999">`) can't push practiceBeatMs to a few ms and
      // blow up count-in / lane timing. 20–320 BPM covers Grave→Prestissimo.
      songBpm = songBpm || 72;
      if (songBpm < 20) songBpm = 20;
      if (songBpm > 320) songBpm = 320;
      song.bpm = songBpm;
      // 先頭拍子: XML 直解析を優先し、無ければ OSMD Sheet の
      // ActiveTimeSignature を二次ソースにする（XML 解析失敗時に
      // beatsPerMeasure=4 固定へ転落しないため）。
      const leadSig = scoreTiming?.measures?.[0]?.timeSig;
      let sigBeats = leadSig && leadSig.beats > 0 && leadSig.beatType > 0 ? leadSig.beats : 0;
      let sigType = leadSig && leadSig.beats > 0 && leadSig.beatType > 0 ? leadSig.beatType : 0;
      if (!sigBeats || !sigType) {
        const osmdSig = measures[0]?.ActiveTimeSignature;
        const n = osmdSig?.Numerator ?? 0;
        const d = osmdSig?.Denominator ?? 0;
        if (n > 0 && d > 0) {
          sigBeats = n;
          sigType = d;
        }
      }
      song.timeSig = sigBeats && sigType ? { beats: sigBeats, beatType: sigType } : undefined;
      // Quarter-note beats per bar for the metronome accent. beats × 4 /
      // beatType maps any simple/compound meter onto the quarter-note
      // metronome grid (4/4→4, 3/4→3, 6/8→3, 2/2→4). Falls back to 4.
      song.beatsPerMeasure =
        sigBeats && sigType ? Math.max(1, Math.round((sigBeats * 4) / sigType)) : 4;
      // 小節グリッド（展開後時計）— カウントイン / メトロノームの唯一の
      // 真実。ノート展開と同じ order + durSec を使うので両者の時計は
      // 定義上一致する。XML 経路が無い曲は undefined のまま（呼び出し側が
      // 従来の一様グリッドへ完全フォールバック）。
      song.measureGrid =
        scoreTiming?.measures?.length && srcMeasureDurSec?.length
          ? buildMeasureGrid(order, scoreTiming.measures, srcMeasureDurSec)
          : undefined;
      song._loaded = true;
      console.log(
        '[' +
          song.id +
          '] base=' +
          baseNotes.length +
          ' backing=' +
          expandedBacking.length +
          ' expanded=' +
          expanded.length +
          ' measures=' +
          measures.length +
          ' playbackOrder=' +
          order.length +
          ' total=' +
          totalSec.toFixed(1) +
          's'
      );

      if (deps.remoteLogEnabled) {
        deps.dumpLoadDiagnostics({
          song,
          scoreTiming,
          extractRet,
          baseNotes,
          expanded,
          measures,
          order,
          totalSec,
          measureStartSec: srcMeasureStartSec,
          measureBpm: osmdMeasureBpm,
        });
      }
      // Drop the cached xmlText now that notes/sections/cursor
      // tables are built. For user songs the canonical text still
      // lives on the IndexedDB record + the blob URL resolves;
      // dropping the per-song JS-heap copy avoids piling up >5MB
      // strings.
      song._xmlText = undefined;
    })();

    try {
      await song._loadingPromise;
    } finally {
      song._loadingPromise = null;
    }
  }

  return { loadCurrentScore };
}
