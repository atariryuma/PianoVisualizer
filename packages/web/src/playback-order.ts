// Playback-order helpers — Phase 0d batch 53.
//
// Two pieces, bundled because score-loader feeds the output of one
// straight into the other:
//
//   - fetchPlaybackOrder(forSong, deps): pull the MusicXML text
//     (using `_xmlText` if cached on the song record, else fetching
//     `xmlUrl`), feed to PianoCore.parsePlaybackOrderFromXml. The
//     cached-text path matters for just-imported user songs whose
//     `xmlUrl` is a `blob:` URL — Android Chrome occasionally hangs
//     on the second blob fetch of the same blob, and we already have
//     the text in memory anyway.
//
//   - expandNotesByPlaybackOrder(baseNotes, order, measures,
//     sourceMeasureStartSec, deps): re-time per-measure notes through
//     the playback order. The core takes explicit
//     `{ startSec, durSec }` arrays. We accept either:
//       (a) a pre-built `sourceMeasureStartSec` table (from the XML
//           timing reducer) — durSec is computed as the diff between
//           consecutive starts, with an OSMD-shaped fallback for the
//           last bar (no `i+1` to diff against).
//       (b) no table — falls back to a cumulative-sum walk over
//           `measures[].Duration.realValue * 4 * 60 / TempoInBPM`,
//           prevBpm carried forward.
//
// Both pieces are held as thin wrappers; the factory gives them a
// shared deps surface so the shell doesn't repeat the PianoCore +
// fetch wiring.

export interface PlaybackOrderSong {
  /** Cached MusicXML text (set on user-song records that already have
   *  it; absent on stock SONGS). */
  _xmlText?: string;
  /** URL to fetch the XML from when `_xmlText` isn't set. */
  xmlUrl: string;
}

/** OSMD-shaped measure ref the cumulative-sum fallback path reads.
 *  Both fields are optional because we accept partial OSMD shapes. */
export interface PlaybackOrderMeasure {
  TempoInBPM?: number;
  Duration?: { realValue: number };
}

export interface PlaybackOrderCoreFns<TBaseNote, TExpandedNote, TOrder> {
  /** Owns the XML → playback-order parse. opts.partIndex で走査パートを
   *  指定できる（省略時は core 既定 = 先頭パート）。 */
  parsePlaybackOrderFromXml(text: string, opts?: { partIndex?: number }): TOrder;
  /** Owns the actual note re-timing math. */
  expandNotesByPlaybackOrder(
    baseNotes: TBaseNote[],
    order: TOrder,
    timing: { startSec: number[]; durSec: number[] }
  ): TExpandedNote[];
  /** Source-measure → expanded-timeline first-occurrence start (for
   *  section boundaries on repeat-unfolded scores). */
  expandedMeasureStartSec(
    order: TOrder,
    timing: { startSec: number[]; durSec: number[] }
  ): number[];
}

export interface PlaybackOrderDeps<TBaseNote, TExpandedNote, TOrder> {
  fns: PlaybackOrderCoreFns<TBaseNote, TExpandedNote, TOrder>;
  /** Production: `fetch`. Test stub returns whatever payload the
   *  caller wants. */
  fetch: typeof fetch;
}

export interface PlaybackOrder<TBaseNote, TExpandedNote, TOrder> {
  /** partIndex: 走査対象の XML パート index（省略時は先頭パート）。
   *  多パート譜でリピート等がピアノパート側にだけある場合に指定する。 */
  fetchPlaybackOrder(forSong: PlaybackOrderSong, partIndex?: number): Promise<TOrder>;
  expandNotesByPlaybackOrder(
    baseNotes: TBaseNote[],
    order: TOrder,
    measures: PlaybackOrderMeasure[],
    sourceMeasureStartSec?: number[],
    sourceMeasureDurSec?: number[]
  ): TExpandedNote[];
  /** Source-measure → expanded-timeline start (repeat-unfolded), for
   *  section boundaries. Uses the same measure timing as expansion. */
  expandedMeasureStartSec(
    order: TOrder,
    measures: PlaybackOrderMeasure[],
    sourceMeasureStartSec?: number[],
    sourceMeasureDurSec?: number[]
  ): number[];
}

