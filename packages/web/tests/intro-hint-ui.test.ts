// @vitest-environment happy-dom
//
// Tests for packages/web/src/intro-hint-ui.ts.
//
// Covers:
//   • showHitChip: creates DOM node with class + text, throttled
//     (100 ms default), removes after chipDurationMs, getHeight read
//     fresh each call.
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
