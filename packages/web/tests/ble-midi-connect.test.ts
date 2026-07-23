// @vitest-environment happy-dom
//
// Tests for packages/web/src/ble-midi-connect.ts.
//
// Covers:
//   • Web Bluetooth absent → alerts unsupported message + no-op.
//   • bleMidi.connected already true → idempotent no-op.
//   • Happy path: requestDevice → gatt.connect → getPrimaryService →
//     getCharacteristic → startNotifications → addEventListener.
//     Asserts midiInput.enabled flips, mic suspends, indicator
//     refreshes, hit-chip fires, GATT disconnect handler is wired.
//   • Packet bridge: characteristic value-changed event → parsePacket
//     receives the .value.buffer.
//   • GATT disconnect handler: flips midiInput off, resumes mic,
//     clears the device's listener, nulls the disconnect handler.
//   • Failure paths: NotFoundError (user-cancel) → no alert.
//     Other error mid-handshake → alerts + closes the open GATT.
//     No-GATT device → throws "BLE device exposes no GATT server".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBleMidiConnect,
  BLE_MIDI_SERVICE,
  BLE_MIDI_CHAR,
  type BleMidiConnectDeps,
  type BleDevice,
  type BleGattServer,
  type BleService,
  type BleCharacteristic,
} from '../src/ble-midi-connect';

// ─── helpers ────────────────────────────────────────────────────────

interface FakeChar extends BleCharacteristic {
  fireValueChanged(buf: ArrayBuffer): void;
}

function makeFakeChar(): FakeChar {
  let listener: ((e: Event) => void) | null = null;
  return {
    startNotifications: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((_: 'characteristicvaluechanged', l: (e: Event) => void) => {
      listener = l;
    }),
    fireValueChanged(buf) {
      const e = { target: { value: { buffer: buf } } } as unknown as Event;
      listener?.(e);
    },
  };
}

function makeFakeDevice(
  opts: {
    hasGatt?: boolean;
    gattConnected?: boolean;
    serverThrows?: 'connect' | 'service' | 'char' | 'notify' | null;
  } = {}
): {
  device: BleDevice;
  char: FakeChar;
  disconnectListeners: Array<() => void>;
  gattDisconnect: ReturnType<typeof vi.fn>;
} {
  const char = makeFakeChar();
  const disconnectListeners: Array<() => void> = [];
  const gattDisconnect = vi.fn();
  let server: (BleGattServer & { connect(): Promise<BleGattServer> }) | null = null;
  if (opts.hasGatt !== false) {
    const service: BleService = {
      getCharacteristic: vi.fn().mockImplementation(async (uuid: string) => {
        if (opts.serverThrows === 'char') throw new Error('char fail');
        expect(uuid).toBe(BLE_MIDI_CHAR);
        return char;
      }),
    };
    const baseServer: BleGattServer = {
      connected: opts.gattConnected ?? true,
      disconnect: gattDisconnect,
      getPrimaryService: vi.fn().mockImplementation(async (uuid: string) => {
        if (opts.serverThrows === 'service') throw new Error('service fail');
        expect(uuid).toBe(BLE_MIDI_SERVICE);
        return service;
      }),
    };
    server = {
      ...baseServer,
      connect: vi.fn().mockImplementation(async () => {
        if (opts.serverThrows === 'connect') throw new Error('connect fail');
        return baseServer;
      }),
    };
    if (opts.serverThrows === 'notify') {
      char.startNotifications = vi.fn().mockRejectedValue(new Error('notify fail'));
    }
  }
  const device: BleDevice = {
    name: 'Roland GO',
    gatt: server ?? undefined,
    addEventListener: vi.fn((_: 'gattserverdisconnected', cb: () => void) => {
      disconnectListeners.push(cb);
    }),
    removeEventListener: vi.fn((_: 'gattserverdisconnected', cb: () => void) => {
      const idx = disconnectListeners.indexOf(cb);
      if (idx >= 0) disconnectListeners.splice(idx, 1);
    }),
  };
  return { device, char, disconnectListeners, gattDisconnect };
}

interface Fixture {
  deps: BleMidiConnectDeps;
  alert: ReturnType<typeof vi.fn>;
  parsePacket: ReturnType<typeof vi.fn>;
  setInputIndicator: ReturnType<typeof vi.fn>;
  showHitChip: ReturnType<typeof vi.fn>;
  refreshIntroHint: ReturnType<typeof vi.fn>;
  suspendMic: ReturnType<typeof vi.fn>;
  resumeMic: ReturnType<typeof vi.fn>;
  startMidiAutoRescan: ReturnType<typeof vi.fn>;
  bleMidi: BleMidiConnectDeps['bleMidi'];
  midiInput: BleMidiConnectDeps['midiInput'];
  state: BleMidiConnectDeps['state'];
  setRequestDevice: (fn: ((opts?: unknown) => Promise<BleDevice>) | undefined) => void;
}

