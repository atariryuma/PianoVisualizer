// Progress backup / restore (0.15).
//
// A kid who gets a new iPad shouldn't lose every star, stamp, and practice
// day. The user-song *library* already has its own export (user-songs-ui.ts);
// this covers the OTHER half — the practice progress blob
// (`pianoViz_practice_v1`: best-stars, stamps, streak, practiced days) plus the
// prefs (`pianoViz_prefs`: theme, language, note-naming, volumes, pianist card).
//
// Pure serialize/parse here (unit-tested); the DOM glue (download <a>, file
// read, localStorage write + reload) lives in the shell. Restore writes the
// blobs straight back to localStorage and the shell reloads so every in-memory
// cache (prefs object, practice.progress) re-seeds cleanly from disk — far
// simpler and less bug-prone than patching a dozen live caches in place.

export const BACKUP_VERSION = 1;

export interface ProgressBackup {
  app: 'piano-visualizer';
  kind: 'progress-backup';
  version: number;
  exportedAt: string;
  /** Raw parsed contents of the two localStorage keys (may be null if a
   *  fresh install never wrote one). */
  progress: unknown;
  prefs: unknown;
}

/** Build the backup envelope from the two already-parsed blobs. `exportedAt`
 *  is passed in (the shell stamps it) so this stays pure/testable. */
export function serializeBackup(progress: unknown, prefs: unknown, exportedAt: string): string {
  const out: ProgressBackup = {
    app: 'piano-visualizer',
    kind: 'progress-backup',
    version: BACKUP_VERSION,
    exportedAt,
    progress: progress ?? null,
    prefs: prefs ?? null,
  };
  return JSON.stringify(out);
}

export interface ParsedBackup {
  progress: unknown;
  prefs: unknown;
}

/** Parse + validate a backup file's text. Throws a human-readable Error on
 *  anything that isn't a Piano Visualizer progress backup we understand, so
 *  the caller can surface it verbatim. Tolerant of a missing half (progress
 *  OR prefs may be null) but rejects the wrong file type / a newer version. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('Not a backup file');
  }
  const b = raw as Partial<ProgressBackup>;
  if (b.app !== 'piano-visualizer' || b.kind !== 'progress-backup') {
    throw new Error('Not a Piano Visualizer progress backup');
  }
  if (typeof b.version === 'number' && b.version > BACKUP_VERSION) {
    throw new Error(
      'Backup version ' + b.version + ' is newer than this app supports (v' + BACKUP_VERSION + ')'
    );
  }
  if (b.progress == null && b.prefs == null) {
    throw new Error('Backup contains no progress or settings');
  }
  return { progress: b.progress ?? null, prefs: b.prefs ?? null };
}
