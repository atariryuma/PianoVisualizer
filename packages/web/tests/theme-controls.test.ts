// @vitest-environment happy-dom
//
// Tests for packages/web/src/theme-controls.ts.
//
// Build a minimal theme bar DOM (4 dots + syn toggle + lang toggle) and
// assert that the controls module wires click + keyboard interactions,
// persists prefs via savePrefs, and seeds the UI from the initial
// `applyTheme` / `applySynesthesia` calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createThemeControls,
  type ThemeControlsDeps,
  type ThemeControlsPrefs,
  type ThemeControlsStateRef,
} from '../src/theme-controls';

function makeDom(): void {
  document.body.innerHTML = `
    <div class="theme-bar">
      <div class="theme-dot" role="radio" data-theme="0" aria-checked="false"></div>
      <div class="theme-dot" role="radio" data-theme="1" aria-checked="false"></div>
      <div class="theme-dot" role="radio" data-theme="2" aria-checked="false"></div>
      <div class="theme-dot" role="radio" data-theme="3" aria-checked="false"></div>
      <button id="synesthesiaToggle" role="switch" aria-checked="false"></button>
      <button id="langToggleBtn"></button>
    </div>
  `;
}

function makeDeps(overrides: Partial<ThemeControlsDeps> = {}): ThemeControlsDeps {
  const prefs: ThemeControlsPrefs = { theme: 0, synesthesia: false, lang: 'en' };
  const state: ThemeControlsStateRef = { currentTheme: 0, useSynesthesiaMode: false };
  return {
    prefs,
    state,
    savePrefs: vi.fn(),
    t: vi.fn((key: string) => `T(${key})`),
    refreshSettingsPanel: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  makeDom();
});

// ─── applyTheme ──────────────────────────────────────────────────────

describe('createThemeControls — applyTheme', () => {
  it('updates prefs.theme + state.currentTheme', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    controls.applyTheme(2);
    expect(deps.prefs.theme).toBe(2);
    expect(deps.state.currentTheme).toBe(2);
  });

  it('marks the matching theme dot active + others inactive', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    controls.applyTheme(2);
    const dots = document.querySelectorAll('.theme-dot');
    expect(dots[0].classList.contains('active')).toBe(false);
    expect(dots[2].classList.contains('active')).toBe(true);
    expect(dots[2].getAttribute('aria-checked')).toBe('true');
    expect(dots[0].getAttribute('aria-checked')).toBe('false');
  });

  it('does NOT call savePrefs (initial seed path)', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    controls.applyTheme(1);
    expect(deps.savePrefs).not.toHaveBeenCalled();
  });
});

// ─── theme dot listeners ─────────────────────────────────────────────

describe('createThemeControls — theme dot click', () => {
  it('clicking a theme dot updates prefs + persists', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const dot = document.querySelectorAll('.theme-dot')[3] as HTMLElement;
    dot.click();
    expect(deps.prefs.theme).toBe(3);
    expect(deps.savePrefs).toHaveBeenCalledOnce();
  });

  it('Enter on a theme dot activates it', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const dot = document.querySelectorAll('.theme-dot')[2] as HTMLElement;
    dot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(deps.prefs.theme).toBe(2);
    expect(deps.savePrefs).toHaveBeenCalledOnce();
  });

  it('Space on a theme dot activates it (and prevents default scroll)', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const dot = document.querySelectorAll('.theme-dot')[1] as HTMLElement;
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    dot.dispatchEvent(ev);
    expect(deps.prefs.theme).toBe(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Tab on a theme dot does NOT activate it', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const dot = document.querySelectorAll('.theme-dot')[1] as HTMLElement;
    dot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(deps.savePrefs).not.toHaveBeenCalled();
  });
});

// ─── applySynesthesia ────────────────────────────────────────────────

