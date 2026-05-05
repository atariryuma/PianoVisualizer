// User-added songs — IndexedDB persistence + parsing pipeline.
//
// Layered for testability:
//
//   parseUserSongFromBlob (Blob → UserSongRecord)        ← pure-ish, accepts injected JSZip + DOMParser
//   userDb{Open,All,Put,Delete} (IndexedDB CRUD)         ← swap in fake-indexeddb for tests
//   makeUserSong (UserSongRecord → UserSong)             ← pure factory; SONGS-mutation lives at the call site
//
// The legacy app.js had `addUserSongFromBlob` that did parse + persist + mutate
// SONGS in one shot. That's the wrong abstraction — split here so the engine
// (mutation of SONGS, URL.createObjectURL lifecycle) stays in the shell, and
// pure pipelines stay testable in node.

import { parseMusicXmlMetadata } from './musicxml-meta';
import { autoSectionDefs, type SectionDef } from './auto-section';

export const USER_DB_NAME = 'pianoViz_v1';
export const USER_DB_STORE = 'userSongs';

/** A persisted user song. mxlBlob is either an .mxl zip or a plain .xml/.musicxml text blob. */
export interface UserSongRecord {
  id: string;
  title: string;
  composer: string;
  mxlBlob: Blob;
  mimeType: 'application/vnd.recordare.musicxml+zip' | 'application/vnd.recordare.musicxml+xml';
  sectionDefs: SectionDef[];
  addedAt: number;
  source: 'upload' | 'url' | 'library' | 'import' | string;
}

/** The Song shape the engine consumes. Mirrors the hardcoded SONGS entries. */
export interface UserSong {
  id: string;
  titleKey: string;
  composerKey: string;
  icon: string;
  mxlUrl: string | null;
  xmlUrl: string | null;
  sectionDefs: SectionDef[];
  notes: null;
  totalSec: number;
  sections: SectionDef[];
  playbackOrder: number[];
  measureToCursorStep: number[];
  _loaded: boolean;
  _loadingPromise: Promise<unknown> | null;
  _isUser: true;
  _userTitle: string;
  _userComposer: string;
}

// =====================================================================
// IndexedDB CRUD
// =====================================================================

export interface OpenDbOptions {
  /** Inject IDBFactory for tests (e.g. fake-indexeddb). Defaults to globalThis.indexedDB. */
  factory?: IDBFactory;
  dbName?: string;
  storeName?: string;
}

/**
 * Open (or upgrade) the user-song database. Returns the open IDBDatabase.
 *
 * Caller is responsible for caching the returned promise if they want to share
 * the connection — this function doesn't memoize, to keep it test-friendly.
 */
