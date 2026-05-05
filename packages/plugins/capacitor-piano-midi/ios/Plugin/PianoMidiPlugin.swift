// PianoMidiPlugin — CoreMIDI bridge for Capacitor 6.
//
// Exposes the W3C-Web-MIDI-shaped events (`portChange`, `midiMessage`) to JS so
// the engine doesn't need to branch on platform. Supports USB MIDI (Lightning
// Camera Adapter / USB-C) and BLE-MIDI (paired via CoreBluetooth).
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
import CoreBluetooth

@objc(PianoMidiPlugin)
public class PianoMidiPlugin: CAPPlugin {

    // MARK: - State
    private var midiClient: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var connectedSources: [MIDIEndpointRef: String] = [:]   // endpoint -> stable id
    private var portInfo: [String: [String: Any]] = [:]             // id -> {name, mfg, state, connection}
    private var bleManager: BleMidiManager?

    // MARK: - Capacitor lifecycle

    override public func load() {
        // No-op until JS calls start(). We don't auto-init CoreMIDI here because
        // it would bring up the privacy LED on some devices unnecessarily.
    }

    @objc func start(_ call: CAPPluginCall) {
        guard midiClient == 0 else { call.resolve(); return }

        let clientName = "PianoVisualizerMIDIClient" as CFString
        let status = MIDIClientCreateWithBlock(clientName, &midiClient) { [weak self] (notif: UnsafePointer<MIDINotification>) in
            self?.handleMIDINotification(notif)
        }
        guard status == noErr else {
            call.reject("MIDIClientCreate failed: \(status)")
            return
        }

        let portName = "PianoVisualizerInputPort" as CFString
        let portStatus: OSStatus
        if #available(iOS 14.0, *) {
            portStatus = MIDIInputPortCreateWithProtocol(midiClient, portName, ._1_0) { [weak self] (eventList, refCon) in
                self?.handleEventList(eventList)
            }
        } else {
            portStatus = MIDIInputPortCreateWithBlock(midiClient, portName, &inputPort) { [weak self] (packetList, srcConnRefCon) in
                self?.handlePacketList(packetList)
            }
        }
        guard portStatus == noErr else {
            call.reject("MIDIInputPortCreate failed: \(portStatus)")
            return
        }

        // Connect every existing source.
        let sourceCount = MIDIGetNumberOfSources()
        for i in 0..<sourceCount {
            let src = MIDIGetSource(i)
            connectSource(src)
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        for (src, _) in connectedSources {
            MIDIPortDisconnectSource(inputPort, src)
        }
        connectedSources.removeAll()
        portInfo.removeAll()
        if inputPort != 0 { MIDIPortDispose(inputPort); inputPort = 0 }
        if midiClient != 0 { MIDIClientDispose(midiClient); midiClient = 0 }
        bleManager?.stop()
        bleManager = nil
        call.resolve()
    }

    @objc func listInputs(_ call: CAPPluginCall) {
        call.resolve(["devices": Array(portInfo.values)])
    }

    @objc func openPort(_ call: CAPPluginCall) {
        // CoreMIDI ports are auto-opened on connect; no-op for parity with Android.
        call.resolve()
    }

    @objc func closePort(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing id"); return }
        for (src, mappedId) in connectedSources where mappedId == id {
            MIDIPortDisconnectSource(inputPort, src)
            connectedSources.removeValue(forKey: src)
        }
        portInfo.removeValue(forKey: id)
        call.resolve()
    }

    @objc func scanBle(_ call: CAPPluginCall) {
        let timeoutMs = call.getInt("timeoutMs") ?? 5000
        if bleManager == nil {
            bleManager = BleMidiManager(plugin: self)
        }
        bleManager?.scan(timeoutMs: timeoutMs) { devices in
            let mapped = devices.map { ["id": $0.id, "name": $0.name] }
            call.resolve(["devices": mapped])
        }
    }

    @objc func connectBle(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing id"); return }
        if bleManager == nil {
            bleManager = BleMidiManager(plugin: self)
        }
        bleManager?.connect(id: id) { result in
            switch result {
            case .success(let port):
                call.resolve([
                    "id": port.id, "name": port.name,
                    "state": port.state, "connection": port.connection
                ])
            case .failure(let err):
                call.reject("BLE connect failed: \(err.localizedDescription)")
            }
        }
    }

    // MARK: - CoreMIDI handlers

