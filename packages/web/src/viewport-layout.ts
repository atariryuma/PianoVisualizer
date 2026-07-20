// Viewport layout sync — Phase 0d batches 28 + 59.
//
// "What does the page look like right now?" — four coupled
// concerns that all run on resize / orientationchange / topBar text
// mutation:
//
//   1. measureBottom(el) — pure helper. Returns the element's
//      bottom-edge in viewport coords, or 0 when the element has
//      no layout box (display:none, detached, etc.). Skips a
//      getBoundingClientRect() call on null.
//
//   2. decideBgStarsAction(prevW, prevH, currW, currH) — pure
//      decision. Returns 'reinit' (re-randomize the star field —
//      first call OR >25% delta on either axis) or scale factors
//      (smaller iOS URL-bar collapse / soft-keyboard nudges shouldn't
//      flicker the field).
//
//   3. createViewportLayout(deps) — factory wrapping
//      syncLayout / refreshOsmdRect / onResizeBurst. Closes over the
//      cached layout mode + per-write skip cache (top-cluster-bottom
//      and kb-height — ResizeObserver fires every text mutation; an
//      unconditional :root setProperty would trigger a style recalc
//      every frame). Also caches the OSMD container rect so the
//      per-frame practice-lane draw skips a getBoundingClientRect
//      sync layout flush at 60fps.
//
//   4. createCanvasResize(deps) — factory for the boot-time + resize
//      handler that writes into the canvas (CSS-px → device-px), reads
//      safe-area insets from :root custom props, and decides whether
//      to reinit the bg-stars field. Returns the freshly-measured
//      dimensions. The shell keeps shadow `let W = 0` etc. that
//      mirror the factory's bag after each call, so existing reads
//      across legacy-app.js don't have to thread the bag through.
//
// Pure aside from the deliberate DOM mutations (`document.body.dataset.layout`,
// `:root` CSS custom-prop writes, the cached rect mutation, canvas
// width/height + transform, _bg star-positions). The factories close
// over their internal mutable state so the shell never sees the
// `_bg` / `_bgStarsPrevW` / `_bgStarsPrevH` bookkeeping vars.

import { detectLayout, type LayoutMode } from './layout-detect';

/** Pure bg-stars decision. Three outcomes:
 *    - { action: 'reinit' } — first call (prev = 0) OR major delta.
 *    - { action: 'scale', sx, sy } — minor delta, scale in place.
 *  The caller owns initBgStars() and the per-star x/y mutation. */
export type BgStarsAction = { action: 'reinit' } | { action: 'scale'; sx: number; sy: number };

const BG_STARS_REINIT_THRESHOLD = 0.25;

/** Pure: returns whether to fully reinit the star field or just
 *  scale existing positions in place. */
export function decideBgStarsAction(
  prevW: number,
  prevH: number,
  currW: number,
  currH: number,
  hasField: boolean = true
): BgStarsAction {
  // First call (prev = 0) seeds the field. Also reinit when the
  // caller hasn't built a field yet (boot path).
  if (!hasField || !prevW || !prevH) {
    return { action: 'reinit' };
  }
  const dx = Math.abs(currW - prevW) / Math.max(1, prevW);
  const dy = Math.abs(currH - prevH) / Math.max(1, prevH);
  if (dx > BG_STARS_REINIT_THRESHOLD || dy > BG_STARS_REINIT_THRESHOLD) {
    return { action: 'reinit' };
  }
  return { action: 'scale', sx: currW / prevW, sy: currH / prevH };
}

/** Pure: bottom-edge of an element in viewport coords; 0 when the
 *  element has no layout box. */
export function measureBottom(el: Element | null): number {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  return r.height > 0 ? r.bottom : 0;
}

/** Cached OSMD-container rect — drawPracticeLane reads this every
 *  frame to position the lane below the score. Mutated in place so
 *  consumers can hold a stable reference. */
export interface CachedOsmdRect {
  top: number;
  right: number;
  bottom: number;
  height: number;
  width: number;
}

export function makeCachedOsmdRect(): CachedOsmdRect {
  return { top: 0, right: 0, bottom: 0, height: 0, width: 0 };
}

/** DOM bag the layout sync touches. */
export interface ViewportLayoutDom {
  practiceTopBar: HTMLElement | null;
  themeBar: HTMLElement | null;
  osmdContainer: HTMLElement | null;
}

export interface ViewportLayoutDeps {
  dom: ViewportLayoutDom;
  /** Read fresh on every syncLayout() — the shell mutates `kbHeight`
   *  inside resize() before calling syncLayout, so a fixed-at-build
   *  value would go stale. */
  getKbHeight: () => number;
  /** Drawn into the cached rect so the per-frame lane draw can read
   *  it without a getBoundingClientRect() flush. */
  cachedOsmdRect: CachedOsmdRect;
}

