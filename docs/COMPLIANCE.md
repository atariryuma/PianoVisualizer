# Compliance Checklist

Use this before submitting Piano Visualizer to the App Store / Google Play. Each
item cites the relevant rule and the evidence to attach.

## Pre-flight (every build)

- [ ] `REMOTE_LOG_ENABLED` resolves to `false` in mobile build (verify via grep
      of bundled `legacy-app.js` — string `/log` should not appear except in
      comments). The current code gates by `location.hostname` checks, but
      Capacitor's `capacitor://localhost` would falsely match `localhost` — use
      a build-time `--define` flag to force-disable.
- [ ] No external links surfaced in UI when running with
      `Capacitor.isNativePlatform()` true. (Apple 1.3 Kids Category bans
      external links without parental gate.)
- [ ] Microphone usage description in `Info.plist` and `AndroidManifest.xml`
      uses kid-friendly language.
- [ ] All MusicXML URLs in source pinned to a specific GitHub commit SHA (Apple
      4.7 — runtime content is in App Review scope).

## Apple App Store

### Guidelines hits we know are relevant

| Rule                        | What it means                                                                                                         | Status                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1.3 Kids Category           | Designed for ≤ 11. No 3rd-party ads/analytics. Parental gate before any external link / permission prompt / purchase. | ⚠️ Add parental gate before mic permission |
| 4.2.3 Minimum Functionality | "Repackaged web content" gets rejected. Need native value beyond what mobile Safari can do.                           | ✅ Native MIDI plugin satisfies this       |
| 4.7 (rewritten 2025-11-13)  | Runtime-loaded JS/HTML5 mini-content is reviewed as if shipped. URLs must be stable, no dynamic eval.                 | ✅ jsDelivr URLs commit-pinned             |
| 5.1.4 Kids Category data    | No PII or device info to third parties. No IDFA.                                                                      | ✅ Zero collection                         |
| 5.2.3 Audio licensing       | Streamed/embedded music needs license documentation.                                                                  | ⚠️ Attach PD docs (see `docs/LICENSES/`)   |

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
5. **Lock-screen test**: lock the device mid-practice. Audio should resume on
   unlock without manual recovery (the AudioContext recreate path).
