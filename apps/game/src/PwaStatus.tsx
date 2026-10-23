import { useEffect } from 'react';
import { applyUpdate, useServiceWorker, useUpdates } from './pwa-updates.ts';
import { texts } from './texts.ts';
import { Icon } from './ui/Icon.tsx';

const OFFLINE_READY_DURATION_MS = 4000;
/** The offline note is told once on this device, not at each new version. */
const OFFLINE_TOLD_KEY = 'cle-en-main.offline-told';

function offlineTold(): boolean {
  try {
    return localStorage.getItem(OFFLINE_TOLD_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberOfflineTold(): void {
  try {
    localStorage.setItem(OFFLINE_TOLD_KEY, '1');
  } catch {
    // Storage unavailable: the note may come again, which is harmless.
  }
}

/**
 * Registers the service worker and tells the player about updates, and once,
 * discreetly, that the game works offline.
 */
export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useServiceWorker();
  const { available: needRefresh } = useUpdates();

  useEffect(() => {
    if (!offlineReady) return;
    if (offlineTold()) {
      setOfflineReady(false);
      return;
    }
    rememberOfflineTold();
    const timer = setTimeout(() => setOfflineReady(false), OFFLINE_READY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (needRefresh) {
    return (
      <div className="pwa-banner" role="status">
        <span>{texts.pwa.updateAvailable}</span>
        <button type="button" className="button primary" onClick={applyUpdate}>
          {texts.pwa.reload}
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="pwa-chip" role="status">
        <Icon name="check" size={16} />
        {texts.pwa.offlineReady}
      </div>
    );
  }
  return null;
}
