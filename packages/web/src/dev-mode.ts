// Developer mode — Phase 0d batch 12.
//
// In-app testing harness that runs on the actual device (iPad / Android /
// Desktop) without an external test runner. Three pieces:
//
//   1. Activation — `?dev=1` URL param, persisted via localStorage, with
//      `?dev=0` to clear. Optional 5-tap gesture on a target element
//      (typically the title) toggles the persistent flag without typing
//      a URL.
//
//   2. Self-test — runs a sequenced suite of tests against the live app:
//      DOM bag completeness, module wire-up presence, localStorage
//      round-trip, i18n key availability, AudioContext create/close,
//      Web MIDI presence detection. Each test returns `{ ok, detail? }`
//      and the panel renders green/red pills with the test name.
//
//   3. Diag panel — read-only state snapshot. Refreshed at 1Hz. Shows
//      audioCtx state / sampleRate, midiInput.port?.name, practice.*
//      flags, state.flow / combo / currentStage / qualityScore, prefs.
//
// Activation is opt-in and the UI is hidden by default — production
// users never see it.

const DEV_FLAG_KEY = 'pianoViz_dev';
const DEV_5TAP_WINDOW_MS = 2000;
const DEV_5TAP_COUNT = 5;

/** A single self-test result. */
export interface SelfTestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

/** A test definition. The runner awaits the function and catches throws
 *  so a failing test doesn't kill the whole suite. */
export interface SelfTest {
  name: string;
  run: () => Promise<{ ok: boolean; detail?: string } | boolean>;
}

/** Read-only diag snapshot keys → string values. The panel just renders
 *  them as a definition list. */
export type DiagSnapshot = Record<string, string>;

export interface DevModeDeps {
  /** Optional element the 5-tap gesture binds to. Pass null to disable
   *  the gesture (URL is still the way in). */
  triggerEl: HTMLElement | null;
  /** Where to inject the dev-mode toolbar. Defaults to document.body. */
  containerEl?: HTMLElement;
  /** Tests to run when the user taps the 🧪 button. Order is preserved. */
  tests: SelfTest[];
  /** Snapshot probe — called at 1Hz when the diag panel is open. */
  getDiagSnapshot: () => DiagSnapshot;
}

export interface DevMode {
  /** True when activation flag is set (URL or localStorage). */
  isEnabled(): boolean;
  /** Unmount the panel + remove gesture listener. Used by tests. */
  destroy(): void;
}

/** Read activation state from URL + localStorage. URL params override
 *  the persisted flag — `?dev=0` always wins for that page load and
 *  also clears the flag. Pure: no DOM mutation. */
export function readDevModeFlag(
  search: string = (typeof window !== 'undefined' && window.location?.search) || '',
  storage: {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
  } | null = typeof localStorage !== 'undefined' ? localStorage : null
): boolean {
  const params = new URLSearchParams(search);
  const dev = params.get('dev');
  if (dev === '1') {
    storage?.setItem(DEV_FLAG_KEY, '1');
    return true;
  }
  if (dev === '0') {
    storage?.removeItem(DEV_FLAG_KEY);
    return false;
  }
  return storage?.getItem(DEV_FLAG_KEY) === '1';
}

/** Wire dev mode. Mounts a fixed-position toolbar in the top-right
 *  corner (only when activated). Returns the controller; call
 *  `destroy()` from tests to clean up. */
