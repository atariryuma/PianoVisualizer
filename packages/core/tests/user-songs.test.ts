import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  openUserDb,
  userDbAll,
  userDbPut,
  userDbDelete,
  parseUserSongFromBlob,
  makeUserSong,
  type UserSongRecord,
} from '../src/library/user-songs';
import { PLAIN_8 } from './_fixtures/musicxml-fixtures';

let parser: { parseFromString(text: string, type: string): Document };
let factory: IDBFactory;

beforeAll(async () => {
  // linkedom for DOMParser, fake-indexeddb for IDBFactory.
  const ld = await import('linkedom');
  parser = {
    parseFromString(text: string, _type: string) {
      return ld.parseHTML(text).document as unknown as Document;
    },
  };
  const fake = await import('fake-indexeddb');
  factory = new fake.IDBFactory();
});

// === Fixtures ===

/** Build a Blob holding plain MusicXML text (not zipped). */
function xmlBlob(xml: string): Blob {
  // Use any here — Node's Blob has slightly different typing than browser.
  return new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
}

/** A fake JSZip loader that just exposes a single .xml file with the given content. */
function fakeJSZip(scoreXml: string) {
  return {
    async loadAsync(_buf: ArrayBuffer) {
      const files: Record<string, unknown> = {
        'META-INF/container.xml': true,
        'score.xml': true,
      };
      return {
        files,
        file(name: string) {
          if (name === 'META-INF/container.xml') {
            return {
              async: async (_t: 'text') =>
                '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>',
            };
          }
          if (name === 'score.xml') {
            return { async: async (_t: 'text') => scoreXml };
          }
          return null;
        },
      };
    },
  };
}

const FIXED_ID = 'usr_test_abc123';
const opts = () => ({
  parser,
  generateId: () => FIXED_ID,
});

// =====================================================================

describe('parseUserSongFromBlob', () => {
  it('parses a plain .musicxml blob into a record', async () => {
    const rec = await parseUserSongFromBlob(xmlBlob(PLAIN_8), {
      ...opts(),
      filename: 'test.musicxml',
    });
    expect(rec.id).toBe(FIXED_ID);
    expect(rec.title).toBe('Test Piece');
    expect(rec.composer).toBe('A. Test');
    expect(rec.mimeType).toBe('application/vnd.recordare.musicxml+xml');
    expect(rec.sectionDefs).toHaveLength(3);
    expect(rec.sectionDefs[0].id).toBe('A1');
  });

  it('parses an .mxl-style zip blob via injected JSZip', async () => {
    // Pretend the blob is zipped (PK header) — our fakeJSZip returns the score directly.
    const fakeZipBlob = new Blob([new Uint8Array([0x50, 0x4b])], {
      type: 'application/vnd.recordare.musicxml+zip',
    });
    const rec = await parseUserSongFromBlob(fakeZipBlob, {
      ...opts(),
      filename: 'test.mxl',
      jszip: fakeJSZip(PLAIN_8),
    });
    expect(rec.mimeType).toBe('application/vnd.recordare.musicxml+zip');
    expect(rec.title).toBe('Test Piece');
  });

  it('falls back to filename stem when title metadata is missing', async () => {
    const noTitle =
      '<?xml version="1.0"?><score-partwise><part id="P1"><measure number="1"/><measure number="2"/><measure number="3"/></part></score-partwise>';
    const rec = await parseUserSongFromBlob(xmlBlob(noTitle), {
      ...opts(),
      filename: 'mystery.musicxml',
    });
    expect(rec.title).toBe('mystery');
  });

  it('throws when score has no measures', async () => {
    const empty =
      '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list></score-partwise>';
    await expect(parseUserSongFromBlob(xmlBlob(empty), opts())).rejects.toThrow(/no measures/);
  });

  it('refuses .mxl when no JSZip is provided', async () => {
    const fakeZipBlob = new Blob([new Uint8Array([0x50, 0x4b])], {
      type: 'application/vnd.recordare.musicxml+zip',
    });
    await expect(
      parseUserSongFromBlob(fakeZipBlob, { ...opts(), filename: 'x.mxl' /* no jszip */ })
    ).rejects.toThrow(/JSZip/);
  });

  it('honors titleOverride / composerOverride', async () => {
    const rec = await parseUserSongFromBlob(xmlBlob(PLAIN_8), {
      ...opts(),
      titleOverride: 'My Custom Title',
      composerOverride: 'My Custom Composer',
    });
    expect(rec.title).toBe('My Custom Title');
    expect(rec.composer).toBe('My Custom Composer');
  });
});

// =====================================================================

