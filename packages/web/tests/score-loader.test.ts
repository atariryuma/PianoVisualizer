// Tests for packages/web/src/score-loader.ts.
//
// Covers:
//   • Skip-load fast path: _loaded + osmd present → no-op.
//   • Skip-load + missing osmd → re-runs initOsmd only.
//   • In-flight dedupe: concurrent calls share the same promise.
//   • Race safety: stillCurrent thunk bails on song-swap mid-load.
//   • Happy path populates notes / totalSec / playbackOrder / sections /
//     bpm / _loaded / _bpmRescaled.
//   • XML cache: re-uses song._xmlText when present (no fetch).
//   • Empty notes → throws.
//   • Playback order parse fail → linear measure-index fallback.
//   • BPM source priority: XML scoreTiming wins, OSMD measure
//     TempoInBPM fallback, default 72.
//   • DIAG dump fires only when remoteLogEnabled=true.
//   • Drops song._xmlText after load.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createScoreLoader,
  type ScoreLoaderDeps,
  type ScoreLoaderSong,
  type OsmdLikeNote,
  type ExtractResult,
} from '../src/score-loader';

// ─── fixtures ───────────────────────────────────────────────────────

function makeNote(over: Partial<OsmdLikeNote> = {}): OsmdLikeNote {
  return {
    midi: 60,
    hand: 'R',
    timeSec: 0,
    durSec: 0.5,
    measureIdx: 0,
    inBarQuarters: 0,
    ...over,
  };
}

function makeFakeOsmd(measures: { TempoInBPM?: number }[] = []) {
  return { Sheet: { SourceMeasures: measures } };
}

interface Spies {
  initOsmd: ReturnType<typeof vi.fn>;
  parseScoreTimingFromXml: ReturnType<typeof vi.fn>;
  buildMeasureTimingFromXml: ReturnType<typeof vi.fn>;
  extractNotesFromOsmd: ReturnType<typeof vi.fn>;
  fetchPlaybackOrder: ReturnType<typeof vi.fn>;
  expandNotesByPlaybackOrder: ReturnType<typeof vi.fn>;
  buildSectionsFromDefs: ReturnType<typeof vi.fn>;
  dumpLoadDiagnostics: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
}