export function createDevMode(deps: DevModeDeps): DevMode {
  const enabled = readDevModeFlag();
  const container = deps.containerEl ?? document.body;

  // Always wire the 5-tap gesture (so a non-dev user can opt-in by
  // tapping the title — but they have to know the gesture exists).
  let tapTimes: number[] = [];
  const onTap = (): void => {
    const now = performance.now();
    tapTimes = tapTimes.filter((t) => now - t < DEV_5TAP_WINDOW_MS);
    tapTimes.push(now);
    if (tapTimes.length >= DEV_5TAP_COUNT) {
      tapTimes = [];
      const cur = localStorage.getItem(DEV_FLAG_KEY) === '1';
      if (cur) {
        localStorage.removeItem(DEV_FLAG_KEY);
        alert('Dev mode disabled');
      } else {
        localStorage.setItem(DEV_FLAG_KEY, '1');
        alert('Dev mode enabled — reload the page to see the toolbar');
      }
    }
  };
  deps.triggerEl?.addEventListener('click', onTap);

  if (!enabled) {
    return {
      isEnabled: () => false,
      destroy: () => {
        deps.triggerEl?.removeEventListener('click', onTap);
      },
    };
  }

  // ─── toolbar ─────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'dev-mode-toolbar';
  toolbar.setAttribute('aria-label', 'Developer toolbar');
  toolbar.style.cssText = [
    'position:fixed',
    'top:8px',
    'right:8px',
    'z-index:99999',
    'display:flex',
    'gap:6px',
    'font:12px/1 system-ui, sans-serif',
    'pointer-events:auto',
  ].join(';');

  const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = [
      'padding:6px 10px',
      'background:rgba(20,20,30,0.85)',
      'color:#fff',
      'border:1px solid rgba(255,255,255,0.25)',
      'border-radius:6px',
      'cursor:pointer',
      'backdrop-filter:blur(4px)',
    ].join(';');
    btn.addEventListener('click', onClick);
    return btn;
  };

  const selftestBtn = mkBtn('🧪 Self-test', () => void runSelfTest());
  const diagBtn = mkBtn('📊 Diag', () => toggleDiag());
  const closeBtn = mkBtn('✕', () => {
    localStorage.removeItem(DEV_FLAG_KEY);
    panel?.remove();
    diagPanel?.remove();
    toolbar.remove();
  });
  closeBtn.title = 'Disable dev mode (also clears the localStorage flag)';
  toolbar.append(selftestBtn, diagBtn, closeBtn);
  container.appendChild(toolbar);

  // ─── self-test panel ─────────────────────────────────────────────
  let panel: HTMLDivElement | null = null;
  let running = false;

  async function runSelfTest(): Promise<void> {
    if (running) return;
    running = true;
    selftestBtn.disabled = true;
    selftestBtn.textContent = '🧪 Running…';

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'dev-mode-selftest';
      panel.style.cssText = [
        'position:fixed',
        'top:48px',
        'right:8px',
        'max-width:360px',
        'max-height:60vh',
        'overflow:auto',
        'padding:10px 12px',
        'background:rgba(15,15,25,0.94)',
        'color:#fff',
        'border:1px solid rgba(255,255,255,0.18)',
        'border-radius:8px',
        'z-index:99998',
        'font:12px/1.45 system-ui, sans-serif',
        'backdrop-filter:blur(6px)',
        'pointer-events:auto',
      ].join(';');
      container.appendChild(panel);
    }
    panel.innerHTML = '';

    const results: SelfTestResult[] = [];
    for (const test of deps.tests) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;padding:4px 0;align-items:flex-start';
      row.innerHTML =
        '<span style="color:#aaa;width:14px">⏳</span>' +
        '<span style="flex:1">' +
        escapeHtml(test.name) +
        '</span>';
      panel.appendChild(row);

      let ok = false;
      let detail: string | undefined;
      try {
        const r = await test.run();
        if (typeof r === 'boolean') {
          ok = r;
        } else {
          ok = !!r?.ok;
          detail = r?.detail;
        }
      } catch (e) {
        ok = false;
        detail = (e as Error)?.message || String(e);
      }
      results.push({ name: test.name, ok, detail });

      const icon = ok ? '✅' : '❌';
      const detailHtml = detail
        ? '<div style="color:#aaa;font-size:11px;margin-top:2px">' + escapeHtml(detail) + '</div>'
        : '';
      row.innerHTML =
        '<span style="width:14px">' +
        icon +
        '</span>' +
        '<div style="flex:1"><div>' +
        escapeHtml(test.name) +
        '</div>' +
        detailHtml +
        '</div>';
    }

    const passed = results.filter((r) => r.ok).length;
    const summary = document.createElement('div');
    summary.style.cssText =
      'margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.12);font-weight:600';
    summary.textContent = `${passed} / ${results.length} passed`;
    summary.style.color = passed === results.length ? '#7eff8a' : '#ff8a9a';
    panel.appendChild(summary);

    selftestBtn.disabled = false;
    selftestBtn.textContent = '🧪 Self-test';
    running = false;
  }

  // ─── diag panel ──────────────────────────────────────────────────
  let diagPanel: HTMLDivElement | null = null;
  let diagInterval: ReturnType<typeof setInterval> | null = null;

  function toggleDiag(): void {
    if (diagPanel) {
      diagPanel.remove();
      diagPanel = null;
      if (diagInterval) {
        clearInterval(diagInterval);
        diagInterval = null;
      }
      return;
    }
    diagPanel = document.createElement('div');
    diagPanel.className = 'dev-mode-diag';
    diagPanel.style.cssText = [
      'position:fixed',
      'top:48px',
      'left:8px',
      'max-width:340px',
      'max-height:70vh',
      'overflow:auto',
      'padding:10px 12px',
      'background:rgba(15,15,25,0.94)',
      'color:#fff',
      'border:1px solid rgba(255,255,255,0.18)',
      'border-radius:8px',
      'z-index:99998',
      'font:11px/1.4 ui-monospace, monospace',
      'backdrop-filter:blur(6px)',
      'pointer-events:auto',
    ].join(';');
    container.appendChild(diagPanel);
    const refresh = (): void => {
      if (!diagPanel) return;
      const snap = deps.getDiagSnapshot();
      diagPanel.innerHTML =
        '<div style="font-weight:600;margin-bottom:6px;font-family:system-ui">📊 Diag</div>' +
        Object.entries(snap)
          .map(
            ([k, v]) =>
              '<div style="display:flex;gap:8px;padding:1px 0">' +
              '<span style="color:#aaa;min-width:120px">' +
              escapeHtml(k) +
              '</span>' +
              '<span style="flex:1;word-break:break-all">' +
              escapeHtml(v) +
              '</span></div>'
          )
          .join('');
    };
    refresh();
    diagInterval = setInterval(refresh, 1000);
  }

  return {
    isEnabled: () => true,
    destroy: () => {
      deps.triggerEl?.removeEventListener('click', onTap);
      panel?.remove();
      diagPanel?.remove();
      toolbar.remove();
      if (diagInterval) clearInterval(diagInterval);
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}
