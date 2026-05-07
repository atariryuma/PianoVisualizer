// Settings panel — modal lifecycle + audio offset + secondary buttons.
// Phase 0d batch 3 extraction from legacy-app.js.
//
// Out of scope for this module (deliberately): theme picker, synesthesia
// toggle, debug toggle, lang switcher. Those are cross-cutting concerns
// called from multiple places (resetSession, lang flow, app startup) and
// would require deeper deps surgery to extract cleanly. They stay in
// legacy-app.js until a future Phase 0d sub-batch.
//
// In scope:
//   • Modal open/close + backdrop-click + modalFocus integration
//   • Audio offset slider (debounced persist + reset-to-auto button)
//   • Rescan / BLE-connect / Reset-session button wiring
//   • refreshSettingsPanel — input source pill + BLE button visibility
//
// Same dep-injection pattern as section-editor: every cross-module
// reference comes through `createSettingsPanel(deps)` rather than reaching
// into legacy-app globals.

/** Persistent prefs slice the settings panel reads + writes. */
export interface SettingsPrefs {
  audioOffsetMs: number | null;
}

/** Practice slice — the panel writes audioOffsetMs into both prefs and
 *  practice so the running session picks up the change instantly. */
export interface SettingsPracticeRef {
  audioOffsetMs: number;
}

/** Game-state slice — the panel reads `running` (gates the Reset button)
 *  and `micSuspended` (drives the input-status pill). */
export interface SettingsStateRef {
  running: boolean;
  micSuspended: boolean;
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
  /** Show the session-summary modal (Reset button). Only fires when
   *  `state.running` is true. */
  showSessionSummary?(): void;
}

export interface SettingsPanel {
  open(): void;
  close(): void;
  /** Re-render the input-status pill + button availability. Called by
   *  the shell whenever MIDI / mic state changes mid-session. */
  refresh(): void;
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
    // Input source pill — reflects what's currently driving onset detection.
    if (deps.midiInput.enabled && deps.midiInput.port?.name) {
      deps.dom.inputStatus.textContent = '🎹 ' + deps.midiInput.port.name;
    } else if (deps.state.micSuspended) {
      deps.dom.inputStatus.textContent = '🎙️ ' + deps.t('micStandby');
    } else {
      deps.dom.inputStatus.textContent = '🎙️ ' + deps.t('micInput');
    }
    // BLE button — only useful where Web Bluetooth is supported (Chrome /
    // Edge desktop, Android Chrome). Hide on Safari / WebKit / Firefox.
    const bleSupported = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
    if (deps.dom.bleBtn) deps.dom.bleBtn.style.display = bleSupported ? '' : 'none';
    // Reset session is only meaningful when audio is alive — disable on title.
    const resetBtn = deps.dom.resetBtn as HTMLButtonElement | null;
    if (resetBtn) {
      resetBtn.disabled = !deps.state.running;
      resetBtn.style.opacity = deps.state.running ? '' : '.45';
      resetBtn.style.cursor = deps.state.running ? 'pointer' : 'not-allowed';
    }
  }

  function open(): void {
    deps.dom.panel.classList.add('visible');
    refresh();
    deps.modalFocus.open(deps.dom.panel);
  }

  function close(): void {
    deps.dom.panel.classList.remove('visible');
    deps.modalFocus.close(deps.dom.panel);
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
    void deps.connectBleMidi?.().finally(() => {
      refresh();
    });
    close();
  });

  deps.dom.resetBtn?.addEventListener('click', () => {
    close();
    if (deps.state.running) deps.showSessionSummary?.();
  });

  return { open, close, refresh };
}