describe('createThemeControls — applySynesthesia', () => {
  it('updates prefs + state + DOM aria-checked', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    controls.applySynesthesia(true);
    expect(deps.prefs.synesthesia).toBe(true);
    expect(deps.state.useSynesthesiaMode).toBe(true);
    const toggle = document.getElementById('synesthesiaToggle') as HTMLElement;
    expect(toggle.classList.contains('active')).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('toggling off clears active class', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    controls.applySynesthesia(true);
    controls.applySynesthesia(false);
    const toggle = document.getElementById('synesthesiaToggle') as HTMLElement;
    expect(toggle.classList.contains('active')).toBe(false);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });
});

// ─── synesthesia toggle listeners ────────────────────────────────────

describe('createThemeControls — syn toggle click', () => {
  it('clicking the toggle flips state + persists', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const toggle = document.getElementById('synesthesiaToggle') as HTMLElement;
    toggle.click();
    expect(deps.prefs.synesthesia).toBe(true);
    expect(deps.state.useSynesthesiaMode).toBe(true);
    expect(deps.savePrefs).toHaveBeenCalledOnce();
    toggle.click();
    expect(deps.prefs.synesthesia).toBe(false);
    expect(deps.savePrefs).toHaveBeenCalledTimes(2);
  });

  it('Enter on the toggle flips state', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const toggle = document.getElementById('synesthesiaToggle') as HTMLElement;
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(deps.prefs.synesthesia).toBe(true);
  });
});

// ─── setLang ─────────────────────────────────────────────────────────

describe('createThemeControls — setLang', () => {
  it('flips lang + persists + syncs <html lang>', () => {
    const deps = makeDeps();
    // Stick a data-i18n element into the doc so applyI18n has work
    // — that way we can prove setLang() called it via the t() spy.
    const tagged = document.createElement('span');
    tagged.setAttribute('data-i18n', 'k');
    document.body.appendChild(tagged);
    const controls = createThemeControls(deps);
    controls.setLang('jp');
    expect(deps.prefs.lang).toBe('jp');
    expect(document.documentElement.lang).toBe('ja');
    expect(deps.savePrefs).toHaveBeenCalledOnce();
    // applyI18n is now called internally — t() invoked once per
    // tagged element confirms the chain.
    expect(deps.t).toHaveBeenCalledWith('k');
  });

  it('flipping back to en sets <html lang> to en', () => {
    const deps = makeDeps({
      prefs: { theme: 0, synesthesia: false, lang: 'jp' },
      state: { currentTheme: 0, useSynesthesiaMode: false },
      savePrefs: vi.fn(),
      t: vi.fn((k: string) => `T(${k})`),
      refreshSettingsPanel: vi.fn(),
    });
    const controls = createThemeControls(deps);
    controls.setLang('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('updates lang toggle button label', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    controls.setLang('jp');
    expect(document.getElementById('langToggleBtn')!.textContent).toContain('日本語');
    controls.setLang('en');
    expect(document.getElementById('langToggleBtn')!.textContent).toContain('EN');
  });
});

// ─── lang toggle listener ────────────────────────────────────────────

describe('createThemeControls — lang toggle click', () => {
  it('clicking the lang toggle flips lang + refreshes settings', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const btn = document.getElementById('langToggleBtn') as HTMLElement;
    btn.click();
    expect(deps.prefs.lang).toBe('jp');
    expect(deps.refreshSettingsPanel).toHaveBeenCalledOnce();
  });

  it('clicking again flips back to en', () => {
    const deps = makeDeps();
    createThemeControls(deps);
    const btn = document.getElementById('langToggleBtn') as HTMLElement;
    btn.click();
    btn.click();
    expect(deps.prefs.lang).toBe('en');
  });
});

// ─── boot-time label seed ────────────────────────────────────────────

