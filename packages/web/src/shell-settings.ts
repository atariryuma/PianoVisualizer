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
import type * as PianoCore from '@piano/core';
import * as SettingsPanel from './settings-panel';
import * as ShellHelpers from './shell-helpers';
import { hasNativeAudioLatency, readNativeAudioLatency } from './native-midi-polyfill';
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
  /** 実装は shell-midi の `async connectBleMidi()`。settings-panel は戻り値の
   *  `.finally()` を呼ぶので Promise であることが必須 — ここが `() => void`
   *  だったのは誤りで、call site の `as any` に隠れていた。 */
  connectBleMidi: () => Promise<unknown>;
  /** ShellMidi.applyInputSourcePref — 選択の反映（アクティブ入力の再解決 +
   *  マイクの suspend/resume）。パネル自身は prefs を書くだけ。 */
  applyInputSourcePref: () => Promise<void>;
  /** ShellMidi.getInputStatus — 表示用の入力状況（生きている入力・待機中か・
   *  繋がっているのに使っていないキーボードがあるか）。 */
  getInputStatus: () => PianoCore.InputSourceStatus;
  /** Live Tone handle — the settings panel reads AudioContext latency from it
   *  to show what the device actually costs. Null before audio starts. */
  getTone?: () => { context?: unknown } | null;
  showSessionSummary: () => void;
  /** Freeze/resume the practice session while the panel is open (P1-6). */
  pausePractice: () => void;
  resumePractice: () => void;
  /** ネイティブのペアリング画面表示直後 — poller 再起動フック。省略可。 */
  onNativePairingShown?: () => void;
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
  /** Current audio output route name (native only), or undefined. */
  getAudioRoute?: () => string | undefined;
  open: () => void;
  close: () => void;
  refresh: () => void;
}

