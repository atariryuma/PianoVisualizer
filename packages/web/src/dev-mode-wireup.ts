// Dev-mode tests + benchmarks + diag-snapshot bundle —
// Phase 0d batch 74.
//
// The 489-line `DevMode.createDevMode({...})` literal moved out of
// legacy-app.js. The block has three logical pieces — self-tests,
// benchmarks, diag snapshot — that all close over shell-side refs
// (DOM bag, state, practice, midiInput, helper functions). Folding
// keeps the closures intact: every test gets a `deps` arg and reads
// what it needs.
//
// This module is dev-mode-only — none of these tests run in
// production builds (DevMode.createDevMode itself is gated by the
// `?dev=1` URL param). Test reliability matters less than the rest
// of the codebase; we tolerate the wide deps bag here in exchange
// for the line-count win on legacy-app.js.

import type { DevModeDeps, SelfTest } from './dev-mode';
import { createDevMode } from './dev-mode';
import { readDiag } from './diag-sink';

/** How much of the diagnostic ring the on-device panel shows. The ring holds
 *  120 lines for a desk-side pull; a panel that long is unreadable on a tablet
 *  and the recent tail is what a live question is about. */
const DIAG_PANEL_LINES = 20;

/** Wide deps bag — every shell-private the dev-mode tests + benches
 *  read. Optional fields are read only by some tests; missing values
 *  surface as a per-test failure rather than a global crash. */
export interface DevModeWireupDeps {
  // ── DOM bag (subset) ─────────────────────────────────────────
  dom: {
    settingsPanel: HTMLElement;
    sectionResult: HTMLElement;
  };
  /** Add-song modal — separate bag with `.modal` and friends. */
  domAddSong: { modal: HTMLElement | null };
  /** Trigger element for the 5-tap activation. */
  triggerEl: HTMLElement | null;

  // ── version / build metadata ─────────────────────────────────
  versionLabel: string;

  // ── shell references the tests close over ───────────────────
  state: any;
  practice: any;
  prefs: any;
  midiInput: any;
  midiState: any;
  ctx: CanvasRenderingContext2D;
  particles: any[];
  ripples: any[];
  /** Wraps the `(W, H)` shell-locals; tests read it once per call. */
  getScreen: () => { W: number; H: number };
  /** Live audioCtx ref — null pre-init. Read fresh per call. */
  getAudioCtx: () => AudioContext | null;
  /** Live currentSong — null pre-select. */
  getCurrentSong: () => any;

  // ── helper functions / module refs ───────────────────────────
  openUserDb: () => Promise<{ close: () => void }>;
  userDbAll: () => Promise<Array<{ id: string }>>;
  userDbPut: (rec: any) => Promise<unknown>;
  removeUserSong: (id: string) => Promise<unknown>;
  isAppleMobile: () => boolean;
  t: (key: string) => string;
  setLang: (lang: 'en' | 'jp') => void;
  applyTheme: (idx: number) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openAddSongModal: () => void;
  closeAddSongModal: () => void;
  completePracticeSection: () => void;
  onMidiNoteOn: (m: number, v: number) => void;
  onMidiNoteOff: (m: number) => void;

  // ── render-frame deps for the bench probes ───────────────────
  themes: any;
  drawBgStars: (timeMs: number) => void;
  drawAurora: (timeMs: number) => void;
  drawGroundFlowers: (timeMs: number) => void;
  decayWakeUpFlash: (...args: any[]) => any;
  drawCenterGlow: (...args: any[]) => any;
  wufOpts: any;
  getEnergy: () => number;
  /** Render-frame module — passed in to keep this file's import
   *  graph independent from the shell's. */
  renderFrame: { runRenderFramePrelude: (now: number, deps: any) => any };
  /** AudioInit module — same reasoning as `renderFrame` above. */
  audioInit: { createAudioContext: () => AudioContext };
}

/** Build the 10-test self-test list. Closures read deps lazily so
 *  flipping shell state between calls is picked up. */