    private func connectSource(_ src: MIDIEndpointRef) {
        // Skip if already connected.
        if connectedSources[src] != nil { return }

        let id = stableEndpointId(src)
        let name = endpointDisplayName(src) ?? "MIDI Source"
        let manufacturer = endpointManufacturer(src) ?? ""

        let status = MIDIPortConnectSource(inputPort, src, nil)
        guard status == noErr else {
            NSLog("[PianoMidi] connect source failed (\(status)) for \(name)")
            return
        }
        connectedSources[src] = id
        let info: [String: Any] = [
            "id": id, "name": name, "manufacturer": manufacturer,
            "state": "connected", "connection": "open"
        ]
        portInfo[id] = info
        notifyListeners("portChange", data: info)
    }

    private func disconnectSource(_ src: MIDIEndpointRef) {
        guard let id = connectedSources.removeValue(forKey: src) else { return }
        MIDIPortDisconnectSource(inputPort, src)
        let info: [String: Any] = [
            "id": id, "name": portInfo[id]?["name"] ?? "MIDI Source",
            "state": "disconnected", "connection": "closed"
        ]
        portInfo.removeValue(forKey: id)
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

    /// iOS 14+ packet path. MIDIEventList groups MIDIEventPackets, each with multiple words.
    @available(iOS 14.0, *)
    private func handleEventList(_ eventList: UnsafePointer<MIDIEventList>) {
        let pkt = UnsafePointer(withUnsafePointer(to: eventList.pointee.packet) { $0 })
        var packet = pkt.pointee
        let timestamp = AudioConvertHostTimeToNanos(packet.timeStamp) / 1_000_000   // ns → ms
        // Source endpoint is not directly attached to the packet on iOS 14 path;
        // we rely on the port-wide connection set, but for now fall back to the first.
        guard let firstId = connectedSources.first?.value else { return }
        for _ in 0..<eventList.pointee.numPackets {
            // Each word is a Uint32 holding a UMP message; decode the basic MIDI 1.0 form.
            for w in 0..<Int(packet.wordCount) {
                let word = packet.words[w]
                let messageType = (word >> 28) & 0xF
                if messageType == 0x2 {   // MIDI 1.0 channel voice
                    let status = UInt8((word >> 16) & 0xFF)
                    let d1 = UInt8((word >> 8) & 0xFF)
                    let d2 = UInt8(word & 0xFF)
                    notifyListeners("midiMessage", data: [
                        "portId": firstId,
                        "data": [Int(status), Int(d1), Int(d2)],
                        "timestamp": timestamp
                    ])
                }
            }
            // Advance to the next packet (MIDIEventPacketNext is a macro in C; reimplement).
            let advance = MemoryLayout<MIDIEventPacket>.offset(of: \MIDIEventPacket.words)!
                + Int(packet.wordCount) * MemoryLayout<UInt32>.size
            let nextPtr = UnsafeMutableRawPointer(mutating: pkt).advanced(by: advance)
            packet = nextPtr.assumingMemoryBound(to: MIDIEventPacket.self).pointee
        }
    }

    /// iOS 13 fallback. Walks a MIDIPacketList by hand (MIDIPacketNext is a C macro).
    private func handlePacketList(_ pktList: UnsafePointer<MIDIPacketList>) {
        var packet = pktList.pointee.packet
        let timestamp = AudioConvertHostTimeToNanos(packet.timeStamp) / 1_000_000
        guard let firstId = connectedSources.first?.value else { return }
        for _ in 0..<pktList.pointee.numPackets {
            let length = Int(packet.length)
            withUnsafePointer(to: &packet.data) { dataPtr in
                let bytes = UnsafeBufferPointer(start: UnsafeRawPointer(dataPtr).assumingMemoryBound(to: UInt8.self), count: length)
                let arr = Array(bytes)
                if arr.count >= 1 {
                    let payload: [Int] = arr.prefix(3).map { Int($0) }
                    notifyListeners("midiMessage", data: [
                        "portId": firstId,
                        "data": payload,
                        "timestamp": timestamp
                    ])
                }
            }
            packet = MIDIPacketNextPure(packet: packet)
        }
    }

    // MARK: - Helpers

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

/// Pure-Swift reimplementation of the C MIDIPacketNext macro.
fileprivate func MIDIPacketNextPure(packet: MIDIPacket) -> MIDIPacket {
    return withUnsafePointer(to: packet) { ptr in
        let dataOffset = MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)!
        let total = dataOffset + Int(packet.length)
        // 4-byte alignment per CoreMIDI.h.
        let aligned = (total + 3) & ~3
        let nextRaw = UnsafeRawPointer(ptr).advanced(by: aligned)
        return nextRaw.assumingMemoryBound(to: MIDIPacket.self).pointee
    }
}

// MARK: - BLE-MIDI Manager (skeleton)

import os.log

fileprivate struct BleDevice { let id: String; let name: String }

fileprivate class BleMidiManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private let plugin: PianoMidiPlugin
    private var central: CBCentralManager!
    private var discovered: [String: CBPeripheral] = [:]
    private var connected: CBPeripheral?
    private var scanCallback: (([BleDevice]) -> Void)?
    private var connectCallback: ((Result<(id: String, name: String, state: String, connection: String), Error>) -> Void)?
    private let bleMidiServiceUUID = CBUUID(string: "03B80E5A-EDE8-4B33-A751-6CE34EC4C700")
    private let bleMidiCharUUID    = CBUUID(string: "7772E5DB-3868-4112-A1A9-F2669D106BF3")

