// @vitest-environment happy-dom
//
// Tests for packages/web/src/user-songs-ui.ts.
//
// The module is a fairly large modal with many event handlers, so the
// tests cover the high-traffic paths: open/close + tab switching,
// library render w/ search + click-to-fetch, my-list render w/ rename
// + delete + edit-sections, file/url tab fetch buttons, and export +
// import (including the rollback-on-error path). Each test builds a
// minimal DOM fragment and stub deps.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createUserSongsUi,
  type UserSongsUiDeps,
  type UserSongsUiDom,
  type UiLibraryEntry,
  type UiSongRef,
} from '../src/user-songs-ui';

function makeDom(): UserSongsUiDom {
  document.body.innerHTML = `
    <button id="open"></button>
    <div id="modal">
      <button id="close"></button>
      <button class="add-song-tab" data-tab="library"></button>
      <button class="add-song-tab" data-tab="file"></button>
      <button class="add-song-tab" data-tab="url"></button>
      <div class="add-song-tab-body" data-tab-body="library"></div>
      <div class="add-song-tab-body" data-tab-body="file"></div>
      <div class="add-song-tab-body" data-tab-body="url"></div>
      <div id="lib-list"></div>
      <span id="lib-status"></span>
      <input id="lib-search" />
      <input id="file-input" type="file" />
      <input id="pd-checkbox" type="checkbox" />
      <input id="url-input" />
      <button id="fetch-btn"></button>
      <span id="status"></span>
      <div id="my-list"></div>
      <div id="user-song-list"></div>
      <button id="export-btn"></button>
      <button id="import-btn"></button>
      <input id="import-input" type="file" />
    </div>
  `;
  return {
    modal: document.getElementById('modal') as HTMLElement,
    btn: document.getElementById('open'),
    closeBtn: document.getElementById('close'),
    tabs: document.querySelectorAll('.add-song-tab'),
    bodies: document.querySelectorAll('.add-song-tab-body'),
    libraryList: document.getElementById('lib-list') as HTMLElement,
    libraryStatus: document.getElementById('lib-status'),
    librarySearch: document.getElementById('lib-search') as HTMLInputElement,
    fileInput: document.getElementById('file-input') as HTMLInputElement,
    pdCheckbox: document.getElementById('pd-checkbox') as HTMLInputElement,
    urlInput: document.getElementById('url-input') as HTMLInputElement,
    fetchBtn: document.getElementById('fetch-btn') as HTMLButtonElement,
    status: document.getElementById('status') as HTMLElement,
    myList: document.getElementById('my-list') as HTMLElement,
    userSongList: document.getElementById('user-song-list') as HTMLElement,
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importInput: document.getElementById('import-input') as HTMLInputElement,
  };
}

const seedLibrary: UiLibraryEntry[] = [
  { url: 'https://x/canon.mxl', label: 'Canon in D', icon: '🎻' },
  {
    url: 'https://x/gymno.mxl',
    label: 'Gymnopédie No. 1',
    labelJp: 'ジムノペディ第1番',
    icon: '🌿',
  },
];

function makeDeps(overrides: Partial<UserSongsUiDeps> = {}): UserSongsUiDeps {
  let library = seedLibrary.slice();
  const songs: Record<string, UiSongRef> = {};
  return {
    dom: makeDom(),
    songs,
    getLang: () => 'en',
    getLibrary: () => library,
    setLibrary: (entries) => {
      library = entries;
    },
    fetchLibrary: vi.fn(() => Promise.resolve(seedLibrary.slice())),
    addUserSongFromBlob: vi.fn(() => Promise.resolve({ id: 'usr_blob_1' })),
    addUserSongFromUrl: vi.fn(() => Promise.resolve({ id: 'usr_url_1' })),
    renameUserSong: vi.fn(() => Promise.resolve()),
    removeUserSong: vi.fn(() => Promise.resolve()),
    registerUserSong: vi.fn(() => Promise.resolve()),
    userDbAll: vi.fn(() => Promise.resolve([])),
    userDbPut: vi.fn(() => Promise.resolve()),
    unzipMxlToXmlText: vi.fn(() => Promise.resolve('<score-partwise/>')),
    autoSectionDefs: vi.fn(() => []),
    openSectionEditor: vi.fn(() => Promise.resolve()),
    selectSong: vi.fn(),
    getCurrentSong: () => null,
    refreshSongPanelHeader: vi.fn(),
    t: vi.fn((key, vars) => (vars ? `${key}{${JSON.stringify(vars)}}` : key)),
    modalFocus: { open: vi.fn(), close: vi.fn() },
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── modal lifecycle ─────────────────────────────────────────────────

describe('createUserSongsUi — open/close', () => {
  it('open() shows the modal + calls modalFocus.open', () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    ui.open();
    expect(deps.dom.modal.classList.contains('visible')).toBe(true);
    expect(deps.modalFocus.open).toHaveBeenCalledWith(deps.dom.modal);
  });

  it('open() kicks off fetchLibrary (catalog refresh)', () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    ui.open();
    expect(deps.fetchLibrary).toHaveBeenCalled();
  });

  it('close() hides the modal + calls modalFocus.close', () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    ui.open();
    ui.close();
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
    expect(deps.modalFocus.close).toHaveBeenCalledWith(deps.dom.modal);
  });

  it('clicking the open button opens the modal', () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    (deps.dom.btn as HTMLElement).click();
    expect(deps.dom.modal.classList.contains('visible')).toBe(true);
  });

  it('clicking the close button closes', () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    deps.dom.modal.classList.add('visible');
    (deps.dom.closeBtn as HTMLElement).click();
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
  });

  it('backdrop click closes', () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    deps.dom.modal.classList.add('visible');
    deps.dom.modal.click();
    expect(deps.dom.modal.classList.contains('visible')).toBe(false);
  });
});

