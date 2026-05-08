// Tests for packages/web/src/online-library.ts.

import { describe, it, expect, vi } from 'vitest';
import {
  createOnlineLibrary,
  LIBRARY_PINNED_SHA,
  LIBRARY_API_URL,
  LIBRARY_CACHE_KEY,
  LIBRARY_CACHE_TTL_MS,
  LIBRARY_JP,
  LIBRARY_SEED,
  type LibraryEntry,
} from '../src/online-library';

function makeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    _store: store,
  };
}

function makeFixture(over: { now?: number } = {}) {
  const storage = makeStorage();
  // libraryEntryFromGhFile fake — projects the file name into a
  // LibraryEntry, propagating the JP override when present.
  const libraryEntryFromGhFile = vi.fn((f: { name: string }, opts) => {
    const jp = (opts.jpOverrides as typeof LIBRARY_JP)[f.name];
    return {
      url: 'https://cdn.test/' + opts.pinnedSha + '/' + f.name,
      label: f.name.replace(/\.mxl$/, '').replace(/_/g, ' '),
      icon: '🎵',
      filename: f.name,
      titleJp: jp?.titleJp,
      composerJp: jp?.composerJp,
    } as LibraryEntry;
  });
  const fetchFn = vi.fn();
  const lib = createOnlineLibrary({
    libraryEntryFromGhFile,
    fetch: fetchFn as unknown as typeof fetch,
    localStorage: storage,
    now: () => over.now ?? 1700000000000,
  });
  return { lib, storage, libraryEntryFromGhFile, fetchFn };
}

describe('online-library — exported constants', () => {
  it('LIBRARY_PINNED_SHA is the 40-char commit SHA', () => {
    expect(LIBRARY_PINNED_SHA).toMatch(/^[0-9a-f]{40}$/);
  });

  it('LIBRARY_API_URL embeds the pinned SHA', () => {
    expect(LIBRARY_API_URL).toContain(LIBRARY_PINNED_SHA);
    expect(LIBRARY_API_URL).toContain('musetrainer/library');
  });

  it('LIBRARY_CACHE_KEY is versioned (v2)', () => {
    expect(LIBRARY_CACHE_KEY).toBe('pianoViz_libraryCache_v2');
  });

  it('LIBRARY_CACHE_TTL_MS is 1 hour', () => {
    expect(LIBRARY_CACHE_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('LIBRARY_JP has at least 60 entries (curated catalog)', () => {
    expect(Object.keys(LIBRARY_JP).length).toBeGreaterThan(60);
  });

  it('LIBRARY_JP entries all have titleJp + composerJp', () => {
    for (const [k, v] of Object.entries(LIBRARY_JP)) {
      expect(v.titleJp, k).toBeTruthy();
      expect(v.composerJp, k).toBeTruthy();
    }
  });

  it('LIBRARY_SEED entries include the pinned SHA in their URL', () => {
    for (const e of LIBRARY_SEED) {
      expect(e.url).toContain(LIBRARY_PINNED_SHA);
    }
  });
});

describe('createOnlineLibrary — entryFromGhFile', () => {
  it('passes pinnedSha + jpOverrides through to the deps fn', () => {
    const fx = makeFixture();
    fx.lib.entryFromGhFile({ name: 'Fur_Elise.mxl' });
    expect(fx.libraryEntryFromGhFile).toHaveBeenCalledWith(
      { name: 'Fur_Elise.mxl' },
      { pinnedSha: LIBRARY_PINNED_SHA, jpOverrides: LIBRARY_JP }
    );
  });

  it('returns the entry with JP title when filename matches LIBRARY_JP', () => {
    const fx = makeFixture();
    const e = fx.lib.entryFromGhFile({ name: 'Fur_Elise.mxl' });
    expect(e.titleJp).toBe('エリーゼのために');
    expect(e.composerJp).toBe('ベートーヴェン');
  });

  it('omits JP fields when filename has no override', () => {
    const fx = makeFixture();
    const e = fx.lib.entryFromGhFile({ name: 'Unknown.mxl' });
    expect(e.titleJp).toBeUndefined();
    expect(e.composerJp).toBeUndefined();
  });
});

describe('createOnlineLibrary — fetchEntries cache', () => {
  it('returns cached entries when cache is fresh (<1 h)', async () => {
    const cached = [{ url: 'cdn://a', label: 'A', icon: '🎵' }];
    const fx = makeFixture({ now: 1700000000000 });
    fx.storage._store[LIBRARY_CACHE_KEY] = JSON.stringify({
      fetchedAt: 1700000000000 - 30 * 60 * 1000, // 30 min ago
      entries: cached,
    });
    const out = await fx.lib.fetchEntries();
    expect(out).toEqual(cached);
    expect(fx.fetchFn).not.toHaveBeenCalled();
  });

  it('hits network when cache is stale (>1 h)', async () => {
    const fx = makeFixture({ now: 1700000000000 });
    fx.storage._store[LIBRARY_CACHE_KEY] = JSON.stringify({
      fetchedAt: 1700000000000 - 2 * 60 * 60 * 1000, // 2 h ago
      entries: [{ url: 'cdn://stale', label: 'S', icon: '' }],
    });
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ type: 'file', name: 'Bach_Minuet_in_G_Major_BWV_Anh._114.mxl' }],
    });
    const out = await fx.lib.fetchEntries();
    expect(fx.fetchFn).toHaveBeenCalledTimes(1);
    expect(out.length).toBe(1);
    expect(out[0].titleJp).toBe('メヌエット ト長調 BWV Anh.114');
  });

  it('hits network when force=true even with fresh cache', async () => {
    const fx = makeFixture({ now: 1700000000000 });
    fx.storage._store[LIBRARY_CACHE_KEY] = JSON.stringify({
      fetchedAt: 1700000000000,
      entries: [{ url: 'old', label: 'old', icon: '' }],
    });
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ type: 'file', name: 'Canon_in_D.mxl' }],
    });
    const out = await fx.lib.fetchEntries(true);
    expect(fx.fetchFn).toHaveBeenCalled();
    expect(out[0].titleJp).toBe('カノン ニ長調');
  });

  it('hits network when cache JSON is corrupt (silently falls through)', async () => {
    const fx = makeFixture();
    fx.storage._store[LIBRARY_CACHE_KEY] = 'not-json{';
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ type: 'file', name: 'Canon_in_D.mxl' }],
    });
    const out = await fx.lib.fetchEntries();
    expect(out.length).toBe(1);
  });
});

