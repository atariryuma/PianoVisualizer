// Settings panel shell — Phase 0d batch 118.
//
// Bundles createSettingsPanel + the boot-time applyDebug seed. The
// shell takes the cross-cutting refs (prefs / practice / state /
// midiInput / modalFocus / t) plus the small set of action thunks the
// panel buttons fire (rescanMidi, connectBleMidi, showSessionSummary)
// and pushes the assembled wireup behind one factory call.
//
// Returns the open / close / refresh entry points so legacy-app.js
// can assign them into its forward-decl placeholders.

import type { MidiInputRef } from './shell-midi';
import type { InitialGameState } from './game-state-init';
import type { InitialPrefs, InitialPracticeState } from './practice-state-init';
import type { DomBag } from './dom-bag';
import * as SettingsPanel from './settings-panel';

export interface ShellSettingsDeps {
  /** Full DOM bag — the panel pulls 13 named elements via the explicit
   *  remap (different prop names than DOM.*, so no pickDom shortcut). */
  dom: DomBag;
  prefs: InitialPrefs;
  practice: InitialPracticeState;
  state: InitialGameState;
  midiInput: MidiInputRef;
  defaultAudioOffsetMs: number;
  savePrefs: () => void;
  t: (key: string) => string;
  modalFocus: any;
  /** Action thunks fired by panel buttons. */
  rescanMidi: () => void;
  connectBleMidi: () => void;
  showSessionSummary: () => void;
  /** Freeze/resume the practice session while the panel is open (P1-6). */
  pausePractice: () => void;
  resumePractice: () => void;
}

export interface ShellSettings {
  open: () => void;
  close: () => void;
  refresh: () => void;
}

export function createShellSettings(deps: ShellSettingsDeps): ShellSettings {
  const { dom: DOM } = deps;
  const _settings = SettingsPanel.createSettingsPanel({
    dom: {
      panel: DOM.settingsPanel,
      openBtn: DOM.settingsBtn,
      closeBtn: DOM.settingsCloseBtn,
      audioOffsetSlider: DOM.audioOffsetSlider,
      audioOffsetVal: DOM.audioOffsetVal,
      audioOffsetAuto: DOM.audioOffsetAuto,
      audioOffsetReset: DOM.audioOffsetReset,
      rescanBtn: DOM.settingsRescanBtn,
      bleBtn: DOM.settingsBleBtn,
      resetBtn: DOM.settingsResetBtn,
      inputStatus: DOM.settingsInputStatus,
      debugToggle: DOM.settingsDebugToggle,
      debugOverlay: DOM.debugOverlay,
    },
    prefs: deps.prefs,
    practice: deps.practice,
    state: deps.state,
    midiInput: deps.midiInput,
    defaultAudioOffsetMs: deps.defaultAudioOffsetMs,
    savePrefs: deps.savePrefs,
    t: deps.t,
    modalFocus: deps.modalFocus,
    rescanMidi: deps.rescanMidi,
    connectBleMidi: deps.connectBleMidi,
    showSessionSummary: deps.showSessionSummary,
    pausePractice: deps.pausePractice,
    resumePractice: deps.resumePractice,
  } as any);

  // Boot-time seed — honor the persisted-prefs debug overlay state
  // across reloads.
  _settings.applyDebug(deps.prefs.debug);

  return {
    open: _settings.open,
    close: _settings.close,
    refresh: _settings.refresh,
  };
}
