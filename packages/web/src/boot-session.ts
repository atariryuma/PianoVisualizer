// Boot-session button wire-ups — Phase 0d batch 77.
//
// Two near-identical click handlers (start-screen ▶ Start vs.
// song-panel ▶ Practice) sharing the same first-time audio + run-loop
// boot flow:
//
//   1. Re-entry from title while audio is alive — just re-show the
//      HUD + reset session-start timer + return.
//   2. Bail if `state.starting` already true (debounce).
//   3. Set state.starting=true + paint the loading pip on the
//      button.
//   4. await initAudio() — first-time path. Errors surface via
//      alertAudioInitError + (for songStart) restore the song panel.
//   5. Reveal HUD + initBgStars + flip state.running=true + seed
//      lastFrameTimeMs/sessionStartTimeMs + kick the rAF loop.
//   6. (songStart only) hide the song panel, then await
//      startPracticeSection(practice.sectionIdx).
//   7. finally: clear state.starting + (start-only) reset the
//      loading pip.

export interface BootSessionDeps {
  /** Live state — read + written. */
  state: {
    running: boolean;
    starting: boolean;
    lastFrameTimeMs: number;
    sessionStartTimeMs: number;
  };
  /** Practice ref — only sectionIdx is read here. */
  practice: { sectionIdx: number };
  /** Async audio init (idempotent on re-entry — see audio-init.ts header). */
  initAudio: () => Promise<unknown>;
  /** Reveal the HUD + drop the title-screen body class + repaint
   *  intro-hint / mic meter visibility. */
  showRunningUI: () => void;
  /** Seed the bg-stars field — first-time call only matters when
   *  state.running flips to true; subsequent calls are no-ops. */
  initBgStars: () => void;
  /** rAF tick handler. */
  loop: (timeMs: number) => void;
  /** Bilingual error alert. */
  alertAudioInitError: (e: unknown) => void;
  /** Section start (song-panel ▶ Practice path only). */
  startPracticeSection?: (sectionIdx: number) => Promise<unknown>;
  /** Song-panel show/hide (song-panel ▶ Practice path only). */
  songPanel?: HTMLElement;
}

/** Toggle the loading state on a start-screen mode button. The
 *  button's i18n markup stays intact so language re-renders keep
 *  working and a return to the title always finds the button in its
 *  resting state. */
export function setStartButtonLoading(btn: HTMLElement | null, loading: boolean): void {
  if (!btn) return;
  btn.classList.toggle('is-loading', !!loading);
  (btn as HTMLButtonElement).disabled = !!loading;
}

/** Install the start-screen ▶ Start button. Free-play boot — no
 *  practice section starts. */
export function installStartButton(btn: HTMLElement, deps: BootSessionDeps): void {
  btn.addEventListener('click', async () => {
    // Re-entry from title screen while audio is still alive — just resume.
    if (deps.state.running) {
      deps.showRunningUI();
      deps.state.sessionStartTimeMs = performance.now();
      return;
    }
    if (deps.state.starting) return;
    deps.state.starting = true;
    setStartButtonLoading(btn, true);
    try {
      await deps.initAudio();
      deps.showRunningUI();
      deps.initBgStars();
      deps.state.running = true;
      deps.state.lastFrameTimeMs = 0;
      deps.state.sessionStartTimeMs = performance.now();
      requestAnimationFrame(deps.loop);
    } catch (e) {
      deps.alertAudioInitError(e);
    } finally {
      // Unconditional reset — even on success, so a later
      // returnToTitle shows the button in its resting state.
      setStartButtonLoading(btn, false);
      deps.state.starting = false;
    }
  });
}

/** Install the song-panel ▶ Practice button. Boots audio (or re-uses
 *  the live context) then enters the selected section. */
export function installSongStartButton(btn: HTMLElement, deps: BootSessionDeps): void {
  btn.addEventListener('click', async () => {
    if (deps.state.starting) return;
    // Guard the WHOLE handler, not just the cold-boot branch. The
    // running===true branch below skips audio init but still awaits
    // startPracticeSection; without setting `starting` here, a double-
    // tap would pass this guard twice and run two startPracticeSection
    // calls in parallel (double count-in, racy Transport scheduling).
    deps.state.starting = true;
    // Defer hiding the song panel until initAudio resolves —
    // otherwise an initAudio failure leaves the user on a bare
    // canvas (the previous selectSong has already hidden the title
    // screen).
    try {
      if (!deps.state.running) {
        await deps.initAudio();
        deps.songPanel?.classList.remove('visible');
        deps.showRunningUI();
        deps.initBgStars();
        deps.state.running = true;
        deps.state.lastFrameTimeMs = 0;
        deps.state.sessionStartTimeMs = performance.now();
        requestAnimationFrame(deps.loop);
      } else {
        deps.songPanel?.classList.remove('visible');
        // Re-entry while audio is already alive — make sure HUD /
        // theme bar are shown again in case we got here via
        // returnToTitle.
        deps.showRunningUI();
      }
      await deps.startPracticeSection?.(deps.practice.sectionIdx);
    } catch (e) {
      deps.alertAudioInitError(e);
      // Restore the song panel so the user has a path back; without
      // this a partial-failure path strands them on a blank canvas.
      deps.songPanel?.classList.add('visible');
    } finally {
      deps.state.starting = false;
    }
  });
}
