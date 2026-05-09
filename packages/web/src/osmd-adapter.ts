// OSMD adapter — Phase 0d batch 99.
//
// Implements @piano/core's `OsmdAdapter` interface so the typed
// loader/cursor modules can drive OSMD without importing it directly.
// (`opensheetmusicdisplay` is a wide, version-fragile surface — every
// caller goes through this typed boundary.)
//
// `extractNotes` is a thin shim; the real extraction happens in
// `score-loader.ts > loadCurrentScore()` because it needs the
// pre-parsed `xmlMeasureTiming` + `scoreTiming` sidecars that the
// shell shim builds before OSMD is fully ready.

import type { OsmdAdapter } from '@piano/core';

export interface OsmdAdapterDeps {
  /** Live OSMD instance ref — null pre-init, set by `initOsmd()`. */
  getOsmd: () => any;
  /** Current built-in / user song ref — `mxlUrl` gets mutated by `load()`. */
  getCurrentSong: () => any;
  /** Async OSMD construct + render. Mutates the outer `osmd` ref. */
  initOsmd: () => Promise<any>;
  /** Shell `extractNotesFromOsmd` shim — returns `{notes, measureStartSec, measureBpm, _diag}`. */
  extractNotesFromOsmd: (xmlMeasureTiming: any, scoreTiming: any) => any;
  /** OsmdCursor (batch 32) — for cursor-to-note + highlight wiring. */
  cursor: {
    setCursorToNote(note: any): void;
    resetToStart(): void;
    highlightCurrentNotes(): void;
    clearHighlights(): void;
  };
}

/** Build the `OsmdAdapter` interface implementation. Returns a frozen
 *  object literal that closes over the deps thunks — no per-call
 *  allocation in the hot path. */
export function createOsmdAdapter(deps: OsmdAdapterDeps): OsmdAdapter {
  return {
    async load(url) {
      const song = deps.getCurrentSong();
      if (song) song.mxlUrl = url;
      await deps.initOsmd();
    },
    isLoaded() {
      return !!deps.getOsmd();
    },
    extractNotes(opts) {
      const ret = deps.extractNotesFromOsmd(opts?.xmlMeasureTiming, null);
      return {
        notes: ret.notes,
        measureTiming: ret.measureStartSec.map((startSec: number, i: number) => ({
          startSec,
          bpm: ret.measureBpm[i] ?? 72,
        })),
      };
    },
    cursorTo(measureIdx, inBarQuarters) {
      deps.cursor.setCursorToNote({ measureIdx, inBarQuarters });
    },
    resetCursor() {
      deps.cursor.resetToStart();
    },
    showCursor() {
      const osmd = deps.getOsmd();
      try {
        if (osmd && osmd.cursor) osmd.cursor.show();
      } catch (_) {
        /* OSMD reload race — cursor element detached */
      }
    },
    hideCursor() {
      const osmd = deps.getOsmd();
      try {
        if (osmd && osmd.cursor) osmd.cursor.hide();
      } catch (_) {
        /* OSMD reload race */
      }
    },
    getCursorGeometry() {
      const osmd = deps.getOsmd();
      if (!osmd || !osmd.cursor || !osmd.cursor.cursorElement) return null;
      return {
        offsetTop: osmd.cursor.cursorElement.offsetTop,
        offsetHeight: osmd.cursor.cursorElement.offsetHeight || 30,
      };
    },
    // Color param on the interface is ignored — implementation hard-codes HIGHLIGHT_FILL.
    highlightCurrentNotes() {
      deps.cursor.highlightCurrentNotes();
    },
    clearHighlights() {
      deps.cursor.clearHighlights();
    },
  };
}
