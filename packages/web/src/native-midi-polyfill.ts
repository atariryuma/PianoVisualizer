// ネイティブ MIDI → Web MIDI API polyfill（Capacitor 版、2026-07-19）。
//
// iOS の WKWebView には Web MIDI が無い（WebKit Bug 107250）。ネイティブ
// アプリでは capacitor-piano-midi プラグイン（CoreMIDI / android.media.midi）
// が MIDI を受け、この polyfill が `navigator.requestMIDIAccess` として
// 露出する — Web MIDI Browser と同じ方式。**シェル（shell-midi / midi-ports
// / midi-rescan / midi-dispatch）は一切変更せず**、デスクトップ Chrome と
// 同じ経路で動く。
//
// 依存ゼロ: Capacitor のネイティブランタイムが注入する `window.Capacitor`
// だけを使う（@capacitor/core を web バンドルに入れない）。Web 配信時は
// window.Capacitor が無いので何もしない。
//
// スコープ: 入力のみ・SysEx なし（プラグイン API と同範囲）。timestamp は
// ネイティブ由来で performance.now() と起点が違いうるが、midi-dispatch の
// 遅延補正は「負値・非有限・1s 超は 0 クランプ」なので安全に縮退する。

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: (name: string) => unknown;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

interface PluginMidiPort {
  id: string;
  name: string;
  manufacturer?: string;
  state: 'connected' | 'disconnected';
  connection: 'open' | 'closed' | 'pending';
}

interface PianoMidiPluginLike {
  start(): Promise<void>;
  // Capacitor プラグインの resolve は辞書必須。ネイティブは配列を直接返せず
  // `{ devices: [...] }` で包む（Swift: call.resolve(["devices": ...])）。
  listInputs(): Promise<{ devices: PluginMidiPort[] }>;
  // iOS のみ: OS 標準 Bluetooth-MIDI ペアリング画面（CABTMIDICentralViewController）
  // を表示。ペア後は CoreMIDI ホットプラグ → portChange で USB と同経路。
  showBleMidiPairing(): Promise<void>;
  addListener(
    eventName: 'midiMessage' | 'portChange',
    listener: (event: never) => void
  ): Promise<unknown>;
}

/** シェルが読む最小の MIDIInput 形状（midi-ports.ts の attach と同じ面）。 */
interface PolyfillMidiInput {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  connection: string;
  type: 'input';
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number; target: unknown }) => void) | null;
  open(): Promise<PolyfillMidiInput>;
  close(): Promise<PolyfillMidiInput>;
}

interface PolyfillMidiAccess {
  inputs: Map<string, PolyfillMidiInput>;
  outputs: Map<string, unknown>;
  sysexEnabled: boolean;
  onstatechange: ((e: { port: PolyfillMidiInput }) => void) | null;
}

function toInput(p: PluginMidiPort): PolyfillMidiInput {
  const input: PolyfillMidiInput = {
    id: p.id,
    name: p.name,
    manufacturer: p.manufacturer ?? '',
    state: p.state,
    connection: p.connection,
    type: 'input',
    onmidimessage: null,
    // ネイティブ側は start() が全ポートを自動 open するので論理 no-op。
    open: async () => input,
    close: async () => input,
  };
  return input;
}

// iOS ネイティブで OS 標準ペアリング画面を開く関数。install 成功時のみ非 null。
// シェル（settings-panel の BLE ボタン）はこれの有無で Web Bluetooth 経路と
// 出し分ける。Android は scanBle/connectBle 経路（未配線 — NEXT.md 参照）。
let nativeBlePairing: (() => Promise<void>) | null = null;

/** ネイティブ（iOS）の OS 標準 Bluetooth-MIDI ペアリング画面を開けるか。 */
export function hasNativeBleMidiPairing(): boolean {
  return nativeBlePairing != null;
}

/** OS 標準ペアリング画面を開く。接続はシートを閉じた後に CoreMIDI の
 *  ホットプラグ通知 → portChange → 自動アタッチが拾う（USB と同経路）。 */
export function showNativeBleMidiPairing(): Promise<void> {
  return nativeBlePairing ? nativeBlePairing() : Promise.resolve();
}

/** requestMIDIAccess polyfill を navigator へ設置。成功で true。
 *  Web 配信（Capacitor 無し）や本物の Web MIDI がある環境では何もしない。 */
