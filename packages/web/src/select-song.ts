// selectSong — Phase 0d batch 54.
//
// Switches the active song: nullifies the OSMD instance + clears its
// container so the new render starts on a blank tree, sets song-panel
// title/composer, primes practice.{progress,mode}, hides the title
// screen + reveals the song panel, restores the running-UI HUD when
// audio is already live, kicks off background score loading.
//
// Race safety: the loadCurrentScore promise is wrapped in
// `.then/.catch` closures that capture the local `song` variable, not
// `currentSong`. A rapid second selectSong() that flips `currentSong`
// can't pollute the prior song's _loadError because the closures
// guard with `currentSong === song` before re-rendering.

export interface SelectSongRecord {
  titleKey: string;
  composerKey: string;
  _loadError?: string | undefined;
}

export interface SelectSongStateRef {
  running: boolean;
}

export interface SelectSongPracticeRef {
  progress?: unknown;
  mode: string;
}

export interface SelectSongDom {
  osmdContainer: HTMLElement;
  songTitle: HTMLElement;
  songComposer: HTMLElement;
  startScreen: HTMLElement;
  songPanel: HTMLElement;
  questDisplay: HTMLElement;
}

export interface SelectSongDeps {
  /** SONGS registry — read-only here. */
  songs: Record<string, SelectSongRecord>;
  state: SelectSongStateRef;
  practice: SelectSongPracticeRef;
  dom: SelectSongDom;

  /** Lazy refs into the shell's mutable lets. */
  getCurrentSong: () => SelectSongRecord | null;
  setCurrentSong: (song: SelectSongRecord) => void;
  getOsmd: () => unknown | null;
  setOsmd: (osmd: unknown | null) => void;

  /** Drops notehead-highlight refs before innerHTML='' detaches the
   *  elements, otherwise the cursor module's tracker holds dangling
   *  refs that the next highlightCurrentNotes() would touch. */
  clearHighlights: () => void;

  /** i18n. */
  t: (key: string) => string;

  /** Lazy load — practice.progress is set on first read. */
  loadPracticeProgress: () => unknown;

  /** Forward-declared shell helpers — passed as thunks because the
   *  factory builds before they're declared. */
  showRunningUI: () => void;
  renderSongPanel: () => void;
  initWebMIDI: () => void;
  loadCurrentScore: () => Promise<unknown>;
}

export interface SelectSong {
  selectSong(songId: string): void;
}

export function createSelectSong(deps: SelectSongDeps): SelectSong {
  return {
    selectSong(songId) {
      const song = deps.songs[songId];
      if (!song) return;

      // Switching songs: drop the OSMD instance + manually clear the
      // container. osmd.clear() didn't remove the previous song's SVG
      // in our setup, so the new render was hidden underneath the
      // stale children.
      if (deps.getCurrentSong() !== song) {
        deps.setCurrentSong(song);
        if (deps.getOsmd()) {
          try {
            (deps.getOsmd() as { clear?: () => void }).clear?.();
          } catch {
            /* OSMD swallow */
          }
          deps.setOsmd(null);
        }
        // Drop notehead-highlight refs before innerHTML='' detaches
        // them — otherwise the cursor module's tracker holds dangling
        // elements that the next highlightCurrentNotes() would still
        // try to touch.
        deps.clearHighlights();
        deps.dom.osmdContainer.innerHTML = '';
      }

      deps.dom.songTitle.textContent = deps.t(song.titleKey);
      deps.dom.songComposer.textContent = deps.t(song.composerKey);
      deps.practice.progress = deps.practice.progress || deps.loadPracticeProgress();
      deps.practice.mode = 'guided';
      deps.dom.startScreen.style.display = 'none';
      deps.dom.songPanel.classList.add('visible');
      deps.dom.questDisplay.classList.remove('visible'); // free-play quest dots shouldn't peek through

      // Keep the invariant: if audio is already alive, the theme bar
      // should be restored beneath the song panel so a subsequent
      // "Back" lands the user on a visualizer with full controls (not
      // a bare canvas).
      if (deps.state.running) deps.showRunningUI();

      // Clear any prior load error so the spinner shows on fresh
      // attempts (e.g. user backed out then re-tapped the same song).
      song._loadError = undefined;
      deps.renderSongPanel();
      deps.initWebMIDI();

      // Capture `song` in the closures so a rapid second selectSong()
      // can't pollute the new song's _loadError with the previous
      // song's failure.
      deps
        .loadCurrentScore()
        .then(() => {
          song._loadError = undefined;
          if (deps.getCurrentSong() === song && deps.dom.songPanel.classList.contains('visible')) {
            deps.renderSongPanel();
          }
        })
        .catch((e: unknown) => {
           
          console.error('preload', e);
          const msg = e instanceof Error ? e.message : String(e);
          song._loadError = msg || 'Score load failed';
          if (deps.getCurrentSong() === song && deps.dom.songPanel.classList.contains('visible')) {
            deps.renderSongPanel();
          }
        });
    },
  };
}
