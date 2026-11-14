// The practice top bar must be able to use the whole screen width.
//
// An absolutely positioned box with `left: 50%` is shrink-to-fit inside the
// remaining half of its container, so with `left: 50%; transform:
// translateX(-50%)` the pill wrapped at half the screen whatever max-width said.
// That fits on a 12.9" iPad and drops the ✕ to a second row on an iPad mini.
// happy-dom does no layout, so this pins the rule at source level.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '..', 'src', 'app.css'), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `rule ${selector} not found`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('\n}', start));
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('#practiceTopBar centring', () => {
  const body = ruleBody('#practiceTopBar');

  it('does not centre with left: 50%, which caps the pill at half the screen', () => {
    expect(body).not.toMatch(/left:\s*50%/);
    expect(body).not.toMatch(/translateX\(-50%\)/);
  });

  it('centres with auto margins across the full width', () => {
    expect(body).toMatch(/left:\s*0;/);
    expect(body).toMatch(/right:\s*0;/);
    expect(body).toMatch(/margin-inline:\s*auto;/);
    expect(body).toMatch(/width:\s*fit-content;/);
  });
});

// Centring an overflowing flex column with `justify-content: center` pushes its
// top above the box, where no scroll can reach it: the title slid under the
// status bar on an iPad mini and on a portrait iPhone.
describe('#startScreen overflow', () => {
  const body = ruleBody('#startScreen');

  it('scrolls instead of clipping when the content is taller than the screen', () => {
    expect(body).toMatch(/justify-content:\s*flex-start;/);
    expect(body).toMatch(/overflow-y:\s*auto;/);
    expect(body).toMatch(/touch-action:\s*pan-y;/);
    expect(body).toMatch(/var\(--safe-top\)/);
  });

  it('centres with auto margins, which collapse when there is no room', () => {
    expect(ruleBody('#startScreen h1')).toMatch(/margin-top:\s*auto;/);
    expect(ruleBody('#startScreen::after')).toMatch(/margin-top:\s*auto;/);
  });
});
