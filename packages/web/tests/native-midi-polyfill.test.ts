// ネイティブ MIDI → Web MIDI polyfill のテスト。
// 偽 window.Capacitor + 偽プラグインで、設置条件・入力列挙・メッセージ
// ルーティング・ポート増減・再要求時のリスナー単発性を固定する。

import { describe, it, expect, vi } from 'vitest';
import {
  installNativeMidiPolyfill,
  hasNativeBleMidiPairing,
  showNativeBleMidiPairing,
} from '../src/native-midi-polyfill';

type Listener = (e: unknown) => void;

function makeFakePlugin() {
  const listeners: Record<string, Listener[]> = { midiMessage: [], portChange: [] };
  return {
    start: vi.fn(async () => {}),
    // 実機契約（2026-07-20 iPad 実機で確認）: Capacitor プラグインの resolve は
    // 辞書必須で、ネイティブは配列を直接返せず {devices:[…]} で包む。旧モックは
    // 配列直返しで、polyfill 側の配列前提バグ（l.map is not a function）を
    // 見逃していた。
    listInputs: vi.fn(async () => ({
      devices: [
        {
          id: 'p1',
          name: 'GO:PIANO88',
          manufacturer: 'Roland',
          state: 'connected',
          connection: 'open',
        },
      ],
    })),
    showBleMidiPairing: vi.fn(async () => {}),
    addListener: vi.fn(async (name: string, fn: Listener) => {
      listeners[name].push(fn);
      return {};
    }),
    emit(name: string, e: unknown) {
      for (const fn of listeners[name]) fn(e);
    },
  };
}

function makeCap(plugin: unknown) {
  return {
    isNativePlatform: () => true,
    isPluginAvailable: (n: string) => n === 'PianoMidi',
    registerPlugin: () => plugin,
  };
}

