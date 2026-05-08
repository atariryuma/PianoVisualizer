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
//   - CursorIgnoreRepetitions = true — OSMD 1.9.6+ made cursor.next()
//     follow repetitions; our own playback-order / expand-by-order
//     pipeline already unfolds repeats by re-parsing the raw XML, so
//     we ask OSMD to keep the legacy 1.8.x linear-walk behavior.
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

  async function init(): Promise<OsmdInstance> {
    if (instance) return instance;
    if (inflight) return inflight;
    if (!deps.opensheetmusicdisplay) {
      throw new Error('OSMD library not loaded');
    }

    inflight = (async () => {
      const lib = deps.opensheetmusicdisplay!;
      const inst = new lib.OpenSheetMusicDisplay(deps.containerId ?? DEFAULT_CONTAINER_ID, {
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawCredits: false,
        drawPartNames: false,
        drawHiddenNotes: false,
        autoResize: false,
        backend: 'svg',
        cursorsOptions: [{ type: 1, color: '#FFD700', alpha: 0.85, follow: false }],
      });

      // RenderPedals quirk — see header note.
      try {
         
        (inst as any).EngravingRules.RenderPedals = false;
      } catch (e) {
        console.warn('[OSMD] could not disable pedal render: ' + (e as Error).message);
      }
      // CursorIgnoreRepetitions — see header note.
      try {
         
        (inst as any).EngravingRules.CursorIgnoreRepetitions = true;
      } catch {
        /* older OSMD: option doesn't exist, behavior is the same */
      }

      // OSMD's load() accepts both .mxl URLs (zipped) and plain
      // MusicXML URLs. User-added songs may carry either; fall back
      // to whichever is present.
      const song = deps.getCurrentSong();
      const url = song?.mxlUrl || song?.xmlUrl;
      if (!url) throw new Error('No mxlUrl / xmlUrl on the current song');
      await inst.load(url);

      // Activate Repetition objects so the iterator performs back-
      // jumps. See header note.
      const repSet = new Set<{ UserNumberOfRepetitions?: number; NumberOfRepetitions?: number }>();
       
      const measures: any[] = (inst as any).Sheet?.SourceMeasures || [];
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

      instance = inst;
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
