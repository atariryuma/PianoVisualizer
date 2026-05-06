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
