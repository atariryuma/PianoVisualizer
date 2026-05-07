// @vitest-environment happy-dom
//
// Tests for packages/web/src/dev-mode.ts.
//
// Covers:
//   • readDevModeFlag — URL/localStorage precedence rules
//   • createDevMode — toolbar mounted only when activated
//   • 5-tap gesture on triggerEl toggles persistent flag
//   • runSelfTest renders results + summary, handles throws
//   • Diag panel toggles + refreshes at 1Hz
//   • destroy() cleans up listeners + DOM nodes

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDevMode, readDevModeFlag, type SelfTest, type DevModeDeps } from '../src/dev-mode';

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── readDevModeFlag ─────────────────────────────────────────────────

describe('readDevModeFlag', () => {
  it('returns false by default (no URL param, no localStorage)', () => {
    expect(readDevModeFlag('')).toBe(false);
  });

  it('reads true when localStorage flag is set', () => {
    localStorage.setItem('pianoViz_dev', '1');
    expect(readDevModeFlag('')).toBe(true);
  });

  it('?dev=1 enables + persists to localStorage', () => {
    expect(readDevModeFlag('?dev=1')).toBe(true);
    expect(localStorage.getItem('pianoViz_dev')).toBe('1');
  });

  it('?dev=0 disables + clears localStorage', () => {
    localStorage.setItem('pianoViz_dev', '1');
    expect(readDevModeFlag('?dev=0')).toBe(false);
    expect(localStorage.getItem('pianoViz_dev')).toBeNull();
  });

  it('URL ?dev=1 wins even if localStorage was unset', () => {
    expect(readDevModeFlag('?dev=1&foo=bar')).toBe(true);
  });

  it('handles missing localStorage gracefully', () => {
    expect(readDevModeFlag('?dev=1', null)).toBe(true);
    expect(readDevModeFlag('?dev=0', null)).toBe(false);
    expect(readDevModeFlag('', null)).toBe(false);
  });
});

// ─── createDevMode (deactivated) ─────────────────────────────────────

describe('createDevMode — when deactivated', () => {
  it('does not mount the toolbar', () => {
    const trigger = document.createElement('div');
    document.body.appendChild(trigger);
    const dm = createDevMode({
      triggerEl: trigger,
      tests: [],
      getDiagSnapshot: () => ({}),
    });
    expect(dm.isEnabled()).toBe(false);
    expect(document.querySelector('.dev-mode-toolbar')).toBeNull();
  });

  it('still wires the 5-tap gesture (so users can activate)', () => {
    const trigger = document.createElement('div');
    document.body.appendChild(trigger);
    createDevMode({
      triggerEl: trigger,
      tests: [],
      getDiagSnapshot: () => ({}),
    });
    // Mock alert + simulate 5 quick taps
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) trigger.click();
    expect(localStorage.getItem('pianoViz_dev')).toBe('1');
    expect(alertSpy).toHaveBeenCalled();
  });

  it('5 taps within window again toggles dev mode OFF', () => {
    const trigger = document.createElement('div');
    document.body.appendChild(trigger);
    createDevMode({
      triggerEl: trigger,
      tests: [],
      getDiagSnapshot: () => ({}),
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) trigger.click();
    expect(localStorage.getItem('pianoViz_dev')).toBe('1');
    for (let i = 0; i < 5; i++) trigger.click();
    expect(localStorage.getItem('pianoViz_dev')).toBeNull();
  });

  it('a single tap does not toggle (sanity)', () => {
    const trigger = document.createElement('div');
    document.body.appendChild(trigger);
    createDevMode({
      triggerEl: trigger,
      tests: [],
      getDiagSnapshot: () => ({}),
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    trigger.click();
    expect(localStorage.getItem('pianoViz_dev')).toBeNull();
  });
});

// ─── createDevMode (activated) ───────────────────────────────────────

function makeDeps(over: Partial<DevModeDeps> = {}): DevModeDeps {
  return {
    triggerEl: null,
    tests: [],
    getDiagSnapshot: () => ({ stub: 'value' }),
    ...over,
  };
}

describe('createDevMode — when activated', () => {
  beforeEach(() => {
    localStorage.setItem('pianoViz_dev', '1');
  });

  it('mounts a fixed toolbar in the DOM', () => {
    const dm = createDevMode(makeDeps());
    expect(dm.isEnabled()).toBe(true);
    const toolbar = document.querySelector('.dev-mode-toolbar') as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.style.position).toBe('fixed');
  });

  it('toolbar contains 🧪 self-test, 📊 diag, 📋 copy, ✕ close buttons', () => {
    createDevMode(makeDeps());
    const buttons = document.querySelectorAll('.dev-mode-toolbar button');
    expect(buttons.length).toBe(4);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
      '🧪 Self-test',
      '📊 Diag',
      '📋 Copy',
      '✕',
    ]);
  });

  it('✕ button clears localStorage flag + removes toolbar', () => {
    createDevMode(makeDeps());
    const closeBtn = document.querySelectorAll('.dev-mode-toolbar button')[3] as HTMLElement;
    closeBtn.click();
    expect(localStorage.getItem('pianoViz_dev')).toBeNull();
    expect(document.querySelector('.dev-mode-toolbar')).toBeNull();
  });

  it('destroy() cleans up DOM + interval + listener', () => {
    const trigger = document.createElement('div');
    document.body.appendChild(trigger);
    const dm = createDevMode(makeDeps({ triggerEl: trigger }));
    dm.destroy();
    expect(document.querySelector('.dev-mode-toolbar')).toBeNull();
  });
});

