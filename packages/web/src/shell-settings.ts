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
import { hasNativeBleMidiPairing, showNativeBleMidiPairing } from './native-midi-polyfill';

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
  /** パネルが閉じるときの後始末（レイテンシ較正の中断など）。 */
  onPanelClose?: () => void;
  /** 0.15 — 音量バランスのライブ反映 + 音名表記キャッシュ更新。 */
  applyToneVolumes?: () => void;
  /** 音量スライダー調整時（change）のプレビュー発音。 */
  previewToneVolume?: (layer: 'ghost' | 'backing' | 'metronome') => void;
  onNoteNamingChange?: () => void;
  /** A3 — ノーツ速度変更（練習中は lookahead を即再計算）。 */
  onNoteSpeedChange?: () => void;
  /** 0.15 — 進捗バックアップ（星/スタンプ/練習日 + 設定）の書き出し/取り込み。 */
  exportProgressBackup?: () => void;
  importProgressBackup?: (file: Blob) => Promise<void>;
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
      // 0.15 — 音名表記セグメント + 音量スライダー。
      noteNamingAuto: DOM.noteNamingAuto,
      noteNamingAbc: DOM.noteNamingAbc,
      noteNamingSolfege: DOM.noteNamingSolfege,
      // ノーツ落下速度セグメント（A3）。
      noteSpeedSlow: DOM.noteSpeedSlow,
      noteSpeedNormal: DOM.noteSpeedNormal,
      noteSpeedFast: DOM.noteSpeedFast,
      volGhostSlider: DOM.volGhostSlider,
      volGhostVal: DOM.volGhostVal,
      volBackingSlider: DOM.volBackingSlider,
      volBackingVal: DOM.volBackingVal,
      volMetronomeSlider: DOM.volMetronomeSlider,
      volMetronomeVal: DOM.volMetronomeVal,
      // 0.15 — 進捗バックアップ。
      backupExportBtn: DOM.backupExportBtn,
      backupImportBtn: DOM.backupImportBtn,
      backupImportFile: DOM.backupImportFile,
      backupStatus: DOM.backupStatus,
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
    // ネイティブ iOS の OS 標準 Bluetooth-MIDI ペアリング（Capacitor 時のみ有効）。
    nativeBleMidi: { has: hasNativeBleMidiPairing, show: showNativeBleMidiPairing },
    showSessionSummary: deps.showSessionSummary,
    pausePractice: deps.pausePractice,
    resumePractice: deps.resumePractice,
    onClose: deps.onPanelClose,
    applyToneVolumes: deps.applyToneVolumes,
    previewToneVolume: deps.previewToneVolume,
    onNoteNamingChange: deps.onNoteNamingChange,
    onNoteSpeedChange: deps.onNoteSpeedChange,
    exportProgressBackup: deps.exportProgressBackup,
    importProgressBackup: deps.importProgressBackup,
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
