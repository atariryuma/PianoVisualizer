// Built-in song catalog — Phase 0d batch 96.
//
// The two scores that ship in `packages/web/public/assets/`:
//   • Für Elise (Beethoven WoO 59), Mutopia 106-measure edition.
//   • Mozart Sonata K.331/3 "Rondo alla Turca", musetrainer 137-measure
//     edition.
//
// Both are public-domain. User-imported songs (added via the Add-Song
// modal) are merged into this same registry at boot, by ID, by
// `UserSongsStore.register()`.
//
// `makeSong` is a thin factory whose only job is to build the per-song
// record shape the rest of the shell expects:
//   • static fields: `id` / `titleKey` / `composerKey` / `icon` / `mxlUrl` /
//     `xmlUrl` / `sectionDefs`
//   • lazy-load fields populated by `_scoreLoader.loadCurrentScore()`:
//     `notes` / `totalSec` / `sections` / `playbackOrder` / `_loaded` /
//     `_loadingPromise`

export type SectionDef = {
  id: string;
  nameKey: string;
  descKey: string;
  startMeasure: number;
  isBoss: boolean;
};

/** @returns the song record (typed `any` because the rest of the shell
 *  reads/writes lazy-load fields freely). */
export function makeSong(
  id: string,
  titleKey: string,
  composerKey: string,
  icon: string,
  sectionDefs: SectionDef[]
): any {
  return {
    id,
    titleKey,
    composerKey,
    icon,
    mxlUrl: 'assets/' + id + '.mxl',
    xmlUrl: 'assets/' + id + '.xml',
    sectionDefs,
    // Populated on first load:
    notes: null,
    totalSec: 0,
    sections: [],
    playbackOrder: [],
    _loaded: false,
    _loadingPromise: null,
  };
}

/** Built-in song catalog. Mutable — UserSongsStore merges user imports
 *  into the same record map by id. Typed `any` because the lazy-load
 *  fields are filled in post-construction. */
export function createBuiltInSongs(): Record<string, any> {
  return {
    // Für Elise (Beethoven WoO 59) — 106-measure Mutopia edition.
    // Form: A(0-22) | B(23-37) | A(38-54) | C(55-77) | A+coda(78-105)
    fur_elise: makeSong('fur_elise', 'furElise', 'composerBeethoven', '🌸', [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'feB', descKey: 'feBdesc', startMeasure: 23, isBoss: false },
      { id: 'A2', nameKey: 'feA2', descKey: 'feA2desc', startMeasure: 55, isBoss: true },
    ]),
    // Mozart Sonata K.331/3 "Rondo alla Turca" — 137-measure musetrainer edition.
    // Form: A(0-8) | B(9-25) | A'(26-34) | C(35-43) | A''(44-60)
    //        | D(61-69) | E(70-78) | F(79-95) | G(96-104) | Coda(105-136)
    alla_turca: makeSong('alla_turca', 'turkishMarch', 'composerMozart', '🥁', [
      { id: 'A1', nameKey: 'taA1', descKey: 'taA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'taB', descKey: 'taBdesc', startMeasure: 26, isBoss: false },
      { id: 'A2', nameKey: 'taA2', descKey: 'taA2desc', startMeasure: 70, isBoss: true },
    ]),
  };
}
