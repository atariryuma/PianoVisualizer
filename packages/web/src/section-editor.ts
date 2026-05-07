// Section editor — modal that lets the user re-pick the 3 section
// boundaries (A1 / B / A2) for a user-uploaded score. Phase 0d batch 2
// extraction from legacy-app.js.
//
// The module owns its own internal state (totalMeasures + the
// in-flight UserSongRecord) instead of stashing those on the DOM
// bag like the legacy version did. All cross-module deps come in via
// `createSectionEditor(deps)` — no reach-back into shell globals
// from inside this module.

import { parseMusicXmlMetadata } from '@piano/core';
import type { UserSongRecord } from '@piano/core';

/** DOM elements the editor reads + mutates. The shell wires these in
 *  from its DOM_SECEDIT bag at init time. All but the three buttons
 *  are required (the buttons are nullable because the markup may omit
 *  them in stripped-down embeds). */
export interface SectionEditorDom {
  modal: HTMLElement;
  help: HTMLElement;
  rows: HTMLElement;
  error: HTMLElement;
  cancelBtn: HTMLElement | null;
  saveBtn: HTMLElement | null;
  closeBtn: HTMLElement | null;
}

/** Modal-stack adapter — matches the shell's `modalFocus` API. */
export interface ModalFocus {
  open(el: HTMLElement): void;
  close(el: HTMLElement): void;
}

/** All non-DOM dependencies. */
export interface SectionEditorDeps {
  dom: SectionEditorDom;
  /** Returns the open user-song IndexedDB instance. */
  openUserDb(): Promise<IDBDatabase>;
  /** Name of the object store inside that DB. Legacy: `'userSongs'`. */
  userDbStoreName: string;
  /** Unzips an .mxl Blob to its inner MusicXML text. */
  unzipMxlToXmlText(blob: Blob): Promise<string>;
  /** Persists an updated UserSongRecord to IndexedDB. */
  userDbPut(rec: UserSongRecord): Promise<void>;
  /** i18n lookup. Same shape as legacy `t()`. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** Modal-stack manager. Forwarded as-is. */
  modalFocus: ModalFocus;
  /** Called after a successful save with the patched record so the
   *  shell can update its in-memory SONGS registry (force-reload + reset
   *  sections so the next selectSong re-extracts). */
  onSaved(rec: UserSongRecord): void;
}

/** Public surface returned by `createSectionEditor`. */
export interface SectionEditor {
  open(songId: string): Promise<void>;
  close(): void;
}

/**
 * Wire up the section-editor modal. Returns `{ open, close }` that the
 * shell calls in response to the "Edit Sections" button + ESC key.
 * Internal event handlers (cancel / close / save / backdrop click) are
 * bound automatically — the caller doesn't need to register them.
 */
