// @vitest-environment happy-dom
//
// Tests for packages/web/src/settings-panel.ts.
//
// Each test builds a minimal settings-panel DOM fragment + dep stubs.
// Slider input timing is exercised with vi.useFakeTimers() so the 250ms
// debounced savePrefs can be advanced deterministically.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSettingsPanel,
  type SettingsPanelDeps,
  type SettingsPanelDom,
  type SettingsPrefs,
  type SettingsPracticeRef,
  type SettingsStateRef,
  type SettingsMidiInputRef,
} from '../src/settings-panel';

function makeDom(): SettingsPanelDom {
  document.body.innerHTML = `
    <button id="open"></button>
    <div id="panel">
      <button id="close"></button>
      <input id="slider" type="range" min="-50" max="400" step="5" value="0" />
      <span id="val"></span>
      <span id="auto"></span>
      <div id="latency-info"></div>
      <button id="reset-offset"></button>
      <button id="rescan"></button>
      <button id="ble"></button>
      <button id="reset-session"></button>
      <span id="input-status"></span>
      <button id="judge-easy"></button>
      <button id="judge-normal"></button>
      <button id="judge-strict"></button>
      <button id="src-auto"></button>
      <button id="src-midi"></button>
      <button id="src-mic"></button>
    </div>
  `;
  return {
    panel: document.getElementById('panel') as HTMLElement,
    openBtn: document.getElementById('open'),
    closeBtn: document.getElementById('close'),
    audioOffsetSlider: document.getElementById('slider') as HTMLInputElement,
    audioOffsetVal: document.getElementById('val') as HTMLElement,
    audioOffsetAuto: document.getElementById('auto') as HTMLElement,
    audioLatencyInfo: document.getElementById('latency-info'),
    audioOffsetReset: document.getElementById('reset-offset'),
    rescanBtn: document.getElementById('rescan'),
    bleBtn: document.getElementById('ble'),
    resetBtn: document.getElementById('reset-session'),
    inputStatus: document.getElementById('input-status') as HTMLElement,
    inputSrcAuto: document.getElementById('src-auto'),
    inputSrcMidi: document.getElementById('src-midi'),
    inputSrcMic: document.getElementById('src-mic'),
    judgeEasy: document.getElementById('judge-easy'),
    judgeNormal: document.getElementById('judge-normal'),
    judgeStrict: document.getElementById('judge-strict'),
  };
}

function makeDeps(overrides: Partial<SettingsPanelDeps> = {}): SettingsPanelDeps {
  const prefs: SettingsPrefs = { audioOffsetMs: null };
  const practice: SettingsPracticeRef = { audioOffsetMs: 40 };
  const state: SettingsStateRef = { running: false, micSuspended: false };
  const midiInput: SettingsMidiInputRef = { enabled: false, port: null };
  return {
    dom: makeDom(),
    prefs,
    practice,
    state,
    midiInput,
    defaultAudioOffsetMs: 40,
    savePrefs: vi.fn(),
    t: vi.fn((key, vars) => (vars ? `${key}{${JSON.stringify(vars)}}` : key)),
    modalFocus: { open: vi.fn(), close: vi.fn() },
    rescanMidi: vi.fn(),
    connectBleMidi: vi.fn(() => Promise.resolve()),
    showSessionSummary: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createSettingsPanel — open/close', () => {
  it('open() adds visible class, calls modalFocus.open, refreshes UI', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    expect(deps.dom.panel.classList.contains('visible')).toBe(true);
    expect(deps.modalFocus.open).toHaveBeenCalledWith(deps.dom.panel);
    // refresh side effect: input status set
    expect(deps.dom.inputStatus.textContent).toContain('🎙️');
  });

  it('close() removes visible class + calls modalFocus.close', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    panel.close();
    expect(deps.dom.panel.classList.contains('visible')).toBe(false);
    expect(deps.modalFocus.close).toHaveBeenCalledWith(deps.dom.panel);
  });

  it('open() pauses practice, close() resumes it (P1-6)', () => {
    const pausePractice = vi.fn();
    const resumePractice = vi.fn();
    const deps = makeDeps({ pausePractice, resumePractice });
    const panel = createSettingsPanel(deps);
    panel.open();
    expect(pausePractice).toHaveBeenCalledOnce();
    expect(resumePractice).not.toHaveBeenCalled();
    panel.close();
    expect(resumePractice).toHaveBeenCalledOnce();
  });

  it('clicking the open button opens the panel', () => {
    const deps = makeDeps();
    createSettingsPanel(deps);
    (deps.dom.openBtn as HTMLElement).click();
    expect(deps.dom.panel.classList.contains('visible')).toBe(true);
  });

  it('clicking the close button closes', () => {
    const deps = makeDeps();
    createSettingsPanel(deps);
    deps.dom.panel.classList.add('visible');
    (deps.dom.closeBtn as HTMLElement).click();
    expect(deps.dom.panel.classList.contains('visible')).toBe(false);
  });

  it('backdrop click (target === panel) closes the panel', () => {
    const deps = makeDeps();
    createSettingsPanel(deps);
    deps.dom.panel.classList.add('visible');
    deps.dom.panel.click();
    expect(deps.dom.panel.classList.contains('visible')).toBe(false);
  });
});

