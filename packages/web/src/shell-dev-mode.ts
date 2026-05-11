// Dev-mode shell — Phase 0d batch 154.
//
// Bundles DevModeWireup.installDevMode + the build-constant resolution
// (versionLabel = `${__APP_VERSION__} ${__BUILD_DATE__}`) + the
// `.tagline` 7-tap trigger lookup. The wrapper is thin but moves
// the 30+ deps marshaling out of legacy-app.js so the shell-shrink
// stays on track.
//
// No return value — installDevMode wires its own listeners and runs
// forever after install.

import type { InitialGameState } from './game-state-init';
import type { InitialPrefs } from './practice-state-init';
import * as DevModeWireup from './dev-mode-wireup';
import * as DomBag from './dom-bag';

export interface ShellDevModeDeps {
  document: Document;
  /** Build constants — versionLabel = `${__APP_VERSION__} ${__BUILD_DATE__}`. */
  appVersion: string | undefined;
  buildDate: string | undefined;
  /** Full DOM bag — pickDom selects settingsPanel + sectionResult. */
  dom: DomBag.DomBag;
  /** Add-song modal — pulled from ShellAddSong.domAddSong. */
  domAddSong: { modal: HTMLElement | null };
  state: InitialGameState;
  practice: any;
  prefs: InitialPrefs;
  midiInput: any;
  midiState: any;
  ctx: CanvasRenderingContext2D;
  particles: any[];
  ripples: any[];
  /** Audio + screen + song accessors. */
  getScreen: () => { W: number; H: number };
  getAudioCtx: () => any;
  getCurrentSong: () => any;
  /** User-songs DB hooks. */
  openUserDb: () => any;
  userDbAll: () => any;
  userDbPut: (rec: any) => any;
  removeUserSong: (id: string) => any;
  isAppleMobile: () => boolean;
  /** i18n + theme thunks. */
  t: (key: string) => string;
  setLang: (lang: 'en' | 'jp') => void;
  applyTheme: (themeIdx: number) => void;
  /** Modal openers/closers — already concrete consts in legacy-app.js
   *  by the time installDevMode is called (post-create). */
  openSettings: () => void;
  closeSettings: () => void;
  openAddSongModal: () => void;
  closeAddSongModal: () => void;
  /** Forward-decl `let` — the dev-mode trigger fires async, so a
   *  thunk that reads at call time is safe even if the let is
   *  reassigned after the wireup. */
  completePracticeSection: () => void;
  /** MIDI dispatch hooks. */
  onMidiNoteOn: (m: number, v: number) => void;
  onMidiNoteOff: (m: number) => void;
  /** Themes catalog (config.THEMES). */
  themes: any;
  /** Background drawers + PianoCore primitives. */
  drawBgStars: any;
  drawAurora: any;
  drawGroundFlowers: any;
  decayWakeUpFlash: any;
  drawCenterGlow: any;
  wufOpts: any;
  getEnergy: () => number;
  /** Module refs — dev-mode imports from these directly. */
  renderFrame: any;
  audioInit: any;
}

export function createShellDevMode(deps: ShellDevModeDeps): void {
  DevModeWireup.installDevMode({
    triggerEl: deps.document.querySelector('.tagline') as HTMLElement | null,
    versionLabel: (deps.appVersion ?? '(unknown)') + ' ' + (deps.buildDate ?? ''),
    dom: DomBag.pickDom(deps.dom, 'settingsPanel', 'sectionResult'),
    domAddSong: deps.domAddSong,
    state: deps.state,
    practice: deps.practice,
    prefs: deps.prefs,
    midiInput: deps.midiInput,
    midiState: deps.midiState,
    ctx: deps.ctx,
    particles: deps.particles,
    ripples: deps.ripples,
    getScreen: deps.getScreen,
    getAudioCtx: deps.getAudioCtx,
    getCurrentSong: deps.getCurrentSong,
    openUserDb: deps.openUserDb,
    userDbAll: deps.userDbAll,
    userDbPut: deps.userDbPut,
    removeUserSong: deps.removeUserSong,
    isAppleMobile: deps.isAppleMobile,
    t: deps.t,
    setLang: deps.setLang,
    applyTheme: deps.applyTheme,
    openSettings: deps.openSettings,
    closeSettings: deps.closeSettings,
    openAddSongModal: deps.openAddSongModal,
    closeAddSongModal: deps.closeAddSongModal,
    completePracticeSection: deps.completePracticeSection,
    onMidiNoteOn: deps.onMidiNoteOn,
    onMidiNoteOff: deps.onMidiNoteOff,
    themes: deps.themes,
    drawBgStars: deps.drawBgStars,
    drawAurora: deps.drawAurora,
    drawGroundFlowers: deps.drawGroundFlowers,
    decayWakeUpFlash: deps.decayWakeUpFlash,
    drawCenterGlow: deps.drawCenterGlow,
    wufOpts: deps.wufOpts,
    getEnergy: deps.getEnergy,
    renderFrame: deps.renderFrame,
    audioInit: deps.audioInit,
  } as any);
}
