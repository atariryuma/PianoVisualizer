// @vitest-environment happy-dom
//
// Tests for packages/web/src/osmd-adapter.ts.
//
// Verifies the typed boundary that score-loader/cursor use to drive
// OSMD: every method delegates correctly + the defensive guards
// (try/catch around cursor.show/hide, null-check on
// getCursorGeometry) behave as documented.

import { describe, it, expect, vi } from 'vitest';
import { createOsmdAdapter, type OsmdAdapterDeps } from '../src/osmd-adapter';

interface Mocks {
  initOsmd: ReturnType<typeof vi.fn>;
  extractNotesFromOsmd: ReturnType<typeof vi.fn>;
  setCursorToNote: ReturnType<typeof vi.fn>;
  resetToStart: ReturnType<typeof vi.fn>;
  highlightCurrentNotes: ReturnType<typeof vi.fn>;
  clearHighlights: ReturnType<typeof vi.fn>;
}

function makeFixture(over: Partial<OsmdAdapterDeps> = {}): {
  adapter: ReturnType<typeof createOsmdAdapter>;
  deps: OsmdAdapterDeps;
  mocks: Mocks;
  song: { mxlUrl: string };
  osmd: {
    cursor?: {
      show: ReturnType<typeof vi.fn>;
      hide: ReturnType<typeof vi.fn>;
      cursorElement?: HTMLElement | null;
    };
  } | null;
} {
  const osmd: any = {
    cursor: {
      show: vi.fn(),
      hide: vi.fn(),
      cursorElement: null,
    },
  };
  const song = { mxlUrl: 'original.mxl' };
  const mocks: Mocks = {
    initOsmd: vi.fn(async () => osmd),
    extractNotesFromOsmd: vi.fn(() => ({
      notes: [{ midi: 60 }],
      measureStartSec: [0, 1.5, 3.0],
      measureBpm: [120, 120, 130],
    })),
    setCursorToNote: vi.fn(),
    resetToStart: vi.fn(),
    highlightCurrentNotes: vi.fn(),
    clearHighlights: vi.fn(),
  };
  const deps: OsmdAdapterDeps = {
    getOsmd: () => osmd,
    getCurrentSong: () => song,
    initOsmd: mocks.initOsmd,
    extractNotesFromOsmd: mocks.extractNotesFromOsmd,
    cursor: {
      setCursorToNote: mocks.setCursorToNote,
      resetToStart: mocks.resetToStart,
      highlightCurrentNotes: mocks.highlightCurrentNotes,
      clearHighlights: mocks.clearHighlights,
    },
    ...over,
  };
  return { adapter: createOsmdAdapter(deps), deps, mocks, song, osmd };
}

describe('createOsmdAdapter — load', () => {
  it('mutates currentSong.mxlUrl to the new URL + runs initOsmd', async () => {
    const fx = makeFixture();
    await fx.adapter.load('https://example.com/score.mxl');
    expect(fx.song.mxlUrl).toBe('https://example.com/score.mxl');
    expect(fx.mocks.initOsmd).toHaveBeenCalledOnce();
  });

  it('no-throw when currentSong is null (defensive)', async () => {
    const fx = makeFixture({ getCurrentSong: () => null });
    await expect(fx.adapter.load('x.mxl')).resolves.toBeUndefined();
    expect(fx.mocks.initOsmd).toHaveBeenCalledOnce();
  });
});

describe('createOsmdAdapter — isLoaded', () => {
  it('returns true when getOsmd returns a non-null instance', () => {
    const fx = makeFixture();
    expect(fx.adapter.isLoaded()).toBe(true);
  });

  it('returns false when getOsmd returns null (pre-init)', () => {
    const fx = makeFixture({ getOsmd: () => null });
    expect(fx.adapter.isLoaded()).toBe(false);
  });
});

describe('createOsmdAdapter — extractNotes', () => {
  it('flattens measureStartSec + measureBpm into a measureTiming array', () => {
    const fx = makeFixture();
    const result = fx.adapter.extractNotes();
    expect(result.notes).toEqual([{ midi: 60 }]);
    expect(result.measureTiming).toEqual([
      { startSec: 0, bpm: 120 },
      { startSec: 1.5, bpm: 120 },
      { startSec: 3.0, bpm: 130 },
    ]);
  });

  it('falls back to bpm=72 when measureBpm has gaps', () => {
    const fx = makeFixture({
      extractNotesFromOsmd: vi.fn(() => ({
        notes: [],
        measureStartSec: [0, 1, 2],
        measureBpm: [120], // shorter than measureStartSec
      })),
    });
    const result = fx.adapter.extractNotes();
    expect(result.measureTiming).toEqual([
      { startSec: 0, bpm: 120 },
      { startSec: 1, bpm: 72 },
      { startSec: 2, bpm: 72 },
    ]);
  });

  it('forwards xmlMeasureTiming option to extractNotesFromOsmd', () => {
    const fx = makeFixture();
    const xmlTiming = { foo: 'bar' };
    fx.adapter.extractNotes({ xmlMeasureTiming: xmlTiming } as any);
    expect(fx.mocks.extractNotesFromOsmd).toHaveBeenCalledWith(xmlTiming, null);
  });
});

