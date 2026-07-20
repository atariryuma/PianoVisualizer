import type { CapacitorConfig } from '@capacitor/cli';

// IMPORTANT: server.iosScheme MUST be 'https' on iOS 17+, otherwise getUserMedia
// fails on capacitor://localhost (Capacitor Issue #6759).
//
// hostname/port are only used by Capacitor's local server; not the public URL.

const config: CapacitorConfig = {
  appId: 'com.pianovisualizer.app',
  appName: 'Piano Visualizer',
  webDir: 'dist',
  server: {
    iosScheme: 'https',
    androidScheme: 'https',
    // Live-reload during dev: uncomment + set to your dev machine LAN IP.
    // url: 'https://192.168.1.100:8443',
    // cleartext: false
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0a0a14',
    // Background audio: requires UIBackgroundModes "audio" in Info.plist + the
    // @capgo/capacitor-audio-session plugin to set AVAudioSession category.
    limitsNavigationsToAppBoundDomains: false,
    handleApplicationNotifications: true,
  },
  android: {
    backgroundColor: '#0a0a14',
    // System WebView is fine; we don't need GMS Chrome WebView.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // flip true only for debug builds
  },
  plugins: {
    // Tell Capacitor about our piano MIDI plugin's Android package so it loads.
    // Plugin source lives in packages/plugins/capacitor-piano-midi/.
    PianoMidi: {},
    // Hold the LaunchScreen splash over the ~1-2s WebView-load gap so launch
    // doesn't read as a black screen, then fade to the app. Auto-hide (fixed
    // duration) is used deliberately: it needs no shell boot hook and cannot
    // get stuck showing the splash if boot ever throws. backgroundColor matches
    // the app theme (#0a0a14) so the fade is seamless.
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 350,
      backgroundColor: '#0a0a14',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
