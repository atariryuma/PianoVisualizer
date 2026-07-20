// User songs UI — Add/Manage Songs modal + start-screen song tiles +
// library export/import. Phase 0d batch 6 extraction from legacy-app.js.
//
// Scope:
//   • Add-song modal lifecycle (open / close / backdrop click)
//   • Three tabs: 📚 Library / 📁 File / 🔗 URL
//   • Library tab — search + click-to-fetch from MuseTrainer (jsDelivr)
//   • File tab — pick + PD attestation gate + add-from-blob
//   • URL tab — paste + fetch
//   • My library — rename ✎ / edit-sections ✂ / delete ✕ rows
//   • Start-screen tiles for user-added songs
//   • Export — bundle every user record into one base64-encoded JSON
//   • Import — restore from same JSON (idempotent IDs + rollback on failure)
//
// Out of scope (lives in legacy-app.js / @piano/core):
//   • IndexedDB CRUD (`userDbAll`, `userDbPut`, `addUserSongFromBlob`,
//     `addUserSongFromUrl`, `renameUserSong`, `removeUserSong`)
//   • MuseTrainer catalog fetch (`fetchLibrary` — pinned commit SHA)
//   • Section editor modal (already extracted to section-editor.ts —
//     this module just calls `deps.openSectionEditor(songId)`)
//   • Song selection / score loading (`selectSong` is shell-driven)
//
// Same deps-injection pattern as settings-panel + section-editor: every
// cross-module reference comes through `createUserSongsUi(deps)` rather
// than reaching into legacy-app globals.

import type { UserSongRecord, LibraryEntry } from '@piano/core';

/** D3: import 経路のサイズ上限（shell-user-library の USER_SONG_MAX_BYTES と
 *  同値=20MB）。ファイル選択/URL 経路と同じ上限を import にも課す。 */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** What the UI module reads from a library entry. The full
 *  `LibraryEntry` shape carries fields like `filename` that only exist
 *  on the fetched catalog payload; the legacy seed list (and any
 *  intermediate state during the fetch) is a strict subset. */
export type UiLibraryEntry = Partial<LibraryEntry> & {
  url: string;
  label: string;
  icon: string;
};

/** Minimal song shape the UI reads. The shell's full SONGS map carries
 *  more fields (sections, notes, _loaded, etc.) but we only touch these. */
export interface UiSongRef {
  id: string;
  icon?: string | null;
  titleKey?: string;
  composerKey?: string;
  /** True for IndexedDB-backed user songs. */
  _isUser?: boolean;
  _userTitle?: string | null;
  _userComposer?: string | null;
}

/** DOM elements wired into the modal + start-screen tiles. */
export interface UserSongsUiDom {
  modal: HTMLElement;
  /** Trigger button in the start-screen song picker. */
  btn: HTMLElement | null;
  closeBtn: HTMLElement | null;
  /** Tab strip — `[data-tab="library|file|url"]`. */
  tabs: NodeListOf<Element>;
  /** Tab body containers — `[data-tab-body="library|file|url"]`. */
  bodies: NodeListOf<Element>;
  libraryList: HTMLElement;
  /** Catalog status pill ("Loading…" / "{n} pieces" / "Catalog offline"). */
  libraryStatus: HTMLElement | null;
  librarySearch: HTMLInputElement | null;
  fileInput: HTMLInputElement | null;
  pdCheckbox: HTMLInputElement | null;
  /** File-picker-free import (for browsers without `<input type=file>`,
   *  e.g. the Web MIDI Browser on iPad) — a drop zone that accepts a file
   *  dragged from the Files app (handles binary .mxl too). Optional so
   *  tests / older shells can omit it. */
  dropZone: HTMLElement | null;
  urlInput: HTMLInputElement | null;
  fetchBtn: HTMLButtonElement | null;
  status: HTMLElement;
  myList: HTMLElement;
  /** Container for start-screen tiles — populated by `renderUserSongButtons`. */
  userSongList: HTMLElement;
  exportBtn: HTMLElement | null;
  importBtn: HTMLElement | null;
  importInput: HTMLInputElement | null;
}

