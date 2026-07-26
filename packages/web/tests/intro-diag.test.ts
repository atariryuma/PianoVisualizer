// @vitest-environment happy-dom
// Tests for packages/web/src/intro-diag.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIntroDiag, type IntroDiagStateRef } from '../src/intro-diag';

function makeFixture(
  over: {
    state?: Partial<IntroDiagStateRef>;
    isAppleMobile?: boolean;
    hasMidi?: boolean;
    tFallback?: boolean;
    /** ネイティブ iOS（OS ペアリング画面あり）— 待機ヒントの2行目が変わる。 */
    hasNativePairing?: boolean;
    /** requestMIDIAccess が自前ポリフィル（= 自分たちのネイティブアプリ）。 */
    ownWebMidiPolyfill?: boolean;
    /** prefs.inputSource === 'midi'（キーボード固定）。 */
    midiPinned?: boolean;
  } = {}
) {
  const state: IntroDiagStateRef = {
    lastIntroDiag: null,
    _midiWaitingShown: false,
    ...over.state,
  };
  const introHintEl = document.createElement('div');
  document.body.appendChild(introHintEl);
  const isAppleMobile = vi.fn(() => over.isAppleMobile ?? true);
  const hasRequestMIDIAccess = vi.fn(() => over.hasMidi ?? true);
  // Two t() flavors: returns the upcased key (so tests can detect
  // localization happened), OR returns empty string when tFallback is
  // set (exercises the `||` fallback in showMidiWaitingHint).
  const t = vi.fn((key: string) => (over.tFallback ? '' : key.toUpperCase()));
  const intro = createIntroDiag({
    state,
    introHintEl,
    isAppleMobile,
    hasRequestMIDIAccess,
    hasNativePairing: over.hasNativePairing ? () => true : undefined,
    isOwnWebMidiPolyfill: () => over.ownWebMidiPolyfill ?? false,
    getInputSourcePref: () => (over.midiPinned ? 'midi' : 'auto'),
    t,
  });
  return { state, introHintEl, isAppleMobile, hasRequestMIDIAccess, t, intro };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createIntroDiag — setDiagnostic', () => {
  it('writes line1 + the .visible class', () => {
    const fx = makeFixture();
    fx.intro.setDiagnostic('Hello');
    expect(fx.introHintEl.innerHTML).toBe('Hello');
    expect(fx.introHintEl.classList.contains('visible')).toBe(true);
  });

  it('appends styled subline when line2 is given', () => {
    const fx = makeFixture();
    fx.intro.setDiagnostic('Hello', 'world');
    expect(fx.introHintEl.innerHTML).toContain('Hello');
    expect(fx.introHintEl.innerHTML).toContain('world');
    expect(fx.introHintEl.innerHTML).toContain('font-size:.78rem');
  });

  it('no-ops when introHintEl is null', () => {
    const intro = createIntroDiag({
      state: { lastIntroDiag: null },
      introHintEl: null,
      isAppleMobile: vi.fn(),
      hasRequestMIDIAccess: vi.fn(),
      t: vi.fn(),
    });
    expect(() => intro.setDiagnostic('hi')).not.toThrow();
  });
});

describe('createIntroDiag — showDiag', () => {
  it('caches the thunk on state and runs it once', () => {
    const fx = makeFixture();
    const thunk = vi.fn();
    fx.intro.showDiag(thunk);
    expect(thunk).toHaveBeenCalledTimes(1);
    expect(fx.state.lastIntroDiag).toBe(thunk);
  });

  it('repeated showDiag swaps the cached thunk', () => {
    const fx = makeFixture();
    const t1 = vi.fn();
    const t2 = vi.fn();
    fx.intro.showDiag(t1);
    fx.intro.showDiag(t2);
    expect(fx.state.lastIntroDiag).toBe(t2);
    expect(t1).toHaveBeenCalledTimes(1);
    expect(t2).toHaveBeenCalledTimes(1);
  });
});

