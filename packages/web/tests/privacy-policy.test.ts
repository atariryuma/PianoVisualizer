// The store links to public/privacy.html, while docs/PRIVACY.md is the copy people
// edit. The page once missed a whole feature because only the doc was updated.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const doc = readFileSync(join(ROOT, 'docs/PRIVACY.md'), 'utf8');
const page = readFileSync(join(ROOT, 'packages/web/public/privacy.html'), 'utf8');

const effective = (s: string) => /Effective: (\d{4}-\d{2}-\d{2})/.exec(s)?.[1];

describe('published privacy policy', () => {
  it('has the same effective date as docs/PRIVACY.md', () => {
    expect(effective(doc)).toBeTruthy();
    expect(effective(page)).toBe(effective(doc));
  });

  it('lists the same sections', () => {
    const docHeadings = [...doc.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const pageHeadings = [...page.matchAll(/<h2>(.+?)<\/h2>/g)].map((m) => m[1]);
    // The page's "Music" is the doc's "Public-domain scores".
    const normalize = (h: string) => (h === 'Public-domain scores' ? 'Music' : h);
    expect(pageHeadings).toEqual(docHeadings.map(normalize));
  });

  it('gives the same contact address', () => {
    const contact = 'github.com/atariryuma/PianoVisualizer/issues';
    expect(doc).toContain(contact);
    expect(page).toContain(contact);
  });
});
