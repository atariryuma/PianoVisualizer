// Intro-hint + hit-chip + running-state UI — Phase 0d batches 35 + 58.
//
// Tiny user-feedback bits that all live in the same overlay region
// of the canvas:
//
//   1. showHitChip(kind, text, x, y, channel) — flying chip ('great' /
//      'good' / 'miss' / etc.) that floats up from the hit-zone for
//      ~1.1 s. Throttled to one chip per 100 ms PER CHANNEL because rapid
//      passages (12+ notes/sec) would otherwise stack chips on top of
//      each other before any can fade. The channel split keeps the press
//      (timing) and release (note-length) verdicts from eating each
//      other — see the comment on `lastChipMs`.
//
//   2. noInputAvailable() — pure check: mic permission failed AND
//      no MIDI keyboard. iOS-WMB intentionally skips the mic but is
//      still happy to wait for a MIDI keyboard, so that path is NOT
//      "no input".
//
//   3. refreshIntroHint() — show/hide the intro overlay based on
//      noInputAvailable(). Idempotent.
//
//   4. hideIntroHint() — counter to refresh; clears the diag cache
//      so an explicit user "X" stays dismissed past a langchange.
//
//   5. alertAudioInitError(e) — bilingual alert wrapper for the
//      audio-init failure path.
//
//   6. showRunningUI() — title→running screen transition (Phase 0d
//      batch 58). Hides the start screen, reveals the HUD, requests
//      a wake lock, decides on the mic meter visibility, and kicks
//      off the silent background rescan when only the mic failed
//      (no MIDI). Stays in this module because it shares the intro-
//      hint visibility decision via refreshIntroHint().
//
// All side-effects flow through deps. The factory closes over the
// chip-throttle timestamp so the legacy `_lastChipMs` global is
// gone.

/** Subset of the shell's DOM bag the intro UI mutates. */
export interface IntroHintUiDom {
  introHint: HTMLElement | null;
  /** Title-screen container — hidden in `showRunningUI`. Optional so
   *  existing tests that only exercise the chip / hint paths don't
   *  need to mint a fake start screen. */
  startScreen?: HTMLElement | null;
  /** Top HUD container — revealed in `showRunningUI`. */
  hud?: HTMLElement | null;
  /** Mic-level meter — toggled in `showRunningUI` based on whether
   *  the mic is the active input (no MIDI + not suspended). */
  micMeter?: HTMLElement | null;
}

/** Subset of `state` we read for the input check + running-UI decisions. */
export interface IntroHintUiStateRef {
  micPermissionFailed?: boolean;
  /** True when audio is paused (visibility / devicechange recovery). */
  micSuspended?: boolean;
  /** True on iOS-WMB where the user intentionally skipped mic — we
   *  still want the silent rescan poller running so a later MIDI
   *  hot-plug picks up. */
  micIntentionallySkipped?: boolean;
  /** Lang-change re-render hook the shell stashes. */
  lastIntroDiag?: (() => void) | null;
}

/** Subset of `midiInput` we read. */
export interface IntroHintUiMidiRef {
  enabled: boolean;
}

/** Subset of `practice` we read for the running-UI decision. */
export interface IntroHintUiPracticeRef {
  enabled: boolean;
}

export interface IntroHintUiDeps {
  dom: IntroHintUiDom;
  state: IntroHintUiStateRef;
  midiInput: IntroHintUiMidiRef;
  /** Is MIDI the input we score? Drives which hint is shown — a keyboard the
   *  player pinned OFF must not make the app claim it is listening to one. */
  isMidiActive: () => boolean;
  /** The resolved input situation (ShellMidi.getInputStatus). `waiting` is the
   *  one "is any input live" answer, shared with the mic meter in
   *  shell-midi.paintInputState and the pill in midi-indicator. */
  getInputStatus?: () => { active: 'midi' | 'mic'; waiting: boolean };
  /** Optional — only required by `showRunningUI`. Existing test
   *  suites that don't exercise the running-UI path can omit this. */
  practice?: IntroHintUiPracticeRef;

