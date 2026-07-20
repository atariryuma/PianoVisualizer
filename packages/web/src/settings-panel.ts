// Settings panel — modal lifecycle + audio offset + secondary buttons.
// Phase 0d batches 3 + 70 extracted from legacy-app.js.
//
// Out of scope for this module (deliberately): theme picker, synesthesia
// toggle, lang switcher. Those are cross-cutting concerns called from
// multiple places (resetSession, lang flow, app startup) and live in
// theme-controls.ts.
//
// In scope:
//   • Modal open/close + backdrop-click + modalFocus integration
//   • Audio offset slider (debounced persist + reset-to-auto button)
//   • Rescan / BLE-connect / Reset-session button wiring
//   • refreshSettingsPanel — input source pill + BLE button visibility
//   • Debug toggle + applyDebug (Phase 0d batch 70 fold) — keeps
//     prefs.debug + state.debugMode + the toggle's `.on` class +
//     the debug overlay's visibility in lockstep.
//
// Same dep-injection pattern as section-editor: every cross-module
// reference comes through `createSettingsPanel(deps)` rather than reaching
// into legacy-app globals.

/** Persistent prefs slice the settings panel reads + writes. */
export interface SettingsPrefs {
  audioOffsetMs: number | null;
  /** Phase 0d batch 70 fold — whether the debug overlay starts on. */
  debug: boolean;
  /** 0.15 — note-name notation + practice-audio volume balance.
   *  Optional so older test fixtures stay valid; the runtime prefs
   *  object always carries them (practice-state-init defaults). */
  noteNaming?: 'auto' | 'abc' | 'solfege';
  volGhost?: number;
  volBacking?: number;
  volMetronome?: number;
}

/** Practice slice — the panel writes audioOffsetMs into both prefs and
 *  practice so the running session picks up the change instantly. */
export interface SettingsPracticeRef {
  audioOffsetMs: number;
  /** 練習セッション中か。「セッションの結果」ボタンはフリープレイ専用サマリー
   *  なので、練習中(enabled=true)は隠す判定に使う（露出すると練習を終了せず
   *  再生を再開してしまう混線の元）。 */
  enabled?: boolean;
}

/** Game-state slice — the panel reads `running` (gates the Reset button)
 *  and `micSuspended` (drives the input-status pill); writes `debugMode`
 *  in lockstep with prefs.debug. */
export interface SettingsStateRef {
  running: boolean;
  micSuspended: boolean;
  /** Phase 0d batch 70 fold — mirrored from prefs.debug. */
  debugMode: boolean;
}

/** MIDI-input shape — the panel reads `enabled` + `port?.name` to label
 *  the input-status pill. */
export interface SettingsMidiInputRef {
  enabled: boolean;
  port: { name?: string | null } | null;
}

/** DOM elements wired into the panel. The shell hands these in from its
 *  central DOM bag. */
export interface SettingsPanelDom {
  panel: HTMLElement;
  openBtn: HTMLElement | null;
  closeBtn: HTMLElement | null;
  audioOffsetSlider: HTMLInputElement;
  audioOffsetVal: HTMLElement;
  audioOffsetAuto: HTMLElement;
  audioOffsetReset: HTMLElement | null;
  rescanBtn: HTMLElement | null;
  bleBtn: HTMLElement | null;
  resetBtn: HTMLElement | null;
  inputStatus: HTMLElement;
  /** Phase 0d batch 70 fold — debug overlay toggle button (settings panel)
   *  + the overlay element it toggles. Both optional so existing tests
   *  that don't exercise the debug path can omit them. */
  debugToggle?: HTMLElement | null;
  debugOverlay?: HTMLElement | null;
  /** 0.15 — note-naming segment + volume sliders. All optional so
   *  existing tests that don't exercise them can omit. */
  noteNamingAuto?: HTMLElement | null;
  noteNamingAbc?: HTMLElement | null;
  noteNamingSolfege?: HTMLElement | null;
  volGhostSlider?: HTMLInputElement | null;
  volGhostVal?: HTMLElement | null;
  volBackingSlider?: HTMLInputElement | null;
  volBackingVal?: HTMLElement | null;
  volMetronomeSlider?: HTMLInputElement | null;
  volMetronomeVal?: HTMLElement | null;
  /** 0.15 — progress backup: export button, restore button + hidden file
   *  input, and a status line for import errors. */
  backupExportBtn?: HTMLElement | null;
  backupImportBtn?: HTMLElement | null;
  backupImportFile?: HTMLInputElement | null;
  backupStatus?: HTMLElement | null;
}

