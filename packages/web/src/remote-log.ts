// Remote logging — Phase 0d batch 65.
//
// Forwards `console.log` / `console.error` / `window.onerror` to the
// bundled PowerShell HTTPS server's `/log` endpoint so a tester on
// LAN (iPad / Android, or just a second machine) can grep
// `server.log` for diagnostics without round-tripping a screenshot.
//
// Active only when:
//   1. `localStorage.pianoViz_remoteLog === '1'` (explicit override), OR
//   2. served via HTTPS from localhost / 127.0.0.1 / 192.168.x / 10.x
//      (the bundled gen_cert.ps1 + https_server.ps1 LAN setup).
//
// On `file://` and production hosts (e.g. github.io) the logger is a
// no-op so we don't waste bandwidth POSTing to a non-existent
// endpoint, and so OSMD/Tone console output isn't unexpectedly
// forwarded off-device.
//
// Backpressure: the in-flight queue caps at 50 messages. A rapidly-
// dumping diagnostic (200+ lines per song load) that runs into a
// sleeping LAN must not grow microtasks unboundedly inside a single
// frame — drop messages once the cap is hit. Order is preserved
// via a single sequential promise chain (each fetch waits for the
// previous to settle), critical for diagnostics that depend on
// insertion order (e.g. per-measure walks).

/** Public API surface — what every module that needs remote-log
 *  imports + uses. */
export interface RemoteLog {
  /** True when forwarding is active. Held as a const so callsites
   *  can short-circuit expensive diagnostic computation when off. */
  enabled: boolean;
  /** Queue a message to the server. No-op when disabled. */
  send(msg: string | object): void;
}

/** Subset of `localStorage` we touch — kept narrow so tests stub
 *  with a 4-line shim instead of polyfilling the full Web Storage
 *  API. */
export interface RemoteLogStorage {
  getItem(key: string): string | null;
}

/** Subset of `location` we touch. */
export interface RemoteLogLocation {
  protocol: string;
  hostname: string;
}

export interface RemoteLogDeps {
  /** Production: live `localStorage`. Tests inject a fake. */
  storage?: RemoteLogStorage | null;
  /** Production: live `location`. Tests inject a fake. */
  location?: RemoteLogLocation;
  /** Production: live `fetch`. Tests inject a spy that records body
   *  payloads + return Promise<Response>. */
  fetch?: typeof fetch;
  /** Backpressure cap — drop messages once `pending` exceeds this.
   *  Default 50 (200+ lines/song with a sleepy LAN must not grow
   *  the microtask queue unboundedly). */
  maxPending?: number;
  /** Override the auto-detected enable flag. Tests set this directly. */
  forceEnabled?: boolean;
  /** Capacitor ネイティブ実行中か。省略時 `window.Capacitor?.isNativePlatform?.()`。
   *  出荷アプリは https://localhost 配信で hostname ヒューリスティックが誤って
   *  true になるため、ネイティブでは（明示 override が無い限り）常にオフにする。 */
  isNative?: boolean;
  /** Override the storage key. Default `pianoViz_remoteLog`. */
  storageKey?: string;
  /** Override the POST URL. Default `/log`. */
  endpointUrl?: string;
}

const DEFAULT_MAX_PENDING = 50;
const DEFAULT_STORAGE_KEY = 'pianoViz_remoteLog';
const DEFAULT_ENDPOINT_URL = '/log';

/** Decide whether remote logging should be on at boot time. Pure;
 *  reads only the storage override (if any) and location. */
/** Build-time hard-disable (Vite `define`, true only in `--mode mobile`).
 *  Guarded with typeof so tests / non-Vite contexts see `undefined` and fall
 *  through to the runtime gates. */
declare const __REMOTE_LOG_DISABLED__: boolean | undefined;

