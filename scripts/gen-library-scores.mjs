// Generate the self-owned, public-domain score library as plain MusicXML.
//
// WHY: the app must not redistribute third-party score files whose provenance /
// license it can't verify (see docs/LICENSES/README.md). These melodies are our
// OWN transcriptions/arrangements of public-domain compositions — so the
// COMPOSITION is PD worldwide, and the ENCODING (this MusicXML) is authored by
// the app itself. Zero third-party dependency, clean in every jurisdiction.
//
// Each piece is a compact single-staff (treble) melody spec. Tokens:
//   "C4"      quarter C octave 4        "C#5:e"   eighth C sharp
//   "Bb4:h."  dotted half B flat        "r:q"     quarter rest
//   "C4+E4+G4:h"  a CHORD (stacked pitches, same duration)
// Durations w/h/q/e/s, "." = dotted. Default quarter.
//
// The packer splits notes into measures by the time signature and THROWS if any
// measure doesn't fill exactly — so an encoding mistake fails the build instead
// of shipping a broken score. Output:
//   packages/web/public/assets/library/*.musicxml + manifest.json
//
// Run: node scripts/gen-library-scores.mjs

import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/web/public/assets/library'
);

const DIVISIONS = 4; // per quarter → whole=16, eighth=2, sixteenth=1
const BASE = { w: 16, h: 8, q: 4, e: 2, s: 1 };
const TYPE = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: '16th' };
const LEVEL_JP = { 1: '初級', 2: '初中級', 3: '中級', 4: '上級' };

function durOf(durTok) {
  const dots = (durTok.match(/\./g) || []).length;
  const letter = durTok[0];
  if (!(letter in BASE)) throw new Error(`bad duration "${durTok}"`);
  let dur = BASE[letter];
  if (dots === 1) dur *= 1.5;
  else if (dots === 2) dur *= 1.75;
  if (!Number.isInteger(dur)) throw new Error(`non-integer duration "${durTok}"`);
  return { dur, type: TYPE[letter], dots };
}

