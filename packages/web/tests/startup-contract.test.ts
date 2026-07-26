// Startup sequencing contract — source-level, because the seam isn't injectable.
//
// The property under test is "the play screen does not wait on an OS device
// open". It cost ~430 ms of dead time on iPad: `installStartButton` awaits
// `initAudio()` and only then calls `showRunningUI()`, while `initAudio()` was
// awaiting `decideInitialInputMode()` — which calls `getUserMedia`. So every
// free-play start sat on the title screen for the length of a microphone
// permission-layer device open, and the user reported it as "it takes a while to
// switch to the mic".
//
// Why a source assertion rather than a runtime one: `createShellAudio` builds
// its MicLifecycle internally and needs a real AudioContext + Tone to run, so
// there is no seam to observe the ordering through. The regression is a single
// `await` keyword reappearing, which is exactly what a source check can catch.
// If shell-audio ever gains an injectable mic lifecycle, replace this with a
// test that resolves the mic slowly and asserts `initAudio()` resolves first.

import { describe, it, expect } from 'vitest';
import { readSrc, stripComments as code } from './support/source';

const shellAudio = readSrc('shell-audio.ts');

describe('startup sequencing', () => {
  it('initAudio does NOT await the input decision', () => {
    const src = code(shellAudio);
    expect(src).toMatch(/decideInitialInputMode\(\)/);
    expect(
      src,
      'awaiting the input decision puts a getUserMedia device open in front of the play screen'
    ).not.toMatch(/await\s+_micLifecycle\.decideInitialInputMode/);
  });

  it('the re-entry path does not await the MIDI probe either', () => {
    // `initWebMIDI()` shares its boot promise now, so awaiting it on re-entry
    // re-enumerates nothing — it only put an unbounded await back in front of
    // the ▶ transition, which is the delay this contract exists to prevent.
    expect(code(shellAudio)).not.toMatch(/await deps\.initWebMIDI/);
  });

  it('the audio GRAPH is still built before initAudio resolves', () => {
    // The render loop reads the analyser on its first frame, so the graph — as
    // opposed to the mic source — must be ready synchronously.
    const src = code(shellAudio);
    const graph = src.indexOf('rebuildAudioGraph(null)');
    const decide = src.indexOf('_micLifecycle.decideInitialInputMode()');
    expect(graph).toBeGreaterThan(-1);
    expect(decide).toBeGreaterThan(graph);
  });
});
