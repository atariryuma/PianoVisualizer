// @vitest-environment happy-dom
//
// Tests for packages/web/src/practice-flow.ts.
//
// Builds a minimal practice-mode DOM (top bar + result card + summary +
// 🏠 buttons) and asserts the wired handlers do the right cleanup +
// state mutations. The transitionToSection helper's re-entrancy guard
// is exercised explicitly because the on-iPad failure mode (double-tap
// retry → racing Tone.Transport schedule) was the originating bug.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPracticeFlow,
  type PracticeFlowDeps,
  type PracticeFlowDom,
  type PracticeFlowPracticeRef,
  type PracticeFlowMidiRef,
  type PracticeFlowStateRef,
} from '../src/practice-flow';

function makeDom(): PracticeFlowDom {
  document.body.innerHTML = `
    <button id="ptbQuit"></button>
    <button id="ptbToggleOsmd"></button>
    <button id="ptbPause">⏸</button>
    <button id="resQuit"></button>
    <button id="resRetry"></button>
    <button id="resRetrySlow" style="display: none"></button>
    <button id="resTryPlay"></button>
    <button id="resNext"></button>
    <button id="sumClose"></button>
    <button id="homeBtn"></button>
    <button id="sumHome"></button>
    <button id="resHome"></button>
    <div id="practiceHud"></div>
    <div id="osmdContainer"></div>
    <div id="songPanel"></div>
    <div id="sectionResult"></div>
    <div id="sessionSummary"></div>
    <div id="hud"></div>
    <div id="questDisplay"></div>
    <div id="micMeter"></div>
    <div id="startScreen"></div>
  `;
  return {
    ptbQuit: document.getElementById('ptbQuit') as HTMLElement,
    ptbToggleOsmd: document.getElementById('ptbToggleOsmd') as HTMLElement,
    ptbPause: document.getElementById('ptbPause'),
    resQuit: document.getElementById('resQuit') as HTMLElement,
    resRetry: document.getElementById('resRetry') as HTMLElement,
    resRetrySlow: document.getElementById('resRetrySlow'),
    resTryPlay: document.getElementById('resTryPlay'),
    resNext: document.getElementById('resNext') as HTMLElement,
    sumClose: document.getElementById('sumClose') as HTMLElement,
    homeBtn: document.getElementById('homeBtn') as HTMLElement,
    sumHome: document.getElementById('sumHome') as HTMLElement,
    resHome: document.getElementById('resHome') as HTMLElement,
    practiceHud: document.getElementById('practiceHud') as HTMLElement,
    osmdContainer: document.getElementById('osmdContainer') as HTMLElement,
    songPanel: document.getElementById('songPanel') as HTMLElement,
    sectionResult: document.getElementById('sectionResult') as HTMLElement,
    sessionSummary: document.getElementById('sessionSummary') as HTMLElement,
    hud: document.getElementById('hud') as HTMLElement,
    questDisplay: document.getElementById('questDisplay') as HTMLElement,
    micMeter: document.getElementById('micMeter') as HTMLElement,
    startScreen: document.getElementById('startScreen') as HTMLElement,
  };
}

