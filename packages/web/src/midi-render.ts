// MIDI render — keyboard / beams / chord-display + the keyboard
// hint-notes builder. Phase 0d batch 16 extraction from legacy-app.js.
//
// Three small thin-wrapper helpers + one cohesive computation:
//
//   • drawMidiKeyboard — virtual 88-key bottom strip; delegates to
//     PianoCore.drawMidiKeyboard with the live midiState + the
//     practice hint-notes set.
//
//   • drawMidiBeams — sustained-note vertical beams from the keyboard
//     up to the previous note row; PianoCore.drawMidiBeams.
//
//   • drawMidiChordDisplay — chord-name overlay with two layouts:
//     free-play big centered + scale-pulse, practice quiet small
//     above the keyboard. 1800ms fade-in / fade-out lifecycle.
//
//   • buildKeyboardHintNotes — pure function. Walks the upcoming
//     section notes from the current cursor and returns a Map of
//     midi → { hand, primary } for the keyboard renderer's
//     "next-up" highlight. Chord-mates within ±CHORD_MATE_TOLERANCE_MS
//     of the primary note share the highlight at lower intensity.
//     Returns null when there's nothing to highlight (skips the
//     map allocation entirely on idle frames).

/** MIDI runtime slice — shared with practice-tick + render-late. */
export interface MidiRenderMidiState {
  activeNotes: Map<number, { velocity: number; onTimeMs: number; synColor?: string }>;
  sustainOn: boolean;
  sustainedNotes: Set<number>;
  lastChordName: string;
  lastChordTimeMs: number;
}

/** Practice slice — only the section + cursor + mode are read. */
export interface MidiRenderPracticeRef {
  enabled: boolean;
  mode: string;
  sectionNotes: Array<{
    timeMs: number;
    midi: number;
    hand?: string;
    hit?: boolean;
    missed?: boolean;
    _filtered?: boolean;
  }>;
  currentNoteIdx: number;
}

/** Hint entry returned by buildKeyboardHintNotes. */
export interface KeyboardHint {
  hand?: string;
  primary: boolean;
}

/** Build the next-up keyboard hint set. Pure: no DOM/canvas writes,
 *  no clock reads. Tested in isolation.
 *
 *  - returns null when there's nothing to highlight (practice off,
 *    listen mode, or no remaining unresolved notes)
 *  - the "primary" hint is the very next unresolved note (gets the
 *    down-arrow in the renderer)
 *  - chord-mates within ±chordMateToleranceMs share the highlight
 *    at lower intensity (primary: false) so they stay visually
 *    subordinate */
export function buildKeyboardHintNotes(
  practice: MidiRenderPracticeRef,
  chordMateToleranceMs: number
): Map<number, KeyboardHint> | null {
  if (!practice.enabled || practice.mode === 'listen') return null;
  const notes = practice.sectionNotes;
  let idx = practice.currentNoteIdx;
  while (idx < notes.length && (notes[idx].hit || notes[idx].missed)) idx++;
  if (idx >= notes.length) return null;
  const cur = notes[idx];
  const out = new Map<number, KeyboardHint>();
  out.set(cur.midi, { hand: cur.hand, primary: true });
  for (let i = idx + 1; i < notes.length; i++) {
    const m = notes[i];
    if (m.timeMs - cur.timeMs > chordMateToleranceMs) break;
    if (m.hit || m.missed || m._filtered) continue;
    if (!out.has(m.midi)) out.set(m.midi, { hand: m.hand, primary: false });
  }
  return out;
}

/** PianoCore.drawMidiKeyboard forwarder type. */
export type DrawMidiKeyboardFn = (ctx: CanvasRenderingContext2D, midiState: any, opts: any) => void;

/** PianoCore.drawMidiBeams forwarder type. */
export type DrawMidiBeamsFn = (ctx: CanvasRenderingContext2D, midiState: any, opts: any) => void;

/** Live screen + keyboard layout. */
export interface MidiRenderLayout {
  W: number;
  H: number;
  kbHeight: number;
  kbSafeBottom: number;
}

