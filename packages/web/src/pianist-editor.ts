// Pianist edit modal — identity primer per McPherson 2015 long-term
// self-concept. Owned by shell-ui; opened from the journal modal's
// pianist card and from anywhere else identity needs to be set.

import { PIANIST_AVATARS } from './prefs-storage';
import type { PianistIdentity } from './journal-modal';

export interface PianistEditorDom {
  pianistEditModal: HTMLElement;
  pianistEditCloseBtn: HTMLElement;
  pianistAvatarGrid: HTMLElement;
  pianistNameInput: HTMLElement;
  pianistCommitInput: HTMLElement;
  pianistEditCancelBtn: HTMLElement;
  pianistEditSaveBtn: HTMLElement;
}

export interface PianistEditorDeps {
  dom: PianistEditorDom;
  getIdentity(): PianistIdentity;
  setIdentity(id: PianistIdentity): void;
  /** Called after a successful save so callers can re-paint dependent
   *  surfaces (journal card, title-screen badge, library strip). */
  onSaved?(): void;
  t(key: string, vars?: Record<string, string | number>): string;
}

export interface PianistEditor {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createPianistEditor(deps: PianistEditorDeps): PianistEditor {
  let selectedAvatar = PIANIST_AVATARS[0];

  function renderAvatarGrid(currentAvatar: string): void {
    const grid = deps.dom.pianistAvatarGrid;
    grid.innerHTML = '';
    for (const emoji of PIANIST_AVATARS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'pianist-avatar-cell' + (emoji === currentAvatar ? ' pianist-avatar-cell-active' : '');
      btn.textContent = emoji;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', emoji === currentAvatar ? 'true' : 'false');
      btn.dataset.avatar = emoji;
      btn.addEventListener('click', () => {
        selectedAvatar = emoji;
        renderAvatarGrid(emoji);
      });
      grid.appendChild(btn);
    }
  }

  function open(): void {
    const cur = deps.getIdentity();
    selectedAvatar =
      cur.avatar && PIANIST_AVATARS.includes(cur.avatar) ? cur.avatar : PIANIST_AVATARS[0];
    renderAvatarGrid(selectedAvatar);
    (deps.dom.pianistNameInput as HTMLInputElement).value = cur.name ?? '';
    (deps.dom.pianistCommitInput as HTMLInputElement).value =
      cur.commitYear != null ? String(cur.commitYear) : '';
    deps.dom.pianistEditModal.classList.add('visible');
    // Defer focus past the modal-show paint so the input is reachable.
    setTimeout(() => {
      try {
        (deps.dom.pianistNameInput as HTMLInputElement).focus();
      } catch {
        /* happy-dom / older Safari may not implement focus on hidden inputs */
      }
    }, 50);
  }

  function close(): void {
    deps.dom.pianistEditModal.classList.remove('visible');
  }

  function isOpen(): boolean {
    return deps.dom.pianistEditModal.classList.contains('visible');
  }

  function save(): void {
    const nameRaw = (deps.dom.pianistNameInput as HTMLInputElement).value ?? '';
    const name = nameRaw.trim().slice(0, 20);
    if (name.length === 0) {
      try {
        (deps.dom.pianistNameInput as HTMLInputElement).focus();
      } catch {
        /* ignore */
      }
      return;
    }
    const commitRaw = (deps.dom.pianistCommitInput as HTMLInputElement).value ?? '';
    const commitParsed = Number(commitRaw.trim());
    const commitYear =
      Number.isFinite(commitParsed) && commitParsed > 1900 ? Math.floor(commitParsed) : undefined;
    deps.setIdentity({ name, commitYear, avatar: selectedAvatar });
    close();
    deps.onSaved?.();
  }

  // Wire button + close once at construction.
  deps.dom.pianistEditCloseBtn.addEventListener('click', close);
  deps.dom.pianistEditCancelBtn.addEventListener('click', close);
  deps.dom.pianistEditSaveBtn.addEventListener('click', save);
  deps.dom.pianistEditModal.addEventListener('click', (e) => {
    if (e.target === deps.dom.pianistEditModal) close();
  });

  return { open, close, isOpen };
}
