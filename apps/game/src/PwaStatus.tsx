import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { texts } from './texts.ts';

const OFFLINE_READY_DURATION_MS = 4000;

/** Registers the service worker and tells the player about offline mode and updates. */
export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), OFFLINE_READY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (needRefresh) {
    return (
      <div className="pwa-banner" role="status">
        <span>{texts.pwa.updateAvailable}</span>
        <button
          type="button"
          className="button primary"
          onClick={() => void updateServiceWorker(true)}
        >
          {texts.pwa.reload}
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="pwa-banner" role="status">
        {texts.pwa.offlineReady}
      </div>
    );
  }
  return null;
}