describe('createThemeControls — boot seeding', () => {
  it('initial wire-up sets the lang button label from current prefs.lang', () => {
    const deps = makeDeps({
      prefs: { theme: 0, synesthesia: false, lang: 'jp' },
      state: { currentTheme: 0, useSynesthesiaMode: false },
      savePrefs: vi.fn(),
      t: vi.fn((k: string) => `T(${k})`),
      refreshSettingsPanel: vi.fn(),
    });
    createThemeControls(deps);
    expect(document.getElementById('langToggleBtn')!.textContent).toContain('日本語');
  });
});

// ─── applyI18n (Phase 0d batch 62) ─────────────────────────────────

describe('createThemeControls — applyI18n', () => {
  function appendI18nFixture(): {
    elText: HTMLElement;
    elTitle: HTMLElement;
    elPlaceholder: HTMLInputElement;
    elAria: HTMLElement;
    elMulti: HTMLInputElement;
    elNone: HTMLElement;
  } {
    const root = document.createElement('div');
    root.id = 'i18n-fixture';

    const elText = document.createElement('span');
    elText.setAttribute('data-i18n', 'greeting');
    elText.textContent = 'OLD';
    root.appendChild(elText);

    const elTitle = document.createElement('button');
    elTitle.setAttribute('data-i18n-title', 'tipKey');
    root.appendChild(elTitle);

    const elPlaceholder = document.createElement('input');
    elPlaceholder.setAttribute('data-i18n-placeholder', 'phKey');
    root.appendChild(elPlaceholder);

    const elAria = document.createElement('button');
    elAria.setAttribute('data-i18n-aria-label', 'ariaKey');
    root.appendChild(elAria);

    const elMulti = document.createElement('input');
    elMulti.setAttribute('data-i18n', 'multiText');
    elMulti.setAttribute('data-i18n-placeholder', 'multiPh');
    root.appendChild(elMulti);

    const elNone = document.createElement('span');
    elNone.textContent = 'untouched';
    root.appendChild(elNone);

    document.body.appendChild(root);
    return { elText, elTitle, elPlaceholder, elAria, elMulti, elNone };
  }

  it('writes textContent for [data-i18n]', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.applyI18n();
    expect(fx.elText.textContent).toBe('T(greeting)');
  });

  it('writes title for [data-i18n-title]', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.applyI18n();
    expect(fx.elTitle.title).toBe('T(tipKey)');
  });

  it('writes placeholder for [data-i18n-placeholder]', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.applyI18n();
    expect(fx.elPlaceholder.placeholder).toBe('T(phKey)');
  });

  it('writes aria-label for [data-i18n-aria-label]', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.applyI18n();
    expect(fx.elAria.getAttribute('aria-label')).toBe('T(ariaKey)');
  });

  it('handles multiple data-i18n* on the same element', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.applyI18n();
    expect(fx.elMulti.textContent).toBe('T(multiText)');
    expect(fx.elMulti.placeholder).toBe('T(multiPh)');
  });

  it('does not touch elements without any data-i18n*', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.applyI18n();
    expect(fx.elNone.textContent).toBe('untouched');
  });

  it('dispatches a langchange CustomEvent on window', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const listener = vi.fn();
    window.addEventListener('langchange', listener);
    controls.applyI18n();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('langchange', listener);
  });

  it('reads t() fresh per call (lang flip between calls picked up)', () => {
    let lang: 'en' | 'jp' = 'en';
    const tFn = vi.fn((k: string) => (lang === 'jp' ? `JP(${k})` : `EN(${k})`));
    const deps = makeDeps({ t: tFn });
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.applyI18n();
    expect(fx.elText.textContent).toBe('EN(greeting)');
    lang = 'jp';
    controls.applyI18n();
    expect(fx.elText.textContent).toBe('JP(greeting)');
  });

  it('setLang() invokes applyI18n internally', () => {
    const deps = makeDeps();
    const controls = createThemeControls(deps);
    const fx = appendI18nFixture();
    controls.setLang('jp');
    expect(fx.elText.textContent).toBe('T(greeting)');
  });
});