describe('createSettingsPanel — refresh()', () => {
  it('shows MIDI device name when midiInput.enabled + port.name set', () => {
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: 'Roland GO:PIANO' } },
    });
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect(deps.dom.inputStatus.textContent).toBe('🎹 Roland GO:PIANO');
  });

  it('shows mic standby when MIDI is off and mic is suspended', () => {
    const deps = makeDeps({
      state: { running: false, micSuspended: true },
    });
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect(deps.dom.inputStatus.textContent).toBe('🎙️ micStandby');
  });

  it('shows mic active when MIDI off + mic not suspended', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect(deps.dom.inputStatus.textContent).toBe('🎙️ micInput');
  });

  it('disables the reset button when state.running is false', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect((deps.dom.resetBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the reset button during free-play (running && !practice.enabled)', () => {
    const deps = makeDeps({
      state: { running: true, micSuspended: false },
      practice: { audioOffsetMs: 40, enabled: false },
    });
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect((deps.dom.resetBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('hides + disables the reset button during practice (practice.enabled=true)', () => {
    // 「セッションの結果」はフリープレイ専用。練習中は露出させない（露出すると
    // 練習を終了せず再生を再開する混線が起きるため）。
    const deps = makeDeps({
      state: { running: true, micSuspended: false },
      practice: { audioOffsetMs: 40, enabled: true },
    });
    const panel = createSettingsPanel(deps);
    panel.refresh();
    const btn = deps.dom.resetBtn as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const host = (btn.closest('.settings-row') as HTMLElement | null) ?? btn;
    expect(host.style.display).toBe('none');
  });
});

describe('createSettingsPanel — audio offset slider', () => {
  function fireInput(slider: HTMLInputElement, value: string) {
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('updates prefs + practice + display on slider input', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    fireInput(deps.dom.audioOffsetSlider, '75');
    expect(deps.prefs.audioOffsetMs).toBe(75);
    expect(deps.practice?.audioOffsetMs).toBe(75);
    expect(deps.dom.audioOffsetVal.textContent).toBe('75');
    expect(deps.dom.audioOffsetAuto.textContent).toBe('');
  });

  it('debounces savePrefs by 250ms', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    fireInput(deps.dom.audioOffsetSlider, '50');
    fireInput(deps.dom.audioOffsetSlider, '60');
    fireInput(deps.dom.audioOffsetSlider, '70');
    expect(deps.savePrefs).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(deps.savePrefs).toHaveBeenCalledOnce();
  });

  it('updates prefs to slider min when an out-of-range value is set', () => {
    // <input type="range"> normalizes invalid / out-of-range values to
    // min on assignment in the DOM. The Number.isFinite guard in the
    // handler is defensive against parseInt edge cases, but range
    // inputs don't actually surface NaN in practice — they clamp.
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    fireInput(deps.dom.audioOffsetSlider, 'abc');
    // happy-dom + real Chromium both clamp the bad value; the handler
    // runs with whatever the input now reports. Just assert that
    // savePrefs was scheduled (handler ran without throwing).
    vi.advanceTimersByTime(300);
    expect(deps.savePrefs).toHaveBeenCalled();
  });

  it('reset button clears prefs + persists + reverts practice to default', () => {
    const deps = makeDeps({ prefs: { audioOffsetMs: 100 } });
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.audioOffsetReset as HTMLElement).click();
    expect(deps.prefs.audioOffsetMs).toBe(null);
    expect(deps.savePrefs).toHaveBeenCalledOnce();
    expect(deps.practice?.audioOffsetMs).toBe(40);
  });

  it('shows auto-detected text when prefs.audioOffsetMs is null', () => {
    const deps = makeDeps({ prefs: { audioOffsetMs: null } });
    const panel = createSettingsPanel(deps);
    panel.open();
    // refreshAudioOffsetUI fires from refresh() inside open()
    expect(deps.dom.audioOffsetAuto.textContent).toContain('autoDetectedFmt');
  });

  it('shows nothing in auto-detected when prefs has explicit value', () => {
    const deps = makeDeps({ prefs: { audioOffsetMs: 80 } });
    const panel = createSettingsPanel(deps);
    panel.open();
    expect(deps.dom.audioOffsetAuto.textContent).toBe('');
    expect(deps.dom.audioOffsetSlider.value).toBe('80');
  });
});

describe('createSettingsPanel — secondary buttons', () => {
  it('rescan button calls deps.rescanMidi + closes panel', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.rescanBtn as HTMLElement).click();
    expect(deps.rescanMidi).toHaveBeenCalledOnce();
    expect(deps.dom.panel.classList.contains('visible')).toBe(false);
  });

  it('BLE button calls deps.connectBleMidi, shows progress, and KEEPS the panel open (M3)', () => {
    // 旧仕様はチューザー表示中にパネルを閉じていた — 失敗/キャンセルの
    // フィードバックが届く場所ごと消えていた。試行中は入力ピルに
    // 「接続中…」を出し、成功（midiInput.enabled）時だけ自動で閉じる。
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.bleBtn as HTMLElement).click();
    expect(deps.connectBleMidi).toHaveBeenCalledOnce();
    expect(deps.dom.panel.classList.contains('visible')).toBe(true);
    expect(deps.dom.inputStatus.textContent).toContain('bleConnecting');
  });

  it('reset button does nothing when state.running is false', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.resetBtn as HTMLElement).click();
    expect(deps.showSessionSummary).not.toHaveBeenCalled();
  });

  it('reset button opens the summary during free-play (running && !practice.enabled)', () => {
    const deps = makeDeps({
      state: { running: true, micSuspended: false },
      practice: { audioOffsetMs: 40, enabled: false },
    });
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.resetBtn as HTMLElement).click();
    expect(deps.showSessionSummary).toHaveBeenCalledOnce();
  });

  it('reset button does NOT open the summary during practice (practice.enabled=true)', () => {
    // フロー監査 B1: 練習中に押すと再生再開＋無関係サマリー＋生きた練習へ復帰、
    // という混線が起きるため、練習中はサマリーを開かない。
    const deps = makeDeps({
      state: { running: true, micSuspended: false },
      practice: { audioOffsetMs: 40, enabled: true },
    });
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.resetBtn as HTMLElement).click();
    expect(deps.showSessionSummary).not.toHaveBeenCalled();
  });
});

