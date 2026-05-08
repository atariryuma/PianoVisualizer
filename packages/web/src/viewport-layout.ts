// Viewport layout sync — Phase 0d batch 28.
//
// "What does the page look like right now?" — three coupled
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
// Pure aside from the deliberate DOM mutations (`document.body.dataset.layout`,
// `:root` CSS custom-prop writes, the cached rect mutation). The
// shell still owns `resize()` itself because it mutates outer-scope
// W/H/kbHeight identifiers used across the rest of legacy-app.js;
// this module covers what runs *after* the dimensions are known.

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
  let currentLayoutMode: LayoutMode = 'phone-portrait';
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
    getCurrentLayoutMode: () => currentLayoutMode,
  };
}
