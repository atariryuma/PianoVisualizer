// Slider — one control that owns its paint AND its gesture.
//
// =====================================================================
// Why it is built this way
// =====================================================================
//
// Every earlier version kept the native `<input type=range>` as the VISIBLE
// control and layered our own gesture on top. That split is what made this take
// so many attempts, because it forces us to GUESS where the browser painted the
// thumb: the travel of a native thumb is inset by half its width, the inset is
// not observable, and any error between the guessed position and the painted
// one shows up as "I tapped where I meant and nothing happened" or "the thumb
// jumps out from under my finger".
//
// Painting it ourselves removes the guess. The thumb's position and the
// value-from-x mapping are the SAME expression, so they cannot disagree — and
// with that gone, none of the WebKit-specific behaviour is in the path either
// (no native drag that only starts on the thumb, no `-webkit-appearance`
// pseudo-elements, no form-control event quirks).
//
// This is the W3C APG slider pattern and the shape Material, Carbon and Fluent
// all ship. The `<input type=range>` stays, visually hidden, as the value model
// and the keyboard/AT surface — so persistence, `refresh()` seeding, tests and
// VoiceOver all keep working unchanged.
//
// Interaction is ABSOLUTE, which is the documented standard: press anywhere on
// the track and the thumb goes there, then follows the finger. (A relative
// "grab the handle" mode was tried; combined with the painting guess above it
// made taps near the thumb do nothing at all.)

/** Visual thumb diameter. The ONE place this number exists — the paint, the
 *  hit-test AND the CSS all read it (the wrap publishes it as `--thumb-px` at
 *  install time), so they cannot drift. A stylesheet copy is the failure this
 *  control already had once: a thumb drawn at one size and hit-tested at
 *  another is precisely "I tapped where I meant and nothing moved". */
const THUMB_PX = 28;

type RangeEl = HTMLInputElement;

function readNum(v: string, fallback: number): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** `min`, `max` and `step` of an input, with sane fallbacks. */
function bounds(el: RangeEl): { min: number; max: number; step: number } {
  const min = readNum(el.min, 0);
  const max = readNum(el.max, 100);
  const step = Math.abs(readNum(el.step, 1)) || 1;
  return { min, max: max > min ? max : min + 1, step };
}

/** 0..1 position of the input's current value. */
export function fractionOf(el: RangeEl): number {
  const { min, max } = bounds(el);
  return Math.min(1, Math.max(0, (readNum(el.value, min) - min) / (max - min)));
}

/**
 * Value at a client-x, quantised to the input's `step` and clamped to its range.
 *
 * `rect` is the TRACK's box. The thumb's centre travels from `THUMB_PX/2` to
 * `width - THUMB_PX/2`, so the same inset appears here and in `paint()` below;
 * without it the extremes are only reachable past the element's own edge.
 */
export function valueAtX(el: RangeEl, clientX: number, rect: DOMRect): number {
  const { min, max, step } = bounds(el);
  const inset = Math.min(rect.width / 2, THUMB_PX / 2);
  const usable = rect.width - inset * 2;
  if (usable <= 0) return min;
  const frac = Math.min(1, Math.max(0, (clientX - rect.left - inset) / usable));
  return Math.min(max, Math.max(min, min + Math.round((frac * (max - min)) / step) * step));
}

export interface SliderControl {
  dispose(): void;
}

/**
 * Turn a range input into a painted, pointer-driven slider.
 *
 * Dispatches real `input` / `change` events on the input, so every existing
 * listener — persistence, live volume apply, the value read-out — is unchanged
 * and stays the single place the value is acted on.
 *
 */