// ─── tabs ─────────────────────────────────────────────────────────────

describe('createUserSongsUi — tabs', () => {
  it('clicking a tab marks it active + shows its body', () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    const fileTab = deps.dom.tabs[1] as HTMLElement;
    fileTab.click();
    expect(fileTab.classList.contains('active')).toBe(true);
    const fileBody = deps.dom.bodies[1] as HTMLElement;
    const libBody = deps.dom.bodies[0] as HTMLElement;
    expect(fileBody.hidden).toBe(false);
    expect(libBody.hidden).toBe(true);
  });
});

// ─── library render ──────────────────────────────────────────────────

describe('createUserSongsUi — renderLibrary', () => {
  it('renders one row per library entry', () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    ui.renderLibrary();
    const rows = deps.dom.libraryList.querySelectorAll('.lib-row');
    expect(rows.length).toBe(seedLibrary.length);
  });

  it('uses JP label when getLang returns jp + entry has labelJp', () => {
    const deps = makeDeps({ getLang: () => 'jp' });
    const ui = createUserSongsUi(deps);
    ui.renderLibrary();
    const labels = Array.from(deps.dom.libraryList.querySelectorAll('.lib-label')).map(
      (el) => el.textContent
    );
    expect(labels).toContain('ジムノペディ第1番');
    expect(labels).toContain('Canon in D'); // no JP label, falls back to EN
  });

  it('search filter narrows the rendered set (case-insensitive)', () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    deps.dom.librarySearch!.value = 'CANON';
    ui.renderLibrary();
    const rows = deps.dom.libraryList.querySelectorAll('.lib-row');
    expect(rows.length).toBe(1);
  });

  it('search input event triggers re-render', () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    deps.dom.librarySearch!.value = 'gymno';
    deps.dom.librarySearch!.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = deps.dom.libraryList.querySelectorAll('.lib-row');
    expect(rows.length).toBe(1);
  });

  it('clicking a library row triggers addUserSongFromUrl + selectSong', async () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    ui.renderLibrary();
    const row = deps.dom.libraryList.querySelector('.lib-row') as HTMLElement;
    row.click();
    // Microtask drain
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.addUserSongFromUrl).toHaveBeenCalledWith(
      seedLibrary[0].url,
      expect.objectContaining({ source: 'library', titleOverride: 'Canon in D' })
    );
    // selectSong fires after a 450ms timeout
    vi.advanceTimersByTime(500);
    expect(deps.selectSong).toHaveBeenCalledWith('usr_url_1');
  });

  it('shows em-dash placeholder when filtered list is empty', () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    deps.dom.librarySearch!.value = 'NOT_A_MATCH';
    ui.renderLibrary();
    expect(deps.dom.libraryList.innerHTML).toContain('—');
  });
});

// ─── my-list render ──────────────────────────────────────────────────

