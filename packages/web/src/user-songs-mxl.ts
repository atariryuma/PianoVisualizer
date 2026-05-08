// User-songs IndexedDB handle cache + .mxl unzip — Phase 0d batch 49.
//
// Two pieces, bundled because every caller of `unzipMxlToXmlText` is
// also a caller of one of the userDb* wrappers (the lazy-migration
// path inside registerUserSong does both):
//
//   1. `createUserDb(deps)` — wraps the four IndexedDB ops from
//      @piano/core (open/all/put/delete) so call sites don't pass a
//      `db` arg every time. The handle is opened lazily on first
//      use and cached as a Promise so concurrent first calls share
//      the open.
//
//   2. `unzipMxlToXmlText(blob, deps)` — extracts the inner score XML
//      from a `.mxl` zip blob. Honors the META-INF/container.xml
//      pointer when present; otherwise picks the first non-META-INF
//      `.xml` file. Pure utility — JSZip is held by deps so callers
//      can swap a stub in tests / pin the library version locally.
//
// Both are dependency-free of the legacy big `state` bag, so no
// thunks needed.

/** Generic over the DB-handle type (IDBDatabase in production, any
 *  in test) and the record shape. The legacy shell binds D=IDBDatabase
 *  so call sites that read `db.transaction(...)` keep working. */
export type UserDbAllFn<D, R> = (db: D) => Promise<R[]>;
export type UserDbPutFn<D, R> = (db: D, record: R) => Promise<void>;
export type UserDbDeleteFn<D> = (db: D, id: string) => Promise<void>;

export interface UserDbCoreFns<D, R> {
  /** Lazily open / migrate / return the database handle. */
  openUserDb(): Promise<D>;
  userDbAll: UserDbAllFn<D, R>;
  userDbPut: UserDbPutFn<D, R>;
  userDbDelete: UserDbDeleteFn<D>;
}

export interface UserDbHandle<D, R> {
  /** Open-on-first-use; returns the cached Promise on subsequent
   *  calls so concurrent boots don't re-enter `openUserDb`. */
  open(): Promise<D>;
  /** Read every record. */
  all(): Promise<R[]>;
  /** Insert / update one record (keyed by `id`). */
  put(record: R): Promise<void>;
  /** Delete by id. */
  delete(id: string): Promise<void>;
}

export function createUserDb<D, R>(fns: UserDbCoreFns<D, R>): UserDbHandle<D, R> {
  let pending: Promise<D> | null = null;
  function open(): Promise<D> {
    if (pending) return pending;
    pending = fns.openUserDb();
    return pending;
  }
  return {
    open,
    async all() {
      return fns.userDbAll(await open());
    },
    async put(record) {
      return fns.userDbPut(await open(), record);
    },
    async delete(id) {
      return fns.userDbDelete(await open(), id);
    },
  };
}

// ============================================================
// .mxl → MusicXML extraction
// ============================================================

interface JSZipFile {
  async(type: 'text'): Promise<string>;
}

interface JSZipInstance {
  files: Record<string, unknown>;
  file(path: string): JSZipFile | null;
}

interface JSZipLibrary {
  loadAsync(buf: ArrayBuffer): Promise<JSZipInstance>;
}

export interface UnzipMxlDeps {
  /** Held by deps so production gets the lazy global, tests can stub. */
  jszip: JSZipLibrary;
}

/** Unzip an .mxl blob and return the inner MusicXML text.
 *
 * Used at add-time (to extract metadata) and at register-time (to
 * feed OSMD a plain XML blob — blob: URLs strip filename/MIME hints,
 * so OSMD can't reliably auto-detect a zip via the URL alone,
 * especially on Android Chrome where it parses the bytes as XML and
 * fails). */
export async function unzipMxlToXmlText(blob: Blob, deps: UnzipMxlDeps): Promise<string> {
  const zip = await deps.jszip.loadAsync(await blob.arrayBuffer());
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
  if (!scoreFile) throw new Error('Score file vanished from zip mid-parse: ' + scorePath);
  return scoreFile.async('text');
}
