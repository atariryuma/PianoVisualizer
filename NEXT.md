# NEXT — agent task queue

## Current handoff (2026-05-10)

`legacy-app.js` has been retired. The production web app boots from
`packages/web/src/main.ts` into `packages/web/src/shell-bootstrap.ts`, with the
former shell split across typed `packages/web/src/*.ts` modules. Treat the long
Phase 0d / 0e extraction log below as historical context unless a newer issue or
user request points at it.

Immediate maintenance queue:

1. **[docs/REVIEW-2026-07-19.md](docs/REVIEW-2026-07-19.md) — P0 + P1 all landed
   (2026-07-19).** All 3 P0 correctness bugs and all 8 P1 items are fixed +
   tested; 6 P2 gaps also landed (see the status table at the top of the doc).
   The remaining P2s are UI/audio-experience features that want real-iPad
   verification before landing (loop practice, ⏸ toolbar button, result-card
   "retry slower", practice-minute tracking, XML part-index fix, latency-
   calibration wizard, sampler ghost audio). Each has a self-contained task
   instruction in the doc.
2. Keep documentation synchronized with the Phase 0e runtime shape.
3. Continue hardening OSMD cursor / scroll behavior and MIDI rescan behavior
   with regression tests before each behavioral change.
4. For every feature or bug fix, run `pnpm verify`; on this Windows sandbox,
   Vitest may need approval because Vite/esbuild spawns a child process.

Recent landings (2026-07-19, deep-investigation round 2):

- **Features**: P2-18 retry-with-support button on 0-star results (scaffold
  strategy one-tap: listen-first / one-hand / slower tempo, with sideways
  fallbacks); P2-19 practice-minute tracking (minutesByDay, journal calendar
  today/total, cumulative-only — banned-list safe).
- **Perf (iPad)**: lane shadowBlur now PERF_PROFILE-gated (biggest practice
  frame cost on low tier); particle/ripple draw allocations eliminated (~210k
  objs/sec → 0); same-size resize early-return (no more 15MB canvas realloc on
  URL-bar bursts); playTime/mic-meter DOM writes deduped; re-import blob URL
  leak fixed.
- **MIDI/BLE correctness**: BLE-MIDI parser mishandled System Realtime
  (0xF8–0xFE) — Roland Active Sensing poisoned running status and silently
  dropped coalesced note-on/off (stuck notes on GO:PIANO88). Fixed per MIDI
  spec + System Common handling. Also: BLE↔USB double-input on connect, GATT
  disconnect listener registered pre-handshake, MIDIAccess cache unified into
  midi-rescan (verifyAlive / clearMidiAccessCache actually work now), in-flight
  requestMIDIAccess dedupe, poller zombie latch, device-name HTML injection
  sealed, osmd-init stale loadedUrl on load failure.
- **Mic resilience**: dead-stream detection + track 'ended' watch (mic was
  permanently unrecoverable after permission revocation); AGC model reset on
  suspend; session-reset gaps (recentPitches / agcVoiceRejectCount / combo decay
  / noise penalty).
- **Boot resilience**: localStorage SecurityError environments (cookie-block,
  sandboxed iframe) no longer kill boot — safeLocalStorage ×3 + boot try/catch
  with a visible error toast.
- Deferred round-2 items (device-verify or product decisions) are filed in
  docs/REVIEW-2026-07-19.md §徹底調査ラウンド2 (R2-1..R2-6).

Recent landings (2026-07-19, review fixes):

- **P0 bugs (all 3)** — COUNT_IN_MS getter (guided clock/early-gate followed a
  4000ms snapshot); repeat-section boundary drift (sections sliced expanded
  notes on the source clock → new `expandedMeasureStartSec`); volta
  `number="1,2"` comma notation dropping the rest of the song from the playback
  order.
- **P1 (all 8)** — count-in click interval now tracks tempo (beat count absorbs
  the clamp); count-in beeps go through the Transport so quit cancels them +
  song-start double-tap guard; settings-panel now freezes the practice clock
  (shared pause/resume machinery, tick paused-gate) — the documented "settings =
  paused" invariant is now real; D.C./D.S. final-measure length uses XML
  durations; coda/segno symbol-only jumps + measure-level `<sound>`; .mxl
  inner-name variants + size-limit defense; mic-mode chord relaxation
  (`relaxChordsForMic`); mic detection-latency compensation.
- **P2 gaps landed** — 50% tempo (support, always unlocked); metronome accent
  follows the time signature; rhythm wrong-note chip (throttled, no penalty);
  per-song settings persistence (`lastSettings`); grace/cue skip; PolySynth
  polyphony bump. Pause MECHANISM done (⏸ toolbar button deferred to device
  verification).

Recent landings (2026-07-19):

- **Backing-part playback（おともパート再生）** — multi-part scores (e.g.
  Voice + Piano) now auto-split into "your part" (keyboard) and "backing parts".
  `pickPracticeStaffPlan` (note-extractor.ts) scores instruments (2 staves +4 /
  keyboard-ish name +2 / GM piano program +2); non-keyboard parts extract into
  `song.backingNotes` and play on a dedicated soft-sine PolySynth (-3dB vs
  ghost) during listen/rhythm — never in the lane, never scored. Modeled on
  SmartMusic My Part/Accompaniment + kid-simple no-mixer pattern. Verified
  end-to-end against a real Voice+Piano MusicXML (53 measures, repeats, playback
  order 92). +18 web tests.
- **Repeat double-extraction fix** — the OSMD iterator was following `|: :|`
  back-jumps during extraction (CursorIgnoreRepetitions=false), duplicating
  every repeated-section note at identical timeSec (the source of phantom ×2
  badges). Extraction now sets the flag true for the walk and restores it in a
  finally (cursor-follow behavior untouched).
- **Tie end-note detection fix** — OSMD 1.9's `Tie` has no `EndNote`; the end is
  `Tie.Notes[last]`. End notes were getting both flags, so `mergeTiedNotes`
  over-merged same-pitch consecutive tie chains.
- **stopPracticeAudio releaseAll** — quit no longer leaves already-triggered
  envelopes (long notes, backing legato) ringing.

Recent landings (2026-05-30):

- **Journal-modal test harness** — first Vitest coverage for the journal modal
  (`journal-modal.test.ts`): a full-DOM + minimal-deps harness drives the real
  `render()` through `@piano/core`. Covers a render() smoke test (every tab on
  minimal data) + the weekly-growth row (accuracy/timing/none). +5 web tests.
- **Weekly growth rollup (journal)** — `PianoCore.weeklyLibraryGrowth` averages
  each section's accuracy/timing gain across the current ISO week and the
  journal rollup shows "📈 This week: Accuracy/Timing +Xpt" only when the kid
  improved (positive-only; no loss-frame). Lifts per-section growth framing to
  the whole library (SDT competence). +7 core tests; the journal render is now
  covered too (see the journal-modal test harness landing above).
- **One-tap scaffold apply** — the pre-flight nudge gained a
  `#songPreflightApply` button that applies its suggestion (switch to Listen /
  right-hand-only / drop to the slowest unlocked tempo), then re-renders. All
  three mutations are side-effect-free (identical to the manual hand/mode/tempo
  rows); the kid keeps control. +4 web tests.
- **Adaptive scaffold escalation** — `PianoCore.planSectionScaffold(history)`
  escalates the pre-flight nudge with struggle depth: shallow (2) → "Listen
  first"; deep (≥3) → strategy matched to the latest attempt's bottleneck
  (one-hand when accuracy < 70, slower tempo otherwise; render falls back to
  one-hand at the slowest tempo). Wood/Bruner/Ross 1976 scaffolding. +5 core, +3
  web tests.
- **Pre-flight scaffold (feed-forward)** — the song panel nudges "Tricky last
  time? Tap 🎧 Listen first" above Start when the selected section's recent
  attempts ended in a 0-star run (`PianoCore.needsPreflightScaffold`, trailing
  run ≥ 2). Scaffolds before failure, not only after (Hattie & Timperley 2007).
  Hidden in Listen mode; clears once a star is earned. +6 core, +4 web tests.
