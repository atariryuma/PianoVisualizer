// Practice lane renderer — falling-notes lane, hit window band, current-note
// indicator, boss flair, and count-in countdown.
//
// Pure: takes ctx + view (practice slice) + timing + opts. No globals, no DOM
// reads, no CONFIG/THEMES dependency. The caller resolves osmdVisible,
// kbReserve, i18n labels, and the per-note color callback before invoking.
//
// `view.laneDrawFromIdx` is an amortized cursor — the draw call mutates it
// forward as notes scroll past so subsequent frames don't re-scan the prefix.

export interface LaneNoteView {
  /** Section-relative time in ms (already includes count-in offset). */
  timeMs: number;
  /** Note duration in ms. Drives the falling block height. */
  durMs: number;
  /** MIDI note number. */
  midi: number;
  /** Which hand the note belongs to. */
  hand: 'L' | 'R';
  /** Set true once the note has been judged a hit. */
  hit: boolean;
  /** Set true once the note has been judged missed. */
  missed: boolean;
  /** Hand-filter flag — true when one-hand practice hides the other hand. */
  _filtered?: boolean;
}

export interface LaneViewState {
  /** Practice mode is engaged. The lane no-ops when false. */
  enabled: boolean;
  /** All notes in the current section, sorted ascending by `timeMs`. */
  sectionNotes: ReadonlyArray<LaneNoteView>;
  /** Per-hand MIDI range used to scale note x within each lane half. */
  handRanges: { lhMin: number; lhMax: number; rhMin: number; rhMax: number };
  /** Amortized cursor: notes before this index are off-screen and skipped.
   *  drawPracticeLane mutates this forward — pass the same object each frame. */
  laneDrawFromIdx: number;
  /** Index of the next note the player is expected to play (drives the ▼). */
  currentNoteIdx: number;
  /** Pre-resolved by caller: whether the current section is a boss section
   *  (drives the pulsing pink flair). Avoids dragging in the song schema. */
  isBoss: boolean;
}

export interface LaneTimings {
  /** Practice clock — parked during count-in, advances during play. Drives
   *  note positioning so notes hover at the hit line until count-in ends. */
  elapsedMs: number;
  /** Wall-clock elapsed since section start. Drives the count-in animation
   *  independently of the parked practice clock so 4→3→2→1→GO! always plays. */
  realElapsedMs: number;
  /** Wall-clock `performance.now()` (or test clock). Used for boss-flair pulse. */
  nowMs: number;
}

export interface LaneDrawOptions {
  screenW: number;
  screenH: number;
  /** OSMD score panel is showing — start the lane below it so notes aren't
   *  hidden behind the score (332 vs 50 px from top). */
  osmdVisible: boolean;
  /** Reserve at the bottom of the canvas (keyboard + safe area, or small
   *  padding when the keyboard is hidden). */
  kbReserve: number;
  /** How far ahead in time notes appear in the lane (px-per-ms scale). */
  laneLookaheadMs: number;
  /** Total count-in duration in ms (e.g. 4000 = 4 beats × 1s). */
  countInMs: number;
  /** Early side of the hit window (above the line, in ms). */
  hitWindowEarlyMs: number;
  /** Late side of the hit window (below the line, in ms). */
  hitWindowMs: number;
  /** Inner Perfect zone half-width in ms. */
  perfectMs: number;
  /** Localized hand label, left lane. */
  laneLabelL: string;
  /** Localized hand label, right lane. */
  laneLabelR: string;
  /** Localized "GO!" text shown at the end of count-in. */
  countInGoLabel: string;
  /** midi → display name (e.g. "C4", "C", "ド"). */
  midiToPitchName: (midi: number) => string;
  /** midi → resting note color (used for un-hit, un-missed notes). */
  noteRestingColor: (midi: number) => string;
}

/**
 * Draw one frame of the practice lane. No-op when `view.enabled` is false.
 * Mutates `view.laneDrawFromIdx` forward as notes scroll off the bottom.
 */
