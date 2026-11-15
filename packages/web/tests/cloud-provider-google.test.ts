// @vitest-environment happy-dom
// Tests for packages/web/src/cloud-provider-google.ts against a fake Drive.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DRIVE_FILE_NAME,
  createGoogleDriveProvider,
  createGoogleProviderForPlatform,
  createWebTransport,
  type DriveRequest,
  type DriveResponse,
  type DriveTransport,
} from '../src/cloud-provider-google';
import { CloudAuthError, createCloudSync, type CloudDoc } from '../src/cloud-sync';
import {
  GOOGLE_CLIENT_ID_IOS,
  GOOGLE_CLIENT_ID_WEB,
  GOOGLE_DRIVE_SCOPE,
} from '../src/cloud-config';
import { defaultPracticeProgress, defaultSongProgress } from '@piano/core';
import type { PrefsShape } from '../src/prefs-storage';

const DOC = {
  app: 'piano-visualizer',
  kind: 'cloud-sync',
  version: 1,
  updatedAt: 1,
  progress: null,
  minutesLedger: {},
  prefs: { values: {}, updatedAt: 0 },
} as CloudDoc;

class FakeDrive implements DriveTransport {
  files = new Map<string, string>();
  requests: DriveRequest[] = [];
  next = 1;
  override: ((r: DriveRequest) => DriveResponse | null) | null = null;
  signIn = vi.fn(async () => undefined);
  signOut = vi.fn(async () => undefined);

  async request(r: DriveRequest): Promise<DriveResponse> {
    this.requests.push(r);
    const forced = this.override?.(r);
    if (forced) return forced;
    const id = /files\/([^?]+)/.exec(r.path)?.[1];
    if (r.method === 'GET' && !id) {
      return {
        status: 200,
        body: JSON.stringify({ files: [...this.files.keys()].map((k) => ({ id: k })) }),
      };
    }
    if (r.method === 'POST') {
      const newId = 'f' + this.next++;
      const parts = (r.body ?? '').split('\r\n\r\n');
      this.files.set(newId, parts[parts.length - 1].split('\r\n--')[0]);
      return { status: 200, body: JSON.stringify({ id: newId }) };
    }
    if (!id || !this.files.has(id)) return { status: 404, body: '' };
    if (r.method === 'GET') return { status: 200, body: this.files.get(id)! };
    if (r.method === 'PATCH') {
      this.files.set(id, r.body ?? '');
      return { status: 200, body: '{}' };
    }
    this.files.delete(id);
    return { status: 204, body: '' };
  }
}

describe('createGoogleDriveProvider', () => {
  it('reads null before anything exists, and looks only in appDataFolder', async () => {
    const drive = new FakeDrive();
    await expect(createGoogleDriveProvider(drive).read()).resolves.toBeNull();
    const path = drive.requests[0].path;
    expect(path).toContain('spaces=appDataFolder');
    expect(decodeURIComponent(path)).toContain(`name='${DRIVE_FILE_NAME}'`);
  });

  it('creates the file inside appDataFolder, then updates that same file', async () => {
    const drive = new FakeDrive();
    const p = createGoogleDriveProvider(drive);
    await p.read();
    await p.write(DOC);
    expect(drive.requests.at(-1)?.body).toContain('"parents":["appDataFolder"]');
    await expect(p.read()).resolves.toEqual(DOC);
    await p.write({ ...DOC, updatedAt: 2 });
    expect(drive.files.size).toBe(1);
    expect(drive.requests.at(-1)?.method).toBe('PATCH');
    expect(JSON.parse(drive.files.get('f1')!).updatedAt).toBe(2);
  });

  it('recreates the file when it vanished between read and write', async () => {
    const drive = new FakeDrive();
    const p = createGoogleDriveProvider(drive);
    await p.write(DOC);
    await p.read();
    drive.files.clear();
    await p.write(DOC);
    expect(drive.files.size).toBe(1);
  });

  it('converges on the first listed file when two devices both created one', async () => {
    const drive = new FakeDrive();
    drive.files.set('oldest', JSON.stringify({ ...DOC, updatedAt: 111 }));
    drive.files.set('newer', JSON.stringify({ ...DOC, updatedAt: 222 }));
    const p = createGoogleDriveProvider(drive);
    await expect(p.read()).resolves.toMatchObject({ updatedAt: 111 });
    expect(drive.requests[0].path).toContain('orderBy=createdTime');
  });

  it('deletes every copy', async () => {
    const drive = new FakeDrive();
    drive.files.set('a', '{}');
    drive.files.set('b', '{}');
    await createGoogleDriveProvider(drive).deleteRemote();
    expect(drive.files.size).toBe(0);
  });

  it('maps 401 and a missing Drive permission to "sign in again"', async () => {
    const drive = new FakeDrive();
    const p = createGoogleDriveProvider(drive);
    drive.override = () => ({ status: 401, body: '' });
    await expect(p.read()).rejects.toBeInstanceOf(CloudAuthError);
    drive.override = () => ({ status: 403, body: '{"error":{"message":"insufficient scopes"}}' });
    await expect(p.read()).rejects.toBeInstanceOf(CloudAuthError);
  });

  it('treats a rate limit as a retryable failure, not a sign-in problem', async () => {
    const drive = new FakeDrive();
    drive.override = () => ({ status: 403, body: '{"error":{"message":"rateLimitExceeded"}}' });
    const err = await createGoogleDriveProvider(drive)
      .read()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CloudAuthError);
  });

  it('hands unparseable content to the engine rather than throwing it away', async () => {
    const drive = new FakeDrive();
    drive.files.set('a', 'not json');
    await expect(createGoogleDriveProvider(drive).read()).resolves.toEqual({ unreadable: true });
  });

  it('signs out on disconnect', async () => {
    const drive = new FakeDrive();
    await createGoogleDriveProvider(drive).disconnect();
    expect(drive.signOut).toHaveBeenCalled();
  });
});

