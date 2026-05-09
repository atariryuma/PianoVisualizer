// OSMD initializer — Phase 0d batch 29.
//
// Wraps OpenSheetMusicDisplay's instantiate + load + render pipeline
// with the project's accumulated quirks-handling:
//
//   - Construction options tuned for kid use (no titles / composer
//     tags / hidden notes; SVG backend; thin gold cursor that doesn't
//     anchor to OSMD's wide time-slot edges).
//
//   - autoResize:false — La Campanella's calculatePedals throws
//     UnformattedNote on every resize otherwise, polluting the
//     console + occasionally breaking layout. Our #osmdContainer is
//     fixed-positioned; CSS handles viewport changes.
//
//   - drawHiddenNotes:false — OSMD throws "Can't call GetWidth on an
//     unformatted note" for `print-object="no"` notes in dense scores
//     (still reproduces in 1.9.9). Skipping at the renderer level
//     avoids the layout-cache miss.
//
//   - RenderPedals = false — Liszt / Chopin scores that mark every
//     chord with sustain hit calculatePedals' UnformattedNote path.
//     We don't visually need pedals for the practice flow.
//
//   - CursorIgnoreRepetitions = false — required so OSMD's
//     `MusicPartManagerIterator` constructor takes back-jumps at
//     repeat ends while walking to a sheet timestamp. The cursor is
//     driven from `(measureIdx, inBarQuarters)` via that constructor
//     (osmd-cursor.ts/setCursorToNote), so the iterator naturally
//     lands at the correct repeat iteration without us tracking it.
//
//   - Repetition activation — OSMD attaches Repetition objects to
//     measures' First/LastRepetitionInstructions, not necessarily to
//     Sheet.Repetitions. We walk every measure to surface them all
//     and bump UserNumberOfRepetitions to 2+ so the iterator
//     actually performs back-jumps.
//
//   - render() retry — first pass can throw GetWidth on complex
//     scores (cache-miss); a second attempt usually succeeds because
//     the first pass populated VexFlow's caches. Both throws → log
//     and continue with the partial SVG (the note extractor has its
//     own per-step try/catch).
//
//   - cursor.show() / .reset() each wrapped in try/catch — cursor
//     ops re-query unformatted notes; we don't want an isolated
//     cursor failure to kill the whole load.

import type * as OSMD from 'opensheetmusicdisplay';

/** Instance shape returned by the OSMD ctor. Re-exported via
 *  `typeof import` so tests don't need to mock the full lib. */
export type OsmdInstance = OSMD.OpenSheetMusicDisplay;

export interface OsmdInitDeps {
  /** The OSMD module surface — pass `opensheetmusicdisplay` (the
   *  npm package) directly in production, or a mock in tests. */
  opensheetmusicdisplay: typeof OSMD | undefined;
  /** Returns the current song record being loaded. Reads at call
   *  time so a rapid selectSong() during boot resolves to the
   *  right URL pair. */
  getCurrentSong: () => { mxlUrl?: string | null; xmlUrl?: string | null } | null;
  /** ID of the container <div> OSMD draws into. Defaults to
   *  'osmdContainer' (matches the legacy shell). */
  containerId?: string;
}

export interface OsmdInit {
  /** Idempotent — caches the in-flight Promise so concurrent
   *  callers (boot + first selectSong) collapse to one instantiate.
   *  Returns the cached instance on subsequent calls. */
  initOsmd(): Promise<OsmdInstance>;
  /** Test/teardown hook — clears the cached instance + in-flight
   *  promise so a test can re-init. */
  reset(): void;
}

const DEFAULT_CONTAINER_ID = 'osmdContainer';