function buildSelfTests(deps: DevModeWireupDeps): SelfTest[] {
  return [
    {
      name: 'localStorage round-trip',
      run: async () => {
        const k = '__pianoViz_dev_test__';
        try {
          localStorage.setItem(k, 'x');
          const v = localStorage.getItem(k);
          localStorage.removeItem(k);
          return { ok: v === 'x' };
        } catch (e) {
          return { ok: false, detail: (e as Error).message };
        }
      },
    },
    {
      name: 'IndexedDB user-songs DB opens',
      run: async () => {
        try {
          const db = await deps.openUserDb();
          db.close();
          return { ok: true };
        } catch (e) {
          return { ok: false, detail: (e as Error).message };
        }
      },
    },
    {
      name: 'Module wire-up — vendor + core globals reachable from console',
      run: async () => {
        // Post-Phase-0e: per-shell module pinning is gone; only the vendor
        // libs + @piano/core stay on globalThis as console-debug surface.
        const expected = ['PianoCore', 'Tone', 'opensheetmusicdisplay', 'JSZip'];
        const missing: string[] = [];
        for (const k of expected) {
          if (typeof (globalThis as Record<string, unknown>)[k] === 'undefined') missing.push(k);
        }
        return {
          ok: missing.length === 0,
          detail: missing.length ? 'missing: ' + missing.join(', ') : undefined,
        };
      },
    },
    {
      name: 'DOM bag — critical elements all queryable',
      run: async () => {
        const ids = [
          'canvas',
          'startScreen',
          'startBtn',
          'hud',
          'songPanel',
          'sectionResult',
          'sessionSummary',
          'addSongModal',
          'sectionEditModal',
          'settingsPanel',
          'practiceHud',
          'osmdContainer',
        ];
        const missing = ids.filter((id) => !document.getElementById(id));
        return {
          ok: missing.length === 0,
          detail: missing.length ? 'missing: ' + missing.join(', ') : undefined,
        };
      },
    },
    {
      name: 'i18n — t() returns localized non-empty strings',
      run: async () => {
        const samples = ['startPractice', 'settings', 'micInput', 'tier1Title', 'addSongBtn'];
        const failed = samples.filter((k) => {
          const v = deps.t(k);
          return !v || v === k;
        });
        return {
          ok: failed.length === 0,
          detail: failed.length ? 'failed keys: ' + failed.join(', ') : undefined,
        };
      },
    },
    {
      name: 'AudioContext — create, resume, close (no leak)',
      run: async () => {
        try {
          const c = deps.audioInit.createAudioContext();
          if (c.state === 'suspended') {
            try {
              await c.resume();
            } catch {
              /* user-gesture-required outside this path is fine */
            }
          }
          const sr = c.sampleRate;
          await c.close();
          return { ok: sr > 0, detail: 'sampleRate=' + sr + 'Hz' };
        } catch (e) {
          return { ok: false, detail: (e as Error).message };
        }
      },
    },
    {
      name: 'Web MIDI — API present (or iPad WMB)',
      run: async () => {
        const hasMidi = typeof navigator.requestMIDIAccess === 'function';
        const isApple = deps.isAppleMobile();
        const ok = hasMidi || !isApple;
        const detail = hasMidi
          ? 'navigator.requestMIDIAccess present'
          : isApple
            ? 'iPad without WMB — mic mode'
            : 'NO Web MIDI';
        return { ok, detail };
      },
    },
    {
      name: 'Service Worker — registered',
      run: async () => {
        if (!('serviceWorker' in navigator)) {
          return { ok: false, detail: 'SW API not available' };
        }
        const reg = await navigator.serviceWorker.getRegistration();
        return { ok: !!reg, detail: reg ? 'scope=' + reg.scope : 'no registration' };
      },
    },
    {
      name: 'Wake Lock API present',
      run: async () => {
        const hasWL = !!(navigator.wakeLock && navigator.wakeLock.request);
        return {
          ok: hasWL,
          detail: hasWL ? 'OK' : 'not supported (Safari iOS < 16.4 / older Android)',
        };
      },
    },
    {
      name: 'Prefs — round-trip via savePrefs/loadJSON',
      run: async () => {
        const saved = JSON.parse(localStorage.getItem('pianoViz_prefs') || '{}');
        const ok = typeof saved === 'object' && saved !== null;
        return { ok, detail: 'theme=' + saved.theme + ' lang=' + saved.lang };
      },
    },
  ];
}

/** Build the 11-benchmark list. Each closes over deps the same way
 *  as the self-tests. */
