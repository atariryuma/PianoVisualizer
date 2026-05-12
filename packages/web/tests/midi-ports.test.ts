// @vitest-environment happy-dom
//
// Tests for packages/web/src/midi-ports.ts.
//
// Covers:
//   • gatherMidiInputs — Map / forEach / plain-object polyfill paths.
//   • createMidiPorts.attach:
//     - skips virtual ports (delegated to isVirtualMidiPort).
//     - flips midiInput.{port, enabled, lastEventTime}.
//     - suspends mic on first attach (when audio + !suspended).
//     - calls port.open() defensively (Web MIDI Browser quirk).
//     - rebinds onmidimessage + drives indicator + stops rescan.
//   • createMidiPorts.detach:
//     - guards on stale port refs (only detaches the bound one).
//     - clears onmidimessage when present, resumes mic, restarts
//       rescan poller when mic-permission flow had been skipped.
//   • createMidiPorts.verifyAlive:
//     - early-returns when not enabled / no port / no access.
//     - early-returns true when bleMidi.connected (visibility-resume
//       must NOT touch BLE sessions).
//     - re-binds onmidimessage on a still-present port.
//     - detaches when the port has vanished from the inputs map.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMidiPorts,
  gatherMidiInputs,
  type MidiPortRef,
  type MidiPortsDeps,
  type MidiPortsInputRef,
} from '../src/midi-ports';

// ─── gatherMidiInputs (pure helper) ────────────────────────────────

describe('gatherMidiInputs', () => {
  it('returns [] for null / undefined access', () => {
    expect(gatherMidiInputs(null)).toEqual([]);
    expect(gatherMidiInputs(undefined)).toEqual([]);
  });

  it('returns [] when access has no inputs property', () => {
    expect(gatherMidiInputs({})).toEqual([]);
  });

  it('iterates a Map (per-spec shape) via .values()', () => {
    const p1: MidiPortRef = { name: 'a', state: 'connected' };
    const p2: MidiPortRef = { name: 'b', state: 'connected' };
    const inputs = new Map<string, MidiPortRef>([
      ['1', p1],
      ['2', p2],
    ]);
    expect(gatherMidiInputs({ inputs })).toEqual([p1, p2]);
  });

  it('iterates a forEach-only shape (older Chromium)', () => {
    const p1: MidiPortRef = { name: 'a' };
    const p2: MidiPortRef = { name: 'b' };
    const inputs = {
      forEach(cb: (p: MidiPortRef) => void): void {
        cb(p1);
        cb(p2);
      },
    };
    expect(gatherMidiInputs({ inputs })).toEqual([p1, p2]);
  });

  it('iterates a plain-object polyfill (Web MIDI Browser shape)', () => {
    const inputs: Record<string, MidiPortRef> = {
      a: { name: 'A', type: 'input' },
      b: { name: 'B', type: 'input' },
    };
    expect(gatherMidiInputs({ inputs })).toEqual([inputs.a, inputs.b]);
  });

  it('plain-object polyfill: includes entries without an explicit type field', () => {
    const inputs: Record<string, MidiPortRef> = {
      a: { name: 'A' },
    };
    expect(gatherMidiInputs({ inputs })).toEqual([inputs.a]);
  });

  it('plain-object polyfill: skips entries with non-input type (output ports)', () => {
    const inputs: Record<string, MidiPortRef> = {
      a: { name: 'A', type: 'input' },
      b: { name: 'B', type: 'output' },
    };
    expect(gatherMidiInputs({ inputs })).toEqual([inputs.a]);
  });

  it('Map shape takes precedence over forEach (.values defined first)', () => {
    const p1: MidiPortRef = { name: 'fromValues' };
    const inputs = {
      values: () => [p1][Symbol.iterator](),
      forEach: () => {
        throw new Error('should not be called');
      },
    };
    expect(gatherMidiInputs({ inputs })).toEqual([p1]);
  });
});

// ─── factory test fixture ──────────────────────────────────────────

interface Mocks {
  hasAudioCtx: ReturnType<typeof vi.fn>;
  suspendMic: ReturnType<typeof vi.fn>;
  resumeMic: ReturnType<typeof vi.fn>;
  onMidiMessageHandler: ReturnType<typeof vi.fn>;
  setInputIndicator: ReturnType<typeof vi.fn>;
  isVirtualMidiPort: ReturnType<typeof vi.fn>;
  refreshIntroHint: ReturnType<typeof vi.fn>;
  showHitChip: ReturnType<typeof vi.fn>;
  startMidiAutoRescan: ReturnType<typeof vi.fn>;
  stopMidiAutoRescan: ReturnType<typeof vi.fn>;
  t: ReturnType<typeof vi.fn>;
}