export interface ViewportLayout {
  /** Run the full sync — layout-mode flip, top-cluster + kb-height
   *  CSS custom-prop writes (skip-same-value), refresh the cached
   *  OSMD rect. */
  syncLayout(): void;
  /** Refresh just the cached OSMD rect. Wired to ResizeObserver on
   *  the OSMD container so a score re-render updates the lane
   *  position immediately. */
  refreshOsmdRect(): void;
  /** rAF-coalesced syncLayout — wire to window.resize + window.
   *  orientationchange so the burst of events on iPad URL-bar
   *  collapse / iOS keyboard show/hide collapses to one paint. */
  onResizeBurst(): void;
  /** Read-only: the most-recently-decided layout mode. The shell
   *  caches this for drawPracticeLane to switch stacked vs split-h
   *  layouts without re-detecting. */
  getCurrentLayoutMode(): LayoutMode;
}

export function createViewportLayout(deps: ViewportLayoutDeps): ViewportLayout {
  // null = "not classified yet" — the first syncLayout must ALWAYS write
  // body.dataset.layout. Seeding with 'phone-portrait' made the !== guard
  // skip the first write on phones (detected mode == seed), so body carried
  // NO data-layout attribute and every body[data-layout='phone-portrait']
  // CSS rule silently failed until the mode changed (e.g. a rotation).
  let currentLayoutMode: LayoutMode | null = null;
  let lastTopClusterPx = -1;
  let lastKbHeightPx = -1;
  let resizePending = false;

  function refreshOsmdRect(): void {
    const el = deps.dom.osmdContainer;
    if (!el) return;
    const r = el.getBoundingClientRect();
    deps.cachedOsmdRect.top = r.top;
    deps.cachedOsmdRect.right = r.right;
    deps.cachedOsmdRect.bottom = r.bottom;
    deps.cachedOsmdRect.height = r.height;
    deps.cachedOsmdRect.width = r.width;
  }

  function syncLayout(): void {
    const layout = detectLayout(window.innerWidth, window.innerHeight);
    if (currentLayoutMode !== layout) {
      currentLayoutMode = layout;
      document.body.dataset.layout = layout;
    }
    const topClusterBottom = Math.round(
      Math.max(measureBottom(deps.dom.practiceTopBar), measureBottom(deps.dom.themeBar))
    );
    const kbPx = Math.round(deps.getKbHeight());
    const root = document.documentElement.style;

    // Skip same-value writes — ResizeObserver fires on every topBar
    // text mutation (section name, tempo, progress); unconditional
    // setProperty would trigger a :root style recalc on each.
    if (topClusterBottom !== lastTopClusterPx) {
      lastTopClusterPx = topClusterBottom;
      if (topClusterBottom > 0) {
        root.setProperty('--top-cluster-bottom', topClusterBottom + 'px');
      } else {
        root.removeProperty('--top-cluster-bottom');
      }
    }
    if (kbPx !== lastKbHeightPx) {
      lastKbHeightPx = kbPx;
      root.setProperty('--kb-height', kbPx + 'px');
    }
    refreshOsmdRect();
  }

  function onResizeBurst(): void {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      syncLayout();
    });
  }

  return {
    syncLayout,
    refreshOsmdRect,
    onResizeBurst,
    getCurrentLayoutMode: () => currentLayoutMode ?? 'phone-portrait',
  };
}

// ─── Canvas resize + bg-stars (Phase 0d batch 59) ───────────────────

/** Snapshot of viewport-derived dimensions. CSS pixels except where
 *  noted (the canvas itself is sized in device pixels by the factory,
 *  with `ctx.setTransform(dpr,0,0,dpr,0,0)` applied so all draw calls
 *  speak CSS pixels). */
export interface ViewportDimensions {
  /** Viewport width in CSS px. */
  W: number;
  /** Viewport height in CSS px. */
  H: number;
  /** safe-area-bottom + 4 px pad (the keyboard's safe inset). */
  kbSafeBottom: number;
  /** Pixel height of the on-canvas piano keyboard, clamped 38..56. */
  kbHeight: number;
  /** safe-area-left in CSS px. */
  safeLeft: number;
  /** safe-area-right in CSS px. */
  safeRight: number;
}

/** Bg-star field shape — opaque, mutated by the @piano/core
 *  background renderer + the in-place scaling branch. */
export interface BgStarsField {
  stars: Array<{ x: number; y: number; [k: string]: unknown }>;
  [k: string]: unknown;
}

