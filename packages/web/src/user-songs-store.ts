// User-songs persistence + SONGS-registry maintenance — Phase 0d batch 51.
//
// Six entry points, all touching the same SONGS map + IndexedDB store:
//
//   - registerUserSong(record): promote a stored record into the
//     SONGS registry, building a blob URL OSMD can load. Performs
//     a lazy-migration step for old .mxl records that didn't cache
//     their unzipped XML text (Android Chrome was hanging on the
//     second blob fetch otherwise).
//
//   - loadAll(): read every record from IndexedDB and register each.
//     Returns the count loaded; logs and returns 0 on any DB failure
//     (the rest of the app still works without the user library).
//
//   - addFromBlob(blob, opts): detect MIME (.mxl vs .xml/.musicxml),
//     parse metadata, generate a unique id, auto-section the score,
//     persist the record, and register. Returns the persisted record.
//
//   - addFromUrl(url, opts): fetch with 30 s timeout + 20 MB size
//     guard, derive filename robustly (URL constructor handles bare
//     hosts / query / fragment), delegate to addFromBlob.
//
//   - rename(id, newTitle, newComposer): patch the IDB record + the
//     in-memory SONGS entry so the next render sees the new strings.
//
//   - remove(id): drop from IDB, revoke blob URLs, drop the SONGS
//     entry, drop per-song practice progress (otherwise the
//     localStorage row leaks forever).
//
// All math + parsing comes from @piano/core; this module only owns
// the persistence orchestration + the in-memory registry mutation.

export interface UserSongRecord {
  id: string;
  title: string;
  composer: string;
  mxlBlob: Blob;
  xmlText?: string;
  mimeType: string;
  sectionDefs: unknown;
  addedAt: number;
  source?: string;
}

export interface SongRegEntry {
  id: string;
  titleKey: string;
  composerKey: string;
  icon: string;
  mxlUrl: string;
  xmlUrl: string;
  _xmlText?: string;
  sectionDefs: unknown;
  notes: unknown;
  totalSec: number;
  sections: unknown[];
  playbackOrder: unknown[];
  _loaded: boolean;
  _loadingPromise: unknown;
  _isUser: boolean;
  _userTitle: string;
  _userComposer: string;
}