export interface SettingsPanelDeps {
  dom: SettingsPanelDom;
  prefs: SettingsPrefs;
  practice: SettingsPracticeRef | null;
  state: SettingsStateRef;
  midiInput: SettingsMidiInputRef;
  /** Default audio-offset (ms) used when prefs.audioOffsetMs is null. */
  defaultAudioOffsetMs: number;
  /** Persist `prefs` to localStorage. Called on slider release + reset. */
  savePrefs(): void;
  /** i18n. Same `t(key, vars?)` shape as legacy. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** Modal-stack manager. */
  modalFocus: { open(el: HTMLElement): void; close(el: HTMLElement): void };
  /** Trigger a manual MIDI re-scan (verbose). Closes the panel afterwards. */
  rescanMidi?(): void;
  /** Open Web-Bluetooth pairing for BLE-MIDI keyboards. */
  connectBleMidi?(): Promise<unknown>;
  /** Native (iOS Capacitor) OS Bluetooth-MIDI pairing sheet. When `has()`
   *  is true, the BLE button shows and routes here instead of Web
   *  Bluetooth — attach then happens via CoreMIDI hot-plug → portChange →
   *  auto-rescan, same as USB. Injected by shell-settings from
   *  native-midi-polyfill so this module stays deps-only. */
  nativeBleMidi?: { has(): boolean; show(): Promise<void> } | null;
  /** 0.15 — push the prefs volume balance onto live practice synths so a
   *  slider drag is audible immediately (mid-listen/rhythm playback). */
  applyToneVolumes?(): void;
  /** 音量スライダーを離した時（change）に該当層を1発プレビュー発音する。
   *  無音・非再生時でも "効いた" と分かるようにするための最小フィードバック。 */
  previewToneVolume?(layer: 'ghost' | 'backing' | 'metronome'): void;
  /** 0.15 — refresh the shell's note-name cache after a notation change. */
  onNoteNamingChange?(): void;
  /** 0.15 — download a progress+settings backup file. */
  exportProgressBackup?(): void;
  /** 0.15 — restore from a backup file (throws on bad file; reloads on ok). */
  importProgressBackup?(file: Blob): Promise<void>;
  /** Show the session-summary modal (Reset button). Only fires when
   *  `state.running` is true. */
  showSessionSummary?(): void;
  /** Pause the practice session while the panel is open (freeze clock +
   *  pause Transport). Called from open(); resume from close(). Optional
   *  so tests / non-practice contexts can omit it. Without this, a kid who
   *  opens ⚙ mid-section watches every note auto-miss behind the modal. */
  pausePractice?(): void;
  /** Resume after the panel closes. Paired with pausePractice. */
  resumePractice?(): void;
  /** パネルが閉じるとき（closeBtn / backdrop / rescan 等すべての経路）に
   *  呼ばれる後始末フック — レイテンシ較正の中断などに使う。 */
  onClose?(): void;
}

export interface SettingsPanel {
  open(): void;
  close(): void;
  /** Re-render the input-status pill + button availability. Called by
   *  the shell whenever MIDI / mic state changes mid-session. */
  refresh(): void;
  /** Phase 0d batch 70 fold — apply (or revoke) debug-overlay mode.
   *  Mirrors `prefs.debug` + `state.debugMode` and toggles both the
   *  in-panel toggle's `.on` class and the overlay's `.visible` class.
   *  Called once at boot from the shell with `prefs.debug` to seed
   *  the UI; the in-panel click handler invokes it on flip. */
  applyDebug(on: boolean): void;
}

/** Wire the settings panel. Returns `{open, close, refresh}` for the
 *  shell to drive from its own event flow. Internal handlers (open/close
 *  buttons, slider, panel-backdrop click) bind here. */
