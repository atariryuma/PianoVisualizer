// Touch press-feedback: `:active` enabler + async-busy marker.
//
// Both halves exist for the same reason — a tap must always produce a
// visible reaction, even when the work it starts takes a while.
//
// WebKit only applies `:active` styles to an element when that element — or
// one of its ancestors — carries a touch event handler. Without one, iOS
// Safari / WKWebView paint NO pressed state on a tap. Every interactive
// control in app.css also sets `-webkit-tap-highlight-color: transparent`
// (deliberately — the grey OS flash looks broken over the dark theme), so
// with no `:active` either, a tap produced zero feedback until the action
// itself finished. On the async paths (song start → score load → OSMD
// render can take seconds) that reads as "the tap didn't register", and the
// user taps again.
//
// One empty, PASSIVE `touchstart` listener on the document satisfies
// WebKit's heuristic and lights up every `:active` rule in the stylesheet.
// Passive matters: a non-passive document-level touch listener opts the page
// out of WebKit's fast-tap path (see the note in main.ts about the
// gesture-guard listeners), which would make the problem worse rather than
// better. This listener never calls preventDefault, so scrolling and click
// synthesis are untouched.

let installed = false;

/** Install the `:active`-enabling listener. Idempotent; returns an uninstall
 *  function (tests / future opt-out). A second call is a no-op that returns
 *  an empty disposer. */
export function installTouchFeedback(target: EventTarget = document): () => void {
  if (installed) return () => {};
  installed = true;
  const noop = (): void => {};
  target.addEventListener('touchstart', noop, { passive: true });
  return () => {
    target.removeEventListener('touchstart', noop);
    installed = false;
  };
}

/**
 * Mark a control as working-on-it while an async action runs.
 *
 * The `.is-busy` class (app.css) dims the control and takes it out of the
 * hit-test, so the tap is visibly acknowledged and a second tap can't queue a
 * duplicate transition. Used on the paths that await a score load / OSMD
 * render — those can run for seconds, and until now they left the UI looking
 * exactly like a tap that had been dropped.
 *
 * Null-tolerant so partial-DOM callers can pass an optional element directly.
 */
export function setButtonBusy(btn: HTMLElement | null | undefined, busy: boolean): void {
  btn?.classList.toggle('is-busy', busy);
}