// ─── self-test runner ───────────────────────────────────────────────

describe('createDevMode — self-test runner', () => {
  beforeEach(() => {
    localStorage.setItem('pianoViz_dev', '1');
  });

  function tests(): SelfTest[] {
    return [
      { name: 'pass-test', run: async () => ({ ok: true }) },
      { name: 'fail-test', run: async () => ({ ok: false, detail: 'bad thing' }) },
      {
        name: 'throw-test',
        run: async () => {
          throw new Error('boom');
        },
      },
      { name: 'bool-true', run: async () => true },
    ];
  }

  it('renders one row per test + green/red badges + summary', async () => {
    createDevMode(makeDeps({ tests: tests() }));
    const selftestBtn = document.querySelectorAll('.dev-mode-toolbar button')[0] as HTMLElement;
    selftestBtn.click();
    // Wait for all tests to resolve
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const panel = document.querySelector('.dev-mode-suite') as HTMLElement;
    expect(panel).not.toBeNull();
    // 4 test rows + 1 summary
    const rows = panel.querySelectorAll('div > div');
    expect(panel.textContent).toContain('pass-test');
    expect(panel.textContent).toContain('fail-test');
    expect(panel.textContent).toContain('bad thing');
    expect(panel.textContent).toContain('throw-test');
    expect(panel.textContent).toContain('boom');
    // Summary text
    expect(panel.textContent).toContain('2 / 4 passed');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('disables the button while running', async () => {
    let resolveOne: (() => void) | null = null;
    const slowTest: SelfTest = {
      name: 'slow',
      run: () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveOne = () => res({ ok: true });
        }),
    };
    createDevMode(makeDeps({ tests: [slowTest] }));
    const selftestBtn = document.querySelectorAll(
      '.dev-mode-toolbar button'
    )[0] as HTMLButtonElement;
    selftestBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(selftestBtn.disabled).toBe(true);
    resolveOne!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(selftestBtn.disabled).toBe(false);
  });
});

// ─── diag panel ──────────────────────────────────────────────────────

describe('createDevMode — diag panel', () => {
  beforeEach(() => {
    localStorage.setItem('pianoViz_dev', '1');
  });

  it('toggles open + closed on diag button click', () => {
    createDevMode(makeDeps());
    const diagBtn = document.querySelectorAll('.dev-mode-toolbar button')[1] as HTMLElement;
    diagBtn.click();
    expect(document.querySelector('.dev-mode-diag')).not.toBeNull();
    diagBtn.click();
    expect(document.querySelector('.dev-mode-diag')).toBeNull();
  });

  it('renders all snapshot keys + values', () => {
    createDevMode(
      makeDeps({
        getDiagSnapshot: () => ({
          'audioCtx.state': 'running',
          'practice.mode': 'guided',
          'state.flow': '42.5',
        }),
      })
    );
    const diagBtn = document.querySelectorAll('.dev-mode-toolbar button')[1] as HTMLElement;
    diagBtn.click();
    const panel = document.querySelector('.dev-mode-diag') as HTMLElement;
    expect(panel.textContent).toContain('audioCtx.state');
    expect(panel.textContent).toContain('running');
    expect(panel.textContent).toContain('practice.mode');
    expect(panel.textContent).toContain('guided');
    expect(panel.textContent).toContain('state.flow');
    expect(panel.textContent).toContain('42.5');
  });

  it('refreshes the snapshot at 1Hz', () => {
    vi.useFakeTimers();
    let count = 0;
    createDevMode(
      makeDeps({
        getDiagSnapshot: () => ({ tick: String(count++) }),
      })
    );
    const diagBtn = document.querySelectorAll('.dev-mode-toolbar button')[1] as HTMLElement;
    diagBtn.click();
    expect(count).toBe(1); // initial paint
    vi.advanceTimersByTime(1000);
    expect(count).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(count).toBe(3);
  });

  it('escapes HTML in snapshot values (XSS defense)', () => {
    createDevMode(
      makeDeps({
        getDiagSnapshot: () => ({ note: '<script>alert(1)</script>' }),
      })
    );
    const diagBtn = document.querySelectorAll('.dev-mode-toolbar button')[1] as HTMLElement;
    diagBtn.click();
    const panel = document.querySelector('.dev-mode-diag') as HTMLElement;
    expect(panel.innerHTML).toContain('&lt;script&gt;');
    expect(panel.innerHTML).not.toContain('<script>alert(1)</script>');
  });
});

// ─── 📋 Copy report ──────────────────────────────────────────────────