describe('createGoogleProviderForPlatform', () => {
  const ids = { ios: 'ios-id', web: 'web-id' };
  const plugin = {
    googleSignIn: vi.fn(async () => undefined),
    googleSignOut: vi.fn(async () => undefined),
    googleDriveRequest: vi.fn(async () => ({ status: 200, body: '{"files":[]}' })),
  };

  it('ships a separate Web client in the same Google project as iOS', () => {
    expect(GOOGLE_CLIENT_ID_WEB).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
    expect(GOOGLE_CLIENT_ID_WEB).not.toBe(GOOGLE_CLIENT_ID_IOS);
    expect(GOOGLE_CLIENT_ID_WEB.split('-')[0]).toBe(GOOGLE_CLIENT_ID_IOS.split('-')[0]);
    expect(createGoogleProviderForPlatform(undefined)).not.toBeNull();
  });

  it('is unavailable without a client ID, so the option stays hidden', () => {
    expect(createGoogleProviderForPlatform(undefined, { ios: '', web: '' })).toBeNull();
    expect(
      createGoogleProviderForPlatform(
        { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { PianoMidi: plugin } },
        { ios: '', web: 'web-id' }
      )
    ).toBeNull();
  });

  it('is unavailable on Android, which has no sign-in bridge', () => {
    expect(
      createGoogleProviderForPlatform(
        { isNativePlatform: () => true, getPlatform: () => 'android' },
        ids
      )
    ).toBeNull();
  });

  it('routes iOS through the native plugin with the iOS client ID', async () => {
    const p = createGoogleProviderForPlatform(
      { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { PianoMidi: plugin } },
      ids
    );
    await p?.connect();
    expect(plugin.googleSignIn).toHaveBeenCalledWith({ clientId: 'ios-id' });
    await p?.read();
    expect(plugin.googleDriveRequest.mock.calls[0][0 as never]).toMatchObject({
      clientId: 'ios-id',
    });
  });

  it('does not load the Google script until the player connects', () => {
    const before = document.querySelectorAll('script').length;
    expect(createGoogleProviderForPlatform(undefined, ids)).not.toBeNull();
    expect(document.querySelectorAll('script').length).toBe(before);
  });

  it('reports "sign in again" on the web after a reload (no token in memory)', async () => {
    const p = createGoogleProviderForPlatform(undefined, ids);
    await expect(p?.read()).rejects.toBeInstanceOf(CloudAuthError);
  });
});

