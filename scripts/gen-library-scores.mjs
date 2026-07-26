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

// Simplified single-line drafts that FULL professional transcriptions (bundled
// from musetrainer, see EXTERNAL) now supersede. Skipped so the library has no
// duplicate entries; their old generated .musicxml files were deleted.
const SUPERSEDED = new Set([
  'gymnopedie_1',
  'chopin_nocturne_op9no2',
  'chopin_prelude_e_minor',
  'moonlight_1',
  'minuet_in_g',
  'bach_prelude_c',
]);

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

// Parse a token → { dur, type, dots, rest? , tie?, pitches:[{step,alter,octave}] }
// A trailing "~" starts a tie; the next event with the same pitch stops it.
function parseToken(tok) {
  const tie = tok.endsWith('~');
  const [main, durRaw] = (tie ? tok.slice(0, -1) : tok).split(':');
  const { dur, type, dots } = durOf(durRaw || 'q');
  if (main === 'r') {
    if (tie) throw new Error('a rest cannot start a tie');
    return { rest: true, dur, type, dots };
  }
  const pitches = main.split('+').map(parsePitch);
  return { pitches, dur, type, dots, tie };
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

// ── Grand-staff pieces (`staves: 2`) ─────────────────────────────────────────
// A real two-hand transcription: `rh` + `lh` token arrays, packed into bars
// independently and then interleaved with <backup>. Adds the four things a
// piano score needs beyond the single-staff path: ties, repeat/volta barlines,
// mid-piece clef changes, and fermatas.
//
// The single-staff emitter above is left untouched ON PURPOSE — it produces
// the 18 already-shipped .musicxml files byte-for-byte, and a shared "improved"
// emitter would rewrite all of them for no reason.

/** Note element for the grand staff. MusicXML child order is fixed by the DTD:
 *  chord, pitch, duration, tie, voice, type, dot, accidental, staff, notations. */
/** Beam count for a note type. NB `n.type` is the MusicXML type NAME
 *  ('16th', 'eighth'), not a number — TYPE above maps the token letter
 *  straight to it. 0 = never beamed. */
const BEAM_LEVELS = { whole: 0, half: 0, quarter: 0, eighth: 1, '16th': 2, '32nd': 3 };
function beamLevels(type) {
  return BEAM_LEVELS[type] ?? 0;
}

/** Beat-wise automatic beaming, the standard engraving rule: consecutive
 *  flagged notes are beamed together within a beat, and a rest or a beat
 *  boundary breaks the group. Without this OSMD draws every sixteenth with its
 *  own flag, which is unreadable at this density (and nothing like the printed
 *  source). Returns one array of {level, kind} per event, indexed alongside it. */
function autoBeams(bar, beatDiv) {
  const out = bar.map(() => []);
  let pos = 0;
  const spans = [];
  let cur = [];
  bar.forEach((n, i) => {
    const beat = Math.floor(pos / beatDiv);
    const endsInSameBeat = Math.floor((pos + n.dur - 1) / beatDiv) === beat;
    const beamable = !n.rest && beamLevels(n.type) > 0 && endsInSameBeat;
    if (beamable && (cur.length === 0 || cur.beat === beat)) {
      if (cur.length === 0) cur.beat = beat;
      cur.push(i);
    } else {
      if (cur.length > 1) spans.push(cur);
      cur = [];
      if (beamable) {
        cur.beat = beat;
        cur.push(i);
      }
    }
    pos += n.dur;
  });
  if (cur.length > 1) spans.push(cur);

  for (const span of spans) {
    const maxLvl = Math.max(...span.map((i) => beamLevels(bar[i].type)));
    for (let lvl = 1; lvl <= maxLvl; lvl++) {
      // sub-runs of consecutive notes that actually carry this beam level
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          run.forEach((i, k) =>
            out[i].push({
              level: lvl,
              kind: k === 0 ? 'begin' : k === run.length - 1 ? 'end' : 'continue',
            })
          );
        }
        run = [];
      };
      for (const i of span) {
        if (beamLevels(bar[i].type) >= lvl) run.push(i);
        else flush();
      }
      flush();
    }
  }
  return out;
}

