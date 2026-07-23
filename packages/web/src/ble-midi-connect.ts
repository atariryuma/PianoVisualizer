// BLE-MIDI Web Bluetooth connect/disconnect — Phase 0d batch 27.
//
// Why this exists separately from Web MIDI: Android Chrome's Web
// MIDI exposes USB devices only — Bluetooth keyboards never appear
// there. Web Bluetooth IS available on Android Chrome though, so we
// connect over BLE-MIDI directly using the standard service UUID
// (https://www.midi.org/specifications/midi-transports-specifications/
// bluetooth-le-midi-1-0). Same path also helps desktop Chrome users
// whose BLE-MIDI device isn't surfaced via Web MIDI.
//
// One factory:
//   - createBleMidiConnect(deps).connect() — the user-triggered
//     connect path. Pops the requestDevice() picker, walks GATT
//     server → service → characteristic → startNotifications, wires
//     the byte stream to the BLE packet parser, flips midiInput +
//     suspends mic, and registers a one-shot gattserverdisconnected
//     handler for clean teardown.
//   - .reconnectKnown() — M3: silent boot-time re-pair via
//     navigator.bluetooth.getDevices() (Chrome's persistent-permissions
//     backend). Previously EVERY session (and every drop) forced the
//     full chooser dance; the industry standard is to reconnect to a
//     known device automatically when it's advertising.
//   - auto-reconnect on gattserverdisconnected — M3: retries
//     gatt.connect() with backoff (~23 s total) before giving up, so a
//     BLE hiccup (keyboard sleep, radio blip) heals without the user
//     touching settings. Mic comes back immediately at drop time (the
//     app stays usable during the retry window).
//   - Every GATT handshake is wrapped in a timeout (default 15 s) —
//     previously a wedged handshake pended forever with zero feedback.
//
// State (`bleMidi.{device, characteristic, connected, _disconnectHandler}`)
// is held by the shell — passed in via deps so the visibility-resume
// path in midi-ports.ts (verifyAlive) can read `bleMidi.connected`
// without going through this module.
//
// All side-effects (alert, suspendMic/resumeMic, setInputIndicator,
// showHitChip, refreshIntroHint, hiding the mic meter) flow through
// the deps bag — zero shell-global reads inside the module.

import type { MidiPortsInputRef } from './midi-ports';

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHAR = '7772e5db-3868-4112-a1a9-f2669d106bf3';

/** GATT characteristic surface we touch — narrow to keep the deps
 *  bag testable without lib.dom's full Web Bluetooth shape. */
export interface BleCharacteristic {
  startNotifications(): Promise<unknown>;
  addEventListener(type: 'characteristicvaluechanged', listener: (e: Event) => void): void;
}

export interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>;
}

export interface BleGattServer {
  connected: boolean;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BleService>;
}

export interface BleDevice {
  name: string | null;
  gatt?: BleGattServer & { connect(): Promise<BleGattServer> };
  addEventListener(event: 'gattserverdisconnected', handler: () => void): void;
  removeEventListener(event: 'gattserverdisconnected', handler: () => void): void;
}

/** Mutable BLE state shared with verifyMidiAlive (midi-ports.ts).
 *  Lives in the shell; the connect factory mutates the fields here
 *  rather than holding its own reference. */
export interface BleMidiState {
  device: BleDevice | null;
  characteristic: BleCharacteristic | null;
  connected: boolean;
  _disconnectHandler?: (() => void) | null;
}

/** Subset of `navigator.bluetooth` we touch. `getDevices` is the
 *  persistent-permissions API (Chrome) — optional because it's not
 *  universally shipped; feature-detected by reconnectKnown(). */
export interface BleMidiNavigator {
  bluetooth?: {
    requestDevice(opts: {
      filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
      optionalServices?: string[];
    }): Promise<BleDevice>;
    getDevices?: () => Promise<BleDevice[]>;
  };
}

export interface BleMidiConnectDeps {
  bleMidi: BleMidiState;
  midiInput: MidiPortsInputRef;

