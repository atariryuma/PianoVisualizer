// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFirstRunWelcome, type FirstRunWelcomeDeps } from '../src/first-run-welcome';

function makeDeps(over: Partial<FirstRunWelcomeDeps> = {}): FirstRunWelcomeDeps {
  document.body.innerHTML = '<div id="firstRunWelcome" hidden></div>';
  return {
    container: document.getElementById('firstRunWelcome') as HTMLElement,
    t: vi.fn((k, vars) => (vars ? `${k}{${JSON.stringify(vars)}}` : k)),
    shouldShow: () => true,
    recommended: () => ({ id: 'fur_elise', titleKey: 'furElise' }),
    selectSong: vi.fn(),
    openPianistEditor: vi.fn(),
    persistDismissed: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createFirstRunWelcome', () => {
  it('shows the card with title/body + all three actions on a cold start', () => {
    const deps = makeDeps();
    createFirstRunWelcome(deps).refresh();
    expect(deps.container.hidden).toBe(false);
    expect(deps.container.querySelector('.first-run-title')!.textContent).toBe('welcomeTitle');
    expect(deps.container.querySelector('.first-run-body')!.textContent).toBe('welcomeBody');
    expect(deps.container.querySelector('.first-run-start')).not.toBeNull();
    expect(deps.container.querySelector('.first-run-setname')).not.toBeNull();
    expect(deps.container.querySelector('.first-run-dismiss')).not.toBeNull();
  });

  it('the start CTA carries the recommended song title and selects it (dismissing)', () => {
    const deps = makeDeps();
    createFirstRunWelcome(deps).refresh();
    const start = deps.container.querySelector('.first-run-start') as HTMLElement;
    expect(start.textContent).toContain('furElise');
    start.click();
    expect(deps.persistDismissed).toHaveBeenCalled();
    expect(deps.selectSong).toHaveBeenCalledWith('fur_elise');
    expect(deps.container.hidden).toBe(true);
  });

  it('the set-name button opens the pianist editor WITHOUT dismissing', () => {
    const deps = makeDeps();
    createFirstRunWelcome(deps).refresh();
    (deps.container.querySelector('.first-run-setname') as HTMLElement).click();
    expect(deps.openPianistEditor).toHaveBeenCalled();
    expect(deps.persistDismissed).not.toHaveBeenCalled();
    expect(deps.container.hidden).toBe(false);
  });

  it('dismiss persists the flag and hides the card', () => {
    const deps = makeDeps();
    createFirstRunWelcome(deps).refresh();
    (deps.container.querySelector('.first-run-dismiss') as HTMLElement).click();
    expect(deps.persistDismissed).toHaveBeenCalled();
    expect(deps.container.hidden).toBe(true);
  });

  it('stays hidden (and empty) when shouldShow is false', () => {
    const deps = makeDeps({ shouldShow: () => false });
    createFirstRunWelcome(deps).refresh();
    expect(deps.container.hidden).toBe(true);
    expect(deps.container.innerHTML).toBe('');
  });

  it('hides a previously-shown card once shouldShow flips to false', () => {
    let show = true;
    const deps = makeDeps({ shouldShow: () => show });
    const w = createFirstRunWelcome(deps);
    w.refresh();
    expect(deps.container.hidden).toBe(false);
    show = false;
    w.refresh();
    expect(deps.container.hidden).toBe(true);
  });

  it('degrades to no start button when no song is recommended', () => {
    const deps = makeDeps({ recommended: () => null });
    createFirstRunWelcome(deps).refresh();
    expect(deps.container.hidden).toBe(false);
    expect(deps.container.querySelector('.first-run-start')).toBeNull();
    expect(deps.container.querySelector('.first-run-setname')).not.toBeNull();
  });
});
