// @vitest-environment happy-dom
// Tests for packages/web/src/hud-update.ts.
//
// HUD writer: encouragement banner + flow-gauge cache + state mirror.
// Debug overlay writer: gated by debugMode + multi-line textContent.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createHudUpdate,
  createDebugOverlay,
  type HudStateRef,
  type DebugOverlayStateRef,
} from '../src/hud-update';
import type { EncouragementState, EncouragementOptions } from '@piano/core';

// ----- HUD writer fixtures -----

function makeEl(): HTMLElement {
  const el = document.createElement('div');
  return el;
}

function makeFlowFill(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'progressbar');
  wrapper.setAttribute('aria-valuenow', '0');
  const fill = document.createElement('div');
  wrapper.appendChild(fill);
  return fill;
}

function makeHudFixture(over: { state?: Partial<HudStateRef> } = {}) {
  const state: HudStateRef = {
    combo: 0,
    flow: 0,
    currentEncouragementTier: -1,
    lastEncouragementTimeMs: 0,
    encouragementHideTimeMs: 0,
    ...over.state,
  };
  const encState: EncouragementState = {
    currentTier: -1,
    lastShownTimeMs: 0,
    hideTimeMs: -1,
  };
  const encOpts: EncouragementOptions = { displayMs: 1500 };
  const encouragementEl = makeEl();
  const flowFillEl = makeFlowFill();
  const t = vi.fn((key: string) => key.toUpperCase());
  const triggerEffect = vi.fn();
  const applyEncouragementEvent = vi.fn();

  const hud = createHudUpdate({
    state,
    encState,
    encOpts,
    applyEncouragementEvent,
    encouragementEl,
    flowFillEl,
    t,
    triggerEffect,
  });
  return {
    state,
    encState,
    hud,
    encouragementEl,
    flowFillEl,
    t,
    triggerEffect,
    applyEncouragementEvent,
  };
}

describe('createHudUpdate — encouragement banner', () => {
  it('show output: writes textContent, adds visible class, fires triggerEffect', () => {
    const fx = makeHudFixture({ state: { combo: 5 } });
    fx.applyEncouragementEvent
      .mockReturnValueOnce({ kind: 'show', tier: 1, messageKey: 'enc1', effect: 'glowPulse' })
      .mockReturnValueOnce({ kind: 'none' });

    fx.hud.tick(1000);

    expect(fx.encouragementEl.textContent).toBe('ENC1'); // t() upcases.
    expect(fx.encouragementEl.classList.contains('visible')).toBe(true);
    expect(fx.triggerEffect).toHaveBeenCalledWith('glowPulse');
  });

  it('hide output: drops visible class', () => {
    const fx = makeHudFixture();
    fx.encouragementEl.classList.add('visible');
    fx.applyEncouragementEvent
      .mockReturnValueOnce({ kind: 'none' })
      .mockReturnValueOnce({ kind: 'hide' });

    fx.hud.tick(1000);

    expect(fx.encouragementEl.classList.contains('visible')).toBe(false);
  });

  it('none output: no DOM changes', () => {
    const fx = makeHudFixture();
    fx.applyEncouragementEvent.mockReturnValue({ kind: 'none' });

    fx.hud.tick(1000);

    expect(fx.encouragementEl.textContent).toBe('');
    expect(fx.triggerEffect).not.toHaveBeenCalled();
  });

  it('mirrors encState back to state.* after each tick', () => {
    const fx = makeHudFixture();
    fx.encState.currentTier = 3;
    fx.encState.lastShownTimeMs = 1234;
    fx.encState.hideTimeMs = 2500;
    fx.applyEncouragementEvent.mockReturnValue({ kind: 'none' });

    fx.hud.tick(1000);

    expect(fx.state.currentEncouragementTier).toBe(3);
    expect(fx.state.lastEncouragementTimeMs).toBe(1234);
    expect(fx.state.encouragementHideTimeMs).toBe(2500);
  });

  it('mirrors hideTimeMs as 0 when encState says -1', () => {
    const fx = makeHudFixture();
    fx.encState.hideTimeMs = -1;
    fx.applyEncouragementEvent.mockReturnValue({ kind: 'none' });

    fx.hud.tick(1000);

    expect(fx.state.encouragementHideTimeMs).toBe(0);
  });
});