describe('installNativeMidiPolyfill', () => {
  it('非ネイティブ環境では何もしない', () => {
    const nav: { requestMIDIAccess?: unknown } = {};
    expect(installNativeMidiPolyfill(nav, {})).toBe(false);
    expect(nav.requestMIDIAccess).toBeUndefined();
  });

  it('本物の Web MIDI がある環境では上書きしない', () => {
    const real = () => {};
    const nav = { requestMIDIAccess: real };
    expect(installNativeMidiPolyfill(nav, { Capacitor: makeCap(makeFakePlugin()) })).toBe(false);
    expect(nav.requestMIDIAccess).toBe(real);
  });

  it('ネイティブでは requestMIDIAccess を設置し、入力を列挙する', async () => {
    const plugin = makeFakePlugin();
    const nav: { requestMIDIAccess?: () => Promise<unknown> } = {};
    expect(installNativeMidiPolyfill(nav, { Capacitor: makeCap(plugin) })).toBe(true);
    const access = (await nav.requestMIDIAccess!()) as {
      inputs: Map<string, { name: string; onmidimessage: Listener | null }>;
      sysexEnabled: boolean;
    };
    expect(plugin.start).toHaveBeenCalled();
    expect(access.sysexEnabled).toBe(false);
    expect(access.inputs.get('p1')?.name).toBe('GO:PIANO88');
  });

  it('midiMessage が Uint8Array + timeStamp で onmidimessage へ届く', async () => {
    const plugin = makeFakePlugin();
    const nav: { requestMIDIAccess?: () => Promise<unknown> } = {};
    installNativeMidiPolyfill(nav, { Capacitor: makeCap(plugin) });
    const access = (await nav.requestMIDIAccess!()) as {
      inputs: Map<string, { onmidimessage: Listener | null }>;
    };
    const got: unknown[] = [];
    access.inputs.get('p1')!.onmidimessage = (e) => got.push(e);
    plugin.emit('midiMessage', { portId: 'p1', data: [0x90, 60, 100], timestamp: 123.5 });
    expect(got).toHaveLength(1);
    const ev = got[0] as { data: Uint8Array; timeStamp: number };
    expect(ev.data).toBeInstanceOf(Uint8Array);
    expect([...ev.data]).toEqual([0x90, 60, 100]);
    expect(ev.timeStamp).toBe(123.5);
  });

  it('portChange で入力が増減し onstatechange が発火する', async () => {
    const plugin = makeFakePlugin();
    const nav: { requestMIDIAccess?: () => Promise<unknown> } = {};
    installNativeMidiPolyfill(nav, { Capacitor: makeCap(plugin) });
    const access = (await nav.requestMIDIAccess!()) as {
      inputs: Map<string, unknown>;
      onstatechange: Listener | null;
    };
    const changes: unknown[] = [];
    access.onstatechange = (e) => changes.push(e);
    plugin.emit('portChange', {
      id: 'p2',
      name: 'USB Keys',
      state: 'connected',
      connection: 'open',
    });
    expect(access.inputs.has('p2')).toBe(true);
    plugin.emit('portChange', {
      id: 'p2',
      name: 'USB Keys',
      state: 'disconnected',
      connection: 'closed',
    });
    expect(access.inputs.has('p2')).toBe(false);
    expect(changes).toHaveLength(2);
  });

  it('再要求（rescan の force-fresh）でもプラグインリスナーは 1 組のまま', async () => {
    const plugin = makeFakePlugin();
    const nav: { requestMIDIAccess?: () => Promise<unknown> } = {};
    installNativeMidiPolyfill(nav, { Capacitor: makeCap(plugin) });
    await nav.requestMIDIAccess!();
    const access2 = (await nav.requestMIDIAccess!()) as {
      inputs: Map<string, { onmidimessage: Listener | null }>;
    };
    expect(plugin.addListener).toHaveBeenCalledTimes(2); // midiMessage + portChange
    // メッセージは最新 access へルーティングされ、1 回だけ届く
    const got: unknown[] = [];
    access2.inputs.get('p1')!.onmidimessage = (e) => got.push(e);
    plugin.emit('midiMessage', { portId: 'p1', data: [0x80, 60, 0], timestamp: 1 });
    expect(got).toHaveLength(1);
  });

  it('M1: 再要求は同一 access + 同一 input を返し、束縛した onmidimessage を保持する', async () => {
    const plugin = makeFakePlugin();
    const nav: { requestMIDIAccess?: () => Promise<unknown> } = {};
    installNativeMidiPolyfill(nav, { Capacitor: makeCap(plugin) });
    const access1 = (await nav.requestMIDIAccess!()) as {
      inputs: Map<string, { onmidimessage: Listener | null }>;
    };
    // シェルが旧 input に onmidimessage を束縛する。
    const got: unknown[] = [];
    const input1 = access1.inputs.get('p1')!;
    input1.onmidimessage = (e) => got.push(e);

    // 手動 Rescan 相当の再要求（force-fresh）。
    const access2 = (await nav.requestMIDIAccess!()) as {
      inputs: Map<string, unknown>;
    };
    // 同一 access / 同一 input（identity 保持）— 旧束縛が生きたまま。
    expect(access2).toBe(access1);
    expect(access2.inputs.get('p1')).toBe(input1);
    // 再要求後も受信が旧束縛へ届く（＝孤立して無音化しない）。
    plugin.emit('midiMessage', { portId: 'p1', data: [0x90, 60, 100], timestamp: 5 });
    expect(got).toHaveLength(1);
  });

  it('iOS では OS 標準 BLE ペアリング画面の呼び出し口が配線される', async () => {
    const plugin = makeFakePlugin();
    const nav: { requestMIDIAccess?: unknown } = {};
    const cap = { ...makeCap(plugin), getPlatform: () => 'ios' };
    expect(installNativeMidiPolyfill(nav, { Capacitor: cap })).toBe(true);
    expect(hasNativeBleMidiPairing()).toBe(true);
    await showNativeBleMidiPairing();
    expect(plugin.showBleMidiPairing).toHaveBeenCalledTimes(1);
  });
});
