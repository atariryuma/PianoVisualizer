// @vitest-environment happy-dom
//
// Tests for packages/web/src/midi-indicator.ts.
//
// Covers:
//   • detectAppleMobile — UA / touch-points matrix.
//   • isVirtualMidiPort — name-blacklist filter.
//   • createMidiIndicator factory:
//     - pulseBadge: only flashes when the badge is .visible, debounced
//       across rapid pulses.
//     - refreshBadge: device name + visibility based on midiInput.enabled.
//     - setInputIndicator: 3-state pill (midi / midi-waiting / mic-only),
//       body class toggled, refreshBadge called along the way.
//     - isAppleMobile: cached at factory time.
//     - isVirtualMidiPort: passes through to the pure helper.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMidiIndicator,
  detectAppleMobile,
  isVirtualMidiPort,
  type MidiIndicatorDeps,
} from '../src/midi-indicator';

// ─── pure helpers ───────────────────────────────────────────────────

describe('detectAppleMobile', () => {
  it('iPhone UA → true', () => {
    expect(detectAppleMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ...')).toBe(
      true
    );
  });

  it('iPad UA → true', () => {
    expect(detectAppleMobile('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) ...')).toBe(true);
  });

  it('iPod UA → true', () => {
    expect(
      detectAppleMobile('Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X) ...')
    ).toBe(true);
  });

  it('iPadOS-as-Macintosh with maxTouchPoints>1 → true', () => {
    expect(detectAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...', 5)).toBe(true);
  });

  it('plain macOS desktop (Macintosh, no touch) → false', () => {
    expect(detectAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...', 0)).toBe(false);
  });

  it('Windows Chrome → false', () => {
    expect(detectAppleMobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0', 0)).toBe(
      false
    );
  });

  it('Android Chrome → false', () => {
    expect(detectAppleMobile('Mozilla/5.0 (Linux; Android 14) Chrome/124.0', 5)).toBe(false);
  });

  it('empty UA → false', () => {
    expect(detectAppleMobile('', 0)).toBe(false);
  });
});

describe('isVirtualMidiPort', () => {
  it('IAC Driver name → true', () => {
    expect(isVirtualMidiPort({ name: 'IAC Driver Bus 1' })).toBe(true);
  });

  it('Midi Through Port-0 → true', () => {
    expect(isVirtualMidiPort({ name: 'Midi Through Port-0' })).toBe(true);
  });

  it('rtpmidi → true', () => {
    expect(isVirtualMidiPort({ name: 'rtpmidi-network' })).toBe(true);
  });

  it('loop in name → true', () => {
    expect(isVirtualMidiPort({ name: 'LoopBe1' })).toBe(true);
  });

  it('empty name / null → true (defensive)', () => {
    expect(isVirtualMidiPort({ name: '' })).toBe(true);
    expect(isVirtualMidiPort({ name: null })).toBe(true);
    expect(isVirtualMidiPort(null)).toBe(true);
  });

  it('real keyboard name → false', () => {
    expect(isVirtualMidiPort({ name: 'Roland GO:PIANO 88' })).toBe(false);
    expect(isVirtualMidiPort({ name: 'CASIO USB-MIDI' })).toBe(false);
  });

  it('case-insensitive name match', () => {
    expect(isVirtualMidiPort({ name: 'IAC DRIVER' })).toBe(true);
    expect(isVirtualMidiPort({ name: 'iac driver' })).toBe(true);
  });
});

// ─── factory ────────────────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

function setupDom(): {
  badge: HTMLElement;
  pill: HTMLElement;
} {
  const badge = document.createElement('div');
  badge.id = 'midiBadge';
  document.body.appendChild(badge);
  const pill = document.createElement('button');
  pill.id = 'ptbInput';
  document.body.appendChild(pill);
  return { badge, pill };
}

function makeDeps(over: Partial<MidiIndicatorDeps> = {}): MidiIndicatorDeps {
  const { badge, pill } = setupDom();
  return {
    midiInput: { enabled: false, platformBlocked: false, port: null },
    dom: { midiBadge: badge, ptbInput: pill },
    t: (key, vars) => {
      if (vars && 'v' in vars) return `T(${key}, ${vars.v})`;
      return `T(${key})`;
    },
    isRescanRunning: () => false,
    hasRequestMIDIAccess: () => true,
    ...over,
  };
}

describe('createMidiIndicator — pulseBadge', () => {
  it('no-op when badge is not .visible', () => {
    const deps = makeDeps();
    const ind = createMidiIndicator(deps);
    ind.pulseBadge();
    expect(deps.dom.midiBadge!.classList.contains('pulse')).toBe(false);
  });

  it('adds .pulse when visible, removes after timer fires', () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    deps.dom.midiBadge!.classList.add('visible');
    const ind = createMidiIndicator(deps);
    ind.pulseBadge();
    expect(deps.dom.midiBadge!.classList.contains('pulse')).toBe(true);
    vi.advanceTimersByTime(140);
    expect(deps.dom.midiBadge!.classList.contains('pulse')).toBe(false);
    vi.useRealTimers();
  });

  it('debounces — second pulse before timer fires resets the clock', () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    deps.dom.midiBadge!.classList.add('visible');
    const ind = createMidiIndicator(deps);
    ind.pulseBadge();
    vi.advanceTimersByTime(100);
    ind.pulseBadge(); // resets debounce
    vi.advanceTimersByTime(100); // 100ms since last pulse, .pulse should still be on
    expect(deps.dom.midiBadge!.classList.contains('pulse')).toBe(true);
    vi.advanceTimersByTime(50); // total 150ms since last pulse → cleared
    expect(deps.dom.midiBadge!.classList.contains('pulse')).toBe(false);
    vi.useRealTimers();
  });

  it('null badge → no throw', () => {
    const deps = makeDeps({ dom: { midiBadge: null, ptbInput: null } });
    const ind = createMidiIndicator(deps);
    expect(() => ind.pulseBadge()).not.toThrow();
  });
});