export function createSettingsPanel(deps: SettingsPanelDeps): SettingsPanel {
  // Debounce localStorage writes. Slider drag fires `input` per pixel
  // (~50 events end-to-end) and each was hitting JSON.stringify + setItem
  // before the debounce; now batched into one persist 250 ms after the
  // last change.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function refreshAudioOffsetUI(): void {
    const isAuto = deps.prefs.audioOffsetMs == null;
    // `(true && 0) || DEFAULT` collapses 0 to DEFAULT — use ?? so a
    // legitimate 0ms override (Linux desktop with negligible buffering)
    // displays correctly instead of jumping to the 40ms fallback.
    const autoValue = deps.practice?.audioOffsetMs ?? deps.defaultAudioOffsetMs;
    const value = Math.round(isAuto ? autoValue : (deps.prefs.audioOffsetMs ?? autoValue));
    deps.dom.audioOffsetSlider.value = String(value);
    deps.dom.audioOffsetVal.textContent = String(value);
    deps.dom.audioOffsetAuto.textContent = isAuto ? deps.t('autoDetectedFmt', { v: value }) : '';
  }

  function refresh(): void {
    refreshAudioOffsetUI();
    // 0.15: seed volume sliders + note-naming segment from prefs.
    for (const { slider, val, key } of volDefs) {
      const v = deps.prefs[key] ?? 100;
      if (slider) slider.value = String(v);
      if (val) val.textContent = String(v);
    }
    refreshNoteNamingSeg();
    // Input source pill — reflects what's currently driving onset detection.
    if (deps.midiInput.enabled && deps.midiInput.port?.name) {
      deps.dom.inputStatus.textContent = '🎹 ' + deps.midiInput.port.name;
    } else if (deps.state.micSuspended) {
      deps.dom.inputStatus.textContent = '🎙️ ' + deps.t('micStandby');
    } else {
      deps.dom.inputStatus.textContent = '🎙️ ' + deps.t('micInput');
    }
    // BLE button — Web Bluetooth (Chrome / Edge desktop, Android Chrome),
    // or the native iOS OS pairing sheet (Capacitor build). Hide only when
    // neither path exists (Safari / WebKit web, Firefox).
    const bleSupported =
      !!(navigator.bluetooth && navigator.bluetooth.requestDevice) || !!deps.nativeBleMidi?.has();
    if (deps.dom.bleBtn) deps.dom.bleBtn.style.display = bleSupported ? '' : 'none';
    // 「📊 セッションの結果」はフリープレイ専用のサマリー表示（combo/stage/
    // quest/レーダー）。練習中(practice.enabled)は quest が回らず中身が無意味で、
    // かつ押すと close→resume が再生を再開し「終了」に見えないので、練習中と
    // 非セッション時は行ごと隠す（フリープレイ実行中だけ表示）。練習の出口は
    // ✕やめる(曲選択)/🏠(タイトル)/結果カードが担う。
    const resetBtn = deps.dom.resetBtn as HTMLButtonElement | null;
    if (resetBtn) {
      const isFreeplay = deps.state.running && !deps.practice?.enabled;
      const host = (resetBtn.closest('.settings-row') as HTMLElement | null) ?? resetBtn;
      host.style.display = isFreeplay ? '' : 'none';
      resetBtn.disabled = !isFreeplay; // 念のためクリックも封じる
    }
  }

  function open(): void {
    // Freeze the practice clock BEFORE showing the panel so no note is
    // auto-missed in the frame the modal appears.
    deps.pausePractice?.();
    deps.dom.panel.classList.add('visible');
    refresh();
    deps.modalFocus.open(deps.dom.panel);
  }

  function close(): void {
    deps.dom.panel.classList.remove('visible');
    deps.modalFocus.close(deps.dom.panel);
    // Rebase the clock + resume Transport after the panel is gone.
    deps.resumePractice?.();
    deps.onClose?.();
  }

  // ─── event wiring ─────────────────────────────────────────────────
  deps.dom.openBtn?.addEventListener('click', open);
  deps.dom.closeBtn?.addEventListener('click', close);
  deps.dom.panel.addEventListener('click', (e) => {
    if (e.target === deps.dom.panel) close();
  });

  deps.dom.audioOffsetSlider.addEventListener('input', () => {
    const v = parseInt(deps.dom.audioOffsetSlider.value, 10);
    // Bail on NaN — `practiceRealElapsedMs` would propagate NaN through
    // every `elapsed - audioOffsetMs` subtraction for the rest of the
    // session, breaking lane + cursor + scoring.
    if (!Number.isFinite(v)) return;
    deps.prefs.audioOffsetMs = v;
    if (deps.practice) deps.practice.audioOffsetMs = v;
    deps.dom.audioOffsetVal.textContent = String(v);
    deps.dom.audioOffsetAuto.textContent = '';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(deps.savePrefs, 250);
  });

  // ── 0.15: practice-audio volume balance (3 sliders, live-applied) ──
  const volDefs: Array<{
    slider: HTMLInputElement | null | undefined;
    val: HTMLElement | null | undefined;
    key: 'volGhost' | 'volBacking' | 'volMetronome';
  }> = [
    { slider: deps.dom.volGhostSlider, val: deps.dom.volGhostVal, key: 'volGhost' },
    { slider: deps.dom.volBackingSlider, val: deps.dom.volBackingVal, key: 'volBacking' },
    { slider: deps.dom.volMetronomeSlider, val: deps.dom.volMetronomeVal, key: 'volMetronome' },
  ];
  const layerForKey: Record<
    'volGhost' | 'volBacking' | 'volMetronome',
    'ghost' | 'backing' | 'metronome'
  > = { volGhost: 'ghost', volBacking: 'backing', volMetronome: 'metronome' };
  for (const { slider, val, key } of volDefs) {
    slider?.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      if (!Number.isFinite(v)) return;
      deps.prefs[key] = Math.max(0, Math.min(100, v));
      if (val) val.textContent = String(deps.prefs[key]);
      // Live-apply so a drag during listen/rhythm playback is audible.
      deps.applyToneVolumes?.();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(deps.savePrefs, 250);
    });
    // ドラッグを離した時に1発プレビュー発音（input 毎だと連射になるので
    // change で1回）。無音・非再生時（タイトル画面等）でも新しい音量を
    // 耳で確認できる — スライダーが「効かない」に見える最大要因を解消。
    slider?.addEventListener('change', () => {
      deps.previewToneVolume?.(layerForKey[key]);
    });
  }

  // ── 0.15: note-name notation segment (auto / C-D-E / ドレミ) ──
  const segDefs: Array<{ el: HTMLElement | null | undefined; mode: 'auto' | 'abc' | 'solfege' }> = [
    { el: deps.dom.noteNamingAuto, mode: 'auto' },
    { el: deps.dom.noteNamingAbc, mode: 'abc' },
    { el: deps.dom.noteNamingSolfege, mode: 'solfege' },
  ];
  function refreshNoteNamingSeg(): void {
    const current = deps.prefs.noteNaming ?? 'auto';
    for (const { el, mode } of segDefs) {
      el?.classList.toggle('active', mode === current);
    }
  }
  for (const { el, mode } of segDefs) {
    el?.addEventListener('click', () => {
      deps.prefs.noteNaming = mode;
      refreshNoteNamingSeg();
      deps.onNoteNamingChange?.();
      deps.savePrefs();
    });
  }

  // ── 0.15: progress backup / restore ──────────────────────────────
  deps.dom.backupExportBtn?.addEventListener('click', () => {
    deps.exportProgressBackup?.();
  });
  deps.dom.backupImportBtn?.addEventListener('click', () => {
    deps.dom.backupImportFile?.click();
  });
  deps.dom.backupImportFile?.addEventListener('change', () => {
    const file = deps.dom.backupImportFile?.files?.[0];
    if (!file) return;
    if (deps.dom.backupStatus) {
      deps.dom.backupStatus.textContent = '';
      deps.dom.backupStatus.classList.remove('error');
    }
    void deps
      .importProgressBackup?.(file)
      // Success reloads the page; we only land here on failure.
      .catch((e: unknown) => {
        if (deps.dom.backupStatus) {
          deps.dom.backupStatus.textContent = (e as Error).message || 'Restore failed';
          deps.dom.backupStatus.classList.add('error');
        }
      });
    // Reset so re-picking the same file re-fires change.
    if (deps.dom.backupImportFile) deps.dom.backupImportFile.value = '';
  });

  deps.dom.audioOffsetReset?.addEventListener('click', () => {
    deps.prefs.audioOffsetMs = null;
    deps.savePrefs();
    // Re-trigger auto-detect on next session start; meanwhile use the default.
    if (deps.practice) deps.practice.audioOffsetMs = deps.defaultAudioOffsetMs;
    refreshAudioOffsetUI();
  });

  deps.dom.rescanBtn?.addEventListener('click', () => {
    deps.rescanMidi?.();
    close();
  });

  deps.dom.bleBtn?.addEventListener('click', () => {
    if (deps.nativeBleMidi?.has()) {
      // Native iOS: present the OS Bluetooth-MIDI pairing sheet. No await —
      // the sheet resolves on presentation; the eventual connection arrives
      // via CoreMIDI hot-plug → portChange → auto-rescan attach.
      void deps.nativeBleMidi.show();
      close();
      return;
    }
    void deps.connectBleMidi?.().finally(() => {
      refresh();
    });
    close();
  });

  deps.dom.resetBtn?.addEventListener('click', () => {
    close();
    // フリープレイ実行中のみサマリーを開く（練習中は上のガードで非表示だが、
    // ハンドラ側でも二重に守る）。
    if (deps.state.running && !deps.practice?.enabled) deps.showSessionSummary?.();
  });

  // ─── debug toggle (Phase 0d batch 70 fold) ───────────────────────
  // Keeps prefs.debug + state.debugMode + the toggle's `.on` class +
  // the overlay's `.visible` (and inline display) in lockstep. The
  // shell calls applyDebug(prefs.debug) once at boot to seed the UI.
  function applyDebug(on: boolean): void {
    deps.prefs.debug = on;
    deps.state.debugMode = on;
    if (deps.dom.debugToggle) deps.dom.debugToggle.classList.toggle('on', on);
    if (deps.dom.debugOverlay) {
      deps.dom.debugOverlay.classList.toggle('visible', on);
      deps.dom.debugOverlay.style.display = on ? 'block' : 'none';
    }
  }
  deps.dom.debugToggle?.addEventListener('click', () => {
    applyDebug(!deps.prefs.debug);
    deps.savePrefs();
  });

  return { open, close, refresh, applyDebug };
}
