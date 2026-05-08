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
  /** Owns the XML → playback-order parse. */
  parsePlaybackOrderFromXml(text: string): TOrder;
  /** Owns the actual note re-timing math. */
  expandNotesByPlaybackOrder(
    baseNotes: TBaseNote[],
    order: TOrder,
    timing: { startSec: number[]; durSec: number[] }
  ): TExpandedNote[];
}

export interface PlaybackOrderDeps<TBaseNote, TExpandedNote, TOrder> {
  fns: PlaybackOrderCoreFns<TBaseNote, TExpandedNote, TOrder>;
  /** Production: `fetch`. Test stub returns whatever payload the
   *  caller wants. */
  fetch: typeof fetch;
}

export interface PlaybackOrder<TBaseNote, TExpandedNote, TOrder> {
  fetchPlaybackOrder(forSong: PlaybackOrderSong): Promise<TOrder>;
  expandNotesByPlaybackOrder(
    baseNotes: TBaseNote[],
    order: TOrder,
    measures: PlaybackOrderMeasure[],
    sourceMeasureStartSec?: number[]
  ): TExpandedNote[];
}

export function createPlaybackOrder<TBaseNote, TExpandedNote, TOrder>(
  deps: PlaybackOrderDeps<TBaseNote, TExpandedNote, TOrder>
): PlaybackOrder<TBaseNote, TExpandedNote, TOrder> {
  async function fetchPlaybackOrder(forSong: PlaybackOrderSong): Promise<TOrder> {
    let text = forSong._xmlText;
    if (!text) {
      const res = await deps.fetch(forSong.xmlUrl);
      if (!res.ok) throw new Error('XML fetch failed: ' + res.status);
      text = await res.text();
    }
    return deps.fns.parsePlaybackOrderFromXml(text);
  }

  function expandNotesByPlaybackOrder(
    baseNotes: TBaseNote[],
    order: TOrder,
    measures: PlaybackOrderMeasure[],
    sourceMeasureStartSec?: number[]
  ): TExpandedNote[] {
    // [Bug fix 2026-05-09] Loud failure when OSMD's Sheet didn't
    // populate. Without this guard the cumulative-sum walk below
    // produces empty startSec[] / durSec[] arrays; the core
    // expansion then computes `(undefined - 0) * 1000 ...` for every
    // note, returning NaN-tainted timing. Symptom in server.log:
    // `[DIAG/play.note] i=0 t=NaN dur=NaN`. score-loader catches the
    // throw via its existing try/catch path and surfaces the error
    // through `alertAudioInitError`.
    if (!measures || measures.length === 0) {
      throw new Error(
        'expandNotesByPlaybackOrder: measures array is empty — OSMD Sheet.SourceMeasures was null or empty after load'
      );
    }

    let measureStartSec: number[];
    let measureDurSec: number[];

    if (sourceMeasureStartSec && sourceMeasureStartSec.length === measures.length) {
      // Pre-built timing table from the XML reducer — already correct
      // through every mid-bar tempo event. Just cumulative-diff for
      // durations, plus an OSMD-shaped fallback for the last bar.
      measureStartSec = sourceMeasureStartSec;
      measureDurSec = new Array(measures.length).fill(0);
      for (let i = 0; i < measures.length; i++) {
        const m = measures[i];
        if (i + 1 < measures.length) {
          measureDurSec[i] = measureStartSec[i + 1] - measureStartSec[i];
        } else {
          const bpm = m?.TempoInBPM || 72;
          measureDurSec[i] = ((m?.Duration?.realValue || 0.25) * 4 * 60) / bpm;
        }
      }
    } else {
      // Fallback path: cumulative sum of per-bar durations from OSMD
      // shapes. Used by legacy callers that don't pre-build a full
      // XML timing table. prevBpm carried forward across bars without
      // an explicit TempoInBPM value (matches OSMD's per-iteration
      // tempo state).
      measureStartSec = new Array(measures.length).fill(0);
      measureDurSec = new Array(measures.length).fill(0);
      let prevBpm = 72;
      for (let i = 0; i < measures.length; i++) {
        const m = measures[i];
        const bpm = m?.TempoInBPM || prevBpm;
        measureDurSec[i] = ((m?.Duration?.realValue || 0.25) * 4 * 60) / bpm;
        if (i > 0) measureStartSec[i] = measureStartSec[i - 1] + measureDurSec[i - 1];
        prevBpm = bpm;
      }
    }

    return deps.fns.expandNotesByPlaybackOrder(baseNotes, order, {
      startSec: measureStartSec,
      durSec: measureDurSec,
    });
  }

  return { fetchPlaybackOrder, expandNotesByPlaybackOrder };
}