export function createPlaybackOrder<TBaseNote, TExpandedNote, TOrder>(
  deps: PlaybackOrderDeps<TBaseNote, TExpandedNote, TOrder>
): PlaybackOrder<TBaseNote, TExpandedNote, TOrder> {
  async function fetchPlaybackOrder(
    forSong: PlaybackOrderSong,
    partIndex?: number
  ): Promise<TOrder> {
    let text = forSong._xmlText;
    if (!text) {
      const res = await deps.fetch(forSong.xmlUrl);
      if (!res.ok) throw new Error('XML fetch failed: ' + res.status);
      text = await res.text();
    }
    // partIndex 未指定時は従来どおり第2引数なしで呼ぶ（既存呼び出しと完全互換）。
    return partIndex != null
      ? deps.fns.parsePlaybackOrderFromXml(text, { partIndex })
      : deps.fns.parsePlaybackOrderFromXml(text);
  }

  /** Resolve the per-source-measure { startSec, durSec } table used by
   *  both note expansion and section-boundary mapping.
   *
   *  Prefers the XML-derived timing (start + dur) when available:
   *   - When `sourceMeasureDurSec` is supplied it's authoritative for
   *     EVERY bar including the last (fixes the old 72-BPM fallback for
   *     the final measure that shifted D.C./D.S. second passes).
   *   - Else durations are the diff of consecutive starts, with an
   *     OSMD-shaped fallback for the last bar (no i+1 to diff against). */
  function resolveMeasureTiming(
    measures: PlaybackOrderMeasure[],
    sourceMeasureStartSec?: number[],
    sourceMeasureDurSec?: number[]
  ): { startSec: number[]; durSec: number[] } {
    if (!measures || measures.length === 0) {
      // [Bug fix 2026-05-09] Loud failure when OSMD's Sheet didn't
      // populate — otherwise the core expansion computes NaN timing
      // for every note. score-loader surfaces the throw via alert.
      throw new Error(
        'expandNotesByPlaybackOrder: measures array is empty — OSMD Sheet.SourceMeasures was null or empty after load'
      );
    }

    if (sourceMeasureStartSec && sourceMeasureStartSec.length === measures.length) {
      const startSec = sourceMeasureStartSec;
      let durSec: number[];
      if (sourceMeasureDurSec && sourceMeasureDurSec.length === measures.length) {
        // XML-authoritative durations — correct even for the last bar.
        durSec = sourceMeasureDurSec.slice();
      } else {
        durSec = new Array(measures.length).fill(0);
        for (let i = 0; i < measures.length; i++) {
          if (i + 1 < measures.length) {
            durSec[i] = startSec[i + 1] - startSec[i];
          } else {
            const m = measures[i];
            const bpm = m?.TempoInBPM || 72;
            durSec[i] = ((m?.Duration?.realValue || 0.25) * 4 * 60) / bpm;
          }
        }
      }
      return { startSec, durSec };
    }

    // Fallback path: cumulative sum of per-bar durations from OSMD
    // shapes. Used by callers without a pre-built XML timing table.
    const startSec = new Array(measures.length).fill(0);
    const durSec = new Array(measures.length).fill(0);
    let prevBpm = 72;
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      const bpm = m?.TempoInBPM || prevBpm;
      durSec[i] = ((m?.Duration?.realValue || 0.25) * 4 * 60) / bpm;
      if (i > 0) startSec[i] = startSec[i - 1] + durSec[i - 1];
      prevBpm = bpm;
    }
    return { startSec, durSec };
  }

  function expandNotesByPlaybackOrder(
    baseNotes: TBaseNote[],
    order: TOrder,
    measures: PlaybackOrderMeasure[],
    sourceMeasureStartSec?: number[],
    sourceMeasureDurSec?: number[]
  ): TExpandedNote[] {
    const timing = resolveMeasureTiming(measures, sourceMeasureStartSec, sourceMeasureDurSec);
    return deps.fns.expandNotesByPlaybackOrder(baseNotes, order, timing);
  }

  function expandedMeasureStartSec(
    order: TOrder,
    measures: PlaybackOrderMeasure[],
    sourceMeasureStartSec?: number[],
    sourceMeasureDurSec?: number[]
  ): number[] {
    const timing = resolveMeasureTiming(measures, sourceMeasureStartSec, sourceMeasureDurSec);
    return deps.fns.expandedMeasureStartSec(order, timing);
  }

  return { fetchPlaybackOrder, expandNotesByPlaybackOrder, expandedMeasureStartSec };
}
