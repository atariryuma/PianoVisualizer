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
import { readFileSync, readdirSync } from 'node:fs';
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
    license?: string;
    died?: number;
    source?: string;
    type?: string;
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
      // External (OpenScore) Lieder are large, professional, full scores already
      // verified by the OSMD render pass. Running happy-dom's DOMParser +
      // autoSectionDefs over ALL of them here exhausts the worker heap, so keep
      // their in-test check light (valid MusicXML root) — the generated files,
      // which the generator authors, get the full parse.
      if (s.external) {
        expect(xml, s.file).toContain('<score-partwise');
        expect(xml, s.file).toContain('<part ');
        return;
      }
      const meta = PianoCore.parseMusicXmlMetadata(xml);
      expect(meta.measureCount, s.file).toBeGreaterThan(0);
      expect(meta.composer, s.file).toBe(s.composer);
      expect(meta.title, s.file).toBe(s.title);
      // Auto-sectioning must not throw and must produce at least one section.
      const defs = PianoCore.autoSectionDefs(xml, meta.measureCount) as unknown[];
      expect(Array.isArray(defs) ? defs.length : 0, s.file).toBeGreaterThan(0);
    });
  }
});

// The legality gate: illegal / un-provenanced / orphan files must be UNABLE to
// ship. This mirrors the generator's checks so it also runs in `pnpm verify`.
describe('library legality gate', () => {
  const currentYear = new Date().getFullYear();

  it('every score is PD or CC0', () => {
    for (const s of manifest.scores) {
      expect(['PD', 'CC0'], s.file).toContain(s.license);
    }
  });

  it('every composer is public domain (died ≤ year−70, or 0 = traditional)', () => {
    for (const s of manifest.scores) {
      const ok = s.died === 0 || (typeof s.died === 'number' && s.died <= currentYear - 70);
      expect(ok, `${s.file} (died ${s.died})`).toBe(true);
    }
  });

  it('every score carries provenance (source) + a type', () => {
    for (const s of manifest.scores) {
      expect(s.source, s.file).toBeTruthy();
      expect(['solo', 'song'], s.file).toContain(s.type);
    }
  });

  it('no orphan files — every .musicxml on disk is registered in the manifest', () => {
    const registered = new Set(manifest.scores.map((s) => s.file));
    const onDisk = readdirSync(LIB_DIR).filter((f) => f.endsWith('.musicxml'));
    const orphans = onDisk.filter((f) => !registered.has(f));
    expect(orphans, 'unregistered files — add to the generator or delete').toEqual([]);
  });

  it('no dangling entries — every manifest file exists on disk', () => {
    const onDisk = new Set(readdirSync(LIB_DIR));
    for (const s of manifest.scores) expect(onDisk.has(s.file), s.file).toBe(true);
  });
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
