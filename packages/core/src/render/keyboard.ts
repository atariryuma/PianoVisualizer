// Virtual MIDI keyboard renderer — 88-key piano (A0..C8) drawn at the
// bottom of the canvas with active / sustained / idle key highlights and
// optional "press this key next" hints driven by the practice schedule.
//
// Pure: takes ctx + canvas dimensions + midi state slice + opts. No globals.
// Key tables (KB_WHITE / KB_BLACK / KB_BLACK_LEFT_WHITE_IDX) are precomputed
// at module load and exported for callers that need them (e.g. the lane drawer
// uses KB_WHITE.length for x-positioning math).

import type { Hand } from '../state/practice-state';

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

// O(1) reverse lookup: white-key MIDI number → its index in KB_WHITE.
const WHITE_KEY_IDX: ReadonlyMap<number, number> = (() => {
  const m = new Map<number, number>();
  for (let i = 0; i < KB_WHITE.length; i++) m.set(KB_WHITE[i], i);
  return m;
})();

// =====================================================================
// Layout + hint constants
// =====================================================================

// Side padding around the keyboard. Shared between drawMidiKeyboard and
// keyboardKeyCenterX so a caller can ribbon-line a falling note's x-position
// down to the exact key center.
const KB_PADDING = 8;

// Hint tints — bright on purpose so the translucent overlay reads on both
// white and black keys.
const HINT_TINT_LH = '120, 180, 255';
const HINT_TINT_RH = '255, 150, 200';

// Outline strings are constant per (hand × primary), so precompute the four
// combinations rather than rebuild them per key per frame.
const HINT_STROKE_LH_PRIMARY = `rgba(${HINT_TINT_LH}, 0.95)`;
const HINT_STROKE_LH_MATE = `rgba(${HINT_TINT_LH}, 0.55)`;
const HINT_STROKE_RH_PRIMARY = `rgba(${HINT_TINT_RH}, 0.95)`;
const HINT_STROKE_RH_MATE = `rgba(${HINT_TINT_RH}, 0.55)`;

const HINT_BREATHING_HZ = 1.4;

// =====================================================================
// Public types
// =====================================================================

/**
 * "Press this key next" cue, drawn beneath the active/sustained overlay so a
 * real key press always wins visually.
 */
export interface KeyboardHintNote {
  hand: Hand;
  /** Top of the chord (the next-up note). Gets the heavier outline + ▼ marker.
   *  Other chord members render with the same tint at lower intensity so the
   *  primary stays clearly leading. */
  primary: boolean;
}

/** Snapshot of midiState that the keyboard renderer reads. Lets the caller
 *  inject a fresh shape (or a snapshot from a different source) for tests. */
export interface KeyboardMidiView {
  /** midi → { synColor, ... }. Renderer reads `synColor` only.
   *  Accepts both `string | null` (core test fixtures) and
   *  `string | undefined` (shell midiState shape — see legacy-app.js
   *  `MidiStateShape.activeNotes`). The renderer's truthiness check
   *  handles either. */
  activeNotes: Map<number, { synColor?: string | null }>;
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
  /** Optional next-up hint set: midi → { hand, primary }. Idle keys with a
   *  hint get a tinted overlay; active/sustained keys ignore the hint so a
   *  real press is never visually competed-against. Pass null in listen mode
   *  / free play so the keyboard renders as before. */
  hintNotes?: ReadonlyMap<number, KeyboardHintNote> | null;
  /** Guided 練習: いま期待している和音クラスタ全体（正解済み含む）の
   *  midi 集合。指定時、点灯中だが集合外のキー（= ちがう指）はテーマ色
   *  ではなく淡いスレート色 + 控えめな輪郭で塗る — 「和音のどのキーが
   *  違うのか」を手元（鍵盤）で直接見せる。叱り色（赤）は使わない。
   *  null / 省略で従来挙動（フリープレイ・listen・rhythm）。 */
  expectedNotes?: ReadonlySet<number> | null;
  /** Animation clock (ms, monotonic). Drives the 1.4 Hz breathing of hint
   *  keys. Ignored when `hintNotes` is empty. */
  nowMs?: number;
}

// =====================================================================
// Helpers
// =====================================================================

/**
 * On-screen center x (logical px) of a given MIDI key, matching the layout
 * drawn by drawMidiKeyboard. Lets a caller line up a vertical from a falling
 * note (or any UI element) to the exact key it lands on. Returns NaN for midi
 * outside the 88-key range (A0=21 .. C8=108).
 */
export function keyboardKeyCenterX(midi: number, screenW: number): number {
  const kbW = screenW - KB_PADDING * 2;
  const wKeyW = kbW / KB_WHITE.length;
  const wi = WHITE_KEY_IDX.get(midi);
  if (wi !== undefined) return KB_PADDING + (wi + 0.5) * wKeyW;
  const lwi = KB_BLACK_LEFT_WHITE_IDX[midi];
  if (lwi !== undefined) return KB_PADDING + (lwi + 1) * wKeyW;
  return NaN;
}