function makeDeps(overrides: Partial<PracticeFlowDeps> = {}): PracticeFlowDeps {
  const practice: PracticeFlowPracticeRef = {
    enabled: false,
    sectionIdx: 0,
    mode: 'guided',
    _completing: false,
    _completionTimer: null,
    pendingHolds: { clear: vi.fn() },
  };
  const midiState: PracticeFlowMidiRef = {
    activeNotes: { clear: vi.fn() },
    sustainedNotes: { clear: vi.fn() },
  };
  const state: PracticeFlowStateRef = { running: false };
  return {
    dom: makeDom(),
    practice,
    state,
    midiState,
    getCurrentSong: () => ({
      sections: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    }),
    songProg: () => ({ unlockedSections: { a: true, b: true } }), // c is locked
    startPracticeSection: vi.fn(() => Promise.resolve()),
    renderSongPanel: vi.fn(),
    stopPracticeAudio: vi.fn(),
    releaseWakeLock: vi.fn(),
    hideIntroHint: vi.fn(),
    stopMidiAutoRescan: vi.fn(),
    resetSession: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── ptbQuit ─────────────────────────────────────────────────────────

describe('createPracticeFlow — ptbQuit', () => {
  it('no-ops when practice is not enabled and not completing', () => {
    const deps = makeDeps();
    createPracticeFlow(deps);
    deps.dom.ptbQuit.click();
    expect(deps.stopPracticeAudio).not.toHaveBeenCalled();
    expect(deps.renderSongPanel).not.toHaveBeenCalled();
  });

  it('clears practice state + audio + MIDI + holds + restores song panel', () => {
    const deps = makeDeps();
    deps.practice.enabled = true;
    createPracticeFlow(deps);
    deps.dom.ptbQuit.click();
    expect(deps.practice.enabled).toBe(false);
    expect(deps.stopPracticeAudio).toHaveBeenCalled();
    expect(deps.releaseWakeLock).toHaveBeenCalled();
    expect(deps.midiState.activeNotes.clear).toHaveBeenCalled();
    expect(deps.midiState.sustainedNotes.clear).toHaveBeenCalled();
    expect(deps.practice.pendingHolds.clear).toHaveBeenCalled();
    expect(deps.dom.songPanel.classList.contains('visible')).toBe(true);
    expect(deps.renderSongPanel).toHaveBeenCalled();
  });

  it('cancels in-flight section-complete timer', () => {
    const deps = makeDeps();
    deps.practice.enabled = false;
    deps.practice._completing = true;
    const timer = setTimeout(() => {}, 1000);
    deps.practice._completionTimer = timer;
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    createPracticeFlow(deps);
    deps.dom.ptbQuit.click();
    expect(clearSpy).toHaveBeenCalledWith(timer);
    expect(deps.practice._completionTimer).toBeNull();
    expect(deps.practice._completing).toBe(false);
  });
});

// ─── ptbToggleOsmd ───────────────────────────────────────────────────

describe('createPracticeFlow — ptbPause (⏸ 一時停止)', () => {
  function pauseDeps(paused = false) {
    let isPaused = paused;
    const pausePractice = vi.fn(() => {
      isPaused = true;
    });
    const resumePractice = vi.fn(() => {
      isPaused = false;
    });
    const deps = makeDeps({
      pausePractice,
      resumePractice,
      isPracticePaused: () => isPaused,
      t: (k: string) => `t:${k}`,
    } as Partial<PracticeFlowDeps>);
    return { deps, pausePractice, resumePractice };
  }

  it('練習中のクリックで pause し、ラベルが ▶/resume に変わる', () => {
    const { deps, pausePractice } = pauseDeps();
    deps.practice.enabled = true;
    createPracticeFlow(deps);
    deps.dom.ptbPause!.dispatchEvent(new Event('click'));
    expect(pausePractice).toHaveBeenCalledOnce();
    expect(deps.dom.ptbPause!.textContent).toBe('▶');
    expect(deps.dom.ptbPause!.getAttribute('title')).toBe('t:resumePractice');
    expect(deps.dom.ptbPause!.getAttribute('data-i18n-title')).toBe('resumePractice');
  });

  it('ポーズ中のクリックで resume し、ラベルが ⏸/pause に戻る', () => {
    const { deps, resumePractice } = pauseDeps(true);
    deps.practice.enabled = true;
    createPracticeFlow(deps);
    deps.dom.ptbPause!.dispatchEvent(new Event('click'));
    expect(resumePractice).toHaveBeenCalledOnce();
    expect(deps.dom.ptbPause!.textContent).toBe('⏸');
    expect(deps.dom.ptbPause!.getAttribute('data-i18n-title')).toBe('pausePractice');
  });

  it('練習外（enabled=false）のクリックは何もしない', () => {
    const { deps, pausePractice, resumePractice } = pauseDeps();
    createPracticeFlow(deps);
    deps.dom.ptbPause!.dispatchEvent(new Event('click'));
    expect(pausePractice).not.toHaveBeenCalled();
    expect(resumePractice).not.toHaveBeenCalled();
  });

  it('ポーズ中の quit でも resume が呼ばれてラッチが残らない', () => {
    const { deps, resumePractice } = pauseDeps(true);
    deps.practice.enabled = true;
    createPracticeFlow(deps);
    deps.dom.ptbQuit.dispatchEvent(new Event('click'));
    expect(resumePractice).toHaveBeenCalled();
  });

  it('ポーズラッチが残ったまま transitionToSection しても resume でクリアされる', async () => {
    const { deps, resumePractice } = pauseDeps(true);
    const flow = createPracticeFlow(deps);
    await flow.transitionToSection(0);
    expect(resumePractice).toHaveBeenCalled();
    expect(deps.startPracticeSection).toHaveBeenCalledWith(0);
  });

  it('設定パネル経由の変更は practicepausechange イベントでラベル同期される', () => {
    const { deps } = pauseDeps(true);
    deps.practice.enabled = true;
    createPracticeFlow(deps);
    window.dispatchEvent(new Event('practicepausechange'));
    expect(deps.dom.ptbPause!.textContent).toBe('▶');
  });
});

describe('createPracticeFlow — ptbToggleOsmd', () => {
  it('toggles the OSMD container visible class', () => {
    const deps = makeDeps();
    createPracticeFlow(deps);
    expect(deps.dom.osmdContainer.classList.contains('visible')).toBe(false);
    deps.dom.ptbToggleOsmd.click();
    expect(deps.dom.osmdContainer.classList.contains('visible')).toBe(true);
    deps.dom.ptbToggleOsmd.click();
    expect(deps.dom.osmdContainer.classList.contains('visible')).toBe(false);
  });

  it('persists the new visibility via setShowScorePref on each toggle', () => {
    const setShowScorePref = vi.fn();
    const deps = makeDeps({ setShowScorePref } as Partial<PracticeFlowDeps>);
    createPracticeFlow(deps);
    deps.dom.ptbToggleOsmd.click();
    expect(setShowScorePref).toHaveBeenLastCalledWith(true);
    deps.dom.ptbToggleOsmd.click();
    expect(setShowScorePref).toHaveBeenLastCalledWith(false);
  });
});

// ─── resQuit ─────────────────────────────────────────────────────────

describe('createPracticeFlow — resQuit', () => {
  it('hides result card + practice HUD + OSMD, shows song panel', () => {
    const deps = makeDeps();
    deps.dom.sectionResult.classList.add('visible');
    deps.dom.practiceHud.classList.add('visible');
    deps.dom.osmdContainer.classList.add('visible');
    createPracticeFlow(deps);
    deps.dom.resQuit.click();
    expect(deps.dom.sectionResult.classList.contains('visible')).toBe(false);
    expect(deps.dom.practiceHud.classList.contains('visible')).toBe(false);
    expect(deps.dom.osmdContainer.classList.contains('visible')).toBe(false);
    expect(deps.dom.songPanel.classList.contains('visible')).toBe(true);
    expect(deps.renderSongPanel).toHaveBeenCalled();
  });
});

// ─── resRetry ────────────────────────────────────────────────────────

describe('createPracticeFlow — resRetry', () => {
  it('restarts the current section', () => {
    const deps = makeDeps();
    deps.practice.sectionIdx = 1;
    createPracticeFlow(deps);
    deps.dom.resRetry.click();
    expect(deps.startPracticeSection).toHaveBeenCalledWith(1);
  });

  it('hides the result card', () => {
    const deps = makeDeps();
    deps.dom.sectionResult.classList.add('visible');
    createPracticeFlow(deps);
    deps.dom.resRetry.click();
    expect(deps.dom.sectionResult.classList.contains('visible')).toBe(false);
  });
});

// ─── resTryPlay ──────────────────────────────────────────────────────

describe('createPracticeFlow — resTryPlay (Listen → Guided shortcut)', () => {
  it('flips practice.mode to guided + restarts current section', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    deps.practice.sectionIdx = 2;
    createPracticeFlow(deps);
    deps.dom.resTryPlay!.click();
    expect(deps.practice.mode).toBe('guided');
    expect(deps.startPracticeSection).toHaveBeenCalledWith(2);
  });
});

// ─── resNext ─────────────────────────────────────────────────────────

describe('createPracticeFlow — resNext', () => {
  it('advances to the next section if unlocked', () => {
    const deps = makeDeps();
    deps.practice.sectionIdx = 0;
    createPracticeFlow(deps);
    deps.dom.resNext.click();
    expect(deps.practice.sectionIdx).toBe(1);
    expect(deps.startPracticeSection).toHaveBeenCalledWith(1);
  });

  it('blocks advancing to a locked next section', () => {
    const deps = makeDeps();
    deps.practice.sectionIdx = 1; // next is "c", locked
    createPracticeFlow(deps);
    deps.dom.resNext.click();
    expect(deps.practice.sectionIdx).toBe(1); // unchanged
    expect(deps.startPracticeSection).not.toHaveBeenCalled();
  });

  it('clamps at the last section index', () => {
    const deps = makeDeps({
      songProg: () => ({ unlockedSections: { a: true, b: true, c: true } }),
    });
    deps.practice.sectionIdx = 2; // already last
    createPracticeFlow(deps);
    deps.dom.resNext.click();
    expect(deps.practice.sectionIdx).toBe(2);
    expect(deps.startPracticeSection).toHaveBeenCalledWith(2);
  });
});

// ─── re-entrancy guard ───────────────────────────────────────────────

describe('createPracticeFlow — transitionToSection re-entrancy', () => {
  it('blocks a second concurrent transition', async () => {
    const startSpy = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
    const deps = makeDeps({ startPracticeSection: startSpy });
    const flow = createPracticeFlow(deps);
    const p1 = flow.transitionToSection(0);
    const p2 = flow.transitionToSection(1);
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledWith(0);
  });

  it('allows a second transition after the first completes', async () => {
    const deps = makeDeps();
    const flow = createPracticeFlow(deps);
    await flow.transitionToSection(0);
    await flow.transitionToSection(1);
    expect(deps.startPracticeSection).toHaveBeenCalledTimes(2);
  });
});

// ─── sumClose ────────────────────────────────────────────────────────

describe('createPracticeFlow — sumClose', () => {
  it('hides session summary + calls resetSession', () => {
    const deps = makeDeps();
    deps.dom.sessionSummary.classList.add('visible');
    createPracticeFlow(deps);
    deps.dom.sumClose.click();
    expect(deps.dom.sessionSummary.classList.contains('visible')).toBe(false);
    expect(deps.resetSession).toHaveBeenCalled();
  });
});

// ─── returnToTitle ───────────────────────────────────────────────────

describe('createPracticeFlow — returnToTitle', () => {
  it('🏠 Title button hides every modal + shows start screen', () => {
    const deps = makeDeps();
    deps.dom.songPanel.classList.add('visible');
    deps.dom.sessionSummary.classList.add('visible');
    deps.dom.sectionResult.classList.add('visible');
    deps.dom.practiceHud.classList.add('visible');
    deps.dom.osmdContainer.classList.add('visible');
    deps.dom.questDisplay.classList.add('visible');
    deps.dom.hud.style.display = 'block';
    createPracticeFlow(deps);
    deps.dom.homeBtn.click();
    expect(deps.dom.songPanel.classList.contains('visible')).toBe(false);
    expect(deps.dom.sessionSummary.classList.contains('visible')).toBe(false);
    expect(deps.dom.sectionResult.classList.contains('visible')).toBe(false);
    expect(deps.dom.practiceHud.classList.contains('visible')).toBe(false);
    expect(deps.dom.osmdContainer.classList.contains('visible')).toBe(false);
    expect(deps.dom.questDisplay.classList.contains('visible')).toBe(false);
    expect(deps.dom.hud.style.display).toBe('none');
    expect(deps.dom.startScreen.style.display).toBe('flex');
    expect(document.body.classList.contains('title-screen')).toBe(true);
  });

  it('stops practice audio + releases wake lock when practice is enabled', () => {
    const deps = makeDeps();
    deps.practice.enabled = true;
    createPracticeFlow(deps);
    deps.dom.homeBtn.click();
    expect(deps.practice.enabled).toBe(false);
    expect(deps.stopPracticeAudio).toHaveBeenCalled();
    expect(deps.releaseWakeLock).toHaveBeenCalled();
  });

  it('does NOT stop audio if practice is disabled (free-play return)', () => {
    const deps = makeDeps();
    deps.practice.enabled = false;
    deps.practice._completing = false;
    createPracticeFlow(deps);
    deps.dom.homeBtn.click();
    expect(deps.stopPracticeAudio).not.toHaveBeenCalled();
    expect(deps.releaseWakeLock).not.toHaveBeenCalled();
  });

  it('calls resetSession when state.running', () => {
    const deps = makeDeps();
    deps.state.running = true;
    createPracticeFlow(deps);
    deps.dom.homeBtn.click();
    expect(deps.resetSession).toHaveBeenCalled();
  });

  it('skips resetSession when state.running is false', () => {
    const deps = makeDeps();
    deps.state.running = false;
    createPracticeFlow(deps);
    deps.dom.homeBtn.click();
    expect(deps.resetSession).not.toHaveBeenCalled();
  });

  it('all three 🏠 buttons (homeBtn, sumHome, resHome) trigger returnToTitle', () => {
    const deps = makeDeps();
    createPracticeFlow(deps);
    deps.dom.sumHome.click();
    expect(deps.hideIntroHint).toHaveBeenCalledTimes(1);
    deps.dom.resHome.click();
    expect(deps.hideIntroHint).toHaveBeenCalledTimes(2);
    deps.dom.homeBtn.click();
    expect(deps.hideIntroHint).toHaveBeenCalledTimes(3);
  });

  it('stops MIDI auto-rescan poller', () => {
    const deps = makeDeps();
    createPracticeFlow(deps);
    deps.dom.homeBtn.click();
    expect(deps.stopMidiAutoRescan).toHaveBeenCalled();
  });
});

// ─── resRetrySlow (retry-with-support, P2-18) ────────────────────────

describe('createPracticeFlow — resRetrySlow', () => {
  function clickWithStrategy(strategy: string, tempo?: string) {
    const deps = makeDeps();
    createPracticeFlow(deps);
    const btn = deps.dom.resRetrySlow as HTMLElement;
    btn.dataset.strategy = strategy;
    if (tempo != null) btn.dataset.tempo = tempo;
    deps.dom.sectionResult.classList.add('visible');
    btn.click();
    return deps;
  }

  it('listen strategy switches mode to listen and retries', async () => {
    const deps = clickWithStrategy('listen');
    await Promise.resolve();
    expect(deps.practice.mode).toBe('listen');
    // fullSongMode は触らない — セクション retry では元々 false のまま、
    // 1曲チャレンジの 0★ retry では「全曲をきいてから」が正しい支援。
    expect(deps.practice.fullSongMode).toBeFalsy();
    expect(deps.startPracticeSection).toHaveBeenCalledWith(deps.practice.sectionIdx);
    expect(deps.dom.sectionResult.classList.contains('visible')).toBe(false);
  });

  it('listen strategy keeps the full-song target on a challenge retry', async () => {
    const deps = makeDeps();
    deps.practice.fullSongMode = true;
    createPracticeFlow(deps);
    const btn = deps.dom.resRetrySlow as HTMLElement;
    btn.dataset.strategy = 'listen';
    btn.click();
    await Promise.resolve();
    expect(deps.practice.mode).toBe('listen');
    expect(deps.practice.fullSongMode).toBe(true);
  });

  it('oneHand strategy sets handFilter=R and retries', async () => {
    const deps = clickWithStrategy('oneHand');
    await Promise.resolve();
    expect(deps.practice.handFilter).toBe('R');
    expect(deps.startPracticeSection).toHaveBeenCalled();
  });

  it('slowTempo strategy applies the dataset tempo and retries', async () => {
    const deps = clickWithStrategy('slowTempo', '50');
    await Promise.resolve();
    expect(deps.practice.tempoPct).toBe(50);
    expect(deps.startPracticeSection).toHaveBeenCalled();
  });

  it('slowTempo with a bogus tempo leaves tempoPct untouched but still retries', async () => {
    const deps = makeDeps();
    createPracticeFlow(deps);
    const before = deps.practice.tempoPct;
    const btn = deps.dom.resRetrySlow as HTMLElement;
    btn.dataset.strategy = 'slowTempo';
    btn.dataset.tempo = 'not-a-number';
    btn.click();
    await Promise.resolve();
    expect(deps.practice.tempoPct).toBe(before);
    expect(deps.startPracticeSection).toHaveBeenCalled();
  });
});
