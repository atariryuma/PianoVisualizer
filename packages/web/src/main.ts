// Web shell entry — Phase 0e (legacy-app.js retired).
//
// Three jobs:
//   1. Pin vendor libs (Tone / OSMD / JSZip / @piano/core) to globalThis
//      so they're inspectable from the browser console + dev-mode self-test.
//   2. Drop stale Workbox caches left behind by the retired pre-Vite SW.
//   3. Boot the app via ShellBootstrap.boot().
//
// The ~570-line legacy boilerplate (95 module imports + Window interface
// declarations + bare-identifier var declarations + per-module globalThis
// pinning) was needed when legacy-app.js read every module as a browser
// global. shell-bootstrap.ts now imports each module directly, so all of
// that boilerplate is gone.

import * as Tone from 'tone';
import * as opensheetmusicdisplay from 'opensheetmusicdisplay';
import JSZipImpl from 'jszip';
import * as PianoCore from '@piano/core';
import * as ShellBootstrap from './shell-bootstrap';
import { installNativeMidiPolyfill } from './native-midi-polyfill';
import { installNoZoomGuards } from './no-zoom-guard';

// ネイティブアプリらしく「勝手に拡大しない」を徹底（iOS Safari の
// ピンチズーム抑止。WKWebView / Android / desktop は viewport 側で無効化）。
installNoZoomGuards();

// ネイティブ（Capacitor）実行時のみ: シェル起動より前に Web MIDI polyfill を
// 設置する。initWebMIDI が navigator.requestMIDIAccess を見にいくため、
// この順序が本質（Web 配信時は window.Capacitor が無く即 no-op）。
installNativeMidiPolyfill();

declare global {
  // Vite-injected build constants (see vite.config.ts `define`). Used by
  // the dev-mode 📋 Copy report so paste-into-chat reports pin to a
  // specific commit.
  const __APP_VERSION__: string;
  const __BUILD_DATE__: string;

  interface Window {
    Tone: typeof Tone;
    opensheetmusicdisplay: typeof opensheetmusicdisplay;
    JSZip: typeof JSZipImpl;
    PianoCore: typeof PianoCore;
    /** Cleared by `recoverAudioContext` debounce. */
    _audioDeviceChangeTimer?: ReturnType<typeof setTimeout>;
  }

  /** Web Bluetooth — Chromium-only experimental API used by the BLE-MIDI
   *  fallback path. Not in lib.dom by default; declare a minimal subset
   *  matching what shell-midi.ts actually reads. */
  interface BluetoothGATTServer {
    connected: boolean;
    disconnect(): void;
    getPrimaryService(uuid: string): Promise<{
      getCharacteristic(uuid: string): Promise<
        EventTarget & {
          startNotifications(): Promise<unknown>;
          stopNotifications(): Promise<unknown>;
        }
      >;
    }>;
  }
  interface BluetoothDevice {
    name: string | null;
    /** The remote GATT server. Per spec the same object holds both
     *  connect() and connected/disconnect — connecting is a no-op once
     *  it's already established. */
    gatt?: BluetoothGATTServer & { connect(): Promise<BluetoothGATTServer> };
    addEventListener(event: string, handler: () => void): void;
    removeEventListener(event: string, handler: () => void): void;
  }
  interface Navigator {
    bluetooth?: {
      requestDevice(opts: {
        acceptAllDevices?: boolean;
        filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
        optionalServices?: string[];
      }): Promise<BluetoothDevice>;
    };
  }
}

// Vendor globals — kept on globalThis as a console-debug surface.
(globalThis as unknown as Window).Tone = Tone;
(globalThis as unknown as Window).opensheetmusicdisplay = opensheetmusicdisplay;
(globalThis as unknown as Window).JSZip = JSZipImpl;
(globalThis as unknown as Window).PianoCore = PianoCore;

// Phase 0b.3 follow-up: drop hand-rolled caches left behind by the
// retired pre-Vite legacy sw.js. Workbox's `cleanupOutdatedCaches`
// only cleans up its own previous precache versions — the old SW
// named its caches `pianoViz_v2` / `_v3` / `_v4`, which would just
// orphan-leak storage forever otherwise. One-shot, runs in the
// background; failures are silent (private mode, embedded WebViews
// without Cache API, etc. — none of which prevent the app booting).
if (typeof caches !== 'undefined') {
  void caches
    .keys()
    .then((names) => {
      const stale = names.filter((n) => n.startsWith('pianoViz_') || n.startsWith('piano-viz_'));
      return Promise.all(stale.map((n) => caches.delete(n)));
    })
    .catch(() => {});
}

// boot() が同期 throw すると全リスナー未設置の「見えるのに押せない」
// 死画面になる。最低限の可視エラー + コンソール出力に degrade する。
try {
  ShellBootstrap.boot();
} catch (e) {
  console.error('[boot] fatal:', e);
  try {
    const el = document.createElement('div');
    el.setAttribute(
      'style',
      'position:fixed;inset:auto 12px 12px 12px;z-index:9999;padding:12px 16px;' +
        'background:rgba(180,40,60,.92);color:#fff;font:14px system-ui;border-radius:10px'
    );
    el.textContent =
      'アプリの起動に失敗しました。ページを再読み込みしてください / Failed to start — please reload.';
    document.body.appendChild(el);
  } catch {
    /* DOM さえ使えない環境では console のみ */
  }
}
