---
name: performance-tune
description:
  Adjust PERF_PROFILE / particle caps / shadowBlur for a newly-supported device
  tier. Use when a user reports stuttering on a specific iPad/Android, or when
  supporting a new device class (e.g., iPad mini 7).
---

# performance-tune

The app uses `PERF_TIER` detection (`low` / `mid` / `high`) to pick a
`PERF_PROFILE` controlling particle counts, shadowBlur usage, and ambient
density. This playbook walks through retuning when a device falls into the wrong
tier.

## When to run

- Stutter or low fps reported on a specific device
- New device class to support (e.g., Vision Pro, foldables)
- Visual quality complaint on high-end (M-series should look richer)

## Steps

### 1. Confirm which tier the device falls into

The app logs to console at startup:

```text
[PERF] tier=mid particles=600 shadowBlur=true
```

Ask the reporter to:

1. Open the app
2. Enable the debug overlay (⚙ → その他 → デバッグ表示)
3. Open browser DevTools (or Safari Web Inspector for iOS over USB)
4. Find the `[PERF]` log line

If they can't access devtools, ask them to set
`localStorage.setItem('pianoViz_perfTier', 'low')`, reload, and report whether
stutter improves.

### 2. Identify the bottleneck

Three suspects:

| Symptom                                 | Likely cause                  | Fix                     |
| --------------------------------------- | ----------------------------- | ----------------------- |
| Drops to 30fps during big chord effect  | particles too high            | lower `maxParticles3D`  |
| Smooth normally, stutters on note onset | shadowBlur software-rendering | set `shadowBlur: false` |
| Background feels dead even at high flow | ambientChance too low         | raise `ambientChance`   |
| OK normally, BG stars cause stutter     | bgStarCount too high          | lower `bgStarCount`     |

### 3. Pick new tier values

Edit BOTH:

- `app.js` → the `PERF_PROFILE` lookup (top of audio init section)
- `packages/core/src/render/perf-tier.ts` → the `PERF_PROFILES` const

Keep them in sync (the MIRROR pattern from `extract-module` skill).

Suggested ranges:

```text
maxParticles3D:  200 (very low) ... 2000 (M3 Pro)
shadowBlur:      true on M-series + desktop, false on everything else if reports
ambientChance:   0.005 (low) ... 0.06 (high)
bgStarCount:     30 ... 200
```

### 4. Tune the detection heuristic if needed

If a device is consistently mis-tiered, edit `detectPerfTier()` in
`packages/core/src/render/perf-tier.ts` (and the mirror in `app.js`).

Useful signals:

```ts
const ua = navigator.userAgent;
const is iPad11Pro = /iPad13,[1-2]/.test(ua);   // iPad Pro 11" 2020 (A12Z)
const isIPadAir5 = /iPad13,16/.test(ua);        // iPad Air 5 (M1)
const cores = navigator.hardwareConcurrency;
const mem = (navigator as any).deviceMemory;
const isM = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
```

(Apple has been hostile to UA fingerprinting since iOS 17 — `Macintosh`
masquerading is the most reliable M-series signal.)

### 5. Add a regression test

`packages/core/tests/perf-tier.test.ts` — extend with the new device.

```ts
it('iPad 10 (low tier)', () => {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (iPad; ... iPad 10 ...)',
    hardwareConcurrency: 4,
    deviceMemory: 3,
    maxTouchPoints: 5,
  });
  expect(detectPerfTier()).toBe('low');
});
```

### 6. Verify

```bash
pnpm verify
# Manual: open app on the device, confirm 60fps held during heavy effects.
```

Use Safari Web Inspector → Timeline → Frames tab on iPad to measure.

### 7. Document

If the change is non-trivial, note it in `CLAUDE.md` "Performance tier" section.
If it's just a tier-bump for a specific device, the test documents it.

## Manual overrides

Users can force a tier:

```js
localStorage.setItem('pianoViz_perfTier', 'low');
location.reload();
```

This is in the FAQ-equivalent. Surface it in settings UI only if multiple users
report the auto-detection being wrong.

## Things NOT to do

- **Don't add framerate measurement to the production app**. Performance.now()
  in a hot loop hurts the very thing you're measuring. Devtools is the right
  tool.
- **Don't try to dynamically lower tier mid-session** based on observed fps —
  the user-visible pop is jarring. Pick at startup, stick with it.
- **Don't add a "graphics quality" slider in settings**. Kids' app — fewer knobs
  is better. The override above is for power users / debugging only.
