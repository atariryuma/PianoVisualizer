// Tests for packages/web/src/user-songs-store.ts.

import { describe, it, expect, vi } from 'vitest';
import {
  createUserSongsStore,
  type UserSongsStoreDeps,
  type UserSongRecord,
  type SongRegEntry,
} from '../src/user-songs-store';

const PLAIN_MIME = 'application/vnd.recordare.musicxml+xml';
const ZIP_MIME = 'application/vnd.recordare.musicxml+zip';

function makeBlob(content: string, type = ''): Blob {
  return {
    type,
    size: content.length,
    async text() {
      return content;
    },
    async arrayBuffer() {
      return new ArrayBuffer(content.length);
    },
    slice(start: number, end: number): Blob {
      return makeBlob(content.slice(start, end), type);
    },
  } as unknown as Blob;
}

interface FixtureOver {
  unzipResult?: string;
  unzipReject?: Error;
  parseResult?: { title?: string; composer?: string; measureCount: number };
  // For rename(): IDB get() result
  rawIdbRec?: UserSongRecord | undefined;
}

function makeFixture(over: FixtureOver = {}) {
  const songs: Record<string, SongRegEntry> = {};

  const unzip = vi.fn(async (_b: Blob): Promise<string> => {
    if (over.unzipReject) throw over.unzipReject;
    return over.unzipResult ?? '<score-partwise/>';
  });
  const parseMeta = vi.fn(
    () => over.parseResult ?? { title: 'My Song', composer: 'Composer', measureCount: 24 }
  );
  const autoSectionDefs = vi.fn(() => [{ id: 'A1', startMeasure: 0 }]);

  // Minimal openable IDB stub for rename().
  const rawIdb = {
    transaction(_name: string, _mode: string) {
      return {
        objectStore(_name: string) {
          return {
            get(_id: string) {
              const req = {
                onsuccess: null as null | (() => void),
                onerror: null as null | (() => void),
                result: over.rawIdbRec,
                error: null as Error | null,
              } as unknown as IDBRequest;
              // Fire success after the caller has hooked handlers.
              queueMicrotask(() => req.onsuccess?.(new Event('success')));
              return req;
            },
          };
        },
      };
    },
  };
  const userDb = {
    open: vi.fn(async () => rawIdb),
    all: vi.fn(async () => [] as UserSongRecord[]),
    put: vi.fn(async (_r: UserSongRecord) => {}),
    delete: vi.fn(async (_id: string) => {}),
  };

  const url = {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  };

  // AbortController + setTimeout/clearTimeout: pass real ones; fetch is the fake.
  const fetchFn = vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      headers: { get: () => '0' },
      async blob() {
        return makeBlob('<score-partwise/>', PLAIN_MIME);
      },
    } as unknown as Response;
  });

  const practice: UserSongsStoreDeps['getPractice'] extends () => infer P ? P : never = {
    progress: { songs: {} },
  };
  const savePracticeProgress = vi.fn();

  const store = createUserSongsStore({
    userDb: userDb as unknown as UserSongsStoreDeps['userDb'],
    userDbStoreName: 'userSongs',
    unzipMxlToXmlText: unzip,
    fns: {
      parseMusicXmlMetadata: parseMeta,
      autoSectionDefs,
    },
    songs,
    getPractice: () => practice,
    savePracticeProgress,
    urlTimeoutMs: 100,
    maxBytes: 20 * 1024 * 1024,
    fetch: fetchFn as unknown as typeof fetch,
    AbortController,
    setTimeout: ((fn: () => void, ms: number) =>
      setTimeout(fn, ms)) as unknown as UserSongsStoreDeps['setTimeout'],
    clearTimeout: ((id: unknown) =>
      clearTimeout(id as ReturnType<typeof setTimeout>)) as UserSongsStoreDeps['clearTimeout'],
    url,
    now: () => 1700000000000,
    random: () => 0.5,
  });

  return {
    songs,
    unzip,
    parseMeta,
    autoSectionDefs,
    userDb,
    url,
    fetchFn,
    practice,
    savePracticeProgress,
    store,
  };
}

