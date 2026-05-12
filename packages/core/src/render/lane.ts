// Practice lane renderer — falling-notes lane, hit window band, current-note
// indicator, boss flair, and count-in countdown.
//
// Pure: takes ctx + view (practice slice) + timing + opts. No globals, no DOM
// reads, no CONFIG/THEMES dependency. The caller resolves osmdVisible,
// kbReserve, i18n labels, and the per-note color callback before invoking.
//
// `view.laneDrawFromIdx` is an amortized cursor — the draw call mutates it
// forward as notes scroll past so subsequent frames don't re-scan the prefix.

// Module-scope gradient cache. The lane's L/R fills + center divider share
// the same vertical extent every frame and only change on resize / score
// panel toggle, but the previous code re-allocated all three CanvasGradient
// objects 60×/s. Cache keyed by the dimension triple; ctx is also captured
// because gradients are bound to a specific 2D context.
let _laneGradCtx: CanvasRenderingContext2D | null = null;
let _laneGradTop = -1;
let _laneGradHeight = -1;
let _laneGradHitLine = -1;
let _lhGradCached: CanvasGradient | null = null;
let _rhGradCached: CanvasGradient | null = null;
let _divGradCached: CanvasGradient | null = null;

export interface LaneNoteView {
  /** Section-relative time in ms (already includes count-in offset). */
  timeMs: number;
  /** Note duration in ms. Drives the falling block height. */
  durMs: number;
  /** MIDI note number. */
  midi: number;
  /** Which hand the note belongs to. */
  hand: 'L' | 'R';
  /** Set true once the note has been judged a hit. Optional because
   *  source-stage notes (`song.notes`, the ExpandedNote pipeline) don't
   *  carry it; the lane reads it via truthiness which handles undefined. */
  hit?: boolean;
  /** Set true once the note has been judged missed. Same optional rationale
   *  as `hit`. */
  missed?: boolean;
  /** Hand-filter flag — true when one-hand practice hides the other hand. */
  _filtered?: boolean;
  /** Same-pitch + same-hand attacks merged into this note by the
   *  section-builder's cluster step. > 1 means the lane should render a
   *  `×N` badge + a tremolo chevron on the tile so a trill / tremolo /
   *  grace-burst reads as one event rather than overlapping tiles. */
  replayCount?: number;
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
   *  hidden behind the score (332 vs 50 px from top by default). */
  osmdVisible: boolean;
  /** Optional explicit pixel offset for the lane top edge, overriding the
   *  default (332 when osmdVisible, 50 otherwise). Set this when the OSMD
   *  strip is sized non-default (e.g. landscape phone media query) so the
   *  lane sits exactly under the score regardless of viewport shape. */
  laneTopOverride?: number;
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

  const laneTop = opts.laneTopOverride ?? (opts.osmdVisible ? 332 : 50);
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

  // Lane backgrounds — vertical gradient so the bottom (hit zone) feels
  // grounded and the top fades into the score area.
  if (
    _laneGradCtx !== ctx ||
    _laneGradTop !== laneTop ||
    _laneGradHeight !== laneHeight ||
    _laneGradHitLine !== hitLineY
  ) {
    const lh = ctx.createLinearGradient(0, laneTop, 0, laneTop + laneHeight);
    lh.addColorStop(0, 'rgba(40, 60, 130, 0.25)');
    lh.addColorStop(1, 'rgba(60, 80, 150, 0.55)');
    const rh = ctx.createLinearGradient(0, laneTop, 0, laneTop + laneHeight);
    rh.addColorStop(0, 'rgba(110, 50, 110, 0.25)');
    rh.addColorStop(1, 'rgba(140, 60, 130, 0.55)');
    const div = ctx.createLinearGradient(0, laneTop, 0, hitLineY + 50);
    div.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
    div.addColorStop(0.6, 'rgba(255, 255, 255, 0.28)');
    div.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
    _lhGradCached = lh;
    _rhGradCached = rh;
    _divGradCached = div;
    _laneGradCtx = ctx;
    _laneGradTop = laneTop;
    _laneGradHeight = laneHeight;
    _laneGradHitLine = hitLineY;
  }
  ctx.fillStyle = _lhGradCached!;
  ctx.fillRect(padX, laneTop, halfW, laneHeight);
  ctx.fillStyle = _rhGradCached!;
  ctx.fillRect(midX, laneTop, halfW, laneHeight);

  // Outer outline: subtle, rounded.
  ctx.strokeStyle = 'rgba(255, 220, 230, 0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, padX, laneTop, usableW, laneHeight, 16);
  ctx.stroke();

