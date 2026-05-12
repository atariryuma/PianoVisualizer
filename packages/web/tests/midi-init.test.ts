// @vitest-environment happy-dom
//
// Tests for packages/web/src/midi-init.ts.
//
// Covers:
//   • Idempotency (second call while _accessRequested is true → no-op).
//   • No requestMIDIAccess + Apple-mobile → platformBlocked=true,
//     setInputIndicator called, no auto-rescan.
//   • No requestMIDIAccess + non-Apple → log + setInputIndicator,
//     no auto-rescan.
//   • Spec-strict pass attaches first connected port.
//   • Strict-pass skip → quirk pass attaches non-connected port.
//   • Zero ports → showMidiWaitingHint + startMidiAutoRescan.
//   • ensureMidiAccess throws → showMidiWaitingHint +
//     startMidiAutoRescan.
//   • attachMidiPort returning false on the only candidate falls
//     through to the "nothing attached → start poller" branch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMidiInit, type MidiInitDeps } from '../src/midi-init';
import type { MidiAccessRef, MidiPortRef } from '../src/midi-ports';

interface Mocks {
  isAppleMobile: ReturnType<typeof vi.fn>;
  setInputIndicator: ReturnType<typeof vi.fn>;
  ensureMidiAccess: ReturnType<typeof vi.fn>;
  gatherMidiInputs: ReturnType<typeof vi.fn>;
  attachMidiPort: ReturnType<typeof vi.fn>;
  showMidiWaitingHint: ReturnType<typeof vi.fn>;
  startMidiAutoRescan: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

interface Fixture {
  midiInput: { _accessRequested: boolean; platformBlocked: boolean };
  mocks: Mocks;
  init: ReturnType<typeof createMidiInit>;
}

function makeFixture(over: Partial<MidiInitDeps> = {}): Fixture {
  const access: MidiAccessRef = { inputs: new Map() };
  const mocks: Mocks = {
    isAppleMobile: vi.fn(() => false),
    setInputIndicator: vi.fn(),
    ensureMidiAccess: vi.fn(async () => access),
    gatherMidiInputs: vi.fn(() => [] as MidiPortRef[]),
    attachMidiPort: vi.fn(() => true),
    showMidiWaitingHint: vi.fn(),
    startMidiAutoRescan: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const midiInput = { _accessRequested: false, platformBlocked: false };
  const deps: MidiInitDeps = {
    midiInput,
    navigator: {
      requestMIDIAccess: () => Promise.resolve(access),
    },
    isAppleMobile: mocks.isAppleMobile,
    setInputIndicator: mocks.setInputIndicator,
    ensureMidiAccess: mocks.ensureMidiAccess,
    gatherMidiInputs: mocks.gatherMidiInputs,
    attachMidiPort: mocks.attachMidiPort,
    showMidiWaitingHint: mocks.showMidiWaitingHint,
    startMidiAutoRescan: mocks.startMidiAutoRescan,
    log: mocks.log,
    warn: mocks.warn,
    ...over,
  };
  return { midiInput, mocks, init: createMidiInit(deps) };
}

beforeEach(() => {
  // Per-test: leave the mocks alone, but make sure no stray
  // console.log spies leak across describe blocks.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initWebMIDI — idempotency', () => {
  it('flips _accessRequested on first call', async () => {
    const fx = makeFixture();
    expect(fx.midiInput._accessRequested).toBe(false);
    await fx.init.initWebMIDI();
    expect(fx.midiInput._accessRequested).toBe(true);
  });

  it('second call (while _accessRequested is true) is a no-op', async () => {
    const fx = makeFixture();
    await fx.init.initWebMIDI();
    fx.mocks.ensureMidiAccess.mockClear();
    await fx.init.initWebMIDI();
    expect(fx.mocks.ensureMidiAccess).not.toHaveBeenCalled();
  });
});

describe('initWebMIDI — Web MIDI not available', () => {
  it('Apple-mobile path: platformBlocked=true + setInputIndicator + log, no rescan', async () => {
    const fx = makeFixture({
      navigator: {} /* no requestMIDIAccess */,
      isAppleMobile: () => true,
    });
    await fx.init.initWebMIDI();
    expect(fx.midiInput.platformBlocked).toBe(true);
    expect(fx.mocks.setInputIndicator).toHaveBeenCalledOnce();
    expect(fx.mocks.startMidiAutoRescan).not.toHaveBeenCalled();
    expect(fx.mocks.log.mock.calls.some((c) => /iOS\/iPadOS detected/.test(c[0]))).toBe(true);
  });

  it('non-Apple path: log + setInputIndicator, platformBlocked stays false', async () => {
    const fx = makeFixture({ navigator: {}, isAppleMobile: () => false });
    await fx.init.initWebMIDI();
    expect(fx.midiInput.platformBlocked).toBe(false);
    expect(fx.mocks.setInputIndicator).toHaveBeenCalledOnce();
    expect(fx.mocks.startMidiAutoRescan).not.toHaveBeenCalled();
    expect(fx.mocks.log.mock.calls.some((c) => /Web MIDI API not available/.test(c[0]))).toBe(true);
  });
});

describe('initWebMIDI — strict-pass attach', () => {
  it('first connected port wins', async () => {
    const ports: MidiPortRef[] = [
      { name: 'A', state: 'connected' },
      { name: 'B', state: 'connected' },
    ];
    const fx = makeFixture({ gatherMidiInputs: vi.fn(() => ports) });
    await fx.init.initWebMIDI();
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledTimes(1);
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(ports[0]);
    // No need for the rescan poller when something attached.
    expect(fx.mocks.startMidiAutoRescan).not.toHaveBeenCalled();
    expect(fx.mocks.showMidiWaitingHint).not.toHaveBeenCalled();
  });

  it('skips disconnected ports in strict pass', async () => {
    const ports: MidiPortRef[] = [
      { name: 'pending', state: 'disconnected' },
      { name: 'live', state: 'connected' },
    ];
    const fx = makeFixture({ gatherMidiInputs: vi.fn(() => ports) });
    await fx.init.initWebMIDI();
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledTimes(1);
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(ports[1]);
  });
});

describe('initWebMIDI — quirk-pass attach (WMB, Apple mobile only)', () => {
  it('Apple mobile: attaches a non-connected port when strict pass found nothing', async () => {
    const ports: MidiPortRef[] = [{ name: 'wmbPaired', state: 'unknown' }];
    const fx = makeFixture({
      gatherMidiInputs: vi.fn(() => ports),
      isAppleMobile: () => true,
    });
    await fx.init.initWebMIDI();
    // attachMidiPort called once during the quirk pass (strict skipped
    // because state !== 'connected').
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledTimes(1);
    expect(fx.mocks.startMidiAutoRescan).not.toHaveBeenCalled();
    expect(fx.mocks.log.mock.calls.some((c) => /WMB quirk/.test(c[0]))).toBe(true);
  });

  it('Apple mobile: falls through when attachMidiPort returns false on every quirk port', async () => {
    const ports: MidiPortRef[] = [
      { name: 'rejected', state: 'unknown' },
      { name: 'rejected2', state: 'unknown' },
    ];
    const fx = makeFixture({
      gatherMidiInputs: vi.fn(() => ports),
      attachMidiPort: vi.fn(() => false),
      isAppleMobile: () => true,
    });
    await fx.init.initWebMIDI();
    expect(fx.mocks.startMidiAutoRescan).toHaveBeenCalledOnce();
    expect(fx.mocks.showMidiWaitingHint).toHaveBeenCalledOnce();
  });

  it('non-Apple (desktop / Android): unknown-state ports are NOT loose-attached — falls through to poller', async () => {
    const ports: MidiPortRef[] = [{ name: 'transientPort', state: 'unknown' }];
    const fx = makeFixture({
      gatherMidiInputs: vi.fn(() => ports),
      isAppleMobile: () => false,
    });
    await fx.init.initWebMIDI();
    // Spec-strict pass skips state!=='connected', and the quirk pass
    // is gated to Apple mobile → no attach attempt at all.
    expect(fx.mocks.attachMidiPort).not.toHaveBeenCalled();
    expect(fx.mocks.startMidiAutoRescan).toHaveBeenCalledOnce();
    expect(fx.mocks.showMidiWaitingHint).toHaveBeenCalledOnce();
  });
});

describe('initWebMIDI — empty / failure paths', () => {
  it('zero ports → showMidiWaitingHint + startMidiAutoRescan', async () => {
    const fx = makeFixture({ gatherMidiInputs: vi.fn(() => []) });
    await fx.init.initWebMIDI();
    expect(fx.mocks.attachMidiPort).not.toHaveBeenCalled();
    expect(fx.mocks.showMidiWaitingHint).toHaveBeenCalledOnce();
    expect(fx.mocks.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('ensureMidiAccess rejection → warn + showMidiWaitingHint + startMidiAutoRescan', async () => {
    const fx = makeFixture({
      ensureMidiAccess: vi.fn().mockRejectedValue(new Error('user denied')),
    });
    await fx.init.initWebMIDI();
    expect(fx.mocks.warn).toHaveBeenCalledOnce();
    expect(fx.mocks.warn.mock.calls[0][0]).toMatch(/user denied/);
    expect(fx.mocks.showMidiWaitingHint).toHaveBeenCalledOnce();
    expect(fx.mocks.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('strict pass attaches but quirk pass not run', async () => {
    const ports: MidiPortRef[] = [
      { name: 'live', state: 'connected' },
      { name: 'fallback', state: 'unknown' },
    ];
    const fx = makeFixture({ gatherMidiInputs: vi.fn(() => ports) });
    await fx.init.initWebMIDI();
    // attachMidiPort called exactly once on the connected port.
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledTimes(1);
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(ports[0]);
  });
});

describe('initWebMIDI — diagnostics logging', () => {
  it('logs each port name + manufacturer + state', async () => {
    const ports: MidiPortRef[] = [
      { name: 'GO:PIANO88', manufacturer: 'Roland', state: 'connected' },
    ];
    const fx = makeFixture({ gatherMidiInputs: vi.fn(() => ports) });
    await fx.init.initWebMIDI();
    expect(fx.mocks.log.mock.calls.some((c) => /available input ports: 1/.test(c[0]))).toBe(true);
    expect(fx.mocks.log.mock.calls.some((c) => /GO:PIANO88.*Roland.*connected/.test(c[0]))).toBe(
      true
    );
  });

  it('logs port count = 0 when ports list is empty', async () => {
    const fx = makeFixture({ gatherMidiInputs: vi.fn(() => []) });
    await fx.init.initWebMIDI();
    expect(fx.mocks.log.mock.calls.some((c) => /available input ports: 0/.test(c[0]))).toBe(true);
  });

  it('falls back to console when no log/warn deps provided', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fx = makeFixture({ log: undefined, warn: undefined });
    await fx.init.initWebMIDI();
    expect(consoleLog).toHaveBeenCalled();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
  });
});