function hintTintFor(hand: Hand): string {
  return hand === 'L' ? HINT_TINT_LH : HINT_TINT_RH;
}

// =====================================================================
// Drawing
// =====================================================================

/**
 * Draw the 88-key virtual keyboard at the bottom of the canvas.
 *
 * Layout: KB_WHITE.length white keys span (screenW - 16) px; black keys
 * are centered between adjacent whites at 65% width and 60% height.
 *
 * Layer order per key:
 *   1. resting fill (or active/sustained color if pressed)
 *   2. hint tint overlay (idle keys only, when opts.hintNotes contains it)
 *   3. outline (active > sustained > primary-hint > mate-hint > default)
 *
 * After both rows, primary-hint keys get a small ▼ marker just above the key
 * to disambiguate the chord top from chord mates.
 *
 * "SUSTAIN" label appears top-left when the pedal is held.
 */
export function drawMidiKeyboard(
  ctx: CanvasRenderingContext2D,
  midi: KeyboardMidiView,
  opts: KeyboardDrawOptions
): void {
  const kbH = opts.kbHeight;
  const kbY = opts.screenH - kbH - opts.kbSafeBottom;
  const kbX = KB_PADDING;
  const kbW = opts.screenW - KB_PADDING * 2;
  const wKeyW = kbW / KB_WHITE.length;

  const hints = opts.hintNotes && opts.hintNotes.size > 0 ? opts.hintNotes : null;
  // One breathing phase shared across all hints (cohesive pulse).
  const breathe = hints
    ? 0.5 + 0.5 * Math.sin(((opts.nowMs ?? 0) / 1000) * Math.PI * 2 * HINT_BREATHING_HZ)
    : 0;

  ctx.save();
  ctx.fillStyle = 'rgba(20, 20, 35, 0.55)';
  ctx.fillRect(kbX, kbY, kbW, kbH);

  const paintKey = (m: number, x: number, w: number, h: number, restingFill: string) => {
    const note = midi.activeNotes.get(m);
    const lit = !!note;
    const sustained = midi.sustainedNotes.has(m);
    const hint = lit || sustained ? null : (hints?.get(m) ?? null);
    // 期待クラスタ指定時のみ: 点灯中だが期待外 = ちがう指。淡色で示す。
    const wrongPress = lit && !!opts.expectedNotes && !opts.expectedNotes.has(m);

    if (lit || sustained) {
      ctx.fillStyle = wrongPress
        ? 'rgba(150, 158, 175, 0.9)'
        : (note && note.synColor) || opts.noteThemeColor(m);
    } else {
      ctx.fillStyle = restingFill;
    }
    ctx.fillRect(x, kbY, w, h);

    if (hint) {
      const tint = hintTintFor(hint.hand);
      const baseA = hint.primary ? 0.4 : 0.22;
      const swingA = hint.primary ? 0.3 : 0.12;
      const a = baseA + swingA * breathe;
      ctx.fillStyle = `rgba(${tint}, ${a.toFixed(3)})`;
      ctx.fillRect(x, kbY, w, h);
    }

    if (lit && wrongPress) {
      // 正解キーの白リングと差をつける控えめな輪郭。
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(200, 205, 215, 0.6)';
    } else if (lit) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    } else if (sustained) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    } else if (hint && hint.primary) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = hint.hand === 'L' ? HINT_STROKE_LH_PRIMARY : HINT_STROKE_RH_PRIMARY;
    } else if (hint) {
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = hint.hand === 'L' ? HINT_STROKE_LH_MATE : HINT_STROKE_RH_MATE;
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

  // Markers drawn AFTER both key rows so a black key's ▼ isn't clipped by
  // its overlapping white-key paint.
  if (hints) {
    const sz = Math.max(4, Math.min(7, wKeyW * 0.45));
    const tipY = kbY - 3;
    const baseY = tipY - sz * 1.2;
    const a = (0.7 + 0.25 * breathe).toFixed(3);
    for (const [m, hint] of hints) {
      if (!hint.primary) continue;
      if (midi.activeNotes.has(m) || midi.sustainedNotes.has(m)) continue;
      const wi = WHITE_KEY_IDX.get(m);
      const cx =
        wi !== undefined
          ? kbX + (wi + 0.5) * wKeyW
          : kbX + (KB_BLACK_LEFT_WHITE_IDX[m] + 1) * wKeyW;
      ctx.fillStyle = `rgba(${hintTintFor(hint.hand)}, ${a})`;
      ctx.beginPath();
      ctx.moveTo(cx - sz, baseY);
      ctx.lineTo(cx + sz, baseY);
      ctx.lineTo(cx, tipY);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (midi.sustainOn) {
    ctx.fillStyle = 'rgba(255, 200, 100, 0.85)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(opts.sustainLabel, kbX + 6, kbY - 5);
  }
  ctx.restore();
}
