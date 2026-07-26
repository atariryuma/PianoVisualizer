// Cross-cutting shell helpers — Phase 0d batch 38.
//
// Small grab-bag of utility functions used across the loop +
// session-summary + result-card modules + lane drawer. Each is too
// tiny to warrant its own module but worth extracting collectively
// so the typed shell shrinks and the helpers gain test coverage.
//
//   1. setupHiDPICanvas(canvas, w, h) — sizes a canvas to the given
//      CSS pixels with backing store scaled by devicePixelRatio.
//      Returns the 2D context with the DPR transform pre-applied.
//      Shared by result-card.drawHistoryChart and
//      session-summary.drawRadarChart.
//
//   2. notePitchClass(midi) — pure: MIDI → pitch class (0..11).
//      Handles negative MIDI defensively.
//
//   3. midiToFreq(midi) — pure: MIDI → Hz (A4=440 anchor).
//
//   4. noteStateLabel(n) — pure: short suffix for tick logs ("HIT" /
//      "MISS" / ""). Called n_state in the legacy shell.
//
//   5. midiToPitchName(midi, noteNames) — pure: MIDI → bilingual
//      pitch name (caller passes the active table — JP-mode
//      ['ド','レ',…] or EN-mode CONFIG.NOTE_NAMES).
//
//   6. midiToFullName(midi, noteNames) — pure: pitch name +
//      Helmholtz octave digit (e.g. 'C4', 'ド4').
//
//   7. readContextLatencyMs(ctx) — what an AudioContext reports about its
//      own output latency, in ms. Two callers need exactly this (the
//      per-section audio-offset probe and the settings panel's read-out) and
//      each had its own copy of the same three subtleties: unwrap Tone's
//      wrapper to the raw context, seconds → ms, and treat a missing field as
//      0 rather than as undefined arithmetic.
//
// These are all pure functions; no state, no side effects, no DOM
// reads (setupHiDPICanvas takes the canvas explicitly). Tests are
// pure-pure too — no fixture beyond the inputs.

/** Sizes a canvas to the given CSS pixels with backing store scaled
 *  by devicePixelRatio, returns the 2D context with DPR pre-applied
 *  so callers can draw in CSS pixels. Returns null when the context
 *  isn't available (older browsers or stripped-down test envs). */
export function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  w: number,
  h: number
): CanvasRenderingContext2D | null {
  const c = canvas.getContext('2d');
  if (!c) return null;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return c;
}

/** Pure: MIDI → pitch class (0..11). Handles negative inputs by
 *  reducing to the canonical [0, 12) range — a -1 MIDI maps to 11
 *  (B), not -1, so the lookup table never under-indexes. */
export function notePitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Pure: MIDI → Hz with A4=440 as the anchor. midi=69 → 440 Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Subset of OSMD-derived note we read for the diag suffix. */
export interface NoteStateRef {
  hit?: boolean;
  missed?: boolean;
}

/** Pure: short suffix for tick logs. Returns " HIT", " MISS", or "" —
 *  the leading space lets callers concatenate without a separator. */
export function noteStateLabel(n: NoteStateRef): string {
  if (n.hit) return ' HIT';
  if (n.missed) return ' MISS';
  return '';
}

/** Pure: MIDI → pitch name from the given table. Caller passes the
 *  active 12-entry array (EN: ['C','C#',…], JP: ['ド','ド#',…]). */
export function midiToPitchName(midi: number, noteNames: readonly string[]): string {
  return noteNames[notePitchClass(midi)] ?? '';
}

/** Pure: pitch name + Helmholtz octave digit (e.g. C4 = 'C4', JP
 *  ド4). MIDI 60 = C4 in the most-common piano-roll convention
 *  (Math.floor(60/12)-1 = 4). */
export function midiToFullName(midi: number, noteNames: readonly string[]): string {
  return midiToPitchName(midi, noteNames) + (Math.floor(midi / 12) - 1);
}

/** The two latency figures a Web Audio context reports about itself, in ms. */
export interface ReportedContextLatency {
  /** `outputLatency` — the speaker-side figure. 0 on every Apple platform
   *  (WebKit doesn't implement it), which callers must read as "unknown"
   *  rather than as "this device has no latency". */
  outMs: number;
  /** `baseLatency` — the render-quantum figure (~5-10 ms). Real, but far
   *  smaller than true output latency, so it cannot stand in for it. */
  baseMs: number;
}

/** Shape of either a Tone context (which wraps the real one) or a plain
 *  AudioContext. Structural on purpose — no Tone import in the helpers. */
export interface LatencyReportingContext {
  outputLatency?: number;
  baseLatency?: number;
  rawContext?: { outputLatency?: number; baseLatency?: number };
}

/**
 * Read an AudioContext's self-reported latency in ms, unwrapping Tone's
 * wrapper first (Tone's own `context` object does not forward these fields
 * reliably; `rawContext` is the actual AudioContext).
 *
 * Returns null when there is no context at all — distinct from a context that
 * reports zeros, which is a real answer meaning "not implemented here".
 */
export function readContextLatencyMs(
  ctx: LatencyReportingContext | null | undefined
): ReportedContextLatency | null {
  const real = ctx?.rawContext ?? ctx;
  if (!real) return null;
  return {
    outMs: (real.outputLatency || 0) * 1000,
    baseMs: (real.baseLatency || 0) * 1000,
  };
}