    init(plugin: PianoMidiPlugin) {
        self.plugin = plugin
        super.init()
        self.central = CBCentralManager(delegate: self, queue: nil)
    }

    func scan(timeoutMs: Int, callback: @escaping ([BleDevice]) -> Void) {
        scanCallback = callback
        discovered.removeAll()
        guard central.state == .poweredOn else { callback([]); return }
        central.scanForPeripherals(withServices: [bleMidiServiceUUID], options: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) { [weak self] in
            self?.central.stopScan()
            let list = self?.discovered.map { BleDevice(id: $0.key, name: $0.value.name ?? "BLE-MIDI") } ?? []
            self?.scanCallback?(list)
            self?.scanCallback = nil
        }
    }

    func connect(id: String, callback: @escaping (Result<(id: String, name: String, state: String, connection: String), Error>) -> Void) {
        guard let p = discovered[id] else {
            callback(.failure(NSError(domain: "PianoMidi", code: 404, userInfo: [NSLocalizedDescriptionKey: "Peripheral not found in last scan"])))
            return
        }
        connectCallback = callback
        connected = p
        p.delegate = self
        central.connect(p, options: nil)
    }

    func stop() {
        if let c = connected { central.cancelPeripheralConnection(c) }
        connected = nil
    }

    // CBCentralManagerDelegate
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        // No-op; scan() guards on poweredOn.
    }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        discovered[peripheral.identifier.uuidString] = peripheral
    }
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([bleMidiServiceUUID])
    }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectCallback?(.failure(error ?? NSError(domain: "PianoMidi", code: 0, userInfo: nil)))
        connectCallback = nil
    }

    // CBPeripheralDelegate
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let svc = peripheral.services?.first(where: { $0.uuid == bleMidiServiceUUID }) else { return }
        peripheral.discoverCharacteristics([bleMidiCharUUID], for: svc)
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let ch = service.characteristics?.first(where: { $0.uuid == bleMidiCharUUID }) else { return }
        peripheral.setNotifyValue(true, for: ch)
        let id = peripheral.identifier.uuidString
        let name = peripheral.name ?? "BLE-MIDI"
        let info: [String: Any] = [
            "id": id, "name": name, "manufacturer": "BLE",
            "state": "connected", "connection": "open"
        ]
        plugin.notifyListeners("portChange", data: info)
        connectCallback?(.success((id: id, name: name, state: "connected", connection: "open")))
        connectCallback = nil
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        // BLE-MIDI 1.0 packet parsing — header byte + timestamp interleaved with status/data.
        // Same algorithm as the JS-side parseBleMidiPacket() in legacy app.js.
        let bytes = [UInt8](data)
        guard bytes.count >= 3 else { return }
        var i = 1   // skip header
        var runningStatus: UInt8 = 0
        let portId = peripheral.identifier.uuidString
        while i < bytes.count {
            if (bytes[i] & 0x80) != 0 {
                i += 1   // skip timestamp
                if i >= bytes.count { break }
                if (bytes[i] & 0x80) != 0 {
                    runningStatus = bytes[i]
                    i += 1
                }
            }
            if runningStatus == 0 { i += 1; continue }
            let cmd = runningStatus & 0xF0
            if cmd == 0x80 || cmd == 0x90 || cmd == 0xB0 || cmd == 0xA0 || cmd == 0xE0 {
                if i + 1 >= bytes.count { break }
                let payload: [Int] = [Int(runningStatus), Int(bytes[i] & 0x7F), Int(bytes[i+1] & 0x7F)]
                plugin.notifyListeners("midiMessage", data: [
                    "portId": portId,
                    "data": payload,
                    "timestamp": Date().timeIntervalSince1970 * 1000
                ])
                i += 2
            } else if cmd == 0xC0 || cmd == 0xD0 {
                i += 1   // 1-data-byte messages
            } else {
                i += 1
            }
        }
    }
}