function makePorts(over: Partial<MidiPortsDeps> = {}, mocks?: Partial<Mocks>) {
  const m: Mocks = {
    hasAudioCtx: vi.fn(() => true),
    suspendMic: vi.fn(),
    resumeMic: vi.fn(),
    onMidiMessageHandler: vi.fn(),
    setInputIndicator: vi.fn(),
    isVirtualMidiPort: vi.fn(() => false),
    refreshIntroHint: vi.fn(),
    showHitChip: vi.fn(),
    startMidiAutoRescan: vi.fn(),
    stopMidiAutoRescan: vi.fn(),
    t: vi.fn((key, vars) => (vars ? `T(${key},${vars.v})` : `T(${key})`)),
    ...mocks,
  };
  const midiInput: MidiPortsInputRef = {
    enabled: false,
    platformBlocked: false,
    port: null,
    lastEventTime: 0,
  };
  const stateRef = {
    micSuspended: false,
    micPermissionFailed: false,
    micIntentionallySkipped: false,
  };
  const bleMidi = { connected: false };

  const deps: MidiPortsDeps = {
    midiInput,
    state: stateRef,
    getBleMidi: () => bleMidi,
    hasAudioCtx: m.hasAudioCtx,
    suspendMic: m.suspendMic,
    resumeMic: m.resumeMic,
    onMidiMessageHandler: m.onMidiMessageHandler,
    setInputIndicator: m.setInputIndicator,
    isVirtualMidiPort: m.isVirtualMidiPort,
    refreshIntroHint: m.refreshIntroHint,
    showHitChip: m.showHitChip,
    micMeter: null,
    startMidiAutoRescan: m.startMidiAutoRescan,
    stopMidiAutoRescan: m.stopMidiAutoRescan,
    t: m.t,
    ...over,
  };
  return { ports: createMidiPorts(deps), mocks: m, deps, midiInput, state: stateRef, bleMidi };
}