  /** Audio context guards — same shape as midi-ports.ts.
   *  `state.micSuspended` is read-only here; the production audio
   *  shell flips it via suspendMic / resumeMic, not via this
   *  module's deps. */
  hasAudioCtx: () => boolean;
  state: {
    readonly micSuspended: boolean;
    /** M4: micMeter 復帰判定（マイクが実際に使えるときだけ再表示）。 */
    readonly micPermissionFailed?: boolean;
    readonly micIntentionallySkipped?: boolean;
  };
  suspendMic: () => void;
  resumeMic: () => void;

  /** "Connect" hooks — same surface as midi-ports.ts attach uses, so
   *  the BLE connect path looks indistinguishable to the rest of
   *  the app. */
  setInputIndicator: () => void;
  refreshIntroHint?: () => void;
  showHitChip?: (kind: string, msg: string) => void;
  micMeter?: HTMLElement | null;
  /** I1: GATT 切断時に押下中の鍵の視覚状態をクリアする（幽霊点灯防止）。 */
  clearHeldNotes?: () => void;

  /** BLE packet decoder — pass `parseBleMidiPacket(buf, dispatch)`
   *  bound to your shell's dispatch entry. The connect factory
   *  hands each characteristic-value-changed Event's
   *  `.value.buffer` straight to this. */
  parsePacket: (buf: ArrayBuffer) => void;

  /** Web MIDI auto-rescan poller — kicked on GATT disconnect so a
   *  USB MIDI keyboard plugged in after the BLE drop auto-attaches.
   *  Stops itself once anything re-attaches. */
  startMidiAutoRescan: () => void;

  /** Bilingual translator. Reads three keys: alertWebBluetoothUnsupported,
   *  alertBleConnectFailedFmt, midiConnectedFmt. */
  t: (key: string, vars?: Record<string, string>) => string;

  /** Native confirm/error popup. Defaults to `alert` in the shell;
   *  tests inject a spy. */
  alert: (msg: string) => void;

  /** Web Bluetooth surface — pass `navigator` directly in production
   *  or a mock in tests. */
  navigator: BleMidiNavigator;

  /** M2/M3: BLE 接続時に全 Web MIDI ポートのハンドラを外す（midi-ports の
   *  unbindAll）。省略時は旧挙動（primary の handler だけ外す）。 */
  unbindWebPorts?: () => void;
  /** GATT ハンドシェイクの全体タイムアウト ms（既定 15000）。 */
  handshakeTimeoutMs?: number;
  /** Timer hooks — tests inject vi.useFakeTimers() shims. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface BleMidiConnect {
  /** User-triggered connect. Resolves silently on success, on user-
   *  cancel (NotFoundError), or on alerted failure. Never throws. */
  connect(): Promise<void>;
  /** M3: 既知（許可済み）BLE-MIDI デバイスへのサイレント再接続。
   *  getDevices 非対応ブラウザ・デバイス無し・電源オフは即 false。
   *  Never throws. */
  reconnectKnown(): Promise<boolean>;
}

/** Auto-reconnect backoff after a GATT drop (~23 s total). */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000];
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000;
/** reconnectKnown（起動時サイレント再接続）は短め — 電源オフの鍵盤を
 *  待ち続けてブートを汚さない。 */
const KNOWN_DEVICE_TIMEOUT_MS = 6_000;

