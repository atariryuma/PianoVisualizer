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
  { minCombo: 3, messageKey: 'enc1', effect: 'glowPulse' },
  { minCombo: 8, messageKey: 'enc2', effect: 'glowParticles' },
  { minCombo: 15, messageKey: 'enc3', effect: 'colorWave' },
  { minCombo: 25, messageKey: 'enc4', effect: 'starShower' },
  { minCombo: 40, messageKey: 'enc5', effect: 'flowerBurst' },
  { minCombo: 60, messageKey: 'enc6', effect: 'shimmer' },
  { minCombo: 80, messageKey: 'enc7', effect: 'radiance' },
  { minCombo: 100, messageKey: 'enc8', effect: 'goldenBurst' },
]);

export interface EncouragementState {
  /** Currently active tier index, or -1 if none. */
  currentTier: number;
  /** Wall-clock ms when the most recent message was shown. */
  lastShownTimeMs: number;
  /** Wall-clock ms when the active message should hide; -1 if nothing showing. */
  hideTimeMs: number;
}

export interface EncouragementOptions {
  /** Tier table (highest → lowest by minCombo). Falls back to defaults if omitted. */
  tiers?: readonly EncouragementTier[];
  /** How long the message stays visible. */
  displayMs: number;
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
  };
}

/** Reset all fields in place. */
export function resetEncouragementState(state: EncouragementState): void {
  state.currentTier = -1;
  state.lastShownTimeMs = 0;
  state.hideTimeMs = -1;
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
 * - On `comboChanged`: only fires `show` when the picked tier is strictly
 *   higher than `currentTier`. Same or lower picked tier within cooldown ms
 *   is suppressed (no flicker on combo drift around a threshold). When picked
 *   tier is lower than currentTier, `currentTier` follows it down without
 *   firing — combo dropped, so the next ladder rung is fresh again.
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
      const tier = tiers[bestTier];
      state.currentTier = bestTier;
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
