# Score Licenses

This directory documents the public-domain status of every score the app ships.
Required for App Store Guideline 5.2.3 audio licensing review (reviewers ask for
license documentation even for clearly-PD pieces).

**The app fetches NO score from an outside catalog at runtime.** Every score is
bundled in the app and is one of: a built-in, one of the app's own PD
transcriptions, a **CC0** file we bundled (OpenScore Lieder), or a faithful full
transcription of a public-domain composition (see the musetrainer caveat below).
All are public-domain compositions and clean for a paid, worldwide release.

## Bundled built-in scores

| File                    | Composer                    | Publication / death + 70                    | Evidence                                                                                                   |
| ----------------------- | --------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `assets/fur_elise.mxl`  | L. v. Beethoven (1770–1827) | death + 70 = 1897 → public domain worldwide | [IMSLP page](<https://imslp.org/wiki/F%C3%BCr_Elise%2C_WoO_59_(Beethoven%2C_Ludwig_van)>)                  |
| `assets/alla_turca.mxl` | W. A. Mozart (1756–1791)    | death + 70 = 1861 → public domain worldwide | [IMSLP page](<https://imslp.org/wiki/Piano_Sonata_No.11_in_A_major%2C_K.331_(Mozart%2C_Wolfgang_Amadeus)>) |

## Song library (`assets/library/`)

**57 pieces**, all bundled (offline; no runtime fetch), graded beginner →
advanced, from three provenance-clean sources. Every entry's `license` +
`source` is embedded in `manifest.json` and machine-checked by the generator +
`bundled-library.test.ts` (license ∈ {PD, CC0}, composer died > 70 yrs, source
present, no orphans).

1. **18 our own transcriptions** (`*.musicxml`, `license: PD`) — engraved by us
   via [`scripts/gen-library-scores.mjs`](../../scripts/gen-library-scores.mjs);
   both layers clean (composition PD + engraving authored by us).
2. **22 full solo-piano scores from musetrainer** (`*.mxl`, `license: PD`) — see
   the caveat subsection below.
3. **17 CC0 OpenScore Lieder** (`*.musicxml`, `license: CC0`) — voice+piano, see
   the following subsection.

### 1 — Our own transcriptions (composition PD + we own the engraving)

| Level        | Pieces                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 初級**   | Twinkle Twinkle (Mozart), Mary Had a Little Lamb, Frère Jacques, Old MacDonald, London Bridge, Hot Cross Buns, Jingle Bells (Pierpont, 1893), Au Clair de la Lune, Lightly Row, Symphony No. 5 opening (Beethoven) |
| **2 初中級** | Ode to Joy (Beethoven), Canon in D theme (Pachelbel), In the Hall of the Mountain King (Grieg), New World Symphony Largo (Dvořák), Greensleeves, Scarborough Fair                                                  |
| **3 中級**   | Habanera / Carmen (Bizet), Toccata in D minor opening (Bach)                                                                                                                                                       |

(Our earlier simplified drafts of Minuet in G, Gymnopédie, Prelude in C,
Nocturne Op. 9/2, Prelude Op. 28/4 and Moonlight were replaced by the full
scores in §2.)

### 2 — Full solo-piano scores from `musetrainer/library` (⚠️ license caveat)

Famous **original solo-piano** works, **cherry-picked** (NOT the whole catalog)
and each verified individually as a **faithful, full transcription of a
public-domain composition** (composer died > 70 yrs). Pinned commit
`9128876f6164d96997c877a2be843349a32bdabb`; per-file source URLs are in
`manifest.json`.

**Caveat (documented honestly):** the upstream repo has **no LICENSE file**, so
these carry `license: PD` on the **composition** + **faithful-transcription**
basis, NOT an explicit grant. For a faithful transcription of a PD work the
note-data copyright is thin-to-none (US _Feist_; JP 創作性なし); some
jurisdictions grant a ~25-yr typographical right to a specific engraving, so
this is a slightly weaker basis than the CC0 files. Included per the project
owner's explicit, informed decision. **Deliberately excluded:** "Mariage
d'Amour"/"Spring Waltz" (de Senneville, 1978 — copyrighted), all
`Easy`/`beginner`/`fingered` simplified variants, orchestral reductions, and
malformed encodings.

| Level        | Pieces                                                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2 初中級** | Minuet in G BWV Anh. 114 (Petzold)                                                                                                                                                                                                                                                           |
| **3 中級**   | Gymnopédie No. 1 · Gnossienne No. 1 (Satie), Prelude in C BWV 846 · Prelude in C minor BWV 847 (Bach), Prelude Op. 28/4 · Waltz in A minor (Chopin), Pathétique 2nd mvt (Beethoven), Piano Sonata K. 545 1st · Twinkle Variations K. 265 (Mozart), The Entertainer · Maple Leaf Rag (Joplin) |
| **4 上級**   | Clair de Lune · Arabesque No. 1 (Debussy), Nocturne Op. 9/2 · Op. 9/1 · No. 20 c♯-minor · Waltz Op. 64/2 (Chopin), Liebestraum No. 3 · **La Campanella** (Liszt), Moonlight Sonata 1st & 3rd mvt (Beethoven)                                                                                 |

### CC0 external files — OpenScore Lieder Corpus (bundled 2026-07-21)

Seventeen real 2-staff MusicXML scores from the **OpenScore Lieder Corpus**
([github.com/OpenScore/Lieder](https://github.com/OpenScore/Lieder)), released
**CC0 1.0 Universal** (public-domain dedication — free for commercial use, no
attribution required; verified in each file's embedded rights). They are bundled
as app assets — no runtime fetch. Each is voice + piano; the app's multi-part
"backing part" feature (おともパート) routes the 2-staff piano part to the
learner and sings the vocal line.

| File                                       | Piece                                   | Composer (died)       | Source (musescore.com/openscore-lieder-corpus) |
| ------------------------------------------ | --------------------------------------- | --------------------- | ---------------------------------------------- |
| `beethoven_marmotte.musicxml`              | Marmotte, Op. 52 No. 7                  | Beethoven (1827)      | scores/6491461                                 |
| `brahms_wiegenlied.musicxml`               | Wiegenlied, Op. 49 No. 4                | Brahms (1897)         | scores/5701612                                 |
| `schubert_heidenroslein.musicxml`          | Heidenröslein, D. 257                   | Schubert (1828)       | scores/30321236                                |
| `schubert_an_die_musik.musicxml`           | An die Musik, D. 547                    | Schubert (1828)       | scores/6180725                                 |
| `schubert_standchen.musicxml`              | Ständchen, D. 957                       | Schubert (1828)       | scores/5004835                                 |
| `schubert_die_forelle.musicxml`            | Die Forelle, D. 550                     | Schubert (1828)       | scores/6900961                                 |
| `schubert_ave_maria.musicxml`              | Ave Maria (Ellens Gesang III), D. 839   | Schubert (1828)       | scores/6389103                                 |
| `schubert_du_bist_die_ruh.musicxml`        | Du bist die Ruh, D. 776                 | Schubert (1828)       | scores/4919879                                 |
| `schubert_der_lindenbaum.musicxml`         | Der Lindenbaum (Winterreise No. 5)      | Schubert (1828)       | scores/5016466                                 |
| `schubert_auf_dem_wasser.musicxml`         | Auf dem Wasser zu singen, D. 774        | Schubert (1828)       | scores/29589203                                |
| `schumann_du_bist_wie_eine_blume.musicxml` | Du bist wie eine Blume, Op. 25/24       | R. Schumann (1856)    | scores/6982729                                 |
| `schumann_die_lotosblume.musicxml`         | Die Lotosblume, Op. 25/7                | R. Schumann (1856)    | scores/6909797                                 |
| `schumann_der_nussbaum.musicxml`           | Der Nussbaum, Op. 25/3                  | R. Schumann (1856)    | scores/6891758                                 |
| `schumann_mondnacht.musicxml`              | Mondnacht, Op. 39/5                     | R. Schumann (1856)    | scores/4987640                                 |
| `schumann_widmung.musicxml`                | Widmung, Op. 25/1                       | R. Schumann (1856)    | scores/6885211                                 |
| `clara_schumann_der_mond_kommt.musicxml`   | Der Mond kommt still gegangen, Op. 13/4 | Clara Schumann (1896) | scores/5126921                                 |
| `hensel_schwanenlied.musicxml`             | Schwanenlied, Op. 1/1                   | Fanny Hensel (1847)   | scores/5100543                                 |

Composition PD worldwide (composers died > 70 years ago); file license CC0 →
zero residual liability. To add more from this corpus, drop the `.musicxml` in
`assets/library/` and add an `EXTERNAL` row in `scripts/gen-library-scores.mjs`.

### Why we removed the third-party `musetrainer/library` catalog (2026-07-21)

Earlier builds fetched scores from the `musetrainer/library` GitHub repo (via
jsDelivr, pinned to a commit SHA). An audit found that repo **describes** itself
as "public domain" but ships **no LICENSE file** and mislabels copyrighted work:

- **"Mariage d'Amour"** — composed by **Paul de Senneville in 1978** (a living
  composer), present three times incl. one mis-attributed to Chopin as "Spring
  Waltz". Plus many undocumented **arrangements** ("easy"/simplified/orchestral
  reductions) whose arranger — and therefore copyright status — is unknown, and
  one composition-layer straggler (Handel/**Halvorsen** Passacaglia, Halvorsen
  d. 1935, not PD in Mexico until 2035).

Because the app _redistributes_ whatever it serves, relying on an unverifiable
third-party "PD" label was a real exposure. The self-owned transcriptions above
remove the entire class of risk. **Do not re-introduce a runtime dependency on
an external score catalog.**

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
