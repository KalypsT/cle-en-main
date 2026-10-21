import type { GameAction, GameEvent, GameState, PropertyKind } from '@cle/engine';
import { createContext, useContext } from 'react';
import type { AudioMixer } from '../audio/mixer.ts';
import type { GameSession, SessionSnapshot } from '../session/game-session.ts';
import type { Settings } from '../settings.ts';
import type { Checkpoint } from '../storage/saves.ts';

export type TabId = 'street' | 'map' | 'decisions' | 'assets' | 'menu';

export type PropertyTab = 'overview' | 'rooms' | 'rental' | 'finances' | 'history';

export type ListingSort = 'recent' | 'price' | 'pricePerM2' | 'yield';

/** What the listings screen filters on; kept in its route so a visit to a listing keeps it. */
export interface ListingFilters {
  area: string | null;
  kind: PropertyKind | null;
  /** Maximum price, in euros. */
  budget: number | null;
  favorites: boolean;
  sort: ListingSort;
}

/** Screens pushed on top of a tab. */
export type Route =
  | { name: 'listings'; neighbourhoodId?: string; favorites?: boolean; filters?: ListingFilters }
  | { name: 'listing'; id: string }
  | { name: 'purchase'; id: string }
  | { name: 'property'; id: string; tab?: PropertyTab }
  | { name: 'rent'; id: string }
  | { name: 'works'; id: string }
  | { name: 'sale'; id: string }
  | { name: 'section'; neighbourhoodId: string; buildingId: string }
  | { name: 'settings' }
  | { name: 'event'; id: string }
  | { name: 'challenge' }
  | { name: 'progression' }
  | { name: 'statistics' }
  | { name: 'agenda' }
  | { name: 'monthReview' }
  | { name: 'yearReview' }
  | { name: 'rewind' }
  | { name: 'cities' }
  | { name: 'bank' }
  /** A property sold, read only (« Biens vendus »). */
  | { name: 'soldProperty'; id: string }
  /** The history with one bank. */
  | { name: 'banker'; id: string };

/** A screen the tutorial waits for (content/textes/didacticiel.json). */
export type TrackedScreen = 'listings' | 'listing' | 'financing';

export interface Navigation {
  tab: TabId;
  /** City the street, the map and the listings show (the base by default). */
  cityId: string;
  /** What a screen keeps while another tab is shown (the map's zoom…); lost with the session. */
  memory: Map<string, unknown>;
  setCityId: (cityId: string) => void;
  push: (route: Route) => void;
  pop: () => void;
  /** Replaces the screen on top of the stack (its filters changed): it is not reopened. */
  replace: (route: Route) => void;
  /** Switches tab; with a route, opens it on top of the tab's root. */
  goTab: (tab: TabId, route?: Route) => void;
  /**
   * The tab bar: shows the tab as it was left (its stack and its scroll kept); touching the
   * tab already shown goes back to its root.
   */
  selectTab: (tab: TabId) => void;
  /** Tells the tutorial a screen was opened. */
  track: (screen: TrackedScreen) => void;
}

export interface GameContextValue {
  session: GameSession;
  snapshot: SessionSnapshot;
  state: GameState;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  /** Dispatches an action; on refusal, shows its text and returns null. */
  act: (action: GameAction, success?: string) => GameEvent[] | null;
  notify: (message: string) => void;
  save: () => void;
  exportGame: () => void;
  quit: () => void;
  slot: number;
  audio: AudioMixer;
  /** Goes back to a monthly point (docs/02, 2.7): the session is replaced. */
  rewind: (checkpoint: Checkpoint) => void;
}

export const GameContext = createContext<GameContextValue | null>(null);
export const NavigationContext = createContext<Navigation | null>(null);

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame outside of the game');
  return value;
}

export function useNav(): Navigation {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNav outside of the game');
  return value;
}