function makeFixture(over: Partial<BleMidiConnectDeps> = {}): Fixture {
  const alert = vi.fn();
  const parsePacket = vi.fn();
  const setInputIndicator = vi.fn();
  const showHitChip = vi.fn();
  const refreshIntroHint = vi.fn();
  const suspendMic = vi.fn();
  const resumeMic = vi.fn();
  const startMidiAutoRescan = vi.fn();
  const bleMidi: BleMidiConnectDeps['bleMidi'] = {
    device: null,
    characteristic: null,
    connected: false,
  };
  const midiInput: BleMidiConnectDeps['midiInput'] = {
    enabled: false,
    port: null,
    lastEventTime: 0,
  };
  const state = { micSuspended: false };
  let requestDevice: ((opts?: unknown) => Promise<BleDevice>) | undefined;

  const deps: BleMidiConnectDeps = {
    bleMidi,
    midiInput,
    hasAudioCtx: () => true,
    state,
    suspendMic,
    resumeMic,
    setInputIndicator,
    refreshIntroHint,
    showHitChip,
    micMeter: null,
    parsePacket,
    startMidiAutoRescan,
    t: vi.fn((key, vars) => (vars ? `T(${key},${vars.v})` : `T(${key})`)),
    alert,
    navigator: {
      get bluetooth() {
        return requestDevice
          ? ({ requestDevice } as unknown as BleMidiConnectDeps['navigator']['bluetooth'])
          : undefined;
      },
    } as BleMidiConnectDeps['navigator'],
    // M3: 既定はタイマー無効化 — withTimeout は発火せず、GATT 切断後の
    // auto-reconnect もスケジュールされない（リアルタイマーがテスト境界を
    // 跨いで再接続を走らせる汚染を防ぐ）。再接続系のテストは自前の
    // setTimeout シムで上書きする。
    setTimeout: vi.fn(() => 0),
    clearTimeout: vi.fn(),
    ...over,
  };

  return {
    deps,
    alert,
    parsePacket,
    setInputIndicator,
    showHitChip,
    refreshIntroHint,
    suspendMic,
    resumeMic,
    startMidiAutoRescan,
    bleMidi,
    midiInput,
    state,
    setRequestDevice: (fn) => {
      requestDevice = fn;
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── early-exit guards ─────────────────────────────────────────────

describe('connect — early-exit guards', () => {
  it('alerts unsupported when navigator.bluetooth is missing', async () => {
    const fx = makeFixture();
    // requestDevice never set → bluetooth is undefined.
    const c = createBleMidiConnect(fx.deps);
    await c.connect();
    expect(fx.alert).toHaveBeenCalledWith('T(alertWebBluetoothUnsupported)');
    expect(fx.midiInput.enabled).toBe(false);
  });

  it('no-op when bleMidi.connected is already true', async () => {
    const fx = makeFixture();
    fx.bleMidi.connected = true;
    fx.setRequestDevice(vi.fn());
    await createBleMidiConnect(fx.deps).connect();
    // requestDevice was not called.
    expect(fx.setInputIndicator).not.toHaveBeenCalled();
  });
});

// ─── happy path ─────────────────────────────────────────────────────

describe('connect — happy path', () => {
  it('walks the GATT chain + flips midiInput state', async () => {
    const fx = makeFixture();
    const { device, char } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();

    expect(fx.bleMidi.connected).toBe(true);
    expect(fx.bleMidi.device).toBe(device);
    expect(fx.bleMidi.characteristic).toBe(char);
    expect(fx.midiInput.enabled).toBe(true);
    expect(fx.midiInput.port).toEqual({ name: 'Roland GO' });
  });

  it('suspends mic when audio is up + mic not already suspended', async () => {
    const fx = makeFixture();
    const { device } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();
    expect(fx.suspendMic).toHaveBeenCalledOnce();
  });

  it('does NOT suspend mic when already suspended', async () => {
    const fx = makeFixture();
    fx.state.micSuspended = true;
    const { device } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();
    expect(fx.suspendMic).not.toHaveBeenCalled();
  });

  it('does NOT suspend mic when no audio context', async () => {
    const fx = makeFixture({ hasAudioCtx: () => false });
    const { device } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();
    expect(fx.suspendMic).not.toHaveBeenCalled();
  });

  it('refreshes indicator + intro hint + shows connect chip', async () => {
    const fx = makeFixture();
    const { device } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();

    expect(fx.setInputIndicator).toHaveBeenCalledOnce();
    expect(fx.refreshIntroHint).toHaveBeenCalledOnce();
    expect(fx.showHitChip).toHaveBeenCalledWith('good', 'T(midiConnectedFmt,Roland GO)');
  });

  it('falls back to "BLE-MIDI" name when device.name is null', async () => {
    const fx = makeFixture();
    const { device } = makeFakeDevice();
    device.name = null;
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();
    expect(fx.midiInput.port).toEqual({ name: 'BLE-MIDI' });
  });

  it('forwards characteristic value-changed events to parsePacket', async () => {
    const fx = makeFixture();
    const { device, char } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();

    const buf = new Uint8Array([0x80, 0x81, 0x90, 60, 100]).buffer;
    char.fireValueChanged(buf);
    expect(fx.parsePacket).toHaveBeenCalledWith(buf);
  });
});

// ─── GATT disconnect handler ───────────────────────────────────────

describe('GATT disconnect handler', () => {
  it('reverses midiInput state + resumes mic + un-listens on disconnect', async () => {
    const fx = makeFixture();
    const { device, disconnectListeners } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));

    await createBleMidiConnect(fx.deps).connect();
    fx.state.micSuspended = true; // simulate the connect-time suspend

    expect(disconnectListeners.length).toBe(1);
    disconnectListeners[0]();

    expect(fx.bleMidi.connected).toBe(false);
    expect(fx.bleMidi.characteristic).toBeNull();
    expect(fx.midiInput.enabled).toBe(false);
    expect(fx.midiInput.port).toBeNull();
    expect(fx.resumeMic).toHaveBeenCalledOnce();
    expect(device.removeEventListener).toHaveBeenCalled();
    expect(fx.bleMidi._disconnectHandler).toBeNull();
    // GATT drop also kicks the Web MIDI rescan poller so a USB
    // fallback (or a WMB BLE re-pair) auto-attaches.
    expect(fx.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('does NOT resume mic when audio is gone (but still kicks rescan)', async () => {
    const fx = makeFixture();
    fx.deps.hasAudioCtx = () => false;
    const { device, disconnectListeners } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));
    await createBleMidiConnect(fx.deps).connect();
    fx.state.micSuspended = true;
    disconnectListeners[0]();
    expect(fx.resumeMic).not.toHaveBeenCalled();
    expect(fx.startMidiAutoRescan).toHaveBeenCalledOnce();
  });

  it('does NOT resume mic when mic was never suspended (but still kicks rescan)', async () => {
    const fx = makeFixture();
    const { device, disconnectListeners } = makeFakeDevice();
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));
    await createBleMidiConnect(fx.deps).connect();
    // Don't flip state.micSuspended.
    disconnectListeners[0]();
    expect(fx.resumeMic).not.toHaveBeenCalled();
    expect(fx.startMidiAutoRescan).toHaveBeenCalledOnce();
  });
});

