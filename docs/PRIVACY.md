# Piano Visualizer — Privacy Policy

**Effective: 2026-07-21** · **App version: 1.0**

This document is the privacy policy required by Apple App Store, Google Play,
and the UK Children's Code for Piano Visualizer.

## Plain-language summary

**We collect nothing.** The app runs entirely on your device. Your microphone is
used only to detect piano notes in real time — audio is never recorded, never
transmitted, and never leaves the device. Practice progress (streak, high
scores, added songs) is stored only in your device's browser/app storage.

## What we do not collect

- We do **not** record, transmit, or store microphone audio.
- We do **not** collect personal information (names, emails, phone numbers,
  addresses).
- We do **not** use cookies, advertising identifiers (IDFA, AAID), or
  fingerprinting.
- We do **not** use third-party analytics (no Google Analytics, no Firebase, no
  Sentry).
- We do **not** show advertisements.
- We do **not** offer in-app purchases.
- We do **not** require an account or login.

## What stays on your device

The following data is stored locally using your browser's IndexedDB /
localStorage (web) or the equivalent app sandbox storage (iOS / Android):

- Your high scores, daily streak, and session statistics
- The audio offset calibration value you set in settings
- Your language preference (EN / 日本語 / Deutsch)
- Music scores you have downloaded or imported
- The app's UI state (theme, last-played song)

This data is deleted when you uninstall the app or clear your browser's storage
for this site.

## Network access

The app fetches the following from third parties on your behalf. **No personal
information is sent in these requests** — the third parties only see the
standard HTTP request metadata (your IP address, browser version) that any visit
to a website generates.

| Endpoint                                                             | Purpose                                                                                                     | Provider                                                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cdn.jsdelivr.net`                                                   | Loads the audio engine (Tone.js), the score renderer (OpenSheetMusicDisplay), and the .mxl unzipper (JSZip) | jsDelivr (a free CDN run by ProspectOne / StackPath)                                                 |
| `cdn.jsdelivr.net/gh/musetrainer/library@<pinned-commit>/scores/...` | Downloads public-domain music scores you choose to add to your library                                      | jsDelivr serving the [musetrainer/library](https://github.com/musetrainer/library) GitHub repository |
| `api.github.com/repos/musetrainer/library/contents/scores`           | Lists the catalog of available public-domain scores                                                         | GitHub                                                                                               |

Their privacy policies:
[jsDelivr](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net) ·
[GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

The mobile app builds the audio engine and OSMD into the binary, so on
iOS/Android the only network requests are to the GitHub API and jsDelivr, and
only when you intentionally browse / download new pieces.

## Microphone

When you grant microphone permission, audio is processed continuously in real
time to detect which piano keys you are playing. **Audio samples never leave
your device.** The app holds an audio buffer in memory only as long as needed
for the YIN pitch-detection algorithm to compute (~93 ms windows), then discards
it. There is no recording feature.

You can revoke microphone permission at any time:

- **Web**: site settings in your browser
- **iOS**: Settings → Privacy & Security → Microphone → Piano Visualizer
- **Android**: Settings → Apps → Piano Visualizer → Permissions

## MIDI keyboards

If you connect a USB or Bluetooth MIDI piano keyboard, the app reads its
note-on, note-off, sustain pedal, and control-change messages locally to score
your performance. **MIDI data never leaves your device.**

## Children

The app is designed for learners of all ages and is safe for children (its
kid-safe design originated for upper-elementary ages, ~8–12, and is retained as
a product value). We treat all users as if they may be children and comply with:

- **COPPA** (US Children's Online Privacy Protection Act, amended 2025)
- **GDPR-K** / UK Children's Code (ICO age-appropriate design code)
- **APPI** (Japan's Act on the Protection of Personal Information)

Because we collect zero personal information, no parental consent flow is
required. Parents are encouraged to use device-level parental controls (Apple
Screen Time / Google Family Link) for usage limits.

## Public-domain scores

The music scores included in the app and available in the in-app library are
either:

1. Composed before 1925 (US public domain), and/or
2. By composers who died more than 70 years ago (Berne Convention public
   domain), and/or
3. Released by their authors under a Creative Commons CC0 / Public Domain Mark.

Per-score documentation is at [`docs/LICENSES/`](LICENSES/).

## Changes to this policy

If this policy changes, we will update the "Effective" date above and ship the
change in the next app release. Material changes (e.g. introducing analytics)
would also require updating the App Store / Play Store privacy nutrition labels.

## Contact

Issues, questions: <https://github.com/atariryuma/piano-visualizer/issues>
