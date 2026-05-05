// Capacitor 6 plugin: Android MIDI bridge.
//
// Wraps android.media.midi (API 23+) for USB-MIDI and the standard BLE-MIDI
// service UUID for Bluetooth keyboards. Exposes the same JS event shape as
// the iOS counterpart so the JS adapter doesn't need to branch on platform.

package com.pianovisualizer.midi

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.media.midi.*
import android.os.*
import android.util.Log
import androidx.annotation.RequiresApi
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.UUID

private const val TAG = "PianoMidiPlugin"

@CapacitorPlugin(name = "PianoMidi")
class PianoMidiPlugin : Plugin() {

    private var midiManager: MidiManager? = null
    private val openedDevices: MutableMap<String, MidiDevice> = HashMap()
    private val openedReceivers: MutableMap<String, MidiOutputPort> = HashMap()
    private val portInfo: MutableMap<String, JSObject> = HashMap()

    private var bleScanner: BluetoothLeScanner? = null
    private var bleAdapter: BluetoothAdapter? = null
    private val bleDiscovered: MutableMap<String, BluetoothDevice> = HashMap()

    override fun load() {
        super.load()
        midiManager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val mm = midiManager ?: run { call.reject("MIDI not available"); return }

        // Enumerate currently-attached devices.
        for (info in mm.devices) {
            openMidiDevice(mm, info)
        }
        // Subscribe to add/remove.
        mm.registerDeviceCallback(object : MidiManager.DeviceCallback() {
            override fun onDeviceAdded(device: MidiDeviceInfo) {
                openMidiDevice(mm, device)
            }
            override fun onDeviceRemoved(device: MidiDeviceInfo) {
                closeMidiDevice(deviceKey(device))
            }
        }, Handler(Looper.getMainLooper()))
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        for ((id, dev) in openedDevices) {
            try { openedReceivers[id]?.close() } catch (e: Exception) { /* ignore */ }
            try { dev.close() } catch (e: Exception) { /* ignore */ }
        }
        openedDevices.clear()
        openedReceivers.clear()
        portInfo.clear()
        call.resolve()
    }

    @PluginMethod
    fun listInputs(call: PluginCall) {
        val arr = JSArray()
        for (info in portInfo.values) arr.put(info)
        val result = JSObject().put("devices", arr)
        call.resolve(result)
    }

    @PluginMethod
    fun openPort(call: PluginCall) {
        // Devices are auto-opened on detect; explicit open is a no-op here.
        call.resolve()
    }

    @PluginMethod
    fun closePort(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("Missing id"); return }
        closeMidiDevice(id)
        call.resolve()
    }

    @PluginMethod
    fun scanBle(call: PluginCall) {
        val timeoutMs = call.getInt("timeoutMs") ?: 5000
        if (bleAdapter == null) {
            val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            bleAdapter = mgr?.adapter
            bleScanner = bleAdapter?.bluetoothLeScanner
        }
        val scanner = bleScanner ?: run { call.reject("BLE not available"); return }
        bleDiscovered.clear()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                bleDiscovered[result.device.address] = result.device
            }
        }
        val filter = ScanFilter.Builder()
            .setServiceUuid(android.os.ParcelUuid(BLE_MIDI_SERVICE))
            .build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        try {
            scanner.startScan(listOf(filter), settings, callback)
        } catch (se: SecurityException) {
            call.reject("Bluetooth permission denied: ${se.message}")
            return
        }
        Handler(Looper.getMainLooper()).postDelayed({
            try { scanner.stopScan(callback) } catch (_: Exception) {}
            val arr = JSArray()
            for ((addr, dev) in bleDiscovered) {
                val o = JSObject().put("id", addr).put("name", dev.name ?: "BLE-MIDI")
                arr.put(o)
            }
            call.resolve(JSObject().put("devices", arr))
        }, timeoutMs.toLong())
    }

    @PluginMethod
    fun connectBle(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("Missing id"); return }
        val dev = bleDiscovered[id] ?: run { call.reject("Device not found in scan cache"); return }
        val mm = midiManager ?: run { call.reject("MIDI not available"); return }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            mm.openBluetoothDevice(dev, { midiDev: MidiDevice? ->
                if (midiDev == null) {
                    call.reject("openBluetoothDevice returned null")
                } else {
                    val info = midiDev.info
                    val portId = "ble:" + dev.address
                    openedDevices[portId] = midiDev
                    attachOutputPorts(midiDev, portId, dev.name ?: "BLE-MIDI")
                    val out = JSObject()
                        .put("id", portId)
                        .put("name", dev.name ?: "BLE-MIDI")
                        .put("state", "connected")
                        .put("connection", "open")
                    call.resolve(out)
                }
            }, Handler(Looper.getMainLooper()))
        } else {
            call.reject("BLE-MIDI requires Android 6.0+")
        }
    }

    // ---- internals -----------------------------------------------------

    private fun deviceKey(info: MidiDeviceInfo): String = "midi:" + info.id

    private fun openMidiDevice(mm: MidiManager, info: MidiDeviceInfo) {
        if (info.outputPortCount == 0) return   // we only consume input from the keyboard's "output" ports
        val key = deviceKey(info)
        mm.openDevice(info, { dev: MidiDevice? ->
            if (dev == null) {
                Log.w(TAG, "openDevice returned null for $key")
                return@openDevice
            }
            openedDevices[key] = dev
            val name = info.properties.getString(MidiDeviceInfo.PROPERTY_NAME) ?: "MIDI"
            val mfg = info.properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER) ?: ""
            attachOutputPorts(dev, key, name, mfg)
        }, Handler(Looper.getMainLooper()))
    }

    private fun attachOutputPorts(dev: MidiDevice, portId: String, name: String, mfg: String = "") {
        val info = dev.info
        for (i in 0 until info.outputPortCount) {
            val outPort = dev.openOutputPort(i) ?: continue
            outPort.connect(object : MidiReceiver() {
                override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
                    val arr = JSArray()
                    val end = (offset + count).coerceAtMost(msg.size)
                    for (j in offset until end) {
                        arr.put(msg[j].toInt() and 0xFF)
                    }
                    val ev = JSObject()
                        .put("portId", portId)
                        .put("data", arr)
                        .put("timestamp", timestamp / 1_000_000.0)   // ns → ms
                    notifyListeners("midiMessage", ev)
                }
            })
            openedReceivers[portId + "#" + i] = outPort
        }
        val pi = JSObject()
            .put("id", portId)
            .put("name", name)
            .put("manufacturer", mfg)
            .put("state", "connected")
            .put("connection", "open")
        portInfo[portId] = pi
        notifyListeners("portChange", pi)
    }

    private fun closeMidiDevice(id: String) {
        // Close any output ports that prefix the id.
        val toRemove = openedReceivers.keys.filter { it.startsWith(id + "#") }
        for (k in toRemove) {
            try { openedReceivers[k]?.close() } catch (_: Exception) {}
            openedReceivers.remove(k)
        }
        try { openedDevices[id]?.close() } catch (_: Exception) {}
        openedDevices.remove(id)
        val info = portInfo.remove(id) ?: return
        val ev = JSObject()
            .put("id", id)
            .put("name", info.getString("name", "MIDI"))
            .put("state", "disconnected")
            .put("connection", "closed")
        notifyListeners("portChange", ev)
    }

    companion object {
        private val BLE_MIDI_SERVICE: UUID = UUID.fromString("03B80E5A-EDE8-4B33-A751-6CE34EC4C700")
        private val BLE_MIDI_CHAR: UUID = UUID.fromString("7772E5DB-3868-4112-A1A9-F2669D106BF3")
    }
}
