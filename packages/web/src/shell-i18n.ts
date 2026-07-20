// i18n + theme shell — Phase 0d batch 115.
//
// Bundles the i18n boundary (t() + stageLabel + applyI18n) + the
// theme/synesthesia/lang controls + the langchange handler that
// re-renders imperative (set-from-JS) localized text.
//
// applyI18n only walks [data-i18n*] attrs; non-attr labels (song
// panel header / section result / session summary / stage label /
// intro diag) need explicit redraw on lang change. The handler here
// dispatches the redraw calls through deps callbacks.

import type { InitialGameState } from './game-state-init';
import type { InitialPrefs } from './practice-state-init';
import type { PianoConfig } from './piano-config';
import type { DomBag } from './dom-bag';
import * as PianoCore from '@piano/core';
import type { Stage, Lang } from '@piano/core';
import * as ThemeControls from './theme-controls';

export interface ShellI18nDeps {
  document: Document;
  prefs: InitialPrefs;
  state: InitialGameState;
  config: PianoConfig;
  /** SONGS forward-declared in the shell — getter so userResolver only fires post-init. */
  getSongs: () => any;
  savePrefs: () => void;
  /** Settings panel refresh — assigned later via setRefreshSettingsPanel. */
  refreshSettingsPanel: () => void;
  /** DOM bag — many lang-change re-render targets. */
  dom: DomBag;
  /** Re-renderers fired on lang change. */
  getCurrentSong: () => any;
  getPractice: () => any;
  refreshLangCaches: () => void;
  renderSongPanel: () => void;
  renderResultCard: () => void;
  renderSessionSummaryText: (animate: boolean) => void;
}

export interface ShellI18n {
  /** The single t() function — every shell module reads from this one. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** stageLabel — given a STAGE def, returns its localized name. */
  stageLabel: (stage: Stage | undefined | null) => string;
  /** Re-walks [data-i18n*]. Boot-time + theme-controls.setLang() also call this. */
  applyI18n: () => void;
  /** ThemeControls forwarders. */
  applyTheme: (themeIdx: number) => void;
  applySynesthesia: (on: boolean) => void;
  setLang: (lang: Lang) => void;
}

export function createShellI18n(deps: ShellI18nDeps): ShellI18n {
  const { prefs, state, config, dom } = deps;

  const t = PianoCore.createT(PianoCore.T_STRINGS, {
    getLang: () => prefs.lang,
    userResolver: (id: string, which: string) => {
      // SONGS forward-declared — userResolver only fires post-init.
      const song = deps.getSongs()?.[id];
      if (!song) return null;
      if (which === 'userTitle') return song._userTitle || id;
      if (which === 'userComposer') return song._userComposer || '';
      return null;
    },
  });

  const stageLabel = (stage: Stage | undefined | null) => PianoCore.stageLabel(stage, t);

  const _themeControls = ThemeControls.createThemeControls({
    prefs,
    state,
    savePrefs: deps.savePrefs,
    t: (key: string) => t(key),
    refreshSettingsPanel: () => deps.refreshSettingsPanel(),
  } as any);

  const applyI18n = () => _themeControls.applyI18n();

  // Boot-time i18n seed — set <html lang> + walk [data-i18n*] once. Page loads
  // on the title screen — body class drives the home-button hide (no 🏠 when
  // home is right here) + any future title-only styling.
  deps.document.documentElement.lang =
    prefs.lang === 'jp' ? 'ja' : prefs.lang === 'de' ? 'de' : 'en';
  applyI18n();
  deps.document.body.classList.add('title-screen');
  // Seed UI from persisted prefs; theme-controls' click handlers take it
  // from there.
  _themeControls.applyTheme(prefs.theme);
  _themeControls.applySynesthesia(prefs.synesthesia);

  // langchange handler — refresh hot-path caches + re-render screens with
  // imperative (set-from-JS) localized text. applyI18n only walks
  // [data-i18n*] attrs; these labels need explicit redraw.
  window.addEventListener('langchange', () => {
    deps.refreshLangCaches();
    if (dom.songPanel?.classList.contains('visible')) deps.renderSongPanel();
    const currentSong = deps.getCurrentSong();
    const practice = deps.getPractice();
    if (dom.practiceHud?.classList.contains('visible') && currentSong) {
      const sec = currentSong.sections?.[practice.sectionIdx];
      if (sec) dom.ptbSection.textContent = t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
    }
    if (dom.sectionResult?.classList.contains('visible')) deps.renderResultCard();
    if (dom.sessionSummary?.classList.contains('visible')) deps.renderSessionSummaryText(false);
    if (dom.stageLabel && state.currentStage > 0) {
      dom.stageLabel.textContent = stageLabel(config.STAGES[state.currentStage]);
    }
    if (state.lastIntroDiag) state.lastIntroDiag();
  });

  return {
    t,
    stageLabel,
    applyI18n,
    applyTheme: _themeControls.applyTheme,
    applySynesthesia: _themeControls.applySynesthesia,
    setLang: _themeControls.setLang,
  };
}
