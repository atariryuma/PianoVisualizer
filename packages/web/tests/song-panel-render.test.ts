// @vitest-environment happy-dom
//
// Tests for packages/web/src/song-panel-render.ts.
//
// Build a minimal song-panel DOM (header, streak cal, BPM hint, tempo
// row, section list, mode/hand rows, toggles, start button) and assert
// that one render() call paints every dynamic element correctly across
// the main branches: loading state, load-error state, fully-loaded
// section list, locked tempo / locked section, full-song listen
// dimming, and the start-button copy flip between Listen and Guided.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSongPanelRender,
  type SongPanelRenderDeps,
  type SongPanelRenderDom,
  type SongPanelPracticeRef,
  type SongPanelProgress,
  type SongPanelSong,
} from '../src/song-panel-render';

function makeDom(): SongPanelRenderDom {
  document.body.innerHTML = `
    <h1 id="songTitle"></h1>
    <h2 id="songComposer"></h2>
    <span id="streakCount"></span>
    <div id="streakCal"></div>
    <span id="songBpmHint"></span>
    <div id="tempoRow"></div>
    <div id="sectionList"></div>
    <button id="ghostToggle"></button>
    <button id="loopToggle"></button>
    <button id="metronomeToggle"></button>
    <div id="ghostRow"></div>
    <div id="loopRow"></div>
    <div id="metronomeRow"></div>
    <div id="fullSongRow"></div>
    <button id="fullSongToggle"></button>
    <div id="songPreflightHint" style="display: none">
      <span id="songPreflightText"></span>
      <button id="songPreflightApply" style="display: none"></button>
    </div>
    <button id="songStart"></button>
    <div id="modeRow">
      <button class="hand-btn" data-mode="listen"></button>
      <button class="hand-btn" data-mode="guided"></button>
      <button class="hand-btn" data-mode="rhythm"></button>
    </div>
    <div id="handRow">
      <button class="hand-btn" data-hand="L"></button>
      <button class="hand-btn" data-hand=""></button>
      <button class="hand-btn" data-hand="R"></button>
    </div>
  `;
  return {
    songTitle: document.getElementById('songTitle') as HTMLElement,
    songComposer: document.getElementById('songComposer') as HTMLElement,
    streakCount: document.getElementById('streakCount') as HTMLElement,
    streakCal: document.getElementById('streakCal') as HTMLElement,
    songBpmHint: document.getElementById('songBpmHint'),
    tempoRow: document.getElementById('tempoRow') as HTMLElement,
    sectionList: document.getElementById('sectionList') as HTMLElement,
    ghostToggle: document.getElementById('ghostToggle') as HTMLElement,
    metronomeToggle: document.getElementById('metronomeToggle') as HTMLElement,
    ghostRow: document.getElementById('ghostRow'),
    loopRow: document.getElementById('loopRow'),
    loopToggle: document.getElementById('loopToggle'),
    metronomeRow: document.getElementById('metronomeRow'),
    fullSongRow: document.getElementById('fullSongRow'),
    fullSongToggle: document.getElementById('fullSongToggle'),
    songPreflightHint: document.getElementById('songPreflightHint'),
    songPreflightText: document.getElementById('songPreflightText'),
    songPreflightApply: document.getElementById('songPreflightApply'),
    songStart: document.getElementById('songStart') as HTMLElement,
  };
}

function makeSong(overrides: Partial<SongPanelSong> = {}): SongPanelSong {
  return {
    titleKey: 'furElise',
    composerKey: 'composerBeethoven',
    sections: [
      { id: 'a1', nameKey: 'feA1', descKey: 'feA1desc' },
      { id: 'b', nameKey: 'feB', descKey: 'feBdesc' },
      { id: 'a2', nameKey: 'feA2', descKey: 'feA2desc', isBoss: true },
    ],
    _loaded: true,
    bpm: 72,
    ...overrides,
  };
}