describe('createHudUpdate — flow gauge', () => {
  beforeEach(() => {
    // No globals to clear; vi.fn mocks scoped to fixture.
  });

  it('writes height/box-shadow/aria when flow first changes', () => {
    // happy-dom drops the 'background: linear-gradient(...)' shorthand
    // assignment silently, so we sniff the two adjacent writes (height,
    // box-shadow) + aria-valuenow that round-trip cleanly.
    const fx = makeHudFixture({ state: { flow: 42.7 } });
    fx.applyEncouragementEvent.mockReturnValue({ kind: 'none' });

    fx.hud.tick(1000);

    expect(fx.flowFillEl.style.height).toBe('43%');
    expect(fx.flowFillEl.style.boxShadow).toContain('hsl');
    expect(fx.flowFillEl.parentElement?.getAttribute('aria-valuenow')).toBe('43');
  });

  it('skips re-write when rounded flow is unchanged (cache hit)', () => {
    const fx = makeHudFixture({ state: { flow: 42.7 } });
    fx.applyEncouragementEvent.mockReturnValue({ kind: 'none' });

    fx.hud.tick(1000);
    // Mutate the DOM behind the gauge's back to detect any re-paint.
    fx.flowFillEl.style.height = '99%';
    fx.state.flow = 42.9; // rounds to same 43
    fx.hud.tick(1100);

    expect(fx.flowFillEl.style.height).toBe('99%'); // untouched
  });

  it('re-writes after invalidateFlowCache()', () => {
    const fx = makeHudFixture({ state: { flow: 42 } });
    fx.applyEncouragementEvent.mockReturnValue({ kind: 'none' });

    fx.hud.tick(1000);
    fx.flowFillEl.style.height = '99%';
    fx.hud.invalidateFlowCache();
    fx.hud.tick(1100);

    expect(fx.flowFillEl.style.height).toBe('42%');
  });
});

// ----- Debug overlay fixtures -----

function makeDebugFixture(over: { state?: Partial<DebugOverlayStateRef>; nowMs?: number } = {}) {
  const state: DebugOverlayStateRef = {
    debugMode: true,
    debugLastFlux: 1.5,
    debugLastThreshold: 1.0,
    debugLastSpread: 0.42,
    debugLastFlatness: 0.123,
    debugLastCrest: 4.5,
    debugHarmonicity: 0.789,
    debugOnsetReason: 'PASS',
    debugGateOpen: false,
    debugLastRms: 0.0234,
    debugAgcGain: 12.3,
    debugLastPitch: 440,
    debugLastConf: 0.9,
    debugIsGoodNote: true,
    debugIsActivePlay: false,
    debugSessionState: 'performing',
    debugSessionConf: 0.85,
    qualityScore: 0.72,
    rhythmScore: 0.6,
    dynamicsScore: 0.8,
    stabilityScore: 0.75,
    flow: 60.5,
    combo: 12,
    currentStage: 2,
    agcVoiceSuppressUntilMs: 0,
    lastOnsetTimeMs: 900,
    ...over.state,
  };
  const overlayEl = makeEl();
  const overlay = createDebugOverlay({
    state,
    overlayEl,
    tuning: { onsetGateDurationMs: 200 },
    now: () => over.nowMs ?? 1000,
  });
  return { state, overlay, overlayEl };
}

describe('createDebugOverlay — gating', () => {
  it('writes nothing when debugMode is false', () => {
    const fx = makeDebugFixture({ state: { debugMode: false } });
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toBe('');
  });

  it('writes when debugMode is true', () => {
    const fx = makeDebugFixture();
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toContain('v9 YIN+Harm+SoftAGC');
  });
});

describe('createDebugOverlay — content', () => {
  it('shows OPEN gate countdown when debugGateOpen is true', () => {
    // gateMs = 200 - (1000 - 900) = 100ms = 0.1s.
    const fx = makeDebugFixture({ state: { debugGateOpen: true } });
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toContain('GATE: OPEN 0.1s');
  });

  it('shows CLOSED when debugGateOpen is false', () => {
    const fx = makeDebugFixture();
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toContain('GATE: CLOSED');
  });

  it('shows SUPP when AGC is in voice-suppression window', () => {
    const fx = makeDebugFixture({
      state: { agcVoiceSuppressUntilMs: 5000 },
      nowMs: 1000,
    });
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toContain('SUPP');
  });

  it('shows ok when not in voice-suppression window', () => {
    const fx = makeDebugFixture({
      state: { agcVoiceSuppressUntilMs: 500 },
      nowMs: 1000,
    });
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toMatch(/AGC: x\d/);
    expect(fx.overlayEl.textContent).toContain(' ok');
  });

  it('shows --- pitch when debugLastPitch is 0', () => {
    const fx = makeDebugFixture({ state: { debugLastPitch: 0 } });
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toContain('PITCH: ---');
  });

  it('upper-cases session state', () => {
    const fx = makeDebugFixture({ state: { debugSessionState: 'warmup' } });
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toContain('SESSION: WARMUP');
  });

  it('formats quality scores as integer percents', () => {
    const fx = makeDebugFixture();
    fx.overlay.tick();
    expect(fx.overlayEl.textContent).toContain('QUALITY: 72%');
    expect(fx.overlayEl.textContent).toContain('R:60');
    expect(fx.overlayEl.textContent).toContain('D:80');
    expect(fx.overlayEl.textContent).toContain('S:75');
  });
});