function parsePitch(p) {
  const m = p.match(/^([A-G])([#b]?)(\d)$/);
  if (!m) throw new Error(`bad pitch "${p}"`);
  return { step: m[1], alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, octave: Number(m[3]) };
}

// Parse a token → { dur, type, dots, rest? , pitches:[{step,alter,octave}] }
function parseToken(tok) {
  const [main, durRaw] = tok.split(':');
  const { dur, type, dots } = durOf(durRaw || 'q');
  if (main === 'r') return { rest: true, dur, type, dots };
  const pitches = main.split('+').map(parsePitch);
  return { pitches, dur, type, dots };
}

function pitchXml(p, indent) {
  const out = [`${indent}<pitch>`, `${indent}  <step>${p.step}</step>`];
  if (p.alter) out.push(`${indent}  <alter>${p.alter}</alter>`);
  out.push(`${indent}  <octave>${p.octave}</octave>`, `${indent}</pitch>`);
  return out;
}

function noteXml(n) {
  if (n.rest) {
    const out = [
      '      <note>',
      '        <rest/>',
      `        <duration>${n.dur}</duration>`,
      '        <voice>1</voice>',
      `        <type>${n.type}</type>`,
    ];
    for (let i = 0; i < n.dots; i++) out.push('        <dot/>');
    out.push('      </note>');
    return out.join('\n');
  }
  const lines = [];
  n.pitches.forEach((p, idx) => {
    lines.push('      <note>');
    if (idx > 0) lines.push('        <chord/>');
    lines.push(...pitchXml(p, '        '));
    lines.push(`        <duration>${n.dur}</duration>`);
    lines.push('        <voice>1</voice>');
    lines.push(`        <type>${n.type}</type>`);
    for (let i = 0; i < n.dots; i++) lines.push('        <dot/>');
    if (p.alter) lines.push(`        <accidental>${p.alter === 1 ? 'sharp' : 'flat'}</accidental>`);
    lines.push('      </note>');
  });
  return lines.join('\n');
}

function packMeasures(notes, capacity, pickup) {
  const measures = [];
  let cur = [];
  let filled = 0;
  let cap = pickup || capacity;
  for (const n of notes) {
    if (n.dur > cap - filled) {
      throw new Error(
        `note (dur ${n.dur}) overflows bar ${measures.length + 1} (cap ${cap}, filled ${filled}) — fix the spec`
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
  if (filled !== 0) throw new Error(`last bar underfilled (${filled}/${cap}) — fix the spec`);
  return measures;
}

function buildScore(p) {
  const [beats, beatType] = p.time;
  const capacity = beats * ((DIVISIONS * 4) / beatType);
  if (!Number.isInteger(capacity)) throw new Error(`${p.id}: bad time signature`);
  const notes = p.notes.map(parseToken);
  const pickup = p.pickup || 0;
  const measures = packMeasures(notes, capacity, pickup);

  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
  );
  L.push('<score-partwise version="3.1">');
  L.push('  <work>');
  L.push(`    <work-title>${p.title}</work-title>`);
  L.push('  </work>');
  L.push('  <identification>');
  L.push(`    <creator type="composer">${p.composer}</creator>`);
  L.push('    <rights>Public-domain composition; engraving authored by Piano Visualizer.</rights>');
  L.push('    <encoding><software>Piano Visualizer library generator</software></encoding>');
  L.push('  </identification>');
  L.push('  <part-list>');
  L.push('    <score-part id="P1">');
  L.push('      <part-name>Piano</part-name>');
  L.push(
    '      <score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>'
  );
  L.push(
    '      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>'
  );
  L.push('    </score-part>');
  L.push('  </part-list>');
  L.push('  <part id="P1">');

  measures.forEach((bar, i) => {
    const isPickup = pickup && i === 0;
    const number = pickup ? i : i + 1;
    L.push(`    <measure number="${number}"${isPickup ? ' implicit="yes"' : ''}>`);
    if (i === 0) {
      L.push('      <attributes>');
      L.push(`        <divisions>${DIVISIONS}</divisions>`);
      L.push(`        <key><fifths>${p.fifths || 0}</fifths></key>`);
      L.push(`        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`);
      L.push('        <clef><sign>G</sign><line>2</line></clef>');
      L.push('      </attributes>');
      if (p.tempo) {
        L.push('      <direction placement="above"><direction-type>');
        L.push(
          `        <metronome><beat-unit>quarter</beat-unit><per-minute>${p.tempo}</per-minute></metronome>`
        );
        L.push(`      </direction-type><sound tempo="${p.tempo}"/></direction>`);
      }
    }
    bar.forEach((n) => L.push(noteXml(n)));
    L.push('    </measure>');
  });

  L.push('  </part>');
  L.push('</score-partwise>');
  return { xml: L.join('\n') + '\n', measureCount: measures.length };
}

// ── Public-domain pieces (our own transcriptions / arrangements) ─────────────
// level: 1 初級 · 2 初中級 · 3 中級 · 4 上級
const PIECES = [
  // ---- Level 1 — beginner (nursery / folk / simple themes) ----
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    titleJp: 'きらきら星',
    composer: 'Wolfgang Amadeus Mozart',
    composerJp: 'モーツァルト',
    died: 1791,
    level: 1,
    time: [4, 4],
    tempo: 96,
    notes: [
      'C4',
      'C4',
      'G4',
      'G4',
      'A4',
      'A4',
      'G4:h',
      'F4',
      'F4',
      'E4',
      'E4',
      'D4',
      'D4',
      'C4:h',
      'G4',
      'G4',
      'F4',
      'F4',
      'E4',
      'E4',
      'D4:h',
      'G4',
      'G4',
      'F4',
      'F4',
      'E4',
      'E4',
      'D4:h',
      'C4',
      'C4',
      'G4',
      'G4',
      'A4',
      'A4',
      'G4:h',
      'F4',
      'F4',
      'E4',
      'E4',
      'D4',
      'D4',
      'C4:h',
    ],
  },
  {
    id: 'mary_lamb',
    title: 'Mary Had a Little Lamb',
    titleJp: 'メリーさんのひつじ',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 1,
    time: [4, 4],
    tempo: 100,
    notes: [
      'E4',
      'D4',
      'C4',
      'D4',
      'E4',
      'E4',
      'E4:h',
      'D4',
      'D4',
      'D4:h',
      'E4',
      'G4',
      'G4:h',
      'E4',
      'D4',
      'C4',
      'D4',
      'E4',
      'E4',
      'E4',
      'E4',
      'D4',
      'D4',
      'E4',
      'D4',
      'C4:w',
    ],
  },
  {
    id: 'frere_jacques',
    title: 'Frère Jacques',
    titleJp: 'フレール・ジャック',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 1,
    time: [4, 4],
    tempo: 108,
    notes: [
      'C4',
      'D4',
      'E4',
      'C4',
      'C4',
      'D4',
      'E4',
      'C4',
      'E4',
      'F4',
      'G4:h',
      'E4',
      'F4',
      'G4:h',
      'G4:e',
      'A4:e',
      'G4:e',
      'F4:e',
      'E4',
      'C4',
      'G4:e',
      'A4:e',
      'G4:e',
      'F4:e',
      'E4',
      'C4',
      'C4',
      'G3',
      'C4:h',
      'C4',
      'G3',
      'C4:h',
    ],
  },
  {
    id: 'old_macdonald',
    title: 'Old MacDonald Had a Farm',
    titleJp: 'ゆかいな牧場',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 1,
    time: [4, 4],
    tempo: 112,
    notes: [
      'G4',
      'G4',
      'G4',
      'D4',
      'E4',
      'E4',
      'D4:h',
      'B4',
      'B4',
      'A4',
      'A4',
      'G4:w',
      'G4',
      'G4',
      'G4',
      'D4',
      'E4',
      'E4',
      'D4:h',
      'B4',
      'B4',
      'A4',
      'A4',
      'G4:w',
    ],
  },
  {
    id: 'london_bridge',
    title: 'London Bridge',
    titleJp: 'ロンドン橋',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 1,
    time: [4, 4],
    tempo: 108,
    notes: [
      'G4',
      'A4',
      'G4',
      'F4',
      'E4',
      'F4',
      'G4:h',
      'D4',
      'E4',
      'F4:h',
      'E4',
      'F4',
      'G4:h',
      'G4',
      'A4',
      'G4',
      'F4',
      'E4',
      'F4',
      'G4:h',
      'D4:h',
      'G4:h',
      'E4:h',
      'C4:h',
    ],
  },
  {
    id: 'hot_cross_buns',
    title: 'Hot Cross Buns',
    titleJp: 'ホット・クロス・バンズ',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 1,
    time: [4, 4],
    tempo: 100,
    notes: [
      'E4',
      'D4',
      'C4:h',
      'E4',
      'D4',
      'C4:h',
      'C4:e',
      'C4:e',
      'C4:e',
      'C4:e',
      'D4:e',
      'D4:e',
      'D4:e',
      'D4:e',
      'E4',
      'D4',
      'C4:h',
    ],
  },
  {
    id: 'jingle_bells',
    title: 'Jingle Bells (Chorus)',
    titleJp: 'ジングルベル',
    composer: 'James Lord Pierpont',
    composerJp: 'ピアポント',
    died: 1893,
    level: 1,
    time: [4, 4],
    tempo: 120,
    notes: [
      'E4',
      'E4',
      'E4:h',
      'E4',
      'E4',
      'E4:h',
      'E4',
      'G4',
      'C4:q.',
      'D4:e',
      'E4:w',
      'F4',
      'F4',
      'F4:q.',
      'F4:e',
      'F4',
      'E4',
      'E4',
      'E4:e',
      'E4:e',
      'E4',
      'D4',
      'D4',
      'E4',
      'D4:h',
      'G4:h',
    ],
  },
  {
    id: 'au_clair_de_la_lune',
    title: 'Au Clair de la Lune',
    titleJp: '月の光に',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 1,
    time: [4, 4],
    tempo: 96,
    notes: ['C4', 'C4', 'C4', 'D4', 'E4:h', 'D4:h', 'C4', 'E4', 'D4', 'D4', 'C4:w'],
  },
  {
    id: 'beethoven_fifth',
    title: 'Symphony No. 5 (opening)',
    titleJp: '交響曲第5番「運命」冒頭',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    level: 1,
    time: [4, 4],
    tempo: 108,
    notes: ['r:e', 'G4:e', 'G4:e', 'G4:e', 'Eb4:h', 'r:e', 'F4:e', 'F4:e', 'F4:e', 'D4:h'],
  },
  {
    id: 'ode_to_joy',
    title: 'Ode to Joy',
    titleJp: '歓喜の歌',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    level: 2,
    time: [4, 4],
    tempo: 100,
    notes: [
      'E4',
      'E4',
      'F4',
      'G4',
      'G4',
      'F4',
      'E4',
      'D4',
      'C4',
      'C4',
      'D4',
      'E4',
      'E4:q.',
      'D4:e',
      'D4:h',
      'E4',
      'E4',
      'F4',
      'G4',
      'G4',
      'F4',
      'E4',
      'D4',
      'C4',
      'C4',
      'D4',
      'E4',
      'D4:q.',
      'C4:e',
      'C4:h',
    ],
  },

  // ---- Level 2 — easy classical themes ----
  {
    id: 'canon_in_d',
    title: 'Canon in D (theme)',
    titleJp: 'カノン（主題）',
    composer: 'Johann Pachelbel',
    composerJp: 'パッヘルベル',
    died: 1706,
    level: 2,
    time: [4, 4],
    tempo: 92,
    notes: [
      'E5:h',
      'D5:h',
      'C5:h',
      'B4:h',
      'A4:h',
      'G4:h',
      'A4:h',
      'B4:h',
      'E5',
      'D5',
      'C5',
      'B4',
      'A4',
      'G4',
      'A4',
      'B4',
      'C5',
      'B4',
      'A4',
      'G4',
      'F4',
      'E4',
      'F4',
      'G4',
    ],
  },
  {
    id: 'minuet_in_g',
    title: 'Minuet in G (BWV Anh. 114)',
    titleJp: 'メヌエット ト長調',
    composer: 'Christian Petzold',
    composerJp: 'ペツォールト',
    died: 1760,
    level: 2,
    time: [3, 4],
    tempo: 120,
    notes: [
      'D5',
      'G4:e',
      'A4:e',
      'B4:e',
      'C5:e',
      'D5',
      'G4',
      'G4',
      'E5',
      'C5:e',
      'D5:e',
      'E5:e',
      'F#5:e',
      'G5',
      'G4',
      'G4',
      'C5',
      'D5',
      'C5',
      'B4',
      'A4',
      'B4',
      'C5',
      'B4',
      'A4',
      'G4',
      'F#4',
      'G4',
      'A4',
      'B4',
      'G4',
      'B4:h.',
    ],
  },
  {
    id: 'grieg_mountain_king',
    title: 'In the Hall of the Mountain King',
    titleJp: '山の魔王の宮殿にて',
    composer: 'Edvard Grieg',
    composerJp: 'グリーグ',
    died: 1907,
    level: 2,
    time: [4, 4],
    tempo: 108,
    notes: [
      'A4:e',
      'B4:e',
      'C5:e',
      'D5:e',
      'E5:e',
      'C5:e',
      'E5:e',
      'C5:e',
      'A4:e',
      'B4:e',
      'C5:e',
      'D5:e',
      'E5:e',
      'C5:e',
      'E5:e',
      'C5:e',
      'C5:e',
      'D5:e',
      'E5:e',
      'F5:e',
      'G5:e',
      'E5:e',
      'G5:e',
      'E5:e',
      'C5:e',
      'D5:e',
      'E5:e',
      'F5:e',
      'G5:e',
      'E5:e',
      'G5:e',
      'E5:e',
    ],
  },
  {
    id: 'new_world_largo',
    title: 'New World Symphony (Largo)',
    titleJp: '新世界より「家路」',
    composer: 'Antonín Dvořák',
    composerJp: 'ドヴォルザーク',
    died: 1904,
    level: 2,
    time: [4, 4],
    tempo: 72,
    notes: [
      'E4',
      'G4',
      'G4:h',
      'G4',
      'E4',
      'D4:h',
      'E4',
      'G4',
      'E4',
      'D4',
      'C4:w',
      'E4',
      'G4',
      'G4:h',
      'G4',
      'E4',
      'D4:h',
      'E4',
      'D4',
      'C4:h',
    ],
  },

  // ---- Level 3 — intermediate ----
  {
    id: 'gymnopedie_1',
    title: 'Gymnopédie No. 1 (theme)',
    titleJp: 'ジムノペディ 第1番',
    composer: 'Erik Satie',
    composerJp: 'サティ',
    died: 1925,
    level: 3,
    time: [3, 4],
    tempo: 66,
    notes: [
      'F#5:h.',
      'A5:h.',
      'G#5:h.',
      'B5:h.',
      'C#6:h',
      'B5:q',
      'A5:h',
      'G#5:q',
      'F#5:h',
      'E5:q',
      'D5:h.',
      'C#5:h.',
    ],
  },
  {
    id: 'bizet_habanera',
    title: 'Habanera (Carmen)',
    titleJp: 'ハバネラ（カルメン）',
    composer: 'Georges Bizet',
    composerJp: 'ビゼー',
    died: 1875,
    level: 3,
    time: [2, 4],
    tempo: 100,
    notes: [
      'D5:q.',
      'C#5:e',
      'C5:e',
      'B4:e',
      'Bb4:e',
      'A4:e',
      'A4:q.',
      'A4:e',
      'Bb4:e',
      'B4:e',
      'Bb4:e',
      'A4:e',
      'Ab4:q.',
      'G4:e',
      'Gb4:e',
      'G4:e',
      'Gb4:e',
      'F4:e',
      'E4:q',
      'E4:q',
    ],
  },
  {
    id: 'bach_prelude_c',
    title: 'Prelude in C (BWV 846)',
    titleJp: '前奏曲 ハ長調 BWV 846',
    composer: 'Johann Sebastian Bach',
    composerJp: 'バッハ',
    died: 1750,
    level: 3,
    time: [4, 4],
    tempo: 72,
    notes: [
      'C4:e',
      'E4:e',
      'G4:e',
      'C5:e',
      'E5:e',
      'G4:e',
      'C5:e',
      'E5:e',
      'C4:e',
      'D4:e',
      'A4:e',
      'D5:e',
      'F5:e',
      'A4:e',
      'D5:e',
      'F5:e',
      'B3:e',
      'D4:e',
      'G4:e',
      'D5:e',
      'F5:e',
      'G4:e',
      'D5:e',
      'F5:e',
      'C4:e',
      'E4:e',
      'G4:e',
      'C5:e',
      'E5:e',
      'G4:e',
      'C5:e',
      'E5:e',
    ],
  },
  {
    id: 'bach_toccata_dm',
    title: 'Toccata in D minor (opening)',
    titleJp: 'トッカータ ニ短調（冒頭）',
    composer: 'Johann Sebastian Bach',
    composerJp: 'バッハ',
    died: 1750,
    level: 3,
    time: [4, 4],
    tempo: 76,
    notes: [
      'A5:e',
      'G5:e',
      'A5:h',
      'r:q',
      'G5:e',
      'F5:e',
      'E5:e',
      'D5:e',
      'C#5:e',
      'D5:e',
      'C#5:e',
      'D5:e',
      'A4:h',
      'r:h',
    ],
  },

  // ---- Level 4 — advanced (themes / melodic lines) ----
  {
    id: 'chopin_nocturne_op9no2',
    title: 'Nocturne Op. 9 No. 2 (melody)',
    titleJp: 'ノクターン Op.9-2（旋律）',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 4,
    time: [3, 4],
    tempo: 66,
    notes: [
      'Bb4:q.',
      'G4:e',
      'F4:e',
      'G4:e',
      'C5:h',
      'Ab4:q',
      'Bb4:q.',
      'C5:e',
      'Ab4:e',
      'Bb4:e',
      'Eb5:h',
      'C5:q',
      'Bb4:q',
      'Ab4:q',
      'G4:q',
    ],
  },
  {
    id: 'chopin_prelude_e_minor',
    title: 'Prelude Op. 28 No. 4',
    titleJp: '前奏曲 Op.28-4 ホ短調',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 4,
    time: [4, 4],
    tempo: 60,
    notes: [
      'B4:h',
      'B4:q',
      'C5:q',
      'B4:h',
      'A4:h',
      'A4:h',
      'G4:h',
      'G4:h',
      'F#4:h',
      'F#4:h',
      'E4:h',
    ],
  },

  // ── batch 2 (verified by render) ──
  {
    id: 'lightly_row',
    title: 'Lightly Row',
    titleJp: 'かるく こげよ',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 1,
    time: [4, 4],
    tempo: 100,
    notes: [
      'G4',
      'E4',
      'E4:h',
      'F4',
      'D4',
      'D4:h',
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
      'G4',
      'G4:h',
      'G4',
      'E4',
      'E4:h',
      'F4',
      'D4',
      'D4:h',
      'C4',
      'E4',
      'G4',
      'G4',
      'E4',
      'D4',
      'C4:h',
    ],
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    titleJp: 'グリーンスリーブス',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 2,
    time: [3, 4],
    tempo: 90,
    pickup: 4,
    notes: [
      'A4:q',
      'C5:h',
      'D5:q',
      'E5:q.',
      'F5:e',
      'E5:q',
      'D5:h',
      'B4:q',
      'G4:q.',
      'A4:e',
      'B4:q',
      'C5:h',
      'A4:q',
      'A4:q.',
      'G#4:e',
      'A4:q',
      'B4:h',
      'G#4:q',
      'A4:h.',
    ],
  },
  {
    id: 'scarborough_fair',
    title: 'Scarborough Fair',
    titleJp: 'スカボロー・フェア',
    composer: 'Traditional',
    composerJp: '伝承曲',
    died: 0,
    level: 2,
    time: [3, 4],
    tempo: 100,
    notes: [
      'A4:q',
      'A4:q',
      'E5:q',
      'E5:h',
      'B4:q',
      'A4:q',
      'B4:q',
      'C5:q',
      'B4:h.',
      'G4:q',
      'B4:q',
      'A4:q',
      'G4:q',
      'E4:q',
      'F#4:q',
      'G4:q',
      'A4:q',
      'E4:q',
      'A4:h.',
    ],
  },
  {
    id: 'moonlight_1',
    title: 'Moonlight Sonata (1st mvt, arr.)',
    titleJp: '月光ソナタ 第1楽章（編曲）',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    level: 4,
    time: [12, 8],
    tempo: 50,
    notes: [
      'E4:e',
      'A4:e',
      'C5:e',
      'E4:e',
      'A4:e',
      'C5:e',
      'E4:e',
      'A4:e',
      'C5:e',
      'E4:e',
      'A4:e',
      'C5:e',
      'E4:e',
      'A4:e',
      'C5:e',
      'E4:e',
      'A4:e',
      'C5:e',
      'E4:e',
      'A4:e',
      'C5:e',
      'E4:e',
      'A4:e',
      'C5:e',
      'D4:e',
      'F4:e',
      'A4:e',
      'D4:e',
      'F4:e',
      'A4:e',
      'D4:e',
      'G4:e',
      'B4:e',
      'D4:e',
      'G4:e',
      'B4:e',
      'C4:e',
      'E4:e',
      'A4:e',
      'C4:e',
      'E4:e',
      'A4:e',
      'B3:e',
      'E4:e',
      'G#4:e',
      'B3:e',
      'E4:e',
      'G#4:e',
    ],
  },
];

// ── External bundled scores (already in assets/library/, NOT generated) ──────
// Real 2-staff MusicXML from the OpenScore Lieder Corpus (github.com/OpenScore/
// Lieder), released CC0 1.0 — free for commercial use, no attribution. Each is
// voice + piano: the multi-part "backing part" feature routes the piano staves
// to the learner and sings the vocal line. Composition PD worldwide (composers
// died > 70y). Provenance: docs/LICENSES/README.md.
const OS = 'https://musescore.com/openscore-lieder-corpus/scores/';
const EXTERNAL = [
  {
    file: 'beethoven_marmotte.musicxml',
    title: 'Marmotte, Op. 52 No. 7',
    titleJp: 'マルモット',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    level: 1,
    source: OS + '6491461',
  },
  {
    file: 'brahms_wiegenlied.musicxml',
    title: 'Wiegenlied, Op. 49 No. 4',
    titleJp: 'ブラームスの子守歌',
    composer: 'Johannes Brahms',
    composerJp: 'ブラームス',
    died: 1897,
    level: 2,
    source: OS + '5701612',
  },
  {
    file: 'schubert_heidenroslein.musicxml',
    title: 'Heidenröslein, D. 257',
    titleJp: '野ばら',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 2,
    source: OS + '30321236',
  },
  {
    file: 'schubert_an_die_musik.musicxml',
    title: 'An die Musik, D. 547',
    titleJp: '音楽に寄せて',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 2,
    source: OS + '6180725',
  },
  {
    file: 'schubert_standchen.musicxml',
    title: 'Ständchen, D. 957',
    titleJp: 'セレナーデ',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 3,
    source: OS + '5004835',
  },
  {
    file: 'schubert_die_forelle.musicxml',
    title: 'Die Forelle, D. 550',
    titleJp: 'ます',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 3,
    source: OS + '6900961',
  },
  {
    file: 'schubert_ave_maria.musicxml',
    title: 'Ave Maria, D. 839',
    titleJp: 'アヴェ・マリア',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 4,
    source: OS + '6389103',
  },
  {
    file: 'schubert_du_bist_die_ruh.musicxml',
    title: 'Du bist die Ruh, D. 776',
    titleJp: '君こそわが憩い',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 2,
    source: OS + '4919879',
  },
  {
    file: 'schubert_der_lindenbaum.musicxml',
    title: 'Der Lindenbaum (Winterreise No. 5)',
    titleJp: '菩提樹（冬の旅）',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 3,
    source: OS + '5016466',
  },
  {
    file: 'schubert_auf_dem_wasser.musicxml',
    title: 'Auf dem Wasser zu singen, D. 774',
    titleJp: '水の上で歌う',
    composer: 'Franz Schubert',
    composerJp: 'シューベルト',
    died: 1828,
    level: 3,
    source: OS + '29589203',
  },
  {
    file: 'schumann_du_bist_wie_eine_blume.musicxml',
    title: 'Du bist wie eine Blume, Op. 25 No. 24',
    titleJp: '君は花のごとく',
    composer: 'Robert Schumann',
    composerJp: 'シューマン',
    died: 1856,
    level: 2,
    source: OS + '6982729',
  },
  {
    file: 'schumann_die_lotosblume.musicxml',
    title: 'Die Lotosblume, Op. 25 No. 7',
    titleJp: '蓮の花',
    composer: 'Robert Schumann',
    composerJp: 'シューマン',
    died: 1856,
    level: 2,
    source: OS + '6909797',
  },
  {
    file: 'schumann_der_nussbaum.musicxml',
    title: 'Der Nussbaum, Op. 25 No. 3',
    titleJp: 'くるみの木',
    composer: 'Robert Schumann',
    composerJp: 'シューマン',
    died: 1856,
    level: 3,
    source: OS + '6891758',
  },
  {
    file: 'schumann_mondnacht.musicxml',
    title: 'Mondnacht, Op. 39 No. 5',
    titleJp: '月の夜',
    composer: 'Robert Schumann',
    composerJp: 'シューマン',
    died: 1856,
    level: 3,
    source: OS + '4987640',
  },
  {
    file: 'schumann_widmung.musicxml',
    title: 'Widmung, Op. 25 No. 1',
    titleJp: '献呈',
    composer: 'Robert Schumann',
    composerJp: 'シューマン',
    died: 1856,
    level: 4,
    source: OS + '6885211',
  },
  {
    file: 'clara_schumann_der_mond_kommt.musicxml',
    title: 'Der Mond kommt still gegangen, Op. 13 No. 4',
    titleJp: '月は静かにのぼり',
    composer: 'Clara Schumann',
    composerJp: 'クララ・シューマン',
    died: 1896,
    level: 2,
    source: OS + '5126921',
  },
  {
    file: 'hensel_schwanenlied.musicxml',
    title: 'Schwanenlied, Op. 1 No. 1',
    titleJp: '白鳥の歌',
    composer: 'Fanny Hensel',
    composerJp: 'ファニー・ヘンゼル',
    died: 1847,
    level: 3,
    source: OS + '5100543',
  },
];

mkdirSync(OUT_DIR, { recursive: true });
const manifest = { version: 1, scores: [] };
let total = 0;
for (const p of PIECES) {
  if (p.skip) continue;
  const { xml, measureCount } = buildScore(p);
  const file = `${p.id}.musicxml`;
  writeFileSync(join(OUT_DIR, file), xml, 'utf8');
  manifest.scores.push({
    file,
    type: 'solo',
    title: p.title,
    titleJp: p.titleJp,
    composer: p.composer,
    composerJp: p.composerJp,
    died: p.died,
    level: p.level,
    levelJp: LEVEL_JP[p.level],
    license: 'PD',
    source: 'generated',
    note: 'Own transcription of a public-domain composition',
  });
  total++;

  console.log(`✓ L${p.level} ${file.padEnd(30)} (${measureCount} bars)`);
}
for (const e of EXTERNAL) {
  manifest.scores.push({
    file: e.file,
    type: e.type || 'song',
    title: e.title,
    titleJp: e.titleJp,
    composer: e.composer,
    composerJp: e.composerJp,
    died: e.died,
    level: e.level,
    levelJp: LEVEL_JP[e.level],
    license: 'CC0',
    external: true,
    source: e.source,
    note: 'External CC0 file (OpenScore Lieder); voice+piano, played via multi-part backing',
  });
  total++;

  console.log(`✓ L${e.level} ${e.file.padEnd(30)} (external CC0)`);
}
manifest.scores.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));

// ── Legality gate: nothing non-PD/CC0 or un-PD may enter the manifest ─────────
const YEAR = new Date().getFullYear();
for (const s of manifest.scores) {
  if (!['PD', 'CC0'].includes(s.license))
    throw new Error(`${s.file}: license must be PD/CC0 (got ${s.license})`);
  if (!(s.died === 0 || s.died <= YEAR - 70)) {
    throw new Error(
      `${s.file}: composer died ${s.died} — not yet public domain (need died ≤ ${YEAR - 70} or 0=traditional)`
    );
  }
  if (!s.source) throw new Error(`${s.file}: missing provenance 'source'`);
}
// ── Orphan check: every .musicxml on disk must be registered above ────────────
const registered = new Set(manifest.scores.map((s) => s.file));
const onDisk = readdirSync(OUT_DIR).filter((f) => f.endsWith('.musicxml'));
const orphans = onDisk.filter((f) => !registered.has(f));
if (orphans.length) {
  throw new Error(
    `Unregistered .musicxml in assets/library/ (add to PIECES/EXTERNAL or delete): ${orphans.join(', ')}`
  );
}

writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`\nWrote ${total} scores + manifest.json → ${OUT_DIR} (all PD/CC0, no orphans)`);