export interface CanvasResizeDeps {
  /** The canvas element whose width/height get written each resize. */
  canvas: HTMLCanvasElement;
  /** 2D context — its transform is reset to (dpr,0,0,dpr,0,0) every
   *  resize so the rest of the draw code can keep speaking CSS px. */
  ctx: CanvasRenderingContext2D;
  /** Read-once-per-resize predicate: should the bg-stars field
   *  re-init when the dimensions actually change? Boot-time call
   *  has running=false so the field stays unset until the kid taps
   *  start; later calls update the field via the scale branch. */
  isRunning: () => boolean;
  /** Star count for the perf tier. Read fresh each initBgStars()
   *  so a future tier override picks up. */
  getStarCount: () => number;
  /** @piano/core's initBackground — separated as a dep so tests can
   *  stub a deterministic field. */
  initBackground: (opts: { screenW: number; screenH: number; starCount: number }) => BgStarsField;
  /** Optional window override (tests can stub a fake innerWidth/
   *  innerHeight + devicePixelRatio without juggling globals). */
  win?: {
    innerWidth: number;
    innerHeight: number;
    devicePixelRatio?: number;
  };
  /** Optional getComputedStyle override — tests can fake a
   *  CSSStyleDeclaration with safe-area-* values. */
  getComputedStyle?: (el: Element) => CSSStyleDeclaration;
}

export interface CanvasResize {
  /** Write canvas size + transform from window.innerW/H, sync the
   *  safe-area insets, decide on the bg-stars action. Returns the
   *  newly-measured dimensions so the shell can mirror them into its
   *  own `let W = 0` etc. */
  resize(): ViewportDimensions;
  /** Build (or rebuild) the bg-stars field. Idempotent if dimensions
   *  haven't changed; resize() calls this internally on the 'reinit'
   *  branch — the shell only needs to call it directly during the
   *  start-screen → running transition. */
  initBgStars(): void;
  /** The most-recently-resolved dimensions. Reads return zeros until
   *  the first resize() call. */
  getDimensions(): ViewportDimensions;
  /** Current bg-stars field (or null before initBgStars runs).
   *  drawBgStars in the legacy shell reads this each frame so the
   *  internal field never has to escape the factory closure. */
  getBgStars(): BgStarsField | null;
}

export function createCanvasResize(deps: CanvasResizeDeps): CanvasResize {
  const dim: ViewportDimensions = {
    W: 0,
    H: 0,
    kbSafeBottom: 4,
    kbHeight: 50,
    safeLeft: 0,
    safeRight: 0,
  };
  let bg: BgStarsField | null = null;
  let prevW = 0;
  let prevH = 0;

  function initBgStars(): void {
    bg = deps.initBackground({
      screenW: dim.W,
      screenH: dim.H,
      starCount: deps.getStarCount(),
    });
  }

  function maybeReinitBgStars(beforeW: number, beforeH: number): void {
    const decision = decideBgStarsAction(beforeW, beforeH, dim.W, dim.H, !!bg);
    if (decision.action === 'reinit') {
      initBgStars();
      return;
    }
    if (!bg) return;
    for (const s of bg.stars) {
      s.x *= decision.sx;
      s.y *= decision.sy;
    }
  }

  let prevDpr = 0;
  function resize(): ViewportDimensions {
    const win = deps.win ?? window;
    const dpr = win.devicePixelRatio || 1;
    const beforeW = prevW;
    const beforeH = prevH;
    // 同値リサイズの早期 return — iPad の URL バー伸縮やソフトキーボードで
    // resize がバースト発火するたび、canvas.width 代入（同値でも全消去＋
    // バッキングストア再確保 ≈ 15MB）が走っていた。寸法も dpr も不変なら
    // キャンバス再確保をスキップ（safe-area は寸法変化に随伴するので同時
    // スキップで問題ない）。bg-star の初回シード判定だけは通す — 「最初の
    // running resize で星をまく」契約を壊さないため（同寸法なら scale=1 の
    // 無害な走査）。
    if (win.innerWidth === prevW && win.innerHeight === prevH && dpr === prevDpr) {
      if (deps.isRunning()) maybeReinitBgStars(prevW, prevH);
      return dim;
    }
    prevDpr = dpr;
    dim.W = win.innerWidth;
    dim.H = win.innerHeight;
    deps.canvas.width = dim.W * dpr;
    deps.canvas.height = dim.H * dpr;
    deps.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Cached so the per-frame draw can skip getComputedStyle / Math.min/max.
    const cs = (deps.getComputedStyle ?? getComputedStyle)(document.documentElement);
    const readPx = (name: string): number => parseFloat(cs.getPropertyValue(name)) || 0;
    dim.kbSafeBottom = readPx('--safe-bottom') + 4;
    dim.safeLeft = readPx('--safe-left');
    dim.safeRight = readPx('--safe-right');
    dim.kbHeight = Math.min(56, Math.max(38, dim.H * 0.065));

    if (deps.isRunning()) maybeReinitBgStars(beforeW, beforeH);
    prevW = dim.W;
    prevH = dim.H;
    return dim;
  }

  return {
    resize,
    initBgStars,
    getDimensions: () => dim,
    getBgStars: () => bg,
  };
}