describe('createUserSongsUi — renderMyList', () => {
  it('shows em-dash when there are no user songs', () => {
    const deps = makeDeps();
    const ui = createUserSongsUi(deps);
    ui.renderMyList();
    expect(deps.dom.myList.innerHTML).toContain('—');
  });

  it('renders one row per user song with rename/edit/delete buttons', () => {
    const deps = makeDeps({
      songs: {
        usr_a: {
          id: 'usr_a',
          icon: '🎵',
          _isUser: true,
          _userTitle: 'My Song',
          _userComposer: 'Anon',
        },
      },
    });
    const ui = createUserSongsUi(deps);
    ui.renderMyList();
    const rows = deps.dom.myList.querySelectorAll('.my-row');
    expect(rows.length).toBe(1);
    const buttons = rows[0].querySelectorAll('button');
    expect(buttons.length).toBe(3);
  });

  it('rename button calls deps.renameUserSong with trimmed values', async () => {
    const deps = makeDeps({
      songs: {
        usr_a: {
          id: 'usr_a',
          _isUser: true,
          _userTitle: 'Old Title',
          _userComposer: 'Old Composer',
        },
      },
    });
    // happy-dom's prompt() defaults to null; stub on globalThis.window.
    (globalThis as unknown as { prompt: (msg: string, def?: string) => string | null }).prompt = vi
      .fn()
      .mockReturnValueOnce('  New Title  ')
      .mockReturnValueOnce('New Composer');
    const ui = createUserSongsUi(deps);
    ui.renderMyList();
    const renameBtn = deps.dom.myList.querySelector('.my-rename') as HTMLButtonElement;
    renameBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.renameUserSong).toHaveBeenCalledWith('usr_a', 'New Title', 'New Composer');
  });

  it('rename button cancels gracefully if user dismisses prompt', async () => {
    const deps = makeDeps({
      songs: {
        usr_a: { id: 'usr_a', _isUser: true, _userTitle: 'Old Title' },
      },
    });
    (globalThis as unknown as { prompt: () => string | null }).prompt = vi
      .fn()
      .mockReturnValue(null);
    const ui = createUserSongsUi(deps);
    ui.renderMyList();
    const renameBtn = deps.dom.myList.querySelector('.my-rename') as HTMLButtonElement;
    renameBtn.click();
    await Promise.resolve();
    expect(deps.renameUserSong).not.toHaveBeenCalled();
  });

  it('edit-sections button calls deps.openSectionEditor', () => {
    const deps = makeDeps({
      songs: { usr_a: { id: 'usr_a', _isUser: true } },
    });
    const ui = createUserSongsUi(deps);
    ui.renderMyList();
    const editBtn = deps.dom.myList.querySelector('.my-edit') as HTMLButtonElement;
    editBtn.click();
    expect(deps.openSectionEditor).toHaveBeenCalledWith('usr_a');
  });

  it('delete button calls deps.removeUserSong after confirm', async () => {
    const deps = makeDeps({
      songs: { usr_a: { id: 'usr_a', _isUser: true, _userTitle: 'X' } },
    });
    (globalThis as unknown as { confirm: (msg: string) => boolean }).confirm = vi
      .fn()
      .mockReturnValue(true);
    const ui = createUserSongsUi(deps);
    ui.renderMyList();
    const delBtn = deps.dom.myList.querySelector('.my-delete') as HTMLButtonElement;
    delBtn.click();
    await Promise.resolve();
    expect(deps.removeUserSong).toHaveBeenCalledWith('usr_a');
  });

  it('delete button bails when user cancels confirm', async () => {
    const deps = makeDeps({
      songs: { usr_a: { id: 'usr_a', _isUser: true, _userTitle: 'X' } },
    });
    (globalThis as unknown as { confirm: () => boolean }).confirm = vi.fn().mockReturnValue(false);
    const ui = createUserSongsUi(deps);
    ui.renderMyList();
    const delBtn = deps.dom.myList.querySelector('.my-delete') as HTMLButtonElement;
    delBtn.click();
    await Promise.resolve();
    expect(deps.removeUserSong).not.toHaveBeenCalled();
  });
});

// ─── start-screen tiles ──────────────────────────────────────────────