describe('createOsmdAdapter — cursor delegates', () => {
  it('cursorTo forwards to cursor.setCursorToNote with shaped note', () => {
    const fx = makeFixture();
    fx.adapter.cursorTo(5, 1.5);
    expect(fx.mocks.setCursorToNote).toHaveBeenCalledWith({
      measureIdx: 5,
      inBarQuarters: 1.5,
    });
  });

  it('resetCursor forwards to cursor.resetToStart', () => {
    const fx = makeFixture();
    fx.adapter.resetCursor();
    expect(fx.mocks.resetToStart).toHaveBeenCalledOnce();
  });

  it('highlightCurrentNotes forwards to cursor.highlightCurrentNotes', () => {
    const fx = makeFixture();
    fx.adapter.highlightCurrentNotes();
    expect(fx.mocks.highlightCurrentNotes).toHaveBeenCalledOnce();
  });

  it('clearHighlights forwards to cursor.clearHighlights', () => {
    const fx = makeFixture();
    fx.adapter.clearHighlights();
    expect(fx.mocks.clearHighlights).toHaveBeenCalledOnce();
  });
});

describe('createOsmdAdapter — showCursor / hideCursor', () => {
  it('showCursor calls osmd.cursor.show', () => {
    const fx = makeFixture();
    fx.adapter.showCursor();
    expect(fx.osmd?.cursor?.show).toHaveBeenCalledOnce();
  });

  it('hideCursor calls osmd.cursor.hide', () => {
    const fx = makeFixture();
    fx.adapter.hideCursor();
    expect(fx.osmd?.cursor?.hide).toHaveBeenCalledOnce();
  });

  it('showCursor no-throws when osmd is null', () => {
    const fx = makeFixture({ getOsmd: () => null });
    expect(() => fx.adapter.showCursor()).not.toThrow();
  });

  it('showCursor swallows cursor.show() throws (OSMD reload race)', () => {
    const fx = makeFixture({
      getOsmd: () =>
        ({
          cursor: {
            show: vi.fn(() => {
              throw new Error('cursor element detached');
            }),
          },
        }) as any,
    });
    expect(() => fx.adapter.showCursor()).not.toThrow();
  });

  it('hideCursor swallows cursor.hide() throws', () => {
    const fx = makeFixture({
      getOsmd: () =>
        ({
          cursor: {
            hide: vi.fn(() => {
              throw new Error('detached');
            }),
          },
        }) as any,
    });
    expect(() => fx.adapter.hideCursor()).not.toThrow();
  });
});

describe('createOsmdAdapter — getCursorGeometry', () => {
  it('returns null when osmd is null', () => {
    const fx = makeFixture({ getOsmd: () => null });
    expect(fx.adapter.getCursorGeometry()).toBeNull();
  });

  it('returns null when cursor element is absent', () => {
    const fx = makeFixture();
    expect(fx.adapter.getCursorGeometry()).toBeNull();
  });

  it('returns offsetTop + offsetHeight when cursor element exists', () => {
    const cursorEl = document.createElement('div');
    Object.defineProperty(cursorEl, 'offsetTop', { value: 120, configurable: true });
    Object.defineProperty(cursorEl, 'offsetHeight', { value: 45, configurable: true });
    const fx = makeFixture({
      getOsmd: () =>
        ({
          cursor: {
            cursorElement: cursorEl,
          },
        }) as any,
    });
    expect(fx.adapter.getCursorGeometry()).toEqual({ offsetTop: 120, offsetHeight: 45 });
  });

  it('defaults offsetHeight to 30 when cursor element has 0 height', () => {
    const cursorEl = document.createElement('div');
    Object.defineProperty(cursorEl, 'offsetTop', { value: 100, configurable: true });
    Object.defineProperty(cursorEl, 'offsetHeight', { value: 0, configurable: true });
    const fx = makeFixture({
      getOsmd: () =>
        ({
          cursor: {
            cursorElement: cursorEl,
          },
        }) as any,
    });
    expect(fx.adapter.getCursorGeometry()?.offsetHeight).toBe(30);
  });
});