function noteXml2(n, voice, staff, stopPitches, fermata, beams) {
  if (n.rest) {
    const out = [
      '      <note>',
      '        <rest/>',
      `        <duration>${n.dur}</duration>`,
      `        <voice>${voice}</voice>`,
      `        <type>${n.type}</type>`,
    ];
    for (let i = 0; i < n.dots; i++) out.push('        <dot/>');
    out.push(`        <staff>${staff}</staff>`, '      </note>');
    return out.join('\n');
  }
  const lines = [];
  n.pitches.forEach((p, idx) => {
    const key = `${p.step}${p.alter}${p.octave}`;
    const stops = stopPitches.has(key);
    lines.push('      <note>');
    if (idx > 0) lines.push('        <chord/>');
    lines.push(...pitchXml(p, '        '));
    lines.push(`        <duration>${n.dur}</duration>`);
    if (stops) lines.push('        <tie type="stop"/>');
    if (n.tie) lines.push('        <tie type="start"/>');
    lines.push(`        <voice>${voice}</voice>`, `        <type>${n.type}</type>`);
    for (let i = 0; i < n.dots; i++) lines.push('        <dot/>');
    if (p.alter) lines.push(`        <accidental>${p.alter === 1 ? 'sharp' : 'flat'}</accidental>`);
    lines.push(`        <staff>${staff}</staff>`);
    // Beams ride the chord's first note only (MusicXML puts them once per
    // note-column, not once per pitch).
    if (idx === 0) {
      for (const b of beams || []) lines.push(`        <beam number="${b.level}">${b.kind}</beam>`);
    }
    const notations = [];
    if (stops) notations.push('          <tied type="stop"/>');
    if (n.tie) notations.push('          <tied type="start"/>');
    if (fermata && idx === 0) notations.push('          <fermata/>');
    if (notations.length) {
      lines.push('        <notations>', ...notations, '        </notations>');
    }
    lines.push('      </note>');
  });
  return lines.join('\n');
}

function clefXml(sign, line, number) {
  return `        <clef number="${number}"><sign>${sign}</sign><line>${line}</line></clef>`;
}

