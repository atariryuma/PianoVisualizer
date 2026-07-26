// Shared support for the source-level audits in this directory.
//
// Three tests read `packages/web/src` as TEXT and assert a property the type
// checker cannot express: `dom-wiring` (every DOM field a module reads is
// provided at its call site), `corner-stack` (layout rows derive from tokens
// instead of literals), and `startup-contract` (the play screen does not wait on
// a device open). Each had grown its own copy of "read the file" and "strip the
// comments so prose about `await` isn't mistaken for code".
//
// Keeping the parsing here also keeps the reason for it in one place: these are
// stopgaps for contracts with no runtime seam, and each should be deleted as
// soon as the property becomes observable at runtime.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

/** Read a file from packages/web/src. */
export function readSrc(file: string): string {
  return readFileSync(join(SRC, file), 'utf8');
}

/** Read a file from packages/web (e.g. `index.html`). */
export function readPkg(file: string): string {
  return readFileSync(join(SRC, '..', file), 'utf8');
}

/** Strip block comments — the only comment form CSS has. */
export function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Strip both comment forms, for TypeScript sources. */
export function stripComments(src: string): string {
  return stripBlockComments(src).replace(/^\s*\/\/.*$/gm, '');
}

/**
 * The `{ … }` body that starts at or after `from`, brace-matched.
 *
 * Brace matching rather than a regex because a pattern that mis-parses silently
 * is worse than no test — an earlier regex version of the DOM audit invented
 * missing keys on single-line literals and reported them as dead controls.
 */
export function balancedBody(src: string, from: number): string | null {
  const open = src.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}
