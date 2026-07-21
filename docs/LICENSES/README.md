# Score Licenses

This directory contains per-score documentation that the app can rely on
public-domain status. Required for App Store Guideline 5.2.3 audio licensing
review (reviewers ask for license PDFs even for clearly-PD pieces).

## Bundled scores

| File                    | Composer                    | Publication / death + 70                    | Evidence                                                                                                   |
| ----------------------- | --------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `assets/fur_elise.mxl`  | L. v. Beethoven (1770–1827) | death + 70 = 1897 → public domain worldwide | [IMSLP page](<https://imslp.org/wiki/F%C3%BCr_Elise%2C_WoO_59_(Beethoven%2C_Ludwig_van)>)                  |
| `assets/alla_turca.mxl` | W. A. Mozart (1756–1791)    | death + 70 = 1861 → public domain worldwide | [IMSLP page](<https://imslp.org/wiki/Piano_Sonata_No.11_in_A_major%2C_K.331_(Mozart%2C_Wolfgang_Amadeus)>) |

## Downloadable library (musetrainer/library, pinned commit `9128876f6164d96997c877a2be843349a32bdabb`)

The library code (`legacy-app.js`, function `fetchLibrary`) only fetches files
from the pinned commit. To add a new commit:

1. Verify each new score's PD status (composer death + 70 OR pre-1925 US
   publication).
2. Update `LIBRARY_PINNED_SHA` in `legacy-app.js`.
3. Add per-piece evidence to this README.
4. Resubmit to App Store (the catalog change is a content change → 4.7 review).

Current pinned commit was reviewed on 2026-05-05; spot-checked composers: Bach,
Chopin, Pachelbel, Satie, Debussy — all died before 1955.

### ⚠️ Upstream is NOT independently trustworthy — we filter it ourselves

The `musetrainer/library` repo **describes** its catalog as "public domain" but
ships **no LICENSE file** and no per-score provenance, and its catalog is
self-described as "classical **and contemporary**". A 2026-07-21 audit of all 69
pinned `.mxl` files found at least one **clearly copyrighted** work mislabeled
as public domain:

- **"Mariage d'Amour"** — composed by **Paul de Senneville in 1978** (a living
  composer; Chopin never wrote it). It appears three times in the pinned repo,
  once **mis-attributed to Chopin** as "Spring Waltz": `Mariage_dAmour.mxl`,
  `Chopin_-_Spring_Waltz.mxl`, `Spring_Waltz_Mariage_dAmour_-_Chopin.mxl`.

These three files are **hard-excluded** in code via `LIBRARY_EXCLUDE`
(`packages/web/src/online-library.ts`) so they can never appear in-app, and the
cache key was bumped to `v3` to purge any pre-fix cache. **When bumping the
pinned SHA, re-audit the full file list and extend `LIBRARY_EXCLUDE` for any new
non-PD entry** — do not rely on the upstream "public domain" label.

Amber (kept, but noted): "Carol of the Bells" (Leontovych's _Shchedryk_ melody
is PD, d. 1921; only Wilhousky's 1936 English arrangement/lyrics are in
copyright — the instrumental melody is fine), "Bella Ciao — La Casa de Papel"
(traditional folk melody = PD; the title merely references a TV show), and
"Happy Birthday" (public domain in the US since the 2016 Warner/Chappell
settlement and in the EU since 2017).

### Two copyright layers (why the above matters)

Every score has two separable rights: (1) the **composition** — PD when the
composer died 70+ years ago, which covers the whole catalog EXCEPT the excluded
de Senneville piece; and (2) the **specific edition/transcription** (the
MusicXML encoding itself). Layer (2) is low-risk here: in the US and Japan a
faithful transcription of PD notation carries no new copyright (lack of
originality — _Feist_; 創作性なし), and Germany's §70 UrhG 25-year right applies
only to genuine **critical/scholarly editions**, which community MusicXML
transcriptions are not. We nonetheless can't _prove_ each file's provenance
(upstream gives none), which is the residual risk the SHA-pin + this audit + the
exclude-list are designed to bound.

### User-imported scores

Users may import their own MusicXML (`.mxl` / `.musicxml`). Imported files are
stored **only on the device** (IndexedDB) and are **never uploaded or
redistributed** by the app, so any copyright in a user's own import is the
user's responsibility — the app is a neutral tool (like a PDF viewer). The app
must not be marketed as a way to obtain copyrighted scores.

## Adding evidence PDFs

For each piece, drop a short PDF into this directory named like
`Composer_Title.pdf` containing:

- Composer name and dates
- Original publication year (if known)
- Country / jurisdiction
- A statement: "This work is in the public domain in the United States, Japan,
  the EU, and the UK because [composer died over 70 years ago / it was first
  published before 1925 / it is explicitly released under CC0]."
- Source URL (IMSLP, Mutopia, etc.)

A 1-page PDF per piece is sufficient. Apple reviewers have accepted these
screenshots-of-IMSLP-pages PDFs in 2024 submissions.

## License of this app's code

MIT. See top-level `LICENSE` file.

## License of dependencies

| Package                          | License             |
| -------------------------------- | ------------------- |
| Tone.js                          | MIT                 |
| OpenSheetMusicDisplay            | BSD-3-Clause        |
| JSZip                            | MIT or GPLv3 (dual) |
| Capacitor                        | MIT                 |
| capacitor-piano-midi (this repo) | Apache-2.0          |
