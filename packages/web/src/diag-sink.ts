// Device diagnostics that survive a dead log stream.
//
// =====================================================================
// Why this exists
// =====================================================================
//
// Capacitor forwards `console.log` to the iOS device log, and the way to read
// that during development is `xcrun devicectl device process launch --console`.
// That stream is attached to the process devicectl launched, and it STOPS
// DELIVERING while the process keeps running — backgrounding the app, a screen
// lock, or a tunnel hiccup is enough. Nothing says it stopped: the log file
// simply never grows again.
//
// The cost of not noticing is high, because the questions that need a device
// are exactly the ones that cannot be answered from a desk ("does the slider
// receive the touch", "which input is live"). Several debugging rounds were
// spent asking for an interaction, reading an empty log, and concluding the
// wrong thing — the app was fine, the pipe was not.
//
// So diagnostics are ALSO written to `localStorage`, where they can be pulled
// off the device on demand and independently of any live stream:
//
//   xcrun devicectl device copy from --device <UDID> \
//     --domain-type appDataContainer --domain-identifier com.pianovisualizer.app \
//     --source Library/WebKit/WebsiteData/Default --destination ./pull
//
// (WebKit stores localStorage in a SQLite `ItemTable`, values UTF-16LE.)
//
// That is the last-resort path. The ring is also rendered in the on-device diag
// panel (`?dev=1` or the 5-tap gesture), which is where the person actually
// holding the iPad can read it without a cable.
//
// Deliberately NOT `remoteLog`: that is hard-disabled in the native build for
// App Store compliance, which is precisely the build being tested.

import { safeLocalStorage } from './prefs-storage';
import type { JSONStorage } from './prefs-storage';

/** Newest-first ring of recent diagnostic lines. */
const KEY = 'pianoViz_diag';
/** Enough to cover one debugging session's worth of state changes without
 *  turning a 5 MB localStorage budget into a log file. */
const MAX_LINES = 120;

let store: JSONStorage | null | undefined;

/** localStorage, or null where the accessor itself throws (Safari private mode,
 *  sandboxed iframe). `safeLocalStorage` is the codebase's one answer to that —
 *  this module had grown a second copy. Deliberately NOT `createJSONStore`: a
 *  failed diagnostic write must not fire the "your records aren't being saved"
 *  banner that store raises, since no record was at stake. */
function getStore(): JSONStorage | null {
  if (store === undefined) store = safeLocalStorage();
  return store;
}

let buffer: string[] = [];
let loaded = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Write the ring out, at most once per idle moment.
 *
 * `setItem` is SYNCHRONOUS and takes the whole serialized ring, so doing it per
 * line put a ~12 KB `JSON.stringify` plus a storage write inside every logged
 * event — including the pointermoves of a drag, which is exactly the interaction
 * these diagnostics were added to characterise. The ring's whole purpose is to
 * be readable LATER, so it does not need to be durable per line; a short debounce
 * plus a flush when the page goes away covers every way the app is closed.
 */
function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(flushNow, 1000);
}

function flushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    getStore()?.setItem(KEY, JSON.stringify(buffer));
  } catch {
    /* quota / private mode — the console half still works */
  }
}

// iOS never fires `unload` reliably and can kill a backgrounded WKWebView
// outright; `pagehide` + `visibilitychange` are the two events that do arrive.
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', flushNow);
  globalThis.addEventListener('visibilitychange', () => {
    if (globalThis.document?.visibilityState === 'hidden') flushNow();
  });
}

/**
 * Record one diagnostic line. Goes to the console (for a live stream, when
 * there is one) AND to the localStorage ring (for when there isn't).
 *
 * `tag` is the bracketed prefix the console line already uses — `INPUT`,
 * `SLIDER`, `AUDIO` — so the two channels read identically.
 */
export function diag(tag: string, detail: unknown): void {
  const body = typeof detail === 'string' ? detail : JSON.stringify(detail);
  const line = '[' + tag + '] ' + body;
  console.log(line);

  const s = getStore();
  if (!s) return;
  if (!loaded) {
    loaded = true;
    try {
      const prev = s.getItem(KEY);
      buffer = prev ? (JSON.parse(prev) as string[]) : [];
      if (!Array.isArray(buffer)) buffer = [];
    } catch {
      buffer = [];
    }
  }
  // A wall-clock stamp, because the ring is read long after the fact and the
  // ORDER of two state changes is usually the whole question.
  buffer.push(new Date().toISOString().slice(11, 23) + ' ' + line);
  if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
  scheduleFlush();
}

/** Drop the stored ring. Exposed for the settings "reset" paths and tests. */
export function clearDiag(): void {
  buffer = [];
  loaded = true;
  flushNow();
}

/** The ring as stored, oldest first. Used by tests and by any future in-app
 *  "copy diagnostics" affordance. */
export function readDiag(): string[] {
  // The in-memory buffer is the truth once anything has been logged this
  // session — storage lags it by up to one debounce. Reading storage first
  // would show a live reader (the dev panel) a stale tail.
  if (loaded) return buffer.slice();
  const s = getStore();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
