// i18n — pure translation lookup.
//
// The legacy app.js had a `t(key, vars)` closure over a global `prefs.lang`
// AND `SONGS` (for synthetic `__userTitle:<id>` keys). Lifting it out, we:
//
//   1. Make the table + lang explicit parameters of `translate()`
//   2. Replace the SONGS dependency with an injected `userResolver` callback
//   3. Provide `createT(table, getLang, opts)` for ergonomic shell use
//   4. Leave `applyI18n` (DOM-coupled) in the shell — it's not core concern
//
// Variables interpolation: a `{key}` placeholder in the entry string is
// replaced by `vars[key]`. Replaces ALL occurrences (the legacy behavior was
// only the first, but we improved it — the existing strings have at most one
// occurrence per key, and the next-N strings might want repeats).

import type { Lang, TranslationTable, UserKeyResolver } from './types';

export type { Lang, TranslationEntry, TranslationTable, UserKeyResolver } from './types';
export { T_STRINGS } from './strings';

export interface TranslateOptions {
  /** Resolver for synthetic user-song keys. Without it, `__user*` keys return ''. */
  userResolver?: UserKeyResolver;
  /** Fallback language if the requested lang is missing. Default 'en'. */
  fallbackLang?: Lang;
}

/**
 * Pure translation lookup. Returns the resolved string, or — if the key isn't
 * in the table and isn't a synthetic user key — the key itself (so missing
 * translations are visible in the UI rather than silently empty).
 */
export function translate(
  table: TranslationTable,
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
  opts: TranslateOptions = {}
): string {
  // Synthetic user-song keys: `__userTitle:<id>` / `__userComposer:<id>`.
  if (key.startsWith('__user')) {
    const colon = key.indexOf(':');
    if (colon < 0) return '';
    const which = key.slice(2, colon);
    const id = key.slice(colon + 1);
    if (which !== 'userTitle' && which !== 'userComposer') return '';
    const resolved = opts.userResolver?.(id, which);
    return resolved ?? '';
  }

  const entry = table[key];
  if (!entry) return key;
  const fallback = opts.fallbackLang ?? 'en';
  let s = entry[lang] || entry[fallback] || key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      // Replace ALL occurrences of {k} — split/join is slightly faster than
      // a global RegExp + escaping the placeholder name.
      s = s.split('{' + k + '}').join(String(vars[k]));
    }
  }
  return s;
}

/** Type of the closure returned by `createT`. */
export type T = (key: string, vars?: Record<string, string | number>) => string;

export interface CreateTOptions extends TranslateOptions {
  /** Reactive language source. Called fresh on every translate to allow runtime
   *  language switches without re-creating the closure. */
  getLang: () => Lang;
}

/**
 * Build an ergonomic `t(key, vars)` closure that reads the current language
 * lazily and dispatches to `translate()`. Use this in shells where you don't
 * want to thread `(lang, table)` through every call site.
 */
export function createT(table: TranslationTable, opts: CreateTOptions): T {
  return (key, vars) => translate(table, opts.getLang(), key, vars, opts);
}

// =====================================================================
// Note-name localization
// =====================================================================

export const NOTE_NAMES_EN = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

/** Japanese-mode note names. Kids in JP music ed read ド/レ/ミ on the staff. */
export const NOTE_NAMES_JP = [
  'ド',
  'ド#',
  'レ',
  'レ#',
  'ミ',
  'ファ',
  'ファ#',
  'ソ',
  'ソ#',
  'ラ',
  'ラ#',
  'シ',
] as const;

export function noteNamesFor(lang: Lang): readonly string[] {
  return lang === 'jp' ? NOTE_NAMES_JP : NOTE_NAMES_EN;
}