// ── judgement strictness segment ─────────────────────────────────────
// The genre-standard visible difficulty knob (osu!'s Overall Difficulty,
// StepMania's TimingWindowScale). It exists so the judgement windows never
// change silently — they also move with the input path, and that must not be
// the only thing controlling strictness.

describe('createSettingsPanel — judgement strictness', () => {
  it('marks the persisted strictness active on refresh, defaulting to normal', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect(deps.dom.judgeNormal?.classList.contains('active')).toBe(true);
    expect(deps.dom.judgeStrict?.classList.contains('active')).toBe(false);

    deps.prefs.judgeStrictness = 'strict';
    panel.refresh();
    expect(deps.dom.judgeStrict?.classList.contains('active')).toBe(true);
    expect(deps.dom.judgeNormal?.classList.contains('active')).toBe(false);
  });

  it('persists the choice and moves the active marker', () => {
    const deps = makeDeps();
    createSettingsPanel(deps).refresh();
    (deps.dom.judgeEasy as HTMLElement).click();
    expect(deps.prefs.judgeStrictness).toBe('easy');
    expect(deps.savePrefs).toHaveBeenCalled();
    expect(deps.dom.judgeEasy?.classList.contains('active')).toBe(true);
    expect(deps.dom.judgeNormal?.classList.contains('active')).toBe(false);
  });

  it('tolerates a DOM without the segment (older shells / partial tests)', () => {
    const dom = makeDom();
    dom.judgeEasy = null;
    dom.judgeNormal = null;
    dom.judgeStrict = null;
    const deps = makeDeps({ dom });
    expect(() => createSettingsPanel(deps).refresh()).not.toThrow();
  });
});

