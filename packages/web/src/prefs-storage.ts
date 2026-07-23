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
  lang?: 'en' | 'jp' | 'de';
  /** Note-name notation: 'abc' = C-D-E, 'solfege' = ドレミ, 'auto' =
   *  follow UI language (the pre-0.15 behavior). */
  noteNaming?: 'auto' | 'abc' | 'solfege';
  /** Practice-audio volume balance, percent 0-100 (100 = the tuned
   *  default level). 0 mutes the layer entirely. */
  volGhost?: number;
  volBacking?: number;
  volMetronome?: number;
  /** Kid-chosen nickname displayed on the journal "Pianist Card".
   *  Identity-primer per McPherson 10-year longitudinal — kids with a
   *  named long-term self-concept sustain practice the longest. */
  pianistName?: string;
  /** Long-term commitment age the kid named when setting up the card.
   *  Stored as the target *age* (not year-from-now) so the displayed
   *  countdown stays meaningful as time passes — but the journal renders
   *  it as relative ("4 months in") when current age is known. */
  pianistCommitYear?: number;
  /** Chosen avatar — one of PIANIST_AVATARS. Empty string = unset. */
  pianistAvatar?: string;
  /** Practice: show the OSMD sheet-music panel during play. Default false so
   *  the falling-notes lane is full-height (game-like — notes fall from the
   *  top of the screen); the 📜 top-bar button toggles it and the choice
   *  persists. When on, the lane sits below the score (reading aid). */
  showScore?: boolean;
  /** True once the kid dismissed / acted on the first-run welcome card, so it
   *  never re-appears. (Was previously written but not on the accept-list, so
   *  it was dropped on load — the welcome kept re-showing.) */
  welcomeDismissed?: boolean;
  /** Practice-lane note fall speed (lookahead multiplier): 'slow' = more
   *  read-ahead time, 'fast' = zippier descent. Judgement windows and the
   *  audio timeline are untouched — this is purely visual approach speed
   *  (the rhythm-game "hi-speed" setting, kid-simple 3 steps). */
  noteSpeed?: 'slow' | 'normal' | 'fast';
}

/** Minimal localStorage-like surface. The shell hands in the real
 *  global; tests can hand in a fake to exercise quota-exceeded. */
export interface JSONStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage access itself can throw in locked-down contexts (Chrome の
 *  「すべての Cookie をブロック」・sandbox iframe）: localStorage の
 *  **グローバルアクセサ評価自体**が SecurityError を投げるため、
 *  `typeof localStorage` すら安全でない。try/catch で包んで null に
 *  落とし、boot がメモリのみで degrade できるようにする。 */
export function safeLocalStorage(): JSONStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** The {load, save} pair + storage-health signals the shell needs to warn
 *  the user when progress isn't persisting (C1). Every persisted write —
 *  prefs AND practice progress — funnels through this one `saveJSON`, so a
 *  single `onSaveError` fans a "your records aren't being saved" banner out
 *  to both. */
export interface JSONStore {
  loadJSON<T>(key: string, fallback: T): T;
  /** Persist `val`. Returns true on success, false when storage is absent
   *  (private mode / blocked cookies) or the write threw (quota). */
  saveJSON(key: string, val: unknown): boolean;
  /** True when a backing storage exists at all (false ≈ private mode where
   *  even reading localStorage throws). The shell shows a persistent
   *  "records won't be saved" banner when this is false. */
  isPersistent(): boolean;
  /** Register a callback fired the FIRST time a write fails (storage absent
   *  or quota). Lets the shell surface the loss instead of swallowing it. */
  onSaveError(cb: (reason: 'unavailable' | 'quota') => void): void;
}

/** Build a {load, save} pair against a given storage. The factory
 *  closes over the one-shot quota warning so the same storage can be
 *  silently re-tried throughout the session without console spam. */
export function createJSONStore(
  storage: JSONStorage = safeLocalStorage() ?? (null as unknown as JSONStorage),
  warn: (msg: string) => void = (m) => console.warn(m)
): JSONStore {
  let quotaWarned = false;
  let errorFired = false;
  let errorCb: ((reason: 'unavailable' | 'quota') => void) | null = null;
  const fireError = (reason: 'unavailable' | 'quota'): void => {
    if (errorFired) return;
    errorFired = true;
    try {
      errorCb?.(reason);
    } catch {
      /* the banner render must never break a save path */
    }
  };

  function loadJSON<T>(key: string, fallback: T): T {
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key: string, val: unknown): boolean {
    if (!storage) {
      fireError('unavailable');
      return false;
    }
    try {
      storage.setItem(key, JSON.stringify(val));
      return true;
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
      fireError('quota');
      return false;
    }
  }

  return {
    loadJSON,
    saveJSON,
    isPersistent: () => !!storage,
    onSaveError: (cb) => {
      errorCb = cb;
    },
  };
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
  if (r.lang === 'en' || r.lang === 'jp' || r.lang === 'de') {
    out.lang = r.lang;
  }
  if (r.noteNaming === 'auto' || r.noteNaming === 'abc' || r.noteNaming === 'solfege') {
    out.noteNaming = r.noteNaming;
  }
  for (const k of ['volGhost', 'volBacking', 'volMetronome'] as const) {
    const v = r[k];
    if (typeof v === 'number' && isFinite(v)) {
      out[k] = Math.max(0, Math.min(100, Math.round(v)));
    }
  }
  if (typeof r.pianistName === 'string' && r.pianistName.trim().length > 0) {
    out.pianistName = String(r.pianistName).slice(0, 20).trim();
  }
  if (typeof r.pianistCommitYear === 'number' && r.pianistCommitYear > 1900) {
    out.pianistCommitYear = r.pianistCommitYear | 0;
  }
  if (typeof r.pianistAvatar === 'string' && PIANIST_AVATARS.includes(r.pianistAvatar)) {
    out.pianistAvatar = r.pianistAvatar;
  }
  if (typeof r.showScore === 'boolean') {
    out.showScore = r.showScore;
  }
  if (typeof r.welcomeDismissed === 'boolean') {
    out.welcomeDismissed = r.welcomeDismissed;
  }
  if (r.noteSpeed === 'slow' || r.noteSpeed === 'normal' || r.noteSpeed === 'fast') {
    out.noteSpeed = r.noteSpeed;
  }
  return out;
}

/** Avatar choices — 8 kid-friendly emojis that read as "this is me as a
 *  pianist." Identity-priming via avatar customisation (Fu et al. 2025
 *  CHI). Order is the render order in the picker. */
export const PIANIST_AVATARS: readonly string[] = Object.freeze([
  '🎹',
  '🌟',
  '🎼',
  '🎵',
  '🎶',
  '✨',
  '🦋',
  '🌈',
]);
