// Layout contracts in app.css that the cascade cannot express, and that broke
// silently on device when a neighbouring size changed: the top-right corner
// stack, and the slider's hit area.
//
// Why this exists:
//
// Four fixed-position elements share the top-right band (the ⚙/🏠 bar, the
// free-play timer, the quest dots, and the centered coaching read-out). Nothing
// in CSS relates them — each one was positioned by a hand-computed
// `max(Npx, calc(var(--safe-top) + Mpx))` pair with the bar's height baked into
// the number. So when the ⚙/🏠 buttons grew from 32 px to the 44 px touch-target
// floor, the bar's bottom edge moved down THROUGH the two rows below it: the
// timer rendered inside the 🏠 button, and the coaching read-out sat in the
// bar's band. Every test passed; the layout was simply wrong on device.
//
// The fix was to derive each row from the row above it (`--stack-row1..4` in
// :root). This test pins that shape: the row elements must position themselves
// from the tokens, never from a literal offset. A literal is how the contract
// broke, so a literal is what fails here.

import { describe, it, expect } from 'vitest';
import { readSrc, stripBlockComments, balancedBody } from './support/source';

/** CSS with every comment stripped, so a `{` or `top:` inside prose can't be
 *  mistaken for a declaration. A regex over raw CSS kept doing exactly that. */
const bare = stripBlockComments(readSrc('app.css'));

/** Declarations of the first rule whose selector LIST contains `selector`.
 *  Brace-matched rather than regex-delimited (the same reason
 *  dom-wiring.test.ts matches braces: a pattern that mis-parses silently is
 *  worse than no test). Matching anywhere in the list, not just at its head,
 *  is what lets a control share one rule with the others that need it —
 *  otherwise the audit would push each contract back into its own rule, which
 *  is the duplication it exists to prevent. */
function ruleBody(selector: string): string {
  const re = new RegExp(
    '(?:^|[};,])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(?=[,{])'
  );
  const m = re.exec(bare);
  expect(m, 'no rule found for ' + selector).not.toBeNull();
  const body = balancedBody(bare, (m as RegExpExecArray).index);
  expect(body, 'unbalanced braces after ' + selector).not.toBeNull();
  return body as string;
}

/** The `top:` value declared in a rule body. */
function topOf(selector: string): string {
  const body = ruleBody(selector);
  const m = /(^|;)\s*top\s*:\s*([^;]+)/.exec(body);
  expect(m, selector + ' declares no top').not.toBeNull();
  return (m as RegExpExecArray)[2].trim();
}

