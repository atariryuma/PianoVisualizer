// Add-song shell — Phase 0d batch 102.
//
// Bundles the entire "user-imported songs + section editor" cluster into
// a single `createShellAddSong(deps)` factory. Holds:
//   • DOM_ADDSONG / DOM_SECEDIT element bags
//   • `byId` shorthand
//   • SectionEditor wire-up (opens from inside the add-song modal)
//   • UserSongsUi wire-up (the modal proper + library tab + tile builder)
//   • Boot-time hydration: `loadUserSongs()` → render tiles
//   • Persistent storage request (so iOS Safari ITP / Chrome eviction
//     doesn't drop user-imported scores)
//
// Returns the public surface the rest of the shell needs: the two modal
// elements (for ESC router + DevModeWireup) plus the open/close + render
// callbacks. SectionEditor's `onSaved` hook mutates the shared SONGS
// registry so a subsequent selectSong() picks up the new boundaries
// without a page reload.

import type { T } from '@piano/core';
import type { UiLibraryEntry } from './user-songs-ui';
import * as SectionEditor from './section-editor';
import * as UserSongsUi from './user-songs-ui';
import * as DomBag from './dom-bag';

export interface ShellAddSongDeps {
  document: Document;
  /** Mutable in-place by SectionEditor.onSaved + UserSongsUi.register. */
  songs: any;
  /** Live language pref — read at thunk time. */
  getLang: () => any;
  /** Mutable online-library array — getter/setter. */
  getLibrary: () => any;
  setLibrary: (entries: UiLibraryEntry[]) => void;
  /** Methods exposed by user-songs-store.ts. */
  userSongStore: {
    addFromBlob: any;
    addFromUrl: any;
    rename: any;
    remove: any;
    register: any;
    loadAll: () => Promise<number>;
  };
  fetchLibrary: any;
  /** UserSongsMxl / IndexedDB pass-throughs. */
  openUserDb: any;
  userDbStoreName: string;
  unzipMxlToXmlText: any;
  userDbAll: any;
  userDbPut: any;
  /** PianoCore.autoSectionDefs — for the section-editor's "auto" button. */
  autoSectionDefs: any;
  /** Currently-loaded song; refreshSongPanelHeader uses titleKey/composerKey. */
  getCurrentSong: () => any;
  selectSong: (id: string) => void;
  /** Song-panel header — re-rendered after rename. */
  songPanelHeaderDom: { songTitle: HTMLElement; songComposer: HTMLElement };
  /** i18n + modal focus trap. */
  t: T;
  modalFocus: any;
}

export interface ShellAddSong {
  /** Used by ESC router + DevModeWireup. */
  domAddSong: any;
  domSecEdit: any;
  /** byId shorthand — re-exposed because PracticeFlow.dom.resTryPlay
   *  reads a one-off by-id (no DOM bag entry for it). */
  byId: (id: string) => HTMLElement;
  openSectionEditor: (songId: string) => Promise<void>;
  closeSectionEditor: () => void;
  openAddSongModal: () => void;
  closeAddSongModal: () => void;
  renderUserSongButtons: () => void;
}

