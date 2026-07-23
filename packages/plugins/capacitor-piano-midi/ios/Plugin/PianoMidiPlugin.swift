// PianoMidiPlugin — CoreMIDI bridge for Capacitor 6.
//
// Exposes the W3C-Web-MIDI-shaped events (`portChange`, `midiMessage`) to JS so
// the engine doesn't need to branch on platform. Supports USB MIDI (Lightning
// Camera Adapter / USB-C) and BLE-MIDI via the OS pairing sheet
// (CABTMIDICentralViewController) — once paired there, iOS's MIDIBluetoothDriver
// exposes the keyboard as a normal CoreMIDI source and the USB code path
// handles it unchanged. Apple's certified BLE-MIDI stack does the packet
// parsing (timestamps, running status, SysEx), so no in-app parser exists.
//
// Reference (heavy inspiration but from-scratch implementation):
//   https://github.com/mizuhiki/WebMIDIAPIShimForiOS — Apache-2.0
//
// IMPORTANT iOS quirks handled:
//   - MIDIClientCreateWithBlock keeps a strong reference to the notification block;
//     we keep it on `self` to avoid premature deinit.
//   - MIDIInputPortCreateWithProtocol replaces deprecated MIDIInputPortCreate
//     in iOS 14+; we use it on iOS 14+, fall back to the old API otherwise.
//   - MIDIPacketList is a packed C struct; we walk it via MIDIPacketNext (a macro
//     in C, manually-implemented in Swift — see iteratePackets()).

import Foundation
import Capacitor
import CoreMIDI
import CoreAudioKit

@objc(PianoMidiPlugin)
public class PianoMidiPlugin: CAPPlugin, CAPBridgedPlugin {

    // MARK: - Capacitor plugin registration (CAPBridgedPlugin)
    //
    // Registers the plugin with the Capacitor runtime under jsName "PianoMidi".
    // This is the ONLY registration path under `use_frameworks!` (the Podfile
    // uses it): the old ObjC `CAP_PLUGIN` macro that lived in PianoMidiPlugin.h
    // was never compiled — a macro in a .h has no translation unit — so the
    // plugin went unregistered, `Capacitor.isPluginAvailable("PianoMidi")`
    // returned false, and the native-midi polyfill never installed
    // `navigator.requestMIDIAccess`. Mirrors the bundled @capacitor/* plugins.
    public let identifier = "PianoMidiPlugin"
    public let jsName = "PianoMidi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listInputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openPort", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closePort", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanBle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectBle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBleMidiPairing", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - State
    private var midiClient: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var connectedSources: [MIDIEndpointRef: String] = [:]   // endpoint -> stable id
    private var portInfo: [String: [String: Any]] = [:]             // id -> {name, mfg, state, connection}
    // H3: connectedSources / portInfo は CoreMIDI I/O スレッド（受信）・通知
    // スレッド（add/remove）・main/bridge スレッド（start/stop/listInputs）から
    // 触られる。Swift Dictionary は非スレッドセーフで、挿入時 rehash と別スレッド
    // 読取の競合が EXC_BAD_ACCESS を起こす（抜き差し/RTP 出現時）。全アクセスを
    // この lock で直列化する。受信ホットパスの critical section は「portId 解決」
    // だけに絞り、notifyListeners（bridge 呼び）は lock 外で行う。
    private let stateLock = NSLock()

    // MARK: - Capacitor lifecycle

    override public func load() {
        // No-op until JS calls start(). We don't auto-init CoreMIDI here because
        // it would bring up the privacy LED on some devices unnecessarily.
    }