export function isRemoteLogEnabled(deps: RemoteLogDeps = {}): boolean {
  // H4: the App Store build compiles this to `if (true) return false`, so the
  // off-device POST path is physically absent from the shipped native bundle —
  // no localStorage override can turn it back on. Tests (where the constant is
  // undefined) and dev/LAN builds fall through to the runtime gates below.
  if (typeof __REMOTE_LOG_DISABLED__ !== 'undefined' && __REMOTE_LOG_DISABLED__) return false;
  if (deps.forceEnabled !== undefined) return deps.forceEnabled;
  // localStorage のグローバルアクセサ評価は、Cookie 全ブロック環境や
  // sandbox iframe で SecurityError を投げる（typeof でも発火）。boot の
  // 最初の呼び出しがここなので、握りつぶさないと全リスナー未設置の
  // 死画面になる。
  let storage = deps.storage;
  if (storage === undefined) {
    try {
      storage = typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      storage = null;
    }
  }
  const key = deps.storageKey ?? DEFAULT_STORAGE_KEY;
  if (storage) {
    try {
      const override = storage.getItem(key);
      if (override === '1') return true;
      if (override === '0') return false;
    } catch {
      /* localStorage may throw in private mode / iframe sandbox */
    }
  }
  // ネイティブ（Capacitor WKWebView）は https://localhost で配信されるため、
  // 下の hostname ヒューリスティックが誤って true になる（COMPLIANCE の未解決
  // 項目 H1）。出荷アプリは「no tracking / audio stays on device」約束のため
  // リモートログを既定オフに。明示 override（localStorage '1'）は上で処理済み
  // なので、開発者は必要ならそれで有効化できる。
  const isNative =
    deps.isNative ??
    !!(
      globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.();
  if (isNative) return false;
  const loc = deps.location ?? (typeof location !== 'undefined' ? location : null);
  if (!loc) return false;
  const h = loc.hostname;
  return (
    loc.protocol === 'https:' &&
    (h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h) || /^10\./.test(h))
  );
}

/** Build the remote-log facade. Returns a stable object whose
 *  `enabled` flag is fixed at construction time and whose `send()`
 *  forwards to the server (or is a no-op when disabled). */
export function createRemoteLog(deps: RemoteLogDeps = {}): RemoteLog {
  const enabled = isRemoteLogEnabled(deps);
  if (!enabled) {
    return { enabled: false, send: () => {} };
  }

  const fetchFnRaw = deps.fetch ?? (typeof fetch !== 'undefined' ? fetch : null);
  const url = deps.endpointUrl ?? DEFAULT_ENDPOINT_URL;
  const maxPending = deps.maxPending ?? DEFAULT_MAX_PENDING;
  if (!fetchFnRaw) {
    return { enabled: true, send: () => {} };
  }
  // Capture into a non-null local so the closure body type-narrows.
  const fetchFn: typeof fetch = fetchFnRaw;

  // Sequential POST queue — concurrent fetch()es arrive at the
  // server in completion order, scrambling diagnostic dumps that
  // depend on insertion order (e.g. per-measure walks). Backpressure
  // via the pending counter caps memory under a sleepy LAN.
  let chain: Promise<unknown> = Promise.resolve();
  let pending = 0;

  function send(msg: string | object): void {
    if (pending >= maxPending) return;
    pending++;
    const body = typeof msg === 'string' ? msg : JSON.stringify(msg);
    // Each fetch swallows its own rejection so the chain itself
    // never enters a rejected state — `pending--` only ever runs
    // from the single `.finally`, no double-decrement risk.
    chain = chain.then(() =>
      fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
      })
        .catch(() => {})
        .finally(() => {
          pending--;
        })
    );
  }

  return { enabled: true, send };
}

/** Convenience: wire `console.log` / `console.error` / `window.onerror`
 *  to also call the given remote logger. Idempotent — second call is
 *  a no-op (we stash a marker on console). The shell calls this once
 *  at boot when REMOTE_LOG_ENABLED is true. */
export function installConsoleForwarding(rl: RemoteLog): void {
  if (!rl.enabled) return;
  const c = console as unknown as { __pianoVizRemoteLogInstalled?: boolean };
  if (c.__pianoVizRemoteLogInstalled) return;
  c.__pianoVizRemoteLogInstalled = true;

  const _log = console.log;
  console.log = (...args: unknown[]) => {
    _log(...args);
    rl.send(args.join(' '));
  };
  const _err = console.error;
  console.error = (...args: unknown[]) => {
    _err(...args);
    rl.send('[ERROR] ' + args.join(' '));
  };
  if (typeof window !== 'undefined') {
    window.onerror = (msg, _url, line) => {
      rl.send(`[FATAL] ${msg} (${line})`);
    };
  }
}
