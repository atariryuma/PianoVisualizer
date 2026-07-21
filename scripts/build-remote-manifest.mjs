// Build a manifest.json for a REMOTE catalog repo (the "download more free
// songs" source pinned by bundled-library.ts REMOTE_CATALOG).
//
// COPY THIS FILE into your own `piano-scores` repo. Run it in the folder that
// holds your CC0 `.musicxml` files:
//
//   node build-remote-manifest.mjs .
//
// It extracts composer (and a rough title) from each file and writes
// manifest.json in the same shape bundled-library.ts reads. THEN edit the
// output by hand to: fix titles (MuseScore/OpenScore <work-title> is often the
// opus/collection, not the song), set each `level` (1 初級 … 4 上級), and add
// `titleJp`/`composerJp` if you want Japanese labels.
//
// Dependency-free (regex, no DOMParser) so it runs anywhere with plain Node.
//
// LEGAL: only put files here that are CC0 / public-domain AND whose composer
// died > 70 years ago. This catalog is redistributed by the app — a mislabeled
// file is your liability. See docs/LIBRARY-FETCH-BRIEF.md.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || '.';
const LEVEL_JP = { 1: '初級', 2: '初中級', 3: '中級', 4: '上級' };

function pick(re, xml) {
  const m = xml.match(re);
  return m
    ? m[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim()
    : '';
}

// "chopin_prelude_op28_no7.musicxml" → "Prelude Op28 No7"
function titleFromFilename(file) {
  const stem = file.replace(/\.(musicxml|xml|mxl)$/i, '');
  const parts = stem.split(/_/);
  if (parts.length > 1) parts.shift(); // drop the composer-ish first token
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const files = readdirSync(dir)
  .filter((f) => /\.(musicxml|xml)$/i.test(f))
  .sort();

const scores = [];
for (const file of files) {
  const xml = readFileSync(join(dir, file), 'utf8');
  const composer = pick(/<creator type="composer">([^<]*)<\/creator>/, xml) || 'Unknown';
  const embeddedTitle =
    pick(/<work-title>([^<]*)<\/work-title>/, xml) ||
    pick(/<movement-title>([^<]*)<\/movement-title>/, xml);
  const cc0 = /CC0|creativecommons\.org\/publicdomain/i.test(xml);
  scores.push({
    file,
    title: titleFromFilename(file) || embeddedTitle, // filename usually cleaner than opus <work-title>
    titleJp: '',
    composer,
    composerJp: '',
    level: 2, // ← REVIEW: set 1..4
    levelJp: LEVEL_JP[2],
    license: 'CC0',
    external: true,
    _embeddedTitle: embeddedTitle, // for your reference; delete after review
    _cc0Detected: cc0, // false → confirm the license before shipping
  });

  console.log(
    `${cc0 ? '✓' : '⚠'} ${file}  (${composer})${cc0 ? '' : '  ← CC0 NOT detected in file — verify!'}`
  );
}

writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version: 1, scores }, null, 2) + '\n');

console.log(
  `\nWrote manifest.json with ${scores.length} scores. NOW: review titles + set each level (1-4), then delete the _embeddedTitle/_cc0Detected helper fields.`
);