describe('Web Google authorization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function google(response: Record<string, unknown>, popupError?: string) {
    const requestAccessToken = vi.fn();
    const revoke = vi.fn();
    const initTokenClient = vi.fn((options) => {
      requestAccessToken.mockImplementation(() => {
        if (popupError) options.error_callback({ type: popupError });
        else options.callback(response);
      });
      return { requestAccessToken };
    });
    vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient, revoke } } });
    return { initTokenClient, requestAccessToken, revoke };
  }

  const grant = {
    access_token: 'test-token',
    expires_in: '3600',
    scope: GOOGLE_DRIVE_SCOPE,
  };

  it('uses the Web client and app-data scope, sends the memory token, then clears it', async () => {
    const gis = google(grant);
    const fetchMock = vi.fn(async () => new Response('{"files":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const transport = createWebTransport('web-client');
    const provider = createGoogleDriveProvider(transport);
    await provider.connect();
    expect(gis.initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'web-client', scope: GOOGLE_DRIVE_SCOPE })
    );
    expect(gis.requestAccessToken).toHaveBeenCalledOnce();
    await expect(provider.read()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
    );
    await provider.disconnect();
    expect(gis.revoke).toHaveBeenCalledWith('test-token');
    await expect(provider.read()).rejects.toBeInstanceOf(CloudAuthError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requires interactive sign-in again when the token expires', async () => {
    google(grant);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = createGoogleDriveProvider(createWebTransport('web-client'));
    await provider.connect();
    clock.mockReturnValue(1000 + 3540 * 1000);
    await expect(provider.read()).rejects.toBeInstanceOf(CloudAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('merges iOS and Web records through their transports into the same Drive file', async () => {
    google(grant);
    const drive = new FakeDrive();
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const res = await drive.request({
        method: init.method as DriveRequest['method'],
        path: url.replace('https://www.googleapis.com', ''),
        body: init.body as string | undefined,
      });
      return new Response(res.status === 204 ? null : res.body, { status: res.status });
    });
    const native = createGoogleProviderForPlatform(
      {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
        Plugins: {
          PianoMidi: {
            googleSignIn: drive.signIn,
            googleSignOut: drive.signOut,
            googleDriveRequest: (req: DriveRequest) => drive.request(req),
          },
        },
      },
      { ios: 'ios-client', web: 'web-client' }
    )!;
    const web = createGoogleProviderForPlatform(undefined, {
      ios: 'ios-client',
      web: 'web-client',
    })!;
    function device(provider: typeof web, id: string, stars: number, prefs: PrefsShape) {
      const progress = defaultPracticeProgress();
      progress.songs.s = defaultSongProgress();
      progress.songs.s.sections.A1 = { stars, bestPct: stars * 30 };
      const disk = new Map<string, unknown>();
      const sync = createCloudSync({
        providers: { google: provider },
        store: {
          loadJSON: <T>(key: string, fallback: T): T => (disk.get(key) as T) ?? fallback,
          saveJSON: (key, value) => {
            disk.set(key, value);
            return true;
          },
        },
        getProgress: () => progress,
        applyProgress: (p) => Object.assign(progress, p),
        getPrefs: () => prefs,
        applyPrefs: (p) => Object.assign(prefs, p),
        isBusy: () => false,
        randomId: () => id,
        now: () => 1000,
      });
      return { sync, progress, prefs };
    }
    const ios = device(native, 'ios', 2, { lang: 'jp', inputSource: 'mic' });
    const browser = device(web, 'web', 1, { inputSource: 'midi' });
    await ios.sync.connect('google');
    await browser.sync.connect('google');
    expect(browser.progress.songs.s.sections.A1.stars).toBe(2);
    expect(browser.prefs).toMatchObject({ lang: 'jp', inputSource: 'midi' });
    browser.progress.songs.s.sections.A1 = { stars: 3, bestPct: 100 };
    await browser.sync.syncNow();
    await ios.sync.syncNow();
    expect(ios.progress.songs.s.sections.A1.stars).toBe(3);
    expect(ios.prefs.inputSource).toBe('mic');
    expect(drive.files.size).toBe(1);
  });

  it.each([
    [{ error: 'access_denied' }, undefined, 'access_denied'],
    [{ ...grant, scope: 'openid' }, undefined, 'scope-denied'],
    [{ ...grant, expires_in: undefined }, undefined, 'invalid token lifetime'],
    [{ ...grant, expires_in: 'invalid' }, undefined, 'invalid token lifetime'],
    [{ ...grant, expires_in: 30 }, undefined, 'invalid token lifetime'],
    [grant, 'popup_closed', 'popup_closed'],
    [grant, 'popup_failed_to_open', 'popup_failed_to_open'],
  ])('rejects a failed or unusable grant without calling Drive (%j)', async (r, error, message) => {
    google(r, error);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = createGoogleDriveProvider(createWebTransport('web-client'));
    await expect(provider.connect()).rejects.toThrow(message);
    await expect(provider.read()).rejects.toBeInstanceOf(CloudAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
