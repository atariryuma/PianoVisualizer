---
name: add-song-to-library
description:
  Add a new piece to the in-app online library OR bundle a new piece as a
  hardcoded song. Use when a teacher requests a specific work, or when adding a
  flagship "must-have" piece to ship in the binary.
---

# add-song-to-library

Two paths depending on whether the piece is part of the curated online library
(downloadable) or a bundled flagship (always-available offline).

## Path A — add to the curated online library

For most pieces. Surfaces in the "Library" tab of the Add Song modal.

The library is whatever `musetrainer/library` contains at the pinned SHA. To add
a piece:

1. **Submit to upstream** — open a PR at https://github.com/musetrainer/library
   adding the `.mxl` file. Include PD evidence in the PR description.
2. Wait for it to merge.
3. **Bump our pin** — follow `.claude/skills/bump-library-pin/SKILL.md`.

This is the right path 90% of the time. If `musetrainer/library` rejects the
piece (off-topic, copyrighted, etc.), use Path B or fork their repo and pin to
your fork.

## Path B — bundle a new flagship piece

For Für-Elise-tier pieces that should ship in the binary and be available
offline. Currently: `fur_elise.mxl` and `alla_turca.mxl`.

### Steps

#### 1. Verify PD status

Add evidence PDF to `docs/LICENSES/Composer_Title.pdf` BEFORE writing code.

Update `docs/LICENSES/README.md`'s "Bundled scores" table.

#### 2. Drop the score files

Save BOTH formats to `assets/`:

- `assets/<id>.mxl` — compressed (~10× smaller, what OSMD loads)
- `assets/<id>.xml` — uncompressed (used for repeat parsing in
  `fetchPlaybackOrder`)

Where `<id>` is a short, lowercase, underscore-separated identifier
(`fur_elise`, `alla_turca`, `bach_invention_1`).

#### 3. Register in SONGS

In `app.js`, find `const SONGS = { ... }` (around line 5060) and add:

```js
const SONGS = {
  fur_elise: makeSong('fur_elise', 'furElise', 'composerBeethoven', '🌸', [
    {
      id: 'A1',
      nameKey: 'feA1',
      descKey: 'feA1desc',
      startMeasure: 0,
      isBoss: false,
    },
    {
      id: 'B',
      nameKey: 'feB',
      descKey: 'feBdesc',
      startMeasure: 23,
      isBoss: false,
    },
    {
      id: 'A2',
      nameKey: 'feA2',
      descKey: 'feA2desc',
      startMeasure: 55,
      isBoss: true,
    },
  ]),
  // ... existing songs ...
  bach_invention_1: makeSong(
    'bach_invention_1',
    'bachInv1',
    'composerBach',
    '🎼',
    [
      {
        id: 'A1',
        nameKey: 'biA1',
        descKey: 'biA1desc',
        startMeasure: 0,
        isBoss: false,
      },
      {
        id: 'B',
        nameKey: 'biB',
        descKey: 'biBdesc',
        startMeasure: 7,
        isBoss: false,
      },
      {
        id: 'A2',
        nameKey: 'biA2',
        descKey: 'biA2desc',
        startMeasure: 15,
        isBoss: true,
      },
    ]
  ),
};
```

Choose section boundaries by hand. Reference: open the score in MuseScore /
similar, find the natural form (A-B-A or intro-development-coda), pick boundary
measures.

#### 4. i18n strings

Add to `T_STRINGS` in `app.js`:

```js
bachInv1:        { en: 'Invention No. 1',          jp: 'インヴェンション第1番' },
biA1:            { en: 'Part 1: Theme',            jp: '第1章 主題' },
biA1desc:        { en: 'The opening subject',      jp: '冒頭の主題' },
biB:             { en: 'Part 2: Development',      jp: '第2章 展開' },
biBdesc:         { en: 'Sequence + modulation',    jp: 'シークエンスと転調' },
biA2:            { en: 'Part 3: Recapitulation',   jp: '第3章 再現' },
biA2desc:        { en: 'Subject returns + close',  jp: '主題の再現と終結' },
composerBach:    { en: 'J. S. Bach',               jp: 'バッハ' }
```

Both `en` and `jp` are required. Don't ship half.

#### 5. Start screen button

Add to `index.html` in the `<div id="modeButtons">` block:

```html
<button class="mode-btn primary practice-song-btn" data-song="bach_invention_1">
  <span class="mode-btn-label"
    >🎼 <span data-i18n="bachInv1">Invention No. 1</span></span
  >
  <span class="mode-btn-loading" data-i18n="starting">Starting...</span>
</button>
```

Place between the existing two song buttons and the user-songs list.

#### 6. Service worker cache

Add to `sw.js` `APP_SHELL`:

```js
'./assets/bach_invention_1.mxl',
'./assets/bach_invention_1.xml',
```

Bump `CACHE = 'piano-viz-v3'` so old clients refresh.

#### 7. Smoke test

```bash
pnpm legacy:serve
```

Open app → click new song button → verify:

- Title screen shows the new button
- Song panel renders sections (with auto-stars at 0)
- Practice starts; first note appears in lane; notes are detected

Test on iPad over LAN if possible.

#### 8. Commit + PR

```bash
git add assets/bach_invention_1.* app.js index.html sw.js docs/LICENSES/
git commit -m "feat(library): bundle Bach Invention No. 1

- Adds PD score (BWV 772) with 3 sections
- i18n strings for EN + JP
- Cached by sw.js v3
- License documentation per docs/LICENSES/

Closes #<issue>"
```

PR template's "Compliance" → check "music score bundled: PD evidence added".

## Reviewer will check

- [ ] Both `.mxl` AND `.xml` present in assets/
- [ ] PD evidence PDF in docs/LICENSES/
- [ ] i18n strings in BOTH `en` and `jp`
- [ ] Section boundaries are musical (not arbitrary measure thirds — that's the
      auto-section heuristic for user-added songs; bundled flagships get
      hand-curated boundaries)
- [ ] sw.js CACHE version bumped if APP_SHELL changed
- [ ] Start screen button matches existing styling

## Failure modes

- **Score has weird repeats** → `fetchPlaybackOrder()` may unfold them
  surprisingly. Check that the lane plays the piece in the order you expected.
- **Score is too long** (> 200 measures) → 3 sections feel huge. Consider
  shipping as multiple "songs" or extending the unlock schema (out of scope here
  — file an issue).
- **Score uses non-standard time signatures** (5/8, 7/8) → PERF mostly OK, but
  the metronome assumes 4/4. Verify metronome mode is sensible.
- **Composer name spelling** in EN vs JP → check both. Bach = バッハ; Mozart
  = モーツァルト; Chopin = ショパン. Stick with last-name-only katakana for JP
  conventions.
