// Render-loop phase C+D — late-frame draw + tail.
// Phase 0d batch 9c extraction from legacy-app.js.
//
// Final ~50 lines of the per-frame `loop()`. Two cohesive phases:
//
//   Phase C — per-element update+draw + MIDI overlays
//     1. MIDI sustained beams (only when MIDI is the active input,
//        and we're not in practice mode where the lane takes over)
//     2. Ripples — update + draw + cull dead ones (life ≤ 0)
//     3. Particles — update + draw + cull, capped at MAX_PARTICLES
//        (so a back-pressure'd frame can't grow the array beyond
//        the budget; the `alive` cursor is the trim watermark)
//     4. MIDI chord-name display (free-play OR practice — the helper
//        picks the layout)
//     5. Virtual MIDI keyboard at the bottom
//     6. Practice lane (drawn on top of background, under HUD)
//
//   Phase D — tail (state-machine + diagnostic ticks)
//     7. Quest tracker — ONLY during active free-play (gates: not
//        in practice, no menu/modal visible). Without this gate
//        the tracker keeps evaluating predicates in the background
//        and questDisplay flickers on top of the wrong screen.
//     8. Play-time HUD update (mm:ss)
//     9. Debug overlay update (only if prefs.debug is on)
//
// Order matters — ripples sit under particles (depth-sorted), MIDI
// chord/keyboard sit on top of particles, practice lane sits on
// top of MIDI keyboard, HUD updates last.
//
// Out of scope (stays in shell):
//   • drawMidiBeams / drawMidiChordDisplay / drawMidiKeyboard /
//     drawPracticeLane — each is its own large render function with
//     its own deps. Future sub-batches can extract these one at a
//     time. This module's role is just to orchestrate the calls in
//     the right order behind the right gates.
//   • updateQuestState / updatePlayTime / updateDebugOverlay — same
//     shell-side logic; passed through as deps.

/** Ripple element shape — only the surface this module touches.
 *  Mirrors @piano/core/render/ripples `Ripple` (closure-deps patched
 *  onto the prototype in legacy-app.js); we just need .update / .draw
 *  / .life. */
export interface RippleEl {
  update: () => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  life: number;
}

/** Particle element shape — same approach. */
export interface ParticleEl {
  update: () => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  life: number;
}

/** Mutable arrays the phase trims in place via the `alive` cursor.
 *  Both length and indexed assignment are needed (we re-pack the live
 *  elements at the front and then shrink length). */
export interface RippleArray extends Array<RippleEl> {}
export interface ParticleArray extends Array<ParticleEl> {}

/** MIDI input slice — gate for beams/chord/keyboard sections. */
export interface RenderLateMidiRef {
  enabled: boolean;
}

/** Practice slice — gate for lane + the MIDI-vs-lane priority on beams. */
export interface RenderLatePracticeRef {
  enabled: boolean;
}

export interface RenderLateDeps {
  ctx: CanvasRenderingContext2D;
  /** Live screen dimensions for any helper that re-reads them. (Most
   *  helpers close over their own W/H; we expose this for parity but
   *  none of the current calls use it.) */
  getScreen?: () => { W: number; H: number };
  ripples: RippleArray;
  particles: ParticleArray;
  midiInput: RenderLateMidiRef;
  practice: RenderLatePracticeRef;
  /** Active-free-play predicate — the quest tracker only ticks when
   *  the canvas / HUD is the front-most surface. */
  isFreeplayActive: () => boolean;
  /** Cap for the particle array — `alive` cursor stops here. */
  maxParticles: number;
  // ─── Render functions (all closure-bound by the shell) ──────────
  drawMidiBeams: (timeMs: number) => void;
  drawMidiChordDisplay: (timeMs: number) => void;
  drawMidiKeyboard: () => void;
  drawPracticeLane: (timeMs: number) => void;
  // ─── Tail ───────────────────────────────────────────────────────
  updateQuestState: (timeMs: number) => void;
  updatePlayTime: (timeMs: number) => void;
  updateDebugOverlay: () => void;
}

/** Run the late-frame phase. No return value — pure side effects:
 *  ripples + particles arrays trimmed in place; canvas + DOM HUD
 *  mutated by the inner render helpers. */
export function runRenderLate(timeMs: number, deps: RenderLateDeps): void {
  // 1. MIDI sustained beams — between background and particles.
  //    Skipped during practice (the lane takes over visual priority).
  if (deps.midiInput.enabled && !deps.practice.enabled) {
    deps.drawMidiBeams(timeMs);
  }

  // 2. Ripples — update + draw + cull. Re-pack live elements at the
  //    front then shrink length to release memory + keep the next
  //    frame's iteration tight.
  let alive = 0;
  for (let i = 0; i < deps.ripples.length; i++) {
    const r = deps.ripples[i];
    r.update();
    r.draw(deps.ctx);
    if (r.life > 0) deps.ripples[alive++] = r;
  }
  deps.ripples.length = alive;

  // 3. Particles — same shape; cap at maxParticles so a long-running
  //    session that's spawning fast can't blow past the budget.
  alive = 0;
  for (let i = 0; i < deps.particles.length; i++) {
    const p = deps.particles[i];
    p.update();
    p.draw(deps.ctx);
    if (p.life > 0 && alive < deps.maxParticles) deps.particles[alive++] = p;
  }
  deps.particles.length = alive;

  // 4. Chord-name display — the helper picks the layout per mode
  //    (big-centered for free play, small-above-keyboard for
  //    practice).
  if (deps.midiInput.enabled) {
    deps.drawMidiChordDisplay(timeMs);
  }

  // 5. Virtual keyboard at the bottom — visible whenever MIDI is in
  //    use. In practice mode it provides a key-finding reference for
  //    kids; the lane sizing reserves the bottom strip for it.
  if (deps.midiInput.enabled) {
    deps.drawMidiKeyboard();
  }

  // 6. Practice mode lane — drawn on top of background, under HUD.
  if (deps.practice.enabled) {
    deps.drawPracticeLane(timeMs);
  }

  // 7. Quest tracker — ONLY during active free-play. Otherwise the
  //    tracker keeps evaluating predicates while the user browses
  //    menus, making questDisplay flicker on top of the wrong screen
  //    and accumulating progress in the background.
  if (deps.isFreeplayActive()) deps.updateQuestState(timeMs);

  // 8. Play-time HUD (mm:ss).
  deps.updatePlayTime(timeMs);

  // 9. Debug overlay — gated internally by prefs.debug.
  deps.updateDebugOverlay();
}
