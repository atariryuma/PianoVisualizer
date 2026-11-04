# Piano Visualizer — Privacy Policy

**Effective: 2026-11-04** · **App version: 1.0**

This document is the privacy policy required by Apple App Store, Google Play,
and the UK Children's Code for Piano Visualizer.

## Plain-language summary

**We collect nothing.** The app runs on your device and we have no server. Your
microphone is used only to detect piano notes in real time — audio is never
recorded, never transmitted, and never leaves the device. Practice progress
(streak, high scores, added songs) is stored in your device's browser/app
storage unless **you** turn on cloud sync, which copies progress and settings to
your own Google Drive. We cannot see that copy.

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
- We do **not** require an account or login. Cloud sync is optional, and uses
  your own Google account rather than an account with us.

## What stays on your device

The following data is stored locally using your browser's IndexedDB /
localStorage (web) or the equivalent app sandbox storage (iOS / Android):

- Your high scores, daily streak, and session statistics
- The audio offset calibration value you set in settings
- Your language preference (EN / 日本語 / Deutsch)
- Music scores you have downloaded or imported
- The app's UI state (theme, last-played song)

This data is deleted when you uninstall the app or clear your browser's storage
for this site. A cloud copy, if you made one, is separate: see below.

## Cloud sync (optional, off by default)

If you press "Connect Google Drive" in settings, the app stores one file in the
private app-data folder of **your own** Google Drive, so another device signed
in to the same account can pick up your progress.

- **What is copied**: stars, best scores, attempt history, stamps, practice days
  and minutes, song IDs, and your settings for theme, language, note names, note
  speed, judgement strictness, and pianist card (nickname, avatar, goal). A
  random per-device identifier keeps practice minutes from being counted twice.
- **What is never copied**: microphone audio, MIDI data, added score files, and
  settings specific to one device (audio offset, volumes, input source).
- **What we receive**: nothing. The file goes directly from your device to
  Google, and we have no server. The app asks Google only for access to its own
  app-data folder. It does not ask for your name or email address, and it cannot
  see your other Drive files.
- **Google's role**: Google stores the file under your account, subject to
  Google's own terms and privacy policy.
- **Turning it off**: in settings, "Disconnect" stops syncing and keeps the
  cloud copy. "Delete cloud copy" removes it and disconnects. If another device
  is still connected, its next sync uploads its copy again, so disconnect it
  too. You can also revoke the app's access in your Google account settings.

## Network access

The app is **self-contained**. The practice engine, the sheet-music renderer,
and the entire built-in song library are all bundled into the app itself. Unless
you choose one of the two options below, the app makes **no network requests at
all** — it works fully offline.

1. **Importing a score by web address.** Your device fetches that file directly
   from the address you chose.
2. **Cloud sync, if you connect it.** Your device talks directly to Google to
   sign in and to read and write the file described above.

No personal information is added to these requests beyond the standard metadata
(your IP address) that any web request includes, and neither is routed through a
server of ours. We do not send, log, or receive anything.

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
required. Cloud sync is never prompted for and needs a Google account, so a
child would only use it through an account their family already manages. Parents
are encouraged to use device-level parental controls (Apple Screen Time / Google
Family Link) for usage limits.

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
