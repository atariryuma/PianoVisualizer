// Intro-hint + hit-chip UI — Phase 0d batch 35.
//
// Tiny user-feedback bits that all live in the same overlay region
// of the canvas:
//
//   1. showHitChip(kind, text) — flying chip ('great' / 'good' /
//      'miss' / etc.) that floats up from the hit-zone for ~1.1 s.
//      Throttled to one chip per 100 ms because rapid passages
//      (12+ notes/sec) would otherwise stack chips on top of each
//      other before any can fade.
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
// All side-effects flow through deps. The factory closes over the
// chip-throttle timestamp so the legacy `_lastChipMs` global is
// gone.

/** Subset of the shell's DOM bag the intro UI mutates. */
export interface IntroHintUiDom {
  introHint: HTMLElement | null;
}

/** Subset of `state` we read for the input check. */
export interface IntroHintUiStateRef {
  micPermissionFailed?: boolean;
  /** Lang-change re-render hook the shell stashes. */
  lastIntroDiag?: (() => void) | null;
}

/** Subset of `midiInput` we read. */
export interface IntroHintUiMidiRef {
  enabled: boolean;
}

export interface IntroHintUiDeps {
  dom: IntroHintUiDom;
  state: IntroHintUiStateRef;
  midiInput: IntroHintUiMidiRef;

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
}

export interface IntroHintUi {
  /** Float a chip up from the hit zone (free-play / practice
   *  hit/miss feedback). Debounced. */
  showHitChip(kind: string, text: string): void;
  /** Mic-permission-failed + no-MIDI predicate. */
  noInputAvailable(): boolean;
  /** Show intro hint when no input + hide when one becomes available. */
  refreshIntroHint(): void;
  /** Hide the intro hint + clear the diag-cache. */
  hideIntroHint(): void;
  /** Bilingual alert wrapper for audio-init failures. */
  alertAudioInitError(e: unknown): void;
}

const DEFAULT_CHIP_DURATION_MS = 1100;
const DEFAULT_CHIP_THROTTLE_MS = 100;

export function createIntroHintUi(deps: IntroHintUiDeps): IntroHintUi {
  const now = deps.now ?? (() => performance.now());
  const alertFn = deps.alert ?? ((msg) => alert(msg));
  const chipDuration = deps.chipDurationMs ?? DEFAULT_CHIP_DURATION_MS;
  const chipThrottle = deps.chipThrottleMs ?? DEFAULT_CHIP_THROTTLE_MS;

  let lastChipMs = 0;

  function showHitChip(kind: string, text: string): void {
    const t = now();
    if (t - lastChipMs < chipThrottle) return;
    lastChipMs = t;
    const chip = document.createElement('div');
    chip.className = 'hit-chip ' + kind;
    chip.textContent = text;
    chip.style.left = '50%';
    chip.style.top = deps.getHeight() * 0.55 - 30 + 'px';
    document.body.appendChild(chip);
    setTimeout(() => chip.remove(), chipDuration);
  }

  function noInputAvailable(): boolean {
    return !!deps.state.micPermissionFailed && !deps.midiInput.enabled;
  }

  function refreshIntroHint(): void {
    const el = deps.dom.introHint;
    if (!el) return;
    const show = noInputAvailable();
    el.classList.toggle('visible', show);
    if (show) el.innerHTML = deps.t('introNeedMidi');
  }

  function hideIntroHint(): void {
    if (deps.dom.introHint) deps.dom.introHint.classList.remove('visible');
    deps.state.lastIntroDiag = null;
  }

  function alertAudioInitError(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    alertFn(deps.t('audioInitFailedFmt', { v: msg }));
  }

  return {
    showHitChip,
    noInputAvailable,
    refreshIntroHint,
    hideIntroHint,
    alertAudioInitError,
  };
}
