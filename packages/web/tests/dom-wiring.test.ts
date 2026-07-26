// DOM wiring audit — a source-level guard against silently dead controls.
//
// Why this exists as a test rather than a convention:
//
// Adding one control to this app touches five places — index.html, the
// `DomBag` interface, `DOM_BAG_IDS`, the consuming module's own `*Dom`
// interface, and the wiring at the `createXxx({ dom: ... })` call site. Miss
// the fifth and NOTHING complains: the module's field is optional, the read is
// `deps.dom.x?.addEventListener(...)`, and ~29 call sites still end in
// `} as any)` which disables deps type-checking outright. The control compiles,
// ships, passes every unit test, and is simply inert on the device.
//
// That is not hypothetical. When this test was written it immediately found
// two live instances: the judgement-strictness segment (added and never
// wired), and `resExtra` / `resExtraRow` — meaning the "よけいな音 n" row
// documented in CLAUDE.md had never once rendered.
//
// The check: for every `createXxx` call site that builds a DOM bag, compare
// the keys it PROVIDES against the fields the target module DECLARES and
// READS. Anything read-but-never-provided is dead.
//
// A call site that spreads the whole bag (`{ ...DOM, ... }`) is exempt: it
// provides everything by construction, which is precisely why spreading is the
// preferred shape.

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readSrc, readPkg, balancedBody } from './support/source';

const SRC = join(__dirname, '..', 'src');

const sourceFiles = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
const sources = new Map(sourceFiles.map((f) => [f.replace(/\.ts$/, ''), readSrc(f)]));
const shellFiles = sourceFiles.filter((f) => f.startsWith('shell-'));

interface Site {
  callSite: string;
  factory: string;
  module: string;
  /** DOM keys the call site hands over. */
  provided: Set<string>;
  /** DOM fields the module declares in its `*Dom` interface AND reads. */
  used: Set<string>;
}

/** Fields a module declares in its exported `*Dom` interface. */
function declaredDomFields(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/export interface \w*Dom \{([\s\S]*?)\n\}/g)) {
    for (const f of m[1].matchAll(/^\s*(\w+)\??:/gm)) out.add(f[1]);
  }
  return out;
}

/** DOM fields a module actually dereferences. */
function readDomFields(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?:deps\.dom|\bdom)\.(\w+)/g)) out.add(m[1]);
  return out;
}

/** Body of the object literal that follows `label` — brace-matched via the
 *  shared helper, so it works for both single-line and multi-line literals. A
 *  regex kept mis-reading single-line ones and inventing missing keys. */
function objectLiteralAfter(src: string, label: string): string | null {
  const at = src.indexOf(label);
  if (at < 0) return null;
  return balancedBody(src, at + label.length);
}

/** Keys assigned at the top level of an object-literal body. */
function topLevelKeys(body: string): Set<string> {
  const out = new Set<string>();
  let depth = 0;
  let expectKey = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) expectKey = true;
    else if (depth === 0 && expectKey && /[A-Za-z_$]/.test(ch)) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i));
      if (m) out.add(m[1]);
      expectKey = false;
    }
  }
  return out;
}

/** Locate the module that exports `createFactory`. */
function moduleFor(factory: string): [string, string] | null {
  for (const [name, src] of sources) {
    if (src.includes(`export function create${factory}`)) return [name, src];
  }
  return null;
}

function collectSites(): Site[] {
  const sites: Site[] = [];
  for (const file of shellFiles) {
    const src = readSrc(file);
    for (const call of src.matchAll(
      /\.create(\w+)\(\{([\s\S]{0,6000}?)\n {2}\}\s*(?:as any\s*)?\)/g
    )) {
      const factory = call[1];
      const body = call[2];

      let provided: Set<string> | null = null;
      const pick = body.match(/dom:\s*DomBag\.pickDom\(\s*\w+,([\s\S]*?)\)(?:\s*as [^,\n]*)?,/);
      if (pick) {
        provided = new Set([...pick[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
      } else {
        const inner = objectLiteralAfter(body, 'dom:');
        if (inner == null) continue;
        // `...DOM` provides everything — exempt.
        if (inner.includes('...')) continue;
        provided = topLevelKeys(inner);
      }
      if (!provided) continue;

      const target = moduleFor(factory);
      if (!target) continue;
      const [name, modSrc] = target;
      const used = new Set(
        [...readDomFields(modSrc)].filter((f) => declaredDomFields(modSrc).has(f))
      );
      sites.push({ callSite: file, factory, module: name, provided, used });
    }
  }
  return sites;
}

describe('DOM wiring audit', () => {
  const sites = collectSites();

  it('finds call sites to audit (guards the audit itself against silent decay)', () => {
    // If a refactor changes the call-site shape this test must fail loudly
    // rather than pass by matching nothing.
    expect(sites.length).toBeGreaterThanOrEqual(5);
  });

  it('every DOM field a module reads is provided by its call site', () => {
    const dead: string[] = [];
    for (const s of sites) {
      const missing = [...s.used].filter((f) => !s.provided.has(f)).sort();
      if (missing.length) {
        dead.push(
          `${s.callSite} → create${s.factory} (${s.module}.ts) never provides: ${missing.join(', ')}`
        );
      }
    }
    // A failure here means a control is inert on device. Wire it at the call
    // site, or spread the bag (`{ ...DOM, ...overrides }`) so the whole class
    // of omission becomes impossible for that module.
    expect(dead).toEqual([]);
  });

  it('every id the DOM bag declares exists in index.html', () => {
    const bag = readSrc('dom-bag.ts');
    const html = readPkg('index.html');
    const block = bag.match(/DOM_BAG_IDS[\s\S]*?Object\.freeze\(\[([\s\S]*?)\]\s*as const\)/);
    expect(block).not.toBeNull();
    const ids = [...(block as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id) => !html.includes(`id="${id}"`))).toEqual([]);
  });
});
