// @vitest-environment happy-dom
//
// The slider gesture is ours because iOS's is not usable: a native range input
// there only responds to a grab ON THE THUMB — tapping the track does nothing,
// and with a `step` set a drag beginning off the thumb does nothing either
// (angular/components#27316, twbs/bootstrap#31241). On the volume rows, whose
// value starts at 100, that left a control whose only live pixels were the few
// at the far right: "you have to tap at 90% or nothing happens".
//
// Material's slider spec and the W3C slider pattern both say a press anywhere on
// the track moves the thumb. These tests pin that, plus the two ends, which is
// where an off-by-half-a-thumb shows up as an unreachable min or max.

import { describe, it, expect, vi } from 'vitest';

/** Let one animation frame run — moves are coalesced to the frame, because a
 *  120 Hz drag delivers more of them than the screen can show. */
const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
import { installSlider, valueAtX } from '../src/slider-control';

function makeSlider(over: Partial<Record<'min' | 'max' | 'step' | 'value', string>> = {}) {
  const host = document.createElement('div');
  const el = document.createElement('input');
  el.type = 'range';
  el.min = over.min ?? '0';
  el.max = over.max ?? '100';
  el.step = over.step ?? '1';
  el.value = over.value ?? '100';
  // happy-dom has no layout, so the rects are supplied explicitly.
  const rect = { left: 0, top: 0, width: 300, height: 44 } as DOMRect;
  el.getBoundingClientRect = () => rect;
  host.getBoundingClientRect = () => rect;
  host.appendChild(el);
  document.body.appendChild(host);
  /** The wrapper installSlider builds — it is the gesture surface. */
  const padOf = (): HTMLElement => host.querySelector('.slider-wrap') as HTMLElement;
  /** Install and give the painted TRACK a box (happy-dom has no layout). The
   *  track is what the hit-test measures, since it is what the player sees. */
  const install = () => {
    const ctl = installSlider(el);
    const pad = padOf();
    if (pad) {
      pad.getBoundingClientRect = () => rect;
      const track = pad.querySelector('.slider-track') as HTMLElement | null;
      if (track) track.getBoundingClientRect = () => rect;
    }
    return ctl;
  };
  return { el, host, rect, padOf, install };
}

describe('valueAtX', () => {
  it('maps the middle of the track to the middle of the range', () => {
    const { el, rect } = makeSlider();
    expect(valueAtX(el, 150, rect)).toBe(50);
  });

  it('reaches BOTH ends — the thumb inset must not strand min or max', () => {
    // Without insetting by half a thumb, the last step sits past the element's
    // own edge: the same unreachable-extreme the native control had.
    const { el, rect } = makeSlider();
    expect(valueAtX(el, 0, rect)).toBe(0);
    expect(valueAtX(el, 300, rect)).toBe(100);
    expect(valueAtX(el, -50, rect)).toBe(0);
    expect(valueAtX(el, 999, rect)).toBe(100);
  });

  it('quantises to the input own step', () => {
    const { el, rect } = makeSlider({ min: '-50', max: '400', step: '5' });
    const v = valueAtX(el, 150, rect);
    expect(v % 5).toBe(0);
    expect(v).toBeGreaterThanOrEqual(-50);
    expect(v).toBeLessThanOrEqual(400);
  });

  it('honours a non-zero minimum', () => {
    const { el, rect } = makeSlider({ min: '-50', max: '50', step: '1' });
    expect(valueAtX(el, 150, rect)).toBe(0);
  });

  it('degrades to min on a zero-width element instead of producing NaN', () => {
    const { el } = makeSlider();
    expect(valueAtX(el, 10, { left: 0, width: 0 } as DOMRect)).toBe(0);
  });
});

