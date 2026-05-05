// Mobile shell entry point. Diverges from the web shell only in which adapters
// are wired in: Capacitor MIDI plugin instead of Web MIDI API, native audio
// session management, file pickers via @capacitor/filesystem.

import { Capacitor } from '@capacitor/core';
import { detectPerfTier, PERF_PROFILES } from '@piano/core';
import { startNativeMidiAdapter } from './adapters/native-midi';
import { startWebAudioMicAdapter } from './adapters/native-mic';
import { configureAudioSession } from './adapters/native-audio-session';

async function bootstrap() {
  console.log(
    '[boot] Capacitor platform=' +
      Capacitor.getPlatform() +
      ' isNative=' +
      Capacitor.isNativePlatform()
  );

  await configureAudioSession(); // AVAudioSession category 'playback' on iOS

  const tier = detectPerfTier();
  const profile = PERF_PROFILES[tier];
  console.log('[boot] perf tier=' + tier, profile);

  const midi = await startNativeMidiAdapter().catch((e) => {
    console.warn('[boot] native MIDI start failed:', e?.message);
    return null;
  });
  const mic = await startWebAudioMicAdapter().catch((e) => {
    console.warn('[boot] mic acquire failed:', e?.message);
    return null;
  });
  console.log('[boot] midi=' + !!midi + ' mic=' + !!mic);

  // TODO Phase 0b: import the engine from @piano/core and run.
}

bootstrap().catch((e) => {
  console.error('[boot] fatal:', e);
});
