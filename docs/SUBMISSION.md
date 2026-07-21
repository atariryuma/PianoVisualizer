# App Store submission — paste-ready artifacts

Companion to `docs/COMPLIANCE.md`. Everything here is ready to copy into App
Store Connect or run as-is. App: **Piano Visualizer** · bundle
`com.pianovisualizer.app` · `MARKETING_VERSION 1.0` · Category **Education** ·
Age **4+**.

---

## 1. App Review Notes (paste into App Store Connect → App Review Information → Notes)

```
Piano Visualizer is a real-time piano practice app for learners of any age.

PRIVACY / DATA
• No accounts, no ads, no third-party analytics or SDKs. The app collects NO data.
• Microphone audio is processed entirely on-device for pitch/onset detection
  (YIN + multi-feature onset). Audio is never recorded, stored, or transmitted.
• All progress (stars, stamps, practice days) is stored locally on the device
  (localStorage / IndexedDB). Nutrition Label: "Data Not Collected".

NATIVE FUNCTIONALITY (Guideline 4.2.3)
• Optional MIDI keyboard input via USB and Bluetooth is provided by our own
  native plugin "capacitor-piano-midi" (a CoreMIDI + CoreAudioKit bridge).
  This is functionality unavailable in mobile Safari: WebKit does not implement
  the Web MIDI API (WebKit Bug 107250). Bluetooth-MIDI pairing uses Apple's own
  CABTMIDICentralViewController pairing sheet.
• Hardware-verified on a physical iPad Pro 12.9" (iPadOS 26): microphone
  detection, USB-MIDI, and Bluetooth-MIDI (Roland GO:PIANO88) all work.

MUSIC LICENSING (Guideline 5.2.3)
• All bundled and downloadable music is public domain.
• Bundled: "Für Elise" (Beethoven, d. 1827) and "Rondo alla Turca" (Mozart,
  d. 1791) — both PD worldwide (death + 70). Per-piece evidence: docs/LICENSES/.
• The optional in-app song library fetches MusicXML from the musetrainer/library
  GitHub repo via jsDelivr, PINNED to commit 9128876f6164d96997c877a2be843349a32bdabb
  so the catalog cannot change between binary releases (Guideline 4.7). All pieces
  are by composers who died over 70 years ago (Bach, Chopin, Satie, Debussy, etc.).

HOW TO TEST WITHOUT A PIANO
• Tap "🎨 Free Play" or a song, then hum/whistle or play any note near the mic —
  the screen reacts with particles. Or connect a USB/Bluetooth MIDI keyboard.
• No login required. Works offline with the two bundled songs.

Public-domain per-score license summary:
https://github.com/atariryuma/PianoVisualizer/tree/main/docs/LICENSES
```

> Replace the GitHub URL if the repo is private at review time — either make the
> `docs/LICENSES/` folder public, or attach the 1-page PD PDFs as review
> attachments instead.

---

## 2. Rejection rehearsal — results + on-device checklist

Code-level status is pre-verified below; the **On-device** column is what you
confirm in the Simulator or on hardware before submitting.

| #   | Scenario                           | Code status                                                                                                                                                          | On-device check                                                                                               |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **Airplane mode** — launch offline | ✅ Built-in songs load from bundled `public/assets/*.mxl` (no network); only the optional "Add a song" library needs the internet                                    | ☐ Toggle Airplane mode → launch → Für Elise plays, no white screen                                            |
| 2   | **Cold launch** — kill + relaunch  | ✅ Mic permission is requested on first _play_, not at boot; iOS caches the grant                                                                                    | ☐ Force-quit → relaunch → reaches title with NO repeated mic prompt                                           |
| 3   | **Permission deny** — deny mic     | ✅ `decideInitialInputMode` degrades to MIDI-only (`micPermissionFailed`), no repeated prompts; a hint points to MIDI                                                | ☐ Deny mic → app still usable via MIDI, no prompt loop                                                        |
| 4   | **External links** — none in UI    | ✅ Verified: no `window.open` / `target=_blank` / external `href` in the shell UI. The library fetch is a data request, not a browser navigation                     | ☐ Open Settings + all modals → confirm nothing links out of the app                                           |
| 5   | **Lock screen** — foreground-only  | ✅ `UIBackgroundModes` intentionally absent; visibility-freeze pauses `Tone.Transport` + freezes the clock on hidden; AudioContext recreate on `devicechange`/resume | ☐ Lock mid-practice → audio STOPS (not playing while locked) → unlock → resumes cleanly, no dead AudioContext |

Extra pre-submit smoke tests (recommended):

- ☐ Rotate the iPad mid-practice — no layout break, cursor + lane stay aligned.
- ☐ Earn a stamp — the result screen plays the subtle celebration arpeggio.
- ☐ Title screen — the "⭐ stars" strip shows a real total (not 0/0).

---

## 3. Publish the Privacy Policy on GitHub Pages (free, static)

App Store Connect requires a public **Privacy Policy URL**. `docs/PRIVACY.md`
already exists — publish it:

### Option A — Pages from `/docs` on `main` (simplest, keeps Markdown)

1. Push `docs/PRIVACY.md` (already committed).
2. GitHub → repo **Settings → Pages**.
3. **Source**: "Deploy from a branch". **Branch**: `main`, **Folder**: `/docs`.
   Save.
4. Wait ~1 min. Your policy is at:
   `https://atariryuma.github.io/PianoVisualizer/PRIVACY` (GitHub renders
   `PRIVACY.md` → `PRIVACY` / `PRIVACY.html`.)
5. Paste that URL into App Store Connect → App Privacy → Privacy Policy URL.

> The repo must be **public** for Pages on the free tier (or GitHub Pro for
> private Pages). If you'd rather keep the repo private, host the single file on
> any static host (Netlify drop, Cloudflare Pages, or a gist → githack).

### Option B — dedicated `gh-pages` branch (if you don't want `/docs` public)

```bash
git switch --orphan gh-pages
git rm -rf . >/dev/null 2>&1 || true
cp docs/PRIVACY.md index.md          # Pages serves index.md at the root
git add index.md && git commit -m "chore(pages): privacy policy"
git push -u origin gh-pages
git switch main
```

Then Settings → Pages → Source = `gh-pages` / `/ (root)`. URL:
`https://atariryuma.github.io/PianoVisualizer/`

### Verify

- ☐ Open the URL in a private window (must be reachable without login).
- ☐ It renders `docs/PRIVACY.md` content (title "Privacy Policy", "no data
  collected", contact email).

---

## 4. Screenshots

Required App Store sizes (portrait), generated into `store-assets/` — see the
`## 1` generator note in this repo. Regenerate with the latest UI whenever the
title screen changes (e.g. the mastery-strip star fix, best-streak).

| Device slot      | Pixels (portrait) | File                               |
| ---------------- | ----------------- | ---------------------------------- |
| iPhone 6.7"      | 1290 × 2796       | `store-assets/iphone-67-title.png` |
| iPad 13" (12.9") | 2048 × 2732       | `store-assets/ipad-13-title.png`   |
| iPad 11"         | 1668 × 2388       | `store-assets/ipad-11-title.png`   |

Apple currently requires only the iPhone 6.7" and iPad 13" sets; the 11" set is
optional but recommended.
