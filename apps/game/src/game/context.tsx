import type { GameAction, GameEvent, GameState } from '@cle/engine';
import { createContext, useContext } from 'react';
import type { GameSession, SessionSnapshot } from '../session/game-session.ts';
import type { Settings } from '../settings.ts';

export type TabId = 'street' | 'map' | 'decisions' | 'assets' | 'menu';

export type PropertyTab = 'overview' | 'rooms' | 'rental' | 'finances';

/** Screens pushed on top of a tab. */
export type Route =
  | { name: 'listings'; neighbourhoodId?: string; favorites?: boolean }
  | { name: 'listing'; id: string }
  | { name: 'purchase'; id: string }
  | { name: 'property'; id: string; tab?: PropertyTab }
  | { name: 'rent'; id: string }
  | { name: 'section'; neighbourhoodId: string; buildingId: string }
  | { name: 'settings' };

/** A screen the tutorial waits for (content/textes/didacticiel.json). */
export type TrackedScreen = 'listings' | 'listing' | 'financing';

export interface Navigation {
  tab: TabId;
  push: (route: Route) => void;
  pop: () => void;
  /** Switches tab; with a route, opens it on top of the tab's root. */
  goTab: (tab: TabId, route?: Route) => void;
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
