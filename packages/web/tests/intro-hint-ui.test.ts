// @vitest-environment happy-dom
//
// Tests for packages/web/src/intro-hint-ui.ts.
//
// Covers:
//   • showHitChip: creates DOM node with class + text, throttled
//     (100 ms default) PER CHANNEL, removes after chipDurationMs,
//     getHeight read fresh each call.
//   • noInputAvailable: true only when micPermissionFailed AND
//     !midiInput.enabled.
//   • refreshIntroHint: toggles .visible based on noInputAvailable,
//     null-DOM safe.
//   • hideIntroHint: removes .visible + clears state.lastIntroDiag.
//   • alertAudioInitError: bilingual t() wrapper, Error vs non-Error
//     paths.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIntroHintUi, type IntroHintUiDeps } from '../src/intro-hint-ui';

// ─── fixture ────────────────────────────────────────────────────────

function makeFixture(over: Partial<IntroHintUiDeps> = {}) {
  document.body.innerHTML = '';
  const introHint = document.createElement('div');
  introHint.id = 'introHint';
  document.body.appendChild(introHint);

  const state = {
    micPermissionFailed: false,
    lastIntroDiag: null as (() => void) | null,
  };
  const midiInput = { enabled: false };
  const alertSpy = vi.fn();
  let t = 1000;
  const deps: IntroHintUiDeps = {
    dom: { introHint },
    state,
    midiInput,
    // 'auto' semantics: the resolved source follows the hardware, which is what
    // every expectation in this file was written against.
    isMidiActive: () => midiInput.enabled,
    t: vi.fn((key, vars) => (vars ? `T(${key},${vars.v})` : `T(${key})`)),
    getHeight: () => 600,
    alert: alertSpy,
    now: () => t,
    ...over,
  };
  return {
    ui: createIntroHintUi(deps),
    deps,
    state,
    midiInput,
    introHint,
    alertSpy,
    advanceClock: (ms: number) => {
      t += ms;
    },
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── showHitChip ────────────────────────────────────────────────────

describe('showHitChip', () => {
  it('creates a chip with the given class + text', () => {
    const fx = makeFixture();
    fx.ui.showHitChip('great', 'GREAT!');
    const chip = document.querySelector('.hit-chip') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.classList.contains('great')).toBe(true);
    expect(chip.textContent).toBe('GREAT!');
  });

  it('positions the chip at left=50%, top derived from getHeight', () => {
    const fx = makeFixture({ getHeight: () => 800 });
    fx.ui.showHitChip('good', 'OK');
    const chip = document.querySelector('.hit-chip') as HTMLElement;
    expect(chip.style.left).toBe('50%');
    // top = 800 * 0.55 - 30 = 410
    expect(chip.style.top).toBe('410px');
  });

  it('reads getHeight fresh each call', () => {
    let h = 600;
    const fx = makeFixture({ getHeight: () => h });
    fx.ui.showHitChip('great', 'a');
    fx.advanceClock(200);
    h = 1000;
    fx.ui.showHitChip('great', 'b');
    const chips = document.querySelectorAll<HTMLElement>('.hit-chip');
    expect(chips[0].style.top).toBe('300px'); // 600*0.55 - 30
    expect(chips[1].style.top).toBe('520px'); // 1000*0.55 - 30
  });

  it('throttles to 100 ms by default', () => {
    const fx = makeFixture();
    fx.ui.showHitChip('great', 'a');
    fx.advanceClock(50);
    fx.ui.showHitChip('great', 'b'); // throttled
    expect(document.querySelectorAll('.hit-chip').length).toBe(1);
    fx.advanceClock(60); // now 110ms total
    fx.ui.showHitChip('great', 'c');
    expect(document.querySelectorAll('.hit-chip').length).toBe(2);
  });

  it('throttles PER CHANNEL — the two per-note feedback channels are independent', () => {
    // Regression guard: with one shared clock, a note-length nudge (release
    // channel, lower band) landing within the throttle window swallowed the
    // next note's timing verdict, so at speed the player saw an arbitrary
    // mix of the two dimensions instead of both.
    const fx = makeFixture();
    fx.ui.showHitChip('short', 'HOLD LONGER', 0, 0, 'release');
    fx.advanceClock(10);
    fx.ui.showHitChip('perfect', 'PERFECT', 0, 0, 'press');
    expect(document.querySelectorAll('.hit-chip').length).toBe(2);
    // Within a channel the throttle still applies.
    fx.advanceClock(10);
    fx.ui.showHitChip('great', 'GREAT', 0, 0, 'press');
    expect(document.querySelectorAll('.hit-chip').length).toBe(2);
  });

  it('honors custom chipThrottleMs', () => {
    const fx = makeFixture({ chipThrottleMs: 50 });
    fx.ui.showHitChip('great', 'a');
    fx.advanceClock(60);
    fx.ui.showHitChip('great', 'b');
    expect(document.querySelectorAll('.hit-chip').length).toBe(2);
  });

  it('removes the chip after chipDurationMs', () => {
    vi.useFakeTimers();
    const fx = makeFixture({ chipDurationMs: 500 });
    fx.ui.showHitChip('great', 'a');
    expect(document.querySelectorAll('.hit-chip').length).toBe(1);
    vi.advanceTimersByTime(499);
    expect(document.querySelectorAll('.hit-chip').length).toBe(1);
    vi.advanceTimersByTime(2);
    expect(document.querySelectorAll('.hit-chip').length).toBe(0);
  });
});

// ─── noInputAvailable ──────────────────────────────────────────────

describe('noInputAvailable', () => {
  it('true when mic failed AND no MIDI', () => {
    const fx = makeFixture();
    fx.state.micPermissionFailed = true;
    fx.midiInput.enabled = false;
    expect(fx.ui.noInputAvailable()).toBe(true);
  });

  it('false when MIDI is enabled (even if mic failed)', () => {
    const fx = makeFixture();
    fx.state.micPermissionFailed = true;
    fx.midiInput.enabled = true;
    expect(fx.ui.noInputAvailable()).toBe(false);
  });

  it('false when mic is healthy', () => {
    const fx = makeFixture();
    fx.midiInput.enabled = false;
    expect(fx.ui.noInputAvailable()).toBe(false);
  });

  it('handles undefined micPermissionFailed', () => {
    const fx = makeFixture();
    delete (fx.state as { micPermissionFailed?: boolean }).micPermissionFailed;
    expect(fx.ui.noInputAvailable()).toBe(false);
  });
});

// ─── refreshIntroHint ──────────────────────────────────────────────

describe('refreshIntroHint', () => {
  it('shows + sets innerHTML when no input', () => {
    const fx = makeFixture();
    fx.state.micPermissionFailed = true;
    fx.ui.refreshIntroHint();
    expect(fx.introHint.classList.contains('visible')).toBe(true);
    expect(fx.introHint.innerHTML).toBe('T(introNeedMidi)');
  });

  it('hides when input is available', () => {
    const fx = makeFixture();
    fx.introHint.classList.add('visible');
    fx.midiInput.enabled = true;
    fx.ui.refreshIntroHint();
    expect(fx.introHint.classList.contains('visible')).toBe(false);
  });

  it('null introHint → no throw', () => {
    const fx = makeFixture({ dom: { introHint: null } });
    expect(() => fx.ui.refreshIntroHint()).not.toThrow();
  });
});

// ─── hideIntroHint ─────────────────────────────────────────────────

describe('hideIntroHint', () => {
  it('removes .visible class', () => {
    const fx = makeFixture();
    fx.introHint.classList.add('visible');
    fx.ui.hideIntroHint();
    expect(fx.introHint.classList.contains('visible')).toBe(false);
  });

  it('clears state.lastIntroDiag', () => {
    const fx = makeFixture();
    fx.state.lastIntroDiag = () => {};
    fx.ui.hideIntroHint();
    expect(fx.state.lastIntroDiag).toBeNull();
  });

  it('null introHint → no throw, still clears diag cache', () => {
    const fx = makeFixture({ dom: { introHint: null } });
    fx.state.lastIntroDiag = () => {};
    expect(() => fx.ui.hideIntroHint()).not.toThrow();
    expect(fx.state.lastIntroDiag).toBeNull();
  });
});

// ─── alertAudioInitError ───────────────────────────────────────────

describe('alertAudioInitError', () => {
  it('Error → alert with t-formatted message', () => {
    const fx = makeFixture();
    fx.ui.alertAudioInitError(new Error('NotAllowed'));
    expect(fx.alertSpy).toHaveBeenCalledWith('T(audioInitFailedFmt,NotAllowed)');
  });

  it('non-Error → coerced to String()', () => {
    const fx = makeFixture();
    fx.ui.alertAudioInitError('boom');
    expect(fx.alertSpy).toHaveBeenCalledWith('T(audioInitFailedFmt,boom)');
  });

  it('falls back to global alert when no override', () => {
    const fx = makeFixture({ alert: undefined });
    const globalAlertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    fx.ui.alertAudioInitError(new Error('x'));
    expect(globalAlertSpy).toHaveBeenCalled();
    globalAlertSpy.mockRestore();
  });
});

// ─── showRunningUI (Phase 0d batch 58) ─────────────────────────────

function makeRunningUiFixture(
  over: Partial<IntroHintUiDeps> = {},
  body: HTMLElement = document.body
) {
  document.body.innerHTML = '';
  document.body.classList.add('title-screen');
  const startScreen = document.createElement('div');
  startScreen.id = 'startScreen';
  startScreen.style.display = 'flex';
  document.body.appendChild(startScreen);
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.display = 'none';
  document.body.appendChild(hud);
  const micMeter = document.createElement('div');
  micMeter.id = 'micMeter';
  document.body.appendChild(micMeter);
  const introHint = document.createElement('div');
  introHint.id = 'introHint';
  document.body.appendChild(introHint);

  const state = {
    micPermissionFailed: false,
    micSuspended: false,
    micIntentionallySkipped: false,
    lastIntroDiag: null as (() => void) | null,
  };
  const midiInput = { enabled: false };
  const practice = { enabled: false };
  const requestWakeLock = vi.fn();
  const startMidiAutoRescan = vi.fn();
  const rescanMidi = vi.fn(async () => true);

  const deps: IntroHintUiDeps = {
    dom: { introHint, startScreen, hud, micMeter },
    state,
    midiInput,
    // 'auto' semantics — the resolved source follows the hardware.
    isMidiActive: () => midiInput.enabled,
    practice,
    t: vi.fn((key) => `T(${key})`),
    getHeight: () => 600,
    body,
    requestWakeLock,
    startMidiAutoRescan,
    rescanMidi,
    ...over,
  };
  return {
    ui: createIntroHintUi(deps),
    deps,
    state,
    midiInput,
    practice,
    startScreen,
    hud,
    micMeter,
    introHint,
    requestWakeLock,
    startMidiAutoRescan,
    rescanMidi,
  };
}

describe('showRunningUI', () => {
  it('hides startScreen + drops .title-screen + reveals HUD', () => {
    const fx = makeRunningUiFixture();
    expect(document.body.classList.contains('title-screen')).toBe(true);
    fx.ui.showRunningUI();
    expect(fx.startScreen.style.display).toBe('none');
    expect(document.body.classList.contains('title-screen')).toBe(false);
    expect(fx.hud.style.display).toBe('block');
  });

  it('always requests wake lock', () => {
    const fx = makeRunningUiFixture();
    fx.ui.showRunningUI();
    expect(fx.requestWakeLock).toHaveBeenCalledOnce();
  });

  it('refreshIntroHint runs only when practice.enabled is false', () => {
    // practice off → refresh runs (paints based on noInputAvailable).
    const fxOff = makeRunningUiFixture();
    fxOff.state.micPermissionFailed = true; // ensures intro shows
    fxOff.ui.showRunningUI();
    expect(fxOff.introHint.classList.contains('visible')).toBe(true);

    // practice on → refresh is skipped, intro stays whatever it was.
    const fxOn = makeRunningUiFixture();
    fxOn.practice.enabled = true;
    fxOn.state.micPermissionFailed = true;
    fxOn.ui.showRunningUI();
    expect(fxOn.introHint.classList.contains('visible')).toBe(false);
  });

  it('mic meter visible only when no MIDI + mic not suspended', () => {
    // baseline: no MIDI, mic alive → visible
    const a = makeRunningUiFixture();
    a.ui.showRunningUI();
    expect(a.micMeter.classList.contains('visible')).toBe(true);

    // MIDI on → hidden
    const b = makeRunningUiFixture();
    b.midiInput.enabled = true;
    b.ui.showRunningUI();
    expect(b.micMeter.classList.contains('visible')).toBe(false);

    // mic suspended → hidden
    const c = makeRunningUiFixture();
    c.state.micSuspended = true;
    c.ui.showRunningUI();
    expect(c.micMeter.classList.contains('visible')).toBe(false);
  });

  it('background rescan kicks ONLY when no MIDI + (mic failed OR intentionally skipped)', () => {
    // No MIDI + mic permission failed → rescan
    const a = makeRunningUiFixture();
    a.state.micPermissionFailed = true;
    a.ui.showRunningUI();
    expect(a.startMidiAutoRescan).toHaveBeenCalledOnce();
    expect(a.rescanMidi).toHaveBeenCalledWith(true);

    // No MIDI + intentional skip (iOS-WMB) → rescan
    const b = makeRunningUiFixture();
    b.state.micIntentionallySkipped = true;
    b.ui.showRunningUI();
    expect(b.startMidiAutoRescan).toHaveBeenCalledOnce();

    // No MIDI + mic alive → no rescan (don't bother the kid)
    const c = makeRunningUiFixture();
    c.ui.showRunningUI();
    expect(c.startMidiAutoRescan).not.toHaveBeenCalled();
    expect(c.rescanMidi).not.toHaveBeenCalled();

    // MIDI on → no rescan
    const d = makeRunningUiFixture();
    d.midiInput.enabled = true;
    d.state.micPermissionFailed = true;
    d.ui.showRunningUI();
    expect(d.startMidiAutoRescan).not.toHaveBeenCalled();
  });

  it('rescan promise rejection is silently swallowed', async () => {
    const fx = makeRunningUiFixture({
      rescanMidi: vi.fn(() => Promise.reject(new Error('boom'))),
    });
    fx.state.micPermissionFailed = true;
    // Must not throw + must not surface a console error to the user.
    expect(() => fx.ui.showRunningUI()).not.toThrow();
    // Drain microtasks so the .catch() callback runs.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('missing optional DOM bag entries → no crash, side-effects skipped', () => {
    const fx = makeRunningUiFixture({
      dom: {
        introHint: document.getElementById('introHint'),
      },
    });
    expect(() => fx.ui.showRunningUI()).not.toThrow();
    // requestWakeLock + (lack of) bg rescan still run / don't run
    // based on flags, even though startScreen/hud/micMeter are absent.
    expect(fx.requestWakeLock).toHaveBeenCalledOnce();
  });

  it('missing requestWakeLock / rescan thunks → no crash', () => {
    const fx = makeRunningUiFixture({
      requestWakeLock: undefined,
      startMidiAutoRescan: undefined,
      rescanMidi: undefined,
    });
    fx.state.micPermissionFailed = true;
    expect(() => fx.ui.showRunningUI()).not.toThrow();
  });
});
