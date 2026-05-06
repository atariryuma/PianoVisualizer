// Tests for packages/web/src/wakelock.ts.
//
// The module is a thin wrapper over `navigator.wakeLock.request()`. We
// stub navigator.wakeLock per-test rather than relying on a DOM env —
// the API surface is small enough that the stub is shorter than a
// jsdom config.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestWakeLock, releaseWakeLock, isWakeLockActive } from '../src/wakelock';

// Hold the original navigator so we can restore between tests.
const origNavigator = globalThis.navigator;

interface FakeSentinel {
  release: ReturnType<typeof vi.fn>;
  addEventListener: (event: string, handler: () => void) => void;
  _listeners: Map<string, () => void>;
}

function makeFakeSentinel(): FakeSentinel {
  const listeners = new Map<string, () => void>();
  return {
    release: vi.fn(() => Promise.resolve()),
    addEventListener: (event, handler) => listeners.set(event, handler),
    _listeners: listeners,
  };
}

beforeEach(async () => {
  // Make sure each test starts from a clean "no lock held" state.
  // releaseWakeLock no-ops cleanly when there's no prior lock.
  releaseWakeLock();
});

afterEach(() => {
  // Restore the original navigator.
  Object.defineProperty(globalThis, 'navigator', {
    value: origNavigator,
    configurable: true,
    writable: true,
  });
});

describe('requestWakeLock', () => {
  it('no-ops gracefully when navigator.wakeLock is unsupported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {}, // no wakeLock property
      configurable: true,
      writable: true,
    });
    await expect(requestWakeLock()).resolves.toBeUndefined();
    expect(isWakeLockActive()).toBe(false);
  });

  it('acquires the sentinel and marks the lock active', async () => {
    const sentinel = makeFakeSentinel();
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: vi.fn(() => Promise.resolve(sentinel)) } },
      configurable: true,
      writable: true,
    });
    await requestWakeLock();
    expect(isWakeLockActive()).toBe(true);
  });

  it('passes "screen" as the wake-lock kind (the only one currently supported)', async () => {
    const requestSpy = vi.fn(() => Promise.resolve(makeFakeSentinel()));
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: requestSpy } },
      configurable: true,
      writable: true,
    });
    await requestWakeLock();
    expect(requestSpy).toHaveBeenCalledWith('screen');
  });

  it('is idempotent — second call while a lock is held does not re-request', async () => {
    const requestSpy = vi.fn(() => Promise.resolve(makeFakeSentinel()));
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: requestSpy } },
      configurable: true,
      writable: true,
    });
    await requestWakeLock();
    await requestWakeLock();
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the active flag when the browser fires the release event', async () => {
    const sentinel = makeFakeSentinel();
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: vi.fn(() => Promise.resolve(sentinel)) } },
      configurable: true,
      writable: true,
    });
    await requestWakeLock();
    expect(isWakeLockActive()).toBe(true);
    // Browser auto-released — fire the listener the module installed.
    sentinel._listeners.get('release')?.();
    expect(isWakeLockActive()).toBe(false);
  });

  it('swallows request rejections (older Safari, embedded WebViews)', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: vi.fn(() => Promise.reject(new Error('not supported'))) },
      },
      configurable: true,
      writable: true,
    });
    // Should NOT throw — practice mode keeps working without the lock.
    await expect(requestWakeLock()).resolves.toBeUndefined();
    expect(isWakeLockActive()).toBe(false);
  });
});

describe('releaseWakeLock', () => {
  it('is a safe no-op when no lock is held', () => {
    expect(() => releaseWakeLock()).not.toThrow();
    expect(isWakeLockActive()).toBe(false);
  });

  it('calls sentinel.release() and clears the active flag', async () => {
    const sentinel = makeFakeSentinel();
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: vi.fn(() => Promise.resolve(sentinel)) } },
      configurable: true,
      writable: true,
    });
    await requestWakeLock();
    expect(isWakeLockActive()).toBe(true);

    releaseWakeLock();
    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(isWakeLockActive()).toBe(false);
  });

  it('survives release() rejecting (sentinel already auto-released by browser)', async () => {
    const sentinel = {
      ...makeFakeSentinel(),
      release: vi.fn(() => Promise.reject(new Error('already released'))),
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: vi.fn(() => Promise.resolve(sentinel)) } },
      configurable: true,
      writable: true,
    });
    await requestWakeLock();
    expect(() => releaseWakeLock()).not.toThrow();
    expect(isWakeLockActive()).toBe(false);
  });
});
