# Compliance Checklist

Use this before submitting Piano Visualizer to the App Store / Google Play. Each
item cites the relevant rule and the evidence to attach.

## ⭐ Category decision (2026-07-20): 4+ / Education — NOT the "Kids" category

We ship as a **4+ age-rated app in the Education category**, deliberately NOT in
Apple's dedicated **"Kids" category**. The Kids category's extra burdens
(mandatory parental gate before every permission/link/purchase, zero third-party
analytics/ads, COPPA age-gating machinery) are heavy; this app collects **no
data** (on-device processing, no accounts, no third-party SDKs, only a
SHA-pinned static library fetch), so a plain 4+ / Education listing keeps review
light while broadening the audience. The kid-safe **design** (banned- list, no
ads, no tracking) is retained as a product promise, not a category obligation.

**What this relaxes** (items below marked "Kids-only" no longer block us):

- No mandatory parental gate before the mic permission prompt (a clear usage
  string is still required — we have one).
- External links / third-party analytics are permitted (we still ship none, by
  choice — keeps the "no tracking" promise true).

**What still applies regardless of category:** a Privacy Policy URL + accurate
Privacy Nutrition Label ("Data Not Collected"), 4.2.3 minimum functionality (the
native MIDI plugin satisfies it), 4.7 pinned runtime content, and 5.2.3
public-domain music licensing docs.

## 🚀 Minimal path to first sale (human steps only I, the developer, must do)

Everything in code is done (built + hardware-verified on iPad). These are the
remaining **console / account** steps — none are code:

1. [ ] **Apple Developer Program** — enrol the paid membership ($99/yr). The
       free Apple ID only allows on-device debugging, not App Store submission.
2. [ ] **App Store Connect → new app**: bundle id `com.pianovisualizer.app`,
       **Category = Education**, then the **age-rating questionnaire → 4+**.
