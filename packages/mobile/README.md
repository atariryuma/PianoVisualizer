# @piano/mobile

Capacitor 6 wrapper for Piano Visualizer — produces iOS + Android binaries from
the same web codebase.

## Status

**iOS: Mac 直前まで準備完了（2026-07-19）。** `ios/`
生成済み・アイコン済み・Info.plist 済み・ビルドは web 本体を `--mode mobile`
で丸ごと使用（旧スタブ `src/main.ts`
は将来のネイティブ固有処理の参照用に残置、ビルドには不使用）。残りは Mac での
`pod install` 以降 → [docs/IOS-BUILD.md](../../docs/IOS-BUILD.md)。This package
contains:

- `capacitor.config.ts` — production-ready config including iOS https-scheme fix
- `vite.config.ts` — mobile build mode (no SW, predictable filenames)
- `src/main.ts` + `src/adapters/` — entry point + native input adapters
- (Native projects `ios/` and `android/` are NOT yet generated. See "Init"
  below.)

## Prereqs

- Node 20+, pnpm 9+
- For iOS: macOS, Xcode 15+, Apple Developer account ($99/yr)
- For Android: Android Studio, JDK 17, target SDK 35
- Workspace dependency `capacitor-piano-midi` lives at
  `../plugins/capacitor-piano-midi`

## Initial setup (one-time)

```bash
# From repo root:
pnpm install                       # installs all workspace deps
pnpm --filter @piano/mobile build  # builds ./dist/

# Generate native projects:
cd packages/mobile
npx cap add ios
npx cap add android

# Generate icons + splash from a single source:
# Drop a 1024x1024 PNG at assets/icon.png and 2732x2732 PNG at assets/splash.png
npx capacitor-assets generate --ios --android
```

## Day-to-day

```bash
pnpm --filter @piano/mobile build  # vite build + cap sync
pnpm --filter @piano/mobile ios    # opens iOS simulator
pnpm --filter @piano/mobile android
```

Live reload (dev only):

```bash
# 1. Run the web dev server with HTTPS:
pnpm --filter @piano/web dev -- --https
# 2. Edit packages/mobile/capacitor.config.ts → uncomment server.url
# 3. pnpm --filter @piano/mobile sync && pnpm --filter @piano/mobile ios
```

## What requires Info.plist / AndroidManifest entries

These permissions must be declared in the native projects (`cap add` generates
them blank — you have to add these manually after `cap add`):

### iOS — `packages/mobile/ios/App/App/Info.plist`

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Piano Visualizer listens to your piano so it can react with sparkles and stars.</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

### iOS — `packages/mobile/ios/App/App/App.entitlements`

(Bluetooth-MIDI requires Core Bluetooth Background Mode if you want pairing
mid-session; not needed if pairing always happens in foreground.)

### Android — `packages/mobile/android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-feature  android:name="android.hardware.microphone" android:required="false" />
<uses-feature  android:name="android.software.midi" android:required="false" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
```

Plus declare `targetSdkVersion 35` in `build.gradle` (Google Play 2025
requirement).

## App Store / Play Store handoff

See `/docs/COMPLIANCE.md` for the submission checklist (Apple 4.7 / 5.2.3 PDFs,
Google Families program, age rating questionnaire).
