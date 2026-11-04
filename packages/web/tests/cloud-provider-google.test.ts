// @vitest-environment happy-dom
// Tests for packages/web/src/cloud-provider-google.ts against a fake Drive.

import { describe, it, expect, vi } from 'vitest';
import {
  DRIVE_FILE_NAME,
  createGoogleDriveProvider,
  createGoogleProviderForPlatform,
  type DriveRequest,
  type DriveResponse,
  type DriveTransport,
} from '../src/cloud-provider-google';
import { CloudAuthError, type CloudDoc } from '../src/cloud-sync';

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