export function createShellAddSong(deps: ShellAddSongDeps): ShellAddSong {
  const { document: doc, songs, t, modalFocus } = deps;

  // `byId` does NO null-check; missing-id surfaces as a runtime TypeError
  // downstream, which is what we want for shell wiring.
  const byId = (id: string): HTMLElement => doc.getElementById(id) as HTMLElement;

  const domAddSong: any = {
    modal: byId('addSongModal'),
    btn: byId('addSongBtn'),
    closeBtn: byId('addSongCloseBtn'),
    tabs: doc.querySelectorAll('.add-song-tab'),
    bodies: doc.querySelectorAll('.add-song-tab-body'),
    libraryList: byId('addSongLibraryList'),
    libraryStatus: byId('addSongLibraryStatus'),
    librarySearch: byId('addSongLibrarySearch'),
    fileInput: byId('addSongFileInput'),
    pdCheckbox: byId('addSongPdCheckbox'),
    dropZone: byId('addSongDropZone'),
    urlInput: byId('addSongUrlInput'),
    fetchBtn: byId('addSongFetchBtn'),
    status: byId('addSongStatus'),
    myList: byId('addSongMyList'),
    userSongList: byId('userSongList'),
    exportBtn: byId('addSongExportBtn'),
    importBtn: byId('addSongImportBtn'),
    importInput: byId('addSongImportInput'),
  };

  const domSecEdit: any = {
    modal: byId('sectionEditModal'),
    help: byId('sectionEditHelp'),
    rows: byId('sectionEditRows'),
    error: byId('sectionEditError'),
    cancelBtn: byId('sectionEditCancelBtn'),
    saveBtn: byId('sectionEditSaveBtn'),
    closeBtn: byId('sectionEditCloseBtn'),
  };

  // ─── section-editor wire-up ──────────────────────────────────────
  const _sectionEditor = SectionEditor.createSectionEditor({
    dom: DomBag.pickDom(
      domSecEdit,
      'modal',
      'help',
      'rows',
      'error',
      'cancelBtn',
      'saveBtn',
      'closeBtn'
    ) as any,
    openUserDb: deps.openUserDb,
    userDbStoreName: deps.userDbStoreName,
    unzipMxlToXmlText: deps.unzipMxlToXmlText,
    userDbPut: deps.userDbPut,
    t,
    modalFocus,
    // Update in-memory SONGS so a selectSong() right after save picks up the
    // new boundaries without a page reload.
    onSaved: (rec: any) => {
      const song = songs[rec.id];
      if (song) {
        song.sectionDefs = rec.sectionDefs;
        song._loaded = false;
        song.sections = [];
      }
    },
  });

  // ─── user-songs wire-up ──────────────────────────────────────────
  const _userSongs = UserSongsUi.createUserSongsUi({
    dom: DomBag.pickDom(
      domAddSong,
      'modal',
      'btn',
      'closeBtn',
      'tabs',
      'bodies',
      'libraryList',
      'libraryStatus',
      'librarySearch',
      'fileInput',
      'pdCheckbox',
      'dropZone',
      'urlInput',
      'fetchBtn',
      'status',
      'myList',
      'userSongList',
      'exportBtn',
      'importBtn',
      'importInput'
    ) as any,
    songs,
    getLang: deps.getLang,
    getLibrary: deps.getLibrary,
    setLibrary: deps.setLibrary,
    fetchLibrary: deps.fetchLibrary,
    addUserSongFromBlob: deps.userSongStore.addFromBlob,
    addUserSongFromUrl: deps.userSongStore.addFromUrl,
    renameUserSong: deps.userSongStore.rename,
    removeUserSong: deps.userSongStore.remove,
    registerUserSong: deps.userSongStore.register,
    userDbAll: deps.userDbAll,
    userDbPut: deps.userDbPut,
    unzipMxlToXmlText: deps.unzipMxlToXmlText,
    autoSectionDefs: deps.autoSectionDefs,
    // Thunked so the section-editor wire-up's open ref captures the live
    // closure binding even after a hot-reload.
    openSectionEditor: (id: any) => _sectionEditor.open(id),
    selectSong: deps.selectSong,
    getCurrentSong: deps.getCurrentSong,
    refreshSongPanelHeader: () => {
      const song = deps.getCurrentSong();
      if (!song) return;
      deps.songPanelHeaderDom.songTitle.textContent = t(song.titleKey);
      deps.songPanelHeaderDom.songComposer.textContent = t(song.composerKey);
    },
    t,
    modalFocus,
  });

  // Hydrate user-added songs at startup so they appear in the picker without
  // requiring the kid to open the add-song modal first.
  void deps.userSongStore.loadAll().then((n: number) => {
    if (n > 0) {
      _userSongs.renderUserSongButtons();
      console.log('[UserSongs] loaded ' + n + ' from IndexedDB');
    }
  });

  // Request persistent storage so iOS Safari ITP / Chrome eviction policies
  // don't drop user-imported songs.
  if (navigator.storage && navigator.storage.persist) {
    void navigator.storage
      .persist()
      .then((g) => {
        if (g) console.log('[Storage] persistent storage granted');
      })
      .catch(() => {
        /* private mode / embedded WebView — silent */
      });
  }

  return {
    domAddSong,
    domSecEdit,
    byId,
    openSectionEditor: _sectionEditor.open,
    closeSectionEditor: _sectionEditor.close,
    openAddSongModal: _userSongs.open,
    closeAddSongModal: _userSongs.close,
    renderUserSongButtons: _userSongs.renderUserSongButtons,
  };
}