describe('createIntroDiag — clearCache', () => {
  it('drops state.lastIntroDiag back to null', () => {
    const fx = makeFixture();
    fx.intro.showDiag(vi.fn());
    fx.intro.clearCache();
    expect(fx.state.lastIntroDiag).toBe(null);
  });
});

describe('createIntroDiag — showMidiWaitingHint', () => {
  it('skips on OUR OWN native build — the mic is a working input', () => {
    // What the user actually saw on device: free play opened with
    // "🎹 MIDI待機中… tap ⚙ then 🔵" while the microphone was live and the
    // settings panel said mic. The gate is `isAppleMobile && requestMIDIAccess
    // exists`, and on the native build that function exists because WE install
    // it — so our own app was treated like Web MIDI Browser, where the mic
    // genuinely is unavailable.
    const fx = makeFixture({ ownWebMidiPolyfill: true });
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.classList.contains('visible')).toBe(false);
    expect(fx.state.lastIntroDiag).toBe(null);
  });

  it('DOES show on our own build when the player pinned the keyboard', () => {
    // Then nothing else is listening, so "waiting for a keyboard" is the truth.
    const fx = makeFixture({ ownWebMidiPolyfill: true, midiPinned: true });
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.classList.contains('visible')).toBe(true);
  });

  it('still shows in a FOREIGN iOS wrapper (the hint keeps its purpose)', () => {
    // Web MIDI Browser: no mic at all, so a keyboard really is the only way in.
    const fx = makeFixture({ ownWebMidiPolyfill: false });
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.classList.contains('visible')).toBe(true);
  });

  it('skips when not Apple-mobile', () => {
    const fx = makeFixture({ isAppleMobile: false });
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.classList.contains('visible')).toBe(false);
    expect(fx.state.lastIntroDiag).toBe(null);
  });

  it('skips when navigator.requestMIDIAccess is missing', () => {
    const fx = makeFixture({ hasMidi: false });
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.classList.contains('visible')).toBe(false);
  });

  it('fires once and sets _midiWaitingShown', () => {
    const fx = makeFixture();
    fx.intro.showMidiWaitingHint();
    expect(fx.state._midiWaitingShown).toBe(true);
    expect(fx.introHintEl.classList.contains('visible')).toBe(true);
    expect(fx.state.lastIntroDiag).not.toBe(null); // cached for langchange
  });

  it('subsequent calls are silently suppressed (once-per-session)', () => {
    const fx = makeFixture();
    fx.intro.showMidiWaitingHint();
    fx.introHintEl.innerHTML = ''; // pretend something cleared the hint
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.innerHTML).toBe(''); // not re-rendered
  });

  it('writes localized strings via t() when keys resolve', () => {
    const fx = makeFixture();
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.innerHTML).toContain('DIAGMIDIWAITING'); // upcased
    expect(fx.introHintEl.innerHTML).toContain('DIAGWMBHINT');
  });

  it('native iOS: line2 is the in-app procedure (⚙ → 🔵), not the WMB text', () => {
    const fx = makeFixture({ hasNativePairing: true });
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.innerHTML).toContain('DIAGNATIVEBLEHINT');
    expect(fx.introHintEl.innerHTML).not.toContain('DIAGWMBHINT');
  });

  it('falls back to plain English when t() returns empty', () => {
    const fx = makeFixture({ tFallback: true });
    fx.intro.showMidiWaitingHint();
    expect(fx.introHintEl.innerHTML).toContain('Waiting for MIDI');
    expect(fx.introHintEl.innerHTML).toContain('Web MIDI Browser');
  });

  it('cached thunk re-runs setDiagnostic with current strings on replay', () => {
    const fx = makeFixture();
    fx.intro.showMidiWaitingHint();
    fx.introHintEl.innerHTML = ''; // simulate a langchange clearing it before rerun
    // Replay the cached thunk (mimics the langchange listener path).
    fx.state.lastIntroDiag?.();
    expect(fx.introHintEl.innerHTML).toContain('DIAGMIDIWAITING');
  });
});