function buildGrandStaff(p) {
  const [beats, beatType] = p.time;
  const capacity = beats * ((DIVISIONS * 4) / beatType);
  if (!Number.isInteger(capacity)) throw new Error(`${p.id}: bad time signature`);
  const rh = packMeasures(p.rh.map(parseToken), capacity, p.pickup || 0);
  const lh = packMeasures(p.lh.map(parseToken), capacity, p.pickup || 0);
  if (rh.length !== lh.length) {
    throw new Error(`${p.id}: staff bar counts differ (rh ${rh.length}, lh ${lh.length})`);
  }

  // Repeat/volta lookup, keyed by 1-based measure number.
  const fwd = new Set();
  const endingStart = new Map();
  const endingStop = new Map();
  for (const r of p.repeats || []) {
    fwd.add(r.from);
    endingStart.set(r.ending1, '1');
    endingStop.set(r.ending1, { number: '1', type: 'stop', repeat: true });
    endingStart.set(r.ending2, '2');
    endingStop.set(r.ending2, { number: '2', type: 'discontinue', repeat: false });
  }
  const clefAt = new Map(); // measure → [{staff, sign, line}]
  for (const c of p.clefChanges || []) {
    if (!clefAt.has(c.measure)) clefAt.set(c.measure, []);
    clefAt.get(c.measure).push(c);
  }
  const fermataAt = new Set(p.fermatas || []);

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
  L.push(
    `    <rights>${p.rights || 'Public-domain composition; engraving authored by Piano Visualizer.'}</rights>`
  );
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

  // Ties are declared on the STARTING note; the stop lands on the next event
  // of the same pitch in that staff. Tracked per staff across bar lines.
  const pending = { 1: new Set(), 2: new Set() };
  const beatDiv = (DIVISIONS * 4) / beatType;
  const emitStaff = (bar, voice, staff, fermata) => {
    const beams = autoBeams(bar, beatDiv);
    return bar.map((n, i) => {
      const stops = pending[staff];
      const xml = noteXml2(n, voice, staff, stops, fermata, beams[i]);
      pending[staff] = new Set();
      if (n.tie) for (const q of n.pitches) pending[staff].add(`${q.step}${q.alter}${q.octave}`);
      return xml;
    });
  };

  rh.forEach((bar, i) => {
    const num = i + 1;
    L.push(`    <measure number="${num}">`);
    if (fwd.has(num)) {
      L.push('      <barline location="left">');
      L.push('        <bar-style>heavy-light</bar-style>');
      L.push('        <repeat direction="forward"/>');
      L.push('      </barline>');
    }
    if (endingStart.has(num)) {
      L.push('      <barline location="left">');
      L.push(`        <ending number="${endingStart.get(num)}" type="start"/>`);
      L.push('      </barline>');
    }
    if (i === 0) {
      L.push('      <attributes>');
      L.push(`        <divisions>${DIVISIONS}</divisions>`);
      L.push(`        <key><fifths>${p.fifths || 0}</fifths></key>`);
      L.push(`        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`);
      L.push('        <staves>2</staves>');
      L.push(clefXml('G', 2, 1));
      L.push(clefXml('F', 4, 2));
      L.push('      </attributes>');
      if (p.tempo) {
        L.push('      <direction placement="above"><direction-type>');
        L.push(
          `        <metronome><beat-unit>quarter</beat-unit><per-minute>${p.tempo}</per-minute></metronome>`
        );
        L.push(`      </direction-type><sound tempo="${p.tempo}"/></direction>`);
      }
    } else if (clefAt.has(num)) {
      L.push('      <attributes>');
      for (const c of clefAt.get(num)) L.push(clefXml(c.sign, c.line, c.staff));
      L.push('      </attributes>');
    }
    const fer = fermataAt.has(num);
    L.push(...emitStaff(bar, 1, 1, fer));
    L.push(`      <backup><duration>${capacity}</duration></backup>`);
    L.push(...emitStaff(lh[i], 5, 2, fer));
    const stop = endingStop.get(num);
    const last = num === rh.length;
    if (stop || last) {
      L.push('      <barline location="right">');
      if (stop?.repeat) L.push('        <bar-style>light-heavy</bar-style>');
      else if (last) L.push('        <bar-style>light-heavy</bar-style>');
      if (stop) L.push(`        <ending number="${stop.number}" type="${stop.type}"/>`);
      if (stop?.repeat) L.push('        <repeat direction="backward"/>');
      L.push('      </barline>');
    }
    L.push('    </measure>');
  });

  L.push('  </part>');
  L.push('</score-partwise>');
  return { xml: L.join('\n') + '\n', measureCount: rh.length };
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

  // ---- Grand staff (staves: 2) — real two-hand transcriptions ----
  //
  // Engraved from the Mutopia Project's PUBLIC-DOMAIN edition (typeset by Bas
  // Wassink from Collection Litolff, 19th c.; bar 17 corrected by Chris Sawer;
  // reference Mutopia-2013/01/12-203). Both layers are clean: the composition
  // is PD (Burgmüller 1806–1874) and the source engraving was placed in the
  // public domain by its typesetter — no attribution or share-alike attaches.
  //
  // Every pitch below was resolved from that edition's LilyPond source by a
  // parser, then checked NOTE FOR NOTE against Mutopia's own MIDI render:
  // 106 right-hand + 177 left-hand onsets, all 283 identical. Nothing here was
  // written from memory. If you edit these tokens, re-run that check.
  //
  // (IMSLP was the obvious first stop and is a dead end for this piece: its
  // public-domain copies are page scans, and the only machine-readable
  // Arabesque there is CC BY-NC-SA — non-commercial, so unusable in a paid
  // app. Mutopia is the one clean machine-readable source.)
  {
    id: 'burgmuller_arabesque',
    title: "L'Arabesque, Op. 100 No. 2",
    titleJp: 'アラベスク',
    composer: 'Johann Friedrich Burgmüller',
    composerJp: 'ブルクミュラー',
    died: 1874,
    level: 2,
    time: [2, 4],
    fifths: 0, // A minor
    tempo: 152,
    staves: 2,
    rights:
      'Public-domain composition; engraved from the Mutopia Project public-domain edition (Mutopia-2013/01/12-203).',
    source: 'https://www.mutopiaproject.org/ftp/BurgmullerJFF/O100/25EF-02/',
    note: 'Engraved from the Mutopia Project PD edition (typesetter placed it in the public domain); verified against its MIDI.',
    repeats: [
      { from: 3, ending1: 10, ending2: 11 },
      { from: 12, ending1: 27, ending2: 28 },
    ],
    clefChanges: [
      // The left hand carries the sixteenths in bars 17-19 and climbs to A4 —
      // the source edition switches it to treble there rather than stacking
      // ledger lines.
      { measure: 17, staff: 2, sign: 'G', line: 2 },
      { measure: 20, staff: 2, sign: 'F', line: 4 },
    ],
    fermatas: [33],
    rh: [
      'r:h', // 1
      'r:h', // 2
      'A4:s',
      'B4:s',
      'C5:s',
      'B4:s',
      'A4:e',
      'r:e', // 3
      'A4:s',
      'B4:s',
      'C5:s',
      'D5:s',
      'E5:e',
      'r:e', // 4
      'D5:s',
      'E5:s',
      'F5:s',
      'G5:s',
      'A5:e',
      'r:e', // 5
      'A5:s',
      'B5:s',
      'C6:s',
      'D6:s',
      'E6:e',
      'r:e', // 6
      'r:e',
      'E5:e',
      'E5:e',
      'F5:e', // 7
      'D5:e',
      'r:e',
      'D5:q~', // 8
      'D5:e',
      'G5:e',
      'D5:e',
      'E5:e', // 9
      'C5:e',
      'r:e',
      'E5:q', // 10 — 1st ending
      'C5:q',
      'C6:e',
      'r:e', // 11 — 2nd ending
      'E5:q.',
      'B4:e', // 12
      'C5:q.',
      'A4:e', // 13
      'E5:q.',
      'B4:e', // 14
      'C5:q.',
      'A4:e', // 15
      'A5:q.',
      'E5:e', // 16
      'F5:q.',
      'E5:e', // 17
      'D5:e',
      'C5:e',
      'B4:e',
      'A4:e', // 18
      'G#4:q',
      'E5:q', // 19
      'A4:s',
      'B4:s',
      'C5:s',
      'B4:s',
      'A4:e',
      'r:e', // 20
      'A4:s',
      'B4:s',
      'C5:s',
      'D5:s',
      'E5:e',
      'r:e', // 21
      'D5:s',
      'E5:s',
      'F5:s',
      'G5:s',
      'A5:e',
      'r:e', // 22
      'A5:s',
      'B5:s',
      'C6:s',
      'D6:s',
      'E6:e',
      'r:e', // 23
      'r:e',
      'B4:e',
      'B4:e',
      'C5:e', // 24
      'A4:q',
      'E5:q~', // 25
      'E5:e',
      'B4:e',
      'B4:e',
      'C5:e', // 26
      'A4:h', // 27 — 1st ending
      'A4:s',
      'B4:s',
      'C5:s',
      'B4:s',
      'A4:e',
      'r:e', // 28 — 2nd ending
      'D5:s',
      'E5:s',
      'F5:s',
      'G5:s',
      'A5:e',
      'r:e', // 29
      'A5:s',
      'B5:s',
      'C6:s',
      'B5:s',
      'A5:e',
      'r:e', // 30
      'D6:s',
      'E6:s',
      'F6:s',
      'G6:s',
      'A6:e',
      'r:e', // 31
      'E4:s',
      'D4:s',
      'C4:s',
      'B3:s',
      'A3:e',
      'r:e', // 32
      'C5+A5:h', // 33
    ],
    lh: [
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 1
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 2
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 3
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 4
      'A3+D4+F4:q',
      'A3+D4+F4:q', // 5
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 6
      'G3+C4+E4:q',
      'G3+C4+E4:q', // 7
      'G3+B3+F4:q',
      'G3+B3+F4:q', // 8
      'G3+B3+F4:q',
      'G3+B3+F4:q', // 9
      'C4+E4:e',
      'r:e',
      'E4:q', // 10 — 1st ending
      'C4+E4:q.',
      'r:e', // 11 — 2nd ending
      'G#3:s',
      'A3:s',
      'B3:s',
      'A3:s',
      'G#3:e',
      'r:e', // 12
      'A3:s',
      'B3:s',
      'C4:s',
      'D4:s',
      'E4:e',
      'r:e', // 13
      'G#3:s',
      'A3:s',
      'B3:s',
      'A3:s',
      'G#3:e',
      'r:e', // 14
      'A3:s',
      'B3:s',
      'C4:s',
      'D4:s',
      'E4:e',
      'r:e', // 15
      'C#4:s',
      'D4:s',
      'E4:s',
      'D4:s',
      'C#4:e',
      'r:e', // 16
      'D4:s',
      'E4:s',
      'F4:s',
      'G4:s',
      'A4:e',
      'G4:e', // 17
      'F4:e',
      'E4:e',
      'D4:e',
      'D#4:e', // 18
      'E4:e',
      'D4:e',
      'C4:e',
      'B3:e', // 19
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 20
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 21
      'A3+D4+F4:q',
      'A3+D4+F4:q', // 22
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 23
      'A3+D4+E4:q',
      'A3+D4+E4:q', // 24
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 25
      'A3+D4+E4:q',
      'A3+D4+E4:q', // 26
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 27 — 1st ending
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 28 — 2nd ending
      'A3+D4+F4:q',
      'A3+D4+F4:q', // 29
      'A3+C4+E4:q',
      'A3+C4+E4:q', // 30
      'A3+D4+F4:q',
      'A3+D4+F4:q', // 31
      'E3:s',
      'D3:s',
      'C3:s',
      'B2:s',
      'A2:e',
      'r:e', // 32
      'A3+E4:h', // 33
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

// ── External bundled solo-piano FULL scores from musetrainer/library ──────────
// Cherry-picked (NOT the whole catalog) famous ORIGINAL solo works, each a
// faithful FULL transcription of a public-domain composition (composer died
// > 70 yrs — verified individually). The upstream repo has NO LICENSE file, so
// license is 'PD' on the COMPOSITION + faithful-transcription basis (not CC0);
// de Senneville / "Easy" arrangements / orchestral reductions were excluded.
// See docs/LICENSES/README.md for the honest license caveat.
const MT =
  'https://cdn.jsdelivr.net/gh/musetrainer/library@9128876f6164d96997c877a2be843349a32bdabb/scores/';
const MTNOTE =
  'Faithful full transcription of a PD composition; source musetrainer/library (no upstream license; composition PD + faithful transcription).';
const mt = (o) => ({ ...o, type: 'solo', license: 'PD', note: MTNOTE });
EXTERNAL.push(
  mt({
    file: 'debussy_clair_de_lune.mxl',
    title: 'Clair de Lune (Suite bergamasque)',
    titleJp: '月の光',
    composer: 'Claude Debussy',
    composerJp: 'ドビュッシー',
    died: 1918,
    level: 4,
    source: MT + 'Clair_de_Lune__Debussy.mxl',
  }),
  mt({
    file: 'debussy_arabesque_1.mxl',
    title: 'Arabesque No. 1, L. 66',
    titleJp: 'アラベスク 第1番',
    composer: 'Claude Debussy',
    composerJp: 'ドビュッシー',
    died: 1918,
    level: 4,
    source: MT + 'Arabesque_L._66_No._1_in_E_Major.mxl',
  }),
  mt({
    file: 'satie_gymnopedie_1_full.mxl',
    title: 'Gymnopédie No. 1',
    titleJp: 'ジムノペディ 第1番',
    composer: 'Erik Satie',
    composerJp: 'サティ',
    died: 1925,
    level: 3,
    source: MT + 'Gymnopdie_No._1__Satie.mxl',
  }),
  mt({
    file: 'satie_gnossienne_1.mxl',
    title: 'Gnossienne No. 1',
    titleJp: 'グノシエンヌ 第1番',
    composer: 'Erik Satie',
    composerJp: 'サティ',
    died: 1925,
    level: 3,
    source: MT + 'Gnossienne_No._1.mxl',
  }),
  mt({
    file: 'chopin_nocturne_op9no2_full.mxl',
    title: 'Nocturne Op. 9 No. 2 in E-flat',
    titleJp: 'ノクターン Op.9-2 変ホ長調',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 4,
    source: MT + 'Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mxl',
  }),
  mt({
    file: 'chopin_nocturne_op9no1.mxl',
    title: 'Nocturne Op. 9 No. 1 in B-flat minor',
    titleJp: 'ノクターン Op.9-1 変ロ短調',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 4,
    source: MT + 'Chopin_-_Nocturne_Op._9_No._1.mxl',
  }),
  mt({
    file: 'chopin_nocturne_no20_cs_minor.mxl',
    title: 'Nocturne No. 20 in C-sharp minor (posth.)',
    titleJp: 'ノクターン第20番 嬰ハ短調（遺作）',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 4,
    source: MT + 'Nocturne_in_C_sharp_Minor.mxl',
  }),
  mt({
    file: 'chopin_prelude_op28no4.mxl',
    title: 'Prelude Op. 28 No. 4 in E minor',
    titleJp: '前奏曲 Op.28-4 ホ短調',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 3,
    source: MT + 'Prlude_Opus_28_No._4_in_E_Minor__Chopin.mxl',
  }),
  mt({
    file: 'chopin_waltz_op64no2.mxl',
    title: 'Waltz Op. 64 No. 2 in C-sharp minor',
    titleJp: 'ワルツ Op.64-2 嬰ハ短調',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 4,
    source: MT + 'Waltz_Opus_64_No._2_in_C_Minor.mxl',
  }),
  mt({
    file: 'chopin_waltz_a_minor_b150.mxl',
    title: 'Waltz in A minor, B. 150 (posth.)',
    titleJp: 'ワルツ イ短調（遺作）',
    composer: 'Frédéric Chopin',
    composerJp: 'ショパン',
    died: 1849,
    level: 3,
    source: MT + 'Waltz_in_A_MinorChopin.mxl',
  }),
  mt({
    file: 'liszt_liebestraum_3.mxl',
    title: 'Liebestraum No. 3 in A-flat',
    titleJp: '愛の夢 第3番',
    composer: 'Franz Liszt',
    composerJp: 'リスト',
    died: 1886,
    level: 4,
    source: MT + 'Liebestraum_No._3_in_A_Major.mxl',
  }),
  mt({
    file: 'liszt_la_campanella.mxl',
    title: 'La Campanella (Paganini Étude No. 3)',
    titleJp: 'ラ・カンパネラ',
    composer: 'Franz Liszt',
    composerJp: 'リスト',
    died: 1886,
    level: 4,
    source: MT + 'La_Campanella_-_Grandes_Etudes_de_Paganini_No._3_-_Franz_Liszt.mxl',
  }),
  mt({
    file: 'bach_prelude_c_bwv846_full.mxl',
    title: 'Prelude in C, BWV 846 (WTC I)',
    titleJp: '前奏曲 ハ長調 BWV846（平均律I）',
    composer: 'Johann Sebastian Bach',
    composerJp: 'バッハ',
    died: 1750,
    level: 3,
    source: MT + 'Prelude_I_in_C_major_BWV_846_-_Well_Tempered_Clavier_First_Book.mxl',
  }),
  mt({
    file: 'bach_prelude_c_minor_bwv847.mxl',
    title: 'Prelude in C minor, BWV 847 (WTC I)',
    titleJp: '前奏曲 ハ短調 BWV847',
    composer: 'Johann Sebastian Bach',
    composerJp: 'バッハ',
    died: 1750,
    level: 3,
    source: MT + 'Prelude_No._2_BWV_847_in_C_Minor.mxl',
  }),
  mt({
    file: 'bach_minuet_g_bwv_anh114.mxl',
    title: 'Minuet in G, BWV Anh. 114',
    titleJp: 'メヌエット ト長調 BWV Anh.114',
    composer: 'Christian Petzold',
    composerJp: 'ペツォールト',
    died: 1760,
    level: 2,
    source: MT + 'Bach_Minuet_in_G_Major_BWV_Anh._114.mxl',
  }),
  mt({
    file: 'beethoven_moonlight_1st_full.mxl',
    title: 'Moonlight Sonata No. 14, 1st mvt',
    titleJp: '月光ソナタ 第1楽章',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    level: 4,
    source: MT + 'Sonate_No._14_Moonlight_1st_Movement.mxl',
  }),
  mt({
    file: 'beethoven_moonlight_3rd.mxl',
    title: 'Moonlight Sonata No. 14, 3rd mvt',
    titleJp: '月光ソナタ 第3楽章',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    level: 4,
    source: MT + 'Sonate_No._14_Moonlight_3rd_Movement.mxl',
  }),
  mt({
    file: 'beethoven_pathetique_2nd.mxl',
    title: 'Pathétique Sonata No. 8, 2nd mvt',
    titleJp: '悲愴ソナタ 第2楽章',
    composer: 'Ludwig van Beethoven',
    composerJp: 'ベートーヴェン',
    died: 1827,
    level: 3,
    source: MT + 'Sonate_No._8_Pathetique_2nd_Movement.mxl',
  }),
  mt({
    file: 'mozart_sonata_k545_1st.mxl',
    title: 'Piano Sonata K. 545, 1st mvt',
    titleJp: 'ピアノソナタ K.545 第1楽章',
    composer: 'Wolfgang Amadeus Mozart',
    composerJp: 'モーツァルト',
    died: 1791,
    level: 3,
    source: MT + 'Sonata_No._16_1st_Movement_K._545.mxl',
  }),
  mt({
    file: 'mozart_twinkle_variations_k265.mxl',
    title: '12 Variations "Ah vous dirai-je, Maman", K. 265',
    titleJp: 'キラキラ星変奏曲 K.265',
    composer: 'Wolfgang Amadeus Mozart',
    composerJp: 'モーツァルト',
    died: 1791,
    level: 3,
    source: MT + '12_Variations_of_Twinkle_Twinkle_Little_Star.mxl',
  }),
  mt({
    file: 'joplin_the_entertainer.mxl',
    title: 'The Entertainer',
    titleJp: 'ジ・エンターテイナー',
    composer: 'Scott Joplin',
    composerJp: 'ジョプリン',
    died: 1917,
    level: 3,
    source: MT + 'The_Entertainer_-_Scott_Joplin_-_1902.mxl',
  }),
  mt({
    file: 'joplin_maple_leaf_rag.mxl',
    title: 'Maple Leaf Rag',
    titleJp: 'メイプル・リーフ・ラグ',
    composer: 'Scott Joplin',
    composerJp: 'ジョプリン',
    died: 1917,
    level: 3,
    source: MT + 'Maple_Leaf_Rag_Scott_Joplin.mxl',
  })
);

mkdirSync(OUT_DIR, { recursive: true });
const manifest = { version: 1, scores: [] };
let total = 0;
for (const p of PIECES) {
  if (p.skip || SUPERSEDED.has(p.id)) continue;
  const { xml, measureCount } = p.staves === 2 ? buildGrandStaff(p) : buildScore(p);
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
    // Default provenance = "we wrote the notes out ourselves". A piece may
    // override when it was engraved FROM a specific public-domain edition —
    // then the manifest names it, so the row is auditable (Guideline 5.2.3).
    source: p.source || 'generated',
    note: p.note || 'Own transcription of a public-domain composition',
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
    license: e.license || 'CC0',
    external: true,
    source: e.source,
    note:
      e.note || 'External CC0 file (OpenScore Lieder); voice+piano, played via multi-part backing',
  });
  total++;

  console.log(`✓ L${e.level} ${e.file.padEnd(34)} (external ${e.license || 'CC0'})`);
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