  // Hand-label chips — pill-shaped, top-corner of each lane, always
  // visible so the kid can see at a glance which side is which.
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawChip(
    ctx,
    padX + halfW / 2,
    laneTop + 16,
    opts.laneLabelL,
    'rgba(140, 180, 255, 0.95)',
    'rgba(40, 60, 130, 0.9)'
  );
  drawChip(
    ctx,
    midX + halfW / 2,
    laneTop + 16,
    opts.laneLabelR,
    'rgba(255, 180, 220, 0.95)',
    'rgba(110, 50, 110, 0.9)'
  );
  ctx.textBaseline = 'alphabetic';

  // Center divider — same cache as the lane backgrounds (all three
  // gradients invalidate on resize together).
  ctx.strokeStyle = _divGradCached!;
  ctx.lineWidth = 1.5;
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
    if (n.hit) fill = 'rgba(120, 255, 160, 0.95)';
    else if (n.missed) fill = 'rgba(255, 90, 120, 0.5)';
    else fill = opts.noteRestingColor(n.midi);

    // Modern note tile: bigger radius (8px vs 6), vertical highlight so
    // the tile reads as a glass pill instead of a flat block, and a
    // soft glow scaled to the player's expected response. Fonts switch
    // to a rounded family to match the kids-app feel.
    const tileX = x - noteW / 2;
    const tileY = y - noteH;
    const tileR = Math.min(10, noteH / 2);
    ctx.shadowBlur = n.hit ? 22 : 10;
    ctx.shadowColor = fill;

    // Base fill.
    ctx.fillStyle = fill;
    roundRect(ctx, tileX, tileY, noteW, noteH, tileR);
    ctx.fill();

    // Glossy top highlight — only on un-hit / un-missed notes.
    if (!n.hit && !n.missed && noteH > 14) {
      ctx.shadowBlur = 0;
      const gloss = ctx.createLinearGradient(0, tileY, 0, tileY + noteH * 0.55);
      gloss.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gloss;
      roundRect(ctx, tileX, tileY, noteW, noteH * 0.55, tileR);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Hand letter — small + faded, above the tile. Friendlier rounded font.
    ctx.fillStyle = n.hand === 'L' ? 'rgba(180, 220, 255, 0.95)' : 'rgba(255, 200, 220, 0.95)';
    ctx.font = 'bold 10px "Hiragino Maru Gothic ProN", "Quicksand", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(n.hand, x, y - noteH - 4);

    // Pitch label — kana name (ド/レ/ミ/...) inside the tile so the kid
    // knows what to play. Was hidden on noteH ≤ 18 px (short 16-note
    // passages like Liszt's La Campanella all hit the floor 14 px and
    // dropped pitch labels). Now: show it scaled down so even 14 px
    // tiles get a label, just smaller. Below ~10 px it's illegible
    // anyway so we still skip.
    if (!n.hit && !n.missed && noteH >= 10 && noteW >= 22) {
      const labelPx = Math.max(9, Math.min(13, Math.round(noteH * 0.7)));
      ctx.fillStyle = 'rgba(20, 10, 35, 0.92)';
      ctx.font = 'bold ' + labelPx + 'px "Hiragino Maru Gothic ProN", "Quicksand", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.midiToPitchName(n.midi), x, y - noteH / 2);
      ctx.textBaseline = 'alphabetic';
    }

    // Trill / tremolo collapse — data-layer clustering in
    // section-notes.ts already extended this tile's durMs to cover
    // the full burst, so the tile renders as a slightly longer note
    // and reads naturally as "hold/trill this key" without any
    // explicit ×N badge. Earlier iterations painted a yellow chip
    // + chevrons, but for a kids' app that's visual noise — the
    // longer tile speaks for itself, and the practice cursor only
    // requires one hit per cluster (forgiving for young learners).
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
  // animation completes regardless of the parked practice clock. realElapsedMs
  // is negative during the audio pre-roll (Tone's lookAhead + audioStartLead);
  // we want the count to appear in lockstep with the FIRST audible beep, so
  // skip drawing entirely while the kid hasn't heard anything yet.
  const ctElapsed = timing.realElapsedMs;
  if (ctElapsed >= 0 && ctElapsed < opts.countInMs + 400) {
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

/**
 * Draw a small pill-shaped chip with text. Used for the L / R hand labels
 * at the top of each lane half — replaces the previous tiny grey label
 * that was nearly invisible.
 */
function drawChip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  label: string,
  textColor: string,
  bgColor: string
): void {
  const padX = 10;
  const h = 20;
  const w = ctx.measureText(label).width + padX * 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.fillText(label, cx, cy);
}