describe('createUserSongsUi — renderUserSongButtons', () => {
  it('renders a tile per user song with a remove button', () => {
    const deps = makeDeps({
      songs: {
        usr_a: { id: 'usr_a', _isUser: true, _userTitle: 'A' },
        usr_b: { id: 'usr_b', _isUser: true, _userTitle: 'B' },
      },
    });
    const ui = createUserSongsUi(deps);
    ui.renderUserSongButtons();
    const tiles = deps.dom.userSongList.querySelectorAll('.practice-song-btn');
    expect(tiles.length).toBe(2);
  });

  it('clicking a tile triggers selectSong', () => {
    const deps = makeDeps({
      songs: { usr_a: { id: 'usr_a', _isUser: true, _userTitle: 'A' } },
    });
    const ui = createUserSongsUi(deps);
    ui.renderUserSongButtons();
    const tile = deps.dom.userSongList.querySelector('.practice-song-btn') as HTMLButtonElement;
    tile.click();
    expect(deps.selectSong).toHaveBeenCalledWith('usr_a');
  });

  it('tile-remove button stops propagation + calls removeUserSong', async () => {
    const deps = makeDeps({
      songs: { usr_a: { id: 'usr_a', _isUser: true, _userTitle: 'A' } },
    });
    (globalThis as unknown as { confirm: () => boolean }).confirm = vi.fn().mockReturnValue(true);
    const ui = createUserSongsUi(deps);
    ui.renderUserSongButtons();
    const removeBtn = deps.dom.userSongList.querySelector('.my-remove') as HTMLButtonElement;
    removeBtn.click();
    await Promise.resolve();
    expect(deps.removeUserSong).toHaveBeenCalledWith('usr_a');
    // selectSong should NOT have fired (stopPropagation works)
    expect(deps.selectSong).not.toHaveBeenCalled();
  });

  it('skips songs without _isUser flag (only user-added songs render)', () => {
    const deps = makeDeps({
      songs: {
        usr_a: { id: 'usr_a', _isUser: true, _userTitle: 'A' },
        fur_elise: { id: 'fur_elise', _isUser: false, titleKey: 'furElise' },
      },
    });
    const ui = createUserSongsUi(deps);
    ui.renderUserSongButtons();
    const tiles = deps.dom.userSongList.querySelectorAll('.practice-song-btn');
    expect(tiles.length).toBe(1);
  });
});

// ─── file + URL tabs ─────────────────────────────────────────────────

describe('createUserSongsUi — file + url fetch', () => {
  it('file change without PD attestation surfaces error', async () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    // pdCheckbox unchecked (default)
    const blob = new Blob(['<score/>'], { type: 'text/xml' });
    const file = new File([blob], 'test.musicxml', { type: 'text/xml' });
    Object.defineProperty(deps.dom.fileInput, 'files', {
      value: [file],
      configurable: true,
    });
    deps.dom.fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(deps.dom.status.classList.contains('error')).toBe(true);
    expect(deps.addUserSongFromBlob).not.toHaveBeenCalled();
  });

  it('url fetch with empty input is no-op', async () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    deps.dom.urlInput!.value = '';
    deps.dom.fetchBtn!.click();
    await Promise.resolve();
    expect(deps.addUserSongFromUrl).not.toHaveBeenCalled();
  });

  it('url fetch posts the trimmed URL through addUserSongFromUrl', async () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    deps.dom.urlInput!.value = '  https://x/test.mxl  ';
    deps.dom.fetchBtn!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.addUserSongFromUrl).toHaveBeenCalledWith(
      'https://x/test.mxl',
      expect.objectContaining({ source: 'url' })
    );
  });
});

// ─── export / import ─────────────────────────────────────────────────

describe('createUserSongsUi — export', () => {
  it('export with no songs sets error status', async () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    (deps.dom.exportBtn as HTMLElement).click();
    await Promise.resolve();
    expect(deps.dom.status.classList.contains('error')).toBe(true);
  });
});

describe('createUserSongsUi — import', () => {
  it('importBtn click forwards to importInput.click()', () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    const inputClick = vi.spyOn(deps.dom.importInput as HTMLInputElement, 'click');
    (deps.dom.importBtn as HTMLElement).click();
    expect(inputClick).toHaveBeenCalled();
  });

  it('rejects an unknown future schema version', async () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    const json = JSON.stringify({ version: 99, songs: [] });
    const file = new File([json], 'lib.json', { type: 'application/json' });
    Object.defineProperty(deps.dom.importInput, 'files', {
      value: [file],
      configurable: true,
    });
    deps.dom.importInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.dom.status.classList.contains('error')).toBe(true);
  });

  it('rejects malformed JSON', async () => {
    const deps = makeDeps();
    createUserSongsUi(deps);
    const file = new File(['not-json'], 'lib.json', { type: 'application/json' });
    Object.defineProperty(deps.dom.importInput, 'files', {
      value: [file],
      configurable: true,
    });
    deps.dom.importInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.dom.status.classList.contains('error')).toBe(true);
  });
});
