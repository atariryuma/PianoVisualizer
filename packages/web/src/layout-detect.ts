// Layout-mode detector — Phase 0d batch 24.
//
// Pure viewport → layout-mode classifier. Runs on every resize +
// orientationchange to decide which CSS layout family applies:
//
//   - 'desktop'         : explicitly wide (w >= 1200). Includes
//                         landscape iPad Pro 12.9 (1366x1024).
//   - 'tablet'          : longest edge >= 900 AND short edge >= 600.
//                         Covers iPad Air/mini/Pro in either
//                         orientation (768x1024, 820x1180, 834x1194,
//                         1024x1366) without demoting them to phone
//                         in portrait.
//   - 'phone-landscape' : short height + landscape orientation, NOT
//                         a desktop-class width. The w<1024 cap stops
//                         a 1199x500 desktop-window from being mis-
//                         classified.
//   - 'phone-portrait'  : everything else (default).
//
// Pure: a function of (w, h). The legacy shell wraps this with a
// closure-cached `currentLayoutMode` so a no-op transition skips the
// :root style recalc; the cache lives in the shell, not here, so this
// module is fully testable in isolation.
//
// The boundaries above were tuned during 0c against a real iPad Pro
// 12.9 / iPad Air 4 / iPhone 14 / Pixel 7 / desktop Chrome matrix.
// Don't move them without re-running the device sweep.

export type LayoutMode = 'desktop' | 'tablet' | 'phone-landscape' | 'phone-portrait';

const DESKTOP_MIN_W = 1200;
const TABLET_LONGEST_MIN = 900;
const TABLET_SHORTEST_MIN = 600;
const PHONE_LANDSCAPE_HEIGHT_MAX = 520;
const PHONE_LANDSCAPE_WIDTH_CAP = 1024;

/** Classify a viewport size into one of the four layout modes. */
export function detectLayout(w: number, h: number): LayoutMode {
  const longest = Math.max(w, h);
  // Desktop: explicitly wide. Catches landscape iPad Pro 12.9 (1366×1024).
  if (w >= DESKTOP_MIN_W) return 'desktop';
  // Tablet: longest edge ≥ 900 covers iPad Air/mini/Pro in either
  // orientation (768×1024, 820×1180, 834×1194, 1024×1366) without
  // demoting them to phone in portrait.
  if (longest >= TABLET_LONGEST_MIN && Math.min(w, h) >= TABLET_SHORTEST_MIN) {
    return 'tablet';
  }
  // Phone landscape: short height + landscape AND not desktop-class
  // width. The w<1024 cap stops 1199×500 desktop windows from being
  // misclassified.
  if (w > h && h <= PHONE_LANDSCAPE_HEIGHT_MAX && w < PHONE_LANDSCAPE_WIDTH_CAP) {
    return 'phone-landscape';
  }
  return 'phone-portrait';
}