- **Growth chart trajectory** — `drawHistoryChart` now plots two trend lines
  (accuracy gold + timing cyan) over the last 8 attempts with a legend, and the
  caption is self-referenced + growth-framed (best-yet / +X% vs first /
  keep-going). The old red "↓ -X%" loss-frame is gone — no "you went down"
  branch (banned-list: no shame copy; SDT competence). +3 web tests.
- **Self-assessment (SRL reflection)** — the result card ends with an optional,
  non-persisted "How did that feel?" tap (😣/🙂/😄). The reply is
  calibration-aware but never contradicts the kid's feeling or shames a low
  score (earned-confidence replies fire only on a cleared ★2+ scored run).
  Choice lives only in a `result-card.ts` closure, resets per attempt, never
  stored (kid-initiated reflection, not surveillance). Research: the act of
  self-rating raises both motivation and performance in children's piano
  practice (Int J Soc Robotics 2023); Zimmerman/McPherson SRL self-evaluation
  phase. +8 web tests. _Interactive — touch ergonomics still want a human iPad
  A/B._
- **Section-result KP coaching** — `PianoCore.pickSectionFocus()` (pure) pairs
  one genuine strength with one specific next step from the scored
  accuracy/timing/note-length, rendered into `#resFocus` on the rhythm-mode
  result card with the weak stat row tinted. Faded feedback: null on ★3
  (celebrate, don't coach); effort-based praise below a 55 honesty floor. Closes
  the "coaching only existed in free-play" gap. Research: KP > KR for
  multi-dimensional motor tasks (systematic review 2021); EEF 2019 / Dweck
  process-praise; guidance hypothesis (Salmoni 1984). +8 core, +4 web tests.

Recent landings (2026-05-12):

- **cursor v10 + practice-visibility + bottom-fit + stretch** — the score-follow
  controller drives `#osmdContainer.scrollTop` directly with a safe-band reveal
  policy (hysteresis 48px, active-scroll cooldown 120ms, same-system reversal
  guard 450ms). `practice-visibility.ts` freezes the practice clock and pauses
  Tone.Transport on `visibilitychange→hidden` so the cursor doesn't jump forward
  when the tab returns. `planPanelScroll` subtracts `belowFocus` from
  `safeBottom` so the staff bottom always lands inside the panel.
  `stretchCursorToNotes` extends the cursor element's `style.top` /
  `style.height` after each `cursor.update()` so very high ledger-line notes
  (Eb7 etc.) stay inside the bar visually. **Verified by production log**
  (`[PRACTICE-VISIBILITY] hidden/visible` pair in server.log shows the freeze
  working in the wild).
- **`cursor: any` narrowing in osmd-cursor.ts** — landed 2026-05-12.
  `OsmdCursorRef` now carries `cursorElement?: HTMLElement` + `next?()`,
  `OsmdIteratorRef` carries the two repetition-index name variants. All four
  scroll-controller helpers (`computeActiveCursorRect`, `stretchCursorToNotes`,
  `logScrollEvent`, plus the three call sites in `ensureCursorVisible`,
  `computeSystemIdx`, `_diagCursorPos`) and the iterator assignment in
  `seedIteratorFromTimestamp` now use the narrow type. Zero `as any` casts on
  `cursor` remain in the file.
- **osmd-cursor.ts: zero `any` anywhere** — landed 2026-05-12. Follow-up that
  also typed the OSMD layout-graph chain (`OsmdGraphicalSheetRef` →
  `OsmdGraphicalMeasureRef.parentMusicSystem` → `OsmdMusicSystemRef` →
  `OsmdStaffLineRef`) and
  `OsmdGraphicalNote.parentVoiceEntry?...?.parentMeasure` walk used by
  `_diagCursorPos`. Five remaining `osmd as any` casts dropped.
- **shell-bootstrap.ts: zero `any` anywhere** — landed 2026-05-12. Was 30
  `as any` / `: any` references across 627 lines; now zero. Drops the redundant
  casts on `createPianoConfig`/`createInitialGameState`/
  `createInitialPrefs`/`createDomBag().bag`, tightens `pickDom`'s generic to
  `<T extends object, K extends keyof T & string>` (avoids the
  `Record<string, HTMLElement>` widening), types the 10 forward-decl stubs to
  their exact reassignment shapes (`() => void` and
  `(animate: boolean) => void`), and adds a `DetectChordFn` alias in
  `core-opts.ts` so `PianoCore.detectChord` no longer needs a cast. The
  factory-callback closures (`showHitChip`, `finalizeNoteHold`, `selectSong`,
  etc.) drop their inline `any` annotations and let TypeScript infer from each
  module's deps type — the inference flows through cleanly because the deps
  types are already correct upstream.
- **shell-\*.ts callback signature sweep** — landed 2026-05-12.
  `remoteLog`/`showHitChip`/`stageLabel`/`t`/`setLang`/`setTimeout`/`clearTimeout`
  callbacks across 9 shell modules narrowed to their actual source signatures
  (e.g. `t: T` from `@piano/core`, `showHitChip: (kind: string, text: string)`,
  `stageLabel: (stage: Stage | undefined | null)`). Net 19 `any` removed.
- **shell-\*.ts structural deps types** — landed 2026-05-12. `state: any` →
  `InitialGameState`, `dom: any` → `DomBag` (or `Pick<DomBag, …>` for narrow
  viewport access), `config: any` → `PianoConfig`, `prefs: any` → `InitialPrefs`
  across 14 shell modules. Net 37 `any` removed (shell-\*.ts total 312 → 275; 56
  reduction this session). Also narrows `InitialGameState.prevSpectrum` from
  `Uint8Array | Float32Array | null` to `Float32Array | null` — only
  Float32Array is ever assigned at runtime, and
  `OnsetDetectStateRef.prevSpectrum` already required the narrow type.
- **practice-visibility production-scenario test pin** — landed 2026-05-12. Adds
  a 4th test that replays the `server.log` 2026-05-10 11:36:14 / 11:36:25
  hidden→visible cycle (elapsedMs=4858, leadMs=50, 11s background gap) so any
  future scaling/short-circuiting of the freeze window fails the test.
- **shell-\*.ts mutable state types + low-hanging callback sweep** — landed
  2026-05-12. `practice: any` → `InitialPracticeState` across 6 shells; new
  `MidiInputRef` type (exported from `shell-midi.ts`) replaces `midiInput: any`
  across 5 shells; `midiState: any` → `MidiState` (from `@piano/core`) in 3
  shells. Also tightens `MidiRenderMidiState.activeNotes` to match `MidiState`'s
  canonical `synColor: string | null`. Plus targeted narrowing:
  `alertAudioInitError: (e: unknown)`, `selectSong: (id: string)`,
  `setCurrentSong: (s: unknown)`, `setOsmd: (o: unknown)`,
  `rescanMidi: (silent?: boolean) => Promise<boolean>`,
  `dateKey: (d: Date) => string`, `particles: Particle[]`, `ripples: Ripple[]`
  (typed against `@piano/core` exports),
  `setLibrary: (entries: UiLibraryEntry[])`. Net **−40 `any`** this session
  (shell-\*.ts: 275 → 235); combined with prior rounds, **shell-\*.ts went from
  331 → 235** (−96, ~29%).

The next 5–10 actionable items, in **execution order**. Pick the topmost
unchecked item if no specific issue is assigned to you.

Each item has: **What**, **Why**, **Acceptance criteria**, **Estimated lines**,
**Playbook**. Read the playbook before starting.

Last refreshed: **2026-05-09 (cycle 2 cont., batches 51-107 + Issue 1/2 fix
detour + tie-aware OSMD cursor)**. `legacy-app.js` is now **616 lines** (was
5,100 at the prior NEXT refresh, **−4,484 across 63 batches**, the heaviest
cycle on record). **2,157 tests** total (786 core, 1,371 web; **+279 this
cycle**). `pnpm verify` clean. Production build smoke test (puppeteer load + ▶
Start click) reports zero console errors.

**Phase 0d → 0e in flight**: extracted 14 shell-bootstrap modules (shell-midi,
shell-add-song, shell-osmd, shell-audio, shell-game-update, shell-midi-handlers,
shell-practice, shell-ui, shell-user-library, shell-effects,
shell-session-state, shell-render-loop, shell-viewport) covering the major
factory clusters. Each is a single `createShellXxx(deps)` factory that bundles
5-10 internal `Xxx.createXxx()` calls + their forwarders into one shell call
site. Pattern: pass live state by getter thunks for forward-declared
shell-locals; setters where the shell needs to mutate (e.g. `setOsmd`).

The mid-session **Issue 1 + Issue 2 bug-fix detour** (5 commits between batches
56 and 57, 2026-05-08/09) is documented in the bullet list below; **Phase 0d
batches 71-90 (commit `685d5df`)** is a single bulk commit covering 6 new
modules + 2 in-place builders + ~10 compaction passes; **tie-aware OSMD cursor
highlighting (commit `f3f226c`)** is a parallel surgery that landed alongside.

**Bug-fix detour landed 2026-05-08/09** — mid-session user reported Issue 1
("after fullSong listen, switching song fails to load") + Issue 2 ("frame
drops + audio glitches during playback"). Root-caused via `[DIAG-*]` remote-log
instrumentation, then surgically fixed:

- `1d2da2e` — diag instrumentation (no fix). DIAG-FULLSONG / DIAG-AUDIOCTX /
  DIAG-FRAME logs forwarded to server.log via REMOTE_LOG_ENABLED gate.
- `b1dbf51` — Issue 1 layer 1: reset `practice.fullSongMode = false` in
  `selectSong` + result-card listen-completion + guard empty `sectionNotes` in
  `start-practice-section`.
- `a8aab47` — Issue 1 layer 2: xml-first OSMD URL preference (some user `.mxl`
  files have non-standard inner XML names that OSMD's container reader drops
  silently); verbose 0-notes error.
- `093f53a` — Issue 1 layer 3: OSMD `loadedUrl` tracking + reload on URL
  change + post-load empty-Sheet sanity check; idempotent `initAudio` (reuse
  existing AudioContext, don't orphan Tone.js binding); throw on
  `expandNotesByPlaybackOrder` empty-measures to stop NaN propagation.
- `a2b6aec` — Issue 2 main fix: cap particles at 200 + disable shadowBlur + skip
  ambient spawn during practice. Reduced in-playback drops from 10 → 5
  (server.log A/B).
- `83a8afb` — Issue 2 final polish: pause MIDI auto-rescan during practice
  (residual dt=50ms ticks every 5th poll cycle were
  `requestMIDIAccess({force:true})` stalls — kid won't plug in a keyboard
  mid-song). +2 tests.

**Headless bench harness — landed batch 17 (autonomous feedback loop)**:
`pnpm --filter @piano/web bench` from a single Bash call spawns vite preview,
launches headless Chrome via puppeteer-core, navigates to
`?dev=1&autorun=bench&webhook=...`, polls until the report lands, and prints
markdown to stdout. The vite plugin (`packages/web/vite-bench-plugin.ts`)
exposes `/__bench/{result,last,clear}` middleware; dev-mode.ts adds
`?autorun=bench` + `?webhook=URL` URL-param hooks. Closes the "deploy → check by
hand" cycle — the LLM driving the codebase can now verify end-to-end behaviour
after every batch in ~5 s. **Verified 11/11 bench passing post-extraction at
every commit.**

**Recent batches (this session)**:

- batch 17 — autonomous bench harness (vite plugin + puppeteer + dev-mode
  autorun/webhook). +7 dev-mode tests.
- batch 18 — `mic-pipeline.ts`: YIN throttle + AGC + game-state + mic-driven
  note spawn (-41 lines, +28 tests).
- batch 19 — `midi-handlers.ts`: onMidiNoteOn/Off/CC + spawnMidiNoteVisuals (-26
  lines, +29 tests).
- batch 20 — `midi-indicator.ts`: badge + topbar pill + isAppleMobile + virtual
  port filter (-54 lines, +33 tests).
- batch 21 — `ble-midi-parser.ts`: BLE-MIDI 1.0 packet decoding (-32 lines, +19
  tests). Pure parser, edge-case-heavy spec.
- batch 22 — `midi-dispatch.ts`: byte-router with closure-captured BLE
  redelivery dedupe (+22 tests). Dedupe state extracted out of shell scope.
- batch 23 — `prefs-storage.ts`: localStorage wrapper + sanitizePrefs accept-
  list with quota-exceeded debouncing (-24 lines, +21 tests).
- batch 24 — `layout-detect.ts`: pure viewport classifier (-9 lines, +25 tests).
  Pinned every named device the comments mention.
- batch 25 — `midi-ports.ts`: attach + detach + verifyAlive + gatherMidiInputs
  polyfill helper (-64 lines, +37 tests). Closes the WMB visibility-resume
  re-bind contract.
- batch 26 — `midi-rescan.ts`: MIDIAccess cache + manual rescan + ramped
  auto-rescan poller (-109 lines, +25 tests). Injectable now()/setTimeout for
  deterministic poller tests.
- batch 27 — `ble-midi-connect.ts`: Web Bluetooth GATT connect path + GATT
  disconnect handler (-47 lines, +18 tests). Closes the BLE-MIDI cluster
  alongside ble-midi-parser (batch 21).
- batch 28 — `viewport-layout.ts`: syncLayout, refreshOsmdRect, onResizeBurst,
  measureBottom, bg-stars decision (-58 lines, +21 tests).
- batch 29 — `osmd-init.ts`: 100-line OSMD ctor + load + render + repetition
  activation + cursor wrapping (-83 lines, +21 tests). All accumulated quirks-
  handling pinned in tests.
- batch 30 — `render-loop.ts`: per-frame orchestrator. Ties RenderFrame /
  MicPipeline / RenderMid / RenderLate together via deps-builders for
  per-frame-fresh values; silence gate moved into the spectrum builder. +13
  tests.
- batch 31 — `score-loader.ts`: 156-line loadCurrentScore orchestrator (init →
  XML parse → notes extract → playback order → expand → sections → bpm → diag →
  drop xmlText), race-safe via stillCurrent thunk on every await boundary (-116
  lines, +22 tests).
- batch 32 — `osmd-cursor.ts`: 5 OSMD cursor functions (scroll/reset/clear/
  highlight/setCursorToNote) into one factory with closure-captured throttle +
  highlight tracker (**-125 lines**, +24 tests). **Biggest single batch.**
- batch 33 — `practice-tone-audio.ts`: lazy Tone.js synth instantiation +
  count-in scheduling + Transport-stop teardown (-26 lines, +17 tests).
- batch 34 — `section-notes.ts`: buildSectionNotes / buildFullSongNotes /
  computeHandRanges (-72 lines, +23 tests). Pure-ish builders.
- batch 35 — `intro-hint-ui.ts`: showHitChip + intro hint state machine +
  audio-init alert (-21 lines, +19 tests).
- batch 36 — `practice-scoring.ts`: medianRecentPitch + matchNoteOnset +
  finalizeNoteHold + practiceRealElapsedMs + practiceElapsedMs (-123 lines, +41
  tests). Chord-cluster matching, asymmetric early/late windows, audio- offset
  clock math.
- batch 37 — `practice-progress.ts`: load + save + per-song lookup + daily-
  streak record facade over PianoCore reducers (-3 lines net, +14 tests).
- batch 38 — `shell-helpers.ts`: setupHiDPICanvas, notePitchClass, midiToFreq,
  noteStateLabel, midiToPitchName, midiToFullName (-10 lines, +36 tests). All
  pure-functions; bilingual (EN/JP) note-name table parameterized.
- batch 39 — `start-practice-section.ts`: 209-line orchestrator for the kid's '▶
  Start practice' big-bang setup (-163 lines, +36 tests). Score lazy-load,
  per-section state reset, HUD writes, OSMD cursor, audio mode branching
  (guided/rhythm/listen), audio-offset probe.
- batch 40 — `onset-detect.ts`: 152-line multi-feature audio onset classifier
  (-112 lines, +15 tests). 5-condition gate (flux/spread/flatness/crest/
  harmonicity) + adaptive threshold + practice-mode hysteresis + AGC voice
  suppression counters.
- batch 41 — `session-confidence-ui.ts`: 100-line ring-buffer state-machine,
  sessionStatus DOM driver (-78 lines, +13 tests). waiting -> warmup ->
  performing transitions, motivation goal celebration.
- batch 42 — `game-state-update.ts`: 173-line per-frame game-state reducer (-117
  lines, +18 tests). Pitch median, adaptive RMS floor, onset routing, combo/flow
  bookkeeping with frame-rate-independent decay, stage transitions with
  celebration.
- batch 43 — `agc-controller.ts`: 25-line software AGC reducer (-4 lines net, +8
  tests). Asymmetric attack/release, voice-suppression cap.
- batch 44 — `hud-update.ts`: encouragement-banner reducer + flow-gauge writer
  with whole-percent-bucket cache + debug overlay (-43 lines, +17 tests).
- batch 45 — `quality-update.ts`: per-frame rhythm/dynamics/stability/composite
  scoring reducer + growth-trend ring + coaching-feedback i18n + DOM gate (-39
  lines, +12 tests).
- batch 46 — `quest-state-update.ts`: v10 Magic Quest tick + celebration toast,
  dot strip, activeQuestId mirror (-28 lines, +14 tests).
- batch 47 — `modal-focus.ts`: 57-line tab-trap + non-LIFO restore-on-close,
  document/rAF held by deps (-52 lines, +13 tests).
- batch 48 — `session-reset.ts`: 85-line full-session reset reducer (state
  scalars + 5 @piano/core reducers + 11 DOM clears + MIDI bookkeeping) (-44
  lines, +18 tests). midiState via thunk for TDZ.
- batch 49 — `user-songs-mxl.ts`: lazy IDBDatabase handle cache + 4-op wrapper
  generic over D/R + JSZip-backed .mxl extraction (-23 lines, +12 tests).
- batch 50 — `intro-diag.ts`: setIntroHintDiagnostic + showIntroDiag + clear +
  showMidiWaitingHint with iPad/WMB once-per-session guard, isAppleMobile +
  hasRequestMIDIAccess held by deps (-6 lines, +13 tests).
- batch 51 — `user-songs-store.ts`: IDB-backed user library CRUD + JSON
  export/import (-93 lines, +23 tests).
- batch 52 — `online-library.ts`: MuseTrainer GitHub catalog cluster —
  LIBRARY_PINNED_SHA + 69-entry JP override table + cache (-99 lines, +20
  tests).
- batch 53 — `playback-order.ts`: `fetchPlaybackOrder` +
  `expandNotesByPlaybackOrder` generic over note + order shapes (-48 lines, +12
  tests; +2 NaN-guard tests added in 093f53a Issue 1 fix).
- batch 54 — `select-song.ts`: 45-line song-switch orchestrator. Mutable
  currentSong/osmd flow through getter/setter thunks; held the fullSongMode
  reset bug fix (-31 lines, +18 tests).
- batch 55 — `practice-timings.ts`: effectiveTempoPct, practiceBeatMs,
  recomputePracticeTimings, showSectionBanner with TDZ-safe getPractice /
  getPracticeLane thunks (-37 lines, +17 tests).
- batch 56 — `mic-lifecycle.ts`: acquire / suspend / resume with concurrency
  lock; getter/setter thunks for the 4 audio-node mutable refs (audioCtx /
  gainNode / micStream / micSourceNode) (-45 lines, +19 tests).
- batches 57-70 (cycle 2 cont., commit `f1efbe5` + earlier) — midi-init,
  showRunningUI fold, canvas resize fold, audio-lifecycle fold, ESC router fold,
  applyI18n fold, audio-graph dedup, input-mode decision fold, remote-log +
  dom-bag + game-state-init + piano-config (4 new data modules), JSDoc typedef
  cleanup, applyDebug fold (-684 lines net + 67 new tests).
- **batches 71-90 (this cycle, commit `685d5df`)** landed as a single bulk
  commit — 6 new modules + 2 in-place builders + ~10 compaction passes:
  - batch 71 — `particle-effects.ts`: Particle/Ripple proto monkey-patches,
    PERF_TIER override, spawn/effect adapters (-150 lines, the largest
    structural fold of the cycle).
  - batch 72 — `practice-state-init.ts`: practice + prefs literals (-42).
  - batch 73 — `core-opts.ts`: 4 option bags, DEFAULT_AUDIO_OFFSET_MS,
    ONSET_HYSTERESIS_FRAMES, PITCH_MEDIAN_FRAMES, NOTE_NAMES_JP.
  - batch 74 — `dev-mode-wireup.ts`: 489-line DevMode test/benchmark/diag
    cluster.
  - batch 75 — `render-loop-wireup.ts`: 178-line RenderLoop deps-builders,
    frame-drop watchdog.
  - batch 76 — game-state-update.ts gains `buildGameStateUpdateDeps()`.
  - batch 77 — `boot-session.ts`: startBtn + songStart click handlers,
    setStartButtonLoading.
  - batch 78 — `_midiHandlerDeps` fn → const (one-time alloc, perf win).
  - batch 79 — double-cast type annotations (40 sites collapsed).
  - batch 80-81 — forward-decl + Phase 0d batch comment compaction.
  - batch 82 — onset-detect.ts gains `buildOnsetDetectDeps()`.
  - batch 83-85 — JSDoc typedef cleanup (PracticeStateShape, MidiInputShape,
    BestScoresShape, LastSummaryShape, PrefsShape, SectionDef, SongRec,
    OsmdLikeNote — all 8 shapes deleted; cast sites use `/** @type {any} */`).
  - batch 86 — section banner `// ====` triples → 1-line `// ── X ──` (56
    sites) + general 4+ line comment-run compaction.
  - batch 87 — initAudio block + file-header + WMB banner trim.
  - batch 88-89 — multi-line `dom: {...}` literals → single-line (19 sites).
  - batch 90 — `pickDom()` helper in dom-bag.ts (4 large DOM bags consolidated).
- **batch 91 (commit `3785326`)** — pure compaction pass on top of the bulk
  commit, no module extractions: PWA reg cleanup (vite-plugin-pwa already
  injects registerSW.js), audio-singleton triple-cast → single any-cast (8
  sites), DOM bag inline → `DomBag.pickDom()` (8 sites: `_selectSong`,
  `_introHintUi`, `_viewportLayout`, `_songPanelControls`, `_sessionSummary`,
  `devMode`, `_questStateUpdate`, render-loop), ESC router `_isOpen` /
  `_isVisible` predicate dedup (5 routes), tuning bag field-grouping (agc,
  sessionConfidence, practiceScoring), score-loader cast cleanup (-244, −11.6% —
  2,095 → 1,851).
- **batch 92 (commit `aa02e92`)** — second pure compaction pass: shared
  `_applyAudioGraph` / `_resetOnsetState` helpers dedup the 7-prop audio-node
  rebinding across `rebuildAudioGraph` + `_audioRecovery.applyContext`; new
  `byId(id)` shorthand kills 26 `document.getElementById('...')` call sites in
  `DOM_ADDSONG` / `DOM_SECEDIT`; `_bgOpts(time)` shared by `drawAurora` /
  `drawGroundFlowers`; `_selectSong` deps cast widened (12 per-field casts → 1
  outer-cast); 7 wireup blocks field-grouped onto fewer lines; dead `typeof`
  guards removed (`osmd`, `DOM_ADDSONG`); double/triple-cast collapses on
  `ensureMidiAccess`, `gatherMidiInputs`, `attachMidiPort` / `detachMidiPort`.
  (-124, −6.7% — 1,851 → 1,727).
- **batch 93 (commit `2f9033f`)** — dead-code sweep: 19 unused const + 7 unused
  forwarder-function declarations removed (`FOCAL_LENGTH`, `NEAR_CLIPPING`,
  `project3D`, `MAX_PARTICLES_3D`, `PERF_TIER`, `effectShimmer` /
  `effectColorWave` / `effectGlowParticles` / `effectRadiance`, `STAR_TIERS`,
  `BLE_MIDI_SERVICE` / `BLE_MIDI_CHAR`, `USER_DB_NAME`,
  `collectSectionCandidates`, `_osmdInitPromise`, `defaultSongProgress`,
  `notePitchClass`, `midiToFreq`, `drawStar` / `drawFlower`; forwarders
  `acquireMic`, `detectLayout`, `mergeTiedNotes`, `userDbDelete`,
  `libraryEntryFromGhFile`, `effectiveTempoPct`, `refreshMidiBadge`,
  `clearIntroDiagCache`, `transitionToSection`; shell-local `safeLeft`).
  Verified each via `grep -cE '\b<id>\b'`: no consumers anywhere. (-43, −2.5% —
  1,727 → 1,684).
- **batch 94 (commit `1189a60`)** — forwarder inlining + TDZ-guard
  simplification: 4 OSMD-cursor forwarders inlined into `osmdAdapter` (each used
  once); `spawnMidiNoteVisuals`, `noInputAvailable`, `KB_*` consts removed
  (dead); 5 `typeof xxx === 'function' && xxx()` guards collapsed to direct
  calls (function declarations are hoisted — no TDZ risk);
  `typeof midiInput !== 'undefined' ? midiInput.enabled : false` →
  `midiInput?.enabled ?? false` (same semantics, shorter). (-55, −3.3% — 1,684 →
  1,629).
- **batch 95 (commit `b9251f1`)** — wireup deps-block field-grouping pass: 13
  factories (`_questStateUpdate`, `_hudUpdate`, `_debugOverlay`,
  `_practiceTimings`, `_onlineLibrary`, `_osmdInit`, `_introDiag`,
  `_introHintUi`, `_resultCard`, `_songPanelRender`, `_midiHandlerDeps`,
  `_midiRender`, RenderLoopWireup, AudioInit.createAudioLifecycle) had their
  verbose `/** @type {import('./xxx').XxxDeps} */` casts replaced by a single
  outer `/** @type {any} */` cast + shorthand-property field-grouping; comment
  trimming (4 separator-comment-only lines + dangling fragment cleanups). (-64,
  −3.9% — 1,629 → 1,565).
- **batch 96 (commit `ae775b5`)** — first proper module extraction since the
  bulk batches 71-90 commit: new `web/built-in-songs.ts` (78 lines) exporting
  `makeSong()` + `createBuiltInSongs()` for the static catalog of PD scores (Für
  Elise + Rondo alla Turca). Shell loses the 30-line literal, gains a 2-line
  factory call. (-27, −1.7% — 1,565 → 1,538).
- **batch 97 (commit `568e8b9`)** — second wireup deps-block field-grouping
  pass: 10 more factories (`_sessionSummary`, `_practiceScoring`,
  `_practiceProgress`, `_practiceToneAudio`, `_startPracticeSection`,
  `updatePractice`, `_practiceLane`, both `BootSession.installXxx`,
  `_practiceFlow`); shared `_sectionNotesArgs()` thunk dedups
  buildSectionNotes/buildFullSongNotes args literal; dead `roundRect` helper
  removed; dead langchange `typeof activeNoteNames` guard removed (TDZ guards on
  let-decls are dead code). (-51, −3.3% — 1,538 → 1,487).
- **batch 98 (commit `971b833`)** — user-songs forwarder dedup + new
  `osmd-adapter.ts` extraction. Outer `_userSongs` (UserSongsStore) renamed to
  `_userSongStore`; 4 forwarder declarations (`registerUserSong`,
  `addUserSongFromBlob`, `addUserSongFromUrl`, `renameUserSong`) deleted —
  UserSongsUi consumes them as direct property references on `_userSongStore`.
  The `osmd-adapter.ts` factory holds the 30-line `OsmdAdapter` literal (the
  typed boundary that lets score-loader/cursor drive OSMD). (-27, −1.8% — 1,487
  → 1,460).
- **batch 99 (commit `d3f0b4e`)** — third wireup deps-block field-grouping pass:
  10 more factories (`_sectionEditor`, `_userSongs` UI, `_midiDispatch`,
  `_midiIndicator`, `_midiPorts`, `_midiRescan`, `_midiInit`,
  `AudioInit.createAudioLifecycle`, `_bleConnect`, `_settings`, `_scoreLoader`);
  \_scoreLoader cast-laden delegating arrow-fn block collapsed from 20 to 8
  lines (deps signatures align with shell function references after the outer
  any-cast); 2 dead TDZ guards on `DOM_SECEDIT` / `DOM_ADDSONG` removed;
  `typeof SONGS !== 'undefined' ? ... : null` → `SONGS?.[id]`; 6
  separator-comment lines removed. (-55, −3.8% — 1,460 → 1,405).

**iPad verification — landed earlier**:
`https://atariryuma.github.io/PianoVisualizer/?dev=1` activates a hidden toolbar
with **🧪 Self-test** (10 pass/fail checks for every extracted module's
globalThis presence, DOM bag completeness, AudioContext, Web MIDI, Service
Worker, Wake Lock, prefs round-trip), **📊 Diag** (read-only state snapshot, 1Hz
refresh), **🎯 Benchmark** (11 long-running behavioural probes), **📋 Copy**
(markdown report → clipboard for chat paste, includes build SHA + UA), and **✕**
(deactivate). Persistent via localStorage; `?dev=0` clears.

---

## ✅ Completed (rotated out — see ROADMAP 0b.2)

| #   | Module                          | Tests | Where                                           |
| --- | ------------------------------- | ----- | ----------------------------------------------- |
| 1   | `audio/chord.ts`                | 12    | `packages/core/src/audio/chord.ts`              |
| 2   | `audio/yin.ts`                  | 16    | `packages/core/src/audio/yin.ts`                |
| 3   | `audio/spectral.ts`             | 18    | `packages/core/src/audio/spectral.ts`           |
| 4   | `audio/harmonicity.ts`          | 7     | `packages/core/src/audio/harmonicity.ts`        |
| 5   | `audio/audio-context.ts`        | 10    | `packages/core/src/audio/audio-context.ts`      |
| 6   | `audio/agc.ts`                  | 13    | `packages/core/src/audio/agc.ts`                |
| 7   | `audio/onset.ts`                | 11    | `packages/core/src/audio/onset.ts`              |
| 8   | `library/musicxml-meta.ts`      | 4     | `packages/core/src/library/musicxml-meta.ts`    |
| 9   | `library/auto-section.ts`       | 11    | `packages/core/src/library/auto-section.ts`     |
| 10  | `library/user-songs.ts`         | 15    | `packages/core/src/library/user-songs.ts`       |
| 11  | `state/session-confidence.ts`   | 17    | `packages/core/src/state/session-confidence.ts` |
| 12  | `state/quality.ts`              | 27    | `packages/core/src/state/quality.ts`            |
| 13  | `i18n/`                         | 23    | `packages/core/src/i18n/index.ts` + strings.ts  |
| 14  | `config.ts`                     | 17    | `packages/core/src/config.ts`                   |
| 15  | `state/midi-state.ts`           | 21    | `packages/core/src/state/midi-state.ts`         |
| 16  | `state/practice-state.ts`       | 41    | `packages/core/src/state/practice-state.ts`     |
| 17  | `render/particles.ts`           | 34    | `packages/core/src/render/particles.ts`         |
| 18  | `render/ripples.ts`             | 10    | `packages/core/src/render/ripples.ts`           |
| 19  | `render/effects.ts`             | 17    | `packages/core/src/render/effects.ts`           |
| 20  | `render/keyboard.ts`            | 16    | `packages/core/src/render/keyboard.ts`          |
| 21  | `render/lane.ts`                | 18    | `packages/core/src/render/lane.ts`              |
| 22  | `render/background.ts`          | 17    | `packages/core/src/render/background.ts`        |
| 23  | `render/theme.ts`               | 17    | `packages/core/src/render/theme.ts`             |
| 24  | `render/spectrum.ts`            | 12    | `packages/core/src/render/spectrum.ts`          |
| 25  | `render/center-glow.ts`         | 9     | `packages/core/src/render/center-glow.ts`       |
| 26  | `render/stage.ts`               | 19    | `packages/core/src/render/stage.ts`             |
| 27  | `state/flow-meter.ts`           | 27    | `packages/core/src/state/flow-meter.ts`         |
| 28  | `state/encouragement.ts`        | 22    | `packages/core/src/state/encouragement.ts`      |
| 29  | `state/quest-tracker.ts`        | 16    | `packages/core/src/state/quest-tracker.ts`      |
| 30  | `state/quality-history.ts`      | 16    | `packages/core/src/state/quality-history.ts`    |
| 31  | `state/pitch-stability.ts`      | 26    | `packages/core/src/state/pitch-stability.ts`    |
| 32  | `audio/chord-window.ts`         | 16    | `packages/core/src/audio/chord-window.ts`       |
| 33  | `state/wake-up-flash.ts`        | 14    | `packages/core/src/state/wake-up-flash.ts`      |
| 34  | `state/streak.ts`               | 19    | `packages/core/src/state/streak.ts`             |
| 35  | `render/midi-beams.ts`          | 8     | `packages/core/src/render/midi-beams.ts`        |
| 36  | `library/score-timing.ts`       | 16    | `packages/core/src/library/score-timing.ts`     |
| 37  | `library/measure-timing.ts`     | 13    | `packages/core/src/library/measure-timing.ts`   |
| 38  | `library/playback-order.ts`     | 17    | `packages/core/src/library/playback-order.ts`   |
| 39  | `web/audio-scheduler.ts`        | —     | `packages/web/src/audio-scheduler.ts`           |
| 40  | `library/merge-tied-notes.ts`   | 15    | `packages/core/src/library/merge-tied-notes.ts` |
| 41  | `library/diag-load.ts`          | 15    | `packages/core/src/library/diag-load.ts`        |
| 42  | `state/practice-progress.ts`    | 15    | `packages/core/src/state/practice-progress.ts`  |
| 43  | `web/note-extractor.ts`         | —     | `packages/web/src/note-extractor.ts`            |
| 44  | shape typedefs (state etc.)     | —     | `packages/web/src/legacy-app.js` (top of file)  |
| 45  | `@param` sweep (60+ helpers)    | —     | `packages/web/src/legacy-app.js`                |
| 46  | Phase 0c.5 — `// @ts-check`     | —     | `packages/web/src/legacy-app.js` (top of file)  |
| 47  | `web/wakelock.ts`               | —     | `packages/web/src/wakelock.ts`                  |
| 48  | web tests (3 shell modules)     | 46    | `packages/web/tests/*.test.ts`                  |
| 49  | `web/section-editor.ts`         | 20    | `packages/web/src/section-editor.ts`            |
| 50  | `web/settings-panel.ts`         | 20    | `packages/web/src/settings-panel.ts`            |
| 51  | i18n wire-up via `createT`      | —     | `packages/web/src/legacy-app.js` (-301 lines)   |
| 52  | `web/audio-init.ts`             | 21    | `packages/web/src/audio-init.ts`                |
| 53  | feat: 全曲再生 listen toggle    | —     | `packages/web/src/legacy-app.js` (+88 lines)    |
| 54  | `web/user-songs-ui.ts`          | 31    | `packages/web/src/user-songs-ui.ts`             |
| 55  | `web/theme-controls.ts`         | 17    | `packages/web/src/theme-controls.ts`            |
| 56  | `web/practice-flow.ts`          | 21    | `packages/web/src/practice-flow.ts`             |
| 57  | `web/song-panel-controls.ts`    | 12    | `packages/web/src/song-panel-controls.ts`       |
| 58  | `web/song-panel-render.ts`      | 31    | `packages/web/src/song-panel-render.ts`         |
| 59  | `web/practice-tick.ts`          | 20    | `packages/web/src/practice-tick.ts`             |
| 60  | `web/result-card.ts`            | 27    | `packages/web/src/result-card.ts`               |
| 61  | `web/session-summary.ts`        | 17    | `packages/web/src/session-summary.ts`           |
| 62  | `web/render-frame.ts`           | 18    | `packages/web/src/render-frame.ts`              |
| 63  | `web/dev-mode.ts`               | 24    | `packages/web/src/dev-mode.ts` (in-app testing) |
| 64  | `web/render-mid.ts`             | 14    | `packages/web/src/render-mid.ts`                |
| 65  | `web/render-late.ts`            | 16    | `packages/web/src/render-late.ts`               |
| 66  | `web/practice-lane.ts`          | 19    | `packages/web/src/practice-lane.ts`             |
| 67  | `web/section-editor.ts`         | 20    | `packages/web/src/section-editor.ts`            |
| 68  | `web/midi-render.ts`            | 9     | `packages/web/src/midi-render.ts`               |
| 69  | bench harness (autorun+wh)      | 7     | `packages/web/vite-bench-plugin.ts` + bench.mjs |
| 70  | `web/mic-pipeline.ts`           | 28    | `packages/web/src/mic-pipeline.ts`              |
| 71  | `web/midi-handlers.ts`          | 29    | `packages/web/src/midi-handlers.ts`             |
| 72  | `web/midi-indicator.ts`         | 33    | `packages/web/src/midi-indicator.ts`            |
| 73  | `web/ble-midi-parser.ts`        | 19    | `packages/web/src/ble-midi-parser.ts`           |
| 74  | `web/midi-dispatch.ts`          | 22    | `packages/web/src/midi-dispatch.ts`             |
| 75  | `web/prefs-storage.ts`          | 21    | `packages/web/src/prefs-storage.ts`             |
| 76  | `web/layout-detect.ts`          | 25    | `packages/web/src/layout-detect.ts`             |
| 77  | `web/midi-ports.ts`             | 37    | `packages/web/src/midi-ports.ts`                |
| 78  | `web/midi-rescan.ts`            | 27    | `packages/web/src/midi-rescan.ts`               |
| 79  | `web/ble-midi-connect.ts`       | 18    | `packages/web/src/ble-midi-connect.ts`          |
| 80  | `web/viewport-layout.ts`        | 21    | `packages/web/src/viewport-layout.ts`           |
| 81  | `web/osmd-init.ts`              | 21    | `packages/web/src/osmd-init.ts`                 |
| 82  | `web/render-loop.ts`            | 13    | `packages/web/src/render-loop.ts`               |
| 83  | `web/score-loader.ts`           | 22    | `packages/web/src/score-loader.ts`              |
| 84  | `web/osmd-cursor.ts`            | 24    | `packages/web/src/osmd-cursor.ts`               |
| 85  | `web/practice-tone-audio.ts`    | 17    | `packages/web/src/practice-tone-audio.ts`       |
| 86  | `web/section-notes.ts`          | 23    | `packages/web/src/section-notes.ts`             |
| 87  | `web/intro-hint-ui.ts`          | 19    | `packages/web/src/intro-hint-ui.ts`             |
| 88  | `web/practice-scoring.ts`       | 41    | `packages/web/src/practice-scoring.ts`          |
| 89  | `web/practice-progress.ts`      | 14    | `packages/web/src/practice-progress.ts`         |
| 90  | `web/shell-helpers.ts`          | 36    | `packages/web/src/shell-helpers.ts`             |
| 91  | `web/start-practice-section.ts` | 36    | `packages/web/src/start-practice-section.ts`    |
| 92  | `web/onset-detect.ts`           | 15    | `packages/web/src/onset-detect.ts`              |
| 93  | `web/session-confidence-ui.ts`  | 13    | `packages/web/src/session-confidence-ui.ts`     |
| 94  | `web/game-state-update.ts`      | 18    | `packages/web/src/game-state-update.ts`         |
| 95  | `web/agc-controller.ts`         | 8     | `packages/web/src/agc-controller.ts`            |
| 96  | `web/hud-update.ts`             | 17    | `packages/web/src/hud-update.ts`                |
| 97  | `web/quality-update.ts`         | 12    | `packages/web/src/quality-update.ts`            |
| 98  | `web/quest-state-update.ts`     | 14    | `packages/web/src/quest-state-update.ts`        |
| 99  | `web/modal-focus.ts`            | 13    | `packages/web/src/modal-focus.ts`               |
| 100 | `web/session-reset.ts`          | 18    | `packages/web/src/session-reset.ts`             |
| 101 | `web/user-songs-mxl.ts`         | 12    | `packages/web/src/user-songs-mxl.ts`            |
| 102 | `web/intro-diag.ts`             | 13    | `packages/web/src/intro-diag.ts`                |
| 103 | `web/user-songs-store.ts`       | 23    | `packages/web/src/user-songs-store.ts`          |
| 104 | `web/online-library.ts`         | 20    | `packages/web/src/online-library.ts`            |
| 105 | `web/playback-order.ts`         | 14    | `packages/web/src/playback-order.ts`            |
| 106 | `web/select-song.ts`            | 18    | `packages/web/src/select-song.ts`               |
| 107 | `web/practice-timings.ts`       | 17    | `packages/web/src/practice-timings.ts`          |
| 108 | `web/mic-lifecycle.ts`          | 19    | `packages/web/src/mic-lifecycle.ts`             |
| 109 | `web/midi-init.ts`              | 14    | `packages/web/src/midi-init.ts`                 |
| 110 | `web/remote-log.ts`             | 25    | `packages/web/src/remote-log.ts`                |
| 111 | `web/dom-bag.ts`                | 7     | `packages/web/src/dom-bag.ts`                   |
| 112 | `web/game-state-init.ts`        | 14    | `packages/web/src/game-state-init.ts`           |
| 113 | `web/piano-config.ts`           | 21    | `packages/web/src/piano-config.ts`              |
| 114 | `web/particle-effects.ts`       | —     | `packages/web/src/particle-effects.ts`          |
| 115 | `web/practice-state-init.ts`    | —     | `packages/web/src/practice-state-init.ts`       |
| 116 | `web/core-opts.ts`              | —     | `packages/web/src/core-opts.ts`                 |
| 117 | `web/dev-mode-wireup.ts`        | —     | `packages/web/src/dev-mode-wireup.ts`           |
| 118 | `web/render-loop-wireup.ts`     | —     | `packages/web/src/render-loop-wireup.ts`        |
| 119 | `web/boot-session.ts`           | —     | `packages/web/src/boot-session.ts`              |
| 120 | `web/built-in-songs.ts`         | —     | `packages/web/src/built-in-songs.ts`            |
| 121 | `web/osmd-adapter.ts`           | —     | `packages/web/src/osmd-adapter.ts`              |
| 122 | `web/shell-midi.ts`             | —     | `packages/web/src/shell-midi.ts`                |
| 123 | `web/shell-add-song.ts`         | —     | `packages/web/src/shell-add-song.ts`            |
| 124 | `web/shell-osmd.ts`             | —     | `packages/web/src/shell-osmd.ts`                |
| 125 | `web/shell-audio.ts`            | —     | `packages/web/src/shell-audio.ts`               |
| 126 | `web/shell-game-update.ts`      | —     | `packages/web/src/shell-game-update.ts`         |
| 127 | `web/shell-midi-handlers.ts`    | —     | `packages/web/src/shell-midi-handlers.ts`       |
| 128 | `web/shell-practice.ts`         | —     | `packages/web/src/shell-practice.ts`            |
| 129 | `web/shell-ui.ts`               | —     | `packages/web/src/shell-ui.ts`                  |
| 130 | `web/shell-user-library.ts`     | —     | `packages/web/src/shell-user-library.ts`        |
| 131 | `web/shell-effects.ts`          | —     | `packages/web/src/shell-effects.ts`             |
| 132 | `web/shell-session-state.ts`    | —     | `packages/web/src/shell-session-state.ts`       |
| 133 | `web/shell-render-loop.ts`      | —     | `packages/web/src/shell-render-loop.ts`         |
| 134 | `web/shell-viewport.ts`         | —     | `packages/web/src/shell-viewport.ts`            |

**Status: 2,157/2,157 tests green (786 core + 1,371 web), 0 lint errors, 0 type
errors. `pnpm verify` clean.** Production build smoke test (puppeteer load + ▶
Start click) reports zero console errors. `legacy-app.js`: **616 lines** (was
9,000+ at Phase 0a; 4,077 at this commit window's start `f1efbe5`, **−3,461
net** across 44 batches in `685d5df` + 91-114, plus the parallel `f3f226c`
tie-aware OSMD cursor fix; **−8,384 net** since Phase 0a baseline). Phase 0e DoD
(≤200 lines): ~416 lines remaining — primarily the residual forward-decl
placeholders + ESC router + langchange listener + 13 shell-bootstrap factory
call sites + DevModeWireup + the small-helper cluster.

---

## ⏳ In queue

## 1. Phase 0d → 0e transition — main.ts wire-up rewrite

The shell is currently **759 lines** (was 2,095 at start of batch 91). Goal:
≤200 lines via Phase 0e (retire `legacy-app.js` entirely). The
fold-into-existing approach has hit diminishing returns at this size — the
remaining ~1,900 lines are ~95% factory wire-ups + closure thunks + inline event
handlers, all of which need to move to `main.ts` or a dedicated
`shell-bootstrap.ts` under a new architecture rather than be folded into
existing modules.

Recommended Phase 0e workflow (next agent):

1. **Audit `main.ts`** — currently 471 lines with 64 imports + 64 globalThis
   pins. Phase 0e plan: rewrite it to do the entire IIFE boot sequence directly
   (CONFIG → DOM → state → factory wireups → event listeners → seed call),
   removing the legacy-app.js re-import altogether.
2. **Stage the migration in 3 sub-batches**: (a) move all
   `const _xxx = Xxx.create...` factory wireups into a `shell-bootstrap.ts`,
   keeping the same closures over shell-private state. (b) move the remaining
   inline event handlers (langchange listener, ESC routes not yet covered,
   song-button click handlers, ResizeObservers). (c) delete `legacy-app.js` +
   add a tag (`phase-0e-done`).
3. **iPad A/B is mandatory before tagging** — the shell IIFE has subtle
   eval-order dependencies (e.g., particle-effects' practice getter proxy works
   because `practice` is declared LATER but accessed via getter). Migration must
   preserve that ordering. The `?dev=1` Self-test bench will catch most
   regressions; the `?dev=1&autorun=bench&webhook=...` puppeteer harness can
   verify end-to-end.

iPad verification still works via the in-app **🧪 Self-test** at `?dev=1` (no
manual A/B checklist needed for the mechanical wire-up checks).

Batches 1-12 all landed cleanly. Remaining work:

- [x] `web/section-editor.ts` — section-edit modal (landed batch 2)
- [x] `web/settings-panel.ts` — settings panel + persist (landed batch 3)
- [x] i18n wire-up via `PianoCore.createT()` (landed batch 4, -301 lines)
- [x] `web/audio-init.ts` — AudioContext factory + recovery seam (landed batch
      5, -28 lines, +21 tests). Note: `initAudio` / `acquireMic` / `suspendMic`
      / `resumeMic` and the devicechange + visibilitychange listeners
      deliberately stayed in the shell — they're tied to the state-machine and
      reach into too many shell-private vars to extract without churning every
      audio-node read across the rest of the file.
- [x] `web/user-songs-ui.ts` — Add/Manage Songs modal + start-screen tiles +
      library export/import (landed batch 6, -366 lines, +31 tests).
- [x] `web/theme-controls.ts` — theme bar + synesthesia toggle + lang toggle
      (landed batch 7a, -42 lines, +17 tests).
- [x] `web/practice-flow.ts` — ptbQuit / ptbToggleOsmd / result-card buttons /
      sumClose / 🏠 Title buttons / returnToTitle / transitionToSection (landed
      batch 7b, -46 lines, +21 tests).
- [x] `web/song-panel-controls.ts` — hand row + mode row + ghost / metronome /
      full-song toggles + songBack (landed batch 7c, -10 lines, +12 tests).
      Note: songStart + startBtn deliberately stayed in the shell — they pull in
      initAudio, showRunningUI, initBgStars, requestAnimationFrame(loop), and
      startPracticeSection, which are practice-tick / render-loop batch
      concerns.
- [x] `web/song-panel-render.ts` — the 150-line renderSongPanel (header / streak
      / BPM hint / tempo row / section list / mode + hand active / toggle
      visibility / start-button copy) (landed batch 7d, -118 lines, +31 tests).
- [x] `web/practice-tick.ts` — per-frame updatePractice hot path: diag log,
      auto-mark missed / auto-advance, mic-onset matching, cursor skip, progress
      HUD, section-complete + 600ms grace timer with race-guard (landed batch 8,
      -93 lines, +20 tests).
- [x] `web/result-card.ts` — renderResultCard + completePracticeSection +
      drawHistoryChart (landed batch 10, -213 lines, +27 tests). Forward-
      declared placeholders + thunked practice-tick wiring so the deps DAG stays
      acyclic even though result-card is declared after the practice-tick
      wire-up.
- [x] `web/session-summary.ts` — saveBestScores + renderSessionSummaryText +
      showSessionSummary + drawRadarChart (landed batch 11, -193 lines, +17
      tests). The shared formatTime / updatePlayTime / setupHiDPICanvas helpers
      stay in legacy-app.js (used by both result-card and the loop) under a
      'Shared helpers' header right above the wire-up.
- [ ] `web/render-loop.ts` — `loop()` frame composer (~240 lines). Hardest
      remaining batch: ~50 deps (every render layer + state + MIDI + practice
      tick). Recommend sub-batching by render phase (background fade +
      bg-stars + aurora + ground flowers; center-glow + spectrum; ripples +
      beams + particles + keyboard; HUD + practice lane) rather than one mega
      extraction.
- [ ] More event-wiring sub-batches (~1100 lines remain). Highest-ROI
      candidates: ptbInput (MIDI rescan toggle); songStart + startBtn (boot
      coupling, currently tied to initAudio + requestAnimationFrame(loop));
      BLE-MIDI listener cluster; OSMD click-to-seek in lane code.
- [ ] `web/practice-tick.ts` — `updatePractice` hot path (~250 lines, mid-high)
- [ ] `web/render-loop.ts` — `loop()` frame composer (~500 lines, hardest)

**Acceptance per extraction**:

- [ ] New `.ts` file under `packages/web/src/` with focused exports
- [ ] Wired into `main.ts` (typed import) + pinned to `globalThis` if shell
      needs
- [ ] Old block deleted from `legacy-app.js`
- [ ] `pnpm verify` clean
- [ ] iPad practice-mode A/B (or desktop Chrome equivalent) — section start +
      hit detection + scoring all work end-to-end

**DoD for Phase 0d**: `wc -l packages/web/src/legacy-app.js` ≤ 200.

**WMB-workaround tagging note** (added 2026-05-07): the iPad / Web MIDI
Browser-specific MIDI hacks in `legacy-app.js` are bracketed by
`// @WMB-WORKAROUND` … `// /@WMB-WORKAROUND` markers. They're temporary
scaffolding until Phase 1 ships the Capacitor native build (which uses
`packages/plugins/capacitor-piano-midi/` instead of Web MIDI Browser). After
Phase 1 lands, run

```bash
grep -nE "@WMB-WORKAROUND" packages/web/src/legacy-app.js
```

and delete each tagged block. Universal MIDI improvements that sit next to the
WMB blocks (auto-rescan poller, visibility-resume re-enumeration, badge waiting
state, manual rescan tap) STAY — those help every platform.

**Note for next agent — audio-init is next, but read this first**: the four
batches that landed (wakelock, section-editor, settings-panel, i18n) followed
the same deps-injection pattern. `audio-init` is harder than its predecessors
because the audio nodes (`audioCtx`, `gainNode`, `analyser`, `dataArray`,
`freqArray`, `onsetAnalyser`, `onsetDataArray`) are read from many callsites
across the shell, not just `initAudio` + `recoverAudioContext`. Two viable
shapes:

1. **Return-and-assign**: `createAudio(deps)` returns the seven node handles for
   the shell to assign to its `let` locals. Clean for first-init but
   `recoverAudioContext` mutates `audioCtx` mid-session — it would need to live
   in the same module and accept a mutable-ref bag for the nodes it re-creates.
2. **Mutable-ref bag throughout**: pass `{ audioCtx, gainNode, ... }` in/out;
   shell reads `nodes.audioCtx` everywhere. Bigger callsite churn but cleaner
   ownership.

Either way, **iPad A/B is mandatory before pushing**: AudioContext recreation on
`visibilitychange` and `devicechange` (mkpts 4367..4445 in the current shell) is
the highest-stakes seam in the whole app. WebKit Bugs 237878 + 261554 mean any
half-working recovery results in dead audio post-background.

The wakelock extraction commit (`fa479f4`) is the canonical pattern for the
mechanical parts. Replicate:

1. Read the legacy code block in `legacy-app.js`.
2. Create `packages/web/src/<name>.ts` with explicit exports and
   `@piano/core`-compatible types. Keep deps narrow — pass them in via function
   args or an init object rather than reaching for shell globals from inside the
   module.
3. Add the import + `globalThis` pin in `packages/web/src/main.ts`. Avoid
   identifier names that clash with lib.dom (e.g. `WakeLock` → `PianoWakeLock`).
4. In `legacy-app.js`, replace the inline implementation with thin
   alias-from-global forwarders so the rest of the shell keeps calling the short
   names.
5. `pnpm verify` clean.
6. **iPad practice-mode A/B**: load a song, start a section, play through to
   completion, verify scoring + section-result modal. Especially watch the SW
   console (some extractions have triggered SW SecurityErrors).

## 2. Phase 0e — Retire `legacy-app.js` entirely

Once `legacy-app.js` is ≤200 lines, fold the residual into `main.ts` and delete
the file. Detailed checklist in
[ROADMAP.md](ROADMAP.md#phase-0e--retire-legacy-appjs-entirely).

**Tag at completion: `phase-0e-done`.** This is the agreed waypoint before Phase
1 (Capacitor first install, blocked on Mac + Xcode + Android Studio).

---

## Backlog (rotate up as items complete)

Phase 1 Capacitor install needs Mac + Xcode + Android Studio, so it's blocked on
human hardware. See
[ROADMAP.md](ROADMAP.md#phase-1--capacitor-first-install--blocked-on-human).

**Pedagogy / learning-effectiveness follow-ups** (research-driven, kid-safe, all
implementable without hardware — vet each against the banned-list):

- **Extend journal-modal coverage**. `journal-modal.test.ts` now harnesses
  `render()` (smoke + weekly-growth row). The repertoire / stamps / calendar /
  pianist-card sub-renders are exercised (no throw) but not yet asserted in
  detail — extend the harness to pin their output (seal glyphs, stamp earned vs
  silhouette, calendar practiced days) so future journal edits are
  regression-safe.

---

## How agents should update this file

When you finish a task above:

1. Move the row to "✅ Completed" table at the top.
2. Add a new item from "Backlog" to the bottom of "⏳ In queue".
3. Keep "⏳ In queue" between 5 and 8 items at all times.
4. Bump the "Last refreshed" date.