describe('createUserSongsStore — register', () => {
  it('builds a SONGS entry from a plain-XML record (no migration needed)', async () => {
    const fx = makeFixture();
    const rec: UserSongRecord = {
      id: 'r1',
      title: 'T',
      composer: 'C',
      mxlBlob: makeBlob('<x/>', PLAIN_MIME),
      xmlText: '<x/>',
      mimeType: PLAIN_MIME,
      sectionDefs: [],
      addedAt: 0,
    };
    const song = await fx.store.register(rec);
    expect(fx.songs['r1']).toBe(song);
    expect(song.titleKey).toBe('__userTitle:r1');
    expect(song._isUser).toBe(true);
    expect(song._userTitle).toBe('T');
    expect(fx.unzip).not.toHaveBeenCalled(); // already had xmlText
    expect(fx.url.createObjectURL).toHaveBeenCalled();
  });

  it('lazily migrates an .mxl record without xmlText (unzip + persist)', async () => {
    const fx = makeFixture({ unzipResult: '<migrated/>' });
    const rec: UserSongRecord = {
      id: 'r2',
      title: '',
      composer: '',
      mxlBlob: makeBlob('PK...', ZIP_MIME),
      mimeType: ZIP_MIME,
      sectionDefs: [],
      addedAt: 0,
    };
    await fx.store.register(rec);
    expect(fx.unzip).toHaveBeenCalledWith(rec.mxlBlob);
    expect(rec.xmlText).toBe('<migrated/>'); // migration written back to record
    expect(fx.userDb.put).toHaveBeenCalledWith(rec);
  });

  it('continues with raw blob URL when unzip migration fails', async () => {
    const fx = makeFixture({ unzipReject: new Error('zip-broken') });
    const rec: UserSongRecord = {
      id: 'r3',
      title: '',
      composer: '',
      mxlBlob: makeBlob('PK...', ZIP_MIME),
      mimeType: ZIP_MIME,
      sectionDefs: [],
      addedAt: 0,
    };
    const song = await fx.store.register(rec);
    expect(song.xmlUrl).toBe('blob:fake'); // still got a URL from the raw blob
  });

  it('uses record.id as the user-title fallback when title is empty', async () => {
    const fx = makeFixture();
    await fx.store.register({
      id: 'r-empty',
      title: '',
      composer: '',
      mxlBlob: makeBlob('<x/>', PLAIN_MIME),
      xmlText: '<x/>',
      mimeType: PLAIN_MIME,
      sectionDefs: [],
      addedAt: 0,
    });
    expect(fx.songs['r-empty']._userTitle).toBe('r-empty');
  });
});

