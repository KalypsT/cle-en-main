import { useEffect, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Looks for a new version this often while the game stays open, and when it comes back. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type UpdateCheck = 'idle' | 'checking' | 'upToDate' | 'failed';

interface UpdateState {
  /** A new version is installed and waits for a reload. */
  available: boolean;
  check: UpdateCheck;
}

let state: UpdateState = { available: false, check: 'idle' };
let registration: ServiceWorkerRegistration | null = null;
let apply: (() => Promise<void>) | null = null;
/** Saves the game being played; awaited before the reload that brings the new version. */
let saveBeforeReload: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<UpdateState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Asks the server for a new version; `available` turns true when one is installed. */
export async function checkForUpdate(): Promise<void> {
  if (!registration) {
    set({ check: 'failed' });
    return;
  }
  set({ check: 'checking' });
  try {
    await registration.update();
    const found = registration.installing !== null || registration.waiting !== null;
    set({ check: found || state.available ? 'idle' : 'upToDate' });
  } catch {
    set({ check: 'failed' });
  }
}

/**
 * Reloads the page on the new version, once the game being played is saved: the save
 * made as the page is left (pagehide) does not reach IndexedDB before a reload.
 */
export function applyUpdate(): void {
  void (async () => {
    try {
      await saveBeforeReload?.();
    } finally {
      await apply?.();
    }
  })();
}

/** Registers the save of the game being played before an update; returns its removal. */
export function saveBeforeUpdate(save: () => Promise<void>): () => void {
  saveBeforeReload = save;
  return () => {
    if (saveBeforeReload === save) saveBeforeReload = null;
  };
}

export function useUpdates(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

/**
 * Registers the service worker once for the whole app, and looks for a new version every
 * hour and each time the app comes back to the foreground.
 */
export function useServiceWorker() {
  const {
    offlineReady,
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, found) => {
      registration = found ?? null;
    },
  });
  useEffect(() => {
    apply = () => updateServiceWorker(true);
  }, [updateServiceWorker]);
  useEffect(() => set({ available: needRefresh }), [needRefresh]);
  useEffect(() => {
    const timer = setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return { offlineReady };
}
