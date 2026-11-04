#!/usr/bin/env node
// `pnpm deploy:ios`: build the mobile bundle and put it on a connected iPhone/iPad.
//
// `cap run ios` cannot do this on the free Apple team. Its profiles last 7 days,
// and it does not pass -allowProvisioningUpdates to xcodebuild, so once a profile
// expires, or on a device not yet registered, it fails with "No profiles for
// 'com.pianovisualizer.app'", which says nothing about the cause.
//
//   pnpm deploy:ios                  the one connected device
//   pnpm deploy:ios --device <udid>  a specific one, when several are connected
//   pnpm deploy:ios --sim            a simulator, through `cap run ios`

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS_DIR = join(ROOT, 'packages/mobile/ios');
const BUNDLE_ID = 'com.pianovisualizer.app';

/** Connected physical devices. A device paired earlier but absent now has tunnelState 'unavailable'. */
export function connectedDevices(devices) {
  return devices
    .filter(
      (d) =>
        d.hardwareProperties?.reality === 'physical' &&
        d.connectionProperties?.tunnelState !== 'unavailable'
    )
    .map((d) => ({ udid: d.hardwareProperties.udid, name: d.deviceProperties?.name ?? '?' }));
}

/** The device to deploy to, or an `error` that tells the player what to do. */
export function pickDevice(connected, requestedUdid) {
  if (requestedUdid) {
    const found = connected.find((d) => d.udid === requestedUdid);
    return found ? { device: found } : { error: `${requestedUdid} is not connected.` };
  }
  if (connected.length === 1) return { device: connected[0] };
  if (connected.length === 0) {
    return {
      error:
        'No iPhone or iPad is connected. Connect one by cable, unlock it and trust this Mac, ' +
        'or use --sim for a simulator.',
    };
  }
  const list = connected.map((d) => `  ${d.udid}  ${d.name}`).join('\n');
  return { error: `Several devices are connected. Pick one with --device <udid>:\n${list}` };
}

export function xcodebuildArgs(udid) {
  return [
    '-workspace',
    'App.xcworkspace',
    '-scheme',
    'App',
    '-configuration',
    'Debug',
    '-destination',
    `id=${udid}`,
    '-derivedDataPath',
    `../DerivedData/${udid}`,
    '-allowProvisioningUpdates',
    '-allowProvisioningDeviceRegistration',
  ];
}

function run(cmd, args, cwd = ROOT) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return res.status === 0;
}

function runOrExit(cmd, args, cwd) {
  if (!run(cmd, args, cwd)) process.exit(1);
}

function fail(message) {
  console.error(`[deploy:ios] ${message}`);
  process.exit(1);
}

/** devicectl's machine-readable output goes to a file, not stdout. */
function devicectlJson(args) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-ios-'));
  const out = join(dir, 'out.json');
  try {
    const res = spawnSync('xcrun', ['devicectl', ...args, '--json-output', out], {
      stdio: 'ignore',
    });
    if (res.status !== 0) return null;
    return JSON.parse(readFileSync(out, 'utf8')).result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  if (argv.includes('--sim')) {
    runOrExit('pnpm', ['build:mobile']);
    runOrExit('pnpm', ['--filter', '@piano/mobile', 'exec', 'cap', 'run', 'ios']);
    return;
  }

  const flag = argv.indexOf('--device');
  const requested = flag >= 0 ? argv[flag + 1] : undefined;
  if (flag >= 0 && !requested) fail('--device needs a UDID.');

  const listed = devicectlJson(['list', 'devices']);
  if (!listed) fail('Could not list devices with devicectl. Is Xcode installed?');
  const { device, error } = pickDevice(connectedDevices(listed.devices ?? []), requested);
  if (error) fail(error);

  // Checked before the slow build. A locked device otherwise fails later with
  // "The developer disk image could not be mounted", which names no cause.
  if (devicectlJson(['device', 'info', 'lockState', '--device', device.udid])?.passcodeRequired) {
    fail(`${device.name} is locked. Unlock it, keep the screen on, and run this again.`);
  }

  console.log(`[deploy:ios] Deploying to ${device.name} (${device.udid})`);
  runOrExit('pnpm', ['build:mobile']);
  runOrExit('pnpm', ['--filter', '@piano/mobile', 'exec', 'cap', 'copy', 'ios']);
  runOrExit('xcodebuild', xcodebuildArgs(device.udid), join(IOS_DIR, 'App'));

  const app = `DerivedData/${device.udid}/Build/Products/Debug-iphoneos/App.app`;
  runOrExit(
    'xcrun',
    ['devicectl', 'device', 'install', 'app', '--device', device.udid, app],
    IOS_DIR
  );

  const launched = run('xcrun', [
    'devicectl',
    'device',
    'process',
    'launch',
    '--terminate-existing',
    '--device',
    device.udid,
    BUNDLE_ID,
  ]);
  if (!launched) {
    fail(
      'Installed, but it did not launch. On a device new to this Apple ID, trust the developer ' +
        'in Settings > General > VPN & Device Management, then open the app by hand.'
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
