// The iOS minimum version lives in three native files, and they must agree.
//
// Xcode 27 rejects any deployment target below 15.0, so after an Xcode update
// every device build failed — while the error named only the version, not the
// three places it is written. The Podfile's `IOS_DEPLOYMENT_TARGET` is the
// source of truth; the App target and our own plugin's podspec must match it,
// or one of them silently keeps the old value and the build breaks again.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Lowest deployment target the current Xcode accepts. */
const XCODE_FLOOR = 15.0;

describe('native iOS deployment target', () => {
  const podfile = read('packages/mobile/ios/App/Podfile');
  const declared = /^IOS_DEPLOYMENT_TARGET\s*=\s*'([\d.]+)'/m.exec(podfile)?.[1];

  it('is declared once in the Podfile and used by the platform line', () => {
    expect(declared, 'Podfile must declare IOS_DEPLOYMENT_TARGET').toBeTruthy();
    expect(podfile).toMatch(/^platform :ios, IOS_DEPLOYMENT_TARGET$/m);
    expect(Number(declared)).toBeGreaterThanOrEqual(XCODE_FLOOR);
  });

  it('lifts every pod to it (podspec minimums are what pods build with)', () => {
    expect(podfile).toMatch(/IPHONEOS_DEPLOYMENT_TARGET'\] = IOS_DEPLOYMENT_TARGET/);
  });

  it('the App target matches, in every build configuration', () => {
    const pbx = read('packages/mobile/ios/App/App.xcodeproj/project.pbxproj');
    const values = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values)).toEqual(new Set([declared]));
  });

  it('our own plugin declares the same minimum', () => {
    const spec = read('packages/plugins/capacitor-piano-midi/CapacitorPianoMidi.podspec');
    expect(/s\.ios\.deployment_target\s*=\s*'([\d.]+)'/.exec(spec)?.[1]).toBe(declared);
  });
});