export function createSectionEditor(deps: SectionEditorDeps): SectionEditor {
  /** Total measure count for the score currently being edited. Cached
   *  after the open() XML parse so saveSectionEditor can validate
   *  bounds without re-parsing. */
  let totalMeasures = 0;
  /** The record being edited. Captured at open() so save() writes back
   *  to the same object the user picked. */
  let editing: UserSongRecord | null = null;

  /** Read a UserSongRecord straight from the user-songs object store. */
  async function getRecord(songId: string): Promise<UserSongRecord | null> {
    const db = await deps.openUserDb();
    return new Promise<UserSongRecord | null>((res, rej) => {
      const tx = db.transaction(deps.userDbStoreName, 'readonly');
      const r = tx.objectStore(deps.userDbStoreName).get(songId);
      r.onsuccess = () => res((r.result as UserSongRecord) ?? null);
      r.onerror = () => rej(r.error);
    });
  }

  async function open(songId: string): Promise<void> {
    const rec = await getRecord(songId);
    if (!rec) return;
    editing = rec;

    // Re-use the cached xmlText from add-time when present; older
    // records added before that cache was implemented get unzipped on
    // demand here and re-saved by the caller's lazy migration path.
    let xmlText = rec.xmlText;
    if (!xmlText) {
      const isMxl = rec.mimeType !== 'application/vnd.recordare.musicxml+xml';
      try {
        xmlText = isMxl ? await deps.unzipMxlToXmlText(rec.mxlBlob) : await rec.mxlBlob.text();
      } catch (e) {
        alert('Failed to read score: ' + (e instanceof Error ? e.message : String(e)));
        return;
      }
    }
    const meta = parseMusicXmlMetadata(xmlText);
    totalMeasures = meta.measureCount;

    deps.dom.help.textContent = deps.t('sectionEditHelp', { v: totalMeasures });
    deps.dom.rows.innerHTML = '';
    const labels = ['userSecA1', 'userSecB', 'userSecA2'] as const;
    for (let i = 0; i < 3; i++) {
      const def = rec.sectionDefs[i] ?? { startMeasure: Math.floor((i * totalMeasures) / 3) };
      const row = document.createElement('div');
      row.className = 'sec-edit-row';
      row.innerHTML = '<label></label><input type="number" min="1" step="1">';
      const label = row.querySelector('label') as HTMLLabelElement;
      label.textContent = deps.t(labels[i]!);
      const input = row.querySelector('input') as HTMLInputElement;
      input.value = String((def.startMeasure ?? 0) + 1); // 1-based for users
      input.max = String(totalMeasures);
      // First section always starts at measure 1; lock it so the only
      // adjustments the user can make are to B and A2.
      if (i === 0) {
        input.disabled = true;
        input.value = '1';
      }
      deps.dom.rows.appendChild(row);
    }
    deps.dom.error.textContent = '';
    deps.dom.modal.classList.add('visible');
    deps.modalFocus.open(deps.dom.modal);
  }

  function close(): void {
    deps.dom.modal.classList.remove('visible');
    deps.modalFocus.close(deps.dom.modal);
    editing = null;
  }

  async function save(): Promise<void> {
    const inputs = deps.dom.rows.querySelectorAll<HTMLInputElement>('input[type=number]');
    const vals = Array.from(inputs).map((i) => parseInt(i.value, 10) - 1); // 0-based
    if (
      vals.some((v) => Number.isNaN(v) || v < 0 || v >= totalMeasures) ||
      vals[0] !== 0 ||
      (vals[1] ?? 0) <= (vals[0] ?? 0) ||
      (vals[2] ?? 0) <= (vals[1] ?? 0)
    ) {
      deps.dom.error.textContent = deps.t('sectionEditError');
      return;
    }
    if (!editing) return;
    editing.sectionDefs = [
      {
        id: 'A1',
        nameKey: 'userSecA1',
        descKey: 'userSecA1desc',
        startMeasure: vals[0]!,
        isBoss: false,
      },
      {
        id: 'B',
        nameKey: 'userSecB',
        descKey: 'userSecBdesc',
        startMeasure: vals[1]!,
        isBoss: false,
      },
      {
        id: 'A2',
        nameKey: 'userSecA2',
        descKey: 'userSecA2desc',
        startMeasure: vals[2]!,
        isBoss: true,
      },
    ];
    await deps.userDbPut(editing);
    deps.onSaved(editing);
    close();
  }

  // Wire internal event handlers. The shell installs `createSectionEditor`
  // once at startup, so registering listeners here is safe — they live for
  // the lifetime of the page.
  deps.dom.cancelBtn?.addEventListener('click', close);
  deps.dom.closeBtn?.addEventListener('click', close);
  deps.dom.saveBtn?.addEventListener('click', () => {
    void save();
  });
  // Backdrop click on the modal element itself (not its children) closes.
  deps.dom.modal.addEventListener('click', (e) => {
    if (e.target === deps.dom.modal) close();
  });

  return { open, close };
}
