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
6. [ ] **Price**: **Free** (tier 0), no IAP, no ads. Deliberate — a free app
       earns nothing, so it sidesteps the public-servant side-job/permission
       question, and maximizes reach for the real payoff (experience + reviews).
       See `docs/SUBMISSION.md` §6.
7. [ ] **Archive & upload**: Xcode → Product → Archive → Distribute App (needs
       the paid account's distribution signing).
8. [ ] Run the **Rejection rehearsal** at the bottom of this file first.

Everything below is the full reference checklist; the 8 items above are the
minimum to get a first build submitted.

## Pre-flight (every build)

- [x] `REMOTE_LOG_ENABLED` is force-`false` in the native build via a build-time
      define. `packages/web/vite.config.ts` sets
      `__REMOTE_LOG_DISABLED__ = (mode === 'mobile')`; `remote-log.ts`
      short-circuits `isRemoteLogEnabled()` on it BEFORE the localStorage
      override, so the `--mode mobile` (App Store) bundle physically cannot POST
      to `/log` — even a `localStorage.pianoViz_remoteLog='1'` can't turn it
      back on. The LAN-dev build (default mode, served by `https_server` for
      `server.log`) keeps its localhost/LAN gate. (`legacy-app.js` is retired —
      Phase 0e; ignore the old grep target.)
- [ ] No external links surfaced in UI when running with
      `Capacitor.isNativePlatform()` true. (Kids-only requirement — relaxed for
      our 4+/Education listing, but we still ship none, which keeps the "no
      tracking" promise simple. Good hygiene to keep.)
- [ ] Microphone usage description in `Info.plist` and `AndroidManifest.xml`
      uses kid-friendly language.
- [x] No runtime-loaded score catalog. All scores are bundled in the app
      (built-ins + the app's own PD transcriptions in `assets/library/`), so
      there is no external MusicXML fetch to pin (Apple 4.7). The former
      `musetrainer/library` jsDelivr dependency was removed 2026-07-21.

## Apple App Store

### Guidelines hits we know are relevant

| Rule                        | What it means                                                                                         | Status                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1.3 Kids Category           | Parental gate before permission/link/purchase; no 3rd-party ads/analytics.                            | ➖ N/A — we ship 4+/Education, not Kids                            |
| 4.2.3 Minimum Functionality | "Repackaged web content" gets rejected. Need native value beyond what mobile Safari can do.           | ✅ Native MIDI plugin satisfies this                               |
| 4.7 (rewritten 2025-11-13)  | Runtime-loaded JS/HTML5 mini-content is reviewed as if shipped. URLs must be stable, no dynamic eval. | ✅ No runtime catalog — all scores bundled                         |
| 5.1.4 Kids Category data    | No PII or device info to third parties. No IDFA.                                                      | ✅ Zero collection                                                 |
| 5.2.3 Audio licensing       | Streamed/embedded music needs license documentation.                                                  | ✅ All PD; library = our own transcriptions (see `docs/LICENSES/`) |

### Required artifacts before submission

- [ ] App icon (1024×1024 PNG, no alpha, no rounded corners)
- [ ] Splash screen source (2732×2732 PNG)
- [ ] Privacy Policy URL → `docs/PRIVACY.md` published to GitHub Pages or static
      host
- [ ] Privacy Nutrition Label: "Data Not Collected"
- [ ] App Privacy Manifest (`PrivacyInfo.xcprivacy`) — written + target
      membership (see below). NOTE: Tone.js / OSMD / JSZip are **JS bundled into
      the web assets**, not native SDKs, so they carry no `.xcprivacy`. The pods
      that ship bundled privacy manifests are the **Capacitor plugins**
      (`@capacitor-community/bluetooth-le`, `haptics`, `preferences`,
      `filesystem`, `splash-screen`, `status-bar`, `app`) — CocoaPods copies
      their manifests automatically; nothing to author for them.
- [ ] Per-score license documentation PDF(s) → see `docs/LICENSES/`
- [ ] Screenshots: iPad Pro 12.9" (req'd), iPad 11", iPhone 6.7" (the 3
      mandatory sizes as of 2025)
- [ ] Age rating questionnaire (re-do under 2025 system before 2026-01-31
      deadline)
- [ ] App Review Information (paste into App Store Connect → App Review Notes):
      "All music is public-domain. The two built-in pieces (Beethoven's Für
      Elise, Mozart's Turkish March) and the ~57-piece in-app library are the
      app's OWN MusicXML transcriptions of PD compositions, bundled in the app
      (no runtime catalog fetch). Per-piece provenance is in
      `docs/LICENSES/README.md`. The app collects no data and contains no
      third-party analytics/ads/SDKs; audio is processed on-device only."

### App-target privacy manifest (M2 — manual Xcode step)

- `ITSAppUsesNonExemptEncryption=false` is now set in `App/App/Info.plist`
  (skips the per-upload export-compliance question; jsDelivr HTTPS is exempt).
- **The manifest file is written** at
  `packages/mobile/ios/App/App/PrivacyInfo.xcprivacy` (NSPrivacyTracking=false,
  no collected data). Required-reason APIs declared: UserDefaults `CA92.1`
  (Capacitor Preferences plugin), **FileTimestamp `C617.1` + DiskSpace `E174.1`
  (added 2026-07-25** — the bundled `@capacitor/filesystem` plugin reads file
  metadata / free space for the on-device user-song library; declared
  proactively to avoid an `ITMS-91053` upload flag). `plutil -lint` passes.
- **Only remaining step (manual, ~30 s in Xcode):** the file exists on disk but
  is not yet a member of the App target in the `.pbxproj`. `cap sync` won't add
  it. In Xcode: **Project navigator → drag `PrivacyInfo.xcprivacy` into the
  `App` group** (or right-click the `App` group → _Add Files to "App"…_ → select
  it) → in the dialog make sure **Target = App is checked**. Build once to
  confirm it's picked up.

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
> All music is public domain. There is **no runtime catalog fetch** — every
> score ships inside the binary: the two built-in pieces plus the in-app "Add a
> song" library are the app's OWN MusicXML transcriptions of PD compositions by
> composers who died over 70 years ago (Beethoven, Mozart, etc.). (The former
> third-party `musetrainer/library` jsDelivr dependency was removed 2026-07-21;
> nothing is loaded at runtime.) Per-score provenance is at:
> https://github.com/atariryuma/PianoVisualizer/tree/main/docs/LICENSES

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
