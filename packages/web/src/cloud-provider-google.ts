// Google Drive provider for cloud sync: one JSON file in the app's private
// appDataFolder in the player's own Drive. Other apps cannot see that folder, the
// player cannot accidentally edit it, and this app can see nothing else.
//
// Two transports, one provider. On iOS, sign-in and HTTP run natively so tokens
// never enter the WebView (GoogleDriveBridge.swift). On the web, Google Identity
// Services issues a short-lived token kept in memory. Its script is only fetched
// when the player presses connect: no network before that.

import { CloudAuthError, type CloudDoc, type CloudProvider } from './cloud-sync';
import { GOOGLE_CLIENT_ID_IOS, GOOGLE_CLIENT_ID_WEB, GOOGLE_DRIVE_SCOPE } from './cloud-config';

export const DRIVE_FILE_NAME = 'piano-visualizer-sync.json';

export interface DriveRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path + query on www.googleapis.com. */
  path: string;
  contentType?: string;
  body?: string;
}

export interface DriveResponse {
  status: number;
  body: string;
}

export interface DriveTransport {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  request(req: DriveRequest): Promise<DriveResponse>;
}

export function createGoogleDriveProvider(transport: DriveTransport): CloudProvider {
  let fileId: string | null = null;

  async function call(req: DriveRequest): Promise<DriveResponse> {
    const res = await transport.request(req);
    if (res.status === 401) throw new CloudAuthError('Google sign-in expired');
    // A 403 for scope is a player who unticked the Drive permission, or revoked it.
    // Rate limits are 403 too, and those are worth a plain retry.
    if (res.status === 403 && /insufficient|PERMISSION_DENIED/i.test(res.body)) {
      throw new CloudAuthError('Drive permission not granted');
    }
    return res;
  }

  function expectOk(res: DriveResponse, what: string): void {
    if (res.status < 200 || res.status >= 300) throw new Error(what + ' failed: ' + res.status);
  }

  /** Oldest first. Two devices connecting at once can each create a file, since
   *  Drive allows duplicate names; agreeing on the oldest makes them converge. */
  async function listFiles(): Promise<string[]> {
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const res = await call({
      method: 'GET',
      path:
        '/drive/v3/files?spaces=appDataFolder&orderBy=createdTime&pageSize=20' +
        '&fields=' +
        encodeURIComponent('files(id)') +
        '&q=' +
        q,
    });
    expectOk(res, 'list');
    const parsed = JSON.parse(res.body) as { files?: Array<{ id?: unknown }> };
    return (parsed.files ?? [])
      .map((f) => f.id)
      .filter((id): id is string => typeof id === 'string');
  }

  return {
    id: 'google',
    connect: () => transport.signIn(),
    async disconnect() {
      fileId = null;
      await transport.signOut();
    },
    async read() {
      const ids = await listFiles();
      fileId = ids[0] ?? null;
      if (!fileId) return null;
      const res = await call({
        method: 'GET',
        path: `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      });
      if (res.status === 404) {
        fileId = null;
        return null;
      }
      expectOk(res, 'read');
      try {
        return JSON.parse(res.body) as unknown;
      } catch {
        // Handed to the engine as-is: it reports "corrupt" and refuses to overwrite.
        return { unreadable: true };
      }
    },
    async write(doc: CloudDoc) {
      const json = JSON.stringify(doc);
      if (fileId) {
        const res = await call({
          method: 'PATCH',
          path: `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
          contentType: 'application/json',
          body: json,
        });
        if (res.status !== 404) {
          expectOk(res, 'update');
          return;
        }
        fileId = null;
      }
      const boundary = 'piano_visualizer_sync_boundary';
      const res = await call({
        method: 'POST',
        path: '/upload/drive/v3/files?uploadType=multipart&fields=id',
        contentType: `multipart/related; boundary=${boundary}`,
        body:
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
          JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] }) +
          `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
          json +
          `\r\n--${boundary}--`,
      });
      expectOk(res, 'create');
      fileId = (JSON.parse(res.body) as { id?: string }).id ?? null;
    },
    async deleteRemote() {
      for (const id of await listFiles()) {
        const res = await call({
          method: 'DELETE',
          path: `/drive/v3/files/${encodeURIComponent(id)}`,
        });
        if (res.status !== 404) expectOk(res, 'delete');
      }
      fileId = null;
    },
  };
}

// ── Native (iOS) ─────────────────────────────────────────────────────

export interface NativeGooglePlugin {
  googleSignIn(o: { clientId: string }): Promise<void>;
  googleSignOut(): Promise<void>;
  googleDriveRequest(o: DriveRequest & { clientId: string }): Promise<DriveResponse>;
}

export function createNativeTransport(
  plugin: NativeGooglePlugin,
  clientId: string
): DriveTransport {
  return {
    signIn: () => plugin.googleSignIn({ clientId }),
    signOut: () => plugin.googleSignOut(),
    request: (req) => plugin.googleDriveRequest({ ...req, clientId }),
  };
}

// ── Web ──────────────────────────────────────────────────────────────

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
}
interface GisTokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
}
interface GisGlobal {
  accounts: {
    oauth2: {
      initTokenClient(o: {
        client_id: string;
        scope: string;
        callback: (r: GisTokenResponse) => void;
        error_callback?: (e: { type?: string }) => void;
      }): GisTokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

function loadGis(): Promise<GisGlobal> {
  const existing = (globalThis as { google?: GisGlobal }).google;
  if (existing?.accounts?.oauth2) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT;
    script.async = true;
    script.onload = () => {
      const g = (globalThis as { google?: GisGlobal }).google;
      if (g?.accounts?.oauth2) resolve(g);
      else reject(new Error('Google sign-in did not load'));
    };
    script.onerror = () => reject(new Error('Google sign-in did not load'));
    document.head.appendChild(script);
  });
}

export function createWebTransport(clientId: string): DriveTransport {
  let token: string | null = null;
  let expiresAt = 0;

  return {
    async signIn() {
      const gis = await loadGis();
      await new Promise<void>((resolve, reject) => {
        const client = gis.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPE,
          callback: (r) => {
            if (!r.access_token || r.error) {
              reject(new Error(r.error ?? 'sign-in failed'));
              return;
            }
            if (!(r.scope ?? '').split(' ').includes(GOOGLE_DRIVE_SCOPE)) {
              reject(new Error('scope-denied'));
              return;
            }
            token = r.access_token;
            expiresAt = Date.now() + (Number(r.expires_in) - 60) * 1000;
            resolve();
          },
          error_callback: (e) => reject(new Error(e.type ?? 'sign-in failed')),
        });
        client.requestAccessToken();
      });
    },
    async signOut() {
      const held = token;
      token = null;
      if (held) (globalThis as { google?: GisGlobal }).google?.accounts.oauth2.revoke(held);
    },
    async request(req) {
      // A reload or an expired token needs a player gesture to renew (a popup
      // cannot open unprompted), so report it as "sign in again".
      if (!token || Date.now() >= expiresAt) return { status: 401, body: '' };
      const res = await fetch('https://www.googleapis.com' + req.path, {
        method: req.method,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(req.contentType ? { 'Content-Type': req.contentType } : null),
        },
        body: req.body,
      });
      return { status: res.status, body: await res.text() };
    },
  };
}

// ── Selection ────────────────────────────────────────────────────────

interface CapacitorRef {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
  registerPlugin?: (name: string) => unknown;
}

/** The provider for this platform, or null where none exists: no client ID
 *  configured, or a native platform without the sign-in bridge (Android). */
export function createGoogleProviderForPlatform(
  cap: CapacitorRef | undefined,
  ids: { ios: string; web: string } = { ios: GOOGLE_CLIENT_ID_IOS, web: GOOGLE_CLIENT_ID_WEB }
): CloudProvider | null {
  if (cap?.isNativePlatform?.()) {
    if (cap.getPlatform?.() !== 'ios' || !ids.ios) return null;
    const plugin = (cap.Plugins?.PianoMidi ?? cap.registerPlugin?.('PianoMidi')) as
      | NativeGooglePlugin
      | undefined;
    return plugin ? createGoogleDriveProvider(createNativeTransport(plugin, ids.ios)) : null;
  }
  return ids.web ? createGoogleDriveProvider(createWebTransport(ids.web)) : null;
}
