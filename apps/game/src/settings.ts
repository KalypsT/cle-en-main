/**
 * Preferences of this device (not of the game): kept in localStorage, with
 * defaults when the storage is unavailable.
 */
export interface Settings {
  /** Pause the game when a decision with a short deadline arrives. */
  autoPause: boolean;
}

const KEY = 'cle-en-main.settings';
const DEFAULTS: Settings = { autoPause: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { autoPause: typeof parsed.autoPause === 'boolean' ? parsed.autoPause : true };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private browsing): the setting lasts for the session.
  }
}
