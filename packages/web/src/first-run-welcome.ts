// First-run welcome card — the onboarding "start here" for a brand-new user.
//
// The title screen used to drop a first-timer onto a static button list with
// no guidance. This card greets them, explains the app in one line, and offers
// a single clear next action (start the recommended first song) plus an
// optional "set my name" nudge toward the pianist-identity flow.
//
// Kid-safe by design (banned-list): it is NOT a blocking tutorial/gate — it's
// dismissible ("Maybe later"), and it stops showing itself for good the moment
// the kid has any real progress OR taps dismiss. No FOMO, no forced steps.
//
// Pure-ish: all state (should-show, recommended song, persistence) is injected,
// so the card is fully unit-testable and the shell owns the wiring.

export interface FirstRunRecommended {
  /** Song id the primary CTA selects. */
  id: string;
  /** i18n key for the song's display title (rendered into the CTA label). */
  titleKey: string;
}

export interface FirstRunWelcomeDeps {
  /** The `#firstRunWelcome` container (content is built here). */
  container: HTMLElement;
  /** i18n translator. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** True only on a genuine cold start (no progress, no pianist name, not yet
   *  dismissed). The shell computes this from progress + prefs. */
  shouldShow: () => boolean;
  /** The recommended first (easiest) song, or null if none is available. */
  recommended: () => FirstRunRecommended | null;
  /** Enter the song panel for the recommended song. */
  selectSong: (id: string) => void;
  /** Open the pianist-identity editor. */
  openPianistEditor: () => void;
  /** Persist the "welcome dismissed" flag so it never reappears. */
  persistDismissed: () => void;
}

export interface FirstRunWelcome {
  /** Build + show the card when `shouldShow()`, else hide it. Idempotent —
   *  safe to call on boot and on every langchange (rebuilds localized copy). */
  refresh(): void;
}

export function createFirstRunWelcome(deps: FirstRunWelcomeDeps): FirstRunWelcome {
  const { container } = deps;

  function hide(): void {
    container.hidden = true;
    container.innerHTML = '';
  }

  function refresh(): void {
    if (!deps.shouldShow()) {
      hide();
      return;
    }
    const rec = deps.recommended();
    container.innerHTML = '';
    container.hidden = false;

    const title = document.createElement('div');
    title.className = 'first-run-title';
    title.textContent = deps.t('welcomeTitle');

    const body = document.createElement('div');
    body.className = 'first-run-body';
    body.textContent = deps.t('welcomeBody');

    const actions = document.createElement('div');
    actions.className = 'first-run-actions';

    // Primary CTA — start the recommended song. Hidden if none is available
    // (e.g. a stripped build with no built-in songs), so the card degrades to
    // "welcome + set name" rather than a dead button.
    if (rec) {
      const start = document.createElement('button');
      start.className = 'first-run-start';
      start.textContent = deps.t('welcomeStartFmt', { song: deps.t(rec.titleKey) });
      start.addEventListener('click', () => {
        deps.persistDismissed();
        hide();
        deps.selectSong(rec.id);
      });
      actions.appendChild(start);
    }

    const setName = document.createElement('button');
    setName.className = 'first-run-setname';
    setName.textContent = deps.t('welcomeSetName');
    setName.addEventListener('click', () => {
      // Setting a name is itself progress toward "MY journey"; leave the card
      // for now (the editor opens over it) but don't hard-dismiss — if they
      // cancel without a name, the nudge is still here next time.
      deps.openPianistEditor();
    });
    actions.appendChild(setName);

    const dismiss = document.createElement('button');
    dismiss.className = 'first-run-dismiss';
    dismiss.textContent = deps.t('welcomeDismiss');
    dismiss.addEventListener('click', () => {
      deps.persistDismissed();
      hide();
    });
    actions.appendChild(dismiss);

    container.appendChild(title);
    container.appendChild(body);
    container.appendChild(actions);
  }

  return { refresh };
}
