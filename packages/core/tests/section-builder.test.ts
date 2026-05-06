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

  it('uses measureStartSec when provided (preserves leading rest in pickup)', () => {
    // Pickup measure: m=0 starts at t=0, but the first NOTE in m=0 is at
    // t=0.5 (a leading 8th rest precedes it). With the legacy "first note's
    // time" rule, sec.startSec=0.5, cropping the leading rest. With
    // measureStartSec[0]=0, sec.startSec=0 — leading rest preserved.
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
      { id: 'B', nameKey: 'feB', descKey: 'feBdesc', startMeasure: 4, isBoss: false },
    ];
    const measureStartSec = [0.0, 2.0, 4.0, 6.0, 7.5, 9.5, 11.5, 13.5, 15.5];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs, measureStartSec);
    expect(out[0].startSec).toBe(0.0); // measure boundary, not first note (0.5)
    expect(out[1].startSec).toBe(7.5); // measureStartSec[4], not first note (8.0)
  });

  it('falls back to first-note rule when measureStartSec is undefined', () => {
    const defs = [
      { id: 'A1', nameKey: 'feA1', descKey: 'feA1desc', startMeasure: 0, isBoss: false },
    ];
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs);
    expect(out[0].startSec).toBe(0.0); // first note's time
  });

  it('falls back when measureStartSec is too short for the def', () => {
    // measureStartSec doesn't cover the requested startMeasure → fall back.
    const defs = [{ id: 'B', nameKey: 'feB', descKey: 'feBdesc', startMeasure: 12, isBoss: false }];
    const measureStartSec = [0.0, 2.0]; // only 2 entries
    const out = buildSectionsFromDefs(NOTES, TOTAL_SEC, defs, measureStartSec);
    expect(out[0].startSec).toBe(24.0); // first note in m=12
  });
});
