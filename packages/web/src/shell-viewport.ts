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

import type { InitialGameState } from './game-state-init';
import type { DomBag } from './dom-bag';
import * as ViewportLayout from './viewport-layout';

export interface ShellViewportDeps {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: InitialGameState;
  /** Resize-observed elements. */
  practiceTopBarEl: HTMLElement;
  osmdContainerEl: HTMLElement;
  /** Theme + osmd container — used by ViewportLayout deps. */
  dom: Pick<DomBag, 'practiceTopBar' | 'themeBar' | 'osmdContainer'>;
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

  // Any viewport change must update BOTH the canvas backing store (resize)
  // AND the layout mode / CSS vars (onResizeBurst → syncLayout). Doing only
  // one of them is what squished landscape: the old orientationchange handler
  // re-ran the layout but NOT the canvas resize, so the canvas kept its
  // portrait width/height and got stretched into the wider viewport.
  function handleViewportChange(): void {
    resize();
    _viewportLayout.onResizeBurst();
  }
  window.addEventListener('resize', handleViewportChange);
  // iOS/iPadOS report a STALE window.innerWidth/innerHeight synchronously at
  // orientationchange (and resize() early-returns on unchanged dims), so a
  // single immediate pass misses the true post-rotation size. Run now
  // (best-effort) + after the viewport settles so the canvas + layout pick up
  // the real dimensions. visualViewport 'resize' is the most reliable signal
  // on mobile Safari and fires with correct dims — listen to it too.
  window.addEventListener('orientationchange', () => {
    handleViewportChange();
    setTimeout(handleViewportChange, 250);
  });
  window.visualViewport?.addEventListener('resize', handleViewportChange);
  if (typeof ResizeObserver !== 'undefined') {
    if (deps.practiceTopBarEl)
      new ResizeObserver(() => _viewportLayout.syncLayout()).observe(deps.practiceTopBarEl);
    // OSMD too — height changes on score load, OSMD re-render, and any
    // layout-mode flip. Without this, drawPracticeLane reads stale rect
    // after osmd renders fresh notation.
    if (deps.osmdContainerEl)
      new ResizeObserver(() => _viewportLayout.refreshOsmdRect()).observe(deps.osmdContainerEl);
  }

  // getScreen はパーティクル draw 等の最深ホットパスから毎フレーム大量に
  // 呼ばれる。安定した1オブジェクトを使い回して呼び出しごとのアロケーションを
  // 排除する（呼び出し側は全て即時 read / 分割代入で、参照を長期保持しない）。
  const _screen = { W: 0, H: 0 };
  return {
    getScreen: () => {
      _screen.W = W;
      _screen.H = H;
      return _screen;
    },
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
