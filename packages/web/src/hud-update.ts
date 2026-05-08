// HUD + debug-overlay writers — Phase 0d batch 44.
//
// Two per-frame DOM writers, factored out of `legacy-app.js`. They are
// separate exports because the deps shapes diverge sharply (HUD needs
// the encouragement reducer + flow-gauge element + i18n; debug overlay
// just reads big-bag state + writes a single `<pre>`-ish element).
//
// HUD writer
// ----------
// Drives two pieces of UI per tick:
//
//   1. Encouragement banner — fires `applyEncouragementEvent` from
//      `@piano/core` for both `comboChanged` and `hideTick`, then
//      handles the three output kinds:
//        - 'show' → set text from i18n key, force-reflow + visible class
//          + triggerEffect.
//        - 'hide' → drop visible class.
//        - 'none' → nothing.
//      After both events fire, mirror the encouragement state into the
//      legacy `state.{currentEncouragementTier,lastEncouragementTimeMs,
//      encouragementHideTimeMs}` fields the rest of the shell still
//      reads.
//
//   2. Flow gauge — height %, gradient hue, glow shadow, and the
//      ARIA `aria-valuenow` on the wrapper. **Quantized to whole
//      percent buckets** via a closure-captured `lastFlowPctWritten`
//      so the browser doesn't reparse a fresh gradient string 60×/sec
//      on iPad. Caller can flush the cache with `invalidateFlowCache()`
//      after a session reset.
//
// Debug overlay writer
// --------------------
// No-op when `state.debugMode` is false. Otherwise renders the 6-line
// debug textContent — the same exact format the legacy shell wrote —
// reading every `debug*` field on `state` plus the AGC voice-suppress
// window and the onset-gate countdown. Pure read-side; doesn't mutate
// state.

import type { EncouragementState, EncouragementOptions } from '@piano/core';
// Encouragement reducer is held by deps so the test can stub it without
// pulling the real @piano/core into the test environment.
type ApplyEncouragementEvent = (
  state: EncouragementState,
  event:
    | { type: 'comboChanged'; combo: number; timeMs: number }
    | { type: 'hideTick'; timeMs: number },
  opts: EncouragementOptions
) =>
  | { kind: 'show'; tier: number; messageKey: string; effect: string }
  | { kind: 'hide' }
  | { kind: 'none' };

/** Subset of legacy `state` written by these reducers. */
export interface HudStateRef {
  combo: number;
  flow: number;
  // Encouragement mirror fields (legacy shell still reads these).
  currentEncouragementTier: number;
  lastEncouragementTimeMs: number;
  encouragementHideTimeMs: number;
}

/** Subset of `state` read by the debug-overlay writer. */
export interface DebugOverlayStateRef {
  debugMode: boolean;
  debugLastFlux: number;
  debugLastThreshold: number;
  debugLastSpread: number;
  debugLastFlatness: number;
  debugLastCrest: number;
  debugHarmonicity: number;
  debugOnsetReason: string;
  debugGateOpen: boolean;
  debugLastRms: number;
  debugAgcGain: number;
  debugLastPitch: number;
  debugLastConf: number;
  debugIsGoodNote: boolean;
  debugIsActivePlay: boolean;
  debugSessionState: string;
  debugSessionConf: number;
  qualityScore: number;
  rhythmScore: number;
  dynamicsScore: number;
  stabilityScore: number;
  flow: number;
  combo: number;
  currentStage: number;
  agcVoiceSuppressUntilMs: number;
  lastOnsetTimeMs: number;
}

export interface HudUpdateDeps {
  state: HudStateRef;
  encState: EncouragementState;
  encOpts: EncouragementOptions;
  applyEncouragementEvent: ApplyEncouragementEvent;
  /** Banner element. We touch `textContent` and the `visible`/`entering`
   *  classes; reflow is forced via `offsetWidth`. */
  encouragementEl: HTMLElement;
  /** Flow-bar fill element. Parent gets the aria-valuenow update. */
  flowFillEl: HTMLElement;
  /** Translate i18n key → display text. */
  t: (key: string) => string;
  /** Fired with the effect name when the banner shows a new tier. */
  triggerEffect: (effect: string) => void;
}

export interface HudUpdate {
  /** Per-frame call. */
  tick(timeMs: number): void;
  /** Force the next tick to re-paint the flow gauge (call after a
   *  session reset that hides + re-shows the bar). */
  invalidateFlowCache(): void;
}