describe('makeUserSong', () => {
  const sampleRecord: UserSongRecord = {
    id: 'usr_xyz',
    title: 'Sample',
    composer: 'Composer',
    mxlBlob: new Blob(['x'], { type: 'application/vnd.recordare.musicxml+zip' }),
    mimeType: 'application/vnd.recordare.musicxml+zip',
    sectionDefs: [
      { id: 'A1', nameKey: 'userSecA1', descKey: 'userSecA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'userSecB', descKey: 'userSecBdesc', startMeasure: 5, isBoss: false },
      { id: 'A2', nameKey: 'userSecA2', descKey: 'userSecA2desc', startMeasure: 10, isBoss: true },
    ],
    addedAt: 0,
    source: 'upload',
  };

  it('builds a UserSong from a record (mxl path)', () => {
    const song = makeUserSong(sampleRecord, { urlFactory: () => 'blob:fake-url' });
    expect(song.id).toBe('usr_xyz');
    expect(song.titleKey).toBe('__userTitle:usr_xyz');
    expect(song.composerKey).toBe('__userComposer:usr_xyz');
    expect(song.mxlUrl).toBe('blob:fake-url');
    expect(song.xmlUrl).toBeNull();
    expect(song._isUser).toBe(true);
    expect(song._userTitle).toBe('Sample');
    expect(song._userComposer).toBe('Composer');
  });

  it('routes plain XML to xmlUrl, leaves mxlUrl null', () => {
    const xmlRec = { ...sampleRecord, mimeType: 'application/vnd.recordare.musicxml+xml' as const };
    const song = makeUserSong(xmlRec, { urlFactory: () => 'blob:plain-xml' });
    expect(song.mxlUrl).toBeNull();
    expect(song.xmlUrl).toBe('blob:plain-xml');
  });

  it('throws if no urlFactory and URL is unavailable', () => {
    const saveURL = (globalThis as any).URL;
    delete (globalThis as any).URL;
    try {
      expect(() => makeUserSong(sampleRecord)).toThrow(/URL.createObjectURL/);
    } finally {
      if (saveURL) (globalThis as any).URL = saveURL;
    }
  });

  it('falls back to id when title/composer are empty', () => {
    const noNames: UserSongRecord = { ...sampleRecord, title: '', composer: '' };
    const song = makeUserSong(noNames, { urlFactory: () => 'blob:x' });
    expect(song._userTitle).toBe(noNames.id);
    expect(song._userComposer).toBe('');
  });
});

// =====================================================================

describe('IndexedDB CRUD with fake-indexeddb', () => {
  // Use a unique db name per test so they don't share state.
  let dbCounter = 0;
  const newDbName = () => 'pianoViz_test_' + dbCounter++;

  beforeEach(async () => {
    // Each test gets a fresh factory (fake-indexeddb supports new IDBFactory()).
    const fake = await import('fake-indexeddb');
    factory = new fake.IDBFactory();
  });

  it('opens + creates objectStore on first open', async () => {
    const db = await openUserDb({ factory, dbName: newDbName() });
    expect(db.objectStoreNames.contains('userSongs')).toBe(true);
    db.close();
  });

  it('put + getAll round-trips a record', async () => {
    const db = await openUserDb({ factory, dbName: newDbName() });
    const rec: UserSongRecord = {
      id: 'a',
      title: 'A',
      composer: '',
      mxlBlob: new Blob(['x']),
      mimeType: 'application/vnd.recordare.musicxml+xml',
      sectionDefs: [],
      addedAt: 1,
      source: 'upload',
    };
    await userDbPut(db, rec);
    const all = await userDbAll(db);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('a');
    db.close();
  });

  it('delete removes the record', async () => {
    const db = await openUserDb({ factory, dbName: newDbName() });
    const make = (id: string): UserSongRecord => ({
      id,
      title: id,
      composer: '',
      mxlBlob: new Blob(['x']),
      mimeType: 'application/vnd.recordare.musicxml+xml',
      sectionDefs: [],
      addedAt: 1,
      source: 'upload',
    });
    await userDbPut(db, make('a'));
    await userDbPut(db, make('b'));
    await userDbDelete(db, 'a');
    const all = await userDbAll(db);
    expect(all.map((r) => r.id)).toEqual(['b']);
    db.close();
  });

  it('put with same id overwrites (keyPath is "id")', async () => {
    const db = await openUserDb({ factory, dbName: newDbName() });
    await userDbPut(db, {
      id: 'x',
      title: 'first',
      composer: '',
      mxlBlob: new Blob(['x']),
      mimeType: 'application/vnd.recordare.musicxml+xml',
      sectionDefs: [],
      addedAt: 1,
      source: 'upload',
    });
    await userDbPut(db, {
      id: 'x',
      title: 'second',
      composer: '',
      mxlBlob: new Blob(['y']),
      mimeType: 'application/vnd.recordare.musicxml+xml',
      sectionDefs: [],
      addedAt: 2,
      source: 'upload',
    });
    const all = await userDbAll(db);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('second');
    db.close();
  });

  it('rejects open if no IDBFactory available', async () => {
    await expect(openUserDb({ factory: undefined as any })).rejects.toThrow(/IndexedDB/);
  });
});
