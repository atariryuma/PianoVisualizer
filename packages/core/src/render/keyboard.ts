// Virtual MIDI keyboard renderer — 88-key piano (A0..C8) drawn at the
// bottom of the canvas with active / sustained / idle key highlights.
//
// Pure: takes ctx + canvas dimensions + midi state slice + opts. No globals.
// Key tables (KB_WHITE / KB_BLACK / KB_BLACK_LEFT_WHITE_IDX) are precomputed
// at module load and exported for callers that need them (e.g. the lane drawer
// uses KB_WHITE.length for x-positioning math).

// =====================================================================
// Precomputed key tables (88-key piano: A0=21 ... C8=108)
// =====================================================================

/** White-key MIDI note numbers, ascending. 52 entries on an 88-key piano. */
export const KB_WHITE: readonly number[] = (() => {
  const out: number[] = [];
  for (let m = 21; m <= 108; m++) {
    const pc = m % 12;
    if (pc !== 1 && pc !== 3 && pc !== 6 && pc !== 8 && pc !== 10) out.push(m);
  }
  return out;
})();

/** Black-key MIDI note numbers, ascending. 36 entries on an 88-key piano. */
export const KB_BLACK: readonly number[] = (() => {
  const out: number[] = [];
  for (let m = 21; m <= 108; m++) {
    const pc = m % 12;
    if (pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10) out.push(m);
  }
  return out;
})();

/**
 * For each black-key MIDI number, the index into KB_WHITE of the white key
 * immediately to its LEFT. Used to overlay the black key between two whites
 * without re-searching every frame.
 */
export const KB_BLACK_LEFT_WHITE_IDX: Readonly<Record<number, number>> = (() => {
  const out: Record<number, number> = {};
  for (const bm of KB_BLACK) {
    const wi = KB_WHITE.indexOf(bm - 1);
    if (wi >= 0) out[bm] = wi;
  }
  return out;
})();

// =====================================================================
// Drawing
// =====================================================================

/** Snapshot of midiState that the keyboard renderer reads. Lets the caller
 *  inject a fresh shape (or a snapshot from a different source) for tests. */
export interface KeyboardMidiView {
  /** midi → { synColor: string | null, ... }. Renderer reads `synColor` only. */
  activeNotes: Map<number, { synColor: string | null }>;
  /** Pedal-held released keys. */
  sustainedNotes: Set<number>;
  /** Sustain pedal state (drives the "SUSTAIN" label). */
  sustainOn: boolean;
}

export interface KeyboardDrawOptions {
  /** Canvas width (logical px). */
  screenW: number;
  /** Canvas height (logical px). */
  screenH: number;
  /** Keyboard height in px. */
  kbHeight: number;
  /** Bottom safe-area inset (e.g. iOS home indicator). */
  kbSafeBottom: number;
  /** Resolves a MIDI note number to its theme color (used when no synColor). */
  noteThemeColor: (midi: number) => string;
  /** Resolves the localized "SUSTAIN" label text. */
  sustainLabel: string;
}

/**
 * Draw the 88-key virtual keyboard at the bottom of the canvas.
 *
 * Layout: KB_WHITE.length white keys span (screenW - 16) px; black keys
 * are centered between adjacent whites at 65% width and 60% height.
 * Active / sustained keys paint their note color; idle ones paint default.
 * "SUSTAIN" label appears top-left when the pedal is held.
 */
export function drawMidiKeyboard(
  ctx: CanvasRenderingContext2D,
  midi: KeyboardMidiView,
  opts: KeyboardDrawOptions
): void {
  const kbH = opts.kbHeight;
  const kbY = opts.screenH - kbH - opts.kbSafeBottom;
  const kbX = 8;
  const kbW = opts.screenW - 16;
  const wKeyW = kbW / KB_WHITE.length;

  ctx.save();
  ctx.fillStyle = 'rgba(20, 20, 35, 0.55)';
  ctx.fillRect(kbX, kbY, kbW, kbH);

  const paintKey = (m: number, x: number, w: number, h: number, restingFill: string) => {
    const note = midi.activeNotes.get(m);
    const lit = !!note;
    const sustained = midi.sustainedNotes.has(m);
    if (lit || sustained) {
      ctx.fillStyle = (note && note.synColor) || opts.noteThemeColor(m);
    } else {
      ctx.fillStyle = restingFill;
    }
    ctx.fillRect(x, kbY, w, h);
    if (lit) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    } else if (sustained) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    }
    ctx.strokeRect(x, kbY, w, h);
  };

  // White keys first — full height.
  for (let i = 0; i < KB_WHITE.length; i++) {
    paintKey(KB_WHITE[i], kbX + i * wKeyW + 0.5, wKeyW - 1, kbH, 'rgba(245, 245, 250, 0.85)');
  }
  // Black keys overlaid on top — narrower + shorter, sit between whites.
  const bKeyW = wKeyW * 0.65;
  const bKeyH = kbH * 0.6;
  for (const m of KB_BLACK) {
    const wi = KB_BLACK_LEFT_WHITE_IDX[m];
    const x = kbX + (wi + 1) * wKeyW - bKeyW / 2;
    paintKey(m, x, bKeyW, bKeyH, 'rgba(15, 15, 25, 0.95)');
  }

  if (midi.sustainOn) {
    ctx.fillStyle = 'rgba(255, 200, 100, 0.85)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(opts.sustainLabel, kbX + 6, kbY - 5);
  }
  ctx.restore();
}
