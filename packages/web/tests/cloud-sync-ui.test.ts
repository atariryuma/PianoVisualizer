// @vitest-environment happy-dom
//
// Tests for packages/web/src/cloud-sync-ui.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DELETE_ARM_MS, createCloudSyncUi, type CloudSyncUiDom } from '../src/cloud-sync-ui';
import type { CloudSync, SyncStatus } from '../src/cloud-sync';

function setup(status: Partial<SyncStatus> = {}, available = true) {
  const dom = Object.fromEntries(
    [
      'cloudConnectBtn',
      'cloudSyncNowBtn',
      'cloudDisconnectBtn',
      'cloudDeleteBtn',
      'cloudStatus',
    ].map((k) => [k, document.createElement(k === 'cloudStatus' ? 'div' : 'button')])
  ) as unknown as Record<keyof CloudSyncUiDom, HTMLElement>;
  let current: SyncStatus = { state: 'off', providerId: null, lastSyncAt: null, ...status };
  const sync = {
    connect: vi.fn(async () => false),
    disconnect: vi.fn(async () => undefined),
    deleteCloudData: vi.fn(async () => undefined),
    syncNow: vi.fn(async () => undefined),
    getStatus: () => current,
  } as unknown as CloudSync;
  const reload = vi.fn();
  const ui = createCloudSyncUi({
    dom,
    sync,
    available,
    reload,
    t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k),
    formatTime: () => 'T',
  });
  return {
    dom,
    sync,
    ui,
    reload,
    set: (s: Partial<SyncStatus>) => (current = { ...current, ...s }),
  };
}
const visible = (el: HTMLElement) => el.style.display !== 'none';
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createCloudSyncUi', () => {
  it('when off, offers only connect and says nothing leaves the device', () => {
    const { dom } = setup();
    expect(visible(dom.cloudConnectBtn)).toBe(true);
    expect(visible(dom.cloudSyncNowBtn)).toBe(false);
    expect(visible(dom.cloudDisconnectBtn)).toBe(false);
    expect(visible(dom.cloudDeleteBtn)).toBe(false);
    expect(dom.cloudStatus.textContent).toBe('cloudStatusOff');
  });

  it('hides connect and says so where no provider exists', () => {
    const { dom } = setup({}, false);
    expect(visible(dom.cloudConnectBtn)).toBe(false);
    expect(dom.cloudStatus.textContent).toBe('cloudUnavailable');
  });

  it('shows the last sync time, which is how the player knows the data is safe', () => {
    const { dom } = setup({ state: 'idle', providerId: 'google', lastSyncAt: 5 });
    expect(dom.cloudStatus.textContent).toBe('cloudStatusSyncedFmt:{"time":"T"}');
    expect(visible(dom.cloudConnectBtn)).toBe(false);
    expect(visible(dom.cloudSyncNowBtn)).toBe(true);
  });

  it('offers sign-in again when the session expired', () => {
    const { dom } = setup({ state: 'needs-auth', providerId: 'google' });
    expect(dom.cloudConnectBtn.textContent).toBe('cloudReconnect');
    expect(visible(dom.cloudConnectBtn)).toBe(true);
    expect(visible(dom.cloudSyncNowBtn)).toBe(false);
    expect(dom.cloudStatus.classList.contains('error')).toBe(true);
  });

  it('reloads after connecting only if data arrived', async () => {
    const a = setup();
    a.dom.cloudConnectBtn.click();
    await flush();
    expect(a.sync.connect).toHaveBeenCalledWith('google');
    expect(a.reload).not.toHaveBeenCalled();
    const b = setup();
    (b.sync.connect as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    b.dom.cloudConnectBtn.click();
    await flush();
    expect(b.reload).toHaveBeenCalled();
  });

  it('reports a failed connect', async () => {
    const { dom, sync } = setup();
    (sync.connect as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('cancelled'));
    dom.cloudConnectBtn.click();
    await flush();
    expect(dom.cloudStatus.textContent).toBe('cloudConnectFailed');
    expect(dom.cloudStatus.classList.contains('error')).toBe(true);
  });

  it('needs two taps to delete, and disarms by itself', async () => {
    const { dom, sync } = setup({ state: 'idle', providerId: 'google' });
    dom.cloudDeleteBtn.click();
    expect(sync.deleteCloudData).not.toHaveBeenCalled();
    expect(dom.cloudDeleteBtn.textContent).toContain('cloudDeleteConfirm');
    await vi.advanceTimersByTimeAsync(DELETE_ARM_MS);
    expect(dom.cloudDeleteBtn.textContent).not.toContain('cloudDeleteConfirm');
    dom.cloudDeleteBtn.click();
    expect(sync.deleteCloudData).not.toHaveBeenCalled();
    dom.cloudDeleteBtn.click();
    await flush();
    expect(sync.deleteCloudData).toHaveBeenCalledTimes(1);
  });

  it('reports a failed delete instead of implying the data is gone', async () => {
    const { dom, sync } = setup({ state: 'idle', providerId: 'google' });
    (sync.deleteCloudData as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    dom.cloudDeleteBtn.click();
    dom.cloudDeleteBtn.click();
    await flush();
    expect(dom.cloudStatus.textContent).toBe('cloudDeleteFailed');
  });
});