describe('createUserSongsStore — loadAll', () => {
  it('registers each record from userDb.all and returns the count', async () => {
    const fx = makeFixture();
    fx.userDb.all = vi.fn(
      async () =>
        [
          {
            id: 'a',
            title: 'A',
            composer: '',
            mxlBlob: makeBlob('<a/>', PLAIN_MIME),
            xmlText: '<a/>',
            mimeType: PLAIN_MIME,
            sectionDefs: [],
            addedAt: 0,
          },
          {
            id: 'b',
            title: 'B',
            composer: '',
            mxlBlob: makeBlob('<b/>', PLAIN_MIME),
            xmlText: '<b/>',
            mimeType: PLAIN_MIME,
            sectionDefs: [],
            addedAt: 0,
          },
        ] as UserSongRecord[]
    );
    const count = await fx.store.loadAll();
    expect(count).toBe(2);
    expect(Object.keys(fx.songs)).toEqual(['a', 'b']);
  });

  it('returns 0 when userDb.all rejects (logs but does not throw)', async () => {
    const fx = makeFixture();
    fx.userDb.all = vi.fn(async () => {
      throw new Error('idb-down');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const count = await fx.store.loadAll();
    expect(count).toBe(0);
    warnSpy.mockRestore();
  });
});

describe('createUserSongsStore — addFromBlob', () => {
  it('detects .mxl by zip MIME and unzips before parse', async () => {
    const fx = makeFixture({ unzipResult: '<from-zip/>' });
    const blob = makeBlob('PK...', ZIP_MIME);
    const rec = await fx.store.addFromBlob(blob, { filename: 'song.mxl' });
    expect(fx.unzip).toHaveBeenCalled();
    expect(fx.parseMeta).toHaveBeenCalledWith('<from-zip/>');
    expect(rec.mimeType).toBe(ZIP_MIME);
  });

  it('detects plain .xml by absence of zip signature and skips unzip', async () => {
    const fx = makeFixture();
    const rec = await fx.store.addFromBlob(makeBlob('<score/>', PLAIN_MIME), { filename: 'a.xml' });
    expect(fx.unzip).not.toHaveBeenCalled();
    expect(rec.mimeType).toBe(PLAIN_MIME);
  });

  // ── content beats the filename (2026-07-26 regression) ──────────────
  // The bytes are ground truth. A wrong/guessed name used to win and fed
  // plain XML to JSZip ("Can't find end of central directory").

  it('treats plain XML as XML even when the filename claims .mxl', async () => {
    const fx = makeFixture();
    const rec = await fx.store.addFromBlob(makeBlob('<score-partwise/>', ''), {
      filename: 'untitled.mxl',
    });
    expect(fx.unzip).not.toHaveBeenCalled();
    expect(rec.mimeType).toBe(PLAIN_MIME);
  });

  it('treats a real zip as .mxl even when the filename claims .xml', async () => {
    const fx = makeFixture({ unzipResult: '<from-zip/>' });
    const rec = await fx.store.addFromBlob(makeBlob('PKzzzz', ''), {
      filename: 'mislabelled.xml',
    });
    expect(fx.unzip).toHaveBeenCalled();
    expect(rec.mimeType).toBe(ZIP_MIME);
  });

  it('tolerates a UTF-8 BOM before the XML declaration', async () => {
    const fx = makeFixture();
    const rec = await fx.store.addFromBlob(makeBlob('\uFEFF<?xml version="1.0"?>', ''), {
      filename: 'bom.mxl',
    });
    expect(fx.unzip).not.toHaveBeenCalled();
    expect(rec.mimeType).toBe(PLAIN_MIME);
  });

  it('throws when measureCount < 1', async () => {
    const fx = makeFixture({ parseResult: { measureCount: 0 } });
    await expect(
      fx.store.addFromBlob(makeBlob('<x/>', PLAIN_MIME), { filename: 'a.xml' })
    ).rejects.toThrow('Score has no measures');
  });

  it('uses titleOverride when provided', async () => {
    const fx = makeFixture();
    const rec = await fx.store.addFromBlob(makeBlob('<x/>', PLAIN_MIME), {
      filename: 'whatever.xml',
      titleOverride: 'Manual title',
    });
    expect(rec.title).toBe('Manual title');
  });

  it('strips file extension from filename when title is missing', async () => {
    const fx = makeFixture({ parseResult: { measureCount: 1 } });
    const rec = await fx.store.addFromBlob(makeBlob('<x/>', PLAIN_MIME), {
      filename: 'mysong.xml',
    });
    expect(rec.title).toBe('mysong');
  });

  it('persists via userDb.put + registers in SONGS', async () => {
    const fx = makeFixture();
    const rec = await fx.store.addFromBlob(makeBlob('<x/>', PLAIN_MIME), { filename: 'a.xml' });
    expect(fx.userDb.put).toHaveBeenCalledWith(rec);
    expect(fx.songs[rec.id]).toBeDefined();
  });

  it('throws when blob size exceeds maxBytes (file-picker path guard)', async () => {
    const fx = makeFixture();
    const huge = { type: PLAIN_MIME, size: 50 * 1024 * 1024 } as unknown as Blob;
    await expect(fx.store.addFromBlob(huge, { filename: 'big.xml' })).rejects.toThrow(
      /File too large/
    );
    // 上限で弾かれるので unzip / put まで進まない。
    expect(fx.unzip).not.toHaveBeenCalled();
    expect(fx.userDb.put).not.toHaveBeenCalled();
  });
});

describe('createUserSongsStore — addFromUrl', () => {
  it('throws on non-OK fetch', async () => {
    const fx = makeFixture();
    fx.fetchFn.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => '0' },
      async blob() {
        return makeBlob('', PLAIN_MIME);
      },
    } as unknown as Response);
    await expect(fx.store.addFromUrl('https://x.test/a.mxl')).rejects.toThrow('HTTP 404');
  });

  it('throws on declared content-length over maxBytes', async () => {
    const fx = makeFixture();
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => String(50 * 1024 * 1024) }, // 50 MB > 20 MB
      async blob() {
        return makeBlob('', PLAIN_MIME);
      },
    } as unknown as Response);
    await expect(fx.store.addFromUrl('https://x.test/big')).rejects.toThrow(/File too large/);
  });

  it('throws on actual blob size over maxBytes', async () => {
    const fx = makeFixture();
    const huge = { type: PLAIN_MIME, size: 50 * 1024 * 1024 } as unknown as Blob;
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => '0' },
      async blob() {
        return huge;
      },
    } as unknown as Response);
    await expect(fx.store.addFromUrl('https://x.test/huge')).rejects.toThrow(/File too large/);
  });

  it('derives filename from URL path when none given', async () => {
    const fx = makeFixture();
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => '0' },
      async blob() {
        return makeBlob('<score/>', PLAIN_MIME);
      },
    } as unknown as Response);
    const rec = await fx.store.addFromUrl('https://example.com/path/derived.xml');
    // title strips extension on fallback path; with parseMeta default
    // returning title='My Song' the derived filename is only used for
    // mime-detection; record.source should be 'url'.
    expect(rec.source).toBe('url');
  });

  it('derives the filename from a RELATIVE url (bundled-library shape)', async () => {
    // The bundled catalog hands out `assets/library/x.musicxml` — no scheme, no
    // leading slash. Single-arg `new URL()` throws on that, so every library add
    // used to fall back to the name `untitled.mxl` and get unzipped as a zip.
    const fx = makeFixture({ parseResult: { measureCount: 1 } });
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => '0' },
      async blob() {
        return makeBlob('<score-partwise/>', '');
      },
    } as unknown as Response);
    const rec = await fx.store.addFromUrl('assets/library/burgmuller_arabesque.musicxml');
    expect(fx.unzip).not.toHaveBeenCalled();
    expect(rec.mimeType).toBe(PLAIN_MIME);
    expect(rec.title).toBe('burgmuller_arabesque');
  });

  it('falls back to "untitled.mxl" when URL has no path', async () => {
    // parseMeta returns `{ measureCount: 1 }` with no title/composer
    // so title chain falls through to filename → 'untitled.mxl'
    // → '.mxl' extension stripped → 'untitled'.
    const fx = makeFixture({ parseResult: { measureCount: 1 } });
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => '0' },
      async blob() {
        return makeBlob('<score/>', PLAIN_MIME);
      },
    } as unknown as Response);
    const rec = await fx.store.addFromUrl('https://example.com');
    expect(rec.title).toBe('untitled');
  });
});

