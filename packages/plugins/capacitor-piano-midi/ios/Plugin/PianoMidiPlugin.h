// Capacitor 6 plugin registration lives in PianoMidiPlugin.swift.
//
// Registration is done in Swift via `CAPBridgedPlugin` (identifier / jsName /
// pluginMethods), matching the bundled @capacitor/* plugins and required under
// `use_frameworks!`.
//
// The previous `CAP_PLUGIN(...)` macro here was DEAD CODE: an Objective-C macro
// placed in a header is never compiled unless a .m translation unit imports it,
// and there is no .m. As a result the plugin was never registered with the
// Capacitor runtime, so `Capacitor.isPluginAvailable("PianoMidi")` returned
// false and the native-midi polyfill never installed navigator.requestMIDIAccess
// — MIDI/BLE silently fell back to the "iOS has no Web MIDI" path.
//
// Do NOT re-add the CAP_PLUGIN macro here. This header is intentionally inert.

#import <Foundation/Foundation.h>