  /** Bilingual translator. Reads `introNeedMidi` + `audioInitFailedFmt`. */
  t: (key: string, vars?: Record<string, string>) => string;

  /** Read at every showHitChip call so a mid-game resize uses the
   *  fresh viewport height. */
  getHeight: () => number;

  /** Native popup. Defaults to global alert; tests inject a spy. */
  alert?: (msg: string) => void;

  /** Time source — performance.now by default. Tests inject a fixed
   *  clock to drive the chip throttle deterministically. */
  now?: () => number;

  /** Chip lifetime in ms before the DOM node is removed. Default
   *  1100 (matches the legacy fade animation). */
  chipDurationMs?: number;

  /** Chip throttle window (ms). Default 100. */
  chipThrottleMs?: number;

  // ── showRunningUI deps (all optional so legacy callers of the
  //    intro / hit-chip API don't need to provide them) ──

  /** document.body or stand-in. Used to clear the `title-screen`
   *  class on the title→running transition. Defaults to the live
   *  document.body. */
  body?: HTMLElement;
  /** Hold the screen awake whenever audio is alive (was practice-
   *  only; iOS will suspend the page + silently break MIDI in WMB
   *  the moment the screen sleeps). */
  requestWakeLock?: () => void;
  /** Kick the ramped auto-rescan poller. Called only when the user
   *  is mic-fallback (no MIDI port) AND the mic itself failed —
   *  catches a later USB-MIDI hot-plug. */
  startMidiAutoRescan?: () => void;
  /** One-shot silent enumeration. Same trigger condition as the
   *  poller. Returns a promise we explicitly swallow — failures must
   *  NEVER surface a "🎹 No MIDI port found" diagnostic the kid
   *  didn't ask for. */
  rescanMidi?: (silent: boolean) => Promise<unknown>;
}

export interface IntroHintUi {
  /** Float a chip up from the hit zone (free-play / practice
   *  hit/miss feedback). Debounced per channel. Optional xPx/yPx place it at
   *  a note's key + a chosen height (default centered mid-screen). */
  showHitChip(kind: string, text: string, xPx?: number, yPx?: number, channel?: string): void;
  /** Mic-permission-failed + no-MIDI predicate. */
  noInputAvailable(): boolean;
  /** Show intro hint when no input + hide when one becomes available. */
  refreshIntroHint(): void;
  /** Hide the intro hint + clear the diag-cache. */
  hideIntroHint(): void;
  /** Bilingual alert wrapper for audio-init failures. */
  alertAudioInitError(e: unknown): void;
  /** Title→running screen transition. Hides start screen, shows
   *  HUD, requests wake lock, paints mic meter, kicks silent
   *  bg-rescan when only the mic failed. */
  showRunningUI(): void;
}

const DEFAULT_CHIP_DURATION_MS = 1100;
const DEFAULT_CHIP_THROTTLE_MS = 100;