describe('top-right corner stack', () => {
  it('defines every row as a token derived from the row above', () => {
    const root = ruleBody(':root');
    // row1 is the anchor (bar top, safe-area aware); rows 2-4 must each be
    // expressed in terms of the previous row, so a size change propagates.
    expect(root).toMatch(/--stack-row1:\s*max\(/);
    expect(root).toMatch(/--stack-row2:\s*calc\([^;]*var\(--stack-row1\)/);
    expect(root).toMatch(/--stack-row3:\s*calc\([^;]*var\(--stack-row2\)/);
    expect(root).toMatch(/--stack-row4:\s*calc\([^;]*var\(--stack-row3\)/);
  });

  it('row 2 clears the bar by its ACTUAL height, not a baked-in number', () => {
    // The regression: the bar's height was written as a literal 32 in every
    // downstream offset. It must read the same token the buttons are sized from.
    const root = ruleBody(':root');
    expect(root).toMatch(/--stack-row2:\s*calc\([^;]*var\(--tap-min\)/);
    expect(ruleBody('#settingsBtn')).toContain('var(--tap-min)');
    expect(ruleBody('#homeBtn')).toContain('var(--tap-min)');
  });

  it('every stacked element positions itself from a row token', () => {
    // #qualityScore is centered horizontally but still shares the bar's
    // vertical band, so it is part of the same contract.
    expect(topOf('#themeBar')).toBe('var(--stack-row1)');
    expect(topOf('#playTime')).toBe('var(--stack-row2)');
    expect(topOf('#questDisplay')).toBe('var(--stack-row3)');
    expect(topOf('#qualityScore')).toBe('var(--stack-row2)');
  });

  it('no stacked element hardcodes a pixel offset', () => {
    for (const sel of ['#themeBar', '#playTime', '#questDisplay', '#qualityScore']) {
      expect(topOf(sel), sel + ' hardcodes its top — derive it from a row token').not.toMatch(
        /\d+px/
      );
    }
  });

  it('the slider is painted by us, with no native range chrome left', () => {
    // Keeping the native chrome while driving the gesture ourselves is what
    // made this control take so many attempts: it forced the code to guess
    // where the browser had painted the thumb, and every mismatch read as "I
    // tapped where I meant and nothing moved". The thumb is now positioned by
    // the same expression the hit-test uses.
    expect(ruleBody('.slider-wrap')).toMatch(/position:\s*relative/);
    expect(ruleBody('.slider-wrap')).toMatch(/height:\s*var\(--tap-min\)/);
    expect(ruleBody('.slider-track')).toMatch(/position:\s*absolute/);
    expect(ruleBody('.slider-thumb')).toMatch(/position:\s*absolute/);
    // The input is the value model only: invisible, and out of hit-testing.
    // Scoped to `.slider-wrap >` — that wrapper only exists once installSlider
    // has run, so a range the installer never reached still shows its native
    // chrome and works, instead of being invisible AND inert.
    const input = ruleBody('.slider-wrap > .settings-slider');
    expect(input).toMatch(/opacity:\s*0/);
    expect(input).toMatch(/pointer-events:\s*none/);
    expect(bare, 'an unscoped hide would blank an un-upgraded slider').not.toMatch(
      /(^|[,}])\s*\.settings-slider\s*\{/
    );
    // No hand-built native pseudo-elements may come back.
    expect(bare).not.toMatch(/\.settings-slider::(-webkit-slider|-moz-range)/);
    // The thumb's diameter has ONE source — slider-control.ts, published onto
    // the wrap as `--thumb-px`. A stylesheet copy would let the paint and the
    // hit-test drift apart, which is the exact failure this control already had.
    const thumb = ruleBody('.slider-thumb');
    expect(thumb, 'size must read the token').toMatch(/width:\s*var\(--thumb-px/);
    expect(thumb, 'the centring offset is derived from it too').toMatch(
      /margin:\s*calc\(var\(--thumb-px/
    );
  });

  it('hit-area expansion is ONE mechanism, not a per-control inset', () => {
    // 44 px is the HIG floor, and a floor is not enough for a control whose
    // visual is a 6 px line: the device trace caught presses landing on the
    // "100 %" read-out in the row above, with nothing under them. The expander
    // must take no layout space, or the rows shift.
    //
    // The slider used to carry its own `inset: -12px 0`, a magic number that
    // referenced --tap-min not at all — so the file's claim that the floor is
    // stated exactly once stopped being true for the newest control. Both
    // adopters now share one rule and express their overshoot as a token.
    const before = ruleBody('.tap-bleed::before');
    expect(before).toMatch(/position:\s*absolute/);
    expect(before, 'the floor comes from the token, not a literal').toMatch(/var\(--tap-min\)/);
    expect(before, 'overshoot is a per-adopter token').toMatch(/var\(--tap-bleed/);
    // …and both controls that need it are ON that rule.
    expect(bare).toMatch(/\.tap-bleed::before,[\s\S]{0,120}\.slider-wrap::before\s*\{/);
    expect(bare).toMatch(/\.tap-bleed::before,[\s\S]{0,120}\.opt-toggle::before[\s\S]{0,60}\{/);
    // No second hand-written expander may come back.
    expect(bare, 'a negative-inset ::before is the old per-control form').not.toMatch(
      /::before\s*\{[^}]*inset:\s*-/
    );
  });

  it('a press is acknowledged, so a miss is distinguishable from a hit', () => {
    expect(ruleBody('.slider-wrap.is-dragging .slider-thumb')).toMatch(/transform:\s*scale/);
  });

  it('the gesture surface is in the "JS owns the gesture" touch-action tier', () => {
    // `manipulation` still permits panning, so a JS-driven drag inside a
    // `pan-y` scroller gets ceded to the scroll mid-gesture: a tap works and a
    // drag does not.
    expect(bare).toMatch(
      /#canvas,\s*\.slider-wrap,\s*#calibrateBtn\.is-tapping\s*\{\s*touch-action:\s*none/
    );
  });

  it('the timer declares the line box row 3 is told to clear', () => {
    // --stack-row3 adds --stack-row2-h to skip past #playTime. If the timer's
    // own line box is not that height, row 3 either overlaps it or leaves a gap.
    expect(ruleBody('#playTime')).toMatch(/line-height:\s*var\(--stack-row2-h\)/);
  });
});
