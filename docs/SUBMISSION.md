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
• ALL music is bundled in the app — nothing is fetched from an external catalog
  at runtime — and every piece is a PUBLIC-DOMAIN composition (composer died 70+
  years ago, or an anonymous traditional tune). In App Review scope as shipped
  (Guideline 4.7); cannot change between binary releases.
• Built-in: "Für Elise" (Beethoven, d. 1827) and "Rondo alla Turca" (Mozart,
  d. 1791). Per-piece evidence: docs/LICENSES/.
• The in-app song library is 57 pieces from three provenance-clean sources, each
  documented with its license + source in docs/LICENSES/README.md:
  (1) our OWN engravings of PD compositions (we author the MusicXML);
  (2) CC0 scores from the OpenScore Lieder Corpus (public-domain dedication);
  (3) faithful full transcriptions of famous PD solo works (e.g. Clair de Lune,
      Chopin nocturnes, Joplin rags) — the compositions are PD and each file is a
      faithful transcription (thin-to-no new copyright for faithful encodings of
      PD notation). Known copyrighted arrangements were deliberately excluded.
• No lyrics-in-copyright, no modern arrangements, no film/pop content.

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

## 3. Privacy Policy URL — ✅ PUBLISHED & VERIFIED

**Live at: `https://atariryuma.github.io/PianoVisualizer/privacy.html`**

Paste that into **App Store Connect → App Privacy → Privacy Policy URL**.

How it's hosted (done 2026-07-21): Pages was already enabled on this repo, and
the `web.yml` workflow auto-deploys `packages/web/dist/` on every push to
`main`. The policy is a self-contained page at
[`packages/web/public/privacy.html`](../packages/web/public/privacy.html)
(renders `docs/PRIVACY.md`), copied into the build — so it publishes with the
app and **exposes only the policy, not the internal `docs/` folder**. To update
it: edit `privacy.html`, push to `main`, and the workflow redeploys.

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

---

## 5. Age-rating questionnaire — answer key (target result: 4+)

App Store Connect → your app → **Age Rating → Edit**. Every content question is
**None / No** for this app; the toggles below produce a clean **4+**. Don't opt
into the Kids category (we ship 4+/Education — see COMPLIANCE §Category).

**Content descriptions — set ALL of these to `None`:**

- Cartoon or Fantasy Violence · Realistic Violence · Prolonged/Graphic/Sadistic
  Violence
- Sexual Content or Nudity · Graphic Sexual Content and Nudity
- Profanity or Crude Humor · Mature/Suggestive Themes · Horror/Fear Themes
- Alcohol, Tobacco, or Drug Use or References · Simulated Gambling · Medical/
  Treatment Information · Contests

**Capability / behavior questions:**

| Question                                       | Answer | Why                                                                                                      |
| ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Unrestricted Web Access                        | **No** | The in-app library browses a **fixed, commit-pinned** catalog (jsDelivr/GitHub API), not a browser.      |
| Gambling / Contests                            | **No** | None present.                                                                                            |
| User-Generated Content                         | **No** | MusicXML you import is stored locally for your own practice; it is never shared with or shown to others. |
| Messaging / Social features                    | **No** | No accounts, no chat, no social graph.                                                                   |
| In-App Purchases                               | **No** | None (privacy policy commits to this).                                                                   |
| Third-party advertising                        | **No** | None.                                                                                                    |
| Collects data / tracking (App Privacy section) | **No** | On-device only → Nutrition Label "Data Not Collected", NSPrivacyTracking=false.                          |
| Location                                       | **No** | Never requested.                                                                                         |

If Apple's newer flow asks for a **minimum age** or "Made for Kids", pick the
**general 4+ / all-ages** path, NOT the dedicated Kids category. The mic
permission is the only sensitive capability and is covered by
`NSMicrophoneUsageDescription`.

---

## 6. Pricing — recommendation

**The market is 100% subscription; that's the gap we occupy.** (2026 yearly:
Simply Piano ≈ $170, Flowkey ≈ $120, Yousician ≈ $120.) This app's headline
promise is "no ads · no tracking · **no subscription traps**", and the privacy
policy already commits to **no in-app purchases**. So the only pricing models
that keep the promise true are **one-time paid** or **free** — never a
subscription.

**Recommendation: one-time purchase at launch, ¥600 (≈ $4.99).** Own it forever,
no recurring charge — the honest counter-position to $120+/yr rivals. Defensible
range ¥400–¥1,200 ($2.99–$9.99); ¥600 is a low-friction impulse buy for a
parent/learner and needs no free-trial machinery.

| Model                      | Fit        | Notes                                                                                       |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| **One-time ¥600 (~$4.99)** | ✅ Best    | Matches "no subscription" ethos, sustainable, no dark-pattern surface. **Recommended.**     |
| Free                       | ✅ Alt.    | Maximizes reach + goodwill; pick this if audience/reputation matters more than revenue.     |
| Free + tip-jar IAP         | ⚠️ Caution | A "tip" is still an IAP — contradicts the current "no IAP" promise; would need policy edit. |
| Subscription / freemium    | ❌ Never   | Directly betrays the core promise and the kid-safe / anti-dark-pattern positioning.         |

Practical notes:

- **Pricing is set in App Store Connect, not in code** — no build change needed;
  you can switch free ↔ paid later (going free is easy; a paid app can't retro-
  charge existing free installs, so if unsure, **start paid** — you can always
  drop to free, not the reverse).
- Paid-up-front skips the whole IAP review surface (StoreKit, receipt
  validation, restore-purchases) — less to implement, less to reject.
- Consider a **free launch week → ¥600** later only if you want early reviews;
  avoid "limited-time" copy in-app (banned-list: FOMO).
