// OSMD shell — Phase 0d batch 103.
//
// Bundles the OSMD instance + score-loader + cursor + osmdAdapter into
// one factory. Owns the mutable `osmd` ref so the shell doesn't have to.
// Also pins the `osmdAdapter` to `globalThis.osmdAdapter` so Phase
// 0c-extracted modules (ScoreLoader, PracticeToneAudio, etc.) can resolve
// it bare.

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
  /** Vendored OSMD ctor — null on early load (typeof guard). */
  opensheetmusicdisplay: any;
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
  /** osmdScrollToCursor — called from start-practice-section + practice-tick. */
  osmdScrollToCursor: () => void;
  /** Reset throttle on section start so the cursor scrolls immediately. */
  resetScrollThrottle: () => void;
  /** OSMD cursor object — passed to start-practice-section deps. */
  cursor: ReturnType<typeof OsmdCursor.createOsmdCursor>;
  /** OsmdAdapter typed-boundary — also pinned to globalThis.osmdAdapter. */
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
    opensheetmusicdisplay: deps.opensheetmusicdisplay,
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
      parsePlaybackOrderFromXml: (globalThis as any).PianoCore.parsePlaybackOrderFromXml,
      expandNotesByPlaybackOrder: (globalThis as any).PianoCore.expandNotesByPlaybackOrder,
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
  const dumpLoadDiagnostics = (p: any) =>
    (globalThis as any).PianoCore.dumpLoadDiagnostics(p, deps.remoteLog);

  const _scoreLoader = ScoreLoader.createScoreLoader({
    getCurrentSong: deps.getCurrentSong,
    initOsmd,
    getOsmd: () => osmd,
    parseScoreTimingFromXml: (globalThis as any).PianoCore.parseScoreTimingFromXml,
    buildMeasureTimingFromXml: (globalThis as any).PianoCore.buildMeasureTimingFromXml,
    extractNotesFromOsmd,
    fetchPlaybackOrder: fetchPlaybackOrder as any,
    expandNotesByPlaybackOrder: expandNotesByPlaybackOrder as any,
    buildSectionsFromDefs: deps.buildSectionsFromDefs,
    dumpLoadDiagnostics,
    remoteLogEnabled: deps.remoteLogEnabled,
  });

  const _osmdCursor = OsmdCursor.createOsmdCursor({
    getOsmd: () => osmd,
    getContainer: () => deps.osmdContainer,
  });

  const osmdAdapter = OsmdAdapterMod.createOsmdAdapter({
    getOsmd: () => osmd,
    getCurrentSong: deps.getCurrentSong,
    initOsmd,
    extractNotesFromOsmd,
    cursor: _osmdCursor,
  });
  // Promote to globalThis so Phase 0c-extracted modules can resolve it bare
  // (matches the Tone / OSMD / JSZip / PianoCore main.ts globals).
  (globalThis as any).osmdAdapter = osmdAdapter;

  return {
    getOsmd: () => osmd,
    setOsmd: (next: any) => {
      osmd = next;
    },
    initOsmd,
    loadCurrentScore: () => _scoreLoader.loadCurrentScore(),
    osmdScrollToCursor: () => _osmdCursor.scrollToCursor(),
    resetScrollThrottle: () => _osmdCursor.resetScrollThrottle(),
    cursor: _osmdCursor,
    osmdAdapter,
    extractNotesFromOsmd,
    fetchPlaybackOrder,
    expandNotesByPlaybackOrder,
  };
}
