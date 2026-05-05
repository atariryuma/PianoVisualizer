# AGENTS.md — operating manual for autonomous AI coding

If you are an AI coding agent (Claude Code, Cursor, Codex, Continue, Aider,
etc.) picking up this repo, read this file first. It is the single source of
truth for **how to work here**, complementing `CLAUDE.md` (which describes
**what the code does**).

## TL;DR for the impatient agent

1. **Always run** `pnpm verify` before claiming "done". It runs
   `lint + typecheck + test + build:web`. If you can't get to green, your task
   isn't done.
2. **Two source-of-truth realities**:
   - `app.js` + `app.css` + `index.html` at repo root = **production today**.
   - `packages/**` = **migration target**. Engine extraction in progress.
   - Most tasks live in ONE of those two worlds. Don't straddle without reading
     the "Cross-cutting changes" section below.
3. **Work item discovery**:
   - **Open issues** labeled `agent-task` are the highest-priority queue.
   - `NEXT.md` lists the next 5–10 actionable extractions in execution order.
     Pick the top one if no issue is assigned.
   - `ROADMAP.md` shows the longer arc (phases 0a → 4).
4. **Playbooks** live in `.claude/skills/`. Match your task to the most relevant
   playbook and follow it verbatim. If no playbook fits, write one as part of
   your PR.
5. **Commits** must follow Conventional Commits (`type(scope): subject`). The
   husky `commit-msg` hook will reject malformed messages.
6. **PRs** must use the template at `.github/PULL_REQUEST_TEMPLATE.md`. The
   Compliance Check section is not optional — this is a kids' app.

## Trust ladder (what to do without asking)

| Level | Action                                                   | Allowed without asking?                                        |
| ----- | -------------------------------------------------------- | -------------------------------------------------------------- |
| 1     | Read any file                                            | Yes                                                            |
| 1     | Run `pnpm verify` / `pnpm lint` / `pnpm test`            | Yes                                                            |
| 1     | Run `node --check app.js` / `sw.js`                      | Yes                                                            |
| 1     | Run `gh pr view` / `gh issue list`                       | Yes                                                            |
| 2     | Edit files under `packages/`                             | Yes if scoped to your task                                     |
| 2     | Add tests under `packages/*/tests`                       | Yes                                                            |
| 2     | Edit docs under `docs/` (PRIVACY, COMPLIANCE, LICENSES)  | Yes                                                            |
| 2     | Update `CLAUDE.md`, `AGENTS.md`, `ROADMAP.md`, `NEXT.md` | Yes                                                            |
| 3     | Edit legacy `app.js` / `app.css`                         | Yes if your task says "legacy"                                 |
| 3     | Open a draft PR                                          | Yes                                                            |
| 3     | Run `pnpm install` (touches `pnpm-lock.yaml`)            | Yes if a deps change is part of your task                      |
| 4     | Force-push, rebase published branches                    | **Ask first**                                                  |
| 4     | `git reset --hard`, `git clean -fd` outside a sandbox    | **Ask first**                                                  |
| 4     | Merge to `main`, mark PR ready for review                | **Ask first**                                                  |
| 4     | Bump version in `package.json`, tag release              | **Ask first**                                                  |
| 5     | Touch certificates, secrets, store credentials           | **Never**                                                      |
| 5     | Submit App Store / Play Store builds                     | **Never** (humans only — needs Apple ID, signed certs)         |
| 5     | Add 3rd-party analytics, ads, IAP                        | **Never** without explicit human approval (kids-app violation) |

## Workflow

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. Pick task from open agent-task issue, NEXT.md, or user.   │
│ 2. Read the matching playbook in .claude/skills/.            │
│ 3. Branch: agent/<task-slug> off main.                       │
│ 4. Implement.                                                │
│ 5. `pnpm verify` → must be green.                            │
│ 6. Commit with Conventional message.                         │
│ 7. Open draft PR using template.                             │
│ 8. If task is multi-step, push intermediate commits — don't  │
│    sit on giant PRs.                                         │
│ 9. Notify human; do NOT mark PR ready-for-review autonomously.│
└──────────────────────────────────────────────────────────────┘
```

## Things that look like bugs but are intentional

These have caught past agents. Don't "fix" them:

- **`SHADOW_BLUR_ENABLED` overridden at runtime** in `app.js`. The CONFIG
  literal value is a default; `PERF_TIER` detection rewrites it. See
  `packages/core/src/render/perf-tier.ts`.
- **Duplicated `MAX_PARTICLES_3D` and `CONFIG.MAX_PARTICLES`**. Different caps
  for different purposes — the 3D layer ceiling is independent of the global
  pool ceiling. Don't unify.
- **`SECTION_IDS = ['A1', 'B', 'A2']` hardcoded**. Brittle but intentional —
  unlock plumbing in localStorage assumes these IDs. Schema migration is a
  separate, scheduled refactor (see ROADMAP.md Phase 0c).
- **`practice.audioOffsetMs` and `prefs.audioOffsetMs` two-tier**. Slider in
  settings overrides auto-detect; reset clears the override but uses a default
  until the next session. Intentional UX (no surprise re-calibration
  mid-session).
- **`#midiRescanBtn` element + handler appears unused**. Hidden via CSS
  `display: none`; kept as a back-compat shim because callsites still toggle
  `.visible` on it. Documented in app.js comments.