export interface MidiRenderDeps {
  ctx: CanvasRenderingContext2D;
  midiState: MidiRenderMidiState;
  practice: MidiRenderPracticeRef;
  /** Live layout snapshot — re-read each frame in case of resize. */
  getLayout(): MidiRenderLayout;
  /** PianoCore wrappers. */
  drawMidiKeyboard: DrawMidiKeyboardFn;
  drawMidiBeams: DrawMidiBeamsFn;
  /** Pitch → screen-X mapping for the beam columns. */
  midiToScreenX: (midi: number) => number;
  /** Theme-aware color for a given MIDI pitch. */
  noteThemeColor: (midi: number) => string;
  /** Practice chord-mate tolerance (ms) — notes within this window of
   *  the primary cue are considered chord-mates and share the hint at
   *  lower intensity. Mirrors CONFIG.CHORD_MATE_TOLERANCE_MS. */
  chordMateToleranceMs: number;
  /** Whether the perf profile allows shadowBlur on text. iOS Safari
   *  on low-tier devices forces software raster on shadowBlur — gate
   *  via PERF_PROFILE so the chord display stays smooth on weak HW. */
  shadowBlurEnabled: boolean;
  /** i18n labels — refresh via setLabels. The keyboard renders the
   *  sustain-pedal label when sustainOn=true. */
  sustainLabel: string;
}

export interface MidiRender {
  drawKeyboard(): void;
  drawBeams(timeMs: number): void;
  drawChordDisplay(timeMs: number): void;
  setLabels(labels: { sustainLabel: string }): void;
}

const CHORD_LIFE_MS = 1800;
const CHORD_FADE_IN = 0.12;

export function createMidiRender(deps: MidiRenderDeps): MidiRender {
  let sustainLabel = deps.sustainLabel;

  function drawKeyboard(): void {
    const layout = deps.getLayout();
    deps.drawMidiKeyboard(deps.ctx, deps.midiState, {
      screenW: layout.W,
      screenH: layout.H,
      kbHeight: layout.kbHeight,
      kbSafeBottom: layout.kbSafeBottom,
      noteThemeColor: deps.noteThemeColor,
      sustainLabel,
      hintNotes: buildKeyboardHintNotes(deps.practice, deps.chordMateToleranceMs),
      nowMs: performance.now(),
    });
  }

  function drawBeams(timeMs: number): void {
    const layout = deps.getLayout();
    deps.drawMidiBeams(deps.ctx, deps.midiState, {
      kbTop: layout.H - layout.kbHeight - layout.kbSafeBottom,
      timeMs,
      midiToScreenX: deps.midiToScreenX,
      noteThemeColor: deps.noteThemeColor,
    });
  }

  function drawChordDisplay(timeMs: number): void {
    const ms = deps.midiState;
    if (!ms.lastChordName) return;
    const age = timeMs - ms.lastChordTimeMs;
    if (age > CHORD_LIFE_MS) return;
    const t = age / CHORD_LIFE_MS;
    const alpha =
      t < CHORD_FADE_IN
        ? t / CHORD_FADE_IN
        : Math.max(0, 1 - (t - CHORD_FADE_IN) / (1 - CHORD_FADE_IN));
    const layout = deps.getLayout();
    const ctx = deps.ctx;
    ctx.save();
    const useShadow = deps.shadowBlurEnabled;
    if (deps.practice.enabled) {
      // Quiet practice variant: above the keyboard, small, fade-only.
      const yPos = layout.H - layout.kbHeight - layout.kbSafeBottom - 22;
      ctx.translate(layout.W / 2, yPos);
      ctx.fillStyle = 'rgba(255, 220, 140, ' + (alpha * 0.75).toFixed(3) + ')';
      ctx.font =
        '500 ' + Math.round(Math.min(28, layout.W * 0.022)) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (useShadow) {
        ctx.shadowColor = 'rgba(255, 200, 80, 0.5)';
        ctx.shadowBlur = 10;
      }
      ctx.fillText(ms.lastChordName, 0, 0);
      ctx.restore();
      return;
    }
    // Free-play celebration variant: big centered + scale-pulse.
    const scale = 0.9 + 0.18 * Math.sin(Math.min(t, 1) * Math.PI);
    ctx.translate(layout.W / 2, layout.H * 0.42);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(255, 230, 150, ' + alpha + ')';
    ctx.font = 'bold ' + Math.round(Math.min(72, layout.W * 0.06)) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (useShadow) {
      ctx.shadowColor = 'rgba(255, 200, 80, 0.8)';
      ctx.shadowBlur = 24;
    }
    ctx.fillText(ms.lastChordName, 0, 0);
    ctx.restore();
  }

  function setLabels(labels: { sustainLabel: string }): void {
    sustainLabel = labels.sustainLabel;
  }

  return { drawKeyboard, drawBeams, drawChordDisplay, setLabels };
}
