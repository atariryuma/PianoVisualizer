import { describe, it, expect, beforeAll } from 'vitest';
import { parseMusicXmlMetadata } from '../src/library/musicxml-meta';
import { PLAIN_8, REHEARSAL_30, buildScore } from './_fixtures/musicxml-fixtures';

let parser: { parseFromString(text: string, type: string): Document };

beforeAll(async () => {
  // node test environment: use linkedom (zero-cost DOMParser polyfill).
  // If linkedom isn't installed, the tests will skip with a clear message.
  try {
    const ld = await import('linkedom');
    parser = {
      parseFromString(text: string, _type: string) {
        // linkedom returns { document } when given XML; expose the doc directly.
        return ld.parseHTML(text).document as unknown as Document;
      },
    };
  } catch {
    parser = {
      parseFromString() {
        throw new Error(
          'linkedom not installed; pnpm install --filter @piano/core --include-workspace-root'
        );
      },
    };
  }
});

describe('parseMusicXmlMetadata', () => {
  it('extracts title + composer + measure count', () => {
    const meta = parseMusicXmlMetadata(PLAIN_8, { parser });
    expect(meta.title).toBe('Test Piece');
    expect(meta.composer).toBe('A. Test');
    expect(meta.measureCount).toBe(8);
  });

  it('counts measures from REHEARSAL_30', () => {
    const meta = parseMusicXmlMetadata(REHEARSAL_30, { parser });
    expect(meta.measureCount).toBe(30);
  });

  it('returns empty strings + 0 when fields are absent', () => {
    const empty = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list></score-partwise>`;
    const meta = parseMusicXmlMetadata(empty, { parser });
    expect(meta.title).toBe('');
    expect(meta.composer).toBe('');
    expect(meta.measureCount).toBe(0);
  });

  it('falls back to movement-title when work-title absent', () => {
    const xml = buildScore({ title: undefined, composer: 'X', measures: [{}, {}, {}] }).replace(
      '</score-partwise>',
      '<movement-title>Movement One</movement-title></score-partwise>'
    );
    const meta = parseMusicXmlMetadata(xml, { parser });
    expect(meta.title).toBe('Movement One');
  });
});
