import { describe, it, expect } from 'vitest';
import { buildSectionsFromDefs } from '../src/library/auto-section';

const NOTES = [
  { measureIdx: 0, timeSec: 0.0 },
  { measureIdx: 0, timeSec: 0.5 },
  { measureIdx: 4, timeSec: 8.0 },
  { measureIdx: 8, timeSec: 16.0 },
  { measureIdx: 12, timeSec: 24.0 },
];
const TOTAL_SEC = 32;

describe('buildSectionsFromDefs', () => {
  it('emits one BuiltSection per def in input order', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'feB', descKey: 'feBdesc', startMeasure: 4, isBoss: false },
      { id: 'A2', nameKey: 'feA2', descKey: 'feA2desc', startMeasure: 8, isBoss: true },
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out.map((s) => s.id)).toEqual(['A1', 'B', 'A2']);
  });

  it('startSec uses the first note in or after startMeasure', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'feB', descKey: 'feBdesc', startMeasure: 4, isBoss: false },
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out[0].startSec).toBe(0.0);
    expect(out[1].startSec).toBe(8.0);
  });

  it('startSec falls back to totalSec if no note >= startMeasure', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'feB', descKey: 'feBdesc', startMeasure: 99, isBoss: false },
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out[1].startSec).toBe(TOTAL_SEC);
  });

  it('endSec of section i is startSec of section i+1', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'feB', descKey: 'feBdesc', startMeasure: 4, isBoss: false },
      { id: 'A2', nameKey: 'feA2', descKey: 'feA2desc', startMeasure: 8, isBoss: true },
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out[0].endSec).toBe(out[1].startSec);
    expect(out[1].endSec).toBe(out[2].startSec);
  });

  it('last section endSec is totalSec + 1 (so the final note inclusive)', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out[0].endSec).toBe(TOTAL_SEC + 1);
  });

  it('isBoss defaults to false when omitted from def', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0 }, // no isBoss
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out[0].isBoss).toBe(false);
  });

  it('preserves nameKey / descKey from the def', () => {
    const defs = [
      { id: 'A1', nameKey: 'customName', descKey: 'customDesc', startMeasure: 0, isBoss: false },
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out[0].nameKey).toBe('customName');
    expect(out[0].descKey).toBe('customDesc');
  });

  it('handles empty notes array', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
    ];
    const out = buildSectionsFromDefs([], TOTAL_SEC, defs);
    expect(out[0].startSec).toBe(TOTAL_SEC);
  });
});