// ─── failure paths ─────────────────────────────────────────────────

describe('connect — failure paths', () => {
  it('NotFoundError (user cancelled picker) → no alert, no state change', async () => {
    const fx = makeFixture();
    const err = new Error('user cancelled');
    err.name = 'NotFoundError';
    fx.setRequestDevice(vi.fn().mockRejectedValue(err));
    await createBleMidiConnect(fx.deps).connect();
    expect(fx.alert).not.toHaveBeenCalled();
    expect(fx.bleMidi.connected).toBe(false);
  });

  it('mid-chain error (service fail) → alerts + closes open GATT', async () => {
    const fx = makeFixture();
    const { device, gattDisconnect } = makeFakeDevice({
      gattConnected: true,
      serverThrows: 'service',
    });
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));
    await createBleMidiConnect(fx.deps).connect();
    expect(fx.alert).toHaveBeenCalledWith(expect.stringContaining('alertBleConnectFailedFmt'));
    expect(gattDisconnect).toHaveBeenCalledOnce();
    expect(fx.bleMidi.connected).toBe(false);
  });

  it('startNotifications fail → alerts + closes', async () => {
    const fx = makeFixture();
    const { device, gattDisconnect } = makeFakeDevice({
      gattConnected: true,
      serverThrows: 'notify',
    });
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));
    await createBleMidiConnect(fx.deps).connect();
    expect(fx.alert).toHaveBeenCalled();
    expect(gattDisconnect).toHaveBeenCalledOnce();
  });

  it('no-GATT device throws + alerts', async () => {
    const fx = makeFixture();
    const { device } = makeFakeDevice({ hasGatt: false });
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));
    await createBleMidiConnect(fx.deps).connect();
    expect(fx.alert).toHaveBeenCalledWith(expect.stringContaining('BLE device exposes no GATT'));
  });
});

// ─── M3: reconnectKnown（起動時サイレント再接続） ───────────────────

