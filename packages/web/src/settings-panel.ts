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
import { MIN_REPORTED_OUT_LATENCY_MS } from '@piano/core';
import { diag } from './diag-sink';
import { installSlider } from './slider-control';

import type { InputSourcePref, InputSourceStatus } from '@piano/core';

export interface SettingsPrefs {
  audioOffsetMs: number | null;
  /** How the stored offset was measured. Drives the staleness warning: an
   *  offset measured on one output route does not apply to another. */
  audioOffsetSource?: 'midi' | 'touch';
  audioOffsetRoute?: string;
  /** Phase 0d batch 70 fold — whether the debug overlay starts on. */
  debug: boolean;
  /** 0.15 — note-name notation + practice-audio volume balance.
   *  Optional so older test fixtures stay valid; the runtime prefs
   *  object always carries them (practice-state-init defaults). */
  noteNaming?: 'auto' | 'abc' | 'solfege';
  volGhost?: number;
  volBacking?: number;
  volMetronome?: number;
  /** ノーツ落下速度（レーン先読み倍率）— 音ゲーのハイスピード設定。 */
  noteSpeed?: 'slow' | 'normal' | 'fast';
  judgeStrictness?: 'easy' | 'normal' | 'strict';
  inputSource?: InputSourcePref;
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
  /** 実測遅延の専用行。説明文の末尾に紛れさせず、値のすぐ下に出す。 */
  audioLatencyInfo: HTMLElement | null;
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
  /** ノーツ速度セグメント（🐢ゆっくり / ふつう / 🚀はやい）。 */
  /** Judgement-strictness segment. REQUIRED, not optional, deliberately: an
   *  optional DOM field plus `el?.addEventListener` means a control that was
   *  never wired up compiles clean, passes every test, and is simply dead on
   *  device — which is exactly what happened to this segment. Requiring the
   *  field makes the compiler point at the call site that forgot it. `null` is
   *  still allowed so a partial-DOM test can opt out EXPLICITLY. */
  /** Input-source segment (auto / keyboard / mic). Required-nullable so a call
   *  site that forgets to wire them fails to compile rather than shipping a
   *  dead control — the judgement segment shipped inert exactly that way. */
  inputSrcAuto: HTMLElement | null;
  inputSrcMidi: HTMLElement | null;
  inputSrcMic: HTMLElement | null;
  judgeEasy: HTMLElement | null;
  judgeNormal: HTMLElement | null;
  judgeStrict: HTMLElement | null;
  noteSpeedSlow?: HTMLElement | null;
  noteSpeedNormal?: HTMLElement | null;
  noteSpeedFast?: HTMLElement | null;
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
  /** ネイティブのペアリング画面を出した直後に呼ばれる — シェルはここで
   *  auto-rescan poller を再起動して 1s カデンツへ戻す（ペア直後の
   *  取り込みを速くする）。省略可。 */
  onNativePairingShown?(): void;
  /** 0.15 — push the prefs volume balance onto live practice synths so a
   *  slider drag is audible immediately (mid-listen/rhythm playback). */
  applyToneVolumes?(): void;
  /** 音量スライダーを離した時（change）に該当層を1発プレビュー発音する。
   *  無音・非再生時でも "効いた" と分かるようにするための最小フィードバック。 */
  previewToneVolume?(layer: 'ghost' | 'backing' | 'metronome'): void;
  /** 0.15 — refresh the shell's note-name cache after a notation change. */
  onNoteNamingChange?(): void;
  /** ノーツ速度変更 — 練習中なら recomputePracticeTimings で即反映。 */
  onNoteSpeedChange?(): void;
  /** 0.15 — download a progress+settings backup file. */
  exportProgressBackup?(): void;
  /** 0.15 — restore from a backup file (throws on bad file; reloads on ok). */
  importProgressBackup?(file: Blob): Promise<void>;
  /** Show the session-summary modal (Reset button). Only fires when
   *  `state.running` is true. */
  showSessionSummary?(): void;
  /** Live audio-output latency, in ms. Null when it can't be determined. Read
   *  on every panel refresh — never cached — so the number always reflects the
   *  current output route (plugging in headphones changes it drastically).
   *  On native iOS this comes from AVAudioSession; on the web it comes from
   *  AudioContext, which WebKit reports as 0. */
  getAudioLatency?(): { outMs: number; portName?: string } | null;
  /** Apply a changed input-source choice: resolve the active source and bring
   *  the mic up or down to match (ShellMidi.applyInputSourcePref). */
  applyInputSourcePref?(): Promise<void>;
  /** Classified input situation for the read-out — which source is live, is it
   *  waiting on hardware, is a connected keyboard deliberately idle. */
  getInputStatus?(): InputSourceStatus;
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
    // The measured hardware latency gets its OWN line directly under the value
    // it explains. It first shipped appended to the end of a long help
    // paragraph in small print, and only after a section had been played — so
    // the one number that answers "is a 200 ms offset normal?" was unfindable.
    // Read on demand from the live AudioContext, so it is present whenever
    // audio is alive rather than depending on having started a section.
    if (deps.dom.audioLatencyInfo) {
      const probed = deps.getAudioLatency?.();
      const el = deps.dom.audioLatencyInfo;
      const hasOffset = deps.prefs.audioOffsetMs != null;
      // ONE text build and ONE class decision. This used to write textContent
      // three times and add/remove `is-unmeasurable` across four independent
      // conditions, so the class ended up carrying two unrelated meanings by
      // whichever branch ran last.
      const parts: string[] = [];
      let suspect = false;

      if (probed == null) {
        // Audio hasn't started yet — nothing honest to say.
      } else if (probed.outMs > MIN_REPORTED_OUT_LATENCY_MS) {
        parts.push(
          deps.t('audioOffsetMeasuredFmt', { v: Math.round(probed.outMs) }) +
            (probed.portName ? '（' + probed.portName + '）' : '')
        );
      } else {
        // A reported 0 is NOT a 0 ms device — it means the platform declined to
        // measure (iOS WKWebView always does). Printing "0 ms" as if it were a
        // reading is worse than useless, and it is exactly what made a tester
        // ask whether a 210 ms offset was normal. Say what it means, and point
        // at the one path that does work here.
        parts.push(deps.t('audioOffsetUnmeasurable'));
        suspect = true;
      }

      // A stored offset goes stale along TWO axes, because the measurement
      // captures the whole round trip: the OUTPUT route it was heard through,
      // and the INPUT the player answered with. Only the first was checked, and
      // `audioOffsetSource` was written at every calibration and then never read
      // by anything — so the app knew the value had been measured by tapping the
      // screen and never said so.
      const measuredRoute = deps.prefs.audioOffsetRoute;
      const liveRoute = probed?.portName;
      if (hasOffset && measuredRoute && liveRoute && measuredRoute !== liveRoute) {
        parts.push(deps.t('audioOffsetStaleFmt', { v: measuredRoute }));
        suspect = true;
      }
      // A touch-measured offset carries 20-50 ms of screen-touch latency,
      // against ~5 ms for a keyboard. Applying it to instrument play puts the
      // player permanently off the beat by that difference — the reason
      // calibration locks to the live input in the first place. Only flagged
      // once an input IS live: with no mic and no keyboard there is no better
      // measurement to offer, and nagging about it would be noise.
      const inputLive = deps.getInputStatus?.()?.waiting === false;
      if (hasOffset && deps.prefs.audioOffsetSource === 'touch' && inputLive) {
        parts.push(deps.t('audioOffsetInputStale'));
        suspect = true;
      }

      el.textContent = parts.join(' · ');
      el.classList.toggle('is-unmeasurable', suspect);
    }
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
    refreshNoteSpeedSeg();
    refreshJudgeSeg();
    refreshInputSrcSeg();
    // Input pill — what is ACTUALLY driving onset detection right now, which is
    // not the same as what is plugged in. Three states the player has to be
    // able to tell apart, because two of them look like a bug otherwise:
    //   • keyboard live            → 🎹 <device name>
    //   • pinned to keyboard, none → waiting (NOT "mic input")
    //   • mic live, keyboard idle  → 🎙️ … + "not using <device>"
    const status = deps.getInputStatus?.();
    const portName = deps.midiInput.port?.name;
    if (status?.active === 'midi') {
      deps.dom.inputStatus.textContent = status.midiAttached
        ? '🎹 ' + (portName || deps.t('input'))
        : '🎹 ' + deps.t('inputWaitingMidi');
    } else if (deps.midiInput.enabled && deps.midiInput.port?.name && !status) {
      // No classifier wired (older shell / partial test) — legacy behaviour.
      deps.dom.inputStatus.textContent = '🎹 ' + deps.midiInput.port.name;
    } else {
      const micLabel = deps.state.micSuspended ? deps.t('micStandby') : deps.t('micInput');
      // A connected-but-ignored keyboard is stated out loud: it is the one
      // state a player is guaranteed to read as a broken app otherwise.
      const idleNote =
        status?.midiIdle && portName ? ' ・ ' + deps.t('inputMidiIdleFmt', { v: portName }) : '';
      deps.dom.inputStatus.textContent = '🎙️ ' + micLabel + idleNote;
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

  // Gesture trace — ONE channel, capture-phase, self-retiring.
  //
  // "The slider doesn't move on iOS" survived two fixes aimed at the wrong layer
  // because a device log cannot show a gesture. These outcomes are each a
  // different bug and the trace tells them apart:
  //   • no `down`            → the element isn't being hit (geometry / overlay)
  //   • `down` but no `move` → it is hit but the drag is suppressed
  //                            (touch-action / a scroll container claiming it)
  //   • both                 → the value moves and something else fails to show it
  // `isTrusted` matters because the slider dispatches synthetic `input` events
  // itself — an earlier reading of "input fired with no pointerdown" could not
  // tell a real gesture from our own echo, and that ambiguity sent the diagnosis
  // the wrong way.
  //
  // There used to be a SECOND channel: an `onEvent` callback the slider control
  // called from every move, which re-found the element by id and measured it.
  // Capture phase on the panel necessarily sees the same events first, so that
  // one only added a stringly-typed debug seam to a reusable control's API and a
  // forced layout per move — inside the very drag it was measuring.
  const TRACE_EVENTS = ['pointerdown', 'pointermove', 'pointercancel', 'touchstart', 'touchmove'];
  let traceBudget = 24;
  const traceGesture = (e: Event): void => {
    const t = e.target as HTMLElement | null;
    diag('GESTURE', {
      type: e.type,
      trusted: e.isTrusted,
      target: t?.id || t?.className || t?.tagName,
      cancelable: e.cancelable,
      defaultPrevented: e.defaultPrevented,
    });
    // Retire once spent, so a session that never opens settings stops paying
    // anything at all. Listening on the PANEL rather than the document is what
    // makes the filter structural — the old version walked every event's
    // ancestor chain, for both event families, for the whole session.
    if (--traceBudget <= 0) {
      for (const type of TRACE_EVENTS) {
        deps.dom.panel.removeEventListener(type, traceGesture, { capture: true });
      }
    }
  };
  for (const type of TRACE_EVENTS) {
    deps.dom.panel.addEventListener(type, traceGesture, { capture: true, passive: true });
  }

  // Own the gesture on every slider in the panel (see slider-control.ts): iOS's
  // native range only responds to a grab ON THE THUMB, which on the volume rows
  // — value 100, thumb pinned right — left the control dead everywhere else.
  //
  // Found by QUERY, not by a hand-written list. The list was a sixth place to
  // remember when adding a slider, and the one whose omission fails worst: the
  // CSS hides the native input unconditionally, so an un-upgraded row would be
  // invisible AND inert — worse than the "dead but visible" controls
  // dom-wiring.test.ts exists to catch, and invisible to it.
  for (const el of deps.dom.panel.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
    installSlider(el);
  }

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

  // ── Segmented option rows ─────────────────────────────────────────
  // Three of these now (note naming, note speed, judgement strictness) and they
  // were three verbatim copies of the same 20 lines: defs array, an `active`
  // class sweep, a click listener per button that writes the pref → repaints →
  // notifies → persists. The judgement segment shipped DEAD precisely because
  // that wiring is hand-repeated per row; one installer means the next segment
  // is a single call and cannot be half-wired.
  //
  // Returns the repaint so `refresh()` can call it.
  function installSegment<T extends string>(
    buttons: ReadonlyArray<{ el: HTMLElement | null | undefined; mode: T }>,
    getCurrent: () => T,
    set: (mode: T) => void,
    onChange?: () => void
  ): () => void {
    const paint = (): void => {
      const current = getCurrent();
      for (const { el, mode } of buttons) el?.classList.toggle('active', mode === current);
    };
    for (const { el, mode } of buttons) {
      el?.addEventListener('click', () => {
        set(mode);
        paint();
        onChange?.();
        deps.savePrefs();
      });
    }
    return paint;
  }

  // 0.15: note-name notation (auto / C-D-E / ドレミ)
  const refreshNoteNamingSeg = installSegment(
    [
      { el: deps.dom.noteNamingAuto, mode: 'auto' as const },
      { el: deps.dom.noteNamingAbc, mode: 'abc' as const },
      { el: deps.dom.noteNamingSolfege, mode: 'solfege' as const },
    ],
    () => deps.prefs.noteNaming ?? 'auto',
    (mode) => {
      deps.prefs.noteNaming = mode;
    },
    () => deps.onNoteNamingChange?.()
  );

  // ノーツ落下速度（🐢 / ふつう / 🚀）
  const refreshNoteSpeedSeg = installSegment(
    [
      { el: deps.dom.noteSpeedSlow, mode: 'slow' as const },
      { el: deps.dom.noteSpeedNormal, mode: 'normal' as const },
      { el: deps.dom.noteSpeedFast, mode: 'fast' as const },
    ],
    () => deps.prefs.noteSpeed ?? 'normal',
    (mode) => {
      deps.prefs.noteSpeed = mode;
    },
    () => deps.onNoteSpeedChange?.()
  );

  // 音を拾う入力（おまかせ / 🎹 / 🎙️）
  // 「MIDI が繋がっているか」と「MIDI で採点するか」を分離したことで初めて
  // 表現できるようになった選択（@piano/core state/input-source.ts）。
  // 変更は即時反映 — マイクの suspend/resume まで shell がやる。
  const refreshInputSrcSeg = installSegment(
    [
      { el: deps.dom.inputSrcAuto, mode: 'auto' as const },
      { el: deps.dom.inputSrcMidi, mode: 'midi' as const },
      { el: deps.dom.inputSrcMic, mode: 'mic' as const },
    ],
    () => deps.prefs.inputSource ?? 'auto',
    (mode) => {
      deps.prefs.inputSource = mode;
    },
    () => {
      // installSegment has already painted the segment highlight, so the tap
      // reads as instant without a full panel repaint here. The ONE repaint
      // happens after the shell has actually moved the microphone — acquiring
      // one is an async permission prompt, and painting before it settles showed
      // the state the player just switched away from.
      //
      // Promise.resolve, not `?.().then()`: that repaint is what makes the
      // switch look like it worked, so it must still happen if a shell wires a
      // synchronous applier.
      void Promise.resolve(deps.applyInputSourcePref?.()).then(refresh);
    }
  );

  // 判定の厳しさ（🍃 / ふつう / 🎯）
  // 業界標準の「見える難易度」（osu! の OD / StepMania の TimingWindowScale）。
  // 判定窓は入力パスでも自動的に変わるので、これが無いと MIDI 接続で厳しさが
  // 黙って動く。次セクション開始を待たず即反映される（窓は毎イベント解決）。
  const refreshJudgeSeg = installSegment(
    [
      { el: deps.dom.judgeEasy, mode: 'easy' as const },
      { el: deps.dom.judgeNormal, mode: 'normal' as const },
      { el: deps.dom.judgeStrict, mode: 'strict' as const },
    ],
    () => deps.prefs.judgeStrictness ?? 'normal',
    (mode) => {
      deps.prefs.judgeStrictness = mode;
    }
  );

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
      // via CoreMIDI hot-plug → portChange → auto-rescan attach. The shell
      // hook restarts the rescan poller so the pair lands within ~1 s even
      // if the hot-plug notification is missed (plugin's listInputs
      // re-enumerates CoreMIDI on every poll).
      void deps.nativeBleMidi.show();
      deps.onNativePairingShown?.();
      close();
      return;
    }
    // M3: パネルは開いたまま接続を待つ（従来はチューザー表示中に閉じて
    // いた — 成否のフィードバックが届く場所ごと消えていた）。試行中は
    // 入力ピルに「接続中…」を出し、成功したら自動で閉じる。失敗/
    // キャンセルはパネルに戻ってくるので、そのままリトライできる。
    deps.dom.inputStatus.textContent = '🔵 ' + deps.t('bleConnecting');
    void deps.connectBleMidi?.().finally(() => {
      refresh();
      if (deps.midiInput.enabled) close();
    });
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
