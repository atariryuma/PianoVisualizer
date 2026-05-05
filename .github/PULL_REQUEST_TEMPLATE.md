<!-- Thank you for the PR! Please fill out the relevant sections. -->

## Summary

<!-- 1-3 bullet points: what changed and why. -->

## Scope

- [ ] Legacy single-file (`app.js` / `app.css` / `index.html`)
- [ ] `packages/core`
- [ ] `packages/web`
- [ ] `packages/mobile`
- [ ] `packages/plugins/capacitor-piano-midi`
- [ ] Docs / CI / infra only

## Compliance check (App Store / Play Store / Kids)

- [ ] No new external links exposed without parental gate (1.3 / 5.1.4)
- [ ] No analytics / tracking added (5.1.4)
- [ ] If MusicXML URL added: pinned to a specific commit SHA (4.7)
- [ ] If new permission introduced: documented in PRIVACY.md + native manifests
- [ ] If new music score bundled: PD evidence added to `docs/LICENSES/`
- [ ] N/A — pure refactor / docs / infra

## Test plan

- [ ] `pnpm verify` passes locally (lint + typecheck + test + web build)
- [ ] Legacy: opened `https://localhost:8443` in desktop Chrome and the change
      works
- [ ] Legacy: opened on iPad over LAN and the change works
- [ ] Mobile: built `@piano/mobile` and opened in iOS simulator (if applicable)
- [ ] Mobile: opened in Android emulator (if applicable)
- [ ] Tested with USB MIDI keyboard
- [ ] Tested with BLE-MIDI keyboard
- [ ] N/A

## AI agent note

<!-- If this PR was authored or edited by an AI agent, mention which one and which
     skill / playbook was followed. e.g. "Claude Sonnet via .claude/skills/extract-module.md" -->

## Screenshots / video

<!-- If user-visible, drop a clip. -->

## Risks

<!-- Anything that might break in production but isn't covered by tests. -->
