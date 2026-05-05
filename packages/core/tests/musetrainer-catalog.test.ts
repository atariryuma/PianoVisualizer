import { describe, it, expect } from 'vitest';
import { libraryEntryFromGhFile } from '../src/library/musetrainer-catalog';

const SHA = 'abc1234';

describe('libraryEntryFromGhFile', () => {
  it('strips the .mxl extension and splits composer / title on the first underscore', () => {
    const e = libraryEntryFromGhFile(
      { name: 'Bach_Minuet_in_G_Major_BWV_Anh._114.mxl', size: 4096 },
      { pinnedSha: SHA }
    );
    expect(e.composer).toBe('Bach');
    expect(e.title).toBe('Minuet in G Major BWV Anh. 114');
    expect(e.label).toBe('Bach — Minuet in G Major BWV Anh. 114');
  });

  it('treats the explicit `_-_` separator as a composer/title boundary', () => {
    const e = libraryEntryFromGhFile(
      { name: 'Mussorgsky_-_Pictures_at_an_Exhibition.mxl' },
      { pinnedSha: SHA }
    );
    expect(e.composer).toBe('Mussorgsky');
    expect(e.title).toBe('Pictures at an Exhibition');
  });

  it('falls back to the stem when only one token is present', () => {
    const e = libraryEntryFromGhFile({ name: 'Untitled.mxl' }, { pinnedSha: SHA });
    expect(e.label).toBe('Untitled');
    expect(e.composer).toBe('Untitled');
    expect(e.title).toBe('');
  });

  it('builds the jsDelivr URL with the pinned SHA', () => {
    const e = libraryEntryFromGhFile({ name: 'Bach_Minuet.mxl' }, { pinnedSha: 'deadbeef' });
    expect(e.url).toBe(
      'https://cdn.jsdelivr.net/gh/musetrainer/library@deadbeef/scores/Bach_Minuet.mxl'
    );
  });

  it('encodes special characters in the filename for the URL', () => {
    const e = libraryEntryFromGhFile({ name: 'Composer Name & Friends.mxl' }, { pinnedSha: SHA });
    // & must be encoded; spaces become %20
    expect(e.url).toContain('Composer%20Name%20%26%20Friends.mxl');
  });

  it('applies jpOverrides when the filename has an entry', () => {
    const e = libraryEntryFromGhFile(
      { name: 'Bach_Minuet.mxl' },
      {
        pinnedSha: SHA,
        jpOverrides: {
          'Bach_Minuet.mxl': { composerJp: 'バッハ', titleJp: 'メヌエット' },
        },
      }
    );
    expect(e.composerJp).toBe('バッハ');
    expect(e.titleJp).toBe('メヌエット');
    expect(e.labelJp).toBe('バッハ — メヌエット');
  });

  it('null JP fields when no override matches', () => {
    const e = libraryEntryFromGhFile(
      { name: 'Bach_Minuet.mxl' },
      { pinnedSha: SHA, jpOverrides: { 'OtherFile.mxl': { composerJp: 'X', titleJp: 'Y' } } }
    );
    expect(e.composerJp).toBeNull();
    expect(e.titleJp).toBeNull();
    expect(e.labelJp).toBeNull();
  });

  it('uses default emoji icon when not overridden', () => {
    const e = libraryEntryFromGhFile({ name: 'X.mxl' }, { pinnedSha: SHA });
    expect(e.icon).toBe('🎼');
  });

  it('honors a custom defaultIcon', () => {
    const e = libraryEntryFromGhFile({ name: 'X.mxl' }, { pinnedSha: SHA, defaultIcon: '🎵' });
    expect(e.icon).toBe('🎵');
  });

  it('size defaults to 0 when missing', () => {
    const e = libraryEntryFromGhFile({ name: 'X.mxl' }, { pinnedSha: SHA });
    expect(e.size).toBe(0);
  });

  it('preserves explicit size', () => {
    const e = libraryEntryFromGhFile({ name: 'X.mxl', size: 12345 }, { pinnedSha: SHA });
    expect(e.size).toBe(12345);
  });
});