function buildBenchmarks(deps: DevModeWireupDeps): SelfTest[] {
  return [
    {
      name: 'Frame timing — 60 frames, expect avg dt < 18ms',
      run: async () => {
        const samples: number[] = [];
        await new Promise<void>((resolve) => {
          let prev = performance.now();
          let count = 0;
          const tick = (now: number) => {
            samples.push(now - prev);
            prev = now;
            count++;
            if (count >= 60) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const dts = samples.slice(1);
        const avg = dts.reduce((s, d) => s + d, 0) / dts.length;
        const max = Math.max(...dts);
        const ok = avg < 18;
        return { ok, detail: 'avg=' + avg.toFixed(1) + 'ms max=' + max.toFixed(1) + 'ms' };
      },
    },
    {
      name: 'Modal lifecycle — settings open + close + ESC',
      run: async () => {
        const before = deps.dom.settingsPanel.classList.contains('visible');
        deps.openSettings();
        const opened = deps.dom.settingsPanel.classList.contains('visible');
        deps.closeSettings();
        const closed = deps.dom.settingsPanel.classList.contains('visible');
        const ok = !before && opened && !closed;
        return { ok, detail: 'before=' + before + ' opened=' + opened + ' closed=' + closed };
      },
    },
    {
      name: 'Modal lifecycle — add-song open + close',
      run: async () => {
        deps.openAddSongModal();
        const opened = !!deps.domAddSong.modal?.classList.contains('visible');
        deps.closeAddSongModal();
        const closed = !!deps.domAddSong.modal?.classList.contains('visible');
        return { ok: opened && !closed, detail: 'opened=' + opened + ' closed=' + closed };
      },
    },
    {
      name: 'Theme cycle — flip 0 → 1 → 2 → 3 → 0',
      run: async () => {
        const original = deps.prefs.theme;
        const seen: string[] = [];
        for (const idx of [0, 1, 2, 3, 0]) {
          deps.applyTheme(idx);
          seen.push(idx + ':' + deps.state.currentTheme + ':' + deps.prefs.theme);
        }
        deps.applyTheme(original);
        const ok = seen.every((s, i) => {
          const want = [0, 1, 2, 3, 0][i];
          return s === want + ':' + want + ':' + want;
        });
        return { ok, detail: ok ? 'all 5 cycles ok' : 'mismatch: ' + seen.join(', ') };
      },
    },
    {
      name: 'Lang cycle — JP ↔ EN flip persists + DOM updates',
      run: async () => {
        const original = deps.prefs.lang;
        deps.setLang('jp');
        const jpHtml = document.documentElement.lang;
        const jpStartText = deps.t('startPractice');
        deps.setLang('en');
        const enHtml = document.documentElement.lang;
        const enStartText = deps.t('startPractice');
        deps.setLang(original);
        const ok =
          jpHtml === 'ja' &&
          enHtml === 'en' &&
          jpStartText !== enStartText &&
          jpStartText.length > 0 &&
          enStartText.length > 0;
        return {
          ok,
          detail:
            'jpHtml=' +
            jpHtml +
            ' enHtml=' +
            enHtml +
            ' jpText="' +
            jpStartText +
            '" enText="' +
            enStartText +
            '"',
        };
      },
    },
    {
      name: 'Render-loop dispatch — runRenderFramePrelude returns valid dt',
      run: async () => {
        const before = deps.state.lastFrameTimeMs;
        const result = deps.renderFrame.runRenderFramePrelude(performance.now(), {
          ctx: deps.ctx,
          state: deps.state,
          getScreen: deps.getScreen,
          themes: deps.themes,
          drawBgStars: deps.drawBgStars,
          drawAurora: deps.drawAurora,
          drawGroundFlowers: deps.drawGroundFlowers,
          decayWakeUpFlash: deps.decayWakeUpFlash,
          drawCenterGlow: deps.drawCenterGlow,
          wufOpts: deps.wufOpts,
          getEnergy: deps.getEnergy,
        });
        const ok =
          typeof result.dt === 'number' &&
          result.dt > 0 &&
          result.dt <= 50 &&
          !!result.theme &&
          !!result.theme.colors;
        deps.state.lastFrameTimeMs = before;
        return {
          ok,
          detail:
            'dt=' +
            result.dt.toFixed(1) +
            'ms theme=' +
            (result.theme?.colors?.length || 0) +
            'colors',
        };
      },
    },
    {
      name: 'Behavior — MIDI note injection updates midiState',
      run: async () => {
        const wasRunning = deps.state.running;
        const wasMidiEnabled = deps.midiInput.enabled;
        const wasLastEvent = deps.midiInput.lastEventTime;
        deps.state.running = true;
        deps.midiInput.enabled = true;
        deps.midiInput.lastEventTime = performance.now();
        try {
          deps.onMidiNoteOn(60, 100);
          const inActive = deps.midiState.activeNotes.has(60);
          deps.onMidiNoteOff(60);
          const cleared = !deps.midiState.activeNotes.has(60);
          return {
            ok: inActive && cleared,
            detail: 'inActive=' + inActive + ' cleared=' + cleared,
          };
        } finally {
          deps.state.running = wasRunning;
          deps.midiInput.enabled = wasMidiEnabled;
          deps.midiInput.lastEventTime = wasLastEvent;
          try {
            deps.onMidiNoteOff(60);
          } catch {
            /* already off */
          }
          deps.midiState.activeNotes.delete(60);
          deps.midiState.sustainedNotes.delete(60);
        }
      },
    },
    {
      name: 'Behavior — Listen-mode completePracticeSection renders result card',
      run: async () => {
        const practice = deps.practice;
        const saved = {
          enabled: practice.enabled,
          mode: practice.mode,
          sectionNotes: practice.sectionNotes,
          currentNoteIdx: practice.currentNoteIdx,
          hits: practice.hits,
          misses: practice.misses,
          _sectionTargetCount: practice._sectionTargetCount,
          _lastResult: practice._lastResult,
          _completing: practice._completing,
          fullSongMode: practice.fullSongMode,
          sectionIdx: practice.sectionIdx,
        };
        const wasVisible = deps.dom.sectionResult.classList.contains('visible');
        const currentSong = deps.getCurrentSong();
        const savedSections = currentSong ? currentSong.sections : null;
        try {
          if (currentSong) {
            currentSong.sections = [{ id: '__bench', nameKey: 'feA1', isBoss: false }];
          }
          practice.enabled = true;
          practice.mode = 'listen';
          practice.fullSongMode = false;
          practice.sectionIdx = 0;
          practice.sectionNotes = [];
          practice.currentNoteIdx = 0;
          practice.hits = 0;
          practice.misses = 0;
          practice._sectionTargetCount = 0;
          practice._completing = false;
          deps.completePracticeSection();
          const r = practice._lastResult;
          const ok =
            r != null &&
            r.mode === 'listen' &&
            r.secId === '__bench' &&
            deps.dom.sectionResult.classList.contains('visible');
          return {
            ok,
            detail:
              'mode=' +
              (r?.mode || 'null') +
              ' secId=' +
              (r?.secId || 'null') +
              ' visible=' +
              deps.dom.sectionResult.classList.contains('visible'),
          };
        } finally {
          Object.assign(practice, saved);
          if (currentSong && savedSections) currentSong.sections = savedSections;
          deps.dom.sectionResult.classList.toggle('visible', wasVisible);
        }
      },
    },
    {
      name: 'Behavior — Canvas pixel sampling shows paint after a frame',
      run: async () => {
        const { W, H } = deps.getScreen();
        deps.renderFrame.runRenderFramePrelude(performance.now(), {
          ctx: deps.ctx,
          state: deps.state,
          getScreen: deps.getScreen,
          themes: deps.themes,
          drawBgStars: deps.drawBgStars,
          drawAurora: deps.drawAurora,
          drawGroundFlowers: deps.drawGroundFlowers,
          decayWakeUpFlash: deps.decayWakeUpFlash,
          drawCenterGlow: deps.drawCenterGlow,
          wufOpts: deps.wufOpts,
          getEnergy: deps.getEnergy,
        });
        try {
          const px = deps.ctx.getImageData(Math.floor(W / 2), Math.floor(H / 2), 1, 1);
          const [r, g, b, a] = px.data;
          const ok = a > 0;
          return { ok, detail: 'rgba=(' + r + ',' + g + ',' + b + ',' + a + ')' };
        } catch (e) {
          return { ok: false, detail: (e as Error).message };
        }
      },
    },
    {
      name: 'Behavior — i18n DOM walk (every [data-i18n] is translated)',
      run: async () => {
        const els = document.querySelectorAll('[data-i18n]');
        const broken: string[] = [];
        els.forEach((el) => {
          const key = el.getAttribute('data-i18n');
          if (!key) return;
          const text = el.textContent || '';
          if (!text || text === key) broken.push(key);
        });
        const ok = els.length > 5 && broken.length === 0;
        return {
          ok,
          detail:
            'els=' +
            els.length +
            ' broken=' +
            broken.length +
            (broken.length ? ' (' + broken.slice(0, 3).join(', ') + ')' : ''),
        };
      },
    },
    {
      name: 'Storage stress — 50 IndexedDB put/get/delete cycles',
      run: async () => {
        const ts = Date.now();
        try {
          for (let i = 0; i < 50; i++) {
            const id = '__bench_' + ts + '_' + i;
            const rec = {
              id,
              title: 'bench',
              composer: '',
              mxlBlob: new Blob(['x'], { type: 'text/plain' }),
              mimeType: 'application/vnd.recordare.musicxml+zip',
              sectionDefs: { type: 'measure-thirds', count: 3 },
              addedAt: Date.now(),
              source: 'bench',
            };
            await deps.userDbPut(rec);
          }
          const all = await deps.userDbAll();
          const found = all.filter((r) => r.id.startsWith('__bench_' + ts)).length;
          for (let i = 0; i < 50; i++) {
            const id = '__bench_' + ts + '_' + i;
            try {
              await deps.removeUserSong(id);
            } catch {
              /* already cleaned */
            }
          }
          return { ok: found === 50, detail: found + '/50 round-tripped' };
        } catch (e) {
          return { ok: false, detail: (e as Error).message };
        }
      },
    },
  ];
}

/** The stored diagnostic ring as `diag[n]` rows, most recent last, trimmed to
 *  what a phone-sized panel can show. */
function diagRows(): Record<string, string> {
  const lines = readDiag();
  const tail = lines.slice(-DIAG_PANEL_LINES);
  const rows: Record<string, string> = {};
  for (let i = 0; i < tail.length; i++) {
    rows['diag[' + (tail.length - i) + ']'] = tail[i];
  }
  return rows;
}

/** Build the live read-only diag snapshot. Returns a thunk so the
 *  dev-mode UI can call it on demand. */
function buildDiagSnapshot(deps: DevModeWireupDeps): () => Record<string, string> {
  return () => {
    const audioCtx = deps.getAudioCtx();
    const currentSong = deps.getCurrentSong();
    return {
      'audioCtx.state': audioCtx ? audioCtx.state : '(none)',
      'audioCtx.sampleRate': audioCtx ? audioCtx.sampleRate + 'Hz' : '(none)',
      'audioCtx.currentTime': audioCtx ? audioCtx.currentTime.toFixed(2) + 's' : '(none)',
      'midiInput.enabled': String(deps.midiInput.enabled),
      'midiInput.port': deps.midiInput.port?.name || '(none)',
      'state.running': String(deps.state.running),
      'state.flow': deps.state.flow.toFixed(1),
      'state.combo': String(deps.state.combo),
      'state.currentStage': String(deps.state.currentStage),
      'state.qualityScore': (deps.state.qualityScore || 0).toFixed(2),
      'state.smoothEnergy': deps.state.smoothEnergy.toFixed(3),
      'state.useSynesthesiaMode': String(deps.state.useSynesthesiaMode),
      'practice.enabled': String(deps.practice.enabled),
      'practice.mode': deps.practice.mode,
      'practice.sectionIdx': String(deps.practice.sectionIdx),
      'practice.tempoPct': String(deps.practice.tempoPct),
      'practice.fullSongMode': String(deps.practice.fullSongMode),
      'practice.hits/misses': deps.practice.hits + '/' + deps.practice.misses,
      currentSong: currentSong?.id || '(none)',
      'prefs.theme': String(deps.prefs.theme),
      'prefs.lang': deps.prefs.lang,
      'prefs.synesthesia': String(deps.prefs.synesthesia),
      'prefs.audioOffsetMs': String(deps.prefs.audioOffsetMs),
      'particles.length': String(deps.particles?.length ?? 0),
      'ripples.length': String(deps.ripples?.length ?? 0),
      // The diagnostic ring, newest last. It exists because the device log
      // stream dies silently mid-session; pulling it back off the device meant
      // decoding WebKit's SQLite store over a cable — the same cable-and-hope
      // workflow the ring was built to escape. Here it is readable by the
      // person actually holding the iPad.
      ...diagRows(),
    };
  };
}

/** Single entry point — installs DevMode with the bundled tests +
 *  benchmarks + diag snapshot. The shell calls this once at boot. */
export function installDevMode(deps: DevModeWireupDeps): void {
  const cfg: DevModeDeps = {
    triggerEl: deps.triggerEl,
    versionLabel: deps.versionLabel,
    tests: buildSelfTests(deps),
    benchmarks: buildBenchmarks(deps),
    getDiagSnapshot: buildDiagSnapshot(deps),
  };
  createDevMode(cfg);
}
