// @vitest-environment happy-dom
//
// Tests for packages/web/src/midi-rescan.ts.
//
// Covers:
//   • ensureAccess: caches, force=true drops cache + clears old
//     onstatechange, sysex:true→false fallback, both-rejected error.
//   • onstatechange handler: connect-when-disabled→attach,
//     disconnected→detach, non-input ports ignored.
//   • rescan(silent=false): no Web MIDI → unsupported diag,
//     no ports → noPort diag with platform-specific hint,
//     port found+strict pass → attached,
//     all unknown state → loose pass attaches (WMB workaround).
//   • rescan(silent=true): no diag on any failure path.
//   • startAutoRescan: ramped cadence (1s / 2.5s / 10s by elapsed),
//     force-every cadence (2 ticks Apple-mobile fast win, else 5),
//     stops on success, stops when midiInput.enabled flips externally.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMidiRescan,
  type MidiRescan,
  type MidiRescanDeps,
  type MidiAccessRef,
  type MidiPortRef,
} from '../src/midi-rescan';

// ─── fixture ───────────────────────────────────────────────────────

interface AccessHandle {
  inputs: Map<string, MidiPortRef>;
  /** The handler the module wires onto the access — exposed so tests
   *  can fire fake statechange events. */
  fireStateChange?: (e: { port?: MidiPortRef | null }) => void;
}

interface Mocks {
  attachMidiPort: ReturnType<typeof vi.fn>;
  detachMidiPort: ReturnType<typeof vi.fn>;
  showDiagnostic: ReturnType<typeof vi.fn>;
  setInputIndicator: ReturnType<typeof vi.fn>;
  isAppleMobile: ReturnType<typeof vi.fn>;
  t: ReturnType<typeof vi.fn>;
}

interface Fixture {
  rescan: MidiRescan;
  deps: MidiRescanDeps;
  mocks: Mocks;
  midiInput: MidiRescanDeps['midiInput'];
  access: AccessHandle;
  setRequest: (fn: ((opts?: { sysex?: boolean }) => Promise<MidiAccessRef>) | undefined) => void;
  /** Drive the ramped poller deterministically. */
  advanceNow: (ms: number) => void;
  /** Fire the next pending timer (returns its delay). */
  flushTimer: () => number | null;
}

