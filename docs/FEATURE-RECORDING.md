# Backlog (v1.x): record a performance → save / share

**Status: NOT in v1.** Design note captured 2026-07-21. Ship the current app
first; this is a post-launch differentiator.

## What it is (and is NOT)

A **"save your performance as a video"** feature: capture the on-screen
visualizer + the performance audio into a video file the user can save to Photos
or hand to the **OS share sheet**.

- ✅ It IS: local, on-device recording → user-initiated save/share.
- ❌ It is NOT: an in-app "post to YouTube / X / Instagram" integration.

**Why not direct social posting** (hard constraint — do not build it): it
collides with every pillar of this app — "Data Not Collected" (uploading a
child's performance = collecting/transmitting personal data), "no third-party
SDKs" (social OAuth/SDKs), and 4+/kid-safe (COPPA/GDPR-K: publishing children's
content, Apple's parental-gate rules). The kid-safe, banned-list-compliant shape
is **kid-initiated share via the OS share sheet** — the app never uploads, never
holds an account, and the user/parent chooses the destination.

## Industry-standard context

Piano **learning** apps (Simply Piano, Flowkey, Yousician, Piano Marvel) compete
on lessons / song library / feedback — **recording-to-social is not a standard
feature** there (it's a performance-app trait, e.g. Smule). So this is a
**differentiator**, not a catch-up. The app's pretty visualizer makes a
shareable clip a genuine, low-cost marketing angle (organic user posts).

## The key technical point: mic vs MIDI audio

"Record the connected piano's sound" means different things per input:

| Input          | What is available                                    | Recording source                                                                  |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Microphone** | the real acoustic waveform                           | record the mic `MediaStream` directly (real sound)                                |
| **MIDI**       | note events only — **no audio** ever reaches the app | record the app's own Tone.js synth render of those notes (clean, room-noise-free) |

A MIDI keyboard's internal audio is NOT in the MIDI stream (MIDI = "which note,
when, how hard"). So in MIDI mode we record **the app's rendering**, which is
actually a plus — a clean, consistent "the app plays it back" clip. Both modes
can produce a good performance video.

## Technical approach (no new SDK — stays within the architecture)

Pure Web APIs, so "no third-party SDK" holds:

1. **Video**: the visualizer is a `<canvas>` → `canvas.captureStream(fps)`.
2. **Audio**: a Web Audio `MediaStreamAudioDestinationNode` fed by
   - mic mode: the input `MediaStreamSource`, and/or
   - MIDI mode: the Tone.js master output (already a Web Audio graph). Include
     the reference melody / backing (おともパート) if playing, so the clip
     matches what the user heard.
3. **Mux**: combine the canvas video track + the audio track into one
   `MediaStream` → `MediaRecorder` → a `Blob` (webm/mp4).
4. **Deliver**: hand the blob to the Capacitor **Share** plugin (OS share sheet)
   and/or "save to Photos". No upload path in the app.

## Risks / unknowns to resolve before building

- **iOS WKWebView `MediaRecorder`**: supported since iOS 14.5 but with codec
  quirks (often `video/mp4;codecs=…` limited; webm unsupported on Safari). Test
  the exact container/codec MediaRecorder emits in the Capacitor WKWebView and
  whether the share sheet / Photos accepts it; may need a native fallback
  (AVAssetWriter / ReplayKit) if web capture is unreliable on device.
- **Performance**: capturing the canvas at 30fps while running the rAF render +
  audio analysis on a low-`PERF_TIER` iPad — measure frame drops; consider a
  lower capture fps or pausing non-essential effects while recording.
- **Permissions / review**: add a clear usage string; for a 4+ app keep it a
  plain "save video" affordance (no social branding) so review stays simple.
- **Length / size cap**: cap duration (e.g. a section or one full song) so files
  stay small and memory bounded.

## Definition of done (v1.x)

- A record button on the practice/result surface; tap to start/stop.
- Produces a video (visualizer + correct audio for mic AND MIDI modes).
- "Save / Share" via the OS share sheet only — no in-app account, no upload, no
  social SDK. "Data Not Collected" stays true.
- Verified on a physical iPad (the codec/perf risks above).