export function openUserDb(opts: OpenDbOptions = {}): Promise<IDBDatabase> {
  const factory = opts.factory ?? globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error('IndexedDB not available'));
  const dbName = opts.dbName ?? USER_DB_NAME;
  const storeName = opts.storeName ?? USER_DB_STORE;
  return new Promise((resolve, reject) => {
    const req = factory.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function userDbAll(db: IDBDatabase, storeName = USER_DB_STORE): Promise<UserSongRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as UserSongRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export function userDbPut(
  db: IDBDatabase,
  record: UserSongRecord,
  storeName = USER_DB_STORE
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function userDbDelete(
  db: IDBDatabase,
  id: string,
  storeName = USER_DB_STORE
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =====================================================================
// Parsing pipeline (Blob → UserSongRecord)
// =====================================================================

interface JSZipFile {
  async(type: 'text'): Promise<string>;
}
interface JSZipInstance {
  file(name: string): JSZipFile | null;
  files: Record<string, unknown>;
}
interface JSZipLoader {
  loadAsync(buf: ArrayBuffer): Promise<JSZipInstance>;
}

export interface ParseBlobOptions {
  filename?: string;
  titleOverride?: string;
  composerOverride?: string;
  source?: UserSongRecord['source'];
  /** Inject JSZip (default = window.JSZip if present). */
  jszip?: JSZipLoader;
  /** Inject DOMParser-like instance (default = new DOMParser()). */
  parser?: { parseFromString(text: string, type: string): Document };
  /** Inject id generator (default = `usr_<base36-time>_<base36-random>`). */
  generateId?: () => string;
}

const defaultIdGenerator = () =>
  'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

async function detectIsMxl(blob: Blob, filename?: string): Promise<boolean> {
  if (blob.type === 'application/vnd.recordare.musicxml+zip') return true;
  if ((filename || '').toLowerCase().endsWith('.mxl')) return true;
  if (blob.size < 2) return false;
  // ZIP magic bytes 'PK'.
  return (await blob.slice(0, 2).text()) === 'PK';
}

async function unzipScoreXml(blob: Blob, jszip: JSZipLoader): Promise<string> {
  const zip = await jszip.loadAsync(await blob.arrayBuffer());
  let scorePath: string | null = null;
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('text');
    const m = containerXml.match(/full-path="([^"]+)"/);
    if (m) scorePath = m[1];
  }
  if (!scorePath) {
    for (const name of Object.keys(zip.files)) {
      if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
        scorePath = name;
        break;
      }
    }
  }
  if (!scorePath) throw new Error('No score file inside .mxl archive');
  const scoreFile = zip.file(scorePath);
  if (!scoreFile) throw new Error('Score path not found in archive: ' + scorePath);
  return scoreFile.async('text');
}

/**
 * Parse a Blob (.mxl or .musicxml/.xml) into a UserSongRecord.
 *
 * Does NOT touch IndexedDB or the SONGS registry — caller decides whether to
 * persist + register.
 */
export async function parseUserSongFromBlob(
  blob: Blob,
  opts: ParseBlobOptions = {}
): Promise<UserSongRecord> {
  const filename = opts.filename ?? '';
  const isMxl = await detectIsMxl(blob, filename);

  let xmlText: string;
  if (isMxl) {
    const jszip =
      opts.jszip ?? ((globalThis as { JSZip?: JSZipLoader }).JSZip as JSZipLoader | undefined);
    if (!jszip) {
      throw new Error('Cannot read .mxl metadata without JSZip. Use .musicxml instead.');
    }
    xmlText = await unzipScoreXml(blob, jszip);
  } else {
    xmlText = await blob.text();
  }

  const meta = parseMusicXmlMetadata(xmlText, opts.parser ? { parser: opts.parser } : {});
  if (meta.measureCount < 1) throw new Error('Score has no measures');

  const id = (opts.generateId ?? defaultIdGenerator)();
  const sectionDefs = autoSectionDefs(
    xmlText,
    meta.measureCount,
    opts.parser ? { parser: opts.parser } : {}
  );

  return {
    id,
    title: opts.titleOverride || meta.title || (filename || 'Untitled').replace(/\.[^.]+$/, ''),
    composer: opts.composerOverride || meta.composer || '',
    mxlBlob: blob,
    mimeType: isMxl
      ? 'application/vnd.recordare.musicxml+zip'
      : 'application/vnd.recordare.musicxml+xml',
    sectionDefs,
    addedAt: Date.now(),
    source: opts.source ?? 'upload',
  };
}

// =====================================================================
// Pure factory: UserSongRecord → UserSong (no SONGS mutation)
// =====================================================================

export interface MakeSongOptions {
  /** Inject a URL factory for tests. Defaults to URL.createObjectURL. */
  urlFactory?: (blob: Blob) => string;
  /** Override the icon (default '🎵'). */
  icon?: string;
}

/**
 * Build a UserSong shape from a stored record. Allocates a blob URL via
 * `URL.createObjectURL` (or the injected factory). The caller owns the URL —
 * call `URL.revokeObjectURL` on song.mxlUrl/xmlUrl when removing the song.
 */
export function makeUserSong(record: UserSongRecord, opts: MakeSongOptions = {}): UserSong {
  const factory =
    opts.urlFactory ??
    ((typeof URL !== 'undefined' ? URL.createObjectURL : null) as ((b: Blob) => string) | null);
  if (!factory) throw new Error('URL.createObjectURL not available; pass opts.urlFactory');
  const url = factory(record.mxlBlob);
  const isMxl = record.mimeType !== 'application/vnd.recordare.musicxml+xml';
  return {
    id: record.id,
    titleKey: '__userTitle:' + record.id,
    composerKey: '__userComposer:' + record.id,
    icon: opts.icon ?? '🎵',
    mxlUrl: isMxl ? url : null,
    xmlUrl: !isMxl ? url : null,
    sectionDefs: record.sectionDefs,
    notes: null,
    totalSec: 0,
    sections: [],
    playbackOrder: [],
    measureToCursorStep: [],
    _loaded: false,
    _loadingPromise: null,
    _isUser: true,
    _userTitle: record.title || record.id,
    _userComposer: record.composer || '',
  };
}
