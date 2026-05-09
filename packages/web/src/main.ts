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
import * as MidiRender from './midi-render';
import * as MicPipeline from './mic-pipeline';
import * as MidiHandlers from './midi-handlers';
import * as MidiIndicator from './midi-indicator';
import * as BleMidiParser from './ble-midi-parser';
import * as MidiDispatch from './midi-dispatch';
import * as PrefsStorage from './prefs-storage';
import * as LayoutDetect from './layout-detect';
import * as MidiPorts from './midi-ports';
import * as MidiRescan from './midi-rescan';
import * as MidiInit from './midi-init';
import * as RemoteLog from './remote-log';
import * as DomBag from './dom-bag';
import * as GameStateInit from './game-state-init';
import * as PianoConfig from './piano-config';
import * as ParticleEffects from './particle-effects';
import * as PracticeStateInit from './practice-state-init';
import * as CoreOpts from './core-opts';
import * as DevModeWireup from './dev-mode-wireup';
import * as RenderLoopWireup from './render-loop-wireup';
import * as BootSession from './boot-session';
import * as BleMidiConnect from './ble-midi-connect';
import * as ViewportLayout from './viewport-layout';
import * as OsmdInit from './osmd-init';
import * as RenderLoop from './render-loop';
import * as ScoreLoader from './score-loader';
import * as OsmdCursor from './osmd-cursor';
import * as PracticeToneAudio from './practice-tone-audio';
import * as SectionNotes from './section-notes';
import * as IntroHintUi from './intro-hint-ui';
import * as PracticeScoring from './practice-scoring';
import * as PracticeProgress from './practice-progress';
import * as ShellHelpers from './shell-helpers';
import * as StartPracticeSection from './start-practice-section';
import * as OnsetDetect from './onset-detect';
import * as SessionConfidenceUi from './session-confidence-ui';
import * as GameStateUpdate from './game-state-update';
import * as AgcController from './agc-controller';
import * as HudUpdate from './hud-update';
import * as QualityUpdate from './quality-update';
import * as QuestStateUpdate from './quest-state-update';
import * as ModalFocus from './modal-focus';
import * as SessionReset from './session-reset';
import * as UserSongsMxl from './user-songs-mxl';
import * as IntroDiag from './intro-diag';
import * as UserSongsStore from './user-songs-store';
import * as OnlineLibrary from './online-library';
import * as PlaybackOrder from './playback-order';
import * as SelectSong from './select-song';
import * as PracticeTimings from './practice-timings';
import * as MicLifecycle from './mic-lifecycle';
import * as BuiltInSongs from './built-in-songs';
import * as OsmdAdapterMod from './osmd-adapter';
import * as ShellMidi from './shell-midi';
import * as ShellAddSong from './shell-add-song';
import * as ShellOsmd from './shell-osmd';
import * as ShellAudio from './shell-audio';
import * as ShellGameUpdate from './shell-game-update';
import * as ShellMidiHandlers from './shell-midi-handlers';
import * as ShellPractice from './shell-practice';
import * as ShellUi from './shell-ui';
import * as ShellUserLibrary from './shell-user-library';
import * as ShellEffects from './shell-effects';
import * as ShellSessionState from './shell-session-state';
import * as ShellRenderLoop from './shell-render-loop';

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
    MidiRender: typeof MidiRender;
    MicPipeline: typeof MicPipeline;
    MidiHandlers: typeof MidiHandlers;
    MidiIndicator: typeof MidiIndicator;
    BleMidiParser: typeof BleMidiParser;
    MidiDispatch: typeof MidiDispatch;
    PrefsStorage: typeof PrefsStorage;
    LayoutDetect: typeof LayoutDetect;
    MidiPorts: typeof MidiPorts;
    MidiRescan: typeof MidiRescan;
    MidiInit: typeof MidiInit;
    RemoteLog: typeof RemoteLog;
    DomBag: typeof DomBag;
    GameStateInit: typeof GameStateInit;
    PianoConfig: typeof PianoConfig;
    ParticleEffects: typeof ParticleEffects;
    PracticeStateInit: typeof PracticeStateInit;
    CoreOpts: typeof CoreOpts;
    DevModeWireup: typeof DevModeWireup;
    RenderLoopWireup: typeof RenderLoopWireup;
    BootSession: typeof BootSession;
    BleMidiConnect: typeof BleMidiConnect;
    ViewportLayout: typeof ViewportLayout;
    OsmdInit: typeof OsmdInit;
    RenderLoop: typeof RenderLoop;
    ScoreLoader: typeof ScoreLoader;
    OsmdCursor: typeof OsmdCursor;
    PracticeToneAudio: typeof PracticeToneAudio;
    SectionNotes: typeof SectionNotes;
    IntroHintUi: typeof IntroHintUi;
    PracticeScoring: typeof PracticeScoring;
    PracticeProgress: typeof PracticeProgress;
    ShellHelpers: typeof ShellHelpers;
    StartPracticeSection: typeof StartPracticeSection;
    OnsetDetect: typeof OnsetDetect;
    SessionConfidenceUi: typeof SessionConfidenceUi;
    GameStateUpdate: typeof GameStateUpdate;
    AgcController: typeof AgcController;
    HudUpdate: typeof HudUpdate;
    QualityUpdate: typeof QualityUpdate;
    QuestStateUpdate: typeof QuestStateUpdate;
    ModalFocus: typeof ModalFocus;
    SessionReset: typeof SessionReset;
    UserSongsMxl: typeof UserSongsMxl;
    IntroDiag: typeof IntroDiag;
    UserSongsStore: typeof UserSongsStore;
    OnlineLibrary: typeof OnlineLibrary;
    PlaybackOrder: typeof PlaybackOrder;
    SelectSong: typeof SelectSong;
    PracticeTimings: typeof PracticeTimings;
    MicLifecycle: typeof MicLifecycle;
    BuiltInSongs: typeof BuiltInSongs;
    OsmdAdapterMod: typeof OsmdAdapterMod;
    ShellMidi: typeof ShellMidi;
    ShellAddSong: typeof ShellAddSong;
    ShellOsmd: typeof ShellOsmd;
    ShellAudio: typeof ShellAudio;
    ShellGameUpdate: typeof ShellGameUpdate;
    ShellMidiHandlers: typeof ShellMidiHandlers;
    ShellPractice: typeof ShellPractice;
    ShellUi: typeof ShellUi;
    ShellUserLibrary: typeof ShellUserLibrary;
    ShellEffects: typeof ShellEffects;
    ShellSessionState: typeof ShellSessionState;
    ShellRenderLoop: typeof ShellRenderLoop;
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

  var MidiRender: typeof import('./midi-render');

  var MicPipeline: typeof import('./mic-pipeline');

  var MidiHandlers: typeof import('./midi-handlers');

  var MidiIndicator: typeof import('./midi-indicator');

  var BleMidiParser: typeof import('./ble-midi-parser');

  var MidiDispatch: typeof import('./midi-dispatch');

  var PrefsStorage: typeof import('./prefs-storage');

  var LayoutDetect: typeof import('./layout-detect');

  var MidiPorts: typeof import('./midi-ports');

  var MidiRescan: typeof import('./midi-rescan');

  var MidiInit: typeof import('./midi-init');

  var RemoteLog: typeof import('./remote-log');

  var DomBag: typeof import('./dom-bag');

  var GameStateInit: typeof import('./game-state-init');

  var PianoConfig: typeof import('./piano-config');

  var ParticleEffects: typeof import('./particle-effects');

  var PracticeStateInit: typeof import('./practice-state-init');

  var CoreOpts: typeof import('./core-opts');

  var DevModeWireup: typeof import('./dev-mode-wireup');

  var RenderLoopWireup: typeof import('./render-loop-wireup');

  var BootSession: typeof import('./boot-session');

  var BleMidiConnect: typeof import('./ble-midi-connect');

  var ViewportLayout: typeof import('./viewport-layout');

  var OsmdInit: typeof import('./osmd-init');

  var RenderLoop: typeof import('./render-loop');

  var ScoreLoader: typeof import('./score-loader');

  var OsmdCursor: typeof import('./osmd-cursor');

  var PracticeToneAudio: typeof import('./practice-tone-audio');

  var SectionNotes: typeof import('./section-notes');

  var IntroHintUi: typeof import('./intro-hint-ui');

  var PracticeScoring: typeof import('./practice-scoring');

  var PracticeProgress: typeof import('./practice-progress');

  var ShellHelpers: typeof import('./shell-helpers');

  var StartPracticeSection: typeof import('./start-practice-section');

  var OnsetDetect: typeof import('./onset-detect');

  var SessionConfidenceUi: typeof import('./session-confidence-ui');

  var GameStateUpdate: typeof import('./game-state-update');

  var AgcController: typeof import('./agc-controller');

  var HudUpdate: typeof import('./hud-update');

  var QualityUpdate: typeof import('./quality-update');

  var QuestStateUpdate: typeof import('./quest-state-update');

  var ModalFocus: typeof import('./modal-focus');

  var SessionReset: typeof import('./session-reset');

  var UserSongsMxl: typeof import('./user-songs-mxl');

  var IntroDiag: typeof import('./intro-diag');

  var UserSongsStore: typeof import('./user-songs-store');

  var OnlineLibrary: typeof import('./online-library');

  var PlaybackOrder: typeof import('./playback-order');

  var SelectSong: typeof import('./select-song');

  var PracticeTimings: typeof import('./practice-timings');

  var MicLifecycle: typeof import('./mic-lifecycle');

  var BuiltInSongs: typeof import('./built-in-songs');

  var OsmdAdapterMod: typeof import('./osmd-adapter');

  var ShellMidi: typeof import('./shell-midi');

  var ShellAddSong: typeof import('./shell-add-song');

  var ShellOsmd: typeof import('./shell-osmd');

  var ShellAudio: typeof import('./shell-audio');

  var ShellGameUpdate: typeof import('./shell-game-update');

  var ShellMidiHandlers: typeof import('./shell-midi-handlers');

  var ShellPractice: typeof import('./shell-practice');

  var ShellUi: typeof import('./shell-ui');

  var ShellUserLibrary: typeof import('./shell-user-library');

  var ShellEffects: typeof import('./shell-effects');

  var ShellSessionState: typeof import('./shell-session-state');

  var ShellRenderLoop: typeof import('./shell-render-loop');
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
(globalThis as unknown as Window).MidiRender = MidiRender;
(globalThis as unknown as Window).MicPipeline = MicPipeline;
(globalThis as unknown as Window).MidiHandlers = MidiHandlers;
(globalThis as unknown as Window).MidiIndicator = MidiIndicator;
(globalThis as unknown as Window).BleMidiParser = BleMidiParser;
(globalThis as unknown as Window).MidiDispatch = MidiDispatch;
(globalThis as unknown as Window).PrefsStorage = PrefsStorage;
(globalThis as unknown as Window).LayoutDetect = LayoutDetect;
(globalThis as unknown as Window).MidiPorts = MidiPorts;
(globalThis as unknown as Window).MidiRescan = MidiRescan;
(globalThis as unknown as Window).MidiInit = MidiInit;
(globalThis as unknown as Window).RemoteLog = RemoteLog;
(globalThis as unknown as Window).DomBag = DomBag;
(globalThis as unknown as Window).GameStateInit = GameStateInit;
(globalThis as unknown as Window).PianoConfig = PianoConfig;
(globalThis as unknown as Window).ParticleEffects = ParticleEffects;
(globalThis as unknown as Window).PracticeStateInit = PracticeStateInit;
(globalThis as unknown as Window).CoreOpts = CoreOpts;
(globalThis as unknown as Window).DevModeWireup = DevModeWireup;
(globalThis as unknown as Window).RenderLoopWireup = RenderLoopWireup;
(globalThis as unknown as Window).BootSession = BootSession;
(globalThis as unknown as Window).BleMidiConnect = BleMidiConnect;
(globalThis as unknown as Window).ViewportLayout = ViewportLayout;
(globalThis as unknown as Window).OsmdInit = OsmdInit;
(globalThis as unknown as Window).RenderLoop = RenderLoop;
(globalThis as unknown as Window).ScoreLoader = ScoreLoader;
(globalThis as unknown as Window).OsmdCursor = OsmdCursor;
(globalThis as unknown as Window).PracticeToneAudio = PracticeToneAudio;
(globalThis as unknown as Window).SectionNotes = SectionNotes;
(globalThis as unknown as Window).IntroHintUi = IntroHintUi;
(globalThis as unknown as Window).PracticeScoring = PracticeScoring;
(globalThis as unknown as Window).PracticeProgress = PracticeProgress;
(globalThis as unknown as Window).ShellHelpers = ShellHelpers;
(globalThis as unknown as Window).StartPracticeSection = StartPracticeSection;
(globalThis as unknown as Window).OnsetDetect = OnsetDetect;
(globalThis as unknown as Window).SessionConfidenceUi = SessionConfidenceUi;
(globalThis as unknown as Window).GameStateUpdate = GameStateUpdate;
(globalThis as unknown as Window).AgcController = AgcController;
(globalThis as unknown as Window).HudUpdate = HudUpdate;
(globalThis as unknown as Window).QualityUpdate = QualityUpdate;
(globalThis as unknown as Window).QuestStateUpdate = QuestStateUpdate;
(globalThis as unknown as Window).ModalFocus = ModalFocus;
(globalThis as unknown as Window).SessionReset = SessionReset;
(globalThis as unknown as Window).UserSongsMxl = UserSongsMxl;
(globalThis as unknown as Window).IntroDiag = IntroDiag;
(globalThis as unknown as Window).UserSongsStore = UserSongsStore;
(globalThis as unknown as Window).OnlineLibrary = OnlineLibrary;
(globalThis as unknown as Window).PlaybackOrder = PlaybackOrder;
(globalThis as unknown as Window).SelectSong = SelectSong;
(globalThis as unknown as Window).PracticeTimings = PracticeTimings;
(globalThis as unknown as Window).MicLifecycle = MicLifecycle;
(globalThis as unknown as Window).BuiltInSongs = BuiltInSongs;
(globalThis as unknown as Window).OsmdAdapterMod = OsmdAdapterMod;
(globalThis as unknown as Window).ShellMidi = ShellMidi;
(globalThis as unknown as Window).ShellAddSong = ShellAddSong;
(globalThis as unknown as Window).ShellOsmd = ShellOsmd;
(globalThis as unknown as Window).ShellAudio = ShellAudio;
(globalThis as unknown as Window).ShellGameUpdate = ShellGameUpdate;
(globalThis as unknown as Window).ShellMidiHandlers = ShellMidiHandlers;
(globalThis as unknown as Window).ShellPractice = ShellPractice;
(globalThis as unknown as Window).ShellUi = ShellUi;
(globalThis as unknown as Window).ShellUserLibrary = ShellUserLibrary;
(globalThis as unknown as Window).ShellEffects = ShellEffects;
(globalThis as unknown as Window).ShellSessionState = ShellSessionState;
(globalThis as unknown as Window).ShellRenderLoop = ShellRenderLoop;

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
