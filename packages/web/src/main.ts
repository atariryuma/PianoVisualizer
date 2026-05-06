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

await import('./legacy-app.js');
