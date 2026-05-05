# capacitor-piano-midi

Capacitor 6 plugin: hardware MIDI input (USB + BLE) for iOS and Android. Exposes
the same event shape on both platforms so the consuming JS code can treat MIDI
as a single source.

**Why this exists**: iOS Safari/WKWebView does not implement the W3C Web MIDI
API (WebKit Bug 107250, no roadmap). Capacitor apps that target piano/MIDI
hardware on iOS need a native bridge. Inspired by — but rewritten from scratch —
[`mizuhiki/WebMIDIAPIShimForiOS`](https://github.com/mizuhiki/WebMIDIAPIShimForiOS)
(Apache-2.0).

## Install

```bash
pnpm --filter @piano/mobile add capacitor-piano-midi@workspace:*
pnpm --filter @piano/mobile exec cap sync
```

## Usage

```typescript
import { PianoMidi } from 'capacitor-piano-midi';

await PianoMidi.start();

const ports = await PianoMidi.listInputs();
console.log('MIDI ports:', ports);

PianoMidi.addListener('midiMessage', ({ portId, data, timestamp }) => {
  // data = [status, data1, data2]; status >= 0x80
  const cmd = data[0] & 0xf0;
  if (cmd === 0x90 && data[2] > 0) {
    console.log('note-on', data[1], 'vel', data[2]);
  }
});

PianoMidi.addListener('portChange', (port) => {
  console.log('port', port.state, port.name);
});

// BLE-MIDI: separate flow because pairing is user-initiated.
const { devices } = await PianoMidi.scanBle({ timeoutMs: 5000 });
if (devices.length) {
  await PianoMidi.connectBle({ id: devices[0].id });
}
```

## API

See [`src/definitions.ts`](src/definitions.ts) for the full TypeScript surface.

## Platform requirements

### iOS

- iOS 14+ (uses `MIDIInputPortCreateWithProtocol` for MIDI 1.0 UMP packets)
- `UIBackgroundModes` includes `audio` if you need MIDI to keep flowing while
  the screen is locked
- `NSBluetoothAlwaysUsageDescription` if calling `scanBle()` / `connectBle()`

### Android

- API 23+ (Android 6.0) for `android.media.midi`
- Target SDK 35 (Google Play 2025 requirement)
- `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` permissions for BLE-MIDI

## Implementation notes

- iOS uses `MIDIClientCreateWithBlock` + `MIDIInputPortCreateWithProtocol` with
  MIDI 1.0 UMP decoding.
- Android uses `MidiManager` + `openOutputPort`. The `MidiReceiver` callback is
  called on a background thread; we marshal events through Capacitor's
  `notifyListeners` which is thread-safe.
- BLE-MIDI parsing follows BLE-MIDI 1.0 spec (header byte + interleaved
  timestamp/status). Same algorithm as the legacy web `parseBleMidiPacket()`.
- iOS path uses Core Bluetooth directly (not the Web Bluetooth polyfill route)
  so it works inside WKWebView where Web Bluetooth is unavailable.

## License

Apache-2.0.

## Status

**Scaffold (Phase 2 not yet executed).** Both implementations compile against
their respective Capacitor 6 SDKs but have not been tested on real hardware.
Phase 2 is testing + iteration with USB and BLE keyboards.