function makeProgress(overrides: Partial<SongPanelProgress> = {}): SongPanelProgress {
  return {
    unlockedTempos: { 50: true, 60: true, 75: true, 90: true, 100: true },
    unlockedSections: { a1: true, b: true, a2: true },
    sections: { a1: { stars: 2 }, b: { stars: 1 } },
    history: {},
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SongPanelRenderDeps> = {}): SongPanelRenderDeps {
  const practice: SongPanelPracticeRef = {
    progress: { streakCount: 3, streakDays: ['2026-05-05', '2026-05-06', '2026-05-07'] },
    tempoPct: 75,
    mode: 'rhythm',
    fullSongMode: false,
    sectionIdx: 0,
    handFilter: null,
    ghostOn: false,
    metronomeOn: false,
    loopOn: false,
  };
  return {
    dom: makeDom(),
    practice,
    getCurrentSong: () => makeSong(),
    songProg: () => makeProgress(),
    t: vi.fn((key) => key),
    dateKey: (d: Date) => d.toISOString().slice(0, 10),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── header + streak ─────────────────────────────────────────────────

describe('createSongPanelRender — header', () => {
  it('paints the song title + composer from i18n keys', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    expect(deps.dom.songTitle.textContent).toBe('furElise');
    expect(deps.dom.songComposer.textContent).toBe('composerBeethoven');
  });

  it('paints the streak count', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    expect(deps.dom.streakCount.textContent).toBe('3');
  });

  it('renders 7 streak-day cells', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    expect(deps.dom.streakCal.querySelectorAll('.streak-day').length).toBe(7);
  });

  it('marks practiced days with the .done class', () => {
    // Today is the last cell; deps.practice.progress.streakDays must
    // include the canonical key for "today" to mark it.
    const today = new Date().toISOString().slice(0, 10);
    const deps = makeDeps();
    deps.practice.progress!.streakDays = [today];
    createSongPanelRender(deps).render();
    const cells = deps.dom.streakCal.querySelectorAll('.streak-day');
    const lastCell = cells[cells.length - 1];
    expect(lastCell.classList.contains('done')).toBe(true);
  });

  it('returns early when practice.progress is null', () => {
    const deps = makeDeps();
    deps.practice.progress = null;
    expect(() => createSongPanelRender(deps).render()).not.toThrow();
    // Title not painted
    expect(deps.dom.songTitle.textContent).toBe('');
  });
});

// ─── BPM hint ────────────────────────────────────────────────────────

describe('createSongPanelRender — BPM hint', () => {
  it('shows source BPM → effective BPM (rounded)', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    // 72 * 75 / 100 = 54
    expect(deps.dom.songBpmHint!.textContent).toBe('♩ = 72 → 54');
  });

  it('shows blank when song is not loaded', () => {
    const deps = makeDeps({ getCurrentSong: () => makeSong({ _loaded: false }) });
    createSongPanelRender(deps).render();
    expect(deps.dom.songBpmHint!.textContent).toBe('');
  });

  it('full-song listen forces 100% effective BPM', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    deps.practice.fullSongMode = true;
    createSongPanelRender(deps).render();
    expect(deps.dom.songBpmHint!.textContent).toBe('♩ = 72 → 72');
  });

  it('toggles .rescaled when song._bpmRescaled', () => {
    const deps = makeDeps({
      getCurrentSong: () => makeSong({ _bpmRescaled: true }),
    });
    createSongPanelRender(deps).render();
    expect(deps.dom.songBpmHint!.classList.contains('rescaled')).toBe(true);
  });
});

// ─── tempo row ───────────────────────────────────────────────────────

