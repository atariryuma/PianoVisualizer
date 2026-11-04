// Apps built with the iOS 27 SDK do not launch without the UIScene life cycle.
// The build still succeeds and an iOS 26 device still runs the app, so nothing
// else fails until someone opens it on iOS 27.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const IOS = join(__dirname, '..', '..', 'mobile', 'ios', 'App');

describe('native iOS scene life cycle', () => {
  const plist = readFileSync(join(IOS, 'App', 'Info.plist'), 'utf8');

  it('declares a single-window scene backed by the main storyboard', () => {
    expect(plist).toContain('<key>UIApplicationSceneManifest</key>');
    expect(plist).toMatch(/UIApplicationSupportsMultipleScenes<\/key>\s*<false\/>/);
    expect(plist).toContain('<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>');
    expect(plist).toMatch(/UISceneStoryboardFile<\/key>\s*<string>Main<\/string>/);
  });

  it('compiles the delegate the manifest names into the App target', () => {
    expect(existsSync(join(IOS, 'App', 'SceneDelegate.swift'))).toBe(true);
    const pbx = readFileSync(join(IOS, 'App.xcodeproj', 'project.pbxproj'), 'utf8');
    const sources = /isa = PBXSourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/.exec(pbx)?.[1];
    expect(sources).toContain('SceneDelegate.swift in Sources');
  });
});