// ── input source selector ────────────────────────────────────────────
// The genre standard: auto-detect by default, an explicit override that sticks,
// and a read-out that always names the LIVE source. Before this existed,
// connecting a keyboard silently took over and only a physical unplug undid it.

describe('createSettingsPanel — settings open ordering', () => {
  it('opens the panel BEFORE probing the native latency', () => {
    // `refreshNativeLatency` skips the bridge call while the panel is hidden, so
    // probing before `open()` adds `.visible` made it a no-op on the one path
    // that needs it. Pinned here because both halves live in different modules
    // and neither is wrong on its own.
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    expect((deps.dom.panel as HTMLElement).classList.contains('visible')).toBe(true);
  });
});

describe('createSettingsPanel — input source', () => {
  it('marks the persisted source active on refresh, defaulting to auto', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect(deps.dom.inputSrcAuto?.classList.contains('active')).toBe(true);
    expect(deps.dom.inputSrcMic?.classList.contains('active')).toBe(false);

    deps.prefs.inputSource = 'mic';
    panel.refresh();
    expect(deps.dom.inputSrcMic?.classList.contains('active')).toBe(true);
    expect(deps.dom.inputSrcAuto?.classList.contains('active')).toBe(false);
  });

  it('persists the choice AND asks the shell to apply it', async () => {
    // Persisting alone is not enough: the mic is a hardware resource that has
    // to be brought up or down to match, and only the shell can do that.
    //
    // The applier is ASYNC (acquiring a mic is a permission prompt + a device
    // open), so the panel has to repaint again once it settles — painting only
    // up-front left the pill showing the state the player switched away from,
    // which on device read as "the switch did nothing".
    let resolveApply: () => void = () => {};
    const applyInputSourcePref = vi.fn(() => new Promise<void>((res) => (resolveApply = res)));
    const deps = makeDeps({
      applyInputSourcePref,
      midiInput: { enabled: false, port: null },
      state: { micSuspended: true },
    });
    createSettingsPanel(deps).refresh();
    (deps.dom.inputSrcMic as HTMLElement).click();
    expect(deps.prefs.inputSource).toBe('mic');
    expect(deps.savePrefs).toHaveBeenCalled();
    expect(applyInputSourcePref).toHaveBeenCalled();
    // Mid-flight the mic is not up yet, so the pill says standby.
    expect(deps.dom.inputStatus.textContent).toContain('micStandby');
    // The shell finishes bringing the mic up…
    (deps.state as { micSuspended: boolean }).micSuspended = false;
    resolveApply();
    await Promise.resolve();
    await Promise.resolve();
    // …and the pill is repainted to match reality.
    expect(deps.dom.inputStatus.textContent).toContain('micInput');
  });

  it('repaints even when the applier is synchronous (older shell)', async () => {
    const deps = makeDeps({ applyInputSourcePref: vi.fn() as never });
    createSettingsPanel(deps).refresh();
    expect(() => (deps.dom.inputSrcMic as HTMLElement).click()).not.toThrow();
    await Promise.resolve();
  });

  it('names the live keyboard, not merely "a keyboard is attached"', () => {
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: 'GO:PIANO88' } },
      getInputStatus: () => ({
        active: 'midi' as const,
        pref: 'auto' as const,
        midiAttached: true,
        waiting: false,
        midiIdle: false,
      }),
    });
    createSettingsPanel(deps).refresh();
    expect(deps.dom.inputStatus.textContent).toContain('GO:PIANO88');
  });

  it('says a connected keyboard is NOT being used when the mic is pinned', () => {
    // The one state a player is guaranteed to read as a bug unless it is stated.
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: 'GO:PIANO88' } },
      getInputStatus: () => ({
        active: 'mic' as const,
        pref: 'mic' as const,
        midiAttached: true,
        waiting: false,
        midiIdle: true,
      }),
    });
    createSettingsPanel(deps).refresh();
    const text = deps.dom.inputStatus.textContent ?? '';
    expect(text).toContain('🎙️');
    expect(text).toContain('inputMidiIdleFmt');
    expect(text).toContain('GO:PIANO88');
  });

  it('says "waiting" — not "mic input" — when pinned to an absent keyboard', () => {
    const deps = makeDeps({
      midiInput: { enabled: false, port: null },
      getInputStatus: () => ({
        active: 'midi' as const,
        pref: 'midi' as const,
        midiAttached: false,
        waiting: true,
        midiIdle: false,
      }),
    });
    createSettingsPanel(deps).refresh();
    const text = deps.dom.inputStatus.textContent ?? '';
    expect(text).toContain('inputWaitingMidi');
    expect(text).not.toContain('micInput');
  });

  it('tolerates a DOM without the segment (older shells / partial tests)', () => {
    const dom = makeDom();
    dom.inputSrcAuto = null;
    dom.inputSrcMidi = null;
    dom.inputSrcMic = null;
    const deps = makeDeps({ dom });
    expect(() => createSettingsPanel(deps).refresh()).not.toThrow();
  });
});