describe('createOnlineLibrary — fetchEntries network', () => {
  it('throws "GitHub API <status>" on non-OK response', async () => {
    const fx = makeFixture();
    fx.fetchFn.mockResolvedValueOnce({ ok: false, status: 403, json: async () => null });
    await expect(fx.lib.fetchEntries(true)).rejects.toThrow('GitHub API 403');
  });

  it('filters out non-file types and non-.mxl files', async () => {
    const fx = makeFixture();
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { type: 'dir', name: 'subdir' },
        { type: 'file', name: 'README.md' },
        { type: 'file', name: 'Canon_in_D.mxl' },
        { type: 'file', name: 'Fur_Elise.mxl' },
      ],
    });
    const entries = await fx.lib.fetchEntries(true);
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.filename)).toEqual(
      // sorted by label — "Canon in D" < "Fur Elise"
      ['Canon_in_D.mxl', 'Fur_Elise.mxl']
    );
  });

  it('sorts entries by label.localeCompare', async () => {
    const fx = makeFixture();
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { type: 'file', name: 'Zebra.mxl' },
        { type: 'file', name: 'Apple.mxl' },
        { type: 'file', name: 'Banana.mxl' },
      ],
    });
    const entries = await fx.lib.fetchEntries(true);
    expect(entries.map((e) => e.label)).toEqual(['Apple', 'Banana', 'Zebra']);
  });

  it('writes the entries to localStorage on success', async () => {
    const fx = makeFixture({ now: 1700000099999 });
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ type: 'file', name: 'Canon_in_D.mxl' }],
    });
    await fx.lib.fetchEntries(true);
    expect(fx.storage.setItem).toHaveBeenCalled();
    const written = JSON.parse(fx.storage._store[LIBRARY_CACHE_KEY]);
    expect(written.fetchedAt).toBe(1700000099999);
    expect(written.entries.length).toBe(1);
  });

  it('survives a localStorage.setItem throw (quota / private mode)', async () => {
    const fx = makeFixture();
    fx.storage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    fx.fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ type: 'file', name: 'Canon_in_D.mxl' }],
    });
    const entries = await fx.lib.fetchEntries(true);
    expect(entries.length).toBe(1); // returned despite cache write fail
  });

  it('hits the pinned API URL with vnd.github+json Accept header', async () => {
    const fx = makeFixture();
    fx.fetchFn.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fx.lib.fetchEntries(true);
    expect(fx.fetchFn).toHaveBeenCalledWith(LIBRARY_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
  });
});
