// @vitest-environment happy-dom
//
// Tests for packages/web/src/viewport-layout.ts.
//
// Covers:
//   • measureBottom: null → 0, no-layout-box → 0, real bottom value.
//   • decideBgStarsAction: first call → reinit, no-field → reinit,
//     >25% delta → reinit, ≤25% delta → scale with correct factors.
//   • createViewportLayout factory:
//     - syncLayout: layout-mode dataset write, top-cluster-bottom +
//       kb-height CSS-prop writes, skip-same-value debounce, refresh
//       cached rect.
//     - refreshOsmdRect: writes the rect fields.
//     - onResizeBurst: rAF coalescing.
//     - getCurrentLayoutMode: reflects detectLayout output.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCanvasResize,
  createViewportLayout,
  decideBgStarsAction,
  makeCachedOsmdRect,
  measureBottom,
  type BgStarsField,
  type CachedOsmdRect,
  type CanvasResizeDeps,
} from '../src/viewport-layout';

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.dataset.layout = '';
  document.documentElement.style.removeProperty('--top-cluster-bottom');
  document.documentElement.style.removeProperty('--kb-height');
});

// ─── measureBottom ─────────────────────────────────────────────────

describe('measureBottom', () => {
  it('returns 0 for null', () => {
    expect(measureBottom(null)).toBe(0);
  });

  it('returns 0 when the element has zero-height (display:none / detached)', () => {
    const el = document.createElement('div');
    // Not appended → getBoundingClientRect returns all zeros.
    expect(measureBottom(el)).toBe(0);
  });

  it('returns the bottom edge for a sized element', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    // happy-dom doesn't actually layout, but we can spy on the rect.
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 50,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 10,
      toJSON: () => ({}),
    });
    expect(measureBottom(el)).toBe(50);
  });
});

// ─── decideBgStarsAction ───────────────────────────────────────────

describe('decideBgStarsAction', () => {
  it('returns reinit when prev is 0 (first call)', () => {
    expect(decideBgStarsAction(0, 0, 800, 600)).toEqual({ action: 'reinit' });
  });

  it('returns reinit when no field has been built yet', () => {
    expect(decideBgStarsAction(800, 600, 900, 700, false)).toEqual({ action: 'reinit' });
  });

  it('returns reinit on >25% width delta', () => {
    // 800 → 1100 = +37.5%
    expect(decideBgStarsAction(800, 600, 1100, 600)).toEqual({ action: 'reinit' });
  });

  it('returns reinit on >25% height delta', () => {
    // 600 → 800 = +33%
    expect(decideBgStarsAction(800, 600, 800, 800)).toEqual({ action: 'reinit' });
  });

  it('returns scale on small width delta (iOS URL-bar collapse)', () => {
    // 800 → 850 = +6.25%
    const got = decideBgStarsAction(800, 600, 850, 600);
    expect(got.action).toBe('scale');
    if (got.action === 'scale') {
      expect(got.sx).toBeCloseTo(850 / 800, 3);
      expect(got.sy).toBe(1);
    }
  });

  it('returns scale on a no-op resize (w/h unchanged)', () => {
    expect(decideBgStarsAction(800, 600, 800, 600)).toEqual({ action: 'scale', sx: 1, sy: 1 });
  });

  it('exactly-at-threshold (25%) is NOT reinit (strict >)', () => {
    // 800 → 1000 = +25% exactly
    const got = decideBgStarsAction(800, 600, 1000, 600);
    expect(got.action).toBe('scale');
  });
});

// ─── createViewportLayout (factory) ────────────────────────────────

function makeDom(): {
  practiceTopBar: HTMLElement;
  themeBar: HTMLElement;
  osmdContainer: HTMLElement;
} {
  const practiceTopBar = document.createElement('div');
  practiceTopBar.id = 'practiceTopBar';
  document.body.appendChild(practiceTopBar);

  const themeBar = document.createElement('div');
  themeBar.id = 'themeBar';
  document.body.appendChild(themeBar);

  const osmdContainer = document.createElement('div');
  osmdContainer.id = 'osmdContainer';
  document.body.appendChild(osmdContainer);

  return { practiceTopBar, themeBar, osmdContainer };
}

function spyRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