    @objc func start(_ call: CAPPluginCall) {
        guard midiClient == 0 else {
            // Idempotent re-entry (the JS rescan poller re-calls start before
            // each listInputs): reconcile against live CoreMIDI state so a
            // source that appeared without a notification is still picked up.
            syncSources()
            call.resolve()
            return
        }

        // M-iOS (2026-07-23): create the client + port on the MAIN THREAD.
        // Capacitor executes plugin calls on a background dispatch queue with
        // no run loop; CoreMIDI setup-change notifications (msgObjectAdded /
        // msgObjectRemoved) are tied to the thread the client was created on
        // and can silently NEVER fire for a client created on a run-loop-less
        // worker thread. That was the "pair the keyboard in another app, then
        // RESTART this app" symptom: startup enumeration worked, hot-add
        // notifications never arrived. Apple guidance + every reference shim
        // (e.g. WebMIDIAPIShimForiOS) create the client on main.
        var status: OSStatus = noErr
        var portStatus: OSStatus = noErr
        let create: () -> Void = { [self] in
            let clientName = "PianoVisualizerMIDIClient" as CFString
            status = MIDIClientCreateWithBlock(clientName, &midiClient) { [weak self] (notif: UnsafePointer<MIDINotification>) in
                self?.handleMIDINotification(notif)
            }
            guard status == noErr else { return }

            let portName = "PianoVisualizerInputPort" as CFString
            if #available(iOS 14.0, *) {
                portStatus = MIDIInputPortCreateWithProtocol(midiClient, portName, ._1_0, &inputPort) { [weak self] (eventList, srcConnRefCon) in
                    self?.handleEventList(eventList, srcConnRefCon)
                }
            } else {
                portStatus = MIDIInputPortCreateWithBlock(midiClient, portName, &inputPort) { [weak self] (packetList, srcConnRefCon) in
                    self?.handlePacketList(packetList, srcConnRefCon)
                }
            }
        }
        if Thread.isMainThread { create() } else { DispatchQueue.main.sync(execute: create) }

        guard status == noErr else {
            call.reject("MIDIClientCreate failed: \(status)")
            return
        }
        guard portStatus == noErr else {
            call.reject("MIDIInputPortCreate failed: \(portStatus)")
            return
        }

