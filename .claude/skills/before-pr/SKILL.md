---
name: before-pr
description:
  Pre-PR self-review checklist. Run this before opening a PR (draft or
  otherwise) so review cycles stay short.
---

# before-pr

Run through this list IN ORDER. Stop and fix at the first failure.

## 1. Local sweep

```bash
pnpm verify
```

Must exit 0. If it doesn't:

- Lint errors → `pnpm lint:fix` and re-run
- Type errors → fix the type, don't `// @ts-ignore`
- Test failures → fix the test or the code, don't `.skip`
- Build error → check Vite config / imports

## 2. Legacy syntax

```bash
node --check app.js
node --check sw.js
```

Both must pass. If you didn't touch `app.js`, this still must pass — git might
have included an unrelated edit.

## 3. Diff review

```bash
git diff main --stat
git diff main
```

Look for:

- [ ] Files you didn't intend to modify (especially `pnpm-lock.yaml`,
      `package.json` in unrelated packages)
- [ ] Whitespace-only changes (Prettier auto-formatted unrelated lines)
- [ ] Debug `console.log` or `debugger` statements you forgot to remove
- [ ] TODO comments that say "fix later" — file an issue instead
- [ ] `any` types that could be tightened
- [ ] Translation keys added in only one of `en` / `jp`

## 4. Compliance scan

If your change touches anything user-facing (UI, network, storage):

- [ ] No new external link without parental gate
- [ ] No new third-party network endpoint without `docs/PRIVACY.md` entry
- [ ] No new permission without manifest entries (Info.plist / AndroidManifest)
- [ ] No bundled music score without `docs/LICENSES/` entry
- [ ] If you bumped `LIBRARY_PINNED_SHA`, you also vetted every new piece and
      added entries to `docs/LICENSES/`

## 5. Documentation

- [ ] If you added a new public API in `packages/core`, exports updated in
      `src/index.ts` AND mentioned in package README
- [ ] If you touched legacy `app.js` behavior, `CLAUDE.md` updated
- [ ] If you completed a NEXT.md item, it's marked `✅ DONE`
- [ ] If your change closes an issue, the PR mentions `Closes #N`

## 6. Test coverage

- [ ] New module → at least one Vitest test
- [ ] Bug fix → regression test that fails on `main`, passes on your branch
- [ ] No reduction in coverage on extracted modules

## 7. Commit hygiene

```bash
git log --oneline main..HEAD
```

- [ ] Each commit is a coherent, reviewable unit
- [ ] No commits that just say "wip" or "fix" (squash if you have these)
- [ ] Each subject follows Conventional Commits format
- [ ] Co-Authored-By line present if AI-authored

## 8. PR description

Use `.github/PULL_REQUEST_TEMPLATE.md` (auto-loaded by `gh pr create`). Fill all
sections, even with N/A. Empty checkboxes signal "didn't think about it" —
that's worse than checking N/A.

## 9. Push + draft

```bash
git push -u origin <branch>
gh pr create --draft --fill
# or with explicit body via heredoc — see extract-module playbook for example
```

**Always start as draft.** Mark ready-for-review only when human signs off.

## 10. Notify

Don't merge on your own. Wait for human review.