export function drawPracticeLane(
  ctx: CanvasRenderingContext2D,
  view: LaneViewState,
  timing: LaneTimings,
  opts: LaneDrawOptions
): void {
  if (!view.enabled) return;

  const W = opts.screenW;
  const H = opts.screenH;

  const laneTop = opts.osmdVisible ? 332 : 50;
  const laneHeight = Math.max(280, H - laneTop - opts.kbReserve);
  const hitLineY = laneTop + laneHeight - 60;
  const pxPerMs = (laneHeight - 40) / opts.laneLookaheadMs;
  const padX = 24;
  const usableW = W - padX * 2;
  const halfW = usableW / 2;
  const midX = padX + halfW;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Hand-tinted backgrounds + outline
  ctx.fillStyle = 'rgba(40, 60, 110, 0.55)';
  ctx.fillRect(padX, laneTop, halfW, laneHeight);
  ctx.fillStyle = 'rgba(110, 50, 90, 0.55)';
  ctx.fillRect(midX, laneTop, halfW, laneHeight);
  ctx.strokeStyle = 'rgba(255, 220, 230, 0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(padX, laneTop, usableW, laneHeight);

  // Hand labels
  ctx.fillStyle = 'rgba(180, 200, 255, 0.7)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(opts.laneLabelL, padX + halfW / 2, laneTop + 14);
  ctx.fillStyle = 'rgba(255, 200, 220, 0.7)';
  ctx.fillText(opts.laneLabelR, midX + halfW / 2, laneTop + 14);

  // Center divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midX, laneTop);
  ctx.lineTo(midX, hitLineY + 50);
  ctx.stroke();

  // Hit window band (asymmetric: small early zone, large late zone)
  const earlyPx = opts.hitWindowEarlyMs * pxPerMs;
  const latePx = opts.hitWindowMs * pxPerMs;
  const perfectPx = opts.perfectMs * pxPerMs;
  ctx.fillStyle = 'rgba(255, 200, 230, 0.20)';
  ctx.fillRect(padX, hitLineY - earlyPx, usableW, earlyPx + latePx);
  ctx.fillStyle = 'rgba(170, 255, 200, 0.30)';
  ctx.fillRect(padX, hitLineY - perfectPx, usableW, perfectPx * 2);

  // Hit line — thick + glow so it reads over the score area
  ctx.save();
  ctx.shadowColor = 'rgba(255, 220, 230, 0.8)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(255, 240, 245, 0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(padX, hitLineY);
  ctx.lineTo(W - padX, hitLineY);
  ctx.stroke();
  ctx.restore();
  const winPx = earlyPx;

  const { lhMin, lhMax, rhMin, rhMax } = view.handRanges;
  const noteX = (n: LaneNoteView): number => {
    if (n.hand === 'L') {
      const r = (n.midi - lhMin) / (lhMax - lhMin);
      return padX + r * (halfW - 20) + 10;
    }
    const r = (n.midi - rhMin) / (rhMax - rhMin);
    return midX + r * (halfW - 20) + 10;
  };

  const elapsed = timing.elapsedMs;
  const notes = view.sectionNotes;
  const visibleMinTimeMs = elapsed - 80 / pxPerMs;
  const visibleMaxTimeMs = elapsed + laneHeight / pxPerMs;

  // Advance the cursor past notes that have scrolled off the bottom.
  while (
    view.laneDrawFromIdx < notes.length &&
    notes[view.laneDrawFromIdx].timeMs < visibleMinTimeMs
  ) {
    view.laneDrawFromIdx++;
  }

  // Cap notes per frame — dense passages can put 60+ in the visible window.
  let drawnCount = 0;
  for (let i = view.laneDrawFromIdx; i < notes.length; i++) {
    if (drawnCount >= 25) break;
    const n = notes[i];
    if (n.timeMs > visibleMaxTimeMs) break;
    if (n._filtered) continue;
    drawnCount++;
    const dy = (n.timeMs - elapsed) * pxPerMs;
    const y = hitLineY - dy;
    const x = noteX(n);
    const noteH = Math.max(14, n.durMs * pxPerMs * 0.9);
    const noteW = Math.min(70, halfW / 6);

    let fill: string;
    if (n.hit) fill = 'rgba(120, 255, 160, 0.9)';
    else if (n.missed) fill = 'rgba(255, 90, 120, 0.5)';
    else fill = opts.noteRestingColor(n.midi);

    ctx.fillStyle = fill;
    ctx.shadowBlur = n.hit ? 18 : 8;
    ctx.shadowColor = fill;
    roundRect(ctx, x - noteW / 2, y - noteH, noteW, noteH, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = n.hand === 'L' ? 'rgba(180, 220, 255, 0.95)' : 'rgba(255, 200, 220, 0.95)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(n.hand, x, y - noteH - 4);

    if (!n.hit && !n.missed && noteH > 18) {
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(opts.midiToPitchName(n.midi), x, y - noteH / 2 + 4);
    }
  }

  // Current expected note ▼ indicator at the hit line
  const cur = notes[view.currentNoteIdx];
  if (cur && !cur.hit && !cur.missed) {
    const x = noteX(cur);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▼', x, hitLineY - winPx - 4);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = cur.hand === 'L' ? 'rgba(180,220,255,1)' : 'rgba(255,200,220,1)';
    ctx.fillText(cur.hand + ' · ' + opts.midiToPitchName(cur.midi), x, hitLineY + 32);
  }

  // Boss flair — pulsing pink overlay
  if (view.isBoss) {
    ctx.fillStyle = 'rgba(255, 100, 150, ' + (0.05 + 0.05 * Math.sin(timing.nowMs * 0.005)) + ')';
    ctx.fillRect(padX, laneTop, usableW, laneHeight);
  }

  // Count-in countdown — 4 → 3 → 2 → 1 → GO!, driven by realElapsedMs so the
  // animation completes regardless of the parked practice clock.
  const ctElapsed = timing.realElapsedMs;
  if (ctElapsed < opts.countInMs + 400) {
    const totalBeats = 4;
    const beatMs = opts.countInMs / totalBeats;
    const beatIdx = Math.min(totalBeats - 1, Math.max(0, Math.floor(ctElapsed / beatMs)));
    const remaining = totalBeats - beatIdx;
    const slotMs = ctElapsed - beatIdx * beatMs;
    const slotProgress = 1 - Math.min(1, slotMs / beatMs);
    const isGo = ctElapsed >= opts.countInMs;
    const text = isGo ? opts.countInGoLabel : String(remaining);
    const pop = isGo
      ? Math.max(0, 1 + 0.4 * Math.sin(((ctElapsed - opts.countInMs) / 400) * Math.PI))
      : 0.7 + 0.6 * slotProgress;
    const alpha = isGo ? Math.max(0, 1 - (ctElapsed - opts.countInMs) / 400) : 0.95;

    ctx.save();
    ctx.translate(W / 2, hitLineY - 60);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + (isGo ? '72' : '120') + 'px sans-serif';
    ctx.shadowBlur = 30;
    ctx.shadowColor = isGo ? 'rgba(255, 220, 130, .9)' : 'rgba(255, 180, 220, .9)';
    ctx.fillStyle = isGo
      ? 'rgba(255, 230, 130, ' + alpha + ')'
      : 'rgba(255, 230, 240, ' + alpha + ')';
    ctx.fillText(text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