describe('createSongPanelRender — tempo row', () => {
  it('renders 5 buttons (50 / 60 / 75 / 90 / 100)', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    const buttons = deps.dom.tempoRow.querySelectorAll('button');
    expect(buttons.length).toBe(5);
    expect(buttons[0].textContent).toBe('50%');
    expect(buttons[4].textContent).toBe('100%');
  });

  it('marks the current tempo button active', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    const buttons = deps.dom.tempoRow.querySelectorAll('button');
    expect(buttons[2].classList.contains('active')).toBe(true); // 75
    expect(buttons[0].classList.contains('active')).toBe(false);
  });

  it('locks tempos that are not in unlockedTempos', () => {
    const deps = makeDeps({
      songProg: () => makeProgress({ unlockedTempos: { 50: true, 60: true, 75: true } }),
    });
    createSongPanelRender(deps).render();
    const buttons = deps.dom.tempoRow.querySelectorAll('button');
    expect(buttons[0].classList.contains('locked')).toBe(false); // 50 (always support)
    expect(buttons[1].classList.contains('locked')).toBe(false); // 60
    expect(buttons[2].classList.contains('locked')).toBe(false); // 75
    expect(buttons[3].classList.contains('locked')).toBe(true); // 90
    expect(buttons[4].classList.contains('locked')).toBe(true); // 100
    expect((buttons[3] as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking an unlocked tempo updates practice.tempoPct', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    const btn90 = deps.dom.tempoRow.querySelectorAll('button')[3] as HTMLButtonElement;
    btn90.click();
    expect(deps.practice.tempoPct).toBe(90);
  });

  it('slowing to 50% is always available (support, not a reward)', () => {
    const deps = makeDeps({
      songProg: () => makeProgress({ unlockedTempos: { 50: true, 60: true } }),
    });
    createSongPanelRender(deps).render();
    const btn50 = deps.dom.tempoRow.querySelectorAll('button')[0] as HTMLButtonElement;
    expect(btn50.classList.contains('locked')).toBe(false);
    btn50.click();
    expect(deps.practice.tempoPct).toBe(50);
  });

  it('clicking a locked tempo does NOT update', () => {
    const deps = makeDeps({
      songProg: () => makeProgress({ unlockedTempos: { 50: true, 60: true } }),
    });
    createSongPanelRender(deps).render();
    const btn90 = deps.dom.tempoRow.querySelectorAll('button')[3] as HTMLButtonElement;
    btn90.click();
    expect(deps.practice.tempoPct).toBe(75); // unchanged
  });

  it('full-song listen dims the tempo row + locks all but 100', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    deps.practice.fullSongMode = true;
    createSongPanelRender(deps).render();
    expect(deps.dom.tempoRow.style.opacity).toBe('0.55');
    const buttons = deps.dom.tempoRow.querySelectorAll('button');
    expect(buttons[0].classList.contains('locked')).toBe(true);
    expect(buttons[4].classList.contains('locked')).toBe(false); // 100 active
    expect(buttons[4].classList.contains('active')).toBe(true);
  });

  it('guided mode locks the tempo row to 100 regardless of tempoPct', () => {
    const deps = makeDeps();
    deps.practice.mode = 'guided';
    deps.practice.tempoPct = 75;
    createSongPanelRender(deps).render();
    expect(deps.dom.tempoRow.style.opacity).toBe('0.55');
    const buttons = deps.dom.tempoRow.querySelectorAll('button');
    expect(buttons[0].classList.contains('locked')).toBe(true); // 50
    expect(buttons[1].classList.contains('locked')).toBe(true); // 60
    expect(buttons[2].classList.contains('locked')).toBe(true); // 75
    expect(buttons[3].classList.contains('locked')).toBe(true); // 90
    expect(buttons[4].classList.contains('locked')).toBe(false); // 100 active
    expect(buttons[4].classList.contains('active')).toBe(true);
  });
});

// ─── section list ────────────────────────────────────────────────────

describe('createSongPanelRender — section list', () => {
  it('renders one row per section', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    expect(deps.dom.sectionList.querySelectorAll('.section-row').length).toBe(3);
  });

  it('shows ⏳ loading when song is not loaded yet', () => {
    const deps = makeDeps({ getCurrentSong: () => makeSong({ _loaded: false }) });
    createSongPanelRender(deps).render();
    expect(deps.dom.sectionList.innerHTML).toContain('⏳');
    expect(deps.dom.sectionList.innerHTML).toContain('loadingScore');
  });

  it('shows ❌ + escaped error when song._loadError is set', () => {
    const deps = makeDeps({
      getCurrentSong: () =>
        makeSong({
          _loaded: false,
          _loadError: 'Boom <script>alert(1)</script>',
        }),
    });
    createSongPanelRender(deps).render();
    expect(deps.dom.sectionList.innerHTML).toContain('❌');
    expect(deps.dom.sectionList.innerHTML).toContain('&lt;script&gt;');
    expect(deps.dom.sectionList.innerHTML).not.toContain('<script>alert(1)</script>');
  });

  it('marks locked sections with .locked + 🔒 icon', () => {
    const deps = makeDeps({
      songProg: () => makeProgress({ unlockedSections: { a1: true } }),
    });
    createSongPanelRender(deps).render();
    const rows = deps.dom.sectionList.querySelectorAll('.section-row');
    expect(rows[0].classList.contains('locked')).toBe(false);
    expect(rows[1].classList.contains('locked')).toBe(true);
    expect(rows[2].classList.contains('locked')).toBe(true);
    expect(rows[1].innerHTML).toContain('🔒');
  });

  it('marks boss sections with 👑 icon', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    const rows = deps.dom.sectionList.querySelectorAll('.section-row');
    expect(rows[2].classList.contains('boss')).toBe(true);
    expect(rows[2].innerHTML).toContain('👑');
  });

  it('renders ★ + ☆ for the section star count', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    const rows = deps.dom.sectionList.querySelectorAll('.section-row');
    // a1 has 2 stars in fixture: ★★☆
    expect(rows[0].innerHTML).toContain('★★☆');
    // b has 1 star: ★☆☆
    expect(rows[1].innerHTML).toContain('★☆☆');
    // a2 has 0 stars: ☆☆☆
    expect(rows[2].innerHTML).toContain('☆☆☆');
  });

  it('clicking an unlocked section sets practice.sectionIdx', () => {
    const deps = makeDeps();
    createSongPanelRender(deps).render();
    const rows = deps.dom.sectionList.querySelectorAll('.section-row');
    (rows[1] as HTMLElement).click();
    expect(deps.practice.sectionIdx).toBe(1);
  });

  it('full-song listen dims the section list + disables clicks', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    deps.practice.fullSongMode = true;
    createSongPanelRender(deps).render();
    expect(deps.dom.sectionList.style.opacity).toBe('0.4');
    expect(deps.dom.sectionList.style.pointerEvents).toBe('none');
  });
});

