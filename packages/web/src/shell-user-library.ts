// User library shell — Phase 0d batch 109.
//
// Bundles the IndexedDB-backed user-imported scores cluster:
//   • _userDb (IndexedDB handle, lazy-opened)
//   • _userSongStore (promote stored/fetched records into SONGS)
//   • _onlineLibrary (musetrainer GitHub catalog with cache)
//   • ONLINE_LIBRARY mutable seed array
//   • unzipMxlToXmlText helper (JSZip-backed)
//   • parseMusicXmlMetadata / autoSectionDefs aliases (@piano/core)
//   • USER_DB_STORE / buildSectionsFromDefs aliases
//
// Returns the public surface needed by ShellAddSong + ShellOsmd +
// DevModeWireup. Mutability is preserved through getter+setter for
// ONLINE_LIBRARY.

import JSZipImpl from 'jszip';
import * as PianoCore from '@piano/core';
import * as UserSongsMxl from './user-songs-mxl';
import * as UserSongsStore from './user-songs-store';
import { createBundledLibrary } from './bundled-library';

export interface ShellUserLibraryDeps {
  /** Built-in SONGS registry — user imports merge in by id. */
  songs: any;
  /** practice + savePracticeProgress are forward-declared in the shell —
   *  getter / thunk so the cluster builds before the practice cluster. */
  getPractice: () => any;
  savePracticeProgress: () => void;
}

export interface ShellUserLibrary {
  // IndexedDB low-level
  USER_DB_STORE: string;
  openUserDb: () => Promise<any>;
  userDbAll: () => Promise<any[]>;
  userDbPut: (record: any) => Promise<unknown>;
  // MusicXML helpers
  unzipMxlToXmlText: (blob: Blob) => Promise<string>;
  parseMusicXmlMetadata: any;
  autoSectionDefs: any;
  buildSectionsFromDefs: any;
  // User-songs store (the {addFromBlob, addFromUrl, rename, remove,
  // register, loadAll} bundle ShellAddSong consumes).
  userSongStore: ReturnType<typeof UserSongsStore.createUserSongsStore>;
  // Forward-compat short forwarders (DevModeWireup needs them).
  loadUserSongs: () => Promise<number>;
  removeUserSong: (id: string) => Promise<unknown>;
  // Online library — mutable seed.
  fetchLibrary: (force?: boolean) => Promise<any>;
  getOnlineLibrary: () => any[];
  setOnlineLibrary: (entries: any[]) => void;
}

export function createShellUserLibrary(deps: ShellUserLibraryDeps): ShellUserLibrary {
  const USER_DB_STORE = PianoCore.USER_DB_STORE;

  const _userDb = UserSongsMxl.createUserDb({
    openUserDb: () => PianoCore.openUserDb(),
    userDbAll: PianoCore.userDbAll,
    userDbPut: PianoCore.userDbPut,
    userDbDelete: PianoCore.userDbDelete,
  });

  const parseMusicXmlMetadata = PianoCore.parseMusicXmlMetadata;
  const autoSectionDefs = PianoCore.autoSectionDefs;
  const buildSectionsFromDefs = PianoCore.buildSectionsFromDefs;

  async function unzipMxlToXmlText(blob: Blob): Promise<string> {
    return UserSongsMxl.unzipMxlToXmlText(blob, { jszip: JSZipImpl });
  }

  // Promote stored-or-just-fetched records into the SONGS registry.
  const USER_SONG_URL_TIMEOUT_MS = 30000;
  const USER_SONG_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
  const userSongStore = UserSongsStore.createUserSongsStore({
    userDb: _userDb,
    userDbStoreName: USER_DB_STORE,
    unzipMxlToXmlText: unzipMxlToXmlText as any,
    fns: { parseMusicXmlMetadata, autoSectionDefs },
    songs: deps.songs,
    getPractice: deps.getPractice,
    savePracticeProgress: deps.savePracticeProgress,
    urlTimeoutMs: USER_SONG_URL_TIMEOUT_MS,
    maxBytes: USER_SONG_MAX_BYTES,
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    AbortController,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    url: URL,
    now: () => Date.now(),
    random: () => Math.random(),
  } as any);

  // ── Self-owned bundled library (our own PD transcriptions in
  //    public/assets/library/; no third-party dependency — see bundled-library.ts). ──
  const _bundledLibrary = createBundledLibrary({
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  });

  let ONLINE_LIBRARY: any[] = [];

  return {
    USER_DB_STORE,
    openUserDb: () => _userDb.open(),
    userDbAll: () => _userDb.all(),
    userDbPut: (record: any) => _userDb.put(record),
    unzipMxlToXmlText,
    parseMusicXmlMetadata,
    autoSectionDefs,
    buildSectionsFromDefs,
    userSongStore,
    loadUserSongs: () => userSongStore.loadAll(),
    removeUserSong: (id: string) => userSongStore.remove(id),
    fetchLibrary: (force?: boolean) => _bundledLibrary.fetchEntries(force),
    getOnlineLibrary: () => ONLINE_LIBRARY,
    setOnlineLibrary: (entries: any[]) => {
      ONLINE_LIBRARY = entries;
    },
  };
}
