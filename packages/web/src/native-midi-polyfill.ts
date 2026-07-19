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
  listInputs(): Promise<PluginMidiPort[]>;
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

/** requestMIDIAccess polyfill を navigator へ設置。成功で true。
 *  Web 配信（Capacitor 無し）や本物の Web MIDI がある環境では何もしない。 */
export function installNativeMidiPolyfill(
  nav: { requestMIDIAccess?: unknown } = navigator,
  win: { Capacitor?: CapacitorGlobal } = window as { Capacitor?: CapacitorGlobal }
): boolean {
  const cap = win.Capacitor;
  if (!cap?.isNativePlatform?.()) return false;
  if (typeof nav.requestMIDIAccess === 'function') return false; // 本物優先
  if (cap.isPluginAvailable && !cap.isPluginAvailable('PianoMidi')) return false;

  const plugin = (cap.registerPlugin?.('PianoMidi') ?? cap.Plugins?.PianoMidi) as
    | PianoMidiPluginLike
    | undefined;
  if (!plugin) return false;

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
      const ports = await plugin!.listInputs();
      const access: PolyfillMidiAccess = {
        inputs: new Map(ports.map((p) => [p.id, toInput(p)])),
        outputs: new Map(),
        sysexEnabled: false,
        onstatechange: null,
      };
      current = access;
      return access;
    };
  return true;
}