export interface UserSongsStoreUserDb {
  open(): Promise<{
    transaction(
      name: string,
      mode: IDBTransactionMode
    ): {
      objectStore(name: string): {
        get(id: string): IDBRequest;
      };
    };
  }>;
  all(): Promise<UserSongRecord[]>;
  put(record: UserSongRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface UserSongsStoreCoreFns {
  parseMusicXmlMetadata(xml: string): {
    title?: string;
    composer?: string;
    measureCount: number;
  };
  autoSectionDefs(xml: string, measureCount: number): unknown;
}

export interface UserSongsStorePracticeRef {
  progress?: { songs?: Record<string, unknown> };
}

export interface UserSongsStoreDeps {
  userDb: UserSongsStoreUserDb;
  /** IDB store name (matches `USER_DB_STORE`). */
  userDbStoreName: string;
  /** Unzip an .mxl blob to its inner MusicXML text (held by deps so
   *  the test stubs without dragging JSZip in). */
  unzipMxlToXmlText(blob: Blob): Promise<string>;
  /** Parse + auto-section helpers from @piano/core. */
  fns: UserSongsStoreCoreFns;
  /** Mutable SONGS registry — we read for rename/remove and write
   *  for register. */
  songs: Record<string, SongRegEntry>;
  /** Practice ref for progress mutation in remove(). Lazy because
   *  the legacy `practice` binding sits below this factory call. */
  getPractice: () => UserSongsStorePracticeRef;
  /** Persists practice progress after we mutate the per-song row. */
  savePracticeProgress: () => void;
  /** Per-URL-import limits. */
  urlTimeoutMs: number;
  maxBytes: number;
  /** Production: globals. Held by deps so happy-dom-less tests can
   *  pass thin stubs without polluting globalThis. */
  fetch: typeof fetch;
  AbortController: typeof AbortController;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  /** Production: `URL`. Test passes a stub with createObjectURL +
   *  revokeObjectURL spies. */
  url: {
    createObjectURL(b: Blob): string;
    revokeObjectURL(s: string): void;
  };
  /** Production: `Date.now`. */
  now: () => number;
  /** Production: `Math.random`. */
  random: () => number;
}

export interface UserSongsStore {
  register(record: UserSongRecord): Promise<SongRegEntry>;
  loadAll(): Promise<number>;
  addFromBlob(
    blob: Blob,
    opts?: {
      filename?: string;
      source?: string;
      titleOverride?: string;
      composerOverride?: string;
    }
  ): Promise<UserSongRecord>;
  addFromUrl(
    url: string,
    opts?: {
      filename?: string;
      source?: string;
      titleOverride?: string;
      composerOverride?: string;
    }
  ): Promise<UserSongRecord>;
  rename(id: string, newTitle: string, newComposer: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const PLAIN_MIME = 'application/vnd.recordare.musicxml+xml';
const ZIP_MIME = 'application/vnd.recordare.musicxml+zip';

export function createUserSongsStore(deps: UserSongsStoreDeps): UserSongsStore {
  async function register(record: UserSongRecord): Promise<SongRegEntry> {
    const isMxl = record.mimeType !== PLAIN_MIME;
    let xmlText = record.xmlText;
    if (isMxl && !xmlText) {
      // Lazy migration: existing records (added before this fix)
      // didn't cache xmlText. Unzip on the fly now and persist for
      // next time.
      try {
        xmlText = await deps.unzipMxlToXmlText(record.mxlBlob);
        record.xmlText = xmlText;
        try {
          await deps.userDb.put(record);
        } catch {
          /* DB save best-effort */
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.warn('[UserSongs] mxl unzip failed for ' + record.id + ': ' + msg);
      }
    } else if (!isMxl && !xmlText) {
      // Plain .musicxml/.xml record — unwrap to text so the load
      // path is uniform.
      try {
        xmlText = await record.mxlBlob.text();
      } catch {
        /* fallthrough */
      }
    }
    // Re-register of an existing id (JSON re-import): revoke the previous
    // blob URLs before overwriting, or the multi-MB XML blobs leak for the
    // page's lifetime (remove() revokes; register was asymmetric).
    const prev = deps.songs[record.id];
    if (prev) {
      if (prev.xmlUrl?.startsWith('blob:')) deps.url.revokeObjectURL(prev.xmlUrl);
      if (prev.mxlUrl?.startsWith('blob:')) deps.url.revokeObjectURL(prev.mxlUrl);
    }
    // Always present OSMD with a plain-XML blob URL when we could
    // read xmlText; fall back to the raw blob URL only if unzip
    // failed.
    const url = xmlText
      ? deps.url.createObjectURL(new Blob([xmlText], { type: PLAIN_MIME }))
      : deps.url.createObjectURL(record.mxlBlob);
    const song: SongRegEntry = {
      id: record.id,
      titleKey: '__userTitle:' + record.id,
      composerKey: '__userComposer:' + record.id,
      icon: '🎵',
      // After unzip, the song carries an xml URL whether the source
      // was .mxl or .xml. The few branches that key off "is this a
      // user .mxl?" use _isUser instead now.
      mxlUrl: '',
      xmlUrl: url,
      _xmlText: xmlText || undefined,
      sectionDefs: record.sectionDefs,
      notes: null,
      totalSec: 0,
      sections: [],
      playbackOrder: [],
      _loaded: false,
      _loadingPromise: null,
      _isUser: true,
      _userTitle: record.title || record.id,
      _userComposer: record.composer || '',
    };
    deps.songs[record.id] = song;
    return song;
  }

  async function loadAll(): Promise<number> {
    try {
      const all = await deps.userDb.all();
      for (const rec of all) await register(rec);
      return all.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      console.warn('[UserSongs] load failed:', msg);
      return 0;
    }
  }

  /** CONTENT FIRST, hints second. The bytes are ground truth; the MIME type
   *  and the filename are guesses, and a guess must never beat them.
   *
   *  [Bug fix 2026-07-26] The filename check used to run first, so ANY guessed
   *  name ending in `.mxl` forced the zip path. `addFromUrl`'s fallback name is
   *  literally `untitled.mxl`, and it fired for every relative URL (see the
   *  filename derivation below) — so all 36 plain `.musicxml` library scores
   *  were fed to JSZip and died with "Can't find end of central directory".
   *  Only the 22 genuinely-zipped `.mxl` entries worked. Sniffing first makes
   *  that whole class of bug impossible: a wrong name is now harmless. */
  async function detectIsMxl(blob: Blob, opts: { filename?: string }): Promise<boolean> {
    if (blob.size > 0) {
      try {
        // "PK" = the zip local-file-header signature; "<" (after an optional
        // BOM) = XML. Either one is conclusive on its own.
        const head = (await blob.slice(0, 8).text()).replace(/^\uFEFF/, '');
        if (head.startsWith('PK')) return true;
        if (head.trimStart().startsWith('<')) return false;
      } catch {
        /* slice can fail in odd polyfills — fall through to the hints */
      }
    }
    if (blob.type === ZIP_MIME) return true;
    if ((opts.filename || '').toLowerCase().endsWith('.mxl')) return true;
    return false;
  }

  async function addFromBlob(
    blob: Blob,
    opts: {
      filename?: string;
      source?: string;
      titleOverride?: string;
      composerOverride?: string;
    } = {}
  ): Promise<UserSongRecord> {
    // ファイル選択経路（user-songs-ui.ts → addFromBlob）は addFromUrl の
    // ような事前チェックが無く無防備なので、URL 経路と同じサイズ上限を課す。
    if (blob.size > deps.maxBytes) {
      throw new Error('File too large (' + Math.round(blob.size / 1024 / 1024) + ' MB; max 20 MB)');
    }
    const isMxl = await detectIsMxl(blob, opts);
    const xmlText = isMxl ? await deps.unzipMxlToXmlText(blob) : await blob.text();
    const meta = deps.fns.parseMusicXmlMetadata(xmlText);
    if (meta.measureCount < 1) throw new Error('Score has no measures');
    const id = 'usr_' + deps.now().toString(36) + '_' + deps.random().toString(36).slice(2, 7);
    const sectionDefs = deps.fns.autoSectionDefs(xmlText, meta.measureCount);
    const record: UserSongRecord = {
      id,
      title:
        opts.titleOverride || meta.title || (opts.filename || 'Untitled').replace(/\.[^.]+$/, ''),
      composer: opts.composerOverride || meta.composer || '',
      mxlBlob: blob,
      // Cached so registerUserSong + section-editor reload don't
      // have to re-unzip on every app start.
      xmlText,
      mimeType: isMxl ? ZIP_MIME : PLAIN_MIME,
      sectionDefs,
      addedAt: deps.now(),
      source: opts.source || 'upload',
    };
    await deps.userDb.put(record);
    await register(record);
    return record;
  }

  async function addFromUrl(
    url: string,
    opts: {
      filename?: string;
      source?: string;
      titleOverride?: string;
      composerOverride?: string;
    } = {}
  ): Promise<UserSongRecord> {
    const ctrl = new deps.AbortController();
    const timer = deps.setTimeout(() => ctrl.abort(), deps.urlTimeoutMs);
    let res: Response;
    try {
      res = await deps.fetch(url, { mode: 'cors', signal: ctrl.signal });
    } catch (e) {
      if (e && (e as { name?: string }).name === 'AbortError') {
        throw new Error('Download timed out (30s) — check connection and try again');
      }
      throw e;
    } finally {
      deps.clearTimeout(timer);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
    const declared = parseInt(res.headers.get('content-length') || '0', 10);
    if (declared && declared > deps.maxBytes) {
      throw new Error('File too large (' + Math.round(declared / 1024 / 1024) + ' MB; max 20 MB)');
    }
    const blob = await res.blob();
    if (blob.size > deps.maxBytes) {
      throw new Error('File too large (' + Math.round(blob.size / 1024 / 1024) + ' MB; max 20 MB)');
    }
    // Robust filename derivation (URL constructor handles bare
    // hostnames, query strings, and fragments uniformly; the
    // previous split() chain returned an empty string for
    // `https://host` and broke meta lookup).
    //
    // [Bug fix 2026-07-26] The base matters. The bundled catalog hands us
    // RELATIVE urls (`assets/library/x.musicxml` — LIBRARY_BASE has no leading
    // slash on purpose, so it resolves the same under capacitor:// and https://),
    // and single-argument `new URL()` throws on those. Every library add
    // therefore fell into the catch and got the name `untitled.mxl`, which then
    // pushed plain XML down the zip path in detectIsMxl. A dummy base is enough
    // — we only want the last path segment, and an absolute url ignores it.
    let filename = opts.filename;
    if (!filename) {
      try {
        const path = new URL(url, 'file:///').pathname;
        filename = path.substring(path.lastIndexOf('/') + 1) || 'untitled.mxl';
      } catch {
        filename = 'untitled.mxl';
      }
    }
    return addFromBlob(blob, { ...opts, filename, source: opts.source || 'url' });
  }

  async function rename(id: string, newTitle: string, newComposer: string): Promise<void> {
    const db = await deps.userDb.open();
    const rec = await new Promise<UserSongRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(deps.userDbStoreName, 'readonly');
      const r = tx.objectStore(deps.userDbStoreName).get(id);
      r.onsuccess = () => resolve(r.result as UserSongRecord | undefined);
      r.onerror = () => reject(r.error);
    });
    if (!rec) throw new Error('Song not found: ' + id);
    rec.title = newTitle;
    rec.composer = newComposer;
    await deps.userDb.put(rec);
    const song = deps.songs[id];
    if (song) {
      song._userTitle = newTitle;
      song._userComposer = newComposer;
    }
  }

  async function remove(id: string): Promise<void> {
    await deps.userDb.delete(id);
    const song = deps.songs[id];
    if (song) {
      if (song.mxlUrl?.startsWith('blob:')) deps.url.revokeObjectURL(song.mxlUrl);
      if (song.xmlUrl?.startsWith('blob:')) deps.url.revokeObjectURL(song.xmlUrl);
      delete deps.songs[id];
    }
    // Also drop any per-song progress (otherwise the localStorage
    // row leaks forever).
    const practice = deps.getPractice();
    if (practice.progress?.songs?.[id]) {
      delete practice.progress.songs[id];
      deps.savePracticeProgress();
    }
  }

  return { register, loadAll, addFromBlob, addFromUrl, rename, remove };
}