- **`/log` POST in `remoteLog`**. Gated by `REMOTE_LOG_ENABLED` (LAN dev only).
  Don't enable globally; native builds must strip entirely.
- **`commit-pinned jsDelivr URL`** for the music library. Pinned to a specific
  SHA on purpose (App Store 4.7 compliance). Bumping the SHA is a deliberate
  action with a docs/LICENSES audit attached.

## Cross-cutting changes (legacy ↔ packages)

If a change must touch BOTH `app.js` AND `packages/`:

1. Make the change in `packages/core/` first with a test.
2. Manually port the same change to `app.js`. Annotate with a comment:
   `// MIRROR of packages/core/src/<path> — keep in sync until Phase 0b complete.`
3. Open a follow-up issue tagged `phase-0b` to delete the mirror once the legacy
   build switches to the bundled core.

This is friction, but the cost of getting the two out of sync is worse.

## File-touching matrix

When you change X, also consider Y:

| Change                                 | Also update                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| New CONFIG key in `app.js`             | `CLAUDE.md` "Key Configuration" section                                                         |
| New i18n key                           | Both `en` and `jp` strings — never half. Default lang is `en`.                                  |
| New playbook                           | Add to `.claude/skills/` index in this file (below)                                             |
| New permission needed (mic, BLE, etc.) | `docs/PRIVACY.md`, `packages/mobile/README.md`, native manifest snippets                        |
| New external network endpoint          | `docs/PRIVACY.md` "Network access" table, `sw.js` cache list, `vite.config.ts` `runtimeCaching` |
| New bundled music score                | `docs/LICENSES/README.md`, `assets/`, `sw.js` `APP_SHELL`                                       |
| New CONFIG threshold tuned             | Comment with the empirical observation that prompted the change                                 |
| New `state.X` field                    | Pre-declare in the `state = { ... }` object literal (V8 hidden class stability)                 |

## Available playbooks

(`.claude/skills/<name>.md`)

- `extract-module` — move a function from `app.js` into `packages/core/`
- `add-song-to-library` — extend `ONLINE_LIBRARY` with a new piece
- `dev-workflow` — common commands cheat sheet
- `before-pr` — pre-PR self-review checklist
- `audit-compliance` — App Store / Play Store / COPPA scan
- `performance-tune` — adjust PERF_PROFILE / particle caps for new device tiers
- `bump-library-pin` — refresh the musetrainer commit SHA safely

## Definition of Done (DoD)

A task is done when ALL of:

- [ ] Acceptance criteria from the issue / playbook met
- [ ] `pnpm verify` green
- [ ] If touching legacy: `node --check app.js && node --check sw.js` green
- [ ] If new module: at least one Vitest test exists
- [ ] If user-visible: tested in desktop Chrome at minimum
- [ ] If user-visible AND has audio path: tested with mic OR MIDI
- [ ] PR template's "Compliance check" boxes all addressed (✓ or N/A)
- [ ] Commit messages follow Conventional Commits
- [ ] CHANGELOG.md (when it exists) has an entry, OR PR description includes one
      in fenced code

## Failure modes to watch for

- **Silent test pass** — if you add a `it.skip()` to make CI green, ESLint will
  warn but won't block. Reviewer will catch. Don't.
- **`pnpm verify` flakes** — if it passes locally and fails in CI, suspect
  pnpm-lock drift. Run `pnpm install` to refresh.
- **Editing `pnpm-lock.yaml` by hand** — never. Always regenerate.
- **Adding a new `data-i18n` key without entries in T_STRINGS** — the fallback
  is the literal key text, which leaks to users. Always add both `en` and `jp`
  strings.
- **Bypassing the husky hook with `--no-verify`** — leaves a footprint in git
  log; reviewer will ask why. Only acceptable for revert commits or
  clearly-justified emergencies.

## Communication

- **Don't write multi-paragraph PR descriptions.** 1–3 bullet summary + test
  plan + risks. The reviewer doesn't need narrative.
- **Don't add emoji to code comments**. Comments are for the next reader's
  cognition, not decoration. Emoji are fine in user-facing strings, Markdown
  docs, and commit titles.
- **Don't claim "done" until DoD is met.** "Implemented" ≠ "done".
- **If blocked**, push WIP commits + open draft PR + leave a clear question in
  the PR description. Don't burn cycles guessing.
