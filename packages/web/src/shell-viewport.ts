// Viewport shell — Phase 0d batch 114.
//
// Owns the mutable canvas dimensions (W, H, kbHeight, kbSafeBottom,
// safeRight) + the cached OSMD rect + the perf-tier resolution. The
// shell hands the resulting `ShellViewport` instance to every other
// shell that needs `getScreen()` / `getKbHeight()` / etc.
//
// Cluster ownership: this module also installs the resize listeners
// (window + orientationchange + 2 ResizeObservers on practiceTopBar
// and osmdContainer).

import * as ViewportLayout from './viewport-layout';

export interface ShellViewportDeps {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: any;
  /** Resize-observed elements. */
  practiceTopBarEl: HTMLElement;
  osmdContainerEl: HTMLElement;
  /** Theme + osmd container — used by ViewportLayout deps. */
  dom: any;
  pianoCore: any;
}

export interface ShellViewport {
  /** Mutable screen dimensions — read at fire time. */
  getScreen: () => { W: number; H: number };
  getKbHeight: () => number;
  getKbSafeBottom: () => number;
  getSafeRight: () => number;
  /** Re-run the resize calculation. */
  resize: () => void;
  initBgStars: () => void;
  refreshOsmdRect: () => void;
  syncLayout: () => void;
  onResizeBurst: () => void;
  /** ViewportLayout result — the practice-lane consumes its
   *  `getCurrentLayoutMode` for its layout switch. */
  layout: ReturnType<typeof ViewportLayout.createViewportLayout>;
  /** Bg-stars accessor — populated by initBgStars(). */
  getBgStars: () => any;
  /** OSMD rect cache shared with practice-lane. */
  cachedOsmdRect: any;
  /** Perf-tier resolution + profile (passed to ParticleEffects). */
  perfTier: any;
  perfProfile: any;
}

export function createShellViewport(deps: ShellViewportDeps): ShellViewport {
  let W = 0;
  let H = 0;
  let kbSafeBottom = 4;
  let kbHeight = 50;
  let safeRight = 0;

  const perfTier = deps.pianoCore.detectPerfTier();
  const perfProfile = deps.pianoCore.PERF_PROFILES[perfTier];

  const _canvasResize = ViewportLayout.createCanvasResize({
    canvas: deps.canvas,
    ctx: deps.ctx,
    isRunning: () => !!deps.state.running,
    getStarCount: () => perfProfile.bgStarCount,
    initBackground: (opts: any) => deps.pianoCore.initBackground(opts),
  } as any);

  function resize(): void {
    const d = _canvasResize.resize();
    W = d.W;
    H = d.H;
    kbHeight = d.kbHeight;
    kbSafeBottom = d.kbSafeBottom;
    safeRight = d.safeRight;
  }

  const cachedOsmdRect = ViewportLayout.makeCachedOsmdRect();
  const _viewportLayout = ViewportLayout.createViewportLayout({
    dom: deps.dom,
    getKbHeight: () => kbHeight,
    cachedOsmdRect,
  } as any);

  // Boot-time resize + layout-sync runs.
  resize();
  _viewportLayout.syncLayout();

  // Resize listeners.
  window.addEventListener('resize', resize);
  window.addEventListener('resize', () => _viewportLayout.onResizeBurst());
  window.addEventListener('orientationchange', () => _viewportLayout.onResizeBurst());
  if (typeof ResizeObserver !== 'undefined') {
    if (deps.practiceTopBarEl)
      new ResizeObserver(() => _viewportLayout.syncLayout()).observe(deps.practiceTopBarEl);
    // OSMD too — height changes on score load, OSMD re-render, and any
    // layout-mode flip. Without this, drawPracticeLane reads stale rect
    // after osmd renders fresh notation.
    if (deps.osmdContainerEl)
      new ResizeObserver(() => _viewportLayout.refreshOsmdRect()).observe(deps.osmdContainerEl);
  }

  return {
    getScreen: () => ({ W, H }),
    getKbHeight: () => kbHeight,
    getKbSafeBottom: () => kbSafeBottom,
    getSafeRight: () => safeRight,
    resize,
    initBgStars: () => _canvasResize.initBgStars(),
    refreshOsmdRect: () => _viewportLayout.refreshOsmdRect(),
    syncLayout: () => _viewportLayout.syncLayout(),
    onResizeBurst: () => _viewportLayout.onResizeBurst(),
    layout: _viewportLayout,
    getBgStars: () => _canvasResize.getBgStars(),
    cachedOsmdRect,
    perfTier,
    perfProfile,
  };
}
