// Theme tables + per-note color resolvers.
//
// Pure: THEMES is a frozen tuple, color lookups are pure cyclic mod, the
// background-fade drawer takes ctx + opts. No globals, no DOM, no CONFIG
// dependency (the legacy CONFIG.THEMES table moves here).
//
// The synesthesia color callback is a thin wrapper around getNoteColor from
// render/particles — caller injects the note-name table + color map so this
// module stays i18n-agnostic.

import { getNoteColor } from './particles';

export interface Theme {
  /** Background tint as [r, g, b] (0..255). Used for the per-frame fade rect. */
  bg: readonly [number, number, number];
  /** Note-cycle palette — at least 6 entries, indexed by `midi % colors.length`. */
  colors: readonly string[];
  /** Center-glow rgba prefix, e.g. `'rgba(139,92,246,'`. Caller appends
   *  alpha + `')'` to build the gradient stop color. */
  glow: string;
}

/**
 * Default 4-theme palette. Order is significant — index is what gets persisted
 * to localStorage and surfaced in the theme picker dots.
 *   0: purple/pink, 1: cyan/green, 2: orange/red, 3: white/lavender.
 */
export const THEMES: readonly Theme[] = Object.freeze([
  Object.freeze({
    bg: Object.freeze([10, 10, 20]) as readonly [number, number, number],
    colors: Object.freeze(['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#6366f1', '#818cf8']),
    glow: 'rgba(139,92,246,',
  }),
  Object.freeze({
    bg: Object.freeze([8, 18, 20]) as readonly [number, number, number],
    colors: Object.freeze(['#06b6d4', '#22d3ee', '#34d399', '#10b981', '#14b8a6', '#67e8f9']),
    glow: 'rgba(6,182,212,',
  }),
  Object.freeze({
    bg: Object.freeze([20, 12, 8]) as readonly [number, number, number],
    colors: Object.freeze(['#f97316', '#fb923c', '#ef4444', '#f43f5e', '#eab308', '#fbbf24']),
    glow: 'rgba(249,115,22,',
  }),
  Object.freeze({
    bg: Object.freeze([12, 12, 18]) as readonly [number, number, number],
    colors: Object.freeze(['#e0e7ff', '#c7d2fe', '#a5b4fc', '#ddd6fe', '#f0f0ff', '#ffffff']),
    glow: 'rgba(200,200,255,',
  }),
]);

/**
 * Resolve a MIDI note number to its resting (un-pressed) theme color. Pure
 * cyclic lookup: `theme.colors[midi % theme.colors.length]`.
 */
export function noteThemeColor(midi: number, theme: Theme): string {
  const cols = theme.colors;
  return cols[((midi % cols.length) + cols.length) % cols.length];
}

export interface SynColorOptions {
  /** Synesthesia mode toggle. When false, synColorFor returns null. */
  enabled: boolean;
  /** Note-name table indexed by `midi % 12`. Defaults to sharps if omitted. */
  noteNames?: readonly string[];
  /** Note-name → color map (typically the C-major rainbow). Required when enabled. */
  colorMap: Record<string, string>;
}

const DEFAULT_NOTE_NAMES = Object.freeze([
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]);

/**
 * Per-note synesthesia color (e.g. all C's red, all D's orange...). Returns
 * `null` when synesthesia is off — the caller falls back to noteThemeColor.
 */
export function synColorFor(midi: number, opts: SynColorOptions): string | null {
  if (!opts.enabled) return null;
  const names = opts.noteNames ?? DEFAULT_NOTE_NAMES;
  const pc = ((midi % 12) + 12) % 12;
  return getNoteColor(names[pc], opts.colorMap);
}

export interface DrawBackgroundFadeOptions {
  screenW: number;
  screenH: number;
  /** Theme whose `bg` triple drives the fade tint. */
  theme: Theme;
  /** Current flow (0..100). Higher flow = slower fade (trails persist longer). */
  flow: number;
}

/**
 * Per-frame fade rect — paints `theme.bg` at low alpha across the canvas so
 * trails decay smoothly. Flow modulates the fade rate so high-energy moments
 * leave longer light streaks.
 */
export function drawBackgroundFade(
  ctx: CanvasRenderingContext2D,
  opts: DrawBackgroundFadeOptions
): void {
  const [r, g, b] = opts.theme.bg;
  const fadeRate = 0.08 + 0.06 * (1 - opts.flow / 100);
  ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + fadeRate + ')';
  ctx.fillRect(0, 0, opts.screenW, opts.screenH);
}
