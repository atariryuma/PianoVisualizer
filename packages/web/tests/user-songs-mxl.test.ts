// Tests for packages/web/src/user-songs-mxl.ts.
//
// Two surfaces:
//   - createUserDb: lazy IDBDatabase handle + 4-op wrapper
//   - unzipMxlToXmlText: JSZip-backed .mxl extraction

import { describe, it, expect, vi } from 'vitest';
import { createUserDb, unzipMxlToXmlText } from '../src/user-songs-mxl';

// =====================================================================
// createUserDb
// =====================================================================

interface FakeRecord {
  id: string;
  name: string;
}

function makeUserDbFixture() {
  const db = { __tag: 'fake-idb' };
  const openUserDb = vi.fn(() => Promise.resolve(db));
  const userDbAll = vi.fn((_db: typeof db) =>
    Promise.resolve([{ id: 'a', name: 'A' }] as FakeRecord[])
  );
  const userDbPut = vi.fn((_db: typeof db, _r: FakeRecord) => Promise.resolve());
  const userDbDelete = vi.fn((_db: typeof db, _id: string) => Promise.resolve());

  const handle = createUserDb<typeof db, FakeRecord>({
    openUserDb,
    userDbAll,
    userDbPut,
    userDbDelete,
  });
  return { db, handle, openUserDb, userDbAll, userDbPut, userDbDelete };
}

