// Web shell entry point.
// Phase 0b placeholder — wires @piano/core modules to web-platform adapters.
// Until the legacy app.js is migrated, this file just re-imports the legacy
// build (kept under packages/web/legacy/ during the transition).

import { detectPerfTier, PERF_PROFILES } from '@piano/core';
import { startWebMidiAdapter } from './adapters/webmidi';
import { startWebAudioMicAdapter } from './adapters/webaudio-mic';

async function bootstrap() {
  const tier = detectPerfTier();
  const profile = PERF_PROFILES[tier];
  console.log('[boot] perf tier=' + tier, profile);

  // TODO Phase 0b: import the extracted state/render modules from @piano/core
  // and pass them { audioCtx, midiAdapter, micAdapter, perfProfile }.

  // Adapters return null until they connect; the UI surfaces "no input" state.
  const midi = await startWebMidiAdapter().catch(() => null);
  const mic = await startWebAudioMicAdapter().catch(() => null);
  console.log('[boot] midi=' + !!midi + ' mic=' + !!mic);
}

bootstrap().catch((e) => {
  console.error('[boot] fatal:', e);
});
