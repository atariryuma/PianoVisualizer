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

type FakeOsmdMeasure = {
  TempoInBPM?: number;
  ActiveTimeSignature?: { Numerator?: number; Denominator?: number };
};

function makeFakeOsmd(measures: FakeOsmdMeasure[] = []) {
  return { Sheet: { SourceMeasures: measures } };
}

interface Spies {
  initOsmd: ReturnType<typeof vi.fn>;
  parseScoreTimingFromXml: ReturnType<typeof vi.fn>;
  buildMeasureTimingFromXml: ReturnType<typeof vi.fn>;
  extractNotesFromOsmd: ReturnType<typeof vi.fn>;
  fetchPlaybackOrder: ReturnType<typeof vi.fn>;
  expandNotesByPlaybackOrder: ReturnType<typeof vi.fn>;
  expandedMeasureStartSec: ReturnType<typeof vi.fn>;
  buildSectionsFromDefs: ReturnType<typeof vi.fn>;
  dumpLoadDiagnostics: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
}

function makeFixture(
  over: {
    song?: ScoreLoaderSong;
    scoreTiming?: { leadingQuarterBpm?: number; measures?: unknown[] } | null;
    extractRet?: ExtractResult;
    expanded?: OsmdLikeNote[];
    measures?: FakeOsmdMeasure[];
    order?: number[];
    remoteLogEnabled?: boolean;
    getPracticePartIndex?: () => number;
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
    expandedMeasureStartSec: vi.fn().mockReturnValue([0, 1, 2]),
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
    getPracticePartIndex: over.getPracticePartIndex,
    fetchPlaybackOrder:
      spies.fetchPlaybackOrder as unknown as ScoreLoaderDeps['fetchPlaybackOrder'],
    expandNotesByPlaybackOrder:
      spies.expandNotesByPlaybackOrder as unknown as ScoreLoaderDeps['expandNotesByPlaybackOrder'],
    expandedMeasureStartSec:
      spies.expandedMeasureStartSec as unknown as ScoreLoaderDeps['expandedMeasureStartSec'],
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
      expandedMeasureStartSec: vi
        .fn()
        .mockReturnValue([]) as unknown as ScoreLoaderDeps['expandedMeasureStartSec'],
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
    // getPracticePartIndex 未指定時は partIndex=0（先頭パート = 従来挙動）。
    expect(fx.spies.parseScoreTimingFromXml).toHaveBeenCalledWith('<cached/>', { partIndex: 0 });
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
      expect.any(Array),
      undefined // no XML durSec table (buildMeasureTimingFromXml → {})
    );
  });

  it('empty order → linear measure-index fallback', async () => {
    const fx = makeFixture({ measures: [{}, {}], order: [] });
    await fx.loader.loadCurrentScore();
    expect(fx.spies.expandNotesByPlaybackOrder).toHaveBeenCalledWith(
      expect.any(Array),
      [0, 1],
      expect.any(Array),
      expect.any(Array),
      undefined
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

// ─── 拍子 + 小節グリッド（カウントイン/メトロノームの唯一の真実） ──

describe('loadCurrentScore — timeSig + measureGrid', () => {
  /** XML 直解析相当の per-measure timing（1 拍ピックアップ 4/4 + 完全小節）。 */
  const xmlMeasures = [
    {
      timeSig: { beats: 4, beatType: 4 },
      implicit: true,
      durationDiv: 16,
      actualDiv: 4,
      divisions: 4,
      tempoEvents: [],
    },
    {
      timeSig: { beats: 4, beatType: 4 },
      implicit: false,
      durationDiv: 16,
      actualDiv: 16,
      divisions: 4,
      tempoEvents: [],
    },
  ];

  it('XML 解析ありの曲: measureGrid が展開順に構築される（弱起フラグ込み）', async () => {
    const fx = makeFixture({
      scoreTiming: { leadingQuarterBpm: 120, measures: xmlMeasures },
      order: [0, 1],
    });
    fx.spies.buildMeasureTimingFromXml.mockReturnValue({
      startSec: [0, 0.5],
      durSec: [0.5, 2],
    });
    await fx.loader.loadCurrentScore();
    expect(fx.song.measureGrid).toEqual([
      { startSec: 0, durSec: 0.5, beats: 4, beatType: 4, implicit: true, barFrac: 0.25 },
      { startSec: 0.5, durSec: 2, beats: 4, beatType: 4 },
    ]);
    expect(fx.song.timeSig).toEqual({ beats: 4, beatType: 4 });
  });

  it('リピート展開順で second traversal が展開後時計に載る', async () => {
    const fx = makeFixture({
      scoreTiming: { leadingQuarterBpm: 120, measures: xmlMeasures },
      order: [1, 1], // |: m1 :| 相当
    });
    fx.spies.buildMeasureTimingFromXml.mockReturnValue({
      startSec: [0, 0.5],
      durSec: [0.5, 2],
    });
    await fx.loader.loadCurrentScore();
    expect(fx.song.measureGrid!.map((g) => g.startSec)).toEqual([0, 2]);
  });

  it('XML 解析なし（scoreTiming null）: measureGrid は undefined（一様フォールバック）', async () => {
    const fx = makeFixture({ scoreTiming: null });
    await fx.loader.loadCurrentScore();
    expect(fx.song.measureGrid).toBeUndefined();
  });

  it('XML 解析なしでも OSMD の ActiveTimeSignature から拍子を二次取得', async () => {
    const fx = makeFixture({
      scoreTiming: null,
      measures: [{ ActiveTimeSignature: { Numerator: 3, Denominator: 8 } }, {}],
    });
    await fx.loader.loadCurrentScore();
    expect(fx.song.timeSig).toEqual({ beats: 3, beatType: 8 });
    // 3/8 → 3×4/8 = 1.5 → round 2（四分音符換算のアクセント周期）。
    expect(fx.song.beatsPerMeasure).toBe(2);
  });

  it('拍子がどこからも取れない場合は timeSig undefined / beatsPerMeasure 4', async () => {
    const fx = makeFixture({ scoreTiming: null, measures: [{}, {}] });
    await fx.loader.loadCurrentScore();
    expect(fx.song.timeSig).toBeUndefined();
    expect(fx.song.beatsPerMeasure).toBe(4);
  });
});

// ─── partIndex 貫通（多パート譜、P2-21） ──────────────────────────

describe('loadCurrentScore — partIndex threading', () => {
  it('getPracticePartIndex の値が parseScoreTimingFromXml / fetchPlaybackOrder に貫通する', async () => {
    const fx = makeFixture({ getPracticePartIndex: () => 1 });
    fx.song._xmlText = '<two-part/>';
    await fx.loader.loadCurrentScore();
    expect(fx.spies.parseScoreTimingFromXml).toHaveBeenCalledWith('<two-part/>', {
      partIndex: 1,
    });
    expect(fx.spies.fetchPlaybackOrder).toHaveBeenCalledWith(fx.song, 1);
  });

  it('getPracticePartIndex 未指定なら partIndex=0（従来挙動）', async () => {
    const fx = makeFixture();
    fx.song._xmlText = '<single/>';
    await fx.loader.loadCurrentScore();
    expect(fx.spies.parseScoreTimingFromXml).toHaveBeenCalledWith('<single/>', { partIndex: 0 });
    expect(fx.spies.fetchPlaybackOrder).toHaveBeenCalledWith(fx.song, 0);
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
