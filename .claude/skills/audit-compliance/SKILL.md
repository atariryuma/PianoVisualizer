---
name: audit-compliance
description:
  Run the App Store / Play Store / COPPA / Kids compliance scan on the current
  branch. Use before opening a release PR or when paranoid about a recent
  change.
---

# audit-compliance

This is a **read-only** skill — no code changes. It produces a report on the
current branch's compliance posture.

## Scan steps

### 1. Network surface

```bash
grep -nE "fetch\(|XMLHttpRequest|navigator\.sendBeacon" app.js packages/**/*.{ts,js} \
  | grep -v "// MIRROR" | grep -v test
```

Every match is an external network call. Each one must be:

1. Documented in `docs/PRIVACY.md` "Network access" table
2. To a CORS-enabled, HTTPS-only host
3. Not sending any user-derived data

`/log` POSTs are gated behind `REMOTE_LOG_ENABLED` — confirm:

```bash
grep -nE "REMOTE_LOG_ENABLED|/log" app.js
```

### 2. External links

```bash
grep -nE "window\.open|<a [^>]*href=" app.js packages/**/*.{ts,html}
```

Every match must be:

1. Behind a parental gate, OR
2. Hidden in mobile builds (e.g., guarded by `!Capacitor.isNativePlatform()`)

### 3. Permissions

For each permission the app requests, verify:

- [ ] Mic — `NSMicrophoneUsageDescription` in
      `packages/mobile/ios/.../Info.plist`, `RECORD_AUDIO` in
      `AndroidManifest.xml`
- [ ] BLE — `NSBluetoothAlwaysUsageDescription`, `BLUETOOTH_SCAN/CONNECT`
- [ ] Storage — usually doesn't require declaration, but check IDB usage docs
- [ ] No surprises: nothing in the codebase uses `navigator.geolocation`,
      `navigator.contacts`, `Notification.requestPermission()` etc.

```bash
grep -nE "navigator\.(geolocation|contacts|clipboard|share|wakeLock|bluetooth)" \
  app.js packages/**/*.{ts,js}
```

### 4. Third-party SDKs

```bash
cat package.json packages/*/package.json packages/plugins/*/package.json \
  | grep -A1 '"dependencies"' | grep -v devDep
```

For each entry, verify:

- [ ] No analytics SDK (Firebase Analytics, Segment, Amplitude, Mixpanel)
- [ ] No advertising SDK (Google AdMob, AppLovin, Unity Ads, etc.)
- [ ] No crash reporter that uploads (Sentry, Bugsnag, Crashlytics)
- [ ] No social SDK (Facebook, Twitter, TikTok)

Currently approved deps: tone, opensheetmusicdisplay, jszip, capacitor\*,
@capacitor-community/bluetooth-le.

### 5. MusicXML library pin

```bash
grep -n "LIBRARY_PINNED_SHA" app.js
```

Verify the SHA matches a commit you've reviewed. Cross-reference
`docs/LICENSES/README.md` — every piece in that commit must have PD evidence.

### 6. Privacy nutrition label correctness

Re-read `docs/PRIVACY.md`. Confirm:

- [ ] All bullet items still true
- [ ] No new third-party in the "Network access" table missing
- [ ] "We do not collect..." list still complete

### 7. App Store text

Re-read `docs/COMPLIANCE.md` "What to write in App Review Notes". Confirm the
SHA placeholder is filled in.

### 8. Generate report

Write findings to `docs/COMPLIANCE-REPORT-<YYYY-MM-DD>.md`:

```markdown
# Compliance audit report — YYYY-MM-DD

## Summary

- Network endpoints: N (all documented ✓)
- External links: N (all behind parental gate ✓)
- Third-party SDKs: N (all kid-safe ✓)
- Permissions: mic ✓, BLE ✓
- LIBRARY_PINNED_SHA: <sha> (verified against docs/LICENSES/)

## Issues found

- (none) OR
- ⚠️ <category>: <description>. Fix recommendation: ...

## Recommendation

- ☑ Safe to submit
- ☐ Block submission until issues resolved
```

Don't commit this report — it's a working document. If issues found, open issues
for each, then delete the local report.

## Common findings (be ready)

- Forgotten `console.log('user data:', userObj)` — strip before release
- New `<a href="https://...">` in settings panel for "report a bug" — needs
  parental gate
- `navigator.share()` polyfill imported but never used — remove
- Test fixture URLs leaking into production code — guard with NODE_ENV