export function installSlider(el: RangeEl): SliderControl {
  const parent = el.parentElement;
  if (!parent) return { dispose: () => undefined };

  const wrap = document.createElement('div');
  wrap.className = 'slider-wrap';
  wrap.style.setProperty('--thumb-px', THUMB_PX + 'px');
  parent.insertBefore(wrap, el);
  wrap.appendChild(el);

  const track = document.createElement('div');
  track.className = 'slider-track';
  const fill = document.createElement('div');
  fill.className = 'slider-fill';
  const thumb = document.createElement('div');
  thumb.className = 'slider-thumb';
  track.appendChild(fill);
  wrap.append(track, thumb);

  /**
   * Position the thumb from the value. Expressed as a percentage of the track
   * with the same half-thumb inset the hit-test uses, so it needs no
   * measurement — correct before the panel has ever been laid out, and after
   * any resize or orientation change, for free.
   */
  const paint = (): void => {
    const f = fractionOf(el);
    const half = THUMB_PX / 2;
    thumb.style.left = `calc(${half}px + ${f} * (100% - ${THUMB_PX}px))`;
    fill.style.width = `calc(${half}px + ${f} * (100% - ${THUMB_PX}px))`;
    // No `aria-valuenow` write: the element IS a native range, which publishes
    // its own value to AT. Setting the attribute as well dirtied the a11y tree a
    // second time on every drag frame and could only ever agree with `value`.
  };
  paint();
  // Repaint whenever the value changes — ours, the keyboard's, or `refresh()`
  // seeding it from prefs.
  el.addEventListener('input', paint);
  el.addEventListener('change', paint);

  /** Which event family owns the gesture. Both are wired, so without this a
   *  `touchmove` would also drive a drag a pointer had started — the two would
   *  double-handle every move. */
  let owner: 'pointer' | 'touch' | null = null;
  let pendingX: number | null = null;
  let rafId = 0;
  /** The track's box, measured ONCE per gesture. `getBoundingClientRect` forces
   *  a style+layout flush, and the render loop has already written DOM styles by
   *  the time our rAF runs — so reading it per frame meant a full-document
   *  relayout at 120 Hz for the whole drag. Safe to cache: `.slider-wrap` is
   *  `touch-action: none`, so the panel cannot scroll out from under the finger
   *  mid-gesture. (Same reasoning as the cached rects in practice-lane.ts.) */
  let trackRect: DOMRect | null = null;

  const flush = (): void => {
    rafId = 0;
    const x = pendingX;
    pendingX = null;
    if (x == null) return;
    const next = valueAtX(el, x, trackRect ?? track.getBoundingClientRect());
    if (String(next) === el.value) return;
    el.value = String(next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  /** Coalesced to the frame: a 120 Hz drag delivers moves faster than the
   *  screen updates, and each one was doing a value round-trip, a DOM write and
   *  a volume apply that could never be seen. */
  const apply = (x: number): void => {
    pendingX = x;
    if (typeof requestAnimationFrame !== 'function') return flush();
    if (!rafId) rafId = requestAnimationFrame(flush);
  };
  /** Immediate — a press must register now, and a release must land exactly
   *  where the finger left. */
  const applyNow = (x: number): void => {
    pendingX = x;
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    rafId = 0;
    flush();
  };

  const start = (who: 'pointer' | 'touch', x: number): void => {
    owner = who;
    // Measure BEFORE the class change below, so the read isn't answering a
    // style invalidation we just caused.
    trackRect = track.getBoundingClientRect();
    // Acknowledge the press: a correct press and a missed one must not look the
    // same, or there is no way to learn where the control is.
    wrap.classList.add('is-dragging');
    applyNow(x);
  };
  const move = (who: 'pointer' | 'touch', x: number): void => {
    if (owner !== who) return;
    apply(x);
  };
  const end = (who: 'pointer' | 'touch', x: number | null, commit: boolean): void => {
    if (owner !== who) return;
    owner = null;
    wrap.classList.remove('is-dragging');
    if (x != null) applyNow(x);
    trackRect = null;
    // A cancel is not a commit: the gesture was taken away, the player did not
    // choose this value.
    if (commit) el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Pointer Events are the primary path; Touch is the fallback, because the
  // device diagnostic could not confirm that pointer events are always
  // delivered here. Whichever family starts the gesture owns it — `dragging`
  // gates the other — so they can never both drive one drag.
  const onPointerDown = (e: PointerEvent): void => {
    if (owner) return;
    wrap.setPointerCapture?.(e.pointerId);
    start('pointer', e.clientX);
  };
  const onPointerMove = (e: PointerEvent): void => move('pointer', e.clientX);
  const onPointerUp = (e: PointerEvent): void =>
    end('pointer', e.type === 'pointerup' ? e.clientX : null, e.type === 'pointerup');

  const onTouchStart = (e: TouchEvent): void => {
    if (owner) return;
    const t = e.changedTouches[0] ?? e.touches[0];
    if (!t) return;
    // Claim the gesture at its START, or the scrolling panel can take it before
    // the first move arrives.
    if (e.cancelable) e.preventDefault();
    start('touch', t.clientX);
  };
  const onTouchMove = (e: TouchEvent): void => {
    if (owner !== 'touch') return;
    const t = e.touches[0];
    if (!t) return;
    if (e.cancelable) e.preventDefault();
    move('touch', t.clientX);
  };
  const onTouchEnd = (e: TouchEvent): void =>
    end('touch', e.changedTouches[0]?.clientX ?? null, e.type === 'touchend');

  wrap.addEventListener('pointerdown', onPointerDown);
  wrap.addEventListener('pointermove', onPointerMove);
  wrap.addEventListener('pointerup', onPointerUp);
  wrap.addEventListener('pointercancel', onPointerUp);
  wrap.addEventListener('touchstart', onTouchStart, { passive: false });
  wrap.addEventListener('touchmove', onTouchMove, { passive: false });
  wrap.addEventListener('touchend', onTouchEnd);
  wrap.addEventListener('touchcancel', onTouchEnd);

  return {
    dispose(): void {
      el.removeEventListener('input', paint);
      el.removeEventListener('change', paint);
      // Detach the handlers too: removing the node from the DOM leaves them
      // live, so a disposed control would still act on events sent to the orphan.
      wrap.removeEventListener('pointerdown', onPointerDown);
      wrap.removeEventListener('pointermove', onPointerMove);
      wrap.removeEventListener('pointerup', onPointerUp);
      wrap.removeEventListener('pointercancel', onPointerUp);
      wrap.removeEventListener('touchstart', onTouchStart);
      wrap.removeEventListener('touchmove', onTouchMove);
      wrap.removeEventListener('touchend', onTouchEnd);
      wrap.removeEventListener('touchcancel', onTouchEnd);
      parent.insertBefore(el, wrap);
      wrap.remove();
    },
  };
}