3. [ ] **Metadata**: name, subtitle, description (lead with "no ads · no
       tracking · bring your own sheet music · works with just a mic"),
       keywords, support URL.
4. [ ] **Screenshots** (capturable from the iOS Simulator —
       `xcrun simctl io    <udid> screenshot`): iPad Pro 12.9" (required),
       iPhone 6.7", iPad 11".
5. [ ] **Privacy**: publish `docs/PRIVACY.md` to a public URL (GitHub Pages),
       paste it into App Store Connect, and set the Privacy Nutrition Label to
       **"Data Not Collected"**.
6. [ ] **Price**: free, or pick a price tier (see `README`/strategy — a low-
       price or free-with-nothing-nasty launch fits the "honest app" promise).
7. [ ] **Archive & upload**: Xcode → Product → Archive → Distribute App (needs
       the paid account's distribution signing).
8. [ ] Run the **Rejection rehearsal** at the bottom of this file first.

Everything below is the full reference checklist; the 8 items above are the
minimum to get a first build submitted.

## Pre-flight (every build)

- [ ] `REMOTE_LOG_ENABLED` resolves to `false` in mobile build (verify via grep
      of bundled `legacy-app.js` — string `/log` should not appear except in
      comments). The current code gates by `location.hostname` checks, but
      Capacitor's `capacitor://localhost` would falsely match `localhost` — use
      a build-time `--define` flag to force-disable.
- [ ] No external links surfaced in UI when running with
      `Capacitor.isNativePlatform()` true. (Kids-only requirement — relaxed for
      our 4+/Education listing, but we still ship none, which keeps the "no
      tracking" promise simple. Good hygiene to keep.)
- [ ] Microphone usage description in `Info.plist` and `AndroidManifest.xml`
      uses kid-friendly language.
- [ ] All MusicXML URLs in source pinned to a specific GitHub commit SHA (Apple
      4.7 — runtime content is in App Review scope).

## Apple App Store

### Guidelines hits we know are relevant

| Rule                        | What it means                                                                                         | Status                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1.3 Kids Category           | Parental gate before permission/link/purchase; no 3rd-party ads/analytics.                            | ➖ N/A — we ship 4+/Education, not Kids  |
| 4.2.3 Minimum Functionality | "Repackaged web content" gets rejected. Need native value beyond what mobile Safari can do.           | ✅ Native MIDI plugin satisfies this     |
| 4.7 (rewritten 2025-11-13)  | Runtime-loaded JS/HTML5 mini-content is reviewed as if shipped. URLs must be stable, no dynamic eval. | ✅ jsDelivr URLs commit-pinned           |
| 5.1.4 Kids Category data    | No PII or device info to third parties. No IDFA.                                                      | ✅ Zero collection                       |
| 5.2.3 Audio licensing       | Streamed/embedded music needs license documentation.                                                  | ⚠️ Attach PD docs (see `docs/LICENSES/`) |

### Required artifacts before submission

- [ ] App icon (1024×1024 PNG, no alpha, no rounded corners)
- [ ] Splash screen source (2732×2732 PNG)
- [ ] Privacy Policy URL → `docs/PRIVACY.md` published to GitHub Pages or static
      host
- [ ] Privacy Nutrition Label: "Data Not Collected"
- [ ] App Privacy Manifest (`PrivacyInfo.xcprivacy`) — Capacitor 6 generates a
      baseline; verify Tone.js / OSMD / JSZip 3rd-party manifests are included
- [ ] Per-score license documentation PDF(s) → see `docs/LICENSES/`
- [ ] Screenshots: iPad Pro 12.9" (req'd), iPad 11", iPhone 6.7" (the 3
      mandatory sizes as of 2025)
- [ ] Age rating questionnaire (re-do under 2025 system before 2026-01-31
      deadline)
- [ ] App Review Information:
      `<<paste PD score license summary here so reviewer can find it>>`

### App-target privacy manifest (M2 — manual Xcode step)

- `ITSAppUsesNonExemptEncryption=false` is now set in `App/App/Info.plist`
  (skips the per-upload export-compliance question; jsDelivr HTTPS is exempt).
- **Still TODO (manual):** add an App-target `PrivacyInfo.xcprivacy` declaring
  the required-reason API for `CapacitorPreferences` (UserDefaults, reason
  `CA92.1`). Capacitor frameworks ship their own manifests, but the App target
  itself has none — Apple may emit `ITMS-91053` at upload without it. Add the
  file in Xcode (File → New → App Privacy File, target = App) so it lands in the
  pbxproj.

### Code-review follow-ups (from the 2026-07-21 full audit)

The 6-domain architecture review's findings are now ALL fixed (see git log
`fix(web|core|plugin)` around that date): 🔴 H1/H2/H3/R1, 🟠 D1/D2/P1/P2/P3/G1,
🟡 G2/G3/M2/**I1/M1**, and the 🟢 lows (**I2** onset 1-frame RMS, **I3** resume
respects micIntentionallySkipped, **R3** ripple hard cap, **D3/D4**
importLibrary size cap + .mxl unzip, **G5** Journal focus-trap). H2/H3 are Swift
— verify they compile on the next Xcode build.

Only genuinely-latent (harmless-today) notes remain, not worth changing now:

- `result-card` "Next" uses a hardcoded `['A1','B','A2']` section-id list;
  harmless because every current song (built-in / auto-section / manual editor)
  uses exactly those ids. Breaks only if a future schema adds section ids —
  align it to `currentSong.sections.map(s => s.id)` then.
- `core/state/flow-meter.ts` (`applyFlowEvent`) is unused by the live shell (the
  production flow/combo logic is inlined in `game-state-update.ts`); behaviour
  matches, but it's a tuning trap — collapse the duplication or delete.
- Android native MIDI: `showBleMidiPairing` is iOS-only wired; Kotlin `onSend`
  doesn't split coalesced multi-message callbacks. Latent until Android ships.

### Future / non-blocking (does NOT block the current release)

- **UIScene lifecycle adoption** — the console logs
  `UIScene lifecycle will soon be required. Failure to adopt will result in an assert in the future.`
  This is a deprecation warning only (Capacitor 6 uses the classic AppDelegate
  lifecycle); the app builds and runs today. Adopt when Apple makes it mandatory
  — most likely resolved by a Capacitor upgrade (7.x), otherwise add a
  `UIApplicationSceneManifest` + scene delegate to the iOS host. The other
  launch-time console lines (`Could not create a sandbox extension`,
  `xpc_user_sessions_get_foreground_uid() failed`,
  `Unable to hide query parameters`) are benign WKWebView/iOS noise, not errors.

### What to write in App Review Notes

> Piano Visualizer is a real-time piano practice app for children. Microphone
> input is processed entirely on-device for pitch detection — no audio is
> recorded or transmitted. Optional MIDI keyboard input via USB or Bluetooth is
> supported through our custom CapacitorMIDI plugin (CoreMIDI bridge), which
> provides functionality unavailable in mobile Safari (Web MIDI API is not
> implemented in WebKit, see WebKit Bug 107250).
>
> All bundled and downloadable music is in the public domain. Source: the
> [musetrainer/library](https://github.com/musetrainer/library) repository,
> serving works by composers who died over 70 years ago (Beethoven, Mozart,
> Chopin, etc.). Pinned to commit `<SHA>` so the catalog cannot change between
> binary releases. Per-score documentation is at:
> https://github.com/atariryuma/piano-visualizer/tree/main/docs/LICENSES

## Google Play

| Item                          | Notes                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Target SDK                    | **35** (required for new submissions and updates as of August 2025)                 |
| Privacy Policy URL            | Same URL as App Store.                                                              |
| Data Safety form              | "No data collected."                                                                |
| Designed for Families program | Opt in via Play Console → Policy → App content. Self-Certified Ads SDK list = none. |
| Teacher Approved badge        | Editorial; opt in but Google decides.                                               |
| Permissions                   | RECORD_AUDIO is auto-flagged sensitive; explain in store listing description.       |

## Children's Code (UK ICO)

- [ ] Plain-language privacy info accessible from the app (link from settings
      panel)
- [ ] Default settings = highest privacy (already true: no telemetry to disable)
- [ ] No nudge techniques to extend playtime (we have no monetization →
      trivially compliant)
- [ ] No profiling — confirmed (no telemetry)
- [ ] Connected toys/devices (MIDI keyboards) — disclose; we do in PRIVACY.md

## COPPA (effective 2026-04-22)

- Collecting zero personal information = no Verifiable Parental Consent flow
  needed.
- Privacy notice still required (we have one).
- "Knowledge of child users" — treat all users as if they are children.

## APPI (Japan)

- No PII collection = no obligations under current law.
- Children-specific amendments expected ~2027; revisit then.

## Rejection rehearsal

Before the first submission, rehearse the most common rejection scenarios:

1. **Airplane mode test**: launch the app with no network. Should still work
   with bundled scores. (Apple rejects "white screen on airplane mode".)
2. **Cold launch test**: kill app, relaunch — must reach the title screen
   without re-asking for mic permission.
3. **Permission deny test**: deny mic on first launch. App should still work
   with MIDI-only mode and not show repeated permission prompts.
4. **External link test**: there should be NONE in the UI. Settings panel must
   not link out.
5. **Lock-screen test**: lock the device mid-practice. This is a
   **foreground-only** app (no background audio — `UIBackgroundModes` was
   intentionally removed), so playback pauses on lock; on unlock the session
   must resume cleanly without a dead AudioContext (the recreate path). It must
   NOT keep playing audio while locked.