describe('installSlider', () => {
  it('a press on the TRACK sets the value and fires input', () => {
    // The reported bug: value 100 (thumb at the right), so on iOS only the far
    // right responded. A press at the middle must move it.
    const { el, padOf, install } = makeSlider({ value: '100' });
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    install();

    padOf().dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true }));
    expect(el.value).toBe('50');
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it('tracks a drag and fires change on release', async () => {
    const { el, padOf, install } = makeSlider({ value: '0' });
    const onChange = vi.fn();
    el.addEventListener('change', onChange);
    install();
    const pad = padOf();

    // Press the TRACK (the thumb is at the far left for value 0), so this is
    // the jump-then-drag path.
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true }));
    expect(el.value).toBe('50');
    pad.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, bubbles: true }));
    await frame();
    expect(el.value).toBe('100');
    expect(onChange).not.toHaveBeenCalled();
    pad.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores movement that did not start on the control', () => {
    const { el, padOf, install } = makeSlider({ value: '0' });
    install();
    padOf().dispatchEvent(new PointerEvent('pointermove', { clientX: 150, bubbles: true }));
    expect(el.value).toBe('0');
  });

  it('does not fire input when the value would not change', () => {
    // Redundant events would persist prefs and re-apply volumes on every frame
    // of a drag that stays inside one step.
    const { el, padOf, install } = makeSlider({ value: '50' });
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    install();
    padOf().dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true }));
    expect(onInput).not.toHaveBeenCalled();
  });

  it('the pad and the input are the SAME box, with no measuring', () => {
    // The device failure this replaces: the pad's offset was computed by hand
    // from two getBoundingClientRects, and on the volume rows it ended up
    // somewhere else — the control received pointerdown and nine pointermoves
    // and never changed value, because the finger's x was mapped against a box
    // it was not over. A wrapper the pad fills with `inset: 0` cannot drift.
    const { el, host, padOf, install } = makeSlider();
    install();
    const pad = padOf();
    expect(pad.className).toBe('slider-wrap');
    expect(el.parentElement).toBe(pad);
    // The control paints its own track and thumb, so "where it looks" and
    // "where it computes" are one expression.
    expect(pad.querySelector('.slider-track')).toBeTruthy();
    expect(pad.querySelector('.slider-thumb')).toBeTruthy();
    expect(host.contains(pad)).toBe(true);
  });

  it('a press anywhere moves the thumb there — absolute, per the standard', () => {
    // Material's slider spec and the W3C pattern both say a press on the track
    // moves the handle to it. A relative "grab the handle" mode was tried and
    // removed: combined with guessing where the NATIVE thumb had been painted,
    // it made presses near the thumb do nothing at all.
    const { el, padOf, install } = makeSlider({ value: '0' });
    install();
    padOf().dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true }));
    expect(el.value).toBe('50');
  });

  it('moves are coalesced to one update per frame', async () => {
    // A 120 Hz iPad delivers pointermove faster than the screen updates, and
    // each one was doing a value round-trip, a DOM write and a Tone volume set —
    // work that could never be seen, and why the drag felt heavy.
    const { el, padOf, install } = makeSlider({ value: '0' });
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    install();
    const pad = padOf();
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true }));
    onInput.mockClear();
    for (const x of [180, 220, 260, 300]) {
      pad.dispatchEvent(new PointerEvent('pointermove', { clientX: x, bubbles: true }));
    }
    expect(onInput, 'nothing applied before the frame').not.toHaveBeenCalled();
    await frame();
    // One update, carrying the LAST position — nothing is lost by coalescing.
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(el.value).toBe('100');
  });

  it('the press and the release are immediate, never a frame late', async () => {
    // A tap must register now, and a release must land where the finger left.
    const { el, padOf, install } = makeSlider({ value: '0' });
    install();
    const pad = padOf();
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true }));
    expect(el.value, 'press applied synchronously').toBe('50');
    pad.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, bubbles: true }));
    pad.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, bubbles: true }));
    expect(el.value, 'release lands the pending position').toBe('100');
  });

  it('dispose() unwraps, leaving the input where it was', () => {
    const { el, host, install } = makeSlider();
    const before = el.parentElement;
    const ctl = install();
    expect(el.parentElement).not.toBe(before);
    ctl.dispose();
    expect(el.parentElement).toBe(host);
    expect(host.querySelector('.slider-wrap')).toBeNull();
  });

  it('the gesture surface is a plain element, not the form control', () => {
    // `input[type=range]` is where every WebKit quirk in this saga lived: a
    // native drag that only starts on the thumb, appearance changing the hit
    // box, and — per the device diagnostic — `input` events with no
    // `pointerdown` ever recorded. A div has none of them, which is also the
    // W3C APG slider pattern.
    const { el, host, padOf, install } = makeSlider();
    install();
    const pad = padOf();
    expect(pad).toBeTruthy();
    // ONE accessibility owner. The pad is a pure gesture surface: claiming
    // `role="slider"` while also being aria-hidden, with no keyboard handling
    // and no aria-valuenow, is a contradiction. The <input> keeps the semantics.
    // The <input> keeps the semantics: it is still in the tree, still focusable,
    // and still what AT drives.
    expect(host.contains(el)).toBe(true);
    expect(el.tagName).toBe('INPUT');
  });

  it('a pointercancel ends the drag without leaving listeners behind', () => {
    const { el, padOf, install } = makeSlider({ value: '0' });
    install();
    const pad = padOf();
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, bubbles: true }));
    pad.dispatchEvent(new PointerEvent('pointercancel', { clientX: 0, bubbles: true }));
    pad.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, bubbles: true }));
    expect(el.value).toBe('0');
  });

  it('measures the track ONCE per gesture, not once per frame', () => {
    // `getBoundingClientRect` forces a style+layout flush, and the render loop
    // has already written DOM styles by the time the coalescing rAF runs — so a
    // per-frame read meant a full relayout at 120 Hz for the whole drag. The
    // track cannot move mid-gesture: `.slider-wrap` is `touch-action: none`.
    const { rect, padOf, install } = makeSlider({ value: '0' });
    install();
    const pad = padOf();
    const track = pad.querySelector('.slider-track') as HTMLElement;
    let measured = 0;
    track.getBoundingClientRect = () => {
      measured++;
      return rect;
    };
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, bubbles: true }));
    for (let x = 10; x <= 150; x += 10) {
      pad.dispatchEvent(new PointerEvent('pointermove', { clientX: x, bubbles: true }));
    }
    pad.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, bubbles: true }));
    expect(measured).toBe(1);
  });

  it('a TOUCH drag works when pointer events never arrive', async () => {
    // WebKit has shipped versions that dispatch no pointer events for form
    // controls, and the device diagnostic showed `input` firing with no
    // `pointerdown` ever recorded — so the control cannot depend on that family.
    const { el, padOf, install } = makeSlider({ value: '0' });
    install();
    const pad = padOf();
    pad.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX: 150, identifier: 0 } as unknown as Touch],
        changedTouches: [{ clientX: 150, identifier: 0 } as unknown as Touch],
        bubbles: true,
      })
    );
    pad.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [{ clientX: 150, identifier: 0 } as unknown as Touch],
        changedTouches: [{ clientX: 150, identifier: 0 } as unknown as Touch],
        bubbles: true,
        cancelable: true,
      })
    );
    await frame();
    expect(el.value).toBe('50');
    pad.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
  });

  it('a second finger cannot move or end the first finger drag', async () => {
    // The defect the previous version had: a bare `dragging` flag meant ANY
    // pointer's move was accepted and any pointer's up ended the gesture.
    const { el, padOf, install } = makeSlider({ value: '0' });
    install();
    const pad = padOf();
    pad.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 150, bubbles: true })
    );
    pad.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 300, bubbles: true })
    );
    expect(el.value, 'a stray pointer must not move the value').toBe('50');
    pad.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientX: 300, bubbles: true }));
    // …and the real finger's drag must still be live.
    pad.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 300, bubbles: true })
    );
    await frame();
    expect(el.value).toBe('100');
  });

  it('a cancel does not commit a change', () => {
    // `pointercancel` means the gesture was taken away, not that the player
    // chose this value.
    const { el, padOf, install } = makeSlider({ value: '0' });
    const onChange = vi.fn();
    el.addEventListener('change', onChange);
    install();
    const pad = padOf();
    pad.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 150, bubbles: true })
    );
    pad.dispatchEvent(
      new PointerEvent('pointercancel', { pointerId: 1, clientX: 150, bubbles: true })
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('only ONE family drives a gesture, never both — including its MOVES', () => {
    // Pointer and touch both fire on platforms that support both; letting each
    // apply would double-handle every move.
    const { el, padOf, install } = makeSlider({ value: '0' });
    install();
    const pad = padOf();
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, bubbles: true }));
    pad.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX: 300, identifier: 0 } as unknown as Touch],
        changedTouches: [{ clientX: 300, identifier: 0 } as unknown as Touch],
        bubbles: true,
      })
    );
    expect(el.value).toBe('0');
    // The defect lived one event further on than the old test looked: a
    // touchmove used to be processed even though a pointer owned the gesture.
    pad.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [{ clientX: 300, identifier: 0 } as unknown as Touch],
        changedTouches: [{ clientX: 300, identifier: 0 } as unknown as Touch],
        bubbles: true,
        cancelable: true,
      })
    );
    expect(el.value).toBe('0');
  });

  it('dispose() stops handling', () => {
    const { el, padOf, install } = makeSlider({ value: '0' });
    const ctl = install();
    const pad = padOf();
    ctl.dispose();
    expect(padOf()).toBeNull();
    pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 150, bubbles: true }));
    expect(el.value).toBe('0');
  });
});
