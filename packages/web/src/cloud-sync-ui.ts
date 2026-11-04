// Settings-panel section for cloud sync. Player-initiated only: there is no
// first-run prompt and nothing here nags.
//
// Delete uses two taps, not confirm(): constrained WKWebViews return false from
// confirm() without showing anything (see user-songs-ui.ts wireTwoTapDelete).

import type { CloudSync, SyncStatus } from './cloud-sync';
import { setButtonBusy } from './touch-feedback';

export const DELETE_ARM_MS = 4000;

export interface CloudSyncUiDom {
  cloudConnectBtn: HTMLElement | null;
  cloudSyncNowBtn: HTMLElement | null;
  cloudDisconnectBtn: HTMLElement | null;
  cloudDeleteBtn: HTMLElement | null;
  cloudStatus: HTMLElement | null;
}

export interface CloudSyncUiDeps {
  dom: CloudSyncUiDom;
  sync: CloudSync;
  /** False hides the connect button: no provider exists on this platform. */
  available: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Prefs like language and theme are read once at boot. */
  reload: () => void;
  formatTime?: (ms: number) => string;
}

export interface CloudSyncUi {
  refresh(status?: SyncStatus): void;
}

export function createCloudSyncUi(deps: CloudSyncUiDeps): CloudSyncUi {
  const { dom, sync, t } = deps;
  const formatTime = deps.formatTime ?? ((ms: number) => new Date(ms).toLocaleString());
  let message: string | null = null;
  let armed = false;
  let armTimer: ReturnType<typeof setTimeout> | null = null;

  const show = (el: HTMLElement | null, on: boolean): void => {
    if (el) el.style.display = on ? '' : 'none';
  };

  function statusText(s: SyncStatus): string {
    switch (s.state) {
      case 'off':
        return deps.available ? t('cloudStatusOff') : t('cloudUnavailable');
      case 'syncing':
        return t('cloudStatusSyncing');
      case 'needs-auth':
        return t('cloudStatusNeedsAuth');
      case 'needs-update':
        return t('cloudStatusNeedsUpdate');
      case 'corrupt':
        return t('cloudStatusCorrupt');
      case 'error':
        return t('cloudStatusError');
      case 'idle':
        return s.lastSyncAt
          ? t('cloudStatusSyncedFmt', { time: formatTime(s.lastSyncAt) })
          : t('cloudStatusConnected');
    }
  }

  function disarm(): void {
    armed = false;
    if (armTimer) clearTimeout(armTimer);
    armTimer = null;
    if (dom.cloudDeleteBtn) dom.cloudDeleteBtn.textContent = '🗑 ' + t('cloudDelete');
  }

  function refresh(status: SyncStatus = sync.getStatus()): void {
    const connected = status.providerId !== null;
    const needsSignIn = status.state === 'needs-auth';
    show(dom.cloudConnectBtn, deps.available && (!connected || needsSignIn));
    show(dom.cloudSyncNowBtn, connected && !needsSignIn);
    show(dom.cloudDisconnectBtn, connected);
    show(dom.cloudDeleteBtn, connected);
    if (dom.cloudConnectBtn) {
      dom.cloudConnectBtn.textContent = needsSignIn ? t('cloudReconnect') : t('cloudConnectGoogle');
    }
    if (!armed && dom.cloudDeleteBtn) dom.cloudDeleteBtn.textContent = '🗑 ' + t('cloudDelete');
    if (dom.cloudStatus) {
      dom.cloudStatus.textContent = message ?? statusText(status);
      const failed =
        message !== null ||
        ['error', 'needs-auth', 'needs-update', 'corrupt'].includes(status.state);
      dom.cloudStatus.classList.toggle('error', failed);
    }
  }

  /** Runs one player action, with a busy button and an honest failure message. */
  async function run(btn: HTMLElement | null, failureKey: string, action: () => Promise<void>) {
    message = null;
    setButtonBusy(btn, true);
    try {
      await action();
    } catch (e) {
      console.warn('[CloudSync] action failed:', (e as Error)?.message);
      message = t(failureKey);
    } finally {
      setButtonBusy(btn, false);
      refresh();
    }
  }

  dom.cloudConnectBtn?.addEventListener('click', () => {
    void run(dom.cloudConnectBtn, 'cloudConnectFailed', async () => {
      if (await sync.connect('google')) deps.reload();
    });
  });
  dom.cloudSyncNowBtn?.addEventListener('click', () => {
    void run(dom.cloudSyncNowBtn, 'cloudStatusError', () => sync.syncNow());
  });
  dom.cloudDisconnectBtn?.addEventListener('click', () => {
    void run(dom.cloudDisconnectBtn, 'cloudStatusError', () => sync.disconnect());
  });
  dom.cloudDeleteBtn?.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      if (dom.cloudDeleteBtn) dom.cloudDeleteBtn.textContent = '🗑 ' + t('cloudDeleteConfirm');
      armTimer = setTimeout(disarm, DELETE_ARM_MS);
      return;
    }
    disarm();
    void run(dom.cloudDeleteBtn, 'cloudDeleteFailed', () => sync.deleteCloudData());
  });

  refresh();
  return { refresh };
}
