import { describe, it, expect, beforeAll } from 'vitest';
import { autoSectionDefs, collectSectionCandidates } from '../src/library/auto-section';
import {
  PLAIN_8,
  PLAIN_60,
  REHEARSAL_30,
  KEY_CHANGE_30,
  MIXED_12,
} from './_fixtures/musicxml-fixtures';

let parser: { parseFromString(text: string, type: string): Document };

beforeAll(async () => {
  try {
    const ld = await import('linkedom');
    parser = {
      parseFromString(text: string, _type: string) {
        return ld.parseHTML(text).document as unknown as Document;
      },
    };
  } catch {
    parser = {
      parseFromString() {
        throw new Error('linkedom not installed');
      },
    };
  }
});

describe('collectSectionCandidates', () => {
  it('finds rehearsal marks', () => {
    const c = collectSectionCandidates(REHEARSAL_30, { parser });
    expect(c.rehearsal).toEqual([10, 20]);
    expect(c.total).toBe(30);
  });

  it('finds double bars and forward repeats', () => {
    const c = collectSectionCandidates(MIXED_12, { parser });
    // measure 4 (i=3, location=right → idx=4), repeat forward at i=7
    expect(c.doubleBar).toContain(4);
    expect(c.repeatFwd).toContain(7);
  });

  it('finds key changes after the first measure', () => {
    const c = collectSectionCandidates(KEY_CHANGE_30, { parser });
    expect(c.keyChange).toEqual([15]);
  });

  it('returns empty arrays for plain score', () => {
    const c = collectSectionCandidates(PLAIN_8, { parser });
    expect(c.rehearsal).toEqual([]);
    expect(c.doubleBar).toEqual([]);
    expect(c.repeatFwd).toEqual([]);
    expect(c.keyChange).toEqual([]);
  });
});

describe('autoSectionDefs', () => {
  it('emits exactly 3 sections with stable ids', () => {
    const defs = autoSectionDefs(PLAIN_60, undefined, { parser });
    expect(defs).toHaveLength(3);
    expect(defs.map((d) => d.id)).toEqual(['A1', 'B', 'A2']);
    expect(defs[2].isBoss).toBe(true);
  });

  it('A1 always starts at measure 0', () => {
    const defs = autoSectionDefs(PLAIN_60, undefined, { parser });
    expect(defs[0].startMeasure).toBe(0);
  });

  it('boundaries are monotonic', () => {
    const defs = autoSectionDefs(PLAIN_60, undefined, { parser });
    expect(defs[1].startMeasure).toBeGreaterThan(defs[0].startMeasure);
    expect(defs[2].startMeasure).toBeGreaterThan(defs[1].startMeasure);
  });

  it('snaps to rehearsal marks when within tolerance', () => {
    const defs = autoSectionDefs(REHEARSAL_30, undefined, { parser });
    // Rehearsal marks at 10 and 20; ideal thirds = 10 and 20. Should snap exactly.
    expect(defs[1].startMeasure).toBe(10);
    expect(defs[2].startMeasure).toBe(20);
  });

  it('falls back to length thirds with no signals', () => {
    const defs = autoSectionDefs(PLAIN_60, undefined, { parser });
    // 60 measures → ideal thirds = 20, 40
    expect(defs[1].startMeasure).toBe(20);
    expect(defs[2].startMeasure).toBe(40);
  });

  it('snaps near key change when close to ideal third', () => {
    // 30 measures, key change at 15. Ideal thirds = 10, 20. 15 is within ±25% of 20 (tol=7).
    const defs = autoSectionDefs(KEY_CHANGE_30, undefined, { parser });
    // Either b1 or b2 should pick up the 15 boundary.
    const measures = [defs[0].startMeasure, defs[1].startMeasure, defs[2].startMeasure];
    expect(measures).toContain(15);
  });

  it('handles tiny scores without crashing', () => {
    const defs = autoSectionDefs(PLAIN_8, undefined, { parser });
    expect(defs).toHaveLength(3);
    // 8 measures → thirds at 2, 5
    expect(defs[1].startMeasure).toBeLessThan(defs[2].startMeasure);
    expect(defs[2].startMeasure).toBeLessThan(8);
  });
});

// ─── partIndex（多パート譜、P2-21） ───────────────────────────────

/** 30小節×2パート。リハーサルマークは P2（index 1）側の 10, 20 のみ。 */
function measuresXml(marks: Record<number, string>, count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const d = marks[i]
      ? `<direction><direction-type><rehearsal>${marks[i]}</rehearsal></direction-type></direction>`
      : '';
    return `<measure number="${i + 1}">${d}</measure>`;
  }).join('');
}
const TWO_PART_REHEARSAL = `<?xml version="1.0"?><score-partwise>
<part-list><score-part id="P1"/><score-part id="P2"/></part-list>
<part id="P1">${measuresXml({}, 30)}</part>
<part id="P2">${measuresXml({ 10: 'B', 20: 'A2' }, 30)}</part>
</score-partwise>`;

describe('collectSectionCandidates / autoSectionDefs — partIndex（多パート譜）', () => {
  it('partIndex=1 で選択パート側のリハーサルマークを拾う', () => {
    const c = collectSectionCandidates(TWO_PART_REHEARSAL, { parser, partIndex: 1 });
    expect(c.rehearsal).toEqual([10, 20]);
    expect(c.total).toBe(30);
  });

  it('partIndex 省略時は従来どおり先頭パート（マーク無し）', () => {
    const c = collectSectionCandidates(TWO_PART_REHEARSAL, { parser });
    expect(c.rehearsal).toEqual([]);
  });

  it('autoSectionDefs も partIndex を貫通してマークにスナップする', () => {
    const defs = autoSectionDefs(TWO_PART_REHEARSAL, undefined, { parser, partIndex: 1 });
    expect(defs[1].startMeasure).toBe(10);
    expect(defs[2].startMeasure).toBe(20);
  });

  it('範囲外の partIndex は part 0 にフォールバックする', () => {
    const c = collectSectionCandidates(TWO_PART_REHEARSAL, { parser, partIndex: 4 });
    expect(c.rehearsal).toEqual([]);
    expect(c.total).toBe(30);
  });
});