export interface UserSongsUiDeps {
  dom: UserSongsUiDom;
  /** Live reference to the in-memory SONGS map. The module reads this in
   *  filter/lookup paths but never mutates — adds/removes flow through
   *  `addUserSongFromBlob` etc., which update SONGS as a side effect. */
  songs: Record<string, UiSongRef>;
  /** Read-fresh language code so render functions pick up `setLang()`. */
  getLang(): 'en' | 'jp';
  /** Curated library catalog accessor. Module replaces the array via
   *  `setLibrary` after a successful fetch; reads via `getLibrary` so
   *  any live shell ref updates. The shell's seed entries are looser
   *  than the full catalog shape (`filename` etc. only present on the
   *  fetched payload), so we widen to `Partial<LibraryEntry>` here. */
  getLibrary(): UiLibraryEntry[];
  setLibrary(entries: UiLibraryEntry[]): void;
  /** Curated catalog fetch (pinned commit SHA — see legacy `fetchLibrary`). */
  fetchLibrary(force?: boolean): Promise<UiLibraryEntry[]>;
  /** IndexedDB writes — return the saved record (id used for selectSong). */
  addUserSongFromBlob(
    blob: Blob,
    opts: { filename?: string; source?: string }
  ): Promise<{ id: string }>;
  addUserSongFromUrl(
    url: string,
    opts: {
      source?: string;
      titleOverride?: string;
      composerOverride?: string;
    }
  ): Promise<{ id: string }>;
  renameUserSong(id: string, newTitle: string, newComposer: string): Promise<void>;
  removeUserSong(id: string): Promise<void>;
  /** Bootstrap a record into the in-memory SONGS map after import.
   *  Return value is ignored — `unknown` lets the legacy implementation
   *  resolve to the registered song record without forcing a wrapper. */
  registerUserSong(record: UserSongRecord): Promise<unknown>;
  /** IndexedDB cursor — returns every user record. */
  userDbAll(): Promise<UserSongRecord[]>;
  /** IndexedDB write — used by import to restore each record. */
  userDbPut(record: UserSongRecord): Promise<void>;
  /** Unzip an .mxl blob to its container.xml's pointed-to .musicxml string.
   *  Used during import when re-deriving sectionDefs. */
  unzipMxlToXmlText(blob: Blob): Promise<string>;
  /** Auto-section detector from @piano/core. Used by import when the
   *  imported record has no sectionDefs (pre-v1 export, or a manually
   *  constructed JSON). */
  autoSectionDefs(xmlText: string, count: number): unknown;
  /** Open the section editor for a given user song id. Already extracted
   *  to section-editor.ts; the shell wires this through. */
  openSectionEditor(songId: string): Promise<void> | void;
  /** Trigger song selection (returns to song-panel, kicks off score
   *  preload). The shell's `selectSong` reads `SONGS[id]`. */
  selectSong(songId: string): void;
  /** Get the currently-selected song so rename can refresh the panel
   *  header without round-tripping through `selectSong`. */
  getCurrentSong(): UiSongRef | null;
  /** Re-render the song-panel header (title + composer text). Called
   *  after rename so a renamed-while-displayed song picks up the new
   *  text without a full panel rebuild. */
  refreshSongPanelHeader(): void;
  /** i18n. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** Modal stack manager (focus + ESC integration). */
  modalFocus: { open(el: HTMLElement): void; close(el: HTMLElement): void };
}

export interface UserSongsUi {
  open(): void;
  close(): void;
  /** Re-render the start-screen tiles for user-added songs. Called at
   *  startup (after `loadUserSongs`) and after every add / rename /
   *  delete. */
  renderUserSongButtons(): void;
  /** Re-render the "My library" list inside the modal. Idempotent. */
  renderMyList(): void;
  /** Re-render the curated library list (filtered by current search
   *  input). Idempotent — also called by `ensureLibraryLoaded` after
   *  the catalog fetch resolves. */
  renderLibrary(): void;
}

/** Wire the user-songs UI. Returns `{open, close, renderUserSongButtons,
 *  renderMyList, renderLibrary}` for the shell to drive from its own
 *  bootstrap + post-mutation re-render flow. */