export function installNativeMidiPolyfill(
  nav: { requestMIDIAccess?: unknown } = navigator,
  win: { Capacitor?: CapacitorGlobal } = window as { Capacitor?: CapacitorGlobal }
): boolean {
  const cap = win.Capacitor;
  // Web 配信（Capacitor 無し）では静かに何もしない — console を汚さない。
  if (!cap?.isNativePlatform?.()) return false;

  // ここから先はネイティブアプリ確定。設置の成否は実機で唯一の手掛かりなので
  // 必ずログを残す（Capacitor が console.log をネイティブログへ転送する）。
  const diag = (m: string) => console.log('[MIDI-NATIVE] ' + m);

  if (typeof nav.requestMIDIAccess === 'function') {
    diag('real Web MIDI already present — native polyfill not needed');
    return false; // 本物優先
  }
  if (cap.isPluginAvailable && !cap.isPluginAvailable('PianoMidi')) {
    diag(
      'PianoMidi plugin is NOT registered with the Capacitor runtime — ' +
        'polyfill NOT installed (check CAPBridgedPlugin registration)'
    );
    return false;
  }

  const plugin = (cap.registerPlugin?.('PianoMidi') ?? cap.Plugins?.PianoMidi) as
    | PianoMidiPluginLike
    | undefined;
  if (!plugin) {
    diag('registerPlugin("PianoMidi") returned nothing — polyfill NOT installed');
    return false;
  }

  // アクセスは何度でも要求される（midi-rescan の force-fresh）。プラグインの
  // リスナーは 1 回だけ張り、常に「最新の access」へルーティングする —
  // 再要求のたびにリスナーが積み重なって多重発火するのを防ぐ。
  let current: PolyfillMidiAccess | null = null;
  let listenersArmed = false;

  async function armListeners(): Promise<void> {
    if (listenersArmed) return;
    listenersArmed = true;
    await plugin!.addListener('midiMessage', ((e: {
      portId: string;
      data: number[];
      timestamp: number;
    }) => {
      const input = current?.inputs.get(e.portId);
      if (!input?.onmidimessage) return;
      input.onmidimessage({
        data: Uint8Array.from(e.data),
        timeStamp: e.timestamp,
        target: input,
      });
    }) as never);
    await plugin!.addListener('portChange', ((p: PluginMidiPort) => {
      if (!current) return;
      let input = current.inputs.get(p.id);
      if (p.state === 'connected') {
        if (!input) {
          input = toInput(p);
          current.inputs.set(p.id, input);
        } else {
          input.state = p.state;
          input.connection = p.connection;
        }
      } else if (input) {
        input.state = 'disconnected';
        current.inputs.delete(p.id);
      }
      if (input) current.onstatechange?.({ port: input });
    }) as never);
  }

  (nav as { requestMIDIAccess: unknown }).requestMIDIAccess =
    async function requestMIDIAccess(): Promise<PolyfillMidiAccess> {
      await plugin!.start();
      await armListeners();
      // ネイティブ listInputs は {devices:[…]} を返す（配列直返し不可）。
      // 素の配列前提で ports.map() すると "l.map is not a function" で落ちる。
      const listed = await plugin!.listInputs();
      const ports = listed?.devices ?? [];
      // M1: access + inputs をシングルトン化（Chrome の requestMIDIAccess は
      // 同一 MIDIAccess/MIDIInput を返す。シェルはこの安定 identity 前提で
      // onmidimessage を束縛し、verifyAlive も identity 比較する）。以前は
      // 再要求（手動 Rescan の force-fresh 等）のたびに新 access/input を作って
      // current を差し替えていたため、シェルが束縛した旧 input が孤立し、
      // 以後の受信が onmidimessage=null の新 input へ流れて無音化していた。
      // 2 回目以降は同一 access/inputs を返し、in-place で追加/削除だけ行う
      // （既存 input の onmidimessage 束縛を保持）。
      if (!current) {
        current = {
          inputs: new Map(ports.map((p) => [p.id, toInput(p)])),
          outputs: new Map(),
          sysexEnabled: false,
          onstatechange: null,
        };
      } else {
        const seen = new Set<string>();
        for (const p of ports) {
          seen.add(p.id);
          // 新規ポートのみ追加。既存はそのまま（束縛を壊さない）。
          if (!current.inputs.has(p.id)) current.inputs.set(p.id, toInput(p));
        }
        // listInputs から消えたポート（切断済み）を除去。
        for (const id of Array.from(current.inputs.keys())) {
          if (!seen.has(id)) current.inputs.delete(id);
        }
      }
      return current;
    };
  // iOS: BLE-MIDI は OS 標準ペアリング画面。Capacitor のプラグインプロキシは
  // 任意のメソッド名が関数に見えるため typeof では判定できず、プラットフォーム
  // で分岐する（Android は scanBle/connectBle を将来配線）。
  if (cap.getPlatform?.() === 'ios') {
    nativeBlePairing = () => plugin.showBleMidiPairing();
  }
  diag('polyfill installed — navigator.requestMIDIAccess now backed by CoreMIDI/BLE');
  return true;
}