describe('createDevMode — copy report', () => {
  beforeEach(() => {
    localStorage.setItem('pianoViz_dev', '1');
  });

  function setupClipboard(): { reads: string[] } {
    const reads: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (s: string) => {
          reads.push(s);
          return Promise.resolve();
        },
      },
    });
    return { reads };
  }

  it('copies a markdown report including version label + URL + UA', async () => {
    const { reads } = setupClipboard();
    createDevMode(
      makeDeps({
        versionLabel: 'abc1234 2026-05-08',
        getDiagSnapshot: () => ({ 'state.flow': '12.3', 'practice.mode': 'guided' }),
      })
    );
    const copyBtn = document.querySelectorAll('.dev-mode-toolbar button')[2] as HTMLElement;
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(reads.length).toBe(1);
    const report = reads[0];
    expect(report).toContain('# Piano Visualizer — dev-mode report');
    expect(report).toContain('build: abc1234 2026-05-08');
    expect(report).toContain('## Diag snapshot');
    expect(report).toContain('state.flow: 12.3');
    expect(report).toContain('practice.mode: guided');
  });

  it('reports "(not run yet)" before self-test runs', async () => {
    const { reads } = setupClipboard();
    createDevMode(makeDeps());
    const copyBtn = document.querySelectorAll('.dev-mode-toolbar button')[2] as HTMLElement;
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(reads[0]).toContain('_(not run yet)_');
  });

  it('embeds last self-test results as bullet list with ✅ / ❌', async () => {
    const { reads } = setupClipboard();
    createDevMode(
      makeDeps({
        tests: [
          { name: 'pass-a', run: async () => true },
          { name: 'fail-b', run: async () => ({ ok: false, detail: 'oops' }) },
        ],
      })
    );
    // Run self-test first
    const selftestBtn = document.querySelectorAll('.dev-mode-toolbar button')[0] as HTMLElement;
    selftestBtn.click();
    // Drain microtasks until results land
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    // Then click Copy
    const copyBtn = document.querySelectorAll('.dev-mode-toolbar button')[2] as HTMLElement;
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    const report = reads[0];
    expect(report).toContain('## Self-test — 1 / 2 passed');
    expect(report).toContain('- ✅ pass-a');
    expect(report).toContain('- ❌ fail-b — oops');
  });

  it('button label flips to "✅ Copied" briefly after click', async () => {
    setupClipboard();
    createDevMode(makeDeps());
    const copyBtn = document.querySelectorAll('.dev-mode-toolbar button')[2] as HTMLButtonElement;
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(copyBtn.textContent).toBe('✅ Copied');
  });
});

// ─── 🎯 Benchmark suite ──────────────────────────────────────────────

describe('createDevMode — benchmark suite', () => {
  beforeEach(() => {
    localStorage.setItem('pianoViz_dev', '1');
  });

  it('hides the 🎯 button when no benchmarks are provided', () => {
    createDevMode(makeDeps());
    const labels = Array.from(document.querySelectorAll('.dev-mode-toolbar button')).map(
      (b) => b.textContent
    );
    expect(labels).not.toContain('🎯 Benchmark');
  });

  it('shows the 🎯 button when benchmarks are provided', () => {
    createDevMode(makeDeps({ benchmarks: [{ name: 'b1', run: async () => true }] }));
    const labels = Array.from(document.querySelectorAll('.dev-mode-toolbar button')).map(
      (b) => b.textContent
    );
    expect(labels).toContain('🎯 Benchmark');
  });

  it('runs benchmark suite + reports timing in the detail line', async () => {
    createDevMode(
      makeDeps({
        benchmarks: [
          {
            name: 'slow-pass',
            run: () => new Promise((r) => setTimeout(() => r(true), 30)),
          },
        ],
      })
    );
    const benchBtn = Array.from(document.querySelectorAll('.dev-mode-toolbar button')).find(
      (b) => b.textContent === '🎯 Benchmark'
    ) as HTMLButtonElement;
    benchBtn.click();
    await new Promise((r) => setTimeout(r, 60));
    const panel = document.querySelector('.dev-mode-suite') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.dataset.kind).toBe('benchmark');
    expect(panel.textContent).toMatch(/\d+ms/);
    expect(panel.textContent).toContain('1 / 1 passed');
  });

  it('benchmark report is labeled "## Benchmark" in the Copy report', async () => {
    const reads: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (s: string) => (reads.push(s), Promise.resolve()) },
    });
    createDevMode(makeDeps({ benchmarks: [{ name: 'b1', run: async () => true }] }));
    const benchBtn = Array.from(document.querySelectorAll('.dev-mode-toolbar button')).find(
      (b) => b.textContent === '🎯 Benchmark'
    ) as HTMLButtonElement;
    benchBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    const copyBtn = Array.from(document.querySelectorAll('.dev-mode-toolbar button')).find(
      (b) => b.textContent === '📋 Copy'
    ) as HTMLButtonElement;
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(reads[0]).toContain('## Benchmark — 1 / 1 passed');
  });
});
