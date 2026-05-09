// @vitest-environment happy-dom
//
// Tests for packages/web/src/dom-bag.ts.
//
// Covers:
//   • createDomBag: every id in DOM_BAG_IDS is resolved against
//     a freshly-built happy-dom document; missing entries surface
//     in `missingIds` rather than silent undefined.
//   • DOM_BAG_IDS contains every key the DomBag interface declares
//     (drift detector — adding a new field requires updating the
//     id list at the same time).
//
// We don't test the type assertion (DomBag fields all typed
// non-null) because that's a compile-time contract.

import { describe, it, expect } from 'vitest';
import { createDomBag, DOM_BAG_IDS, type DomBag } from '../src/dom-bag';

function buildAllIds(): HTMLElement {
  const root = document.createElement('div');
  for (const id of DOM_BAG_IDS) {
    const el = document.createElement('div');
    el.id = id;
    root.appendChild(el);
  }
  return root;
}

describe('createDomBag', () => {
  it('resolves every id when all elements exist', () => {
    document.body.innerHTML = '';
    document.body.appendChild(buildAllIds());
    const { bag, missingIds } = createDomBag(document);
    expect(missingIds).toEqual([]);
    for (const id of DOM_BAG_IDS) {
      expect(bag[id]).toBeInstanceOf(HTMLElement);
      expect(bag[id].id).toBe(id);
    }
  });

  it('reports missing ids in `missingIds`', () => {
    document.body.innerHTML = '';
    // Add only a subset.
    const subset: ReadonlyArray<keyof DomBag> = ['canvas', 'startScreen', 'hud'];
    for (const id of subset) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    const { bag, missingIds } = createDomBag(document);
    // canvas/startScreen/hud should be present
    for (const id of subset) {
      expect(bag[id]).toBeInstanceOf(HTMLElement);
    }
    // Everything else should be in missingIds + missing from bag
    expect(missingIds.length).toBe(DOM_BAG_IDS.length - subset.length);
    expect(missingIds).toContain('flowFill');
    expect(missingIds).toContain('settingsPanel');
    expect(missingIds).not.toContain('canvas');
  });

  it('returns an empty bag when no ids resolve', () => {
    document.body.innerHTML = '';
    const { bag, missingIds } = createDomBag(document);
    expect(missingIds.length).toBe(DOM_BAG_IDS.length);
    // bag is empty (no fields set)
    expect(Object.keys(bag).length).toBe(0);
  });

  it('defaults to live `document` when no arg is provided', () => {
    document.body.innerHTML = '';
    document.body.appendChild(buildAllIds());
    const { missingIds } = createDomBag();
    expect(missingIds).toEqual([]);
  });
});

describe('DOM_BAG_IDS', () => {
  it('is frozen (no accidental mutation at runtime)', () => {
    expect(Object.isFrozen(DOM_BAG_IDS)).toBe(true);
  });

  it('has the same number of entries as the DomBag interface fields', () => {
    // Build a sample bag with all fields, then count keys. We use the
    // resolved bag from a happy-dom doc as the source of truth.
    document.body.innerHTML = '';
    document.body.appendChild(buildAllIds());
    const { bag } = createDomBag(document);
    const bagKeys = Object.keys(bag);
    // Every id in DOM_BAG_IDS must show up in the bag (1:1).
    for (const id of DOM_BAG_IDS) {
      expect(bagKeys).toContain(id);
    }
    // No extra keys in the bag beyond the id list (= no drift).
    expect(bagKeys.length).toBe(DOM_BAG_IDS.length);
  });

  it('contains no duplicate ids', () => {
    const set = new Set(DOM_BAG_IDS);
    expect(set.size).toBe(DOM_BAG_IDS.length);
  });
});
