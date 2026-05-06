---
name: dev-workflow
description:
  Common commands and dev loops for Piano Visualizer. Reach for this when an
  agent needs to run, test, or build something and isn't sure which command
  applies.
---

# dev-workflow

## Daily commands

```bash
# Run the legacy single-file build on a LAN HTTPS server (production today)
pnpm legacy:serve                                  # PowerShell, port 8443
node --check app.js                                # quick syntax sanity

# Run the new Vite shell (in development)
pnpm dev                                           # http://localhost:5173 default
pnpm --filter @piano/web dev                       # same

# Build artifacts
pnpm build:web                                     # → packages/web/dist/
pnpm build:mobile                                  # → packages/mobile/dist/ + cap sync

# The big sweep agents must run before claiming "done"
pnpm verify                                        # lint + typecheck + test + build:web

# Individual pieces
pnpm lint                                          # eslint + prettier --check
pnpm lint:fix                                      # auto-fix
pnpm test                                          # all packages, all tests
pnpm test:watch                                    # while iterating
pnpm typecheck                                     # tsc --noEmit on every package
pnpm legacy:check                                  # node --check app.js + sw.js
```

## Per-package commands

```bash
pnpm --filter @piano/core test
pnpm --filter @piano/core typecheck
pnpm --filter @piano/web build
pnpm --filter @piano/mobile build:web
pnpm --filter capacitor-piano-midi build
```

## Capacitor

```bash
pnpm cap:sync                                      # after a vite build, propagate to ios/android
pnpm cap:open:ios                                  # open Xcode
pnpm cap:open:android                              # open Android Studio
pnpm cap:ios                                       # build + install on selected iOS device
pnpm cap:android                                   # same on Android
pnpm assets:generate                               # icon + splash from packages/mobile/assets/
```

## When something is wrong

| Symptom                                  | Likely cause                       | Fix                                                     |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `pnpm install` fails                     | corrupt store                      | `rm -rf node_modules .pnpm-store && pnpm install`       |
| ESLint complains about `legacy-app.js`   | should be ignored                  | check `.prettierignore` + `eslint.config.mjs` `ignores` |
| Vitest can't resolve `@piano/core`       | workspace not installed            | `pnpm install` to refresh links                         |
| `cap sync` says "missing native project" | `ios/` or `android/` not generated | `npx cap add ios` (Mac) or `npx cap add android`        |
| Pre-commit hook hangs                    | husky not installed                | `pnpm prepare` (runs husky install)                     |
| Mic permission failed locally            | non-HTTPS context                  | use `pnpm legacy:serve` (HTTPS) or `vite --https`       |
| `node --check app.js` syntax error       | broken edit                        | `git diff app.js` to find it                            |

## Git workflow (recommended)

```bash
git checkout -b agent/<short-task-slug>
# ... work ...
pnpm verify
git add <specific files>                           # avoid `git add .`
git commit -m "type(scope): subject"               # husky enforces format
git push -u origin agent/<short-task-slug>
gh pr create --draft --title "..." --body "..."
```

## Things NOT to run (without explicit human approval)

- `git push --force` to anything but your own agent branch
- `git reset --hard` outside an agent worktree
- `pnpm install` with `--force` flag
- Anything that writes to `~/.gnupg`, `~/.ssh`, keychain
- Anything signing iOS / Android builds (cert handling = humans only)

## Output expectations

- Tests: pass. If skipped, document why in the test name.
- TypeScript: 0 errors, 0 warnings on the strict baseline.
- ESLint: 0 errors, ≤5 warnings (pre-existing OK; new code = 0).
- Build: `dist/` exists, no chunk > 1.5MB except OSMD.
