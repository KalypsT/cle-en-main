/** Injected by vite.config.ts at build time. */
declare const __APP_BUILD__: { number: string | null; date: string; commit: string | null };

/** This version of the game: CI run number (null for a local build), build date, commit. */
export const BUILD = __APP_BUILD__;
