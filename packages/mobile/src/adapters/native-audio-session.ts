// AVAudioSession configuration — needed on iOS so that:
//   1. Audio survives screen-lock / lock-screen background
//   2. Mic input doesn't get ducked by other audio
//   3. PolySynth output (Tone.js) routes to speakers, not the earpiece
//
// Plugin: @capgo/capacitor-audio-session
// (Capacitor doesn't bundle audio-session control; install separately.)
//
// On Android, AudioContext + MIDI work without an explicit session category.
// This is a no-op unless we're on iOS.

import { Capacitor } from '@capacitor/core';

export async function configureAudioSession(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    // Lazy import — package only installed on mobile builds. If missing, log
    // and continue: AudioContext still works in foreground.
    // The string is opaque to the TS compiler (dynamic spec) so missing-module
    // errors stay out of the typecheck. Add the dep at install time when
    // shipping the mobile build.
    const spec = '@capgo/capacitor-audio-session' as string;
    const mod: any = await import(/* @vite-ignore */ spec).catch(() => null);
    if (!mod || !mod.AudioSession) {
      console.warn('[audio-session] @capgo/capacitor-audio-session not installed; foreground only');
      return;
    }
    await mod.AudioSession.configure({
      category: 'playAndRecord', // we both record (mic) and play (Tone.js)
      mode: 'default',
      categoryOptions: ['mixWithOthers', 'allowBluetooth', 'defaultToSpeaker'],
    });
    console.log('[audio-session] configured: playAndRecord');
  } catch (e: any) {
    console.warn('[audio-session] configure failed:', e?.message);
  }
}
