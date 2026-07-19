// @vitest-environment happy-dom
// Tests for packages/web/src/select-song.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSelectSong, type SelectSongRecord, type SelectSongDeps } from '../src/select-song';

interface OsmdStub {
  clear: ReturnType<typeof vi.fn>;
  __tag: string;
}

function makeFixture(
  over: {
    running?: boolean;
    loadResult?: 'ok' | 'fail';
    failError?: unknown;
    restoreSongSettings?: () => { mode?: string } | undefined;
  } = {}
) {
  const songs: Record<string, SelectSongRecord> = {
    fur_elise: { titleKey: 'furElise', composerKey: 'beethoven' },
    alla_turca: { titleKey: 'turkishMarch', composerKey: 'mozart' },
  };
  let currentSong: SelectSongRecord | null = null;
  let osmd: OsmdStub | null = null;

  const dom = {
    osmdContainer: document.createElement('div'),
    songTitle: document.createElement('div'),
    songComposer: document.createElement('div'),
    startScreen: document.createElement('div'),
    songPanel: document.createElement('div'),
    questDisplay: document.createElement('div'),
  };
  document.body.append(...Object.values(dom));
  // Seed the start screen visible + quest display visible to verify the
  // toggle paths actually flip them.
  dom.startScreen.style.display = 'block';
  dom.questDisplay.classList.add('visible');

  const practice = { mode: 'free', progress: undefined as unknown };
  const state = { running: over.running ?? false };

  const t = vi.fn((k: string) => 'T:' + k);
  const clearHighlights = vi.fn();
  const loadPracticeProgress = vi.fn(() => ({ songs: {} }));
  const showRunningUI = vi.fn();
  const renderSongPanel = vi.fn();
  const initWebMIDI = vi.fn();
  const loadCurrentScore = vi.fn(() => {
    if (over.loadResult === 'fail') {
      return Promise.reject(over.failError ?? new Error('boom'));
    }
    return Promise.resolve(undefined);
  });

  const ss = createSelectSong({
    songs,
    state,
    practice,
    dom,
    getCurrentSong: () => currentSong,
    setCurrentSong: (s) => {
      currentSong = s;
    },
    getOsmd: () => osmd,
    setOsmd: (o) => {
      osmd = o as OsmdStub | null;
    },
    clearHighlights,
    t,
    loadPracticeProgress,
    restoreSongSettings: over.restoreSongSettings,
    showRunningUI,
    renderSongPanel,
    initWebMIDI,
    loadCurrentScore,
  } as SelectSongDeps);

  return {
    ss,
    songs,
    dom,
    practice,
    state,
    t,
    clearHighlights,
    loadPracticeProgress,
    showRunningUI,
    renderSongPanel,
    initWebMIDI,
    loadCurrentScore,
    getCurrentSong: () => currentSong,
    getOsmd: () => osmd,
    setOsmdStub(stub: OsmdStub | null) {
      osmd = stub;
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createSelectSong — basic switching', () => {
  it('no-ops on unknown songId', () => {
    const fx = makeFixture();
    fx.ss.selectSong('does_not_exist');
    expect(fx.getCurrentSong()).toBe(null);
    expect(fx.renderSongPanel).not.toHaveBeenCalled();
  });

  it('sets currentSong on first call', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    expect(fx.getCurrentSong()).toBe(fx.songs.fur_elise);
  });

  it('writes localized title + composer', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    expect(fx.dom.songTitle.textContent).toBe('T:furElise');
    expect(fx.dom.songComposer.textContent).toBe('T:beethoven');
  });

  it('hides start screen and reveals song panel', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    expect(fx.dom.startScreen.style.display).toBe('none');
    expect(fx.dom.songPanel.classList.contains('visible')).toBe(true);
  });

  it('hides quest display', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    expect(fx.dom.questDisplay.classList.contains('visible')).toBe(false);
  });

  it('seeds practice.progress via loadPracticeProgress when missing', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    expect(fx.loadPracticeProgress).toHaveBeenCalledTimes(1);
    expect(fx.practice.progress).toBeDefined();
  });

  it('preserves practice.progress when already present', () => {
    const fx = makeFixture();
    const existing = { songs: { x: 1 } };
    fx.practice.progress = existing;
    fx.ss.selectSong('fur_elise');
    expect(fx.loadPracticeProgress).not.toHaveBeenCalled();
    expect(fx.practice.progress).toBe(existing);
  });

  it('defaults practice.mode to "guided" on first play (nothing remembered)', () => {
    const fx = makeFixture();
    fx.practice.mode = 'rhythm';
    fx.ss.selectSong('fur_elise');
    expect(fx.practice.mode).toBe('guided');
  });

  it('restores remembered settings instead of forcing guided (P2-20)', () => {
    let mode = 'guided';
    const fx = makeFixture({
      restoreSongSettings: () => {
        mode = 'rhythm'; // the real hook writes practice.mode
        return { mode: 'rhythm' };
      },
    });
    // Point practice.mode at our tracked value by mutating after construction.
    Object.defineProperty(fx.practice, 'mode', {
      get: () => mode,
      set: (v) => {
        mode = v;
      },
      configurable: true,
    });
    fx.ss.selectSong('fur_elise');
    // restoreSongSettings returned a mode → select-song must NOT reset to guided.
    expect(fx.practice.mode).toBe('rhythm');
  });
});

