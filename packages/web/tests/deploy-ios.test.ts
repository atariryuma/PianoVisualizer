// `pnpm deploy:ios` has to keep working when the free team's 7-day profile has
// expired and on a device not registered yet. Only xcodebuild's provisioning
// flags make that possible, and nothing else fails until a profile runs out.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts/deploy-ios.mjs');

interface Device {
  udid: string;
  name: string;
}
interface DeployIos {
  connectedDevices(devices: unknown[]): Device[];
  pickDevice(connected: Device[], requested?: string): { device?: Device; error?: string };
  xcodebuildArgs(udid: string): string[];
}

const load = () => import(/* @vite-ignore */ SCRIPT) as Promise<DeployIos>;

const device = (udid: string, reality: string | undefined, tunnelState: string) => ({
  deviceProperties: { name: udid },
  hardwareProperties: { udid, reality },
  connectionProperties: { tunnelState },
});

describe('deploy-ios', () => {
  it('lets xcodebuild mint profiles and register new devices', async () => {
    const { xcodebuildArgs } = await load();
    const args = xcodebuildArgs('ABC');
    expect(args).toContain('-allowProvisioningUpdates');
    expect(args).toContain('-allowProvisioningDeviceRegistration');
    expect(args).toContain('id=ABC');
  });

  it('is what the deploy command runs', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['deploy:ios']).toContain('scripts/deploy-ios.mjs');
  });

  it('counts only physical devices that are present', async () => {
    const { connectedDevices } = await load();
    const found = connectedDevices([
      device('here', 'physical', 'disconnected'),
      device('paired-but-absent', undefined, 'unavailable'),
      device('simulator', 'simulated', 'disconnected'),
    ]);
    expect(found.map((d) => d.udid)).toEqual(['here']);
  });

  it('never guesses between several devices', async () => {
    const { pickDevice } = await load();
    const a = { udid: 'a', name: 'A' };
    const b = { udid: 'b', name: 'B' };
    expect(pickDevice([a]).device).toBe(a);
    expect(pickDevice([a, b]).device).toBeUndefined();
    expect(pickDevice([a, b]).error).toContain('--device');
    expect(pickDevice([a, b], 'b').device).toBe(b);
    expect(pickDevice([a], 'b').error).toContain('not connected');
    expect(pickDevice([]).error).toContain('--sim');
  });
});
