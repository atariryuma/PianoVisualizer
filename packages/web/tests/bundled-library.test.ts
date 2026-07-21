// @vitest-environment happy-dom
//
// Validates the self-owned bundled score library:
//  1. every generated .musicxml parses through the app's real metadata parser
//     (measureCount ≥ 1, title + composer present) and auto-sections cleanly;
//  2. createBundledLibrary maps manifest.json → entries the "Add a song" UI
//     can consume (url points at the bundled asset; JP labels wired).
//
// This is the regression guard for scripts/gen-library-scores.mjs output.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as PianoCore from '@piano/core';
import { createBundledLibrary } from '../src/bundled-library';

// vitest runs with cwd = packages/web (the --filter root).
const LIB_DIR = join(process.cwd(), 'public/assets/library/');
const manifest = JSON.parse(readFileSync(LIB_DIR + 'manifest.json', 'utf8')) as {
  version: number;
  scores: {
    file: string;
    title: string;
    composer: string;
    titleJp?: string;
    composerJp?: string;
    level?: number;
    external?: boolean;
  }[];
};

describe('bundled library — manifest + generated scores', () => {
  it('manifest has scores', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.scores.length).toBeGreaterThan(0);
  });

  for (const s of manifest.scores) {
    it(`${s.file} parses (measures ≥ 1, title + composer)`, () => {
      const xml = readFileSync(LIB_DIR + s.file, 'utf8');
      const meta = PianoCore.parseMusicXmlMetadata(xml);
      expect(meta.measureCount, s.file).toBeGreaterThan(0);
      expect(meta.composer, s.file).toBe(s.composer);
      // External (OpenScore) files embed a collection/opus <work-title>; the
      // display title comes from the manifest, so only our own generated
      // engravings must match their embedded title.
      if (!s.external) expect(meta.title, s.file).toBe(s.title);
      // Auto-sectioning must not throw and must produce at least one section.
      const defs = PianoCore.autoSectionDefs(xml, meta.measureCount) as unknown[];
      expect(Array.isArray(defs) ? defs.length : 0, s.file).toBeGreaterThan(0);
    });
  }
});

describe('createBundledLibrary — fetchEntries', () => {
  function stubFetch() {
    return async (url: string) => {
      if (String(url).endsWith('manifest.json')) {
        return { ok: true, json: async () => manifest } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    };
  }

  it('maps manifest scores to entries with bundled-asset URLs', async () => {
    const lib = createBundledLibrary({ fetch: stubFetch() as unknown as typeof fetch });
    const entries = await lib.fetchEntries(true);
    expect(entries.length).toBe(manifest.scores.length);
    for (const e of entries) {
      expect(e.url.startsWith('assets/library/')).toBe(true);
      expect(e.url.endsWith('.musicxml')).toBe(true);
      expect(e.label).toContain('—'); // "Composer — Title"
    }
  });

  it('sorts by difficulty level (beginner → advanced) and wires JP labels', async () => {
    const lib = createBundledLibrary({ fetch: stubFetch() as unknown as typeof fetch });
    const entries = await lib.fetchEntries(true);
    const levels = entries.map((e) => e.level);
    // non-decreasing by level
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    const withJp = entries.find((e) => e.titleJp);
    expect(withJp?.labelJp).toContain('—');
  });

  it('merges a pinned remote CC0 catalog, deduped + sorted by level', async () => {
    const remoteManifest = {
      version: 1,
      scores: [
        { file: 'remote_adv.musicxml', title: 'Remote Advanced', composer: 'X', level: 4 },
        // filename collides with a bundled file → bundled must win (not duplicated)
        { file: manifest.scores[0].file, title: 'DUPLICATE', composer: 'Y', level: 1 },
      ],
    };
    const fetch = (async (url: string) => {
      if (String(url) === 'https://cdn.test/pinned/manifest.json') {
        return { ok: true, json: async () => remoteManifest } as unknown as Response;
      }
      if (String(url).endsWith('manifest.json')) {
        return { ok: true, json: async () => manifest } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    }) as unknown as typeof fetch;
    const lib = createBundledLibrary({ fetch, remote: { base: 'https://cdn.test/pinned/' } });
    const entries = await lib.fetchEntries(true);
    // remote entry present with its pinned absolute URL
    const adv = entries.find((e) => e.filename === 'remote_adv.musicxml');
    expect(adv?.url).toBe('https://cdn.test/pinned/remote_adv.musicxml');
    // no duplicate of the colliding filename
    expect(entries.filter((e) => e.filename === manifest.scores[0].file).length).toBe(1);
    // still sorted non-decreasing by level (remote L4 lands at the end)
    const levels = entries.map((e) => e.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('falls back to the bundled catalog when the remote fetch fails', async () => {
    const fetch = (async (url: string) => {
      if (String(url) === 'https://cdn.test/pinned/manifest.json') {
        return { ok: false, status: 500 } as unknown as Response; // remote down
      }
      if (String(url).endsWith('manifest.json')) {
        return { ok: true, json: async () => manifest } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    }) as unknown as typeof fetch;
    const lib = createBundledLibrary({ fetch, remote: { base: 'https://cdn.test/pinned/' } });
    const entries = await lib.fetchEntries(true);
    expect(entries.length).toBe(manifest.scores.length); // bundled only, no throw
  });

  it('does not touch the network for a remote catalog when disabled (null)', async () => {
    let remoteCalls = 0;
    const fetch = (async (url: string) => {
      if (String(url).includes('pinned')) remoteCalls++;
      return { ok: true, json: async () => manifest } as unknown as Response;
    }) as unknown as typeof fetch;
    const lib = createBundledLibrary({ fetch, remote: null });
    await lib.fetchEntries(true);
    expect(remoteCalls).toBe(0);
  });

  it('caches after the first fetch unless forced', async () => {
    let calls = 0;
    const fetch = (async () => {
      calls++;
      return { ok: true, json: async () => manifest } as unknown as Response;
    }) as unknown as typeof fetch;
    const lib = createBundledLibrary({ fetch });
    await lib.fetchEntries();
    await lib.fetchEntries();
    expect(calls).toBe(1);
    await lib.fetchEntries(true);
    expect(calls).toBe(2);
  });
});
