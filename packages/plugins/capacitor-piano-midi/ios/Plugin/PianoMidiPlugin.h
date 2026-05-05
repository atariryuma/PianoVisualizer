// Capacitor 6 plugin Objective-C façade.
// All implementation lives in PianoMidiPlugin.swift; this header just exposes
// the registration macro so Capacitor's runtime can find the plugin class.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PianoMidiPlugin, "PianoMidi",
  CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(listInputs, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(openPort, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(closePort, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(scanBle, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(connectBle, CAPPluginReturnPromise);
)