describe('createSelectSong — OSMD lifecycle on switch', () => {
  it('clears OSMD and innerHTML when switching to a different song', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    const osmdStub = { clear: vi.fn(), __tag: 'osmd1' };
    fx.setOsmdStub(osmdStub);
    fx.dom.osmdContainer.innerHTML = '<svg></svg>';

    fx.ss.selectSong('alla_turca');
    expect(osmdStub.clear).toHaveBeenCalled();
    expect(fx.getOsmd()).toBe(null);
    expect(fx.dom.osmdContainer.innerHTML).toBe('');
    expect(fx.clearHighlights).toHaveBeenCalled();
  });

  it('does NOT clear OSMD when re-selecting the SAME song', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise'); // first call: currentSong was null → clear ran
    fx.clearHighlights.mockClear(); // start fresh for the assertion
    const osmdStub = { clear: vi.fn(), __tag: 'osmd1' };
    fx.setOsmdStub(osmdStub);
    fx.dom.osmdContainer.innerHTML = '<svg></svg>';

    fx.ss.selectSong('fur_elise');
    expect(osmdStub.clear).not.toHaveBeenCalled();
    expect(fx.getOsmd()).toBe(osmdStub);
    expect(fx.dom.osmdContainer.innerHTML).toBe('<svg></svg>'); // untouched
    expect(fx.clearHighlights).not.toHaveBeenCalled();
  });

  it('survives an osmd.clear() throw', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    fx.setOsmdStub({
      clear: vi.fn(() => {
        throw new Error('osmd-bad');
      }),
      __tag: 'broken',
    });
    expect(() => fx.ss.selectSong('alla_turca')).not.toThrow();
    expect(fx.getOsmd()).toBe(null); // still cleared the ref
  });
});

describe('createSelectSong — running-UI invariant', () => {
  it('calls showRunningUI when state.running is true', () => {
    const fx = makeFixture({ running: true });
    fx.ss.selectSong('fur_elise');
    expect(fx.showRunningUI).toHaveBeenCalledTimes(1);
  });

  it('skips showRunningUI when state.running is false', () => {
    const fx = makeFixture({ running: false });
    fx.ss.selectSong('fur_elise');
    expect(fx.showRunningUI).not.toHaveBeenCalled();
  });
});

describe('createSelectSong — async preload', () => {
  it('clears _loadError on success and re-renders song panel when still on song', async () => {
    const fx = makeFixture({ loadResult: 'ok' });
    fx.songs.fur_elise._loadError = 'old error';
    fx.ss.selectSong('fur_elise');

    // After the synchronous part, _loadError already cleared (the
    // line right before loadCurrentScore() does this defensively).
    expect(fx.songs.fur_elise._loadError).toBeUndefined();
    // Initial sync renderSongPanel call.
    expect(fx.renderSongPanel).toHaveBeenCalledTimes(1);

    // Settle the promise.
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.renderSongPanel).toHaveBeenCalledTimes(2);
  });

  it('captures _loadError on failure and re-renders', async () => {
    const fx = makeFixture({ loadResult: 'fail', failError: new Error('Score broke') });
    fx.ss.selectSong('fur_elise');

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.songs.fur_elise._loadError).toBe('Score broke');
    expect(fx.renderSongPanel).toHaveBeenCalledTimes(2);
  });

  it('falls back to "Score load failed" when error has empty message', async () => {
    // An Error with no message — String(e) is '' (falsy) so the
    // fallback string kicks in.
    const fx = makeFixture({ loadResult: 'fail', failError: new Error('') });
    fx.ss.selectSong('fur_elise');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fx.songs.fur_elise._loadError).toBe('Score load failed');
  });

  it('skips re-render after preload completes if user moved to another song (race)', async () => {
    const fx = makeFixture({ loadResult: 'ok' });
    fx.ss.selectSong('fur_elise');
    // Initial sync render = 1 call.
    expect(fx.renderSongPanel).toHaveBeenCalledTimes(1);

    // Race: user picks alla_turca before preload settles.
    fx.ss.selectSong('alla_turca');
    // alla_turca's sync render = 2.
    expect(fx.renderSongPanel).toHaveBeenCalledTimes(2);

    // Settle BOTH preloads (fur_elise's first, then alla_turca's).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // fur_elise's late re-render is skipped because currentSong !== song.
    // alla_turca's late re-render fires (currentSong === song).
    expect(fx.renderSongPanel).toHaveBeenCalledTimes(3);
  });
});

describe('createSelectSong — side-effect callbacks', () => {
  it('always calls renderSongPanel + initWebMIDI synchronously', () => {
    const fx = makeFixture();
    fx.ss.selectSong('fur_elise');
    expect(fx.renderSongPanel).toHaveBeenCalled();
    expect(fx.initWebMIDI).toHaveBeenCalled();
  });
});
