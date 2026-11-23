import { useState } from 'react';
import type { useRegisterSW as UseRegisterSW } from 'virtual:pwa-register/react';

/**
 * Stands for vite-plugin-pwa's register module in the DomoThib build (vite.config.ts):
 * DomoThib Games refuses service workers, so nothing is registered and no update is ever
 * found. The PWA's screens are not shown there anyway (src/domothib/mode.ts).
 */
export const useRegisterSW: typeof UseRegisterSW = () => {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return { needRefresh, offlineReady, updateServiceWorker: async () => undefined };
};
