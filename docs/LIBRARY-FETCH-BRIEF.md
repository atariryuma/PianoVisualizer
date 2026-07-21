# Hand-off brief: fetch public-domain piano scores for the library

**For a coworker or an agent (Codex CLI / a non-sandboxed Claude Code) that HAS
network access.** The Claude Code instance in this repo cannot download files
(its network is sandboxed), so it authored its own MusicXML. If you can fetch
verified public-domain / CC0 scores, drop them in and it will integrate them.

Your job: **put clean MusicXML files into
`packages/web/public/assets/library/`** and record each file's provenance. Then
the in-repo agent verifies + wires them (manifest, difficulty grading, tests).

## The one rule that matters: license of the FILE, not just the composition

A composition being public domain (composer died > 70 years ago) does **not**
make a specific downloaded file free to ship. That file's engraving/arrangement
carries its own license. This app is **sold on the App Store (commercial)** and
is **kid-safe**, so:

- ✅ **Accept only:** files explicitly marked **Public Domain** or **CC0 /
  Public Domain Mark**. AND the composer died > 70 years ago (or it's an
  anonymous traditional tune).
- ⚠️ **CC BY / CC BY-SA:** allowed but you MUST record the author for
  attribution (SA also implies share-alike). Prefer PD/CC0 to keep it simple.
- ❌ **Reject:** **CC BY-NC** (non-commercial — we sell the app), CC with "No
  Derivatives" issues, anything with **no stated license**, MuseScore.com user
  uploads without a clear PD/CC0 tag, and any arrangement by a living/recent
  arranger.

If you cannot state a file's license from its source page, **do not bring it.**

## Format + shape

- **MusicXML**: `.musicxml` (uncompressed) or `.mxl` (zipped). Both import fine.
- **Solo piano**, 1 or 2 staves. Avoid full orchestral scores and giant files
  (keep each well under a few MB).
- Filenames: lowercase, `composer_title.musicxml` style (e.g.
  `chopin_prelude_op28_no7.musicxml`).

## Best sources (cleanest first)

1. **OpenScore** — `musescore.com/openscore-lieder-corpus` and
   `musescore.com/openscore-string-quartets`, mirrors at `github.com/OpenScore`.
   Released **CC0**. Export/download MusicXML. (Repertoire is Lieder + quartets,
   so limited solo piano — but 100% safe.)
2. **IMSLP / Petrucci** — per-piece. Only take a file whose page **states Public
   Domain**; many entries are PDF scans (skip — we need MusicXML), but some have
   MusicXML/MuseScore files. Record the IMSLP URL.
3. **Mutopia Project** (`mutopiaproject.org`, `github.com/MutopiaProject`) — PD
   or **CC BY-SA**; source is LilyPond, so export to MusicXML
   (LilyPond/MuseScore CLI). Record the typesetter for CC BY-SA attribution.

## Repertoire wish-list (all composition-PD; beginner → advanced)

Pick any of these — richer/complete editions are welcome (they beat our current
simplified single-line arrangements):

- **Beginner–easy:** Minuet in G (Petzold/Bach), Musette, Burgmüller "Arabesque"
  Op. 100, Schumann _Album for the Young_ pieces (Soldier's March, Melody),
  Clementi Sonatina Op. 36 No. 1 (1st mvt).
- **Intermediate:** Bach Prelude in C (BWV 846) full, Satie Gymnopédie No. 1 /
  Gnossienne No. 1, Chopin Prelude Op. 28 No. 7, Grieg lyric pieces, Beethoven
  "Für Elise" (full — we already bundle a copy), Pachelbel Canon (piano ed.).
- **Advanced:** Chopin Nocturne Op. 9 No. 2, Debussy Clair de Lune / Arabesque
  No. 1, Liszt Liebestraum No. 3, Chopin Fantaisie-Impromptu, Beethoven
  "Moonlight" 1st mvt.

## Do NOT bring (known traps)

- **"Mariage d'Amour"** / a "Chopin — Spring Waltz" (Paul de Senneville, 1978 —
  under copyright; Chopin never wrote it).
- **"Carol of the Bells"** if it's the Wilhousky (1936) arrangement.
- **Handel/Halvorsen "Passacaglia"** (Halvorsen d. 1935 — not PD in some
  life+100 countries yet).
- Any **film / video-game / pop** arrangement, or MuseScore.com uploads without
  a clear PD/CC0 tag.

## Record provenance (required)

For each file you add, append a line to a plain text file
`packages/web/public/assets/library/INCOMING.md` (create it) with:

```
filename.musicxml | Title | Composer (death year) | SOURCE_URL | LICENSE (PD/CC0/CC-BY-SA)
```

## What the in-repo agent will do after you drop the files

1. Render each in OSMD (headless) + confirm it parses and auto-sections.
2. Add a `manifest.json` row with a difficulty `level` (1–4) and JP labels.
3. Add a `docs/LICENSES/README.md` entry from your `INCOMING.md` line.
4. Run `pnpm typecheck` + the web tests + `pnpm build:web`, then commit.

So: **just get clean files into `assets/library/` + fill `INCOMING.md`.** Leave
the wiring, grading, and verification to the in-repo agent.