// ─── mode / hand / toggles ──────────────────────────────────────────

describe('createSongPanelRender — mode/hand/toggles', () => {
  it('marks the current mode button active', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    const rhythmBtn = document.querySelector('#modeRow [data-mode="rhythm"]') as HTMLElement;
    expect(rhythmBtn.classList.contains('active')).toBe(true);
  });

  it('marks the current hand button active (Both when null)', () => {
    const deps = makeDeps();
    deps.practice.handFilter = null;
    createSongPanelRender(deps).render();
    const bothBtn = document.querySelector('#handRow [data-hand=""]') as HTMLElement;
    expect(bothBtn.classList.contains('active')).toBe(true);
  });

  it('hides ghost / metronome rows outside of rhythm mode', () => {
    const deps = makeDeps();
    deps.practice.mode = 'guided';
    createSongPanelRender(deps).render();
    expect(deps.dom.ghostRow!.style.display).toBe('none');
    expect(deps.dom.metronomeRow!.style.display).toBe('none');
  });

  it('shows ghost / metronome rows in rhythm mode', () => {
    const deps = makeDeps();
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.ghostRow!.style.display).toBe('');
    expect(deps.dom.metronomeRow!.style.display).toBe('');
  });

  it('loopRow は guided/rhythm で表示、listen で非表示 (P2-12)', () => {
    const deps = makeDeps();
    deps.practice.mode = 'guided';
    createSongPanelRender(deps).render();
    expect(deps.dom.loopRow!.style.display).toBe('');
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.loopRow!.style.display).toBe('');
    deps.practice.mode = 'listen';
    createSongPanelRender(deps).render();
    expect(deps.dom.loopRow!.style.display).toBe('none');
  });

  it('loopToggle は practice.loopOn を on クラスに反映する (P2-12)', () => {
    const deps = makeDeps();
    (deps.practice as { loopOn?: boolean }).loopOn = true;
    createSongPanelRender(deps).render();
    expect(deps.dom.loopToggle!.classList.contains('on')).toBe(true);
  });

  it('shows fullSongRow only in listen mode', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    createSongPanelRender(deps).render();
    expect(deps.dom.fullSongRow!.style.display).toBe('');
  });

  it('marks toggle.on when ghostOn / metronomeOn / fullSongMode is true', () => {
    const deps = makeDeps();
    deps.practice.ghostOn = true;
    deps.practice.metronomeOn = true;
    deps.practice.fullSongMode = true;
    createSongPanelRender(deps).render();
    expect(deps.dom.ghostToggle.classList.contains('on')).toBe(true);
    expect(deps.dom.metronomeToggle.classList.contains('on')).toBe(true);
    expect(deps.dom.fullSongToggle!.classList.contains('on')).toBe(true);
  });
});

// ─── start button copy ──────────────────────────────────────────────

describe('createSongPanelRender — start button', () => {
  it('reads "startPractice" outside of listen mode', () => {
    const deps = makeDeps();
    deps.practice.mode = 'guided';
    createSongPanelRender(deps).render();
    expect(deps.dom.songStart.textContent).toBe('startPractice');
  });

  it('reads "startListening" in listen mode', () => {
    const deps = makeDeps();
    deps.practice.mode = 'listen';
    createSongPanelRender(deps).render();
    expect(deps.dom.songStart.textContent).toBe('startListening');
  });
});

// ─── feed-forward pre-flight hint ────────────────────────────────────