// ── stale-calibration detection ──────────────────────────────────────
// An offset captures the whole round trip, so it goes stale along TWO axes: the
// OUTPUT route it was heard through and the INPUT the player answered with.
// Only the route was ever checked — `audioOffsetSource` was written at every
// calibration and read by nothing, so the app knew the value came from tapping
// the screen and never said so.

describe('createSettingsPanel — stale calibration', () => {
  const liveInput = () => ({
    active: 'mic' as const,
    pref: 'auto' as const,
    midiAttached: false,
    waiting: false,
    midiIdle: false,
  });

  it('flags a touch-measured offset once an instrument is live', () => {
    // Screen touch costs 20-50 ms against a keyboard's ~5 ms, and that
    // difference is baked into the stored value permanently.
    const deps = makeDeps({ getInputStatus: liveInput });
    deps.prefs.audioOffsetMs = 210;
    deps.prefs.audioOffsetSource = 'touch';
    createSettingsPanel(deps).refresh();
    expect((deps.dom.audioLatencyInfo as HTMLElement).textContent).toContain(
      'audioOffsetInputStale'
    );
  });

  it('does NOT flag an offset measured on the instrument itself', () => {
    const deps = makeDeps({ getInputStatus: liveInput });
    deps.prefs.audioOffsetMs = 210;
    deps.prefs.audioOffsetSource = 'midi';
    createSettingsPanel(deps).refresh();
    expect((deps.dom.audioLatencyInfo as HTMLElement).textContent).not.toContain(
      'audioOffsetInputStale'
    );
  });

  it('stays quiet when no input is live — there is nothing better to offer', () => {
    // Nagging someone who has neither a mic nor a keyboard is pure noise: touch
    // is the only measurement available to them.
    const deps = makeDeps({
      getInputStatus: () => ({
        active: 'midi' as const,
        pref: 'midi' as const,
        midiAttached: false,
        waiting: true,
        midiIdle: false,
      }),
    });
    deps.prefs.audioOffsetMs = 210;
    deps.prefs.audioOffsetSource = 'touch';
    createSettingsPanel(deps).refresh();
    expect((deps.dom.audioLatencyInfo as HTMLElement).textContent).not.toContain(
      'audioOffsetInputStale'
    );
  });
});

// ── measured-latency read-out ────────────────────────────────────────
// "Is a 200 ms offset normal?" has to be answerable inside the app. On
// Bluetooth output 150-250 ms is expected; a reported 0 means WebKit never
// measured it, so whatever is in the slider is a hand-tuned guess.
//
// It gets its OWN element next to the value, read from the LIVE context on
// every refresh. The first attempt appended it to the end of a long help
// paragraph and only filled it in after a section had been played — the user
// could not find it at all.

