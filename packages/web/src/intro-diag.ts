// Intro-hint diagnostic system — Phase 0d batch 50.
//
// Four tightly related helpers, all touching the `introHint` element
// + `state.lastIntroDiag` cache:
//
//   - setIntroHintDiagnostic(line1, line2?) — write the two-line hint
//     (line2 styled as a subdued sub-line) and toggle visibility.
//
//   - showIntroDiag(thunk) — store the (string-producing) thunk on
//     state so a `langchange` event can re-run it with fresh
//     translations, then run it once now. Callers wrap their own
//     `setIntroHintDiagnostic(t('foo'), t('bar'))` invocations in this
//     so the diagnostic auto-relocalizes.
//
//   - clearIntroDiagCache() — drop the pending thunk (used on transitions
//     where the diag stops being relevant, e.g. an audio re-acquire that
//     succeeded).
//
//   - showMidiWaitingHint() — the iPad-WebMIDI / Web MIDI Browser hint.
//     Once-per-session guard via `state._midiWaitingShown`. Composes
//     showIntroDiag + setIntroHintDiagnostic with two i18n keys that
//     have plain-English fallbacks so the hint still renders if i18n
//     translates to undefined.

export interface IntroDiagStateRef {
  /** Last-applied diagnostic thunk, re-run on language change. `null`
   *  when no diag is showing. */
  lastIntroDiag: (() => void) | null;
  /** Once-per-session guard so showMidiWaitingHint only fires its
   *  one-time iPad/WMB pairing nudge. */
  _midiWaitingShown?: boolean;
}

export interface IntroDiagDeps {
  state: IntroDiagStateRef;
  /** introHint element. Optional null guard mirrors the legacy
   *  defensive check (DOM bag may be partially set up at boot). */
  introHintEl: HTMLElement | null;
  /** True iff the runtime is iOS WebKit (iPad/iPhone Safari & friends).
   *  Held by deps so the test can flip it. */
  isAppleMobile: () => boolean;
  /** Production: `'requestMIDIAccess' in navigator`. Held by deps so
   *  the test can simulate WebKit-without-Web-MIDI. */
  hasRequestMIDIAccess: () => boolean;
  /** i18n. */
  t: (key: string) => string;
}

export interface IntroDiag {
  setDiagnostic(line1: string, line2?: string): void;
  showDiag(thunk: () => void): void;
  clearCache(): void;
  showMidiWaitingHint(): void;
}

export function createIntroDiag(deps: IntroDiagDeps): IntroDiag {
  const setDiagnostic = (line1: string, line2?: string): void => {
    if (!deps.introHintEl) return;
    const sub = line2
      ? '<br><span style="font-size:.78rem;color:rgba(255,255,255,.55);letter-spacing:.04em">' +
        line2 +
        '</span>'
      : '';
    deps.introHintEl.innerHTML = line1 + sub;
    deps.introHintEl.classList.add('visible');
  };

  const showDiag = (thunk: () => void): void => {
    deps.state.lastIntroDiag = thunk;
    thunk();
  };

  const clearCache = (): void => {
    deps.state.lastIntroDiag = null;
  };

  const showMidiWaitingHint = (): void => {
    if (!deps.isAppleMobile() || !deps.hasRequestMIDIAccess()) return;
    // Once per session — re-shows would noise up the lifecycle.
    if (deps.state._midiWaitingShown) return;
    deps.state._midiWaitingShown = true;
    showDiag(() =>
      setDiagnostic(
        deps.t('diagMidiWaiting') || 'Waiting for MIDI…',
        deps.t('diagWmbHint') || 'Pair your keyboard in Web MIDI Browser, then return here.'
      )
    );
  };

  return { setDiagnostic, showDiag, clearCache, showMidiWaitingHint };
}
