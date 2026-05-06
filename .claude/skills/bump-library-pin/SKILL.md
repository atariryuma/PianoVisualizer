---
name: bump-library-pin
description:
  Refresh the musetrainer/library commit SHA used by the in-app library.
  Required for App Store 4.7 compliance — the pin guarantees the score catalog
  can't change between store submissions.
---

# bump-library-pin

The app's online music library is pinned to a specific GitHub commit SHA of
[`musetrainer/library`](https://github.com/musetrainer/library). This satisfies
App Store 4.7 (mini-app content reviewed as if shipped). To add new pieces or
update existing ones, follow this procedure.

## When to run

- A new piece you want is in the upstream repo at a newer commit.
- The upstream repo had bugfixes you want.
- Routine refresh (recommend yearly + before each App Store submission).

## Steps

### 1. Find the new SHA

```bash
curl -s https://api.github.com/repos/musetrainer/library/commits/master \
  | grep -m1 '"sha"' | cut -d'"' -f4
```

Copy the 40-char SHA. Compare with the current `LIBRARY_PINNED_SHA` in
`legacy-app.js` — if same, abort.

### 2. List what's new

```bash
OLD_SHA="$(grep -oP "LIBRARY_PINNED_SHA = '\K[a-f0-9]{40}" app.js)"
NEW_SHA="<paste from step 1>"

curl -s "https://api.github.com/repos/musetrainer/library/compare/$OLD_SHA...$NEW_SHA" \
  | grep '"filename"' \
  | grep -E '\.mxl"' \
  | sort -u
```

This is the list of `.mxl` files added/changed since last pin. Each one needs a
PD evidence entry.

### 3. Vet each new piece

For each new `.mxl`:

1. Look up the composer + work on IMSLP / Mutopia.
2. Verify either:
   - The composer died ≥ 70 years before the current year, OR
   - The work was first published before 1925 (US PD), OR
   - The piece is explicitly released under CC0 / Public Domain Mark.
3. Add a PDF or screenshot of the IMSLP page to `docs/LICENSES/`, named
   `Composer_Title.pdf`.
4. Add the row to `docs/LICENSES/README.md`'s downloadable-library table.

If ANY piece fails the PD check, **stop**. Either:

- Wait for upstream to remove it before bumping the pin, OR
- Fork `musetrainer/library`, remove the offending file, and pin to your fork
  instead.

### 4. Update the SHA

```bash
sed -i "s/$OLD_SHA/$NEW_SHA/g" app.js
sed -i "s/$OLD_SHA/$NEW_SHA/g" docs/LICENSES/README.md
```

### 5. Test that the API endpoint returns the new catalog

```bash
curl -s "https://api.github.com/repos/musetrainer/library/contents/scores?ref=$NEW_SHA&per_page=200" \
  | jq -r '.[] | select(.name | endswith(".mxl")) | .name' \
  | wc -l
```

Should report a positive number of `.mxl` files. If 0 or error, abort and
investigate (rate limit? wrong SHA? auth needed?).

### 6. Smoke test in dev

```bash
pnpm legacy:serve   # or pnpm dev once Vite is the primary
```

Open the app → "Add a song" → Library tab → confirm new catalog loads and at
least one new piece downloads + plays.

### 7. Commit + PR

```bash
git checkout -b agent/bump-library-pin-$NEW_SHA
git add app.js docs/LICENSES/
git commit -m "$(cat <<EOF
chore(library): bump musetrainer pin to $NEW_SHA

- Adds N pieces (list)
- All vetted as public domain; evidence in docs/LICENSES/
- Compatible with existing UI; no schema change

Closes #<issue>
EOF
)"
git push -u origin agent/bump-library-pin-$NEW_SHA
gh pr create --draft --title "chore(library): bump pin"
```

## Post-merge

Add a CHANGELOG entry (when the project has one):

```markdown
## [unreleased]

### Added

- N new public-domain pieces (Composer — Title, ...) via library pin bump
```

Update App Store submission notes — the next submission's review will include
the new content.

## Failure modes

- **GitHub API rate-limit hit during step 2 or 5** — wait an hour or
  authenticate (`GITHUB_TOKEN` env var picked up by `curl`).
- **PD check ambiguous** — if the composer died exactly 70 years ago, some
  jurisdictions may still hold copyright. Wait one more year or skip.
- **Modern arrangement of PD work** — a 1980 arrangement of Beethoven is
  copyrighted. Verify the upload itself is the PD original, not a derivative.
- **National differences** — Apple's audit usually applies US rules; if shipping
  in countries with longer terms (Mexico = 100 yrs), check separately.
