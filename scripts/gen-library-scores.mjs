// Generate the self-owned, public-domain score library as plain MusicXML.
//
// WHY: the app must not redistribute third-party score files whose provenance /
// license it can't verify (see docs/LICENSES/README.md). These melodies are our
// OWN transcriptions of centuries-old public-domain compositions — so the
// COMPOSITION is PD worldwide, and the ENCODING (this MusicXML) is authored by
// the app itself. Zero third-party dependency, clean in every jurisdiction.
//
// Each piece is a compact single-staff (treble) melody spec. The packer splits
// notes into measures by the time signature and THROWS if any measure doesn't
// fill exactly — so an encoding mistake fails the build instead of shipping a
// broken score. Output: packages/web/public/assets/library/*.musicxml + a
// manifest.json the app reads.
//
// Run: node scripts/gen-library-scores.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/web/public/assets/library'
);

const DIVISIONS = 4; // per quarter → whole=16, eighth=2, sixteenth=1
const BASE = { w: 16, h: 8, q: 4, e: 2, s: 1 };
const TYPE = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: '16th' };

// Parse a token like "C#5:q." | "Bb4:e" | "r:h" → note descriptor.
function parseToken(tok) {
  const [main, durRaw] = tok.split(':');
  const durTok = durRaw || 'q';
  const dots = (durTok.match(/\./g) || []).length;
  const durLetter = durTok[0];
  if (!(durLetter in BASE)) throw new Error(`bad duration in "${tok}"`);
  let dur = BASE[durLetter];
  if (dots === 1) dur = dur * 1.5;
  else if (dots === 2) dur = dur * 1.75;
  if (!Number.isInteger(dur)) throw new Error(`non-integer duration in "${tok}"`);
  if (main === 'r') return { rest: true, dur, type: TYPE[durLetter], dots };
  const m = main.match(/^([A-G])([#b]?)(\d)$/);
  if (!m) throw new Error(`bad pitch in "${tok}"`);
  return {
    step: m[1],
    alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0,
    octave: Number(m[3]),
    dur,
    type: TYPE[durLetter],
    dots,
  };
}

function noteXml(n) {
  const parts = ['      <note>'];
  if (n.rest) {
    parts.push('        <rest/>');
  } else {
    parts.push('        <pitch>');
    parts.push(`          <step>${n.step}</step>`);
    if (n.alter) parts.push(`          <alter>${n.alter}</alter>`);
    parts.push(`          <octave>${n.octave}</octave>`);
    parts.push('        </pitch>');
  }
  parts.push(`        <duration>${n.dur}</duration>`);
  parts.push('        <voice>1</voice>');
  parts.push(`        <type>${n.type}</type>`);
  for (let i = 0; i < n.dots; i++) parts.push('        <dot/>');
  if (!n.rest && n.alter) {
    parts.push(`        <accidental>${n.alter === 1 ? 'sharp' : 'flat'}</accidental>`);
  }
  parts.push('      </note>');
  return parts.join('\n');
}

// Split a flat note list into full measures. capacity = divisions of one bar.
// The first bar may be a pickup (anacrusis) of `pickup` divisions.
function packMeasures(notes, capacity, pickup) {
  const measures = [];
  let cur = [];
  let filled = 0;
  let cap = pickup || capacity;
  for (const n of notes) {
    if (n.dur > cap - filled) {
      throw new Error(
        `note (${n.step || 'rest'}${n.octave || ''} dur ${n.dur}) overflows bar ` +
          `${measures.length + 1} (cap ${cap}, filled ${filled}) — fix the spec`
      );
    }
    cur.push(n);
    filled += n.dur;
    if (filled === cap) {
      measures.push(cur);
      cur = [];
      filled = 0;
      cap = capacity;
    }
  }
  if (filled !== 0) {
    throw new Error(`last bar underfilled (filled ${filled}/${cap}) — fix the spec`);
  }
  return measures;
}

function buildScore(p) {
  const [beats, beatType] = p.time;
  const capacity = beats * ((DIVISIONS * 4) / beatType);
  if (!Number.isInteger(capacity)) throw new Error(`${p.id}: bad time signature`);
  const notes = p.notes.map(parseToken);
  const pickup = p.pickup ? p.pickup : 0;
  const measures = packMeasures(notes, capacity, pickup);

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" ' +
      '"http://www.musicxml.org/dtds/partwise.dtd">'
  );
  lines.push('<score-partwise version="3.1">');
  lines.push('  <work>');
  lines.push(`    <work-title>${p.title}</work-title>`);
  lines.push('  </work>');
  lines.push('  <identification>');
  lines.push(`    <creator type="composer">${p.composer}</creator>`);
  lines.push('    <rights>Public domain composition; engraving authored by Piano Visualizer.</rights>');
  lines.push('    <encoding>');
  lines.push('      <software>Piano Visualizer library generator</software>');
  lines.push('    </encoding>');
  lines.push('  </identification>');
  lines.push('  <part-list>');
  lines.push('    <score-part id="P1">');
  lines.push('      <part-name>Piano</part-name>');
  lines.push('      <score-instrument id="P1-I1">');
  lines.push('        <instrument-name>Piano</instrument-name>');
  lines.push('      </score-instrument>');
  lines.push('      <midi-instrument id="P1-I1">');
  lines.push('        <midi-channel>1</midi-channel>');
  lines.push('        <midi-program>1</midi-program>');
  lines.push('      </midi-instrument>');
  lines.push('    </score-part>');
  lines.push('  </part-list>');
  lines.push('  <part id="P1">');

  measures.forEach((bar, i) => {
    const isPickup = pickup && i === 0;
    const number = pickup ? i : i + 1;
    lines.push(`    <measure number="${number}"${isPickup ? ' implicit="yes"' : ''}>`);
    if (i === 0) {
      lines.push('      <attributes>');
      lines.push(`        <divisions>${DIVISIONS}</divisions>`);
      lines.push('        <key>');
      lines.push(`          <fifths>${p.fifths || 0}</fifths>`);
      lines.push('        </key>');
      lines.push('        <time>');
      lines.push(`          <beats>${beats}</beats>`);
      lines.push(`          <beat-type>${beatType}</beat-type>`);
      lines.push('        </time>');
      lines.push('        <clef>');
      lines.push('          <sign>G</sign>');
      lines.push('          <line>2</line>');
      lines.push('        </clef>');
      lines.push('      </attributes>');
      if (p.tempo) {
        lines.push('      <direction placement="above">');
        lines.push('        <direction-type>');
        lines.push(`          <metronome><beat-unit>quarter</beat-unit><per-minute>${p.tempo}</per-minute></metronome>`);
        lines.push('        </direction-type>');
        lines.push(`        <sound tempo="${p.tempo}"/>`);
        lines.push('      </direction>');
      }
    }
    bar.forEach((n) => lines.push(noteXml(n)));
    lines.push('    </measure>');
  });

  lines.push('  </part>');
  lines.push('</score-partwise>');
  return { xml: lines.join('\n') + '\n', measureCount: measures.length };
}

// ── Public-domain pieces (our own transcriptions) ────────────────────────────
// Notes: pitch+octave, ":" duration (w/h/q/e/s, "." = dotted). Default quarter.
const PIECES = [
  {
    id: 'ode_to_joy',
    title: 'Ode to Joy',
    titleJp: '歓喜の歌',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    time: [4, 4],
    tempo: 100,
    notes: [
      'E4','E4','F4','G4', 'G4','F4','E4','D4', 'C4','C4','D4','E4', 'E4:q.','D4:e','D4:h',
      'E4','E4','F4','G4', 'G4','F4','E4','D4', 'C4','C4','D4','E4', 'D4:q.','C4:e','C4:h',
    ],
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    titleJp: 'きらきら星',
    composer: 'Wolfgang Amadeus Mozart',
    composerJp: 'モーツァルト',
    died: 1791,
    time: [4, 4],
    tempo: 96,
    notes: [
      'C4','C4','G4','G4', 'A4','A4','G4:h', 'F4','F4','E4','E4', 'D4','D4','C4:h',
      'G4','G4','F4','F4', 'E4','E4','D4:h', 'G4','G4','F4','F4', 'E4','E4','D4:h',
      'C4','C4','G4','G4', 'A4','A4','G4:h', 'F4','F4','E4','E4', 'D4','D4','C4:h',
    ],
  },
  {
    id: 'jingle_bells',
    title: 'Jingle Bells (Chorus)',
    titleJp: 'ジングルベル',
    composer: 'James Lord Pierpont',
    composerJp: 'ピアポント',
    died: 1893,
    time: [4, 4],
    tempo: 120,
    notes: [
      'E4','E4','E4:h', 'E4','E4','E4:h', 'E4','G4','C4:q.','D4:e','E4:w',
      'F4','F4','F4:q.','F4:e', 'F4','E4','E4','E4:e','E4:e', 'E4','D4','D4','E4', 'D4:h','G4:h',
    ],
  },
  {
    id: 'mary_lamb',
    title: 'Mary Had a Little Lamb',
    titleJp: 'メリーさんのひつじ',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    time: [4, 4],
    tempo: 100,
    notes: [
      'E4','D4','C4','D4', 'E4','E4','E4:h', 'D4','D4','D4:h', 'E4','G4','G4:h',
      'E4','D4','C4','D4', 'E4','E4','E4','E4', 'D4','D4','E4','D4', 'C4:w',
    ],
  },
  {
    id: 'frere_jacques',
    title: 'Frère Jacques',
    titleJp: 'フレール・ジャック',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    time: [4, 4],
    tempo: 108,
    notes: [
      'C4','D4','E4','C4', 'C4','D4','E4','C4', 'E4','F4','G4:h', 'E4','F4','G4:h',
      'G4:e','A4:e','G4:e','F4:e','E4','C4', 'G4:e','A4:e','G4:e','F4:e','E4','C4',
      'C4','G3','C4:h', 'C4','G3','C4:h',
    ],
  },
  {
    id: 'old_macdonald',
    title: 'Old MacDonald Had a Farm',
    titleJp: 'ゆかいな牧場',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    time: [4, 4],
    tempo: 112,
    notes: [
      'G4','G4','G4','D4', 'E4','E4','D4:h', 'B4','B4','A4','A4', 'G4:w',
      'G4','G4','G4','D4', 'E4','E4','D4:h', 'B4','B4','A4','A4', 'G4:w',
    ],
  },
  {
    id: 'london_bridge',
    title: 'London Bridge',
    titleJp: 'ロンドン橋',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    time: [4, 4],
    tempo: 108,
    notes: [
      'G4','A4','G4','F4', 'E4','F4','G4:h', 'D4','E4','F4:h', 'E4','F4','G4:h',
      'G4','A4','G4','F4', 'E4','F4','G4:h', 'D4:h','G4:h', 'E4:h','C4:h',
    ],
  },
  {
    id: 'hot_cross_buns',
    title: 'Hot Cross Buns',
    titleJp: 'ホット・クロス・バンズ',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    time: [4, 4],
    tempo: 100,
    notes: [
      'E4','D4','C4:h', 'E4','D4','C4:h',
      'C4:e','C4:e','C4:e','C4:e','D4:e','D4:e','D4:e','D4:e', 'E4','D4','C4:h',
    ],
  },
];

mkdirSync(OUT_DIR, { recursive: true });
const manifest = { version: 1, scores: [] };
let total = 0;
for (const p of PIECES) {
  const { xml, measureCount } = buildScore(p);
  const file = `${p.id}.musicxml`;
  writeFileSync(join(OUT_DIR, file), xml, 'utf8');
  manifest.scores.push({
    file,
    title: p.title,
    titleJp: p.titleJp,
    composer: p.composer,
    composerJp: p.composerJp,
    died: p.died,
    license: 'PD',
    note: 'Own transcription of a public-domain composition',
  });
  total++;
  // eslint-disable-next-line no-console
  console.log(`✓ ${file} (${measureCount} bars)`);
}
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
// eslint-disable-next-line no-console
console.log(`\nWrote ${total} scores + manifest.json → ${OUT_DIR}`);