export function createHudUpdate(deps: HudUpdateDeps): HudUpdate {
  let lastFlowPctWritten = -1;

  function showEncouragement(
    out:
      | { kind: 'show'; tier: number; messageKey: string; effect: string }
      | { kind: 'hide' }
      | { kind: 'none' }
  ): void {
    if (out.kind !== 'show') return;
    deps.encouragementEl.textContent = deps.t(out.messageKey);
    deps.encouragementEl.classList.remove('visible');
    deps.encouragementEl.classList.add('entering');
    void deps.encouragementEl.offsetWidth; // force reflow to restart animation
    deps.encouragementEl.classList.remove('entering');
    deps.encouragementEl.classList.add('visible');
    deps.triggerEffect(out.effect);
  }

  function mirrorEncStateToLegacy(): void {
    deps.state.currentEncouragementTier = deps.encState.currentTier;
    deps.state.lastEncouragementTimeMs = deps.encState.lastShownTimeMs;
    deps.state.encouragementHideTimeMs =
      deps.encState.hideTimeMs > 0 ? deps.encState.hideTimeMs : 0;
  }

  return {
    tick(timeMs) {
      // Tier-change check (climb fires show, drop silently lowers currentTier).
      const comboOut = deps.applyEncouragementEvent(
        deps.encState,
        { type: 'comboChanged', combo: deps.state.combo, timeMs },
        deps.encOpts
      );
      showEncouragement(comboOut);
      // Hide-tick fires once when the display window elapses.
      const hideOut = deps.applyEncouragementEvent(
        deps.encState,
        { type: 'hideTick', timeMs },
        deps.encOpts
      );
      if (hideOut.kind === 'hide') deps.encouragementEl.classList.remove('visible');
      mirrorEncStateToLegacy();

      // Flow gauge — quantize style writes to whole-percent buckets so
      // the browser doesn't reparse a fresh gradient string 60×/sec on
      // iPad.
      const flowPct = Math.round(deps.state.flow);
      if (flowPct !== lastFlowPctWritten) {
        lastFlowPctWritten = flowPct;
        deps.flowFillEl.style.height = flowPct + '%';
        const hue = flowPct * 1.2 + 200;
        deps.flowFillEl.style.background =
          'linear-gradient(to top,hsl(' + hue + ',70%,40%),hsl(' + (hue + 40) + ',80%,60%))';
        deps.flowFillEl.style.boxShadow = '0 0 ' + flowPct * 0.3 + 'px hsl(' + hue + ',70%,60%)';
        // Mirror the visual fill into the wrapper's aria-valuenow so
        // screen readers report the meter's actual value (was stuck at
        // 0/100 before this).
        const gauge = deps.flowFillEl.parentElement;
        if (gauge) gauge.setAttribute('aria-valuenow', String(flowPct));
      }
    },
    invalidateFlowCache() {
      lastFlowPctWritten = -1;
    },
  };
}

// ============================================================
// Debug overlay
// ============================================================

export interface DebugOverlayDeps {
  state: DebugOverlayStateRef;
  /** The single overlay element we write `textContent` into. */
  overlayEl: HTMLElement;
  /** Tunables. */
  tuning: {
    onsetGateDurationMs: number;
  };
  /** Wall-clock ms now (`performance.now()` in production). The legacy
   *  function called `performance.now()` directly; we inject so tests
   *  don't need to fake the global. */
  now: () => number;
}

export interface DebugOverlay {
  tick(): void;
}

export function createDebugOverlay(deps: DebugOverlayDeps): DebugOverlay {
  return {
    tick() {
      const s = deps.state;
      if (!s.debugMode) return;
      const nowMs = deps.now();
      const gateMs = Math.max(0, deps.tuning.onsetGateDurationMs - (nowMs - s.lastOnsetTimeMs));
      const voiceSupp = s.agcVoiceSuppressUntilMs > nowMs ? 'SUPP' : 'ok';
      deps.overlayEl.textContent =
        'v9 YIN+Harm+SoftAGC | FLUX: ' +
        s.debugLastFlux.toFixed(1) +
        '  THR: ' +
        s.debugLastThreshold.toFixed(1) +
        '  SPR: ' +
        (s.debugLastSpread * 100).toFixed(0) +
        '%' +
        '\nFLAT: ' +
        s.debugLastFlatness.toFixed(3) +
        '  CREST: ' +
        s.debugLastCrest.toFixed(1) +
        '  HARM: ' +
        s.debugHarmonicity.toFixed(3) +
        '  ' +
        s.debugOnsetReason +
        '\nGATE: ' +
        (s.debugGateOpen ? 'OPEN ' + (gateMs / 1000).toFixed(1) + 's' : 'CLOSED') +
        '  RMS: ' +
        s.debugLastRms.toFixed(4) +
        '  AGC: x' +
        s.debugAgcGain.toFixed(1) +
        ' ' +
        voiceSupp +
        '\nPITCH: ' +
        (s.debugLastPitch > 0 ? s.debugLastPitch.toFixed(1) + 'Hz' : '---') +
        '  CONF: ' +
        s.debugLastConf.toFixed(2) +
        '  NOTE: ' +
        (s.debugIsGoodNote ? 'YES' : 'no') +
        '  PLAY: ' +
        (s.debugIsActivePlay ? 'ON' : 'off') +
        '\nSESSION: ' +
        s.debugSessionState.toUpperCase() +
        '  S.CONF: ' +
        (s.debugSessionConf * 100).toFixed(0) +
        '%' +
        '\nQUALITY: ' +
        (s.qualityScore * 100).toFixed(0) +
        '%' +
        '  R:' +
        (s.rhythmScore * 100).toFixed(0) +
        ' D:' +
        (s.dynamicsScore * 100).toFixed(0) +
        ' S:' +
        (s.stabilityScore * 100).toFixed(0) +
        '\nFLOW: ' +
        s.flow.toFixed(1) +
        '  COMBO: ' +
        s.combo +
        '  STAGE: ' +
        s.currentStage;
    },
  };
}