describe('createUserSongsStore — rename', () => {
  it('throws when the IDB record does not exist', async () => {
    const fx = makeFixture({ rawIdbRec: undefined });
    await expect(fx.store.rename('ghost', 'X', 'Y')).rejects.toThrow('Song not found');
  });

  it('writes new fields back to IDB and patches in-memory SONGS', async () => {
    const existingRec: UserSongRecord = {
      id: 'r1',
      title: 'Old',
      composer: 'OldC',
      mxlBlob: makeBlob('<x/>', PLAIN_MIME),
      xmlText: '<x/>',
      mimeType: PLAIN_MIME,
      sectionDefs: [],
      addedAt: 0,
    };
    const fx = makeFixture({ rawIdbRec: existingRec });
    fx.songs['r1'] = {
      id: 'r1',
      titleKey: 'k',
      composerKey: 'k',
      icon: '',
      mxlUrl: '',
      xmlUrl: '',
      sectionDefs: [],
      notes: null,
      totalSec: 0,
      sections: [],
      playbackOrder: [],
      _loaded: false,
      _loadingPromise: null,
      _isUser: true,
      _userTitle: 'Old',
      _userComposer: 'OldC',
    };

    await fx.store.rename('r1', 'New', 'NewC');
    expect(existingRec.title).toBe('New');
    expect(existingRec.composer).toBe('NewC');
    expect(fx.userDb.put).toHaveBeenCalledWith(existingRec);
    expect(fx.songs['r1']._userTitle).toBe('New');
    expect(fx.songs['r1']._userComposer).toBe('NewC');
  });
});

describe('createUserSongsStore — remove', () => {
  it('deletes from IDB, revokes blob URLs, drops the SONGS entry', async () => {
    const fx = makeFixture();
    fx.songs['r1'] = {
      id: 'r1',
      titleKey: '',
      composerKey: '',
      icon: '',
      mxlUrl: 'blob:abc',
      xmlUrl: 'blob:xyz',
      sectionDefs: [],
      notes: null,
      totalSec: 0,
      sections: [],
      playbackOrder: [],
      _loaded: false,
      _loadingPromise: null,
      _isUser: true,
      _userTitle: '',
      _userComposer: '',
    };
    await fx.store.remove('r1');
    expect(fx.userDb.delete).toHaveBeenCalledWith('r1');
    expect(fx.url.revokeObjectURL).toHaveBeenCalledWith('blob:abc');
    expect(fx.url.revokeObjectURL).toHaveBeenCalledWith('blob:xyz');
    expect(fx.songs['r1']).toBeUndefined();
  });

  it('skips revoke for non-blob URLs (cdn URLs from the curated library)', async () => {
    const fx = makeFixture();
    fx.songs['cdn'] = {
      id: 'cdn',
      titleKey: '',
      composerKey: '',
      icon: '',
      mxlUrl: 'https://cdn.test/a.mxl',
      xmlUrl: 'https://cdn.test/a.xml',
      sectionDefs: [],
      notes: null,
      totalSec: 0,
      sections: [],
      playbackOrder: [],
      _loaded: false,
      _loadingPromise: null,
      _isUser: true,
      _userTitle: '',
      _userComposer: '',
    };
    await fx.store.remove('cdn');
    expect(fx.url.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('drops per-song progress + saves practice when the entry exists', async () => {
    const fx = makeFixture();
    fx.practice.progress = { songs: { r1: { foo: 'bar' } } };
    await fx.store.remove('r1');
    expect(fx.practice.progress.songs).toEqual({});
    expect(fx.savePracticeProgress).toHaveBeenCalled();
  });

  it('skips savePracticeProgress when no per-song progress row exists', async () => {
    const fx = makeFixture();
    fx.practice.progress = { songs: {} };
    await fx.store.remove('r1');
    expect(fx.savePracticeProgress).not.toHaveBeenCalled();
  });
});