describe('createUserDb — lazy open', () => {
  it('opens on first call and caches the Promise', async () => {
    const fx = makeUserDbFixture();
    const p1 = fx.handle.open();
    const p2 = fx.handle.open();
    expect(p1).toBe(p2); // same cached Promise
    await p1;
    expect(fx.openUserDb).toHaveBeenCalledTimes(1);
  });

  it('every op reuses the cached open() Promise', async () => {
    const fx = makeUserDbFixture();
    await fx.handle.all();
    await fx.handle.put({ id: 'b', name: 'B' });
    await fx.handle.delete('a');
    expect(fx.openUserDb).toHaveBeenCalledTimes(1);
  });

  it('all() forwards the opened db to userDbAll and returns its result', async () => {
    const fx = makeUserDbFixture();
    const result = await fx.handle.all();
    expect(fx.userDbAll).toHaveBeenCalledWith(fx.db);
    expect(result).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('put() forwards (db, record) to userDbPut', async () => {
    const fx = makeUserDbFixture();
    const rec = { id: 'x', name: 'X' };
    await fx.handle.put(rec);
    expect(fx.userDbPut).toHaveBeenCalledWith(fx.db, rec);
  });

  it('delete() forwards (db, id) to userDbDelete', async () => {
    const fx = makeUserDbFixture();
    await fx.handle.delete('aaa');
    expect(fx.userDbDelete).toHaveBeenCalledWith(fx.db, 'aaa');
  });

  it('all() rejects when openUserDb rejects', async () => {
    const handle = createUserDb<unknown, FakeRecord>({
      openUserDb: () => Promise.reject(new Error('boom')),
      userDbAll: vi.fn(),
      userDbPut: vi.fn(),
      userDbDelete: vi.fn(),
    });
    await expect(handle.all()).rejects.toThrow('boom');
  });
});

// =====================================================================
// unzipMxlToXmlText
// =====================================================================

interface FakeFile {
  body: string;
}

function makeJSZip(files: Record<string, FakeFile>) {
  return {
    loadAsync: vi.fn(async () => ({
      files,
      file(path: string) {
        const f = files[path];
        if (!f) return null;
        return { async: async () => f.body };
      },
    })),
  };
}

function bytes(s: string): ArrayBuffer {
  // happy-dom Blob.arrayBuffer() works, but for these tests we don't
  // even need real bytes — we just need an object that .arrayBuffer().
  const buf = new ArrayBuffer(s.length);
  return buf;
}

function makeBlob(s: string): Blob {
  // happy-dom isn't loaded for this test, so build a minimal stand-in.
  return {
    async arrayBuffer() {
      return bytes(s);
    },
  } as Blob;
}

describe('unzipMxlToXmlText', () => {
  it('honors META-INF/container.xml full-path pointer', async () => {
    const score = '<score-partwise><foo/></score-partwise>';
    const jszip = makeJSZip({
      'META-INF/container.xml': {
        body: '<container><rootfiles><rootfile full-path="my-score.xml"/></rootfiles></container>',
      },
      'my-score.xml': { body: score },
    });
    const out = await unzipMxlToXmlText(makeBlob('zip-bytes'), { jszip });
    expect(out).toBe(score);
  });

  it('falls back to first non-META-INF .xml when no container.xml', async () => {
    const score = '<score-partwise/>';
    const jszip = makeJSZip({
      'META-INF/somethingelse': { body: 'meta' },
      'first.xml': { body: score },
      'second.xml': { body: '<other/>' },
    });
    const out = await unzipMxlToXmlText(makeBlob('z'), { jszip });
    expect(out).toBe(score);
  });

  it('throws when no usable score file exists in the archive', async () => {
    const jszip = makeJSZip({ 'README.txt': { body: 'no xml here' } });
    await expect(unzipMxlToXmlText(makeBlob('z'), { jszip })).rejects.toThrow(
      'No score file inside .mxl archive'
    );
  });

  it('throws when container.xml points at a missing path', async () => {
    const jszip = makeJSZip({
      'META-INF/container.xml': {
        body: '<container><rootfile full-path="ghost.xml"/></container>',
      },
      // ghost.xml deliberately absent
    });
    await expect(unzipMxlToXmlText(makeBlob('z'), { jszip })).rejects.toThrow(/vanished from zip/);
  });

  it('skips META-INF/*.xml in the fallback scan', async () => {
    const score = '<score-partwise/>';
    const jszip = makeJSZip({
      'META-INF/container.xml': { body: '<container></container>' }, // no full-path
      'META-INF/poison.xml': { body: '<bad/>' },
      'real.xml': { body: score },
    });
    const out = await unzipMxlToXmlText(makeBlob('z'), { jszip });
    expect(out).toBe(score);
  });

  it('falls back to scan when container.xml lacks a full-path attribute', async () => {
    const score = '<score-partwise/>';
    const jszip = makeJSZip({
      'META-INF/container.xml': { body: '<container></container>' }, // no full-path
      'real.xml': { body: score },
    });
    const out = await unzipMxlToXmlText(makeBlob('z'), { jszip });
    expect(out).toBe(score);
  });

  it('falls back to a .musicxml file when no container.xml is present', async () => {
    const score = '<score-partwise/>';
    const jszip = makeJSZip({
      'score.musicxml': { body: score },
    });
    const out = await unzipMxlToXmlText(makeBlob('z'), { jszip });
    expect(out).toBe(score);
  });

  it('matches an uppercase .XML extension in the fallback scan', async () => {
    const score = '<score-partwise/>';
    const jszip = makeJSZip({
      'SCORE.XML': { body: score },
    });
    const out = await unzipMxlToXmlText(makeBlob('z'), { jszip });
    expect(out).toBe(score);
  });

  it('honors a single-quoted full-path in container.xml', async () => {
    const score = '<score-partwise><foo/></score-partwise>';
    const jszip = makeJSZip({
      'META-INF/container.xml': {
        body: "<container><rootfiles><rootfile full-path='my-score.xml'/></rootfiles></container>",
      },
      'my-score.xml': { body: score },
    });
    const out = await unzipMxlToXmlText(makeBlob('z'), { jszip });
    expect(out).toBe(score);
  });

  it('rejects when the unzipped XML text exceeds the size cap (zip bomb guard)', async () => {
    const huge = 'a'.repeat(50 * 1024 * 1024 + 1);
    const jszip = makeJSZip({ 'score.xml': { body: huge } });
    await expect(unzipMxlToXmlText(makeBlob('z'), { jszip })).rejects.toThrow(/too large/i);
  });
});
