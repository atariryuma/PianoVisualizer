// Web shell entry — Phase 0b.3 Stage 1A.
//
// Replaces the legacy 5-script bootstrap (CDN tone / OSMD / jszip + the
// dist-legacy IIFE core bundle + app.js) with a single module entry. Tone /
// OSMD / JSZip / @piano/core come in via npm imports and get pinned to
// `globalThis` so the still-vanilla legacy app.js (imported for side effects
// at the end) keeps working unchanged.
//
// Why globals at all? The legacy app.js references `Tone.*`, `JSZip`,
// `opensheetmusicdisplay.OpenSheetMusicDisplay`, and `PianoCore.*` as
// browser globals because that's what the CDN <script> tags + the
// dist-legacy IIFE expose. Migrating each call site to ESM imports is
// Phase 0c TypeScript work — Stage 1A keeps the surface identical.
//
// `await import('@legacy/app.js')` is dynamic so the global-seeding
// statements above it run BEFORE app.js evaluates its IIFE. With static
// imports, ES module dependency-order would evaluate app.js before main.ts's
// body and the legacy code would see undefined globals.
//
// The placeholder adapters (webmidi / webaudio-mic) are NOT wired in Stage
// 1A — the legacy app.js still drives input acquisition itself. They'll
// come into play during Phase 0c when the practice-state engine moves to
// the shell entry.

import * as Tone from 'tone';
import * as opensheetmusicdisplay from 'opensheetmusicdisplay';
import JSZip from 'jszip';
import * as PianoCore from '@piano/core';

declare global {
  interface Window {
    Tone: typeof Tone;
    opensheetmusicdisplay: typeof opensheetmusicdisplay;
    JSZip: typeof JSZip;
    PianoCore: typeof PianoCore;
  }
}

(globalThis as unknown as Window).Tone = Tone;
(globalThis as unknown as Window).opensheetmusicdisplay = opensheetmusicdisplay;
(globalThis as unknown as Window).JSZip = JSZip;
(globalThis as unknown as Window).PianoCore = PianoCore;

// Legacy app.js registers `./sw.js` on window.load. During Stage 1A the
// service-worker cache list doesn't match the Vite-hashed bundle paths, so
// we let the registration error out (caught silently by app.js itself) and
// rely on the parallel root build for offline/PWA testing. Stage 1B will
// reconcile this with VitePWA's generated manifest.

await import('@legacy/app.js');
