// Practice timing math + section-banner UI — Phase 0d batch 55.
//
// Three tightly-coupled timing helpers + the section-banner DOM
// writer, bundled because every caller of `recomputePracticeTimings`
// or `showSectionBanner` is in the practice-section-start path.
//
//   - effectiveTempoPct(): listen+fullSong → 100 (don't slow down a
//     full-song playthrough); otherwise practice.tempoPct (60/75/90/
//     100 from the kid's slider).
//
//   - practiceBeatMs(): one beat (quarter note) in milliseconds at
//     the current effective tempo. Falls back to 72 BPM when the
//     song record is missing a bpm field (older user-imported
//     scores).
//
//   - recomputePracticeTimings(): refresh the COUNT_IN_MS and
//     LANE_LOOKAHEAD_MS shell lets, then push them into the practice-
//     lane factory's hot-path settings. The lane is a singleton so
//     the first frame after this call sees the new tempo.
//
//   - showSectionBanner(): set the banner text, force-reflow + add
//     'show' class so the CSS animation restarts on every section
//     transition. The 👑 prefix marks "boss" sections so a kid sees
//     the harder one coming.
//
// `currentSong` flows through a thunk because the legacy shell binds
// it as a mutable let elsewhere; fresh on every call so a song
// change re-uses the new bpm immediately.

export interface PracticeTimingsPracticeRef {
  mode: string;
  fullSongMode: boolean;
  tempoPct: number;
}

export interface PracticeTimingsSong {
  bpm?: number;
}

export interface PracticeTimingsCoreFns {
  /** PianoCore.practiceBeatMs. */
  practiceBeatMs(bpm: number, tempoPct: number): number;
  /** PianoCore.computePracticeTimings — produces both COUNT_IN_MS
   *  and LANE_LOOKAHEAD_MS scaled to the current beat duration. */
  computePracticeTimings(beatMs: number): { countInMs: number; laneLookaheadMs: number };
}

export interface PracticeTimingsLane {
  /** Refresh the in-memory lane scaffolding so the next frame's
   *  count-in + descent rate match the new section's tempo. */
  setTimings(timings: { countInMs: number; laneLookaheadMs: number }): void;
}

export interface PracticeTimingsDeps {
  /** Lazy lookup — `practice` is declared after this factory site
   *  in the legacy shell (TDZ). */
  getPractice: () => PracticeTimingsPracticeRef;
  /** Lazy lookup — `currentSong` is a shell mutable let. */
  getCurrentSong: () => PracticeTimingsSong | null;
  /** PianoCore math fns. */
  fns: PracticeTimingsCoreFns;
  /** Setters that write back to the shell's COUNT_IN_MS /
   *  LANE_LOOKAHEAD_MS lets. */
  setCountInMs: (ms: number) => void;
  setLaneLookaheadMs: (ms: number) => void;
  /** Lazy lookup — practice-lane scaffolding singleton is built
   *  later in the shell; thunk avoids TDZ. */
  getPracticeLane: () => PracticeTimingsLane;
  /** Section-banner DOM target. Optional null guard mirrors the
   *  legacy `if (!DOM.sectionBanner) return` path. */
  sectionBannerEl: HTMLElement | null;
  /** i18n. */
  t: (key: string) => string;
}

export interface PracticeTimings {
  effectiveTempoPct(): number;
  practiceBeatMs(): number;
  recomputePracticeTimings(): void;
  showSectionBanner(sec: { nameKey: string; isBoss?: boolean }): void;
}

export function createPracticeTimings(deps: PracticeTimingsDeps): PracticeTimings {
  function effectiveTempoPct(): number {
    const p = deps.getPractice();
    if (p.mode === 'listen' && p.fullSongMode) return 100;
    return p.tempoPct || 100;
  }

  function practiceBeatMs(): number {
    const song = deps.getCurrentSong();
    return deps.fns.practiceBeatMs((song && song.bpm) || 72, effectiveTempoPct());
  }

  function recomputePracticeTimings(): void {
    const timings = deps.fns.computePracticeTimings(practiceBeatMs());
    deps.setCountInMs(timings.countInMs);
    deps.setLaneLookaheadMs(timings.laneLookaheadMs);
    // Refresh in lockstep so the first frame's count-in + descent
    // rate match the new section's tempo.
    deps.getPracticeLane().setTimings({
      laneLookaheadMs: timings.laneLookaheadMs,
      countInMs: timings.countInMs,
    });
  }

  function showSectionBanner(sec: { nameKey: string; isBoss?: boolean }): void {
    if (!deps.sectionBannerEl) return;
    deps.sectionBannerEl.textContent = (sec.isBoss ? '👑 ' : '') + deps.t(sec.nameKey);
    deps.sectionBannerEl.classList.remove('show');
    void deps.sectionBannerEl.offsetWidth; // restart animation
    deps.sectionBannerEl.classList.add('show');
  }

  return { effectiveTempoPct, practiceBeatMs, recomputePracticeTimings, showSectionBanner };
}
