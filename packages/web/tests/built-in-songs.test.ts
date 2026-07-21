// Tests for packages/web/src/built-in-songs.ts.
//
// Pure factories — no DOM, no network, no async. Pins the catalog shape
// + per-song record fields so a future refactor of `makeSong` or the
// section schema can't silently drop required keys.

import { describe, it, expect } from 'vitest';
import {
  makeSong,
  createBuiltInSongs,
  libraryLevelToDifficulty,
  type SectionDef,
} from '../src/built-in-songs';

describe('libraryLevelToDifficulty', () => {
  it('maps levels 1–4 onto the plant band', () => {
    expect(libraryLevelToDifficulty(1)).toBe('sprout');
    expect(libraryLevelToDifficulty(2)).toBe('leaf');
    expect(libraryLevelToDifficulty(3)).toBe('tree');
    expect(libraryLevelToDifficulty(4)).toBe('mountain');
  });
  it('falls back to the middle of the ramp for missing/out-of-range levels', () => {
    expect(libraryLevelToDifficulty(undefined)).toBe('leaf');
    expect(libraryLevelToDifficulty(0)).toBe('leaf');
    expect(libraryLevelToDifficulty(9)).toBe('leaf');
  });
});

describe('makeSong', () => {
  const sectionDefs: SectionDef[] = [
    { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
  ];

  it('builds an mxlUrl from id ("assets/<id>.mxl")', () => {
    const song = makeSong('my_song', 'titleKey', 'compKey', '🎹', sectionDefs);
    expect(song.mxlUrl).toBe('assets/my_song.mxl');
    expect(song.xmlUrl).toBe('assets/my_song.xml');
  });

  it('carries through the static metadata fields verbatim', () => {
    const song = makeSong('test', 'tKey', 'cKey', '🌸', sectionDefs);
    expect(song.id).toBe('test');
    expect(song.titleKey).toBe('tKey');
    expect(song.composerKey).toBe('cKey');
    expect(song.icon).toBe('🌸');
    expect(song.sectionDefs).toBe(sectionDefs);
  });

  it('initializes lazy-load fields to neutral defaults (the score-loader fills them later)', () => {
    const song = makeSong('test', 'tKey', 'cKey', '🌸', sectionDefs);
    expect(song.notes).toBeNull();
    expect(song.totalSec).toBe(0);
    expect(song.sections).toEqual([]);
    expect(song.playbackOrder).toEqual([]);
    expect(song._loaded).toBe(false);
    expect(song._loadingPromise).toBeNull();
  });
});

describe('createBuiltInSongs', () => {
  it('exposes both built-in songs by their id', () => {
    const catalog = createBuiltInSongs();
    expect(catalog).toHaveProperty('fur_elise');
    expect(catalog).toHaveProperty('alla_turca');
  });

  it('Für Elise has the expected 3-section A/B/A2 schema with A2 marked as boss', () => {
    const catalog = createBuiltInSongs();
    const fe = catalog.fur_elise;
    expect(fe.id).toBe('fur_elise');
    expect(fe.titleKey).toBe('furElise');
    expect(fe.composerKey).toBe('composerBeethoven');
    expect(fe.sectionDefs).toHaveLength(3);
    expect(fe.sectionDefs.map((s: SectionDef) => s.id)).toEqual(['A1', 'B', 'A2']);
    expect(fe.sectionDefs[2].isBoss).toBe(true); // A2 is the climactic section
    expect(fe.sectionDefs[0].isBoss).toBe(false);
    expect(fe.sectionDefs[1].isBoss).toBe(false);
  });

  it('Rondo alla Turca has the expected 3-section schema with A2 marked as boss', () => {
    const catalog = createBuiltInSongs();
    const at = catalog.alla_turca;
    expect(at.id).toBe('alla_turca');
    expect(at.titleKey).toBe('turkishMarch');
    expect(at.composerKey).toBe('composerMozart');
    expect(at.sectionDefs).toHaveLength(3);
    expect(at.sectionDefs.map((s: SectionDef) => s.id)).toEqual(['A1', 'B', 'A2']);
    expect(at.sectionDefs[2].isBoss).toBe(true);
  });

  it('mxlUrl points to assets/<id>.mxl (matches packages/web/public/assets/ layout)', () => {
    const catalog = createBuiltInSongs();
    expect(catalog.fur_elise.mxlUrl).toBe('assets/fur_elise.mxl');
    expect(catalog.alla_turca.mxlUrl).toBe('assets/alla_turca.mxl');
  });

  it('every section has a translation key + a description key', () => {
    const catalog = createBuiltInSongs();
    for (const song of Object.values(catalog)) {
      for (const sec of song.sectionDefs as SectionDef[]) {
        expect(sec.nameKey).toMatch(/^[a-zA-Z0-9]+$/);
        expect(sec.descKey).toMatch(/^[a-zA-Z0-9]+$/);
        expect(typeof sec.startMeasure).toBe('number');
        expect(sec.startMeasure).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('each call returns a fresh catalog (no shared mutation between callers)', () => {
    const a = createBuiltInSongs();
    const b = createBuiltInSongs();
    expect(a).not.toBe(b);
    expect(a.fur_elise).not.toBe(b.fur_elise);
    // The lazy-load fields must be independent.
    a.fur_elise._loaded = true;
    expect(b.fur_elise._loaded).toBe(false);
  });

  it('startMeasure values are non-decreasing within each song (no rewind sections)', () => {
    const catalog = createBuiltInSongs();
    for (const song of Object.values(catalog)) {
      const defs = song.sectionDefs as SectionDef[];
      for (let i = 1; i < defs.length; i++) {
        expect(defs[i].startMeasure).toBeGreaterThan(defs[i - 1].startMeasure);
      }
    }
  });
});