describe('reconnectKnown', () => {
  function withGetDevices(fx: Fixture, devices: BleDevice[]): void {
    // navigator getter を getDevices 付きで置き換える。
    (fx.deps as { navigator: unknown }).navigator = {
      bluetooth: {
        requestDevice: vi.fn(),
        getDevices: vi.fn().mockResolvedValue(devices),
      },
    };
  }

  it('getDevices 非対応ブラウザは即 false（feature-detect）', async () => {
    const fx = makeFixture();
    fx.setRequestDevice(vi.fn()); // bluetooth はあるが getDevices なし
    await expect(createBleMidiConnect(fx.deps).reconnectKnown()).resolves.toBe(false);
  });

  it('既知デバイスがあればチューザー無しで handshake して true', async () => {
    const fx = makeFixture();
    const { device } = makeFakeDevice({ gattConnected: true });
    withGetDevices(fx, [device]);
    const ok = await createBleMidiConnect(fx.deps).reconnectKnown();
    expect(ok).toBe(true);
    expect(fx.bleMidi.connected).toBe(true);
    expect(fx.midiInput.enabled).toBe(true);
    expect(fx.showHitChip).toHaveBeenCalledWith('good', expect.stringContaining('Roland GO'));
  });

  it('別入力が確立済みなら何もしない', async () => {
    const fx = makeFixture();
    const { device } = makeFakeDevice({ gattConnected: true });
    withGetDevices(fx, [device]);
    fx.midiInput.enabled = true; // USB が先に繋がった
    await expect(createBleMidiConnect(fx.deps).reconnectKnown()).resolves.toBe(false);
    expect(fx.bleMidi.connected).toBe(false);
  });

  it('1台目が失敗（電波外）でも2台目を試す', async () => {
    const fx = makeFixture();
    const dead = makeFakeDevice({ serverThrows: 'connect' });
    const alive = makeFakeDevice({ gattConnected: true });
    withGetDevices(fx, [dead.device, alive.device]);
    const ok = await createBleMidiConnect(fx.deps).reconnectKnown();
    expect(ok).toBe(true);
    expect(fx.bleMidi.connected).toBe(true);
    expect(fx.alert).not.toHaveBeenCalled(); // サイレント経路 — alert なし
  });
});

// ─── M3: auto-reconnect（GATT 切断後のバックオフ再試行） ────────────

describe('auto-reconnect after GATT drop', () => {
  it('切断 → バックオフ後に同じデバイスへ再 handshake', async () => {
    // setTimeout シム: コールバックを溜めて手動で発火。
    const pending: Array<() => void> = [];
    const fx = makeFixture({
      setTimeout: ((cb: () => void) => {
        pending.push(cb);
        return pending.length;
      }) as never,
      clearTimeout: vi.fn() as never,
    });
    const { device, disconnectListeners } = makeFakeDevice({ gattConnected: true });
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));
    await createBleMidiConnect(fx.deps).connect();
    expect(fx.bleMidi.connected).toBe(true);

    // GATT 切断 → teardown + 再接続タイマーが積まれる（pending の末尾。
    // 先頭側には成功済み handshake の stale なタイムアウト cb がいる）。
    const beforeDrop = pending.length;
    disconnectListeners[0]?.();
    expect(fx.bleMidi.connected).toBe(false);
    expect(fx.midiInput.enabled).toBe(false);
    expect(fx.resumeMic).not.toHaveBeenCalled(); // micSuspended=false のまま
    expect(pending.length).toBe(beforeDrop + 1);

    // 再試行を発火 → handshake が成功して復帰。
    pending[pending.length - 1]();
    await vi.waitFor(() => {
      expect(fx.bleMidi.connected).toBe(true);
    });
    expect(fx.midiInput.enabled).toBe(true);
  });

  it('再試行前に別入力が確立していたら中止', async () => {
    const pending: Array<() => void> = [];
    const fx = makeFixture({
      setTimeout: ((cb: () => void) => {
        pending.push(cb);
        return pending.length;
      }) as never,
      clearTimeout: vi.fn() as never,
    });
    const { device, disconnectListeners } = makeFakeDevice({ gattConnected: true });
    fx.setRequestDevice(vi.fn().mockResolvedValue(device));
    await createBleMidiConnect(fx.deps).connect();
    disconnectListeners[0]?.();
    fx.midiInput.enabled = true; // USB が先に復帰した
    const before = pending.length;
    pending[before - 1]?.(); // 再試行発火
    await Promise.resolve();
    expect(fx.bleMidi.connected).toBe(false); // 奪わない
  });
});

// ─── exported constants ────────────────────────────────────────────

describe('BLE-MIDI UUID constants', () => {
  it('exports the spec-mandated service UUID', () => {
    expect(BLE_MIDI_SERVICE).toBe('03b80e5a-ede8-4b33-a751-6ce34ec4c700');
  });
  it('exports the spec-mandated characteristic UUID', () => {
    expect(BLE_MIDI_CHAR).toBe('7772e5db-3868-4112-a1a9-f2669d106bf3');
  });
});
