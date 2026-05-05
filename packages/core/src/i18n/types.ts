// Translation table types — kept separate so consumers can import them
// without pulling in the full string table.

export type Lang = 'en' | 'jp';

export interface TranslationEntry {
  en: string;
  /** Omit (or leave empty) for English-only entries — UI chrome / loanwords
   *  where the language toggle is intentionally a no-op. `translate()` falls
   *  back to `en` when `jp` is missing. */
  jp?: string;
}

/** Catalog of i18n keys → entries. Index signature lets callers add ad-hoc keys
 *  (e.g., quest entries generated at build time) without breaking the type. */
export type TranslationTable = Record<string, TranslationEntry>;

/** Resolves a synthetic user-song key (`__userTitle:` / `__userComposer:` family)
 *  to a display string. Returns null if the id is unknown. */
export type UserKeyResolver = (id: string, which: 'userTitle' | 'userComposer') => string | null;