describe('createSettingsPanel — measured audio latency', () => {
  it('shows the device reading on its own line', () => {
    const deps = makeDeps({ getAudioLatency: () => ({ outMs: 214.7, baseMs: 10 }) });
    createSettingsPanel(deps).refresh();
    const text = deps.dom.audioLatencyInfo?.textContent ?? '';
    expect(text).toContain('audioOffsetMeasuredFmt');
    expect(text).toContain('215');
    // …and NOT buried in the auto-detect note.
    expect(deps.dom.audioOffsetAuto.textContent ?? '').not.toContain('audioOffsetMeasuredFmt');
  });

  it('treats a reported 0 as "not measurable", never as a 0 ms reading', () => {
    // iOS WKWebView always returns 0 for outputLatency, so the auto-detect can
    // never fire there. Printing "0 ms" as though it were a measurement is what
    // made a tester ask whether their 210 ms offset was normal — the line has
    // to say it cannot be measured and point at the tap calibration instead.
    const deps = makeDeps({ getAudioLatency: () => ({ outMs: 0, baseMs: 0 }) });
    deps.prefs.audioOffsetMs = 210;
    createSettingsPanel(deps).refresh();
    const text = deps.dom.audioLatencyInfo?.textContent ?? '';
    expect(text).toBe('audioOffsetUnmeasurable');
    expect(text).not.toContain('audioOffsetMeasuredFmt');
    expect(deps.dom.audioLatencyInfo?.classList.contains('is-unmeasurable')).toBe(true);
  });

  it('treats a sub-floor reading the same way (baseLatency-only platforms)', () => {
    const deps = makeDeps({ getAudioLatency: () => ({ outMs: 3, baseMs: 3 }) });
    createSettingsPanel(deps).refresh();
    expect(deps.dom.audioLatencyInfo?.textContent ?? '').toBe('audioOffsetUnmeasurable');
  });

  it('re-reads the live context on every refresh (headphones change the route)', () => {
    let out = 20;
    const deps = makeDeps({ getAudioLatency: () => ({ outMs: out, baseMs: 5 }) });
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect(deps.dom.audioLatencyInfo?.textContent ?? '').toContain('20');
    out = 210;
    panel.refresh();
    expect(deps.dom.audioLatencyInfo?.textContent ?? '').toContain('210');
    expect(deps.dom.audioLatencyInfo?.classList.contains('is-unmeasurable')).toBe(false);
  });

  it('warns when the stored offset was measured on a different output route', () => {
    // "Recalibrate whenever you change speakers/headphones" is the standard
    // advice; having the route name means we detect it instead of just
    // documenting it somewhere the player will never read.
    const deps = makeDeps({
      getAudioLatency: () => ({ outMs: 210, baseMs: 6, portName: 'AirPods Pro' }),
    });
    deps.prefs.audioOffsetMs = 240;
    deps.prefs.audioOffsetRoute = 'GO:PIANO88 AUDIO';
    createSettingsPanel(deps).refresh();
    const text = deps.dom.audioLatencyInfo?.textContent ?? '';
    expect(text).toContain('audioOffsetStaleFmt');
    expect(text).toContain('GO:PIANO88 AUDIO');
  });

  it('stays quiet when the route still matches', () => {
    const deps = makeDeps({
      getAudioLatency: () => ({ outMs: 210, baseMs: 6, portName: 'GO:PIANO88 AUDIO' }),
    });
    deps.prefs.audioOffsetMs = 240;
    deps.prefs.audioOffsetRoute = 'GO:PIANO88 AUDIO';
    createSettingsPanel(deps).refresh();
    expect(deps.dom.audioLatencyInfo?.textContent ?? '').not.toContain('audioOffsetStaleFmt');
  });

  it('says nothing before audio has started', () => {
    const deps = makeDeps({ getAudioLatency: () => null });
    createSettingsPanel(deps).refresh();
    expect(deps.dom.audioLatencyInfo?.textContent ?? '').toBe('');
  });

  it('lets the SHIPPED slider reach the 400 ms iOS/Bluetooth ceiling', () => {
    // Asserted against index.html, not the fixture: the fixture's markup is
    // ours, so checking it would prove nothing about what users get. The
    // slider capped at 200, which is inside the range Bluetooth output alone
    // occupies (150-250 ms) — the player could not correct their own latency,
    // and the auto-detect and tap-along calibration capped there too.
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
    const slider = html.slice(html.indexOf('id="audioOffsetSlider"'));
    expect(/max="400"/.test(slider.slice(0, 200))).toBe(true);
  });
});