describe('createMidiIndicator — refreshBadge', () => {
  it('enabled + named port → text + visible class', () => {
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: 'Roland GO:PIANO 88' } },
    });
    const ind = createMidiIndicator(deps);
    ind.refreshBadge();
    expect(deps.dom.midiBadge!.textContent).toBe('🎹 Roland GO:PIANO 88');
    expect(deps.dom.midiBadge!.classList.contains('visible')).toBe(true);
  });

  it('disabled → strips visible + pulse classes', () => {
    const deps = makeDeps();
    deps.dom.midiBadge!.classList.add('visible');
    deps.dom.midiBadge!.classList.add('pulse');
    const ind = createMidiIndicator(deps);
    ind.refreshBadge();
    expect(deps.dom.midiBadge!.classList.contains('visible')).toBe(false);
    expect(deps.dom.midiBadge!.classList.contains('pulse')).toBe(false);
  });

  it('enabled but port has no name → not visible', () => {
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: null } },
    });
    const ind = createMidiIndicator(deps);
    ind.refreshBadge();
    expect(deps.dom.midiBadge!.classList.contains('visible')).toBe(false);
  });

  it('null badge → no throw', () => {
    const deps = makeDeps({ dom: { midiBadge: null, ptbInput: null } });
    const ind = createMidiIndicator(deps);
    expect(() => ind.refreshBadge()).not.toThrow();
  });
});

