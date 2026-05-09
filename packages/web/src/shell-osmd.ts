// OSMD shell — Phase 0d batch 103.
//
// Bundles the OSMD instance + score-loader + cursor + osmdAdapter into
// one factory. Owns the mutable `osmd` ref so the shell doesn't have to.

import * as opensheetmusicdisplay from 'opensheetmusicdisplay';
import * as PianoCore from '@piano/core';
import * as OsmdInit from './osmd-init';
import * as NoteExtractor from './note-extractor';
import * as PlaybackOrder from './playback-order';
import * as ScoreLoader from './score-loader';
import * as OsmdCursor from './osmd-cursor';
import * as OsmdAdapterMod from './osmd-adapter';

export interface ShellOsmdDeps {
  /** Live song ref — `mxlUrl` mutated by `osmdAdapter.load(url)`. */
  getCurrentSong: () => any;
  /** Container for the OSMD <svg> render. */
  osmdContainer: HTMLElement;
  /** Score-load logging gate (REMOTE_LOG_ENABLED). */
  remoteLogEnabled: boolean;
  remoteLog: (msg: any) => void;
  /** From PianoCore — re-exposed for the score-loader deps. */
  buildSectionsFromDefs: any;
}

export interface ShellOsmd {
  /** Read-only accessor; mutated internally by initOsmd / score-loader load. */
  getOsmd: () => any;
  /** SelectSong calls `setOsmd(null)` to invalidate the instance so the next
   *  loadCurrentScore() rebuilds it. */
  setOsmd: (osmd: any) => void;
  initOsmd: () => Promise<any>;
  /** Score loader entry. Throws on partial-fail (empty Sheet etc.). */
  loadCurrentScore: () => Promise<void>;
  /** OSMD cursor object — passed to start-practice-section deps.
   *  Auto-scrolls via OSMD's `cursor.update()` (cursorOptions.follow:
   *  true set in osmd-init.ts). */
  cursor: ReturnType<typeof OsmdCursor.createOsmdCursor>;
  /** OsmdAdapter typed-boundary. */
  osmdAdapter: import('@piano/core').OsmdAdapter;
  /** Shell shim around NoteExtractor — needed by start-practice-section deps. */
  extractNotesFromOsmd: (xmlMeasureTiming: any, scoreTiming: any) => any;
  /** PlaybackOrder + measure-timing exposes — needed by start-practice-section. */
  fetchPlaybackOrder: (forSong?: any) => Promise<any>;
  expandNotesByPlaybackOrder: (
    baseNotes: any,
    order: any,
    measures: any,
    sourceMeasureStartSec?: number[]
  ) => any;
}

export function createShellOsmd(deps: ShellOsmdDeps): ShellOsmd {
  let osmd: any = null;

  const _osmdInit = OsmdInit.createOsmdInit({
    opensheetmusicdisplay,
    getCurrentSong: deps.getCurrentSong,
  });
  const initOsmd = async (): Promise<any> => {
    osmd = await _osmdInit.initOsmd();
    return osmd;
  };

  const extractNotesFromOsmd = (xmlMeasureTiming: any, scoreTiming: any) =>
    NoteExtractor.extractNotesFromOsmd(osmd, {
      xmlMeasureTiming,
      scoreTiming,
      collectDiag: deps.remoteLogEnabled,
    });

  const _playbackOrder = PlaybackOrder.createPlaybackOrder({
    fns: {
      parsePlaybackOrderFromXml: PianoCore.parsePlaybackOrderFromXml,
      // PianoCore's signature is generically narrower than PlaybackOrder's
      // expected `unknown[]`; cast at the boundary.
      expandNotesByPlaybackOrder: PianoCore.expandNotesByPlaybackOrder as never,
    },
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  });
  const fetchPlaybackOrder = async (forSong?: any) =>
    _playbackOrder.fetchPlaybackOrder(forSong || deps.getCurrentSong());
  const expandNotesByPlaybackOrder = (
    baseNotes: any,
    order: any,
    measures: any,
    sourceMeasureStartSec?: number[]
  ) => _playbackOrder.expandNotesByPlaybackOrder(baseNotes, order, measures, sourceMeasureStartSec);

  // @piano/core/library/diag-load. The shim threads the shell remoteLog.
  const dumpLoadDiagnostics = (p: any) => PianoCore.dumpLoadDiagnostics(p, deps.remoteLog);

  const _scoreLoader = ScoreLoader.createScoreLoader({
    getCurrentSong: deps.getCurrentSong,
    initOsmd,
    getOsmd: () => osmd,
    parseScoreTimingFromXml: PianoCore.parseScoreTimingFromXml,
    buildMeasureTimingFromXml: PianoCore.buildMeasureTimingFromXml,
    extractNotesFromOsmd,
    fetchPlaybackOrder: fetchPlaybackOrder as any,
    expandNotesByPlaybackOrder: expandNotesByPlaybackOrder as any,
    buildSectionsFromDefs: deps.buildSectionsFromDefs,
    dumpLoadDiagnostics,
    remoteLogEnabled: deps.remoteLogEnabled,
  });

  // setCursorToNote pulls `MusicPartManagerIterator` + `Fraction` off
  // the imported OSMD namespace to drive the cursor by sheet timestamp
  // (the musicxml-player pattern); cursor.update() then auto-scrolls
  // via OSMD's scrollIntoView (cursorOptions.follow: true in osmd-init.ts).
  const _osmdCursor = OsmdCursor.createOsmdCursor({
    getOsmd: () => osmd,
    getLib: () => opensheetmusicdisplay as unknown as OsmdCursor.OsmdLibRef,
  });

  const osmdAdapter = OsmdAdapterMod.createOsmdAdapter({
    getOsmd: () => osmd,
    getCurrentSong: deps.getCurrentSong,
    initOsmd,
    extractNotesFromOsmd,
    cursor: _osmdCursor,
  });

  return {
    getOsmd: () => osmd,
    setOsmd: (next: any) => {
      osmd = next;
    },
    initOsmd,
    loadCurrentScore: () => _scoreLoader.loadCurrentScore(),
    cursor: _osmdCursor,
    osmdAdapter,
    extractNotesFromOsmd,
    fetchPlaybackOrder,
    expandNotesByPlaybackOrder,
  };
}
