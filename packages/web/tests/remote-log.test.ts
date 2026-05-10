// @vitest-environment happy-dom
//
// Tests for packages/web/src/remote-log.ts.
//
// Covers:
//   • isRemoteLogEnabled: localStorage override (1/0), HTTPS + LAN
//     hostname matrix (localhost / 127.0.0.1 / 192.168.x / 10.x),
//     storage.getItem throws (private mode) → defaults to host check.
//   • createRemoteLog: disabled → no-op send; enabled → POSTs to /log
//     with text/plain body; serializes objects via JSON.stringify;
//     backpressure cap drops messages once pending reaches maxPending.
//   • Sequential queue ordering — second send waits for first fetch
//     to settle (assert via promise resolution order).
//   • installConsoleForwarding: idempotent (second call no-ops),
//     console.log + console.error wrapped, window.onerror fires
//     remoteLog with [FATAL] prefix.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRemoteLog,
  installConsoleForwarding,
  isRemoteLogEnabled,
  type RemoteLog,
  type RemoteLogDeps,
} from '../src/remote-log';

function fakeStorage(items: Record<string, string | null> = {}) {
  return {
    getItem: vi.fn((k: string) => (items[k] ?? null) as string | null),
  };
}

function fakeLocation(protocol: string, hostname: string) {
  return { protocol, hostname };
}

beforeEach(() => {
  // Wipe the marker the forwarding installer sets on console so tests
  // don't poison each other.
  delete (console as unknown as { __pianoVizRemoteLogInstalled?: boolean })
    .__pianoVizRemoteLogInstalled;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── isRemoteLogEnabled ────────────────────────────────────────────

describe('isRemoteLogEnabled', () => {
  it('forceEnabled=true short-circuits everything', () => {
    expect(isRemoteLogEnabled({ forceEnabled: true })).toBe(true);
  });

  it('forceEnabled=false short-circuits everything', () => {
    expect(isRemoteLogEnabled({ forceEnabled: false })).toBe(false);
  });

  it('storage override "1" wins over the host check', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage({ pianoViz_remoteLog: '1' }),
        location: fakeLocation('https:', 'github.io'), // would normally be off
      })
    ).toBe(true);
  });

  it('storage override "0" wins over the host check', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage({ pianoViz_remoteLog: '0' }),
        location: fakeLocation('https:', 'localhost'), // would normally be on
      })
    ).toBe(false);
  });

  it('localhost over HTTPS → enabled', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage(),
        location: fakeLocation('https:', 'localhost'),
      })
    ).toBe(true);
  });

  it('127.0.0.1 over HTTPS → enabled', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage(),
        location: fakeLocation('https:', '127.0.0.1'),
      })
    ).toBe(true);
  });

  it('192.168.x.x over HTTPS → enabled', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage(),
        location: fakeLocation('https:', '192.168.1.42'),
      })
    ).toBe(true);
  });

  it('10.x.x.x over HTTPS → enabled', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage(),
        location: fakeLocation('https:', '10.0.0.5'),
      })
    ).toBe(true);
  });

  it('public hostname (github.io) → disabled', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage(),
        location: fakeLocation('https:', 'atariryuma.github.io'),
      })
    ).toBe(false);
  });

  it('http (not https) on LAN → disabled', () => {
    expect(
      isRemoteLogEnabled({
        storage: fakeStorage(),
        location: fakeLocation('http:', '192.168.1.42'),
      })
    ).toBe(false);
  });

  it('storage.getItem throwing falls through to host check', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError: localStorage unavailable');
      }),
    };
    expect(
      isRemoteLogEnabled({
        storage,
        location: fakeLocation('https:', 'localhost'),
      })
    ).toBe(true);
  });
});

// ─── createRemoteLog ───────────────────────────────────────────────