export function createOsmdInit(deps: OsmdInitDeps): OsmdInit {
  let instance: OsmdInstance | null = null;
  let inflight: Promise<OsmdInstance> | null = null;
  // [Bug fix 2026-05-09] Track which URL is currently loaded into the
  // instance. The previous code returned the cached instance on every
  // init() call regardless of which song was selected — so switching
  // from fur_elise to alla_turca / a user song never re-ran
  // `inst.load(newUrl)`, leaving OSMD's Sheet.SourceMeasures bound to
  // the previous song. Downstream `extractNotesFromOsmd` then walked
  // the stale iterator and `expandNotesByPlaybackOrder` produced
  // NaN-tainted timings (see server.log
  // `[DIAG/play.note] i=0 t=NaN dur=NaN` from 2026-05-09 03:03:57).
  let loadedUrl: string | null = null;

  async function init(): Promise<OsmdInstance> {
    if (!deps.opensheetmusicdisplay) {
      throw new Error('OSMD library not loaded');
    }

    // Resolve the URL FIRST so the cache check + the inflight check
    // both see the same key.
    const song = deps.getCurrentSong();
    const url = song?.xmlUrl || song?.mxlUrl;
    if (!url) throw new Error('No xmlUrl / mxlUrl on the current song');

    // Cache hit: same URL is already fully loaded into the instance.
    if (instance && loadedUrl === url && !inflight) return instance;

    // In-flight load (for ANY url): wait for it to settle, then retry
    // — if it loaded a different URL, the next call will re-enter
    // and trigger our re-load path.
    if (inflight) return inflight;

    inflight = (async () => {
      const lib = deps.opensheetmusicdisplay!;

      // First-time setup: create the OSMD instance + apply the
      // engraving-rules quirk fixes. Reused across song switches.
      if (!instance) {
        const inst = new lib.OpenSheetMusicDisplay(deps.containerId ?? DEFAULT_CONTAINER_ID, {
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawCredits: false,
          drawPartNames: false,
          drawHiddenNotes: false,
          autoResize: false,
          backend: 'svg',
          // ── Cursor + scroll strategy [Phase 0e bug fix, 2026-05-09 v3] ──
          //
          // CursorType 1 (ThinLeft) = thin gold vertical line spanning
          // the full grand-staff system. Industry-standard cursor for
          // OSMD-based players (musicxml-player, osmd-audio-player).
          // Visible at any zoom; height-tracking the staff is the
          // expected visual.
          //
          // OSMD's `followCursor` is OFF — we drive scroll with the
          // browser-native `scrollIntoView({ block: 'nearest' })`
          // pattern in osmd-cursor.ts/ensureCursorVisible. Rationale:
          //   - OSMD's built-in follow uses `block: 'center'`, which
          //     puts the cursor CENTER at viewport center. With
          //     grand-staff systems of varying heights (130–219px) the
          //     center-anchor swings the staff TOP ~45px per onset,
          //     reading as "drift" to the user.
          //   - `block: 'nearest'` is the standard "follow this
          //     element" idiom (see scroll-into-view-if-needed): it
          //     scrolls the minimum amount necessary to keep the
          //     cursor visible — zero scroll when in viewport, minimal
          //     scroll when about to leave. Naturally produces a
          //     page-turn at system boundaries because the next
          //     system is the "nearest off-screen" target.
          followCursor: false,
          cursorsOptions: [{ type: 1, color: '#FFD700', alpha: 0.85, follow: false }],
        });

        // RenderPedals quirk — see header note.
        try {
          (inst as any).EngravingRules.RenderPedals = false;
        } catch (e) {
          console.warn('[OSMD] could not disable pedal render: ' + (e as Error).message);
        }
        // CursorIgnoreRepetitions = false — let OSMD's iterator handle
        // back-jumps at repeat ends. The cursor is driven by sheet
        // timestamps via `new MusicPartManagerIterator(sheet, ts)`
        // (see osmd-cursor.ts/setCursorToNote), and the constructor's
        // walk only resolves to the correct repeat iteration when this
        // flag is false — the back-jump branch is gated on it.
        try {
          (inst as any).EngravingRules.CursorIgnoreRepetitions = false;
        } catch {
          /* older OSMD: option doesn't exist, behavior is the same */
        }
        instance = inst;
      }

      // OSMD's load() accepts both .mxl URLs (zipped) and plain
      // MusicXML URLs. We prefer the plain XML URL when available
      // because some .mxl archives contain an inner XML file with a
      // non-standard name (e.g. `lg-8683180.xml` instead of the
      // conventional `score.xml`). OSMD's MXL container reader has
      // historically been quirky around such files — observed in
      // production: alla_turca.mxl loaded but yielded zero measures
      // / zero notes, throwing 'No notes extracted from MusicXML'
      // downstream (server.log [DIAG-FULLSONG] confirmed). The .xml
      // path bypasses the MXL unzip entirely and is rock-solid for
      // every score we ship + every user-imported one (user songs
      // are already xml-first because registerUserSong unzips the
      // .mxl at import time and stores a blob URL of the plain XML
      // in `xmlUrl`).
      const inst = instance;
      await inst.load(url);
      loadedUrl = url;

      // Activate Repetition objects so the iterator performs back-
      // jumps. See header note.
      const repSet = new Set<{ UserNumberOfRepetitions?: number; NumberOfRepetitions?: number }>();

      const measures: any[] = (inst as any).Sheet?.SourceMeasures || [];

      // [Bug fix 2026-05-09] Sanity gate. OSMD's load() can resolve
      // successfully while leaving Sheet null/empty — the symptom of
      // a malformed .mxl container, a stale blob URL after IDB
      // rehydration, or any of the OSMD parser quirks that emit
      // `OSMD.Cursor.resetIterator(): sheet or measures were
      // null/undefined` (seen in server.log on every broken load).
      // Throwing here turns the silent NaN-timing bug into a loud
      // error that the score-loader already surfaces via the
      // alertAudioInitError path.
      if (measures.length === 0) {
        // Drop the cached state so the NEXT init() call retries from
        // scratch instead of returning the broken instance.
        loadedUrl = null;
        throw new Error('OSMD load: Sheet.SourceMeasures is empty after load(' + url + ')');
      }

      for (const m of measures) {
        for (const list of [m.FirstRepetitionInstructions, m.LastRepetitionInstructions]) {
          if (!list) continue;
          for (const ri of list) {
            if (ri && ri.parentRepetition) repSet.add(ri.parentRepetition);
          }
        }
      }
      for (const r of repSet) {
        if (typeof r.UserNumberOfRepetitions === 'number' && r.UserNumberOfRepetitions < 2) {
          r.UserNumberOfRepetitions = Math.max(2, r.NumberOfRepetitions || 2);
        }
      }
      console.log(
        '[OSMD] measures=' +
          measures.length +
          ' repetitions=' +
          repSet.size +
          ' Sheet.Repetitions=' +
          ((inst as any).Sheet?.Repetitions?.length || 0)
      );

      // render() retry — see header note.
      let renderOk = false;
      for (let attempt = 0; attempt < 2 && !renderOk; attempt++) {
        try {
          inst.render();
          renderOk = true;
        } catch (e) {
          console.warn(
            '[OSMD] render attempt ' + (attempt + 1) + ' failed: ' + (e as Error).message
          );
        }
      }
      if (!renderOk) {
        console.warn('[OSMD] both render attempts failed — continuing with partial state');
      }

      // Cursor show/reset — see header note.

      const cursor = (inst as any).cursor;
      if (cursor) {
        try {
          cursor.show();
        } catch (e) {
          console.warn('[OSMD] cursor.show failed: ' + (e as Error).message);
        }
        try {
          cursor.reset();
        } catch (e) {
          console.warn('[OSMD] cursor.reset failed: ' + (e as Error).message);
        }
      }

      return inst;
    })();

    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  }

  return {
    initOsmd: init,
    reset: () => {
      instance = null;
      inflight = null;
    },
  };
}