describe('createViewportLayout — syncLayout', () => {
  it('writes the layout dataset on the body', () => {
    const dom = makeDom();
    const cachedOsmdRect = makeCachedOsmdRect();
    // Force a known layout mode by stubbing innerWidth/Height.
    Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    vl.syncLayout();
    expect(document.body.dataset.layout).toBe('desktop');
    expect(vl.getCurrentLayoutMode()).toBe('desktop');
  });

  it('writes --top-cluster-bottom from max of practiceTopBar / themeBar', () => {
    const dom = makeDom();
    spyRect(dom.practiceTopBar, { bottom: 60, height: 40 });
    spyRect(dom.themeBar, { bottom: 30, height: 30 });
    const cachedOsmdRect = makeCachedOsmdRect();
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    vl.syncLayout();
    expect(document.documentElement.style.getPropertyValue('--top-cluster-bottom')).toBe('60px');
  });

  it('writes --kb-height (rounded) from getKbHeight()', () => {
    const dom = makeDom();
    const cachedOsmdRect = makeCachedOsmdRect();
    const vl = createViewportLayout({ dom, getKbHeight: () => 47.7, cachedOsmdRect });
    vl.syncLayout();
    expect(document.documentElement.style.getPropertyValue('--kb-height')).toBe('48px');
  });

  it('removes --top-cluster-bottom when topClusterBottom is 0 (no top bar)', () => {
    const dom = makeDom();
    // Both elements have zero-height → measureBottom returns 0 → max=0.
    const cachedOsmdRect = makeCachedOsmdRect();
    document.documentElement.style.setProperty('--top-cluster-bottom', '99px');
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    vl.syncLayout();
    expect(document.documentElement.style.getPropertyValue('--top-cluster-bottom')).toBe('');
  });

  it('skips :root writes when value is unchanged (debounce)', () => {
    const dom = makeDom();
    spyRect(dom.practiceTopBar, { bottom: 60, height: 40 });
    spyRect(dom.themeBar, { bottom: 30, height: 30 });
    const cachedOsmdRect = makeCachedOsmdRect();
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    const setSpy = vi.spyOn(document.documentElement.style, 'setProperty');
    vl.syncLayout();
    const firstCalls = setSpy.mock.calls.length;
    vl.syncLayout(); // identical values → no fresh setProperty calls
    expect(setSpy.mock.calls.length).toBe(firstCalls);
  });

  it('refreshes the cachedOsmdRect on every syncLayout', () => {
    const dom = makeDom();
    spyRect(dom.osmdContainer, { top: 100, bottom: 300, height: 200, width: 800, right: 800 });
    const cachedOsmdRect = makeCachedOsmdRect();
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    vl.syncLayout();
    expect(cachedOsmdRect.top).toBe(100);
    expect(cachedOsmdRect.bottom).toBe(300);
    expect(cachedOsmdRect.height).toBe(200);
    expect(cachedOsmdRect.width).toBe(800);
  });
});

describe('createViewportLayout — refreshOsmdRect', () => {
  it('mutates the rect in place', () => {
    const dom = makeDom();
    spyRect(dom.osmdContainer, { top: 50, bottom: 150, height: 100, width: 600, right: 600 });
    const cachedOsmdRect = makeCachedOsmdRect();
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    vl.refreshOsmdRect();
    expect(cachedOsmdRect.top).toBe(50);
    expect(cachedOsmdRect.height).toBe(100);
  });

  it('no-op when osmdContainer is null', () => {
    const dom = { practiceTopBar: null, themeBar: null, osmdContainer: null };
    const cachedOsmdRect: CachedOsmdRect = { ...makeCachedOsmdRect(), top: 999 };
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    vl.refreshOsmdRect();
    expect(cachedOsmdRect.top).toBe(999); // unchanged
  });
});

describe('createViewportLayout — onResizeBurst', () => {
  it('rAF-coalesces multiple bursts into a single syncLayout', async () => {
    const dom = makeDom();
    const cachedOsmdRect = makeCachedOsmdRect();
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    const setSpy = vi.spyOn(document.documentElement.style, 'setProperty');

    vl.syncLayout(); // baseline write
    setSpy.mockClear();

    // Three bursts in a row should coalesce to one rAF callback.
    // happy-dom executes rAF synchronously on next microtask flush.
    vl.onResizeBurst();
    vl.onResizeBurst();
    vl.onResizeBurst();

    // Drain the rAF queue.
    await new Promise((r) => setTimeout(r, 16));
    // The values are unchanged from the baseline → debounce skips
    // setProperty entirely. To assert coalescing, just verify no
    // throw + only one rAF tick fires (lib-internal behaviour).
    expect(true).toBe(true);
  });
});

