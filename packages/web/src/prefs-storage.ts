// Prefs storage layer — Phase 0d batch 23.
//
// Tiny localStorage wrapper used by the shell + a couple of extracted
// modules (session-summary, practice progress). Three pieces:
//
//   1. loadJSON(key, fallback) — JSON.parse with try/catch + fallback.
//   2. saveJSON(key, val) — JSON.stringify + setItem with one-shot
//      quota-exceeded warning so the user gets a single console.warn
//      on Safari Private Mode (instead of N spam-warns per session).
//   3. sanitizePrefs(raw) — accept-list-style validation. Drops unknown
//      keys; clamps theme to 0..3; coerces booleans; nulls out an
//      out-of-range audioOffsetMs.
//
// Pure aside from `localStorage` reads/writes (and a process-wide
// "have we already warned?" flag for the quota guard). Tested with
// happy-dom's localStorage shim + a quota-throwing fake.

/** Shape of the on-disk prefs payload. Mirrors the typedef in
 *  legacy-app.js (PrefsShape). Kept narrow on purpose — adding a new
 *  key here also requires extending sanitizePrefs's accept-list. */
export interface PrefsShape {
  theme?: number;
  synesthesia?: boolean;
  audioOffsetMs?: number | null;
  debug?: boolean;
  lang?: 'en' | 'jp';
}

/** Minimal localStorage-like surface. The shell hands in the real
 *  global; tests can hand in a fake to exercise quota-exceeded. */
export interface JSONStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Build a {load, save} pair against a given storage. The factory
 *  closes over the one-shot quota warning so the same storage can be
 *  silently re-tried throughout the session without console spam. */
export function createJSONStore(
  storage: JSONStorage = typeof localStorage !== 'undefined'
    ? localStorage
    : (null as unknown as JSONStorage),
  warn: (msg: string) => void = (m) => console.warn(m)
): {
  loadJSON<T>(key: string, fallback: T): T;
  saveJSON(key: string, val: unknown): void;
} {
  let quotaWarned = false;

  function loadJSON<T>(key: string, fallback: T): T {
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key: string, val: unknown): void {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(val));
    } catch (e) {
      // Safari Private Mode + storage-full both throw
      // QuotaExceededError. Without this, settings appear to apply
      // but vanish on reload. One-shot warning so a long session
      // doesn't spam the console.
      if (!quotaWarned) {
        quotaWarned = true;
        const name = (e as Error)?.name || 'Err';
        warn('[PREFS] localStorage write failed (' + name + '). Settings will not persist.');
      }
    }
  }

  return { loadJSON, saveJSON };
}

/** Validation pass — strip unknown keys, clamp known ones. An out-of-
 *  range theme/lang from a tampered localStorage payload would
 *  otherwise silently break the UI (no active theme dot, mis-rendered
 *  text). Returns a fresh object owning only the validated keys. */
export function sanitizePrefs(raw: unknown): Partial<PrefsShape> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<PrefsShape> = {};
  if (typeof r.theme === 'number' && r.theme >= 0 && r.theme < 4) {
    out.theme = r.theme | 0;
  }
  if (typeof r.synesthesia === 'boolean') {
    out.synesthesia = r.synesthesia;
  }
  if (
    r.audioOffsetMs === null ||
    (typeof r.audioOffsetMs === 'number' && isFinite(r.audioOffsetMs))
  ) {
    out.audioOffsetMs = r.audioOffsetMs as number | null;
  }
  if (typeof r.debug === 'boolean') {
    out.debug = r.debug;
  }
  if (r.lang === 'en' || r.lang === 'jp') {
    out.lang = r.lang;
  }
  return out;
}