describe('createMidiIndicator — setInputIndicator', () => {
  it('enabled → 🎹 + .midi class + tooltip with device name', () => {
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: 'Roland GO' } },
    });
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.ptbInput!.textContent).toBe('🎹');
    expect(deps.dom.ptbInput!.classList.contains('midi')).toBe(true);
    expect(deps.dom.ptbInput!.classList.contains('midi-waiting')).toBe(false);
    expect(deps.dom.ptbInput!.title).toContain('Roland GO');
    expect(document.body.classList.contains('midi-on')).toBe(true);
  });

  it('rescan-running + Web MIDI present → 🎹⏳ + .midi-waiting', () => {
    const deps = makeDeps({
      midiInput: { enabled: false, port: null },
      isRescanRunning: () => true,
      hasRequestMIDIAccess: () => true,
    });
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.ptbInput!.textContent).toBe('🎹⏳');
    expect(deps.dom.ptbInput!.classList.contains('midi-waiting')).toBe(true);
    expect(deps.dom.ptbInput!.classList.contains('midi')).toBe(false);
  });

  it('rescan-running but no Web MIDI → falls back to mic-only', () => {
    const deps = makeDeps({
      midiInput: { enabled: false, port: null },
      isRescanRunning: () => true,
      hasRequestMIDIAccess: () => false,
    });
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.ptbInput!.textContent).toBe('🎙️');
  });

  it('rescan-running + Web MIDI present, but practice active → suppress 🎹⏳, show 🎙️', () => {
    // Bug fix 2026-05-09: user-reported screenshot — kid practicing in
    // mic mode saw 🎹⏳ "waiting for MIDI" because the auto-rescan
    // poller was still alive in the background. The pill should
    // collapse to 🎙️ once the user has committed to a practice
    // session — the poller stays alive (still hot-detects mid-session
    // USB MIDI plug) but doesn't get an indicator.
    const deps = makeDeps({
      midiInput: { enabled: false, port: null },
      isRescanRunning: () => true,
      hasRequestMIDIAccess: () => true,
      isPracticeActive: () => true,
    });
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.ptbInput!.textContent).toBe('🎙️');
    expect(deps.dom.ptbInput!.classList.contains('midi-waiting')).toBe(false);
  });

  it('rescan-running + Web MIDI present, practice not active → still show 🎹⏳', () => {
    // Companion test to the practice-active suppression: confirms the
    // "waiting" state still fires on the title / pre-practice screen.
    const deps = makeDeps({
      midiInput: { enabled: false, port: null },
      isRescanRunning: () => true,
      hasRequestMIDIAccess: () => true,
      isPracticeActive: () => false,
    });
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.ptbInput!.textContent).toBe('🎹⏳');
    expect(deps.dom.ptbInput!.classList.contains('midi-waiting')).toBe(true);
  });

  it('mic-only (default) → 🎙️ + tipMicMode tooltip', () => {
    const deps = makeDeps();
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.ptbInput!.textContent).toBe('🎙️');
    expect(deps.dom.ptbInput!.classList.contains('midi')).toBe(false);
    expect(deps.dom.ptbInput!.classList.contains('midi-waiting')).toBe(false);
    expect(deps.dom.ptbInput!.title).toBe('T(tipMicMode)');
  });

  it('platform-blocked mic-only → tipIosMidiBlocked tooltip', () => {
    const deps = makeDeps({
      midiInput: { enabled: false, platformBlocked: true, port: null },
    });
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.ptbInput!.title).toBe('T(tipIosMidiBlocked)');
  });

  it('toggling enabled flips body.midi-on class', () => {
    const deps = makeDeps();
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(document.body.classList.contains('midi-on')).toBe(false);

    deps.midiInput.enabled = true;
    deps.midiInput.port = { name: 'Roland' };
    ind.setInputIndicator();
    expect(document.body.classList.contains('midi-on')).toBe(true);
  });

  it('also refreshes the badge as a side-effect', () => {
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: 'Roland' } },
    });
    const ind = createMidiIndicator(deps);
    ind.setInputIndicator();
    expect(deps.dom.midiBadge!.textContent).toBe('🎹 Roland');
    expect(deps.dom.midiBadge!.classList.contains('visible')).toBe(true);
  });

  it('null pill → still toggles body.midi-on + refreshes badge', () => {
    const deps = makeDeps({
      midiInput: { enabled: true, port: { name: 'X' } },
      dom: { midiBadge: setupDom().badge, ptbInput: null },
    });
    const ind = createMidiIndicator(deps);
    expect(() => ind.setInputIndicator()).not.toThrow();
    expect(document.body.classList.contains('midi-on')).toBe(true);
    expect(deps.dom.midiBadge!.classList.contains('visible')).toBe(true);
  });
});

describe('createMidiIndicator — isAppleMobile + isVirtualMidiPort surface', () => {
  it('exposes the cached UA result', () => {
    const ind = createMidiIndicator(makeDeps());
    // Cached at factory time; just verify it returns a boolean.
    expect(typeof ind.isAppleMobile()).toBe('boolean');
  });

  it('isVirtualMidiPort delegates to the pure helper', () => {
    const ind = createMidiIndicator(makeDeps());
    expect(ind.isVirtualMidiPort({ name: 'IAC Driver' })).toBe(true);
    expect(ind.isVirtualMidiPort({ name: 'Roland GO' })).toBe(false);
  });
});
