/**
 * Preferences of this device (not of the game): kept in localStorage, with
 * defaults when the storage is unavailable.
 */
export type ThemeChoice = 'light' | 'dark' | 'auto' | 'system';
export type QualityChoice = 'auto' | 'high' | 'economy';

export interface Volumes {
  /** 0 … 1 each (docs/05, 5.8: music, ambiences, effects). */
  music: number;
  ambience: number;
  effects: number;
}

export interface Settings {
  /** Pause the game when a decision with a short deadline arrives. */
  autoPause: boolean;
  /** ×4 while nothing waits for the player, back to ×1 at the next decision (docs/02, 2.3). */
  autoSpeed: boolean;
  /** Show the short review on the 1st of each month (the yearly one always shows). */
  monthlyReview: boolean;
  /** Clair, Sombre, Automatique (dark during the game's night), Selon le téléphone (docs/04, 4.2). */
  theme: ThemeChoice;
  /** Graphics of the street: automatic lowers it on slow phones. */
  quality: QualityChoice;
  /** Frames per second over the street (to check the fluidity). */
  showFps: boolean;
  /** The phone buzzes with the notary's stamp and the rents (Android; iPhones ignore it). */
  vibration: boolean;
  volumes: Volumes;
}

const KEY = 'cle-en-main.settings';
export const THEMES: readonly ThemeChoice[] = ['light', 'dark', 'auto', 'system'];
export const QUALITIES: readonly QualityChoice[] = ['auto', 'high', 'economy'];
const DEFAULTS: Settings = {
  autoPause: true,
  autoSpeed: true,
  monthlyReview: true,
  theme: 'system',
  quality: 'auto',
  showFps: false,
  vibration: true,
  volumes: { music: 0.6, ambience: 0.5, effects: 0.7 },
};

function volume(value: unknown, fallback: number): number {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : fallback;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const volumes: Partial<Volumes> = parsed.volumes ?? {};
    return {
      autoPause: typeof parsed.autoPause === 'boolean' ? parsed.autoPause : DEFAULTS.autoPause,
      autoSpeed: typeof parsed.autoSpeed === 'boolean' ? parsed.autoSpeed : DEFAULTS.autoSpeed,
      monthlyReview:
        typeof parsed.monthlyReview === 'boolean' ? parsed.monthlyReview : DEFAULTS.monthlyReview,
      theme: THEMES.includes(parsed.theme as ThemeChoice)
        ? (parsed.theme as ThemeChoice)
        : DEFAULTS.theme,
      quality: QUALITIES.includes(parsed.quality as QualityChoice)
        ? (parsed.quality as QualityChoice)
        : DEFAULTS.quality,
      showFps: typeof parsed.showFps === 'boolean' ? parsed.showFps : DEFAULTS.showFps,
      vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : DEFAULTS.vibration,
      volumes: {
        music: volume(volumes.music, DEFAULTS.volumes.music),
        ambience: volume(volumes.ambience, DEFAULTS.volumes.ambience),
        effects: volume(volumes.effects, DEFAULTS.volumes.effects),
      },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private browsing): the setting lasts for the session.
  }
}
