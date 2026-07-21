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
      expect(meta.title, s.file).toBe(s.title);
      expect(meta.composer, s.file).toBe(s.composer);
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

  it('sorts by label and wires JP labels when present', async () => {
    const lib = createBundledLibrary({ fetch: stubFetch() as unknown as typeof fetch });
    const entries = await lib.fetchEntries(true);
    const labels = entries.map((e) => e.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
    const withJp = entries.find((e) => e.titleJp);
    expect(withJp?.labelJp).toContain('—');
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