export function createUserSongsUi(deps: UserSongsUiDeps): UserSongsUi {
  /** In-flight library fetch promise — coalesces concurrent
   *  `ensureLibraryLoaded()` calls into one network round-trip. */
  let libraryLoadPromise: Promise<unknown> | null = null;

  function setStatus(msg: string, isError?: boolean): void {
    deps.dom.status.textContent = msg || '';
    deps.dom.status.classList.toggle('error', !!isError);
  }

  /** Two-tap delete that works WITHOUT a native `confirm()` dialog.
   *  Constrained WKWebViews (e.g. the Web MIDI Browser on iPad) don't
   *  implement `confirm()`, so it returns false and the delete silently
   *  bailed — songs became un-deletable. First tap arms the ✕ (turns it
   *  into a 🗑 with a red "tap again" state); a second tap within the
   *  window deletes. Auto-disarms after the timeout. */
  function wireTwoTapDelete(
    btn: HTMLButtonElement,
    songId: string,
    onDeleted: () => void,
    onError: (msg: string) => void
  ): void {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const rest = (): void => {
      armed = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      btn.classList.remove('armed');
      btn.textContent = '✕';
      btn.title = deps.t('addSongRemove');
      btn.setAttribute('aria-label', deps.t('addSongRemove'));
    };
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!armed) {
        armed = true;
        btn.classList.add('armed');
        btn.textContent = '🗑';
        btn.title = deps.t('addSongConfirmTap');
        btn.setAttribute('aria-label', deps.t('addSongConfirmTap'));
        timer = setTimeout(rest, 3500);
        return;
      }
      rest();
      try {
        await deps.removeUserSong(songId);
      } catch (err) {
        console.error('removeUserSong failed', err);
        onError((err as Error)?.message || 'delete failed');
        return;
      }
      onDeleted();
    });
  }

  /** Inline rename that works WITHOUT a native `prompt()` dialog (same
   *  WKWebView limitation as delete). Swaps the row for a text field +
   *  save/cancel; re-renders the list on either. Composer is preserved
   *  (title is the field kids actually change). */
  function startInlineRename(row: HTMLElement, song: UiSongRef): void {
    row.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'my-rename-input';
    input.value = song._userTitle || '';
    input.setAttribute('aria-label', deps.t('addSongRenamePromptTitle'));
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'my-action-btn my-rename-save';
    save.textContent = '✓';
    save.title = deps.t('addSongRenameSave');
    save.setAttribute('aria-label', deps.t('addSongRenameSave'));
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'my-action-btn my-rename-cancel';
    cancel.textContent = '✗';
    cancel.title = deps.t('addSongRenameCancel');
    cancel.setAttribute('aria-label', deps.t('addSongRenameCancel'));
    row.appendChild(input);
    row.appendChild(save);
    row.appendChild(cancel);
    input.focus();

    const doSave = async (): Promise<void> => {
      const title = input.value.trim();
      if (!title) {
        renderMyList();
        return;
      }
      try {
        await deps.renameUserSong(song.id, title, song._userComposer || '');
      } catch (err) {
        console.error('renameUserSong failed', err);
        setStatus(deps.t('addSongFailed', { v: (err as Error)?.message || 'rename' }), true);
        renderMyList();
        return;
      }
      renderMyList();
      renderUserSongButtons();
      const cur = deps.getCurrentSong();
      if (cur && cur.id === song.id) deps.refreshSongPanelHeader();
    };
    save.addEventListener('click', (e) => {
      e.stopPropagation();
      void doSave();
    });
    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      renderMyList();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void doSave();
      } else if (e.key === 'Escape') {
        renderMyList();
      }
    });
  }

  function ensureLibraryLoaded(force?: boolean): Promise<unknown> {
    if (libraryLoadPromise && !force) return libraryLoadPromise;
    const statusEl = deps.dom.libraryStatus;
    if (statusEl) statusEl.textContent = deps.t('addSongLibraryLoading');
    libraryLoadPromise = deps
      .fetchLibrary(force)
      .then((entries) => {
        if (entries.length > 0) {
          deps.setLibrary(entries);
          renderLibrary();
          if (statusEl) {
            statusEl.textContent = deps.t('addSongLibraryCount', { n: entries.length });
          }
        }
        return entries;
      })
      .catch((err: Error) => {
        console.warn('[Library] fetch failed:', err.message);
        if (statusEl) statusEl.textContent = deps.t('addSongLibraryOffline');
        return [];
      })
      .finally(() => {
        libraryLoadPromise = null;
      });
    return libraryLoadPromise;
  }

  /** Pick the best display label for a library entry given current
   *  language. JP labels exist for the 69 pinned scores; falls back to
   *  ASCII label for anything not in the table (e.g. future additions
   *  before the JP map is updated). */
  function libraryDisplayLabel(item: UiLibraryEntry): string {
    if (deps.getLang() === 'jp' && item.labelJp) return item.labelJp;
    return item.label;
  }

  function renderLibrary(): void {
    deps.dom.libraryList.innerHTML = '';
    const search = (deps.dom.librarySearch?.value || '').toLowerCase();
    const lib = deps.getLibrary();
    // Search matches both EN and JP labels so kids can type in either script.
    const filtered = search
      ? lib.filter(
          (it) =>
            (it.label || '').toLowerCase().includes(search) ||
            (it.labelJp || '').toLowerCase().includes(search)
        )
      : lib;
    for (const item of filtered) {
      const row = document.createElement('div');
      row.className = 'lib-row';
      // Build icon + label spans with textContent — `item.icon` originates
      // from the library catalog JSON; if a future entry (or a tampered
      // imported library) carries HTML in `icon`, innerHTML interpolation
      // would execute it.
      const iconSpan = document.createElement('span');
      iconSpan.className = 'lib-icon';
      iconSpan.textContent = item.icon || '🎼';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'lib-label';
      labelSpan.textContent = libraryDisplayLabel(item);
      row.appendChild(iconSpan);
      row.appendChild(labelSpan);
      row.addEventListener('click', async () => {
        if (row.classList.contains('busy')) return;
        row.classList.add('busy');
        setStatus(deps.t('addSongFetch') + '…');
        try {
          // Pass JP fields when available so the saved record carries the
          // localized title/composer separately from the auto-derived ASCII one.
          const lang = deps.getLang();
          const rec = await deps.addUserSongFromUrl(item.url, {
            source: 'library',
            titleOverride: lang === 'jp' && item.titleJp ? item.titleJp : item.label,
            composerOverride: lang === 'jp' && item.composerJp ? item.composerJp : undefined,
          });
          setStatus(deps.t('addSongAdded'));
          renderMyList();
          renderUserSongButtons();
          setTimeout(() => {
            close();
            deps.selectSong(rec.id);
          }, 450);
        } catch (e) {
          setStatus(deps.t('addSongFailed', { v: (e as Error).message }), true);
        } finally {
          row.classList.remove('busy');
        }
      });
      deps.dom.libraryList.appendChild(row);
    }
    if (filtered.length === 0) {
      deps.dom.libraryList.innerHTML =
        '<div style="font-size:.78rem;color:rgba(255,255,255,.4);padding:8px">—</div>';
    }
  }

  function renderMyList(): void {
    deps.dom.myList.innerHTML = '';
    const userSongs = Object.values(deps.songs).filter((s) => s._isUser);
    if (userSongs.length === 0) {
      deps.dom.myList.innerHTML =
        '<div style="font-size:.78rem;color:rgba(255,255,255,.4);padding:6px 0">—</div>';
      return;
    }
    for (const song of userSongs) {
      const row = document.createElement('div');
      row.className = 'my-row';
      const subParts: string[] = [];
      if (song._userComposer) subParts.push(song._userComposer);
      const sub = subParts.join(' · ');
      // 3 compact icon-only action buttons (✎ rename / ✂ edit-sections /
      // ✕ delete). createElement + textContent (not innerHTML) so a
      // tampered import file with HTML in `song.icon` can't execute.
      const iconEl = document.createElement('span');
      iconEl.className = 'my-icon';
      iconEl.textContent = song.icon || '🎵';
      const labelEl = document.createElement('span');
      labelEl.className = 'my-label';
      labelEl.textContent = song._userTitle || song.id;
      const renameBtn = document.createElement('button');
      renameBtn.className = 'my-action-btn my-rename';
      renameBtn.type = 'button';
      renameBtn.textContent = '✎';
      const editBtn = document.createElement('button');
      editBtn.className = 'my-action-btn my-edit';
      editBtn.type = 'button';
      editBtn.textContent = '✂';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'my-action-btn my-delete';
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      row.appendChild(iconEl);
      row.appendChild(labelEl);
      row.appendChild(renameBtn);
      row.appendChild(editBtn);
      row.appendChild(removeBtn);
      if (sub) {
        const sb = document.createElement('span');
        sb.className = 'my-sub';
        sb.textContent = sub;
        labelEl.appendChild(sb);
      }
      renameBtn.title = deps.t('addSongRename');
      renameBtn.setAttribute('aria-label', deps.t('addSongRename'));
      editBtn.title = deps.t('addSongEditSections');
      editBtn.setAttribute('aria-label', deps.t('addSongEditSections'));
      removeBtn.title = deps.t('addSongRemove');
      removeBtn.setAttribute('aria-label', deps.t('addSongRemove'));
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startInlineRename(row, song);
      });
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void deps.openSectionEditor(song.id);
      });
      wireTwoTapDelete(
        removeBtn,
        song.id,
        () => {
          renderMyList();
          renderUserSongButtons();
        },
        (m) => setStatus(deps.t('addSongFailed', { v: m }), true)
      );
      deps.dom.myList.appendChild(row);
    }
  }

  function renderUserSongButtons(): void {
    deps.dom.userSongList.innerHTML = '';
    const userSongs = Object.values(deps.songs).filter((s) => s._isUser);
    for (const song of userSongs) {
      // Sibling layout: a wrapping div hosts the song button and the ✕
      // delete button as separate children. Nesting <button> inside <button>
      // is invalid HTML; iOS Safari mis-routes the tap to the outer button,
      // making the ✕ silently inert.
      const wrap = document.createElement('div');
      wrap.className = 'practice-song-tile-wrap';

      const btn = document.createElement('button');
      btn.className = 'mode-btn primary practice-song-btn';
      btn.setAttribute('data-song', song.id);
      const labelText = (song.icon || '🎵') + ' ' + (song._userTitle || song.id);
      btn.innerHTML =
        '<span class="mode-btn-label"></span>' +
        '<span class="mode-btn-loading" data-i18n="starting">Starting...</span>';
      const labelEl = btn.querySelector('.mode-btn-label');
      if (labelEl) labelEl.textContent = labelText;
      btn.addEventListener('click', () => deps.selectSong(song.id));

      const removeBtn = document.createElement('button');
      removeBtn.className = 'my-remove';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'delete');
      removeBtn.textContent = '✕';
      removeBtn.title = deps.t('addSongRemove');
      wireTwoTapDelete(
        removeBtn,
        song.id,
        () => {
          renderUserSongButtons();
          if (deps.dom.modal.classList.contains('visible')) renderMyList();
        },
        (m) => console.error('[delete]', m)
      );

      wrap.appendChild(btn);
      wrap.appendChild(removeBtn);
      deps.dom.userSongList.appendChild(wrap);
    }
  }

  // ─── export / import ────────────────────────────────────────────
  // Blobs are base64-encoded (FileReader.readAsDataURL → strip prefix).
  // Designed for "rebuild on a new iPad after a reset" — file size ≈
  // sum of .mxl sizes × 1.33 (base64 overhead). 50 songs ≈ ~3 MB.

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    // Only accept in-place data: URIs. An imported library JSON is untrusted
    // external input; without this guard a tampered file could put an
    // `https://…` here and `fetch` would silently hit the network on import —
    // breaking the app's "no tracking / stays on device" promise. (A non-
    // data: value would otherwise reach here from importLibrary.)
    if (!/^data:/i.test(dataUrl)) {
      throw new Error('Unsupported song data reference (expected a data: URI)');
    }
    const res = await fetch(dataUrl);
    return res.blob();
  }

  async function exportLibrary(): Promise<void> {
    const all = await deps.userDbAll();
    if (all.length === 0) {
      setStatus(deps.t('myLibrary') + ' — 0', true);
      return;
    }
    interface ExportSong {
      id: string;
      title: string;
      composer: string;
      mimeType: string;
      sectionDefs: unknown;
      addedAt: number;
      source: string | undefined;
      mxlDataUrl: string;
    }
    const out: { version: number; exportedAt: string; songs: ExportSong[] } = {
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: [],
    };
    for (const rec of all) {
      out.songs.push({
        id: rec.id,
        title: rec.title,
        composer: rec.composer,
        mimeType: rec.mimeType,
        sectionDefs: rec.sectionDefs,
        addedAt: rec.addedAt,
        source: rec.source,
        mxlDataUrl: await blobToDataUrl(rec.mxlBlob),
      });
    }
    const json = JSON.stringify(out);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'piano-visualizer-library-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function importLibrary(file: Blob): Promise<number> {
    const text = await file.text();
    let parsed: { version?: number; songs?: unknown[] };
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON: ' + (e as Error).message);
    }
    if (!parsed.songs || !Array.isArray(parsed.songs)) throw new Error('Missing songs[]');
    if (parsed.version != null && parsed.version > 1) {
      throw new Error(
        'Library version ' + parsed.version + ' not supported (this build expects v1)'
      );
    }
    // Track new IDs so a mid-import quota-exceeded / IO failure can roll
    // back, leaving IndexedDB and the in-memory SONGS map consistent.
    const addedIds: string[] = [];
    try {
      for (const raw of parsed.songs as Array<Record<string, unknown>>) {
        if (!raw.mxlDataUrl) continue;
        // Don't clobber if id already exists — assign a fresh id so
        // re-importing is idempotent and never destroys an edited song.
        let id = String(raw.id ?? '');
        if (!id || deps.songs[id]) {
          id = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        }
        const blob = await dataUrlToBlob(String(raw.mxlDataUrl));
        // D3: ファイル選択/URL 経路と同じサイズ上限を import 経路にも課す。
        // これが無いと細工した巨大 base64 が上限チェックを一切経ずに IndexedDB へ
        // 直書きされ、低スペック端末で OOM / quota 圧迫を招く。超過分はスキップ。
        if (blob.size > MAX_IMPORT_BYTES) {
          console.warn('[import] skipped oversize song', id, blob.size);
          continue;
        }
        const mimeType = (raw.mimeType ??
          'application/vnd.recordare.musicxml+zip') as UserSongRecord['mimeType'];
        // D4: sectionDefs 欠損時のフォールバックで .mxl(zip) を blob.text() すると
        // DOMParser が壊れた XML を掴み、measureCount=1 固定で常に単一セクションに
        // 潰れる。mime を見て mxl は unzip、plain はそのまま text にする。
        let sectionDefs = raw.sectionDefs as UserSongRecord['sectionDefs'];
        if (!sectionDefs) {
          const isMxl = String(mimeType).includes('zip');
          const xmlText = isMxl ? await deps.unzipMxlToXmlText(blob) : await blob.text();
          sectionDefs = deps.autoSectionDefs(xmlText, 1) as UserSongRecord['sectionDefs'];
        }
        const rec: UserSongRecord = {
          id,
          title: String(raw.title ?? 'Imported'),
          composer: String(raw.composer ?? ''),
          mxlBlob: blob,
          mimeType,
          sectionDefs,
          addedAt: Number(raw.addedAt ?? Date.now()),
          source: 'import',
        };
        await deps.userDbPut(rec);
        await deps.registerUserSong(rec);
        addedIds.push(id);
      }
      return addedIds.length;
    } catch (err) {
      // Best-effort rollback so the user isn't left with half a library.
      for (const id of addedIds) {
        try {
          await deps.removeUserSong(id);
        } catch (e) {
          console.warn('[import-rollback] removeUserSong failed:', id, (e as Error)?.message);
        }
      }
      throw err;
    }
  }

  // ─── modal lifecycle ─────────────────────────────────────────────

  function open(): void {
    deps.dom.modal.classList.add('visible');
    renderLibrary();
    renderMyList();
    setStatus('');
    // Kick off a (possibly cached) catalog fetch in the background so the
    // full library replaces the seed list once available.
    void ensureLibraryLoaded();
    deps.modalFocus.open(deps.dom.modal);
  }

  function close(): void {
    deps.dom.modal.classList.remove('visible');
    deps.modalFocus.close(deps.dom.modal);
  }

  // ─── event wiring ────────────────────────────────────────────────

  deps.dom.btn?.addEventListener('click', open);
  deps.dom.closeBtn?.addEventListener('click', close);
  deps.dom.modal.addEventListener('click', (e) => {
    if (e.target === deps.dom.modal) close();
  });

  deps.dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const which = tab.getAttribute('data-tab');
      deps.dom.tabs.forEach((tb) => tb.classList.toggle('active', tb === tab));
      deps.dom.bodies.forEach((b) => {
        (b as HTMLElement).hidden = b.getAttribute('data-tab-body') !== which;
      });
      setStatus('');
    });
  });

  // Library search — debounce-free is fine, list is in-memory and small.
  deps.dom.librarySearch?.addEventListener('input', () => renderLibrary());

  /** Shared "add this blob, then open it" path used by the file picker,
   *  the drag-and-drop zone, and the paste box. Honors the PD attestation
   *  gate. Returns true on success so callers can clear their input. */
  async function addBlobAndSelect(
    blob: Blob,
    opts: { filename?: string; source?: string }
  ): Promise<boolean> {
    if (!deps.dom.pdCheckbox?.checked) {
      setStatus(deps.t('addSongPdAttest'), true);
      return false;
    }
    setStatus(deps.t('addSongFetch') + '…');
    try {
      const rec = await deps.addUserSongFromBlob(blob, opts);
      setStatus(deps.t('addSongAdded'));
      renderMyList();
      renderUserSongButtons();
      setTimeout(() => {
        close();
        deps.selectSong(rec.id);
      }, 450);
      return true;
    } catch (err) {
      setStatus(deps.t('addSongFailed', { v: (err as Error).message }), true);
      return false;
    }
  }

  deps.dom.fileInput?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      await addBlobAndSelect(file, { filename: file.name, source: 'upload' });
    } finally {
      target.value = '';
    }
  });

  // ── Drag & drop (file-picker-free) ──────────────────────────────────
  // Some iPad browsers (e.g. Web MIDI Browser) don't implement the native
  // file-open panel for `<input type=file>`, so the picker never appears.
  // A drop zone accepts a File dragged from the Files app instead, and —
  // being a File — carries the raw bytes, so binary .mxl works too.
  const dropZone = deps.dom.dropZone;
  if (dropZone) {
    const stop = (e: DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
    };
    dropZone.addEventListener('dragenter', (e) => {
      stop(e);
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragover', (e) => {
      stop(e);
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
      stop(e);
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', async (e) => {
      stop(e);
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      await addBlobAndSelect(file, { filename: file.name, source: 'drop' });
    });
  }

  deps.dom.fetchBtn?.addEventListener('click', async () => {
    if (!deps.dom.urlInput || !deps.dom.fetchBtn) return;
    const url = (deps.dom.urlInput.value || '').trim();
    if (!url) return;
    setStatus(deps.t('addSongFetch') + '…');
    deps.dom.fetchBtn.disabled = true;
    try {
      const rec = await deps.addUserSongFromUrl(url, { source: 'url' });
      setStatus(deps.t('addSongAdded'));
      deps.dom.urlInput.value = '';
      renderMyList();
      renderUserSongButtons();
      setTimeout(() => {
        close();
        deps.selectSong(rec.id);
      }, 450);
    } catch (err) {
      setStatus(deps.t('addSongFailed', { v: (err as Error).message }), true);
    } finally {
      deps.dom.fetchBtn.disabled = false;
    }
  });

  deps.dom.exportBtn?.addEventListener('click', () => {
    exportLibrary().catch((e: Error) => setStatus(deps.t('addSongFailed', { v: e.message }), true));
  });
  deps.dom.importBtn?.addEventListener('click', () => {
    deps.dom.importInput?.click();
  });
  deps.dom.importInput?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      const n = await importLibrary(file);
      setStatus(deps.t('addSongImportDone', { n }));
      renderMyList();
      renderUserSongButtons();
    } catch (err) {
      setStatus(deps.t('addSongFailed', { v: (err as Error).message }), true);
    } finally {
      target.value = '';
    }
  });

  return { open, close, renderUserSongButtons, renderMyList, renderLibrary };
}