describe('createRemoteLog — disabled path', () => {
  it('returns enabled=false + no-op send', () => {
    const rl = createRemoteLog({ forceEnabled: false });
    expect(rl.enabled).toBe(false);
    expect(() => rl.send('msg')).not.toThrow();
  });

  it('does not call fetch when disabled', () => {
    const fetchSpy = vi.fn();
    const rl = createRemoteLog({ forceEnabled: false, fetch: fetchSpy });
    rl.send('msg');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('createRemoteLog — enabled path', () => {
  function makeFx(over: Partial<RemoteLogDeps> = {}): {
    rl: RemoteLog;
    fetchSpy: ReturnType<typeof vi.fn>;
  } {
    const fetchSpy = vi.fn(async () => new Response('ok'));
    const rl = createRemoteLog({
      forceEnabled: true,
      fetch: fetchSpy as unknown as typeof fetch,
      ...over,
    });
    return { rl, fetchSpy };
  }

  it('POSTs to /log with text/plain', async () => {
    const fx = makeFx();
    fx.rl.send('hello');
    // Drain the chain.
    await new Promise((r) => setTimeout(r, 0));
    expect(fx.fetchSpy).toHaveBeenCalledOnce();
    expect(fx.fetchSpy.mock.calls[0][0]).toBe('/log');
    const opts = fx.fetchSpy.mock.calls[0][1];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('text/plain');
    expect(opts.body).toBe('hello');
  });

  it('serializes objects via JSON.stringify', async () => {
    const fx = makeFx();
    fx.rl.send({ a: 1, b: 'x' });
    await new Promise((r) => setTimeout(r, 0));
    expect(fx.fetchSpy.mock.calls[0][1].body).toBe('{"a":1,"b":"x"}');
  });

  it('respects custom endpointUrl', async () => {
    const fx = makeFx({ endpointUrl: '/api/diag' });
    fx.rl.send('m');
    await new Promise((r) => setTimeout(r, 0));
    expect(fx.fetchSpy.mock.calls[0][0]).toBe('/api/diag');
  });

  it('drops messages once pending reaches maxPending', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok'));
    const rl = createRemoteLog({
      forceEnabled: true,
      fetch: fetchSpy as unknown as typeof fetch,
      maxPending: 3,
    });
    // Send 10 messages — only the first 3 should enter the queue.
    for (let i = 0; i < 10; i++) rl.send('m' + i);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.map((call) => call[1].body)).toEqual(['m0', 'm1', 'm2']);
  });

  it('survives fetch rejection (catch swallows)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('LAN down'));
    const rl = createRemoteLog({
      forceEnabled: true,
      fetch: fetchSpy as unknown as typeof fetch,
    });
    rl.send('m1');
    rl.send('m2');
    // Wait for the chain to finish all the rejections.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // Both should have been attempted; neither should have thrown
    // (catches swallow + finally decrements pending).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('preserves order across sends (sequential chain)', async () => {
    // Fake timers make this deterministic under parallel test-worker CPU
    // load — real 1ms setTimeout delays can exceed a fixed wait budget
    // when 65 test files share worker threads.
    vi.useFakeTimers();
    const order: string[] = [];
    const fetchSpy = vi.fn(async (_url, opts) => {
      // Simulate variable network delay so a parallel impl would
      // shuffle the order.
      await new Promise((r) => setTimeout(r, 1));
      order.push((opts as { body: string }).body);
      return new Response('ok');
    });
    const rl = createRemoteLog({
      forceEnabled: true,
      fetch: fetchSpy as unknown as typeof fetch,
    });
    rl.send('first');
    rl.send('second');
    rl.send('third');
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('returns no-op send when fetch is unavailable', () => {
    // Force enabled but feed an undefined fetch (simulate ancient
    // browser / env without the API).
    const orig = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
    (globalThis as unknown as { fetch?: typeof fetch }).fetch = undefined;
    try {
      const rl = createRemoteLog({ forceEnabled: true });
      expect(rl.enabled).toBe(true);
      expect(() => rl.send('m')).not.toThrow();
    } finally {
      (globalThis as unknown as { fetch?: typeof fetch }).fetch = orig;
    }
  });
});

// ─── installConsoleForwarding ──────────────────────────────────────

describe('installConsoleForwarding', () => {
  it('idempotent — second install is a no-op', () => {
    const sendSpy = vi.fn();
    const rl: RemoteLog = { enabled: true, send: sendSpy };
    const origLog = console.log;
    installConsoleForwarding(rl);
    const wrappedLog = console.log;
    expect(wrappedLog).not.toBe(origLog);
    installConsoleForwarding(rl); // marker prevents re-wrap
    expect(console.log).toBe(wrappedLog);
  });

  it('disabled rl → install is a no-op', () => {
    const origLog = console.log;
    installConsoleForwarding({ enabled: false, send: () => {} });
    expect(console.log).toBe(origLog);
  });

  it('console.log → calls original AND rl.send', () => {
    const sendSpy = vi.fn();
    const origLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    installConsoleForwarding({ enabled: true, send: sendSpy });
    console.log('hello', 'world');
    expect(origLog).toHaveBeenCalledWith('hello', 'world');
    expect(sendSpy).toHaveBeenCalledWith('hello world');
  });

  it('console.error → prefixed [ERROR]', () => {
    const sendSpy = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installConsoleForwarding({ enabled: true, send: sendSpy });
    console.error('boom', '!');
    expect(sendSpy).toHaveBeenCalledWith('[ERROR] boom !');
  });

  it('window.onerror → prefixed [FATAL] with line number', () => {
    const sendSpy = vi.fn();
    installConsoleForwarding({ enabled: true, send: sendSpy });
    window.onerror?.('Uncaught', 'app.js', 42, 0, undefined);
    expect(sendSpy).toHaveBeenCalledWith('[FATAL] Uncaught (42)');
  });
});
