// Theme bar + synesthesia toggle + language toggle controls.
// Phase 0d batches 7a + 62 extracted from legacy-app.js.
//
// Three independent appearance/i18n controls that all live in the
// theme bar at the top of the screen:
//   • Theme dots — 4 color presets (purple/cyan/orange/white-lavender),
//     accessible as `role="radio"` so Enter/Space activate them too.
//   • Synesthesia toggle — per-note color mode, toggled via a single
//     button with click + Enter/Space.
//   • Language toggle — flips between EN and JP, walks
//     `[data-i18n*]` to refresh DOM text/title/placeholder/aria-label
//     attributes, fires the cross-cutting `langchange` event for the
//     imperative shell-side refreshes (song panel, lane labels, etc.).
//
// `applyI18n()` (batch 62 fold) — the DOM walker that updates every
// element with a `data-i18n*` attribute. Lives in this module because
// it's the natural sibling of `setLang()` (which calls it after a
// lang flip). Shell still owns the `langchange` event listener —
// that handler reads enough shell-private vars (lane labels,
// activeNoteNames, currentSong, render fns) that folding it would
// drag a dozen new deps.

import type { Lang } from '@piano/core';

/** Persistent prefs slice the controls read + write. */
export interface ThemeControlsPrefs {
  theme: number;
  synesthesia: boolean;
  lang: Lang;
}

/** Game-state slice — shared with the rest of the shell. */
export interface ThemeControlsStateRef {
  currentTheme: number;
  useSynesthesiaMode: boolean;
}

export interface ThemeControlsDeps {
  prefs: ThemeControlsPrefs;
  state: ThemeControlsStateRef;
  /** Persist prefs to localStorage. */
  savePrefs(): void;
  /** Bilingual translator. Reads at every applyI18n() call so a
   *  langchange between calls is picked up. */
  t(key: string): string;
  /** Refresh the settings panel labels (input status / audio offset
   *  text) — called after a lang flip because those are imperatively
   *  set, not data-i18n driven. */
  refreshSettingsPanel(): void;
}

export interface ThemeControls {
  /** Apply theme by index (0..3). Updates `prefs.theme`,
   *  `state.currentTheme`, and the active dot's `aria-checked`. Does
   *  NOT persist — the public mutator on click does that, but the
   *  initial call at app boot reads from already-saved prefs. */
  applyTheme(idx: number): void;
  /** Apply synesthesia mode. Updates `prefs.synesthesia`,
   *  `state.useSynesthesiaMode`, and the toggle's `aria-checked`. */
  applySynesthesia(on: boolean): void;
  /** Switch language. Updates `prefs.lang`, syncs `<html lang>`,
   *  persists, and fires `applyI18n()`. */
  setLang(lang: Lang): void;
  /** Walk every element with a `data-i18n*` attribute and update
   *  textContent / title / placeholder / aria-label from the
   *  injected translator. Fires a `langchange` CustomEvent on
   *  `window` so the shell's cross-cutting refresh listener picks
   *  up the imperative bits (song panel, lane labels, etc.). */
  applyI18n(): void;
}

/** Wire all three controls. The shell calls
 *  `applyTheme(prefs.theme)` / `applySynesthesia(prefs.synesthesia)`
 *  on the returned object once on boot to seed the UI from persisted
 *  prefs (the click handlers attached internally take care of the
 *  rest). The lang toggle button is wired internally; external code
 *  can still call `setLang()` to flip programmatically. */
export function createThemeControls(deps: ThemeControlsDeps): ThemeControls {
  function applyTheme(idx: number): void {
    deps.prefs.theme = idx;
    deps.state.currentTheme = idx;
    document.querySelectorAll('.theme-dot').forEach((d) => {
      const isActive = parseInt((d as HTMLElement).dataset.theme || '') === idx;
      d.classList.toggle('active', isActive);
      d.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  function applySynesthesia(on: boolean): void {
    deps.prefs.synesthesia = on;
    deps.state.useSynesthesiaMode = on;
    const synToggle = document.getElementById('synesthesiaToggle');
    if (!synToggle) return;
    synToggle.classList.toggle('active', on);
    synToggle.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function refreshLangToggle(): void {
    const btn = document.getElementById('langToggleBtn');
    if (!btn) return;
    btn.textContent = deps.prefs.lang === 'jp' ? '🇯🇵 日本語' : '🇬🇧 EN';
  }

  function applyI18n(): void {
    document
      .querySelectorAll<HTMLElement>(
        '[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]'
      )
      .forEach((rawEl) => {
        // Cast to widest target (input has all of title + placeholder
        // + textContent) so the same loop body works for buttons,
        // labels, headings, inputs, etc.
        const el = rawEl as HTMLInputElement;
        const k = el.getAttribute('data-i18n');
        const tk = el.getAttribute('data-i18n-title');
        const pk = el.getAttribute('data-i18n-placeholder');
        const ak = el.getAttribute('data-i18n-aria-label');
        if (k) el.textContent = deps.t(k);
        if (tk) el.title = deps.t(tk);
        if (pk) el.placeholder = deps.t(pk);
        if (ak) el.setAttribute('aria-label', deps.t(ak));
      });
    // Notify code paths that re-render their own text (song panel,
    // result screen, etc.).
    window.dispatchEvent(new CustomEvent('langchange'));
  }

  function setLang(lang: Lang): void {
    deps.prefs.lang = lang === 'jp' ? 'jp' : 'en';
    deps.savePrefs();
    // Keep <html lang> in sync so screen readers announce the right voice.
    // The HTML default is 'ja'; without this the EN-flipped UI would still
    // be read by a Japanese voice on iOS VoiceOver / NVDA.
    document.documentElement.lang = deps.prefs.lang === 'jp' ? 'ja' : 'en';
    applyI18n();
    refreshLangToggle();
  }

  // ─── theme dot wiring ─────────────────────────────────────────────
  const onThemeDotActivate = (d: HTMLElement): void => {
    applyTheme(parseInt(d.dataset.theme || ''));
    deps.savePrefs();
  };
  document.querySelectorAll('.theme-dot').forEach((d) => {
    d.addEventListener('click', () => onThemeDotActivate(d as HTMLElement));
    d.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onThemeDotActivate(d as HTMLElement);
      }
    });
  });

  // ─── synesthesia toggle wiring ────────────────────────────────────
  const synToggle = document.getElementById('synesthesiaToggle');
  if (synToggle) {
    const onSynToggle = (): void => {
      applySynesthesia(!deps.state.useSynesthesiaMode);
      deps.savePrefs();
    };
    synToggle.addEventListener('click', onSynToggle);
    synToggle.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onSynToggle();
      }
    });
  }

  // ─── language toggle wiring ───────────────────────────────────────
  document.getElementById('langToggleBtn')?.addEventListener('click', () => {
    setLang(deps.prefs.lang === 'jp' ? 'en' : 'jp');
    deps.refreshSettingsPanel(); // input status / audio offset use t()
  });
  // Initial sync of the lang toggle label.
  refreshLangToggle();

  return { applyTheme, applySynesthesia, setLang, applyI18n };
}
