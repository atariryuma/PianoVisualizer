// Tiny synthetic MusicXML fixtures for testing meta + auto-section.
// Each builds a multi-measure score with the requested signals.

interface MeasureSpec {
  rehearsal?: string; // rehearsal mark text
  doubleBarRight?: boolean; // <bar-style>light-light</bar-style> at right
  repeatForward?: boolean; // <repeat direction="forward">
  key?: number; // fifths value (0=C, 1=G, -1=F, etc.)
  time?: { beats: number; beatType: number };
}

const HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">`;

export function buildScore(opts: {
  title?: string;
  composer?: string;
  measures: MeasureSpec[];
}): string {
  const work = opts.title ? `<work><work-title>${opts.title}</work-title></work>` : '';
  const ident = opts.composer
    ? `<identification><creator type="composer">${opts.composer}</creator></identification>`
    : '';
  const measuresXml = opts.measures
    .map((m, i) => {
      let attrs = '';
      if (m.key != null) attrs += `<key><fifths>${m.key}</fifths></key>`;
      if (m.time)
        attrs += `<time><beats>${m.time.beats}</beats><beat-type>${m.time.beatType}</beat-type></time>`;
      const directions = m.rehearsal
        ? `<direction><direction-type><rehearsal>${m.rehearsal}</rehearsal></direction-type></direction>`
        : '';
      const barlines: string[] = [];
      if (m.repeatForward) {
        barlines.push(`<barline location="left"><repeat direction="forward"/></barline>`);
      }
      if (m.doubleBarRight) {
        barlines.push(`<barline location="right"><bar-style>light-light</bar-style></barline>`);
      }
      return `<measure number="${i + 1}">
        ${attrs ? `<attributes>${attrs}</attributes>` : ''}
        ${directions}
        ${barlines.join('')}
      </measure>`;
    })
    .join('\n');

  return `${HEADER}
${work}
${ident}
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
${measuresXml}
</part>
</score-partwise>`;
}

/** Minimal 8-measure score with only metadata and bare measures. */
export const PLAIN_8 = buildScore({
  title: 'Test Piece',
  composer: 'A. Test',
  measures: Array.from({ length: 8 }, () => ({}) as MeasureSpec),
});

/** 30 measures with rehearsal marks at 10 and 20 (clean A-B-A). */
export const REHEARSAL_30 = buildScore({
  title: 'Rehearsal Score',
  composer: 'A. Test',
  measures: Array.from({ length: 30 }, (_, i) => {
    if (i === 10) return { rehearsal: 'B' };
    if (i === 20) return { rehearsal: 'A2' };
    return {};
  }),
});

/** 30 measures, key change at measure 15 only. Should land near third 1 or 2. */
export const KEY_CHANGE_30 = buildScore({
  title: 'Modulating Piece',
  composer: 'A. Test',
  measures: Array.from({ length: 30 }, (_, i) => {
    if (i === 0) return { key: 0 };
    if (i === 15) return { key: 3 };
    return {};
  }),
});

/** 60 measures with no signals — should fall back to length thirds. */
export const PLAIN_60 = buildScore({
  title: 'Long Plain',
  composer: 'A. Test',
  measures: Array.from({ length: 60 }, () => ({}) as MeasureSpec),
});

/** 12 measures with double bar at end of measure 4 and repeat forward at measure 8. */
export const MIXED_12 = buildScore({
  title: 'Mixed Signals',
  composer: 'A. Test',
  measures: Array.from({ length: 12 }, (_, i) => {
    if (i === 3) return { doubleBarRight: true }; // boundary at measure 4 (0-indexed → out.doubleBar = [4])
    if (i === 7) return { repeatForward: true };
    return {};
  }),
});
