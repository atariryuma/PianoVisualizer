// Effects + background-draw shell — Phase 0d batch 110.
//
// Bundles the particle pool + per-effect spawners + background-layer
// drawers (bg stars + aurora + ground flowers). All read W/H/state.flow
// at call time so the per-frame builders don't need to thread these
// individually.

import type { InitialGameState } from './game-state-init';
import type { PianoConfig } from './piano-config';
import type { Particle, Ripple } from '@piano/core';
import * as ParticleEffects from './particle-effects';

export interface ShellEffectsDeps {
  pianoCore: any;
  ctx: CanvasRenderingContext2D;
  state: InitialGameState;
  config: PianoConfig;
  /** practice forward-declared in shell — getter so the bg / particle
   *  effects can be built before the practice cluster. */
  getPractice: () => any;
  perfTier: number;
  /** Live screen geometry — read at fire time. */
  getScreen: () => { W: number; H: number };
  /** Bg-stars are seeded by the canvas-resize pipeline; getter is null
   *  until initBgStars() runs. */
  getBgStars: () => unknown[] | null;
}

export interface ShellEffects {
  // Particle / ripple pools — exposed so render-loop / session-reset
  // can clear them.
  particles: Particle[];
  ripples: Ripple[];
  // ParticleEffects exposes — typed loosely because particle-effects.ts
  // monkey-patches the prototypes (proto.draw / proto.update) and the
  // narrow `typeof Particle` doesn't reflect those mutations.
  Particle: any;
  Ripple: any;
  getNoteColor: (name: string) => string;
  spawnBurst: any;
  spawnStream: any;
  effectGlowPulse: any;
  effectStarShower: any;
  effectFlowerBurst: any;
  effectGoldenBurst: any;
  triggerEffect: any;
  // Background-layer drawers — invoked from RenderFrame.
  drawBgStars: (timeMs: number) => void;
  drawAurora: (timeMs: number) => void;
  drawGroundFlowers: (timeMs: number) => void;
}

export function createShellEffects(deps: ShellEffectsDeps): ShellEffects {
  const { pianoCore, ctx, state, config } = deps;

  const particles: Particle[] = [];
  const ripples: Ripple[] = [];

  const _particleEffects = ParticleEffects.createParticleEffects({
    pianoCore,
    getScreen: deps.getScreen,
    config,
    state,
    // `practice` is forward-declared in the shell — getter proxy so
    // `.enabled` reads at call time (post-init).
    practice: {
      get enabled() {
        return deps.getPractice()?.enabled ?? false;
      },
    } as any,
    particles,
    ripples,
    perfTier: deps.perfTier,
  } as any);

  const _themeColors = () => config.THEMES[state.currentTheme].colors;
  const _bgOpts = (time: number) => ({
    screenW: deps.getScreen().W,
    screenH: deps.getScreen().H,
    flow: state.flow,
    themeColors: _themeColors(),
    timeMs: time,
  });

  return {
    particles,
    ripples,
    Particle: _particleEffects.Particle,
    Ripple: _particleEffects.Ripple,
    getNoteColor: _particleEffects.getNoteColor,
    spawnBurst: _particleEffects.spawnBurst,
    spawnStream: _particleEffects.spawnStream,
    effectGlowPulse: _particleEffects.effectGlowPulse,
    effectStarShower: _particleEffects.effectStarShower,
    effectFlowerBurst: _particleEffects.effectFlowerBurst,
    effectGoldenBurst: _particleEffects.effectGoldenBurst,
    triggerEffect: _particleEffects.triggerEffect,
    drawBgStars: (_time: number) => {
      const bg = deps.getBgStars();
      if (!bg) return;
      pianoCore.drawBgStars(ctx, bg, { flow: state.flow, themeColors: _themeColors() });
    },
    drawAurora: (time: number) => pianoCore.drawAurora(ctx, _bgOpts(time)),
    drawGroundFlowers: (time: number) => pianoCore.drawGroundFlowers(ctx, _bgOpts(time)),
  };
}