describe('createSongPanelRender — pre-flight scaffold', () => {
  // The selected section (sectionIdx 0 → 'a1') has two trailing 0-star runs.
  const struggled = () => makeProgress({ history: { a1: [{ s: 1 }, { s: 0 }, { s: 0 }] } });

  it('shows the Listen-first nudge for a recently-struggled section', () => {
    const deps = makeDeps({ songProg: struggled });
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightHint!.style.display).toBe('');
    expect(deps.dom.songPreflightText!.textContent).toBe('preflightHint');
  });

  it('hides the nudge when the section has not been struggled with', () => {
    const deps = makeDeps({ songProg: () => makeProgress({ history: { a1: [{ s: 2 }] } }) });
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightHint!.style.display).toBe('none');
    expect(deps.dom.songPreflightText!.textContent).toBe('');
  });

  it('does not nudge when already in Listen mode (no point)', () => {
    const deps = makeDeps({ songProg: struggled });
    deps.practice.mode = 'listen';
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightHint!.style.display).toBe('none');
  });

  it('keys off the selected section, not section 0', () => {
    // Struggle is on 'b' (idx 1); a1 is clean. Selecting b shows the nudge.
    const deps = makeDeps({
      songProg: () => makeProgress({ history: { a1: [{ s: 3 }], b: [{ s: 0 }, { s: 0 }] } }),
    });
    deps.practice.mode = 'rhythm';
    deps.practice.sectionIdx = 1;
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightHint!.style.display).toBe('');
  });

  it('escalates to one-hand copy on a deep, notes-bottleneck struggle', () => {
    const deps = makeDeps({
      songProg: () =>
        makeProgress({
          history: {
            a1: [
              { a: 50, s: 0 },
              { a: 55, s: 0 },
              { a: 58, s: 0 },
            ],
          },
        }),
    });
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightText!.textContent).toBe('preflightHintOneHand');
  });

  it('escalates to slower-tempo copy when notes land but timing lags', () => {
    const deps = makeDeps({
      songProg: () =>
        makeProgress({
          history: {
            a1: [
              { a: 75, s: 0 },
              { a: 80, s: 0 },
              { a: 85, s: 0 },
            ],
          },
        }),
    });
    deps.practice.mode = 'rhythm';
    deps.practice.tempoPct = 90;
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightText!.textContent).toBe('preflightHintSlow');
  });

  it('falls back to one-hand copy when already at the slowest tempo', () => {
    const deps = makeDeps({
      songProg: () =>
        makeProgress({
          history: {
            a1: [
              { a: 75, s: 0 },
              { a: 80, s: 0 },
              { a: 85, s: 0 },
            ],
          },
        }),
    });
    deps.practice.mode = 'rhythm';
    deps.practice.tempoPct = 50; // slowest step — can't go lower, so one-hand
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightText!.textContent).toBe('preflightHintOneHand');
  });
});

// ─── one-tap "set it up for me" apply button ─────────────────────────

describe('createSongPanelRender — scaffold apply button', () => {
  const deep = (a: number) =>
    makeProgress({
      history: {
        a1: [
          { a, s: 0 },
          { a, s: 0 },
          { a, s: 0 },
        ],
      },
    });

  it('shallow struggle: apply switches to Listen mode', () => {
    const deps = makeDeps({
      songProg: () => makeProgress({ history: { a1: [{ s: 0 }, { s: 0 }] } }),
    });
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightApply!.textContent).toBe('preflightApplyListen');
    deps.dom.songPreflightApply!.click();
    expect(deps.practice.mode).toBe('listen');
    // Re-rendered into listen mode → the nudge hides itself.
    expect(deps.dom.songPreflightHint!.style.display).toBe('none');
  });

  it('notes bottleneck: apply sets the right-hand filter', () => {
    const deps = makeDeps({ songProg: () => deep(55) });
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightApply!.textContent).toBe('preflightApplyOneHand');
    deps.dom.songPreflightApply!.click();
    expect(deps.practice.handFilter).toBe('R');
  });

  it('timing bottleneck: apply drops to the lowest unlocked tempo', () => {
    const deps = makeDeps({
      songProg: () => ({ ...deep(80), unlockedTempos: { 60: true, 75: true } }),
    });
    deps.practice.mode = 'rhythm';
    deps.practice.tempoPct = 90;
    createSongPanelRender(deps).render();
    // The i18n key is fed the chosen tempo as {v} (the stub returns the key).
    expect(deps.t).toHaveBeenCalledWith('preflightApplySlowFmt', { v: 60 });
    expect(deps.dom.songPreflightApply!.textContent).toBe('preflightApplySlowFmt');
    deps.dom.songPreflightApply!.click();
    expect(deps.practice.tempoPct).toBe(60);
  });

  it('hides the apply button when there is no nudge', () => {
    const deps = makeDeps({ songProg: () => makeProgress({ history: { a1: [{ s: 2 }] } }) });
    deps.practice.mode = 'rhythm';
    createSongPanelRender(deps).render();
    expect(deps.dom.songPreflightApply!.style.display).toBe('none');
  });
});