export function createIntroHintUi(deps: IntroHintUiDeps): IntroHintUi {
  const now = deps.now ?? (() => performance.now());
  const alertFn = deps.alert ?? ((msg) => alert(msg));
  const chipDuration = deps.chipDurationMs ?? DEFAULT_CHIP_DURATION_MS;
  const chipThrottle = deps.chipThrottleMs ?? DEFAULT_CHIP_THROTTLE_MS;

  /** Throttle clock PER CHANNEL. A single shared clock meant the two
   *  per-note feedback channels competed: a release nudge (note-length,
   *  lower band) landing within 100 ms of the next press would swallow that
   *  press's timing verdict, so at eighth-note speed the player saw an
   *  apparently arbitrary mix of the two dimensions instead of both. They
   *  occupy different vertical bands, so they never overprint and have no
   *  reason to share a budget. Callers that pass no channel share the
   *  default one (free-play hits, MIDI-connected toasts — the old
   *  behaviour). */
  const lastChipMs = new Map<string, number>();

  function showHitChip(
    kind: string,
    text: string,
    xPx?: number,
    yPx?: number,
    channel = 'default'
  ): void {
    const t = now();
    if (t - (lastChipMs.get(channel) ?? -Infinity) < chipThrottle) return;
    lastChipMs.set(channel, t);
    const chip = document.createElement('div');
    chip.className = 'hit-chip ' + kind;
    chip.textContent = text;
    // Default = centered mid-screen (timing verdict). Callers can place a chip
    // at a note's key (xPx) and lower on the screen (yPx) so a second channel
    // — the note-length verdict — doesn't overprint the centered timing one.
    chip.style.left = xPx != null ? xPx + 'px' : '50%';
    chip.style.top = (yPx != null ? yPx : deps.getHeight() * 0.55) - 30 + 'px';
    document.body.appendChild(chip);
    setTimeout(() => chip.remove(), chipDuration);
  }

  function noInputAvailable(): boolean {
    return !!deps.state.micPermissionFailed && !deps.isMidiActive();
  }

  /** Pinned to the keyboard with nothing attached yet. Distinct from "no input
   *  available": nothing is broken, the app is simply waiting for the device the
   *  player told it to use — and it has to say so, because a silent screen with
   *  no mic meter and no keyboard reads as a failure. */
  function waitingForKeyboard(): boolean {
    return deps.isMidiActive() && !deps.midiInput.enabled;
  }

  function refreshIntroHint(): void {
    const el = deps.dom.introHint;
    if (!el) return;
    if (noInputAvailable()) {
      el.classList.add('visible');
      el.innerHTML = deps.t('introNeedMidi');
      return;
    }
    if (waitingForKeyboard()) {
      el.classList.add('visible');
      el.textContent = deps.t('inputWaitingMidi');
      return;
    }
    el.classList.remove('visible');
  }

  function hideIntroHint(): void {
    if (deps.dom.introHint) deps.dom.introHint.classList.remove('visible');
    deps.state.lastIntroDiag = null;
  }

  function alertAudioInitError(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    alertFn(deps.t('audioInitFailedFmt', { v: msg }));
  }

  function showRunningUI(): void {
    if (deps.dom.startScreen) deps.dom.startScreen.style.display = 'none';
    const body = deps.body ?? (typeof document !== 'undefined' ? document.body : null);
    body?.classList.remove('title-screen');
    if (deps.dom.hud) deps.dom.hud.style.display = 'block';
    // Hold the screen awake whenever audio is alive — was practice-
    // only before, but iOS will suspend the page (and silently break
    // the MIDI port handler in WMB) the moment the screen sleeps.
    // Free Play sessions should stay live for the same reason.
    deps.requestWakeLock?.();
    if (!deps.practice?.enabled) refreshIntroHint();
    if (deps.dom.micMeter) {
      // The SAME classifier shell-midi's paintInputState uses — not a
      // hand-maintained copy of its conjunction. Two places toggle this one
      // element; a fourth mic-failure flag must not be able to update one and
      // silently desync the other.
      const st = deps.getInputStatus?.();
      const wantsMicMeter = st
        ? st.active === 'mic' && !st.waiting
        : !deps.isMidiActive() && !deps.state.micSuspended;
      deps.dom.micMeter.classList.toggle('visible', wantsMicMeter);
    }
    // Background-rescan only for actual mic failures — iOS-WMB
    // sessions (`micIntentionallySkipped`) start the silent poller
    // too so a later MIDI hot-plug picks up. NEVER fire a non-silent
    // rescan here: it surfaces a "🎹 No MIDI port found" diagnostic
    // the kid did not ask for.
    const wantBgRescan =
      !deps.isMidiActive() &&
      (!!deps.state.micPermissionFailed || !!deps.state.micIntentionallySkipped);
    if (wantBgRescan) {
      deps.startMidiAutoRescan?.();
      deps.rescanMidi?.(true).catch(() => {});
    }
  }

  return {
    showHitChip,
    noInputAvailable,
    refreshIntroHint,
    hideIntroHint,
    alertAudioInitError,
    showRunningUI,
  };
}
