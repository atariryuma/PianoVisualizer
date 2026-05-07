// Web shell entry — Phase 0b.3 (complete as of 2026-05-06).
//
// Replaces the legacy 5-script bootstrap (CDN tone / OSMD / jszip + the
// dist-legacy IIFE core bundle + app.js) with a single module entry. Tone /
// OSMD / JSZip / @piano/core come in via npm imports and get pinned to
// `globalThis` so the still-vanilla legacy-app.js (imported for side effects
// at the end) keeps working unchanged.
//
// Why globals at all? The legacy code references `Tone.*`, `JSZip`,
// `opensheetmusicdisplay.OpenSheetMusicDisplay`, and `PianoCore.*` as
// browser globals because that's what the original CDN <script> tags + the
// dist-legacy IIFE used to expose. Migrating each call site to ESM imports
// is Phase 0c TypeScript work; this entry keeps the surface identical
// while making npm + Vite the build path.
//
// `await import('./legacy-app.js')` is dynamic so the global-seeding
// statements above it run BEFORE legacy-app.js's body evaluates. With a
// static import, ES module dependency-order would evaluate legacy-app.js
// before main.ts's body and the legacy code would see undefined globals.
//
// The placeholder adapters (webmidi / webaudio-mic) are NOT wired here —
// legacy-app.js still drives input acquisition itself. They come into
// play during Phase 0c when the practice-state engine moves to the shell.

import * as Tone from 'tone';
import * as opensheetmusicdisplay from 'opensheetmusicdisplay';
import JSZipImpl from 'jszip';
import * as PianoCore from '@piano/core';
import * as AudioScheduler from './audio-scheduler';
import * as NoteExtractor from './note-extractor';
import * as PianoWakeLock from './wakelock';
import * as SectionEditor from './section-editor';
import * as SettingsPanel from './settings-panel';
import * as AudioInit from './audio-init';
import * as UserSongsUi from './user-songs-ui';
import * as ThemeControls from './theme-controls';
import * as PracticeFlow from './practice-flow';
import * as SongPanelControls from './song-panel-controls';
import * as SongPanelRender from './song-panel-render';
import * as PracticeTick from './practice-tick';
import * as ResultCard from './result-card';
import * as SessionSummary from './session-summary';
import * as RenderFrame from './render-frame';
import * as DevMode from './dev-mode';
import * as RenderMid from './render-mid';
import * as RenderLate from './render-late';
import * as PracticeLane from './practice-lane';

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
    AudioScheduler: typeof AudioScheduler;
    NoteExtractor: typeof NoteExtractor;
    PianoWakeLock: typeof PianoWakeLock;
    SectionEditor: typeof SectionEditor;
    SettingsPanel: typeof SettingsPanel;
    AudioInit: typeof AudioInit;
    UserSongsUi: typeof UserSongsUi;
    ThemeControls: typeof ThemeControls;
    PracticeFlow: typeof PracticeFlow;
    SongPanelControls: typeof SongPanelControls;
    SongPanelRender: typeof SongPanelRender;
    PracticeTick: typeof PracticeTick;
    ResultCard: typeof ResultCard;
    SessionSummary: typeof SessionSummary;
    RenderFrame: typeof RenderFrame;
    DevMode: typeof DevMode;
    RenderMid: typeof RenderMid;
    RenderLate: typeof RenderLate;
    PracticeLane: typeof PracticeLane;
    /** Cleared by `recoverAudioContext` debounce. Wider than just a Window
     *  prop on stricter checkers, but keeps the legacy `window._audio…`
     *  read site happy without a JSDoc cast. */
    _audioDeviceChangeTimer?: ReturnType<typeof setTimeout>;
  }
  /** Web Bluetooth — Chromium-only experimental API used by the BLE-MIDI
   *  fallback path. Not in lib.dom by default; declare a minimal subset
   *  matching what legacy-app.js actually reads. */
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
  // Bare-identifier declarations so legacy-app.js (when @ts-check
  // ratchets up further) can reference these without `window.` prefix.
  // Phase 0c: each is seeded onto globalThis below before legacy-app.js
  // is dynamically imported.

  var Tone: typeof import('tone');

  var opensheetmusicdisplay: typeof import('opensheetmusicdisplay');

  var JSZip: typeof JSZipImpl;

  var PianoCore: typeof import('@piano/core');

  var AudioScheduler: typeof import('./audio-scheduler');

  var NoteExtractor: typeof import('./note-extractor');

  var PianoWakeLock: typeof import('./wakelock');

  var SectionEditor: typeof import('./section-editor');

  var SettingsPanel: typeof import('./settings-panel');

  var AudioInit: typeof import('./audio-init');

  var UserSongsUi: typeof import('./user-songs-ui');

  var ThemeControls: typeof import('./theme-controls');

  var PracticeFlow: typeof import('./practice-flow');

  var SongPanelControls: typeof import('./song-panel-controls');

  var SongPanelRender: typeof import('./song-panel-render');

  var PracticeTick: typeof import('./practice-tick');

  var ResultCard: typeof import('./result-card');

  var SessionSummary: typeof import('./session-summary');

  var RenderFrame: typeof import('./render-frame');

  var DevMode: typeof import('./dev-mode');

  var RenderMid: typeof import('./render-mid');

  var RenderLate: typeof import('./render-late');

  var PracticeLane: typeof import('./practice-lane');
  // Adapter pinned by legacy-app.js itself (not main.ts) — declared
  // here so a future @ts-check pass on legacy-app.js sees a typed
  // identity for the bare `osmdAdapter` global.

  var osmdAdapter: import('@piano/core').OsmdAdapter;
}

(globalThis as unknown as Window).Tone = Tone;
(globalThis as unknown as Window).opensheetmusicdisplay = opensheetmusicdisplay;
(globalThis as unknown as Window).JSZip = JSZipImpl;
(globalThis as unknown as Window).PianoCore = PianoCore;
(globalThis as unknown as Window).AudioScheduler = AudioScheduler;
(globalThis as unknown as Window).NoteExtractor = NoteExtractor;
(globalThis as unknown as Window).PianoWakeLock = PianoWakeLock;
(globalThis as unknown as Window).SectionEditor = SectionEditor;
(globalThis as unknown as Window).SettingsPanel = SettingsPanel;
(globalThis as unknown as Window).AudioInit = AudioInit;
(globalThis as unknown as Window).UserSongsUi = UserSongsUi;
(globalThis as unknown as Window).ThemeControls = ThemeControls;
(globalThis as unknown as Window).PracticeFlow = PracticeFlow;
(globalThis as unknown as Window).SongPanelControls = SongPanelControls;
(globalThis as unknown as Window).SongPanelRender = SongPanelRender;
(globalThis as unknown as Window).PracticeTick = PracticeTick;
(globalThis as unknown as Window).ResultCard = ResultCard;
(globalThis as unknown as Window).SessionSummary = SessionSummary;
(globalThis as unknown as Window).RenderFrame = RenderFrame;
(globalThis as unknown as Window).DevMode = DevMode;
(globalThis as unknown as Window).RenderMid = RenderMid;
(globalThis as unknown as Window).RenderLate = RenderLate;
(globalThis as unknown as Window).PracticeLane = PracticeLane;

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

await import('./legacy-app.js');
