// Encouragement tier escalator.
//
// Replaces the legacy "show combo number" with escalating English messages
// (Nice! → Great! → ... → AWESOME!), each triggering a unique celebration
// effect. Pure reducer: takes a combo update or a hide tick, mutates state
// and returns an output describing what the shell should do (show / hide
// / nothing). The shell owns the DOM and effect dispatch.

export interface EncouragementTier {
  /** Lowest combo that activates this tier. Tiers are evaluated highest-first. */
  minCombo: number;
  /** i18n key for the message text. */
  messageKey: string;
  /** Celebration effect name (matches render/effects EffectName). */
  effect: string;
}

/** Default 8-tier ladder. Mirrors the legacy CONFIG.ENCOURAGEMENT_TIERS shape
 *  exactly so callers can drop this in without re-tuning thresholds. */
export const DEFAULT_ENCOURAGEMENT_TIERS: readonly EncouragementTier[] = Object.freeze([
  Object.freeze({ minCombo: 3, messageKey: 'enc1', effect: 'glowPulse' }),
  Object.freeze({ minCombo: 8, messageKey: 'enc2', effect: 'glowParticles' }),
  Object.freeze({ minCombo: 15, messageKey: 'enc3', effect: 'colorWave' }),
  Object.freeze({ minCombo: 25, messageKey: 'enc4', effect: 'starShower' }),
  Object.freeze({ minCombo: 40, messageKey: 'enc5', effect: 'flowerBurst' }),
  Object.freeze({ minCombo: 60, messageKey: 'enc6', effect: 'shimmer' }),
  Object.freeze({ minCombo: 80, messageKey: 'enc7', effect: 'radiance' }),
  Object.freeze({ minCombo: 100, messageKey: 'enc8', effect: 'goldenBurst' }),
]);

export interface EncouragementState {
  /** Currently active tier index, or -1 if none. */
  currentTier: number;
  /** Wall-clock ms when the most recent message was shown. */
  lastShownTimeMs: number;
  /** Wall-clock ms when the active message should hide; -1 if nothing showing. */
  hideTimeMs: number;
  /** Highest tier celebrated inside the current cooldown window, or -1. */
  peakTier: number;
  /** Wall-clock ms `peakTier` was celebrated. */
  peakShownTimeMs: number;
}

export interface EncouragementOptions {
  /** Tier table (highest → lowest by minCombo). Falls back to defaults if omitted. */
  tiers?: readonly EncouragementTier[];
  /** How long the message stays visible. */
  displayMs: number;
  /**
   * How long a tier that has just been celebrated stays "spent".
   *
   * Without it, a combo that dips below a threshold and climbs back fires the
   * same banner — and the same full-screen effect — again, every time. That is
   * not an edge case: a phrase break keeps 60 % of the combo, so every phrase
   * re-crosses the rungs it had already crossed. The config has shipped an
   * 8 s value for this since v9 and nothing ever read it.
   *
   * It suppresses REPEATS only. A tier higher than anything celebrated in the
   * window always fires, so a fast run up the ladder (3 → 8 → 15 → 25 inside a
   * few seconds) is still celebrated rung by rung. Omitted / 0 = no cooldown.
   */
  cooldownMs?: number;
}

export type EncouragementEvent =
  | { type: 'comboChanged'; combo: number; timeMs: number }
  | { type: 'hideTick'; timeMs: number };

export type EncouragementOutput =
  | {
      kind: 'show';
      tier: number;
      messageKey: string;
      effect: string;
    }
  | { kind: 'hide' }
  | { kind: 'none' };

/** Build a fresh state — no active tier, nothing on screen. */
export function initEncouragementState(): EncouragementState {
  return {
    currentTier: -1,
    lastShownTimeMs: 0,
    hideTimeMs: -1,
    peakTier: -1,
    peakShownTimeMs: 0,
  };
}

/** Reset all fields in place. */
export function resetEncouragementState(state: EncouragementState): void {
  state.currentTier = -1;
  state.lastShownTimeMs = 0;
  state.hideTimeMs = -1;
  state.peakTier = -1;
  state.peakShownTimeMs = 0;
}

/**
 * Find the highest-index tier whose `minCombo` ≤ `combo`. Returns `-1` when
 * combo is below every threshold.
 */
export function pickTier(combo: number, tiers: readonly EncouragementTier[]): number {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (combo >= tiers[i].minCombo) return i;
  }
  return -1;
}

/**
 * Apply one event. Mutates `state` and returns an output:
 * - `{ kind: 'show', tier, messageKey, effect }` — caller should render the
 *   message + dispatch the effect.
 * - `{ kind: 'hide' }` — caller should hide the message.
 * - `{ kind: 'none' }` — no UI change.
 *
 * Behavior:
 * - On `comboChanged`: fires `show` when the picked tier is strictly higher
 *   than `currentTier` AND it is new within the cooldown — higher than any tier
 *   celebrated in the last `cooldownMs`, or the window has lapsed. A suppressed
 *   climb still moves `currentTier` up, silently. When the picked tier is lower
 *   than `currentTier`, `currentTier` follows it down without firing.
 * - On `hideTick`: fires `hide` once, exactly when `hideTimeMs` first elapses;
 *   subsequent ticks return `none` until another show happens.
 */
export function applyEncouragementEvent(
  state: EncouragementState,
  event: EncouragementEvent,
  opts: EncouragementOptions
): EncouragementOutput {
  const tiers = opts.tiers ?? DEFAULT_ENCOURAGEMENT_TIERS;

  if (event.type === 'comboChanged') {
    const bestTier = pickTier(event.combo, tiers);

    if (bestTier > state.currentTier && bestTier >= 0) {
      state.currentTier = bestTier;
      const cooldown = opts.cooldownMs ?? 0;
      const windowLapsed = event.timeMs - state.peakShownTimeMs >= cooldown;
      if (bestTier <= state.peakTier && !windowLapsed) {
        // Already celebrated moments ago — a dip-and-return, not progress.
        return { kind: 'none' };
      }
      const tier = tiers[bestTier];
      state.peakTier = bestTier;
      state.peakShownTimeMs = event.timeMs;
      state.lastShownTimeMs = event.timeMs;
      state.hideTimeMs = event.timeMs + opts.displayMs;
      return {
        kind: 'show',
        tier: bestTier,
        messageKey: tier.messageKey,
        effect: tier.effect,
      };
    }

    if (bestTier < state.currentTier) {
      // Combo dropped — let currentTier follow so the player gets fresh
      // celebration if they climb back up.
      state.currentTier = bestTier;
    }

    return { kind: 'none' };
  }

  // hideTick
  if (state.hideTimeMs > 0 && event.timeMs >= state.hideTimeMs) {
    state.hideTimeMs = -1;
    return { kind: 'hide' };
  }
  return { kind: 'none' };
}