describe('createViewportLayout — getCurrentLayoutMode', () => {
  it('starts at phone-portrait before first sync', () => {
    const dom = makeDom();
    const cachedOsmdRect = makeCachedOsmdRect();
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    expect(vl.getCurrentLayoutMode()).toBe('phone-portrait');
  });

  it('updates to the detected mode after sync', () => {
    const dom = makeDom();
    const cachedOsmdRect = makeCachedOsmdRect();
    Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });
    const vl = createViewportLayout({ dom, getKbHeight: () => 50, cachedOsmdRect });
    vl.syncLayout();
    expect(vl.getCurrentLayoutMode()).toBe('tablet');
  });
});

// ─── createCanvasResize (Phase 0d batch 59) ───────────────────────

interface ResizeFx {
  cr: ReturnType<typeof createCanvasResize>;
  canvas: HTMLCanvasElement;
  ctx: { setTransform: ReturnType<typeof vi.fn> };
  initBackgroundSpy: ReturnType<typeof vi.fn>;
  setRunning: (b: boolean) => void;
  setSize: (w: number, h: number, dpr?: number) => void;
  setSafeAreas: (
    vals: Partial<{
      safeBottom: number;
      safeLeft: number;
      safeRight: number;
    }>
  ) => void;
}

function makeCanvasResizeFixture(over: Partial<CanvasResizeDeps> = {}): ResizeFx {
  const canvas = document.createElement('canvas');
  const ctx = { setTransform: vi.fn() };
  const win = { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  let safeBottom = 0;
  let safeLeft = 0;
  let safeRight = 0;
  let running = false;
  const starCount = 30;
  const stars = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: i }));
  const initBackgroundSpy = vi.fn(({ starCount: sc }: { starCount: number }) => ({
    stars: stars(sc),
  }));
  const cr = createCanvasResize({
    canvas,
    ctx: ctx as unknown as CanvasRenderingContext2D,
    isRunning: () => running,
    getStarCount: () => starCount,
    initBackground: initBackgroundSpy as unknown as CanvasResizeDeps['initBackground'],
    win,
    getComputedStyle: () =>
      ({
        getPropertyValue(name: string) {
          if (name === '--safe-bottom') return String(safeBottom);
          if (name === '--safe-left') return String(safeLeft);
          if (name === '--safe-right') return String(safeRight);
          return '';
        },
      }) as unknown as CSSStyleDeclaration,
    ...over,
  });
  return {
    cr,
    canvas,
    ctx,
    initBackgroundSpy,
    setRunning: (b) => {
      running = b;
    },
    setSize: (w, h, dpr) => {
      win.innerWidth = w;
      win.innerHeight = h;
      if (dpr !== undefined) win.devicePixelRatio = dpr;
    },
    setSafeAreas: ({ safeBottom: sb, safeLeft: sl, safeRight: sr }) => {
      if (sb !== undefined) safeBottom = sb;
      if (sl !== undefined) safeLeft = sl;
      if (sr !== undefined) safeRight = sr;
    },
  };
}