export function createBleMidiConnect(deps: BleMidiConnectDeps): BleMidiConnect {
  const setT = deps.setTimeout ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearT =
    deps.clearTimeout ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const handshakeTimeoutMs = deps.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

  /** Promise にタイムアウトを被せる。BLE の gatt.connect() は相手が
   *  advertise していないと**永遠に pend** する仕様なので、これが無いと
   *  ハンドシェイクがフィードバックゼロで固まる。 */
  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const h = setT(() => reject(new Error('BLE connect timeout (' + ms + ' ms)')), ms);
      p.then(
        (v) => {
          clearT(h);
          resolve(v);
        },
        (e) => {
          clearT(h);
          reject(e);
        }
      );
    });
  }

  /** GATT ハンドシェイク + 成功時の入力切替。connect()（チューザー経由）、
   *  reconnectKnown()（起動時サイレント）、auto-reconnect（切断リトライ）
   *  の3経路が共有する。失敗時は clean up して throw。 */
  async function handshake(device: BleDevice, timeoutMs: number): Promise<void> {
    if (!device.gatt) throw new Error('BLE device exposes no GATT server');
    try {
      await withTimeout(doHandshake(device), timeoutMs);
    } catch (e) {
      // Cleanup on partial-failure path: if gatt.connect() succeeded
      // (or is still pending — disconnect() cancels a pending connect)
      // but a later step threw, the GATT connection is held open
      // forever otherwise.
      try {
        device.gatt.disconnect();
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  async function doHandshake(device: BleDevice): Promise<void> {
    const server = await device.gatt!.connect();

    // 切断リスナーは**ハンドシェイク前**に登録する。従来は接続状態を
    // 立てた後に登録しており、その僅かな窓で切断されると
    // connected=true / enabled=true のままイベントを取りこぼし、
    // リロードまで入力ゼロ＋マイク封印のゾンビ状態になった。
    // ハンドラは全て冪等（未フリップ状態で発火しても片付けのみ）。
    const onGattDisconnect = (): void => {
      deps.bleMidi.connected = false;
      deps.bleMidi.characteristic = null;
      deps.midiInput.enabled = false;
      deps.midiInput.port = null;
      deps.setInputIndicator();
      // I1: BLE 切断で note-off が来なくなるので、押下中の鍵の視覚状態を
      // クリア（幽霊点灯防止）。
      deps.clearHeldNotes?.();
      if (deps.hasAudioCtx() && deps.state.micSuspended) {
        deps.resumeMic();
        // M4: マイクは生き返るのにメーターだけ消えたままだった。
        const st = deps.state as {
          micPermissionFailed?: boolean;
          micIntentionallySkipped?: boolean;
        };
        if (!st.micPermissionFailed && !st.micIntentionallySkipped) {
          deps.micMeter?.classList.add('visible');
        }
      }
      if (deps.bleMidi._disconnectHandler && deps.bleMidi.device) {
        try {
          deps.bleMidi.device.removeEventListener(
            'gattserverdisconnected',
            deps.bleMidi._disconnectHandler
          );
        } catch {
          /* best-effort cleanup */
        }
      }
      deps.bleMidi._disconnectHandler = null;
      deps.bleMidi.device = null;
      console.log('[BLE-MIDI] disconnected');
      // Restart Web MIDI auto-rescan so a fallback USB keyboard
      // (or a Web MIDI Browser BLE pair re-established outside this
      // page) auto-attaches without the user touching the settings.
      deps.startMidiAutoRescan();
      // M3: 自動再接続 — BLE の一時的な切断（鍵盤のスリープ・電波の
      // 途切れ）は数秒で復帰することが多い。バックオフ付きで再試行し、
      // その間もマイクは生きている（上の resumeMic）ので練習は続けられる。
      scheduleReconnect(device);
    };
    deps.bleMidi.device = device;
    deps.bleMidi._disconnectHandler = onGattDisconnect;
    device.addEventListener('gattserverdisconnected', onGattDisconnect);
    // 登録前に切断済みならここで検出して失敗パスへ（イベントは来ない）。
    if (!server.connected) throw new Error('BLE connection dropped during handshake');

    const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
    const ch = await service.getCharacteristic(BLE_MIDI_CHAR);
    await ch.startNotifications();

    ch.addEventListener('characteristicvaluechanged', (e) => {
      // The double-cast through `unknown` is needed because TS
      // doesn't think EventTarget overlaps with the
      // BluetoothCharacteristic shape — they're nominally distinct
      // interfaces. DataView.buffer is `ArrayBufferLike` (covers
      // SharedArrayBuffer); BLE packets always come from a real
      // ArrayBuffer (the GATT stack doesn't ship shared memory).
      // Safe to narrow.
      const target = e.target as unknown as { value: DataView };
      deps.parsePacket(target.value.buffer as ArrayBuffer);
    });

    // 逆方向の attach 対称性: すでに Web MIDI ポートが attach 済み
    // （USB 接続中に BLE を繋いだ等）の場合、port の上書きだけだと旧
    // ポートの onmidimessage が生きたままになり USB+BLE の二重入力に
    // なる。M2 の複数ポート束にも対応 — unbindWebPorts（midi-ports の
    // unbindAll）で全ポートを外す。旧 primary の null 化はフォールバック。
    deps.unbindWebPorts?.();
    const prevPort = deps.midiInput.port as { onmidimessage?: unknown } | null;
    if (prevPort && 'onmidimessage' in prevPort) {
      try {
        (prevPort as { onmidimessage: null | unknown }).onmidimessage = null;
      } catch {
        /* detached port — best effort */
      }
    }

    deps.bleMidi.characteristic = ch;
    deps.bleMidi.connected = true;

    deps.midiInput.enabled = true;
    deps.midiInput.port = { name: device.name || 'BLE-MIDI' };
    // Sentinel 0 so it matches the Web MIDI attach path
    // (midi-ports.ts attach also writes 0). Nothing now reads
    // `lastEventTime` as a gating value — mic-pipeline and
    // game-state-update both moved to `enabled`-only checks —
    // but keeping it consistent simplifies future debug log
    // interpretation.
    deps.midiInput.lastEventTime = 0;
    if (deps.hasAudioCtx() && !deps.state.micSuspended) {
      deps.suspendMic();
    }
    deps.setInputIndicator();
    deps.refreshIntroHint?.();
    deps.micMeter?.classList.remove('visible');
    deps.showHitChip?.('good', deps.t('midiConnectedFmt', { v: device.name || 'BLE-MIDI' }));
    console.log('[BLE-MIDI] connected: ' + (device.name || 'unknown'));
  }

  /** M3: GATT 切断後の自動再接続（バックオフ ~23 s）。別入力が確立して
   *  いたら黙って中止。成功すれば handshake が接続チップを出す。 */
  function scheduleReconnect(device: BleDevice): void {
    if (!device.gatt) return;
    const attempt = (i: number): void => {
      if (i >= RECONNECT_DELAYS_MS.length) {
        console.log('[BLE-MIDI] auto-reconnect gave up after ' + i + ' attempts');
        return;
      }
      setT(() => {
        // 手動再接続・USB attach・別 BLE 接続が先に確立していたら中止。
        if (deps.bleMidi.connected || deps.midiInput.enabled) return;
        void (async () => {
          try {
            await handshake(device, handshakeTimeoutMs);
            console.log('[BLE-MIDI] auto-reconnected (attempt ' + (i + 1) + ')');
          } catch {
            console.log('[BLE-MIDI] reconnect attempt ' + (i + 1) + ' failed');
            attempt(i + 1);
          }
        })();
      }, RECONNECT_DELAYS_MS[i]);
    };
    attempt(0);
  }

  async function connect(): Promise<void> {
    if (!deps.navigator.bluetooth) {
      deps.alert(deps.t('alertWebBluetoothUnsupported'));
      return;
    }
    if (deps.bleMidi.connected) return;

    try {
      const device = await deps.navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_MIDI_SERVICE] }],
        optionalServices: [BLE_MIDI_SERVICE],
      });
      await handshake(device, handshakeTimeoutMs);
    } catch (e) {
      const err = e as Error;
      console.warn('[BLE-MIDI] connect failed:', err.message);
      if (err.name !== 'NotFoundError') {
        deps.alert(deps.t('alertBleConnectFailedFmt', { v: err.message }));
      }
    }
  }

  async function reconnectKnown(): Promise<boolean> {
    const bt = deps.navigator.bluetooth;
    if (!bt?.getDevices) return false;
    if (deps.bleMidi.connected || deps.midiInput.enabled) return false;
    try {
      const devices = await bt.getDevices();
      for (const device of devices) {
        // 途中で別入力（USB attach / 手動 BLE）が確立したら以降は不要。
        if (deps.bleMidi.connected || deps.midiInput.enabled) return true;
        if (!device.gatt) continue;
        try {
          // 短めのタイムアウト — 電源オフの鍵盤の connect() は advertise
          // 待ちで pend し続けるため（handshake 側の disconnect() が
          // pending connect をキャンセルする）。
          await handshake(device, KNOWN_DEVICE_TIMEOUT_MS);
          console.log('[BLE-MIDI] silently reconnected to known device: ' + (device.name || '?'));
          return true;
        } catch {
          /* not advertising / out of range — try the next known device */
        }
      }
    } catch (e) {
      // getDevices 未許可・permissions backend 無効など — 静かに諦める。
      console.log(
        '[BLE-MIDI] getDevices unavailable: ' + (e instanceof Error ? e.message : String(e))
      );
    }
    return false;
  }

  return { connect, reconnectKnown };
}