export function createShellSettings(deps: ShellSettingsDeps): ShellSettings {
  const { dom: DOM } = deps;

  /** Last resolved native reading (AVAudioSession). `outMs` already includes the
   *  ioBuffer — one figure, so nothing downstream can add the buffer twice.
   *  Re-read on every panel open because the output route can change under us. */
  let nativeLatency: { outMs: number; portName?: string } | null = null;

  /** Synchronous web fallback — 0 on Apple platforms, which the panel reports
   *  as "can't be measured" rather than as a 0 ms device. */
  const audioContextLatency = (): ShellHelpers.ReportedContextLatency | null =>
    ShellHelpers.readContextLatencyMs(
      deps.getTone?.()?.context as ShellHelpers.LatencyReportingContext | undefined
    );
  const _settings = SettingsPanel.createSettingsPanel({
    // Spread the bag, then override ONLY the genuinely renamed entries.
    // Hand-listing the identity-named controls (audioOffset*, noteNaming*,
    // noteSpeed*, judge*, vol*, backup*) was pure duplication, and the
    // duplication is what broke the judgement-strictness segment: it was added
    // to index.html, to the DOM bag, to SettingsPanelDom and to the click
    // handlers, but not to this literal, so it was silently dead on device.
    // Anything named the same on both sides is now wired for free, forever.
    dom: {
      ...DOM,
      panel: DOM.settingsPanel,
      openBtn: DOM.settingsBtn,
      closeBtn: DOM.settingsCloseBtn,
      rescanBtn: DOM.settingsRescanBtn,
      bleBtn: DOM.settingsBleBtn,
      resetBtn: DOM.settingsResetBtn,
      inputStatus: DOM.settingsInputStatus,
      debugToggle: DOM.settingsDebugToggle,
      // The DOM bag is deliberately element-subtype-agnostic (everything is
      // HTMLElement), so the handful of controls the panel needs as inputs are
      // narrowed here — the one thing the removed `as any` was legitimately
      // covering.
      audioOffsetSlider: DOM.audioOffsetSlider as HTMLInputElement,
      volGhostSlider: DOM.volGhostSlider as HTMLInputElement,
      volBackingSlider: DOM.volBackingSlider as HTMLInputElement,
      volMetronomeSlider: DOM.volMetronomeSlider as HTMLInputElement,
      backupImportFile: DOM.backupImportFile as HTMLInputElement,
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
    // 入力ソース選択（おまかせ / 🎹 / 🎙️）。パネルは prefs を書くだけで、
    // 実際にマイクを起こす／落とすのは shell-midi 側（唯一の解決地点）。
    applyInputSourcePref: deps.applyInputSourcePref,
    getInputStatus: deps.getInputStatus,
    // ネイティブ iOS の OS 標準 Bluetooth-MIDI ペアリング（Capacitor 時のみ有効）。
    nativeBleMidi: { has: hasNativeBleMidiPairing, show: showNativeBleMidiPairing },
    onNativePairingShown: deps.onNativePairingShown,
    showSessionSummary: deps.showSessionSummary,
    // Read the LIVE context every refresh — plugging in headphones changes the
    // output route and therefore the latency, so a cached value would lie.
    // Native reading FIRST. WebKit reports 0 for AudioContext.outputLatency on
    // every Apple platform, so on iOS the AudioContext path can only ever say
    // "unknown" — AVAudioSession is where the real number lives. The bridge
    // call is async, so the resolved value is cached and the panel is asked to
    // repaint; the AudioContext value is the synchronous fallback for web.
    getAudioLatency: () => nativeLatency ?? audioContextLatency(),
    pausePractice: deps.pausePractice,
    resumePractice: deps.resumePractice,
    onClose: deps.onPanelClose,
    applyToneVolumes: deps.applyToneVolumes,
    previewToneVolume: deps.previewToneVolume,
    onNoteNamingChange: deps.onNoteNamingChange,
    onNoteSpeedChange: deps.onNoteSpeedChange,
    exportProgressBackup: deps.exportProgressBackup,
    importProgressBackup: deps.importProgressBackup,
  });

  // Boot-time seed — honor the persisted-prefs debug overlay state
  // across reloads.
  _settings.applyDebug(deps.prefs.debug);

  /** Re-read the OS latency, then repaint. Async because it crosses the
   *  Capacitor bridge; the panel shows the AudioContext fallback until it
   *  resolves (one frame later, in practice). */
  function refreshNativeLatency(): void {
    if (!hasNativeAudioLatency()) return;
    // The only consumer of this reading is DOM inside the panel. `refresh()` is
    // also bound as the shell's `refreshSettingsPanel` and fires on every
    // language toggle and every calibration result, so without this the app
    // crossed the Capacitor bridge to repaint a hidden element. `open()` calls
    // this unconditionally, which covers the case that matters.
    if (!DOM.settingsPanel?.classList.contains('visible')) return;
    void readNativeAudioLatency().then((r) => {
      const next = r ? { outMs: r.outMs, portName: r.portName || undefined } : null;
      // Repaint only on a CHANGE. Both callers (`open` / `refresh`) already
      // paint synchronously right after asking for this, so an unconditional
      // repaint here meant two full panel paints per open for a value that is
      // the same on all but the first read after a route change.
      if (next?.outMs === nativeLatency?.outMs && next?.portName === nativeLatency?.portName) {
        return;
      }
      nativeLatency = next;
      _settings.refresh();
    });
  }

  return {
    /** Live output-route name, for stamping onto a calibration measurement. */
    getAudioRoute: () => nativeLatency?.portName,
    open: () => {
      // ORDER MATTERS: open first, then measure. `refreshNativeLatency()` skips
      // the bridge call when the panel isn't `.visible` (so a langchange or a
      // calibration result can't cross it to repaint a hidden element) — and
      // `_settings.open()` is what adds that class. Calling them the other way
      // round made the probe a no-op on the one path that needs it, which is
      // also why no `getAudioLatency` call appears in the device log.
      _settings.open();
      // Route can have changed since last time (AirPods connected, headphones
      // unplugged), so re-measure on every open rather than caching once.
      refreshNativeLatency();
    },
    close: _settings.close,
    refresh: () => {
      refreshNativeLatency();
      _settings.refresh();
    },
  };
}
