# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Piano Visualizer is a real-time piano practice app for **learners of any age** —
originally designed for upper-elementary children, and the kid-safe design (see
the banned-list below) is retained as a product value ("the honest, no-ads,
no-tracking, on-device practice app") for a broad audience of beginner-to-
intermediate self-learners, students, and teachers. It uses microphone audio
analysis (YIN pitch detection + multi-feature onset gating) and Web MIDI to
detect piano notes, then renders responsive visual effects on a canvas. The UI
is trilingual (EN / 日本語 / Deutsch).

**Release strategy (2026-07-20): iOS-first, App Store 4+ / Education category —
NOT the strict "Kids" category.** Rationale: the Kids category's requirements
(mandatory parental gates, no third-party analytics/ads, COPPA age-gating) are
heavy, and this app collects essentially no data (on-device processing, no
accounts, no third-party SDKs, only a SHA-pinned static library fetch), so a 4+
Education listing keeps compliance light while broadening the audience — without
giving up the kid-safe design. Keep the banned-list; keep "no ads / no tracking
/ audio stays on device" as the headline promise.

Version: **1.0** is the store marketing version (iOS `MARKETING_VERSION`).
Internal package/dev version tracks separately in `package.json` (0.14.x).

## Gamification: banned-list (kid-safety)

Empirical reviews (Veiga et al. 2025; arXiv 2412.05039 dark-patterns in mobile
games; Frontiers Educ 2024) consistently rank these patterns as the highest-harm
mechanics for under-13 users. **Do not add any of them**, even when the request
looks reasonable:

- **FOMO timers** ("offer expires in 23:59", limited-time rewards on
  songs/stamps). Time pressure flips intrinsic motivation extrinsic.
- **Public leaderboards with named ranks**. Social-pressure ranking doubles the
  streak-shame harm for kids 9-12.
- **RNG / loot-box / gacha mechanics**. Every stamp/seal predicate is
  deterministic. A kid must be able to _see and chase_ the goal.
- **Daily streak with loss/shame copy**. Use lifetime-days counters or
  best-streak (non-decreasing). Streak counters that decrement carry a measured
  harm score (Hanus & Fox 2015; Decision Lab "Streak Creep").
- **False-progress** (bars that never complete, infinite metas with no defined
  finish). Every progress bar must resolve to a reachable end.
- **Surveillance-style parent monitoring**. Földi 2024: passive parent
  monitoring flips kid motivation extrinsic. Any family/share surface must be
  _kid-initiated_, not parent-pulled.
- **Performance-contingent rewards**. Deci/Koestner/Ryan 1999: stamps on
  "perfect" gate intrinsic motivation. Reward attempts, improvement, and
  milestones instead. (Current stamps already follow this.)
- **Variable-ratio reinforcement on core progression**. Acceptable as decorative
  _celebration_ (visual effects), but never as gating.

## Repository structure

The repo is a pnpm workspace; **`packages/web` is the production entry**. Phase
0e retired both the repo-root 3-file shell and `legacy-app.js`. The browser app
boots from [`packages/web/src/main.ts`](packages/web/src/main.ts) into
[`packages/web/src/shell-bootstrap.ts`](packages/web/src/shell-bootstrap.ts).

**Engine + shell extraction status (2026-05-13)**: `@piano/core` holds the
DOM-free engine, and `packages/web/src/shell-*.ts` holds the typed browser
composition layer. `pnpm verify` currently covers lint, typecheck, ~1062 core
tests, ~2054 web tests, and the Vite web build (counts as of 2026-07-26).

**Type-narrowing status (2026-05-12)**: `osmd-cursor.ts` and
`shell-bootstrap.ts` are zero `any` references. Across
`packages/web/src/shell-*.ts` the count is 235 (down from 331 — ~29% reduction).
The remaining `any`s are mostly factory result pass-throughs (`Tone: any`,
`osmdAdapter: any`, `audioScheduler: any`) and the `} as any);` escape hatches
at ~25 createXxx() call sites; tightening those requires coordinated edits
across each upstream factory's deps interface.

```text
piano-visualizer/
├── packages/               # ★ Monorepo source of truth
│   ├── core/               # Pure-TS engine (DOM-free, testable, shared)
│   ├── web/                # ★ Vite PWA shell — production entry
│   │   ├── index.html      # Web app shell
│   │   ├── public/         # manifest + icon + assets/
│   │   └── src/
│   │       ├── app.css     # Vite-managed stylesheet
│   │       ├── main.ts     # Module entry — pins vendor globals, boots shell
│   │       ├── shell-bootstrap.ts  # High-level typed composition point
│   │       ├── shell-*.ts  # Browser shell factories
│   │       └── adapters/   # WebMIDI / WebAudio adapters
│   ├── mobile/             # Capacitor 6 wrapper (iOS + Android)
│   └── plugins/
│       └── capacitor-piano-midi/   # Native MIDI plugin (Swift + Kotlin)
│
├── gen_cert.ps1            # Windows mkcert wrapper → cert.pfx + rootCA.cer
├── gen_cert.sh             # Mac / Linux mkcert wrapper (same outputs)
├── https_server.ps1        # PowerShell HTTPS server (port 8443) — legacy
├── https_server.mjs        # Node HTTPS server (port 8443) — cross-platform,
│                           # used by `pnpm serve`
│
├── docs/
│   ├── PRIVACY.md          # Privacy policy (App Store + Play Store)
│   ├── COMPLIANCE.md       # Submission checklist (4.7 / 5.2.3 / Kids etc.)
│   └── LICENSES/           # Per-score PD documentation
│
├── .github/workflows/      # CI/CD (web + iOS + Android)
└── package.json            # pnpm workspaces root
```

## DOM wiring: silently dead controls (2026-07-25)

Adding one control touches **five** places: `index.html`, the `DomBag`
interface, `DOM_BAG_IDS`, the consuming module's own `*Dom` interface, and the
wiring at the `createXxx({ dom: ... })` call site. Miss the fifth and **nothing
complains** — the module's field is optional, the read is
`deps.dom.x?.addEventListener(...)`, and ~28 call sites still end in
`} as any)`, which disables deps type-checking outright. The control compiles,
ships, passes every unit test, and is inert on the device.

Three real instances existed:

- the judgement-strictness segment — added everywhere except the call site,
- `resExtra` / `resExtraRow` — so the "よけいな音 n" row below had **never**
  rendered,
- `connectBleMidi` declared `() => void` while settings-panel calls `.finally()`
  on its result (harmless only because the implementation is `async`).

Guards now in place, in order of preference:

1. **[`dom-wiring.test.ts`](packages/web/tests/dom-wiring.test.ts)** — a
   source-level audit: for every `createXxx` call site that builds a DOM bag,
   every field the target module declares AND reads must be provided. It found
   all three above, and it is itself guarded (it asserts it matched ≥5 call
   sites, so a refactor can't make it pass by matching nothing).
2. **Spread the bag** — `dom: { ...DOM, ...renamedOnly }`. Identity-named
   controls then wire themselves forever; only genuinely renamed entries are
   listed. `shell-settings.ts` does this now.
3. **Don't mark a shipped control optional.** `judgeEasy: HTMLElement | null`
   (required, nullable) makes the compiler point at the call site that forgot
   it; `judgeEasy?:` does not. Reserve `?:` for genuinely conditional DOM.
4. **Prefer removing `} as any)`** over adding to it. Removing it from
   `createSettingsPanel` immediately surfaced two real type errors it had been
   hiding, and again later: after `getNativeAudioLatencyMs` became async, the
   only reason the sync consumer still compiled was the `as any` at
   `createStartPracticeSection`. The remaining ~28 are known debt.

**Known gap, deliberately deferred.** The reason `} as any)` is tempting at all
is that `DomBag` types every entry as `HTMLElement`, so any module needing an
`HTMLInputElement` must cast — and `shell-settings` still hand-remaps 8
non-identity-named fields, so "just spread the bag" cannot yet be the mechanical
rule everywhere. The deep fix is to declare real element types in `DomBag` (one
cast inside `createDomBag`) and rename those 8 module fields to the bag's ids;
then every call site is literally `dom: DOM`, with the compiler — not a
regex-based test — giving the guarantee. That is a 29-call-site change and wants
its own pass.

## Single source of truth: packages/web

Phase 0e retired `legacy-app.js` on 2026-05-09. The flow is:

- `packages/web/src/main.ts` — module entry. Imports Tone / OSMD / JSZip /
  `@piano/core` from npm, pins each to `globalThis` for diagnostics, clears
  stale pre-Vite caches, then calls `ShellBootstrap.boot()`.
- `packages/web/src/shell-bootstrap.ts` — the high-level composition point for
  state, DOM bags, shell factories, modal routing, dev-mode hooks, and start
  buttons.
- `packages/web/src/shell-*.ts` and focused `*.ts` modules — typed browser shell
  code.
- `packages/web/src/app.css` — Vite-managed stylesheet.
- `packages/web/public/` — static assets (`manifest.json`, `icon.svg`,
  `assets/*.{mxl,xml}`) copied through unchanged at build time.
- `pnpm build:web` → `packages/web/dist/` is the deployable output.

When making changes, decide:

- Hot bug fix or new feature on existing behavior → edit the focused
  `packages/web/src/*.ts` module, `shell-bootstrap.ts` if it is composition
  only, and `packages/web/src/app.css` for styling.
- New abstraction or platform-specific code → edit `packages/*` and document the
  web/mobile call sites that need it.

The 9000-line `piano-visualizer.html` monolith was split into a 3-file shell on
2026-05-05; that 3-file shell was retired into `packages/web` on 2026-05-06 once
35 modules were extracted into `@piano/core`.

## Running the Application

The app requires HTTPS for microphone access (especially on iPad/Safari) and for
Service Worker registration. Cert generation is delegated to
[mkcert](https://github.com/FiloSottile/mkcert) so Chrome accepts the cert for
SW registration over both `localhost` and the LAN IP — the previous
self-signed-leaf-with-`CA:TRUE` approach passed page navigation but failed
Chrome's stricter SW SSL validator
(`Failed to register a ServiceWorker ... An SSL certificate error occurred when fetching the script`).

Two interchangeable HTTPS servers ship in the repo. They read the same
`cert.pfx` (password `piano123` or `$PIANO_CERT_PASS`), serve
`packages/web/dist/` on port 8443, write to `server.log`, and block the same
files (cert.pfx, gen_cert scripts, server.log) from the file tree:

- `https_server.mjs` — Node.js / cross-platform. `pnpm serve` uses this.
- `https_server.ps1` — PowerShell on Windows (legacy). `pnpm serve:ps`.

### Setup (one-time per dev machine)

#### Windows

1. `scoop install mkcert` (or `choco install mkcert`, or download `mkcert.exe`
   from [releases](https://github.com/FiloSottile/mkcert/releases) and put it on
   PATH).
2. `powershell -File gen_cert.ps1` — auto-detects LAN IP, runs `mkcert -install`
   (idempotent), outputs `cert.pfx` + `rootCA.cer`.
3. `pnpm serve` — runs `pnpm build:web` then `node https_server.mjs`.

#### Mac / Linux

1. `brew install mkcert nss` (the `nss` package covers Firefox / NSS trust
   stores). On Linux: `brew install mkcert` + `sudo apt install libnss3-tools`.
2. `./gen_cert.sh` — mirrors `gen_cert.ps1` (mkcert root install, LAN-IP
   auto-detect, leaf cert + `rootCA.cer` export). Set `PIANO_CERT_PASS` to
   override the default `piano123`.
3. `pnpm serve` — same as Windows.

Both flows produce `cert.pfx` (server leaf, gitignored) and `rootCA.cer` (mkcert
root CA in DER, for iPad / Android trust install). Re-run the cert generator any
time the LAN IP changes; the root stays the same so devices that already trust
`rootCA.cer` keep working.

Access at `https://localhost:8443/` (same machine — just works) or
`https://<host-ip>:8443/` (LAN — also works because mkcert's root is in the OS
trust store).

### iPad / strict-cert browser (Web MIDI Browser etc.) setup

This is a **one-time setup per iPad**. Once the mkcert root CA is installed,
every `cert.pfx` regeneration (LAN IP change, expiry, etc.) is picked up
automatically — no per-cert reinstall.

1. iPad Safari → `https://<host-ip>:8443/rootCA.cer` → tap through the cert
   warning once → tap **"Download Profile"** → **OK**.
2. **Settings → General → VPN & Device Management** → tap the downloaded
   _mkcert_ profile → tap **Install**.
3. **Settings → General → About → Certificate Trust Settings** → enable **mkcert
   development CA** as a trusted root.
4. Re-open `https://<host-ip>:8443/` in Web MIDI Browser — no more cert error.

For local development, any HTTPS-capable static server works once
`packages/web/dist/` is built.

### Agent / VSCode environment

- **Node + pnpm**: pinned via `.nvmrc` (Node 22.20.0) and
  `package.json#packageManager` (pnpm 9.12.3). `nvm use && corepack enable` on a
  fresh machine.
- **VSCode**: `.vscode/extensions.json` recommends ESLint, Prettier, Vitest
  Explorer, EditorConfig, and Claude Code. VSCode prompts on first open;
  `.vscode/settings.json` is gitignored so personal preferences stay local.
- **Claude Code permissions**: the project-shared baseline is
  `.claude/settings.json` (pnpm / node / git wildcards — safe). Per-machine
  permissions live in `.claude/settings.local.json` which is **gitignored**;
  Claude Code adds entries to it interactively on first use of a new tool.
  Skills live in `.claude/skills/` (markdown, cross-platform).

## Building

> **Deploying to a device: `pnpm deploy:ios`.** `pnpm verify` ends at
> `build:web`, which writes `packages/web/dist` — but `cap run ios` ships
> `packages/mobile/dist`, refreshed only by `build:mobile`. Running them
> separately puts a STALE bundle on the device and every observation from that
> session is worthless. (Compounding it, until 2026-07-25 `@piano/mobile#build`
> declared package-relative turbo `inputs` while actually compiling
> `packages/web` — so even `build:mobile` returned a cache hit after a
> web-source change.) Both are fixed, and rather than documenting "never use
> `cap:ios` alone", **`cap:ios` / `cap:android` now build first themselves** —
> the footgun is gone instead of being annotated.

```bash
pnpm install
pnpm build:web                 # → packages/web/dist/
pnpm --filter @piano/web dev   # vite dev server (port 8443) for HMR
pnpm serve                     # build:web + node https_server.mjs (any OS)
pnpm serve:ps                  # build:web + PowerShell server (Windows legacy)

pnpm build:mobile              # → packages/mobile/dist/ + cap sync
pnpm deploy:ios                # build:mobile + cap run ios (device / simulator)
pnpm cap:ios                   # alias for deploy:ios — builds, then runs
pnpm cap:open:ios              # just open the Xcode project (no build)
pnpm cap:android               # ⚠ fails until `cap add android` is run — the
                               #   Android host app is not generated yet
```

## MIDI input by platform

The app prefers Web MIDI input (polyphonic, velocity-aware) and falls back to
mic detection. Support is **not uniform across platforms**:

- **Desktop Chrome / Edge / Steam Deck browser**: Full Web MIDI API + USB MIDI +
  (on Chrome) BLE-MIDI. Best experience.
- **Android Chrome**: Web MIDI API works for **USB MIDI only**. BLE-MIDI devices
  are not enumerated (long-standing Chromium limitation). Users must connect via
  USB-C OTG or fall back to mic.
- **iPad / iPhone (any browser)**: **Web MIDI API is not implemented in WebKit**
  (Bug 107250, no roadmap). All iOS browsers use WebKit, so Chrome/Firefox/Edge
  on iPad are equally blocked. The app detects this via `isAppleMobile()` and
  surfaces a tooltip pointing users to the
  [Web MIDI Browser](https://apps.apple.com/us/app/web-midi-browser/id953846217)
  iOS app (a third-party browser that polyfills Web MIDI + BLE-MIDI). Without
  that app, iPad users are mic-only.
- **Native iOS/Android app (Phase 2+)**: Full MIDI via the
  [`capacitor-piano-midi`](packages/plugins/capacitor-piano-midi/) plugin —
  CoreMIDI on iOS, `android.media.midi` on Android. USB + BLE both work
  natively.
- **Roland GO:PIANO88 / similar BLE-MIDI keyboards**: Pairing via Roland Piano
  App / GarageBand works for native iOS apps but does **not** make the keyboard
  available to Safari. Don't pair via iOS Settings → Bluetooth either; Roland's
  docs say to pair through the music app.

### Input source: MIDI ↔ mic switching (2026-07-26)

**One flag was answering two different questions, and that is why there was no
switch.** `midiInput.enabled` means "a MIDI port is bound to the dispatcher" — a
hardware fact — but ~10 downstream sites read it as "MIDI is the input that
drives scoring and visuals", which is a routing decision. Because they were the
same boolean, the player's intent had nowhere to live: `attach()` set
`enabled = true` and called `suspendMic()` unconditionally, so plugging a
keyboard in silently ended acoustic play and **the only way back was to
physically unplug** (`detach()` → `resumeMic()`). Not an oversight — the model
had no room for a choice.

The two facts are now separate:

|                            | question                 | who answers                     |
| -------------------------- | ------------------------ | ------------------------------- |
| `midiInput.enabled`        | is a keyboard connected? | hardware (attach/detach, BLE)   |
| `ShellMidi.isMidiActive()` | are we listening to it?  | `prefs.inputSource` × `enabled` |

`resolveInputSource(pref, midiAttached)` in
[`input-source.ts`](packages/core/src/state/input-source.ts) is the pure
resolver; `describeInputSource` classifies the situation for UI. Rules:

- **`auto` is the default and follows the hardware** — a bound port wins
  (someone who connected a keyboard means to play it, and MIDI is strictly the
  better signal). This is the pre-existing behaviour, unchanged.
- **An explicit choice overrides the hardware in BOTH directions.** `mic` with a
  keyboard attached keeps the mic (the case that was previously
  unrepresentable); `midi` with nothing attached stays `midi`.
- **Pinned `midi` never silently falls back to the mic.** A fallback would flip
  the input mid-session while a keyboard boots / re-pairs / briefly drops — and
  since the judgement windows differ per input path (`JudgeProfile`), that means
  the _difficulty_ changing silently and the app scoring room noise. The UI says
  "waiting for a keyboard" instead (`InputSourceStatus.waiting`).
- **The choice persists** (`prefs.inputSource`, on the accept-list). An input
  selection that resets on reload is not a selection. Genre precedent: Synthesia
  lists every MIDI input with a per-device on/off; flowkey / Skoove / Simply
  Piano ask "keyboard or microphone?" at setup and let it be changed afterwards;
  Yousician exposes an Input setting; Rocksmith selects the device explicitly.
  All of them default to auto-detect and make the override explicit + sticky.

**Read the right one.** Hardware concerns (rescan policy, BLE takeover,
`verifyAlive`) keep reading `midiInput.enabled`. Everything that asks "which
device is the player playing" reads `isMidiActive()`: `mic-pipeline` (visual +
`activeNotes` gates), `practice-tick` (mic-onset scoring), `game-state-update`
(quality histories), `intro-hint-ui` (which hint + the mic meter),
`midi-dispatch` (whether a press reaches the scorer), `shell-practice` (the
judge profile, `micMode` chord relaxation, the result's `isExactInput`),
`mic-lifecycle` (whether boot acquires the mic at all), and
`latency-calibration` (which input the offset is measured on).

Consequences worth knowing:

- **The SELECTED SOURCE IS THE INPUT — no half-state.** With the mic pinned, a
  MIDI press is dropped at `midi-dispatch`: not scored, not reflected, no badge
  pulse, and `midi-indicator` stops naming the device. An earlier version kept
  the visual reflection on the reasoning that lighting the on-screen keyboard
  was "honest feedback that the device is alive"; device testing disproved it —
  reported as _"I switched to the mic but Bluetooth is still connected"_,
  because keys lighting up plus a "🎹 GO:PIANO88" badge is indistinguishable
  from the app still using the keyboard. Note-OFF is deliberately NOT gated, or
  a source switch mid-press would strand a lit key forever.
- **The port stays bound.** Switching back to 🎹 is instant and hot-plug /
  indicator / rescan logic keeps working; the app simply stops claiming it. The
  OS-level BLE link is not torn down.
- **`attach()` / `detach()` only move the mic when the resolved source agrees**,
  so connecting a keyboard no longer takes the mic from a mic-pinned player, and
  a dropped keyboard no longer hands a keyboard-pinned player the room mic.
- **A connected-but-ignored keyboard is stated out loud** (`inputMidiIdleFmt` →
  "🎙️ マイク入力 ・ GO:PIANO88 は使いません"). That is the one state a player is
  guaranteed to read as a bug unless the app says it.
- UI: the ⚙ → Input section's segment (`#inputSrcAuto` / `#inputSrcMidi` /
  `#inputSrcMic`) writes the pref; `ShellMidi.applyInputSourcePref()` resolves
  and moves the mic. The panel never touches the mic itself.
- **One predicate, one name.** "Did the player pin this source?" is
  `PianoCore.isPinnedTo(pref, source)`, and the modules that need it take the
  whole `getInputSourcePref` rather than a bespoke boolean — it briefly had
  three names (`isMicPinned`, `isMicExplicitlyChosen`, `isMidiPinned`), two of
  which were the same predicate.
- **`InputSourceStatus.waiting` is THE "is any input live" answer**, and
  `micUsable` folds in `micSuspended` as well as the two failure flags. The mic
  meter, the pill's ⏳ state and the intro hint all read it; they used to build
  three different conjunctions of the same raw flags and disagree.

### Startup: which input comes up, and when (2026-07-26)

`mic-lifecycle.decideInitialInputMode()` runs once, from `initAudio()` on ▶. Two
phases, and the ORDER is the whole design:

**Phase 1 — settle the MIDI question, but only when its answer matters.**
Probing before touching the mic is what keeps a keyboard user free of a
permission prompt, a privacy LED, and idle YIN/FFT. But it sits on the critical
path to the microphone, so:

- **`inputSource === 'mic'` → the probe is skipped entirely.** No MIDI answer
  can change the decision, so waiting for one is pure startup latency on exactly
  the path that player is waiting on.
- **Otherwise it runs, BOUNDED** by `MIDI_PROBE_TIMEOUT_MS` (1.2 s). Normally it
  resolves instantly — boot already fired `initWebMIDI()` and `midi-init` now
  shares that promise — so this only bounds a stalled CoreMIDI bridge, which
  previously meant no keyboard AND no mic with nothing on screen saying why.

**`initWebMIDI()` is idempotent by SHARING ITS PROMISE, not by returning
early.** Boot does `void initWebMIDI()`; the ▶ path does `await initWebMIDI()`.
With the old `if (_accessRequested) return`, that await resolved instantly while
the boot probe was still in flight, so the mic decision could be taken against
an unknown MIDI state: no port seen yet → acquire the mic (prompt + LED) → the
probe lands, finds a keyboard, and `attach()` suspends the mic again.

**The play screen does not wait for the microphone.** `initAudio()` resolves as
soon as the audio GRAPH is built and kicks `decideInitialInputMode()` WITHOUT
awaiting it. It used to await it, and because `installStartButton` does
`await initAudio(); showRunningUI();`, every free-play start sat on the title
screen for the length of a `getUserMedia` device open — **measured at ~430 ms on
the iPad**, and reported as "it takes a while to switch to the mic". Nothing on
screen needs the stream: the graph is complete, the render loop reads the
analyser (silence until the source lands), and the mic meter is switched on by
`acquire()` itself. With a keyboard attached the decision costs ~0 ms anyway,
since it never calls `getUserMedia`. Two consequences to keep in mind:

- **The in-flight window is part of the model.** `decideInitialInputMode` sets
  `micSuspended = true` for its whole duration, so `describeInputSource` reports
  `waiting` until a stream actually exists. Without that the app spent those
  ~430 ms claiming `active: 'mic', waiting: false` with nothing open — the meter
  and the pill believing it.
- **Nothing else may await the MIDI probe in front of ▶.** `initAudio`'s
  re-entry branch used to `await initWebMIDI()`; now that `midi-init` shares its
  boot promise that re-enumerates nothing, so it was pure unbounded delay. A
  keyboard attached since the last init arrives via the statechange listener and
  the rescan poller, which are the paths that actually re-enumerate.

[`boot-session.test.ts`](packages/web/tests/boot-session.test.ts) pins the
transition gating at runtime (a held-open `initAudio` must not show the play
screen);
[`startup-contract.test.ts`](packages/web/tests/startup-contract.test.ts) pins
the two source-level halves that have no runtime seam.

**Phase 2 — the decision table.** `foreign` = an iOS WKWebView wrapper that
polyfills Web MIDI but is NOT ours (Web MIDI Browser); see below.

| `inputSource` | keyboard attached | environment         | outcome                                  |
| ------------- | ----------------- | ------------------- | ---------------------------------------- |
| `midi`        | any               | any                 | mic never acquired (`midi-detected`)     |
| `auto`        | yes               | any                 | mic never acquired (`midi-detected`)     |
| `auto`        | no                | foreign iOS wrapper | mic skipped (`ios-wmb-skipped`)          |
| `auto`        | no                | anything else       | mic acquired                             |
| `mic`         | any               | any                 | mic acquired — even in a foreign wrapper |

**"Foreign wrapper" must not match our own app.** The test used to be
`isAppleMobile() && navigator.requestMIDIAccess exists`, and on the Capacitor
build that function exists _because we install it_ — so our own native app,
which ships `NSMicrophoneUsageDescription` and a working mic, was classified as
a browser whose `getUserMedia` is broken. Consequence on device: MIDI declared
as the input, zero ports attached, mic never asked for — **an iPad with no input
at all, from which `auto` could never recover**.
`isNativeMidiPolyfillInstalled()` separates the two. The same misclassification
had produced three separate symptoms, all fixed together:

1. `mic-lifecycle` — the mic was never acquired (no input at all).
2. `midi-indicator` — the practice pill showed 🎹⏳ "waiting for MIDI" while the
   settings panel said 🎙️. It also read the RESCAN POLLER as a proxy for "no
   input yet"; that poller runs from boot whenever no port is attached,
   including a perfectly working mic session. It now reads
   `InputSourceStatus.waiting`.
3. `intro-diag` — free play opened with "🎹 MIDI待機中… tap ⚙ then 🔵" over a
   live microphone. Suppressed on our own build unless the player pinned `midi`,
   in which case nothing else IS listening and the nudge is correct.

**`resume({explicit})` — an explicit choice outranks a platform heuristic.**
`micIntentionallySkipped` means "we chose not to even ask here". A player
picking 🎙️ in settings is better evidence than that guess, so the explicit path
attempts the acquire anyway; failure surfaces honestly via
`micPermissionFailed` + the intro hint. A successful acquire clears the flag (it
means "never attempted", and we just succeeded) — leaving it set would silently
re-block the next resume and keep the background MIDI poller running.

**Diagnostics.**
`[INPUT] pref=… active=… attached=… waiting=… midiIdle=… micSuspended=… micSkipped=… micFailed=…`
is emitted on every input-state change (deduped) and once at boot, and
`[AUDIO] mic ready in Nms (midi-probe Nms, getUserMedia Nms)` times the startup
phases. Both are `console.log`, which Capacitor forwards to the device log — the
native build hard-disables `remoteLog`. They exist because "the pill says MIDI
but settings says mic" and "the mic takes a while" are questions about the
SCREEN and the CLOCK that three rounds of device logs could not answer.

### MIDI pipeline invariants (2026-05-12, connection pass 2026-07-23)

The MIDI cluster was reshaped on 2026-05-12 to keep the connection + reflection
flow platform-uniform and predictable; a 2026-07-23 "connection smoothness" pass
(M1-M4) brought the entry points up to industry standard. The contracts the
cluster now relies on:

- **Boot-time init (M1).** `initWebMIDI()` runs at the END of
  `shell-bootstrap.boot()` — NOT lazily on song select. Repeat visits with a
  granted permission connect silently on the title screen; the statechange
  listener + rescan poller exist from t=0, and native-iOS OS-sheet pairing done
  on the title screen is no longer dropped (`native-midi-polyfill` portChange
  needs a live access singleton). `reconnectKnownBle()` fires right after it.
- **Multi-port binding (M2).** `midi-ports.ts` keeps a `boundPorts` Set and
  binds the dispatcher to EVERY eligible input (the Chrome-sample "listen on all
  inputs" pattern) — dual-port keyboards (DAW+MIDI) and multi-device setups no
  longer lose the real keyboard to enumeration order. `midiInput.port` is the
  FIRST bound port (display anchor); detach of one port promotes the next and
  only empties → full teardown (mic resume + poller). `onstatechange` attaches
  even while `enabled` (attach dedupes); the connected chip fires only on the
  first port. Mirrored-event dupes die in midi-dispatch's 30 ms dedupe. BLE
  takeover unbinds the whole set via `unbindAll()`.
- **BLE auto-reconnect (M3).** Every GATT handshake is timeout-wrapped (15 s;
  `gatt.connect()` on a non-advertising device pends FOREVER by spec).
  `gattserverdisconnected` → teardown (mic back immediately) + backoff retries
  (~23 s) against the same device; `reconnectKnown()` uses
  `navigator.bluetooth.getDevices` (feature-detected) for chooser-less boot
  re-pairing. The settings 🔵 button keeps the panel OPEN during the attempt
  ("接続中…" in the input pill), auto-closes only on success.
- **devicechange touches MIDI too (M4).** The debounced devicechange handler
  drops the MIDIAccess cache + fires one silent rescan when MIDI is unattached
  (runs even pre-session); the audio-recovery half stays `isRunning`-gated.
  Detach/BLE-drop now restore the mic meter when the mic is actually usable.
- **`sysex:true` only on Apple mobile.** Boot-time `requestMIDIAccess` is
  `{sysex:false}` everywhere except iPad/iPhone Web MIDI Browser, where BLE-MIDI
  requires sysex. This stops Chrome from surfacing a SysEx permission prompt on
  every page load.
- **WMB quirk-pass (`state!=='connected'` loose attach) is Apple-mobile only.**
  On desktop / Android the spec-strict pass is enough; a loose attach there
  could grab transient pre-init ports (IAC Driver mid- bringup, USB still
  negotiating descriptors).
- **Visual reflection runs without a session.** `onMidiNoteOn` always updates
  `midiState.activeNotes` + the chord-window reducer so the on-screen keyboard
  lights up even before ▶ Start. Flow / combo / particle bursts / quality
  histories stay gated on `state.running`.
- **Mic muting follows the RESOLVED source, for the whole time it is MIDI.**
  Both `mic-pipeline.ts` and `game-state-update.ts` mute mic-driven visuals +
  history pushes whenever `isMidiActive()` (see the input-source section above —
  this used to be `midiInput.enabled`, which made a mic-pinned player's own
  playing invisible). The previous "MIDI active within 2 s" window let mic data
  leak back in during silent gaps between presses; a plain resolved check does
  not.
- **Reconnect is always one-shot polling.** `detach` (Web MIDI) and
  `onGattDisconnect` (BLE-MIDI) both `startMidiAutoRescan()` so a hot-replug
  recovers without user action. The poller self-stops the moment anything
  re-attaches.
- **Auto-rescan during practice still enumerates.** `isPaused()=true` (=
  `practice.enabled`) skips only the periodic `ensureAccess(true)` call (=
  force-fresh `MIDIAccess` re-request, the source of dt=50 ms frame spikes per
  server.log 03:52). Plain enumeration via the cached access still runs so
  mid-practice hot-plugs recover.
- **`attach()` respects BLE.** If `bleMidi.connected`, attach skips so a
  parallel Web MIDI port can't silently overwrite the BlePortMarker.
- **`attach()` binds the dispatcher before flipping `enabled`.** Mic pipeline
  mutes itself the instant `enabled` flips; the old ordering left a tiny window
  where a note-on between `enabled=true` and `onmidimessage=handler` was
  silently dropped.
- **Practice cursor needs `state.running` AND `practice.enabled`.** A press
  while practice is enabled but the session is paused (settings panel,
  post-section result card) no longer phantom-advances the cursor.

## Architecture

### Audio Pipeline

```text
Microphone → getUserMedia (AGC/noise suppression disabled, 48000 Hz forced)
  → GainNode (Software AGC)
    → Main AnalyserNode (FFT 4096, smoothing 0.82) — pitch detection + visualization
    → Onset AnalyserNode (FFT 2048, smoothing 0.15) — transient/onset detection
```

Sample rate is locked to 48000 Hz at AudioContext creation to dodge the AirPods
24/48 sample-rate flip (WebKit Bug 154538). On `devicechange` (headphone
plug/unplug) the entire AudioContext is closed and recreated — `suspend/resume`
alone is unreliable on iOS WKWebView per WebKit Bugs 237878 and 261554.

### Detection Layers (evaluated every frame)

1. **YIN Pitch Detection** — time-domain autocorrelation algorithm detecting
   piano notes (25–5000 Hz). Uses CMNDF with parabolic interpolation.
2. **Multi-Feature Onset Gate** — 5-condition classifier using spectral flux,
   spread, flatness, crest factor, and harmonicity. Prevents sustained noise
   from registering as notes. Gate stays open for `ONSET_GATE_DURATION_MS` after
   a valid onset.
3. **Harmonicity Gate** — checks energy at integer-ratio harmonics of the
   detected fundamental. Piano has strong harmonic partials; voice/speech does
   not. Rejects non-piano audio.
4. **Session Confidence Layer** — sliding-window state machine
   (`waiting → warmup → performing`) that requires sustained piano detection
   before enabling full game mechanics.

### Performance tier

`PERF_TIER` is detected at startup from `navigator.deviceMemory`,
`hardwareConcurrency`, and UA hints. Maps to `PERF_PROFILE`:

- **low** (iPad 10, low-end Android): 400 particles, no shadowBlur.
- **mid** (iPad Air 4+ / mid-range Android): 600 particles, shadowBlur on.
- **high** (M-series iPad / desktop): 1200 particles, shadowBlur on.

Override via `localStorage.pianoViz_perfTier = 'low'|'mid'|'high'`.

### Software AGC

Custom gain control via `GainNode` (browser's built-in AGC is disabled).
Smoothly adjusts gain between 1×–40× to normalize quiet/loud pianos. Voice
suppression: if multiple consecutive onsets are rejected (non-piano), AGC
temporarily limits max gain to prevent amplifying speech.

### Game Systems

- **Flow meter** (0–100): rises with good notes, decays during silence. Affected
  by combo, pitch stability, and quality score.
- **Combo**: consecutive notes within `COMBO_WINDOW_MS`. Drives encouragement
  tiers.
- **Stages**: 6 visual tiers
  (`Awakening → Blooming → Aurora → Cosmos → Radiance → Legend`) triggered by
  flow thresholds.
- **Quality scoring**: rhythm regularity (IOI coefficient of variation) +
  dynamics variation + pitch stability, weighted 40/35/25.
- **Per-note feedback grades (real-time, multi-dimensional, 2026-07-22)**: a
  correct note used to give one flat center burst + a 2-tier chip ("Perfect!" /
  "Nice!"). Now the two graded dimensions the result card reports (timing +
  note-length) are shown LIVE, per note, so the kid sees _how_ they did — the
  reaction that makes practice feel rewarding. Pure selectors in `@piano/core`:
  `resolveTimingGrade(dtSignedMs, perfectMs, greatMs?)` →
  `perfect | great | early | late` (direction-aware), and
  `resolveLengthGrade(heldMs, expectedMs, tolMs, goodFrac?)` →
  `good | short | long`. The web mapping lives in
  [`practice-scoring.ts`](packages/web/src/practice-scoring.ts):
  - **Press (timing)** → a grade-coloured chip (gold=perfect, green=great,
    blue=early/late) and a **grade-scaled celebration AT the pressed key**:
    burst and soft ring in the **note's own colour** (synesthesia/theme via
    `noteColor` — the same palette free play and the lane tiles use, 2026-07-22)
    plus a rising light **stream** (`spawnStream`) on clean (perfect/great) hits
    — free-play visual parity. The grade lives in the chip colour, the effect
    size (20→8 particles), and the tile bloom. Guided mode is always "perfect".
  - **Release (length)** → its own colour channel so it doesn't fight the timing
    chip: a **good hold** shows a cyan pulse at the key (no text); a **short /
    long** hold shows a gentle low nudge chip (`lengthShort` / `lengthLong`) +
    amber pulse. Two-sided (good is celebrated), gentle framing (banned-list: no
    shame).
  - **Unified chip placement (2026-07-22)**: every per-note verdict chip —
    timing, wrong-note "you played X", the tick's auto-Miss, and the length
    nudge — rides the pressed/missed note's key x (clamped on-screen,
    `CHIP_EDGE_PX`), in two bands: `CHIP_Y_FRAC` (0.6) for press verdicts,
    `LENGTH_CHIP_Y_FRAC` (0.82) for release nudges. They used to be scattered
    (timing/miss centered, length at the key).
  - **Tile hit bloom** (`render/lane.ts` `drawHitBloom`): at the moment of a
    correct press the falling tile itself blooms — two soft, phase-offset light
    rings expanding outward (a water-ripple 爽快感) + a quick bright core flash,
    additive-blended so they read as light not paint, decaying over ~380 ms.
    Driven by `LaneNoteView.hitFxMs` (wall-clock, stamped by scoring on hit) so
    it animates smoothly even when the guided clock freezes; absent/stale → no
    bloom. Replaces the old "tile just turns green" so the hit MOMENT on the
    note feels satisfying.
  - Kept deliberately soft (modest particle counts, gentle colours) so richer ≠
    noisier — the app's relaxing feel is preserved. `spawnRipple` is pool-capped
    (≤24) so fast passages can't saturate.
- **Judgement system coherence pass（2026-07-25）**: an audit of "what the
  player sees per note" vs "what the result reports" found the two were
  unrelated systems. Four root fixes:
  - **One judgement vocabulary, untranslated.** The verdict words were
    half-localized — a JP player saw `Perfect!` / `Great!` (loanwords with no
    `jp` entry) mixed with 「⏱ ちょっと早いよ」「弾いた音: C4」 in the same
    passage. All momentary verdicts are now short English caps in every locale:
    **PERFECT / GREAT / GOOD / MISS**, `✗ C4` for a wrong key, and `HOLD LONGER`
    / `HOLD SHORTER` on release. This is the genre convention (beatmania / DDR /
    SDVX / CHUNITHM label judgements in English caps over a Japanese UI — a
    verdict must be readable in peripheral vision in <200 ms). These are TIERS
    ONLY: no per-note direction wording (see the judgement section for why).
    Everything that isn't a momentary verdict (settings, result prose, lane hand
    labels) stays fully localized.
  - **Timing judgement rebuilt on `JudgeProfile` / `judgeTiming`** — see the
    dedicated section under Architecture. Four defects fixed at the root: the
    tier and the credit were computed separately and contradicted each other,
    the `EARLY` tier was mathematically unreachable, the tap window was
    asymmetric (1 : 2.9), and the boundaries were not frame-aligned.
  - **`JudgeTally` — one source of truth** (`@piano/core` `createJudgeTally` /
    `resetJudgeTally` / `record{Timing,Length,Miss}Judgement` /
    `summarizeJudgements`). Lives on `practice.judge`, reset **in place** at
    section start (no hidden-class churn on the hot path). Written by the same
    `judgeTiming` call that picks the chip (practice-scoring) and by the
    auto-miss (practice-tick); read by the lane HUD and the result card. The
    continuous score sums still feed the STAR maths — this tally feeds
    everything the player is SHOWN, so live and result cannot disagree.
    `summarizeJudgements` derives accPct / cleanPct / mean signed + absolute
    deviation / standard deviation + unstable rate / lean direction, and refuses
    to claim a lean below `JUDGE_TENDENCY_MIN_SAMPLES` (4) or inside
    `JUDGE_TENDENCY_MIN_MS` (25).
  - **Per-channel chip throttle.** `showHitChip` was throttled to one chip per
    100 ms **globally**, so a release nudge (lower band) swallowed the next
    note's timing verdict (upper band) at eighth-note speed — the feedback
    looked arbitrary. The throttle is now per `channel` (`PRESS_CHIP_CHANNEL` /
    `RELEASE_CHIP_CHANNEL`); the two bands never overprint, so they have no
    reason to share a budget. Callers that pass no channel share the default
    bucket (free-play hits, MIDI-connected toasts).
- **Rhythm-game standard pass（音ゲー業界標準化, 2026-07-23）**: an audit vs
  genre conventions (Synthesia / Melodics / Rocksmith) closed eight gaps:
  - **Lane beat grid**: `buildLaneBeatGrid` (section-notes.ts) emits
    measure/beat lines from the measureGrid (same countIn anchor + tempo scale
    as the notes, GO downbeat included, closing barline at section end); songs
    without a grid get a uniform beatMs/beatsPerMeasure fallback
    (shell-practice.ts). Drawn by `lane.ts` (accent 0.13 / beat 0.05 alpha, beat
    lines skipped under 18 px spacing).
  - **Resume runway**: `practice-visibility.ts thaw()` rewinds ≈2 beats
    (`getResumeRewindMs`, clamp [900, 2500] ms) on pause/background resume for
    rhythm/listen — Transport `.seconds` seeks back in lockstep and the
    forward-only amortized cursors (laneDrawFromIdx / \_cursorScanIdx) reset so
    the rewound span redraws; unresolved notes get a second chance. Guided is
    exempt (its clock waits).
  - **Quick restart**: ↻ `#ptbRestart` in the practice top bar — one-tap
    same-section retry (was ✕ → song panel → ▶, 3 taps).
  - **Note speed (hi-speed)**: `prefs.noteSpeed` slow/normal/fast (1.45 / 1 /
    0.7 × lookahead ONLY — judgement windows, count-in, and audio are
    untouched). Settings-panel segment, persisted, live-applied mid-run via
    `recomputePracticeTimings`.
  - **Mash resistance**: a rhythm-mode MIDI wrong-press breaks `sectionCombo`
    and increments `practice.extraPresses`; the result card shows a
    "よけいな音 n" fact row (`#resExtraRow`, hidden at 0). No score deduction
    (accuracy stays hits/target — banned-list gentle), but sweeping every key no
    longer clears with a full combo. Mic onsets exempt (misdetection).
  - **Practice-option memory**: per-song `lastSettings` (P2-20) now also carries
    `ghostOn` / `metronomeOn`.
  - **Live HUD**: thin section-progress gauge on the top-bar pill
    (`#ptbProgressFill`, 10 Hz) + a live combo in the lane from 5 (rhythm only;
    fades silently on break — no shame).
  - **Loop lead-in**: loop laps start at count-in minus 2 clicks
    (`startPracticeSection(idx, {lapLead:true})` → Transport offset start) —
    timeline/judgement identical, just less waiting per lap.
- **Three visible judgement bands + the hit-error bar**: the lane paints PERFECT
  (bright core), GREAT (soft green) and GOOD (pink) from the active
  `JudgeProfile` — symmetric, so all three tiers are readable before the note
  lands — and an osu!-style hit-error bar under the hit line showing where the
  recent presses actually landed. Previously only PERFECT + one asymmetric
  window were drawn, and there was no direction feedback at all beyond a tier
  label that could not fire.
- **Live judgement HUD（2026-07-25, rhythm only）**: the lane used to show a
  lone small `×N` at the right edge, which says nothing about accuracy, nothing
  about how clean the hits were, and vanishes the moment it breaks — mid-run the
  player had no way to read their own state. `render/lane.ts` now draws the
  genre-standard pair:
  - **Combo centred above the hit line** (number + `COMBO` caption, grows 30→40
    px with the streak, capped). Centre because that is where the eyes already
    are; the right-edge chip was outside the reading path.
  - **Judgement panel, top-right of the lane**: running accuracy % (`--` until
    the first verdict, so a run never opens at a discouraging 0%) over the
    per-tier counts, dimmed at 0 so the full scale stays legible. Fed
    `practice.judge` directly — the same object every frame, accuracy derived
    with integer math, so the panel costs **zero per-frame allocation**. Labels
    and colours come from `TIMING_TIER_STYLE` in `@piano/core` — the ONE
    judgement vocabulary, read by the live chips, the lane panel and the result
    breakdown alike, and not plumbed through `t()` (there is nothing to
    localize). Guided/listen pass `null` (guided grades every press `perfect` by
    design, so a breakdown there would claim a timing quality that was never
    measured).
- **Encouragement system**: replaces numeric combo display with escalating
  bilingual messages (`Nice! → Great! → ... → Awesome!`), each triggering a
  unique visual effect.
- **Result: per-note judgement breakdown（2026-07-25）**: the result card
  reported only rolled-up percentages, so a run that produced 40 individual
  verdicts ended as "Timing 78%" — no breakdown, no direction, and no link back
  to what the player had just been shown note by note. `result-card.renderJudge`
  (`#resJudge`) now paints the analysis from the snapshot's `JudgeTally`:
  - a **proportional stacked bar** (shape of the run before any number is read),
  - **per-tier counts** in the same words the chips used
    (`PERFECT n GREAT n EARLY n LATE n MISS n`, zeros dimmed not dropped),
  - **`judgeSpreadFmt`** — mean ABSOLUTE deviation ("how tight",
    direction-free),
  - **`judgeTendency{Late,Early}Fmt` / `judgeTendencyEven`** — which way the
    playing leaned + the one adjustment it implies. This is the genre-standard
    deviation read-out (beatmania FAST/SLOW counts, osu! mean error). `even` is
    a genuine compliment with its own positive line, not a fallback, and below
    the sample floor the card says **nothing** rather than guessing.
  - the same treatment for holds (`GOOD / SHORT / LONG` +
    `judgeHold{Short,Long}`), shown only when releases were actually scored
    (mic-only practice has no note-off).
  - The count labels stay untranslated (they must match the chips); the prose is
    localized (it is coaching, not a verdict). Rhythm only. The snapshot holds a
    **copy** of the tally — the next section start zeroes the live one in place,
    which would otherwise blank the block behind a langchange re-render.
- **Section-result coaching (Knowledge of Performance)**: after a scored
  (rhythm-mode) section, the result card pairs one genuine _strength_ with one
  specific _next step_, derived from the already-computed accuracy / timing /
  note-length percentages, and tints the matching stat row.
  `PianoCore.pickSectionFocus(accPct, timingPct, durPct, stars)` is the pure
  selector (`packages/core/src/state/practice-state.ts`); `result-card.ts`
  renders it into `#resFocus`. Research basis: KP > KR for multi-dimensional
  motor tasks (systematic review, 2021); pair strength + specific strategy (EEF
  2019; Mueller & Dweck 1998 process-praise). **Faded feedback** — a clean ★3
  run returns `null` (celebrate, don't coach), per the guidance hypothesis
  (Salmoni 1984). A dimension is named as a strength only above
  `SECTION_FOCUS_STRENGTH_FLOOR` (55); below that the praise is effort-based so
  it stays calibrated to reality. The free-play HUD coaching
  (`quality.ts buildCoachingFeedback`) is the live-play sibling; this is its
  end-of-section counterpart.
- **Self-assessment (self-regulated-learning reflection)**: the result card ends
  with an optional, **non-persisted** "How did that feel?" tap (😣 / 🙂 / 😄).
  The reply is calibration-aware but never contradicts the child's own feeling
  and never shames a low score — the "earned-confidence" replies fire only on a
  scored run that actually cleared (★2+); every other path uses a reply that
  makes no score claim. The choice lives only in a `result-card.ts` closure
  (`selfAssessChoice`), resets per attempt, and is **never stored**
  (kid-initiated reflection, not surveillance — banned-list). Research: the act
  of self-rating itself raises both motivation and performance in children's
  piano practice (Int J Soc Robotics 2023) and is the self-evaluation phase of
  Zimmerman / McPherson self-regulated learning. DOM: `#resSelfAssess` (prompt +
  `#resFeelTricky` / `#resFeelOk` / `#resFeelGreat` + `#resFeelResult`);
  listeners attach once at factory creation.
- **Growth chart (trajectory)**: `result-card.ts drawHistoryChart` plots the
  last 8 attempts as two trend lines — **accuracy (gold, primary, 3-star
  halos)** and **timing (cyan)** — over a shared 0–100% axis, with a legend. The
  caption is **self-referenced and growth-framed**: new personal best → "🌟 Best
  yet!", else gain-vs-first-attempt → "↑ +X%", else "Keep going". The old red "↓
  -X%" loss-frame was removed — there is no "you went down" branch by design
  (banned-list: no shame/loss copy, SDT competence).
- **Pre-flight scaffold (feed-forward)**: the song panel shows a gentle "Tricky
  last time? Tap 🎧 Listen first" nudge **above the Start button** when the
  selected section's recent attempts ended in a run of misses — scaffolding
  _before_ the next try, not only after failing again (Hattie & Timperley 2007
  "where to next?"). `PianoCore.needsPreflightScaffold(historyStars)` (pure;
  trailing 0-star run ≥ 2, same threshold as the result-card escalation) drives
  it; `song-panel-render.ts` renders `#songPreflightHint`. Hidden in Listen mode
  (already listening) and clears the moment a star is earned. Kid-initiated, no
  shame copy. The nudge is **adaptive**:
  `PianoCore.planSectionScaffold(history)` escalates with struggle depth — a
  shallow run (2) gets the low-friction "Listen first"; a deeper run (≥3)
  escalates to the strategy matched to the latest attempt's bottleneck —
  **one-hand** when notes are still missed (accuracy < 70), **slower tempo**
  when notes land but timing lags (the render falls back to one-hand when
  already at the slowest tempo). Mirrors Wood/Bruner/Ross 1976 (more support the
  more the learner struggles). A one-tap `#songPreflightApply` button
  **applies** the suggestion (sets mode / hand filter / tempo, then re-renders)
  — all three mutations are side-effect-free, matching the manual rows; autonomy
  is kept (the kid can still change it by hand).
- **Full-song challenge（1曲チャレンジ, 2026-07-21）**: the practice path's
  visible endpoint — "eventually you play the whole song". The song panel's
  section list ends with a gold **👑 challenge row** (guided/rhythm modes;
  listen keeps its existing "Play full song" toggle). Locked with a
  deterministic, chaseable goal ("★1 on every part — {n} to go"); once every
  real section has ★1 it unlocks, and selecting it makes
  `practice. fullSongMode` target the whole song: **rhythm = the scored run**
  (tempo ladder applies — a slow full run still counts; `buildFullSongNotes`
  scales by tempo + applies mic chord-relaxation), guided = an untimed
  play-through. A ★1+ scored run shows the **"🏆 Song clear!"** card (milestone
  framing, big celebration, no Next button), awards the one-time
  `first_full_song_clear` stamp, and can unlock the next tempo tier (★2+, same
  gate as sections). Stars/bestPct/history persist under the reserved
  pseudo-section `FULL_SONG_SECTION_ID = '__full'`
  (`PianoCore.computeFullSongChallenge` is the pure state selector). Seals and
  whole-song stamps walk real section IDs and stay unaffected, but the
  challenge's stars DO count toward star totals (2026-07-22):
  `computeSongMastery` adds `fullSongStars` into `starsEarned` and sizes
  `starsPossible = (sections + 1) × 3`, so the ring %, journal Stars row, and
  title-strip ⭐ move when the run is cleared (they used to ignore it). The
  journal shows a 👑 on cleared songs + a 👑★n dot in the section-dots row. Loop
  practice is disabled for the run (the clear card must appear), and a 0★ run
  keeps the gentle tier0 copy + scaffold retry (the "listen first" support keeps
  the full-song target → full-song listen). Banned-list notes: unlock predicate
  is deterministic and always visible; the clear is attempt/milestone-based (★1,
  not perfection); no time pressure.
- **Onboarding + endgame completeness pass（2026-07-21）**: closed the "strong
  middle, weak start, no ending" gap from a game-design review.
  - **First-run welcome** (`first-run-welcome.ts`, `#firstRunWelcome`): a
    dismissible card on the title screen shown only on a cold start (no
    progress, no pianist name, not dismissed → `prefs.welcomeDismissed`).
    Greets, one-line explainer, a primary CTA to the recommended first song
    (`fur_elise` else first registered), and a "set my name" nudge into the
    pianist editor. NOT a blocking tutorial (banned-list). A "👈 Start here"
    chip (`startHereChip`) marks the recommended song button while the welcome
    shows. Refreshed via `refreshFirstRun()` inside `_ui.refreshJournal()` +
    `returnToTitle` + pianist `onSaved` (so it retires the moment there's
    progress/a name), and re-localized on `langchange` (built from JS, not
    `data-i18n`).
  - **Mode explainer** (`#modeHint`, `song-panel-render.ts`): a one-line,
    mode-conditional description under the mode row (`modeListenDesc` /
    `modeGuidedDesc` / `modeRhythmDesc`) — teaches Listen/Guided/Rhythm where
    the choice is made, no separate tutorial.
  - **Library capstone / endgame** (`PianoCore.computeLibraryCompletion`, pure):
    the journal rollup now shows a **medals row** (🥇 gold / 💎 platinum counts
    — previously computed but never rendered) and a **capstone row** for the
    highest library-wide milestone reached (`allTouched` → `allFullCleared` →
    `allSilver` → `allGold` → `allPlatinum` → **`libraryMastered`**,
    positive-only, `capstone*` keys); the same capstone chip rides the
    title-screen library strip. **`libraryMastered` is the TRUE 100%
    (2026-07-24, J1)**: every song platinum-sealed AND every full-song challenge
    three-starred, so it lines up exactly with the mastery ring hitting 100%.
    Before it, `allPlatinum` (section-only) was the top milestone yet the ring
    could still read <100% because full-song ★3 wasn't required — the final goal
    had no name. `LibraryCompletion.fullMastered` counts the ★3 full runs. Two
    long-tail stamps keep goals alive after one song is maxed: `first_platinum`
    💎 (a song to all-3★ + 100% tempo) and `full_song_master` 🎼 (3 distinct
    songs full-song-cleared). The result-card stretch button no longer dead-ends
    at 100% — when `pickNearCompletion` is empty but songs are touched,
    `pickStretchSong` returns `ADD_SONG_SENTINEL` ('\_\_addsong') and the button
    becomes "➕ add more free songs" (`stretchAddSong`), routing to the add-song
    modal (`openAddSong`).
  - **Milestone audio** (`practice-tone-audio.playSongClear`): a full-song ★1+
    clear plays a short piano fanfare (C5→E5→G5→C6) on the **result screen
    only** — respecting `sound-design-minimal-se` (no live-play SE, no gamey
    bloops; just extends the existing result-screen `playStampCelebration`
    pattern to the practice path's summit, which fills the MIDI/headphone
    silence there).
  - **Difficulty band on the library pick-list** (`libraryLevelToDifficulty`):
    each "Add a song" row shows the 🌱/🌿/🌳/🏔️ band derived from the catalog
    `level` (1→sprout … 4→mountain), so the level-1–4 and plant systems agree at
    the point of choosing.
  - **Quest rewards localized** (`qstReward1..11` via `QuestDef.rewardKey`) —
    the free-play quest taglines were hardcoded English.
  - **Deliberately deferred**: persisting free-play progress (best stage /
    session records). Free-play is a sandbox by design; turning its
    session-ephemeral flow into a saved chase risks making free exploration feel
    graded (brushes the banned-list "keep it intrinsic / no false-progress"
    values), so it wants its own careful design pass, not a bolt-on.
- **Weekly growth rollup (journal)**:
  `PianoCore.weeklyLibraryGrowth(sections, weekStartMs)` (pure) averages each
  section's accuracy/timing gain (latest − first) across the current ISO week
  and reports the larger **positive** axis; the journal's `renderLibraryRollup`
  shows a "📈 This week: Accuracy/Timing +Xpt" row **only when the kid
  improved** (axis null → no row). Positive-only by design — no "you went down"
  line (banned-list; SDT competence). Lifts the per-section growth framing to
  the whole library. (Both the aggregation and the journal render are
  unit-tested — `journal-modal.test.ts` drives the real `render()` through
  `@piano/core` and asserts the growth row + its positive-only suppression.)
- **Journal "show-what-you-store" pass (2026-07-24, J2–J6)**: an audit found
  several rhythm-game-standard metrics were being computed/stored then never
  surfaced. Fixed:
  - **Per-song self-best** (`SongMastery.bestPct` / `bestCombo`): the journal
    repertoire book now shows a `🎯 N%  🔥 ×M` best line (touched songs only —
    an untouched 0%/×0 reads as a scold). `bestCombo` is now persisted per
    section (`SectionProgress.bestCombo`, non-decreasing, written in
    `result-card.completePracticeSection`) — previously `sectionBestCombo` fed
    only stamp predicates then evaporated. `computeSongMastery` takes the max
    across all sections + the `__full` run.
  - **Calendar day detail** (J5): a practiced calendar cell is tappable and
    fills a detail panel with that day's songs · sections · best-★ · ×attempts
    (seeded to the most-recent practiced day). The `sectionsByDay` data was
    already collected but only drove the on/off dot.
  - **Practice-session recap** (J4, `#practiceRecap`): a gentle "🎉 Nice
    practice!" card on return-to-title after a scored session — cleared count,
    stars this session, today's minutes. Session-scoped (a `Map` in shell-ui),
    never persisted, no goals/shortfall. Fires on EVERY return-to-title path via
    the new `PracticeFlow` dep `onReturnedToTitle` (🏠 / ✕ quit / song-panel
    Back / result Home all funnel through `returnToTitle`).
  - **"▶ Continue"** (J6, `#titleContinue`): a one-tap resume into
    `progress.lastSongId` (written at section start, listen excluded) on the
    title screen — the standard "continue where you left off" the title screen
    lacked.

### Timing judgement (2026-07-25) — `JudgeProfile` + `judgeTiming`

All of it lives in
[`practice-state.ts`](packages/core/src/state/practice-state.ts), modelled on
what the genre actually does (beatmania IIDX, CHUNITHM, maimai, ONGEKI, DDR,
osu!). Five rules — the first four were each a bug before:

**1. Tiers carry QUALITY only: PERFECT / GREAT / GOOD, then MISS.** Direction is
NOT a tier. It used to be (`perfect | great | early | late`), which is both
non-standard and structurally fragile: a directional tier lives in the gap
between the GREAT edge and the window edge, so a band change can squeeze it to
zero width. That had shipped — the GREAT band was `perfectMs * 2` = 180 ms
against a 120 ms early window, so **`EARLY` was mathematically unreachable**:
the app could report LATE but never EARLY, and the grade tally showed a
structural zero no matter how the player leaned.

**2. One call produces the tier AND the credit.**
`judgeTiming(dtSignedMs, profile)` → `{ grade, score, inWindow }`. Never compute
one without the other. They used to be separate — an absolute threshold for the
chip, `1 - |dt| / window` over _asymmetric_ windows for the score — so the same
offset gave the same chip and wildly different credit:

|         dt | old chip    | old credit | new chip | new credit |
| ---------: | ----------- | ---------: | -------- | ---------: |
| **−90 ms** | **PERFECT** |   **25 %** | PERFECT  |      100 % |
|     +90 ms | PERFECT     |       74 % | PERFECT  |      100 % |
|    +220 ms | GREAT       |       37 % | MISS     |          — |

An early-leaning learner therefore saw nothing but PERFECT chips while the
timing percentage stayed too low to clear ★3, with no explanation anywhere.
Credit is now `TIER_SCORE[grade]` (PERFECT 1 / GREAT 0.7 / GOOD 0.3) — a
weighted sum of tier counts, which is how the genre computes accuracy (osu! 300
/ 100 / 50 = 1 : 1/3 : 1/6; IIDX EX score 2 : 1 : 0). With credit defined _by_
the tier, that class of bug cannot exist.

**3. Windows are SYMMETRIC.** Every published tap-note window in the genre is
mirrored (IIDX ±16.67/±33.33/±116.67/±250; CHUNITHM ±16.66/±33.33/±66.67/±83.33;
maimai ±16.67/±50/±100/±150; osu!mania 16 / 64−3·OD / 97−3·OD / …). Asymmetry
appears only on HOLD ticks, a different mechanic. The old −120/+350 tap window
(1 : 2.9) let a learner run most of a beat behind at full credit, which made the
auto-miss nearly unreachable and the drag coaching dishonest.

**4. Boundaries are whole 60 fps frames** (`JUDGE_FRAME_MS`, asserted in tests).
A genre convention — the published windows above are all multiples of 16.67 ms —
and here more than convention: the rAF loop, the lane, and the mic onset
detector are all frame-quantized, so sub-frame boundaries claim resolution the
pipeline does not have.

**5. Windows are per INPUT PATH × player-chosen strictness.**

| profile |     PERFECT |        GREAT | GOOD (= hit window) |
| ------- | ----------: | -----------: | ------------------: |
| MIDI    |  4F ≈ 67 ms |  8F ≈ 133 ms |        12F = 200 ms |
| mic     | 6F = 100 ms | 10F ≈ 167 ms |        15F = 250 ms |

`resolveJudgeProfile(isExactInput, strictness)`; `JUDGE_STRICTNESS_SCALE`
multiplies every boundary (easy 1.3 / normal 1 / **strict 0.7**, which brings
MIDI to ≈ osu! OD5).

No published game varies windows by input DEVICE — the genre treats them as a
chart/difficulty property and handles device variance with calibration. We split
anyway because the mic path carries ~±30-40 ms of irreducible jitter (onset FFT
2048/48 kHz ≈ 43 ms + frame quantization, and `MIC_INPUT_LATENCY_MS` compensates
a _variable_ lag with a constant), so judging it on a ±50 ms window would be
measuring our own noise. **The split is the automatic FLOOR; the player-facing
knob is the strictness setting** (`prefs.judgeStrictness`, a settings segment) —
that is how the genre expresses strictness (osu!'s Overall Difficulty,
StepMania's TimingWindowScale) and it is what stops the windows from changing
silently when a keyboard is plugged in. The card reports both (`judgeCondFmt` →
"判定: ふつう ・ 入力: MIDI"), because two attempts judged differently are not
comparable.

Everything downstream must follow the **active** profile, never a captured
constant — the input path and the setting can both change mid-section:

- `practice-scoring` picks the profile per press from `isExact`.
- `practice-tick.getJudgeProfile()` reads the active `goodMs` per tick, so the
  auto-miss deadline matches what the scoring would still accept. Scoring, tick
  and lane all take the SAME dep shape — one answer to "which windows are in
  force". The shell memoizes the resolution on the strictness (three per-frame
  readers × a fresh object per non-1× scale was ~180 short-lived objects/s).
- `practice-lane.getJudgeProfile()` feeds the DRAWN bands. The visible hit zone
  is the game's promise about when a press counts; if it doesn't track the
  profile, the lane shows one contract and the scoring applies another.

**Direction is reported as a DISTRIBUTION, never as a per-note indicator.** Two
reasons. It teaches more — bias (where the cloud sits), consistency (how wide it
is) and the standard it's judged against are all readable at once, which no
label carries. And Konami holds a patent on fast/slow indicators, which DJMAX
removed its own implementation over, so a discrete early/late readout is a form
worth staying away from in a shipping app. Concretely:

- **Live**: `JudgeErrorRing` (fixed-size, hot-path-safe, ticks fade by recency
  index so no timestamps are needed) → the lane's hit-error bar under the hit
  line, osu!'s hit-error bar.
- **Result**: `drawErrorDistribution` — the run's own tier bands with the mean
  offset and a ±1σ span marked — plus the standard deviation (osu!'s unstable
  rate is this × 10; accumulated from `dtSqSumMs` so the whole summary stays
  O(1) in memory). The chart shares `drawJudgeScale` with the live hit-error
  bar: same scale, two sizes, one drawer. It is painted ONLY while the
  disclosure is open — the canvas measures 0 wide inside a `hidden` container.
- **Prose coaching** derived from the aggregate mean is fine and stays.

**Star thresholds moved with the credit model** (`STAR_TIERS` timing 60→85 for
★3, 30→55 for ★2). Under the old flat curve a learner dragging ~120 ms scored 63
% and cleared a 60 % gate, so ★3 said nothing about timing. Simulated over
normal-distributed players on both profiles: steady 99-100 %, average 87-94 %,
dragging 66-73 %, unsteady 73-78 % — so 85 admits the first two and holds back
the last two on either path, while 55 still admits anyone who played the section
through. Stored stars are non-decreasing, so no existing progress is lost.

**Tightening PERFECT made calibration matter, so the result separates the two
causes.** `JudgeSummary.looksLikeSetupIssue` is set when the lean is large
(`JUDGE_SETUP_SUSPECT_MS` 60) **and** nearly every press missed the same way
(`|mean| / meanAbs ≥ JUDGE_SETUP_CONSISTENCY` 0.8). That signature is a setting,
not a habit, and the card then points at **note speed first, then the audio
offset** — beatmania's own documented procedure (adjust scroll speed before
offset when the early/late balance is skewed). Coaching "press a little sooner"
there would be teaching the child to compensate for our configuration.

### Latency calibration (2026-07-25) — one offset, measured on the input you play

The app compensates audio latency with a SINGLE `audioOffsetMs`. That is the
right count here, and the reasoning matters because the genre's usual answer is
two:

- The recommended standard is **two** offsets — input, and audio/video — because
  three delays (input / audio / video) are not independently distinguishable: a
  player cannot tell "big input + small A/V" from "small input + big A/V". Some
  games ship **one** (PolyrhythmMania folds input latency into the audio
  offset); arcade titles ship two (CHUNITHM's Offset A / Offset B).
- **We need one.** There is no separate video path — the lane is drawn from the
  same clock as the audio — and input latency is negligible on both paths:
  BLE-MIDI measures **3-6 ms** (iOS's minimum connection interval is 11.25 ms),
  and the mic path already carries its own `MIC_INPUT_LATENCY_MS` for detection
  lag. A second offset would be a mechanism for a 5 ms term.

**Calibrate on the input the player actually plays.** Rocksmith calibrates from
the guitar; Rock Band calibrates per instrument. Screen touch costs 20-50 ms
against BLE-MIDI's ~5 ms, so measuring by touch and then playing on the keyboard
bakes that difference in permanently. It also makes the player's own consistent
bias cancel, since the same person on the same input produced the number — and
an offset is explicitly a subjective "feels on time to me" value, not a physical
constant.

`latency-calibration.ts` therefore:

- **Locks the source at `start()`** (`isMidiAttached()` → `'midi' | 'touch'`)
  and enforces it per tap. A mixed run would blend two transport paths into one
  median that describes neither. A wrong-input press is answered with a nudge
  (`calibrateUseKeyboard` / `calibrateUseTouch`) rather than ignored, because a
  tap that silently does nothing reads as a broken button. MIDI presses during
  calibration are consumed by the dispatcher so they are never also scored.
- **Rejects an inconsistent run** instead of storing its median
  (`MAX_TAP_MAD_MS` 45, on the median absolute deviation — robust to one
  mistimed tap the way the median is). Rock Band's sensor auto-calibration lands
  within ~5-10 ms and human tap jitter is 10-40 ms, so a wider spread means the
  taps were not locked to the click. Storing that median would put the player
  permanently off-beat with no clue why.
- **Stamps the measurement with its input AND output route**
  (`prefs.audioOffsetSource` / `audioOffsetRoute`). "Recalibrate whenever you
  change speakers or headphones" is the standard advice; because
  `AVAudioSession` gives us the route name, the settings panel DETECTS the
  change and says so (`audioOffsetStaleFmt`) rather than leaving it in
  documentation.
- **Logs the result** via `console.log` (`[Calibrate] offset=… MAD=… input=…`).
  Not `remoteLog`: the native build hard-disables that for App Store compliance,
  but Capacitor forwards console to the device log — which is where the answer
  is needed. Before this, the only way to find out what a calibration produced
  was to pull localStorage off the device.

**Auto-detect is dead on Apple platforms without the native bridge.** WebKit
returns 0 for `AudioContext.outputLatency` in every iOS browser and in
WKWebView, so `pickAudioOffsetMs` fell through to its default and every iPad
user started ~170 ms out of sync. `capacitor-piano-midi`'s `getAudioLatency()`
reads `AVAudioSession.outputLatency` + `ioBufferDuration` instead, and
`start-practice-section` prefers it. Caveats worth knowing:

- A reported **0 means "not measured", never "0 ms device"** — the settings
  panel says so explicitly (`audioOffsetUnmeasurable`) instead of printing "0
  ms", which is what made a tester ask whether a 210 ms offset was normal.
- For **Bluetooth A2DP the OS under-reports**: a real GO:PIANO88 route measured
  126.8 ms from the OS while the player needed ~240 ms. The remaining gap is the
  codec + remote-device buffer, which is why calibration (which measures what
  the player actually hears) has the last word and the OS value is only a seed.
- The ceiling is **400 ms** in all three paths (`pickAudioOffsetMs`'s clamp, the
  slider `max`, `OFFSET_MAX_MS`). It was 200, which is _inside_ the range
  Bluetooth output occupies — so a Bluetooth user was clamped and could not
  correct their own latency in any of the three.

### Touch model (2026-07-25) — read this before touching gesture CSS

The app is finger-first on iPad, so three rules hold everywhere:

- **The `touch-action` policy has FOUR tiers, and the last is defined by WHO
  OWNS THE GESTURE — not by what kind of element it is.** `pan-x pan-y` on
  `html, body` → `pan-y` on each scroll container → **`manipulation` on every
  tap-only control** → **`none` on every element whose gesture WE implement in
  JS** (`#canvas`, `.settings-slider`, `#calibrateBtn.is-tapping`).

  Tier 3 was missing at first, and that is what made controls inside a scrolling
  panel feel sluggish: with only the inherited `pan-y`, every press on a button
  is also a candidate pan gesture, so WebKit waits to see whether the finger is
  starting a scroll before dispatching the tap.

  Tier 4 is the one that keeps being got wrong, because the obvious taxonomy
  ("what kind of control is this?") is the wrong one. The settings sliders broke
  three separate times on it:
  1. **`none` while the BROWSER still owned the drag** → undraggable. A range
     input's drag is a browser behaviour; `none` disables it.
  2. **native appearance, so the browser owned it again** → inherited iOS's rule
     that you must grab the THUMB (tapping the track does nothing, and with a
     `step` a drag beginning off the thumb does nothing —
     angular/components#27316, twbs/bootstrap#31241). On the volume rows, value
     100 with the thumb pinned right, the only live pixels were at the far
     right.
  3. **`manipulation` once JS owned it** → `manipulation` still permits PANNING,
     so the instant the finger moved WebKit claimed the touch for a scroll,
     fired `pointercancel`, and stopped delivering `pointermove`. A tap worked;
     a drag never did.

  The rule: if a JS handler implements the drag, the element is tier 4. If the
  browser implements it, it must not be.

- **Sliders: `slider-control.ts` owns the gesture, the `<input type=range>` owns
  the value.** Material's slider spec and the W3C slider pattern both say a
  press anywhere on the track moves the thumb — iOS is the deviation, which is
  why `range-touch` and friends exist. The input stays the value model and the
  accessibility surface (keyboard, VoiceOver, form semantics); JS decides the
  value from pointer events and dispatches real `input`/`change`, so the
  persistence path is untouched. It `preventDefault()`s the browser's own drag —
  two models disagree by the half-thumb inset and a drag oscillates between them
  — and restores focus explicitly, since preventDefault also cancels it.
  Geometry still matters independently: the element BOX must be `--tap-min` (a
  range input is hit-tested on its box, never on its painted thumb — the box was
  6 px against a 28 px thumb) and the thumb must not overflow it (it overflowed
  by 11 px into the value read-out above).
- **`touch-action` is `pan-x pan-y` on `html, body`, `none` only on `#canvas`.**
  It used to be `none` on `html, body`. `touch-action` is intersected down the
  **whole ancestor chain**, so that single declaration disabled touch panning in
  every nested scroll container (`.settings-card`, `.song-card`, `.result-card`,
  `.journal-card`, `#osmdContainer`, `#addSongLibraryList` — all
  `overflow-y: auto`). A swipe in a long panel did nothing, and because a moved
  touch never synthesizes a `click`, the lift didn't register as a tap either —
  the app's "taps sometimes do nothing" bug. `pan-x pan-y` still excludes BOTH
  pinch-zoom and double-tap-zoom (neither is a pan), so "never zoom the whole
  app" is unchanged; the play surface opts out again on `#canvas`. Each scroller
  also re-declares `touch-action: pan-y; overscroll-behavior: contain`. **Never
  re-introduce `touch-action: none` on an ancestor of a scroller.**
- **The top-right corner stack is DERIVED, not hand-computed.** Four fixed
  elements share that band (`#themeBar`, `#playTime`, `#questDisplay`, and the
  centered `#qualityScore`) and nothing in CSS relates them, so each one used to
  carry its own `max(Npx, calc(var(--safe-top) + Mpx))` with the ⚙/🏠 bar's 32
  px height baked into the number. Raising those buttons to the 44 px floor
  therefore pushed the bar's bottom edge down THROUGH the two rows below it —
  the free-play timer rendered inside the 🏠 button. The rows are now
  `--stack-row1..4` in `:root`, each derived from the row above plus that row's
  own height (row 2 = row 1 + `--tap-min` + gap), so a control changing size
  moves the stack instead of overlapping it.
  [`corner-stack.test.ts`](packages/web/tests/corner-stack.test.ts) fails on any
  literal `top` in those four rules.
- **44 CSS px is the tap-target floor** (iOS HIG). Controls used to be sized
  from their text — `#practiceTopBar .ptb-icon-btn` was ~24 px, and ~15 px under
  the ≤520 px media query; `#settingsBtn` / `#homeBtn` were 32 px. One block at
  the END of `app.css` ("Minimum touch targets") holds every hand-operated
  control to the floor, so it wins over the text-derived paddings above at equal
  specificity. Small controls that must stay visually small (`.opt-toggle`) keep
  their size and grow an invisible 44 px hit area via `::before` (`::after` is
  the knob).
- **The practice top bar wraps, never clips.** It was `flex-wrap: nowrap` +
  `overflow: hidden` under 520 px, so the pill silently amputated whatever
  didn't fit (on a portrait phone: the ↻ and ✕) — invisible AND untappable. Now
  the text read-outs shrink (`min-width: 0` + ellipsis), the buttons are
  `flex-shrink: 0`, and the row wraps. Safe because the topBar bottom is
  measured at runtime into `--top-cluster-bottom`, which OSMD reads.

Press feedback lives in
[`touch-feedback.ts`](packages/web/src/touch-feedback.ts):

- `installTouchFeedback()` — one empty **passive** `touchstart` listener on the
  document. WebKit only applies `:active` to elements with a touch handler in
  their ancestry, and every control sets
  `-webkit-tap-highlight-color: transparent`, so without this a tap produced
  literally no visual response. Passive matters: a non-passive document-level
  touch listener opts the page out of WebKit's fast-tap path (same reason
  `installNoZoomGuards` is web-only — see main.ts).
- `setButtonBusy(btn, busy)` → `.is-busy` (dim + `pointer-events: none`) for
  controls that `await` something slow. Wired on the song-panel ▶ Start, whose
  chain is audio init + score load + OSMD render — seconds on a cold start, and
  previously indistinguishable from a dropped tap.

### Rendering

Canvas-based with `requestAnimationFrame`. Layers drawn back-to-front:

1. Background fade (theme-colored)
2. Background stars (twinkling, count from `PERF_PROFILE.bgStarCount`)
3. Aurora bands (sinusoidal, appears above flow 40)
4. Ground flowers (appears above flow 55)
5. Center glow (radial gradient, energy-reactive)
6. Shimmer overlay (triggered by encouragement effects)
7. Frequency spectrum bars (64 bars, piano range)
8. Ripples (expanding circles at note positions)
9. Particles (circle, ring, star, note, flower types; cap from `PERF_PROFILE`)

### "Printed = playable" — note extraction (2026-07-25)

**One property decides whether a note is required: `print-object`. Never the
engraving size.** `osmd-init.ts` renders with `drawHiddenNotes:false`, so what
the learner sees is exactly the set of notes with `PrintObject !== false` — and
[`note-extractor.ts`](packages/web/src/note-extractor.ts) must ask for that same
set. Grace notes are the single deliberate exception (below).

It used to skip on OSMD's `IsCueNote` instead, and had no `PrintObject` check at
all, which broke the invariant in **both** directions:

- **Printed notes were dropped.** OSMD's `getCueNoteAndNoteTypeXml` folds
  `<cue/>` (a genuine reference cue) and `<type size="cue">` (pure engraving —
  "set this small") into one boolean. Cadenzas are engraved small, so whole
  printed passages never reached the lane, the ghost, or scoring: **La
  Campanella bars 75-87 / 103-105 — the entire right-hand run** (31 notes in bar
  75 alone, the left hand playing on alone underneath), **Liebestraum's two
  cadenzas** (bars 25-26, 60-62), Moonlight iii, BWV 847. In a piano-solo score
  `<cue/>` is essentially always the engraver meaning "small note" anyway, so
  cue-ness carries no signal here at all.
- **Unprinted notes were required.** MuseScore hides playback-only realizations
  behind the printed symbol — **K.545 bar 15 hides `A5 G5 A5 G5 A5 G5` behind a
  printed `tr`**, Clair de lune hides tie-continuation duplicates. The learner
  was being asked for notes that appear nowhere on the score.

Measured over the shipped library: **+747 printed notes restored, −404 unprinted
notes removed, across 13 of 59 scores** (Liebestraum +354/−32, La Campanella
+341/−10, K.545 −184, Clair de lune −64, alla_turca −30).

**Grace notes stay excluded** — displayed, never required. That is the
assessment-app convention (SmartMusic does not assess grace notes, trills or
other ornaments), and today it is also the only correct choice: OSMD gives every
grace voice entry the **same timestamp as its main note**. Measured across the
library (alla_turca 282 grace entries, gnossienne 100, nocturne 19, fur_elise
3): 100 % collide, 0 % get a distinct timestamp. Extracting them as-is would
stack acciaccatura + main note into one chord to be struck simultaneously. Doing
it properly needs performance-practice time-stealing (shorten the main note,
offset each grace) — a separate change, not a flag flip. `score-timing.ts`
excludes grace from the measure clock for the same reason, so the two stay
symmetric.

`GNotesUnderCursor()` honours OSMD's `SkipInvisibleNotes`, so
`osmd-cursor.highlightCurrentNotes` cannot reveal a hidden note by painting it
(verified: 0 hidden notes returned over full cursor walks of alla_turca and
K.545). No change was needed there.

### Falling-notes lane + sheet-panel default (2026-07-22)

The practice falling-notes lane
([`render/lane.ts`](packages/core/src/render/lane.ts)) spawns notes at the **top
of the lane region** and drops them to the hit line. `laneTop` is `50` when the
OSMD sheet panel is hidden (full-height, game-like — notes fall from the top of
the screen), but jumps to **below the score** (`cachedOsmdRect.bottom + 12`)
when the panel is visible, which squeezes the lane into a short strip and makes
notes appear to start mid-screen. The lane keys off the panel's `.visible` class
(`osmdContainerVisible`), not the element's layout box (the panel is
opacity-hidden, so it always has a rect).

**So the sheet panel is OFF by default during practice** (`prefs.showScore`,
default `false`) — the game-like full-height lane is the default experience. The
📜 top-bar button (`ptbToggleOsmd`) toggles it and **persists the choice**
(`setShowScorePref` → `prefs.showScore` + `savePrefs`; survives sanitize via the
accept-list). Turning it on trades lane height for a reading aid; the lane
re-reads the class next frame (no relayout). `start-practice-section` applies
the pref at each section start. (Same commit also added `showScore` +
`welcomeDismissed` to the prefs accept-list — the latter was written but dropped
on load, so the first-run welcome had been re-appearing every session.)

### Score-follow controller (OSMD cursor)

OSMD's built-in `followCursor` is **OFF**;
[`packages/web/src/osmd-cursor.ts`](packages/web/src/osmd-cursor.ts) drives the
fixed `#osmdContainer` scrollTop directly. The controller (`v10`, 2026-05-12)
uses a small **"reveal active region"** policy — scroll only when the active
note region leaves a safe reading band, with guards to avoid the oscillation
that earlier scrollIntoView-based attempts (v1-v4) hit on dense passages:

- **Safe band**: top/bottom margin ≈ 14% of panel height (≥32px), so a cursor
  that's already comfortably visible doesn't trigger scroll.
- **Hysteresis 48px**: focusY must leave the band by this much before an
  `active-outside-safe` scroll fires.
- **Active-scroll cooldown 120ms**: within-system reveal scrolls throttle to
  prevent micro-thrashing.
- **Same-system reversal guard 450ms**: tall chords/beams whose active region
  toggles top/bottom can otherwise yank the panel up-down-up.
- **`belowFocus` correction**: `planPanelScroll` subtracts the active-region's
  extent below focusY from `safeBottom` so the staff bottom always lands inside
  the viewport, not 28px below.
- **Layout-graph chain**: system-change detection walks
  `GraphicalMusicSheet.MeasureList[m][0].parentMusicSystem.Id` — the same path
  OSMD's own `Cursor.update` uses internally.
- **`[CURSOR-SCROLL v10]` + `[DIAG-CURSORPOS]` diag logs**: forwarded to
  `server.log` via the remote-log gate so the in-the-wild scroll cadence stays
  inspectable (event / reason / panel + safe band + focusY / delta).

### Custom cursor overlay (SVG ground truth, 2026-05-13)

OSMD's native yellow cursor element is **hidden** and we paint our own gold
overlay (`rgba(255, 215, 0, 0.30)`) from the rendered SVG's bounding rects.
Rationale: OSMD positions its cursor from
`MusicSystem.PositionAndShape.AbsolutePosition.y + StaffLine[0].RelativePosition.y`,
but on scores with `<octave-shift>` brackets — especially nested ones
(`size="8"` plus `size="15"` plus multi-channel `number="N"`) — OSMD reserves
bracket-padding space in the system's bounding box but the renderer doesn't
shift the staff lines down by that amount. Result: the cursor lands 200–328 px
below the actual staff, drift growing as the score progresses (verified on
Liszt's _La Campanella_, 78 octave-shifts, head_dy −232 → −328 px over 56 s).

The fix mirrors **Verovio's "DOM is the source of truth" pattern** + OSMD's own
recommended approach (`graphicalNote.getSVGGElement().getBoundingClientRect()`):

- **Hide OSMD's native cursor**: `cursor.cursorElement.style.opacity = '0'` (the
  iterator still advances, only the visible bar is replaced).
- **Paint a `<div>` overlay**: lazy-created child of `#osmdContainer`,
  `position: absolute`, gold tint, no pointer events. Scrolls naturally with the
  score content because it lives inside the scrollable container.
- **X range from notes**: union of `noteToViewportRect()` over
  `GNotesUnderCursor()` — already correct in the SVG even when OSMD's data model
  is off.
- **Y range from stave path elements (stable-height, 2026-05-13)**: walk up from
  each note's `<g>` to find ancestors with VexFlow `.vf-stave` children, filter
  by horizontal overlap with the note (so only the current system contributes),
  union those Y ranges. **Y does NOT extend to noteheads** — the first iteration
  unioned with notes and made the bar pulse 120 → 460 px per cursor advance
  (note `<g>` bounding rects include stems, beams, and ledger lines that spread
  far from the staff). Pink notehead paint (`highlightCurrentNotes`) covers the
  actual sounding notes; the gold bar marks "the staff is here, look at this
  measure." Matches Soundslice's "Wide rectangle" cursor + OSMD's native type=1
  intent. Falls back to notes' Y when no `.vf-stave` is found (happy-dom tests,
  partial-load fixtures).
- **`[DIAG-OVERLAY]` log (every 16 paints)**: overlayTop/Left/W/H +
  overlayScreenTop/Bot + staffTop/Bot + panelTop/Bot + clippedAbove/Below.
  `clippedAbove`/`clippedBelow` measure overlay-vs-panel fit objectively — 0/0
  means the bar fits cleanly, anything else means the system is too tall for the
  panel and the user sees a partial view.
- **ResizeObserver self-attached**: the overlay re-paints on container resize
  (font load, orientation flip, OSMD re-render) without the shell wiring up
  anything. happy-dom / older Safari without ResizeObserver still get paint-
  on-cursor-change behavior.
- **Public `repaintCustomCursor()` API**: for callers (settings panel zoom,
  manual scroll) that need to nudge the overlay without advancing the cursor.

The previous `stretchCursorToNotes` approach (extending OSMD's native cursor's
`style.top` / `style.height`) was retired on 2026-05-12 because OSMD resets
`style.top` on each `cursor.update()` but not `style.height`, leading to
unbounded growth (production log: 130 → 12061 px over 2 min). The custom-
overlay approach owns its own element entirely, so this class of bug cannot
recur.

### Tab visibility + clock freeze

[`packages/web/src/practice-visibility.ts`](packages/web/src/practice-visibility.ts)
freezes the practice clock and pauses `Tone.Transport` on
`visibilitychange→hidden`, then rebases `startAudioTime` on
`visibilitychange→visible` so the cursor doesn't jump forward when the tab
returns. Without it, Tone's Web Audio Transport keeps advancing while the rAF
loop is throttled and the cursor catches up multiple pages at once (production
log showed a 20,837px first-scroll after ~10min of background). Verified working
in `server.log`: `[PRACTICE-VISIBILITY] hidden freeze {"elapsedMs":4858,...}`
followed by a matching resume after the user came back.

### Key Configuration

All tunable parameters are created in
[`packages/web/src/piano-config.ts`](packages/web/src/piano-config.ts). Key
groups:

- Audio analysis: `FFT_SIZE`, `SMOOTHING`, `YIN_*`
- Onset detection: `SPECTRAL_FLUX_*`, `ONSET_*`, `FLATNESS_*`, `CREST_*`,
  `HARMONICITY_*`
- AGC: `AGC_*`
- Game balance: `FLOW_*`, `COMBO_*`, `SILENCE_*`
- Visual: `MAX_PARTICLES`, `STAGES`, `THEMES`, `ENCOURAGEMENT_TIERS`

`MAX_PARTICLES`, `SHADOW_BLUR_ENABLED`, `AMBIENT_PARTICLE_CHANCE`, and the
background star count are overridden at runtime by the detected `PERF_PROFILE`.

### Themes

4 color themes selectable via dots in the settings panel:

0. Purple/pink (default)
1. Cyan/green
2. Orange/red
3. White/lavender

### Debug Mode

Enable in the settings panel (⚙ → その他 → デバッグ表示) to toggle a debug
overlay showing real-time values for all detection layers (flux, flatness,
crest, harmonicity, AGC gain, session state, pitch, RMS, etc.).

### Multi-part scores — backing-part playback（おともパート, 2026-07-19）

Multi-part MusicXML (e.g. P1=Voice + P2=Piano 歌+伴奏譜) auto-splits into "your
part" and "backing parts" at extraction time — the SmartMusic My
Part/Accompaniment model, deliberately without a mixer UI (kid-simple):

- **Part classification**: `pickPracticeStaffPlan`
  ([note-extractor.ts](packages/web/src/note-extractor.ts)) reads
  `osmd.Sheet.Instruments` and scores each part (2 staves +4, keyboard-ish name
  +2, GM program 1–8 +2). Best keyboard-ish part = practice part (hand from
  staff order **within** that part); all other parts = backing. No keyboard-ish
  part or single-part score → everything is practice (legacy behavior, zero
  regression).
- **Data**: backing notes live in `song.backingNotes` (tie-merged separately,
  repeat-expanded via the same playback order). They never enter
  `practice.sectionNotes`, the lane, scoring, or progress counts.
- **Playback**: `buildBackingNotes(sectionIdx | null)` (section-notes.ts) builds
  the timeline (same tempo scaling + count-in anchor as practice notes;
  full-song mode shares `fullSongAnchorSec` so a vocal pickup before the piano
  shifts both timelines consistently). `scheduleSectionPlayback` plays it on a
  dedicated `melody` PolySynth (soft sine, -17dB ≈ 70% of the ghost piano) in
  **listen AND rhythm** modes, independent of the ghost toggle — the kid plays
  the piano part, the app sings the melody. Guided (wait) mode has no transport,
  so no backing there. Voice timbre is piano-family on purpose: GM 53/54 synth
  voices sound worse than a clean pitched tone (SmartMusic precedent).
- **Extraction invariants**: the extraction walk temporarily sets
  `EngravingRules.CursorIgnoreRepetitions = true` (restored in finally) so
  `|: :|` doesn't double-extract; tie ends are detected via `Tie.Notes[last]`
  (OSMD 1.9 has no `Tie.EndNote`).

## User-added songs

Added 0.13: users can browse and import MusicXML scores (`.mxl` / `.musicxml`).
**Score library (2026-07-21): self-owned + bundled.** The former
`musetrainer/library` jsDelivr dependency was removed — it shipped no LICENSE
and mislabeled copyrighted works (e.g. de Senneville's 1978 "Mariage d'Amour" as
PD; see [`docs/LICENSES/README.md`](docs/LICENSES/README.md)). The in-app "Add a
song" catalog is now the app's OWN transcriptions of public-domain compositions,
generated by [`scripts/gen-library-scores.mjs`](scripts/gen-library-scores.mjs)
into `packages/web/public/assets/library/*.musicxml` + `manifest.json`, read by
[`packages/web/src/bundled-library.ts`](packages/web/src/bundled-library.ts).
Composition = PD worldwide; engraving = authored by us (or CC0) → clean in every
jurisdiction. By default the app fetches no external catalog at runtime (works
offline). `bundled-library.ts` has an **optional** `REMOTE_CATALOG` merge path
("download more free songs"), **`null`/disabled by default**, that may ONLY be
enabled by pinning a specific commit of a repo verified to be entirely CC0/PD
real MusicXML — never a mixed-license site (the musetrainer trap); enabling it
also requires updating `docs/PRIVACY.md`. Users can still paste a URL to import
their own score (their responsibility; stored on-device only). See
`docs/LIBRARY-CURATION.md` → "Runtime remote catalog".

- IndexedDB-backed (`pianoViz_v1` / store `userSongs`).
- Auto-section detection: rehearsal marks → double bars → repeats → key changes
  → length-thirds fallback.
- Manual section editor for parents/teachers.
- Export/import as JSON.
- See the user-song modules in `packages/web/src/user-songs-*.ts`,
  `packages/web/src/shell-user-library.ts`, and
  `packages/web/src/shell-add-song.ts`.

## Native (Capacitor) plans

See [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the App Store / Play Store
submission checklist, and
[`packages/mobile/README.md`](packages/mobile/README.md) for the Capacitor
wrapper instructions.

The native MIDI plugin lives at
[`packages/plugins/capacitor-piano-midi/`](packages/plugins/capacitor-piano-midi/).

**Platform status (2026-07-20 — iOS-first release):**

- **iOS: shipped-quality.** The Capacitor app under `packages/mobile/ios/` is
  generated, builds, and was **hardware-verified on a physical iPad Pro 12.9"
  (3rd gen) / iPadOS 26.5.2**: mic detection, BLE-MIDI (Roland GO:PIANO88 via
  the OS pairing sheet `CABTMIDICentralViewController`), and the splash screen
  all work. Native MIDI reaches the shell through the Web-MIDI polyfill
  (`packages/web/src/native-midi-polyfill.ts`), not the `packages/mobile/src`
  adapters (those were removed — the shipped bundle is `packages/web`'s Vite
  build).
- **Android: NOT generated yet.** `packages/mobile/android/` does not exist
  (`cap add android` has not been run), so `pnpm cap:android` will fail until it
  is. The plugin's Kotlin side (`android.media.midi` + `BluetoothLeScanner`) is
  implemented but has no host app, and **native BLE-MIDI is not wired to JS on
  Android** (`native-midi-polyfill.ts` only wires `showBleMidiPairing` for iOS;
  Android would need scanBle/connectBle + a device-picker UI). Treat Android as
  a future milestone, not a shippable target.
- **No background audio.** This is a foreground-only practice app;
  `UIBackgroundModes` was intentionally removed from `Info.plist` (it was
  declared but never backed by an `AVAudioSession` setup). If lock-screen /
  background continuation is ever needed, add both the plist key AND a real
  `AVAudioSession` category — don't re-add the declaration alone (App Store
  review flags a declared-but-unimplemented background mode).