function makeFixture(
  over: {
    song?: ScoreLoaderSong;
    scoreTiming?: { leadingQuarterBpm?: number } | null;
    extractRet?: ExtractResult;
    expanded?: OsmdLikeNote[];
    measures?: { TempoInBPM?: number }[];
    order?: number[];
    remoteLogEnabled?: boolean;
  } = {}
) {
  const song: ScoreLoaderSong = over.song ?? {
    id: 'test',
    mxlUrl: null,
    xmlUrl: 'http://x/song.xml',
  };

  const scoreTiming =
    over.scoreTiming === undefined ? { leadingQuarterBpm: 120 } : over.scoreTiming;

  const extractRet: ExtractResult = over.extractRet ?? {
    notes: [makeNote(), makeNote({ midi: 64 })],
    measureStartSec: [0, 1, 2],
    measureBpm: [120, 120, 120],
  };

  const expanded = over.expanded ?? extractRet.notes.map((n, i) => makeNote({ ...n, timeSec: i }));
  const measures = over.measures ?? [{ TempoInBPM: 120 }, { TempoInBPM: 120 }];
  const order = over.order ?? [0, 1, 2];

  const spies: Spies = {
    initOsmd: vi.fn().mockResolvedValue(undefined),
    parseScoreTimingFromXml: vi.fn().mockReturnValue(scoreTiming),
    buildMeasureTimingFromXml: vi.fn().mockReturnValue({}),
    extractNotesFromOsmd: vi.fn().mockReturnValue(extractRet),
    fetchPlaybackOrder: vi.fn().mockResolvedValue(order),
    expandNotesByPlaybackOrder: vi.fn().mockReturnValue(expanded),
    buildSectionsFromDefs: vi.fn().mockReturnValue([{ id: 's0' }]),
    dumpLoadDiagnostics: vi.fn(),
    fetch: vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<xml/>') }),
  };

  let currentSong: ScoreLoaderSong | null = song;
  const osmd = makeFakeOsmd(measures);

  const deps: ScoreLoaderDeps = {
    getCurrentSong: () => currentSong,
    initOsmd: spies.initOsmd,
    getOsmd: () => osmd,
    parseScoreTimingFromXml:
      spies.parseScoreTimingFromXml as unknown as ScoreLoaderDeps['parseScoreTimingFromXml'],
    buildMeasureTimingFromXml:
      spies.buildMeasureTimingFromXml as unknown as ScoreLoaderDeps['buildMeasureTimingFromXml'],
    extractNotesFromOsmd:
      spies.extractNotesFromOsmd as unknown as ScoreLoaderDeps['extractNotesFromOsmd'],
    fetchPlaybackOrder:
      spies.fetchPlaybackOrder as unknown as ScoreLoaderDeps['fetchPlaybackOrder'],
    expandNotesByPlaybackOrder:
      spies.expandNotesByPlaybackOrder as unknown as ScoreLoaderDeps['expandNotesByPlaybackOrder'],
    buildSectionsFromDefs:
      spies.buildSectionsFromDefs as unknown as ScoreLoaderDeps['buildSectionsFromDefs'],
    dumpLoadDiagnostics: spies.dumpLoadDiagnostics,
    remoteLogEnabled: over.remoteLogEnabled ?? false,
    fetch: spies.fetch as unknown as typeof fetch,
  };

  return {
    loader: createScoreLoader(deps),
    spies,
    song,
    setCurrentSong: (s: ScoreLoaderSong | null) => {
      currentSong = s;
    },
    getCurrentSong: () => currentSong,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── skip-load fast paths ─────────────────────────────────────────

describe('loadCurrentScore — skip-load', () => {
  it('no-op when getCurrentSong returns null', async () => {
    const fx = makeFixture();
    fx.setCurrentSong(null);
    await fx.loader.loadCurrentScore();
    expect(fx.spies.initOsmd).not.toHaveBeenCalled();
  });

  it('_loaded + osmd present → full no-op', async () => {
    const fx = makeFixture();
    fx.song._loaded = true;
    await fx.loader.loadCurrentScore();
    expect(fx.spies.initOsmd).not.toHaveBeenCalled();
    expect(fx.spies.extractNotesFromOsmd).not.toHaveBeenCalled();
  });

  it('_loaded + osmd missing → re-runs initOsmd only', async () => {
    const song: ScoreLoaderSong = { id: 't', _loaded: true, xmlUrl: 'x' };
    const spies = {
      initOsmd: vi.fn().mockResolvedValue(undefined),
    };
    const deps: ScoreLoaderDeps = {
      getCurrentSong: () => song,
      initOsmd: spies.initOsmd,
      getOsmd: () => null, // osmd nulled after song-switch
      parseScoreTimingFromXml: vi.fn() as unknown as ScoreLoaderDeps['parseScoreTimingFromXml'],
      buildMeasureTimingFromXml: vi.fn() as unknown as ScoreLoaderDeps['buildMeasureTimingFromXml'],
      extractNotesFromOsmd: vi.fn() as unknown as ScoreLoaderDeps['extractNotesFromOsmd'],
      fetchPlaybackOrder: vi.fn() as unknown as ScoreLoaderDeps['fetchPlaybackOrder'],
      expandNotesByPlaybackOrder:
        vi.fn() as unknown as ScoreLoaderDeps['expandNotesByPlaybackOrder'],
      buildSectionsFromDefs: vi.fn(),
      dumpLoadDiagnostics: vi.fn(),
      remoteLogEnabled: false,
    };
    await createScoreLoader(deps).loadCurrentScore();
    expect(spies.initOsmd).toHaveBeenCalledOnce();
  });
});

// ─── in-flight dedupe ──────────────────────────────────────────────

describe('loadCurrentScore — in-flight dedupe', () => {
  it('concurrent calls share the same Promise (single instantiate)', async () => {
    const fx = makeFixture();
    const [r1, r2] = await Promise.all([
      fx.loader.loadCurrentScore(),
      fx.loader.loadCurrentScore(),
    ]);
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
    expect(fx.spies.initOsmd).toHaveBeenCalledOnce();
    expect(fx.spies.extractNotesFromOsmd).toHaveBeenCalledOnce();
  });
});

// ─── race safety ───────────────────────────────────────────────────

describe('loadCurrentScore — race safety', () => {
  it('mid-load song-swap bails before extractNotesFromOsmd', async () => {
    const fx = makeFixture();
    // Make initOsmd resolve "later" so we can swap during the await.
    let releaseInit: (() => void) | null = null;
    fx.spies.initOsmd.mockImplementation(
      () => new Promise<void>((res) => (releaseInit = () => res()))
    );
    const promise = fx.loader.loadCurrentScore();
    await Promise.resolve(); // let the load start
    fx.setCurrentSong({ id: 'other' });
    releaseInit?.();
    await promise;
    expect(fx.spies.extractNotesFromOsmd).not.toHaveBeenCalled();
  });
});

// ─── happy path ────────────────────────────────────────────────────

describe('loadCurrentScore — happy path', () => {
  it('populates notes / totalSec / playbackOrder / sections / bpm / _loaded', async () => {
    const expanded = [makeNote({ timeSec: 0, durSec: 1 }), makeNote({ timeSec: 1.5, durSec: 0.8 })];
    const fx = makeFixture({ expanded });
    await fx.loader.loadCurrentScore();
    expect(fx.song._loaded).toBe(true);
    expect(fx.song.notes).toBe(expanded);
    expect(fx.song.totalSec).toBeCloseTo(2.3, 5);
    expect(fx.song.playbackOrder).toEqual([0, 1, 2]);
    expect(fx.song.sections).toEqual([{ id: 's0' }]);
    expect(fx.song.bpm).toBe(120);
  });

  it('clears _loadingPromise after completion', async () => {
    const fx = makeFixture();
    await fx.loader.loadCurrentScore();
    expect(fx.song._loadingPromise).toBeNull();
  });

  it('drops song._xmlText after load (heap hygiene)', async () => {
    const fx = makeFixture();
    fx.song._xmlText = '<xml/>'; // pre-cache to skip the fetch
    await fx.loader.loadCurrentScore();
    expect(fx.song._xmlText).toBeUndefined();
  });

  it('calls buildSectionsFromDefs with sectionDefs (default empty)', async () => {
    const fx = makeFixture();
    await fx.loader.loadCurrentScore();
    expect(fx.spies.buildSectionsFromDefs).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      [], // default for missing sectionDefs
      expect.any(Array)
    );
  });
});

// ─── XML caching ───────────────────────────────────────────────────

describe('loadCurrentScore — XML caching', () => {
  it('skips fetch when song._xmlText is already set', async () => {
    const fx = makeFixture();
    fx.song._xmlText = '<cached/>';
    await fx.loader.loadCurrentScore();
    expect(fx.spies.fetch).not.toHaveBeenCalled();
    expect(fx.spies.parseScoreTimingFromXml).toHaveBeenCalledWith('<cached/>');
  });

  it('fetches xmlUrl when no cached text', async () => {
    const fx = makeFixture();
    await fx.loader.loadCurrentScore();
    expect(fx.spies.fetch).toHaveBeenCalledWith('http://x/song.xml');
  });

  it('non-fatal fetch failure → continues with extractNotesFromOsmd', async () => {
    const fx = makeFixture();
    fx.spies.fetch.mockRejectedValue(new Error('net'));
    await expect(fx.loader.loadCurrentScore()).resolves.toBeUndefined();
    // Still extracted from OSMD even though XML parse failed.
    expect(fx.spies.extractNotesFromOsmd).toHaveBeenCalled();
  });
});

// ─── empty notes guard ─────────────────────────────────────────────

describe('loadCurrentScore — empty notes guard', () => {
  it('throws "No notes extracted" when extract returns 0 notes', async () => {
    const fx = makeFixture({
      extractRet: { notes: [], measureStartSec: [], measureBpm: [] },
    });
    await expect(fx.loader.loadCurrentScore()).rejects.toThrow('No notes extracted');
    // _loadingPromise still cleared.
    expect(fx.song._loadingPromise).toBeNull();
  });
});

// ─── playback order fallback ───────────────────────────────────────

describe('loadCurrentScore — playback order fallback', () => {
  it('parse fail → linear measure-index fallback', async () => {
    const fx = makeFixture({ measures: [{}, {}, {}, {}] });
    fx.spies.fetchPlaybackOrder.mockRejectedValue(new Error('fail'));
    await fx.loader.loadCurrentScore();
    expect(fx.spies.expandNotesByPlaybackOrder).toHaveBeenCalledWith(
      expect.any(Array),
      [0, 1, 2, 3], // linear from measures
      expect.any(Array),
      expect.any(Array)
    );
  });

  it('empty order → linear measure-index fallback', async () => {
    const fx = makeFixture({ measures: [{}, {}], order: [] });
    await fx.loader.loadCurrentScore();
    expect(fx.spies.expandNotesByPlaybackOrder).toHaveBeenCalledWith(
      expect.any(Array),
      [0, 1],
      expect.any(Array),
      expect.any(Array)
    );
  });
});

// ─── BPM source priority ───────────────────────────────────────────

describe('loadCurrentScore — bpm source priority', () => {
  it('XML scoreTiming.leadingQuarterBpm wins', async () => {
    const fx = makeFixture({
      scoreTiming: { leadingQuarterBpm: 95 },
      measures: [{ TempoInBPM: 60 }],
    });
    await fx.loader.loadCurrentScore();
    expect(fx.song.bpm).toBe(95);
  });

  it('falls back to first measure TempoInBPM when no XML BPM', async () => {
    const fx = makeFixture({
      scoreTiming: null,
      measures: [{ TempoInBPM: 88 }, { TempoInBPM: 100 }],
    });
    await fx.loader.loadCurrentScore();
    expect(fx.song.bpm).toBe(88);
  });

  it('defaults to 72 when nothing else', async () => {
    const fx = makeFixture({ scoreTiming: null, measures: [{}, {}] });
    await fx.loader.loadCurrentScore();
    expect(fx.song.bpm).toBe(72);
  });

  it('_bpmRescaled true when OSMD bpm differs >5% from XML', async () => {
    const fx = makeFixture({
      scoreTiming: { leadingQuarterBpm: 100 },
      extractRet: {
        notes: [makeNote()],
        measureStartSec: [0],
        measureBpm: [200], // double — OSMD misread eighth-as-quarter
      },
    });
    await fx.loader.loadCurrentScore();
    expect(fx.song._bpmRescaled).toBe(true);
  });

  it('_bpmRescaled false when within 5%', async () => {
    const fx = makeFixture({
      scoreTiming: { leadingQuarterBpm: 100 },
      extractRet: {
        notes: [makeNote()],
        measureStartSec: [0],
        measureBpm: [102],
      },
    });
    await fx.loader.loadCurrentScore();
    expect(fx.song._bpmRescaled).toBe(false);
  });
});

// ─── DIAG dump gate ────────────────────────────────────────────────

describe('loadCurrentScore — DIAG dump gate', () => {
  it('fires when remoteLogEnabled=true', async () => {
    const fx = makeFixture({ remoteLogEnabled: true });
    await fx.loader.loadCurrentScore();
    expect(fx.spies.dumpLoadDiagnostics).toHaveBeenCalledOnce();
  });

  it('does NOT fire when remoteLogEnabled=false', async () => {
    const fx = makeFixture({ remoteLogEnabled: false });
    await fx.loader.loadCurrentScore();
    expect(fx.spies.dumpLoadDiagnostics).not.toHaveBeenCalled();
  });
});