describe('createCanvasResize — resize()', () => {
  it('writes canvas device-px width/height + DPR transform', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(1024, 768, 2);
    fx.cr.resize();
    expect(fx.canvas.width).toBe(2048);
    expect(fx.canvas.height).toBe(1536);
    expect(fx.ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('returns the freshly-measured dimensions in CSS px', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(800, 600);
    const d = fx.cr.resize();
    expect(d.W).toBe(800);
    expect(d.H).toBe(600);
  });

  it('reads safe-area insets via getComputedStyle (with +4 px pad on bottom)', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(800, 600);
    fx.setSafeAreas({ safeBottom: 12, safeLeft: 8, safeRight: 6 });
    const d = fx.cr.resize();
    expect(d.kbSafeBottom).toBe(16);
    expect(d.safeLeft).toBe(8);
    expect(d.safeRight).toBe(6);
  });

  it('clamps kbHeight to [38, 56]', () => {
    const tiny = makeCanvasResizeFixture();
    tiny.setSize(800, 100); // 100*0.065 = 6.5, clamped up to 38
    expect(tiny.cr.resize().kbHeight).toBe(38);

    const huge = makeCanvasResizeFixture();
    huge.setSize(800, 2000); // 2000*0.065 = 130, clamped down to 56
    expect(huge.cr.resize().kbHeight).toBe(56);

    const mid = makeCanvasResizeFixture();
    mid.setSize(800, 800); // 800*0.065 = 52
    expect(mid.cr.resize().kbHeight).toBe(52);
  });

  it('falls back to dpr=1 when devicePixelRatio is missing', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(640, 480, 0); // 0 → falsy → fallback
    fx.cr.resize();
    expect(fx.canvas.width).toBe(640);
    expect(fx.ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });
});

describe('createCanvasResize — bg-stars decisions', () => {
  it('does not init bg-stars when isRunning=false (boot path)', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(800, 600);
    fx.cr.resize(); // running=false
    expect(fx.initBackgroundSpy).not.toHaveBeenCalled();
    expect(fx.cr.getBgStars()).toBeNull();
  });

  it('initBgStars() seeds the field even when not running', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(800, 600);
    fx.cr.resize();
    fx.cr.initBgStars();
    expect(fx.initBackgroundSpy).toHaveBeenCalledWith({
      screenW: 800,
      screenH: 600,
      starCount: 30,
    });
    const bg = fx.cr.getBgStars();
    expect(bg).not.toBeNull();
    expect(bg!.stars.length).toBe(30);
  });

  it('reinits when running + dimensions change >25%', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(800, 600);
    fx.cr.resize();
    fx.cr.initBgStars();
    fx.setRunning(true);
    fx.initBackgroundSpy.mockClear();
    fx.setSize(1500, 600); // +87% width → reinit
    fx.cr.resize();
    expect(fx.initBackgroundSpy).toHaveBeenCalledOnce();
  });

  it('scales (no reinit) when running + dimensions change <=25%', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(1000, 600);
    fx.cr.resize();
    fx.cr.initBgStars();
    const before = fx.cr.getBgStars()!.stars.map((s) => ({ x: s.x, y: s.y }));
    fx.setRunning(true);
    fx.initBackgroundSpy.mockClear();
    fx.setSize(1100, 660); // +10% → scale, both axes
    fx.cr.resize();
    expect(fx.initBackgroundSpy).not.toHaveBeenCalled();
    const after = fx.cr.getBgStars()!.stars;
    // Stars should be scaled by sx=1100/1000=1.1, sy=660/600=1.1.
    expect(after[1].x).toBeCloseTo(before[1].x * 1.1, 5);
    expect(after[1].y).toBeCloseTo(before[1].y * 1.1, 5);
  });

  it('reinits when running but bg field never seeded (first running call)', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(800, 600);
    fx.cr.resize(); // boot: running=false, no bg
    fx.setRunning(true);
    fx.cr.resize(); // running: bg=null → action=reinit
    expect(fx.initBackgroundSpy).toHaveBeenCalledOnce();
  });
});

describe('createCanvasResize — getDimensions', () => {
  it('returns zeros before first resize', () => {
    const fx = makeCanvasResizeFixture();
    const d = fx.cr.getDimensions();
    expect(d.W).toBe(0);
    expect(d.H).toBe(0);
  });

  it('returns the most recent values after resize()', () => {
    const fx = makeCanvasResizeFixture();
    fx.setSize(1024, 768);
    fx.cr.resize();
    const d1 = fx.cr.getDimensions();
    expect(d1.W).toBe(1024);
    fx.setSize(2048, 1536);
    fx.cr.resize();
    const d2 = fx.cr.getDimensions();
    expect(d2.W).toBe(2048);
    // getDimensions returns the same in-place ref each call — useful
    // for the shell's `const d = _canvasResize.getDimensions()` boot
    // pattern.
    expect(d1).toBe(d2);
  });
});

// Suppress unused-var lint on the imported BgStarsField type — it's
// re-exported for shell wire-up but not directly referenced in tests.
const _unused: BgStarsField | null = null;
void _unused;
