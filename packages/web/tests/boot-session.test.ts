// @vitest-environment happy-dom
//
// Tests for packages/web/src/boot-session.ts.
//
// Covers:
//   • setStartButtonLoading toggles the is-loading class + disabled flag.
//   • setStartButtonLoading no-ops on null (defensive null guard).
//   • installStartButton happy path: first click → initAudio + showRunningUI
//     + initBgStars + state.running flips + rAF kicks.
//   • installStartButton re-entry while running → showRunningUI only,
//     sessionStartTimeMs rebases.
//   • installStartButton debounce: state.starting=true blocks a second click.
//   • installStartButton error path: initAudio rejects → alertAudioInitError
//     called, state.starting cleared.
//   • installStartButton finally: loading flag + state.starting always reset.
//   • installSongStartButton happy path: initAudio + songPanel hidden +
//     startPracticeSection called with practice.sectionIdx.
//   • installSongStartButton error path: songPanel re-shown so the user has
//     a way back.
//   • installSongStartButton re-entry while running → song panel hidden,
//     no initAudio, startPracticeSection still called.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setStartButtonLoading,
  installStartButton,
  installSongStartButton,
  type BootSessionDeps,
} from '../src/boot-session';

// ─── fixtures ──────────────────────────────────────────────────────

function makeBtn(): HTMLButtonElement {
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  return btn;
}

function makeSongPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.classList.add('visible');
  document.body.appendChild(panel);
  return panel;
}

interface FixtureSpies {
  initAudio: ReturnType<typeof vi.fn>;
  showRunningUI: ReturnType<typeof vi.fn>;
  initBgStars: ReturnType<typeof vi.fn>;
  loop: ReturnType<typeof vi.fn>;
  alertAudioInitError: ReturnType<typeof vi.fn>;
  startPracticeSection: ReturnType<typeof vi.fn>;
  raf: ReturnType<typeof vi.fn>;
}

function makeDeps(over: Partial<BootSessionDeps> = {}): {
  deps: BootSessionDeps;
  state: BootSessionDeps['state'];
  practice: BootSessionDeps['practice'];
  spies: FixtureSpies;
} {
  const state: BootSessionDeps['state'] = {
    running: false,
    starting: false,
    lastFrameTimeMs: -1,
    sessionStartTimeMs: -1,
  };
  const practice: BootSessionDeps['practice'] = { sectionIdx: 0 };
  const spies: FixtureSpies = {
    initAudio: vi.fn(async () => undefined),
    showRunningUI: vi.fn(),
    initBgStars: vi.fn(),
    loop: vi.fn(),
    alertAudioInitError: vi.fn(),
    startPracticeSection: vi.fn(async () => undefined),
    raf: vi.fn(),
  };
  // Patch requestAnimationFrame so we can assert the kick.
  globalThis.requestAnimationFrame = spies.raf as unknown as typeof requestAnimationFrame;

  const deps: BootSessionDeps = {
    state,
    practice,
    initAudio: spies.initAudio,
    showRunningUI: spies.showRunningUI,
    initBgStars: spies.initBgStars,
    loop: spies.loop,
    alertAudioInitError: spies.alertAudioInitError,
    startPracticeSection: spies.startPracticeSection,
    ...over,
  };
  return { deps, state, practice, spies };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── setStartButtonLoading ─────────────────────────────────────────

describe('setStartButtonLoading', () => {
  it('adds the is-loading class + disables when loading=true', () => {
    const btn = makeBtn();
    setStartButtonLoading(btn, true);
    expect(btn.classList.contains('is-loading')).toBe(true);
    expect(btn.disabled).toBe(true);
  });

  it('removes the is-loading class + enables when loading=false', () => {
    const btn = makeBtn();
    btn.classList.add('is-loading');
    btn.disabled = true;
    setStartButtonLoading(btn, false);
    expect(btn.classList.contains('is-loading')).toBe(false);
    expect(btn.disabled).toBe(false);
  });

  it('no-ops on null (defensive)', () => {
    expect(() => setStartButtonLoading(null, true)).not.toThrow();
  });
});

// ─── installStartButton ────────────────────────────────────────────

describe('installStartButton — happy path (cold boot)', () => {
  it('runs initAudio → showRunningUI → initBgStars → flips state.running → rAF', async () => {
    const btn = makeBtn();
    const fx = makeDeps();
    installStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.spies.initAudio).toHaveBeenCalledOnce();
    expect(fx.spies.showRunningUI).toHaveBeenCalledOnce();
    expect(fx.spies.initBgStars).toHaveBeenCalledOnce();
    expect(fx.state.running).toBe(true);
    expect(fx.state.lastFrameTimeMs).toBe(0);
    expect(fx.spies.raf).toHaveBeenCalledWith(fx.deps.loop);
  });

  it('clears state.starting + loading flag in finally (even on success)', async () => {
    const btn = makeBtn();
    const fx = makeDeps();
    installStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.state.starting).toBe(false);
    expect(btn.classList.contains('is-loading')).toBe(false);
    expect(btn.disabled).toBe(false);
  });

  it('seeds sessionStartTimeMs to a positive timestamp', async () => {
    const btn = makeBtn();
    const fx = makeDeps();
    installStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.state.sessionStartTimeMs).toBeGreaterThan(0);
  });
});

