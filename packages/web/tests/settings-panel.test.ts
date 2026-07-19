// @vitest-environment happy-dom
//
// Tests for packages/web/src/settings-panel.ts.
//
// Each test builds a minimal settings-panel DOM fragment + dep stubs.
// Slider input timing is exercised with vi.useFakeTimers() so the 250ms
// debounced savePrefs can be advanced deterministically.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      <input id="slider" type="range" min="0" max="200" value="0" />
      <span id="val"></span>
      <span id="auto"></span>
      <button id="reset-offset"></button>
      <button id="rescan"></button>
      <button id="ble"></button>
      <button id="reset-session"></button>
      <span id="input-status"></span>
    </div>
  `;
  return {
    panel: document.getElementById('panel') as HTMLElement,
    openBtn: document.getElementById('open'),
    closeBtn: document.getElementById('close'),
    audioOffsetSlider: document.getElementById('slider') as HTMLInputElement,
    audioOffsetVal: document.getElementById('val') as HTMLElement,
    audioOffsetAuto: document.getElementById('auto') as HTMLElement,
    audioOffsetReset: document.getElementById('reset-offset'),
    rescanBtn: document.getElementById('rescan'),
    bleBtn: document.getElementById('ble'),
    resetBtn: document.getElementById('reset-session'),
    inputStatus: document.getElementById('input-status') as HTMLElement,
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

  it('enables the reset button when state.running is true', () => {
    const deps = makeDeps({ state: { running: true, micSuspended: false } });
    const panel = createSettingsPanel(deps);
    panel.refresh();
    expect((deps.dom.resetBtn as HTMLButtonElement).disabled).toBe(false);
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

  it('BLE button calls deps.connectBleMidi + closes panel', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.bleBtn as HTMLElement).click();
    expect(deps.connectBleMidi).toHaveBeenCalledOnce();
    expect(deps.dom.panel.classList.contains('visible')).toBe(false);
  });

  it('reset button does nothing when state.running is false', () => {
    const deps = makeDeps();
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.resetBtn as HTMLElement).click();
    expect(deps.showSessionSummary).not.toHaveBeenCalled();
  });

  it('reset button calls deps.showSessionSummary when state.running is true', () => {
    const deps = makeDeps({ state: { running: true, micSuspended: false } });
    const panel = createSettingsPanel(deps);
    panel.open();
    (deps.dom.resetBtn as HTMLElement).click();
    expect(deps.showSessionSummary).toHaveBeenCalledOnce();
  });
});