beforeEach(() => {
  // Silence the [MIDI] connect/disconnect logs from the production
  // code so test output stays readable.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── attach ────────────────────────────────────────────────────────

describe('attach', () => {
  it('returns true + no-op when port is null (defensive)', () => {
    const { ports, midiInput } = makePorts();
    expect(ports.attach(null)).toBe(true);
    expect(midiInput.port).toBeNull();
  });

  it('returns true + no-op when port is already bound', () => {
    const port: MidiPortRef = { name: 'r', state: 'connected' };
    const { ports, midiInput, mocks } = makePorts();
    midiInput.port = port;
    midiInput.enabled = true;
    expect(ports.attach(port)).toBe(true);
    // Should NOT call any setters again.
    expect(mocks.setInputIndicator).not.toHaveBeenCalled();
  });

  it('returns false on a virtual port (delegated to isVirtualMidiPort)', () => {
    const { ports, mocks, midiInput } = makePorts({}, { isVirtualMidiPort: vi.fn(() => true) });
    const result = ports.attach({ name: 'IAC Driver' });
    expect(result).toBe(false);
    expect(midiInput.enabled).toBe(false);
    expect(mocks.setInputIndicator).not.toHaveBeenCalled();
  });

  it('skips attach when BLE-MIDI is already connected (BLE owns the slot)', () => {
    // A post-BLE-connect Web MIDI rescan must NOT silently overwrite
    // the BlePortMarker — that would orphan the BLE session and
    // leave the indicator in an inconsistent state.
    const { ports, mocks, midiInput, bleMidi } = makePorts();
    bleMidi.connected = true;
    const port: MidiPortRef = { name: 'usb-keyboard', state: 'connected' };
    const result = ports.attach(port);
    expect(result).toBe(false);
    expect(midiInput.port).not.toBe(port);
    expect(mocks.suspendMic).not.toHaveBeenCalled();
    expect(mocks.setInputIndicator).not.toHaveBeenCalled();
  });

  it('flips midiInput state on a fresh port', () => {
    const port: MidiPortRef = { name: 'Roland', state: 'connected' };
    const { ports, midiInput } = makePorts();
    expect(ports.attach(port)).toBe(true);
    expect(midiInput.port).toBe(port);
    expect(midiInput.enabled).toBe(true);
    expect(midiInput.lastEventTime).toBe(0);
  });

  it('binds onmidimessage to the dispatcher entry', () => {
    const port: MidiPortRef = { name: 'Roland', state: 'connected' };
    const { ports, deps } = makePorts();
    ports.attach(port);
    expect(port.onmidimessage).toBe(deps.onMidiMessageHandler);
  });

  it('clears the previous port onmidimessage before binding the new one', () => {
    const oldPort: MidiPortRef = { name: 'Old', onmidimessage: () => {} };
    const newPort: MidiPortRef = { name: 'New', state: 'connected' };
    const { ports, midiInput } = makePorts();
    midiInput.port = oldPort;
    midiInput.enabled = true;
    ports.attach(newPort);
    expect(oldPort.onmidimessage).toBeNull();
  });

  it('suspends mic on first attach (audio context + mic running)', () => {
    const { ports, mocks } = makePorts();
    ports.attach({ name: 'r', state: 'connected' });
    expect(mocks.suspendMic).toHaveBeenCalledOnce();
  });

  it('does NOT suspend mic when audio context absent', () => {
    const { ports, mocks } = makePorts({ hasAudioCtx: () => false });
    ports.attach({ name: 'r', state: 'connected' });
    expect(mocks.suspendMic).not.toHaveBeenCalled();
  });

  it('does NOT suspend mic when already suspended', () => {
    const { ports, mocks, state } = makePorts();
    state.micSuspended = true;
    ports.attach({ name: 'r', state: 'connected' });
    expect(mocks.suspendMic).not.toHaveBeenCalled();
  });

  it('calls port.open() (Web MIDI Browser quirk workaround)', () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const port: MidiPortRef = { name: 'r', state: 'connected', open };
    const { ports } = makePorts();
    ports.attach(port);
    expect(open).toHaveBeenCalledOnce();
  });

  it('swallows port.open() rejection silently', async () => {
    const open = vi.fn().mockRejectedValue(new Error('open denied'));
    const port: MidiPortRef = { name: 'r', state: 'connected', open };
    const { ports } = makePorts();
    expect(() => ports.attach(port)).not.toThrow();
    // Drain microtasks so the .catch lands.
    await Promise.resolve();
  });

  it('swallows synchronous port.open() throw', () => {
    const open = vi.fn(() => {
      throw new Error('boom');
    });
    const port: MidiPortRef = { name: 'r', state: 'connected', open };
    const { ports } = makePorts();
    expect(() => ports.attach(port)).not.toThrow();
  });

  it('calls setInputIndicator + stopMidiAutoRescan on success', () => {
    const { ports, mocks } = makePorts();
    ports.attach({ name: 'r', state: 'connected' });
    expect(mocks.setInputIndicator).toHaveBeenCalledOnce();
    expect(mocks.stopMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('shows the connect chip with the i18n device name', () => {
    const { ports, mocks } = makePorts();
    ports.attach({ name: 'Roland GO:PIANO 88', state: 'connected' });
    expect(mocks.showHitChip).toHaveBeenCalledWith(
      'good',
      'T(midiConnectedFmt,Roland GO:PIANO 88)'
    );
  });

  it('falls back to "MIDI" name when port.name is missing', () => {
    const { ports, mocks } = makePorts();
    ports.attach({ state: 'connected' });
    expect(mocks.t).toHaveBeenCalledWith('midiConnectedFmt', { v: 'MIDI' });
  });
});

// ─── detach ────────────────────────────────────────────────────────

describe('detach', () => {
  it('no-op when port arg does not match the bound port', () => {
    const port: MidiPortRef = { name: 'r' };
    const { ports, mocks, midiInput } = makePorts();
    midiInput.port = port;
    ports.detach({ name: 'other' });
    expect(midiInput.port).toBe(port);
    expect(mocks.setInputIndicator).not.toHaveBeenCalled();
  });

  it('no-op on null port', () => {
    const { ports, mocks } = makePorts();
    ports.detach(null);
    expect(mocks.setInputIndicator).not.toHaveBeenCalled();
  });

  it('clears port + flips enabled false + indicator', () => {
    const port: MidiPortRef = { name: 'r', onmidimessage: () => {} };
    const { ports, midiInput, mocks } = makePorts();
    midiInput.port = port;
    midiInput.enabled = true;
    ports.detach(port);
    expect(midiInput.port).toBeNull();
    expect(midiInput.enabled).toBe(false);
    expect(port.onmidimessage).toBeNull();
    expect(mocks.setInputIndicator).toHaveBeenCalledOnce();
  });

  it('resumes mic when audio is up + mic was suspended', () => {
    const port: MidiPortRef = { name: 'r' };
    const { ports, midiInput, state, mocks } = makePorts();
    midiInput.port = port;
    state.micSuspended = true;
    ports.detach(port);
    expect(mocks.resumeMic).toHaveBeenCalledOnce();
  });

  it('does NOT resume mic when audio is absent', () => {
    const port: MidiPortRef = { name: 'r' };
    const { ports, midiInput, state, mocks } = makePorts({ hasAudioCtx: () => false });
    midiInput.port = port;
    state.micSuspended = true;
    ports.detach(port);
    expect(mocks.resumeMic).not.toHaveBeenCalled();
  });

  it('always restarts auto-rescan on detach (regardless of mic state)', () => {
    // Previous policy only kicked the poller back on when the mic
    // had failed or been skipped; happy-mic detaches relied on the
    // cached MIDIAccess's onstatechange, which is unreliable on
    // Web MIDI Browser / WKWebView. New policy: always poll, the
    // poller self-stops on re-attach.
    const port: MidiPortRef = { name: 'r' };
    const { ports, midiInput, state, mocks } = makePorts();
    midiInput.port = port;
    state.micIntentionallySkipped = true;
    ports.detach(port);
    expect(mocks.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('restarts auto-rescan on detach even when mic is the healthy fallback', () => {
    const port: MidiPortRef = { name: 'r' };
    const { ports, midiInput, mocks } = makePorts();
    midiInput.port = port;
    ports.detach(port);
    expect(mocks.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('handles a BLE marker (port without onmidimessage) gracefully', () => {
    const blePort = { name: 'BLE-MIDI' };
    const { ports, midiInput } = makePorts();
    midiInput.port = blePort;
    expect(() => ports.detach(blePort)).not.toThrow();
    expect(midiInput.port).toBeNull();
  });
});

// ─── verifyAlive ───────────────────────────────────────────────────

describe('verifyAlive', () => {
  it('returns false when midiInput is not enabled', async () => {
    const { ports } = makePorts();
    const access = { inputs: new Map() };
    expect(await ports.verifyAlive(access)).toBe(false);
  });

  it('returns false when no access object', async () => {
    const port: MidiPortRef = { name: 'r' };
    const { ports, midiInput } = makePorts();
    midiInput.port = port;
    midiInput.enabled = true;
    expect(await ports.verifyAlive(null)).toBe(false);
  });

  it('returns true (early) when BLE-MIDI is the active session', async () => {
    const port = { name: 'BLE-MIDI' };
    const { ports, midiInput, bleMidi } = makePorts();
    midiInput.port = port;
    midiInput.enabled = true;
    bleMidi.connected = true;
    expect(await ports.verifyAlive({ inputs: new Map() })).toBe(true);
    // Web MIDI port lookup should NOT have happened.
  });

  it('re-binds onmidimessage on a still-present port', async () => {
    const port: MidiPortRef = { name: 'r', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['1', port]]) };
    const { ports, midiInput, deps } = makePorts();
    midiInput.port = port;
    midiInput.enabled = true;
    expect(await ports.verifyAlive(access)).toBe(true);
    expect(port.onmidimessage).toBe(deps.onMidiMessageHandler);
  });

  it('detaches when the port has vanished from the inputs map', async () => {
    const port: MidiPortRef = { name: 'r', state: 'connected' };
    const otherPort: MidiPortRef = { name: 'other', state: 'connected' };
    const access = { inputs: new Map([['1', otherPort]]) };
    const { ports, midiInput, mocks } = makePorts();
    midiInput.port = port;
    midiInput.enabled = true;
    expect(await ports.verifyAlive(access)).toBe(false);
    expect(midiInput.port).toBeNull();
    expect(midiInput.enabled).toBe(false);
    expect(mocks.setInputIndicator).toHaveBeenCalled();
  });

  it('detaches when the bound port is in the list but disconnected', async () => {
    const port: MidiPortRef = { name: 'r', state: 'disconnected' };
    const access = { inputs: new Map([['1', port]]) };
    const { ports, midiInput } = makePorts();
    midiInput.port = port;
    midiInput.enabled = true;
    expect(await ports.verifyAlive(access)).toBe(false);
    expect(midiInput.port).toBeNull();
  });
});
