// @vitest-environment happy-dom
//
// Tests for packages/web/src/song-panel-controls.ts.
//
// Builds a minimal song-panel DOM (hand row, mode row, 3 toggles,
// songBack button) and exercises every click path. The module wires
// listeners at construction time and has no return value, so each
// test instantiates a fresh deps + DOM and inspects the state +
// renderSongPanel call count.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSongPanelControls,
  type SongPanelControlsDeps,
  type SongPanelPracticeRef,
} from '../src/song-panel-controls';

function makeDom(): void {
  document.body.innerHTML = `
    <div id="handRow">
      <button class="hand-btn" data-hand="L">L</button>
      <button class="hand-btn" data-hand="">Both</button>
      <button class="hand-btn" data-hand="R">R</button>
    </div>
    <div id="modeRow">
      <button class="hand-btn" data-mode="listen">Listen</button>
      <button class="hand-btn" data-mode="guided">Guided</button>
      <button class="hand-btn" data-mode="rhythm">Rhythm</button>
    </div>
    <button id="ghostToggle"></button>
    <button id="metronomeToggle"></button>
    <button id="loopToggle"></button>
    <button id="fullSongToggle"></button>
    <button id="songBack"></button>
  `;
}

function makeDeps(overrides: Partial<SongPanelControlsDeps> = {}): SongPanelControlsDeps {
  const practice: SongPanelPracticeRef = {
    handFilter: null,
    mode: 'guided',
    ghostOn: false,
    metronomeOn: false,
    loopOn: false,
    fullSongMode: false,
  };
  return {
    dom: {
      ghostToggle: document.getElementById('ghostToggle'),
      metronomeToggle: document.getElementById('metronomeToggle'),
      loopToggle: document.getElementById('loopToggle'),
      fullSongToggle: document.getElementById('fullSongToggle'),
      songBack: document.getElementById('songBack') as HTMLElement,
    },
    practice,
    renderSongPanel: vi.fn(),
    returnToTitle: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  makeDom();
});

// ─── hand row ────────────────────────────────────────────────────────

describe('createSongPanelControls — hand row', () => {
  it('clicking L sets handFilter to L', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    (document.querySelector('#handRow .hand-btn[data-hand="L"]') as HTMLElement).click();
    expect(deps.practice.handFilter).toBe('L');
  });

  it('clicking R sets handFilter to R', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    (document.querySelector('#handRow .hand-btn[data-hand="R"]') as HTMLElement).click();
    expect(deps.practice.handFilter).toBe('R');
  });

  it('clicking Both sets handFilter to null', () => {
    const deps = makeDeps();
    deps.practice.handFilter = 'L';
    createSongPanelControls(deps);
    (document.querySelector('#handRow .hand-btn[data-hand=""]') as HTMLElement).click();
    expect(deps.practice.handFilter).toBeNull();
  });

  it('marks the clicked button active + others inactive', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    const btnR = document.querySelector('#handRow .hand-btn[data-hand="R"]') as HTMLElement;
    const btnL = document.querySelector('#handRow .hand-btn[data-hand="L"]') as HTMLElement;
    btnR.click();
    expect(btnR.classList.contains('active')).toBe(true);
    expect(btnL.classList.contains('active')).toBe(false);
  });
});

// ─── mode row ────────────────────────────────────────────────────────

describe('createSongPanelControls — mode row', () => {
  it('clicking Listen sets mode to listen + re-renders', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    (document.querySelector('#modeRow .hand-btn[data-mode="listen"]') as HTMLElement).click();
    expect(deps.practice.mode).toBe('listen');
    expect(deps.renderSongPanel).toHaveBeenCalledOnce();
  });

  it('clicking Rhythm sets mode to rhythm', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    (document.querySelector('#modeRow .hand-btn[data-mode="rhythm"]') as HTMLElement).click();
    expect(deps.practice.mode).toBe('rhythm');
  });

  it('clicking Guided sets mode to guided', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    createSongPanelControls(deps);
    (document.querySelector('#modeRow .hand-btn[data-mode="guided"]') as HTMLElement).click();
    expect(deps.practice.mode).toBe('guided');
  });
});

// ─── practice toggles ────────────────────────────────────────────────

describe('createSongPanelControls — toggles', () => {
  it('ghost toggle flips practice.ghostOn + re-renders', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    document.getElementById('ghostToggle')!.click();
    expect(deps.practice.ghostOn).toBe(true);
    expect(deps.renderSongPanel).toHaveBeenCalledOnce();
    document.getElementById('ghostToggle')!.click();
    expect(deps.practice.ghostOn).toBe(false);
    expect(deps.renderSongPanel).toHaveBeenCalledTimes(2);
  });

  it('metronome toggle flips practice.metronomeOn', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    document.getElementById('metronomeToggle')!.click();
    expect(deps.practice.metronomeOn).toBe(true);
  });

  it('loop toggle flips practice.loopOn + re-renders (P2-12)', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    document.getElementById('loopToggle')!.click();
    expect(deps.practice.loopOn).toBe(true);
    expect(deps.renderSongPanel).toHaveBeenCalledOnce();
    document.getElementById('loopToggle')!.click();
    expect(deps.practice.loopOn).toBe(false);
  });

  it('full-song toggle flips practice.fullSongMode', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    document.getElementById('fullSongToggle')!.click();
    expect(deps.practice.fullSongMode).toBe(true);
  });

  it('survives missing optional toggles (no DOM element)', () => {
    document.body.innerHTML = `
      <div id="handRow"></div>
      <div id="modeRow"></div>
      <button id="songBack"></button>
    `;
    const deps: SongPanelControlsDeps = {
      dom: {
        ghostToggle: null,
        metronomeToggle: null,
        fullSongToggle: null,
        songBack: document.getElementById('songBack') as HTMLElement,
      },
      practice: {
        handFilter: null,
        mode: 'guided',
        ghostOn: false,
        metronomeOn: false,
        fullSongMode: false,
      },
      renderSongPanel: vi.fn(),
      returnToTitle: vi.fn(),
    };
    expect(() => createSongPanelControls(deps)).not.toThrow();
  });
});

// ─── songBack ────────────────────────────────────────────────────────

describe('createSongPanelControls — songBack', () => {
  it('songBack click calls returnToTitle', () => {
    const deps = makeDeps();
    createSongPanelControls(deps);
    (document.getElementById('songBack') as HTMLElement).click();
    expect(deps.returnToTitle).toHaveBeenCalledOnce();
  });
});