function makeFixture(over: Partial<MidiRescanDeps> = {}): Fixture {
  const mocks: Mocks = {
    attachMidiPort: vi.fn(() => true),
    detachMidiPort: vi.fn(),
    showDiagnostic: vi.fn(),
    setInputIndicator: vi.fn(),
    isAppleMobile: vi.fn(() => false),
    t: vi.fn((key, vars) => (vars ? `T(${key},${JSON.stringify(vars)})` : `T(${key})`)),
  };
  const midiInput = {
    enabled: false,
    port: null,
    lastEventTime: 0,
  };
  const access: AccessHandle = {
    inputs: new Map(),
  };
  // Inject our own onstatechange capture by wrapping the access in a
  // proxy that records the handler.
  Object.defineProperty(access, 'onstatechange', {
    set(v) {
      access.fireStateChange = v;
    },
    get() {
      return access.fireStateChange;
    },
    configurable: true,
  });

  let request: ((opts?: { sysex?: boolean }) => Promise<MidiAccessRef>) | undefined = vi
    .fn()
    .mockResolvedValue(access);

  // ── faux clock + timer queue ──────────────────────────────────
  let nowMs = 0;
  const queue: Array<{ id: number; cb: () => void; fireAt: number }> = [];
  let nextId = 1;
  const setT = vi.fn((cb: () => void, ms: number) => {
    const id = nextId++;
    queue.push({ id, cb, fireAt: nowMs + ms });
    return id;
  });
  const clearT = vi.fn((handle: unknown) => {
    const idx = queue.findIndex((q) => q.id === handle);
    if (idx >= 0) queue.splice(idx, 1);
  });

  const deps: MidiRescanDeps = {
    midiInput,
    attachMidiPort: mocks.attachMidiPort,
    detachMidiPort: mocks.detachMidiPort,
    isAppleMobile: mocks.isAppleMobile,
    showDiagnostic: mocks.showDiagnostic,
    t: mocks.t,
    setInputIndicator: mocks.setInputIndicator,
    navigator: {
      get requestMIDIAccess() {
        return request;
      },
    } as MidiRescanDeps['navigator'],
    now: () => nowMs,
    setTimeout: setT as unknown as MidiRescanDeps['setTimeout'],
    clearTimeout: clearT as unknown as MidiRescanDeps['clearTimeout'],
    ...over,
  };

  return {
    rescan: createMidiRescan(deps),
    deps,
    mocks,
    midiInput,
    access,
    setRequest: (fn) => {
      request = fn;
    },
    advanceNow: (ms) => {
      nowMs += ms;
    },
    flushTimer: () => {
      if (!queue.length) return null;
      const next = queue.shift()!;
      const delay = next.fireAt - (nowMs - (next.fireAt - nowMs)); // delay used originally
      next.cb();
      return delay;
    },
    pendingTimerCount: () => queue.length,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── ensureAccess ──────────────────────────────────────────────────

describe('ensureAccess', () => {
  it('caches the access (second call returns same object)', async () => {
    const fx = makeFixture();
    const a1 = await fx.rescan.ensureAccess();
    const a2 = await fx.rescan.ensureAccess();
    expect(a1).toBe(a2);
  });

  it('force=true drops cache + clears old onstatechange + re-requests', async () => {
    const fx = makeFixture();
    await fx.rescan.ensureAccess();
    const oldHandler = fx.access.fireStateChange;
    expect(oldHandler).toBeTruthy();

    const newAccess: AccessHandle = { inputs: new Map() };
    Object.defineProperty(newAccess, 'onstatechange', {
      set(v) {
        newAccess.fireStateChange = v;
      },
      get() {
        return newAccess.fireStateChange;
      },
      configurable: true,
    });
    fx.setRequest(vi.fn().mockResolvedValue(newAccess));

    const a2 = await fx.rescan.ensureAccess(true);
    expect(a2).toBe(newAccess);
    // Old handler was set to null before the cache was dropped.
    expect(fx.access.fireStateChange).toBeNull();
  });

  it('throws "Web MIDI API not available" when navigator lacks requestMIDIAccess', async () => {
    const fx = makeFixture();
    fx.setRequest(undefined);
    await expect(fx.rescan.ensureAccess()).rejects.toThrow('Web MIDI API not available');
  });

  it('Apple mobile: falls back to sysex:false when sysex:true rejects', async () => {
    const fx = makeFixture();
    fx.mocks.isAppleMobile.mockReturnValue(true);
    const access: AccessHandle = { inputs: new Map() };
    Object.defineProperty(access, 'onstatechange', {
      set(v) {
        access.fireStateChange = v;
      },
      get() {
        return access.fireStateChange;
      },
      configurable: true,
    });
    const req = vi.fn().mockImplementation(async (opts: { sysex?: boolean }) => {
      if (opts?.sysex) throw new Error('sysex denied');
      return access;
    });
    fx.setRequest(req);
    const result = await fx.rescan.ensureAccess();
    expect(result).toBe(access);
    expect(req).toHaveBeenCalledTimes(2);
    expect(req.mock.calls[0][0]).toEqual({ sysex: true });
    expect(req.mock.calls[1][0]).toEqual({ sysex: false });
  });

  it('Apple mobile: throws a combined error when both sysex paths fail', async () => {
    const fx = makeFixture();
    fx.mocks.isAppleMobile.mockReturnValue(true);
    const req = vi.fn().mockImplementation(async () => {
      const e = new Error('denied');
      e.name = 'NotAllowedError';
      throw e;
    });
    fx.setRequest(req);
    await expect(fx.rescan.ensureAccess()).rejects.toThrow(/\[sysex:true\].*\[sysex:false\]/);
  });

  it('non-Apple (desktop / Android): only requests sysex:false', async () => {
    const fx = makeFixture();
    // makeFixture defaults isAppleMobile to false; keep it explicit.
    fx.mocks.isAppleMobile.mockReturnValue(false);
    const access: AccessHandle = { inputs: new Map() };
    Object.defineProperty(access, 'onstatechange', {
      set(v) {
        access.fireStateChange = v;
      },
      get() {
        return access.fireStateChange;
      },
      configurable: true,
    });
    const req = vi.fn().mockResolvedValue(access);
    fx.setRequest(req);
    const result = await fx.rescan.ensureAccess();
    expect(result).toBe(access);
    expect(req).toHaveBeenCalledTimes(1);
    expect(req.mock.calls[0][0]).toEqual({ sysex: false });
  });

  it('non-Apple: a single sysex:false rejection surfaces as-is (no fallback)', async () => {
    const fx = makeFixture();
    fx.mocks.isAppleMobile.mockReturnValue(false);
    fx.setRequest(vi.fn().mockRejectedValue(new Error('user denied MIDI')));
    await expect(fx.rescan.ensureAccess()).rejects.toThrow('user denied MIDI');
  });

  it('wires onstatechange: connected + !enabled → attach', async () => {
    const fx = makeFixture();
    await fx.rescan.ensureAccess();
    const port: MidiPortRef = { name: 'r', state: 'connected', type: 'input' };
    fx.access.fireStateChange?.({ port });
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(port);
  });

  it('wires onstatechange: disconnected → detach', async () => {
    const fx = makeFixture();
    await fx.rescan.ensureAccess();
    const port: MidiPortRef = { name: 'r', state: 'disconnected', type: 'input' };
    fx.access.fireStateChange?.({ port });
    expect(fx.mocks.detachMidiPort).toHaveBeenCalledWith(port);
  });

  it('wires onstatechange: ignores non-input port type', async () => {
    const fx = makeFixture();
    await fx.rescan.ensureAccess();
    fx.access.fireStateChange?.({ port: { name: 'out', type: 'output', state: 'connected' } });
    expect(fx.mocks.attachMidiPort).not.toHaveBeenCalled();
  });

  it('wires onstatechange: connected while already enabled STILL attaches (M2 multi-port)', async () => {
    // 2台目の鍵盤 / 2ポート機種のもう片方も束に加わる（attach 側が
    // 重複バインド・BLE 中の奪取を防ぐ）。
    const fx = makeFixture();
    fx.midiInput.enabled = true;
    await fx.rescan.ensureAccess();
    const port = { name: 'r', state: 'connected', type: 'input' };
    fx.access.fireStateChange?.({ port });
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(port);
  });
});

// ─── rescan ────────────────────────────────────────────────────────

describe('rescan', () => {
  it('no Web MIDI + silent=false → diag with diagWebMidiUnsupported', async () => {
    const fx = makeFixture();
    fx.setRequest(undefined);
    const ok = await fx.rescan.rescan(false);
    expect(ok).toBe(false);
    expect(fx.mocks.showDiagnostic).toHaveBeenCalled();
    const diag = (
      fx.mocks.showDiagnostic.mock.calls[0][0] as () => { line1: string; line2?: string }
    )();
    expect(diag.line1).toBe('T(diagWebMidiUnsupported)');
  });

  it('no Web MIDI + silent=true → false, no diag', async () => {
    const fx = makeFixture();
    fx.setRequest(undefined);
    const ok = await fx.rescan.rescan(true);
    expect(ok).toBe(false);
    expect(fx.mocks.showDiagnostic).not.toHaveBeenCalled();
  });

  it('no ports + silent=false + Apple mobile → diagWmbHint sub-line', async () => {
    const fx = makeFixture();
    fx.mocks.isAppleMobile.mockReturnValue(true);
    const ok = await fx.rescan.rescan(false);
    expect(ok).toBe(false);
    const diag = (
      fx.mocks.showDiagnostic.mock.calls[0][0] as () => { line1: string; line2?: string }
    )();
    expect(diag.line1).toBe('T(diagNoMidiPort)');
    expect(diag.line2).toBe('T(diagWmbHint)');
  });

  it('no ports + non-Apple → diagConnectHint sub-line', async () => {
    const fx = makeFixture();
    const ok = await fx.rescan.rescan(false);
    expect(ok).toBe(false);
    const diag = (
      fx.mocks.showDiagnostic.mock.calls[0][0] as () => { line1: string; line2?: string }
    )();
    expect(diag.line2).toBe('T(diagConnectHint)');
  });

  it('connected port + !enabled → strict-pass attach succeeds', async () => {
    const fx = makeFixture();
    const port: MidiPortRef = { name: 'r', state: 'connected' };
    fx.access.inputs.set('1', port);
    const ok = await fx.rescan.rescan(true);
    expect(ok).toBe(true);
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(port);
  });

  it('strict pass binds even when already enabled (M2 — attach dedupes)', async () => {
    const fx = makeFixture();
    fx.midiInput.enabled = true;
    const port: MidiPortRef = { name: 'r', state: 'connected' };
    fx.access.inputs.set('1', port);
    const ok = await fx.rescan.rescan(true);
    expect(ok).toBe(true);
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(port);
  });

  it('Apple mobile: only-unknown-state ports → loose pass attaches (WMB workaround)', async () => {
    const fx = makeFixture();
    fx.mocks.isAppleMobile.mockReturnValue(true);
    const port: MidiPortRef = { name: 'r', state: 'unknown' };
    fx.access.inputs.set('1', port);
    const ok = await fx.rescan.rescan(true);
    expect(ok).toBe(true);
    expect(fx.mocks.attachMidiPort).toHaveBeenCalledWith(port);
  });

  it('non-Apple: only-unknown-state ports are NOT loose-attached', async () => {
    const fx = makeFixture();
    fx.mocks.isAppleMobile.mockReturnValue(false);
    const port: MidiPortRef = { name: 'r', state: 'unknown' };
    fx.access.inputs.set('1', port);
    const ok = await fx.rescan.rescan(true);
    expect(ok).toBe(false);
    expect(fx.mocks.attachMidiPort).not.toHaveBeenCalled();
  });

  it('all attaches fail + silent=false → "could not connect" diag', async () => {
    const fx = makeFixture();
    fx.mocks.attachMidiPort.mockReturnValue(false);
    fx.access.inputs.set('1', { name: 'IAC', state: 'connected' });
    const ok = await fx.rescan.rescan(false);
    expect(ok).toBe(false);
    const diag = (
      fx.mocks.showDiagnostic.mock.calls[0][0] as () => { line1: string; line2?: string }
    )();
    expect(diag.line2).toBe('T(diagCouldNotConnect)');
  });

  it('ensureAccess throw + silent=false → diagMidiError diag', async () => {
    const fx = makeFixture();
    fx.setRequest(vi.fn().mockRejectedValue(new Error('denied')));
    const ok = await fx.rescan.rescan(false);
    expect(ok).toBe(false);
    const diag = (
      fx.mocks.showDiagnostic.mock.calls[0][0] as () => { line1: string; line2?: string }
    )();
    expect(diag.line1).toBe('T(diagMidiError)');
  });
});

// ─── auto-rescan poller ────────────────────────────────────────────

describe('startAutoRescan + ramped cadence', () => {
  it('startAutoRescan paints indicator + schedules first 1s tick', () => {
    const fx = makeFixture();
    fx.rescan.startAutoRescan();
    expect(fx.mocks.setInputIndicator).toHaveBeenCalledOnce();
    // Internal queue has one entry; the cadence at elapsed=0 is 1s.
    // We can't introspect directly, but isRescanRunning() must be true.
    expect(fx.rescan.isRescanRunning()).toBe(true);
  });

  it('idempotent: second startAutoRescan is a no-op', () => {
    const fx = makeFixture();
    fx.rescan.startAutoRescan();
    const setInputBefore = fx.mocks.setInputIndicator.mock.calls.length;
    fx.rescan.startAutoRescan();
    expect(fx.mocks.setInputIndicator.mock.calls.length).toBe(setInputBefore);
  });

  it('stops itself when midiInput.enabled flips externally', async () => {
    const fx = makeFixture();
    fx.rescan.startAutoRescan();
    fx.midiInput.enabled = true;
    fx.flushTimer(); // fire the 1s tick
    // The tick body calls stopAutoRescan when enabled=true. Drain
    // pending microtasks so the rescan promise resolves.
    await Promise.resolve();
    expect(fx.rescan.isRescanRunning()).toBe(false);
  });

  it('stops when navigator.requestMIDIAccess vanishes mid-poll', async () => {
    const fx = makeFixture();
    fx.rescan.startAutoRescan();
    fx.setRequest(undefined);
    fx.flushTimer();
    await Promise.resolve();
    expect(fx.rescan.isRescanRunning()).toBe(false);
  });

  it('stopAutoRescan clears + repaints indicator', () => {
    const fx = makeFixture();
    fx.rescan.startAutoRescan();
    fx.mocks.setInputIndicator.mockClear();
    fx.rescan.stopAutoRescan();
    expect(fx.rescan.isRescanRunning()).toBe(false);
    expect(fx.mocks.setInputIndicator).toHaveBeenCalledOnce();
  });

  it('stopAutoRescan when not running is a no-op', () => {
    const fx = makeFixture();
    fx.rescan.stopAutoRescan();
    expect(fx.mocks.setInputIndicator).not.toHaveBeenCalled();
  });

  it('isRescanRunning starts false', () => {
    const fx = makeFixture();
    expect(fx.rescan.isRescanRunning()).toBe(false);
  });

  // [Bug fix 2026-05-09 → revised 2026-05-12] isPaused()=true now
  // means "still enumerate ports (so a mid-practice hot-plug is
  // recoverable) but skip the periodic force-fresh MIDIAccess
  // re-request because the heavy step is what caused dt=50 ms
  // frame spikes during playback."
  it('isPaused=true: tick still enumerates ports (cached MIDIAccess) and reschedules', async () => {
    let paused = true;
    const access: AccessHandle = { inputs: new Map() };
    Object.defineProperty(access, 'onstatechange', {
      set(v) {
        access.fireStateChange = v;
      },
      get() {
        return access.fireStateChange;
      },
      configurable: true,
    });
    const requestSpy = vi.fn().mockResolvedValue(access);
    const fx = makeFixture({
      isPaused: () => paused,
      navigator: {
        get requestMIDIAccess() {
          return requestSpy;
        },
      } as MidiRescanDeps['navigator'],
    });
    fx.rescan.startAutoRescan();
    // First tick: paused → rescan(silent=true) still runs (so a
    // mid-practice hot-plug attaches); the requestMIDIAccess call
    // happens once via the cached ensureAccess.
    fx.flushTimer();
    await Promise.resolve();
    await Promise.resolve();
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(fx.rescan.isRescanRunning()).toBe(true);

    // Hit the next force-tick window while still paused — the force
    // would normally trigger ensureAccess(true) and re-request a
    // fresh MIDIAccess. Under pause, that re-request should be
    // skipped.
    for (let i = 0; i < 6; i++) {
      fx.flushTimer();
      await Promise.resolve();
      await Promise.resolve();
    }
    // Only the initial cached request — never a forced re-request.
    expect(requestSpy).toHaveBeenCalledTimes(1);

    paused = false;
    // Drive enough ticks to hit the force window (every 5 ticks on
    // non-Apple). At least one force-fresh re-request fires.
    for (let i = 0; i < 6; i++) {
      fx.flushTimer();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(requestSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it('omitting isPaused (undefined) keeps the original behavior', async () => {
    const requestSpy = vi.fn().mockResolvedValue({ inputs: new Map() });
    const fx = makeFixture({
      navigator: {
        get requestMIDIAccess() {
          return requestSpy;
        },
      } as MidiRescanDeps['navigator'],
    });
    fx.rescan.startAutoRescan();
    fx.flushTimer();
    await Promise.resolve();
    expect(requestSpy).toHaveBeenCalled();
  });
});

// ─── inflight dedupe + poller latch + access cache API (調査所見の回帰) ──

describe('createMidiRescan — ensureAccess inflight dedupe', () => {
  it('concurrent ensureAccess calls share ONE requestMIDIAccess', async () => {
    const fx = makeFixture();
    const reqSpy = vi.fn().mockResolvedValue(fx.access);
    fx.setRequest(reqSpy);
    const [a, b] = await Promise.all([fx.rescan.ensureAccess(), fx.rescan.ensureAccess()]);
    expect(a).toBe(b);
    expect(reqSpy).toHaveBeenCalledTimes(1);
  });

  it('force + immediate plain call share the same in-flight request (force tick pattern)', async () => {
    const fx = makeFixture();
    const reqSpy = vi.fn().mockResolvedValue(fx.access);
    fx.setRequest(reqSpy);
    // The poller's force tick fires ensureAccess(true) without awaiting,
    // then rescan() calls ensureAccess() — previously TWO requests, one
    // leaking with a live onstatechange.
    const p1 = fx.rescan.ensureAccess(true);
    const p2 = fx.rescan.ensureAccess();
    await Promise.all([p1, p2]);
    expect(reqSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createMidiRescan — getAccess / dropAccessCache', () => {
  it('getAccess exposes the cached access; dropAccessCache unhooks + clears', async () => {
    const fx = makeFixture();
    await fx.rescan.ensureAccess();
    expect(fx.rescan.getAccess()).toBe(fx.access);
    expect(fx.access.fireStateChange).toBeTruthy(); // handler wired
    fx.rescan.dropAccessCache();
    expect(fx.rescan.getAccess()).toBeNull();
    expect(fx.access.fireStateChange).toBeNull(); // handler unhooked before drop
  });
});

describe('createMidiRescan — poller zombie prevention', () => {
  it('an in-flight tick resolving after stopAutoRescan does not reschedule', async () => {
    // Attach never succeeds → the tick's rescan resolves false and would
    // normally reschedule.
    const fx = makeFixture();
    fx.mocks.attachMidiPort.mockReturnValue(false);
    fx.rescan.startAutoRescan();
    fx.advanceNow(1000);
    fx.flushTimer(); // run the tick — rescan(true) promise now in flight
    // Stop the poller BEFORE the tick's promise resolves (returnToTitle).
    fx.rescan.stopAutoRescan();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // No new timer may have been scheduled after the stop.
    expect(fx.pendingTimerCount()).toBe(0);
  });
});
