// Pure transforms over the public musetrainer/library catalog (served via
// jsDelivr, pinned to a specific commit SHA per App Store 4.7 compliance).
//
// The shell does the network IO (fetch, IndexedDB cache); this module just
// reshapes a GitHub Contents API row into the in-app library entry shape.
// Kept dependency-free so future shells (Vite, Capacitor) can reuse the
// same display + URL conventions.

export interface GhContentsFile {
  name: string;
  size?: number;
}

/** Per-file Japanese metadata override. Caller supplies the lookup map. */
export interface JpOverride {
  composerJp: string;
  titleJp: string;
}

export interface LibraryEntryFromGhOptions {
  /** Pinned commit SHA — locks the catalog so the score listing can't change
   *  between store submissions. Caller resolves this from a single constant. */
  pinnedSha: string;
  /** Per-filename JP metadata overrides; missing entries fall back to EN. */
  jpOverrides?: Readonly<Record<string, JpOverride>>;
  /** Default emoji icon. Currently '🎼' for catalog rows. */
  defaultIcon?: string;
}

export interface LibraryEntry {
  url: string;
  filename: string;
  label: string;
  composer: string;
  title: string;
  labelJp: string | null;
  composerJp: string | null;
  titleJp: string | null;
  icon: string;
  size: number;
}

/**
 * Reshape a GitHub Contents API file row into the library entry the
 * catalog UI renders.
 *
 * Filename convention (from musetrainer/library):
 *   `Bach_Minuet_in_G_Major_BWV_Anh._114.mxl`
 * → composer = "Bach", title = "Minuet in G Major BWV Anh. 114"
 * → label = "Bach — Minuet in G Major BWV Anh. 114"
 *
 * The `_-_` separator is treated as a hard composer/title split when present
 * (some entries use it explicitly); otherwise the first underscore-delimited
 * token is the composer.
 */
export function libraryEntryFromGhFile(
  file: GhContentsFile,
  opts: LibraryEntryFromGhOptions
): LibraryEntry {
  const stem = file.name.replace(/\.mxl$/i, '');
  const parts = stem.split(/_-_|_/);
  const composer = parts[0] || '';
  const title = parts.slice(1).join(' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const label = composer && title ? composer + ' — ' + title : composer || title || stem;
  const jp = opts.jpOverrides ? opts.jpOverrides[file.name] || null : null;
  return {
    url:
      'https://cdn.jsdelivr.net/gh/musetrainer/library@' +
      opts.pinnedSha +
      '/scores/' +
      encodeURIComponent(file.name),
    filename: file.name,
    label,
    composer,
    title,
    labelJp: jp ? jp.composerJp + ' — ' + jp.titleJp : null,
    composerJp: jp ? jp.composerJp : null,
    titleJp: jp ? jp.titleJp : null,
    icon: opts.defaultIcon || '🎼',
    size: file.size || 0,
  };
}