describe('installStartButton — re-entry while running', () => {
  it('skips initAudio + initBgStars, just refreshes UI + rebases session timer', async () => {
    const btn = makeBtn();
    const fx = makeDeps();
    fx.state.running = true;
    installStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    expect(fx.spies.initAudio).not.toHaveBeenCalled();
    expect(fx.spies.initBgStars).not.toHaveBeenCalled();
    expect(fx.spies.showRunningUI).toHaveBeenCalledOnce();
    expect(fx.state.sessionStartTimeMs).toBeGreaterThan(0);
  });
});

describe('installStartButton — debounce', () => {
  it('second click is ignored while state.starting=true', async () => {
    const btn = makeBtn();
    const fx = makeDeps();
    fx.state.starting = true; // simulate an in-flight start
    installStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    expect(fx.spies.initAudio).not.toHaveBeenCalled();
    expect(fx.spies.showRunningUI).not.toHaveBeenCalled();
  });
});

describe('installStartButton — error path', () => {
  it('initAudio rejects → alertAudioInitError fires + state cleared', async () => {
    const btn = makeBtn();
    const fx = makeDeps({
      initAudio: vi.fn().mockRejectedValue(new Error('audio denied')),
    });
    installStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.spies.alertAudioInitError).toHaveBeenCalledOnce();
    expect(fx.spies.alertAudioInitError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(fx.state.starting).toBe(false);
    expect(fx.state.running).toBe(false);
    expect(btn.classList.contains('is-loading')).toBe(false);
  });
});

// ─── installSongStartButton ────────────────────────────────────────

describe('installSongStartButton — happy path (cold boot)', () => {
  it('initAudio + hides songPanel + showRunningUI + startPracticeSection(sectionIdx)', async () => {
    const btn = makeBtn();
    const songPanel = makeSongPanel();
    const fx = makeDeps({ songPanel });
    fx.practice.sectionIdx = 2;
    installSongStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.spies.initAudio).toHaveBeenCalledOnce();
    expect(songPanel.classList.contains('visible')).toBe(false);
    expect(fx.spies.showRunningUI).toHaveBeenCalledOnce();
    expect(fx.state.running).toBe(true);
    expect(fx.spies.startPracticeSection).toHaveBeenCalledWith(2);
    expect(fx.state.starting).toBe(false);
  });
});

describe('installSongStartButton — re-entry while running', () => {
  it('hides song panel + starts the chosen section without re-running initAudio', async () => {
    const btn = makeBtn();
    const songPanel = makeSongPanel();
    const fx = makeDeps({ songPanel });
    fx.state.running = true;
    fx.practice.sectionIdx = 1;
    installSongStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.spies.initAudio).not.toHaveBeenCalled();
    expect(songPanel.classList.contains('visible')).toBe(false);
    expect(fx.spies.showRunningUI).toHaveBeenCalledOnce();
    expect(fx.spies.startPracticeSection).toHaveBeenCalledWith(1);
  });
});

describe('installSongStartButton — debounce', () => {
  it('skips initAudio when state.starting is already true', async () => {
    const btn = makeBtn();
    const songPanel = makeSongPanel();
    const fx = makeDeps({ songPanel });
    fx.state.starting = true;
    installSongStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    expect(fx.spies.initAudio).not.toHaveBeenCalled();
    expect(fx.spies.startPracticeSection).not.toHaveBeenCalled();
  });
});

describe('installSongStartButton — error path', () => {
  it('initAudio rejects → alertAudioInitError + songPanel restored visible', async () => {
    const btn = makeBtn();
    const songPanel = makeSongPanel();
    songPanel.classList.remove('visible'); // we'll assert the re-show
    const fx = makeDeps({
      songPanel,
      initAudio: vi.fn().mockRejectedValue(new Error('boom')),
    });
    installSongStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.spies.alertAudioInitError).toHaveBeenCalledOnce();
    expect(songPanel.classList.contains('visible')).toBe(true);
    expect(fx.state.starting).toBe(false);
  });

  it('startPracticeSection rejects → alertAudioInitError + songPanel re-shown', async () => {
    const btn = makeBtn();
    const songPanel = makeSongPanel();
    const fx = makeDeps({
      songPanel,
      startPracticeSection: vi.fn().mockRejectedValue(new Error('no notes')),
    });
    installSongStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.spies.alertAudioInitError).toHaveBeenCalledOnce();
    expect(songPanel.classList.contains('visible')).toBe(true);
  });
});

describe('installSongStartButton — optional deps', () => {
  it('no startPracticeSection → no throw (deps surface allows omission)', async () => {
    const btn = makeBtn();
    const songPanel = makeSongPanel();
    const fx = makeDeps({ songPanel, startPracticeSection: undefined });
    installSongStartButton(btn, fx.deps);
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.state.starting).toBe(false);
    // initAudio still ran, songPanel still hid
    expect(fx.spies.initAudio).toHaveBeenCalledOnce();
    expect(songPanel.classList.contains('visible')).toBe(false);
  });
});