        // Connect every existing source.
        syncSources()
        call.resolve()
    }

    /// Reconcile `connectedSources` against the LIVE CoreMIDI source list —
    /// connect anything new, drop anything gone. This is the safety net for
    /// missed notifications (background-suspended WKWebView, historical
    /// off-main client creation): the JS auto-rescan poller calls
    /// start()+listInputs() every few seconds, and each call now performs a
    /// true re-enumeration instead of echoing a stale snapshot. Previously
    /// listInputs only returned the internal dictionary, so ONE missed
    /// notification hid a newly-paired BLE keyboard until app restart.
    private func syncSources() {
        guard midiClient != 0, inputPort != 0 else { return }
        let sourceCount = MIDIGetNumberOfSources()
        var live = Set<MIDIEndpointRef>()
        for i in 0..<sourceCount {
            let src = MIDIGetSource(i)
            live.insert(src)
            connectSource(src)   // dedupes + fires portChange for new ones
        }
        stateLock.lock()
        let stale = connectedSources.keys.filter { !live.contains($0) }
        stateLock.unlock()
        for src in stale {
            disconnectSource(src)   // fires portChange(disconnected)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        stateLock.lock()
        let srcs = Array(connectedSources.keys)
        connectedSources.removeAll()
        portInfo.removeAll()
        stateLock.unlock()
        for src in srcs {
            MIDIPortDisconnectSource(inputPort, src)
        }
        if inputPort != 0 { MIDIPortDispose(inputPort); inputPort = 0 }
        if midiClient != 0 { MIDIClientDispose(midiClient); midiClient = 0 }
        call.resolve()
    }

    @objc func listInputs(_ call: CAPPluginCall) {
        // True re-enumeration on every call (see syncSources) — the JS rescan
        // poller depends on this to recover from missed notifications.
        syncSources()
        stateLock.lock()
        let devices = Array(portInfo.values)
        stateLock.unlock()
        call.resolve(["devices": devices])
    }

    @objc func openPort(_ call: CAPPluginCall) {
        // CoreMIDI ports are auto-opened on connect; no-op for parity with Android.
        call.resolve()
    }

    @objc func closePort(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing id"); return }
        stateLock.lock()
        // キーを先に集めてから remove（iteration 中の mutation を回避）。
        let srcs = connectedSources.filter { $0.value == id }.map { $0.key }
        for src in srcs { connectedSources.removeValue(forKey: src) }
        portInfo.removeValue(forKey: id)
        stateLock.unlock()
        for src in srcs { MIDIPortDisconnectSource(inputPort, src) }
        call.resolve()
    }

    // iOS BLE-MIDI goes through the OS pairing sheet (showBleMidiPairing).
    // The previous in-app CoreBluetooth central shipped a BLE-MIDI parser that
    // violated MIDI 1.0 running-status rules (System Real-Time / System Common
    // / SysEx handling) — deleted in favor of Apple's certified stack, which
    // surfaces paired keyboards as regular CoreMIDI sources. scanBle/connectBle
    // remain in the plugin API for Android (android.media.midi has no system
    // pairing UI, so the Kotlin side scans/connects itself).

    @objc func scanBle(_ call: CAPPluginCall) {
        call.reject("Not used on iOS — call showBleMidiPairing() instead")
    }

    @objc func connectBle(_ call: CAPPluginCall) {
        call.reject("Not used on iOS — call showBleMidiPairing() instead")
    }

    /// Present Apple's Bluetooth-MIDI pairing sheet (CABTMIDICentralViewController).
    /// Once the user pairs a keyboard there, iOS's MIDIBluetoothDriver publishes
    /// it as a CoreMIDI source → our msgObjectAdded handler connects it and
    /// fires portChange, exactly like a USB hot-plug. Resolves when the sheet
    /// is presented (not when a device connects — connection arrives async via
    /// portChange).
    @objc func showBleMidiPairing(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            let picker = CABTMIDICentralViewController()
            picker.navigationItem.rightBarButtonItem = UIBarButtonItem(
                barButtonSystemItem: .done,
                target: self,
                action: #selector(self.dismissBleMidiPairing)
            )
            let nav = UINavigationController(rootViewController: picker)
            nav.modalPresentationStyle = .formSheet
            // Swipe-down dismissal bypasses the Done button — hook the
            // presentation delegate so the post-pairing sweep runs either way.
            nav.presentationController?.delegate = self
            host.present(nav, animated: true)
            call.resolve()
        }
    }

    @objc private func dismissBleMidiPairing() {
        bridge?.viewController?.dismiss(animated: true)
        // Post-pairing sweep: if the msgObjectAdded notification was missed
        // (or arrives late), pick the just-paired keyboard up immediately
        // instead of waiting for the JS poller's next tick.
        syncSources()
    }

    // MARK: - CoreMIDI handlers

    private func connectSource(_ src: MIDIEndpointRef) {
        // Skip if already connected.
        stateLock.lock()
        let already = connectedSources[src] != nil
        stateLock.unlock()
        if already { return }

        // RTP-MIDI ("Network Session 1") is a virtual endpoint that iOS always
        // publishes once network MIDI is on — it is not an instrument. Exclude
        // it natively: the JS shell's name-based virtual-port filter misses
        // localized display names (日本語 iPad: "ネットワーク Session 1"), and a
        // false attach there blocks the real keyboard from ever attaching.
        if isNetworkSessionEndpoint(src) { return }

        let id = stableEndpointId(src)
        let name = endpointDisplayName(src) ?? "MIDI Source"
        let manufacturer = endpointManufacturer(src) ?? ""

        // Pass the endpoint ref as connRefCon so the receive handlers can
        // attribute each packet to its actual source. Attributing to "the
        // first connected source" mislabels messages the moment a second
        // endpoint exists, and the JS polyfill routes by portId — a mislabeled
        // note lands on an input with no onmidimessage bound and is dropped.
        let status = MIDIPortConnectSource(inputPort, src, UnsafeMutableRawPointer(bitPattern: UInt(src)))
        guard status == noErr else {
            NSLog("[PianoMidi] connect source failed (\(status)) for \(name)")
            return
        }
        let info: [String: Any] = [
            "id": id, "name": name, "manufacturer": manufacturer,
            "state": "connected", "connection": "open"
        ]
        stateLock.lock()
        connectedSources[src] = id
        portInfo[id] = info
        stateLock.unlock()
        notifyListeners("portChange", data: info)
    }

    private func disconnectSource(_ src: MIDIEndpointRef) {
        stateLock.lock()
        let removedId = connectedSources.removeValue(forKey: src)
        let prevName = removedId.flatMap { portInfo[$0]?["name"] }
        if let rid = removedId { portInfo.removeValue(forKey: rid) }
        stateLock.unlock()
        guard let id = removedId else { return }
        MIDIPortDisconnectSource(inputPort, src)
        let info: [String: Any] = [
            "id": id, "name": prevName ?? "MIDI Source",
            "state": "disconnected", "connection": "closed"
        ]
        notifyListeners("portChange", data: info)
    }

    private func handleMIDINotification(_ notification: UnsafePointer<MIDINotification>) {
        let m = notification.pointee
        switch m.messageID {
        case .msgObjectAdded:
            let added = UnsafeRawPointer(notification).assumingMemoryBound(to: MIDIObjectAddRemoveNotification.self).pointee
            if added.childType == .source {
                connectSource(MIDIEndpointRef(added.child))
            }
        case .msgObjectRemoved:
            let removed = UnsafeRawPointer(notification).assumingMemoryBound(to: MIDIObjectAddRemoveNotification.self).pointee
            if removed.childType == .source {
                disconnectSource(MIDIEndpointRef(removed.child))
            }
        default:
            break
        }
    }

    /// iOS 14+ packet path. MIDIEventList groups MIDIEventPackets; each packet
    /// holds 1..n Universal MIDI Packets (UMP), each 1-4 words long.
    @available(iOS 14.0, *)
    private func handleEventList(_ eventList: UnsafePointer<MIDIEventList>, _ srcConnRefCon: UnsafeMutableRawPointer?) {
        guard let portId = resolvePortId(fromRefCon: srcConnRefCon) else { return }
        // H2: 実メモリを反復する Apple 公式シーケンス。以前は
        // `withUnsafePointer(to: eventList.pointee.packet)` がスタック一時コピーの
        // アドレスを返し、そこから advance していたため、1 コールバックに複数
        // パケットが来ると packet[1..] がゴミメモリを読んでいた（和音直後の連打・
        // 速い区間・BLE バッチで note 取りこぼし/OOB read。単音は packet[0] だけ
        // 読むので無事＝実機の単音検証を通過していた）。
        for packetPtr in eventList.unsafeSequence() {
            let packet = packetPtr.pointee
            let timestamp = hostTimeToMillis(packet.timeStamp)
            // Walk the words as UMPs, advancing by each message's word count
            // (M2-104-UM: SysEx/Data64 = 2 words, MIDI 2.0 voice = 2, Data128
            // = 4...). Iterating word-by-word misreads the data words of a
            // multi-word message as fresh UMPs — a SysEx payload word whose
            // top nibble happens to be 0x2 would dispatch a garbage note.
            var w = 0
            while w < Int(packet.wordCount) {
                // `words` is a C fixed-size array imported as a tuple; can't
                // subscript with a runtime index. Read through a raw byte view.
                let word: UInt32 = withUnsafeBytes(of: packet.words) { raw in
                    raw.load(fromByteOffset: w * MemoryLayout<UInt32>.size, as: UInt32.self)
                }
                let messageType = Int((word >> 28) & 0xF)
                if messageType == 0x2 {   // MIDI 1.0 channel voice (1 word)
                    let status = UInt8((word >> 16) & 0xFF)
                    let d1 = UInt8((word >> 8) & 0x7F)
                    let d2 = UInt8(word & 0x7F)
                    // Program change / channel pressure carry ONE data byte —
                    // don't fabricate a third (Web MIDI `data` length must
                    // match the message).
                    let cmd = status & 0xF0
                    let payload: [Int] = (cmd == 0xC0 || cmd == 0xD0)
                        ? [Int(status), Int(d1)]
                        : [Int(status), Int(d1), Int(d2)]
                    notifyListeners("midiMessage", data: [
                        "portId": portId,
                        "data": payload,
                        "timestamp": timestamp
                    ])
                }
                w += PianoMidiPlugin.umpWordCount[messageType]
            }
        }
    }

    /// iOS 13 fallback. Walks a MIDIPacketList via Apple's unsafeSequence.
    private func handlePacketList(_ pktList: UnsafePointer<MIDIPacketList>, _ srcConnRefCon: UnsafeMutableRawPointer?) {
        guard let portId = resolvePortId(fromRefCon: srcConnRefCon) else { return }
        // H2（同根）: 以前は `pktList.pointee.packet`（スタック一時コピー）から
        // MIDIPacketNextPure で advance しており、複数パケットで packet[1..] が
        // ゴミを読んでいた。実メモリを反復する unsafeSequence に置換。
        for packetPtr in pktList.unsafeSequence() {
            let packet = packetPtr.pointee
            let timestamp = hostTimeToMillis(packet.timeStamp)
            let length = Int(packet.length)
            let bytes = withUnsafeBytes(of: packet.data) { raw in
                Array(raw.prefix(length))
            }
            emitMidi1Stream(bytes, portId: portId, timestamp: timestamp)
        }
    }

    /// Emit each complete MIDI 1.0 message in a packet's byte stream. A
    /// CoreMIDI packet may hold several coalesced messages (note-on + Active
    /// Sensing etc.) — the previous prefix(3) read forwarded only the first
    /// and silently dropped the rest.
    private func emitMidi1Stream(_ bytes: [UInt8], portId: String, timestamp: UInt64) {
        var i = 0
        while i < bytes.count {
            let status = bytes[i]
            if status < 0x80 { i += 1; continue }      // stray data byte — resync
            if status >= 0xF8 { i += 1; continue }     // System Real-Time: 1 byte, not forwarded
            if status == 0xF0 {                        // SysEx: skip to EOX
                while i < bytes.count && bytes[i] != 0xF7 { i += 1 }
                i += 1
                continue
            }
            let cmd = status & 0xF0
            let dataLen: Int
            if cmd == 0xC0 || cmd == 0xD0 {
                dataLen = 1                            // program change / channel pressure
            } else if cmd != 0xF0 {
                dataLen = 2                            // note / poly-AT / CC / pitch-bend
            } else {
                // System Common: F1/F3 = 1 data byte, F2 = 2, F4-F7 = 0.
                dataLen = status == 0xF2 ? 2 : (status == 0xF1 || status == 0xF3) ? 1 : 0
            }
            guard i + dataLen < bytes.count || dataLen == 0 else { break }   // truncated
            if cmd != 0xF0 {                           // channel voice — forward
                var payload = [Int(status)]
                for d in 0..<dataLen { payload.append(Int(bytes[i + 1 + d] & 0x7F)) }
                notifyListeners("midiMessage", data: [
                    "portId": portId,
                    "data": payload,
                    "timestamp": timestamp
                ])
            }
            i += 1 + dataLen
        }
    }

    // MARK: - Helpers

    /// UMP words per message-type nibble (MIDI 2.0 UMP spec M2-104-UM).
    /// mt 0x3 (Data64/SysEx) = 2 words, 0x5 (Data128) = 4, etc.
    private static let umpWordCount: [Int] = [1, 1, 1, 2, 2, 4, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4]

    /// Resolve the portId for an incoming packet: prefer the per-source
    /// connRefCon (definitive per-source attribution), else the sole connected
    /// source. Both dictionary reads happen under `stateLock` in a SINGLE
    /// critical section so a concurrent connect/disconnect can't tear the read
    /// (H3). Called from the CoreMIDI I/O thread — kept minimal.
    private func resolvePortId(fromRefCon refCon: UnsafeMutableRawPointer?) -> String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        if let refCon = refCon {
            let ep = MIDIEndpointRef(UInt32(truncatingIfNeeded: UInt(bitPattern: refCon)))
            if let id = connectedSources[ep] { return id }
        }
        return connectedSources.first?.value
    }

    /// True for the RTP-MIDI network-session virtual endpoint. Locale-
    /// independent, unlike display-name matching ("Network Session 1" is
    /// "ネットワーク Session 1" on a Japanese device).
    ///
    /// Primary check: identity against MIDINetworkSession's own endpoints —
    /// definitive. (A driver-owner string match on
    /// "com.apple.AppleMIDIRTPDriver" was tried first and did NOT match on
    /// iOS — verified live on iPadOS 26 where the session sailed through,
    /// attached as if it were a piano, and blocked the real GO:PIANO88.)
    private func isNetworkSessionEndpoint(_ ep: MIDIEndpointRef) -> Bool {
        let session = MIDINetworkSession.default()
        if ep == session.sourceEndpoint() || ep == session.destinationEndpoint() {
            return true
        }
        // Fallback for any other RTP-MIDI-driver endpoint shape. Log the owner
        // so a future mismatch is diagnosable from the device console.
        var prop: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(ep, kMIDIPropertyDriverOwner, &prop) == noErr,
           let owner = prop?.takeRetainedValue() as String? {
            if owner.contains("AppleMIDIRTPDriver") { return true }
            NSLog("[PianoMidi] endpoint \(stableEndpointId(ep)) driverOwner=\(owner)")
        }
        return false
    }

    /// Mach timebase for host-time → nanosecond conversion (numer/denom ratio).
    /// Replaces AudioConvertHostTimeToNanos, which isn't reliably exposed to Swift
    /// via the iOS CoreAudio module under `use_frameworks!`.
    private static let machTimebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Convert a CoreMIDI host-time stamp (mach absolute-time units) to milliseconds.
    private func hostTimeToMillis(_ hostTime: MIDITimeStamp) -> UInt64 {
        let tb = PianoMidiPlugin.machTimebase
        let nanos = hostTime &* UInt64(tb.numer) / UInt64(tb.denom)
        return nanos / 1_000_000
    }

    private func stableEndpointId(_ ep: MIDIEndpointRef) -> String {
        var uid: Int32 = 0
        MIDIObjectGetIntegerProperty(ep, kMIDIPropertyUniqueID, &uid)
        return String(uid)
    }

    private func endpointDisplayName(_ ep: MIDIEndpointRef) -> String? {
        var prop: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(ep, kMIDIPropertyDisplayName, &prop) == noErr {
            return prop?.takeRetainedValue() as String?
        }
        return nil
    }

    private func endpointManufacturer(_ ep: MIDIEndpointRef) -> String? {
        var prop: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(ep, kMIDIPropertyManufacturer, &prop) == noErr {
            return prop?.takeRetainedValue() as String?
        }
        return nil
    }
}

// MARK: - Pairing-sheet swipe dismissal

extension PianoMidiPlugin: UIAdaptivePresentationControllerDelegate {
    /// The BLE pairing sheet was dismissed by swipe (not the Done button) —
    /// run the same post-pairing sweep so a keyboard paired moments before
    /// the swipe attaches immediately.
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        syncSources()
    }
}
