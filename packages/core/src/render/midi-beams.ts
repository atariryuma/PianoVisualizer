// MIDI sustained-note beams — vertical light columns rising from each held
// key up the canvas, color-keyed to the note's theme/synesthesia color.
// Active notes pulse at ~6 Hz with width modulated by velocity; sustained-
// only notes (key released, pedal still down) draw thinner static beams.
//
// Rendering uses `globalCompositeOperation: 'screen'` so overlapping beams
// brighten additively without going to pure white. The function early-
// exits when no notes are held — a common case during silent sections —
// so it's cheap to call unconditionally per frame.
//
// Pure: takes ctx + view + opts. The shell wires `view.activeNotes` /
// `view.sustainedNotes` from its `midiState`.

export interface MidiBeamsActiveNote {
  /** MIDI velocity, 0–127. Drives both width and alpha of the beam. */
  velocity: number;
  /** Wall-clock ms when the note went down. Drives the pulse phase so
   *  freshly-pressed notes have visually distinct phasing from notes
   *  held for a while. */
  onTimeMs: number;
  /** Optional override (synesthesia mode) — when present, used instead
   *  of `noteThemeColor` for the gradient. */
  synColor?: string;
}

export interface MidiBeamsView {
  /** Currently-pressed keys: midi → note. */
  activeNotes: ReadonlyMap<number, MidiBeamsActiveNote>;
  /** Released keys still held by the sustain pedal. */
  sustainedNotes: ReadonlySet<number>;
}

export interface MidiBeamsDrawOptions {
  /** Top edge of the keyboard (= bottom of the beam, beams paint upward). */
  kbTop: number;
  /** Wall-clock ms — used to phase the active-note pulse. */
  timeMs: number;
  /** Map MIDI num → screen x (caller resolves keyboard geometry). */
  midiToScreenX: (midiNum: number) => number;
  /** Per-note theme color resolver — used for sustained-only beams and
   *  active beams that don't supply a `synColor`. */
  noteThemeColor: (midiNum: number) => string;
}

/**
 * Paint the held-note beams. No-ops when no notes are held. Uses 'screen'
 * composite mode so overlapping beams brighten additively.
 */
export function drawMidiBeams(
  ctx: CanvasRenderingContext2D,
  view: MidiBeamsView,
  opts: MidiBeamsDrawOptions
): void {
  if (view.activeNotes.size === 0 && view.sustainedNotes.size === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const { kbTop, timeMs, midiToScreenX, noteThemeColor } = opts;

  const paintBeam = (
    x: number,
    color: string,
    beamW: number,
    alpha: number,
    midStop: number | null
  ): void => {
    const grad = ctx.createLinearGradient(x, kbTop, x, 0);
    grad.addColorStop(0, color);
    if (midStop != null) grad.addColorStop(midStop, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.globalAlpha = alpha;
    ctx.fillRect(x - beamW / 2, 0, beamW, kbTop);
  };

  view.activeNotes.forEach((note, midiNum) => {
    const v = note.velocity / 127;
    const pulse = 0.5 + 0.5 * Math.sin((timeMs - note.onTimeMs) * 0.005);
    const beamW = (4 + v * 14) * (0.85 + pulse * 0.3);
    const color = note.synColor || noteThemeColor(midiNum);
    paintBeam(midiToScreenX(midiNum), color, beamW, 0.18 + v * 0.32, 0.35);
  });
  view.sustainedNotes.forEach((midiNum) => {
    if (view.activeNotes.has(midiNum)) return;
    paintBeam(midiToScreenX(midiNum), noteThemeColor(midiNum), 8, 0.12, null);
  });

  ctx.restore();
}
